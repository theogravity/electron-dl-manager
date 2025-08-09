import { DownloadInitiator, getFilenameFromMime } from "../src";
import { createMockDownloadData } from "../src/__mocks__/DownloadData";
import { determineFilePath } from "../src/utils";
import path from "node:path";
import UnusedFilename from "unused-filename";

jest.mock("../src/utils");
jest.mock("../src/CallbackDispatcher");
jest.mock("unused-filename");
jest.mock("electron");
jest.useFakeTimers();

describe("DownloadInitiator", () => {
  let callbacks;
  let mockItem;
  let mockDownloadData;
  let mockWebContents;
  let mockEvent;
  let mockEmitter;

  beforeEach(() => {
    jest.clearAllMocks();

    // use the callbackDispatcher instead for evaluating the callbacks
    callbacks = {};
    mockWebContents = {};
    mockEvent = {};

    const mockedItemData = createMockDownloadData();

    mockItem = mockedItemData.item;
    mockDownloadData = mockedItemData.downloadData;
    mockEmitter = mockedItemData.itemEmitter;
  });

  describe("generateOnWillDownload", () => {
    it("should initiate an interactive download", () => {
      const downloadInitiator = new DownloadInitiator({});

      downloadInitiator.initSaveAsInteractiveDownload = jest.fn();

      downloadInitiator.generateOnWillDownload({
        callbacks,
        saveDialogOptions: {
          title: "Save File",
        },
      })(mockEvent, mockItem, mockWebContents);

      expect(downloadInitiator.initSaveAsInteractiveDownload).toHaveBeenCalled();
    });

    it("should initiate an non-interactive download", () => {
      const downloadInitiator = new DownloadInitiator({});

      downloadInitiator.initNonInteractiveDownload = jest.fn();

      downloadInitiator.generateOnWillDownload({
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      // @ts-ignore TS2445
      expect(downloadInitiator.initNonInteractiveDownload).toHaveBeenCalled();
    });

    describe("with persistence and restorePreviousDownload", () => {
      let mockDownloadStateManager;

      beforeEach(() => {
        mockDownloadStateManager = {
          findPreviousDownloadState: jest.fn(),
        };
      });

      it("should restore previous download when found", async () => {
        const mockPreviousState = {
          id: 'existing-download-id',
          filePath: '/path/to/previous/file.txt',
          urlChain: ['https://example.com/file.txt'],
          mimeType: 'text/plain',
          etag: 'test-etag',
          receivedBytes: 500,
          totalBytes: 1000,
        };

        mockDownloadStateManager.findPreviousDownloadState.mockReturnValue(mockPreviousState);
        mockItem.cancel = jest.fn();
        mockItem.setSavePath = jest.fn();

        const mockSession = {
          once: jest.fn(),
          createInterruptedDownload: jest.fn(),
        };
        mockWebContents.session = mockSession;

        const downloadInitiator = new DownloadInitiator({
          restorePreviousDownload: true,
          downloadStateManager: mockDownloadStateManager,
        });

        downloadInitiator.generateOnWillDownloadRestored = jest.fn().mockReturnValue(jest.fn());

        await downloadInitiator.generateOnWillDownload({
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        expect(mockDownloadStateManager.findPreviousDownloadState).toHaveBeenCalledWith(mockItem);
        expect(mockItem.cancel).toHaveBeenCalled();
        expect(mockItem.setSavePath).toHaveBeenCalledWith(mockPreviousState.filePath);
        expect(mockSession.once).toHaveBeenCalledWith("will-download", expect.any(Function));
        expect(mockSession.createInterruptedDownload).toHaveBeenCalledWith({
          path: mockPreviousState.filePath,
          urlChain: mockPreviousState.urlChain,
          mimeType: mockPreviousState.mimeType,
          eTag: mockPreviousState.etag,
          offset: mockPreviousState.receivedBytes,
          length: mockPreviousState.totalBytes,
        });
        expect(downloadInitiator.downloadData.id).toBe(mockPreviousState.id);
        expect(downloadInitiator.downloadData.resolvedFilename).toBe(mockPreviousState.filePath);
      });

      it("should proceed with normal download when no previous download found", async () => {
        mockDownloadStateManager.findPreviousDownloadState.mockReturnValue(undefined);

        const downloadInitiator = new DownloadInitiator({
          restorePreviousDownload: true,
          downloadStateManager: mockDownloadStateManager,
          onDownloadInit: jest.fn(),
        });

        downloadInitiator.initNonInteractiveDownload = jest.fn();

        await downloadInitiator.generateOnWillDownload({
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        expect(mockDownloadStateManager.findPreviousDownloadState).toHaveBeenCalledWith(mockItem);
        expect(downloadInitiator.onDownloadInit).toHaveBeenCalled();
        expect(downloadInitiator.initNonInteractiveDownload).toHaveBeenCalled();
      });

      it("should handle createInterruptedDownload errors gracefully", async () => {
        const mockPreviousState = {
          id: 'existing-download-id',
          filePath: '/path/to/previous/file.txt',
          urlChain: ['https://example.com/file.txt'],
          mimeType: 'text/plain',
          etag: 'test-etag',
          receivedBytes: 500,
          totalBytes: 1000,
        };

        mockDownloadStateManager.findPreviousDownloadState.mockReturnValue(mockPreviousState);
        
        const mockSession = {
          once: jest.fn(),
          createInterruptedDownload: jest.fn().mockImplementation(() => {
            throw new Error('Creation failed');
          }),
        };
        mockWebContents.session = mockSession;

        const downloadInitiator = new DownloadInitiator({
          restorePreviousDownload: true,
          downloadStateManager: mockDownloadStateManager,
        });

        // Should not throw - error should be handled gracefully
        await expect(downloadInitiator.generateOnWillDownload({
          callbacks,
        })(mockEvent, mockItem, mockWebContents)).resolves.not.toThrow();
      });
    });
  });

  describe("generateOnWillDownloadRestored", () => {
    it("should handle restored download", async () => {
      const downloadInitiator = new DownloadInitiator({});
      
      downloadInitiator.onDownloadRestored = jest.fn();
      downloadInitiator.initRestoreDownload = jest.fn();

      const restoredHandler = downloadInitiator.generateOnWillDownloadRestored({
        callbacks,
      });

      await restoredHandler(mockEvent, mockItem, mockWebContents);

      expect(downloadInitiator.downloadData.item).toBe(mockItem);
      expect(downloadInitiator.onDownloadRestored).toHaveBeenCalledWith(downloadInitiator.downloadData);
      expect(downloadInitiator.initRestoreDownload).toHaveBeenCalled();
    });
  });

  describe("initSaveAsInteractiveDownload", () => {
    it("handle if the download was cancelled by the user", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;

      mockItem.getSavePath.mockReturnValueOnce("");
      mockDownloadData.isDownloadCancelled.mockReturnValueOnce(true);

      await downloadInitiator.generateOnWillDownload({
        saveDialogOptions: {},
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      await jest.runAllTimersAsync();

      expect(downloadInitiator.callbackDispatcher.onDownloadCancelled).toHaveBeenCalled();
      expect(mockDownloadData.cancelledFromSaveAsDialog).toBe(true);
    });

    describe("user initiated pause", () => {
      it("should not resume the download if the user paused it before init", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        mockItem["_userInitiatedPause"] = true;
        mockItem.getSavePath.mockReturnValueOnce("");
        mockDownloadData.isDownloadCancelled.mockReturnValueOnce(true);

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(mockItem.resume).not.toHaveBeenCalled();
      });

      it("should resume the download if the user *did not* pause before init", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        determineFilePath.mockReturnValueOnce("/some/path");

        mockItem["_userInitiatedPause"] = false;
        mockItem.getSavePath.mockReturnValueOnce("/some/path");

        const resumeSpy = jest.spyOn(mockItem, "resume");

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(resumeSpy).toHaveBeenCalled();
      });
    });

    describe("path was set", () => {
      it("should call onDownloadStarted", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        mockItem.getSavePath.mockReturnValueOnce("/some/path");

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(downloadInitiator.callbackDispatcher.onDownloadStarted).toHaveBeenCalled();
      });

      it("should handle if the download was completed too quickly", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        mockItem.getSavePath.mockReturnValueOnce("/some/path");

        mockDownloadData.isDownloadCompleted.mockReturnValueOnce(true);

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(downloadInitiator.callbackDispatcher.onDownloadCompleted).toHaveBeenCalled();
      });
    });
  });

  describe("initNonInteractiveDownload", () => {
    it("should call onDownloadStarted", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;

      determineFilePath.mockReturnValueOnce("/some/path/test.txt");

      await downloadInitiator.generateOnWillDownload({
        saveAsFilename: "test.txt",
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      expect(downloadInitiator.getDownloadData().resolvedFilename).toBe("test.txt");
      expect(downloadInitiator.callbackDispatcher.onDownloadStarted).toHaveBeenCalled();
    });

    describe("user initiated pause", () => {
      it("should not resume the download if the user paused it before init", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        mockItem["_userInitiatedPause"] = true;

        determineFilePath.mockReturnValueOnce("/some/path/test.txt");

        await downloadInitiator.generateOnWillDownload({
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        const resumeSpy = jest.spyOn(mockItem, "resume");

        await jest.runAllTimersAsync();

        expect(resumeSpy).not.toHaveBeenCalled();
      });

      it("should resume the download if the *did not* pause before init", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        mockItem["_userInitiatedPause"] = true;

        determineFilePath.mockReturnValueOnce("/some/path/test.txt");
        const resumeSpy = jest.spyOn(mockItem, "resume");

        await downloadInitiator.generateOnWillDownload({
          callbacks,
          directory: "/some/path",
          saveAsFilename: "test.txt",
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(resumeSpy).toHaveBeenCalled();
      });
    });
  });

  describe("event handlers", () => {
    describe("itemOnUpdated", () => {
      it("should handle progressing state", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        downloadInitiator.callbackDispatcher.onDownloadProgress = jest.fn();
        downloadInitiator.updateProgress = jest.fn();

        const itemOnUpdated = downloadInitiator.generateItemOnUpdated();

        await itemOnUpdated(mockEvent, "progressing");

        expect(downloadInitiator.updateProgress).toHaveBeenCalled();
        expect(downloadInitiator.callbackDispatcher.onDownloadProgress).toHaveBeenCalledWith(mockDownloadData);
      });

      it("should handle interrupted state", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        downloadInitiator.callbackDispatcher.onDownloadInterrupted = jest.fn();

        const itemOnUpdated = downloadInitiator.generateItemOnUpdated();

        await itemOnUpdated(mockEvent, "interrupted");

        expect(mockDownloadData.interruptedVia).toBe("in-progress");
        expect(downloadInitiator.callbackDispatcher.onDownloadInterrupted).toHaveBeenCalledWith(mockDownloadData);
      });
    });

    describe("itemOnDone", () => {
      it("should handle completed state", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        downloadInitiator.callbackDispatcher.onDownloadCompleted = jest.fn();
        downloadInitiator.cleanup = jest.fn();

        const itemOnDone = downloadInitiator.generateItemOnDone();

        await itemOnDone(mockEvent, "completed");

        expect(downloadInitiator.callbackDispatcher.onDownloadCompleted).toHaveBeenCalledWith(mockDownloadData);
        expect(downloadInitiator.cleanup).toHaveBeenCalled();
      });
    });

    it("should handle cancelled state", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;
      downloadInitiator.callbackDispatcher.onDownloadCancelled = jest.fn();
      downloadInitiator.cleanup = jest.fn();

      const itemOnDone = downloadInitiator.generateItemOnDone();

      await itemOnDone(mockEvent, "cancelled");

      expect(downloadInitiator.callbackDispatcher.onDownloadCancelled).toHaveBeenCalledWith(mockDownloadData);
      expect(downloadInitiator.cleanup).toHaveBeenCalled();
    });

    it("should handle interrupted state", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;
      downloadInitiator.callbackDispatcher.onDownloadInterrupted = jest.fn();
      downloadInitiator.cleanup = jest.fn();

      const itemOnDone = downloadInitiator.generateItemOnDone();

      await itemOnDone(mockEvent, "interrupted");

      expect(mockDownloadData.interruptedVia).toBe("completed");
      expect(downloadInitiator.callbackDispatcher.onDownloadInterrupted).toHaveBeenCalledWith(mockDownloadData);
    });

    it("should call the item updated event if the download was paused and resumed", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;
      downloadInitiator.updateProgress = jest.fn();

      determineFilePath.mockReturnValueOnce("/some/path/test.txt");

      await downloadInitiator.generateOnWillDownload({
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      await jest.runAllTimersAsync();

      mockItem.pause();
      mockEmitter.emit("updated", "", "progressing");
      expect(downloadInitiator.callbackDispatcher.onDownloadProgress).not.toHaveBeenCalled();

      mockItem.resume();
      mockEmitter.emit("updated", "", "progressing");
      expect(downloadInitiator.callbackDispatcher.onDownloadProgress).toHaveBeenCalled();
    });
  });
});
