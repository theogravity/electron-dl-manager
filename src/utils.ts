import crypto from "node:crypto";
import path from "node:path";
import { type DownloadItem, app } from "electron";
import extName from "ext-name";
import UnusedFilename from "unused-filename";

export function truncateUrl(url: string) {
  if (url.length > 50) {
    return `${url.slice(0, 50)}...`;
  }
  return url;
}

export function generateRandomId() {
  const currentTime = new Date().getTime();
  const randomNum = Math.floor(Math.random() * 1000);
  const combinedValue = currentTime.toString() + randomNum.toString();

  const hash = crypto.createHash("sha256");
  hash.update(combinedValue);

  return hash.digest("hex").substring(0, 6);
}

// Copied from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L10
export function getFilenameFromMime(name: string, mime: string) {
  const extensions = extName.mime(mime);

  if (extensions.length !== 1) {
    return name;
  }

  return `${name}.${extensions[0].ext}`;
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
  directory?: string;
  saveAsFilename?: string;
  item: DownloadItem;
  overwrite?: boolean;
}) {
  // Code adapted from https://github.com/sindresorhus/electron-dl/blob/main/index.js#L73
  if (directory && !path.isAbsolute(directory)) {
    throw new Error("The `directory` option must be an absolute path");
  }

  directory = directory || app?.getPath("downloads");

  let filePath: string;

  if (saveAsFilename) {
    filePath = path.join(directory, saveAsFilename);
  } else {
    const filename = item.getFilename();
    const name = path.extname(filename) ? filename : getFilenameFromMime(filename, item.getMimeType());

    filePath = overwrite ? path.join(directory, name) : UnusedFilename.sync(path.join(directory, name));
  }

  return filePath;
}

/**
 * Calculates the download rate and estimated time remaining for a download.
 * @returns {object} An object containing the download rate in bytes per second and the estimated time remaining in seconds.
 */
export function calculateDownloadMetrics(item: DownloadItem): {
  percentCompleted: number;
  downloadRateBytesPerSecond: number;
  estimatedTimeRemainingSeconds: number;
} {
  const downloadedBytes = item.getReceivedBytes();
  const totalBytes = item.getTotalBytes();
  const startTimeSecs = item.getStartTime();

  const currentTimeSecs = Math.floor(new Date().getTime() / 1000);
  const elapsedTimeSecs = currentTimeSecs - startTimeSecs;

  // Avail in Electron 30.3.0+
  let downloadRateBytesPerSecond = item.getCurrentBytesPerSecond ? item.getCurrentBytesPerSecond() : 0;
  let estimatedTimeRemainingSeconds = 0;

  if (elapsedTimeSecs > 0) {
    if (!downloadRateBytesPerSecond) {
      downloadRateBytesPerSecond = downloadedBytes / elapsedTimeSecs;
    }

    if (downloadRateBytesPerSecond > 0) {
      estimatedTimeRemainingSeconds = (totalBytes - downloadedBytes) / downloadRateBytesPerSecond;
    }
  }

  let percentCompleted = 0;

  // Avail in Electron 30.3.0+
  if (item.getPercentComplete) {
    percentCompleted = item.getPercentComplete();
  } else {
    percentCompleted =
      totalBytes > 0 ? Math.min(Number.parseFloat(((downloadedBytes / totalBytes) * 100).toFixed(2)), 100) : 0;
  }

  return {
    percentCompleted,
    downloadRateBytesPerSecond,
    estimatedTimeRemainingSeconds,
  };
}
