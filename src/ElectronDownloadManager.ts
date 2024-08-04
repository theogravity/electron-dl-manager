import type { BrowserWindow } from "electron";
import type { DownloadData } from "./DownloadData";
import { DownloadInitiator } from "./DownloadInitiator";
import type {
  DebugLoggerFn,
  DownloadConfig,
  DownloadManagerConstructorParams,
  IElectronDownloadManager,
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
   * Pauses a download
   */
  pauseDownload(id: string) {
    const data = this.downloadData[id];

    if (data?.item) {
      this.log(`[${id}] Pausing download`);
      data.item.pause();
    } else {
      this.log(`[${id}] Download ${id} not found for pausing`);
    }
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
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   *
   * Returns the id of the download.
   */
  async download(params: DownloadConfig): Promise<string> {
    return this.downloadQueue.add(
      () =>
        new Promise<string>((resolve, reject) => {
          try {
            if (params.saveAsFilename && params.saveDialogOptions) {
              return reject(Error("You cannot define both saveAsFilename and saveDialogOptions to start a download"));
            }

            const downloadInitiator = new DownloadInitiator({
              debugLogger: this.logger,
              onCleanup: (data) => {
                this.cleanup(data);
              },
              onDownloadInit: (data) => {
                this.downloadData[data.id] = data;
                resolve(data.id);
              },
            });

            this.log(`[${downloadInitiator.getDownloadId()}] Registering download for url: ${truncateUrl(params.url)}`);
            params.window.webContents.session.once("will-download", downloadInitiator.generateOnWillDownload(params));
            params.window.webContents.downloadURL(params.url, params.downloadURLOptions);
          } catch (e) {
            reject(e);
          }
        }),
    );
  }

  protected cleanup(data: DownloadData) {
    delete this.downloadData[data.id];
  }

  /**
   * Enables network throttling on a BrowserWindow. Settings apply to *all*
   * transfers in the window, not just downloads. Settings may be persistent
   * on application restart, so use `disableThrottle` to reset after you're done
   * testing.
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions
   * @see https://github.com/electron/electron/issues/21250
   */
  static async throttleConnections(
    window: BrowserWindow,
    conditions: {
      offline?: boolean;
      latency?: number;
      downloadThroughput?: number;
      uploadThroughput?: number;
      connectionType?: string;
      packetLoss?: number;
      packetQueueLength?: number;
      packetReordering?: number;
    },
  ) {
    const dbg = window.webContents.debugger;
    dbg.attach();
    await dbg.sendCommand("Network.enable");
    await dbg.sendCommand("Network.emulateNetworkConditions", conditions);
  }

  /**
   * Disables network throttling on a BrowserWindow
   */
  static async disableThrottle(window: BrowserWindow) {
    const dbg = window.webContents.debugger;
    dbg.attach();
    await dbg.sendCommand("Network.enable");
    await dbg.sendCommand("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    dbg.detach();
  }
}
