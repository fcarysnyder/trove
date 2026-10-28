// Small shared pieces: a count badge, an icon button with a tooltip, a folder + name label.
import type { SourceInfo } from '@trove/core/types';
import { type ComponentProps, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { dirOf, folderText, nameOf } from '@/lib/text';

export const Count = ({ n, className }: { n: number; className?: string }) => (
  <Badge variant="secondary" className={cn('h-4 min-w-4 rounded-full px-1 text-[11px] leading-4 tabular-nums', className)}>{n}</Badge>
);

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
