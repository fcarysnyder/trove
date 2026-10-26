import type { FileRow } from '@trove/core/types';
import { ChevronRight, ListFilter, PanelLeftClose, Search, X } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { countKeys, FILTERS, isPendingOnly, markRange, matches, PENDING_OFF, toggleOff, type FilterKey } from '@/lib/filter';
import { stateInfo } from '@/lib/status';
import { dirOf, nameOf } from '@/lib/text';
import { cn } from '@/lib/utils';
import { acceptAll, open, reveal, setFilters, shown, togglePanel, visible } from './actions';
import { Count, IconButton, nothingText } from './bits';
import { StateIcons } from './StateIcon';
import { get, set, useNames, useStore } from './store';

/** The tree row to land on after the search: the open file's, else the first. */
const focusTree = () => {
  const row = document.querySelector<HTMLElement>('[data-tree-row][aria-current]') ?? document.querySelector<HTMLElement>('[data-tree-row]');
  if (row) row.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
};

export function FilesColumn() {
  const files = useStore((s) => s.files);
  const off = useStore((s) => s.filterOff);
  const query = useStore((s) => s.query);
  const loaded = useStore((s) => s.loaded);
  const source = useStore((s) => s.source);
  const committedOpen = useStore((s) => s.committedOpen);
  const rejectedOpen = useStore((s) => s.rejectedOpen);
  const s = get();
  const folders = visible(s);
  const committed = files.filter((f) => f.committed && shown(s)(f));
  const rejected = files.filter((f) => !f.committed && f.state === 'rejected' && shown(s)(f));
  const none = files.length > 0 && !folders.length && !committed.length && !rejected.length;
  const pending = folders.filter((f) => f.state === 'queue').length;
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      set({ query: '' });
      requestAnimationFrame(focusTree);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const first = folders[0] ?? committed[0] ?? rejected[0];
      if (first) void reveal(first.path).then(() => requestAnimationFrame(focusTree));
    }
  };
  return (
    <section aria-label="Files" className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-1 border-b pr-2 pl-4">
        <span className="flex-1 font-semibold text-foreground">Files</span>
        {pending > 0 && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void acceptAll()}>Accept all</Button>}
        <Filters off={off} />
        <IconButton side="bottom" label="Hide files" tip="Hide files ([)" onClick={() => togglePanel('files', true)}><PanelLeftClose /></IconButton>
      </div>
      <div className="relative shrink-0 px-2 pt-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 mt-1 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id="file-search" value={query} placeholder="Search files" aria-label="Search files" autoComplete="off" spellCheck={false}
          onChange={(e) => set({ query: e.target.value })} onKeyDown={onSearchKey} className="h-8 pr-8 pl-8" />
        {query && (
          <IconButton label="Clear search" className="absolute top-1/2 right-3 mt-1 -translate-y-1/2" onClick={() => { set({ query: '' }); document.getElementById('file-search')?.focus(); }}>
            <X />
          </IconButton>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Files" className="p-2">
          {loaded && !files.length && <p className="px-1 py-1.5 text-[13px] text-muted-foreground">{nothingText(source)}</p>}
          {none ? (
            <p className="flex items-center gap-1 px-1 py-1.5 text-[13px] text-muted-foreground">
              No files match
              <Button variant="link" size="sm" className="h-auto px-1 text-[13px] text-foreground" onClick={() => { set({ query: '' }); setFilters([]); }}>Clear</Button>
            </p>
          ) : (
            <>
              <Folders list={folders} query={query} />
              <Section label="Committed" list={committed} query={query} open={committedOpen || !!query} onOpenChange={(o) => set({ committedOpen: o })} />
              <Section label="Rejected" list={rejected} query={query} open={rejectedOpen || !!query} onOpenChange={(o) => set({ rejectedOpen: o })} />
            </>
          )}
        </nav>
      </ScrollArea>
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-t px-4">
        <Switch id="pending-only" size="default" checked={isPendingOnly(off)} onCheckedChange={(v) => setFilters(v ? PENDING_OFF : [])} />
        <Label htmlFor="pending-only" className="text-xs font-normal text-muted-foreground">Pending only</Label>
      </div>
    </section>
  );
}

/** One checkbox per review state and Committed; an unchecked one leaves the tree. Counts follow the search. */
function Filters({ off }: { off: FilterKey[] }) {
  const n = useNames();
  const files = useStore((s) => s.files);
  const query = useStore((s) => s.query);
  const counts = countKeys(files.filter((f) => matches(f.path, query)));
  const label = (k: FilterKey) => (k === 'committed' ? 'Committed' : stateInfo(k, n).label);
  const row = (k: FilterKey) => (
    <Label key={k} className="rounded-sm px-2 py-1.5 font-normal text-body hover:bg-accent hover:text-foreground">
      <Checkbox aria-label={label(k)} checked={!off.includes(k)} onCheckedChange={(v) => setFilters(toggleOff(off, k, v === true))} />
      <span className="flex-1">{label(k)}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{counts[k]}</span>
    </Label>
  );
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size={off.length ? 'sm' : 'icon-sm'} aria-label="Filters" className="text-muted-foreground [&_svg]:size-4">
              <ListFilter />{off.length > 0 && <Count n={off.length} />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Filters</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-60 gap-0 p-1">
        {FILTERS.filter((k) => k !== 'committed').map(row)}
        <Separator className="my-1" />
        {row('committed')}
        <Button variant="ghost" size="default" disabled={!off.length} className="mt-1 justify-start px-2 font-normal" onClick={() => setFilters([])}>Clear filters</Button>
      </PopoverContent>
    </Popover>
  );
}

/** A closed-by-default section at the end of the tree, shown only when it has files. */
function Section({ label, list, query, open, onOpenChange }: { label: string; list: FileRow[]; query: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!list.length) return null;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="mt-3">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-sm px-1 py-1.5 text-[13px] text-body outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className="size-3.5 transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
        <span>{label}</span>
        <Count n={list.length} />
      </CollapsibleTrigger>
      <CollapsibleContent><Folders list={list} query={query} /></CollapsibleContent>
    </Collapsible>
  );
}

/** The file name with the search's hit marked. */
function Name({ path, query }: { path: string; query: string }) {
  const name = nameOf(path);
  const r = markRange(path, query);
  if (!r) return name;
  return <>{name.slice(0, r[0])}<mark className="rounded-[2px] bg-foreground/15 text-foreground">{name.slice(r[0], r[1])}</mark>{name.slice(r[1])}</>;
}

/** Files grouped under their folder, each folder a disclosure the user can close; all open while searching. */
function Folders({ list, query }: { list: FileRow[]; query: string }) {
  const closed = useStore((s) => s.closedDirs);
  const current = useStore((s) => s.current?.path);
  const n = useNames();
  const groups = Map.groupBy(list, (f) => dirOf(f.path));
  return [...groups].map(([dir, rows]) => (
    <Collapsible key={dir} open={!!query || !closed.includes(dir)}
      onOpenChange={(o) => set((s) => ({ closedDirs: o ? s.closedDirs.filter((d) => d !== dir) : [...s.closedDirs, dir] }))}>
      <CollapsibleTrigger title={dir || '/'} className="flex w-full items-center rounded-sm px-1 py-1.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <span className="folder max-w-full">{`‎${dir || '/'}‎`}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {rows.map((f) => (
          <button key={f.path} data-tree-row aria-current={f.path === current || undefined} onClick={() => void open(f.path)}
            className={cn('flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left outline-none hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              f.path === current ? 'bg-accent text-foreground hover:bg-accent' : 'text-body')}>
            <StateIcons file={f} names={n} />
            <span className={cn('flex-1 truncate', ['accepted', 'skipped', 'rejected'].includes(f.state) && f.path !== current && 'text-muted-foreground')}><Name path={f.path} query={query} /></span>
            {f.drafts > 0 && <Count n={f.drafts} />}
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  ));
}
