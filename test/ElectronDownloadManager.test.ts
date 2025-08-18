import { DownloadData, ElectronDownloadManager } from "../src";
import { createMockDownloadData } from "../src/__mocks__/DownloadData";

jest.mock("unused-filename");
jest.mock("../src/DownloadInitiator");

describe("ElectronDownloadManager", () => {
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

  it("should pause download and return restore data", () => {
    const { downloadData, item } = createMockDownloadData();
    const mockRestoreData = {
      id: downloadData.id,
      url: "https://example.com/test.txt",
      fileSaveAsPath: "/path/to/save",
      urlChain: ["https://example.com/test.txt"],
      mimeType: "text/plain",
      eTag: "etag123",
      receivedBytes: 500,
      totalBytes: 1000,
    };

    downloadData.getRestoreDownloadData.mockReturnValue(mockRestoreData);

    const downloadManager = new ElectronDownloadManager();
    downloadManager.downloadData = { [downloadData.id]: downloadData };

    const result = downloadManager.pauseDownload(downloadData.id);

    expect(downloadData.item.pause).toHaveBeenCalled();
    expect(result).toEqual(mockRestoreData);
  });

  it("should pause download and return undefined when download not found", () => {
    const downloadManager = new ElectronDownloadManager();

    const result = downloadManager.pauseDownload("non-existent-id");

    expect(result).toBeUndefined();
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

  it("should restore download when download is not registered", async () => {
    const downloadManager = new ElectronDownloadManager();
    const { item } = createMockDownloadData();
    const mockRestoreData = {
      id: "restore-id",
      url: "https://example.com/test.txt",
      fileSaveAsPath: "/path/to/save",
      urlChain: ["https://example.com/test.txt"],
      mimeType: "text/plain",
      eTag: "etag123",
      receivedBytes: 500,
      totalBytes: 1000,
    };

    const params = {
      window: {
        webContents: {
          session: {
            once: jest.fn().mockImplementation((event, handler) => {
              // Trigger the event handler manually with mock data
              const mockWebContents = {};
              handler(null, item, mockWebContents);
            }),
            createInterruptedDownload: jest.fn(),
          },
        },
      } as any,
      restoreData: mockRestoreData,
      callbacks: {} as any,
    };

    // Call restoreDownload which registers the event and triggers createInterruptedDownload
    const restorePromise = downloadManager.restoreDownload(params);

    // Jest tick to make sure all Promises have a chance to resolve
    await new Promise(process.nextTick);

    // Assert that the event listener for "will-download" has been added
    expect(params.window.webContents.session.once).toBeCalledWith("will-download", expect.any(Function));

    // Assert that createInterruptedDownload was called with the correct parameters
    expect(params.window.webContents.session.createInterruptedDownload).toBeCalledWith({
      path: mockRestoreData.fileSaveAsPath,
      urlChain: mockRestoreData.urlChain,
      mimeType: mockRestoreData.mimeType,
      eTag: mockRestoreData.eTag,
      offset: mockRestoreData.receivedBytes,
      length: mockRestoreData.totalBytes,
    });

    // Assert that the downloadId will be a string once the promise resolves
    await expect(restorePromise).resolves.toEqual(expect.any(String));
  });

  it("should call resumeDownload when download is already registered", async () => {
    const { downloadData, item } = createMockDownloadData();
    const downloadManager = new ElectronDownloadManager();

    // Add the download to the manager
    downloadManager.downloadData = { [downloadData.id]: downloadData };

    const mockRestoreData = {
      id: downloadData.id, // Use the same ID as the registered download
      url: "https://example.com/test.txt",
      fileSaveAsPath: "/path/to/save",
      urlChain: ["https://example.com/test.txt"],
      mimeType: "text/plain",
      eTag: "etag123",
      receivedBytes: 500,
      totalBytes: 1000,
    };

    const params = {
      window: {} as any,
      restoreData: mockRestoreData,
      callbacks: {} as any,
    };

    // Mock the resumeDownload method to verify it's called
    const resumeSpy = jest.spyOn(downloadManager, "resumeDownload");

    // Call restoreDownload which should call resumeDownload since download is already registered
    const result = downloadManager.restoreDownload(params);

    // Assert that resumeDownload was called with the correct ID
    expect(resumeSpy).toHaveBeenCalledWith(downloadData.id);

    // Since restoreDownload is async, it returns a Promise that resolves to the download ID
    // when it calls resumeDownload and returns early
    await expect(result).resolves.toBe(downloadData.id);
  });
});
