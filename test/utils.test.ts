import {
  truncateUrl,
  generateRandomId,
  getFilenameFromMime,
  determineFilePath,
  calculateDownloadMetrics
} from "../src/utils";
import { DownloadItem } from 'electron'
import { writeFile } from 'fs/promises'
import path from 'path';

jest.mock('electron')

describe('truncateUrl', () => {
  test('it should truncate URL if longer than 50 characters', () => {
    const url = 'https://www.example.com/this/is/a/very/long/url/which/needs/truncation/to/maintain/50/characters'
    expect(truncateUrl(url)).toEqual('https://www.example.com/this/is/a/very/long/url/wh...')
  });

  test('it should not truncate URL if already 50 characters or less', () => {
    const url = 'https://www.example.com/short-url'
    expect(truncateUrl(url)).toEqual(url)
  });
});

describe('generateRandomId', () => {
  test('it should generate a random ID of length 6', () => {
    const randomId = generateRandomId();
    expect(randomId).toHaveLength(6);
  });
});

describe('getFilenameFromMime', () => {
  test('it should return the name appended with extension if there is a supported mime type', () => {
    const name = 'test';
    const mime = 'application/pdf';
    expect(getFilenameFromMime(name, mime)).toEqual('test.pdf');
  });

  test('it should return the original name there is no extension associated with the mime type', () => {
    const name = 'test';
    const mime = '';
    expect(getFilenameFromMime(name, mime)).toEqual(name);
  });
});

describe('determineFilePath', () => {
  test('it should return a valid file path with provided saveAsFilename', () => {
    const downloadDir = '/tmp/downloads';
    const saveAsFilename = 'myFile.txt';
    const item = { getFilename: () => 'example.txt', getMimeType: () => 'text/plain' } as DownloadItem
    const result = determineFilePath({ directory: downloadDir, saveAsFilename, item });

    expect(result).toEqual('/tmp/downloads/myFile.txt');
  });

  test('it should return a valid file path with overwrite option set to true', () => {
    const downloadDir = '/tmp/downloads';
    const item = { getFilename: () => 'example.txt', getMimeType: () => 'text/plain' } as DownloadItem;
    const result = determineFilePath({ directory: downloadDir, item, overwrite: true });

    expect(result).toEqual('/tmp/downloads/example.txt');
  });

  test('it should generate a unique filename when saveAsFilename is not provided and overwrite is false', async () => {
    const downloadDir = '/tmp';
    const item = { getFilename: () => 'example.txt', getMimeType: () => 'text/plain' } as DownloadItem;

    // @todo: mock the file system
    // Tried using memfs and mock-fs without success
    await writeFile(path.join(downloadDir, item.getFilename()), 'test', {
      flag: 'w',
      encoding: 'utf-8',
    })

    const result = determineFilePath({ directory: downloadDir, item });

    expect(result).toEqual('/tmp/example (1).txt');
  });

  test('it should throw an error when directory is provided but is not an absolute path', () => {
    const invalidDirectory = 'downloads';
    const item = { getFilename: () => 'example.txt', getMimeType: () => 'text/plain' } as DownloadItem;

    expect(() => determineFilePath({ directory: invalidDirectory, item })).toThrow(Error('The `directory` option must be an absolute path'));
  });
});

describe('calculateDownloadMetrics', () => {
  const mockStartTimeSecs = 1000;

  beforeAll(() => {
    jest.spyOn(global, 'Date').mockImplementation(() => {
      return {
        // // Mock current time (in ms) 1000 seconds after the start time
        getTime: () => 2000 * mockStartTimeSecs,
      } as unknown as Date;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('calculates the download metrics correctly for positive elapsed time', () => {
    const result = calculateDownloadMetrics({
      totalBytes: 5000,
      downloadedBytes: 1000,
      startTimeSecs: mockStartTimeSecs,
    });

    expect(result).toEqual({
      percentCompleted: 20,
      downloadRateBytesPerSecond: 1,
      estimatedTimeRemainingSeconds: 4000, // 4000 bytes remaining at 1 byte/second
    });
  });

  it('calculates zero download rate and estimated time if no time has elapsed', () => {
    const startTimeWithNoElapsedTime = 2000; // Mock current time is the same as start time

    const result = calculateDownloadMetrics({
      totalBytes: 5000,
      downloadedBytes: 0,
      startTimeSecs: startTimeWithNoElapsedTime,
    });

    expect(result).toEqual({
      percentCompleted: 0,
      downloadRateBytesPerSecond: 0,
      estimatedTimeRemainingSeconds: 0,
    });
  });

  it('does not exceed 100% completion', () => {
    const result = calculateDownloadMetrics({
      totalBytes: 2000,
      downloadedBytes: 5000, // More bytes downloaded than total, which could be an error
      startTimeSecs: mockStartTimeSecs,
    });

    expect(result.percentCompleted).toBe(100);
  });

  it('handles zero totalBytes without errors and returns zero for percentCompleted', () => {
    const result = calculateDownloadMetrics({
      totalBytes: 0,
      downloadedBytes: 1000,
      startTimeSecs: mockStartTimeSecs,
    });

    expect(result.percentCompleted).toBe(0);
  });
});
