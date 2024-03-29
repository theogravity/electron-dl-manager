import { EventEmitter } from "node:events";
import type { DownloadItem, WebContents } from "electron";
import { type DownloadData as ActualDownloadData, generateRandomId } from "../index";

export const DownloadData = jest.fn().mockImplementation(() => {
  return createMockDownloadData().downloadData;
});

export function createMockDownloadData() {
  const itemEmitter = new EventEmitter();

  const item: jest.Mocked<DownloadItem> = {
    setSaveDialogOptions: jest.fn(),
    setSavePath: jest.fn(),
    getSavePath: jest.fn().mockReturnValue("/path/to/save"),
    getReceivedBytes: jest.fn().mockReturnValue(900),
    getTotalBytes: jest.fn().mockReturnValue(1000),
    cancel: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    isPaused: jest.fn(),
    getState: jest.fn(),
    getFilename: jest.fn().mockReturnValue("filename.txt"),
    // @ts-ignore
    on: itemEmitter.on.bind(itemEmitter) as DownloadItem["on"],
    // @ts-ignore
    once: itemEmitter.once.bind(itemEmitter) as DownloadItem["once"],
  };

  const downloadData: jest.Mocked<ActualDownloadData> = {
    id: generateRandomId(),
    cancelledFromSaveAsDialog: false,
    percentCompleted: 0,
    downloadRateBytesPerSecond: 0,
    estimatedTimeRemainingSeconds: 0,
    resolvedFilename: `${generateRandomId()}.txt`,
    webContents: {} as WebContents,
    event: {} as Event,
    isDownloadInProgress: jest.fn(),
    isDownloadCompleted: jest.fn(),
    isDownloadCancelled: jest.fn(),
    isDownloadInterrupted: jest.fn(),
    isDownloadResumable: jest.fn(),
    isDownloadPaused: jest.fn(),
    item,
  };

  return {
    downloadData,
    item,
    itemEmitter,
  };
}
