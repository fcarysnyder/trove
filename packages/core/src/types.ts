// The contract every Trove package builds against: doc types, settings, review states, the HTTP
// API's request and response shapes, and the desktop bridge. Pure types, constants and string helpers, no imports,
// so the browser UI and the Electron preload can both use it.

/** How a file is rendered and edited. */
export type DocKind = 'markdown' | 'html' | 'text';

export interface DocType {
  id: string;
  label: string;
  extensions: string[]; // lower-case, with the dot
  kind: DocKind;
  enabled: boolean; // the default; Settings.types overrides per source
}

/** The built-in document types. Settings.types turns each on or off. */
export const DEFAULT_DOC_TYPES: readonly DocType[] = [
  { id: 'md', label: 'Markdown', extensions: ['.md', '.markdown'], kind: 'markdown', enabled: true },
  { id: 'html', label: 'HTML', extensions: ['.html', '.htm'], kind: 'html', enabled: true },
  { id: 'mdx', label: 'MDX', extensions: ['.mdx'], kind: 'markdown', enabled: false },
  { id: 'txt', label: 'Plain text', extensions: ['.txt'], kind: 'text', enabled: false },
];

export type Theme = 'system' | 'light' | 'dark';

/**
 * What a git source lists. `uncommitted`: files whose working copy differs from the index, plus
 * untracked ones (today's behaviour). `branch`: those plus every file the branch changed since its
 * merge-base with `base`; committed and unmodified ones show as accepted, and can still be read,
 * commented on and edited.
 */
export type GitScope = 'uncommitted' | 'branch';

export interface Settings {
  /** doc type id -> enabled. Missing ids fall back to DEFAULT_DOC_TYPES[].enabled. */
  types: Record<string, boolean>;
  /** Glob pathspecs left out of the queue (git `:(exclude,glob)` syntax). */
  exclude: string[];
  theme: Theme;
  scope: GitScope;
  /** Branch mode's base ref. null = auto: origin/HEAD, then main, then master. */
  base: string | null;
  /** Show new on by default. */
  showNew: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  types: {},
  exclude: [],
  theme: 'system',
  scope: 'uncommitted',
  base: null,
  showNew: true,
};

/**
 * The server's review state of a file, first match wins: working, rejected, accepted, skipped, queue.
 * The UI derives finer labels from the row (see anchor stateOf).
 */
export type FileState = 'working' | 'rejected' | 'accepted' | 'skipped' | 'queue';

export interface FileEntry {
  path: string; // relative to the source root, forward slashes
  kind: DocKind;
  untracked: boolean; // `??`
  staged: boolean; // the index matches the working copy
  committed?: boolean; // the staged copy got committed while the review was open
  skipped?: boolean; // the user will come back to it; the editor's mark only, no git effect
  rejected?: boolean; // taken out of the change set (back to HEAD, or deleted); listed from its backup until restored
}

export interface FileRow extends FileEntry {
  state: FileState;
  updated: boolean; // the agent changed it after a send; cleared by Accept
  edited: boolean; // the user saved an edit in this review
  drafts: number; // unsent comments
}

export interface Anchor {
  quote: string;
  prefix: string;
  suffix: string;
  path: string[]; // heading path above the passage
  raw: string; // up to 400 chars of the block's source (HTML: outerHTML around the selection)
}

export type CommentKind = 'change' | 'explain';

export interface Draft {
  kind: CommentKind;
  note: string;
  anchor: Anchor;
  at?: string; // ISO time
}

export interface BlockEdit {
  id: string;
  before: string;
  after: string;
  path: string[];
  index: number | null; // null: the whole file (HTML)
  at: number; // offset of the block when saved
  time: string;
  ok?: boolean; // the `after` text is still in the file (so it can be reverted)
}

export interface Question {
  text: string;
  kind: 'question' | 'reply';
  at: string;
}

/** Who is on the other end of the review loop. 'other' is any agent that is not Claude Code or Codex. */
export type AgentId = 'claude' | 'codex' | 'other';
/** A tool the desktop can start a session in. */
export type AgentTool = 'claude' | 'codex';
/** A macOS terminal app the desktop starts an agent in. */
export type TerminalApp = 'Terminal' | 'iTerm' | 'Ghostty' | 'WezTerm' | 'kitty' | 'Alacritty';
/**
 * The agent attached to a server, set by `trove attach` (POST /api/agent) and kept in state.json.
 * With nothing attached: {id: 'other', label: 'the agent', connected: false, at: null}.
 */
export interface AgentInfo { id: AgentId; label: string; connected: boolean; at: string | null }
/** The label an agent gets when attach names none. */
export const AGENT_LABELS: Record<AgentId, string> = { claude: 'Claude', codex: 'Codex', other: 'the agent' };

/** The one-line prompt that starts an agent session attached to the server on `port`. */
export const attachPrompt = (port: number | string) =>
  `Start the markdown-editor skill attached to the Trove server already running on port ${port}: run its attach command instead of serve, stream the events log it prints, and handle batches as the skill says.`;
/** The shell command that starts `tool` in `root` with attachPrompt; `exec` replaces the shell (the desktop's Terminal script). */
export const attachCommand = (tool: AgentTool, root: string, port: number | string, exec = false) =>
  `cd '${root.replaceAll("'", "'\\''")}' && ${exec ? 'exec ' : ''}${tool} "${attachPrompt(port)}"`;

/** A repository's main working tree: the first entry of `git worktree list`. */
export interface RepoRef { root: string; name: string }
/** The worktree a root is: its folder's basename, its branch (null when detached), and whether it is the main checkout. */
export interface WorktreeRef { path: string; name: string; branch: string | null; main: boolean }

export interface SourceInfo {
  kind: 'git';
  root: string; // absolute path of the git toplevel
  name: string; // last path segment, for titles
  repo: RepoRef; // the repository this root belongs to (its main checkout)
  worktree: WorktreeRef; // this root as a worktree of that repository
  branch: string | null; // current branch (null when detached)
  base: string | null; // branch scope: the resolved base ref
  scope: GitScope;
  agent: 'claude' | 'other'; // compatibility: agentInfo.id === 'claude' ? 'claude' : 'other'
  agentInfo: AgentInfo;
  port: number;
  stateDir: string; // where drafts, edits, batches and state live
  eventsLog: string;
  batchesLog: string;
  doneCommand: string; // what the agent runs after each file, e.g. `trove done <file> --port 4824`
}

// ---- HTTP API ------------------------------------------------------------------------------
// Every path below is relative to the server's origin. GET routes take query params; POST routes
// take a JSON body and require Origin to match the page's own origin. Errors are {error: string}
// with 400, 404, 409 (hash or lock conflict; may carry `hash`), 413, 415 or 500.

export interface FilesResponse { files: FileRow[]; question: Question | null } // GET /api/files
export interface DraftsResponse { drafts: Record<string, Draft[]>; edits: Record<string, BlockEdit[]> } // GET /api/drafts
export interface FileResponse { // GET /api/file?path=
  path: string;
  kind: DocKind;
  text: string;
  hash: string;
  base: string | null; // what Show new marks against (staged copy, else HEAD)
  since: string | null; // the text before the agent's last update, if any
  locked: boolean;
  drafts: Draft[];
  edited: boolean;
  revertable: boolean; // the file is still exactly what the user's last Save wrote
  edits: BlockEdit[];
  rejected?: boolean; // the backed-up text of a rejected file, read-only (locked); base is the file on disk now
}
export interface SaveDraftsBody { path: string; drafts: Draft[] } // POST /api/drafts -> {ok}
export interface AcceptBody { path: string; hash: string } // POST /api/accept -> {ok}
export interface UnacceptBody { path: string } // POST /api/unaccept -> {ok}
export interface AcceptAllBody { paths: string[] } // POST /api/accept-all -> {accepted: n}; unlisted, working and rejected paths are passed over; no hash
export interface SkipBody { path: string; on: boolean } // POST /api/skip -> {ok}; no git write
export interface RejectBody { path: string; hash: string } // POST /api/reject -> {ok}; tracked: back to HEAD, new: deleted; backed up first
export interface RestoreBody { path: string } // POST /api/restore -> {ok}; the index copy, the working text and the drafts come back
export interface SaveBody { path: string; hash: string; index?: number; raw: string } // POST /api/save -> {hash}
export interface RevertBody { path: string; edit?: string; hash?: string } // POST /api/revert -> {hash}
export interface SendBody { paths?: string[]; kind?: CommentKind } // POST /api/send
export interface SendResponse { id: string; comments: number; files: number; locked: string[] }
export interface PrResponse { id: string; files: number } // POST /api/pr {} -> 409 while a file waits for review (queue or working)
export interface AskBody { text: string; kind?: 'question' | 'reply' } // POST /api/ask -> {question}
export interface ReleaseBody { path: string } // POST /api/release -> {released, updated}
export interface AgentBody { id: AgentId | null; label?: string } // POST /api/agent -> AgentInfo; id null detaches
export type SourceResponse = SourceInfo; // GET /api/source
export type SettingsResponse = Settings; // GET /api/settings; POST /api/settings takes Partial<Settings>, returns Settings

/** A local branch. `worktree`: the absolute path of another worktree it is checked out in, else null. */
export interface BranchInfo { name: string; current: boolean; worktree: string | null; upstream?: string; lastCommit: string }
/** One worktree of the repository, main checkout first. `name`: the folder's basename. `changes`: its uncommitted doc paths, by its own settings (GitInfo and GitProbe only). */
export interface WorktreeInfo { path: string; name: string; branch: string | null; head: string; current: boolean; main: boolean; changes?: number }
/** GET /api/git: where the source stands, for the repository and branch switcher. */
export interface GitInfo {
  root: string;
  repo: RepoRef;
  worktree: WorktreeRef;
  branch: string | null; // null when detached
  head: string; // short sha; '' before the first commit
  branches: BranchInfo[];
  worktrees: WorktreeInfo[];
  dirty: number; // changed paths of the enabled doc types (staged or not)
  base: string | null; // branch scope: the resolved base ref
}
/**
 * POST /api/switch -> GitInfo. `git switch <branch>` in this worktree, nothing more: never stashes or
 * discards. 409 when the branch is checked out in another worktree (the body carries `worktree`, the
 * path to open instead), when the agent is working on a file, or with git's own message when git refuses.
 */
export interface SwitchBody { branch: string }

export interface BatchItem { path: string; kind: CommentKind; note: string; anchor: Anchor }
export interface Batch { id: string; sentAt: string; items: BatchItem[] } // one line of batches.jsonl

// ---- Desktop bridge --------------------------------------------------------------------------
// Exposed by the Electron preload as `window.trove` on the zero-state page (start.html) and in
// every repository window, where the switcher opens other worktrees and recents with it.

export interface GitProbe {
  branch: string | null;
  branches: string[]; // local and remote, for the base
  defaultBase: string | null; // what Settings.base = null would resolve to
  local: BranchInfo[]; // local branches, with the worktree each is checked out in
  worktrees: WorktreeInfo[]; // every worktree of the repository, main checkout first
  repo: RepoRef;
  worktree: WorktreeRef; // the probed path's own worktree
}

export interface Recent {
  path: string;
  name: string;
  kind: 'git';
  openedAt: string;
  scope?: GitScope;
  base?: string | null;
  agent?: AgentTool | null; // the last agent choice on the start page's Agent step
  repo?: string; // the repository's name (RepoRef.name)
  worktree?: string; // a linked worktree's name; absent for the main checkout
}

/** How a recent reads: `<repo> / <worktree>` for a linked worktree, `<repo>` for the main checkout, `name` for older entries. */
export const recentName = (r: Pick<Recent, 'name' | 'repo' | 'worktree'>) => (r.repo ? (r.worktree ? `${r.repo} / ${r.worktree}` : r.repo) : r.name);

/** `agent`: start the server, then a Terminal session of that tool attached to it, then the window. */
export interface OpenRequest { path: string; scope?: GitScope; base?: string | null; agent?: AgentTool | null }

export interface TroveBridge {
  /** Native folder picker. null when cancelled; `git` null when the folder is not in a git repository (it cannot be opened). */
  pickFolder(): Promise<{ path: string; git: GitProbe | null } | null>;
  /** Inspect a path (a recent, or a staged one) without opening it. null when it is not a folder; `git` null when it is not in a repository. */
  probe(path: string): Promise<{ path: string; git: GitProbe | null } | null>;
  /** Start a server for the repository and open it in a window; the zero-state window closes if it is the only one. Rejects `not a git repository: <path>` for anything else. */
  open(req: OpenRequest): Promise<void>;
  recents(): Promise<Recent[]>;
  forget(path: string): Promise<void>;
  /** Which agent CLIs are on the user's login-shell PATH. */
  tools(): Promise<Record<AgentTool, boolean>>;
  /** The terminal apps installed, and the one agents start in (the app setting, else Terminal). */
  terminals(): Promise<{ installed: TerminalApp[]; current: TerminalApp }>;
  /** Start agents in `t` from now on, in every window. Rejects when it is not installed. */
  setTerminal(t: TerminalApp): Promise<void>;
  /** Back to the start page: it opens (fresh) and the calling repository window closes. */
  home(): Promise<void>;
  /** Your GitHub repositories, most recently pushed first, from the gh CLI; empty without it. */
  githubRepos(): Promise<{ name: string; url: string; description: string }[]>;
  /** Clone `url` (a URL, or owner/repo) into `<parent>/<its name>` with gh when installed, else git; then that folder, probed. Rejects with the tool's message. */
  clone(url: string, parent: string): Promise<{ path: string; git: GitProbe | null }>;
  /** Where a clone goes when the user has not picked: ~/code when it exists, else home. */
  cloneDir(): Promise<string>;
  /** `branch` in a new worktree at `<parent>/<repo>/<name>`: a new branch off `base`, or with null an existing one no worktree has checked out. Then that folder, probed. Rejects with git's message. */
  addWorktree(path: string, branch: string, base: string | null, parent: string, name: string): Promise<{ path: string; git: GitProbe | null }>;
  /** `git switch` the checkout at `path` to `branch`, a new one off `base` or with null an existing one checked out nowhere; uncommitted changes come along. Then that checkout, probed. Rejects with git's reason. */
  switchBranch(path: string, branch: string, base: string | null): Promise<{ path: string; git: GitProbe | null }>;
  /** `git worktree remove` the linked worktree at `path` (its branch stays); its window closes and it leaves the recents. Rejects while it has uncommitted files. */
  removeWorktree(path: string): Promise<void>;
  /** Where new worktrees go: the app setting, else ~/.trove/worktrees. */
  worktreeDir(): Promise<string>;
  /** Make `path` (an existing folder) where new worktrees go, for every window; then that path. */
  setWorktreeDir(path: string): Promise<string>;
}

declare global {
  interface Window { trove?: TroveBridge }
}
