// The Agent pane's Activity: read-only, one row per agent turn (see turns.ts). You talk to the agent in its terminal;
// this shows what each turn did. A row opens to the comments it was sent, its steps and its full result.
import { AGENT_MODES, type Activity, type AgentMode, type Batch } from '@trove/core/types';
import { marked } from '@trove/core/marked';
import { AtSign, Bot, Check, ChevronRight, FilePen, FileText, Globe, MessageCircleQuestion, MessageSquarePlus, Pencil, Plug, Search, SquareTerminal, Unplug, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { load, save } from '@/lib/storage';
import { ago, nameOf } from '@/lib/text';
import { cn } from '@/lib/utils';
import { reveal } from './actions';
import { useElapsed } from './bits';
import { set, useNames, useStore } from './store';
import { firstLine, turnsOf, type Divider, type Source, type Step, type Turn } from './turns';

/** New turn endings since Activity was last open (this browser), for the tab's badge. */
export function useUnread(open: boolean) {
  const entries = useStore((s) => s.activity);
  const newest = entries.at(-1)?.at ?? '';
  const [seen, setSeen] = useState(() => load<string | null>('history-seen', null));
  useEffect(() => {
    if ((open || seen === null) && newest && newest !== seen) { setSeen(newest); save('history-seen', newest); }
  }, [open, newest, seen]);
  return open || !seen ? 0 : entries.filter((e) => e.kind === 'end' && e.at > seen).length;
}

const MODES: Record<AgentMode, string> = { bypass: 'Bypass', auto: 'Auto', ask: 'Ask' };

/** The permission mode agents start with (desktop): the mode, and a menu that sets it for the next start. */
export function useMode() {
  const bridge = window.trove;
  const [mode, setMode] = useState<AgentMode | null>(null);
  useEffect(() => { void bridge?.mode().then(setMode, () => {}); }, []);
  const change = (m: AgentMode) => void bridge!.setMode(m).then(() => { setMode(m); toast(`${MODES[m]} from the next start`); }, (e: Error) => toast(e.message));
  return [mode, change] as const;
}
export const modeLabel = (m: AgentMode) => MODES[m];
export function ModeMenu({ mode, change, children }: { mode: AgentMode; change: (m: AgentMode) => void; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => change(v as AgentMode)}>
          {AGENT_MODES.map((m) => <DropdownMenuRadioItem key={m} value={m}>{MODES[m]}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Markdown as the document view renders it (the page's CSP keeps scripts out); links open outside the page. */
function Markdown({ text }: { text: string }) {
  const html = useMemo(() => (marked.parse(text, undefined) as string).replaceAll('<a ', '<a target="_blank" rel="noreferrer" '), [text]);
  return <div className="block-body msg" dangerouslySetInnerHTML={{ __html: html }} />;
}

const ICONS: Record<string, LucideIcon> = { Read: FileText, Edit: FilePen, MultiEdit: FilePen, Write: FilePen, NotebookEdit: FilePen, Grep: Search, Glob: Search, Bash: SquareTerminal, WebFetch: Globe, WebSearch: Globe, Released: Check };
const VERBS: Record<string, string> = { Grep: 'Search', Glob: 'Find', Bash: 'Run', MultiEdit: 'Edit', NotebookEdit: 'Edit', WebFetch: 'Fetch', WebSearch: 'Search' };
const SOURCES: Record<Source, [LucideIcon, string]> = { chat: [SquareTerminal, 'Terminal'], quote: [AtSign, 'Add to agent'], comment: [MessageSquarePlus, 'Comment'], explain: [MessageCircleQuestion, 'Explain'], edit: [Pencil, 'Your edit'], agent: [Bot, 'Agent'] };
const span = (from: string, to: string) => {
  const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
};

function StepRow({ s }: { s: Step }) {
  const files = useStore((x) => x.files);
  const Icon = ICONS[s.tool] ?? Wrench;
  const file = files.find((f) => f.path === s.text || f.path.endsWith(`/${s.text}`));
  const label = s.text.includes('/') && (file || ICONS[s.tool] === FilePen || s.tool === 'Read') ? nameOf(s.text) : s.text;
  const body = <><span className="shrink-0 font-medium text-foreground">{VERBS[s.tool] ?? s.tool}</span><span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{label}</span></>;
  return (
    <li className="flex min-h-6 items-center gap-2 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {file ? <button title={file.path} onClick={() => void reveal(file.path)} className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{body}</button>
        : <span title={s.text} className="flex min-w-0 items-center gap-1.5">{body}</span>}
      {!!s.added && <span className="shrink-0 text-good tabular-nums">+{s.added}</span>}
      {!!s.removed && <span className="shrink-0 text-destructive tabular-nums">-{s.removed}</span>}
    </li>
  );
}

/** What a send asked for: each quote and note. */
function Sent({ e }: { e: Activity }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  useEffect(() => { void api<Batch>(`batch?id=${encodeURIComponent(e.id)}`).then(setBatch, () => {}); }, [e.id]);
  if (!batch) return null;
  return (
    <ol className="mb-2 flex flex-col gap-2 text-xs">
      {batch.items.map((c, k) => (
        <li key={k}>
          <div className="line-clamp-2 border-l-2 pl-2 text-muted-foreground">{c.anchor.quote}</div>
          <div className="mt-0.5 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{c.note}</div>
        </li>
      ))}
    </ol>
  );
}

/** One event on the timeline: its icon on the line, then its content. */
function Event({ id, node, children }: { id: string; node: ReactNode; children: ReactNode }) {
  return (
    <li data-turn={id} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5 pb-4 last:pb-0">
      <span aria-hidden className="absolute top-[27px] bottom-[3px] left-[11.5px] w-px bg-border [li:last-child>&]:hidden" />
      {node}
      <div className="min-w-0">{children}</div>
    </li>
  );
}
const NODE = 'flex size-6 items-center justify-center rounded-full [&_svg]:size-3';
const TONES = { done: 'bg-muted text-muted-foreground', running: 'bg-primary/15 text-primary', queued: 'border border-dashed text-muted-foreground', interrupted: 'bg-destructive/12 text-destructive' };
const BADGES = { running: 'border-primary/25 bg-primary/10 text-primary', queued: 'bg-muted/50 text-muted-foreground', interrupted: 'border-destructive/25 bg-destructive/10 text-destructive' };

function DividerRow({ d }: { d: Divider }) {
  const Icon = d.text.endsWith(' detached') ? Unplug : d.text.endsWith(' attached') ? Plug : Bot;
  return (
    <Event id={d.id} node={<span className={cn(NODE, 'border text-muted-foreground')}><Icon aria-hidden /></span>}>
      <div className="flex min-h-6 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{d.text}</span><span className="shrink-0">{ago(d.at)}</span>
      </div>
    </Event>
  );
}

function TurnRow({ t, live, open, toggle }: { t: Turn; live: boolean; open: boolean; toggle: () => void }) {
  const n = useNames();
  const running = t.state === 'running' && live;
  const elapsed = useElapsed(running ? t.at : null);
  const title = t.source === 'chat' ? firstLine(t.title) || t.title : t.title;
  const tone = running ? 'running' : t.state === 'running' ? 'interrupted' : t.state === 'queued' ? 'queued' : 'done';
  const status = tone === 'running' ? 'Working' : tone === 'interrupted' ? 'Interrupted' : tone === 'queued' ? (live ? 'Queued' : `Waiting for ${n.agent}`) : null;
  const said = t.result ? firstLine(t.result) : '';
  const more = !!t.batch || t.steps.length > 0 || (!!t.result && said !== t.result.trim());
  const took = running ? elapsed : t.endedAt && t.endedAt !== t.at && t.source !== 'edit' ? span(t.at, t.endedAt) : '';
  const meta = [ago(t.at), took === '0s' ? '' : took, t.steps.length ? `${t.steps.length} ${t.steps.length === 1 ? 'step' : 'steps'}` : ''].filter(Boolean).join(' · ');
  const [Source, label] = SOURCES[t.source];
  return (
    <Event id={t.id} node={<span title={label} className={cn(NODE, TONES[tone])}>{running ? <Spinner /> : <Source aria-label={label} />}</span>}>
      <button aria-expanded={more ? open : undefined} onClick={t.file ? () => void reveal(t.file!) : more ? toggle : undefined}
        className={cn('group -mx-1.5 -mt-0.5 block w-[calc(100%+12px)] rounded-md px-1.5 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', more || t.file ? 'hover:bg-muted/50' : 'cursor-default')}>
        <span className="flex min-h-5 min-w-0 items-center gap-1.5">
          <span title={t.title} className="truncate text-[13px] font-medium text-foreground">{title}</span>
          {status && <span className={cn('shrink-0 rounded-sm border px-1 text-[11px] leading-4', BADGES[tone as keyof typeof BADGES])}>{status}</span>}
          {more && <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none" aria-hidden />}
        </span>
        {said && said !== title && <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{said}</span>}
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/75 tabular-nums">{meta}</span>
      </button>
      {open && more && (
        <div className="mt-2">
          {t.batch && <Sent e={t.batch} />}
          {t.steps.length > 0 && <ul>{t.steps.map((s) => <StepRow key={s.id} s={s} />)}</ul>}
          {t.result && said !== t.result.trim() && <div className="mt-2 text-body"><Markdown text={t.result} /></div>}
        </div>
      )}
    </Event>
  );
}

/** Keeps the end of the feed in view while the reader is there. */
function useFollow(key: unknown) {
  const end = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const viewport = () => end.current?.closest<HTMLElement>('[data-slot=scroll-area-viewport]');
  useEffect(() => {
    const vp = viewport();
    if (!vp) return;
    const on = () => { stuck.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 40; };
    vp.addEventListener('scroll', on, { passive: true });
    return () => vp.removeEventListener('scroll', on);
  }, []);
  useLayoutEffect(() => { const vp = viewport(); if (vp && stuck.current) vp.scrollTop = vp.scrollHeight; }, [key]);
  return end;
}

/** Every turn, oldest first. */
export function ActivityFeed() {
  const entries = useStore((s) => s.activity);
  const live = useStore((s) => !!s.source?.agentInfo?.connected);
  const landing = useStore((s) => s.landing);
  const items = useMemo(() => turnsOf(entries), [entries]);
  const shown = items;
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const list = useRef<HTMLOListElement>(null);
  const end = useFollow(`${entries.at(-1)?.id}:${shown.length}`);
  // The Stack handoff from Changes: the newest turn lands where the stack went.
  const newest = [...shown].reverse().find((x) => x.type === 'turn')?.id;
  useLayoutEffect(() => {
    if (landing == null || !newest || landing === newest) return;
    set({ landing: null });
    list.current?.querySelector(`[data-turn="${CSS.escape(newest)}"]`)?.animate(
      [{ opacity: 0, transform: 'translateY(-8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,1.25,.4,1)' });
  }, [landing, newest]);
  return (
    <ScrollArea className="h-full">
      {!shown.length ? <p className="px-4 py-3 text-muted-foreground">No activity yet</p> : (
        <ol ref={list} className="p-3">
          {shown.map((x) => (x.type === 'divider'
            ? <DividerRow key={x.id} d={x} />
            : <TurnRow key={x.id} t={x} live={live} open={flipped[x.id] ?? (x.state !== 'done' && !(x.state === 'queued' && !live))}
                toggle={() => setFlipped((f) => ({ ...f, [x.id]: !(f[x.id] ?? x.state !== 'done') }))} />))}
        </ol>
      )}
      <div ref={end} />
    </ScrollArea>
  );
}
