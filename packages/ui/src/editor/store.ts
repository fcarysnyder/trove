// One small store for the editor. Actions (actions.ts) read and write it directly, so the 2s poll
// always sees the latest state; components subscribe to slices with useStore.
import type { Activity, Anchor, BlockEdit, CommentKind, Draft, FileResponse, FileRow, GitInfo, Question, Recent, Settings, SourceInfo, UnsavedEdit, VersionBy } from '@trove/core/types';
import { AGENT_LABELS, DEFAULT_SETTINGS } from '@trove/core/types';
import type { AnchorHit } from '@trove/core/anchor';
import { useSyncExternalStore } from 'react';
import { load } from '@/lib/storage';
import { normalizeOff, type FilterKey } from '@/lib/filter';
import { names, type Names } from '@/lib/status';
import type { Mark, Pt, Tool } from './doc/annotate';

export interface Editing {
  index: number | null; // null: the whole file (HTML, plain text)
  hash: string; // the file's hash when editing started; Save sends it
  mode: 'inline' | 'modal';
  value: string; // the source the editor opened with
  title?: string; // modal title
  style?: Record<string, string>; // inline: the rendered block's type, so the source is set the way it reads
}


/** The open file shown read-only with Show new marks: a version (`n`) against the text open now, or the agent's text against yours (Compare, n null). */
export interface View { path: string; n: number | null; text: string; base: string; by?: VersionBy; at?: string }

export interface Pick {
  anchor: Anchor;
  text: string;
  range: Range;
  block: number | null; // markdown block index; null in the HTML frame
}

/** A control of the HTML page's own, hidden there and offered on the annotate toolbar: its label and the element it clicks. */
export interface PageTool { label: string; el: HTMLElement }

export interface State {
  source: SourceInfo | null; // null: an old server without /api/source
  git: GitInfo | null; // null: a server without /api/git
  serveRoot: string | null; // another worktree to serve: the dialog with its `trove serve` command is open
  switcher: 'repo' | 'worktree' | 'branch' | null; // the repository popover's open tab
  recents: (Recent & { changes: number | null })[]; // the desktop's recents with their uncommitted doc changes; null: no longer a repository
  settings: Settings;
  hasSettings: boolean;
  files: FileRow[];
  question: Question | null;
  loaded: boolean;
  offline: boolean;
  current: (FileResponse & { kind: NonNullable<FileResponse['kind']> }) | null;
  allDrafts: Record<string, Draft[]>;
  allEdits: Record<string, BlockEdit[]>;
  hits: (AnchorHit | null)[]; // where each of the open file's comments sits, from the document view
  editing: Editing | null;
  composer: { kind: CommentKind; anchor: Anchor; range: Range } | null; // range: where the popover sits
  noteEdit: Draft | null; // the comment whose note is being edited, by identity
  pick: Pick | null;
  filterOff: FilterKey[]; // filters turned off: those files leave the tree (persisted)
  query: string; // the Files search (page state, not persisted)
  scope: 'file' | 'all';
  showNew: boolean;
  htmlView: 'preview' | 'source'; // an HTML file shows rendered or as text
  drawer: boolean; // the agent's terminal drawer is open (desktop)
  landing: string | null; // the Stack handoff: the newest turn before a send; the next turn to appear lands
  hidden: { files: boolean; changes: boolean };
  activity: Activity[]; // the top of the Changes thread, loaded while the column shows
  committedOpen: boolean;
  rejectedOpen: boolean;
  rejecting: boolean; // the open file's Reject confirm is showing
  closedDirs: string[];
  settingsOpen: boolean;
  unsaved: Record<string, UnsavedEdit>; // a folder's unsaved edits by path, kept by the server (unsaved.json)
  view: View | null;
  conflict: { text: string; hash: string; at: string | null } | null; // Save found the file changed on disk: the agent's text, its hash, when
  // Marking an HTML file (doc/annotate.ts)
  tool: Tool;
  pageTools: PageTool[]; // the HTML page's own controls marked data-trove-toolbar, shown on the annotate toolbar
  mark: Mark | null; // its note card is open
  markKind: CommentKind; // what the card adds: a change or a question
  hover: Element | null; // the Pointer's outline
  drawing: Pt[] | null; // a loop being drawn, document coordinates
  flash: { k: number; at: number } | null; // a comment's elements, outlined for a moment
}

let state: State = {
  source: null,
  git: null,
  serveRoot: null,
  switcher: null,
  recents: [],
  settings: DEFAULT_SETTINGS,
  hasSettings: false,
  files: [],
  question: null,
  loaded: false,
  offline: false,
  current: null,
  allDrafts: {},
  allEdits: {},
  hits: [],
  editing: null,
  composer: null,
  noteEdit: null,
  pick: null,
  filterOff: normalizeOff(load<unknown>('filters-off', [])),
  query: '',
  scope: load<'file' | 'all'>('scope', 'file') === 'all' ? 'all' : 'file',
  showNew: load<boolean | null>('show-new', null) ?? true,
  htmlView: 'preview',
  drawer: false,
  landing: null,
  hidden: { files: load<boolean>('hide-files', false) === true, changes: load<boolean>('hide-changes', false) === true},
  activity: [],
  committedOpen: false,
  rejectedOpen: false,
  rejecting: false,
  closedDirs: [],
  settingsOpen: false,
  unsaved: {},
  view: null,
  conflict: null,
  tool: 'text',
  pageTools: [],
  mark: null,
  markKind: 'change',
  hover: null,
  drawing: null,
  flash: null,
};

const listeners = new Set<() => void>();
export const get = () => state;
export function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const useStore = <T,>(pick: (s: State) => T): T => useSyncExternalStore(subscribe, () => pick(state));

/** The attached agent's label; a server without agentInfo says only claude or other, and one without /api/source was Claude's. */
const labelOf = (s: SourceInfo | null) => s?.agentInfo?.label ?? AGENT_LABELS[s?.agent ?? 'claude'];
export const useNames = (): Names => names(useStore((s) => labelOf(s.source)));
/** The source is a folder: edited in place, with no review state. */
export const isFolder = (s: State) => s.source?.kind === 'folder';
export const useFolder = () => useStore(isFolder);
