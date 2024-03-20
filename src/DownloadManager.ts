import crypto from 'crypto'
import type { DownloadItem, DownloadURLOptions, Event, WebContents } from 'electron'
import { DownloadManagerConfig, DownloadManagerItem } from './types'

type DoneEventFn = (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => Promise<void>
type UpdatedEventFn = (_event: Event, state: 'progressing' | 'interrupted') => Promise<void>

/**
 * Enables download handling for a BrowserWindow.
 */
export class DownloadManager {
  protected config: DownloadManagerConfig
  protected downloadItems: WeakMap<DownloadItem, DownloadManagerItem>
  protected listeners: WeakMap<
    DownloadItem,
    {
      done: DoneEventFn
      updated: UpdatedEventFn
    }
  >

  constructor(config: DownloadManagerConfig) {
    this.downloadItems = new WeakMap()
    this.listeners = new WeakMap()
    this.config = config

    config.window.webContents.session.on('will-download', this.onWillDownload)
  }

  /**
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   */
  download(url: string, options?: DownloadURLOptions) {
    this.config.window.webContents.downloadURL(url, options)
  }

  protected onWillDownload = async (
    _event: Event,
    item: DownloadItem,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _webContents: WebContents
  ): Promise<void> => {
    if (this.config.saveDialogOptions) {
      item.setSaveDialogOptions(this.config.saveDialogOptions)
    }

    const id = this.calculateId(item)

    this.downloadItems.set(item, {
      id,
      percentCompleted: 0,
    })

    if (this.config.onDownloadStarted && this.downloadItems.has(item)) {
      await this.config.onDownloadStarted({
        ...this.downloadItems.get(item)!,
        item,
      })
    }

    const updatedHandler = this.itemOnUpdated(item)
    const doneHandler = this.itemOnDone(item)

    this.listeners.set(item, {
      done: doneHandler,
      updated: updatedHandler,
    })

    item.on('updated', updatedHandler)
    item.once('done', doneHandler)
  }

  protected itemOnUpdated = (item: DownloadItem) => {
    return async (_event: Event, state: 'progressing' | 'interrupted') => {
      switch (state) {
        case 'progressing': {
          this.updateProgress(item)
          if (this.config.onDownloadProgress && this.downloadItems.has(item)) {
            await this.config.onDownloadProgress({
              ...this.downloadItems.get(item)!,
              item,
            })
          }
          break
        }
        case 'interrupted': {
          console.log('interrupted A')
          break
        }
      }
    }
  }

  protected itemOnDone = (item: DownloadItem) => {
    return async (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => {
      switch (state) {
        case 'completed': {
          if (this.config.onDownloadCompleted && this.downloadItems.has(item)) {
            await this.config.onDownloadCompleted({
              ...this.downloadItems.get(item)!,
              item,
            })
          }
          break
        }
        case 'cancelled':
          if (this.config.onDownloadCancelled && this.downloadItems.has(item)) {
            await this.config.onDownloadCancelled({
              ...this.downloadItems.get(item)!,
              item,
            })
          }
          break
        case 'interrupted':
          console.log('interrupted B')
          break
      }

      this.cleanup(item)
    }
  }

  protected updateProgress(item: DownloadItem): void {
    const data = this.downloadItems.get(item)

    if (data) {
      data.percentCompleted = parseFloat(((item.getReceivedBytes() / item.getTotalBytes()) * 100).toFixed(2))
    }
  }

  protected calculateId(item: DownloadItem): string {
    const toHash = item.getURL() + item.getETag() + item.getFilename() + item.getSavePath()

    return crypto.createHash('sha256').update(toHash).digest('hex')
  }

  protected cleanup(item: DownloadItem) {
    const listeners = this.listeners.get(item)

    if (listeners) {
      item.removeListener('updated', listeners.updated)
      item.removeListener('done', listeners.done)
      this.listeners.delete(item)
      this.downloadItems.delete(item)
    }
  }
}
