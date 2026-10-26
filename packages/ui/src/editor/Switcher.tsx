// GitHub Desktop's top-left menu as one popover with a tab per thing to switch: Repository (on the
// desktop the recents and Open repository…), Worktree (only when the repository has more than one) and
// Branch (switch here, or open the worktree a branch is checked out in), each with its own filter. A
// server serves one root, so another worktree opens elsewhere.
import { recentName, type BranchInfo } from '@trove/core/types';
import { BookMarked, Check, ChevronDown, Copy, FolderTree, Search } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { tilde } from '@/lib/text';
import { cn } from '@/lib/utils';
import { loadGit, loadRecents, openRecent, openWorktree, switchBranch } from './actions';
import { Count, IconButton } from './bits';
import { get, set, useNames, useStore, type State } from './store';

type Tab = NonNullable<State['switcher']>;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const MAIN = 'main checkout';
let lastTab: Tab = 'repo';

export function Switcher() {
  const git = useStore((s) => s.git);
  const source = useStore((s) => s.source);
  const tab = useStore((s) => s.switcher);
  const open = !!tab;
  useEffect(() => {
    if (!open) return;
    void loadGit();
    void loadRecents();
  }, [open]);
  if (!git) return <strong className="self-center truncate px-4 font-semibold text-foreground" title={source?.root}>{source?.name ?? 'Trove'}</strong>;
  const multi = git.worktrees.length > 1;
  const value = tab === 'worktree' && !multi ? 'branch' : tab;
  const where = [!git.worktree.main && git.worktree.name, git.branch ?? git.head].filter(Boolean).join(' · ');
  const tabs: [Tab, string][] = [['repo', 'Repository'], ...(multi ? [['worktree', 'Worktree'] as [Tab, string]] : []), ['branch', 'Branch']];
  return (
    <>
      <Popover open={open} onOpenChange={(on) => set({ switcher: on ? lastTab : null })}>
        <PopoverTrigger asChild>
          <Button variant="ghost" title={git.root} aria-label={`Repository ${git.repo.name}, ${where}`}
            className="h-full w-72 min-w-0 shrink justify-start gap-3 rounded-none border-r px-4 text-left hover:bg-accent aria-expanded:bg-accent [&>svg]:text-muted-foreground">
            <BookMarked />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-4 font-semibold text-foreground">
                <span className="max-w-[240px] truncate">{git.repo.name}</span>
                {git.dirty > 0 && <Count n={git.dirty} />}
              </span>
              <span className="max-w-[280px] truncate font-mono text-[11px] leading-4 font-normal text-muted-foreground">{where}</span>
            </span>
            <ChevronDown className="ml-auto size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 gap-0 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()} // the tab's filter focuses itself
          // The serve dialog opens as the popover closes: focus going back to the trigger would close it again.
          onCloseAutoFocus={(e) => { if (get().serveRoot) e.preventDefault(); }}>
          <Tabs.Root value={value ?? 'repo'} onValueChange={(v) => { lastTab = v as Tab; set({ switcher: v as Tab }); }}>
            <Tabs.List aria-label="Switch" className="flex gap-1 border-b px-2 pt-1.5">
              {tabs.map(([v, label]) => (
                <Tabs.Trigger key={v} value={v}
                  className="-mb-px border-b-2 border-transparent px-2 pt-1 pb-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground">
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="repo"><RepoTab /></Tabs.Content>
            {multi && <Tabs.Content value="worktree"><WorktreeTab /></Tabs.Content>}
            <Tabs.Content value="branch"><BranchTab /></Tabs.Content>
          </Tabs.Root>
        </PopoverContent>
      </Popover>
      <ServeDialog />
    </>
  );
}

interface Row { key: string; title: string; sub?: string; hint?: string; mono?: boolean; current?: boolean; count?: number; mark?: ReactNode; off?: string; pick: () => void }

/** A filter over a list of rows: ↓/↑ move through it, Enter takes the first match, choosing closes the popover. */
function PickList({ rows, noun, footer }: { rows: Row[]; noun: string; footer?: ReactNode }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // A frame later: opening the popover and clicking a tab both put focus on the tabs after this mounts.
  useEffect(() => { const id = requestAnimationFrame(() => input.current?.focus()); return () => cancelAnimationFrame(id); }, []);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => `${r.title} ${r.sub ?? ''}`.toLowerCase().includes(needle));
  const go = (r: Row) => {
    if (r.off) return;
    set({ switcher: null });
    if (!r.current) r.pick();
  };
  const nav = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [input.current!, ...list.current!.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const k = items.indexOf(document.activeElement as HTMLElement);
    items[Math.max(0, Math.min(items.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };
  return (
    <div onKeyDown={nav}>
      <div className="relative p-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${noun}`} aria-label={`Filter ${noun}`}
          autoComplete="off" spellCheck={false} className="h-8 pl-8"
          onKeyDown={(e) => {
            const first = shown.find((r) => !r.off);
            if (e.key === 'Enter' && first) { e.preventDefault(); go(first); }
          }} />
      </div>
      <div ref={list} className="max-h-80 overflow-auto px-1 pb-1">
        {shown.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{rows.length ? `No ${noun} match` : `No ${noun}`}</p>}
        {shown.map((r) => {
          const row = (
            <button key={r.key} disabled={!!r.off} onClick={() => go(r)} title={r.hint}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50 disabled:hover:bg-transparent">
              <Check className={cn('size-4 shrink-0 text-muted-foreground', !r.current && 'invisible')} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate text-sm text-foreground', r.mono && 'font-mono text-xs')}>{r.title}</span>
                {r.sub && <span className="truncate text-xs text-muted-foreground">{r.sub}</span>}
              </span>
              {!!r.count && <Count n={r.count} />}
              {r.mark}
            </button>
          );
          // A disabled button takes no pointer events, so its tooltip sits on a wrapper.
          return r.off ? (
            <Tooltip key={r.key}>
              <TooltipTrigger asChild><div>{row}</div></TooltipTrigger>
              <TooltipContent side="right">{r.off}</TooltipContent>
            </Tooltip>
          ) : row;
        })}
      </div>
      {footer && <div className="border-t p-1">{footer}</div>}
    </div>
  );
}

function RepoTab() {
  const git = useStore((s) => s.git)!;
  const recents = useStore((s) => s.recents);
  const bridge = window.trove;
  const ours = new Set([git.repo.root, ...git.worktrees.map((w) => w.path)]); // the worktree tab's
  const openRepo = async () => {
    set({ switcher: null });
    try {
      const picked = await bridge!.pickFolder();
      if (!picked) return;
      if (!picked.git) return void toast('Not a git repository');
      await bridge!.open({ path: picked.path });
    } catch (e) {
      toast(errText(e));
    }
  };
  const rows: Row[] = [
    { key: git.repo.root, title: git.repo.name, sub: tilde(git.repo.root), hint: git.repo.root, current: true, pick: () => {} },
    ...recents.filter((r) => !ours.has(r.path)).map((r): Row => ({
      key: r.path, title: recentName(r), sub: tilde(r.path), hint: r.path, count: r.changes ?? 0,
      off: r.changes === null ? 'Not a git repository' : undefined, pick: () => void openRecent(r),
    })),
  ];
  return (
    <PickList rows={rows} noun="repositories"
      footer={bridge && <Button variant="ghost" size="default" className="w-full justify-start font-normal" onClick={() => void openRepo()}>Open repository…</Button>} />
  );
}

function WorktreeTab() {
  const git = useStore((s) => s.git)!;
  const rows = git.worktrees.map((w): Row => ({
    key: w.path, title: w.main ? MAIN : w.name, sub: w.branch ?? w.head, hint: w.path, current: w.current, count: w.changes,
    pick: () => void openWorktree(w.path),
  }));
  return <PickList rows={rows} noun="worktrees" />;
}

function BranchTab() {
  const git = useStore((s) => s.git)!;
  const locked = useStore((s) => s.files.some((f) => f.state === 'working'));
  const n = useNames();
  const choose = (b: BranchInfo) => (b.worktree ? openWorktree(b.worktree) : switchBranch(b.name));
  const rows = git.branches.map((b): Row => ({
    key: b.name, title: b.name, mono: true, current: b.current,
    off: locked && !b.current && !b.worktree ? `${n.Agent} is working on a file` : undefined,
    mark: b.worktree && (
      <Tooltip>
        <TooltipTrigger asChild><FolderTree className="size-4 shrink-0 text-muted-foreground" aria-label={`Checked out in ${b.worktree}`} /></TooltipTrigger>
        <TooltipContent side="right">Checked out in {tilde(b.worktree)}</TooltipContent>
      </Tooltip>
    ),
    pick: () => void choose(b),
  }));
  return <PickList rows={rows} noun="branches" />;
}

/** Without the desktop there is no window to open: the command that serves the other worktree. */
function ServeDialog() {
  const root = useStore((s) => s.serveRoot);
  const done = useStore((s) => s.source?.doneCommand);
  // The way this server was started, from its done command (`node /…/trove.mjs done <file> --port N`).
  const bin = done?.split(' done ')[0] || 'trove';
  const quoted = root && (/[\s'"$`\\]/.test(root) ? `'${root.replaceAll("'", String.raw`'\''`)}'` : root);
  const command = `${bin} serve --root ${quoted} --port 0`;
  const copy = () => navigator.clipboard.writeText(command).then(() => toast('Copied'), () => toast('Copy failed'));
  return (
    <Dialog open={!!root} onOpenChange={(open) => { if (!open) set({ serveRoot: null }); }}>
      {/* Focus the dialog, not the copy button, whose tooltip would take the first Escape. */}
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <DialogHeader>
          <DialogTitle className="text-foreground">Open {root && tilde(root)}</DialogTitle>
          <DialogDescription>Run this in a terminal, then open the address it prints.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-1">
          <code className="min-w-0 flex-1 rounded-sm bg-background px-2 py-1.5 font-mono text-xs break-all text-foreground">{command}</code>
          <IconButton label="Copy command" onClick={copy}><Copy /></IconButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
