import { truncateUrl, generateRandomId, getFilenameFromMime, determineFilePath } from '../src/utils';
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
