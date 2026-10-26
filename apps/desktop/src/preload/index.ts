import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { OpenRequest, TroveBridge } from '@trove/core';

const trove: TroveBridge = {
  pickFolder: () => ipcRenderer.invoke('trove:pickFolder'),
  probe: (path: string) => ipcRenderer.invoke('trove:probe', path),
  open: (req: OpenRequest) => ipcRenderer.invoke('trove:open', req),
  recents: () => ipcRenderer.invoke('trove:recents'),
  forget: (path: string) => ipcRenderer.invoke('trove:forget', path),
};

contextBridge.exposeInMainWorld('trove', trove);

// A folder dropped anywhere on the zero state opens it. The page cannot learn a dropped file's
// path itself (File.path is gone since Electron 32), so the preload takes the drop.
window.addEventListener('dragover', (e) => e.preventDefault(), true);
window.addEventListener(
  'drop',
  (e) => {
    const file = e.dataTransfer?.files[0];
    const path = file ? webUtils.getPathForFile(file) : '';
    e.preventDefault(); // never navigate to the dropped file; the page's own handlers still run
    if (path) void ipcRenderer.invoke('trove:drop', path);
  },
  true,
);
