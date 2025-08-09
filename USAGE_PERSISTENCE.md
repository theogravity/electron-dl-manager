# Download Persistence Usage

The electron-dl-manager now supports download persistence, allowing downloads to be resumed after application restarts.

## Basic Setup

```typescript
import { ElectronDownloadManager } from 'electron-dl-manager';

// Enable persistence when creating the manager
const downloadManager = new ElectronDownloadManager({
  enablePersistence: true,
  debugLogger: console.log
});
```

## Starting a Download with Persistence

```typescript
const downloadId = await downloadManager.download({
  window: mainWindow,
  url: 'https://example.com/large-file.zip',
  directory: '/path/to/downloads',
  persistenceConfig: {
    restorePreviousDownload: true // automatically resume if interrupted download found
  },
  callbacks: {
    onDownloadStarted: (data) => {
      console.log('Download started:', data.id);
    },
    onDownloadProgress: (data) => {
      console.log('Progress:', data.percentCompleted + '%');
    },
    onDownloadCompleted: (data) => {
      console.log('Download completed:', data.resolvedFilename);
    },
    onDownloadInterrupted: (data) => {
      console.log('Download interrupted:', data.id);
    },
    onDownloadRestored: (data) => {
      console.log('Download restored:', data.id);
    }
  }
});
```

## Auto-Resume Downloads

With `restorePreviousDownload: true`, the download manager will automatically check for existing incomplete downloads and resume them:

```typescript
// If a previous download was interrupted, this will automatically resume it
const downloadId = await downloadManager.download({
  window: mainWindow,
  url: 'https://example.com/large-file.zip',
  persistenceConfig: {
    restorePreviousDownload: true
  },
  callbacks: {
    onDownloadStarted: (data) => {
      console.log('Download started/resumed from:', data.item.getReceivedBytes(), 'bytes');
    },
    onDownloadRestored: (data) => {
      console.log('Download restored:', data.id);
    }
  }
});
```

## Restoring Interrupted Downloads

On application startup, you can check for and restore interrupted downloads using the built-in method:

```typescript
import { ElectronDownloadManager } from 'electron-dl-manager';

const downloadManager = new ElectronDownloadManager({
  enablePersistence: true,
  debugLogger: console.log
});

// Get IDs of interrupted downloads that were found
const restoredDownloadIds = await downloadManager.restoreInterruptedDownloads();

console.log(`Found ${restoredDownloadIds.length} interrupted downloads`);

// Note: The actual restoration happens automatically when you call download() 
// with the same URL and restorePreviousDownload: true
```

### Alternative: Manual State Access

If you need direct access to the download states (for advanced use cases), you can access them through the download manager's internal state:

```typescript
// This is an advanced use case - the state manager is internal to ElectronDownloadManager
// In most cases, you should use restoreInterruptedDownloads() instead

// To clear all persisted states:
downloadManager.clearPersistedStates();
```

## Manual State Management

The download manager handles state management automatically. The available methods for managing persistence are:

```typescript
// Clear all persisted download states
downloadManager.clearPersistedStates();

// Get interrupted downloads to restore
const interruptedIds = await downloadManager.restoreInterruptedDownloads();
```

**Note**: Direct state manipulation is handled internally by the download manager. The state persistence works automatically when persistence is enabled.

## Configuration Options

### DownloadManagerConstructorParams
- `enablePersistence?: boolean` - Enables download state persistence (default: false)
- `debugLogger?: (message: string) => void` - Optional debug logger

### PersistenceConfig (in download params)
- `restorePreviousDownload?: boolean` - Automatically resume interrupted downloads with matching ETag

### PersistedDownloadState

The persistent state includes:
- Basic identifiers (id, fileName, filePath)
- Download metadata (urlChain, mimeType, etag)
- Progress information (totalBytes, receivedBytes, status)
- Timing information (startTime, lastUpdateTime)

## Notes

- Persistence is stored in `{userData}/download-states.json`
- Downloads are automatically removed from persistent state when completed or cancelled
- With `restorePreviousDownload: true`, the library automatically handles download restoration using `session.createInterruptedDownload`
- All download metadata (ETag, urlChain, mimeType, etc.) is properly captured and stored for reliable resumption
- The library matches previous downloads by ETag to ensure download integrity during resumption
- Auto-resume works by detecting matching ETag from previous interrupted downloads 