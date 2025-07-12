import type { BrowserWindow } from "electron";
import { DownloadData } from "./DownloadData";
import { DownloadInitiator } from "./DownloadInitiator";
import { downloadStateManager, type PersistedDownloadState } from "./DownloadStateManager";
import type {
  DebugLoggerFn,
  DownloadConfig,
  DownloadManagerConstructorParams,
  DownloadPersistenceConfig,
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

  constructor(params: DownloadManagerConstructorParams = {}) {
    this.downloadData = {};
    this.logger = params.debugLogger || (() => {});
    this.enablePersistence = params.enablePersistence || false;
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

            // Check for auto-resume functionality
            if (this.enablePersistence && params.persistenceConfig?.autoResume) {
              const existingState = this.findExistingDownloadState(params.persistenceConfig);
              if (existingState && existingState.status !== 'completed' && existingState.status !== 'cancelled') {
                this.log(`Found existing download state for ${params.persistenceConfig.fileId}, attempting to resume`);
                return this.resumeExistingDownload(existingState, params, resolve, reject);
              }
            }

            const downloadInitiator = new DownloadInitiator({
              debugLogger: this.logger,
              onCleanup: (data) => {
                this.cleanup(data);
              },
              onDownloadInit: (data) => {
                // Add persistence metadata
                if (this.enablePersistence && params.persistenceConfig) {
                  data.projectId = params.persistenceConfig.projectId;
                  data.fileId = params.persistenceConfig.fileId;
                  data.packageName = params.persistenceConfig.packageName;
                  data.originalFileSize = params.persistenceConfig.originalFileSize;
                  data.url = params.url;
                }
                
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
                  downloadStateManager.removeDownloadState(data.id);
                }
              },
              onDownloadCancelled: (data) => {
                if (this.enablePersistence) {
                  this.updatePersistedState(data, { status: 'cancelled' });
                  // Remove from persistent state since it's cancelled
                  downloadStateManager.removeDownloadState(data.id);
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

    const allStates = downloadStateManager.getAllDownloadStates();
    const incompleteDownloads = allStates.filter(
      (state) => state.status === 'downloading' || state.status === 'paused' || state.status === 'interrupted'
    );

    const restoredIds: string[] = [];

    for (const state of incompleteDownloads) {
      try {
        this.log(`[${state.id}] Found interrupted download: ${truncateUrl(state.url)}`);
        
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
    
    downloadStateManager.clearAllDownloadStates();
    this.log("Cleared all persisted download states");
  }

  protected cleanup(data: DownloadData) {
    delete this.downloadData[data.id];
  }

  private saveInitialPersistedState(data: DownloadData): void {
    if (!data.item || !data.projectId || !data.fileId || !data.packageName || !data.url) {
      this.log(`[${data.id}] Missing required persistence data, skipping state save`);
      return;
    }

    const state: PersistedDownloadState = {
      id: data.id,
      projectId: data.projectId,
      fileId: data.fileId,
      fileName: data.resolvedFilename,
      url: data.url,
      urlChain: data.item.getURLChain(),
      filePath: data.item.getSavePath(),
      mimeType: data.item.getMimeType(),
      etag: data.item.getETag(), // Using getETag() as requested
      totalBytes: data.item.getTotalBytes(),
      receivedBytes: data.item.getReceivedBytes(),
      startTime: data.startTime || Date.now(),
      lastUpdateTime: Date.now(),
      status: 'downloading',
      packageName: data.packageName,
      originalFileSize: data.originalFileSize || 0,
    };

    downloadStateManager.saveDownloadState(state);
    this.log(`[${data.id}] Saved initial download state with ETag: ${state.etag || 'none'}`);
  }

  private updatePersistedState(data: DownloadData, updates: Partial<PersistedDownloadState>): void {
    downloadStateManager.updateDownloadState(data.id, updates);
  }

  private findExistingDownloadState(persistenceConfig: DownloadPersistenceConfig): PersistedDownloadState | undefined {
    const allStates = downloadStateManager.getAllDownloadStates();
    return allStates.find(state => 
      state.projectId === persistenceConfig.projectId &&
      state.fileId === persistenceConfig.fileId &&
      state.packageName === persistenceConfig.packageName
    );
  }

  private resumeExistingDownload(
    existingState: PersistedDownloadState,
    params: DownloadConfig,
    resolve: (value: string) => void,
    reject: (reason?: any) => void
  ): void {
    try {
      this.log(`[${existingState.id}] Resuming existing download from ${existingState.receivedBytes}/${existingState.totalBytes} bytes`);
      
      const session = params.window.webContents.session;
      const offset = existingState.receivedBytes;
      
      // Set up the will-download handler for the resumed download
      const resumeHandler = (event: any, item: any, webContents: any) => {
        // Remove the handler immediately to prevent interference
        session.removeListener('will-download', resumeHandler);
        
        // Create DownloadData instance for the resumed download
        const downloadData = new DownloadData();
        downloadData.id = existingState.id;
        downloadData.item = item;
        downloadData.event = event;
        downloadData.webContents = webContents;
        downloadData.resolvedFilename = existingState.fileName;
        downloadData.projectId = existingState.projectId;
        downloadData.fileId = existingState.fileId;
        downloadData.packageName = existingState.packageName;
        downloadData.originalFileSize = existingState.originalFileSize;
        downloadData.url = existingState.url;
        downloadData.startTime = existingState.startTime;

        this.downloadData[existingState.id] = downloadData;

        // Set up event handlers for the resumed download
        this.setupResumedDownloadHandlers(downloadData, params);

        resolve(existingState.id);
        this.log(`[${existingState.id}] Successfully resumed download`);
      };
      
      // Add the will-download handler
      session.once('will-download', resumeHandler);
      
      // Trigger the interrupted download restoration
      session.createInterruptedDownload({
        path: existingState.filePath,
        urlChain: existingState.urlChain,
        mimeType: existingState.mimeType,
        eTag: existingState.etag,
        offset: offset,
        length: existingState.totalBytes,
      });
      
    } catch (error) {
      this.log(`[${existingState.id}] Failed to resume download: ${error}`);
      reject(error);
    }
  }

  private setupResumedDownloadHandlers(data: DownloadData, params: DownloadConfig): void {
    const { item } = data;

    // Call the onDownloadStarted callback immediately since we're resuming
    if (params.callbacks.onDownloadStarted) {
      params.callbacks.onDownloadStarted(data);
    }

    const onUpdated = (event: any, state: string) => {
      if (state === 'progressing') {
        // Update progress metrics
        const downloadedBytes = item.getReceivedBytes();
        const totalBytes = item.getTotalBytes();
        data.percentCompleted = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
        
                 if (this.enablePersistence) {
           this.updatePersistedState(data, {
             status: 'downloading',
             receivedBytes: downloadedBytes,
             totalBytes: totalBytes,
             etag: item.getETag(), // Update ETag during resumed download progress
             mimeType: item.getMimeType(),
             urlChain: item.getURLChain()
           });
         }
        
        if (params.callbacks.onDownloadProgress) {
          params.callbacks.onDownloadProgress(data);
        }
      } else if (state === 'interrupted') {
        if (this.enablePersistence) {
          this.updatePersistedState(data, { status: 'interrupted' });
        }
        
        if (params.callbacks.onDownloadInterrupted) {
          params.callbacks.onDownloadInterrupted(data);
        }
      }
    };

    const onDone = (event: any, state: string) => {
      if (this.enablePersistence) {
        if (state === 'completed') {
          this.updatePersistedState(data, { status: 'completed' });
          downloadStateManager.removeDownloadState(data.id);
          
          if (params.callbacks.onDownloadCompleted) {
            params.callbacks.onDownloadCompleted(data);
          }
        } else if (state === 'cancelled') {
          this.updatePersistedState(data, { status: 'cancelled' });
          downloadStateManager.removeDownloadState(data.id);
          
          if (params.callbacks.onDownloadCancelled) {
            params.callbacks.onDownloadCancelled(data);
          }
        } else if (state === 'interrupted') {
          this.updatePersistedState(data, { status: 'interrupted' });
          
          if (params.callbacks.onDownloadInterrupted) {
            params.callbacks.onDownloadInterrupted(data);
          }
        }
      }
      
      // Clean up event listeners
      item.removeListener('updated', onUpdated);
      item.removeListener('done', onDone);
      this.cleanup(data);
    };

    item.on('updated', onUpdated);
    item.once('done', onDone);
  }
}
