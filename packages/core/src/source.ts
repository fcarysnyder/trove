// Where the queue comes from: a git working tree. The index is the approval state, Accept is
// `git add`, nothing ever commits.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { enabledTypes, included, kindOf } from './settings.js';
import type { BranchInfo, DocKind, FileEntry, GitProbe, RepoRef, Settings, WorktreeInfo, WorktreeRef } from './types.js';

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
  const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
  const head = () => tryGit('rev-parse', '--short', 'HEAD')?.trim() ?? '';
  // Worktrees from `git worktree list --porcelain`: blocks of `worktree <path>`, `HEAD <sha>`, then
  // `branch refs/heads/<name>` or `detached`. The first block is the main working tree, the same list
  // from any worktree. A bare repository's own entry has no checkout; left out of the list.
  const place = (top: string): { repo: RepoRef; worktree: WorktreeRef; worktrees: WorktreeInfo[] } => {
    const blocks = (tryGit('worktree', 'list', '--porcelain') ?? '').split('\n\n')
      .map((block) => new Map(block.split('\n').filter(Boolean).map((l) => [l.split(' ')[0], l.slice(l.indexOf(' ') + 1)])))
      .filter((kv) => kv.has('worktree'));
    const main = blocks[0] ? real(blocks[0].get('worktree')!) : top;
    const worktrees = blocks.filter((kv) => !kv.has('bare')).map((kv) => {
      const path = real(kv.get('worktree')!);
      return { path, name: basename(path), branch: kv.get('branch')?.replace(/^refs\/heads\//, '') ?? null, head: (kv.get('HEAD') ?? '').slice(0, 7), current: path === top, main: path === main };
    });
    const here = worktrees.find((w) => w.current);
    return {
      repo: { root: main, name: basename(main) },
      worktree: { path: top, name: basename(top), branch: here ? here.branch : branch(), main: top === main },
      worktrees,
    };
  };
  // Local branches; `worktree` is the other worktree a branch is checked out in, if any.
  const branches = (top: string): BranchInfo[] =>
    (tryGit('for-each-ref', '--format=%(refname:short)%00%(HEAD)%00%(worktreepath)%00%(upstream:short)%00%(committerdate:iso-strict)', 'refs/heads') ?? '')
      .split('\n').filter(Boolean).map((l) => {
        const [name, star, wt, upstream, date] = l.split('\0');
        const path = wt ? real(wt) : null;
        return { name, current: star === '*', worktree: path && path !== top ? path : null, ...(upstream ? { upstream } : {}), lastCommit: date };
      });
  return { git, tryGit, branch, defaultBase, head, place, branches };
}

const gitTop = (dir: string) => { try { return realpathSync(gitAt(dir).git('rev-parse', '--show-toplevel').trim()); } catch { return null; } };

/** Is `path` inside a git working tree? Branches and the default base, or null when it is not. */
export function probeGit(path: string): GitProbe | null {
  let dir = path;
  try { if (!statSync(path).isDirectory()) dir = dirname(path); } catch { return null; }
  const top = gitTop(dir);
  if (!top) return null;
  const g = gitAt(top);
  // Local and remote branches, minus symbolic refs such as origin/HEAD.
  const branches = (g.tryGit('for-each-ref', '--format=%(refname:short)%00%(symref)', 'refs/heads', 'refs/remotes') ?? '')
    .split('\n').map((l) => l.split('\0')).filter(([name, sym]) => name && !sym).map(([name]) => name);
  return { branch: g.branch(), branches, defaultBase: g.defaultBase(), local: g.branches(top), ...g.place(top) };
}

/** The git working tree `root` is in. Throws if `root` does not exist or is not inside one. */
export function openSource(root: string) {
  const top = gitTop(statSync(root).isDirectory() ? root : dirname(root));
  if (!top) throw new Error(`not a git repository: ${root}`);
  const g = gitAt(top);
  const { git, tryGit, branch, defaultBase } = g;
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

  const pathspec = (s: Settings) => {
    const exts = enabledTypes(s).flatMap((t) => t.extensions.map((e) => `*${e}`));
    // No enabled type: no pathspec at all, since excludes alone would match everything.
    return exts.length ? [...exts, ...s.exclude.map((e) => `:(exclude,glob)${e}`)] : null;
  };

  return {
    root: top, // realpath of the toplevel
    stateDir,
    /** The branch scope's base ref: Settings.base, or auto. */
    resolveBase,
    branch,
    head: g.head,
    branches: () => g.branches(top),
    /** The repository, this root as a worktree of it, and every worktree (main checkout first). */
    place: () => g.place(top),
    /** Changed paths of the enabled doc types, staged or not: what a switch carries along or trips on. */
    dirty(s: Settings) {
      const spec = pathspec(s);
      if (!spec) return 0;
      const parts = git('status', '--porcelain=v1', '-z', '-uall', '--', ...spec).split('\0');
      let n = 0;
      for (let k = 0; k < parts.length; k++) if (parts[k]) { n++; if (/^[RC]/.test(parts[k])) k++; } // a rename's old path follows as its own entry
      return n;
    },
    /** `git switch <branch>`; null when done, else git's own message. Never stashes, never discards. */
    switchTo(name: string): string | null {
      try { git('switch', '--no-guess', name); return null; } catch (e) { return String((e as { stderr?: string }).stderr || (e as Error).message).trim(); }
    },
    unstage,
    unaccept: unstage,
    accept: (rel: string) => { git('add', '--', rel); },
    /** The index copy (`:path`), or null when untracked. */
    indexed: (rel: string) => show(`:${rel}`),
    /** Take the file out of the change set: back to HEAD in index and worktree, or, if HEAD lacks it, out of the index and off disk. */
    reject(rel: string) {
      if (show(`HEAD:${rel}`) !== null) return void git('restore', '--source=HEAD', '--staged', '--worktree', '--', rel);
      try { git('rm', '--cached', '-q', '--', rel); } catch {} // untracked: nothing in the index
      rmSync(join(top, rel), { force: true });
    },
    /**
     * The queue. What git lists is added to `seen`, and seen files stay listed (as committed) after
     * git stops reporting them. Paths in `hide` (rejected ones) are listed only when git status
     * reports them, never from `seen` or the branch diff.
     */
    list(s: Settings, seen: Set<string>, hide = new Set<string>()): FileEntry[] {
      const spec = pathspec(s);
      if (!spec) return [];
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
        if (!have.has(path) && !hide.has(path) && included(path, s) && existsSync(join(top, path))) out.push({ ...entry(path, kindOf(path, s)!, false, true), committed: true });
      }
      for (const f of out) { seen.add(f.path); have.add(f.path); }
      // Branch scope: also every file the branch changed since its merge-base. Committed and unmodified,
      // so staged; not added to `seen`, which would list them as committed after a switch back.
      const mb = s.scope === 'branch' ? mergeBase(s) : null;
      if (mb) {
        for (const path of git('diff', '--name-only', '-z', '--diff-filter=d', mb, 'HEAD', '--', ...spec).split('\0')) {
          const kind = path && !have.has(path) && !hide.has(path) && existsSync(join(top, path)) ? kindOf(path, s) : null;
          if (kind) out.push(entry(path, kind, false, true));
        }
      }
      return out;
    },
    // What `text` is new against, for the page's Show new: the staged copy, or HEAD's once the file
    // is staged as it is (accepted). In branch scope a file committed as it is diffs against the
    // merge-base, so the branch's own changes show. Null for a file git has no earlier copy of.
    baseOf(rel: string, text: string, s: Settings): string | null {
      const staged = show(`:${rel}`);
      if (staged !== null && staged !== text) return staged;
      const head = show(`HEAD:${rel}`);
      const mb = s.scope === 'branch' && head === text ? mergeBase(s) : null;
      return mb ? show(`${mb}:${rel}`) : head;
    },
  };
}
