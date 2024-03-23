import { DownloadData, ElectronDownloadManager } from '../src'
import { createMockDownloadData } from '../src/__mocks__/DownloadData'

jest.mock('unused-filename')

describe('ElectronDownloadManager', () => {
  it('should get download data', () => {
    const downloadData = new DownloadData()
    const downloadManager = new ElectronDownloadManager()
    downloadManager['downloadData'] = { [downloadData.id]: downloadData }
    expect(downloadManager.getDownloadData(downloadData.id)).toBe(downloadData)
  })

  it('should cancel download', () => {
    const downloadData = createMockDownloadData().downloadData

    const downloadManager = new ElectronDownloadManager()
    downloadManager['downloadData'] = { [downloadData.id]: downloadData }
    downloadManager.cancelDownload(downloadData.id)
    expect(downloadData.item.cancel).toHaveBeenCalled()
  })

  it('should pause download', () => {
    const downloadData = createMockDownloadData().downloadData

    const downloadManager = new ElectronDownloadManager()
    downloadManager['downloadData'] = { [downloadData.id]: downloadData }
    downloadManager.pauseDownload(downloadData.id)
    expect(downloadData.item.pause).toHaveBeenCalled()
  })

  it('should resume download', () => {
    const { downloadData, item } = createMockDownloadData()

    item.isPaused.mockReturnValue(true)

    const downloadManager = new ElectronDownloadManager()

    downloadManager['downloadData'] = { [downloadData.id]: downloadData }
    downloadManager.resumeDownload(downloadData.id)

    expect(downloadData.item.resume).toHaveBeenCalled()
  })

  it('should get active download count', () => {
    const { downloadData: downloadData1 } = createMockDownloadData()

    downloadData1.isDownloadInProgress.mockReturnValue(true)

    const { downloadData: downloadData2 } = createMockDownloadData()

    downloadData2.isDownloadInProgress.mockReturnValue(false)

    const { downloadData: downloadData3} = createMockDownloadData()

    downloadData3.isDownloadInProgress.mockReturnValue(true)

    const downloadManager = new ElectronDownloadManager()

    downloadManager['downloadData'] = {
      [downloadData1.id]: downloadData1,
      [downloadData2.id]: downloadData2,
      [downloadData3.id]: downloadData3,
    }

    expect(downloadManager.getActiveDownloadCount()).toBe(2)
  })

  it('should download a file', async () => {
    const downloadManager = new ElectronDownloadManager()

    const params = {
      url: 'https://example.com/test.txt',
      saveAsFilename: 'test.txt',
      window: {
        webContents: {
          session: {
            once: jest.fn(),
          },
          downloadURL: jest.fn(),
        }
      } as any,
      callbacks: {} as any
    }

    const downloadId = downloadManager.download(params)

    expect(params.window.webContents.session.once).toBeCalledWith('will-download', expect.any(Function))
    expect(params.window.webContents.downloadURL).toBeCalledWith(params.url, undefined)
    expect(downloadId).toEqual(expect.any(String))
  })
})
