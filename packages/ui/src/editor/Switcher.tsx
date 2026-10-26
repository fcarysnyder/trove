// GitHub Desktop's top-left menus: Current repository (on the desktop the recents and Open
// repository…), Current worktree (the repository's worktrees) and Current branch (switch here, or open
// the worktree a branch is checked out in). A server serves one root, so another worktree opens elsewhere.
import { recentName, type BranchInfo, type Recent } from '@trove/core/types';
import { BookMarked, Check, ChevronDown, Copy, FolderTree, GitBranch } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { loadGit, openWorktree, switchBranch } from './actions';
import { Count, IconButton } from './bits';
import { get, set, useNames, useStore } from './store';

// ponytail: home is guessed from the path (/Users/<name>, /home/<name>); the server could send it if that misses.
const tilde = (p: string) => p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Switcher() {
  const git = useStore((s) => s.git);
  const source = useStore((s) => s.source);
  if (!git) return <strong className="truncate font-semibold text-foreground" title={source?.root}>{source?.name ?? 'Trove'}</strong>;
  return (
    <div className="flex min-w-0 items-center -ml-2">
      <RepoMenu />
      <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
      <WorktreeMenu />
      <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
      <BranchMenu />
      <ServeDialog />
    </div>
  );
}

function Segment({ icon, label, value, extra, title }: { icon: ReactNode; label: string; value: string; extra?: ReactNode; title?: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" title={title} aria-label={`${label}: ${value}`} className="-my-1 h-auto min-w-0 shrink justify-start gap-2 px-2 py-0 text-left [&>svg]:text-muted-foreground">
        {icon}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] leading-3 font-normal text-muted-foreground">{label}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-4 font-semibold text-foreground">
            <span className="max-w-[200px] truncate">{value}</span>
            {extra}
          </span>
        </span>
        <ChevronDown className="size-3.5" />
      </Button>
    </DropdownMenuTrigger>
  );
}

// The serve dialog opens as the menu closes: focus going back to the trigger would close it again.
const keepDialog = (e: Event) => { if (get().serveRoot) e.preventDefault(); };

function RepoMenu() {
  const git = useStore((s) => s.git)!;
  const [recents, setRecents] = useState<Recent[]>([]);
  const bridge = window.trove;
  const ours = new Set([git.root, ...git.worktrees.map((w) => w.path)]); // the worktree menu's
  const onOpen = (open: boolean) => {
    if (!open) return;
    void loadGit();
    if (bridge) void bridge.recents().then(setRecents, () => setRecents([]));
  };
  const openRepo = async () => {
    try {
      const picked = await bridge!.pickFolder();
      if (!picked) return;
      if (!picked.git) return void toast('Not a git repository');
      await bridge!.open({ path: picked.path });
    } catch (e) {
      toast(errText(e));
    }
  };
  const recent = recents.filter((r) => !ours.has(r.path));
  return (
    <DropdownMenu onOpenChange={onOpen}>
      <Segment icon={<BookMarked />} label="Current repository" value={git.repo.name} title={git.repo.root} />
      <DropdownMenuContent align="start" className="w-80" onCloseAutoFocus={keepDialog}>
        <DropdownMenuItem className="items-start">
          <Check className="mt-0.5" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-foreground">{git.repo.name}</span>
            <span className="truncate text-xs text-muted-foreground" title={git.repo.root}>{tilde(git.repo.root)}</span>
          </span>
        </DropdownMenuItem>
        {bridge && recent.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Recent</DropdownMenuLabel>
            {recent.map((r) => (
              <DropdownMenuItem key={r.path} onSelect={() => void bridge.open({ path: r.path, scope: r.scope, base: r.base }).catch((e) => toast(errText(e)))} className="items-start">
                <Check className="invisible mt-0.5" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-foreground">{recentName(r)}</span>
                  <span className="truncate text-xs text-muted-foreground" title={r.path}>{tilde(r.path)}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {bridge && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void openRepo()}><Check className="invisible" />Open repository…</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MAIN = 'main checkout';

function WorktreeMenu() {
  const git = useStore((s) => s.git)!;
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void loadGit(); }}>
      <Segment icon={<FolderTree />} label="Current worktree" value={git.worktree.main ? MAIN : git.worktree.name} title={git.root} />
      <DropdownMenuContent align="start" className="w-80" onCloseAutoFocus={keepDialog}>
        {git.worktrees.map((w) => (
          <DropdownMenuItem key={w.path} onSelect={() => { if (!w.current) void openWorktree(w.path); }} className="items-start">
            <Check className={cn('mt-0.5', !w.current && 'invisible')} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-foreground" title={w.path}>{w.main ? MAIN : w.name}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{w.branch ?? w.head}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BranchMenu() {
  const git = useStore((s) => s.git)!;
  const locked = useStore((s) => s.files.some((f) => f.state === 'working'));
  const n = useNames();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = git.branches.filter((b) => b.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const choose = (b: BranchInfo) => {
    if (b.current) return;
    if (b.worktree) void openWorktree(b.worktree);
    else void switchBranch(b.name);
  };
  const busy = `${n.Agent} is working on a file`;
  return (
    <DropdownMenu open={open} onOpenChange={(on) => {
      setOpen(on);
      if (!on) return;
      setFilter('');
      void loadGit();
      requestAnimationFrame(() => input.current?.focus()); // after the menu takes focus
    }}>
      <Segment
        icon={<GitBranch />}
        label="Current branch"
        value={git.branch ?? git.head}
        extra={git.dirty > 0 && <Count n={git.dirty} />}
      />
      <DropdownMenuContent align="start" className="w-80 pt-0" onCloseAutoFocus={keepDialog}>
        <div className="sticky top-0 z-10 -mx-1 bg-popover px-1 pt-1 pb-1">
          <Input
            ref={input}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter branches"
            className="h-8"
            // The menu's typeahead would take every key; the filter keeps them. Down moves into the list, Enter takes the first match.
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Tab') return;
              e.stopPropagation();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.currentTarget.closest('[role=menu]')?.querySelector<HTMLElement>('[role=menuitem]:not([data-disabled])')?.focus();
              }
              if (e.key === 'Enter' && shown[0] && !(locked && !shown[0].worktree)) {
                e.preventDefault();
                setOpen(false);
                choose(shown[0]);
              }
            }}
          />
        </div>
        {shown.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No branches match</div>}
        {shown.map((b) => {
          const off = locked && !b.current && !b.worktree;
          const item = (
            <DropdownMenuItem key={b.name} disabled={off} onSelect={() => choose(b)}
              // Hovering does not steal focus from the filter, so typing keeps filtering.
              onPointerMove={(e) => e.preventDefault()} onPointerLeave={(e) => e.preventDefault()} className="hover:bg-accent">
              <Check className={cn(!b.current && 'invisible')} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{b.name}</span>
              {b.worktree && (
                <Tooltip>
                  <TooltipTrigger asChild><FolderTree className="text-muted-foreground" aria-label={`Checked out in ${b.worktree}`} /></TooltipTrigger>
                  <TooltipContent side="right">Checked out in {tilde(b.worktree)}</TooltipContent>
                </Tooltip>
              )}
            </DropdownMenuItem>
          );
          // A disabled item takes no pointer events, so its tooltip sits on a wrapper.
          return off ? (
            <Tooltip key={b.name}>
              <TooltipTrigger asChild><div>{item}</div></TooltipTrigger>
              <TooltipContent side="right">{busy}</TooltipContent>
            </Tooltip>
          ) : item;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
