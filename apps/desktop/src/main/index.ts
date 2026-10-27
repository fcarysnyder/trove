import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { attachCommand, probeGit, recentName, serve, type AgentTool, type App, type GitScope, type TerminalApp, type OpenRequest, type Recent, type UpdateState } from '@trove/core';
import { checkForUpdate, installUpdate, updateState, watchForUpdates } from './update';

const uiDir = join(import.meta.dirname, '../ui'); // out/main -> out/ui, however Electron was launched
const startHtml = join(uiDir, 'start.html');
const preload = join(import.meta.dirname, '../preload/index.cjs');
const recentsFile = () => join(app.getPath('userData'), 'recents.json');
const MAX_RECENTS = 20;
// On the Mac the page draws its own title strip (TitleStrip in the UI) with the traffic lights in it.
const frame = process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 10 } } : {};

interface SourceWindow { win: BrowserWindow; core: App; path: string; root: string; port: number }
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
    if (req.agent !== undefined) writeRecents(readRecents().map((r) => (r.path === open.root ? { ...r, agent: req.agent } : r)));
    if (req.agent) await launchAgent(req.agent, open.root, open.port);
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
    agent: null, // nothing serves the page; an agent attaches with `trove attach`
    doneCommand: (port) => `trove done <file> --port ${port}`,
  });
  const info = core.info();
  // Server first (the agent needs its port), then the agent's Terminal, then the window. A Terminal that
  // fails still gets the window, whose Connect popover has the command to paste; the start page shows why.
  let failed: unknown = null;
  if (req.agent) await launchAgent(req.agent, info.root, info.port).catch((e: unknown) => { failed = e; });
  const last = readRecents().find((r) => r.path === info.root);
  writeRecents([
    {
      path: info.root,
      name: info.name,
      repo: info.repo.name,
      ...(info.worktree.main ? {} : { worktree: info.worktree.name }),
      kind: info.kind,
      openedAt: new Date().toISOString(),
      scope: info.scope,
      ...(req.base !== undefined ? { base: req.base } : {}),
      agent: req.agent !== undefined ? req.agent : (last?.agent ?? null),
    },
    ...readRecents().filter((r) => r.path !== info.root),
  ]);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: info.worktree.main ? `${info.repo.name} · Trove` : `${info.worktree.name} · ${info.repo.name} · Trove`,
    ...frame,
    // The bridge here too: the editor's repository and branch menus open other worktrees and recents with it.
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const source: SourceWindow = { win, core, path, root: info.root, port: info.port };
  sources.add(source);
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => {
    sources.delete(source);
    void core.close();
  });
  guard(win, (target) => target.origin === new URL(url).origin);
  await win.loadURL(req.agent ? `${url}/?waiting=${req.agent}` : url);
  if (failed) throw failed;
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

// ---- agents ----------------------------------------------------------------------------------

const run = promisify(execFile);
const TOOLS: AgentTool[] = ['claude', 'codex'];

/** Which agent CLIs the user's login shell finds: an app started from the Dock has a bare PATH. */
async function tools(): Promise<Record<AgentTool, boolean>> {
  const shell = process.env.SHELL || '/bin/zsh';
  const has = (tool: AgentTool) => run(shell, ['-ilc', `which ${tool}`], { timeout: 5000 }).then(() => true, () => false);
  const [claude, codex] = await Promise.all(TOOLS.map(has));
  return { claude, codex };
}

/**
 * How each terminal app is handed the agent's script: Terminal and iTerm run a .command file opened with
 * them; the others take a command on their own command line, in a new instance (-n). Warp and Hyper are
 * left out: neither documents a way to start a window running a given command.
 */
const TERMINAL_ARGS: Record<TerminalApp, (script: string) => string[]> = {
  Terminal: (s) => ['-a', 'Terminal', s],
  iTerm: (s) => ['-a', 'iTerm', s],
  Ghostty: (s) => ['-na', 'Ghostty', '--args', '-e', s],
  WezTerm: (s) => ['-na', 'WezTerm', '--args', 'start', '--', s],
  kitty: (s) => ['-na', 'kitty', '--args', s],
  Alacritty: (s) => ['-na', 'Alacritty', '--args', '-e', s],
};
const TERMINALS = Object.keys(TERMINAL_ARGS) as TerminalApp[];
const installed = (name: TerminalApp) =>
  [`/Applications/${name}.app`, join(homedir(), 'Applications', `${name}.app`), `/System/Applications/Utilities/${name}.app`].some((p) => existsSync(p));
/** The terminal apps on this Mac that an agent can start in, Terminal first. */
const terminals = () => TERMINALS.filter(installed);
/** The app setting, while that app is still installed; else Terminal. */
function terminal(): TerminalApp {
  const t = readAppSettings().terminal as TerminalApp;
  return TERMINALS.includes(t) && installed(t) ? t : 'Terminal';
}

/** A window of the chosen terminal app running `tool` in the repository with the attach prompt for the server on `port`. */
async function launchAgent(tool: AgentTool, root: string, port: number): Promise<void> {
  const script = join(app.getPath('temp'), `trove-${tool}-${port}.command`);
  writeFileSync(script, `#!/bin/sh\n${attachCommand(tool, root, port, true)}\n`);
  chmodSync(script, 0o755);
  const t = terminal();
  await run('open', TERMINAL_ARGS[t](script)).catch((e: { stderr?: string; message: string }) => {
    throw new Error(`${t} did not open: ${(e.stderr || e.message).trim()}`);
  });
}

// ---- cloning ---------------------------------------------------------------------------------

// The login shell's PATH: an app started from the Dock has a bare one, and gh usually lives in Homebrew.
// The marker skips whatever an interactive shell prints first.
let pathOnce: Promise<string> | null = null;
const loginPath = () => (pathOnce ??= run(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "@@PATH@@%s" "$PATH"'], { timeout: 5000 })
  .then((r) => r.stdout.split('@@PATH@@').at(-1)!.trim() || process.env.PATH || '', () => process.env.PATH || ''));
const toolEnv = async () => ({ ...process.env, PATH: await loginPath(), GIT_TERMINAL_PROMPT: '0' });
const hasGh = (env: NodeJS.ProcessEnv) => run('which', ['gh'], { env }).then(() => true, () => false);

async function githubRepos() {
  try {
    const { stdout } = await run('gh', ['repo', 'list', '--limit', '50', '--json', 'nameWithOwner,url,description,pushedAt'], { env: await toolEnv(), timeout: 15000 });
    const list = JSON.parse(stdout) as { nameWithOwner: string; url: string; description: string | null; pushedAt: string }[];
    return list.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)).map((r) => ({ name: r.nameWithOwner, url: r.url, description: r.description ?? '' }));
  } catch {
    return []; // no gh, or not signed in
  }
}

const SHORT = /^[\w.-]+\/[\w.-]+$/; // owner/repo
const REPO_URL = /^(?:https:\/\/|ssh:\/\/|git@)\S+$/;

/** gh for GitHub (it brings the user's sign-in), git for anything else. Never a shell: the URL is one argument. */
async function clone(url: string, parent: string) {
  if (!SHORT.test(url) && !REPO_URL.test(url)) throw new Error('Not a repository URL');
  if (!isDir(parent)) throw new Error(`No folder at ${parent}`);
  const name = url.replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).at(-1);
  if (!name || name === '.' || name === '..') throw new Error('Not a repository URL');
  const dest = join(parent, name);
  if (existsSync(dest)) throw new Error(`${dest} already exists`);
  const env = await toolEnv();
  const github = SHORT.test(url) || /github\.com[/:]/.test(url);
  const args = github && await hasGh(env) ? ['gh', 'repo', 'clone', url, dest] : ['git', 'clone', '--', SHORT.test(url) ? `https://github.com/${url}.git` : url, dest];
  await run(args[0], args.slice(1), { env }).catch((e: { stderr?: string; message: string }) => {
    throw new Error((e.stderr || e.message).trim().split('\n').at(-1));
  });
  return probe(dest);
}

const cloneDir = () => (isDir(join(homedir(), 'code')) ? join(homedir(), 'code') : homedir());

// ---- worktrees ------------------------------------------------------------------------------

// The app's own settings (userData/settings.json), for what is not per repository.
const appSettingsFile = () => join(app.getPath('userData'), 'settings.json');
const readAppSettings = (): { worktreeDir?: unknown; terminal?: unknown } => { try { return JSON.parse(readFileSync(appSettingsFile(), 'utf8')) ?? {}; } catch { return {}; } };
function writeAppSettings(patch: { worktreeDir?: string; terminal?: TerminalApp }): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(appSettingsFile(), JSON.stringify({ ...readAppSettings(), ...patch }, null, 2));
}

/** Where new worktrees go: the folder picked with the dialog's cog, else one folder for all of them, out of the user's code. */
function worktreeDir(): string {
  const d = readAppSettings().worktreeDir;
  return typeof d === 'string' && d ? d : join(homedir(), '.trove', 'worktrees');
}

function setWorktreeDir(path: string): string {
  if (!isDir(path)) throw new Error(`No folder at ${path}`);
  writeAppSettings({ worktreeDir: path });
  return path;
}

/**
 * `branch` in its own worktree at `<parent>/<repo>/<name>`, so the main checkout and whatever is open
 * there stay as they are. With `base`, a new branch off it (`--no-track`: a branch off origin/main must
 * not push to main); with null, an existing local branch no worktree has checked out. Then that folder, probed.
 */
async function addWorktree(path: string, branch: string, base: string | null, parent: string, name: string) {
  if (!/^[\w.-]+$/.test(name) || /^\.+$/.test(name)) throw new Error(`Not a folder name: ${name}`);
  const git = await checkable(path, branch, base);
  const dest = join(parent, git.repo.name, name);
  if (existsSync(dest)) throw new Error(`${dest} already exists`);
  mkdirSync(dirname(dest), { recursive: true });
  const args = base === null ? ['--', dest, branch] : ['--no-track', '-b', branch, '--', dest, base];
  await run('git', ['-C', git.repo.root, 'worktree', 'add', ...args]).catch((e: { stderr?: string; message: string }) => {
    throw new Error((e.stderr || e.message).trim().split('\n').at(-1));
  });
  return probe(dest);
}

/**
 * `git switch` this checkout to `branch`: a new one off `base` (`-c`, `--no-track`), or with null an
 * existing one no worktree has checked out. Uncommitted changes come along, as git carries them;
 * when they are in the way git refuses and nothing changes. Never stashes, never discards.
 */
async function switchBranch(path: string, branch: string, base: string | null) {
  const git = await checkable(path, branch, base);
  const args = base === null ? ['--no-guess', branch] : ['--no-track', '-c', branch, base];
  await run('git', ['-C', git.worktree.path, 'switch', ...args]).catch((e: { stderr?: string; message: string }) => {
    // git's reason is its first line ("error: Your local changes ... would be overwritten"); the rest lists files.
    throw new Error((e.stderr || e.message).trim().split('\n')[0].replace(/^error: /, ''));
  });
  return probe(git.worktree.path);
}

/** The repository at `path` when `branch` can be checked out: new with a `base`, else existing and checked out nowhere. */
async function checkable(path: string, branch: string, base: string | null) {
  const git = probeGit(path);
  if (!git) throw new Error(`not a git repository: ${path}`);
  const valid = !branch.startsWith('-') && await run('git', ['check-ref-format', '--branch', branch]).then(() => true, () => false);
  if (!valid) throw new Error(`Not a branch name: ${branch}`);
  const local = git.local.find((b) => b.name === branch);
  if (base !== null && local) throw new Error(`${branch} already exists`);
  if (base === null && !local) throw new Error(`No branch ${branch}`);
  if (base === null && (local!.current || local!.worktree)) throw new Error(`${branch} is already checked out`);
  return git;
}

/**
 * `git worktree remove` a linked worktree: its folder goes, its branch stays. git refuses while it has
 * uncommitted or untracked files, so nothing unsaved is lost. Its window closes and it leaves the recents.
 */
async function removeWorktree(path: string) {
  const git = probeGit(path);
  if (!git || git.worktree.main) throw new Error(`not a linked worktree: ${path}`);
  const top = git.worktree.path;
  await run('git', ['-C', git.repo.root, 'worktree', 'remove', '--', top]).catch((e: { stderr?: string; message: string }) => {
    const why = (e.stderr || e.message).trim().split('\n')[0].replace(/^fatal: /, '');
    // git suggests --force here; Trove never forces, so say what to do instead.
    throw new Error(/modified or untracked files/.test(why) ? `${basename(top)} has uncommitted or untracked files. Commit or remove them first.` : why);
  });
  for (const s of sources) if (s.root === top) s.win.close();
  writeRecents(readRecents().filter((r) => r.path !== top));
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
    width: 1170,
    height: 792,
    title: 'Trove',
    ...frame,
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

/** The app menu's update item: what the updater is doing, or a check by hand (packaged apps only). */
function updateItem(): MenuItemConstructorOptions[] {
  if (!app.isPackaged) return [];
  const u = updateState();
  if (u.state === 'ready') return [{ label: `Restart to Update to ${u.version}`, click: installUpdate }];
  if (u.state === 'downloading') return [{ label: `Downloading ${u.version}…`, enabled: false }];
  return [{
    label: 'Check for Updates…',
    click: () => void checkForUpdate().then((s) => {
      if (s.state === 'none') void dialog.showMessageBox({ message: `Trove ${app.getVersion()} is the latest version.` });
      if (s.state === 'error') dialog.showErrorBox('Trove could not check for updates', s.message);
    }),
  }];
}

function buildMenu(): void {
  const recents = readRecents();
  const isMac = process.platform === 'darwin';
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' }, ...updateItem(), { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
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
                ...recents.map((r) => ({ label: recentName(r), toolTip: r.path, click: () => openOrReport(() => reopen(r.path)) })),
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
  if (r.agent !== undefined && r.agent !== null && !TOOLS.includes(r.agent as AgentTool)) throw new Error(`unknown agent ${String(r.agent)}`);
  return openSource({ path: str(r.path), scope: r.scope as GitScope | undefined, base: r.base as string | null | undefined, agent: r.agent as AgentTool | null | undefined });
});
ipcMain.handle('trove:tools', () => tools());
ipcMain.handle('trove:update', () => updateState());
ipcMain.handle('trove:installUpdate', () => installUpdate());
ipcMain.handle('trove:terminals', () => ({ installed: terminals(), current: terminal() }));
ipcMain.handle('trove:setTerminal', (_e, t: unknown) => {
  if (!terminals().includes(t as TerminalApp)) throw new Error(`${String(t)} is not installed`);
  writeAppSettings({ terminal: t as TerminalApp });
});
ipcMain.handle('trove:recents', () => readRecents());
ipcMain.handle('trove:forget', (_e, path: unknown) => {
  const p = str(path);
  writeRecents(readRecents().filter((r) => r.path !== p));
});
ipcMain.handle('trove:home', (e) => {
  void startWin?.reload(); // recents and their changes as they are now
  openStart();
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win !== startWin) win?.close();
});
ipcMain.handle('trove:githubRepos', () => githubRepos());
ipcMain.handle('trove:clone', (_e, url: unknown, parent: unknown) => clone(str(url).trim(), str(parent)));
ipcMain.handle('trove:cloneDir', () => cloneDir());
ipcMain.handle('trove:addWorktree', (_e, path: unknown, branch: unknown, base: unknown, parent: unknown, name: unknown) =>
  addWorktree(str(path), str(branch).trim(), base === null ? null : str(base), str(parent), str(name).trim()));
ipcMain.handle('trove:switchBranch', (_e, path: unknown, branch: unknown, base: unknown) => switchBranch(str(path), str(branch).trim(), base === null ? null : str(base)));
ipcMain.handle('trove:removeWorktree', (_e, path: unknown) => removeWorktree(str(path)));
ipcMain.handle('trove:worktreeDir', () => worktreeDir());
ipcMain.handle('trove:setWorktreeDir', (_e, path: unknown) => setWorktreeDir(str(path)));
ipcMain.handle('trove:drop', (_e, path: unknown) => openOrStage(probe(str(path))));

// ---- lifecycle -------------------------------------------------------------------------------

// Same userData (recents.json) in dev and in the packaged app.
app.setPath('userData', join(app.getPath('appData'), 'Trove'));
nativeTheme.themeSource = 'system';

app.whenReady().then(() => {
  // A packaged app takes its icon from assets/icon.icns; `pnpm dev:desktop` runs the stock Electron
  // binary, so give the Dock the same icon here.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'assets/icon.png'));
  buildMenu();
  openStart();
  // Each change redraws the menu's update item and reaches every window's start page.
  watchForUpdates((u: UpdateState) => {
    buildMenu();
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('trove:update', u);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openStart();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
