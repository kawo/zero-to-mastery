/**
 * Runs in the page's isolated preload world (sandboxed). Exposes a small, typed
 * API as `window.tuneboxDesktop`; the page gets no Node or Electron access.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi, UpdateStatus } from '../src/lib/desktop';

const api: DesktopApi = {
  platform: process.platform as DesktopApi['platform'],
  appInfo: () => ipcRenderer.invoke('app:info'),
  updateStatus: () => ipcRenderer.invoke('update:current'),
  onUpdate(listener) {
    const handler = (_e: IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
};

contextBridge.exposeInMainWorld('tuneboxDesktop', api);
