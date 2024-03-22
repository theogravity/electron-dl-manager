import type { DownloadItem, Event, SaveDialogOptions, WebContents } from 'electron'
import {
  DownloadManagerCallbackData,
  DownloadManagerCallbacks,
  DownloadManagerConstructorParams,
  DownloadParams,
} from './types'
import * as path from 'path'
import { determineFilePath } from './utils'

interface ItemHandlerParams {
  id: string
  event: Event
  item: DownloadItem
  webContents: WebContents
  callbacks: DownloadManagerCallbacks
  showBadge?: boolean
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

interface DownloadInitiatorConstructorParams {
  debugLogger?: (message: string) => void
  onCallbackData: (data: DownloadManagerCallbackData) => void
  onDownloadCompleted: (data: DownloadManagerCallbackData) => void
  onStatusUpdated: (data: DownloadManagerCallbackData) => void
  callbackData: DownloadManagerCallbackData
}

export class DownloadInitiator {
  protected logger: (message: string) => void
  protected onCallbackData: (data: DownloadManagerCallbackData) => void
  protected onDownloadCompleted: (data: DownloadManagerCallbackData) => void
  private onItemUpdated: (event: Event, state: 'progressing' | 'interrupted') => Promise<void>
  private onItemDone: (event: Event, state: 'completed' | 'cancelled' | 'interrupted') => Promise<void>
  protected callbackData: DownloadManagerCallbackData

  constructor(params: DownloadInitiatorConstructorParams) {
    this.logger = params.debugLogger || (() => {})
    this.onCallbackData = params.onCallbackData
    this.onDownloadCompleted = params.onDownloadCompleted
    this.callbackData = params.callbackData
    this.onItemUpdated = () => Promise.resolve()
    this.onItemDone = () => Promise.resolve()
  }

  protected log(message: string) {
    this.logger(message)
  }

  /**
   * Generates the handler that attaches to the session `will-download` event,
   * which will execute the workflows for handling a download.
   */
  protected generateOnWillDownload(id: string, downloadParams: DownloadParams) {
    return async (event: Event, item: DownloadItem, webContents: WebContents): Promise<void> => {
      item.pause()

      const { callbacks, directory, overwrite, saveAsFilename, saveDialogOptions, showBadge } = downloadParams

      const filePath = determineFilePath({ directory, saveAsFilename, item, overwrite })

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

        this.generateDownloadItemHandlersAndCallbackData({
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

          this.onDownloadCompleted(callbackData)
        } else {
          item.on('updated', this.onItemUpdated)
          item.once('done', this.onItemDone)
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

    this.generateDownloadItemHandlersAndCallbackData({
      callbacks,
      callbackData,
      downloadParams,
    })

    await this.triggerDownloadStarted(callbacks, callbackData)
    item.on('updated', this.onItemUpdated)
    item.once('done', this.onItemDone)
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

    const handlerConfig = {
      id,
      event,
      item,
      webContents,
      callbacks,
      showBadge,
    }

    this.onItemUpdated = this.generateItemOnUpdated(handlerConfig)
    this.onItemDone = this.generateItemOnDone(handlerConfig)

    this.onCallbackData(callbackData)
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

  protected handleError(
    callbacks: DownloadManagerCallbacks,
    error: Error,
    data?: Partial<DownloadManagerCallbackData>
  ) {
    if (callbacks.onError) {
      callbacks.onError(error, data)
    }
  }

  protected cleanup(item: DownloadItem) {
    item.removeListener('updated', this.onItemUpdated)
    item.removeListener('done', this.onItemDone)
  }
}
