import crypto from 'crypto'
import extName from 'ext-name'
import { app, DownloadItem } from 'electron'
import path from 'path'
import { unusedFilenameSync } from 'unused-filename'

export function truncateUrl(url: string) {
  if (url.length > 50) {
    return url.slice(0, 50) + '...'
  }
  return url
}

export function generateRandomId() {
  const currentTime = new Date().getTime()
  const randomNum = Math.floor(Math.random() * 1000)
  const combinedValue = currentTime.toString() + randomNum.toString()

  const hash = crypto.createHash('sha256')
  hash.update(combinedValue)

  return hash.digest('hex').substring(0, 6)
}

// Copied from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L10
export function getFilenameFromMime(name: string, mime: string) {
  const extensions = extName.mime(mime)

  if (extensions.length !== 1) {
    return name
  }

  return `${name}.${extensions[0].ext}`
}

/**
 * Determines the initial file path for the download.
 */
export function determineFilePath({
  directory,
  saveAsFilename,
  item,
  overwrite,
}: {
  directory?: string
  saveAsFilename?: string
  item: DownloadItem
  overwrite?: boolean
}) {
  // Code adapted from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L73
  if (directory && !path.isAbsolute(directory)) {
    throw new Error('The `directory` option must be an absolute path')
  }

  directory = directory || app?.getPath('downloads')

  let filePath
  if (saveAsFilename) {
    filePath = path.join(directory, saveAsFilename)
  } else {
    const filename = item.getFilename()
    const name = path.extname(filename) ? filename : getFilenameFromMime(filename, item.getMimeType())

    filePath = overwrite ? path.join(directory, name) : unusedFilenameSync(path.join(directory, name))
  }

  return filePath
}
