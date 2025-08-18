import { DownloadData } from "./DownloadData";
import type { DownloadConfig, IElectronDownloadManager, RestoreDownloadConfig } from "./types";

/**
 * Mock version of ElectronDownloadManager
 * that can be used for testing purposes
 */
export class ElectronDownloadManagerMock implements IElectronDownloadManager {
  async download(_params: DownloadConfig): Promise<string> {
    return "mock-download-id";
  }

  cancelDownload(_id: string): void {}

  pauseDownload(_id: string): import("./DownloadData").RestoreDownloadData | undefined {
    return undefined;
  }

  resumeDownload(_id: string): void {}

  getActiveDownloadCount(): number {
    return 0;
  }

  getDownloadData(id: string) {
    const downloadData = new DownloadData();
    downloadData.id = id;
    return downloadData;
  }

  async restoreDownload(_params: RestoreDownloadConfig): Promise<string> {
    return "mock-restored-download-id";
  }
}
