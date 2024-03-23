/* eslint-disable @typescript-eslint/no-unused-vars */

import { DownloadConfig, IElectronDownloadManager } from './types'
import { DownloadData } from './DownloadData'

/**
 * Mock version of ElectronDownloadManager
 * that can be used for testing purposes
 */
export class ElectronDownloadManagerMock implements IElectronDownloadManager {
  download(_params: DownloadConfig): string {
    return 'mock-download-id'
  }

  cancelDownload(_id: string): void {}

  pauseDownload(_id: string): void {}

  resumeDownload(_id: string): void {}

  getActiveDownloadCount(): number {
    return 0
  }

  getDownloadData(id: string) {
    const downloadData = new DownloadData()
    downloadData.id = id
    return downloadData
  }
}
