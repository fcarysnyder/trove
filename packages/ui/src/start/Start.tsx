// The desktop start page: Open repository and the recents. A repository, picked or recent, opens a dialog
// with what to review (worktree, branch, scope) and the agent to start in Terminal beside it; Open starts
// the server and the repository's own window. A folder that is not a repository stays here with the
// reason. In a plain browser there is no bridge, so it says how to run the server instead.
import { attachCommand, recentName, type AgentTool, type GitProbe, type GitScope, type Recent, type TerminalApp } from '@trove/core/types';
import { Copy, FolderOpen, Globe, Settings, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { load, save } from '@/lib/storage';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { tilde } from '@/lib/text';
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
      <main className="grid min-h-screen place-items-center px-12 py-16">
        <div className="flex w-full max-w-2xl flex-col gap-8">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-foreground">
            <img src={mark} alt="" className="size-12" />Trove
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

/** `~/code/…/parent/repo`: the head gives way first, the last two folders stay whole; the full path on hover. */
function Path({ path, className }: { path: string; className?: string }) {
  const parts = tilde(path).split('/');
  const cut = Math.max(1, parts.length - 2);
  return (
    <span title={path} className={cn('flex min-w-0 text-left', className)}>
      <span className="truncate">{parts.slice(0, cut).join('/')}/</span>
      <span className="shrink-0">{parts.slice(cut).join('/')}</span>
    </span>
  );
}

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex h-28 flex-col justify-between rounded-xl border bg-card p-4 text-left text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5">
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
  const [deleting, setDeleting] = useState<Recent | null>(null);
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
            <Path path={notRepo} className="font-mono text-xs text-muted-foreground" />
            <span role="alert" className="text-sm text-destructive">{NOT_A_REPO}</span>
          </div>
        )}
      </div>
      {recents.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="px-4 py-3"><CardTitle className="text-sm text-foreground">Recent</CardTitle></CardHeader>
          {/* The list scrolls inside its card, so the start page stays one centred block at any window height. */}
          <ul className="flex max-h-[max(10rem,calc(100vh-26rem))] flex-col overflow-y-auto">
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
                    <Path path={r.path} className="w-full text-xs text-muted-foreground" />
                  </span>
                </>
              );
              // Rows run edge to edge. The whole row opens the repository (the button's ::after covers it); Delete
              // and Remove sit above that, and the time stays in one column whatever actions a row has.
              const row = "flex min-w-0 flex-1 items-center py-3 pl-4 text-left outline-none after:absolute after:inset-0";
              const reveal = 'relative opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none';
              return (
                <li key={r.path} className="group relative flex items-center gap-3 border-t pr-3 transition-colors hover:bg-secondary has-[:focus-visible]:bg-secondary">
                  {bad ? <div className={cn(row, 'opacity-60')} aria-disabled>{body}</div> : (
                    <button className={row} onClick={() => git && setOpen({ path: r.path, git, last: r })}>{body}</button>
                  )}
                  {r.worktree && <Button variant="ghost" size="sm" className={cn('text-muted-foreground', reveal)} onClick={() => setDeleting(r)}>Delete</Button>}
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(r.openedAt)}</span>
                  <IconButton label={`Remove ${recentName(r)} from recents`} tip="Remove" className={reveal}
                    onClick={() => bridge.forget(r.path).then(reload)}><X /></IconButton>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {open && <OpenDialog key={open.path} repo={open} onClose={() => setOpen(null)} />}
      {deleting && <DeleteDialog recent={deleting} branch={probes.get(deleting.path)?.branch ?? null} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void reload(); }} />}
      {cloning && <CloneDialog onClose={() => setCloning(false)} onCloned={(res) => { setCloning(false); take(res); }} />}
    </div>
  );
}

/** Two-part rows (a field and its select, a switch and its select) split at the same line all the way down. */
const PAIR = 'grid grid-cols-2 gap-2';

/** Start-page dialogs sit a fixed distance from the top, so a section that opens grows them downward only. */
const PINNED = 'top-[8vh] max-h-[84vh] translate-y-0 overflow-y-auto';

/** The Settings dialog's footer: a rule over the actions, edge to edge. */
const FOOTER = '-mx-6 -mb-6 gap-2.5 border-t px-6 py-3';

/** A label over its field; `aside` sits at the label's right (a mode switch). */
function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-foreground">{label}</span>{aside}</div>
      {children}
    </div>
  );
}

/** A segmented control in the editor's style (the Changes column's This file / All files). `fill`: its grid cell's width, options sharing it. */
function Segmented({ label, value, options, onChange, disabled, fill }: { label: string; value: string; options: [string, ReactNode][]; onChange: (v: string) => void; disabled?: boolean; fill?: boolean }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} aria-label={label} spacing={0} disabled={disabled}
      className={cn('shrink-0 gap-0.5 rounded-lg bg-secondary p-0.5', fill && 'w-full')}>
      {options.map(([v, text]) => (
        <ToggleGroupItem key={v} value={v} size="sm" className={cn('h-8 gap-1.5 rounded-md! px-2 text-xs text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground', fill && 'flex-1')}>
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Terminal apps as their makers name them (the bundle names differ: iTerm.app is iTerm2). */
const TERMINAL_NAMES: Record<TerminalApp, string> = { Terminal: 'Terminal', iTerm: 'iTerm2', Ghostty: 'Ghostty', WezTerm: 'WezTerm', kitty: 'kitty', Alacritty: 'Alacritty' };

type Choice = AgentTool | 'none';
const CHOICES: [Choice, string, string][] = [['claude', 'Claude Code', 'bg-agent-claude'], ['codex', 'Codex', 'bg-agent-codex'], ['none', 'None', 'bg-muted-foreground']];

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
  // A branch to create in its own worktree before opening; null opens the worktree as it is.
  const [fresh, setFresh] = useState<{ name: string; from: string } | null>(null);
  // A local branch no worktree has checked out: Open checks it out in a worktree of its own first.
  const [pick, setPick] = useState<string | null>(null);
  // A new branch: this checkout switches to it (git switch -c), or it gets a worktree of its own under `dir`.
  const [worktree, setWorktree] = useState(false);
  const [dir, setDir] = useState('');
  useEffect(() => { void bridge.worktreeDir().then(setDir, () => {}); }, []);
  const changeDir = async () => {
    const picked = await bridge.pickFolder().catch(() => null);
    if (picked) bridge.setWorktreeDir(picked.path).then(setDir, (e) => toast(errText(e)));
  };
  const slug = (fresh?.name.trim() ?? '').replaceAll('/', '-');
  // The worktree's folder name: the branch's until the user types their own.
  const [folder, setFolder] = useState<string | null>(null);
  const [terms, setTerms] = useState<{ installed: TerminalApp[]; current: TerminalApp } | null>(null);
  useEffect(() => { void bridge.tools().then(setTools, () => {}); void bridge.terminals().then(setTerms, () => {}); }, []);
  const pickTerminal = (t: string) => bridge.setTerminal(t as TerminalApp).then(() => setTerms((x) => x && { ...x, current: t as TerminalApp }), (e) => toast(errText(e)));
  const here = git.worktree.path;
  const toWorktree = (path: string) => {
    if (path === here) return;
    bridge.probe(path).then((res) => {
      if (!res?.git) return void toast(NOT_A_REPO);
      setCur({ path: res.path, git: res.git });
      setPick(null);
      setBase(defaultBase(res.git));
    }, (e) => toast(errText(e)));
  };
  const bases = git.branches.filter((b) => b !== git.branch);
  const command = choice === 'none' ? null : attachCommand(choice, cur.path, '<port>');
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
  const go = () => {
    if (busy || (fresh && !fresh.name.trim())) return;
    setBusy(true);
    const agent = choice === 'none' ? null : choice;
    const review = { scope, base: scope === 'branch' ? base || null : null, agent };
    const name = fresh?.name.trim() ?? '';
    (fresh
      ? (worktree ? bridge.addWorktree(cur.path, name, fresh.from, dir, folder ?? slug) : bridge.switchBranch(cur.path, name, fresh.from))
          .then((res) => bridge.open({ path: res.path, scope: 'uncommitted', agent }))
      : pick
        ? bridge.switchBranch(cur.path, pick, null).then((res) => bridge.open({ path: res.path, ...review }))
        : bridge.open({ path: cur.path, ...review }))
      .catch((e) => toast(errText(e))).finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(on) => { if (!on) onClose(); }}>
      <DialogContent className={cn(PINNED, "sm:max-w-2xl")} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }}>
        <DialogHeader>
          <DialogTitle className="text-foreground">{nameOf(cur.path)}</DialogTitle>
          <DialogDescription><Path path={cur.path} className="font-mono text-xs" /></DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Field label="Branch" aside={
            <Segmented label="Branch" value={fresh ? 'new' : 'existing'} options={[['existing', 'Existing'], ['new', 'New']]}
              onChange={(v) => setFresh(v === 'new' ? { name: '', from: git.defaultBase ?? git.branch ?? git.branches[0] ?? 'HEAD' } : null)} />
          }>
            {fresh ? (
              <div className={PAIR}>
                <Input autoFocus aria-label="New branch name" placeholder="docs/new-branch" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
                  className="font-mono text-xs" autoComplete="off" spellCheck={false} />
                <Select value={fresh.from} onValueChange={(from) => setFresh({ ...fresh, from })}>
                  <SelectTrigger size="default" className="w-full min-w-0 font-mono text-xs" aria-label="From">
                    <span className="font-sans text-muted-foreground">from</span><span className="mr-auto truncate"><SelectValue /></span>
                  </SelectTrigger>
                  <SelectContent>{git.branches.map((b) => <SelectItem key={b} value={b} className="font-mono text-xs">{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              // Checked out here: stay. In another worktree: that worktree. Anywhere else: this checkout switches to it on Open.
              <Select value={pick ?? git.branch ?? ''} onValueChange={(name) => {
                const b = git.local.find((l) => l.name === name);
                setPick(b && !b.current && !b.worktree ? name : null);
                if (b?.worktree) toWorktree(b.worktree);
              }}>
                <SelectTrigger size="default" className="w-full text-xs" aria-label="Branch"><SelectValue placeholder="detached HEAD" /></SelectTrigger>
                <SelectContent>
                  {git.local.map((b) => {
                    const at = b.current ? git.worktree.path : b.worktree;
                    return (
                      <SelectItem key={b.name} value={b.name} title={at ?? undefined} className="text-xs">
                        <span className="font-mono text-foreground">{b.name}</span>
                        {at && <span className="text-muted-foreground">{at === git.repo.root ? 'main checkout' : nameOf(at)}</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {/* A new branch can go in a worktree of its own; an existing one is switched to here. */}
            {fresh && (
              <div className="flex items-center gap-2">
                <Checkbox id="open-worktree" checked={worktree} onCheckedChange={(v) => setWorktree(v === true)} />
                <Label htmlFor="open-worktree" className="font-normal text-foreground">Worktree</Label>
              </div>
            )}
            {fresh && worktree && (
              <div className={PAIR}>
                <Button variant="outline" onClick={() => void changeDir()} title={`Change where worktrees go (${dir})`}
                  className="w-full min-w-0 justify-between gap-2 font-mono text-xs font-normal">
                  <Path path={`${dir}/${git.repo.name}/`} /><Settings className="text-muted-foreground" />
                </Button>
                <Input aria-label="Worktree folder name" placeholder="docs-new-branch" value={folder ?? slug} onChange={(e) => setFolder(e.target.value)}
                  className="font-mono text-xs" autoComplete="off" spellCheck={false} />
              </div>
            )}
          </Field>
          {/* A new branch has nothing committed to review; the dialog is pinned to the top, so this only moves what is below. */}
          {!fresh && (
            <Field label="Review">
              <div className={PAIR}>
                <Segmented fill label="Review" value={scope} onChange={(v) => setScope(v as GitScope)}
                  options={[['uncommitted', 'Uncommitted'], ...(bases.length ? [['branch', 'Branch vs base'] as [string, string]] : [])]} />
                <Select value={base} onValueChange={setBase} disabled={scope !== 'branch'}>
                  <SelectTrigger size="default" className="w-full min-w-0 font-mono text-xs" aria-label="Base"><SelectValue /></SelectTrigger>
                  <SelectContent>{bases.map((b) => <SelectItem key={b} value={b} className="font-mono text-xs">{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </Field>
          )}
          <Field label="Agent">
            <div className={PAIR}>
              <Segmented fill label="Agent" value={choice} onChange={(v) => setChoice(v as Choice)}
                options={CHOICES.map(([value, text, dot]) => [value, <><span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />{text}</>])} />
              <Select value={terms?.current ?? 'Terminal'} onValueChange={pickTerminal} disabled={choice === 'none' || (terms?.installed.length ?? 0) < 2}>
                <SelectTrigger size="default" className="w-full min-w-0 text-xs" aria-label="Terminal app"><SelectValue /></SelectTrigger>
                <SelectContent>{(terms?.installed ?? ['Terminal']).map((t) => <SelectItem key={t} value={t} className="text-xs">{TERMINAL_NAMES[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {choice !== 'none' && tools && !tools[choice] && <span role="status" className="text-sm text-muted-foreground">{`${choice} is not installed`}</span>}
            {command && (
              <div className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-0.5 pl-2">
                <code title={command} className="min-w-0 flex-1 truncate font-mono text-xs text-body">{command}</code>
                <IconButton label="Copy command" onClick={() => copy(command)}><Copy /></IconButton>
              </div>
            )}
          </Field>
        </div>
        <DialogFooter className={FOOTER}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || (!!fresh && !fresh.name.trim())} onClick={go}>
            {/* Both labels share one cell, so the button keeps the longer one's width and Cancel never moves. */}
            <span className="grid *:col-start-1 *:row-start-1">
              <span className={cn(fresh && 'invisible')}>Open</span>
              <span className={cn(!fresh && 'invisible')}>Create and open</span>
            </span>
            <Kbd className="bg-transparent text-current opacity-60">⌘↵</Kbd></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete a linked worktree's folder (`git worktree remove`); its branch stays. git refuses while it has uncommitted files. */
function DeleteDialog({ recent, branch, onClose, onDeleted }: { recent: Recent; branch: string | null; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const go = () => {
    if (busy) return;
    setBusy(true);
    window.trove!.removeWorktree(recent.path).then(onDeleted, (e) => toast(errText(e))).finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(on) => { if (!on && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{`Delete ${recentName(recent)}?`}</DialogTitle>
          <DialogDescription><Path path={recent.path} className="font-mono text-xs" /></DialogDescription>
        </DialogHeader>
        <p className="text-sm text-body">{branch ? <>The folder goes; the branch <code className="font-mono text-xs">{branch}</code> stays.</> : 'The folder goes; its commits stay.'}</p>
        <DialogFooter className={FOOTER}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={go}>Delete folder</Button>
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
      <DialogContent className={cn(PINNED, "sm:max-w-lg")} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }}>
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
        <DialogFooter className={FOOTER}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !url.trim() || !dir} onClick={go}>{busy ? 'Cloning…' : 'Clone repo'}<Kbd className="bg-transparent text-current opacity-60">⌘↵</Kbd></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
