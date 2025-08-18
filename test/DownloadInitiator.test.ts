import { DownloadInitiator, getFilenameFromMime } from "../src";
import { createMockDownloadData } from "../src/__mocks__/DownloadData";
import { determineFilePath } from "../src/utils";
import path from "node:path";
import UnusedFilename from "unused-filename";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../src/utils");
vi.mock("../src/CallbackDispatcher");
vi.mock("unused-filename");
vi.mock("electron");
vi.useFakeTimers();

describe("DownloadInitiator", () => {
  let callbacks;
  let mockItem;
  let mockDownloadData;
  let mockWebContents;
  let mockEvent;
  let mockEmitter;

  beforeEach(() => {
    vi.clearAllMocks();

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
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });

      downloadInitiator.initSaveAsInteractiveDownload = vi.fn();

      downloadInitiator.generateOnWillDownload({
        saveDialogOptions: {
          title: "Save File",
        },
      })(mockEvent, mockItem, mockWebContents);

      expect(downloadInitiator.initSaveAsInteractiveDownload).toHaveBeenCalled();
    });

    it("should initiate an non-interactive download", () => {
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });

      downloadInitiator.initNonInteractiveDownload = vi.fn();

      downloadInitiator.generateOnWillDownload({})(mockEvent, mockItem, mockWebContents);

      // @ts-ignore TS2445
      expect(downloadInitiator.initNonInteractiveDownload).toHaveBeenCalled();
    });
  });

  describe("initSaveAsInteractiveDownload", () => {
    it("handle if the download was cancelled by the user", async () => {
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });
      // @ts-ignore - accessing private property for testing
      downloadInitiator.downloadData = mockDownloadData;

      mockItem.getSavePath.mockReturnValueOnce("");
      mockDownloadData.isDownloadCancelled.mockReturnValueOnce(true);

      await downloadInitiator.generateOnWillDownload({
        saveDialogOptions: {},
      })(mockEvent, mockItem, mockWebContents);

      await vi.runAllTimersAsync();

      // @ts-ignore - accessing private property for testing
      expect(downloadInitiator.callbackDispatcher.onDownloadCancelled).toHaveBeenCalled();
      expect(mockDownloadData.cancelledFromSaveAsDialog).toBe(true);
    });

    describe("user initiated pause", () => {
      it("should not resume the download if the user paused it before init", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;

        mockItem["_userInitiatedPause"] = true;
        mockItem.getSavePath.mockReturnValueOnce("");
        mockDownloadData.isDownloadCancelled.mockReturnValueOnce(true);

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
        })(mockEvent, mockItem, mockWebContents);

        await vi.runAllTimersAsync();

        expect(mockItem.resume).not.toHaveBeenCalled();
      });

      it("should resume the download if the user *did not* pause before init", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;

        determineFilePath.mockReturnValueOnce("/some/path");

        mockItem["_userInitiatedPause"] = false;
        mockItem.getSavePath.mockReturnValueOnce("/some/path");

        const resumeSpy = vi.spyOn(mockItem, "resume");

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
        })(mockEvent, mockItem, mockWebContents);

        await vi.runAllTimersAsync();

        expect(resumeSpy).toHaveBeenCalled();
      });
    });

    describe("path was set", () => {
      it("should call onDownloadStarted", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;

        mockItem.getSavePath.mockReturnValueOnce("/some/path");

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
        })(mockEvent, mockItem, mockWebContents);

        await vi.runAllTimersAsync();

        // @ts-ignore - accessing private property for testing
        expect(downloadInitiator.callbackDispatcher.onDownloadStarted).toHaveBeenCalled();
      });

      it("should handle if the download was completed too quickly", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;

        mockItem.getSavePath.mockReturnValueOnce("/some/path");

        mockDownloadData.isDownloadCompleted.mockReturnValueOnce(true);

        await downloadInitiator.generateOnWillDownload({
          saveDialogOptions: {},
        })(mockEvent, mockItem, mockWebContents);

        await vi.runAllTimersAsync();

        // @ts-ignore - accessing private property for testing
        expect(downloadInitiator.callbackDispatcher.onDownloadCompleted).toHaveBeenCalled();
      });
    });
  });

  describe("initNonInteractiveDownload", () => {
    it("should call onDownloadStarted", async () => {
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });
      // @ts-ignore - accessing private property for testing
      downloadInitiator.downloadData = mockDownloadData;

      determineFilePath.mockReturnValueOnce("/some/path/test.txt");

      await downloadInitiator.generateOnWillDownload({
        saveAsFilename: "test.txt",
      })(mockEvent, mockItem, mockWebContents);

      expect(downloadInitiator.getDownloadData().resolvedFilename).toBe("test.txt");
      // @ts-ignore - accessing private property for testing
      expect(downloadInitiator.callbackDispatcher.onDownloadStarted).toHaveBeenCalled();
    });

    describe("user initiated pause", () => {
      it("should not resume the download if the user paused it before init", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;
        mockItem["_userInitiatedPause"] = true;

        determineFilePath.mockReturnValueOnce("/some/path/test.txt");

        await downloadInitiator.generateOnWillDownload({})(mockEvent, mockItem, mockWebContents);

        const resumeSpy = vi.spyOn(mockItem, "resume");

        await vi.runAllTimersAsync();

        expect(resumeSpy).not.toHaveBeenCalled();
      });

      it("should resume the download if the *did not* pause before init", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;
        mockItem["_userInitiatedPause"] = true;

        determineFilePath.mockReturnValueOnce("/some/path/test.txt");
        const resumeSpy = vi.spyOn(mockItem, "resume");

        await downloadInitiator.generateOnWillDownload({
          directory: "/some/path",
          saveAsFilename: "test.txt",
        })(mockEvent, mockItem, mockWebContents);

        await vi.runAllTimersAsync();

        expect(resumeSpy).toHaveBeenCalled();
      });
    });
  });

  describe("event handlers", () => {
    describe("itemOnUpdated", () => {
      it("should handle progressing state", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;
        // @ts-ignore - accessing private property for testing
        downloadInitiator.callbackDispatcher.onDownloadProgress = vi.fn();
        downloadInitiator.updateProgress = vi.fn();

        const itemOnUpdated = downloadInitiator.generateItemOnUpdated();

        await itemOnUpdated(mockEvent, "progressing");

        expect(downloadInitiator.updateProgress).toHaveBeenCalled();
        // @ts-ignore - accessing private property for testing
        expect(downloadInitiator.callbackDispatcher.onDownloadProgress).toHaveBeenCalledWith(mockDownloadData);
      });

      it("should handle interrupted state", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;
        // @ts-ignore - accessing private property for testing
        downloadInitiator.callbackDispatcher.onDownloadInterrupted = vi.fn();

        const itemOnUpdated = downloadInitiator.generateItemOnUpdated();

        await itemOnUpdated(mockEvent, "interrupted");

        expect(mockDownloadData.interruptedVia).toBe("in-progress");
        // @ts-ignore - accessing private property for testing
        expect(downloadInitiator.callbackDispatcher.onDownloadInterrupted).toHaveBeenCalledWith(mockDownloadData);
      });
    });

    describe("itemOnDone", () => {
      it("should handle completed state", async () => {
        const downloadInitiator = new DownloadInitiator({
          callbacks,
        });
        // @ts-ignore - accessing private property for testing
        downloadInitiator.downloadData = mockDownloadData;
        // @ts-ignore - accessing private property for testing
        downloadInitiator.callbackDispatcher.onDownloadCompleted = vi.fn();
        downloadInitiator.cleanup = vi.fn();

        const itemOnDone = downloadInitiator.generateItemOnDone();

        await itemOnDone(mockEvent, "completed");

        // @ts-ignore - accessing private property for testing
        expect(downloadInitiator.callbackDispatcher.onDownloadCompleted).toHaveBeenCalledWith(mockDownloadData);
        expect(downloadInitiator.cleanup).toHaveBeenCalled();
      });
    });

    it("should handle cancelled state", async () => {
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });
      // @ts-ignore - accessing private property for testing
      downloadInitiator.downloadData = mockDownloadData;
      // @ts-ignore - accessing private property for testing
      downloadInitiator.callbackDispatcher.onDownloadCancelled = vi.fn();
      downloadInitiator.cleanup = vi.fn();

      const itemOnDone = downloadInitiator.generateItemOnDone();

      await itemOnDone(mockEvent, "cancelled");

      // @ts-ignore - accessing private property for testing
      expect(downloadInitiator.callbackDispatcher.onDownloadCancelled).toHaveBeenCalledWith(mockDownloadData);
      expect(downloadInitiator.cleanup).toHaveBeenCalled();
    });

    it("should handle interrupted state", async () => {
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });
      // @ts-ignore - accessing private property for testing
      downloadInitiator.downloadData = mockDownloadData;
      // @ts-ignore - accessing private property for testing
      downloadInitiator.callbackDispatcher.onDownloadInterrupted = vi.fn();
      downloadInitiator.cleanup = vi.fn();

      const itemOnDone = downloadInitiator.generateItemOnDone();

      await itemOnDone(mockEvent, "interrupted");

      expect(mockDownloadData.interruptedVia).toBe("completed");
      // @ts-ignore - accessing private property for testing
      expect(downloadInitiator.callbackDispatcher.onDownloadInterrupted).toHaveBeenCalledWith(mockDownloadData);
    });

    it("should call the item updated event if the download was paused and resumed", async () => {
      const downloadInitiator = new DownloadInitiator({
        callbacks,
      });
      // @ts-ignore - accessing private property for testing
      downloadInitiator.downloadData = mockDownloadData;
      downloadInitiator.updateProgress = vi.fn();

      determineFilePath.mockReturnValueOnce("/some/path/test.txt");

      await downloadInitiator.generateOnWillDownload({})(mockEvent, mockItem, mockWebContents);

      await vi.runAllTimersAsync();

      mockItem.pause();
      mockEmitter.emit("updated", "", "progressing");
      // @ts-ignore - accessing private property for testing
      expect(downloadInitiator.callbackDispatcher.onDownloadProgress).not.toHaveBeenCalled();

      mockItem.resume();
      mockEmitter.emit("updated", "", "progressing");
      // @ts-ignore - accessing private property for testing
      expect(downloadInitiator.callbackDispatcher.onDownloadProgress).toHaveBeenCalled();
    });
  });
});
