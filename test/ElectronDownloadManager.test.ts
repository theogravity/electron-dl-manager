import { DownloadData, ElectronDownloadManager } from "../src";
import { createMockDownloadData } from "../src/__mocks__/DownloadData";

jest.mock("unused-filename");
jest.mock("../src/DownloadInitiator");
jest.mock("../src/DownloadStateManager");

describe("ElectronDownloadManager", () => {
  describe("constructor", () => {
    it("should initialize with default settings", () => {
      const downloadManager = new ElectronDownloadManager();
      expect(downloadManager).toBeDefined();
      expect(downloadManager.enablePersistence).toBe(false);
    });

    it("should initialize with persistence enabled", () => {
      const downloadManager = new ElectronDownloadManager({
        enablePersistence: true,
        debugLogger: jest.fn(),
      });
      expect(downloadManager).toBeDefined();
      expect(downloadManager.enablePersistence).toBe(true);
    });
  });

  it("should get download data", () => {
    const downloadData = new DownloadData();
    const downloadManager = new ElectronDownloadManager();
    downloadManager.downloadData = { [downloadData.id]: downloadData };
    expect(downloadManager.getDownloadData(downloadData.id)).toBe(downloadData);
  });

  it("should cancel download", () => {
    const downloadData = createMockDownloadData().downloadData;

    const downloadManager = new ElectronDownloadManager();
    downloadManager.downloadData = { [downloadData.id]: downloadData };
    downloadManager.cancelDownload(downloadData.id);
    expect(downloadData.item.cancel).toHaveBeenCalled();
  });

  it("should pause download", () => {
    const downloadData = createMockDownloadData().downloadData;

    const downloadManager = new ElectronDownloadManager();
    downloadManager.downloadData = { [downloadData.id]: downloadData };
    downloadManager.pauseDownload(downloadData.id);
    expect(downloadData.item.pause).toHaveBeenCalled();
  });

  it("should resume download", () => {
    const { downloadData, item } = createMockDownloadData();

    item.isPaused.mockReturnValue(true);

    const downloadManager = new ElectronDownloadManager();

    downloadManager.downloadData = { [downloadData.id]: downloadData };
    downloadManager.resumeDownload(downloadData.id);

    expect(downloadData.item.resume).toHaveBeenCalled();
  });

  it("should get active download count", () => {
    const { downloadData: downloadData1 } = createMockDownloadData();

    downloadData1.isDownloadInProgress.mockReturnValue(true);

    const { downloadData: downloadData2 } = createMockDownloadData();

    downloadData2.isDownloadInProgress.mockReturnValue(false);

    const { downloadData: downloadData3 } = createMockDownloadData();

    downloadData3.isDownloadInProgress.mockReturnValue(true);

    const downloadManager = new ElectronDownloadManager();

    downloadManager.downloadData = {
      [downloadData1.id]: downloadData1,
      [downloadData2.id]: downloadData2,
      [downloadData3.id]: downloadData3,
    };

    expect(downloadManager.getActiveDownloadCount()).toBe(2);
  });

  it("should download a file", async () => {
    const downloadManager = new ElectronDownloadManager();
    const { item } = createMockDownloadData();

    const params = {
      url: "https://example.com/test.txt",
      saveAsFilename: "test.txt",
      window: {
        webContents: {
          session: {
            once: jest.fn().mockImplementation((event, handler) => {
              // Trigger the event handler manually with mock data
              const mockWebContents = {};
              handler(null, item, mockWebContents);
            }),
          },
          downloadURL: jest.fn(),
        },
      } as any,
      callbacks: {} as any,
    };

    // Call download which registers the event and triggers downloadURL
    const downloadPromise = downloadManager.download(params);

    // Jest tick to make sure all Promises have a chance to resolve
    await new Promise(process.nextTick);

    // Assert that the event listener for "will-download" has been added
    expect(params.window.webContents.session.once).toBeCalledWith("will-download", expect.any(Function));

    // Assert that downloadURL was called with the correct parameters
    expect(params.window.webContents.downloadURL).toBeCalledWith(params.url, undefined);

    // Assert that the downloadId will be a string once the promise resolves
    await expect(downloadPromise).resolves.toEqual(expect.any(String));
  });

  describe("persistence features", () => {
    let mockDownloadStateManager;

    beforeEach(() => {
      mockDownloadStateManager = {
        getAllDownloadStates: jest.fn(),
        removeDownloadState: jest.fn(),
        updateDownloadState: jest.fn(),
        saveDownloadState: jest.fn(),
        clearAllDownloadStates: jest.fn(),
      };
    });

    describe("download with persistence config", () => {
      it("should require persistenceConfig when persistence is enabled", async () => {
        const downloadManager = new ElectronDownloadManager({
          enablePersistence: true,
        });

        const params = {
          url: "https://example.com/test.txt",
          window: {
            webContents: {
              session: { once: jest.fn() },
              downloadURL: jest.fn(),
            },
          } as any,
          callbacks: {} as any,
        };

        await expect(downloadManager.download(params)).rejects.toThrow(
          "persistenceConfig is required when persistence is enabled"
        );
      });

      it("should handle persistence config with restorePreviousDownload", async () => {
        const downloadManager = new ElectronDownloadManager({
          enablePersistence: true,
        });

        // Mock the downloadStateManager
        downloadManager.downloadStateManager = mockDownloadStateManager;

        const { item } = createMockDownloadData();

        const params = {
          url: "https://example.com/test.txt",
          persistenceConfig: {
            restorePreviousDownload: true,
          },
          window: {
            webContents: {
              session: {
                once: jest.fn().mockImplementation((event, handler) => {
                  const mockWebContents = {};
                  handler(null, item, mockWebContents);
                }),
              },
              downloadURL: jest.fn(),
            },
          } as any,
          callbacks: {} as any,
        };

        const downloadPromise = downloadManager.download(params);
        await new Promise(process.nextTick);

        await expect(downloadPromise).resolves.toEqual(expect.any(String));
      });
    });

    describe("restoreInterruptedDownloads", () => {
      it("should throw error when persistence is not enabled", async () => {
        const downloadManager = new ElectronDownloadManager();

        await expect(downloadManager.restoreInterruptedDownloads()).rejects.toThrow(
          "Persistence is not enabled"
        );
      });

      it("should return interrupted download IDs when persistence is enabled", async () => {
        const downloadManager = new ElectronDownloadManager({
          enablePersistence: true,
        });

        const mockStates = [
          { id: 'download1', status: 'downloading', fileName: 'file1.txt' },
          { id: 'download2', status: 'completed', fileName: 'file2.txt' },
          { id: 'download3', status: 'interrupted', fileName: 'file3.txt' },
          { id: 'download4', status: 'paused', fileName: 'file4.txt' },
        ];

        downloadManager.downloadStateManager = mockDownloadStateManager;
        mockDownloadStateManager.getAllDownloadStates.mockReturnValue(mockStates);

        const result = await downloadManager.restoreInterruptedDownloads();

        expect(result).toEqual(['download1', 'download3', 'download4']);
        expect(mockDownloadStateManager.getAllDownloadStates).toHaveBeenCalled();
      });

      it("should return empty array when no interrupted downloads", async () => {
        const downloadManager = new ElectronDownloadManager({
          enablePersistence: true,
        });

        downloadManager.downloadStateManager = mockDownloadStateManager;
        mockDownloadStateManager.getAllDownloadStates.mockReturnValue([
          { id: 'download1', status: 'completed', fileName: 'file1.txt' },
        ]);

        const result = await downloadManager.restoreInterruptedDownloads();

        expect(result).toEqual([]);
      });
    });

    describe("clearPersistedStates", () => {
      it("should throw error when persistence is not enabled", () => {
        const downloadManager = new ElectronDownloadManager();

        expect(() => downloadManager.clearPersistedStates()).toThrow(
          "Persistence is not enabled"
        );
      });

      it("should clear all persisted states when persistence is enabled", () => {
        const downloadManager = new ElectronDownloadManager({
          enablePersistence: true,
        });

        downloadManager.downloadStateManager = mockDownloadStateManager;

        downloadManager.clearPersistedStates();

        expect(mockDownloadStateManager.clearAllDownloadStates).toHaveBeenCalled();
      });
    });

    describe("persistence lifecycle", () => {
      let downloadManager;

      beforeEach(() => {
        downloadManager = new ElectronDownloadManager({
          enablePersistence: true,
        });
        downloadManager.downloadStateManager = mockDownloadStateManager;
      });

      it("should update persisted state on cancel", () => {
        const downloadData = createMockDownloadData().downloadData;
        downloadManager.downloadData = { [downloadData.id]: downloadData };
        downloadManager.updatePersistedState = jest.fn();

        downloadManager.cancelDownload(downloadData.id);

        expect(downloadData.item.cancel).toHaveBeenCalled();
        expect(downloadManager.updatePersistedState).toHaveBeenCalledWith(
          downloadData,
          { status: 'cancelled' }
        );
      });

      it("should update persisted state on pause", () => {
        const downloadData = createMockDownloadData().downloadData;
        downloadManager.downloadData = { [downloadData.id]: downloadData };
        downloadManager.updatePersistedState = jest.fn();

        downloadManager.pauseDownload(downloadData.id);

        expect(downloadData.item.pause).toHaveBeenCalled();
        expect(downloadManager.updatePersistedState).toHaveBeenCalledWith(
          downloadData,
          { status: 'paused' }
        );
      });

      it("should update persisted state on resume", () => {
        const { downloadData, item } = createMockDownloadData();
        item.isPaused.mockReturnValue(true);
        downloadManager.downloadData = { [downloadData.id]: downloadData };
        downloadManager.updatePersistedState = jest.fn();

        downloadManager.resumeDownload(downloadData.id);

        expect(downloadData.item.resume).toHaveBeenCalled();
        expect(downloadManager.updatePersistedState).toHaveBeenCalledWith(
          downloadData,
          { status: 'downloading' }
        );
      });
    });
  });
});
