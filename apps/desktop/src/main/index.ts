import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type OpenDialogOptions } from 'electron';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { AGENT_MODES, attachCommand, call, DEFAULT_DOC_TYPES, inGit, probeGit, recentName, serve, type AgentMode, type AgentTool, type App, type GitScope, type SourceKind, type TerminalApp, type OpenRequest, type Recent, type UpdateState } from '@trove/core';
import type { IPty } from 'node-pty';
import { checkForUpdate, installUpdate, updateState, watchForUpdates } from './update';
import { osc9, osc9Kind } from './osc';

const uiDir = join(import.meta.dirname, '../ui'); // out/main -> out/ui, however Electron was launched
const startHtml = join(uiDir, 'start.html');
const preload = join(import.meta.dirname, '../preload/index.cjs');
const recentsFile = () => join(app.getPath('userData'), 'recents.json');
const MAX_RECENTS = 20;
// On the Mac the page draws its own title strip (TitleStrip in the UI) with the traffic lights in it.
const frame = process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 10 } } : {};

interface SourceWindow { win: BrowserWindow; core: App; path: string; root: string; port: number; kind: SourceKind; pty: Pty | null }
/** The window's agent terminal: running while `exitCode` is null; after exit it stays for its tail. */
interface Pty { proc: IPty; tool: AgentTool; tail: string; exitCode: number | null }
const sources = new Set<SourceWindow>();
let startWin: BrowserWindow | null = null;

// ---- recents ---------------------------------------------------------------------------------

function readRecents(): Recent[] {
  try {
    const list = JSON.parse(readFileSync(recentsFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => r?.kind === 'git' || r?.kind === 'folder') : [];
  } catch {
    return [];
  }
}

/** Pinned recents always stay; the rest are capped. */
function writeRecents(list: Recent[]): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  let unpinned = 0;
  writeFileSync(recentsFile(), JSON.stringify(list.filter((r) => r.pinned || unpinned++ < MAX_RECENTS), null, 2));
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

/** A recent as it was last opened: its file in its folder, else the source with its kind and scope. */
const openRecent = (r: Recent) => openSource(r.file && existsSync(r.file) ? { path: r.file } : { path: r.path, scope: r.scope, base: r.base, kind: r.kind });

/** Opens with the kind and scope the source was last opened with, else the source's settings. */
function reopen(path: string): Promise<void> {
  const abs = resolve(path);
  const last = readRecents().find((r) => r.path === abs);
  return openSource({ path: abs, scope: last?.scope, base: last?.base, kind: last?.kind });
}

/** The doc types' extensions: what Finder, File > Open and a drop open as a document. */
const DOC_EXTS = DEFAULT_DOC_TYPES.flatMap((t) => t.extensions);
const relPath = (root: string, file: string) => relative(root, file).split(sep).join('/');
type Target = { dir: string; file: string | null; kind: SourceKind };

/** A repository's top-level folder (a worktree's included); a folder inside one is not. */
const isTop = (dir: string) => probeGit(dir)?.worktree.path === realpathSync(dir);

/** What a request opens: a file, its folder as a folder with the file selected; a folder, as `kind` says, else as a repository when it is one's top level and as a folder otherwise. */
function targetOf(req: OpenRequest): Target {
  const abs = resolve(req.path);
  if (isDir(abs)) return { dir: abs, file: null, kind: req.kind ?? (isTop(abs) ? 'git' : 'folder') };
  if (!existsSync(abs)) throw new Error(`Nothing at ${abs}`);
  if (!DOC_EXTS.includes(extname(abs).toLowerCase())) throw new Error(`Trove opens ${DOC_EXTS.join(', ')} files and folders`);
  const file = realpathSync(abs);
  return { dir: dirname(file), file, kind: 'folder' };
}

// One open per source at a time, so a double click cannot start two servers for one source. Files for one
// folder (Finder opening several) queue behind each other and land in the window the first one opened.
const opening = new Map<string, Promise<void>>();
function openSource(req: OpenRequest): Promise<void> {
  let t: Target;
  try { t = targetOf(req); } catch (e) { return Promise.reject(e); }
  const key = `${t.kind}:${t.dir}`;
  const prev = opening.get(key);
  if (prev && !t.file) return prev;
  const run: Promise<void> = (prev?.catch(() => {}) ?? Promise.resolve()).then(() => openNow(req, t))
    .finally(() => { if (opening.get(key) === run) opening.delete(key); });
  opening.set(key, run);
  return run;
}

/** The folder window a file opens in: its own folder's, else the nearest folder's above it that lists it. */
function fileWindow(file: string): SourceWindow | undefined {
  return [...sources].filter((s) => s.kind === 'folder' && file.startsWith(s.root + sep))
    .sort((a, b) => b.root.length - a.root.length)
    .find((s) => dirname(file) === s.root || s.core.list().some((f) => f.path === relPath(s.root, file)));
}

/** `file` on the window's page (its #file= hash); its type is turned on in that folder first when it is off there. */
async function showFile(s: SourceWindow, file: string): Promise<void> {
  s.core.enableTypeFor(file);
  s.win.webContents.send('trove:open-file', relPath(s.root, file));
}

async function openNow(req: OpenRequest, t: Target): Promise<void> {
  // Exact roots only: a worktree is its own toplevel, so it gets its own window beside the main checkout's.
  // A repository and the same folder opened as a folder are two sources with a window each.
  const open = t.file ? fileWindow(t.file) : [...sources].find((s) => s.kind === t.kind && (s.path === t.dir || s.root === t.dir));
  if (open) {
    if (req.agent !== undefined) writeRecents(readRecents().map((r) => (r.path === open.root ? { ...r, agent: req.agent } : r)));
    if (req.agent) await launchAgent(req.agent, open);
    if (t.file) await showFile(open, t.file);
    open.win.show();
    open.win.focus();
    return;
  }
  const onlyStart = BrowserWindow.getAllWindows().length === 1 && startWin !== null;
  const { app: core, url } = await serve({
    root: t.file ?? t.dir, // a file turns its type on in its folder when it is off there
    folder: t.kind === 'folder',
    scope: req.scope,
    base: req.base,
    uiDir,
    port: 0,
    agent: null, // nothing serves the page; an agent attaches with `trove attach`
    by: 'desktop',
    doneCommand: (port) => `trove done <file> --port ${port}`,
  });
  const info = core.info();
  const last = readRecents().find((r) => r.path === info.root);
  // The agent asked for, else the one this source was last opened with.
  const agent = req.agent !== undefined ? req.agent : (last?.agent ?? null);
  writeRecents([
    {
      path: info.root,
      name: info.name,
      // A folder reads by its name; a repository by its name and worktree, with its scope.
      ...(info.kind === 'git' ? { repo: info.repo.name, ...(info.worktree.main ? {} : { worktree: info.worktree.name }) } : {}),
      kind: info.kind,
      openedAt: new Date().toISOString(),
      ...(info.kind === 'git' ? { scope: info.scope } : {}),
      ...(req.base !== undefined ? { base: req.base } : {}),
      agent,
      ...(t.file ? { file: t.file } : {}),
      ...(last?.pinned ? { pinned: true } : {}),
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
  const source: SourceWindow = { win, core, path: t.dir, root: info.root, port: info.port, kind: info.kind, pty: null };
  sources.add(source);
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => {
    sources.delete(source);
    killPty(source);
    void core.close();
  });
  guard(win, (target) => target.origin === new URL(url).origin);
  // Server first (the agent needs its port), then the window (the terminal in it, which replays what the
  // agent printed before the page listened), then the agent. A Terminal app that fails still gets the
  // window, whose Connect popover has the command to paste; the start page shows why.
  let failed: unknown = null;
  if (agent) await launchAgent(agent, source).catch((e: unknown) => { failed = e; });
  const query = new URLSearchParams({ ...(agent ? { waiting: agent } : {}), ...(t.file ? { file: relPath(info.root, t.file) } : {}) }).toString();
  await win.loadURL(query ? `${url}/?${query}` : url);
  if (failed) throw failed;
  if (onlyStart) startWin?.close();
}

/** Errors from the menu, Finder, the dock or a drop have no page to land on; with no window left, the start page opens. */
function openOrReport(run: () => Promise<void>): void {
  run().catch((err: unknown) => {
    dialog.showErrorBox('Trove could not open it', String(err instanceof Error ? err.message : err));
    if (!BrowserWindow.getAllWindows().length) openStart();
  });
}

/** A folder opens as it was last opened, else as its repository or as a folder; a file opens in its folder. */
function openPath(path: string): void {
  openOrReport(() => (isDir(resolve(path)) ? reopen(path) : openSource({ path })));
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
const TERMINAL_ARGS: Record<Exclude<TerminalApp, 'Trove'>, (script: string) => string[]> = {
  Terminal: (s) => ['-a', 'Terminal', s],
  iTerm: (s) => ['-a', 'iTerm', s],
  Ghostty: (s) => ['-na', 'Ghostty', '--args', '-e', s],
  WezTerm: (s) => ['-na', 'WezTerm', '--args', 'start', '--', s],
  kitty: (s) => ['-na', 'kitty', '--args', s],
  Alacritty: (s) => ['-na', 'Alacritty', '--args', '-e', s],
};
const TERMINALS = Object.keys(TERMINAL_ARGS) as Exclude<TerminalApp, 'Trove'>[];
const installed = (name: TerminalApp) =>
  [`/Applications/${name}.app`, join(homedir(), 'Applications', `${name}.app`), `/System/Applications/Utilities/${name}.app`].some((p) => existsSync(p));
/** Where an agent can start: Trove's own terminal, then the terminal apps on this Mac, Terminal first. */
const terminals = (): TerminalApp[] => ['Trove', ...TERMINALS.filter(installed)];
/** The app setting, while that app is still installed; else Trove. */
function terminal(): TerminalApp {
  const t = readAppSettings().terminal as TerminalApp;
  return TERMINALS.includes(t as Exclude<TerminalApp, 'Trove'>) && installed(t) ? t : 'Trove';
}

/** `tool` in the repository with the attach prompt for the window's server: in the window's terminal, or a window of the chosen terminal app. */
async function launchAgent(tool: AgentTool, s: SourceWindow): Promise<void> {
  const t = terminal();
  if (t === 'Trove') return startPty(s, tool, 80, 24); // the page resizes it to the pane when it attaches
  const script = join(app.getPath('temp'), `trove-${tool}-${s.port}.command`);
  writeFileSync(script, `#!/bin/sh\n${attachCommand(tool, s.root, s.port, true, agentMode())}\n`);
  chmodSync(script, 0o755);
  await run('open', TERMINAL_ARGS[t](script)).catch((e: { stderr?: string; message: string }) => {
    throw new Error(`${t} did not open: ${(e.stderr || e.message).trim()}`);
  });
}

// ---- the agent's terminal --------------------------------------------------------------------

// out/node-pty, copied there by electron.vite.config.ts (unpacked from the asar when packaged).
const pty = createRequire(import.meta.url)('../node-pty') as typeof import('node-pty');
const TAIL = 256 * 1024; // what a reloaded page replays; nothing survives an app restart

/** The agent in the login shell (the PATH `tools()` found it on), in the repository. One per window. */
function startPty(s: SourceWindow, tool: AgentTool, cols: number, rows: number): void {
  if (s.pty && s.pty.exitCode === null) return;
  const proc = pty.spawn(process.env.SHELL || '/bin/zsh', ['-ilc', attachCommand(tool, s.root, s.port, true, agentMode())], {
    cwd: s.root, cols, rows, name: 'xterm-256color', env: { ...process.env, COLORTERM: 'truecolor' },
  });
  const session: Pty = { proc, tool, tail: '', exitCode: null };
  const send = (channel: string, arg: unknown) => { if (s.pty === session && !s.win.isDestroyed()) s.win.webContents.send(channel, arg); };
  let carry = ''; // an OSC 9 notification cut between chunks
  proc.onData((d) => {
    const n = osc9(d, carry);
    carry = n.carry;
    const text = n.texts.at(-1);
    if (text !== undefined) void call(s.port, 'POST', '/api/signal', { kind: osc9Kind(text), ...(text ? { text } : {}) }).catch(() => {});
    session.tail += d;
    if (session.tail.length > 2 * TAIL) session.tail = session.tail.slice(-TAIL);
    send('trove:pty:data', d);
  });
  proc.onExit(({ exitCode }) => {
    session.exitCode = exitCode;
    send('trove:pty:exit', exitCode);
  });
  s.pty = session;
}

function killPty(s: SourceWindow): void {
  if (s.pty?.exitCode === null) s.pty.proc.kill();
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
const readAppSettings = (): { worktreeDir?: unknown; terminal?: unknown; agentMode?: unknown } => { try { return JSON.parse(readFileSync(appSettingsFile(), 'utf8')) ?? {}; } catch { return {}; } };
function writeAppSettings(patch: { worktreeDir?: string; terminal?: TerminalApp; agentMode?: AgentMode }): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(appSettingsFile(), JSON.stringify({ ...readAppSettings(), ...patch }, null, 2));
}

/** Where new worktrees go: the folder picked with the dialog's cog, else one folder for all of them, out of the user's code. */
/** The permission mode agents start with: the app setting, else bypass. */
const agentMode = (): AgentMode => { const m = readAppSettings().agentMode; return AGENT_MODES.includes(m as AgentMode) ? (m as AgentMode) : 'bypass'; };

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
  // The page holds unsaved edits (a folder's beforeunload): ask before the window closes.
  win.webContents.on('will-prevent-unload', (e) => {
    const close = dialog.showMessageBoxSync(win, { type: 'question', buttons: ["Don't save", 'Cancel'], defaultId: 1, cancelId: 1, message: 'Close without saving your edits?' }) === 0;
    if (close) e.preventDefault();
  });
}

function openStart(): void {
  const load = (win: BrowserWindow) => win.loadFile(startHtml);
  if (startWin) {
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

/** The native open panel, as a sheet on `parent` when there is one. null when cancelled. */
async function pick(parent: BrowserWindow | null, properties: OpenDialogOptions['properties'], filters?: OpenDialogOptions['filters']): Promise<string | null> {
  const opts = { properties, filters };
  const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  return res.canceled ? null : res.filePaths[0] ?? null;
}
const FOLDER: OpenDialogOptions['properties'] = ['openDirectory', 'createDirectory'];
const DOCS = [{ name: 'Documents', extensions: DOC_EXTS.map((e) => e.slice(1)) }];
const pickFolder = (parent: BrowserWindow | null) => pick(parent, FOLDER).then((p) => (p ? probe(p) : null));
const pickFile = (parent: BrowserWindow | null) => pick(parent, ['openFile'], DOCS);

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
  // Where agents start: Trove's own terminal or a terminal app.
  const current = terminal();
  const terminalItem: MenuItemConstructorOptions = {
    label: 'Start Agents In',
    submenu: terminals().map((t) => ({
      label: t === 'Trove' ? 'Trove' : t === 'iTerm' ? 'iTerm2' : t, type: 'radio' as const, checked: t === current,
      click: () => { writeAppSettings({ terminal: t }); buildMenu(); },
    })),
  };
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' }, ...updateItem(), { type: 'separator' }, terminalItem, { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => void pick(BrowserWindow.getFocusedWindow(), FOLDER).then((p) => p && openPath(p)) },
        { label: 'Open File…', accelerator: 'CmdOrCtrl+Shift+O', click: () => void pickFile(BrowserWindow.getFocusedWindow()).then((p) => p && openPath(p)) },
        {
          label: 'Open Recent',
          submenu: recents.length
            ? [
                ...recents.map((r) => ({ label: r.file ? basename(r.file) : recentName(r), toolTip: r.file ?? r.path, click: () => openOrReport(() => openRecent(r)) })),
                { type: 'separator' as const },
                { label: 'Clear Menu', click: () => writeRecents(recents.filter((r) => r.pinned)) },
              ]
            : [{ label: 'No Recent Repositories', enabled: false }],
        },
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => openStart() },
        { type: 'separator' },
        ...(isMac ? [] : [terminalItem, { type: 'separator' as const }]),
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
ipcMain.handle('trove:pickFile', (e) => pickFile(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('trove:probe', (_e, path: unknown) => probe(str(path)));
ipcMain.handle('trove:open', (_e, req: unknown) => {
  const r = (req ?? {}) as Partial<Record<keyof OpenRequest, unknown>>;
  if (r.scope !== undefined && !SCOPES.includes(r.scope as GitScope)) throw new Error(`unknown scope ${String(r.scope)}`);
  if (r.base !== undefined && r.base !== null && typeof r.base !== 'string') throw new Error('base must be a string');
  if (r.agent !== undefined && r.agent !== null && !TOOLS.includes(r.agent as AgentTool)) throw new Error(`unknown agent ${String(r.agent)}`);
  if (r.kind !== undefined && r.kind !== 'git' && r.kind !== 'folder') throw new Error(`unknown kind ${String(r.kind)}`);
  return openSource({ path: str(r.path), scope: r.scope as GitScope | undefined, base: r.base as string | null | undefined, agent: r.agent as AgentTool | null | undefined, kind: r.kind });
});
ipcMain.handle('trove:tools', () => tools());
ipcMain.handle('trove:update', () => updateState());
ipcMain.handle('trove:installUpdate', () => installUpdate());
ipcMain.handle('trove:terminals', () => ({ installed: terminals(), current: terminal() }));
ipcMain.handle('trove:setTerminal', (_e, t: unknown) => {
  if (!terminals().includes(t as TerminalApp)) throw new Error(`${String(t)} is not installed`);
  writeAppSettings({ terminal: t as TerminalApp });
  buildMenu();
});
ipcMain.handle('trove:mode', () => agentMode());
ipcMain.handle('trove:setMode', (_e, m: unknown) => {
  if (!AGENT_MODES.includes(m as AgentMode)) throw new Error(`${String(m)} is not a permission mode`);
  writeAppSettings({ agentMode: m as AgentMode });
});
ipcMain.handle('trove:recents', () => readRecents());
ipcMain.handle('trove:pin', (_e, path: unknown, pinned: unknown) => {
  const p = str(path);
  writeRecents(readRecents().map((r) => (r.path === p ? { ...r, pinned: pinned === true || undefined } : r)));
});
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
// The agent's terminal: each window reaches only its own session. No HTTP route, ever: a shell on the
// local server would let any local process run commands.
const own = (e: IpcMainEvent | IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return [...sources].find((s) => s.win === win);
};
const size = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? Math.min(v as number, 1000) : 1);
ipcMain.handle('trove:pty:start', (e, tool: unknown, cols: unknown, rows: unknown) => {
  if (!TOOLS.includes(tool as AgentTool)) throw new Error(`unknown agent ${String(tool)}`);
  const s = own(e);
  if (s) startPty(s, tool as AgentTool, size(cols), size(rows));
});
ipcMain.on('trove:pty:write', (e, data: unknown) => {
  const p = own(e)?.pty;
  if (typeof data === 'string' && p?.exitCode === null) p.proc.write(data);
});
ipcMain.on('trove:pty:resize', (e, cols: unknown, rows: unknown) => {
  const p = own(e)?.pty;
  if (p?.exitCode === null) p.proc.resize(size(cols), size(rows));
});
ipcMain.handle('trove:pty:kill', (e) => { const s = own(e); if (s) killPty(s); });
ipcMain.handle('trove:pty:state', (e) => {
  const p = own(e)?.pty;
  return p ? { tool: p.tool, tail: p.tail, exitCode: p.exitCode } : null;
});
ipcMain.handle('trove:drop', (_e, path: unknown) => openPath(str(path)));
// While a window's agent waits on the user: "● " leads its title, and the Dock's badge counts such windows.
const needy = new Set<BrowserWindow>();
const badge = () => app.dock?.setBadge(needy.size ? String(needy.size) : '');
ipcMain.on('trove:attention', (e, on: unknown) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || (on === true) === needy.has(win)) return;
  if (on === true) {
    needy.add(win);
    win.once('closed', () => { needy.delete(win); badge(); });
  } else needy.delete(win);
  const title = win.getTitle().replace(/^● /, '');
  win.setTitle(on === true ? `● ${title}` : title);
  badge();
});
// The terminal app agents start in, to the front: the agent there is waiting on the user.
ipcMain.handle('trove:showTerminal', async () => {
  const t = terminal();
  if (t !== 'Trove') await run('open', ['-a', t]);
});

// ---- lifecycle -------------------------------------------------------------------------------

// Same userData (recents.json) in dev and in the packaged app.
app.setPath('userData', join(app.getPath('appData'), 'Trove'));
nativeTheme.themeSource = 'system';

// Finder's Open With (electron-builder.yml's fileAssociations), a file dropped on the Dock icon, `open -a Trove <file>`.
// The file that launches the app arrives before ready: it waits until then and opens instead of the start page.
const launched: string[] = [];
app.on('open-file', (e, path) => {
  e.preventDefault();
  if (app.isReady()) openPath(path);
  else launched.push(path);
});

app.whenReady().then(() => {
  // The bundle's icon.icns is the dark one (an .icns holds one appearance; design/icon/README.md says
  // why there is no switching .icon yet), so while Trove runs the Dock follows light and dark mode.
  // In `pnpm dev:desktop` this also replaces the stock Electron icon.
  const dockIcon = () => app.dock?.setIcon(join(app.getAppPath(), 'assets', nativeTheme.shouldUseDarkColors ? 'icon.png' : 'icon-light.png'));
  if (process.platform === 'darwin') { dockIcon(); nativeTheme.on('updated', dockIcon); }
  buildMenu();
  if (launched.length) launched.splice(0).forEach(openPath);
  else openStart();
  // Each change redraws the menu's update item and reaches every window's start page.
  watchForUpdates((u: UpdateState) => {
    buildMenu();
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('trove:update', u);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openStart();
  });
});

app.on('before-quit', () => { for (const s of sources) killPty(s); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
