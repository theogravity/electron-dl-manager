import type { BrowserWindow } from "electron";
import type { DownloadData } from "./DownloadData";
import { DownloadInitiator } from "./DownloadInitiator";
import type {
  DebugLoggerFn,
  DownloadConfig,
  DownloadManagerConstructorParams,
  IElectronDownloadManager,
} from "./types";
import { truncateUrl } from "./utils";

/**
 * Enables handling downloads in Electron.
 */
export class ElectronDownloadManager implements IElectronDownloadManager {
  protected downloadData: Record<string, DownloadData>;
  protected logger: DebugLoggerFn;

  constructor(params: DownloadManagerConstructorParams = {}) {
    this.downloadData = {};
    this.logger = params.debugLogger || (() => {});
  }

  protected log(message: string) {
    this.logger(message);
  }

  /**
   * Returns the current download data
   */
  getDownloadData(id: string): DownloadData {
    return this.downloadData[id];
  }

  /**
   * Cancels a download
   */
  cancelDownload(id: string) {
    const data = this.downloadData[id];

    if (data?.item) {
      this.log(`[${id}] Cancelling download`);
      data.item.cancel();
    } else {
      this.log(`[${id}] Download ${id} not found for cancellation`);
    }
  }

  /**
   * Pauses a download
   */
  pauseDownload(id: string) {
    const data = this.downloadData[id];

    if (data?.item) {
      this.log(`[${id}] Pausing download`);
      data.item.pause();
    } else {
      this.log(`[${id}] Download ${id} not found for pausing`);
    }
  }

  /**
   * Resumes a download
   */
  resumeDownload(id: string) {
    const data = this.downloadData[id];

    if (data?.item.isPaused()) {
      this.log(`[${id}] Resuming download`);
      data.item.resume();
    } else {
      this.log(`[${id}] Download ${id} not found or is not in a paused state`);
    }
  }

  /**
   * Returns the number of active downloads
   */
  getActiveDownloadCount() {
    return Object.values(this.downloadData).filter((data) => data.isDownloadInProgress()).length;
  }

  /**
   * Starts a download. If saveDialogOptions has been defined in the config,
   * the saveAs dialog will show up first.
   *
   * Returns the id of the download.
   */
  download(params: DownloadConfig) {
    if (params.saveAsFilename && params.saveDialogOptions) {
      throw new Error("You cannot define both saveAsFilename and saveDialogOptions to start a download");
    }

    const downloadInitiator = new DownloadInitiator({
      debugLogger: this.logger,
      onCleanup: (data) => {
        this.cleanup(data);
      },
    });

    this.log(`[${downloadInitiator.getDownloadId()}] Registering download for url: ${truncateUrl(params.url)}`);
    params.window.webContents.session.once("will-download", downloadInitiator.generateOnWillDownload(params));
    params.window.webContents.downloadURL(params.url, params.downloadURLOptions);

    const downloadId = downloadInitiator.getDownloadId();

    this.downloadData[downloadId] = downloadInitiator.getDownloadData();

    return downloadId;
  }

  protected cleanup(data: DownloadData) {
    delete this.downloadData[data.id];
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
      offline?: boolean;
      latency?: number;
      downloadThroughput?: number;
      uploadThroughput?: number;
      connectionType?: string;
      packetLoss?: number;
      packetQueueLength?: number;
      packetReordering?: number;
    },
  ) {
    const dbg = window.webContents.debugger;
    dbg.attach();
    await dbg.sendCommand("Network.enable");
    await dbg.sendCommand("Network.emulateNetworkConditions", conditions);
  }

  /**
   * Disables network throttling on a BrowserWindow
   */
  static async disableThrottle(window: BrowserWindow) {
    const dbg = window.webContents.debugger;
    dbg.attach();
    await dbg.sendCommand("Network.enable");
    await dbg.sendCommand("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    dbg.detach();
  }
}
