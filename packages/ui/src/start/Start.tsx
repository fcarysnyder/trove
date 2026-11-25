// The desktop start page. Home: Pinned and Recent, each row opening its source (a repository's git badge
// opens it on another branch). Open: Folder (a repository's top-level folder opens as the repository, any
// other folder as a folder), File (its folder, the file selected) and Clone. A window opens directly; the
// agent a recent remembers starts with it. In a plain browser there is no bridge, so it says how to run
// the server instead.
import type { GitProbe, Recent, UpdateState } from '@trove/core/types';
import { recentName } from '@trove/core/types';
import { ArrowLeft, ChevronRight, FileCode, FileText, Folder, FolderOpen, GitBranch, Pin, X } from 'lucide-react';
import { Fragment, lazy, Suspense, useEffect, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { load, save } from '@/lib/storage';
import { dirOf, nameOf, tilde } from '@/lib/text';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { IconButton, TAB, TitleStrip } from '@/editor/bits';
import { RadioGroup, Tabs } from 'radix-ui';
import { toast } from 'sonner';

// The cube's code starts loading with the page, not when Home first renders.
const cubeChunk = import('./Cube');
const Cube = lazy(() => cubeChunk);

// The intro plays when Home opens, at most every ten minutes (once per module load, so StrictMode's double render agrees).
const INTRO = (() => {
  const play = Date.now() - Number(load<number>('home-intro-at', 0)) > 10 * 60_000;
  if (play) save('home-intro-at', Date.now());
  return play;
})();

let introSeen = !INTRO; // Back from Open returns to a settled Home

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (e: unknown) => void toast(errText(e));

export function Start() {
  useEffect(() => applyTheme('dark'), []); // the foundry look is dark; light mode keeps it
  useEffect(() => { document.title = 'Trove'; }, []);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-x-0 top-0 z-10 [&>div]:border-b-0"><TitleStrip /></div>
      {/* A fixed-size window: the page never scrolls (the table's rows do) and the mark's glow is clipped to it. */}
      <div className="h-dvh overflow-clip">
        <main className="mx-auto flex h-full w-full max-w-2xl flex-col gap-8 px-6 pt-20 pb-6">
          {window.trove ? <Screens /> : <NoBridge />}
        </main>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

function NoBridge() {
  return (
    <>
      <Title>Trove</Title>
      <p className="text-sm text-body">Run Trove on a git repository, a folder or a file, then open the address it prints:</p>
      <code className="rounded-md bg-secondary px-3 py-2 font-mono text-[13px] text-foreground">trove serve --root &lt;path&gt;</code>
    </>
  );
}

const Title = ({ children }: { children: ReactNode }) => (
  <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-foreground">{children}</h1>
);

/** Each recent probed: null when its folder is gone, `git` null when it is not in a repository. */
type Probes = Map<string, { git: GitProbe | null } | null>;

/** Home once the recents are in; Open first when there are none. */
function Screens() {
  const bridge = window.trove!;
  const [recents, setRecents] = useState<Recent[] | null>(null);
  const [probes, setProbes] = useState<Probes>(new Map());
  const [screen, setScreen] = useState<'home' | 'open' | null>(null);
  const reload = async () => {
    const list = await bridge.recents().catch(() => []);
    setRecents(list);
    setScreen((s) => s ?? (list.length ? 'home' : 'open'));
    // Each recent's branch fills in as git answers; Home doesn't wait for them.
    list.forEach((r) => void bridge.probe(r.path).catch(() => null).then((p) => setProbes((m) => new Map(m).set(r.path, p))));
  };
  useEffect(() => { void reload(); }, []);
  if (!recents || !screen) return null;
  if (screen === 'open') return <OpenScreen onBack={() => setScreen('home')} />;
  return <Home recents={recents} probes={probes} reload={reload} onOpen={() => setScreen('open')} />;
}

/** Once an update is downloaded and checked, a button to install it; nothing while there is none. */
function UpdateButton() {
  const bridge = window.trove!;
  const [u, setU] = useState<UpdateState | null>(null);
  useEffect(() => { void bridge.update().then(setU, () => {}); bridge.onUpdate(setU); }, []);
  if (u?.state !== 'ready') return null;
  return <Button variant="outline" onClick={() => void bridge.installUpdate()}>{`Restart to update to ${u.version}`}</Button>;
}

type Show = 'all' | 'folders' | 'files';

/** Lands from above with a little bounce once the intro is done; `n` staggers it. */
const drop = (n: number) => ({
  className: 'transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(.2,1.35,.45,1)] group-data-[phase=intro]/home:-translate-y-10 group-data-[phase=intro]/home:opacity-0 motion-reduce:transition-none',
  style: { transitionDelay: `${n * 60}ms` } as CSSProperties,
});

/**
 * The mark (the 3D cube, large while its intro plays, then in the header), the title, and the recents as one table:
 * the tabs, a count and Open in its header bar, pinned rows first. The T's light catches the table's top edge.
 */
function Home({ recents, probes, reload, onOpen }: { recents: Recent[]; probes: Probes; reload: () => Promise<void>; onOpen: () => void }) {
  const [show, setShow] = useState(() => load<Show>('start-show', 'all'));
  const [intro] = useState(() => !introSeen);
  useEffect(() => { introSeen = true; }, []);
  const [phase, setPhase] = useState<'intro' | 'ui'>(intro ? 'intro' : 'ui');
  const shown = recents.filter((r) => show === 'all' || (show === 'files') === !!r.file);
  const pinned = shown.filter((r) => r.pinned);
  const rest = shown.filter((r) => !r.pinned);
  let k = 0;
  const rows = (label: string, list: Recent[]) => list.length > 0 && (
    <section aria-label={label}>
      {pinned.length > 0 && <h2 className="flex h-8 items-center border-t bg-secondary/40 px-4 text-xs text-muted-foreground first:border-t-0">{label}</h2>}
      <ul>{list.map((r) => <Row key={r.path} recent={r} probe={probes.get(r.path)} reload={reload} n={k++} />)}</ul>
    </section>
  );
  return (
    <div data-phase={phase} className="group/home relative flex min-h-0 flex-1 flex-col">
      {/* One fixed size, scaled down into the header: resizing the canvas mid-move would blank it. */}
      <div aria-hidden data-mark className={cn('group/mark absolute z-10 size-[440px] origin-top-left transition-[left,top,scale] duration-700 ease-[cubic-bezier(.7,0,.2,1)] motion-reduce:transition-none',
        phase === 'intro' ? 'top-16 left-[calc(50%-132px)] scale-[.6]' : 'top-7 left-[calc(100%-124px)] scale-[.24]')}>
        {/* The T's light on the room: a soft wash that moves with the cube. */}
        <div className="pointer-events-none absolute -inset-[110%] rounded-full bg-[radial-gradient(closest-side,rgba(246,142,54,.09),rgba(246,142,54,.03)_45%,transparent)]" />
        <div className="pointer-events-none absolute -inset-[110%] rounded-full bg-[radial-gradient(closest-side,rgba(246,142,54,.16),rgba(246,142,54,.05)_45%,transparent)] opacity-0 transition-opacity duration-300 group-hover/mark:opacity-100" />
        <Suspense fallback={null}><Cube intro={intro} onIntroDone={() => setPhase('ui')} /></Suspense>
      </div>
      <header {...drop(0)} className={cn(drop(0).className, 'flex h-40 shrink-0 flex-col justify-center pr-48 pl-4')}>
        <h1 className="text-[44px] leading-none font-semibold tracking-tight text-foreground">Trove</h1>
        <p className="mt-3 text-base text-muted-foreground">Read, mark up and hand off docs to your agent</p>
      </header>
      <div {...drop(1)} className={cn(drop(1).className, 'relative mt-6 flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card/60')}>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_25%,rgba(255,160,90,.55)_72%,rgba(255,160,90,.55)_82%,transparent)]" />
        <span aria-hidden className="pointer-events-none absolute top-0 right-0 left-2/5 h-12 bg-[radial-gradient(55%_100%_at_68%_0,rgba(246,142,54,.07),transparent)]" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-[linear-gradient(90deg,transparent_12%,rgba(255,186,125,.95)_70%,rgba(255,186,125,.95)_84%,transparent)] opacity-0 transition-opacity duration-300 group-has-[[data-mark]:hover]/home:opacity-100 motion-reduce:transition-none" />
        <span aria-hidden className="pointer-events-none absolute top-0 right-0 left-1/4 z-10 h-12 bg-[radial-gradient(60%_100%_at_72%_0,rgba(246,142,54,.17),transparent)] opacity-0 transition-opacity duration-300 group-has-[[data-mark]:hover]/home:opacity-100 motion-reduce:transition-none" />
        <Tabs.Root className="shrink-0" value={show} onValueChange={(v) => { setShow(v as Show); save('start-show', v); }}>
          <div className="relative flex h-12 items-center gap-4 border-b bg-secondary/40 pr-2.5 pl-4">
            <Tabs.List aria-label="Show" className="flex h-full gap-4">
              {(['all', 'folders', 'files'] as const).map((v) => <Tabs.Trigger key={v} value={v} className={TAB}>{v[0]!.toUpperCase() + v.slice(1)}</Tabs.Trigger>)}
            </Tabs.List>
            <div className="ml-auto flex items-center gap-2">
              <UpdateButton />
              <Button size="sm" onClick={onOpen}>Open</Button>
            </div>
          </div>
        </Tabs.Root>
        <div className="min-h-0 overflow-y-auto">
          {shown.length ? <>{rows('Pinned', pinned)}{rows('Recent', rest)}</> : <p className="px-4 py-3 text-sm text-muted-foreground">Nothing here yet</p>}
        </div>
      </div>
    </div>
  );
}

/** A recent as it was last opened: its file selected in its folder, else the source with its kind and scope. */
const openRecent = (r: Recent) =>
  window.trove!.open(r.file ? { path: r.file } : { path: r.path, scope: r.scope, base: r.base, kind: r.kind }).catch(fail);

function Row({ recent: r, probe, reload, n }: { recent: Recent; probe: { git: GitProbe | null } | null | undefined; reload: () => Promise<void>; n: number }) {
  const bridge = window.trove!;
  const gone = probe === null;
  const git = r.kind === 'git' && !r.file ? probe?.git : null;
  const shown = r.file ?? r.path;
  const name = r.file ? nameOf(r.file) : recentName(r);
  const reveal = 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 group-has-[:focus-visible]:opacity-100 motion-reduce:transition-none';
  return (
    // The name's button covers the row (its ::after); the badge and the icons sit above it.
    <li style={{ transitionDelay: `${260 + n * 45}ms, ${260 + n * 45}ms, 0ms` }}
      className="group relative flex h-11 items-center gap-2.5 border-t px-4 transition-[opacity,translate,background-color] duration-300 first:border-t-0 hover:bg-secondary/50 has-[:focus-visible]:bg-secondary/50 group-data-[phase=intro]/home:translate-y-2 group-data-[phase=intro]/home:opacity-0 motion-reduce:transition-none">
      {(() => { const I = r.file ? (r.file.endsWith('.html') || r.file.endsWith('.htm') ? FileCode : FileText) : r.kind === 'git' ? GitBranch : Folder; return <I aria-hidden className="size-4 shrink-0 text-muted-foreground" />; })()}
      <button disabled={gone} onClick={() => void openRecent(r)} title={shown}
        className="min-w-0 shrink truncate text-left text-sm font-medium text-foreground outline-none after:absolute after:inset-0 disabled:text-muted-foreground">
        {name}
      </button>
      {git && <BranchMenu recent={r} git={git} />}
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{gone ? 'Not found' : tilde(dirOf(shown))}</span>
      <IconButton label={r.pinned ? `Unpin ${name}` : `Pin ${name}`} tip={r.pinned ? 'Unpin' : 'Pin'} aria-pressed={!!r.pinned}
        className={cn('relative', r.pinned ? 'text-foreground' : reveal)} onClick={() => void bridge.pin(r.path, !r.pinned).then(reload, fail)}>
        <Pin className={cn(r.pinned && 'fill-current')} />
      </IconButton>
      <IconButton label={`Remove ${name} from recents`} tip="Remove" className={cn('relative', reveal)}
        onClick={() => void bridge.forget(r.path).then(reload, fail)}><X /></IconButton>
    </li>
  );
}

/**
 * `git · <branch>`, opening a filterable list of the local branches. Picking one opens the repository on it:
 * the branch's own worktree when it is checked out in one, else this checkout switched to it.
 */
function BranchMenu({ recent: r, git }: { recent: Recent; git: GitProbe }) {
  const bridge = window.trove!;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = git.local.filter((b) => b.name.toLowerCase().includes(needle));
  const pick = (b: GitProbe['local'][number]) => {
    setOpen(false);
    const opened = b.current ? openRecent(r)
      : b.worktree ? bridge.open({ path: b.worktree, kind: 'git' })
      : bridge.switchBranch(r.path, b.name, null).then((res) => bridge.open({ path: res.path, kind: 'git', scope: r.scope, base: r.base }));
    void Promise.resolve(opened).catch(fail);
  };
  const where = (path: string) => (path === git.repo.root ? 'main checkout' : nameOf(path));
  return (
    <DropdownMenu open={open} onOpenChange={(on) => { setOpen(on); if (!on) setQ(''); }}>
      <DropdownMenuTrigger asChild>
        <Badge asChild variant="secondary" className="relative max-w-48 cursor-pointer font-normal text-muted-foreground hover:text-foreground">
          <button aria-label={`Branch ${git.branch ?? 'detached'}, switch`}><span className="truncate">{`git · ${git.branch ?? 'detached'}`}</span></button>
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        {/* Typing filters; the menu's own typeahead stays out of the field. Arrow down moves into the list. */}
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter branches" aria-label="Filter branches"
          autoComplete="off" spellCheck={false} className="h-9 rounded-none border-0 border-b shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) { e.preventDefault(); pick(shown[0]); }
            if (e.key !== 'ArrowDown' && e.key !== 'Escape') e.stopPropagation();
          }} />
        <div className="max-h-72 overflow-y-auto p-1">
          {shown.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No branches match</p>}
          {shown.map((b) => (
            <DropdownMenuItem key={b.name} onSelect={() => pick(b)} title={b.worktree ?? undefined}>
              <span className={cn('min-w-0 flex-1 truncate', b.current && 'font-medium text-foreground')}>{b.name}</span>
              {b.worktree && <span className="shrink-0 text-xs text-muted-foreground">{where(b.worktree)}</span>}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CARD = 'group flex flex-col overflow-hidden rounded-xl border bg-card text-left outline-none transition-[border-color,translate] duration-150 hover:-translate-y-px hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

function Card({ art, icon, title, end, ...props }: { art: ReactNode; icon: ReactNode; title: string; end: ReactNode } & ComponentProps<'button'>) {
  return (
    <button className={CARD} {...props}>
      <div className="flex h-28 items-center justify-center border-b bg-muted/40">
        <div className="transition-transform duration-250 ease-out group-hover:-translate-y-0.5 motion-reduce:transition-none">{art}</div>
      </div>
      <div className="flex items-center gap-2 px-3.5 py-3 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
        {icon}<span className="text-sm font-medium text-foreground">{title}</span><span className="ml-auto flex">{end}</span>
      </div>
    </button>
  );
}

const TREE_ROW = 'flex h-5 items-center gap-1.5 px-2 [&>svg]:size-3';
const FolderArt = () => (
  <div className="w-32 rounded-md border bg-card py-1 text-[11px] text-muted-foreground shadow-xs">
    <div className={TREE_ROW}>▾ notes</div>
    <div className={cn(TREE_ROW, 'pl-5')}><FileText />brief.md</div>
    <div className={cn(TREE_ROW, 'pl-5 text-foreground')}><FileCode />app.html</div>
    <div className={cn(TREE_ROW, 'pl-5')}><FileText />plan.mdx</div>
  </div>
);

const FileArt = () => (
  <div className="flex h-[92px] w-[76px] -rotate-3 flex-col gap-1.5 rounded-sm rounded-tr-2xl border bg-card px-2.5 pt-4 shadow-xs">
    {['w-full', 'w-4/5', 'w-3/5 bg-ring/70', 'w-full', 'w-2/3'].map((w, k) => <span key={k} className={cn('h-[5px] rounded-full bg-muted-foreground/25', w)} />)}
  </div>
);

const CloneArt = () => (
  <svg width="120" height="64" viewBox="0 0 120 64" fill="none" strokeWidth="2" aria-hidden>
    <path d="M8 44H112" className="stroke-muted-foreground/40" />
    <path d="M56 44C72 44 68 20 84 20H106" className="stroke-ring" />
    {[24, 56, 88].map((x) => <circle key={x} cx={x} cy="44" r="4" className="fill-card stroke-muted-foreground/60" />)}
    <circle cx="84" cy="20" r="4" className="fill-card stroke-ring" />
    <circle cx="106" cy="20" r="4" className="fill-ring stroke-ring" />
  </svg>
);

/** A folder's name in the repository dialog, set like code so it reads as the name on disk. */
const Name = ({ children }: { children: ReactNode }) => <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>;

/** One of the repository dialog's two ways to open, picked like a radio. */
function Choice({ value, icon, title, name, rows }: { value: string; icon: ReactNode; title: string; name: string; rows: [string, string][] }) {
  return (
    <RadioGroup.Item value={value}
      className="group grid grid-cols-[16px_minmax(0,1fr)_16px] gap-x-3 rounded-lg border bg-card/40 px-4 py-3.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:text-muted-foreground">
      {icon}
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">{title}<Name>{name}</Name></span>
        <span className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
          {rows.map(([k, v]) => <Fragment key={k}><span className="text-muted-foreground">{k}</span><span className="font-mono break-all text-foreground">{v}</span></Fragment>)}
        </span>
      </span>
      <span aria-hidden className="mt-0.5 grid size-4 place-items-center rounded-full border group-data-[state=checked]:border-primary">
        <span className="size-2 rounded-full bg-primary opacity-0 group-data-[state=checked]:opacity-100" />
      </span>
    </RadioGroup.Item>
  );
}

function OpenScreen({ onBack }: { onBack: () => void }) {
  const bridge = window.trove!;
  const [cloning, setCloning] = useState(false);
  // A repository's top-level folder opens as the repository; main decides, as it does for ⌘O and a drop.
  // Inside a repository (not its top), ask: this folder as its own root, or the whole repository with git.
  const [inside, setInside] = useState<{ path: string; git: GitProbe } | null>(null);
  const [asGit, setAsGit] = useState(false);
  const folder = () => bridge.pickFolder().then((res) => {
    if (!res) return;
    // A folder inside a repository asks every time; the repository's own folder opens as the repository.
    if (res.git && res.git.worktree.path !== res.path) { setAsGit(false); setInside({ path: res.path, git: res.git }); }
    else return bridge.open({ path: res.path });
  }).catch(fail);
  const choose = () => {
    const pick = inside!;
    setInside(null);
    void bridge.open(asGit ? { path: pick.git.worktree.path, kind: 'git' } : { path: pick.path, kind: 'folder' }).catch(fail);
  };
  const file = () => bridge.pickFile().then((path) => (path ? bridge.open({ path }) : undefined)).catch(fail);
  return (
    <>
      <div className="-mb-4"><Button variant="ghost" size="sm" className="-ml-2.5" onClick={onBack}><ArrowLeft />Back</Button></div>
      <Title>Open</Title>
      <Dialog open={!!inside} onOpenChange={(o) => { if (!o) setInside(null); }}>
        {inside && <DialogContent className="gap-5 p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>This folder is in a git repository</DialogTitle>
            <DialogDescription className="leading-relaxed text-pretty">
              <Name>{nameOf(inside.path)}</Name> is inside <Name>{inside.git.repo.name}</Name>. Open the repository to work with its branch, or stay with this folder.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup.Root aria-label="Open" value={asGit ? 'git' : 'folder'} onValueChange={(v) => setAsGit(v === 'git')} className="flex flex-col gap-2.5">
            <Choice value="folder" icon={<Folder />} title="Stay with folder" name={nameOf(inside.path)} rows={[['Path', tilde(inside.path)]]} />
            <Choice value="git" icon={<GitBranch />} title="Open repository" name={inside.git.repo.name}
              rows={[['Path', tilde(inside.git.worktree.path)], ...(inside.git.branch ? [['↳ Branch', inside.git.branch] as [string, string]] : [])]} />
          </RadioGroup.Root>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" className="-ml-2.5" onClick={() => { setInside(null); void folder(); }}><ArrowLeft />Choose another folder</Button>
            <Button autoFocus onClick={choose}>{asGit ? 'Open repository' : 'Stay with folder'}</Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-3">
        <Card art={<FolderArt />} icon={<FolderOpen />} title="Folder" end={<Kbd>⌘O</Kbd>} onClick={() => void folder()} />
        <Card art={<FileArt />} icon={<FileText />} title="File" end={<Kbd>⇧⌘O</Kbd>} onClick={() => void file()} />
        <Card art={<CloneArt />} icon={<GitBranch />} title="Clone" aria-expanded={cloning} onClick={() => setCloning((c) => !c)}
          end={<ChevronRight className={cn('size-4 text-muted-foreground transition-transform motion-reduce:transition-none', cloning && 'rotate-90')} />} />
      </div>
      {cloning && <div className="-mt-5 overflow-hidden rounded-xl border bg-card"><Clone /></div>}
    </>
  );
}

type GithubRepo = Awaited<ReturnType<NonNullable<typeof window.trove>['githubRepos']>>[number];

/** Clone a repository by URL or owner/repo, or one of yours from the gh CLI, into a folder; then it opens. */
function Clone() {
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
    bridge.clone(target, dir).then((res) => bridge.open({ path: res.path })).catch(fail).finally(() => setBusy(false));
  };
  return (
    <form className="flex flex-col gap-3 px-4 py-4" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <Input autoFocus aria-label="Repository URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo or owner/repo"
        autoComplete="off" spellCheck={false} />
      {(repos === null || repos.length > 0) && (
        <ul aria-label="Your repositories" className="max-h-36 overflow-auto rounded-md border">
          {repos === null ? [0, 1, 2].map((k) => (
            <li key={k} className="flex flex-col gap-2 border-t px-3 py-3 first:border-t-0">
              <span className="h-3 w-1/3 animate-pulse rounded bg-muted" /><span className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
            </li>
          )) : shown.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No repositories match</li> : shown.map((r) => (
            <li key={r.url} className="border-t first:border-t-0">
              <button type="button" onClick={() => setUrl(r.url)} onDoubleClick={go} aria-pressed={url === r.url}
                className="flex w-full flex-col items-start px-3 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent aria-pressed:bg-accent">
                <span className="truncate text-sm text-foreground">{r.name}</span>
                {r.description && <span className="w-full truncate text-xs text-muted-foreground">{r.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input aria-label="Clone into" value={dir} onChange={(e) => { setDir(e.target.value); save('clone-dir', e.target.value); }} spellCheck={false} />
        <Button type="button" variant="outline" onClick={() => void browse()}>Browse</Button>
        <Button type="submit" disabled={busy || !url.trim() || !dir}>{busy ? 'Cloning…' : 'Clone'}</Button>
      </div>
    </form>
  );
}
