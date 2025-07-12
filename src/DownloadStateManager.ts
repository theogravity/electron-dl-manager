import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface PersistedDownloadState {
  id: string;
  projectId: string;
  fileId: string;
  fileName: string;
  url: string;
  urlChain: string[];
  filePath: string;
  mimeType?: string;
  etag?: string;
  totalBytes: number;
  receivedBytes: number;
  startTime: number;
  lastUpdateTime: number;
  status: 'downloading' | 'paused' | 'interrupted' | 'completed' | 'cancelled';
  packageName: string;
  originalFileSize: number;
}

export interface DownloadStateManager {
  saveDownloadState: (state: PersistedDownloadState) => void;
  getDownloadState: (id: string) => PersistedDownloadState | undefined;
  getAllDownloadStates: () => PersistedDownloadState[];
  removeDownloadState: (id: string) => void;
  updateDownloadState: (id: string, updates: Partial<PersistedDownloadState>) => void;
  clearAllDownloadStates: () => void;
}

class DownloadStateManagerImpl implements DownloadStateManager {
  private stateFilePath: string;
  private downloadStates: Map<string, PersistedDownloadState>;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.stateFilePath = path.join(userDataPath, 'download-states.json');
    this.downloadStates = new Map();
    this.loadStates();
  }

  private loadStates(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        const states = JSON.parse(data) as PersistedDownloadState[];
        this.downloadStates = new Map(states.map((state) => [state.id, state]));
      }
    } catch (error) {
      console.error('Failed to load download states:', error);
      this.downloadStates = new Map();
    }
  }

  private saveStates(): void {
    try {
      const states = Array.from(this.downloadStates.values());
      fs.writeFileSync(this.stateFilePath, JSON.stringify(states, null, 2));
    } catch (error) {
      console.error('Failed to save download states:', error);
    }
  }

  saveDownloadState(state: PersistedDownloadState): void {
    this.downloadStates.set(state.id, state);
    this.saveStates();
  }

  getDownloadState(id: string): PersistedDownloadState | undefined {
    return this.downloadStates.get(id);
  }

  getAllDownloadStates(): PersistedDownloadState[] {
    return Array.from(this.downloadStates.values());
  }

  removeDownloadState(id: string): void {
    this.downloadStates.delete(id);
    this.saveStates();
  }

  updateDownloadState(id: string, updates: Partial<PersistedDownloadState>): void {
    const existing = this.downloadStates.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, lastUpdateTime: Date.now() };
      this.downloadStates.set(id, updated);
      this.saveStates();
    }
  }

  clearAllDownloadStates(): void {
    this.downloadStates.clear();
    this.saveStates();
  }
}

// Export singleton instance
export const downloadStateManager = new DownloadStateManagerImpl(); 