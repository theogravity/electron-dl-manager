import * as path from "node:path";
import type { DownloadItem, Event, SaveDialogOptions, WebContents } from "electron";
import { CallbackDispatcher } from "./CallbackDispatcher";
import { DownloadData } from "./DownloadData";
import type { DownloadConfig, DownloadManagerCallbacks } from "./types";
import { calculateDownloadMetrics, determineFilePath } from "./utils";

interface DownloadInitiatorConstructorParams {
  debugLogger?: (message: string) => void;
  onCleanup?: (id: DownloadData) => void;
  onDownloadInit?: (id: DownloadData) => void;
}

interface WillOnDownloadParams {
  /**
   * The callbacks to define to listen for download events
   */
  callbacks: DownloadManagerCallbacks;
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
}

export class DownloadInitiator {
  protected logger: (message: string) => void;
  /**
   * The handler for the DownloadItem's `updated` event.
   */
  private onItemUpdated: (event: Event, state: "progressing" | "interrupted") => Promise<void>;
  /**
   * The handler for the DownloadItem's `done` event.
   */
  private onItemDone: (event: Event, state: "completed" | "cancelled" | "interrupted") => Promise<void>;
  /**
   * When the download is initiated
   */
  private onDownloadInit: (data: DownloadData) => void;
  /**
   * When cleanup is called
   */
  private onCleanup: (data: DownloadData) => void;
  /**
   * The callback dispatcher for handling download events.
   */
  private callbackDispatcher: CallbackDispatcher;
  /**
   * The data for the download.
   */
  private downloadData: DownloadData;
  private config: Omit<WillOnDownloadParams, "callbacks">;

  constructor(config: DownloadInitiatorConstructorParams) {
    this.downloadData = new DownloadData();
    this.logger = config.debugLogger || (() => {});
    this.onItemUpdated = () => Promise.resolve();
    this.onItemDone = () => Promise.resolve();
    this.onCleanup = config.onCleanup || (() => {});
    this.onDownloadInit = config.onDownloadInit || (() => {});
    this.config = {} as DownloadConfig;
    this.callbackDispatcher = {} as CallbackDispatcher;
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
    this.callbackDispatcher = new CallbackDispatcher(this.downloadData.id, downloadParams.callbacks, this.logger);

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

      await this.initNonInteractiveDownload();
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
          item.on("updated", this.generateItemOnUpdated());
          item.once("done", this.generateItemOnDone());
        }

        if (!item["_userInitiatedPause"]) {
          item.resume();
        }
      } else if (this.downloadData.isDownloadCancelled()) {
        clearInterval(interval);
        this.log("Download was cancelled by user");
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
      // Don't fire progress updates in a paused state
      item.off("updated", this.generateItemOnUpdated());
      oldPause();
    };

    const oldResume = item.resume.bind(item)

    item.resume = () => {
        item.on("updated", this.generateItemOnUpdated());
        oldResume();
    }
  }

  /**
   * Flow for handling a download that doesn't require user interaction.
   */
  protected async initNonInteractiveDownload() {
    const { directory, saveAsFilename, overwrite } = this.config;
    const { item } = this.downloadData;

    const filePath = determineFilePath({ directory, saveAsFilename, item, overwrite });

    this.log(`Setting save path to ${filePath}`);
    item.setSavePath(filePath);
    this.log("Initiating download item handlers");

    this.downloadData.resolvedFilename = path.basename(filePath);

    this.augmentDownloadItem(item);
    await this.callbackDispatcher.onDownloadStarted(this.downloadData);
    item.on("updated", this.generateItemOnUpdated());
    item.once("done", this.generateItemOnDone());

    if (!item["_userInitiatedPause"]) {
      item.resume();
    }
  }

  protected updateProgress() {
    const { item } = this.downloadData;

    const input = {
      downloadedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      startTimeSecs: item.getStartTime(),
    };

    const metrics = calculateDownloadMetrics(input);

    if (input.downloadedBytes > input.totalBytes) {
      // Note: This situation will happen when using data: URIs
      this.log(`Downloaded bytes (${input.downloadedBytes}) is greater than total bytes (${input.totalBytes})`);
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
          await this.callbackDispatcher.onDownloadCompleted(this.downloadData);
          break;
        }
        case "cancelled":
          await this.callbackDispatcher.onDownloadCancelled(this.downloadData);
          break;
        case "interrupted":
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
      item.removeListener("updated", this.onItemUpdated);
      item.removeListener("done", this.onItemDone);
    }

    if (this.onCleanup) {
      this.onCleanup(this.downloadData);
    }
  }
}
