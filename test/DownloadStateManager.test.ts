import fs from 'fs';
import path from 'path';
import { app, DownloadItem } from 'electron';
import DownloadStateManagerImpl, { PersistedDownloadState } from '../src/DownloadStateManager';

// Mock fs module
jest.mock('fs');
const mockFs = jest.mocked(fs);

// Mock path module
jest.mock('path');
const mockPath = jest.mocked(path);

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
  },
}));
const mockApp = jest.mocked(app);

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

describe('DownloadStateManager', () => {
  let mockLogger: jest.Mock;
  let stateManager: DownloadStateManagerImpl;
  const mockUserDataPath = '/mock/user/data';
  const mockStateFilePath = '/mock/user/data/download-states.json';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = jest.fn();
    mockApp.getPath.mockReturnValue(mockUserDataPath);
    mockPath.join.mockReturnValue(mockStateFilePath);
    
    // Reset fs mocks
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('[]');
    mockFs.writeFileSync.mockImplementation();
  });

  describe('constructor', () => {
    it('should initialize with correct state file path', () => {
      stateManager = new DownloadStateManagerImpl(mockLogger);
      
      expect(mockApp.getPath).toHaveBeenCalledWith('userData');
      expect(mockPath.join).toHaveBeenCalledWith(mockUserDataPath, 'download-states.json');
      expect(mockLogger).toHaveBeenCalledWith(`DownloadStateManager: Initializing with state file: ${mockStateFilePath}`);
    });

    it('should attempt to load states on initialization', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      stateManager = new DownloadStateManagerImpl(mockLogger);
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(mockStateFilePath);
      expect(mockLogger).toHaveBeenCalledWith('DownloadStateManager: No existing state file found, starting with empty state');
    });
  });

  describe('loadStates', () => {
    it('should load states from existing file', () => {
      const mockStates: PersistedDownloadState[] = [
        {
          id: 'test-id-1',
          fileName: 'test-file-1.txt',
          urlChain: ['https://example.com/file1'],
          filePath: '/path/to/file1.txt',
          mimeType: 'text/plain',
          etag: 'etag1',
          totalBytes: 1000,
          receivedBytes: 500,
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
          status: 'paused'
        },
        {
          id: 'test-id-2',
          fileName: 'test-file-2.txt',
          urlChain: ['https://example.com/file2'],
          filePath: '/path/to/file2.txt',
          totalBytes: 2000,
          receivedBytes: 2000,
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
          status: 'completed'
        }
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockStates));
      
      stateManager = new DownloadStateManagerImpl(mockLogger);
      
      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockStateFilePath, 'utf8');
      expect(mockLogger).toHaveBeenCalledWith(`DownloadStateManager: Loading download states from ${mockStateFilePath}`);
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Successfully loaded ${mockStates.length} download states: ${JSON.stringify(mockStates.map(s => ({ id: s.id, fileName: s.fileName, status: s.status })))}`
      );
      
      // Verify states were loaded correctly
      expect(stateManager.getDownloadState('test-id-1')).toEqual(mockStates[0]);
      expect(stateManager.getDownloadState('test-id-2')).toEqual(mockStates[1]);
    });

    it('should handle non-existent state file', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      stateManager = new DownloadStateManagerImpl(mockLogger);
      
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(mockLogger).toHaveBeenCalledWith('DownloadStateManager: No existing state file found, starting with empty state');
      expect(stateManager.getAllDownloadStates()).toEqual([]);
    });

    it('should handle JSON parse errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      
      stateManager = new DownloadStateManagerImpl(mockLogger);
      
      expect(mockLogger).toHaveBeenCalledWith(
        expect.stringContaining('DownloadStateManager: Failed to load download states:')
      );
      expect(console.error).toHaveBeenCalledWith('Failed to load download states:', expect.any(Error));
      expect(stateManager.getAllDownloadStates()).toEqual([]);
    });

    it('should handle file read errors gracefully', () => {
      const readError = new Error('File read error');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw readError;
      });
      
      stateManager = new DownloadStateManagerImpl(mockLogger);
      
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Failed to load download states: ${JSON.stringify(readError)}`
      );
      expect(console.error).toHaveBeenCalledWith('Failed to load download states:', readError);
      expect(stateManager.getAllDownloadStates()).toEqual([]);
    });
  });

  describe('saveStates', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should save states to file successfully', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockStateFilePath,
        JSON.stringify([mockState], null, 2)
      );
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Saving 1 download states to ${mockStateFilePath}`
      );
      expect(mockLogger).toHaveBeenCalledWith('DownloadStateManager: Successfully saved download states');
    });

    it('should handle file write errors gracefully', () => {
      const writeError = new Error('File write error');
      mockFs.writeFileSync.mockImplementation(() => {
        throw writeError;
      });

      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);
      
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Failed to save download states: ${JSON.stringify(writeError)}`
      );
      expect(console.error).toHaveBeenCalledWith('Failed to save download states:', writeError);
    });
  });

  describe('saveDownloadState', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should save a download state', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);
      
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Saving download state for ${mockState.id} (${mockState.fileName}): ${JSON.stringify(mockState)}`
      );
      expect(stateManager.getDownloadState('test-id')).toEqual(mockState);
    });

    it('should overwrite existing state with same ID', () => {
      const originalState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      const updatedState: PersistedDownloadState = {
        ...originalState,
        receivedBytes: 800,
        status: 'paused'
      };

      stateManager.saveDownloadState(originalState);
      stateManager.saveDownloadState(updatedState);
      
      expect(stateManager.getDownloadState('test-id')).toEqual(updatedState);
    });
  });

  describe('findPreviousDownloadState', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should find previous download state by etag', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        etag: 'test-etag',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'paused'
      };

      stateManager.saveDownloadState(mockState);

      const mockDownloadItem = {
        getETag: jest.fn().mockReturnValue('test-etag')
      } as unknown as DownloadItem;

      const result = stateManager.findPreviousDownloadState(mockDownloadItem);
      
      expect(result).toEqual(mockState);
    });

    it('should not find completed downloads', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        etag: 'test-etag',
        totalBytes: 1000,
        receivedBytes: 1000,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'completed'
      };

      stateManager.saveDownloadState(mockState);

      const mockDownloadItem = {
        getETag: jest.fn().mockReturnValue('test-etag')
      } as unknown as DownloadItem;

      const result = stateManager.findPreviousDownloadState(mockDownloadItem);
      
      expect(result).toBeUndefined();
    });

    it('should not find currently downloading items', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        etag: 'test-etag',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);

      const mockDownloadItem = {
        getETag: jest.fn().mockReturnValue('test-etag')
      } as unknown as DownloadItem;

      const result = stateManager.findPreviousDownloadState(mockDownloadItem);
      
      expect(result).toBeUndefined();
    });

    it('should return undefined if no matching etag found', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        etag: 'different-etag',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'paused'
      };

      stateManager.saveDownloadState(mockState);

      const mockDownloadItem = {
        getETag: jest.fn().mockReturnValue('test-etag')
      } as unknown as DownloadItem;

      const result = stateManager.findPreviousDownloadState(mockDownloadItem);
      
      expect(result).toBeUndefined();
    });
  });

  describe('getDownloadState', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should return existing download state', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);
      
      const result = stateManager.getDownloadState('test-id');
      
      expect(result).toEqual(mockState);
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Getting download state for test-id: found - ${JSON.stringify(mockState)}`
      );
    });

    it('should return undefined for non-existent ID', () => {
      const result = stateManager.getDownloadState('non-existent-id');
      
      expect(result).toBeUndefined();
      expect(mockLogger).toHaveBeenCalledWith(
        'DownloadStateManager: Getting download state for non-existent-id: not found'
      );
    });
  });

  describe('getAllDownloadStates', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should return all download states', () => {
      const mockState1: PersistedDownloadState = {
        id: 'test-id-1',
        fileName: 'test-file-1.txt',
        urlChain: ['https://example.com/file1'],
        filePath: '/path/to/file1.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      const mockState2: PersistedDownloadState = {
        id: 'test-id-2',
        fileName: 'test-file-2.txt',
        urlChain: ['https://example.com/file2'],
        filePath: '/path/to/file2.txt',
        totalBytes: 2000,
        receivedBytes: 2000,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'completed'
      };

      stateManager.saveDownloadState(mockState1);
      stateManager.saveDownloadState(mockState2);
      
      const result = stateManager.getAllDownloadStates();
      
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(mockState1);
      expect(result).toContainEqual(mockState2);
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Getting all download states: 2 states - ${JSON.stringify([
          { id: mockState1.id, fileName: mockState1.fileName, status: mockState1.status },
          { id: mockState2.id, fileName: mockState2.fileName, status: mockState2.status }
        ])}`
      );
    });

    it('should return empty array when no states exist', () => {
      const result = stateManager.getAllDownloadStates();
      
      expect(result).toEqual([]);
      expect(mockLogger).toHaveBeenCalledWith(
        'DownloadStateManager: Getting all download states: 0 states - []'
      );
    });
  });

  describe('removeDownloadState', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should remove existing download state', () => {
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);
      expect(stateManager.getDownloadState('test-id')).toEqual(mockState);
      
      stateManager.removeDownloadState('test-id');
      
      expect(stateManager.getDownloadState('test-id')).toBeUndefined();
      expect(mockLogger).toHaveBeenCalledWith(
        'DownloadStateManager: Removing download state for test-id: existed'
      );
    });

    it('should handle removing non-existent download state', () => {
      stateManager.removeDownloadState('non-existent-id');
      
      expect(mockLogger).toHaveBeenCalledWith(
        'DownloadStateManager: Removing download state for non-existent-id: not found'
      );
      // Should not call saveStates if item didn't exist
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('updateDownloadState', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should update existing download state', () => {
      const originalTime = Date.now();
      const mockState: PersistedDownloadState = {
        id: 'test-id',
        fileName: 'test-file.txt',
        urlChain: ['https://example.com/file'],
        filePath: '/path/to/file.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: originalTime,
        lastUpdateTime: originalTime,
        status: 'downloading'
      };

      stateManager.saveDownloadState(mockState);
      
      const updates = {
        receivedBytes: 800,
        status: 'paused' as const
      };
      
      // Mock Date.now to return a specific time for testing
      const updateTime = originalTime + 1000;
      jest.spyOn(Date, 'now').mockReturnValue(updateTime);
      
      stateManager.updateDownloadState('test-id', updates);
      
      const updatedState = stateManager.getDownloadState('test-id');
      expect(updatedState).toEqual({
        ...mockState,
        ...updates,
        lastUpdateTime: updateTime
      });
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Updating download state for test-id with updates: ${JSON.stringify(updates)}`
      );
      
      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should handle updating non-existent download state', () => {
      const updates = {
        receivedBytes: 800,
        status: 'paused' as const
      };
      
      stateManager.updateDownloadState('non-existent-id', updates);
      
      expect(mockLogger).toHaveBeenCalledWith(
        'DownloadStateManager: Cannot update download state for non-existent-id: not found'
      );
      // Should not call saveStates if item didn't exist
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('clearAllDownloadStates', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      stateManager = new DownloadStateManagerImpl(mockLogger);
    });

    it('should clear all download states', () => {
      const mockState1: PersistedDownloadState = {
        id: 'test-id-1',
        fileName: 'test-file-1.txt',
        urlChain: ['https://example.com/file1'],
        filePath: '/path/to/file1.txt',
        totalBytes: 1000,
        receivedBytes: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'downloading'
      };

      const mockState2: PersistedDownloadState = {
        id: 'test-id-2',
        fileName: 'test-file-2.txt',
        urlChain: ['https://example.com/file2'],
        filePath: '/path/to/file2.txt',
        totalBytes: 2000,
        receivedBytes: 2000,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        status: 'completed'
      };

      stateManager.saveDownloadState(mockState1);
      stateManager.saveDownloadState(mockState2);
      
      expect(stateManager.getAllDownloadStates()).toHaveLength(2);
      
      stateManager.clearAllDownloadStates();
      
      expect(stateManager.getAllDownloadStates()).toEqual([]);
      expect(mockLogger).toHaveBeenCalledWith(
        `DownloadStateManager: Clearing all download states (2 states): ${JSON.stringify([
          { id: mockState1.id, fileName: mockState1.fileName, status: mockState1.status },
          { id: mockState2.id, fileName: mockState2.fileName, status: mockState2.status }
        ])}`
      );
    });

    it('should handle clearing when no states exist', () => {
      stateManager.clearAllDownloadStates();
      
      expect(stateManager.getAllDownloadStates()).toEqual([]);
      expect(mockLogger).toHaveBeenCalledWith(
        'DownloadStateManager: Clearing all download states (0 states): []'
      );
    });
  });
});
