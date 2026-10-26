import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { OpenRequest, TroveBridge } from '@trove/core';

// invoke rejects with "Error invoking remote method '<channel>': Error: <message>"; the page shows <message>.
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args).catch((e: Error) => {
  throw new Error(e.message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, ''));
});

const trove: TroveBridge = {
  pickFolder: () => invoke('trove:pickFolder'),
  probe: (path: string) => invoke('trove:probe', path),
  open: (req: OpenRequest) => invoke('trove:open', req),
  recents: () => invoke('trove:recents'),
  forget: (path: string) => invoke('trove:forget', path),
};

contextBridge.exposeInMainWorld('trove', trove);

// A folder dropped anywhere on the zero state opens it if it is a repository; any other folder stays
// on the zero state with the reason. The page cannot learn a dropped file's
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
