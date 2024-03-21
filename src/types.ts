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
   * When the download has started.
   */
  onDownloadStarted?: DownloadStartedFn
  /**
   * When there is a progress update on a download
   */
  onDownloadProgress?: DownloadProgressFn
  /**
   * When the download has completed
   */
  onDownloadCompleted?: DownloadCompletedFn
  /**
   * When the download has been cancelled
   */
  onDownloadCancelled?: DownloadCancelledFn
  /**
   * When the download has been interrupted
   */
  onDownloadInterrupted?: DownloadInterruptedFn
  /**
   * When an error has been encountered. Note the signature is (error, <maybe some data>).
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
}
