// The editor's behaviour, ported from the old page's script: polling, opening, stepping, accepting,
// drafts, edits and sending. Components call these; they read and write the store.
import type { ActivityResponse, BlockEdit, CommentKind, Draft, DraftsResponse, FileResponse, FileRow, FilesResponse, GitInfo, Recent, SendBody, Settings, SourceInfo } from '@trove/core/types';
import { toast } from 'sonner';
import { api, ApiError, optional } from '@/lib/api';
import { passes, normalizeOff, type FilterKey } from '@/lib/filter';
import { inFolders, stepFrom } from '@/lib/status';
import { save } from '@/lib/storage';
import { kindOf } from '@/lib/text';
import { get, set, type State } from './store';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Whether the search and filters leave a file in the tree. */
export const shown = (s: State = get()) => (f: FileRow) => passes(f, s.filterOff, s.query);
/** The tree's folders, the n / N position and stepping follow this list: committed and rejected files have their own sections; the search and filters narrow it. */
export const visible = (s: State = get()) => s.files.filter((f) => inFolders(f) && shown(s)(f));
export const entry = (s: State = get()) => s.files.find((f) => f.path === s.current?.path);
/** What Send all posts: every file's drafts except files the agent is working on. */
export function sendable(s: State = get()): [comments: number, files: number] {
  const live = s.files.filter((f) => f.drafts && f.state !== 'working' && f.state !== 'rejected');
  return [live.reduce((n, f) => n + f.drafts, 0), live.length];
}
/** An open editor, composer or note edit is never replaced under the user. */
const busy = (s: State) => !!(s.editing || s.composer || s.noteEdit);

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
    const cur = get().current;
    if (fresh && fresh.path === cur?.path && !busy(get()) && (fresh.hash !== cur.hash || fresh.locked !== cur.locked)) show(fresh);
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

export function show(file: FileResponse) {
  const s = get();
  const same = file.path === s.current?.path;
  set({
    current: { ...file, kind: kindOf(file.path, file.kind) },
    editing: null,
    pick: null,
    // A composer belongs to the file it was opened on.
    composer: same ? s.composer : null,
    noteEdit: same ? s.noteEdit : null,
    rejecting: same && s.rejecting,
  });
}

/** Open a file and bring its tree row into view, opening its folder if it was closed. */
export async function reveal(path: string) {
  const dir = path.split('/').slice(0, -1).join('/');
  set((s) => ({ closedDirs: s.closedDirs.filter((d) => d !== dir) }));
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

export function addComment(note: string) {
  const { composer, current } = get();
  if (!note || !composer || !current) return;
  set({ composer: null });
  void saveDrafts(current.path, [...current.drafts, { kind: composer.kind, note, anchor: composer.anchor }]);
}

/** Save an edit (hash-checked). Returns an error to show in the editor, or null once saved and reloaded. */
export async function saveEdit(index: number | null, raw: string): Promise<string | null> {
  const { current, editing } = get();
  if (!current || !editing) return null;
  try {
    await api('save', { path: current.path, hash: editing.hash, ...(index == null ? {} : { index }), raw });
  } catch (e) {
    return e instanceof ApiError && e.status === 409 ? `${e.message}. Copy your text, then Cancel to reload.` : errText(e);
  }
  await open(current.path);
  return null;
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
    return { ...r, changes: git ? git.worktrees.find((w) => w.current)?.changes ?? 0 : null };
  }) });
}

/** A recent repository in its own window, with the scope it was last opened with. */
export async function openRecent(r: Recent) {
  await window.trove?.open({ path: r.path, scope: r.scope, base: r.base }).catch((e) => toast(errText(e)));
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

let started = false;
export async function init() {
  if (started) return; // StrictMode runs effects twice in development
  started = true;
  const [source, settings] = await Promise.all([
    optional<SourceInfo>('source').catch(() => null),
    optional<Settings>('settings').catch(() => null),
  ]);
  set({ source, ...(settings ? { settings, hasSettings: true } : {}) });
  // Show new: what this browser last chose, else the source's default.
  const remembered = localStorageHas('show-new');
  if (settings && !remembered) set({ showNew: settings.showNew });
  await Promise.all([refresh(), loadGit()]);
  const waiting = (f: FileRow) => f.state === 'queue' || f.state === 'working';
  const first = visible().find(waiting) ?? get().files.find(waiting); // the remembered filters may hide every waiting file
  if (first) await open(first.path);
  if (!get().hidden.changes) void loadActivity();
  setInterval(() => { void refresh(); void loadGit(); void loadSource(); if (!get().hidden.changes) void loadActivity(); }, 2000);
}
/** The Changes thread's activity; an old server without /api/activity has none. */
export async function loadActivity() {
  const res = await optional<ActivityResponse>('activity').catch(() => undefined);
  if (res !== undefined && JSON.stringify(res?.entries ?? []) !== JSON.stringify(get().activity)) set({ activity: res?.entries ?? [] });
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
