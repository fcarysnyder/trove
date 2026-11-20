// The editor's behaviour, ported from the old page's script: polling, opening, stepping, accepting,
// drafts, edits and sending. Components call these; they read and write the store.
import type { ActivityResponse, BlockEdit, CommentKind, DocKind, Draft, DraftsResponse, FileResponse, FileRow, FilesResponse, GitInfo, MessageBody, Recent, SendBody, Settings, SourceInfo, UnsavedEdit, Version, VersionText } from '@trove/core/types';
import { blocks, splice } from '@trove/core/anchor';
import { toast } from 'sonner';
import { api, ApiError, optional } from '@/lib/api';
import { passes, normalizeOff, type FilterKey } from '@/lib/filter';
import { inFolders, stepFrom } from '@/lib/status';
import { save } from '@/lib/storage';
import { kindOf } from '@/lib/text';
import { get, isFolder, set, type State } from './store';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Whether the search and filters leave a file in the tree. A folder has no review states to filter: the search only. */
export const shown = (s: State = get()) => (f: FileRow) => passes(f, isFolder(s) ? [] : s.filterOff, s.query);
/** The tree's folders, the n / N position and stepping follow this list: committed and rejected files have their own sections; the search and filters narrow it. */
export const visible = (s: State = get()) => s.files.filter((f) => inFolders(f) && shown(s)(f));
export const entry = (s: State = get()) => s.files.find((f) => f.path === s.current?.path);
/** What Send all posts: every file's drafts except files the agent is working on. */
export function sendable(s: State = get()): [comments: number, files: number] {
  const live = s.files.filter((f) => f.drafts && f.state !== 'working' && f.state !== 'rejected');
  return [live.reduce((n, f) => n + f.drafts, 0), live.length];
}
/** An open editor, composer, note edit or element mark is never replaced under the user. */
const busy = (s: State) => !!(s.editing || s.composer || s.noteEdit || s.mark);

export async function loadAll() {
  const { drafts, edits } = await api<DraftsResponse>('drafts');
  set({ allDrafts: drafts, allEdits: edits });
}

let lastList = '';
export async function refresh() {
  let res: FilesResponse;
  try {
    res = await api<FilesResponse>('files');
  } catch {
    // Disconnected: say so; drafts stay in the page.
    if (!get().offline) set({ offline: true });
    return;
  }
  const s = get();
  const key = JSON.stringify(res);
  if (key !== lastList || s.offline) {
    lastList = key;
    set({ files: res.files, question: res.question, offline: false, loaded: true });
    if (s.current && !busy(s) && get().scope === 'all') await loadAll().catch(() => {});
  }
  const now = get();
  if (now.current && !busy(now)) {
    const fresh = await api<FileResponse>(`file?path=${encodeURIComponent(now.current.path)}`).catch(() => null);
    // Against what the server last said: the page may show unsaved text, or a version read-only.
    if (fresh && fresh.path === get().current?.path && fresh.path === disk?.path && !busy(get()) && (fresh.hash !== disk.hash || fresh.locked !== disk.locked)) show(fresh);
  }
}

let opening: string | null = null;
export async function open(path: string) {
  opening = path;
  let file: FileResponse;
  try {
    file = await api<FileResponse>(`file?path=${encodeURIComponent(path)}`);
  } catch (e) {
    if (opening === path) toast(errText(e));
    return;
  }
  if (opening !== path) return; // a later click won
  show(file);
  lastList = '';
  await refresh();
}

/** The open file as the server last sent it; `current` is what the page shows of it. */
let disk: FileResponse | null = null;

/** What the page shows of `file`: a version or Compare, read-only with Show new marks against its base; else a folder's unsaved text; else the disk's. */
function compose(file: FileResponse, s: State): NonNullable<State['current']> {
  const view = s.view?.path === file.path ? s.view : null;
  const text = view?.text ?? (isFolder(s) ? s.unsaved[file.path]?.text : undefined) ?? file.text;
  return { ...file, kind: kindOf(file.path, file.kind), text, ...(view ? { base: view.base, since: null, locked: true } : {}) };
}

export function show(file: FileResponse) {
  disk = file;
  const s = get();
  const same = file.path === s.current?.path;
  const view = same ? s.view : null;
  set({
    current: compose(file, { ...s, view }),
    view,
    conflict: same ? s.conflict : null,
    editing: null,
    pick: null,
    // A composer belongs to the file it was opened on.
    composer: same ? s.composer : null,
    noteEdit: same ? s.noteEdit : null,
    rejecting: same && s.rejecting,
  });
}

/** Open a file and bring its tree row into view, opening its folder if it was closed. */
/** The file in the system's file manager, opened by the server. */
export const showInFolder = (path: string) => api('reveal', { path }).catch((e: Error) => toast.error(e.message));

export async function reveal(path: string) {
  // Every folder above it opens, the root ('') included.
  const above = (d: string) => d === '' || path.startsWith(`${d}/`);
  set((s) => ({ closedDirs: s.closedDirs.filter((d) => !above(d)) }));
  await open(path);
  requestAnimationFrame(() => document.querySelector('[data-tree-row][aria-current]')?.scrollIntoView({ block: 'nearest' }));
}

/** Next or previous in the visible list, skipped files passed over; works when the open file just left the view. */
export function step(dir: 1 | -1) {
  const s = get();
  const next = stepFrom(s.files, s.current?.path, dir, shown(s));
  if (next) void open(next.path);
}

/** The next file still waiting for review after the open one, wrapping, in the visible list. */
export function nextPending(s: State = get()) {
  const at = s.files.findIndex((f) => f.path === s.current?.path);
  const list = visible(s);
  return [...list.filter((f) => s.files.indexOf(f) > at), ...list.filter((f) => s.files.indexOf(f) < at)].find((f) => f.state === 'queue');
}

/** Accept stages only the version on screen; if the file changed since, reload it and say so. */
export async function accept(andNext: boolean) {
  const { current } = get();
  if (!current) return;
  const next = andNext && nextPending();
  try {
    await api('accept', { path: current.path, hash: current.hash });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) await open(current.path);
    toast(errText(e));
    return;
  }
  if (next) await open(next.path);
  else await refresh();
}

/** Accept every pending file in view at once; skipped, locked and rejected files stay as they are. */
export async function acceptAll() {
  const paths = visible(get()).filter((f) => f.state === 'queue').map((f) => f.path);
  if (!paths.length) return;
  try {
    const { accepted } = await api<{ accepted: number }>('accept-all', { paths });
    toast(`Accepted ${accepted} ${accepted === 1 ? 'file' : 'files'}`);
  } catch (e) {
    toast(errText(e));
  }
  await refresh();
}

/** Whether Create PR applies: nothing waits for review and something staged is not yet committed. */
export const prReady = (files: FileRow[]) =>
  files.some((f) => f.state === 'accepted' && !f.committed) && !files.some((f) => f.state === 'queue' || f.state === 'working');

/** Ask the agent to commit the staged files and open a pull request; Trove itself never commits. */
export async function createPr(agent: string) {
  await api('pr', {}).then(() => toast(`Asked ${agent} to open a pull request`), (e) => toast(errText(e)));
}

/** Skip: come back to it later, moving on to the next pending file. Unskip stays. No git effect. */
export async function skip(on: boolean) {
  const { current } = get();
  if (!current) return;
  const next = on && nextPending();
  await api('skip', { path: current.path, on }).catch((e) => toast(errText(e)));
  if (next) await open(next.path);
  else await refresh();
}

/** Reject the version on screen: out of the change set, backed up for Restore. Moves on to the next pending file. */
export async function reject() {
  const { current } = get();
  if (!current) return;
  const next = nextPending();
  try {
    await api('reject', { path: current.path, hash: current.hash });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) await open(current.path);
    toast(errText(e));
    return;
  }
  toast('Rejected');
  await open(next ? next.path : current.path);
}

export async function restore() {
  const { current } = get();
  if (!current) return;
  await api('restore', { path: current.path }).catch((e) => toast(errText(e)));
  await open(current.path);
}

export async function post(route: 'unaccept' | 'release') {
  const { current } = get();
  if (!current) return;
  await api(route, { path: current.path }).catch((e) => toast(errText(e)));
  await refresh();
}

/** Revert all edits: back to the text before this review's first Save, while the file is still what that Save wrote. */
export async function revertAll() {
  const { current } = get();
  if (!current) return;
  await api('revert', { path: current.path }).then(() => toast('Edits reverted'), (e) => toast(errText(e)));
  await open(current.path);
}

/** Put one edited block back as it was; nothing else in the file changes, nothing is staged. */
export async function revertEdit(path: string, x: BlockEdit) {
  const { current } = get();
  try {
    await api('revert', { path, edit: x.id, ...(path === current?.path ? { hash: current.hash } : {}) });
    toast('Edit reverted');
  } catch (e) {
    toast(errText(e));
  }
  if (path === current?.path) await open(path);
  else {
    await loadAll().catch(() => {});
    await refresh();
  }
}

/** Write a file's drafts. The open file's list lives on `current`. */
export async function saveDrafts(path: string, drafts: Draft[]) {
  const s = get();
  if (path === s.current?.path) set({ current: { ...s.current, drafts: [...drafts] } });
  else set({ allDrafts: { ...s.allDrafts, [path]: [...drafts] } });
  try {
    await api('drafts', { path, drafts });
  } catch (e) {
    if (e instanceof ApiError) toast(errText(e));
  }
  if (get().scope === 'all' || path !== s.current?.path) await loadAll().catch(() => {});
  await refresh();
}

/** Add the composer's comment, or `draft` (an element mark, which has no composer). */
export function addComment(note: string, draft?: Pick<Draft, 'kind' | 'anchor'>) {
  const { composer, current } = get();
  const d = draft ?? composer;
  if (!note || !d || !current) return;
  if (!draft) set({ composer: null });
  void saveDrafts(current.path, [...current.drafts, { kind: d.kind, note, anchor: d.anchor }]);
}

/** Save an edit (hash-checked). Returns an error to show in the editor, or null once saved and reloaded. A folder's edit is only kept, as unsaved. */
export async function saveEdit(index: number | null, raw: string): Promise<string | null> {
  const { current, editing } = get();
  if (!current || !editing) return null;
  if (isFolder(get())) {
    let text = raw;
    if (index != null) try { text = splice(current.text, index, raw); } catch { return `No block ${index}`; }
    keep(current.path, text);
    set({ editing: null });
    if (disk) show(disk);
    return null;
  }
  try {
    await api('save', { path: current.path, hash: editing.hash, ...(index == null ? {} : { index }), raw });
  } catch (e) {
    return e instanceof ApiError && e.status === 409 ? `${e.message}. Copy your text, then Cancel to reload.` : errText(e);
  }
  await open(current.path);
  return null;
}

// ---- a folder's unsaved edits, Save and versions -----------------------------------------------

/** The page's copy at once; the server's (unsaved.json) after, so the edits outlive a restart. */
function setUnsaved(path: string, edit: UnsavedEdit | null) {
  const unsaved = { ...get().unsaved };
  if (edit) unsaved[path] = edit;
  else delete unsaved[path];
  set({ unsaved });
  void api('unsaved', { path, edit }).catch((e) => toast(errText(e)));
}
/** `text` as the open file's unsaved text, based on what is on disk when the first edit was kept; back to that text is no edit. */
function keep(path: string, text: string) {
  if (disk?.path !== path) return;
  const from = get().unsaved[path] ?? { was: disk.text, base: disk.hash };
  setUnsaved(path, text === from.was ? null : { text, base: from.base, was: from.was });
}
const reshow = () => { if (disk) show(disk); };

/** The blocks of `text` that `base` lacks (markdown), else the whole file as one. */
export function unsavedBlocks(text: string, base: string, kind: DocKind): number[] {
  if (kind !== 'markdown') return text === base ? [] : [0];
  const old = new Set(blocks(base).map((b) => b.raw.trimEnd()));
  return blocks(text).flatMap((b, i) => (old.has(b.raw.trimEnd()) ? [] : [i]));
}

/** Write the open file's unsaved text, hash-checked against the disk it was based on (`hash`: Save mine, over the agent's). Changed since: the conflict dialog. */
export async function saveFile(hash?: string) {
  const { current, unsaved } = get();
  const buf = current && unsaved[current.path];
  if (!current || !buf) return;
  const q = `path=${encodeURIComponent(current.path)}`;
  try {
    await api('save', { path: current.path, hash: hash ?? buf.base, raw: buf.text });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409 && e.hash)) return void toast(errText(e));
    const [theirs, versions] = await Promise.all([api<FileResponse>(`file?${q}`), api<Version[]>(`versions?${q}`).catch(() => [])]);
    set({ conflict: { text: theirs.text, hash: theirs.hash, at: versions.find((v) => v.by === 'agent')?.at ?? null }, view: null });
    return;
  }
  set({ unsaved: Object.fromEntries(Object.entries(get().unsaved).filter(([p]) => p !== current.path)), view: null, conflict: null }); // the server cleared its copy
  await open(current.path);
}

/** Don't save, or Keep the agent's: drop the open file's unsaved edits. */
export function discard() {
  const { current } = get();
  if (current) setUnsaved(current.path, null);
  set({ view: null, conflict: null });
  reshow();
}

/** The agent's text, marked against yours, read-only; the rail keeps Keep theirs and Save mine. */
export function compare() {
  const { current, conflict, unsaved } = get();
  const buf = current && unsaved[current.path];
  if (!current || !conflict || !buf) return;
  set({ view: { path: current.path, n: null, text: conflict.text, base: buf.text } });
  reshow();
}

export const versionsOf = (path: string) => api<Version[]>(`versions?path=${encodeURIComponent(path)}`);

/** The open file marked against version `n`, read-only, until Restore or Esc. */
export async function pickVersion(n: number) {
  const { current } = get();
  if (!current || !disk) return;
  let v: VersionText;
  try { v = await api<VersionText>(`version?path=${encodeURIComponent(current.path)}&n=${n}`); } catch (e) { return void toast(errText(e)); }
  set({ view: { path: current.path, n, text: get().unsaved[current.path]?.text ?? disk.text, base: v.text, by: v.by, at: v.at } });
  reshow();
}

/** The picked version's text becomes the open file's unsaved edits: Save or Don't save from there. */
export function restoreVersion() {
  const { view } = get();
  if (!view || view.n == null) return;
  set({ view: null });
  keep(view.path, view.base);
  reshow();
}

export function closeView() {
  set({ view: null });
  reshow();
}

export const cancelEdit = () => {
  const { current } = get();
  set({ editing: null });
  if (current) void open(current.path);
};

/** A failed send keeps every draft; a dead server shows as Disconnected, anything else as a toast. */
export async function send(filter: SendBody) {
  await api('send', filter).catch((e) => e instanceof ApiError && toast(errText(e)));
  const { current } = get();
  if (current) await open(current.path);
  else await refresh();
}

export async function dismissQuestion() {
  await api('ask', { text: '' }).then(() => set({ question: null }), () => {});
}

export function setScope(scope: 'file' | 'all') {
  set({ scope });
  save('scope', scope);
  if (scope === 'all') void loadAll().catch(() => {});
}

export function togglePanel(name: keyof State['hidden'], hide?: boolean) {
  set((s) => ({ hidden: { ...s.hidden, [name]: hide ?? !s.hidden[name] } }));
  save(`hide-${name}`, get().hidden[name]);
}

export function setFilters(off: FilterKey[]) {
  set({ filterOff: normalizeOff(off) });
  save('filters-off', get().filterOff);
}

/** `/`: show the Files column if hidden and put the cursor in its search. */
export function focusSearch() {
  togglePanel('files', false);
  requestAnimationFrame(() => document.getElementById('file-search')?.focus());
}

export function setShowNew(on: boolean) {
  set({ showNew: on });
  save('show-new', on);
}

export async function saveSettings(patch: Partial<Settings>) {
  const settings = await api<Settings>('settings', patch);
  set({ settings });
  if ('showNew' in patch) setShowNew(settings.showNew);
  lastList = '';
  await refresh();
}

let lastGit = '';
export async function loadGit() {
  const git = await optional<GitInfo>('git').catch(() => undefined);
  if (git === undefined || JSON.stringify(git) === lastGit) return;
  lastGit = JSON.stringify(git);
  set({ git });
}

/** The desktop's recents, each probed for its uncommitted doc changes. */
export async function loadRecents() {
  const bridge = window.trove;
  if (!bridge) return;
  const list = await bridge.recents().catch(() => []);
  const probes = await Promise.all(list.map((r) => bridge.probe(r.path).catch(() => null)));
  set({ recents: list.map((r, k) => {
    const git = probes[k]?.git;
    return { ...r, changes: git ? git.worktrees.find((w) => w.current)?.changes ?? 0 : r.kind === 'folder' && probes[k] ? 0 : null };
  }) });
}

/** A recent in its own window as it was last opened: its file selected in its folder, else with its kind and scope. */
export async function openRecent(r: Recent) {
  await window.trove?.open(r.file ? { path: r.file } : { path: r.path, scope: r.scope, base: r.base, kind: r.kind }).catch((e) => toast(errText(e)));
}

/** Another worktree is another root: a new window on the desktop, else a dialog with the command that serves it. */
export async function openWorktree(path: string) {
  if (window.trove) await window.trove.open({ path }).catch((e) => toast(errText(e)));
  else set({ serveRoot: path });
}

/** `git switch <branch>` here, then everything on the page follows the new branch. Git's refusal is the toast. */
export async function switchBranch(branch: string) {
  let git: GitInfo;
  try {
    git = await api<GitInfo>('switch', { branch });
  } catch (e) {
    if (e instanceof ApiError && typeof e.data.worktree === 'string') return openWorktree(e.data.worktree);
    toast(errText(e));
    return;
  }
  lastGit = JSON.stringify(git);
  const [source, settings] = await Promise.all([optional<SourceInfo>('source').catch(() => null), optional<Settings>('settings').catch(() => null)]);
  set({ git, ...(source ? { source } : {}), ...(settings ? { settings } : {}) });
  lastList = '';
  await refresh();
  // An open edit keeps its text: its Save is hash-checked against the file on this branch.
  const s = get();
  if (!busy(s)) {
    const keep = s.current && s.files.some((f) => f.path === s.current!.path) ? s.current.path : null;
    const next = keep ?? s.files.find((f) => f.state === 'queue' || f.state === 'working')?.path;
    if (next) await open(next);
    else set({ current: null });
  }
  toast(`On ${branch}`);
}

/** Bring a comment's row into view in Changes and flash it. */
export function focusComment(n: number) {
  togglePanel('changes', false);
  requestAnimationFrame(() => flash(document.querySelector(`[data-note="${n}"]`), 'nearest'));
}
export function flash(el: Element | null | undefined, block: ScrollLogicalPosition = 'center') {
  if (!el) return;
  el.scrollIntoView({ block, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.remove('flash');
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add('flash');
}

/** The file the address asks for: `?file=` (a window or the CLI opening a file) or `#file=` (the desktop opening one in a window already open). */
const asked = () => new URLSearchParams(location.hash.slice(1)).get('file') ?? new URLSearchParams(location.search).get('file');

let started = false;
export async function init() {
  if (started) return; // StrictMode runs effects twice in development
  started = true;
  const [source, settings] = await Promise.all([
    optional<SourceInfo>('source').catch(() => null),
    optional<Settings>('settings').catch(() => null),
  ]);
  set({ source, ...(settings ? { settings, hasSettings: true } : {}) });
  if (source?.kind === 'folder') set({ unsaved: await api<Record<string, UnsavedEdit>>('unsaved').catch(() => ({})) });
  // The desktop asks before closing a window with unsaved edits (main's will-prevent-unload); the server keeps them either way.
  addEventListener('beforeunload', (e) => { if (window.trove && Object.keys(get().unsaved).length) e.preventDefault(); });
  // Show new: what this browser last chose, else the source's default.
  const remembered = localStorageHas('show-new');
  if (settings && !remembered) set({ showNew: settings.showNew });
  await Promise.all([refresh(), loadGit()]);
  const waiting = (f: FileRow) => f.state === 'queue' || f.state === 'working';
  const first = asked() ?? (visible().find(waiting) ?? get().files.find(waiting))?.path; // the remembered filters may hide every waiting file
  if (first) await reveal(first);
  addEventListener('hashchange', () => {
    const path = asked();
    history.replaceState(null, '', location.pathname + location.search); // so asking for the same file again is a change
    if (path) void reveal(path);
  });
  if (!get().hidden.changes) void loadActivity();
  setInterval(() => { void refresh(); void loadGit(); void loadSource(); if (!get().hidden.changes) void loadActivity(); }, 2000);
}
/** The Changes thread's activity; an old server without /api/activity has none. */
export async function loadActivity() {
  const res = await optional<ActivityResponse>('activity').catch(() => undefined);
  if (res !== undefined && JSON.stringify(res?.entries ?? []) !== JSON.stringify(get().activity)) set({ activity: res?.entries ?? [] });
}
/** A message to the agent from History, new or a reply; it reaches the agent as one events-log line. False when it failed (a toast says why). */
export async function sendMessage(body: MessageBody) {
  try {
    await api('message', body);
  } catch (e) {
    toast(errText(e));
    return false;
  }
  await loadActivity();
  return true;
}
/** The attached agent changes under the page (`trove attach`, `detach`): its colour and name follow. */
async function loadSource() {
  const source = await optional<SourceInfo>('source').catch(() => null);
  if (source && JSON.stringify(source) !== JSON.stringify(get().source)) set({ source });
}
function localStorageHas(key: string) {
  try { return localStorage.getItem(`trove:${key}`) != null; } catch { return false; }
}

export type { CommentKind };
