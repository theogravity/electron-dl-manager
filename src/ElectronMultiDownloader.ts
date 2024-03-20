import crypto from 'crypto'
import type { BrowserWindow, DownloadItem, Event, WebContents } from 'electron'
import {
  DownloadManagerCallbacks,
  DownloadManagerConstructorParams,
  DownloadManagerItem,
  DownloadParams,
} from './types'

type DoneEventFn = (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => Promise<void>
type UpdatedEventFn = (_event: Event, state: 'progressing' | 'interrupted') => Promise<void>

interface ItemHandlerParams {
  id: string
  event: Event
  item: DownloadItem
  webContents: WebContents
  callbacks: DownloadManagerCallbacks
}

function tId(id: string) {
  return id.slice(0, 5)
}

function tUrl(url: string) {
  if (url.length > 50) {
    return url.slice(0, 50) + '...'
  }
  return url
}

/**
 * Enables handling downloads in Electron.
 */
export class ElectronMultiDownloader {
  // WeakMap for auto-cleanup when the download is done
  protected downloadItems: WeakMap<DownloadItem, DownloadManagerItem>
  // Reverse lookup for download items. Mainly used for operations like item cancellation
  protected idToDownloadItems: Record<string, DownloadItem>
  // Used to keep track of the listeners so we can un-listen after we're done
  protected listeners: WeakMap<
    DownloadItem,
    {
      id: string
      done: DoneEventFn
      updated: UpdatedEventFn
    }
  >
  protected logger: (message: string) => void

  constructor(params: DownloadManagerConstructorParams = {}) {
    this.downloadItems = new WeakMap()
    this.listeners = new WeakMap()
    this.idToDownloadItems = {}
    this.logger = params.debugLogger || (() => {})
  }

  protected log(message: string) {
    this.logger(message)
  }

  /**
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   */
  download({ window, url, downloadURLOptions, callbacks, saveDialogOptions }: DownloadParams) {
    this.log(`Registering download for url: ${tUrl(url)}`)
    window.webContents.session.once('will-download', this.onWillDownload({ callbacks, saveDialogOptions }))
    window.webContents.downloadURL(url, downloadURLOptions)
  }

  /**
   * Cancels a download
   */
  cancelDownload(id: string) {
    const item = this.idToDownloadItems[id]

    if (item) {
      this.log(`[${tId(id)}] Cancelling download`)
      item.cancel()
    } else {
      this.log(`[${tId(id)}] Download not found for cancellation`)
    }
  }

  /**
   * Pauses a download
   */
  pauseDownload(id: string) {
    const item = this.idToDownloadItems[id]

    if (item) {
      this.log(`[${tId(id)}] Pausing download`)
      item.pause()
    } else {
      this.log(`[${tId(id)}] Download not found for pausing`)
    }
  }

  /**
   * Resumes a download
   */
  resumeDownload(id: string) {
    const item = this.idToDownloadItems[id]

    if (item && item.isPaused()) {
      this.log(`[${tId(id)}] Resuming download`)
      item.resume()
    } else {
      this.log(`[${tId(id)}] Download not found or is not in a paused state`)
    }
  }

  /**
   * Enables network throttling on a BrowserWindow. Settings apply to *all*
   * transfers in the window, not just downloads. Settings may be persistent
   * on application restart, so use `disableThrottle` to reset after you're done
   * testing.
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions
   * @see https://github.com/electron/electron/issues/21250
   */
  static async throttleConnections(
    window: BrowserWindow,
    conditions: {
      offline?: boolean
      latency?: number
      downloadThroughput?: number
      uploadThroughput?: number
      connectionType?: string
      packetLoss?: number
      packetQueueLength?: number
      packetReordering?: number
    }
  ) {
    const dbg = window.webContents.debugger
    dbg.attach()
    await dbg.sendCommand('Network.enable')
    await dbg.sendCommand('Network.emulateNetworkConditions', conditions)
  }

  /**
   * Disables network throttling on a BrowserWindow
   */
  static async disableThrottle(window: BrowserWindow) {
    const dbg = window.webContents.debugger
    dbg.attach()
    await dbg.sendCommand('Network.enable')
    await dbg.sendCommand('Network.emulateNetworkConditions', {
      offline: false,
      upload: -1,
      download: -1,
      latency: 0,
    })
    dbg.detach()
  }

  /**
   * Handles when the user initiates a download action by adding the developer-defined
   * listeners to the download item events.
   */
  protected onWillDownload({
    callbacks,
    saveDialogOptions,
  }: {
    callbacks: DownloadManagerCallbacks
    saveDialogOptions?: Electron.CrossProcessExports.SaveDialogOptions
  }) {
    return async (event: Event, item: DownloadItem, webContents: WebContents): Promise<void> => {
      if (saveDialogOptions) {
        this.log(`Prompting save as dialog`)
        item.setSaveDialogOptions(saveDialogOptions)
      }

      const id = this.calculateId(item)

      this.log(`[${tId(id)}] Associating to ${item.getFilename()}`)
      this.log(`[${tId(id)}] Initiating download item handlers`)

      this.downloadItems.set(item, {
        id,
        percentCompleted: 0,
      })

      this.idToDownloadItems[id] = item

      if (callbacks.onDownloadStarted && this.downloadItems.has(item)) {
        this.log(`[${tId(id)}] Calling onDownloadStarted`)
        await callbacks.onDownloadStarted({
          ...this.downloadItems.get(item)!,
          item,
          event,
          webContents,
        })
      }

      const updatedHandler = this.itemOnUpdated({
        id,
        event: event,
        item: item,
        webContents: webContents,
        callbacks: callbacks,
      })

      const doneHandler = this.itemOnDone({
        id,
        event: event,
        item: item,
        webContents: webContents,
        callbacks: callbacks,
      })

      this.listeners.set(item, {
        id,
        done: doneHandler,
        updated: updatedHandler,
      })

      item.on('updated', updatedHandler)
      item.once('done', doneHandler)
    }
  }

  protected itemOnUpdated({ id, event, item, webContents, callbacks }: ItemHandlerParams) {
    return async (_event: Event, state: 'progressing' | 'interrupted') => {
      switch (state) {
        case 'progressing': {
          this.updateProgress(item)
          if (callbacks.onDownloadProgress && this.downloadItems.has(item)) {
            const data = this.downloadItems.get(item)!

            this.log(`[${tId(id)}] Calling onDownloadProgress ${data.percentCompleted}%`)

            await callbacks.onDownloadProgress({
              ...data,
              item,
              event,
              webContents,
            })
          }
          break
        }
        case 'interrupted': {
          this.log(`onUpdated interrupted ${tId(id)}`)
          break
        }
      }
    }
  }

  protected itemOnDone({ id, event, item, webContents, callbacks }: ItemHandlerParams) {
    return async (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => {
      switch (state) {
        case 'completed': {
          if (callbacks.onDownloadCompleted && this.downloadItems.has(item)) {
            this.log(`[${tId(id)}] Calling onDownloadCompleted`)

            await callbacks.onDownloadCompleted({
              ...this.downloadItems.get(item)!,
              item,
              event,
              webContents,
            })
          }
          break
        }
        case 'cancelled':
          if (callbacks.onDownloadCancelled && this.downloadItems.has(item)) {
            this.log(`[${tId(id)}] Calling onDownloadCancelled`)

            await callbacks.onDownloadCancelled({
              ...this.downloadItems.get(item)!,
              item,
              event,
              webContents,
            })
          }
          break
        case 'interrupted':
          this.log(`[${tId(id)}] itemOnDone interrupted`)
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
      this.log(`[${tId(listeners.id)}] Cleaning up`)
      item.removeListener('updated', listeners.updated)
      item.removeListener('done', listeners.done)
      delete this.idToDownloadItems[listeners.id]
      this.listeners.delete(item)
      this.downloadItems.delete(item)
    }
  }
}
