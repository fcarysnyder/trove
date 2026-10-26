import { countStates } from '@trove/core/anchor';
import { ChevronLeft, ChevronRight, Copy, Plug, Settings, Unplug, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PROGRESS, stateInfo } from '@/lib/status';
import { dirOf, folderText, nameOf, plural } from '@/lib/text';
import { cn } from '@/lib/utils';
import { dismissQuestion, reveal, step, visible } from './actions';
import { Count, IconButton } from './bits';
import { Icon } from './StateIcon';
import { get, set, useNames, useStore } from './store';

const SEG: Record<string, string> = {
  accepted: 'bg-good', updated: 'bg-agent', drafts: 'bg-dirty', edited: 'bg-muted-foreground/60', working: 'bg-muted-foreground',
  skipped: 'bg-muted-foreground/30', pending: 'bg-border', rejected: 'bg-destructive',
};

export function TopBar() {
  useStore((s) => s.files);
  const source = useStore((s) => s.source);
  const offline = useStore((s) => s.offline);
  const hasSettings = useStore((s) => s.hasSettings);
  const current = useStore((s) => s.current?.path);
  useStore((s) => s.pendingOnly);
  const list = visible(get());
  const pos = list.findIndex((f) => f.path === current) + 1;
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-4 py-2 whitespace-nowrap">
      <strong className="truncate font-semibold text-foreground" title={source?.root}>{source?.name ?? 'Trove'}</strong>
      <div className="flex items-center gap-2">
        <Progress />
        <span className="text-xs text-muted-foreground tabular-nums">{pos || '–'} / {list.length}</span>
        <IconButton label="Previous file" tip="Previous file (←, k)" onClick={() => step(-1)}><ChevronLeft /></IconButton>
        <IconButton label="Next file" tip="Next file (→, j)" onClick={() => step(1)}><ChevronRight /></IconButton>
      </div>
      <div className="flex items-center justify-self-end gap-2">
        {offline && (
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-dirty">
            <Unplug className="size-4" aria-hidden />Disconnected
          </span>
        )}
        <Notice />
        {source && <Connect />}
        {hasSettings && <IconButton label="Settings" onClick={() => set({ settingsOpen: true })}><Settings /></IconButton>}
      </div>
    </header>
  );
}

/** One segment per state over every changed file, whatever the tree shows; the tooltip lists every state. */
function Progress() {
  const files = useStore((s) => s.files);
  const n = useNames();
  const [hot, setHot] = useState<string | null>(null);
  const c = countStates(files);
  const shown = PROGRESS.filter((s) => c[s]);
  const label = `${shown.map((s) => `${c[s]} ${stateInfo(s, n).words}`).join(', ')} of ${files.length}`;
  return (
    <span className="mr-2 flex items-center gap-2 text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span role="img" tabIndex={0} aria-label={label} className="flex h-2.5 w-[100px] overflow-hidden rounded-full outline-offset-3 focus-visible:outline-2 focus-visible:outline-ring">
            {PROGRESS.map((s, i) => (
              <span
                key={s}
                onMouseEnter={() => setHot(s)}
                onMouseLeave={() => setHot(null)}
                className={cn(SEG[s], 'transition-[flex-grow,min-width] duration-300 ease-(--ease-out) motion-reduce:transition-none', c[s] ? 'min-w-[3px]' : 'min-w-0', c[s] && i && shown[0] !== s ? 'ml-px' : '')}
                style={{ flex: `${c[s]} 0 0` }}
              />
            ))}
          </span>
        </TooltipTrigger>
        <TooltipContent arrow={false} side="bottom" align="end" sideOffset={10} aria-hidden className="block min-w-[200px] border bg-popover px-3 py-2 text-body shadow-lg">
          {PROGRESS.map((s) => {
            const info = stateInfo(s, n);
            return (
              <div key={s} className={cn('mt-1 flex items-center gap-2 first:mt-0', !c[s] && 'opacity-60', hot === s && '[&>span]:text-foreground')}>
                <Icon name={info.icon} tone={s === 'working' ? '' : s} className={cn('size-3.5', s === 'working' && 'animate-none')} />
                <span className="flex-1">{info.label}</span>
                <b className={cn('font-semibold', c[s] ? 'text-foreground' : 'font-normal text-muted-foreground')}>{c[s]}</b>
              </div>
            );
          })}
          <div className="mt-2 flex items-center border-t pt-2">
            <span className="flex-1">Total</span>
            <b className="font-semibold text-foreground">{files.length}</b>
          </div>
        </TooltipContent>
      </Tooltip>
      <span className="max-[700px]:hidden">{c.accepted} accepted</span>
    </span>
  );
}

/** What the agent left in its session: a question or a reply, and the files it changed. Only the X dismisses it. */
function Notice() {
  const q = useStore((s) => s.question);
  const files = useStore((s) => s.files);
  const n = useNames();
  const [open, setOpen] = useState(false);
  if (!q) return null;
  const changed = files.filter((f) => f.updated);
  const label = q.kind === 'reply' ? `${n.who} replied` : `${n.who} has a question`;
  return (
    <span className="inline-flex items-center rounded-full border bg-card">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" className="h-6 gap-1.5 rounded-l-full rounded-r-none pr-1.5 pl-2.5 text-foreground"
            aria-label={`${label}${changed.length ? `, ${plural(changed.length, 'file')} changed` : ''}`}>
            <span className="size-2 rounded-full bg-agent" aria-hidden />
            {label}
            {changed.length > 0 && <Count n={changed.length} className="bg-agent text-black" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" onOpenAutoFocus={(e) => e.preventDefault()} className="max-h-[60vh] w-80 gap-0 overflow-auto p-1" aria-label={`What ${n.agent} left for you`}>
          {q.text && <p className="p-2 text-[13px] text-body [overflow-wrap:anywhere]">{q.text}</p>}
          {changed.map((f) => (
            <button key={f.path} className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
              onClick={() => { setOpen(false); void reveal(f.path); }}>
              <span className="text-sm font-medium">{nameOf(f.path)}</span>
              {dirOf(f.path) && <span className="folder max-w-full text-xs text-muted-foreground">{folderText(dirOf(f.path))}</span>}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <IconButton label="Dismiss" className="h-6 rounded-l-none rounded-r-full pr-1.5 [&_svg]:size-3.5" onClick={() => void dismissQuestion()}><X /></IconButton>
    </span>
  );
}

/** How an agent connects to this source: the events log it streams and the command it runs after each file. */
function Connect() {
  const source = useStore((s) => s.source)!;
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
  const rows = [['Events log', source.eventsLog], ['Done command', source.doneCommand]] as const;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Connect an agent" className="text-muted-foreground [&_svg]:size-4"><Plug /></Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Connect an agent</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" onOpenAutoFocus={(e) => e.preventDefault()} className="w-[420px] gap-3">
        <div className="font-semibold text-foreground">Connect an agent</div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-start gap-1">
              <code className="min-w-0 flex-1 rounded-sm bg-background px-2 py-1 font-mono text-xs break-all text-foreground">{value}</code>
              <IconButton label={`Copy ${label.toLowerCase()}`} onClick={() => copy(value)}><Copy /></IconButton>
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
