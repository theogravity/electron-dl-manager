import type { BrowserWindow } from "electron";
import { DownloadData } from "./DownloadData";
import { DownloadInitiator } from "./DownloadInitiator";
import DownloadStateManager, { type PersistedDownloadState } from "./DownloadStateManager";
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
  protected enablePersistence: boolean;
  private downloadQueue = new DownloadQueue();
  private downloadStateManager: DownloadStateManager;

  constructor(params: DownloadManagerConstructorParams = {}) {
    this.downloadData = {};
    this.logger = params.debugLogger || (() => {});
    this.enablePersistence = params.enablePersistence || false;
    this.downloadStateManager = new DownloadStateManager(this.logger);
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
      
      // Update persistence if enabled
      if (this.enablePersistence) {
        this.updatePersistedState(data, { status: 'cancelled' });
      }
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
      
      // Update persistence if enabled
      if (this.enablePersistence) {
        this.updatePersistedState(data, { status: 'paused' });
      }
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
      
      // Update persistence if enabled
      if (this.enablePersistence) {
        this.updatePersistedState(data, { status: 'downloading' });
      }
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

            if (this.enablePersistence && !params.persistenceConfig) {
              return reject(Error("persistenceConfig is required when persistence is enabled"));
            }

            const downloadInitiator = new DownloadInitiator({
              resumePreviousDownload: params.persistenceConfig?.resumePreviousDownload,
              downloadStateManager: params.persistenceConfig?.resumePreviousDownload ? this.downloadStateManager : undefined,
              debugLogger: this.logger,
              onCleanup: (data) => {
                this.cleanup(data);
              },
              onDownloadInit: (data) => {                
                this.downloadData[data.id] = data;
                resolve(data.id);
              },
              onDownloadStarted: (data) => {
                if (this.enablePersistence) {
                  this.saveInitialPersistedState(data);
                }
              },
              onDownloadProgress: (data) => {
                if (this.enablePersistence) {
                  this.updatePersistedState(data, { 
                    status: 'downloading',
                    receivedBytes: data.item.getReceivedBytes(),
                    totalBytes: data.item.getTotalBytes(),
                    etag: data.item.getETag(), // Update ETag during progress
                    mimeType: data.item.getMimeType(),
                    urlChain: data.item.getURLChain()
                  });
                }
              },
              onDownloadCompleted: (data) => {
                if (this.enablePersistence) {
                  this.updatePersistedState(data, { status: 'completed' });
                  // Remove from persistent state since it's completed
                  this.downloadStateManager.removeDownloadState(data.id);
                }
              },
              onDownloadCancelled: (data) => {
                if (this.enablePersistence) {
                  this.updatePersistedState(data, { status: 'cancelled' });
                  // Remove from persistent state since it's cancelled
                  this.downloadStateManager.removeDownloadState(data.id);
                }
              },
              onDownloadInterrupted: (data) => {
                if (this.enablePersistence) {
                  this.updatePersistedState(data, { status: 'interrupted' });
                }
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

  /**
   * Restores interrupted downloads from persistent state
   * Returns information about interrupted downloads that can be resumed
   */
  async restoreInterruptedDownloads(): Promise<string[]> {
    if (!this.enablePersistence) {
      throw new Error("Persistence is not enabled");
    }

    const allStates = this.downloadStateManager.getAllDownloadStates();
    const incompleteDownloads = allStates.filter(
      (state) => state.status === 'downloading' || state.status === 'paused' || state.status === 'interrupted'
    );

    const restoredIds: string[] = [];

    for (const state of incompleteDownloads) {
      try {
        this.log(`[${state.id}] Found interrupted download`);
        
        // For now, we'll just track the interrupted downloads
        // The actual restoration would need to be implemented by the consumer
        // using the session.createInterruptedDownload API with proper parameters
        
        restoredIds.push(state.id);
        this.log(`[${state.id}] Marked for restoration`);
      } catch (error) {
        this.log(`[${state.id}] Failed to process interrupted download: ${error}`);
        console.error(`Failed to process interrupted download ${state.id}:`, error);
      }
    }

    return restoredIds;
  }

  /**
   * Clears all persisted download states
   */
  clearPersistedStates(): void {
    if (!this.enablePersistence) {
      throw new Error("Persistence is not enabled");
    }
    
    this.downloadStateManager.clearAllDownloadStates();
    this.log("Cleared all persisted download states");
  }

  protected cleanup(data: DownloadData) {
    delete this.downloadData[data.id];
  }

  private saveInitialPersistedState(data: DownloadData): void {
    const eTag = data.item.getETag();
    const totalBytes = data.item.getTotalBytes();
    const mimeType = data.item.getMimeType();
    const urlChain = data.item.getURLChain();
    const filePath = data.item.getSavePath();
    if (!data.item || !eTag || !totalBytes || !mimeType || !urlChain || !filePath) {
      const requiredFields = [
        { name: 'item', value: data.item },
        { name: 'eTag', value: eTag },
        { name: 'totalBytes', value: totalBytes },
        { name: 'mimeType', value: mimeType },
        { name: 'urlChain', value: urlChain },
        { name: 'filePath', value: filePath }
      ];
      
      const missing = requiredFields.filter(field => !field.value).map(field => field.name);
      
      this.log(`[${data.id}] Missing required persistence data: ${missing.join(', ')}, skipping state save`);
      return;
    }

    const state: PersistedDownloadState = {
      id: data.id,
      fileName: data.resolvedFilename,
      urlChain: data.item.getURLChain(),
      filePath: data.item.getSavePath(),
      mimeType: data.item.getMimeType(),
      etag: data.item.getETag(),
      totalBytes: data.item.getTotalBytes(),
      receivedBytes: data.item.getReceivedBytes(),
      startTime: data.startTime || Date.now(),
      lastUpdateTime: Date.now(),
      status: 'downloading',
    };

    this.downloadStateManager.saveDownloadState(state);
    this.log(`[${data.id}] Saved initial download state with ETag: ${state.etag || 'none'}`);
  }

  private updatePersistedState(data: DownloadData, updates: Partial<PersistedDownloadState>): void {
    this.downloadStateManager.updateDownloadState(data.id, updates);
  }
}
