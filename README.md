# Electron File Download Manager

[![NPM version](https://img.shields.io/npm/v/electron-dl-manager.svg?style=flat-square)](https://www.npmjs.com/package/electron-dl-manager) [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A simple and easy to use file download manager for Electron applications.
Designed in response to the many issues around `electron-dl` and provides
a more robust and reliable solution for downloading files in Electron.

Use cases:

- Download files from a URL
- Get an id associated with the download to track it
- Optionally show a "Save As" dialog
- Get progress updates on the download
- Be able to cancel / pause / resume downloads
- Support multiple downloads at once
- Persist downloads when the app closes, allowing them to be restored / resumed later

Electron 26.0.0 or later is required.

```typescript
// In main process
// Not a working example, just a demonstration of the API
import { ElectronDownloadManager } from 'electron-dl-manager';

const manager = new ElectronDownloadManager();

// Start a download
const id = await manager.download({
  window: browserWindowInstance,
  url: 'https://example.com/file.zip',
  saveDialogOptions: {
    title: 'Save File',
  },
  callbacks: {
    onDownloadStarted: async ({ id, item, webContents }) => {
      // Do something with the download id
    },
    onDownloadProgress: async (...) => {},
    onDownloadCompleted: async (...) => {},
    onDownloadCancelled: async (...) => {},
    onDownloadInterrupted: async (...) => {},
    onError: (err, data) => {},
  }
});

manager.cancelDownload(id);
manager.pauseDownload(id);
manager.resumeDownload(id);
```

# Table of contents

- [Electron File Download Manager](#electron-file-download-manager)
- [Installation](#installation)
- [Getting started](#getting-started)
- [Download Restoration & Persistence](#download-restoration--persistence)
  - [Basic Download Restoration](#basic-download-restoration)
  - [Download Persistence](#download-persistence)
- [API](#api)
  - [Class: `ElectronDownloadManager`](#class-ElectronDownloadManager)
    - [`constructor()`](#constructor)
    - [`download()`](#download)
      - [Interface: `DownloadParams`](#interface-downloadparams)
      - [Interface: `DownloadManagerCallbacks`](#interface-downloadmanagercallbacks)
    - [`cancelDownload()`](#canceldownload)
    - [`pauseDownload()`](#pausedownload)
    - [`resumeDownload()`](#resumedownload)
    - [`restoreDownload()`](#restoredownload)
    - [`getActiveDownloadCount()`](#getactivedownloadcount)
    - [`getDownloadData()`](#getdownloaddata)
  - [Class: `DownloadData`](#class-downloaddata)
    - [Properties](#properties)
      - [Formatting download progress](#formatting-download-progress)
    - [`isDownloadInProgress()`](#isdownloadinprogress)
    - [`isDownloadPaused()`](#isdownloadpaused)
    - [`isDownloadResumable()`](#isdownloadresumable)
    - [`isDownloadCancelled()`](#isdownloadcancelled)
    - [`isDownloadInterrupted()`](#isdownloadinterrupted)
    - [`isDownloadCompleted()`](#isdownloadcompleted)
    - [`getRestoreDownloadData()`](#getrestoredownloaddata)
- [Mock class](#mock-class)
- [FAQ](#faq)
- [Acknowledgments](#acknowledgments)

# Installation

```bash
$ npm install electron-dl-manager
```

# Getting started

You'll want to use `electron-dl-manager` in the main process of your
Electron application where you will be handling the file downloads.

In this example, we use [IPC handlers / invokers](https://www.electronjs.org/docs/latest/tutorial/ipc#pattern-2-renderer-to-main-two-way)
to communicate between the main and renderer processes, but you can
use any IPC strategy you want.

```typescript
// MainIpcHandlers.ts

import { ElectronDownloadManager } from 'electron-dl-manager';
import { ipcMain } from 'electron';

const manager = new ElectronDownloadManager();

// Renderer would invoke this handler to start a download
ipcMain.handle('download-file', async (event, args) => {
  const { url } = args;

  let downloadId
  const browserWindow = BrowserWindow.fromId(event.sender.id)

  // You *must* call manager.download() with await or 
  // you may get unexpected behavior
  downloadId = await manager.download({
    window: browserWindow,
    url,
    // If you want to download without a save as dialog
    saveAsFilename: 'file.zip',
    directory: '/directory/where/to/save',
    // If you want to download with a save as dialog
    saveDialogOptions: {
      title: 'Save File',
    },
    callbacks: {
      // item is an instance of Electron.DownloadItem
      onDownloadStarted: async ({ id, item, resolvedFilename }) => {
        // Send the download id back to the renderer along
        // with some other data
        browserWindow.webContents.invoke('download-started', {
          id,
          // The filename that the file will be saved as
          filename: resolvedFilename,
          // Get the file size to be downloaded in bytes
          totalBytes: item.getTotalBytes(),
        });
      },
      onDownloadProgress: async ({ id, item, percentCompleted }) => {
        // Send the download progress back to the renderer
        browserWindow.webContents.invoke('download-progress', {
          id,
          percentCompleted,
          // Get the number of bytes received so far
          bytesReceived: item.getReceivedBytes(),
        });
      },
      onDownloadCompleted: async ({ id, item }) => {
        // Send the download completion back to the renderer
        browserWindow.webContents.invoke('download-completed', {
          id,
          // Get the path to the file that was downloaded
          filePath: item.getSavePath(),
        });
      },
      onError: (err, data) => {
        // ... handle any errors
      }
    }
  });

  // Pause the download
  manager.pauseDownload(downloadId);
});
```

# Download Restoration & Persistence

This section covers advanced download management features that go beyond simple pause/resume functionality. These features are essential for applications that need to handle downloads across different browser windows, app restarts, or when downloads are interrupted by external factors.

## When to Use These Features

### Regular Pause/Resume vs. Restoration
- 
- **Pause/Resume**: Use `pauseDownload()` and `resumeDownload()` when you want to temporarily stop and restart a download within the same browser window and session.
- **Restoration**: Use `restoreDownload()` when you need to resume a download in a different browser window, after the original window has been closed, or when the download manager instance has been destroyed.
- **Persistence**: Use the `persistOnAppClose` option in `download()` when you want downloads to automatically survive app restarts, crashes, or when the user closes the application.

## Basic Download Restoration

### Interface: `RestoreDownloadConfig`

```typescript
interface RestoreDownloadConfig {
  /**
   * The Electron.App instance
   */
  app: Electron.App
  /**
   * The Electron.BrowserWindow instance where the download should be restored
   */
  window: BrowserWindow
  /**
   * Data required for resuming the download, returned from pauseDownload()
   */
  restoreData: RestoreDownloadData
  /**
   * The callbacks to define to listen for download events
   */
  callbacks: DownloadManagerCallbacks
  /**
   * Electron.DownloadURLOptions to pass to the downloadURL method
   *
   * @see https://www.electronjs.org/docs/latest/api/session#sesdownloadurlurl-options
   */
  downloadURLOptions?: Electron.DownloadURLOptions
}
```

### Interface: `RestoreDownloadData`

```typescript
interface RestoreDownloadData {
  /**
   * Download id
   */
  id: string
  /**
   * The URL of the download
   */
  url: string
  /**
   * The path and filename where the download will be saved
   */
  fileSaveAsPath: string
  /**
   * The chain of URLs that led to this download
   */
  urlChain: string[]
  /**
   * The MIME type of the file being downloaded
   */
  mimeType: string
  /**
   * The ETag of the download, if available. This is used to resume downloads
   */
  eTag: string
  /**
   * The number of bytes already received
   */
  receivedBytes: number
  /**
   * The total number of bytes to download
   */
  totalBytes: number
  /**
   * The timestamp when the download started
   */
  startTime: number
  /**
   * The percentage of the download that has been completed
   */
  percentCompleted: number
  /**
   * If persistOnAppClose is true, this is the path where the download
   * is persisted to. This is used to restore the download later.
   */
  persistedFilePath?: string
}
```

### Example: Basic Download Restoration

```typescript
// Pause a download and get restore data
const restoreData = manager.pauseDownload(downloadId);

if (restoreData) {
  // Later, in a different browser window
  const newDownloadId = await manager.restoreDownload({
    app,
    window: newBrowserWindow,
    restoreData,
    callbacks: {
      onDownloadStarted: async ({ id, item, resolvedFilename }) => {
        console.log(`Restored download ${id} started`);
      },
      onDownloadProgress: async ({ id, percentCompleted }) => {
        console.log(`Restored download ${id} progress: ${percentCompleted}%`);
      },
      onDownloadCompleted: async ({ id, item }) => {
        console.log(`Restored download ${id} completed`);
      },
      onError: (err, data) => {
        console.error('Error in restored download:', err);
      }
    }
  });
}
```

## Download Persistence

Version 4.2.0 introduces the ability to automatically persist downloads when the application closes, allowing them to be restored later. This feature is fundamentally different from manual pause/resume because it:

- **Automatically triggers** when the app is about to close (listens to the `will-quit` event)
- **Preserves download state** including progress, file paths, and metadata
- **Survives app crashes** and unexpected shutdowns
- **Works across app restarts** without requiring user intervention
- **Handles file management** by creating temporary `.download` files that are automatically restored

### Enabling Download Persistence

To enable download persistence, set `persistOnAppClose: true` and provide the `app` instance:

```typescript
const id = await manager.download({
  app, // Electron.App instance
  window: mainWindow,
  url: 'https://example.com/large-file.zip',
  saveAsFilename: 'large-file.zip',
  persistOnAppClose: true,
  callbacks: {
    onDownloadPersisted: async (data, restoreData) => {
      console.log('Download persisted:', restoreData.persistedFilePath);
      // Save restoreData to a file or database for later restoration
      writeFileSync('download-metadata.json', JSON.stringify(restoreData));
    },
    onDownloadCompleted: async (data) => {
      console.log('Download completed');
    },
    onError: (err, data) => {
      console.error('Download error:', err);
    }
  }
});
```

### Restoring Persisted Downloads

When the app restarts, you can restore persisted downloads using the saved metadata:

```typescript
// Read the saved metadata
const metadata = JSON.parse(readFileSync('download-metadata.json', 'utf-8'));

// Restore the download
await manager.restoreDownload({
  app,
  window: mainWindow,
  restoreData: metadata,
  callbacks: {
    onDownloadStarted: async (data) => {
      console.log('Persisted download restored and started');
    },
    onDownloadProgress: async (data) => {
      console.log(`Progress: ${data.percentCompleted}%`);
    },
    onDownloadCompleted: async (data) => {
      console.log('Persisted download completed');
    },
    onError: (err, data) => {
      console.error('Error in restored download:', err);
    }
  }
});
```

**Note:** The `persistedFilePath` in the restore data points to a temporary file with a `.download` extension. The library automatically handles moving this file to the correct location when restoring.

# API

## Class: `ElectronDownloadManager`

Manages file downloads in an Electron application.

### `constructor()`

```typescript
constructor(params: DownloadManagerConstructorParams)
```

```typescript
interface DownloadManagerConstructorParams {
  /**
   * If defined, will log out internal debug messages. Useful for
   * troubleshooting downloads. Does not log out progress due to
   * how frequent it can be.
   */
  debugLogger?: (message: string) => void
}
```

### `download()`

Starts a file download. Returns the `id` of the download.

```typescript
download(params: DownloadParams): Promise<string>
```

#### Interface: `DownloadParams`

```typescript
interface DownloadParams {
  /**
   * The Electron.BrowserWindow instance
   */
  window: BrowserWindow
  /**
   * The URL to download
   */
  url: string
  /**
   * The callbacks to define to listen for download events
   */
  callbacks: DownloadManagerCallbacks
  /**
   * Electron.DownloadURLOptions to pass to the downloadURL method
   *
   * @see https://www.electronjs.org/docs/latest/api/session#sesdownloadurlurl-options
   */
  downloadURLOptions?: Electron.DownloadURLOptions
  /**
   * If defined, will show a save dialog when the user
   * downloads a file.
   *
   * @see https://www.electronjs.org/docs/latest/api/dialog#dialogshowsavedialogbrowserwindow-options
   */
  saveDialogOptions?: SaveDialogOptions
  /**
   * The filename to save the file as. If not defined, the filename
   * from the server will be used.
   *
   * Only applies if saveDialogOptions is not defined.
   */
  saveAsFilename?: string
  /**
   * The directory to save the file to. Must be an absolute path.
   * @default The user's downloads directory
   */
  directory?: string
  /**
   * If true, will overwrite the file if it already exists
   * @default false
   */
  overwrite?: boolean
  /**
   * If true, will persist the download when the app closes, allowing it to be restored later.
   * Requires the `app` parameter to be provided.
   * @default false
   */
  persistOnAppClose?: boolean
  /**
   * The Electron.App instance. Required if persistOnAppClose is enabled.
   */
  app?: Electron.App
}
```

#### Interface: `DownloadManagerCallbacks`

```typescript
interface DownloadManagerCallbacks {
  /**
   * When the download has started. When using a "save as" dialog,
   * this will be called after the user has selected a location.
   *
   * This will always be called first before the progress and completed events.
   */
  onDownloadStarted: (data: DownloadData) => void
  /**
   * When there is a progress update on a download. Note: This
   * may be skipped entirely in some cases, where the download
   * completes immediately. In that case, onDownloadCompleted
   * will be called instead.
   */
  onDownloadProgress: (data: DownloadData) => void
  /**
   * When the download has completed
   */
  onDownloadCompleted: (data: DownloadData) => void
  /**
   * When the download has been cancelled. Also called if the user cancels
   * from the save as dialog.
   */
  onDownloadCancelled: (data: DownloadData) => void
  /**
   * When the download has been interrupted. This could be due to a bad
   * connection, the server going down, etc.
   */
  onDownloadInterrupted: (data: DownloadData) => void
  /**
   * When the download has been persisted for later restoration.
   * This callback is called when persistOnAppClose is enabled and the app is about to close.
   */
  onDownloadPersisted?: (data: DownloadData, restoreDownloadData: RestoreDownloadData) => void
  /**
   * When an error has been encountered.
   * Note: The signature is (error, <maybe some data>).
   */
  onError: (error: Error, data?: DownloadData) => void
}
```

### `cancelDownload()`

Cancels a download.

```typescript
cancelDownload(id: string): void
```

### `pauseDownload()`

Pauses a download and returns the data necessary to restore it later via `restoreDownload()`.

```typescript
pauseDownload(id: string): RestoreDownloadData | undefined
```

**Returns:** `RestoreDownloadData` if the download exists and can be paused, `undefined` if the download is not found.

**Note:** Use the returned data with `restoreDownload()` to restore a download.

### `resumeDownload()`

Resumes a download.

```typescript
resumeDownload(id: string): void
```

### `restoreDownload()`

Restores a download that is not registered in the download manager using data returned from `pauseDownload()`. This is useful when you need to restore a download in a different browser window or after the original window has been closed.

If the download is already registered in the current download manager, this method will call `resumeDownload()` instead.

```typescript
restoreDownload(params: RestoreDownloadConfig): Promise<string>
```

**Note:** See the [Download Restoration & Persistence](#download-restoration--persistence) section for detailed information about restoring downloads and using the persistence feature.

### `getActiveDownloadCount()`

Returns the number of active downloads.

```typescript
getActiveDownloadCount(): number
```

### `getDownloadData()`

Returns the download data for a download.

```typescript
getDownloadData(id: string): DownloadData
```

## Class: `DownloadData`

Data returned in the callbacks for a download.

### Properties

```typescript
class DownloadData {
  /**
   * Generated id for the download
   */
  id: string
  /**
   * The Electron.DownloadItem. Use this to grab the filename, path, etc.
   * @see https://www.electronjs.org/docs/latest/api/download-item
   */
  item: DownloadItem
  /**
   * The Electron.WebContents
   * @see https://www.electronjs.org/docs/latest/api/web-contents
   */
  webContents: WebContents
  /**
   * The Electron.Event
   * @see https://www.electronjs.org/docs/latest/api/event
   */
  event: Event
  /**
   * The name of the file that is being saved to the user's computer.
   * Recommended over Item.getFilename() as it may be inaccurate when using the save as dialog.
   */
  resolvedFilename: string
  /**
   * If true, the download was cancelled from the save as dialog. This flag
   * will also be true if the download was cancelled by the application when
   * using the save as dialog.
   */
  cancelledFromSaveAsDialog?: boolean
  /**
   * The percentage of the download that has been completed
   */
  percentCompleted: number
  /**
   * The download rate in bytes per second.
   */
  downloadRateBytesPerSecond: number
  /**
   * The estimated time remaining in seconds.
   */
  estimatedTimeRemainingSeconds: number
  /**
   * If the download was interrupted, the state in which it was interrupted from
   */
  interruptedVia?: 'in-progress' | 'completed'
  /**
   * If defined, this is the path where the download is persisted to.
   * This is set when persistOnAppClose is enabled and the download is persisted.
   */
  persistedFilePath?: string
}
```

#### Formatting download progress

You can use the libraries [`bytes`](https://www.npmjs.com/package/bytes) and [`dayjs`](https://www.npmjs.com/package/dayjs) to format the download progress.

```bash
$ pnpm add bytes dayjs
$ pnpm add -D @types/bytes
```

```typescript
import bytes from 'bytes'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

dayjs.extend(relativeTime);
dayjs.extend(duration);

const downloadData = manager.getDownloadData(id); // or DataItem from the callbacks

// Will return something like 1.2 MB/s
const formattedDownloadRate = bytes(downloadData.downloadRateBytesPerSecond, { unitSeparator: ' ' }) + '/s'

// Will return something like "in a few seconds"
const formattedEstimatedTimeRemaining = dayjs.duration(downloadData.estimatedTimeRemainingSeconds, 'seconds').humanize(true)
```

### `isDownloadInProgress()`

Returns true if the download is in progress.

```typescript
isDownloadInProgress(): boolean
```

### `isDownloadPaused()`

Returns true if the download is paused.

```typescript
isDownloadPaused(): boolean
```

### `isDownloadResumable()`

Returns true if the download is resumable.

```typescript
isDownloadResumable(): boolean
```

### `isDownloadCancelled()`

Returns true if the download is cancelled.

```typescript 
isDownloadCancelled(): boolean
```

### `isDownloadInterrupted()`

Returns true if the download is interrupted.

```typescript
isDownloadInterrupted(): boolean
```

### `isDownloadCompleted()`

Returns true if the download is completed.

```typescript
isDownloadCompleted(): boolean
```

### `getRestoreDownloadData()`

Returns the data necessary to restore this download later via `restoreDownload()`. This method is typically called after pausing a download to get the data needed for restoration.

```typescript
getRestoreDownloadData(): RestoreDownloadData
```

**Returns:** `RestoreDownloadData` containing all the information needed to restore the download, including the file path, URL, MIME type, ETag, and byte information.

# Mock class

If you need to mock out `ElectronDownloadManager` in your tests, you can use the `ElectronDownloadManagerMock` class.

`import { ElectronDownloadManagerMock } from 'electron-dl-manager'`

# FAQ

## How do I capture if the download is invalid? `onError()` is not being called.

Electron `DownloadItem` doesn't provide an explicit way to capture errors for downloads in general:

https://www.electronjs.org/docs/latest/api/download-item#class-downloaditem

(It only has `on('updated')` and `on('done')` events, which this library uses for defining the callback handlers.)

What it does for invalid URLs, it will trigger the `onDownloadCancelled()` callback.

```typescript
const id = await manager.download({
  window: mainWindow,
  url: 'https://alkjsdflksjdflk.com/file.zip',
  callbacks: {
    onDownloadCancelled: async (...) => {
      // Invalid download; this callback will be called
    },
  }
});
```

A better way to handle this is to check if the URL exists prior to the download yourself.
I couldn't find a library that I felt was reliable to include into this package,
so it's best you find a library that works for you:

- https://www.npmjs.com/search?q=url%20exists&ranking=maintenance

GPT also suggests the following code (untested):

```typescript
async function urlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

const exists = await urlExists('https://example.com/file.jpg');
```

# Acknowledgments

This code uses small portions from [`electron-dl`](https://github.com/sindresorhus/electron-dl) and is noted in the
code where it is used.

`electron-dl` is licensed under the MIT License and is maintained by Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com).