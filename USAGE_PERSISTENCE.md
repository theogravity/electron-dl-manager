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
    projectId: 'my-project-123',
    fileId: 'file-456',
    packageName: 'com.myapp.downloader',
    originalFileSize: 1024000, // optional
    autoResume: true // automatically resume if interrupted download found
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
    }
  }
});
```

## Auto-Resume Downloads

With `autoResume: true`, the download manager will automatically check for existing incomplete downloads and resume them:

```typescript
// If a previous download was interrupted, this will automatically resume it
const downloadId = await downloadManager.download({
  window: mainWindow,
  url: 'https://example.com/large-file.zip',
  persistenceConfig: {
    projectId: 'my-project-123',
    fileId: 'file-456', // Same fileId as the interrupted download
    packageName: 'com.myapp.downloader',
    autoResume: true
  },
  callbacks: {
    onDownloadStarted: (data) => {
      console.log('Download resumed from:', data.item.getReceivedBytes(), 'bytes');
    }
  }
});
```

## Restoring Interrupted Downloads

On application startup, check for and restore any interrupted downloads:

```typescript
import { downloadStateManager } from 'electron-dl-manager';

// Get all incomplete downloads
const incompleteDownloads = downloadStateManager.getAllDownloadStates()
  .filter(state => 
    state.status === 'downloading' || 
    state.status === 'paused' || 
    state.status === 'interrupted'
  );

// Restore each download using Electron's createInterruptedDownload API
for (const state of incompleteDownloads) {
  try {
    const session = mainWindow.webContents.session;
    
    const item = session.createInterruptedDownload({
      path: state.filePath,
      urlChain: state.urlChain,
      mimeType: state.mimeType,
      eTag: state.etag,
      offset: state.receivedBytes,
      length: state.totalBytes,
    });

    // Set up event handlers for the restored download
    item.on('updated', (event, itemState) => {
      if (itemState === 'progressing') {
        downloadStateManager.updateDownloadState(state.id, {
          status: 'downloading',
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes()
        });
      }
    });

    item.once('done', (event, itemState) => {
      if (itemState === 'completed') {
        downloadStateManager.removeDownloadState(state.id);
        console.log('Restored download completed:', state.fileName);
      } else if (itemState === 'interrupted') {
        downloadStateManager.updateDownloadState(state.id, { 
          status: 'interrupted' 
        });
      }
    });

    console.log('Restored download:', state.fileName);
  } catch (error) {
    console.error('Failed to restore download:', error);
  }
}
```

## Manual State Management

You can also manually manage download states:

```typescript
import { downloadStateManager } from 'electron-dl-manager';

// Get a specific download state
const state = downloadStateManager.getDownloadState('download-id');

// Update download state
downloadStateManager.updateDownloadState('download-id', {
  status: 'paused',
  receivedBytes: 512000
});

// Remove completed downloads
downloadStateManager.removeDownloadState('download-id');

// Clear all states
downloadStateManager.clearAllDownloadStates();
```

## Configuration Options

### DownloadPersistenceConfig
- restorePreviousDownload?: boolean;

### PersistedDownloadState

The persistent state includes:
- Basic identifiers (id, projectId, fileId, packageName)
- Download metadata (url, urlChain, fileName, filePath)
- Progress information (totalBytes, receivedBytes, status)
- Timing information (startTime, lastUpdateTime)
- Server metadata (mimeType, etag) for proper resumption

## Notes

- Persistence is stored in `{userData}/download-states.json`
- Downloads are automatically removed from persistent state when completed or cancelled
- With `autoResume: true`, the library automatically handles download restoration using `session.createInterruptedDownload`
- All download metadata (ETag, urlChain, mimeType, etc.) is properly captured and stored for reliable resumption
- Make sure to use the same `projectId`, `fileId`, and `packageName` combination when resuming downloads
- The library validates ETag and other metadata to ensure download integrity during resumption 