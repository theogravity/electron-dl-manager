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

    it("should not call the item updated event if the download was paused", async () => {
      const downloadInitiator = new DownloadInitiator({});
      downloadInitiator.downloadData = mockDownloadData;

      determineFilePath.mockReturnValueOnce("/some/path/test.txt");

      await downloadInitiator.generateOnWillDownload({
        callbacks,
      })(mockEvent, mockItem, mockWebContents);

      await jest.runAllTimersAsync();
      mockItem.pause();
      mockEmitter.emit("updated", "");

      expect(downloadInitiator.callbackDispatcher.onDownloadProgress).not.toHaveBeenCalled();
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
        mockItem.resume();
        mockEmitter.emit("updated", "", "progressing");

        expect(downloadInitiator.callbackDispatcher.onDownloadProgress).toHaveBeenCalled();
    })
  });
});
