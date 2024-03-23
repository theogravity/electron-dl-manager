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
