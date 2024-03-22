import type { DownloadItem, SaveDialogOptions, WebContents, Event, BrowserWindow } from 'electron'

export interface DownloadManagerItem {
  /**
   * Generated id for the download
   */
  id: string
  /**
   * The percentage of the download that has been completed
   */
  percentCompleted: number
  /**
   * The name of the file that is being saved to the user's computer.
   * Recommended over Item.getFilename() as it may be inaccurate when using the save as dialog.
   */
  resolvedFilename: string
  /**
   * If true, the download was cancelled from the save as dialog
   */
  cancelledFromSaveAsDialog?: boolean
}

export interface DownloadManagerCallbackData extends DownloadManagerItem {
  /**
   * The Electron.DownloadItem. Use this to grab the filename, path, etc.
   * @see https://www.electronjs.org/docs/latest/api/download-item
   */
  item: DownloadItem
  /**
   * The Electron.WebContents
   * @see https://www.electronjs.org/docs/latest/api/web-contents
   */
  webContents: WebContents
  /**
   * The Electron.Event
   * @see https://www.electronjs.org/docs/latest/api/event
   */
  event: Event
}

/**
 * The download has started
 */
export type DownloadStartedFn = (data: DownloadManagerCallbackData) => Promise<void> | void
/**
 * There is progress on the download
 */
export type DownloadProgressFn = (data: DownloadManagerCallbackData) => Promise<void> | void
/**
 * The download has been cancelled
 */
export type DownloadCancelledFn = (data: DownloadManagerCallbackData) => Promise<void> | void
/**
 * The download has completed
 */
export type DownloadCompletedFn = (data: DownloadManagerCallbackData) => Promise<void> | void
/**
 * The download was interrupted
 */
export type DownloadInterruptedFn = (data: DownloadManagerCallbackData) => Promise<void> | void
/**
 * The download has failed
 */
export type ErrorFn = (error: Error, data?: Partial<DownloadManagerCallbackData>) => Promise<void> | void

export interface DownloadManagerConstructorParams {
  /**
   * If defined, will log out internal debug messages
   */
  debugLogger?: (message: string) => void
}

export interface DownloadManagerCallbacks {
  /**
   * When the download has started. When using a "save as" dialog,
   * this will be called after the user has selected a location.
   *
   * This will always be called first before the progress and completed events.
   */
  onDownloadStarted?: DownloadStartedFn
  /**
   * When there is a progress update on a download. Note: This
   * may be skipped entirely in some cases, where the download
   * completes immediately. In that case, onDownloadCompleted
   * will be called instead.
   */
  onDownloadProgress?: DownloadProgressFn
  /**
   * When the download has completed
   */
  onDownloadCompleted?: DownloadCompletedFn
  /**
   * When the download has been cancelled. Also called if the user cancels
   * from the save as dialog.
   */
  onDownloadCancelled?: DownloadCancelledFn
  /**
   * When the download has been interrupted. This could be due to a bad
   * connection, the server going down, etc.
   */
  onDownloadInterrupted?: DownloadInterruptedFn
  /**
   * When an error has been encountered.
   * Note: The signature is (error, <maybe some data>).
   */
  onError?: ErrorFn
}

export interface DownloadParams {
  /**
   * The Electron.BrowserWindow instance
   */
  window: BrowserWindow
  /**
   * The URL to download
   */
  url: string
  /**
   * The callbacks to define to listen for download events
   */
  callbacks: DownloadManagerCallbacks
  /**
   * Electron.DownloadURLOptions to pass to the downloadURL method
   *
   * @see https://www.electronjs.org/docs/latest/api/session#sesdownloadurlurl-options
   */
  downloadURLOptions?: Electron.DownloadURLOptions
  /**
   * If defined, will show a save dialog when the user
   * downloads a file.
   *
   * @see https://www.electronjs.org/docs/latest/api/dialog#dialogshowsavedialogbrowserwindow-options
   */
  saveDialogOptions?: SaveDialogOptions
  /**
   * The filename to save the file as. If not defined, the filename
   * from the server will be used.
   *
   * Only applies if saveDialogOptions is not defined.
   */
  saveAsFilename?: string
  /**
   * The directory to save the file to. Must be an absolute path.
   * @default The user's downloads directory
   */
  directory?: string
  /**
   * If true, will overwrite the file if it already exists
   * @default false
   */
  overwrite?: boolean
  /**
   * If true, will show a badge on the dock icon when the download is in progress
   * under MacOS and linux.
   *
   * On macOS, you need to ensure that your application has the permission to display notifications for this method to work.
   *
   * @default false
   * @see https://www.electronjs.org/docs/latest/api/app#appsetbadgecountcount-linux-macos
   */
  showBadge?: boolean
}

export interface IElectronDownloadManager {
  /**
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   *
   * Returns the id of the download.
   */
  download(params: DownloadParams): string
  /**
   * Cancels a download
   */
  cancelDownload(id: string): void
  /**
   * Pauses a download
   */
  pauseDownload(id: string): void
  /**
   * Resumes a download
   */
  resumeDownload(id: string): void
  /**
   * Returns the number of active downloads
   */
  getActiveDownloadCount(): number
}
