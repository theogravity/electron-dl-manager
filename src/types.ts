import type { BrowserWindow, DownloadItem, SaveDialogOptions } from 'electron'

export interface DownloadManagerItem {
  id: string
  percentCompleted: number
}

export interface DownloadManagerCallbackData extends DownloadManagerItem {
  item: DownloadItem
}

export type DownloadStartedFn = (data: DownloadManagerCallbackData) => Promise<void>
export type DownloadProgressFn = (data: DownloadManagerCallbackData) => Promise<void>
export type DownloadCancelledFn = (data: DownloadManagerCallbackData) => Promise<void>
export type DownloadCompletedFn = (data: DownloadManagerCallbackData) => Promise<void>

export interface DownloadManagerConfig {
  /**
   * BrowserWindow instance
   */
  window: BrowserWindow
  /**
   * If defined, will show a save dialog when the user
   * downloads a file
   */
  saveDialogOptions: SaveDialogOptions
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
