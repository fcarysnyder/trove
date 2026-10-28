// Small shared pieces: a count badge, an icon button with a tooltip, a folder + name label, a pane section.
import type { SourceInfo } from '@trove/core/types';
import { ChevronRight } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { load, save } from '@/lib/storage';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { dirOf, folderText, nameOf } from '@/lib/text';

export const Count = ({ n, className }: { n: number; className?: string }) => (
  <Badge variant="secondary" className={cn('h-4 min-w-4 rounded-full px-1 text-[11px] leading-4 tabular-nums', className)}>{n}</Badge>
);

/** A section of a pane that folds: its title (and count) on the left, the chevron on the right. Open or shut is remembered. */
export function PaneSection({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(() => load<boolean>(`open-${id}`, true) !== false);
  return (
    <Collapsible open={open} onOpenChange={(o) => { setOpen(o); save(`open-${id}`, o); }} className="pb-2">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 pt-4 pb-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={count ? `${title}, ${count}` : title}>
        <span className="flex items-center gap-1.5 font-semibold text-foreground">{title}{!!count && <Count n={count} />}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** A ghost icon button whose label is its tooltip and its accessible name. */
export function IconButton({ label, tip, children, className, side, ...props }: ComponentProps<typeof Button> & { label: string; tip?: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={cn('text-muted-foreground [&_svg]:size-4', className)} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{tip ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** Folder (truncated from its start) then the file name. */
export function PathLabel({ path, className, nameClass }: { path: string; className?: string; nameClass?: string }) {
  const dir = dirOf(path);
  return (
    <span className={cn('flex min-w-0 items-center', className)} title={path}>
      {dir && <span className="folder min-w-0 font-normal text-muted-foreground">{folderText(dir)}</span>}
      <span className={cn('shrink-0 truncate', nameClass)}>{nameOf(path)}</span>
    </span>
  );
}

/** What an empty queue means in this scope. */
export const nothingText = (source: SourceInfo | null) =>
  source?.scope === 'branch' ? `No changes since ${source.base ?? 'the base'}` : 'No uncommitted changes';

/** The desktop's title bar on the Mac: an empty strip the window drags by, with the traffic lights in it. */
export const TitleStrip = () =>
  window.trove && /Mac/.test(navigator.userAgent) ? <div aria-hidden className="h-8 shrink-0 border-b [-webkit-app-region:drag]" /> : null;
