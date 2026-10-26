import type { FileRow } from '@trove/core/types';
import { ChevronRight, PanelLeftClose } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { dirOf, nameOf } from '@/lib/text';
import { cn } from '@/lib/utils';
import { open, togglePanel, visible } from './actions';
import { Count, IconButton } from './bits';
import { StateIcons } from './StateIcon';
import { get, set, useNames, useStore } from './store';

export function FilesColumn() {
  const files = useStore((s) => s.files);
  const pendingOnly = useStore((s) => s.pendingOnly);
  const committedOpen = useStore((s) => s.committedOpen);
  const rejectedOpen = useStore((s) => s.rejectedOpen);
  return (
    <section aria-label="Files" className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <span className="flex-1 font-semibold text-foreground">Files</span>
        <IconButton label="Hide files" tip="Hide files ([)" onClick={() => togglePanel('files', true)}><PanelLeftClose /></IconButton>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Files" className="p-2">
          <Folders list={visible(get())} />
          <Section label="Committed" list={files.filter((f) => f.committed)} open={committedOpen} onOpenChange={(o) => set({ committedOpen: o })} />
          <Section label="Rejected" list={files.filter((f) => f.state === 'rejected')} open={rejectedOpen} onOpenChange={(o) => set({ rejectedOpen: o })} />
        </nav>
      </ScrollArea>
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-t px-4">
        <Switch id="pending-only" size="sm" checked={pendingOnly} onCheckedChange={(v) => set({ pendingOnly: v })} />
        <Label htmlFor="pending-only" className="text-xs font-normal text-muted-foreground">Pending only</Label>
      </div>
    </section>
  );
}

/** A closed-by-default section at the end of the tree, shown only when it has files. */
function Section({ label, list, open, onOpenChange }: { label: string; list: FileRow[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!list.length) return null;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="mt-3">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-sm px-1 py-1.5 text-[13px] text-body outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className="size-3.5 transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
        <span>{label}</span>
        <Count n={list.length} />
      </CollapsibleTrigger>
      <CollapsibleContent><Folders list={list} /></CollapsibleContent>
    </Collapsible>
  );
}

/** Files grouped under their folder, each folder a disclosure the user can close. */
function Folders({ list }: { list: FileRow[] }) {
  const closed = useStore((s) => s.closedDirs);
  const current = useStore((s) => s.current?.path);
  const n = useNames();
  const groups = Map.groupBy(list, (f) => dirOf(f.path));
  return [...groups].map(([dir, rows]) => (
    <Collapsible key={dir} open={!closed.includes(dir)}
      onOpenChange={(o) => set((s) => ({ closedDirs: o ? s.closedDirs.filter((d) => d !== dir) : [...s.closedDirs, dir] }))}>
      <CollapsibleTrigger title={dir || '/'} className="flex w-full items-center rounded-sm px-1 py-1.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <span className="folder max-w-full">{`\u200E${dir || '/'}\u200E`}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {rows.map((f) => (
          <button key={f.path} data-tree-row aria-current={f.path === current || undefined} onClick={() => void open(f.path)}
            className={cn('flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left outline-none hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              f.path === current ? 'bg-accent text-foreground hover:bg-accent' : 'text-body')}>
            <StateIcons file={f} names={n} />
            <span className={cn('flex-1 truncate', ['accepted', 'skipped', 'rejected'].includes(f.state) && f.path !== current && 'text-muted-foreground')}>{nameOf(f.path)}</span>
            {f.drafts > 0 && <Count n={f.drafts} />}
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  ));
}
