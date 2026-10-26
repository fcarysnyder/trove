// Public surface of @trove/core. The core agent fills in the implementation; the signatures here
// are the contract the CLI and the desktop app build against.
import type { Server } from 'node:http';
import type { FileEntry, GitProbe, GitScope, Settings, SourceInfo } from './types.js';

export * from './types.js';

export interface AppOptions {
  root: string; // a folder, or any path inside a git working tree
  scope?: GitScope; // git only; default from settings
  base?: string | null; // git branch scope's base; default from settings
  exclude?: string[]; // replaces Settings.exclude for this run
  quietMs?: number; // the quiet-release fallback, default 5000
  log?: (line: string) => void;
  uiDir?: string | null; // built UI to serve at `/` (index.html + assets); null serves the API only
  agent?: 'claude' | 'other'; // default: 'claude' when process.env.CLAUDECODE is set
  doneCommand?: (port: number) => string; // what SourceInfo.doneCommand prints; the CLI and the desktop set their own
}

export interface App {
  server: Server;
  /** Everything the page needs to know about where it is; `port` is 0 until the server listens. */
  info(): SourceInfo;
  settings(): Settings;
  list(): FileEntry[];
  /** Run once a second: releases locked files that changed and then stayed quiet. */
  tick(now?: number): void;
  close(): Promise<void>;
}

/** Build the server. Throws if `root` is neither a folder nor inside a git working tree. */
export declare function createApp(options: AppOptions): App;

/** Bind on 127.0.0.1. `port` 0 picks a free one. Resolves once listening. */
export declare function serve(options: AppOptions & { port?: number }): Promise<{ app: App; port: number; url: string }>;

/** Is `path` inside a git working tree? Branches and the default base, or null for a plain folder. */
export declare function probeGit(path: string): GitProbe | null;

/** Ask a running server to release a file, post a question or reply. Used by the CLI's done/ask/reply. */
export declare function call(port: number, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: any }>;
