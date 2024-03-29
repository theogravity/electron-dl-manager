import type { DownloadData } from "./DownloadData";
import type { DebugLoggerFn, DownloadManagerCallbacks } from "./types";

/**
 * Wraps around the callbacks to handle errors and logging
 */
export class CallbackDispatcher {
  protected logger: DebugLoggerFn;
  callbacks: DownloadManagerCallbacks;
  downloadDataId: string;

  constructor(downloadDataId: string, callbacks: DownloadManagerCallbacks, logger: (message: string) => void) {
    this.downloadDataId = downloadDataId;
    this.callbacks = callbacks;
    this.logger = logger;
  }

  protected log(message: string) {
    this.logger(`[${this.downloadDataId}] ${message}`);
  }

  async onDownloadStarted(downloadData: DownloadData) {
    const { callbacks } = this;

    if (callbacks.onDownloadStarted) {
      this.log("Calling onDownloadStarted");
      try {
        await callbacks.onDownloadStarted(downloadData);
      } catch (e) {
        this.log(`Error during onDownloadStarted: ${e}`);
        this.handleError(e as Error);
      }
    }
  }

  async onDownloadCompleted(downloadData: DownloadData) {
    const { callbacks } = this;
    if (callbacks.onDownloadCompleted) {
      this.log("Calling onDownloadCompleted");

      try {
        await callbacks.onDownloadCompleted(downloadData);
      } catch (e) {
        this.log(`Error during onDownloadCompleted: ${e}`);
        this.handleError(e as Error);
      }
    }
  }

  async onDownloadProgress(downloadData: DownloadData) {
    const { callbacks } = this;

    if (callbacks.onDownloadProgress) {
      this.log(` Calling onDownloadProgress ${downloadData.percentCompleted}%`);

      try {
        await callbacks.onDownloadProgress(downloadData);
      } catch (e) {
        this.log(`Error during onDownloadProgress: ${e}`);
        this.handleError(e as Error);
      }
    }
  }

  async onDownloadCancelled(downloadData: DownloadData) {
    const { callbacks } = this;

    if (callbacks.onDownloadCancelled) {
      this.log("Calling onDownloadCancelled");

      try {
        await callbacks.onDownloadCancelled(downloadData);
      } catch (e) {
        this.log(`Error during onDownloadCancelled: ${e}`);
        this.handleError(e as Error);
      }
    }
  }

  async onDownloadInterrupted(downloadData: DownloadData) {
    const { callbacks } = this;

    if (callbacks.onDownloadInterrupted) {
      this.log("Calling onDownloadInterrupted");
      try {
        await callbacks.onDownloadInterrupted(downloadData);
      } catch (e) {
        this.log(`Error during onDownloadInterrupted: ${e}`);
        this.handleError(e as Error);
      }
    }
  }

  handleError(error: Error, downloadData?: DownloadData) {
    const { callbacks } = this;

    if (callbacks.onError) {
      callbacks.onError(error, downloadData);
    }
  }
}
