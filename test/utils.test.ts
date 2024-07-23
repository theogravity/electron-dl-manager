import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DownloadItem } from "electron";
import {
  calculateDownloadMetrics,
  determineFilePath,
  generateRandomId,
  getFilenameFromMime,
  truncateUrl,
} from "../src/utils";
import { createMockDownloadData } from "../src/__mocks__/DownloadData";

jest.mock("electron");

let mockedItemData;

beforeEach(() => {
  jest.clearAllMocks();
  mockedItemData = createMockDownloadData().item;
});

describe("truncateUrl", () => {
  test("it should truncate URL if longer than 50 characters", () => {
    const url = "https://www.example.com/this/is/a/very/long/url/which/needs/truncation/to/maintain/50/characters";
    expect(truncateUrl(url)).toEqual("https://www.example.com/this/is/a/very/long/url/wh...");
  });

  test("it should not truncate URL if already 50 characters or less", () => {
    const url = "https://www.example.com/short-url";
    expect(truncateUrl(url)).toEqual(url);
  });
});

describe("generateRandomId", () => {
  test("it should generate a random ID of length 6", () => {
    const randomId = generateRandomId();
    expect(randomId).toHaveLength(6);
  });
});

describe("getFilenameFromMime", () => {
  test("it should return the name appended with extension if there is a supported mime type", () => {
    const name = "test";
    const mime = "application/pdf";
    expect(getFilenameFromMime(name, mime)).toEqual("test.pdf");
  });

  test("it should return the original name there is no extension associated with the mime type", () => {
    const name = "test";
    const mime = "";
    expect(getFilenameFromMime(name, mime)).toEqual(name);
  });
});

describe("determineFilePath", () => {
  test("it should return a valid file path with provided saveAsFilename", () => {
    const downloadDir = "/tmp/downloads";
    const saveAsFilename = "myFile.txt";
    const item = { getFilename: () => "example.txt", getMimeType: () => "text/plain" } as DownloadItem;
    const result = determineFilePath({ directory: downloadDir, saveAsFilename, item });

    expect(result).toEqual("/tmp/downloads/myFile.txt");
  });

  test("it should return a valid file path with overwrite option set to true", () => {
    const downloadDir = "/tmp/downloads";
    const item = { getFilename: () => "example.txt", getMimeType: () => "text/plain" } as DownloadItem;
    const result = determineFilePath({ directory: downloadDir, item, overwrite: true });

    expect(result).toEqual("/tmp/downloads/example.txt");
  });

  test("it should generate a unique filename when saveAsFilename is not provided and overwrite is false", async () => {
    const downloadDir = "/tmp";
    const item = { getFilename: () => "example.txt", getMimeType: () => "text/plain" } as DownloadItem;

    // @todo: mock the file system
    // Tried using memfs and mock-fs without success
    await writeFile(path.join(downloadDir, item.getFilename()), "test", {
      flag: "w",
      encoding: "utf-8",
    });

    const result = determineFilePath({ directory: downloadDir, item });

    expect(result).toEqual("/tmp/example (1).txt");
  });

  test("it should throw an error when directory is provided but is not an absolute path", () => {
    const invalidDirectory = "downloads";
    const item = { getFilename: () => "example.txt", getMimeType: () => "text/plain" } as DownloadItem;

    expect(() => determineFilePath({ directory: invalidDirectory, item })).toThrow(
      Error("The `directory` option must be an absolute path"),
    );
  });
});

describe("calculateDownloadMetrics", () => {
  const mockStartTimeSecs = 1000;

  beforeAll(() => {
    jest.spyOn(global, "Date").mockImplementation(() => {
      return {
        // // Mock current time (in ms) 1000 seconds after the start time
        getTime: () => 2000 * mockStartTimeSecs,
      } as unknown as Date;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("calculates the download metrics correctly for positive elapsed time", () => {
    mockedItemData.getReceivedBytes.mockReturnValue(1000);
    mockedItemData.getTotalBytes.mockReturnValue(5000);
    mockedItemData.getStartTime.mockReturnValue(mockStartTimeSecs);

    mockedItemData["getCurrentBytesPerSecond"] = undefined;
    mockedItemData["getPercentComplete"] = undefined;

    const result = calculateDownloadMetrics(mockedItemData);

    expect(result).toEqual({
      percentCompleted: 20,
      downloadRateBytesPerSecond: 1,
      estimatedTimeRemainingSeconds: 4000, // 4000 bytes remaining at 1 byte/second
    });
  });

  it("calculates zero download rate and estimated time if no time has elapsed", () => {
    const startTimeWithNoElapsedTime = 2000; // Mock current time is the same as start time
    mockedItemData.getReceivedBytes.mockReturnValue(0);
    mockedItemData.getTotalBytes.mockReturnValue(5000);
    mockedItemData.getStartTime.mockReturnValue(startTimeWithNoElapsedTime);

    mockedItemData["getCurrentBytesPerSecond"] = undefined;
    mockedItemData["getPercentComplete"] = undefined;

    const result = calculateDownloadMetrics(mockedItemData);

    expect(result).toEqual({
      percentCompleted: 0,
      downloadRateBytesPerSecond: 0,
      estimatedTimeRemainingSeconds: 0,
    });
  });

  it("does not exceed 100% completion", () => {
    mockedItemData.getReceivedBytes.mockReturnValue(5000);
    mockedItemData.getTotalBytes.mockReturnValue(2000);
    mockedItemData.getStartTime.mockReturnValue(mockStartTimeSecs);

    mockedItemData["getCurrentBytesPerSecond"] = undefined;
    mockedItemData["getPercentComplete"] = undefined;

    const result = calculateDownloadMetrics(mockedItemData);

    expect(result.percentCompleted).toBe(100);
  });

  it("handles zero totalBytes without errors and returns zero for percentCompleted", () => {
    mockedItemData.getReceivedBytes.mockReturnValue(1000);
    mockedItemData.getTotalBytes.mockReturnValue(0);
    mockedItemData.getStartTime.mockReturnValue(mockStartTimeSecs);

    mockedItemData["getCurrentBytesPerSecond"] = undefined;
    mockedItemData["getPercentComplete"] = undefined;

    const result = calculateDownloadMetrics(mockedItemData);

    expect(result.percentCompleted).toBe(0);
  });

  describe("with getCurrentBytesPerSecond and getPercentComplete", () => {
    it("calculates the download metrics correctly for positive elapsed time", () => {
      mockedItemData.getCurrentBytesPerSecond.mockReturnValue(999);
      mockedItemData.getPercentComplete.mockReturnValue(99);

      const result = calculateDownloadMetrics(mockedItemData);

      expect(result).toEqual({
        percentCompleted: 99,
        downloadRateBytesPerSecond: 999,
        estimatedTimeRemainingSeconds: expect.any(Number),
      });
    });
  });
});
