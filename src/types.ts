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
   * When a download has started
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
}

export interface DownloadParams {
  window: BrowserWindow
  url: string
  callbacks: DownloadManagerCallbacks
  downloadURLOptions?: Electron.DownloadURLOptions
  /**
   * If defined, will show a save dialog when the user
   * downloads a file
   */
  saveDialogOptions: SaveDialogOptions
}
