import type { DownloadData, RestoreDownloadData } from "./DownloadData";
import { DownloadInitiator } from "./DownloadInitiator";
import type {
  DebugLoggerFn,
  DownloadConfig,
  DownloadManagerConstructorParams,
  IElectronDownloadManager,
  RestoreDownloadConfig,
} from "./types";
import { truncateUrl } from "./utils";

/**
 * This is used to solve an issue where multiple downloads are started at the same time.
 * For example, Promise.all([download1, download2, ...]) will start both downloads at the same
 * time. This is problematic because the will-download event is not guaranteed to fire in the
 * order that the downloads were started.
 *
 * So we use this to make sure that will-download fires in the order that the downloads were
 * started by executing the downloads in a sequential fashion.
 *
 * For more information see:
 * https://github.com/theogravity/electron-dl-manager/issues/11
 */
class DownloadQueue {
  private promise = Promise.resolve() as unknown as Promise<string>;

  add(task: () => Promise<string>): Promise<string> {
    this.promise = this.promise.then(() => task());
    return this.promise;
  }
}

/**
 * Enables handling downloads in Electron.
 */
export class ElectronDownloadManager implements IElectronDownloadManager {
  protected downloadData: Record<string, DownloadData>;
  protected logger: DebugLoggerFn;
  private downloadQueue = new DownloadQueue();

  constructor(params: DownloadManagerConstructorParams = {}) {
    this.downloadData = {};
    this.logger = params.debugLogger || (() => {});
  }

  protected log(message: string) {
    this.logger(message);
  }

  /**
   * Returns the current download data
   */
  getDownloadData(id: string): DownloadData {
    return this.downloadData[id];
  }

  /**
   * Cancels a download
   */
  cancelDownload(id: string) {
    const data = this.downloadData[id];

    if (data?.item) {
      this.log(`[${id}] Cancelling download`);
      data.item.cancel();
    } else {
      this.log(`[${id}] Download ${id} not found for cancellation`);
    }
  }

  /**
   * Pauses a download and returns the data necessary
   * to restore it later via restoreDownload() if the download exists.
   */
  pauseDownload(id: string): RestoreDownloadData | undefined {
    const data = this.downloadData[id];

    if (data?.item) {
      this.log(`[${id}] Pausing download`);
      data.item.pause();
      return data.getRestoreDownloadData();
    }

    this.log(`[${id}] Download ${id} not found for pausing`);
  }

  /**
   * Resumes a download
   */
  resumeDownload(id: string) {
    const data = this.downloadData[id];

    if (data?.item?.isPaused()) {
      this.log(`[${id}] Resuming download`);
      data.item.resume();
    } else {
      this.log(`[${id}] Download ${id} not found or is not in a paused state`);
    }
  }

  /**
   * Returns the number of active downloads
   */
  getActiveDownloadCount() {
    return Object.values(this.downloadData).filter((data) => data.isDownloadInProgress()).length;
  }

  /**
   * Restores a download that is not registered in the download manager.
   * If it is already registered, calls resumeDownload() instead.
   */
  async restoreDownload(params: RestoreDownloadConfig) {
    if (this.getDownloadData(params.restoreData.id)) {
      this.resumeDownload(params.restoreData.id);
      return params.restoreData.id;
    }

    return this.downloadQueue.add(
      () =>
        new Promise<string>((resolve, reject) => {
          try {
            const restoreData = params.restoreData;

            const onWillQuit = () => {
              downloadInitiator.persistDownload();
            };

            const downloadInitiator = new DownloadInitiator({
              id: restoreData.id,
              debugLogger: this.logger,
              callbacks: params.callbacks,
              onCleanup: (data) => {
                this.cleanup(data);

                if (params.restoreData.persistedFilePath) {
                  params.app.removeListener("will-quit", onWillQuit);
                }
              },
              onDownloadInit: (data) => {
                this.downloadData[data.id] = data;
                resolve(data.id);
              },
            });

            if (restoreData.persistedFilePath) {
              downloadInitiator.restorePersistedDownload(restoreData);
            }

            this.log(
              `[${downloadInitiator.getDownloadId()}] Restoring download for url: ${truncateUrl(
                params.restoreData.url,
              )}`,
            );
            params.window.webContents.session.once(
              "will-download",
              downloadInitiator.generateOnWillDownload({
                restoreData: params.restoreData,
              }),
            );

            params.window.webContents.session.createInterruptedDownload({
              path: restoreData.fileSaveAsPath,
              urlChain: restoreData.urlChain,
              mimeType: restoreData.mimeType,
              eTag: restoreData.eTag,
              offset: restoreData.receivedBytes,
              length: restoreData.totalBytes,
              startTime: restoreData.startTime,
            });

            if (params.restoreData.persistedFilePath) {
              params.app.once("will-quit", onWillQuit);
            }
          } catch (e) {
            reject(e);
          }
        }),
    );
  }

  /**
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   *
   * Returns the id of the download.
   */
  async download(params: DownloadConfig): Promise<string> {
    if (params.persistOnAppClose && !params.app) {
      throw Error("You must provide the app instance to persist downloads on app close");
    }

    return this.downloadQueue.add(
      () =>
        new Promise<string>((resolve, reject) => {
          try {
            if (params.saveAsFilename && params.saveDialogOptions) {
              return reject(Error("You cannot define both saveAsFilename and saveDialogOptions to start a download"));
            }

            const onWillQuit = () => {
              downloadInitiator.persistDownload();
            };

            const downloadInitiator = new DownloadInitiator({
              debugLogger: this.logger,
              callbacks: params.callbacks,
              onCleanup: (data) => {
                this.cleanup(data);

                if (params.persistOnAppClose && params.app) {
                  params.app.removeListener("will-quit", onWillQuit);
                }
              },
              onDownloadInit: (data) => {
                this.downloadData[data.id] = data;
                resolve(data.id);
              },
            });

            this.log(`[${downloadInitiator.getDownloadId()}] Registering download for url: ${truncateUrl(params.url)}`);
            params.window.webContents.session.once(
              "will-download",
              downloadInitiator.generateOnWillDownload({
                saveDialogOptions: params.saveDialogOptions,
                saveAsFilename: params.saveAsFilename,
                directory: params.directory,
                overwrite: params.overwrite,
              }),
            );
            params.window.webContents.downloadURL(params.url, params.downloadURLOptions);

            if (params.persistOnAppClose && params.app) {
              params.app.once("will-quit", onWillQuit);
            }
          } catch (e) {
            reject(e);
          }
        }),
    );
  }

  protected cleanup(data: DownloadData) {
    this.log(`[${data.id}] Removing download from manager`);
    delete this.downloadData[data.id];
  }
}
