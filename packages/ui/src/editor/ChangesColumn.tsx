import type { AgentTool, Anchor, BlockEdit, CommentKind, Draft, FileRow } from '@trove/core/types';
import { ChevronDown, CircleAlert, MessageCircleQuestion, MessageSquare, Minus, PanelRightClose, Pencil, Square, SquareTerminal, Trash, Undo2 } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { createPortal } from 'react-dom';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { load, save } from '@/lib/storage';
import { nameOf, plural, reducedMotion, sendKey } from '@/lib/text';
import { cn } from '@/lib/utils';
import { loadActivity, loadAll, open, revertEdit, saveDrafts, send, sendable, setScope, togglePanel } from './actions';
import { Count, IconButton, PathLabel, TAB, useElapsed } from './bits';
import { get, set, useNames, useStore } from './store';
import { showBlock, showPassage } from './doc/commands';
import { ActivityFeed, modeLabel, ModeMenu, useMode, useUnread } from './Activity';
import { turnsOf } from './turns';
import { Notice } from './TopBar';
import { PathMenu } from './PathMenu';

// Desktop only, and its own chunk: the plugin's page never loads xterm.
const Terminal = lazy(() => import('./Terminal'));

type Session = { tool: AgentTool; running: boolean };
/** This window's agent terminal: the tool it runs and whether it still does. null before one starts, and in a browser. */
function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const pty = window.trove?.pty;
    if (!pty) return;
    const read = () => void pty.state().then((s) => setSession(s && { tool: s.tool, running: s.exitCode === null }));
    read();
    let live = false; // a session's first output: it started
    const offData = pty.onData(() => { if (!live) { live = true; read(); } });
    const offExit = pty.onExit(() => { live = false; setSession((s) => s && { ...s, running: false }); });
    return () => { offData(); offExit(); };
  }, []);
  return session;
}

/** What the agent waits on the user for that needs them now: a permission prompt or a question (POST /api/signal). */
export const useNeedsYou = () => useStore((s) => {
  const w = s.source?.agentInfo?.waiting;
  return w === 'permission' || w === 'question' ? w : null;
});

export function ChangesColumn() {
  const current = useStore((s) => s.current);
  const files = useStore((s) => s.files).filter((f) => f.state !== 'rejected'); // a rejected file's comments are backed up, not shown
  const scope = useStore((s) => s.scope);
  const allDrafts = useStore((s) => s.allDrafts);
  const allEdits = useStore((s) => s.allEdits);
  const hits = useStore((s) => s.hits);
  useStore((s) => s.noteEdit);
  const n = useNames();
  const [total] = sendable();
  const own = current ? current.drafts.length + current.edits.length : 0;
  const editsElsewhere = Object.entries(allEdits).reduce((k, [p, l]) => k + (p === current?.path ? 0 : l.length), 0);
  // Header badge: what the view lists (comments plus edits).
  const shown = scope === 'all' ? total + (current?.edits.length ?? 0) + editsElsewhere : own;

  // A file's rows: its comments and its saved edits, in document order where known.
  const rowsOf = (f: Pick<FileRow, 'path'>, locked = false) => {
    const isOpen = f.path === current?.path;
    const list = isOpen ? current!.drafts : allDrafts[f.path] ?? [];
    const edits = isOpen ? current!.edits : allEdits[f.path] ?? [];
    return [
      ...list.map((c, k) => [isOpen && hits[k] ? hits[k]!.i : Infinity, <CommentRow key={`${f.path}:c${k}`} path={f.path} list={list} c={c} n={k} found={isOpen ? !!hits[k] : true} locked={locked} />] as const),
      ...edits.map((x) => [x.index ?? -1, <EditRow key={`${f.path}:${x.id}`} path={f.path} x={x} locked={locked} />] as const),
    ].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  };

  const [tab, setTab] = useState(() => load('agent-tab', 'history'));
  const session = useSession();
  const column = useRef<HTMLElement>(null);
  // Send all's handoff: the staged rows stack into one, then the new turn lands in Activity.
  const handoff = async () => {
    const before = turnsOf(get().activity).filter((x) => x.type === 'turn').at(-1)?.id ?? '';
    const had = sendable()[0];
    const rows = tab === 'changes' && !matchMedia('(prefers-reduced-motion: reduce)').matches ? [...(column.current?.querySelectorAll<HTMLElement>('[data-stack]') ?? [])] : [];
    const top = rows[0]?.getBoundingClientRect().top ?? 0;
    // Each row becomes a solid card for the move, the first on top, so the stack reads as paper, not overlapping text.
    const card = { background: 'var(--card)', borderRadius: '8px', boxShadow: '0 0 0 1px var(--border)' };
    rows.forEach((el, i) => { el.style.position = 'relative'; el.style.zIndex = String(rows.length - i); });
    const stack = rows.map((el, i) => el.animate(
      [{ ...card, transform: 'none', opacity: 1 }, { ...card, transform: `translateY(${top - el.getBoundingClientRect().top + Math.min(i, 3) * 3}px) scale(${1 - Math.min(i, 3) * 0.025})`, opacity: i > 2 ? 0 : 1 }],
      { duration: 190, delay: Math.max(0, rows.length - 1 - i) * 18, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
    await Promise.all(stack.map((a) => a.finished.catch(() => {})));
    set({ landing: before });
    await send({});
    await loadActivity();
    stack.forEach((a) => a.cancel());
    rows.forEach((el) => { el.style.position = ''; el.style.zIndex = ''; });
    if (sendable()[0] < had) { setTab('history'); save('agent-tab', 'history'); } else set({ landing: null });
  };
  const unread = useUnread(tab === 'history');
  let body: ReactNode;
  if (!current) body = <p className="px-4 py-3 text-muted-foreground">No file open</p>;
  else if (scope === 'file') {
    body = own ? rowsOf(current) : <p className="px-4 py-3 text-muted-foreground">No comments or edits on this file</p>;
  } else {
    // Every file's comments and edits in tree order; files the agent is working on last, read-only.
    const count = (f: FileRow) => (f.path === current.path ? own : (allDrafts[f.path]?.length ?? 0) + (allEdits[f.path]?.length ?? 0));
    const group = (f: FileRow, locked = false) => [
      <FileHead key={`h${f.path}`} f={f} count={count(f)} />,
      <div key={`g${f.path}`} className="mr-4 mb-2 ml-5 border-l [&>div]:pr-0 [&>div]:pl-3">{rowsOf(f, locked)}</div>,
    ];
    const withAny = files.filter((f) => count(f));
    const live = withAny.filter((f) => f.state !== 'working');
    const locked = withAny.filter((f) => f.state === 'working');
    body = [
      ...(live.length ? live.flatMap((f) => group(f)) : [<p key="empty" className="px-4 py-3 text-muted-foreground">No comments or edits</p>]),
      ...(locked.length ? [<div key="locked" className="px-4 pt-4 text-xs text-muted-foreground">{n.Agent} is working</div>, ...locked.flatMap((f) => group(f, true))] : []),
    ];
  }

  return (
    <section ref={column} aria-label="Agent" className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <span className="font-semibold text-foreground">Agent</span>
        <Notice />
        {tab === 'changes' && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto gap-1 text-muted-foreground" aria-label={`Showing ${scope === 'file' ? 'this file' : 'all files'}`}>
              {scope === 'file' ? 'This file' : 'All files'}<ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as 'file' | 'all')}>
              <DropdownMenuRadioItem value="file">This file</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="all">All files</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        <IconButton side="bottom" label="Hide agent" tip="Hide agent (])" className={cn(tab !== 'changes' && 'ml-auto')} onClick={() => togglePanel('changes', true)}><PanelRightClose /></IconButton>
      </div>
      {/* What each agent turn did, and the comments and edits staged for the next one. */}
      <Tabs.Root value={tab} onValueChange={(t) => { setTab(t); save('agent-tab', t); }} className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-2 pl-4">
          <Tabs.List aria-label="Agent" className="flex h-full gap-4">
            <Tabs.Trigger value="history" className={TAB}>Activity{!!unread && <Count n={unread} className="bg-agent text-black" />}</Tabs.Trigger>
            <Tabs.Trigger value="changes" className={TAB}>Changes<Count n={shown} /></Tabs.Trigger>
          </Tabs.List>
        </div>
        <Tabs.Content value="changes" className="min-h-0 flex-1"><ScrollArea className="h-full">{body}</ScrollArea></Tabs.Content>
        <Tabs.Content value="history" className="min-h-0 flex-1"><ActivityFeed /></Tabs.Content>
      </Tabs.Root>
      {session && <AgentTerminal session={session} column={column} />}
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-t pr-4 pl-2.5">
        <AgentStatus session={session} />
        <SendButton handoff={handoff} />
      </div>
    </section>
  );
}


const TOOLS: [AgentTool, string][] = [['claude', 'Claude Code'], ['codex', 'Codex']];

/** What the agent is doing, or waits on you for, in a few words; with `files` the ones it holds. */
function useAgentState(session: Session | null) {
  const n = useNames();
  const info = useStore((s) => s.source?.agentInfo);
  const busy = useStore((s) => s.files.filter((f) => f.state === 'working').map((f) => f.path).join('\n'));
  const needs = useNeedsYou();
  const running = !!session?.running;
  const connected = !!info?.connected;
  const files = busy ? busy.split('\n') : [];
  const state = needs ? (needs === 'question' ? 'has a question' : 'needs you')
    : !connected && !running ? 'not running'
    : info?.waiting === 'idle' ? 'done, waiting for you'
    : files.length ? 'working'
    : !connected ? 'starting'
    : info?.since ? 'working' : 'connected';
  const name = !connected && session ? TOOLS.find(([t]) => t === session.tool)![1] : n.Agent;
  return { name, state, needs, connected, running, detail: needs ? info?.waitingText : undefined };
}

const Dot = ({ needs, live, starting }: { needs: unknown; live: boolean; starting?: boolean }) => (
  <span aria-hidden className={cn('size-2 shrink-0 rounded-full', needs ? 'bg-ring' : live ? 'bg-agent' : 'border border-muted-foreground', starting && 'animate-pulse')} />
);

/**
 * The column's bottom bar, left of Send all: the agent and what it is doing, the terminal drawer's toggle (Cmd+J),
 * Start when none runs (desktop), and Show for an agent that needs you in another terminal app.
 */
function AgentStatus({ session }: { session: Session | null }) {
  const source = useStore((s) => s.source);
  const drawer = useStore((s) => s.drawer);
  const { name, state, needs, connected, running } = useAgentState(session);
  const bridge = window.trove;
  const [app, setApp] = useState<string | null>(null);
  useEffect(() => { void bridge?.terminals().then((t) => setApp(t.current === 'Trove' ? null : t.current), () => {}); }, [needs]);
  const outside = needs && !running ? app : null;
  const start = (tool: AgentTool) => {
    if (source) bridge!.open({ path: source.root, agent: tool, kind: source.kind }).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
      {/* Toggles the floating terminal. What the agent is doing is in its title. */}
      <button type="button" disabled={!session} onClick={() => set({ drawer: !drawer })} aria-pressed={session ? drawer : undefined}
        title={`${name} ${state}${outside ? ` in ${outside}` : ''}`}
        className={cn('flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-muted aria-pressed:bg-muted', needs && 'text-ring')}>
        <Dot needs={needs} live={connected || running} starting={!connected && running} />
        <span className="min-w-0 truncate">{name}</span>
        {session && <><SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><Kbd className="shrink-0">⌘J</Kbd></>}
      </button>
      {outside && <Button variant="outline" size="xs" onClick={() => void bridge!.showTerminal()}>Show {outside}</Button>}
      {bridge && !connected && !running && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="gap-1">Start<ChevronDown /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {TOOLS.map(([tool, label]) => <DropdownMenuItem key={tool} onSelect={() => start(tool)}>{label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

const MIN = { w: 420, h: 280 };

/**
 * The agent's terminal (desktop): the one place to talk to it, a floating panel just left of the Agent column, with its
 * own size (drag its top or left edge). Hiding it keeps the session and its screen. A permission prompt or question
 * opens it; answering one there hides it again when it opened for that.
 */
function AgentTerminal({ session, column }: { session: Session; column: React.RefObject<HTMLElement | null> }) {
  const open = useStore((s) => s.drawer);
  const needs = useNeedsYou();
  const info = useStore((s) => s.source?.agentInfo);
  const { name, state, running, connected, detail } = useAgentState(session);
  const took = useElapsed(state === 'working' ? info?.since : null);
  const [mode, change] = useMode();
  const [size, setSize] = useState(() => load('terminal-size', { w: 640, h: 420 }));
  const [room, setRoom] = useState({ right: 8, bottom: 8, w: 640, h: 420 });
  const panel = useRef<HTMLDivElement>(null);
  const auto = useRef(false); // opened for a prompt: it hides once answered
  const answered = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect(), edge = r.width ? r.left : window.innerWidth;
      setRoom({ right: window.innerWidth - edge + 8, bottom: window.innerHeight - r.bottom + 8, w: Math.max(MIN.w, edge - 16), h: Math.max(MIN.h, r.height - 16) });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [column]);
  useEffect(() => {
    if (!needs || !session.running || get().drawer) return;
    auto.current = true;
    set({ drawer: true });
  }, [needs, info?.since, session.running]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => panel.current?.querySelector('textarea')?.focus());
  }, [open]);
  // Enter, or Escape or a digit at a prompt, answers it (after a turn, Enter sends the next one): the agent works again.
  const typed = (d: string) => {
    const w = info?.waiting;
    if (!w || answered.current === info.since || !(d.includes('\r') || (w !== 'idle' && (d === '\x1b' || /^\d$/.test(d))))) return;
    answered.current = info.since;
    void api('signal', { kind: 'working' }).catch(() => {});
    if (auto.current) { auto.current = false; set({ drawer: false }); }
  };
  const drag = (x: boolean, y: boolean) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY, w: Math.min(size.w, room.w), h: Math.min(size.h, room.h) };
    let next = { w: from.w, h: from.h };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      next = { w: x ? Math.min(room.w, Math.max(MIN.w, from.w + from.x - m.clientX)) : from.w, h: y ? Math.min(room.h, Math.max(MIN.h, from.h + from.y - m.clientY)) : from.h };
      setSize(next);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); save('terminal-size', next); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const hide = () => { auto.current = false; set({ drawer: false }); };
  const restart = () => void window.trove!.pty.start(session.tool, 100, 30).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
  return createPortal(
    <div ref={panel} role="dialog" aria-label={`${name} terminal`} aria-hidden={!open} inert={!open}
      style={{ right: room.right, bottom: room.bottom, width: Math.min(size.w, room.w), height: Math.min(size.h, room.h) }}
      className={cn('fixed z-40 flex flex-col overflow-hidden rounded-lg border bg-terminal shadow-2xl transition-[opacity,translate,scale,visibility] duration-150 ease-out motion-reduce:transition-none', !open && 'invisible translate-y-2 scale-[.985] opacity-0')}>
      <div onPointerDown={drag(false, true)} className="absolute inset-x-2 top-0 z-10 h-1.5 cursor-ns-resize" />
      <div onPointerDown={drag(true, false)} className="absolute inset-y-2 left-0 z-10 w-1.5 cursor-ew-resize" />
      <div onPointerDown={drag(true, true)} className="absolute top-0 left-0 z-20 size-3 cursor-nwse-resize" />
      <div className={cn('flex h-10 shrink-0 items-center gap-1.5 border-b pr-1.5 pl-3 text-xs', needs && 'bg-ring/10')}>
        <Dot needs={needs} live={connected || running} starting={!connected && running} />
        <span className={cn('min-w-0 truncate', needs ? 'font-semibold text-ring' : 'text-foreground')}>{name} <span className={needs ? '' : 'text-muted-foreground'}>{state}</span></span>
        {took && <span className="shrink-0 text-muted-foreground tabular-nums">{took}</span>}
        {detail && <span className="min-w-0 truncate text-muted-foreground">{detail}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {mode && <ModeMenu mode={mode} change={change}><Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">{modeLabel(mode)}<ChevronDown /></Button></ModeMenu>}
          {running
            ? <Button variant="outline" size="xs" className="text-destructive hover:text-destructive" onClick={() => void window.trove!.pty.kill()}><Square className="fill-current" />Stop</Button>
            : <Button variant="outline" size="xs" onClick={restart}>Start</Button>}
          <IconButton side="bottom" label="Hide terminal" tip={`Hide terminal (⌘J): ${name} keeps running`} onClick={hide}><Minus /></IconButton>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}><Terminal header={null} onInput={typed} /></Suspense>
      </div>
    </div>,
    document.body,
  );
}

/** One Changes row: meta line (number, kind, lost passage, hover tools), the quote, then its body. */
function Row({ kind, anchor, n, found, tools, children, locked, onClick, rowRef }: {
  kind: CommentKind; anchor: Anchor; n: number | null; found: boolean; tools?: ReactNode; children: ReactNode; locked?: boolean;
  onClick?: () => void; rowRef?: React.Ref<HTMLDivElement>;
}) {
  const Kind = kind === 'explain' ? MessageCircleQuestion : MessageSquare;
  return (
    <div ref={rowRef} data-stack={locked ? undefined : ''} data-note={locked ? undefined : n ?? undefined} onClick={(e) => { if (!(e.target as Element).closest('button, [data-slot=input-group]')) onClick?.(); }}
      className={cn('group/note px-4 py-2', locked ? 'cursor-default text-muted-foreground' : 'cursor-pointer hover:bg-muted')}>
      <div className="flex min-h-6 items-center gap-1.5 text-xs text-muted-foreground">
        {n != null && <span>{n + 1}</span>}
        <Kind className="size-3.5" aria-hidden />
        <span>{kind === 'explain' ? 'Explain' : 'Comment'}</span>
        {!found && <span className="inline-flex items-center gap-1 text-dirty"><CircleAlert className="size-3.5" aria-hidden />Passage not found</span>}
        <span className="ml-auto flex opacity-0 group-focus-within/note:opacity-100 group-hover/note:opacity-100">{tools}</span>
      </div>
      <div className="my-1.5 line-clamp-2 border-l-2 pl-2 text-muted-foreground">{anchor.quote}</div>
      {children}
    </div>
  );
}

/**
 * A note field that grows with its text, its actions under it; Cmd/Ctrl+Enter submits, Escape cancels.
 * In a height-capped parent (the comment card) the field shrinks first and scrolls.
 */
export function NoteField({ value, placeholder, verb, submit, cancel }: { value: string; placeholder: string; verb: string; submit: (t: string) => void; cancel: () => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = ref.current; t?.focus(); t?.setSelectionRange(t.value.length, t.value.length); }, []); // caret after an existing note
  return (
    <InputGroup className="min-h-0 bg-background">
      <InputGroupTextarea ref={ref} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
        className="min-h-14 [overflow-wrap:anywhere]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(text.trim()); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }} />
      <InputGroupAddon align="block-end" className="justify-end">
        <InputGroupButton size="sm" onClick={cancel}>Cancel</InputGroupButton>
        <InputGroupButton size="sm" variant="default" onClick={() => submit(text.trim())}>
          {verb}<Kbd className="bg-primary-foreground/15 text-primary-foreground">{sendKey}</Kbd>
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** One comment, for the open file or any other. Edits and deletes go to that file's drafts. */
function CommentRow({ path, list, c, n, found, locked }: { path: string; list: Draft[]; c: Draft; n: number; found: boolean; locked: boolean }) {
  const editing = useStore((s) => s.noteEdit) === c;
  const ref = useRef<HTMLDivElement>(null);
  const persist = (next: Draft[]) => void saveDrafts(path, next);
  // Collapse the row, then drop the comment, found by identity so a re-render cannot remove the wrong one.
  const remove = () => {
    const el = ref.current;
    const done = () => { const i = list.indexOf(c); if (i >= 0) persist(list.filter((d) => d !== c)); };
    if (!el) return done();
    el.style.overflow = 'hidden';
    const frames = reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: 0, paddingTop: 0, paddingBottom: 0, opacity: 0 }];
    el.animate(frames, { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).finished.then(done, done);
  };
  const tools = locked ? null : (
    <>
      <IconButton label="Edit comment" onClick={() => set({ noteEdit: c })}><Pencil /></IconButton>
      <IconButton label="Delete comment" onClick={remove}><Trash /></IconButton>
    </>
  );
  return (
    <Row rowRef={ref} kind={c.kind} anchor={c.anchor} n={n} found={found} locked={locked} tools={tools} onClick={locked ? undefined : () => void showPassage(path, n)}>
      {editing ? (
        <NoteField value={c.note} placeholder="" verb="Save"
          submit={(text) => { set({ noteEdit: null }); persist(list.map((d) => (d === c && text ? { ...d, note: text } : d))); }}
          cancel={() => set({ noteEdit: null })} />
      ) : <div className={cn('[overflow-wrap:anywhere]', locked ? 'text-muted-foreground' : 'text-foreground')}>{c.note}</div>}
    </Row>
  );
}

/** One saved edit: the block's first line before, struck through, and now. */
function EditRow({ path, x, locked }: { path: string; x: BlockEdit; locked: boolean }) {
  const firstLine = (t: string) => t.split('\n').find((l) => l.trim()) ?? '';
  return (
    <div onClick={(e) => { if (!locked && !(e.target as Element).closest('button')) void showBlock(path, x.index); }}
      className={cn('group/note px-4 py-2', locked ? 'cursor-default text-muted-foreground' : 'cursor-pointer hover:bg-muted')}>
      <div className="flex min-h-6 items-center gap-1.5 text-xs text-muted-foreground">
        <Pencil className="size-3.5" aria-hidden /><span>Edit</span>
        {!locked && (
          <span className="ml-auto flex opacity-0 group-focus-within/note:opacity-100 group-hover/note:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={x.ok ? -1 : 0} className="inline-flex">
                  <Button variant="ghost" size="icon-sm" aria-label="Revert this edit" disabled={!x.ok} className="text-muted-foreground [&_svg]:size-4" onClick={() => void revertEdit(path, x)}><Undo2 /></Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{x.ok ? 'Revert this edit' : 'The text changed since your edit'}</TooltipContent>
            </Tooltip>
          </span>
        )}
      </div>
      <div className="mt-1.5 border-l-2 pl-2 text-[13px]">
        <del className="block truncate text-muted-foreground">{firstLine(x.before) || ' '}</del>
        <div className="truncate">{firstLine(x.after) || ' '}</div>
      </div>
    </div>
  );
}

/** A file's group heading: opens the file; right-click for its path menu. */
function FileHead({ f, count }: { f: FileRow; count: number }) {
  return (
    <PathMenu path={f.path}>
      <Button variant="ghost" size="sm" onClick={() => void open(f.path)} title={f.path}
        className="mx-2 mt-1 flex w-[calc(100%-1rem)] justify-start gap-1.5 px-2 text-[13px] text-body">
        <PathLabel path={f.path} className="min-w-0 flex-1" />
        <Count n={count} />
      </Button>
    </PathMenu>
  );
}

/** Send all, and a menu that narrows it. A row with nothing to do is refused, not hidden. */
function SendButton({ handoff }: { handoff: () => Promise<void> }) {
  const files = useStore((s) => s.files);
  const offline = useStore((s) => s.offline);
  const current = useStore((s) => s.current);
  const allDrafts = useStore((s) => s.allDrafts);
  const n = useNames();
  const [comments, withComments] = sendable();
  const anyDrafts = files.some((f) => f.drafts);
  const live = files.filter((f) => f.state !== 'working' && f.state !== 'rejected');
  const all = live.flatMap((f) => (f.path === current?.path ? current.drafts : allDrafts[f.path] ?? []));
  const lockedCurrent = files.find((f) => f.path === current?.path)?.state === 'working';
  const items = [
    { act: 'review', label: 'Review all comments', count: files.reduce((k, f) => k + f.drafts, 0), why: 'No comments anywhere' },
    { act: 'file', label: 'Send this file only', count: lockedCurrent ? 0 : current?.drafts.length ?? 0, why: lockedCurrent ? `${n.Agent} is working on this file` : 'This file has no comments' },
    { act: 'change', label: 'Send changes only', count: all.filter((c) => c.kind === 'change').length, why: 'No change comments to send' },
    { act: 'explain', label: 'Send explain only', count: all.filter((c) => c.kind === 'explain').length, why: 'No explain comments to send' },
  ] as const;
  const run = (act: (typeof items)[number]['act']) => {
    if (act === 'review') { togglePanel('changes', false); setScope('all'); }
    else if (act === 'file') void send({ paths: [get().current!.path] });
    else void send({ kind: act });
  };
  return (
    <ButtonGroup className="ml-auto min-w-0 shrink-0">
      <Button variant="tier2" size="default" className="min-w-0 truncate" disabled={!comments || offline} onClick={(e) => { if (e.detail <= 1) void handoff(); }}>
        <span className="truncate">{comments ? `Send all (${plural(comments, 'comment')}, ${plural(withComments, 'file')})` : 'Send all'}</span>
      </Button>
      <DropdownMenu onOpenChange={(o) => { if (o) void loadAll().catch(() => {}); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="tier2" size="icon" aria-label="More send options" disabled={!anyDrafts || offline} className="border-l border-black/25">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="min-w-[250px]">
          {items.map((it) => (
            <Tooltip key={it.act}>
              <TooltipTrigger asChild>
                <DropdownMenuItem aria-disabled={!it.count} onSelect={(e) => (it.count ? run(it.act) : e.preventDefault())}
                  className={cn('h-9 gap-2.5 font-medium', !it.count && 'cursor-not-allowed text-muted-foreground/60 focus:text-muted-foreground/60')}>
                  {it.label}
                  {!it.count && <span className="sr-only">, {it.why}</span>}
                  <span className="ml-auto text-muted-foreground tabular-nums">{it.count}</span>
                </DropdownMenuItem>
              </TooltipTrigger>
              {!it.count && <TooltipContent side="left">{it.why}</TooltipContent>}
            </Tooltip>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
