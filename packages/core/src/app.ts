// The review server: a queue over a git working tree, comment drafts, the user's block edits, batches for the
// agent, locks while it works, and the HTTP API the page talks to. Ported from the markdown-editor
// skill's doc-review.mjs; every route behaves as it did there. Node built-ins only.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { blocks, splice } from './anchor.js';
import { included, kindOf, loadSettings, mergeSettings, saveSettings } from './settings.js';
import { openSource, sha } from './source.js';
import type { BlockEdit, Draft, FileEntry, GitScope, Question, Settings, SourceInfo } from './types.js';

export interface AppOptions {
  root: string; // any path inside a git working tree; anything else throws `not a git repository: <root>`
  scope?: GitScope; // default from settings
  base?: string | null; // branch scope's base; default from settings
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

const MAX_BYTES = 512 * 1024;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'";
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// Where an edit's text sits now: the occurrence of `needle` nearest the offset it was written at,
// or -1 if it is gone. Used to revert one edit without touching anything around it.
function locate(text: string, needle: string, hint: number) {
  let best = -1;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    if (best === -1 || Math.abs(i - hint) < Math.abs(best - hint)) best = i;
    if (!needle) break;
  }
  return needle ? best : Math.min(hint, text.length);
}

interface EditRecord { before: string; saved?: string; blocks: BlockEdit[] }
/** A rejected file's backup: the working text, the index copy (null: none) and its comment drafts. */
interface Rejected { text: string; staged: string | null; drafts: Draft[]; at: string }
type Result = [number, unknown];

export function createApp(o: AppOptions): App {
  const source = openSource(resolve(o.root));
  const { root: top, stateDir: dir } = source;
  const log = o.log ?? console.log;
  const quietMs = o.quietMs ?? 5000;
  // Who serves the page, for the colour of the agent's marks: Claude Code sets CLAUDECODE in the
  // shells it starts. Anything else (Codex, Cursor, a plain terminal) is 'other'.
  const agent = o.agent ?? (process.env.CLAUDECODE ? 'claude' : 'other');
  const BUSY = `${agent === 'claude' ? 'Claude' : 'The agent'} is working on this file`;
  const uiDir = o.uiDir ? realpathSync(o.uiDir) : null;
  const files = { drafts: join(dir, 'drafts.json'), edits: join(dir, 'edits.json'), batches: join(dir, 'batches.jsonl'), events: join(dir, 'events.log'), state: join(dir, 'state.json') };

  // Settings: the file, with this run's options on top until a POST changes the same key.
  let stored = loadSettings(dir);
  const overrides: Partial<Settings> = {};
  if (o.scope !== undefined) overrides.scope = o.scope;
  if (o.base !== undefined) overrides.base = o.base;
  if (o.exclude !== undefined) overrides.exclude = o.exclude;
  let current = mergeSettings(stored, overrides);

  // Locks, the agent's snapshots and its waiting question live on disk too, so a restart keeps them:
  // {working: {path: {hash, text}}, updated: {path: text}, question, seen, skipped, rejected}.
  let saved: any = {};
  try { saved = JSON.parse(readFileSync(files.state, 'utf8')); } catch {}
  // path -> {hash and text at send, last hash seen, when it was first seen}
  const working = new Map<string, { hash: string | null; text: string; last: string | null; at: number }>(
    Object.entries(saved.working ?? {}).map(([p, w]: [string, any]) => [p, { ...w, last: w.hash, at: 0 }]));
  let question: Question | null = saved.question ?? null; // the agent is waiting on the user in its own session
  // Files the agent changed after a send: path -> the text at that send, so the page's Show new marks
  // what the agent changed since. Accept clears it.
  const updated = new Map<string, string>(Object.entries(saved.updated ?? {}));
  // Every path the review has listed, kept on disk so a committed file still shows (as committed) after a restart.
  const seen = new Set<string>(saved.seen ?? []);
  // Skipped: files the user will come back to; the editor's own mark, no git effect. Accept and Reject clear it.
  const skipped = new Set<string>(saved.skipped ?? []);
  // Rejected: changes the user took out of the change set, backed up so Restore can put all of it back.
  const rejected = new Map<string, Rejected>(Object.entries(saved.rejected ?? {}));
  const saveState = () => writeFileSync(files.state, JSON.stringify({
    working: Object.fromEntries([...working].map(([p, w]) => [p, { hash: w.hash, text: w.text }])), updated: Object.fromEntries(updated), question,
    seen: [...seen], skipped: [...skipped], rejected: Object.fromEntries(rejected) }));
  const REJECTED: Result = [409, { error: 'Rejected: restore it first' }];

  function list(): FileEntry[] {
    const before = seen.size;
    const out = source.list(current, seen, new Set(rejected.keys()));
    // A rejected path the source reports again has new content (say, regenerated): it is live again.
    let dropped = false;
    for (const f of out) {
      if (rejected.delete(f.path)) dropped = true;
      if (skipped.has(f.path)) f.skipped = true;
    }
    // The rest stay listed from their backup, so the page can show them and Restore them.
    for (const path of rejected.keys()) if (included(path, current)) out.push({ path, kind: kindOf(path, current)!, untracked: false, staged: false, rejected: true });
    if (seen.size !== before || dropped) saveState();
    return out.sort((a, b) => (a.path < b.path ? -1 : 1));
  }
  // Every path a request names must resolve inside the root and be in the current set.
  function find(p: unknown): FileEntry | null {
    if (typeof p !== 'string') return null;
    let abs = resolve(top, p);
    try { abs = realpathSync(abs); } catch {}
    const rel = relative(top, abs).split(sep).join('/');
    return list().find((f) => f.path === rel) ?? null;
  }
  const listed = (p: unknown) => find(p)?.path ?? null;
  const read = (rel: string) => readFileSync(join(top, rel), 'utf8');
  const write = (rel: string, text: string) => writeFileSync(join(top, rel), text);
  const hashOf = (rel: string) => { try { return sha(read(rel)); } catch { return null; } };
  const drafts = (): Record<string, Draft[]> => { try { return JSON.parse(readFileSync(files.drafts, 'utf8')); } catch { return {}; } };
  const saveDrafts = (d: Record<string, Draft[]>) => writeFileSync(files.drafts, JSON.stringify(d, null, 1));
  // Files the user edited in this review: path -> {before: text before the first Save, saved: hash
  // of the last Save, blocks: one entry per edited block}. On disk, so Edited and every Revert
  // survive a restart; cleared by Accept or Revert all.
  const edits = (): Record<string, EditRecord> => { try { return JSON.parse(readFileSync(files.edits, 'utf8')); } catch { return {}; } };
  const saveEdits = (e: Record<string, EditRecord>) => writeFileSync(files.edits, JSON.stringify(e));
  const dropEdit = (rel: string) => { const e = edits(); if (e[rel]) { delete e[rel]; saveEdits(e); } };
  // The file's block edits as the page shows them: `ok` while the edit's text is still in the file.
  const editRows = (rel: string, text: string): BlockEdit[] => (edits()[rel]?.blocks ?? []).map((b) => ({ ...b, ok: locate(text, b.after, b.at) !== -1 }));

  function release(rel: string) {
    const w = working.get(rel);
    if (!w) return false;
    working.delete(rel);
    if (hashOf(rel) !== w.hash) updated.set(rel, w.text);
    saveState();
    return true;
  }
  // Fallback release: the file changed after send and then stayed the same for quietMs.
  function tick(now = Date.now()) {
    for (const [rel, w] of working) {
      const h = hashOf(rel);
      if (h === w.hash) continue;
      if (h !== w.last) Object.assign(w, { last: h, at: now });
      else if (now - w.at >= quietMs) release(rel);
    }
  }

  const port = () => { const a = server.address(); return a && typeof a === 'object' ? a.port : 0; };
  const info = (): SourceInfo => ({
    kind: 'git', root: top, name: basename(top), branch: source.branch(),
    base: current.scope === 'branch' ? source.resolveBase(current) : null,
    scope: current.scope, agent, port: port(), stateDir: dir, eventsLog: files.events, batchesLog: files.batches,
    doneCommand: (o.doneCommand ?? ((p) => `trove done <file> --port ${p}`))(port()),
  });

  const routes: Record<string, (q: URLSearchParams, body: any) => Result> = {
    'GET /api/files': () => {
      const d = drafts();
      const e = edits();
      const all = list().map((f) => ({
        ...f,
        state: working.has(f.path) ? 'working' : f.rejected ? 'rejected' : f.staged ? 'accepted' : f.skipped ? 'skipped' : 'queue',
        updated: updated.has(f.path),
        edited: !!e[f.path],
        drafts: d[f.path]?.length ?? 0,
      }));
      return [200, { files: all, question }];
    },
    // Every listed file's drafts, for the page's All files view; drafts for paths no longer in the
    // review set are left out.
    'GET /api/drafts': () => {
      const d = drafts();
      const listedPaths = new Set(list().map((f) => f.path));
      const edited = Object.keys(edits()).filter((p) => listedPaths.has(p));
      return [200, { drafts: Object.fromEntries(Object.entries(d).filter(([p]) => listedPaths.has(p))),
        edits: Object.fromEntries(edited.map((p) => [p, editRows(p, read(p))])) }];
    },
    'GET /api/file': (q) => {
      const f = find(q.get('path'));
      if (!f) return [404, { error: 'not in the review set' }];
      const rel = f.path;
      // A rejected file shows what was rejected, read-only, against what is on disk now.
      const gone = rejected.get(rel);
      if (gone) return [200, { path: rel, kind: f.kind, text: gone.text, base: existsSync(join(top, rel)) ? read(rel) : null, since: null, hash: sha(gone.text),
        locked: true, rejected: true, drafts: [], edited: false, revertable: false, edits: [] }];
      const text = read(rel);
      const edit = edits()[rel];
      // revertable: the file is still exactly what the user's last Save wrote.
      // base: what Show new marks green against; since: the text before the agent's last update, if any.
      return [200, { path: rel, kind: f.kind, text, base: source.baseOf(rel, text, current), since: updated.get(rel) ?? null, hash: sha(text), locked: working.has(rel),
        drafts: drafts()[rel] ?? [], edited: !!edit, revertable: edit?.saved === sha(text), edits: editRows(rel, text) }];
    },
    'POST /api/drafts': (_, { path, drafts: list }) => {
      const rel = listed(path);
      if (!rel || !Array.isArray(list)) return [400, { error: 'path and drafts[] required' }];
      if (rejected.has(rel)) return REJECTED;
      const d = drafts();
      if (list.length) d[rel] = list;
      else delete d[rel];
      saveDrafts(d);
      return [200, { ok: true }];
    },
    // Accepts only the text the user last saw: a file that changed since is refused.
    'POST /api/accept': (_, { path, hash }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: 'not in the review set' }];
      if (working.has(rel)) return [409, { error: BUSY }];
      if (rejected.has(rel)) return REJECTED;
      const now = hashOf(rel);
      if (now !== hash) return [409, { error: 'The file changed; read it again before accepting', hash: now }];
      source.accept(rel);
      updated.delete(rel);
      skipped.delete(rel);
      saveState();
      dropEdit(rel);
      return [200, { ok: true }];
    },
    // Skip: come back to it later. Only the editor's mark; git is untouched.
    'POST /api/skip': (_, { path, on }) => {
      const rel = listed(path);
      if (!rel || typeof on !== 'boolean') return [400, { error: 'path and on required' }];
      if (working.has(rel)) return [409, { error: BUSY }];
      if (rejected.has(rel)) return REJECTED;
      if (on) skipped.add(rel);
      else skipped.delete(rel);
      saveState();
      return [200, { ok: true }];
    },
    // Reject: take the change out of the change set (see the source's reject). The working text, the index
    // copy and the file's drafts are saved first, so Restore can put them back. Refused on a version
    // the user did not see. Its edits are dropped.
    'POST /api/reject': (_, { path, hash }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: 'not in the review set' }];
      if (working.has(rel)) return [409, { error: BUSY }];
      if (rejected.has(rel)) return [409, { error: 'Already rejected' }];
      const text = read(rel);
      if (sha(text) !== hash) return [409, { error: 'The file changed; read it again before rejecting', hash: sha(text) }];
      const d = drafts();
      rejected.set(rel, { text, staged: source.indexed(rel), drafts: d[rel] ?? [], at: new Date().toISOString() });
      updated.delete(rel);
      skipped.delete(rel);
      saveState(); // the backup is on disk before the file changes
      source.reject(rel);
      if (d[rel]) { delete d[rel]; saveDrafts(d); }
      dropEdit(rel);
      return [200, { ok: true }];
    },
    // Restore a rejected file: the index copy (staged), then the working text, then its drafts.
    'POST /api/restore': (_, { path }) => {
      const rel = listed(path);
      const gone = rel && rejected.get(rel);
      if (!rel || !gone) return [404, { error: 'not rejected' }];
      mkdirSync(dirname(join(top, rel)), { recursive: true });
      if (gone.staged !== null) {
        write(rel, gone.staged);
        source.accept(rel);
      }
      write(rel, gone.text);
      if (gone.drafts.length) saveDrafts({ ...drafts(), [rel]: gone.drafts });
      rejected.delete(rel);
      saveState();
      return [200, { ok: true }];
    },
    'POST /api/unaccept': (_, { path }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: 'not in the review set' }];
      if (working.has(rel)) return [409, { error: BUSY }];
      if (rejected.has(rel)) return REJECTED;
      source.unaccept(rel);
      return [200, { ok: true }];
    },
    'POST /api/save': (_, { path, hash, index, raw }) => {
      const f = find(path);
      if (!f || typeof raw !== 'string') return [400, { error: 'path and raw required' }];
      const rel = f.path;
      if (working.has(rel)) return [409, { error: BUSY }];
      if (rejected.has(rel)) return REJECTED;
      const text = read(rel);
      if (sha(text) !== hash) return [409, { error: 'The file changed since you started editing', hash: sha(text) }];
      let next = raw; // HTML and text are edited as one whole file; markdown one block at a time
      let block: Omit<BlockEdit, 'id' | 'time'> = { before: text, after: raw, path: [], index: null, at: 0 };
      if (f.kind === 'markdown') {
        try { next = splice(text, index, raw); } catch { return [400, { error: `no block ${index}` }]; }
        const all = blocks(text);
        block = { before: all[index].raw.trimEnd(), after: raw.trimEnd(), path: all[index].path, index,
          at: all.slice(0, index).reduce((n, b) => n + b.raw.length, 0) };
      }
      // Save never approves: an accepted file goes back to pending, and only Accept accepts.
      source.unstage(rel);
      write(rel, next);
      // One entry per block: a second Save of the same block keeps its original `before`.
      const e = edits();
      const rec = (e[rel] ??= { before: text, blocks: [] });
      rec.saved = sha(next);
      rec.blocks ??= [];
      const same = rec.blocks.filter((b) => b.after === block.before)
        .sort((x, y) => Math.abs(x.at - block.at) - Math.abs(y.at - block.at))[0];
      if (same) Object.assign(same, { after: block.after, index: block.index, at: block.at, time: new Date().toISOString() });
      else rec.blocks.push({ id: randomUUID().slice(0, 8), ...block, time: new Date().toISOString() });
      rec.blocks = rec.blocks.filter((b) => b.before !== b.after); // a block edited back to where it was is no edit
      saveEdits(e);
      return [200, { hash: sha(next) }];
    },
    // Back to the text before the user's first edit in this review, never to the index or HEAD, so
    // the agent's and earlier uncommitted work is kept. Refused once the file changed after the edit.
    // With `edit` (an id), reverts that one block edit: puts its `before` back where its `after` now
    // sits (nearest its old position), touching nothing else. Hash-checked like Save when `hash`
    // is given. Never accepts.
    'POST /api/revert': (_, { path, edit: id, hash }) => {
      const rel = listed(path);
      if (rel && rejected.has(rel)) return REJECTED;
      const e = edits();
      const edit = rel && e[rel];
      if (!rel || !edit) return [404, { error: 'no edits to revert' }];
      if (working.has(rel)) return [409, { error: BUSY }];
      const text = read(rel);
      if (id === undefined) {
        if (sha(text) !== edit.saved) return [409, { error: 'The file changed since your edit' }];
        write(rel, edit.before);
        dropEdit(rel);
        return [200, { hash: sha(edit.before) }];
      }
      const one = edit.blocks?.find((b) => b.id === id);
      if (!one) return [404, { error: 'no such edit' }];
      if (hash !== undefined && sha(text) !== hash) return [409, { error: 'The file changed; read it again', hash: sha(text) }];
      const at = locate(text, one.after, one.at);
      if (at === -1) return [409, { error: 'The text changed since your edit' }];
      const next = text.slice(0, at) + one.before + text.slice(at + one.after.length);
      write(rel, next);
      edit.blocks = edit.blocks.filter((b) => b !== one);
      if (edit.blocks.length) {
        edit.saved = sha(next);
        saveEdits(e);
      } else dropEdit(rel);
      return [200, { hash: sha(next) }];
    },
    // Sends drafts, skipping files the agent is working on and rejected ones. Optional filters: `paths` (only these
    // files, each checked like any other path) and `kind` ('change' or 'explain'). What is not
    // sent stays a draft.
    'POST /api/send': (_, { paths, kind }) => {
      if (paths !== undefined && !Array.isArray(paths)) return [400, { error: 'paths must be a list' }];
      if (kind !== undefined && kind !== 'change' && kind !== 'explain') return [400, { error: 'kind is change or explain' }];
      const only = paths && new Set(paths.map(listed).filter(Boolean));
      const d = drafts();
      const items = [];
      const keep: Record<string, Draft[]> = {};
      for (const [path, list] of Object.entries(d)) {
        const rel = listed(path);
        const take = rel && !working.has(rel) && !rejected.has(rel) && (!only || only.has(rel)) ? list.filter((c) => !kind || c.kind === kind) : [];
        items.push(...take.map((c) => ({ path: rel, kind: c.kind, note: c.note, anchor: c.anchor })));
        const rest = list.filter((c) => !take.includes(c));
        if (rest.length) keep[path] = rest;
      }
      if (!items.length) return [400, { error: 'no comments to send' }];
      const changed = [...new Set(items.filter((c) => c.kind === 'change').map((c) => c.path as string))];
      for (const rel of changed) {
        source.unstage(rel);
        const h = hashOf(rel);
        working.set(rel, { hash: h, last: h, at: 0, text: read(rel) });
      }
      saveState();
      const id = randomUUID().slice(0, 8);
      const sentPaths = new Set(items.map((c) => c.path));
      appendFileSync(files.batches, `${JSON.stringify({ id, sentAt: new Date().toISOString(), items })}\n`);
      saveDrafts(keep);
      // A notice, not the batch itself: a long line is cut short on its way to the agent.
      const notice = `batch ${id}: ${items.length} ${items.length === 1 ? 'comment' : 'comments'} on ${sentPaths.size} ${sentPaths.size === 1 ? 'file' : 'files'}. Read it with: grep -F ${id} '${files.batches}'`;
      appendFileSync(files.events, `${notice}\n`);
      log(notice);
      return [200, { id, comments: items.length, files: sentPaths.size, locked: changed }];
    },
    // `ask` (kind 'question') or `reply` (kind 'reply') from the agent: the page shows that something
    // waits for the user in the agent's session. An empty text (`ask --clear`, or the page's dismiss)
    // takes it down.
    'POST /api/ask': (_, { text, kind = 'question' }) => {
      if (typeof text !== 'string' || !['question', 'reply'].includes(kind)) return [400, { error: 'text, and kind question or reply' }];
      question = text.trim() ? { text: text.trim().slice(0, 300), kind, at: new Date().toISOString() } : null;
      saveState();
      return [200, { question }];
    },
    // `done <file>` from the agent and the page's Unlock button.
    'POST /api/release': (_, { path }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: `not in the review set: ${path}` }];
      return [200, { released: release(rel), updated: updated.has(rel) }];
    },
    'GET /api/source': () => [200, info()],
    'GET /api/settings': () => [200, current],
    // A partial merge. Keys this run got from options (--scope, --exclude) give way to the user's
    // choice. Types, exclude, scope and base apply on the next list(), which every request runs.
    'POST /api/settings': (_, body) => {
      try { stored = mergeSettings(stored, body); } catch (error) { return [400, { error: (error as Error).message }]; }
      for (const key of Object.keys(body)) delete overrides[key as keyof Settings];
      saveSettings(dir, stored);
      current = mergeSettings(stored, overrides);
      return [200, current];
    },
  };

  // A file under uiDir, or null. `/` is index.html.
  function asset(pathname: string) {
    if (!uiDir) return null;
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return null; }
    const abs = resolve(uiDir, `.${rel === '/' ? '/index.html' : rel}`);
    if (!abs.startsWith(uiDir + sep)) return null;
    try { return statSync(abs).isFile() ? abs : null; } catch { return null; }
  }

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const { pathname, searchParams } = new URL(req.url ?? '/', 'http://x');
    const local = req.socket.localPort;
    const reply = (status: number, body?: string | Buffer, headers: Record<string, string> = {}) =>
      res.writeHead(status, { 'cache-control': 'no-store', ...headers }).end(body);
    const json = ([status, body]: Result) => reply(status, JSON.stringify(body), { 'content-type': 'application/json' });

    // A page on another site that rebinds its DNS to loopback still sends its own name here.
    if (![`127.0.0.1:${local}`, `localhost:${local}`].includes(req.headers.host ?? '')) return reply(403);

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return reply(404);
      const file = asset(pathname);
      if (file) return reply(200, readFileSync(file), { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-security-policy': CSP });
      if (pathname === '/' && !uiDir) return reply(404, 'No UI is built for this server; it answers /api/ only. Pass --ui <dir>.\n', { 'content-type': 'text/plain; charset=utf-8' });
      return reply(404);
    }

    const route = routes[`${req.method} ${pathname}`];
    if (!route) return reply(404);
    // A route that throws (say, a listed file vanished or is a dangling link) answers 500 instead of
    // taking the server down.
    const run = (body?: unknown) => { try { json(route(searchParams, body)); } catch (error) { json([500, { error: (error as Error).message }]); } };
    if (req.method === 'GET') return run();

    // Mutating routes: same origin only (the CLI sends the origin it was given), JSON only.
    if (req.headers.origin !== `http://${req.headers.host}`) return reply(403);
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return reply(415);
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= MAX_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (bytes > MAX_BYTES) return reply(413);
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return reply(400);
      run(body);
    });
  };
  // A request that throws outside a route answers 500 instead of ending the process and dropping
  // every lock with it.
  const server = createServer((req, res) => {
    try { handle(req, res); } catch { if (!res.headersSent) res.writeHead(500).end(); }
  });

  return {
    server, info, list, tick,
    settings: () => current,
    close: () => new Promise<void>((ok) => { server.close(() => ok()); server.closeAllConnections(); }),
  };
}

/** Bind on 127.0.0.1. `port` 0 picks a free one. Resolves once listening; runs the quiet-release tick. */
export async function serve(options: AppOptions & { port?: number }) {
  const app = createApp(options);
  await new Promise<void>((ok, fail) => {
    app.server.once('error', fail).listen(options.port ?? 0, '127.0.0.1', () => { app.server.off('error', fail); ok(); });
  });
  const timer = setInterval(() => app.tick(), 1000).unref();
  app.server.on('close', () => clearInterval(timer));
  const port = (app.server.address() as AddressInfo).port;
  return { app, port, url: `http://127.0.0.1:${port}` };
}

/** One small HTTP client for done/ask/reply and the selftest. Sets Origin itself, as only a non-browser can. */
export function call(port: number, method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((ok, fail) => {
    const req = request(
      { host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, ...headers } },
      (res) => {
        let text = '';
        res.setEncoding('utf8').on('data', (c) => (text += c)).on('end', () => {
          let parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
          ok({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on('error', fail).end(body === undefined ? undefined : JSON.stringify(body));
  });
}
