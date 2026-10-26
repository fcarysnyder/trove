import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { probeGit, serve, type App, type GitScope, type OpenRequest, type Recent } from '@trove/core';

const uiDir = join(import.meta.dirname, '../ui'); // out/main -> out/ui, however Electron was launched
const startHtml = join(uiDir, 'start.html');
const preload = join(import.meta.dirname, '../preload/index.cjs');
const recentsFile = () => join(app.getPath('userData'), 'recents.json');
const MAX_RECENTS = 20;

interface SourceWindow { win: BrowserWindow; core: App; path: string; root: string }
const sources = new Set<SourceWindow>();
let startWin: BrowserWindow | null = null;

// ---- recents ---------------------------------------------------------------------------------

function readRecents(): Recent[] {
  try {
    const list = JSON.parse(readFileSync(recentsFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => r?.kind === 'git') : []; // folder entries predate repositories-only
  } catch {
    return [];
  }
}

function writeRecents(list: Recent[]): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(recentsFile(), JSON.stringify(list.slice(0, MAX_RECENTS), null, 2));
  buildMenu();
}

// ---- sources ---------------------------------------------------------------------------------

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function probe(path: string) {
  const abs = resolve(path);
  return isDir(abs) ? { path: abs, git: probeGit(abs) } : null;
}

/** Opens with the scope the source was last opened with, else the source's settings. */
function reopen(path: string): Promise<void> {
  const abs = resolve(path);
  const last = readRecents().find((r) => r.path === abs);
  return openSource({ path: abs, scope: last?.scope, base: last?.base });
}

// One open per path at a time, so a double click cannot start two servers for one source.
const opening = new Map<string, Promise<void>>();
function openSource(req: OpenRequest): Promise<void> {
  const path = resolve(req.path);
  let run = opening.get(path);
  if (!run) {
    run = openNow({ ...req, path }).finally(() => opening.delete(path));
    opening.set(path, run);
  }
  return run;
}

async function openNow(req: OpenRequest): Promise<void> {
  const path = req.path;
  // Exact roots only: a worktree is its own toplevel, so it gets its own window beside the main checkout's.
  const open = [...sources].find((s) => s.path === path || s.root === path);
  if (open) {
    open.win.show();
    open.win.focus();
    return;
  }
  const onlyStart = BrowserWindow.getAllWindows().length === 1 && startWin !== null;
  const { app: core, url } = await serve({
    root: path,
    scope: req.scope,
    base: req.base,
    uiDir,
    port: 0,
    agent: 'other',
    doneCommand: (port) => `trove done <file> --port ${port}`,
  });
  const info = core.info();
  writeRecents([
    {
      path: info.root,
      name: info.name,
      kind: info.kind,
      openedAt: new Date().toISOString(),
      scope: info.scope,
      ...(req.base !== undefined ? { base: req.base } : {}),
    },
    ...readRecents().filter((r) => r.path !== info.root),
  ]);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: `${info.name} · Trove`,
    // The bridge here too: the editor's repository and branch menus open other worktrees and recents with it.
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const source: SourceWindow = { win, core, path, root: info.root };
  sources.add(source);
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => {
    sources.delete(source);
    void core.close();
  });
  guard(win, (target) => target.origin === new URL(url).origin);
  await win.loadURL(url);
  if (onlyStart) startWin?.close();
}

/** Errors from the menu, the dock or a drop have no page to land on. */
function openOrReport(run: () => Promise<void>): void {
  run().catch((err: unknown) => dialog.showErrorBox('Trove could not open that repository', String(err instanceof Error ? err.message : err)));
}

/** A repository opens; any other folder waits on the zero state, which says it is not a repository. */
function openOrStage(picked: ReturnType<typeof probe>): void {
  if (!picked) return;
  if (picked.git) openOrReport(() => reopen(picked.path));
  else openStart(picked.path);
}

// ---- windows ---------------------------------------------------------------------------------

/** Navigation stays on the window's own page; external links go to the system browser. */
function guard(win: BrowserWindow, allowed: (target: URL) => boolean): void {
  const external = (raw: string) => {
    const target = new URL(raw);
    if (['http:', 'https:', 'mailto:'].includes(target.protocol)) void shell.openExternal(raw);
  };
  win.webContents.on('will-navigate', (e) => {
    if (allowed(new URL(e.url))) return;
    e.preventDefault();
    external(e.url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
}

/** `staged`: a folder to show in the zero state (it reads the path from the hash). */
function openStart(staged?: string): void {
  const load = (win: BrowserWindow) => win.loadFile(startHtml, staged ? { hash: encodeURIComponent(staged) } : undefined);
  if (startWin) {
    if (staged) void load(startWin);
    startWin.show();
    startWin.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Trove',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  startWin = win;
  win.on('closed', () => {
    if (startWin === win) startWin = null;
  });
  const own = pathToFileURL(startHtml).href;
  guard(win, (target) => target.href.split(/[?#]/)[0] === own);
  void load(win);
}

async function pickFolder(parent?: BrowserWindow | null) {
  const opts = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
  const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  const path = res.canceled ? undefined : res.filePaths[0];
  return path ? probe(path) : null;
}

function buildMenu(): void {
  const recents = readRecents();
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => void pickFolder(BrowserWindow.getFocusedWindow()).then(openOrStage),
        },
        {
          label: 'Open Recent',
          submenu: recents.length
            ? [
                ...recents.map((r) => ({ label: r.path, click: () => openOrReport(() => reopen(r.path)) })),
                { type: 'separator' as const },
                { label: 'Clear Menu', click: () => writeRecents([]) },
              ]
            : [{ label: 'No Recent Repositories', enabled: false }],
        },
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => openStart() },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC (the zero state's window.trove) -------------------------------------------------------

const str = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new Error('expected a path');
  return v;
};
const SCOPES: GitScope[] = ['uncommitted', 'branch'];

ipcMain.handle('trove:pickFolder', (e) => pickFolder(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('trove:probe', (_e, path: unknown) => probe(str(path)));
ipcMain.handle('trove:open', (_e, req: unknown) => {
  const r = (req ?? {}) as Partial<Record<keyof OpenRequest, unknown>>;
  if (r.scope !== undefined && !SCOPES.includes(r.scope as GitScope)) throw new Error(`unknown scope ${String(r.scope)}`);
  if (r.base !== undefined && r.base !== null && typeof r.base !== 'string') throw new Error('base must be a string');
  return openSource({ path: str(r.path), scope: r.scope as GitScope | undefined, base: r.base as string | null | undefined });
});
ipcMain.handle('trove:recents', () => readRecents());
ipcMain.handle('trove:forget', (_e, path: unknown) => {
  const p = str(path);
  writeRecents(readRecents().filter((r) => r.path !== p));
});
ipcMain.handle('trove:drop', (_e, path: unknown) => openOrStage(probe(str(path))));

// ---- lifecycle -------------------------------------------------------------------------------

// Same userData (recents.json) in dev and in the packaged app.
app.setPath('userData', join(app.getPath('appData'), 'Trove'));
nativeTheme.themeSource = 'system';

app.whenReady().then(() => {
  buildMenu();
  openStart();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openStart();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
