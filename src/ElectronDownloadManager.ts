import crypto from 'crypto'
import type { BrowserWindow, DownloadItem, Event, WebContents } from 'electron'
import { app, dialog } from 'electron'
import extName from 'ext-name'
import {
  DownloadManagerCallbackData,
  DownloadManagerCallbacks,
  DownloadManagerConstructorParams,
  DownloadManagerItem,
  DownloadParams,
  IElectronDownloadManager,
} from './types'
import * as path from 'path'
import { unusedFilenameSync } from 'unused-filename'

type DoneEventFn = (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => Promise<void>
type UpdatedEventFn = (_event: Event, state: 'progressing' | 'interrupted') => Promise<void>

interface ItemHandlerParams {
  id: string
  event: Event
  item: DownloadItem
  webContents: WebContents
  callbacks: DownloadManagerCallbacks
  showBadge?: boolean
}

function tUrl(url: string) {
  if (url.length > 50) {
    return url.slice(0, 50) + '...'
  }
  return url
}

function generateRandomId() {
  const currentTime = new Date().getTime()
  const randomNum = Math.floor(Math.random() * 1000)
  const combinedValue = currentTime.toString() + randomNum.toString()

  const hash = crypto.createHash('sha256')
  hash.update(combinedValue)

  return hash.digest('hex').substring(0, 6)
}

// Copied from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L10
const getFilenameFromMime = (name: string, mime: string) => {
  const extensions = extName.mime(mime)

  if (extensions.length !== 1) {
    return name
  }

  return `${name}.${extensions[0].ext}`
}

/**
 * Enables handling downloads in Electron.
 */
export class ElectronDownloadManager implements IElectronDownloadManager {
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
   *
   * Returns the id of the download.
   */
  download(params: DownloadParams) {
    if (!params.saveAsFilename && !params.saveDialogOptions) {
      throw new Error('You must define either saveAsFilename or saveDialogOptions to start a download')
    }

    const id = generateRandomId()

    this.log(`[${id}] Registering download for url: ${tUrl(params.url)}`)
    params.window.webContents.session.once('will-download', this.onWillDownload(id, params))
    params.window.webContents.downloadURL(params.url, params.downloadURLOptions)

    return id
  }

  /**
   * Cancels a download
   */
  cancelDownload(id: string) {
    const item = this.idToDownloadItems[id]

    if (item) {
      this.log(`[${id}] Cancelling download`)
      item.cancel()
    } else {
      this.log(`[${id}] Download ${id} not found for cancellation`)
    }
  }

  /**
   * Pauses a download
   */
  pauseDownload(id: string) {
    const item = this.idToDownloadItems[id]

    if (item) {
      this.log(`[${id}] Pausing download`)
      item.pause()
    } else {
      this.log(`[${id}] Download ${id} not found for pausing`)
    }
  }

  /**
   * Resumes a download
   */
  resumeDownload(id: string) {
    const item = this.idToDownloadItems[id]

    if (item && item.isPaused()) {
      this.log(`[${id}] Resuming download`)
      item.resume()
    } else {
      this.log(`[${id}] Download ${id} not found or is not in a paused state`)
    }
  }

  /**
   * Returns the number of active downloads
   */
  getActiveDownloadCount() {
    return Object.values(this.idToDownloadItems).filter((item) => item.getState() === 'progressing').length
  }

  protected handleError(
    callbacks: DownloadManagerCallbacks,
    error: Error,
    data?: Partial<DownloadManagerCallbackData>
  ) {
    if (callbacks.onError) {
      callbacks.onError(error, data)
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
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    })
    dbg.detach()
  }

  protected updateBadgeCount() {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(this.getActiveDownloadCount())
    }
  }

  /**
   * Handles when the user initiates a download action by adding the developer-defined
   * listeners to the download item events. Attaches to the session `will-download` event.
   */
  protected onWillDownload(
    id: string,
    { directory, overwrite, saveAsFilename, callbacks, saveDialogOptions, showBadge }: DownloadParams
  ) {
    return async (event: Event, item: DownloadItem, webContents: WebContents): Promise<void> => {
      item.pause()
      const start = async () => {
        if (callbacks.onDownloadStarted) {
          this.log(`[${id}] Calling onDownloadStarted`)
          try {
            await callbacks.onDownloadStarted({
              ...downloadData,
              item,
              event,
              webContents,
            })
          } catch (e) {
            this.log(`[${id}] Error during onDownloadStarted: ${e}`)
            this.handleError(callbacks, e as Error, { id, item, event, webContents })
          }
        }
      }

      // Begin adapted code from
      // https://github.com/sindresorhus/electron-dl/blob/main/index.js#L73

      if (directory && !path.isAbsolute(directory)) {
        throw new Error('The `directory` option must be an absolute path')
      }

      directory = directory || app.getPath('downloads')

      let filePath
      if (saveAsFilename) {
        filePath = path.join(directory, saveAsFilename)
      } else {
        const filename = item.getFilename()
        const name = path.extname(filename) ? filename : getFilenameFromMime(filename, item.getMimeType())

        filePath = overwrite ? path.join(directory, name) : unusedFilenameSync(path.join(directory, name))
      }

      if (saveDialogOptions) {
        this.log(`[${id}] Prompting save as dialog`)
        // This actually isn't what shows the save dialog
        // If item.setSavePath() isn't called at all after some tiny period of time,
        // then the save dialog will show up, and it will use the options we set it to here
        item.setSaveDialogOptions({ ...saveDialogOptions, defaultPath: filePath })
      } else {
        this.log(`Setting save path to ${filePath}`)
        item.setSavePath(filePath)
      }

      // End adapted code from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L73

      const resolvedFilename = path.basename(item.getSavePath()) || item.getFilename()

      this.log(`[${id}] Associating ${id} to ${resolvedFilename}`)

      const downloadData = {
        id,
        percentCompleted: 0,
        resolvedFilename,
      }

      this.downloadItems.set(item, downloadData)

      this.idToDownloadItems[id] = item

      const handlerConfig = {
        id,
        event,
        item,
        webContents,
        callbacks,
        showBadge,
      }

      const updatedHandler = this.itemOnUpdated(handlerConfig)
      const doneHandler = this.itemOnDone(handlerConfig)

      this.listeners.set(item, {
        id,
        done: doneHandler,
        updated: updatedHandler,
      })

      if (saveDialogOptions) {
        // Because the download happens concurrently as the user is choosing a save location
        // we need to wait for the save location to be chosen before we can start to fire out events
        // there's no good way to listen for this, so we need to poll
        const interval = setInterval(async () => {
          if (item.getSavePath()) {
            this.log(`User selected save path to ${item.getSavePath()}`)
            this.log(`[${id}] Initiating download item handlers`)
            clearInterval(interval)
            await start()
            item.on('updated', updatedHandler)
            item.once('done', doneHandler)
            item.resume()
          } else if (item.getState() === 'cancelled') {
            clearInterval(interval)
            this.log(`[${id}] Download was cancelled by user`)
            if (callbacks.onDownloadCancelled) {
              this.log(`[${id}] Calling onDownloadCancelled`)

              try {
                await callbacks.onDownloadCancelled({
                  id,
                  item,
                  event,
                  webContents,
                  cancelledFromSaveAsDialog: true,
                  percentCompleted: 0,
                  resolvedFilename: '',
                })
              } catch (e) {
                this.log(`[${id}] Error during onDownloadCancelled: ${e}`)
                this.handleError(callbacks, e as Error, { item, event, webContents })
              }
            }
          } else {
            this.log(`[${id}] Waiting for save path to be chosen by user`)
          }
        }, 500)
      } else {
        this.log(`[${id}] Initiating download item handlers`)

        await start()
        item.on('updated', updatedHandler)
        item.once('done', doneHandler)
        item.resume()
      }
    }
  }

  protected itemOnUpdated({ id, event, item, webContents, callbacks, showBadge }: ItemHandlerParams) {
    return async (_event: Event, state: 'progressing' | 'interrupted') => {
      switch (state) {
        case 'progressing': {
          this.updateProgress(item)
          if (callbacks.onDownloadProgress && this.downloadItems.has(item)) {
            const data = this.downloadItems.get(item)!
            this.log(`[${id}] Calling onDownloadProgress ${data.percentCompleted}%`)

            try {
              await callbacks.onDownloadProgress({
                ...data,
                item,
                event,
                webContents,
              })
            } catch (e) {
              this.log(`[${id}] Error during onDownloadProgress: ${e}`)
              this.handleError(callbacks, e as Error, { item, event, webContents, ...data })
            }
          }
          break
        }
        case 'interrupted': {
          if (callbacks.onDownloadInterrupted && this.downloadItems.has(item)) {
            this.log(`[${id}] Calling onDownloadInterrupted`)

            try {
              await callbacks.onDownloadInterrupted({
                ...this.downloadItems.get(item)!,
                item,
                event,
                webContents,
              })
            } catch (e) {
              this.log(`[${id}] Error during onDownloadInterrupted: ${e}`)
              this.handleError(callbacks, e as Error, { item, event, webContents })
            }
          }
          break
        }
        default:
          this.log(`[${id}] Unexpected itemOnUpdated state: ${state}`)
      }

      if (showBadge) {
        this.updateBadgeCount()
      }
    }
  }

  protected itemOnDone({ id, event, item, webContents, callbacks, showBadge }: ItemHandlerParams) {
    return async (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => {
      switch (state) {
        case 'completed': {
          if (callbacks.onDownloadCompleted && this.downloadItems.has(item)) {
            this.log(`[${id}] Calling onDownloadCompleted`)

            try {
              await callbacks.onDownloadCompleted({
                ...this.downloadItems.get(item)!,
                item,
                event,
                webContents,
              })
            } catch (e) {
              this.log(`[${id}] Error during onDownloadCompleted: ${e}`)
              this.handleError(callbacks, e as Error, { item, event, webContents })
            }
          }
          break
        }
        case 'cancelled':
          if (callbacks.onDownloadCancelled && this.downloadItems.has(item)) {
            this.log(`[${id}] Calling onDownloadCancelled`)

            try {
              await callbacks.onDownloadCancelled({
                ...this.downloadItems.get(item)!,
                item,
                event,
                webContents,
              })
            } catch (e) {
              this.log(`[${id}] Error during onDownloadCancelled: ${e}`)
              this.handleError(callbacks, e as Error, { item, event, webContents })
            }
          }
          break
        default:
          this.log(`[${id}] Unexpected itemOnDone state: ${state}`)
      }

      if (showBadge) {
        this.updateBadgeCount()
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

  protected cleanup(item: DownloadItem) {
    const listeners = this.listeners.get(item)

    if (listeners) {
      this.log(`[${listeners.id}] Cleaning up`)
      item.removeListener('updated', listeners.updated)
      item.removeListener('done', listeners.done)
      delete this.idToDownloadItems[listeners.id]
      this.listeners.delete(item)
      this.downloadItems.delete(item)
    }
  }
}
