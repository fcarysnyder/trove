import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AgentTool, OpenRequest, TerminalApp, TroveBridge, UpdateState } from '@trove/core';

// invoke rejects with "Error invoking remote method '<channel>': Error: <message>"; the page shows <message>.
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args).catch((e: Error) => {
  throw new Error(e.message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, ''));
});

/** Subscribe to a main-process event; returns the unsubscribe. */
const on = <T>(channel: string, cb: (arg: T) => void) => {
  const h = (_e: unknown, arg: T) => cb(arg);
  ipcRenderer.on(channel, h);
  return () => { ipcRenderer.removeListener(channel, h); };
};

const trove: TroveBridge = {
  pickFolder: () => invoke('trove:pickFolder'),
  probe: (path: string) => invoke('trove:probe', path),
  open: (req: OpenRequest) => invoke('trove:open', req),
  recents: () => invoke('trove:recents'),
  forget: (path: string) => invoke('trove:forget', path),
  tools: () => invoke('trove:tools'),
  update: () => invoke('trove:update'),
  onUpdate: (cb: (s: UpdateState) => void) => { ipcRenderer.on('trove:update', (_e, s: UpdateState) => cb(s)); },
  installUpdate: () => invoke('trove:installUpdate'),
  terminals: () => invoke('trove:terminals'),
  setTerminal: (t: TerminalApp) => invoke('trove:setTerminal', t),
  home: () => invoke('trove:home'),
  githubRepos: () => invoke('trove:githubRepos'),
  clone: (url: string, parent: string) => invoke('trove:clone', url, parent),
  cloneDir: () => invoke('trove:cloneDir'),
  addWorktree: (path: string, branch: string, base: string | null, parent: string, name: string) => invoke('trove:addWorktree', path, branch, base, parent, name),
  switchBranch: (path: string, branch: string, base: string | null) => invoke('trove:switchBranch', path, branch, base),
  removeWorktree: (path: string) => invoke('trove:removeWorktree', path),
  worktreeDir: () => invoke('trove:worktreeDir'),
  setWorktreeDir: (path: string) => invoke('trove:setWorktreeDir', path),
  pty: {
    start: (tool: AgentTool, cols: number, rows: number) => invoke('trove:pty:start', tool, cols, rows),
    // send, not invoke: keystrokes and resizes are fire-and-forget.
    write: (data: string) => ipcRenderer.send('trove:pty:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('trove:pty:resize', cols, rows),
    kill: () => invoke('trove:pty:kill'),
    state: () => invoke('trove:pty:state'),
    onData: (cb: (data: string) => void) => on('trove:pty:data', cb),
    onExit: (cb: (code: number) => void) => on('trove:pty:exit', cb),
  },
};

contextBridge.exposeInMainWorld('trove', trove);

// A folder dropped on any window opens it if it is a repository; any other folder stays
// on the zero state with the reason. The page cannot learn a dropped file's
// path itself (File.path is gone since Electron 32), so the preload takes the drop.
window.addEventListener('dragover', (e) => e.preventDefault(), true);
window.addEventListener(
  'drop',
  (e) => {
    const file = e.dataTransfer?.files[0];
    if (!file) return; // dragged text: the page's own (a comment box in the editor)
    const path = webUtils.getPathForFile(file);
    e.preventDefault(); // never navigate to the dropped file; the page's own handlers still run
    if (path) void ipcRenderer.invoke('trove:drop', path);
  },
  true,
);
