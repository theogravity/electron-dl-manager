import crypto from 'crypto'
import type { BrowserWindow, DownloadItem, Event, SaveDialogOptions, WebContents } from 'electron'
import { app } from 'electron'
import extName from 'ext-name'
import {
  DownloadManagerCallbackData,
  DownloadManagerCallbacks,
  DownloadManagerConstructorParams,
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

interface InitNonInteractiveDownloadParams {
  id: string
  filePath: string
  event: Event
  item: DownloadItem
  webContents: WebContents
  callbacks: DownloadManagerCallbacks
  showBadge?: boolean
}

interface InitSaveAsInteractiveDownloadParams extends InitNonInteractiveDownloadParams {
  saveDialogOptions?: SaveDialogOptions
}

/**
 * Enables handling downloads in Electron.
 */
export class ElectronDownloadManager implements IElectronDownloadManager {
  protected idToCallbackData: Record<string, DownloadManagerCallbackData>
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
    this.listeners = new WeakMap()
    this.idToCallbackData = {}
    this.logger = params.debugLogger || (() => {})
  }

  protected log(message: string) {
    this.logger(message)
  }

  /**
   * Cancels a download
   */
  cancelDownload(id: string) {
    const data = this.idToCallbackData[id]

    if (data?.item) {
      this.log(`[${id}] Cancelling download`)
      data.item.cancel()
    } else {
      this.log(`[${id}] Download ${id} not found for cancellation`)
    }
  }

  /**
   * Pauses a download
   */
  pauseDownload(id: string) {
    const data = this.idToCallbackData[id]

    if (data?.item) {
      this.log(`[${id}] Pausing download`)
      data.item.pause()
    } else {
      this.log(`[${id}] Download ${id} not found for pausing`)
    }
  }

  /**
   * Resumes a download
   */
  resumeDownload(id: string) {
    const data = this.idToCallbackData[id]

    if (data?.item.isPaused()) {
      this.log(`[${id}] Resuming download`)
      data.item.resume()
    } else {
      this.log(`[${id}] Download ${id} not found or is not in a paused state`)
    }
  }

  /**
   * Returns the number of active downloads
   */
  getActiveDownloadCount() {
    return Object.values(this.idToCallbackData).filter(({ item }) => item.getState() === 'progressing').length
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
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   *
   * Returns the id of the download.
   */
  download(params: DownloadParams) {
    if (!params.saveAsFilename && !params.saveDialogOptions) {
      throw new Error('You must define either saveAsFilename or saveDialogOptions to start a download')
    }

    if (params.saveAsFilename && params.saveDialogOptions) {
      throw new Error('You cannot define both saveAsFilename and saveDialogOptions to start a download')
    }

    const id = generateRandomId()

    this.log(`[${id}] Registering download for url: ${tUrl(params.url)}`)
    params.window.webContents.session.once('will-download', this.generateOnWillDownload(id, params))
    params.window.webContents.downloadURL(params.url, params.downloadURLOptions)

    return id
  }

  /**
   * Generates the handler that attaches to the session `will-download` event,
   * which will execute the workflows for handling a download.
   */
  protected generateOnWillDownload(id: string, downloadParams: DownloadParams) {
    return async (event: Event, item: DownloadItem, webContents: WebContents): Promise<void> => {
      item.pause()

      const { callbacks, directory, overwrite, saveAsFilename, saveDialogOptions, showBadge } = downloadParams

      const filePath = this.determineFilePath({ directory, saveAsFilename, item, overwrite })

      if (saveDialogOptions) {
        this.initSaveAsInteractiveDownload({
          id,
          filePath,
          event,
          item,
          webContents,
          callbacks,
          saveDialogOptions,
          showBadge,
        })
        return
      }

      await this.initNonInteractiveDownload({
        id,
        filePath,
        event,
        item,
        webContents,
        callbacks,
        showBadge,
      })
    }
  }

  /**
   * Flow for handling a download that requires user interaction via a "Save as" dialog.
   */
  private initSaveAsInteractiveDownload({
    id,
    filePath,
    event,
    item,
    webContents,
    saveDialogOptions,
    callbacks,
    showBadge,
  }: InitSaveAsInteractiveDownloadParams) {
    this.log(`[${id}] Prompting save as dialog`)
    // This actually isn't what shows the save dialog
    // If item.setSavePath() isn't called at all after some tiny period of time,
    // then the save dialog will show up, and it will use the options we set it to here
    item.setSaveDialogOptions({ ...saveDialogOptions, defaultPath: filePath })

    // Because the download happens concurrently as the user is choosing a save location
    // we need to wait for the save location to be chosen before we can start to fire out events
    // there's no good way to listen for this, so we need to poll
    const interval = setInterval(async () => {
      // It seems to unpause sometimes in the dialog situation ???
      // item.getState() value becomes 'completed' for small files
      // before item.resume() is called
      item.pause()

      if (item.getSavePath()) {
        clearInterval(interval)

        this.log(`User selected save path to ${item.getSavePath()}`)
        this.log(`[${id}] Initiating download item handlers`)

        const callbackData: DownloadManagerCallbackData = {
          item,
          id,
          event,
          webContents,
          resolvedFilename: path.basename(item.getSavePath()),
          percentCompleted: 0,
        }

        const downloadParams = {
          showBadge,
        }

        const { updatedHandler, doneHandler } = this.generateDownloadItemHandlersAndCallbackData({
          callbacks,
          callbackData,
          downloadParams,
        })

        await this.triggerDownloadStarted(callbacks, callbackData)
        // If for some reason the above pause didn't work...
        // We'll manually call the completed handler
        if (item.getState() === 'completed') {
          if (callbacks.onDownloadCompleted) {
            this.log(`[${id}] Calling onDownloadCompleted`)

            try {
              await callbacks.onDownloadCompleted({
                id,
                item,
                event,
                webContents,
                percentCompleted: 100,
                resolvedFilename: path.basename(item.getSavePath()),
              })
            } catch (e) {
              this.log(`[${id}] Error during onDownloadCompleted: ${e}`)
              this.handleError(callbacks, e as Error, { item, event, webContents })
            }
          }
          this.cleanup(item)
        } else {
          item.on('updated', updatedHandler)
          item.once('done', doneHandler)
        }
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
  }

  /**
   * Flow for handling a download that doesn't require user interaction.
   */
  private async initNonInteractiveDownload({
    id,
    filePath,
    event,
    item,
    webContents,
    callbacks,
    showBadge,
  }: InitNonInteractiveDownloadParams) {
    this.log(`[${id}] Setting save path to ${filePath}`)
    item.setSavePath(filePath)
    this.log(`[${id}] Initiating download item handlers`)
    const callbackData: DownloadManagerCallbackData = {
      item,
      id,
      event,
      webContents,
      resolvedFilename: path.basename(filePath),
      percentCompleted: 0,
    }

    const downloadParams = {
      showBadge,
    }

    const { updatedHandler, doneHandler } = this.generateDownloadItemHandlersAndCallbackData({
      callbacks,
      callbackData,
      downloadParams,
    })

    await this.triggerDownloadStarted(callbacks, callbackData)
    item.on('updated', updatedHandler)
    item.once('done', doneHandler)
    item.resume()
  }

  private async triggerDownloadStarted(callbacks: DownloadManagerCallbacks, data: DownloadManagerCallbackData) {
    if (callbacks.onDownloadStarted) {
      this.log(`[${data.id}] Calling onDownloadStarted`)
      try {
        await callbacks.onDownloadStarted(data)
      } catch (e) {
        this.log(`[${data.id}] Error during onDownloadStarted: ${e}`)
        this.handleError(callbacks, e as Error, data)
      }
    }
  }

  private generateDownloadItemHandlersAndCallbackData({
    callbacks,
    callbackData,
    downloadParams,
  }: {
    callbacks: DownloadManagerCallbacks
    callbackData: DownloadManagerCallbackData
    downloadParams: Pick<DownloadParams, 'showBadge'>
  }) {
    const { id, item, event, webContents, resolvedFilename } = callbackData

    const { showBadge } = downloadParams

    this.idToCallbackData[id] = {
      id,
      percentCompleted: 0,
      resolvedFilename,
      item,
      webContents,
      event,
    }

    const handlerConfig = {
      id,
      event,
      item,
      webContents,
      callbacks,
      showBadge,
    }

    const updatedHandler = this.generateItemOnUpdated(handlerConfig)
    const doneHandler = this.generateItemOnDone(handlerConfig)

    this.listeners.set(item, {
      id,
      done: doneHandler,
      updated: updatedHandler,
    })

    return {
      updatedHandler,
      doneHandler,
    }
  }

  /**
   * Determines the initial file path for the download.
   */
  private determineFilePath({
    directory,
    saveAsFilename,
    item,
    overwrite,
  }: {
    directory?: string
    saveAsFilename?: string
    item: DownloadItem
    overwrite?: boolean
  }) {
    // Code adapted from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L73
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

    return filePath
  }

  /**
   * Generates the handler for hooking into the DownloadItem's `updated` event.
   */
  protected generateItemOnUpdated({ id, event, item, webContents, callbacks, showBadge }: ItemHandlerParams) {
    return async (_event: Event, state: 'progressing' | 'interrupted') => {
      const callbackData = this.idToCallbackData[id]

      if (!callbackData) {
        this.log(`[${id}] Callback data not found for itemOnUpdated`)
        return
      }

      switch (state) {
        case 'progressing': {
          this.updateProgress(callbackData)
          if (callbacks.onDownloadProgress) {
            this.log(`[${id}] Calling onDownloadProgress ${callbackData.percentCompleted}%`)

            try {
              await callbacks.onDownloadProgress(callbackData)
            } catch (e) {
              this.log(`[${id}] Error during onDownloadProgress: ${e}`)
              this.handleError(callbacks, e as Error, callbackData)
            }
          }
          break
        }
        case 'interrupted': {
          if (callbacks.onDownloadInterrupted) {
            this.log(`[${id}] Calling onDownloadInterrupted`)
            try {
              await callbacks.onDownloadInterrupted(callbackData)
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

  /**
   * Generates the handler for hooking into the DownloadItem's `done` event.
   */
  protected generateItemOnDone({ id, event, item, webContents, callbacks, showBadge }: ItemHandlerParams) {
    return async (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => {
      const callbackData = this.idToCallbackData[id]

      if (!callbackData) {
        this.log(`[${id}] Callback data not found for itemOnUpdated`)
        return
      }

      switch (state) {
        case 'completed': {
          if (callbacks.onDownloadCompleted) {
            this.log(`[${id}] Calling onDownloadCompleted`)

            try {
              await callbacks.onDownloadCompleted(callbackData)
            } catch (e) {
              this.log(`[${id}] Error during onDownloadCompleted: ${e}`)
              this.handleError(callbacks, e as Error, callbackData)
            }
          }
          break
        }
        case 'cancelled':
          if (callbacks.onDownloadCancelled) {
            this.log(`[${id}] Calling onDownloadCancelled`)

            try {
              await callbacks.onDownloadCancelled(callbackData)
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

  protected updateProgress(data: DownloadManagerCallbackData): void {
    if (data) {
      data.percentCompleted = parseFloat(((data.item.getReceivedBytes() / data.item.getTotalBytes()) * 100).toFixed(2))
    }
  }

  protected cleanup(item: DownloadItem) {
    const listeners = this.listeners.get(item)

    if (listeners) {
      this.log(`[${listeners.id}] Cleaning up`)
      item.removeListener('updated', listeners.updated)
      item.removeListener('done', listeners.done)
      delete this.idToCallbackData[listeners.id]
      this.listeners.delete(item)
    }
  }
}
