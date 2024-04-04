import { CallbackDispatcher } from "./CallbackDispatcher";
import { DownloadData } from "./DownloadData";

export const DownloadInitiator = jest.fn().mockImplementation((config) => {
  const initator = {
    logger: jest.fn(),
    onItemUpdated: jest.fn(),
    onItemDone: jest.fn(),
    onDownloadInit: jest.fn(),
    onCleanup: jest.fn(),
    callbackDispatcher: new CallbackDispatcher(),
    downloadData: new DownloadData(),
    config: { callbacks: {} },
    log: jest.fn(),
    getDownloadId: jest.fn(),
    getDownloadData: jest.fn(),
    generateOnWillDownload: jest.fn(() => async () => {
      config.onDownloadInit(new DownloadData());
    }),
    initSaveAsInteractiveDownload: jest.fn(),
    initNonInteractiveDownload: jest.fn(),
    generateItemOnUpdated: jest.fn(),
    generateItemOnDone: jest.fn(),
    cleanup: jest.fn(),
    updateProgress: jest.fn(),
  };

  return initator;
});
