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
   * Use this when using setSaveDialogOptions() to get the filename the user chose.
   * This value may change at any time since the DownloadItem runs concurrently to
   * the save dialog, and we don't know when the user has chosen a filename.
   * @default DownloadItem.getFilename()
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
export type DownloadStartedFn = (data: DownloadManagerCallbackData) => Promise<void>
/**
 * There is progress on the download
 */
export type DownloadProgressFn = (data: DownloadManagerCallbackData) => Promise<void>
/**
 * The download has been cancelled
 */
export type DownloadCancelledFn = (data: DownloadManagerCallbackData) => Promise<void>
/**
 * The download has completed
 */
export type DownloadCompletedFn = (data: DownloadManagerCallbackData) => Promise<void>

export interface DownloadManagerConstructorParams {
  /**
   * If defined, will log out internal debug messages
   */
  debugLogger?: (message: string) => void
}

export interface DownloadManagerCallbacks {
  /**
   * When the download has started.
   * Note: When using setSaveDialogOptions(), this will be called even when the user is still choosing a save location.
   * In this situation, the DownloadItem data may change.
   */
  onDownloadStarted?: DownloadStartedFn
  /**
   * When there is a progress update on a download
   * Note: When using setSaveDialogOptions(), this will be called even when the user is still choosing a save location.
   * In this situation, the DownloadItem data may change, so be sure to check the filename, etc on the DownloadItem.
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
   */
  downloadURLOptions?: Electron.DownloadURLOptions
  /**
   * If defined, will show a save dialog when the user
   * downloads a file.
   */
  saveDialogOptions: SaveDialogOptions
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
