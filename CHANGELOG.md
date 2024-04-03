# 2.4.1 (2024-04-03)

- Fix issue where pausing a download won't pause it
  * This can happen if you pause right after starting a download where internally we pause then resume after 
  internal handlers are set. Now we'll track if the user has paused and will not auto-resume after.

# 2.4.0 (2024-03-30)

- Fix readme. Should be `ElectronDownloadManager`
not `FileDownloadManager`

# 2.3.1 (2024-03-28)

No actual logic changes.

- Remove postinstall script
- Remove eslint and use biome.js for linting / formatting instead
- Remove unnecessary devDep packages.

# 2.3.0 (2024-03-27)

- Implement `onDownloadInterrupted()` for the download `completed` state. This should cover urls that result in 404s. 
  * Added new property `interruptedVia` to `DownloadData` to indicate the state in which the download was interrupted from.
- Removed the restriction on having to specify `saveAsFilename` since it should auto-calculate the filename from the URL if not provided.
- Fixed a bug where `resolvedFilename` was not populated when not using a save as dialog.

# 2.2.0 (2024-03-25)

- Added some missing instructions for how to format the download rate / estimated time remaining

Added to `DownloadData`:

- `isDownloadResumable()`

# 2.1.0 (2024-03-25)

Added to `DownloadData`:

- Add `downloadRateBytesPerSecond`
- Add `estimatedTimeRemainingSeconds`

See Readme for more information.

# 2.0.5 (2024-03-25)

- Forgot to build before publishing, added build to prebuild script

# 2.0.4 (2024-03-25)

- Small readme fix

# 2.0.3 (2024-03-25)

- Fix documentation formatting
- Add unit tests for utils file
- Downgraded `unused-filename` from `4` to `3` series due to issue with jest not supporting esmodules well

# 2.0.2 (2024-03-22)

- Fix bug where `cancelledFromSaveAsDialog` was not being set if the user cancelled from the save as dialog

# 2.0.1 (2024-03-22)

Fix the TOC in the readme.

# 2.0.0 (2024-03-22)

Complete refactor to make things more organized and readable. Unit tests are more
sane now.

**Breaking Changes:**

- `showBadge` option has been removed. The reasoning is that you may have other items that you need to include in your badge count outside of download counts, so it's better to manage that aspect yourself.

- The callbacks return a `DownloadData` instance instead of a plain object. The data sent is the same as it was in v1.

# 1.2.2 (2024-03-21)

- Internal refactors and small fixes

# 1.2.1 (2024-03-21)

- More immediate download fixes

# 1.2.0 (2024-03-21)

- Fixes a major issue where a download would not complete if using the save as dialog
- Fixes internal static method `disableThrottle()` where it was not working / throwing

# 1.1.1 (2024-03-21)

- Fix issues around downloading smaller files where the download would complete before the progress / completed event was emitted
- When the user cancels from the save as dialog, will fire out `onDownloadCancelled()` 
- Add `cancelledFromSaveAsDialog` in the callback data to indicate if the download was cancelled from the save as dialog

# 1.1.0 (2024-03-21)

- Add `ElectronDownloadManagerMock` for use in tests
- Add `getActiveDownloadCount()` to get the number of active downloads
- Add `showBadge` option to `download()` to show a badge on the dock icon

# 1.0.2 (2024-03-21)

`download()` now returns the `id` of the download

# 1.0.1 (2024-03-21)

Readme updates

# 1.0.0 (2024-03-20)

Initial version
