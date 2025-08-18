import * as path from "node:path";
import type { DownloadItem, Event, SaveDialogOptions, WebContents } from "electron";
import { renameSync, copyFileSync } from "node:fs";
import { CallbackDispatcher } from "./CallbackDispatcher";
import { DownloadData, type RestoreDownloadData } from "./DownloadData";
import type { DownloadConfig, DownloadManagerCallbacks } from "./types";
import { calculateDownloadMetrics, determineFilePath } from "./utils";

interface DownloadInitiatorConstructorParams {
  /**
   * The id for the download. If not provided, a random id will be generated.
   */
  id?: string;
  /**
   * A debug logger function to log messages.
   * If not provided, no logging will occur.
   */
  debugLogger?: (message: string) => void;
  /**
   * Called when the download is cleaned up.
   * This is called after the download has completed or been cancelled.
   * @param id The download data
   */
  onCleanup?: (id: DownloadData) => void;
  /**
   * Called when the download is initialized.
   * This is called before any download events are fired.
   * @param id The download data
   */
  onDownloadInit?: (id: DownloadData) => void;
  /**
   * The user callbacks to define to listen for download events
   */
  callbacks: DownloadManagerCallbacks;
}

interface WillOnDownloadParams {
  /**
   * If defined, will show a save dialog when the user
   * downloads a file.
   *
   * @see https://www.electronjs.org/docs/latest/api/dialog#dialogshowsavedialogbrowserwindow-options
   */
  saveDialogOptions?: SaveDialogOptions;
  /**
   * The filename to save the file as. If not defined, the filename
   * from the server will be used.
   *
   * Only applies if saveDialogOptions is not defined.
   */
  saveAsFilename?: string;
  /**
   * The directory to save the file to. Must be an absolute path.
   * @default The user's downloads directory
   */
  directory?: string;
  /**
   * If true, will overwrite the file if it already exists
   * @default false
   */
  overwrite?: boolean;
  /**
   * Data for restoring a download.
   */
  restoreData?: RestoreDownloadData;
}

export class DownloadInitiator {
  protected logger: (message: string) => void;
  /**
   * When the download is initiated
   */
  private onDownloadInit: (data: DownloadData) => void;
  /**
   * When cleanup is called
   */
  private onCleanup: (data: DownloadData) => void;
  /**
   * The callback dispatcher for handling download events back to the user
   */
  private callbackDispatcher: CallbackDispatcher;
  /**
   * The data for the download.
   */
  private downloadData: DownloadData;
  private config: Omit<WillOnDownloadParams, "callbacks">;
  /**
   * The handler for the DownloadItem's `updated` event.
   */
  private onUpdateHandler?: (_event: Event, state: "progressing" | "interrupted") => void;
  /**
   * The handler for the DownloadItem's `done` event.
   */
  private onDoneHandler?: (_event: Event, state: "completed" | "cancelled" | "interrupted") => void;

  constructor(config: DownloadInitiatorConstructorParams) {
    this.downloadData = new DownloadData({
      id: config.id,
    });

    this.logger = config.debugLogger || (() => {});
    this.onCleanup = config.onCleanup || (() => {});
    this.onDownloadInit = config.onDownloadInit || (() => {});
    this.config = {} as DownloadConfig;
    this.callbackDispatcher = new CallbackDispatcher(this.downloadData.id, config.callbacks, this.logger);
  }

  protected log(message: string) {
    this.logger(`[${this.downloadData.id}] ${message}`);
  }

  /**
   * Returns the download id
   */
  getDownloadId(): string {
    return this.downloadData.id;
  }

  /**
   * Returns the current download data
   */
  getDownloadData(): DownloadData {
    return this.downloadData;
  }

  /**
   * Generates the handler that attaches to the session `will-download` event,
   * which will execute the workflows for handling a download.
   */
  generateOnWillDownload(downloadParams: WillOnDownloadParams) {
    this.config = downloadParams;

    this.downloadData.percentCompleted = this.config.restoreData?.percentCompleted || 0;

    return async (event: Event, item: DownloadItem, webContents: WebContents): Promise<void> => {
      item.pause();
      this.downloadData.item = item;
      this.downloadData.webContents = webContents;
      this.downloadData.event = event;

      if (this.onDownloadInit) {
        this.onDownloadInit(this.downloadData);
      }

      if (this.config.saveDialogOptions) {
        this.initSaveAsInteractiveDownload();
        return;
      }

      await this.initNonInteractiveDownload(!!this.config.restoreData);
    };
  }

  /**
   * Flow for handling a download that requires user interaction via a "Save as" dialog.
   */
  protected initSaveAsInteractiveDownload() {
    this.log("Prompting save as dialog");
    const { directory, overwrite, saveDialogOptions } = this.config;
    const { item } = this.downloadData;

    const filePath = determineFilePath({ directory, item, overwrite });

    // This actually isn't what shows the save dialog
    // If item.setSavePath() isn't called at all after some tiny period of time,
    // then the save dialog will show up, and it will use the options we set it to here
    item.setSaveDialogOptions({ ...saveDialogOptions, defaultPath: filePath });

    // Because the download happens concurrently as the user is choosing a save location
    // we need to wait for the save location to be chosen before we can start to fire out events
    // there's no good way to listen for this, so we need to poll
    const interval = setInterval(async () => {
      // It seems to unpause sometimes in the dialog situation ???
      // item.getState() value becomes 'completed' for small files
      // before item.resume() is called
      item.pause();

      if (item.getSavePath()) {
        clearInterval(interval);

        this.log(`User selected save path to ${item.getSavePath()}`);
        this.log("Initiating download item handlers");

        this.downloadData.resolvedFilename = path.basename(item.getSavePath());

        this.augmentDownloadItem(item);
        await this.callbackDispatcher.onDownloadStarted(this.downloadData);
        // If for some reason the above pause didn't work...
        // We'll manually call the completed handler
        if (this.downloadData.isDownloadCompleted()) {
          await this.callbackDispatcher.onDownloadCompleted(this.downloadData);
        } else {
          this.onUpdateHandler = this.generateItemOnUpdated();
          this.onDoneHandler = this.generateItemOnDone();
          item.on("updated", this.onUpdateHandler);
          item.once("done", this.onDoneHandler);
        }

        if (!item["_userInitiatedPause"]) {
          item.resume();
        }
      } else if (this.downloadData.isDownloadCancelled()) {
        clearInterval(interval);
        this.log("Download was cancelled");
        this.downloadData.cancelledFromSaveAsDialog = true;
        await this.callbackDispatcher.onDownloadCancelled(this.downloadData);
      } else {
        this.log("Waiting for save path to be chosen by user");
      }
    }, 1000);
  }

  private augmentDownloadItem(item: DownloadItem) {
    // This covers if the user manually pauses the download
    // before we have set up the event listeners on the item
    item["_userInitiatedPause"] = false;

    const oldPause = item.pause.bind(item);
    item.pause = () => {
      item["_userInitiatedPause"] = true;

      if (this.onUpdateHandler) {
        // Don't fire progress updates in a paused state
        item.off("updated", this.onUpdateHandler);
        this.onUpdateHandler = undefined;
      }

      oldPause();
    };

    const oldResume = item.resume.bind(item);

    item.resume = () => {
      if (!this.onUpdateHandler) {
        this.onUpdateHandler = this.generateItemOnUpdated();
        item.on("updated", this.onUpdateHandler);
      }

      oldResume();
    };
  }

  /**
   * Flow for handling a download that doesn't require user interaction.
   */
  protected async initNonInteractiveDownload(isRestoring?: boolean) {
    const { directory, saveAsFilename, overwrite } = this.config;
    const { item } = this.downloadData;

    const filePath = determineFilePath({ directory, saveAsFilename, item, overwrite });

    if (!isRestoring) {
      this.log(`Setting save path to ${filePath}`);
      item.setSavePath(filePath);
    }

    this.log("Initiating download item handlers");

    this.downloadData.resolvedFilename = path.basename(filePath);

    this.augmentDownloadItem(item);
    await this.callbackDispatcher.onDownloadStarted(this.downloadData);
    this.onUpdateHandler = this.generateItemOnUpdated();
    this.onDoneHandler = this.generateItemOnDone();
    item.on("updated", this.onUpdateHandler);
    item.once("done", this.onDoneHandler);

    if (!item["_userInitiatedPause"]) {
      item.resume();
    }
  }

  protected updateProgress() {
    const { item } = this.downloadData;

    const metrics = calculateDownloadMetrics(item);

    const downloadedBytes = item.getReceivedBytes();
    const totalBytes = item.getTotalBytes();

    if (downloadedBytes > item.getTotalBytes()) {
      // Note: This situation will happen when using data: URIs
      this.log(`Downloaded bytes (${downloadedBytes}) is greater than total bytes (${totalBytes})`);
    }

    this.downloadData.downloadRateBytesPerSecond = metrics.downloadRateBytesPerSecond;
    this.downloadData.estimatedTimeRemainingSeconds = metrics.estimatedTimeRemainingSeconds;
    this.downloadData.percentCompleted = metrics.percentCompleted;
  }

  /**
   * Generates the handler for hooking into the DownloadItem's `updated` event.
   */
  protected generateItemOnUpdated() {
    return async (_event: Event, state: "progressing" | "interrupted") => {
      switch (state) {
        case "progressing": {
          this.updateProgress();
          await this.callbackDispatcher.onDownloadProgress(this.downloadData);
          break;
        }
        case "interrupted": {
          this.downloadData.interruptedVia = "in-progress";
          await this.callbackDispatcher.onDownloadInterrupted(this.downloadData);
          break;
        }
        default:
          this.log(`Unexpected itemOnUpdated state: ${state}`);
      }
    };
  }

  /**
   * Generates the handler for hooking into the DownloadItem's `done` event.
   */
  protected generateItemOnDone() {
    return async (_event: Event, state: "completed" | "cancelled" | "interrupted") => {
      switch (state) {
        case "completed": {
          this.log(`Download completed. Total bytes: ${this.downloadData.item.getTotalBytes()}`);
          await this.callbackDispatcher.onDownloadCompleted(this.downloadData);
          break;
        }
        case "cancelled":
          this.log(
            `Download cancelled. Total bytes: ${this.downloadData.item.getReceivedBytes()} / ${this.downloadData.item.getTotalBytes()}`,
          );
          await this.callbackDispatcher.onDownloadCancelled(this.downloadData);
          break;
        case "interrupted":
          this.log(
            `Download interrupted. Total bytes: ${this.downloadData.item.getReceivedBytes()} / ${this.downloadData.item.getTotalBytes()}`,
          );
          this.downloadData.interruptedVia = "completed";
          await this.callbackDispatcher.onDownloadInterrupted(this.downloadData);
          break;
        default:
          this.log(`Unexpected itemOnDone state: ${state}`);
      }

      this.cleanup();
    };
  }

  protected cleanup() {
    const { item } = this.downloadData;

    if (item) {
      this.log("Cleaning up download item event listeners");
      if (this.onUpdateHandler) {
        item.removeListener("updated", this.onUpdateHandler);
      }
      if (this.onDoneHandler) {
        item.removeListener("done", this.onDoneHandler);
      }
    }

    if (this.onCleanup) {
      this.onCleanup(this.downloadData);
    }

    this.onUpdateHandler = undefined;
    this.onDoneHandler = undefined;
  }

  private getPersistDownloadFilename() {
    // Append .download extension to the filename
    return `${this.downloadData.resolvedFilename}.download`;
  }

  /**
   * Persists the download to an alternative location.
   * This is useful for saving the download state when the app is about to close.
   * It copies the current download file to a new location with a `.download` extension.
   * If the download is already completed or cancelled, it does nothing.
   */
  persistDownload() {
    if (
      !this.downloadData.item ||
      this.downloadData.item.getState() === "completed" ||
      this.downloadData.item.getState() === "cancelled"
    ) {
      this.log(
        `Download ${this.downloadData.resolvedFilename} is already completed, cancelled or does not exist; no need to persist.`,
      );
      return;
    }

    this.downloadData.item.pause();

    const originalPath = this.downloadData.item.getSavePath();
    const persistPath = path.join(path.dirname(originalPath), this.getPersistDownloadFilename());

    this.log(`Persisting download to ${persistPath}`);

    try {
      copyFileSync(originalPath, persistPath);
      this.downloadData.persistedFilePath = persistPath;
      this.log(`Download persisted successfully to ${persistPath}`);
      this.callbackDispatcher.onDownloadPersisted(this.downloadData);
    } catch (error) {
      this.callbackDispatcher.handleError(new Error(`Failed to persist download: ${error}`));
    }
  }

  /**
   * Restores a download from a persisted state.
   */
  restorePersistedDownload(restoreData: RestoreDownloadData) {
    if (!restoreData.persistedFilePath) {
      this.log("No persisted file path found for download, cannot restore.");
      return;
    }

    const originalPath = restoreData.fileSaveAsPath;
    const restorePath = restoreData.persistedFilePath;

    this.log(`Restoring download from ${restorePath} to ${originalPath}`);

    try {
      renameSync(restorePath, originalPath);
      this.log(`Download restored successfully from ${restorePath} to ${originalPath}`);
    } catch (error) {
      this.callbackDispatcher.handleError(new Error(`Failed to restore download: ${error}`));
    }
  }
}
