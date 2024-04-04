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
});
