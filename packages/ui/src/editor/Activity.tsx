// The Agent pane's History: one conversation with the agent. Messages with no file (yours, the agent's, its questions
// and replies) and what happened (attach, detach, other events-log lines) run in order. Everything about a file (sends
// with their comments, releases with the agent's note, messages about it) is that file's thread: one card in the
// conversation at the point of its latest entry, which opens the thread with its own composer.
import { AGENT_MODES, type Activity, type AgentMode, type Batch, type MessageBody } from '@trove/core/types';
import { marked } from '@trove/core/marked';
import { ArrowUp, ChevronDown, ChevronLeft, ChevronUp, Reply, Quote, SquareTerminal, X, Zap, FileCheck, FileText, GitPullRequest, Info, MessageCircleQuestion, Plug, Send, Unplug, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { api } from '@/lib/api';
import { load, save } from '@/lib/storage';
import { nameOf, plural, sendKey } from '@/lib/text';
import { cn } from '@/lib/utils';
import { flash, reveal, sendMessage } from './actions';
import { useElapsed } from './bits';
import { PathMenu } from './PathMenu';
import { get, set, useNames, useStore, type ChatRef } from './store';

/** What the agent or the user said in an entry: a message, a release's note, a question or reply. */
const said = (e: Activity) => e.body ?? (e.kind === 'question' || e.kind === 'reply' ? e.text : null);

/** Each entry's files: its own, else those of the entry it answers; none puts it in the conversation itself. */
function filesOf(entries: Activity[]) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const memo = new Map<Activity, string[]>();
  const of = (e: Activity, depth = 0): string[] => {
    let ps = memo.get(e);
    if (ps) return ps;
    ps = e.paths ?? (e.kind === 'release' ? [e.text] : []);
    const up = !ps.length && e.re && depth < 50 ? byId.get(e.re) : undefined;
    if (up) ps = of(up, depth + 1);
    memo.set(e, ps);
    return ps;
  };
  return of;
}

type Item = { e: Activity } | { path: string; entries: Activity[] };
/** The conversation: entries with no file in order, and each file's thread where its newest entry falls. */
function conversation(entries: Activity[]): Item[] {
  const of = filesOf(entries);
  const threads = new Map<string, { entries: Activity[]; last: number }>();
  const items: [number, Item][] = [];
  entries.forEach((e, i) => {
    const ps = of(e);
    if (!ps.length) items.push([i, { e }]);
    for (const p of ps) {
      const t = threads.get(p) ?? { entries: [], last: i };
      t.entries.push(e);
      t.last = i;
      threads.set(p, t);
    }
  });
  for (const [path, t] of threads) items.push([t.last, { path, entries: t.entries }]);
  return items.sort((a, b) => a[0] - b[0]).map(([, it]) => it);
}
const threadOf = (entries: Activity[], path: string) => { const of = filesOf(entries); return entries.filter((e) => of(e).includes(path)); };
/** A send's comments on `path`: its count for that file (older entries have the total, exact for one file). */
const commentsOn = (e: Activity, path: string) => e.counts?.[path] ?? (e.paths?.length === 1 ? e.comments ?? 0 : 0);

/** New entries from the agent since History was last open (this browser), for the tab's badge. */
export function useUnread(open: boolean) {
  const entries = useStore((s) => s.activity);
  const newest = entries.at(-1)?.at ?? '';
  const [seen, setSeen] = useState(() => load<string | null>('history-seen', null));
  useEffect(() => {
    if ((open || seen === null) && newest && newest !== seen) { setSeen(newest); save('history-seen', newest); }
  }, [open, newest, seen]);
  return open || !seen ? 0 : entries.filter((e) => e.from === 'agent' && e.at > seen).length;
}

const when = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
};
const Time = ({ at, className }: { at: string; className?: string }) => (
  <time dateTime={at} title={new Date(at).toLocaleString()} className={cn('shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums', className)}>{when(at)}</time>
);

/** Markdown as the document view renders it (the page's CSP keeps scripts out); links open outside the page. */
function Markdown({ text }: { text: string }) {
  const html = useMemo(() => (marked.parse(text, undefined) as string).replaceAll('<a ', '<a target="_blank" rel="noreferrer" '), [text]);
  return <div className="block-body msg" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * What became of a message of yours the agent has not answered: it waits on a prompt in the agent's session, or for an
 * agent that is not running (or attached after it was written).
 */
function usePending(e: Activity) {
  const n = useNames();
  const info = useStore((s) => s.source?.agentInfo);
  const answered = useStore((s) => s.activity.some((a) => a.from === 'agent' && a.at > e.at));
  if (e.from !== 'user' || answered || !info) return null;
  if ((info.waiting === 'permission' || info.waiting === 'question') && info.since && info.since < e.at) return `${n.Agent} reads this after the prompt is answered`;
  if (!info.connected || (info.at && info.at > e.at)) return `Waiting for ${n.agent}`;
  return null;
}

/**
 * A message. Yours: a bubble on the right; the agent's: plain text. The time shows on hover, under it; what became of a
 * message of yours still unanswered shows there always.
 */
function Message({ e, children }: { e: Activity; children?: ReactNode }) {
  const agent = e.from !== 'user' && e.kind !== 'batch';
  const pending = usePending(e);
  return (
    <div className={cn('group relative flex flex-col', !agent && 'items-end')}>
      <div className={cn('min-w-0', agent ? 'w-full' : 'max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3 py-2')}>
        {children ?? <Markdown text={said(e) ?? ''} />}
      </div>
      <div className={cn('flex h-4 items-center gap-1.5 text-xs text-muted-foreground',
        pending ? 'mt-1' : 'pointer-events-none absolute top-full mt-0.5 opacity-0 transition-opacity group-hover:opacity-100',
        !pending && (agent ? 'left-0' : 'right-0'))}>
        {pending && <span>{pending}</span>}<Time at={e.at} />
      </div>
    </div>
  );
}

/** Something that happened, as one quiet line: an icon, what, when. */
function Row({ icon: Icon, at, children }: { icon: LucideIcon; at: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children} · <Time at={at} /></span>
    </div>
  );
}

/** An entry in the conversation or a thread. In a thread, a send shows its comments on that file. */
function Entry({ e, path }: { e: Activity; path?: string }) {
  const n = useNames();
  if (said(e) != null && e.kind !== 'release') return <Message e={e} />;
  if (e.kind === 'batch') {
    return (
      <div>
        {path ? <BatchComments e={e} path={path} /> : <Row icon={Send} at={e.at}>You sent {plural(e.comments ?? 0, 'comment')}</Row>}
      </div>
    );
  }
  if (e.kind === 'release') {
    return (
      <div className="flex flex-col gap-2">
        <Row icon={FileCheck} at={e.at}>Released to you</Row>
        {e.body && <Message e={e} />}
      </div>
    );
  }
  if (e.kind === 'attach' || e.kind === 'detach') return <Row icon={e.kind === 'attach' ? Plug : Unplug} at={e.at}>{e.kind === 'attach' ? 'Attached' : 'Detached'} {e.text}</Row>;
  // Create PR's line on the events log (`pr <id>: …`) reads as the request it is.
  if (/^pr \w+:/.test(e.text)) return <Row icon={GitPullRequest} at={e.at}>Asked {n.agent} to open a pull request</Row>;
  return <Row icon={Info} at={e.at}>{e.text}</Row>;
}

/** A send's comments on one file, as your message: each quote and note. */
function BatchComments({ e, path }: { e: Activity; path: string }) {
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  useEffect(() => { void api<Batch>(`batch?id=${encodeURIComponent(e.id)}`).then(setBatch, () => setBatch(null)); }, [e.id]);
  if (batch === undefined) return null;
  if (!batch) return <Row icon={Send} at={e.at}>You sent {plural(commentsOn(e, path), 'comment')}</Row>;
  return (
    <Message e={e}>
      <ol className="flex flex-col gap-3 text-[13px]">
        {batch.items.filter((c) => c.path === path).map((c, k) => (
          <li key={k} className="flex flex-col gap-1">
            <div className="line-clamp-2 border-l-2 border-foreground/20 pl-2 text-muted-foreground">{c.anchor.quote}</div>
            {c.kind === 'explain' && <div className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircleQuestion className="size-3.5" aria-hidden />Explain</div>}
            <div className="whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{c.note}</div>
          </li>
        ))}
      </ol>
    </Message>
  );
}

/** A thread whose last word is the agent's: it waits on you. */
const waitsOnYou = (entries: Activity[]) => { const l = entries.at(-1); return l?.kind === 'message' && l.from === 'agent'; };

/** How many threads wait on you, over the message box; the chevrons step through them: the card in view, its file open. */
function WaitingBar({ paths }: { paths: string[] }) {
  const [at, setAt] = useState(-1);
  if (!paths.length) return null;
  const go = (d: number) => {
    const k = (at + d + paths.length) % paths.length;
    setAt(k);
    flash(document.querySelector(`[data-thread="${CSS.escape(paths[k])}"]`));
    void reveal(paths[k]);
  };
  return (
    <div className="flex items-center gap-2 rounded-t-md border border-b-0 bg-muted/50 py-1 pr-1 pl-3 text-xs">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
      <span className="min-w-0 flex-1 text-body">{paths.length} waiting on you</span>
      <Button variant="ghost" size="icon-xs" aria-label="Previous" onClick={() => go(-1)}><ChevronUp /></Button>
      <Button variant="ghost" size="icon-xs" aria-label="Next" onClick={() => go(1)}><ChevronDown /></Button>
    </div>
  );
}

/** A file's thread in the conversation: its state as the icon (working, waiting on you), name, time, last words. */
function ThreadCard({ path, entries, onOpen }: { path: string; entries: Activity[]; onOpen: () => void }) {
  const n = useNames();
  const working = useStore((s) => s.files.some((f) => f.path === path && f.state === 'working'));
  const last = entries.at(-1)!;
  const yours = !working && waitsOnYou(entries);
  const words = said(last)?.split('\n').find((l) => l.trim())?.replace(/^[#>*\-\s]+/, '')
    ?? (last.kind === 'batch' ? `Sent ${plural(commentsOn(last, path), 'comment')}` : last.kind === 'release' ? 'Released to you' : '');
  return (
    <PathMenu path={path}>
      <button onClick={onOpen} data-thread={path} className="group flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex w-full items-center gap-2">
          <span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground">
            {working ? <Spinner className="size-3.5" aria-label={`${n.Agent} is working`} />
              : yours ? <span role="img" aria-label="Waiting on you" className="size-2 rounded-full bg-primary" />
              : <FileText className="size-3.5" aria-hidden />}
          </span>
          <span title={path} className="min-w-0 flex-1 truncate font-medium text-foreground">{nameOf(path)}</span>
          <Time at={last.at} className="group-hover:hidden group-focus-visible:hidden" />
          <span className="hidden items-center gap-1 text-xs text-foreground group-hover:flex group-focus-visible:flex"><Reply className="size-3.5" aria-hidden />Reply</span>
        </span>
        {words && <span className="truncate pl-5.5 text-muted-foreground">{words}</span>}
      </button>
    </PathMenu>
  );
}

const drafts: Record<string, string> = {}; // each composer's text by thread ('' the conversation), kept while the tab is away

/**
 * A message to the agent. With the agent in this window's terminal it is typed there (History records it, the events
 * log stays quiet); otherwise it goes through the events log the agent reads. A slash command is typed as is.
 */
async function deliver(body: MessageBody) {
  const pty = window.trove?.pty;
  const live = pty && (await pty.state().catch(() => null))?.exitCode === null;
  if (!live) return sendMessage(body);
  if (!(await sendMessage({ ...body, typed: true }))) return false;
  const text = body.paths?.length && !body.text.startsWith('/') ? `About ${body.paths.join(', ')}:\n${body.text}` : body.text;
  pty.write(text.startsWith('/') ? text : `\x1b[200~${text}\x1b[201~`); // a bracketed paste keeps newlines in one message
  setTimeout(() => pty.write('\r'), 60); // ponytail: a beat after the paste so the TUI reads Enter as submit
  if (text.startsWith('/')) set({ drawer: true }); // what a command shows is in the terminal
  else if (get().source?.agentInfo?.waiting === 'idle') void api('signal', { kind: 'working' }).catch(() => {});
  return true;
}

/** The passages added to chat, as quotes ahead of the message. */
const quoted = (refs: ChatRef[]) => refs.map((c) => `> *${c.path}${c.tag ? ` <${c.tag}>` : ''}*\n>\n> ${c.quote.replaceAll('\n', '\n> ')}`).join('\n\n');

const MODES: Record<AgentMode, string> = { bypass: 'Bypass', auto: 'Auto', ask: 'Ask' };

/** The permission mode agents start with (desktop): the mode, and a menu that sets it for the next start. */
function useMode() {
  const bridge = window.trove;
  const [mode, setMode] = useState<AgentMode | null>(null);
  useEffect(() => { void bridge?.mode().then(setMode, () => {}); }, []);
  const change = (m: AgentMode) => void bridge!.setMode(m).then(() => { setMode(m); toast(`${MODES[m]} from the next start`); }, (e: Error) => toast(e.message));
  return [mode, change] as const;
}
function ModeMenu({ mode, change, children }: { mode: AgentMode; change: (m: AgentMode) => void; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => change(v as AgentMode)}>
          {AGENT_MODES.map((m) => <DropdownMenuRadioItem key={m} value={m}>{MODES[m]}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The agent is busy (with `path`, on that file): a row at the end of the stream, with its current tool when known. */
function useWorking(path?: string) {
  return useStore((s) => {
    const info = s.source?.agentInfo;
    if (path) return s.files.some((f) => f.path === path && f.state === 'working') ? (info?.waitingText ?? '') : null;
    return info?.connected && info.since && !info.waiting ? (info.waitingText ?? '') : null;
  });
}

function Working({ tool }: { tool: string }) {
  const n = useNames();
  const took = useElapsed(useStore((s) => s.source?.agentInfo?.since));
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <Spinner className="size-3.5 text-muted-foreground" />
      <Shimmer as="span">{`${n.Agent} is working`}</Shimmer>
      {took && <span className="text-muted-foreground tabular-nums">{took}</span>}
      {tool && <span className="min-w-0 truncate text-muted-foreground">{tool}</span>}
    </li>
  );
}

/** The agent waits on something only its terminal can answer: what, and the way there. */
function NeedsTerminal() {
  const n = useNames();
  const info = useStore((s) => s.source?.agentInfo);
  const w = info?.waiting;
  if (!window.trove?.pty || (w !== 'question' && w !== 'permission')) return null;
  return (
    <div className="mx-3 mb-2 flex flex-col gap-2 rounded-lg border border-ring/60 bg-ring/5 p-3 text-[13px]">
      <div className="flex items-center gap-1.5 font-semibold text-foreground">
        <MessageCircleQuestion className="size-4 shrink-0 text-ring" aria-hidden />{w === 'question' ? `${n.Agent} is asking you` : `${n.Agent} needs your permission`}
      </div>
      {info?.waitingText && <p className="text-muted-foreground [overflow-wrap:anywhere]">{info.waitingText}</p>}
      <Button variant="outline" size="sm" className="self-start" onClick={() => set({ drawer: true })}><SquareTerminal />Answer in terminal<Kbd>⌘J</Kbd></Button>
    </div>
  );
}

/**
 * A message box: the passages added to chat as chips over the field, Cmd/Ctrl+Enter or the arrow sends (the text stays
 * when sending fails). On the desktop, a notice while agents start with bypass (gone once you type), and under the box
 * the agent and its permission mode.
 */
function Composer({ id, placeholder, send, banner }: { id: string; placeholder: string; send: (text: string) => Promise<boolean>; banner?: ReactNode }) {
  const offline = useStore((s) => s.offline);
  const chat = useStore((s) => s.chat);
  const n = useNames();
  const [text, setText] = useState(drafts[id] ?? '');
  const [busy, setBusy] = useState(false);
  const [mode, change] = useMode();
  const [seen, setSeen] = useState(() => load<boolean>('bypass-seen', false));
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const focus = () => requestAnimationFrame(() => field.current?.focus());
    window.addEventListener('trove:chat', focus);
    return () => window.removeEventListener('trove:chat', focus);
  }, []);
  const edit = (t: string) => {
    setText(t);
    drafts[id] = t;
    if (t && !seen) { setSeen(true); save('bypass-seen', true); }
  };
  const ready = !!text.trim() || chat.length > 0;
  const submit = async () => {
    if (!ready || busy || offline) return;
    setBusy(true);
    const ok = await send([quoted(chat), text.trim()].filter(Boolean).join('\n\n'));
    setBusy(false);
    if (ok) { edit(''); set({ chat: [] }); }
  };
  const notice = mode === 'bypass' && !seen;
  return (
    <div className="shrink-0 px-3 pt-1 pb-2">
      {banner}
      {notice && (
        <div className={cn('flex items-center gap-2 border border-b-0 bg-muted/50 py-1.5 pr-1.5 pl-3 text-xs', !banner && 'rounded-t-md')}>
          <Zap className="size-3.5 shrink-0 text-ring" aria-hidden />
          <span className="min-w-0 flex-1 text-body">Bypass is on: {n.agent} runs commands without asking.</span>
          <ModeMenu mode={mode} change={change}><Button variant="outline" size="xs" className="shrink-0">Change</Button></ModeMenu>
        </div>
      )}
      <InputGroup className={cn((notice || banner) && 'rounded-t-none')}>
        {chat.length > 0 && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1">
            {chat.map((c) => (
              <span key={`${c.path}:${c.quote}`} title={`${c.path}\n${c.quote}`} className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border bg-background py-0.5 pr-0.5 pl-1.5 text-xs text-foreground">
                <Quote className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="shrink-0 text-muted-foreground">{nameOf(c.path)}</span>
                <span className="min-w-0 truncate">{c.tag && <span className="font-mono text-muted-foreground">{c.tag} </span>}{c.quote}</span>
                <button type="button" aria-label={`Remove ${c.quote}`} onClick={() => set((s) => ({ chat: s.chat.filter((x) => x !== c) }))}
                  className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3" /></button>
              </span>
            ))}
          </InputGroupAddon>
        )}
        <InputGroupTextarea ref={field} value={text} rows={1} placeholder={placeholder} aria-label={placeholder} className="max-h-40 min-h-10 md:text-[13px]"
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
            if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
          }} />
        <InputGroupAddon align="block-end">
          {text.startsWith('/') && window.trove?.pty
            ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><SquareTerminal className="size-3.5" aria-hidden />Opens the terminal</span>
            : <Kbd>{sendKey}</Kbd>}
          <InputGroupButton variant="default" size="icon-xs" className="ml-auto rounded-full bg-ring text-white hover:bg-ring/85" aria-label="Send" disabled={!ready || busy || offline} onClick={() => void submit()}>
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {mode && (
        <div className="flex items-center gap-2 px-1 pt-1.5 text-xs">
          <span className="text-foreground">{n.Agent}</span>
          <ModeMenu mode={mode} change={change}>
            <Button variant="ghost" size="xs" className="-ml-1 gap-0.5 px-1 font-normal text-muted-foreground">{MODES[mode]}<ChevronDown /></Button>
          </ModeMenu>
        </div>
      )}
    </div>
  );
}

// The scroller's content is a block, not Radix's table, so long lines truncate at the pane's width.
const BLOCK = '[&>[data-slot=scroll-area-viewport]>div]:!block';

/**
 * Newest at the bottom: follows new entries (a change of `key`) while scrolled to the bottom; scrolled up, stays put.
 * The ref goes at the end of a ScrollArea's content. (A column-reverse viewport would do this alone, but Radix's thumb
 * does not follow one.)
 */
function useFollow(key: unknown) {
  const end = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const viewport = () => end.current?.closest<HTMLElement>('[data-slot=scroll-area-viewport]');
  useEffect(() => {
    const vp = viewport();
    if (!vp) return;
    const onScroll = () => { stuck.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 24; };
    vp.addEventListener('scroll', onScroll, { passive: true });
    // The composer growing shortens the list: keep the bottom in view.
    const resized = new ResizeObserver(() => { if (stuck.current) vp.scrollTop = vp.scrollHeight; });
    resized.observe(vp);
    return () => { vp.removeEventListener('scroll', onScroll); resized.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const vp = viewport();
    if (vp && stuck.current) vp.scrollTop = vp.scrollHeight;
  }, [key]);
  return end;
}
const newest = (entries: Activity[]) => `${entries.at(-1)?.id}:${entries.at(-1)?.body}`;

/** One file's thread: Back (none when History shows only this file), the file, its entries, and a reply box. */
function Thread({ path, onBack }: { path: string; onBack?: () => void }) {
  const entries = threadOf(useStore((s) => s.activity), path);
  const working = useWorking(path);
  const end = useFollow(`${newest(entries)}:${working}`);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        {onBack && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onBack}><ChevronLeft />Back</Button>}
        <PathMenu path={path}>
          <Button variant="ghost" size="sm" title={path} className={cn('min-w-0 justify-start font-semibold text-foreground', !onBack && 'pl-2')} onClick={() => void reveal(path)}>
            <span className="truncate">{nameOf(path)}</span>
          </Button>
        </PathMenu>
      </div>
      <ScrollArea className={cn('min-h-0 flex-1', BLOCK)}>
        {!entries.length && working == null ? <p className="px-4 py-3 text-muted-foreground">Nothing about this file yet</p> : (
          <ol className="flex flex-col gap-4 px-4 py-3">
            {entries.map((e) => <li key={e.id}><Entry e={e} path={path} /></li>)}
            {working != null && <Working tool={working} />}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
      <NeedsTerminal />
      <Composer key={path} id={path} placeholder="Reply in thread"
        send={(text) => deliver({ text, paths: [path], ...(entries.length ? { re: entries.at(-1)!.id } : {}) })} />
    </div>
  );
}

/** History: the conversation, or with `path` (the This file scope) that file's thread. */
export function History({ path }: { path?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (path) return <Thread key={path} path={path} />;
  if (open) return <Thread key={open} path={open} onBack={() => setOpen(null)} />;
  return <Conversation onOpen={setOpen} />;
}

/** General messages and events in order, each file's thread as a card; a message box for a general message. */
function Conversation({ onOpen }: { onOpen: (path: string) => void }) {
  const entries = useStore((s) => s.activity);
  const n = useNames();
  const items = useMemo(() => conversation(entries), [entries]);
  const working = useWorking();
  const busy = useStore((s) => s.files.filter((f) => f.state === 'working').map((f) => f.path).join('\n'));
  const waiting = items.flatMap((it) => ('path' in it && waitsOnYou(it.entries) && !busy.split('\n').includes(it.path) ? [it.path] : []));
  const end = useFollow(`${newest(entries)}:${working}`);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className={cn('min-h-0 flex-1', BLOCK)}>
        {!items.length && working == null ? <p className="px-4 py-3 text-muted-foreground">No history yet</p> : (
          <ol className="flex flex-col gap-4 px-4 py-3">
            {items.map((it) => ('path' in it
              ? <li key={`t:${it.path}`}><ThreadCard path={it.path} entries={it.entries} onOpen={() => onOpen(it.path)} /></li>
              : <li key={it.e.id}><Entry e={it.e} /></li>))}
            {working != null && <Working tool={working} />}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
      <NeedsTerminal />
      <Composer id="" placeholder={`Message ${n.agent}`} send={(text) => deliver({ text })} banner={waiting.length > 0 && <WaitingBar paths={waiting} />} />
    </div>
  );
}
