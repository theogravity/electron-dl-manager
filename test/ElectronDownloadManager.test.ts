// ElectronMultiDownloader.test.ts
import { DownloadParams, DownloadManagerCallbacks, ElectronDownloadManager } from '../src'
import EventEmitter from 'events'
import { BrowserWindow, DownloadItem } from 'electron'

jest.mock('electron', () => {
  const originalModule = jest.requireActual('electron');

  return {
    ...originalModule,
    app: {
      getPath: jest.fn().mockReturnValue('/default/path'),
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
      webContents: {
        downloadURL: jest.fn(),
        session: {
          once: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
        debugger: {
          attach: jest.fn(),
          sendCommand: jest.fn(),
          detach: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
          once: jest.fn(),
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
    })),
  };
});

// Mocks for 'ext-name' and 'unused-filename'
jest.mock('ext-name', () => ({
  __esModule: true,
  default: {
    mime: jest.fn().mockReturnValue([{ ext: 'txt' }]),
  },
}));

jest.mock('unused-filename', () => ({
  unusedFilenameSync: jest.fn(),
}));

describe('ElectronMultiDownloader', () => {
  let instance: ElectronDownloadManager;
  let window: BrowserWindow;
  let downloadItem: jest.Mocked<DownloadItem>;
  let downloadItemData = {
    filename: 'test.txt',
    savePath: '/test/path/test.txt'
  }
  let emitter: EventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    window = new BrowserWindow();
    // Simulate the expected behavior when 'download' method of ElectronMultiDownloader is called
    (window.webContents.session.once as jest.Mock).mockImplementation((event, handler) => {
      handler(event, downloadItem as DownloadItem, window.webContents);
    });

    emitter = new EventEmitter();

    // This needs to be more flexible where we can create multiple downloadItem
    // instances and be able to pass them to their own unique session
    downloadItem = {
      cancel: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      setSaveDialogOptions: jest.fn(),
      getFilename: jest.fn().mockImplementation(() => {
        return downloadItemData.filename
      }),
      getMimeType: jest.fn(),
      getURL: jest.fn(),
      getETag: jest.fn(),
      getSavePath: jest.fn().mockImplementation(() => {
        return downloadItemData.savePath
      }),
      setSavePath: jest.fn().mockImplementation((str: string) => {
        downloadItemData.savePath = str;
      }),
      getReceivedBytes: jest.fn().mockReturnValue(100),
      getTotalBytes: jest.fn().mockReturnValue(100),
      removeListener: jest.fn(),
      getState: jest.fn(),
      isPaused: jest.fn(),
      // @ts-ignore
      on: emitter.on.bind(emitter),
      // @ts-ignore
      once: emitter.once.bind(emitter)
    };

    instance = new ElectronDownloadManager({
      // debugLogger: console.log
    });
  });

  it('should start a download when called with saveAsFilename', () => {
    const params: DownloadParams = {
      window,
      url: 'http://example.com/file.txt',
      callbacks: {},
      saveAsFilename: '/tmp/testFile.txt',
    };
    instance.download(params);
    expect(downloadItem.setSavePath).toHaveBeenCalled()
    expect(window.webContents.downloadURL).toHaveBeenCalledWith(params.url, undefined);
  });

  it('should start a download when called with saveDialogOptions', () => {
    const params: DownloadParams = {
      window,
      url: 'http://example.com/file.txt',
      callbacks: {},
      saveDialogOptions: {
        title: 'Test'
      }
    };
    instance.download(params);
    expect(downloadItem.setSaveDialogOptions).toHaveBeenCalled()
    expect(window.webContents.downloadURL).toHaveBeenCalledWith(params.url, undefined);
  });

  it('should get the active download count', async () => {
    const params: DownloadParams = {
      window,
      url: 'http://example.com/file.txt',
      callbacks: {},
      saveAsFilename: '/tmp/testFile.txt',
    };
    instance.download(params);
    downloadItem.getState.mockReturnValue('progressing');
    expect(instance.getActiveDownloadCount()).toBe(1);
  })

  it('should cancel a download', async () => {
    const id = 'test-download-id';
    const params: DownloadParams = {
      window,
      url: 'http://example.com/file.txt',
      callbacks: {},
      saveAsFilename: '/tmp/testFile.txt',
    };
    // Manually setting up for simulation
    // @ts-ignore
    instance['idToCallbackData'][id] = {
      id,
      item: downloadItem as DownloadItem
    };

    instance.cancelDownload(id);
    expect(downloadItem.cancel).toHaveBeenCalled();
  });

  it('should pause a download', async () => {
    const id = 'test-download-id';
    downloadItem.isPaused.mockImplementationOnce(() => false);
    // Manually setting up for simulation
    // @ts-ignore
    instance['idToCallbackData'][id] = {
      id,
      item: downloadItem as DownloadItem
    };

    instance.pauseDownload(id);
    expect(downloadItem.pause).toHaveBeenCalled();
  });

  it('should resume a paused download', async () => {
    const id = 'test-download-id';
    downloadItem.isPaused.mockImplementationOnce(() => true);
    // Manually setting up for simulation
    // @ts-ignore
    instance['idToCallbackData'][id] = {
      id,
      item: downloadItem as DownloadItem
    };

    instance.resumeDownload(id);
    expect(downloadItem.resume).toHaveBeenCalled();
  });

  describe('callbacks', () => {
    it('should invoke onDownloadStarted callback', async () => {
      const mockOnDownloadStarted = jest.fn();
      const callbacks: DownloadManagerCallbacks = {
        onDownloadStarted: mockOnDownloadStarted,
      };
      const params: DownloadParams = { window, url: 'http://example.com/file.txt', callbacks, saveAsFilename: '/tmp/testFile.txt', };

      instance.download(params);

      expect(mockOnDownloadStarted).toHaveBeenCalledWith({
        event: 'will-download',
        id: expect.anything(),
        item: downloadItem,
        resolvedFilename: 'testFile.txt',
        percentCompleted: 0,
        webContents: expect.anything(),
      });
    });

    it('should invoke onDownloadProgress callback', async () => {
      const mockOnDownloadProgress = jest.fn();
      const callbacks: DownloadManagerCallbacks = {
        onDownloadProgress: mockOnDownloadProgress,
      };
      const params: DownloadParams = { window, url: 'http://example.com/file.txt', callbacks, saveAsFilename: '/tmp/testFile.txt', };

      instance.download(params);
      // Need this because of the await start() when setting up the handlers
      await new Promise((r) => setTimeout(r, 0));
      emitter.emit('updated', null, 'progressing')

      expect(mockOnDownloadProgress).toHaveBeenCalledWith({
        event: 'will-download',
        id: expect.anything(),
        item: downloadItem,
        resolvedFilename: 'testFile.txt',
        percentCompleted: 100,
        webContents: expect.anything(),
      });
    });

    it('should invoke onDownloadCompleted callback on success', async () => {
      const mockOnDownloadCompleted = jest.fn();
      const callbacks: DownloadManagerCallbacks = {
        onDownloadCompleted: mockOnDownloadCompleted,
      };
      const params: DownloadParams = { window, url: 'http://example.com/file.txt', callbacks, saveAsFilename: '/tmp/testFile.txt', };

      instance.download(params);
      // Need this because of the await start() when setting up the handlers
      await new Promise((r) => setTimeout(r, 0));
      emitter.emit('done', null, 'completed')

      expect(mockOnDownloadCompleted).toHaveBeenCalledWith({
        event: 'will-download',
        id: expect.anything(),
        item: downloadItem,
        resolvedFilename: 'testFile.txt',
        percentCompleted: 0,
        webContents: expect.anything(),
      });
    });

    it('should invoke onDownloadCancelled callback', async () => {
      const mockOnDownloadCancelled = jest.fn();
      const callbacks: DownloadManagerCallbacks = {
        onDownloadCancelled: mockOnDownloadCancelled,
      };
      const params: DownloadParams = { window, url: 'http://example.com/file.txt', callbacks, saveAsFilename: '/tmp/testFile.txt', };
      instance.download(params);
      // Need this because of the await start() when setting up the handlers
      await new Promise((r) => setTimeout(r, 0));
      emitter.emit('done', null, 'cancelled')

      expect(mockOnDownloadCancelled).toHaveBeenCalledWith({
        event: 'will-download',
        id: expect.anything(),
        item: downloadItem,
        resolvedFilename: 'testFile.txt',
        percentCompleted: 0,
        webContents: expect.anything(),
      });
    });
  });
});
