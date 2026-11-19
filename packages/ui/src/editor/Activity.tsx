// The Agent pane's History: one conversation with the agent. Messages with no file (yours, the agent's, its questions
// and replies) and what happened (attach, detach, other events-log lines) run in order. Everything about a file (sends
// with their comments, releases with the agent's note, messages about it) is that file's thread: one card in the
// conversation at the point of its latest entry, which opens the thread with its own composer.
import type { Activity, Batch } from '@trove/core/types';
import { marked } from '@trove/core/marked';
import { ArrowUp, ChevronLeft, FileCheck, FileText, GitPullRequest, Info, MessageCircleQuestion, MessageSquare, Plug, Send, Unplug, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { load, save } from '@/lib/storage';
import { nameOf, plural, sendKey } from '@/lib/text';
import { cn } from '@/lib/utils';
import { reveal, sendMessage } from './actions';
import { PathMenu } from './PathMenu';
import { useNames, useStore } from './store';

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
const Time = ({ at }: { at: string }) => (
  <time dateTime={at} title={new Date(at).toLocaleString()} className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{when(at)}</time>
);

/** A sender's round mark: the agent's in its colour, yours in the foreground. */
function Avatar({ agent, small }: { agent: boolean; small?: boolean }) {
  const n = useNames();
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-semibold', small ? 'size-4 text-[9px] ring-2 ring-background' : 'size-5 text-[11px]',
      agent ? 'bg-agent text-white' : 'bg-foreground text-background')}>{agent ? n.Agent.charAt(0).toUpperCase() : 'Y'}</span>
  );
}

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

/** A message: avatar, name and time on one line, then the markdown; yours sits in a muted bubble. */
function Message({ e }: { e: Activity }) {
  const n = useNames();
  const agent = e.from !== 'user';
  const pending = usePending(e);
  return (
    <div>
      <div className="flex min-h-6 items-center gap-2">
        <Avatar agent={agent} />
        <span className="text-[13px] font-semibold text-foreground">{agent ? n.Agent : 'You'}</span>
        <Time at={e.at} />
      </div>
      <div className={cn('mt-1 ml-7', !agent && 'w-fit max-w-[calc(100%-1.75rem)] rounded-lg bg-muted px-3 py-2')}><Markdown text={said(e) ?? ''} /></div>
      {pending && <p className="mt-1 ml-7 text-xs text-muted-foreground">{pending}</p>}
    </div>
  );
}

/** Something that happened, as one compact row: an icon, what, when. */
function Row({ icon: Icon, at, children }: { icon: LucideIcon; at: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px]">
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"><Icon className="size-3.5" aria-hidden /></span>
      <span className="min-w-0 py-px text-body [overflow-wrap:anywhere]">{children} <Time at={at} /></span>
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
        <Row icon={Send} at={e.at}>You sent {plural(path ? commentsOn(e, path) : e.comments ?? 0, 'comment')}</Row>
        {path && <BatchComments id={e.id} path={path} />}
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

/** A send's comments on one file as they went: each quote and note. */
function BatchComments({ id, path }: { id: string; path: string }) {
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  useEffect(() => { void api<Batch>(`batch?id=${encodeURIComponent(id)}`).then(setBatch, () => setBatch(null)); }, [id]);
  if (batch === undefined) return null;
  if (!batch) return <p className="mt-1 ml-7 text-xs text-muted-foreground">This batch is no longer in the batches log</p>;
  return (
    <ol className="mt-1.5 ml-7 flex flex-col gap-2">
      {batch.items.filter((c) => c.path === path).map((c, k) => {
        const Kind = c.kind === 'explain' ? MessageCircleQuestion : MessageSquare;
        return (
          <li key={k} className="text-[13px]">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Kind className="size-3.5 shrink-0" aria-hidden />{c.kind === 'explain' ? 'Explain' : 'Comment'}</div>
            <div className="my-1 line-clamp-2 border-l-2 pl-2 text-muted-foreground">{c.anchor.quote}</div>
            <div className="whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{c.note}</div>
          </li>
        );
      })}
    </ol>
  );
}

/** A file's thread in the conversation: name and time, its counts and status, then its last message's first line. */
function ThreadCard({ path, entries, onOpen }: { path: string; entries: Activity[]; onOpen: () => void }) {
  const n = useNames();
  const working = useStore((s) => s.files.some((f) => f.path === path && f.state === 'working'));
  const last = entries.at(-1)!;
  const comments = entries.reduce((k, e) => k + (e.kind === 'batch' ? commentsOn(e, path) : 0), 0);
  const replies = entries.filter((e) => said(e) != null).length;
  const status = working ? `${n.Agent} is working` : last.kind === 'message' && last.from === 'agent' ? 'waiting on you' : last.kind === 'release' ? 'released' : null;
  const words = said(last)?.split('\n').find((l) => l.trim())?.replace(/^[#>*\-\s]+/, '')
    ?? (last.kind === 'batch' ? `You sent ${plural(commentsOn(last, path), 'comment')}` : last.kind === 'release' ? 'Released to you' : '');
  const who = [entries.some((e) => e.kind === 'batch' || e.from === 'user'), entries.some((e) => e.from === 'agent' || e.kind === 'release')];
  return (
    <PathMenu path={path}>
      <button onClick={onOpen} className="flex w-full flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex w-full items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span title={path} className="min-w-0 flex-1 truncate font-semibold text-foreground">{nameOf(path)}</span>
          <Time at={last.at} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {[comments && plural(comments, 'comment'), replies && `${replies} ${replies === 1 ? 'reply' : 'replies'}`].filter(Boolean).join(' · ')}
          {status && <Badge variant={status === 'waiting on you' ? 'outline' : 'secondary'} className={cn('h-5 font-normal', status === 'waiting on you' && 'border-dirty/50 text-dirty', working && 'text-agent')}>{status}</Badge>}
        </span>
        {words && (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 -space-x-1">{who[0] && <Avatar agent={false} small />}{who[1] && <Avatar agent small />}</span>
            <span className="min-w-0 truncate text-body">{words}</span>
          </span>
        )}
      </button>
    </PathMenu>
  );
}

const drafts: Record<string, string> = {}; // each composer's text by thread ('' the conversation), kept while the tab is away

/** A message box: Cmd/Ctrl+Enter or the arrow sends; the text stays when sending fails. */
function Composer({ id, placeholder, send }: { id: string; placeholder: string; send: (text: string) => Promise<boolean> }) {
  const offline = useStore((s) => s.offline);
  const [text, setText] = useState(drafts[id] ?? '');
  const [busy, setBusy] = useState(false);
  const edit = (t: string) => { setText(t); drafts[id] = t; };
  const submit = async () => {
    if (!text.trim() || busy || offline) return;
    setBusy(true);
    const ok = await send(text.trim());
    setBusy(false);
    if (ok) edit('');
  };
  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
      <InputGroup>
        <InputGroupTextarea value={text} rows={1} placeholder={placeholder} aria-label={placeholder} className="max-h-40 min-h-10 md:text-[13px]"
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
            if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
          }} />
        <InputGroupAddon align="block-end">
          <Kbd>{sendKey}</Kbd>
          <InputGroupButton variant="default" size="icon-xs" className="ml-auto rounded-full" aria-label="Send" disabled={!text.trim() || busy || offline} onClick={() => void submit()}>
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
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
  const end = useFollow(newest(entries));
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
        {!entries.length ? <p className="px-4 py-3 text-muted-foreground">Nothing about this file yet</p> : (
          <ol className="flex flex-col gap-4 px-4 py-3">{entries.map((e) => <li key={e.id}><Entry e={e} path={path} /></li>)}</ol>
        )}
        <div ref={end} />
      </ScrollArea>
      <Composer key={path} id={path} placeholder="Reply in thread"
        send={(text) => sendMessage({ text, paths: [path], ...(entries.length ? { re: entries.at(-1)!.id } : {}) })} />
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
  const end = useFollow(newest(entries));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className={cn('min-h-0 flex-1', BLOCK)}>
        {!items.length ? <p className="px-4 py-3 text-muted-foreground">No history yet</p> : (
          <ol className="flex flex-col gap-4 px-4 py-3">
            {items.map((it) => ('path' in it
              ? <li key={`t:${it.path}`}><ThreadCard path={it.path} entries={it.entries} onOpen={() => onOpen(it.path)} /></li>
              : <li key={it.e.id}><Entry e={it.e} /></li>))}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
      <Composer id="" placeholder={`Message ${n.agent}`} send={(text) => sendMessage({ text })} />
    </div>
  );
}
