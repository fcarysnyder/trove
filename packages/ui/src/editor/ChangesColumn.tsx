import type { Anchor, BlockEdit, CommentKind, Draft, FileRow } from '@trove/core/types';
import { ChevronDown, CircleAlert, MessageCircleQuestion, MessageSquare, PanelBottomClose, PanelBottomOpen, PanelRightClose, Pencil, Trash, Undo2 } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { load, save } from '@/lib/storage';
import { mod, plural, reducedMotion } from '@/lib/text';
import { cn } from '@/lib/utils';
import { loadAll, open, revertEdit, saveDrafts, send, sendable, setScope, togglePanel } from './actions';
import { Count, IconButton, PathLabel } from './bits';
import { get, set, useNames, useStore } from './store';
import { showBlock, showPassage } from './doc/commands';
import { ActivityList } from './Activity';
import { Notice } from './TopBar';

// Desktop only, and its own chunk: the plugin's page never loads xterm.
const Terminal = lazy(() => import('./Terminal'));

/** Whether this window has an agent terminal: one already ran, or main starts one (Connect's Start buttons). */
function useSession() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const pty = window.trove?.pty;
    if (!pty) return;
    void pty.state().then((s) => { if (s) setOn(true); });
    const off = pty.onData(() => { setOn(true); off(); });
    return off;
  }, []);
  return on;
}

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

  const [tab, setTab] = useState(() => load('agent-tab', 'changes'));
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
    <section aria-label="Agent" className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <span className="font-semibold text-foreground">Agent</span>
        <Notice />
        <DropdownMenu>
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
        </DropdownMenu>
        <IconButton side="bottom" label="Hide agent" tip="Hide agent (])" onClick={() => togglePanel('changes', true)}><PanelRightClose /></IconButton>
      </div>
      <WithTerminal bottom={(fold) => (
        // The comments and edits still to send, and what went back and forth with the agent.
        <Tabs.Root value={tab} onValueChange={(t) => { setTab(t); save('agent-tab', t); }} className="flex h-full min-h-0 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-2 pl-4">
            <Tabs.List aria-label="Agent" className="flex h-full gap-4">
              <Tabs.Trigger value="changes" className={TAB}>Changes{!!shown && <Count n={shown} />}</Tabs.Trigger>
              <Tabs.Trigger value="history" className={TAB}>History</Tabs.Trigger>
            </Tabs.List>
            <span className="ml-auto">{fold}</span>
          </div>
          <Tabs.Content value="changes" className="min-h-0 flex-1"><ScrollArea className="h-full">{body}</ScrollArea></Tabs.Content>
          <Tabs.Content value="history" className="min-h-0 flex-1">
            <ScrollArea className="h-full"><ActivityList path={scope === 'file' ? current?.path : undefined} /></ScrollArea>
          </Tabs.Content>
        </Tabs.Root>
      )} />
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-t px-4">
        <SendButton />
      </div>
    </section>
  );
}

const TAB = '-mb-px flex items-center gap-1.5 border-b-2 border-transparent font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground';

const STRIP = 36; // the terminal's header and the tabs: all that shows of either while it is folded

/**
 * The agent's terminal over `bottom` (the changes and history tabs), once the window has one. Either folds to
 * its strip, never both; the terminal's height and what is folded are remembered. `bottom` gets its fold button, for the right of its tabs.
 */
function WithTerminal({ bottom }: { bottom: (fold: ReactNode) => ReactNode }) {
  const session = useSession();
  const top = useRef<PanelImperativeHandle>(null);
  const low = useRef<PanelImperativeHandle>(null);
  const [saved] = useState(() => ({ height: 360, hidden: false, folded: false, ...load<object>('terminal', {}) }));
  const [hidden, setHidden] = useState(saved.hidden);
  const [folded, setFolded] = useState(saved.folded && !saved.hidden);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (!session) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true))); // as Columns: no motion on load
    return () => cancelAnimationFrame(id);
  }, [session]);
  if (!session) return <div className="flex min-h-0 flex-1 flex-col">{bottom(null)}</div>;
  const hide = (h: boolean) => {
    if (!h) return top.current?.resize(saved.height);
    if (low.current?.isCollapsed()) low.current.expand();
    top.current?.collapse();
  };
  const fold = (f: boolean) => {
    if (!f) return low.current?.expand();
    if (top.current?.isCollapsed()) top.current.resize(saved.height);
    low.current?.collapse();
  };
  // A drag, hide or fold: what is folded, and an open terminal's height over open tabs, are remembered.
  const changed = (_: unknown, meta: { isUserInteraction: boolean }) => {
    const h = !!top.current?.isCollapsed(), f = !!low.current?.isCollapsed();
    setHidden(h);
    setFolded(f);
    if (!h && !f && meta.isUserInteraction) saved.height = Math.round(top.current?.getSize().inPixels ?? saved.height);
    save('terminal', { ...saved, hidden: h, folded: f });
  };
  const foldButton = (
    <IconButton side="bottom" label={folded ? 'Show changes' : 'Hide changes'} onClick={() => fold(!folded)}>{folded ? <PanelBottomOpen /> : <PanelBottomClose />}</IconButton>
  );
  return (
    <ResizablePanelGroup orientation="vertical" onLayoutChanged={changed} className={cn('min-h-0 flex-1', animate && 'animate')}>
      <ResizablePanel id="terminal" panelRef={top} collapsible collapsedSize={STRIP} minSize={160} defaultSize={hidden ? STRIP : folded ? undefined : saved.height} groupResizeBehavior="preserve-pixel-size">
        <Suspense><Terminal hidden={hidden} onHide={hide} /></Suspense>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize terminal" />
      <ResizablePanel id="history" panelRef={low} collapsible collapsedSize={STRIP} minSize={120} defaultSize={folded ? STRIP : undefined}>{bottom(foldButton)}</ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** One Changes row: meta line (number, kind, lost passage, hover tools), the quote, then its body. */
function Row({ kind, anchor, n, found, tools, children, locked, onClick, rowRef }: {
  kind: CommentKind; anchor: Anchor; n: number | null; found: boolean; tools?: ReactNode; children: ReactNode; locked?: boolean;
  onClick?: () => void; rowRef?: React.Ref<HTMLDivElement>;
}) {
  const Kind = kind === 'explain' ? MessageCircleQuestion : MessageSquare;
  return (
    <div ref={rowRef} data-note={locked ? undefined : n ?? undefined} onClick={(e) => { if (!(e.target as Element).closest('textarea, button')) onClick?.(); }}
      className={cn('group/note px-4 py-2', locked ? 'cursor-default text-muted-foreground' : 'cursor-pointer hover:bg-card')}>
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

/** A note field that grows with its text; Cmd/Ctrl+Enter submits, Escape cancels. */
export function NoteField({ value, placeholder, verb, submit, cancel }: { value: string; placeholder: string; verb: string; submit: (t: string) => void; cancel: () => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <textarea ref={ref} value={text} placeholder={placeholder} rows={1} onChange={(e) => setText(e.target.value)}
        className="quiet field-sizing-content placeholder:text-muted-foreground"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(text.trim()); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }} />
      <div className="my-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => submit(text.trim())}>{verb}<Kbd>{mod === 'Cmd' ? '⌘↵' : 'Ctrl ↵'}</Kbd></Button>
        <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
      </div>
    </>
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
      className={cn('group/note px-4 py-2', locked ? 'cursor-default text-muted-foreground' : 'cursor-pointer hover:bg-card')}>
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

function FileHead({ f, count }: { f: FileRow; count: number }) {
  return (
    <button onClick={() => void open(f.path)} title={f.path}
      className="flex w-full items-center gap-1.5 px-4 pt-2 pb-1 text-left text-[13px] font-medium whitespace-nowrap text-body outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <PathLabel path={f.path} className="min-w-0 flex-1" />
      <Count n={count} />
    </button>
  );
}

/** Send all, and a menu that narrows it. A row with nothing to do is refused, not hidden. */
function SendButton() {
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
    <ButtonGroup className="ml-auto min-w-0">
      <Button variant="tier2" size="default" className="min-w-0 truncate" disabled={!comments || offline} onClick={(e) => { if (e.detail <= 1) void send({}); }}>
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
