import { EventEmitter } from "node:events";
import type { DownloadItem, WebContents } from "electron";
import { vi } from "vitest";
import { generateRandomId } from "../index";

export const DownloadData = vi.fn().mockImplementation(() => {
  return createMockDownloadData().downloadData;
});

export function createMockDownloadData() {
  const itemEmitter = new EventEmitter();

  const item: any = {
    setSaveDialogOptions: vi.fn(),
    setSavePath: vi.fn(),
    getSavePath: vi.fn().mockReturnValue("/path/to/save"),
    getReceivedBytes: vi.fn().mockReturnValue(900),
    getTotalBytes: vi.fn().mockReturnValue(1000),
    getCurrentBytesPerSecond: vi.fn(),
    getPercentComplete: vi.fn(),
    getStartTime: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn(),
    getState: vi.fn(),
    getFilename: vi.fn().mockReturnValue("filename.txt"),
    // @ts-ignore
    on: itemEmitter.on.bind(itemEmitter) as DownloadItem["on"],
    // @ts-ignore
    once: itemEmitter.once.bind(itemEmitter) as DownloadItem["once"],
    // @ts-ignore
    off: itemEmitter.off.bind(itemEmitter) as DownloadItem["off"],
  };

  const downloadData: any = {
    id: generateRandomId(),
    cancelledFromSaveAsDialog: false,
    percentCompleted: 0,
    downloadRateBytesPerSecond: 0,
    estimatedTimeRemainingSeconds: 0,
    resolvedFilename: `${generateRandomId()}.txt`,
    webContents: {} as WebContents,
    event: {} as Event,
    isDownloadInProgress: vi.fn(),
    isDownloadCompleted: vi.fn(),
    isDownloadCancelled: vi.fn(),
    isDownloadInterrupted: vi.fn(),
    isDownloadResumable: vi.fn(),
    isDownloadPaused: vi.fn(),
    getRestoreDownloadData: vi.fn(),
    item,
  };

  return {
    downloadData,
    item,
    itemEmitter,
  };
}
