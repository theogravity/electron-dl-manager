import { CallbackDispatcher } from "./CallbackDispatcher";
import { DownloadData } from "./DownloadData";

export const DownloadInitiator = jest.fn().mockImplementation(() => {
  return {
    logger: jest.fn(),
    onItemUpdated: jest.fn(),
    onItemDone: jest.fn(),
    onCleanup: jest.fn(),
    callbackDispatcher: new CallbackDispatcher(),
    downloadData: new DownloadData(),
    config: { callbacks: {} },
    log: jest.fn(),
    getDownloadId: jest.fn(),
    getDownloadData: jest.fn(),
    generateOnWillDownload: jest.fn(() => jest.fn()),
    initSaveAsInteractiveDownload: jest.fn(),
    initNonInteractiveDownload: jest.fn(),
    generateItemOnUpdated: jest.fn(),
    generateItemOnDone: jest.fn(),
    cleanup: jest.fn(),
    updateProgress: jest.fn(),
  };
});
