export const CallbackDispatcher = jest.fn().mockImplementation(() => {
  return {
    onDownloadStarted: jest.fn(),
    onDownloadCompleted: jest.fn(),
    onDownloadCancelled: jest.fn(),
    onDownloadProgress: jest.fn(),
    onDownloadInterrupted: jest.fn(),
    handleError: jest.fn(),
  }
})
