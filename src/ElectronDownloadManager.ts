import type { BrowserWindow, DownloadItem, Event } from 'electron'
import { app } from 'electron'
import {
  DownloadManagerCallbackData,
  DownloadManagerCallbacks,
  DownloadManagerConstructorParams,
  DownloadParams,
  IElectronDownloadManager,
} from './types'
import { generateRandomId, truncateUrl } from './utils'

type DoneEventFn = (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => Promise<void>
type UpdatedEventFn = (_event: Event, state: 'progressing' | 'interrupted') => Promise<void>

/**
 * Enables handling downloads in Electron.
 */
export class ElectronDownloadManager implements IElectronDownloadManager {
  protected idToCallbackData: Record<string, DownloadManagerCallbackData>
  protected logger: (message: string) => void

  constructor(params: DownloadManagerConstructorParams = {}) {
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

    this.log(`[${id}] Registering download for url: ${truncateUrl(params.url)}`)
    params.window.webContents.session.once('will-download', this.generateOnWillDownload(id, params))
    params.window.webContents.downloadURL(params.url, params.downloadURLOptions)

    return id
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
      delete this.idToCallbackData[listeners.id]
    }
  }
}
