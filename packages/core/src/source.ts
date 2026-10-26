// Where the queue comes from. A git source is today's behaviour: the index is the approval state,
// Accept is `git add`, nothing ever commits. A folder source has no git: a reviewed.json of
// path -> hash at accept stands in for the index, so a later change puts the file back in the queue.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { enabledTypes, included, kindOf } from './settings.js';
import type { DocKind, FileEntry, GitProbe, Settings } from './types.js';

export interface Source {
  kind: 'git' | 'folder';
  root: string; // realpath of the git toplevel or the folder
  stateDir: string;
  /** The queue. Git adds what it lists to `seen` and keeps listing seen files (as committed) after git stops reporting them. */
  list(s: Settings, seen: Set<string>): FileEntry[];
  accept(rel: string): void;
  unaccept(rel: string): void;
  unstage(rel: string): void;
  /** What Show new marks against: the staged copy, else HEAD (else the merge-base in branch scope). */
  baseOf(rel: string, text: string, s: Settings): string | null;
  branch(): string | null;
  /** The branch scope's base ref: Settings.base, or auto. */
  resolveBase(s: Settings): string | null;
}

export const sha = (text: string) => createHash('sha1').update(text).digest('hex');

function gitAt(cwd: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: 'pipe' });
  const tryGit = (...args: string[]) => { try { return git(...args); } catch { return null; } };
  const branch = () => tryGit('symbolic-ref', '--short', '-q', 'HEAD')?.trim() || null;
  // Auto base: what origin/HEAD points at, then main, then master.
  const defaultBase = () => {
    const origin = tryGit('rev-parse', '--abbrev-ref', 'origin/HEAD')?.trim();
    if (origin && origin !== 'origin/HEAD') return origin;
    return ['main', 'master'].find((b) => tryGit('rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) ?? null;
  };
  return { git, tryGit, branch, defaultBase };
}

const gitTop = (dir: string) => { try { return realpathSync(gitAt(dir).git('rev-parse', '--show-toplevel').trim()); } catch { return null; } };

/** Is `path` inside a git working tree? Branches and the default base, or null for a plain folder. */
export function probeGit(path: string): GitProbe | null {
  let dir = path;
  try { if (!statSync(path).isDirectory()) dir = dirname(path); } catch { return null; }
  const top = gitTop(dir);
  if (!top) return null;
  const g = gitAt(top);
  // Local and remote branches, minus symbolic refs such as origin/HEAD.
  const branches = (g.tryGit('for-each-ref', '--format=%(refname:short)%00%(symref)', 'refs/heads', 'refs/remotes') ?? '')
    .split('\n').map((l) => l.split('\0')).filter(([name, sym]) => name && !sym).map(([name]) => name);
  return { branch: g.branch(), branches, defaultBase: g.defaultBase() };
}

/** A git source if `root` is inside a working tree, else a folder source. Throws if `root` does not exist. */
export function openSource(root: string): Source {
  const isDir = statSync(root).isDirectory();
  const top = gitTop(isDir ? root : dirname(root));
  if (top) return gitSource(top);
  if (!isDir) throw new Error(`${root} is neither a folder nor inside a git working tree`);
  return folderSource(realpathSync(root));
}

function gitSource(top: string): Source {
  const { git, tryGit, branch, defaultBase } = gitAt(top);
  const gitDir = git('rev-parse', '--absolute-git-dir').trim();
  const stateDir = join(gitDir, 'trove');
  // doc-review (the skill this grew from) kept the same files under another name: carry its drafts over.
  if (!existsSync(stateDir) && existsSync(join(gitDir, 'doc-review'))) renameSync(join(gitDir, 'doc-review'), stateDir);
  mkdirSync(stateDir, { recursive: true });
  const show = (spec: string) => tryGit('show', spec);
  const resolveBase = (s: Settings) => s.base ?? defaultBase();
  const mergeBase = (s: Settings) => { const b = resolveBase(s); return (b && tryGit('merge-base', b, 'HEAD')?.trim()) || null; };
  const unstage = (rel: string) => { try { git('restore', '--staged', '--', rel); } catch {} }; // untracked: nothing staged
  const entry = (path: string, kind: DocKind, untracked: boolean, staged: boolean): FileEntry => ({ path, kind, untracked, staged });

  return {
    kind: 'git', root: top, stateDir, branch, resolveBase, unstage,
    unaccept: unstage,
    accept: (rel) => { git('add', '--', rel); },
    list(s, seen) {
      const exts = enabledTypes(s).flatMap((t) => t.extensions.map((e) => `*${e}`));
      if (!exts.length) return []; // a pathspec of excludes alone would match everything
      const spec = [...exts, ...s.exclude.map((g) => `:(exclude,glob)${g}`)];
      const parts = git('status', '--porcelain=v1', '-z', '-uall', '--', ...spec).split('\0');
      const out: FileEntry[] = [];
      for (let k = 0; k < parts.length; k++) {
        const [x, y, path] = [parts[k][0], parts[k][1], parts[k].slice(3)];
        if (!path) continue;
        if (x === 'R' || x === 'C') k++; // the old path follows as its own entry
        if (y === 'D' || (x === 'D' && y === ' ')) continue; // nothing on disk to show
        const kind = kindOf(path, s);
        if (kind) out.push(entry(path, kind, x === '?', y === ' '));
      }
      // A file the review has listed stays listed, as accepted and committed, once git stops reporting
      // it (its staged copy got committed), so the count holds steady and the page can file it away.
      // Filtered by the current settings, so turning a type off or excluding a folder drops its files.
      const have = new Set(out.map((f) => f.path));
      for (const path of seen) {
        if (!have.has(path) && included(path, s) && existsSync(join(top, path))) out.push({ ...entry(path, kindOf(path, s)!, false, true), committed: true });
      }
      for (const f of out) { seen.add(f.path); have.add(f.path); }
      // Branch scope: also every file the branch changed since its merge-base. Committed and unmodified,
      // so staged; not added to `seen`, which would list them as committed after a switch back.
      const mb = s.scope === 'branch' ? mergeBase(s) : null;
      if (mb) {
        for (const path of git('diff', '--name-only', '-z', '--diff-filter=d', mb, 'HEAD', '--', ...spec).split('\0')) {
          const kind = path && !have.has(path) && existsSync(join(top, path)) ? kindOf(path, s) : null;
          if (kind) out.push(entry(path, kind, false, true));
        }
      }
      return out;
    },
    // What `text` is new against, for the page's Show new: the staged copy, or HEAD's once the file
    // is staged as it is (accepted). In branch scope a file committed as it is diffs against the
    // merge-base, so the branch's own changes show. Null for a file git has no earlier copy of.
    baseOf(rel, text, s) {
      const staged = show(`:${rel}`);
      if (staged !== null && staged !== text) return staged;
      const head = show(`HEAD:${rel}`);
      const mb = s.scope === 'branch' && head === text ? mergeBase(s) : null;
      return mb ? show(`${mb}:${rel}`) : head;
    },
  };
}

function folderSource(root: string): Source {
  const stateDir = join(homedir(), '.trove', 'state', sha(root));
  mkdirSync(stateDir, { recursive: true });
  const file = join(stateDir, 'reviewed.json');
  const reviewed = (): Record<string, string> => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
  const hashOf = (rel: string) => { try { return sha(readFileSync(join(root, rel), 'utf8')); } catch { return null; } };
  const unstage = (rel: string) => { const r = reviewed(); if (rel in r) { delete r[rel]; writeFileSync(file, JSON.stringify(r)); } };
  // ponytail: walks the whole tree on every list(); a cap or a watcher if someone opens their home folder.
  const walk = (dir: string, prefix: string, s: Settings, out: string[]) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; } // unreadable: skip
    for (const d of entries) {
      const rel = prefix + d.name;
      if (d.isDirectory()) { if (!d.name.startsWith('.') && d.name !== 'node_modules') walk(join(dir, d.name), `${rel}/`, s, out); }
      else if (d.isFile() && included(rel, s)) out.push(rel);
    }
    return out;
  };
  return {
    kind: 'folder', root, stateDir, unstage,
    unaccept: unstage,
    accept: (rel) => writeFileSync(file, JSON.stringify({ ...reviewed(), [rel]: hashOf(rel) })),
    list(s) {
      const r = reviewed();
      return (walk(root, '', s, []) ?? []).map((path) => ({ path, kind: kindOf(path, s)!, untracked: false, staged: path in r && r[path] === hashOf(path) }));
    },
    baseOf: () => null,
    branch: () => null,
    resolveBase: () => null,
  };
}
