// The desktop start page: Open repository and the recents. A repository, picked or recent, opens a dialog
// with what to review (worktree, branch, scope) and the agent to start in Terminal beside it; Open starts
// the server and the repository's own window. A folder that is not a repository stays here with the
// reason. In a plain browser there is no bridge, so it says how to run the server instead.
import { attachCommand, recentName, type AgentTool, type GitProbe, type GitScope, type Recent } from '@trove/core/types';
import { Copy, FolderOpen, FolderTree, GitBranch, Globe, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { load, save } from '@/lib/storage';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Count, IconButton, TitleStrip } from '@/editor/bits';
import mark from '../../../../design/icon/mark/favicon.svg';
import { toast } from 'sonner';

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const f = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (!Number.isFinite(s)) return '';
  if (s < 3600) return f.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return f.format(-Math.round(s / 3600), 'hour');
  return f.format(-Math.round(s / 86400), 'day');
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Start() {
  useEffect(() => applyTheme('system'), []);
  useEffect(() => { document.title = 'Trove'; }, []);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-x-0 top-0 z-10 [&>div]:border-b-0"><TitleStrip /></div>
      <main className="grid min-h-screen place-items-center p-6">
        <div className="flex w-full max-w-2xl flex-col gap-8">
          <h1 className="flex items-center gap-3 text-4xl font-semibold tracking-tight text-foreground">
            <img src={mark} alt="" className="size-16" />Trove
          </h1>
          {window.trove ? <Picker /> : <NoBridge />}
        </div>
      </main>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

function NoBridge() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p>Run Trove on a git repository, then open the address it prints:</p>
        <code className="rounded-md bg-background px-3 py-2 font-mono text-[13px] text-foreground">trove serve --root &lt;repo&gt;</code>
      </CardContent>
    </Card>
  );
}

const NOT_A_REPO = 'Not a git repository. Try again.';
/** A repository to open; `last`: the recent it came from, whose scope and agent the dialog starts with. */
type Repo = { path: string; git: GitProbe; last?: Recent };
const nameOf = (path: string) => path.split('/').at(-1);

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex h-32 flex-col justify-between rounded-xl border bg-card p-4 text-left text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5">
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

function Picker() {
  const bridge = window.trove!;
  const [recents, setRecents] = useState<Recent[]>([]);
  const [probes, setProbes] = useState<Map<string, GitProbe | null>>(new Map());
  const [open, setOpen] = useState<Repo | null>(null);
  const [notRepo, setNotRepo] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reload = async () => {
    const list = await bridge.recents().catch(() => []);
    const probes = await Promise.all(list.map((r) => bridge.probe(r.path).catch(() => null)));
    setProbes(new Map(list.map((r, k) => [r.path, probes[k]?.git ?? null])));
    setRecents(list);
  };
  useEffect(() => { void reload(); }, []);
  const take = (res: { path: string; git: GitProbe | null }) => {
    setNotRepo(res.git ? null : res.path);
    if (res.git) setOpen({ path: res.path, git: res.git, last: recents.find((r) => r.path === res.path) });
  };
  // The app stages a folder here (a drop, or File > Open) by putting its path in the hash.
  useEffect(() => {
    const stage = () => {
      const path = decodeURIComponent(location.hash.slice(1));
      history.replaceState(null, '', location.pathname); // so staging the same path again is a change
      if (path) void bridge.probe(path).then((res) => take(res ?? { path, git: null }), (e) => toast(errText(e)));
    };
    stage();
    addEventListener('hashchange', stage);
    return () => removeEventListener('hashchange', stage);
  }, [recents]);
  const pick = async () => {
    try {
      const res = await bridge.pickFolder();
      if (res) take(res);
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <div
      className={cn('flex flex-col gap-6 rounded-xl outline-2 outline-offset-8 outline-transparent transition-[outline-color]', dragging && 'outline-dashed outline-border')}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={() => setDragging(false)}
    >
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Tile icon={<FolderOpen />} label="Open repository" onClick={() => void pick()} />
          <Tile icon={<Globe />} label="Clone GitHub repo" onClick={() => setCloning(true)} />
        </div>
        {notRepo && (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="folder w-full text-left font-mono text-xs text-muted-foreground">{`\u200E${notRepo}\u200E`}</span>
            <span role="alert" className="text-sm text-destructive">{NOT_A_REPO}</span>
          </div>
        )}
      </div>
      {recents.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="px-4 py-3"><CardTitle className="text-sm text-foreground">Recent</CardTitle></CardHeader>
          <ul className="flex flex-col">
            {recents.map((r) => {
              const git = probes.get(r.path);
              const bad = git === null;
              const changes = git?.worktrees.find((w) => w.current)?.changes;
              const body = (
                <>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex w-full items-center gap-2">
                      <span className="truncate font-medium text-foreground">{recentName(r)}</span>
                      {git?.branch && <span className="truncate font-mono text-xs text-muted-foreground">{git.branch}</span>}
                      {!!changes && <Count n={changes} className="group-hover:bg-background" />}
                      {bad ? <span className="text-xs text-destructive">{NOT_A_REPO}</span>
                        : r.scope === 'branch' && <span className="text-xs text-muted-foreground">{`branch vs ${r.base ?? 'base'}`}</span>}
                    </span>
                    <span className="folder w-full text-left text-xs text-muted-foreground">{`\u200E${r.path}\u200E`}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(r.openedAt)}</span>
                </>
              );
              // Rows run edge to edge; each reserves room on the right for Remove, which shows on hover or focus.
              const row = 'flex w-full min-w-0 items-center gap-4 py-3 pr-14 pl-4 text-left outline-none';
              return (
                <li key={r.path} className="group relative border-t transition-colors hover:bg-secondary has-[:focus-visible]:bg-secondary">
                  {bad ? <div className={cn(row, 'opacity-60')} aria-disabled>{body}</div> : (
                    <button className={row} onClick={() => git && setOpen({ path: r.path, git, last: r })}>{body}</button>
                  )}
                  <IconButton label={`Remove ${recentName(r)} from recents`} tip="Remove"
                    className="absolute top-1/2 right-3 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
                    onClick={() => bridge.forget(r.path).then(reload)}><X /></IconButton>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {open && <OpenDialog key={open.path} repo={open} onClose={() => setOpen(null)} />}
      {cloning && <CloneDialog onClose={() => setCloning(false)} onCloned={(res) => { setCloning(false); take(res); }} />}
    </div>
  );
}

type Choice = AgentTool | 'none';
const CHOICES: [Choice, string, string][] = [['claude', 'Claude Code', 'bg-agent-claude'], ['codex', 'Codex', 'bg-agent-codex'], ['none', 'None for now', 'bg-muted-foreground']];

/** Everything between picking a repository and its window: what to review, and the agent to start beside it. */
function OpenDialog({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const bridge = window.trove!;
  // The worktree to open; another one is probed again, so the branch and the bases are its own.
  const [cur, setCur] = useState({ path: repo.path, git: repo.git });
  const { git } = cur;
  const defaultBase = (g: GitProbe) => g.defaultBase ?? g.branches.find((b) => b !== g.branch) ?? '';
  const [scope, setScope] = useState<GitScope>(repo.last?.scope ?? 'uncommitted');
  const [base, setBase] = useState(repo.last?.base ?? defaultBase(git));
  const [choice, setChoice] = useState<Choice>(repo.last?.agent === null ? 'none' : repo.last?.agent ?? 'claude');
  const [tools, setTools] = useState<Record<AgentTool, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void bridge.tools().then(setTools, () => {}); }, []);
  const here = git.worktree.path;
  const toWorktree = (path: string) => {
    if (path === here) return;
    bridge.probe(path).then((res) => {
      if (!res?.git) return void toast(NOT_A_REPO);
      setCur({ path: res.path, git: res.git });
      setBase(defaultBase(res.git));
    }, (e) => toast(errText(e)));
  };
  const bases = git.branches.filter((b) => b !== git.branch);
  const label = (w: GitProbe['worktrees'][number]) => (w.main ? `${git.repo.name} · main checkout · ${w.branch ?? w.head}` : `${w.name} · ${w.branch ?? w.head}`);
  const command = choice === 'none' ? null : attachCommand(choice, cur.path, '<port>');
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
  const go = () => {
    if (busy) return;
    setBusy(true);
    bridge.open({ path: cur.path, scope, base: scope === 'branch' ? base || null : null, agent: choice === 'none' ? null : choice })
      .catch((e) => toast(errText(e))).finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(on) => { if (!on) onClose(); }}>
      <DialogContent className="sm:max-w-lg" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }}>
        <DialogHeader>
          <DialogTitle className="text-foreground">{nameOf(cur.path)}</DialogTitle>
          <DialogDescription className="folder text-left font-mono text-xs">{`\u200E${cur.path}\u200E`}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {git.worktrees.length > 1 ? (
            <div className="flex flex-col gap-2">
              <Select value={here} onValueChange={toWorktree}>
                <SelectTrigger size="default" className="w-full text-xs" aria-label="Worktree" title={here}><FolderTree className="size-4 text-muted-foreground" aria-hidden /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {git.worktrees.map((w) => <SelectItem key={w.path} value={w.path} title={w.path} className="text-xs">{label(w)}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* A branch checked out in a worktree picks that worktree; the others are switched to in the editor. */}
              <Select value={git.branch ?? ''} onValueChange={(name) => { const b = git.local.find((l) => l.name === name); if (b?.worktree) toWorktree(b.worktree); }}>
                <SelectTrigger size="default" className="w-full font-mono text-xs" aria-label="Branch"><GitBranch className="size-4 text-muted-foreground" aria-hidden /><SelectValue placeholder="detached HEAD" /></SelectTrigger>
                <SelectContent>
                  {git.local.map((b) => (
                    <SelectItem key={b.name} value={b.name} disabled={!b.current && !b.worktree} className="font-mono text-xs">{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm"><GitBranch className="size-4 text-muted-foreground" aria-hidden /><span className="font-mono text-foreground">{git.branch ?? 'detached HEAD'}</span></div>
          )}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-foreground">Review</span>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as GitScope)} className="gap-3" aria-label="Review">
              <div className="flex items-center gap-2">
                <RadioGroupItem id="scope-uncommitted" value="uncommitted" />
                <Label htmlFor="scope-uncommitted" className="font-normal text-foreground">Uncommitted changes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="scope-branch" value="branch" disabled={!bases.length} />
                <Label htmlFor="scope-branch" className="font-normal text-foreground">Branch vs base</Label>
                <Select value={base} onValueChange={setBase} disabled={scope !== 'branch'}>
                  <SelectTrigger size="default" className="ml-auto w-[200px] font-mono text-xs" aria-label="Base"><SelectValue /></SelectTrigger>
                  <SelectContent>{bases.map((b) => <SelectItem key={b} value={b} className="font-mono text-xs">{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </RadioGroup>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-foreground">Agent</span>
            <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="gap-3" aria-label="Agent">
              {CHOICES.map(([value, text, dot]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem id={`agent-${value}`} value={value} />
                  <Label htmlFor={`agent-${value}`} className="font-normal text-foreground">
                    <span className={cn('size-2 rounded-full', dot)} aria-hidden />{text}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {choice !== 'none' && tools && !tools[choice] && <span role="status" className="text-sm text-muted-foreground">{`${choice} is not installed`}</span>}
            {command && (
              <div className="flex items-start gap-1">
                <code className="min-w-0 flex-1 rounded-sm bg-background px-2 py-1 font-mono text-xs break-all text-foreground">{command}</code>
                <IconButton label="Copy command" onClick={() => copy(command)}><Copy /></IconButton>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={go}>Open<Kbd className="bg-transparent text-current opacity-60">⌘↵</Kbd></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type GithubRepo = Awaited<ReturnType<NonNullable<typeof window.trove>['githubRepos']>>[number];

/** Clone a repository by URL, or one of yours from the gh CLI, into a folder; then it opens like any other. */
function CloneDialog({ onClose, onCloned }: { onClose: () => void; onCloned: (res: { path: string; git: GitProbe | null }) => void }) {
  const bridge = window.trove!;
  const [url, setUrl] = useState('');
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [dir, setDir] = useState(() => load<string>('clone-dir', ''));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void bridge.githubRepos().then(setRepos, () => setRepos([]));
    if (!dir) void bridge.cloneDir().then(setDir, () => {});
  }, []);
  // Typing a name filters your repositories; a URL is cloned as it is.
  const needle = url.trim().toLowerCase();
  const shown = (repos ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.url.toLowerCase() === needle);
  const browse = async () => {
    const picked = await bridge.pickFolder().catch(() => null);
    if (picked) { setDir(picked.path); save('clone-dir', picked.path); }
  };
  // A name typed to filter clones the top match.
  const target = /^(?:https:\/\/|ssh:\/\/|git@)|^[\w.-]+\/[\w.-]+$/.test(url.trim()) ? url.trim() : shown[0]?.url ?? url.trim();
  const go = () => {
    if (busy || !url.trim() || !dir) return;
    setBusy(true);
    bridge.clone(target, dir).then(onCloned, (e) => toast(errText(e))).finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(on) => { if (!on && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }}>
        <DialogHeader><DialogTitle className="text-foreground">Clone GitHub repo</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-url" className="text-foreground">Repository URL</Label>
            <Input id="clone-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/user/repo.git" autoComplete="off" spellCheck={false} />
          </div>
          {(repos === null || repos.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Recent repos</span>
              <ul className="max-h-56 overflow-auto rounded-md border">
                {repos === null ? [0, 1, 2].map((k) => (
                  <li key={k} className="flex flex-col gap-2 border-t px-3 py-3 first:border-t-0">
                    <span className="h-3 w-1/3 animate-pulse rounded bg-muted" /><span className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                  </li>
                )) : shown.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No repos match</li> : shown.map((r) => (
                  <li key={r.url} className="border-t first:border-t-0">
                    <button onClick={() => setUrl(r.url)} onDoubleClick={go} aria-pressed={url === r.url}
                      className="flex w-full flex-col items-start px-3 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent aria-pressed:bg-accent">
                      <span className="truncate text-sm text-foreground">{r.name}</span>
                      {r.description && <span className="w-full truncate text-xs text-muted-foreground">{r.description}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-dir" className="text-foreground">Location</Label>
            <div className="flex gap-2">
              <Input id="clone-dir" value={dir} onChange={(e) => { setDir(e.target.value); save('clone-dir', e.target.value); }} spellCheck={false} />
              <Button variant="outline" onClick={() => void browse()}>Browse</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy || !url.trim() || !dir} onClick={go}>{busy ? 'Cloning…' : 'Clone repo'}<Kbd className="bg-transparent text-current opacity-60">⌘↵</Kbd></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
