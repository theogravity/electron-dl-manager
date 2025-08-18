import { vi } from "vitest";

export const CallbackDispatcher = vi.fn().mockImplementation(() => {
  return {
    onDownloadStarted: vi.fn(),
    onDownloadCompleted: vi.fn(),
    onDownloadCancelled: vi.fn(),
    onDownloadProgress: vi.fn(),
    onDownloadInterrupted: vi.fn(),
    handleError: vi.fn(),
  };
});
