import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { DebugLoggerFn } from './types';

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

export default class DownloadStateManagerImpl implements DownloadStateManager {
  private stateFilePath: string;
  private downloadStates: Map<string, PersistedDownloadState>;
  private logger: DebugLoggerFn;

  constructor(logger: DebugLoggerFn) {
    this.logger = logger;
    const userDataPath = app.getPath('userData');
    this.stateFilePath = path.join(userDataPath, 'download-states.json');
    this.downloadStates = new Map();
    
    this.logger(`DownloadStateManager: Initializing with state file: ${this.stateFilePath}`);
    this.loadStates();
  }

  private loadStates(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        this.logger(`DownloadStateManager: Loading download states from ${this.stateFilePath}`);
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        const states = JSON.parse(data) as PersistedDownloadState[];
        this.downloadStates = new Map(states.map((state) => [state.id, state]));
        this.logger(`DownloadStateManager: Successfully loaded ${states.length} download states: ${JSON.stringify(states.map(s => ({ id: s.id, fileName: s.fileName, status: s.status })))}`);
      } else {
        this.logger('DownloadStateManager: No existing state file found, starting with empty state');
      }
    } catch (error) {
      this.logger(`DownloadStateManager: Failed to load download states: ${JSON.stringify(error)}`);
      console.error('Failed to load download states:', error);
      this.downloadStates = new Map();
    }
  }

  private saveStates(): void {
    try {
      const states = Array.from(this.downloadStates.values());
      this.logger(`DownloadStateManager: Saving ${states.length} download states to ${this.stateFilePath}`);
      fs.writeFileSync(this.stateFilePath, JSON.stringify(states, null, 2));
      this.logger('DownloadStateManager: Successfully saved download states');
    } catch (error) {
      this.logger(`DownloadStateManager: Failed to save download states: ${JSON.stringify(error)}`);
      console.error('Failed to save download states:', error);
    }
  }

  saveDownloadState(state: PersistedDownloadState): void {
    this.logger(`DownloadStateManager: Saving download state for ${state.id} (${state.fileName}): ${JSON.stringify(state)}`);
    this.downloadStates.set(state.id, state);
    this.saveStates();
  }

  getDownloadState(id: string): PersistedDownloadState | undefined {
    const state = this.downloadStates.get(id);
    this.logger(`DownloadStateManager: Getting download state for ${id}: ${state ? `found - ${JSON.stringify(state)}` : 'not found'}`);
    return state;
  }

  getAllDownloadStates(): PersistedDownloadState[] {
    const states = Array.from(this.downloadStates.values());
    this.logger(`DownloadStateManager: Getting all download states: ${states.length} states - ${JSON.stringify(states.map(s => ({ id: s.id, fileName: s.fileName, status: s.status })))}`);
    return states;
  }

  removeDownloadState(id: string): void {
    const existed = this.downloadStates.has(id);
    this.logger(`DownloadStateManager: Removing download state for ${id}: ${existed ? 'existed' : 'not found'}`);
    this.downloadStates.delete(id);
    if (existed) {
      this.saveStates();
    }
  }

  updateDownloadState(id: string, updates: Partial<PersistedDownloadState>): void {
    const existing = this.downloadStates.get(id);
    if (existing) {
      this.logger(`DownloadStateManager: Updating download state for ${id} with updates: ${JSON.stringify(updates)}`);
      const updated = { ...existing, ...updates, lastUpdateTime: Date.now() };
      this.downloadStates.set(id, updated);
      this.saveStates();
    } else {
      this.logger(`DownloadStateManager: Cannot update download state for ${id}: not found`);
    }
  }

  clearAllDownloadStates(): void {
    const count = this.downloadStates.size;
    const currentStates = Array.from(this.downloadStates.values()).map(s => ({ id: s.id, fileName: s.fileName, status: s.status }));
    this.logger(`DownloadStateManager: Clearing all download states (${count} states): ${JSON.stringify(currentStates)}`);
    this.downloadStates.clear();
    this.saveStates();
  }
}
