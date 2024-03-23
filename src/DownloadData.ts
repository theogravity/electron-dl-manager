import type { DownloadItem, Event, WebContents } from 'electron'
import { generateRandomId } from './utils'

/**
 * Contains the data for a download.
 */
export class DownloadData {
  /**
   * Generated id for the download
   */
  id: string
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
  /**
   * The name of the file that is being saved to the user's computer.
   * Recommended over Item.getFilename() as it may be inaccurate when using the save as dialog.
   */
  resolvedFilename: string
  /**
   * The percentage of the download that has been completed
   */
  percentCompleted: number
  /**
   * If true, the download was cancelled from the save as dialog
   */
  cancelledFromSaveAsDialog?: boolean

  constructor() {
    this.id = generateRandomId()
    this.resolvedFilename = 'testFile.txt'
    this.percentCompleted = 0
    this.cancelledFromSaveAsDialog = false
    this.item = {} as DownloadItem
    this.webContents = {} as WebContents
    this.event = {} as Event
  }

  isDownloadInProgress() {
    return this.item.getState() === 'progressing'
  }

  isDownloadCompleted() {
    return this.item.getState() === 'completed'
  }

  isDownloadCancelled() {
    return this.item.getState() === 'cancelled'
  }

  isDownloadInterrupted() {
    return this.item.getState() === 'interrupted'
  }

  isDownloadPaused() {
    return this.item.isPaused()
  }
}
