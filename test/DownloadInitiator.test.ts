import { DownloadInitiator } from "../src";
import { createMockDownloadData } from "../src/__mocks__/DownloadData";

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

  beforeEach(() => {
    jest.clearAllMocks();

    // use the callbackDispatcher instead for evaluating the callbacks
    callbacks = {};
    mockWebContents = {};
    mockEvent = {};

    const mockedItemData = createMockDownloadData();

    mockItem = mockedItemData.item;
    mockDownloadData = mockedItemData.downloadData;
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
  });

  describe("initSaveAsInteractiveDownload", () => {
    it("handle if the download was cancelled by the user", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;

      mockItem.getSavePath.mockReturnValue("");
      mockDownloadData.isDownloadCancelled.mockReturnValue(true);

      await downloadInitiator.generateOnWillDownload({
        saveDialogOptions: {},
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      await jest.runAllTimersAsync();

      expect(downloadInitiator.callbackDispatcher.onDownloadCancelled).toHaveBeenCalled();
      expect(mockDownloadData.cancelledFromSaveAsDialog).toBe(true);
    });

    describe('user initiated pause', () => {
      it('should not resume the download if the user paused it before init', async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        mockItem['_userInitiatedPause'] = true;
        mockItem.getSavePath.mockReturnValue("");
        mockDownloadData.isDownloadCancelled.mockReturnValue(true);

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(mockItem.resume).not.toHaveBeenCalled();
      })

      it('should not resume the download if the did not pause before init', async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        mockItem['_userInitiatedPause'] = false;
        mockItem.getSavePath.mockReturnValue("");
        mockDownloadData.isDownloadCancelled.mockReturnValue(true);

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(mockItem.resume).toHaveBeenCalled();
      })
    })

    describe("path was set", () => {
      it("should call onDownloadStarted", async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;

        mockItem.getSavePath.mockReturnValue("/some/path");

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

        mockItem.getSavePath.mockReturnValue("/some/path");

        mockDownloadData.isDownloadCompleted.mockReturnValue(true);

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

      await downloadInitiator.generateOnWillDownload({
        saveAsFilename: "test.txt",
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      expect(mockItem.resolvedFilename).toBe("test.txt");
      expect(downloadInitiator.callbackDispatcher.onDownloadStarted).toHaveBeenCalled();
    });

    it("should not require saveAsFilename", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;

      await downloadInitiator.generateOnWillDownload({
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      expect(mockItem.resolvedFilename).toBe("example.txt");
      expect(downloadInitiator.callbackDispatcher.onDownloadStarted).toHaveBeenCalled();
    });

    describe('user initiated pause', () => {
      it('should not resume the download if the user paused it before init', async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        mockItem['_userInitiatedPause'] = true;

        await downloadInitiator.generateOnWillDownload({
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(mockItem.resume).not.toHaveBeenCalled();
      })

      it('should not resume the download if the did not pause before init', async () => {
        const downloadInitiator = new DownloadInitiator({});
        downloadInitiator.downloadData = mockDownloadData;
        mockItem['_userInitiatedPause'] = true;

        await downloadInitiator.generateOnWillDownload({
          callbacks,
        })(mockEvent, mockItem, mockWebContents);

        await jest.runAllTimersAsync();

        expect(mockItem.resume).toHaveBeenCalled();
      })
    })
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

    it.only("should handle interrupted state", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;
      downloadInitiator.callbackDispatcher.onDownloadInterrupted = jest.fn();
      downloadInitiator.cleanup = jest.fn();

      const itemOnDone = downloadInitiator.generateItemOnDone();

      await itemOnDone(mockEvent, "interrupted");

      expect(mockDownloadData.interruptedVia).toBe("completed");
      expect(downloadInitiator.callbackDispatcher.onDownloadInterrupted).toHaveBeenCalledWith(mockDownloadData);
    });
  });
});
