jest.mock('electron', () => {
  const originalModule = jest.requireActual('electron')

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
  }
})
