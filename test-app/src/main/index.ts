import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ElectronDownloadManager } from 'electron-dl-manager';
import * as os from 'node:os'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const mainWindow2 = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', async () => {
    mainWindow.show()

    const manager = new ElectronDownloadManager({
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      debugLogger: (message) => {
        console.log(message)
      }
    });

    // Check if the metadata file exists
    const metadataFilePath = join(os.homedir(), 'Downloads', 'test333333.AppImage.download.metadata');
    let data;
    try {
      data = JSON.parse(readFileSync(metadataFilePath, 'utf-8'));
    } catch (error) {
      console.error('Error reading metadata file:', error);
      data = null;
    }

    if (data) {
      // Restore a download
      await manager.restoreDownload({
        app,
        window: mainWindow,
        restoreData: data,
        callbacks: {
          onDownloadCompleted: async (data) => {
            console.log('completed', data)
          },
          onDownloadStarted: async (data) => {
            console.log(data.item.getReceivedBytes())

            setInterval(() => {
              console.log(data.item.getReceivedBytes())
            }, 1000)
          },
          onDownloadCancelled: async (data) => {
            console.log('canceled', data)
          },
          onDownloadInterrupted: async (data) => {
            console.log('interrupted', data.getResumeDownloadData())
          }
        }
      })
    } else {
      // Start a download
      await manager.download({
        app,
        window: mainWindow,
        url: 'https://downloads.cursor.com/production/e50823e9ded15fddfd743c7122b4724130c25df8/linux/x64/Cursor-1.4.3-x86_64.AppImage',
        saveAsFilename: 'test333333.AppImage',
        persistOnAppClose: true,
        callbacks: {
          onError: (error) => {
            console.log(error)
          },
          onDownloadPersisted: async (_, restoreData) => {
            console.log('persisted', restoreData)
            writeFileSync(`${restoreData.persistedFilePath}.metadata`, JSON.stringify(restoreData))
          }
        }
      })


      setTimeout(async () => {
        app.quit();

        /*
        await manager.restoreDownload({
          window: mainWindow2,
          restoreData: data,
          callbacks: {
            onDownloadCompleted: async (data) => {
              console.log('completed', data)
            },
            onDownloadStarted: async (data) => {
              console.log('started', data)
            },
            onDownloadCancelled: async (data) => {
              console.log('canceled', data)
            },
            onDownloadInterrupted: async (data) => {
              console.log('interrupted', data.getResumeDownloadData())
            }
          }
        });
         */
      }, 3000)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
