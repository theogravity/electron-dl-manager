import { vi } from 'vitest'
import { CallbackDispatcher } from "./CallbackDispatcher";
import { DownloadData } from "./DownloadData";

export const DownloadInitiator = vi.fn().mockImplementation((config) => {
  const initator = {
    logger: vi.fn(),
    onItemUpdated: vi.fn(),
    onItemDone: vi.fn(),
    onDownloadInit: vi.fn(),
    onCleanup: vi.fn(),
    callbackDispatcher: new CallbackDispatcher(),
    downloadData: new DownloadData(),
    config: {},
    log: vi.fn(),
    getDownloadId: vi.fn(),
    getDownloadData: vi.fn(),
    generateOnWillDownload: vi.fn(() => async () => {
      config.onDownloadInit(new DownloadData());
    }),
    initSaveAsInteractiveDownload: vi.fn(),
    initNonInteractiveDownload: vi.fn(),
    generateItemOnUpdated: vi.fn(),
    generateItemOnDone: vi.fn(),
    cleanup: vi.fn(),
    updateProgress: vi.fn(),
  };

  return initator;
});
