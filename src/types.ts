import type { BrowserWindow, SaveDialogOptions } from "electron";
import type { DownloadData } from "./DownloadData";

/**
 * The download has started
 */
export type DownloadStartedFn = (data: DownloadData) => Promise<void> | void;
/**
 * There is progress on the download
 */
export type DownloadProgressFn = (data: DownloadData) => Promise<void> | void;
/**
 * The download has been cancelled
 */
export type DownloadCancelledFn = (data: DownloadData) => Promise<void> | void;
/**
 * The download has completed
 */
export type DownloadCompletedFn = (data: DownloadData) => Promise<void> | void;
/**
 * The download was interrupted
 */
export type DownloadInterruptedFn = (data: DownloadData) => Promise<void> | void;
/**
 * The download has failed
 */
export type ErrorFn = (error: Error, data?: DownloadData) => Promise<void> | void;

/**
 * Function for logging internal debug messages
 */
export type DebugLoggerFn = (message: string) => void;

export interface DownloadManagerConstructorParams {
  /**
   * If defined, will log out internal debug messages. Useful for
   * troubleshooting downloads. Does not log out progress due to
   * how frequent it can be.
   */
  debugLogger?: DebugLoggerFn;
}

export interface DownloadManagerCallbacks {
  /**
   * When the download has started. When using a "save as" dialog,
   * this will be called after the user has selected a location.
   *
   * This will always be called first before the progress and completed events.
   */
  onDownloadStarted?: DownloadStartedFn;
  /**
   * When there is a progress update on a download. Note: This
   * may be skipped entirely in some cases, where the download
   * completes immediately. In that case, onDownloadCompleted
   * will be called instead.
   */
  onDownloadProgress?: DownloadProgressFn;
  /**
   * When the download has completed
   */
  onDownloadCompleted?: DownloadCompletedFn;
  /**
   * When the download has been cancelled. Also called if the user cancels
   * from the save as dialog.
   */
  onDownloadCancelled?: DownloadCancelledFn;
  /**
   * When the download has been interrupted. This could be due to a bad
   * connection, the server going down, etc.
   */
  onDownloadInterrupted?: DownloadInterruptedFn;
  /**
   * When an error has been encountered.
   * Note: The signature is (error, <maybe some data>).
   */
  onError?: ErrorFn;
}

export interface DownloadConfig {
  /**
   * The Electron.BrowserWindow instance
   */
  window: BrowserWindow;
  /**
   * The URL to download
   */
  url: string;
  /**
   * The callbacks to define to listen for download events
   */
  callbacks: DownloadManagerCallbacks;
  /**
   * Electron.DownloadURLOptions to pass to the downloadURL method
   *
   * @see https://www.electronjs.org/docs/latest/api/session#sesdownloadurlurl-options
   */
  downloadURLOptions?: Electron.DownloadURLOptions;
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

export interface IElectronDownloadManager {
  /**
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   *
   * Returns the id of the download.
   *
   * This *must* be called with `await` or unintended behavior may occur.
   */
  download(params: DownloadConfig): Promise<string>;
  /**
   * Cancels a download
   */
  cancelDownload(id: string): void;
  /**
   * Pauses a download
   */
  pauseDownload(id: string): void;
  /**
   * Resumes a download
   */
  resumeDownload(id: string): void;
  /**
   * Returns the number of active downloads
   */
  getActiveDownloadCount(): number;
  /**
   * Returns the data for a download
   */
  getDownloadData(id: string): DownloadData | undefined;
}
