import crypto from 'crypto'
import extName from 'ext-name'
import { app, DownloadItem } from 'electron'
import path from 'path'
import UnusedFilename from 'unused-filename'

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

    filePath = overwrite ? path.join(directory, name) : UnusedFilename.sync(path.join(directory, name))
  }

  return filePath
}

/**
 * Calculates the download rate and estimated time remaining, using the start time and current time to determine elapsed time.
 *
 * @param {object} params - An object containing the parameters for the calculation.
 * @param {number} params.totalBytes - The total size of the download in bytes.
 * @param {number} params.downloadedBytes - The amount of data downloaded so far in bytes.
 * @param {number} params.startTimeSecs - The start time of the download in seconds.
 * @returns {object} An object containing the download rate in bytes per second and the estimated time remaining in seconds.
 */
export function calculateDownloadMetrics({
  totalBytes,
  downloadedBytes,
  startTimeSecs,
}: {
  totalBytes: number
  downloadedBytes: number
  startTimeSecs: number
}): {
  percentCompleted: number
  downloadRateBytesPerSecond: number
  estimatedTimeRemainingSeconds: number
} {
  const currentTimeSecs = Math.floor(new Date().getTime() / 1000)
  const elapsedTimeSecs = currentTimeSecs - startTimeSecs

  let downloadRateBytesPerSecond = 0
  let estimatedTimeRemainingSeconds = 0

  if (elapsedTimeSecs > 0) {
    downloadRateBytesPerSecond = downloadedBytes / elapsedTimeSecs

    if (downloadRateBytesPerSecond > 0) {
      estimatedTimeRemainingSeconds = (totalBytes - downloadedBytes) / downloadRateBytesPerSecond
    }
  }

  const percentCompleted =
    totalBytes > 0 ? Math.min(parseFloat(((downloadedBytes / totalBytes) * 100).toFixed(2)), 100) : 0

  return {
    percentCompleted,
    downloadRateBytesPerSecond,
    estimatedTimeRemainingSeconds,
  }
}
