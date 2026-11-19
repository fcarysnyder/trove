// The desktop start page. Home: Pinned and Recent, each row opening its source (a repository's git badge
// opens it on another branch). Open: Folder (a repository's top-level folder opens as the repository, any
// other folder as a folder), File (its folder, the file selected) and Clone. A window opens directly; the
// agent a recent remembers starts with it. In a plain browser there is no bridge, so it says how to run
// the server instead.
import type { GitProbe, Recent, UpdateState } from '@trove/core/types';
import { recentName } from '@trove/core/types';
import { ArrowLeft, ChevronRight, FileCode, FileText, FolderOpen, GitBranch, Pin, X } from 'lucide-react';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Tabs } from 'radix-ui';
import mark from '../../../../design/icon/mark/favicon.svg';
import { toast } from 'sonner';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (e: unknown) => void toast(errText(e));

export function Start() {
  useEffect(() => applyTheme('system'), []);
  useEffect(() => { document.title = 'Trove'; }, []);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-x-0 top-0 z-10 [&>div]:border-b-0"><TitleStrip /></div>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 pt-20 pb-16">
        {window.trove ? <Screens /> : <NoBridge />}
      </main>
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
    const res = await Promise.all(list.map((r) => bridge.probe(r.path).catch(() => null)));
    setProbes(new Map(list.map((r, k) => [r.path, res[k]])));
    setRecents(list);
    setScreen((s) => s ?? (list.length ? 'home' : 'open'));
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

function Home({ recents, probes, reload, onOpen }: { recents: Recent[]; probes: Probes; reload: () => Promise<void>; onOpen: () => void }) {
  const [show, setShow] = useState(() => load<Show>('start-show', 'all'));
  const shown = recents.filter((r) => show === 'all' || (show === 'files') === !!r.file);
  const pinned = shown.filter((r) => r.pinned);
  const rest = shown.filter((r) => !r.pinned);
  const list = (label: string, rows: Recent[]) => rows.length > 0 && (
    <section aria-label={label} className="flex flex-col gap-1">
      <h2 className="px-3 text-xs font-medium text-muted-foreground">{label}</h2>
      <ul className="flex flex-col">{rows.map((r) => <Row key={r.path} recent={r} probe={probes.get(r.path)} reload={reload} />)}</ul>
    </section>
  );
  return (
    <>
      <div className="flex items-center gap-2">
        <Title><img src={mark} alt="" className="size-8" />Trove</Title>
        <div className="ml-auto flex items-center gap-2">
          <UpdateButton />
          <Button onClick={onOpen}>Open</Button>
        </div>
      </div>
      {recents.length > 0 && (
        <Tabs.Root value={show} onValueChange={(v) => { setShow(v as Show); save('start-show', v); }}>
          <Tabs.List aria-label="Show" className="flex h-9 gap-4 border-b px-3">
            <Tabs.Trigger value="all" className={TAB}>All</Tabs.Trigger>
            <Tabs.Trigger value="folders" className={TAB}>Folders</Tabs.Trigger>
            <Tabs.Trigger value="files" className={TAB}>Files</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      )}
      {list('Pinned', pinned)}
      {list('Recent', rest)}
    </>
  );
}

/** A recent as it was last opened: its file selected in its folder, else the source with its kind and scope. */
const openRecent = (r: Recent) =>
  window.trove!.open(r.file ? { path: r.file } : { path: r.path, scope: r.scope, base: r.base, kind: r.kind }).catch(fail);

function Row({ recent: r, probe, reload }: { recent: Recent; probe: { git: GitProbe | null } | null | undefined; reload: () => Promise<void> }) {
  const bridge = window.trove!;
  const gone = probe === null;
  const git = r.kind === 'git' && !r.file ? probe?.git : null;
  const shown = r.file ?? r.path;
  const name = r.file ? nameOf(r.file) : recentName(r);
  const reveal = 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 group-has-[:focus-visible]:opacity-100 motion-reduce:transition-none';
  return (
    // The name's button covers the row (its ::after); the badge and the icons sit above it.
    <li className="group relative flex h-10 items-center gap-2 rounded-md px-3 transition-colors hover:bg-secondary has-[:focus-visible]:bg-secondary">
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

function OpenScreen({ onBack }: { onBack: () => void }) {
  const bridge = window.trove!;
  const [cloning, setCloning] = useState(false);
  // A repository's top-level folder opens as the repository; main decides, as it does for ⌘O and a drop.
  const folder = () => bridge.pickFolder().then((res) => res && bridge.open({ path: res.path })).catch(fail);
  const file = () => bridge.pickFile().then((path) => (path ? bridge.open({ path }) : undefined)).catch(fail);
  return (
    <>
      <div className="-mb-4"><Button variant="ghost" size="sm" className="-ml-2.5" onClick={onBack}><ArrowLeft />Back</Button></div>
      <Title>Open</Title>
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
        <ul aria-label="Your repositories" className="max-h-56 overflow-auto rounded-md border">
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
