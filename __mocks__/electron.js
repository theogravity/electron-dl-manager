import { vi } from 'vitest'

export default {
  app: {
    getPath: vi.fn().mockReturnValue('/default/path'),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: {
      downloadURL: vi.fn(),
      session: {
        once: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      debugger: {
        attach: vi.fn(),
        sendCommand: vi.fn(),
        detach: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  })),
}
