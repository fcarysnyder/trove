// The Agent pane's History, as a chat: the agent's messages and yours (an avatar, name and time, then the
// markdown), with what happened between them as compact rows: batches sent (each opens to its comments),
// files released (the agent's note under it, as its message), questions, attach and detach, other events-log
// lines. Replies sit under the entry they answer, one level deep, and a thread with a new reply moves to the
// bottom, above the one composer; Reply on an entry points the composer at it.
import type { Activity, Batch } from '@trove/core/types';
import { marked } from '@trove/core/marked';
import { ArrowUp, ChevronRight, FileCheck, GitPullRequest, Info, MessageCircleQuestion, MessageSquare, Plug, Reply, Send, Unplug, X, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { load, save } from '@/lib/storage';
import { mod, nameOf, plural } from '@/lib/text';
import { cn } from '@/lib/utils';
import { reveal, sendMessage } from './actions';
import { useNames, useStore } from './store';

const pathsOf = (e: Activity) => e.paths ?? (e.kind === 'release' ? [e.text] : []);
/** What the agent or the user said in an entry: a message, a release's note, a question or reply. */
const said = (e: Activity) => e.body ?? (e.kind === 'question' || e.kind === 'reply' ? e.text : null);

interface Thread { root: Activity; replies: Activity[] }
/** Each reply under the entry it answers (a reply to a reply joins the same thread), threads in order of their newest entry. */
function threads(entries: Activity[]): Thread[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const rootOf = (e: Activity) => {
    const seen = new Set<Activity>();
    while (e.re && byId.has(e.re) && !seen.has(e)) { seen.add(e); e = byId.get(e.re)!; }
    return e;
  };
  const out = new Map<string, Thread>();
  for (const e of entries) {
    const root = rootOf(e);
    const t = out.get(root.id) ?? { root, replies: [] };
    if (root !== e) t.replies.push(e);
    out.delete(root.id);
    out.set(root.id, t);
  }
  return [...out.values()];
}

/** History's threads, and with a path only those about that file. */
const activityFor = (entries: Activity[], path?: string) =>
  threads(entries).filter((t) => !path || [t.root, ...t.replies].some((e) => pathsOf(e).includes(path)));

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

// The one place History links a path; a right-click menu can attach here.
const file = (p: string) => (
  <button key={p} title={p} className="text-foreground outline-none hover:underline focus-visible:underline" onClick={() => void reveal(p)}>{nameOf(p)}</button>
);
const files = (ps: string[]) => ps.flatMap((p, i) => [i ? ', ' : '', file(p)]);

const when = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
};
const Time = ({ at }: { at: string }) => (
  <time dateTime={at} title={new Date(at).toLocaleString()} className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{when(at)}</time>
);

/** Markdown as the document view renders it (the page's CSP keeps scripts out); links open outside the page. */
function Markdown({ text }: { text: string }) {
  const html = useMemo(() => (marked.parse(text, undefined) as string).replaceAll('<a ', '<a target="_blank" rel="noreferrer" '), [text]);
  return <div className="msg" dangerouslySetInnerHTML={{ __html: html }} />;
}

const ReplyButton = ({ onClick }: { onClick: () => void }) => (
  <Button variant="ghost" size="xs" onClick={onClick}
    className="ml-auto text-muted-foreground opacity-0 group-focus-within/entry:opacity-100 group-hover/entry:opacity-100"><Reply />Reply</Button>
);

/** A message: avatar, name and time on one line, then the markdown; the user's sits in a muted bubble. */
function Message({ e, onReply }: { e: Activity; onReply: () => void }) {
  const n = useNames();
  const reviewer = useStore((s) => s.reviewer);
  const agent = e.from !== 'user';
  return (
    <div className="group/entry">
      <div className="flex min-h-6 items-center gap-2">
        <Avatar className="size-6">
          <AvatarFallback className={cn('text-[11px] font-semibold', agent ? 'bg-agent text-white' : 'bg-foreground text-background')}>
            {(agent ? n.Agent : reviewer || 'You').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-[13px] font-semibold text-foreground">{agent ? n.Agent : 'You'}</span>
        <Time at={e.at} />
        {e.kind === 'message' && !!e.paths?.length && <span className="min-w-0 truncate text-xs text-muted-foreground">{files(e.paths)}</span>}
        <ReplyButton onClick={onReply} />
      </div>
      <div className={cn('mt-1 ml-8', !agent && 'w-fit max-w-[calc(100%-2rem)] rounded-lg bg-muted px-3 py-2')}><Markdown text={said(e) ?? ''} /></div>
    </div>
  );
}

/** Something that happened, as one compact row: an icon, what, when. */
function Row({ icon: Icon, at, onReply, children }: { icon: LucideIcon; at: string; onReply?: () => void; children: ReactNode }) {
  return (
    <div className="group/entry flex items-start gap-2 text-[13px]">
      <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"><Icon className="size-3.5" aria-hidden /></span>
      <span className="min-w-0 py-0.5 text-body [overflow-wrap:anywhere]">{children} <Time at={at} /></span>
      {onReply && <ReplyButton onClick={onReply} />}
    </div>
  );
}

/** A thread's first entry: a message, or a row (a batch opens to its comments). */
function Root({ e, reply }: { e: Activity; reply: (e: Activity) => () => void }) {
  const n = useNames();
  if (e.kind === 'message' || e.kind === 'question' || e.kind === 'reply') return <Message e={e} onReply={reply(e)} />;
  if (e.kind === 'batch') {
    return (
      <Collapsible>
        <Row icon={Send} at={e.at} onReply={reply(e)}>
          Sent{' '}
          <CollapsibleTrigger className="group/trigger inline-flex items-center gap-0.5 text-foreground outline-none hover:underline focus-visible:underline">
            {plural(e.comments ?? 0, 'comment')}<ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-90" aria-hidden />
          </CollapsibleTrigger>
          {' '}on {files(e.paths ?? [])}
        </Row>
        <CollapsibleContent><BatchComments id={e.id} /></CollapsibleContent>
      </Collapsible>
    );
  }
  // A release with the agent's note takes Reply on the note, which shows as its message below.
  if (e.kind === 'release') return <Row icon={FileCheck} at={e.at} onReply={e.body ? undefined : reply(e)}>Released {file(e.text)}</Row>;
  if (e.kind === 'attach' || e.kind === 'detach') return <Row icon={e.kind === 'attach' ? Plug : Unplug} at={e.at}>{e.kind === 'attach' ? 'Attached' : 'Detached'} {e.text}</Row>;
  // Create PR's line on the events log (`pr <id>: …`) reads as the request it is.
  if (/^pr \w+:/.test(e.text)) return <Row icon={GitPullRequest} at={e.at}>Asked {n.agent} to open a pull request</Row>;
  return <Row icon={Info} at={e.at}>{e.text}</Row>;
}

/** A send's comments as they went: each quote and note. */
function BatchComments({ id }: { id: string }) {
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  useEffect(() => { void api<Batch>(`batch?id=${encodeURIComponent(id)}`).then(setBatch, () => setBatch(null)); }, [id]);
  if (batch === undefined) return null;
  if (!batch) return <p className="mt-1 ml-8 text-xs text-muted-foreground">This batch is no longer in the batches log</p>;
  const many = new Set(batch.items.map((c) => c.path)).size > 1;
  return (
    <ol className="mt-1.5 ml-8 flex flex-col gap-2">
      {batch.items.map((c, k) => {
        const Kind = c.kind === 'explain' ? MessageCircleQuestion : MessageSquare;
        return (
          <li key={k} className="text-[13px]">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Kind className="size-3.5 shrink-0" aria-hidden />{c.kind === 'explain' ? 'Explain' : 'Comment'}
              {many && <span className="min-w-0 truncate">· {file(c.path)}</span>}
            </div>
            <div className="my-1 line-clamp-2 border-l-2 pl-2 text-muted-foreground">{c.anchor.quote}</div>
            <div className="whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{c.note}</div>
          </li>
        );
      })}
    </ol>
  );
}

const keys = mod === 'Cmd' ? '⌘↵' : 'Ctrl ↵';
const draft = { text: '' }; // the composer's text, kept while the Changes tab shows

export function History({ path }: { path?: string }) {
  const entries = useStore((s) => s.activity);
  const offline = useStore((s) => s.offline);
  const list = activityFor(entries, path);
  const n = useNames();
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ id: string; label: string; at: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Follow new entries while scrolled to the bottom; scrolled up, stay put.
  const end = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const viewport = () => end.current?.closest<HTMLElement>('[data-slot=scroll-area-viewport]');
  useEffect(() => {
    const vp = viewport();
    if (!vp) return;
    const onScroll = () => { stuck.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 24; };
    vp.addEventListener('scroll', onScroll, { passive: true });
    // The composer growing (a reply chip, more lines) shortens the list: keep the bottom in view.
    const resized = new ResizeObserver(() => { if (stuck.current) vp.scrollTop = vp.scrollHeight; });
    resized.observe(vp);
    return () => { vp.removeEventListener('scroll', onScroll); resized.disconnect(); };
  }, []);
  const newest = entries.at(-1);
  useLayoutEffect(() => {
    const vp = viewport();
    if (vp && stuck.current) vp.scrollTop = vp.scrollHeight;
  }, [newest?.id, newest?.body, path]);

  const reply = (e: Activity) => () => {
    const label = e.from === 'agent' ? n.Agent : e.from === 'user' ? 'yourself' : e.kind === 'batch' ? 'your comments' : nameOf(e.text);
    setTarget({ id: e.id, label, at: e.at });
    input.current?.focus();
  };
  const edit = (t: string) => { setText(t); draft.text = t; };
  const submit = async () => {
    if (!text.trim() || busy || offline) return;
    setBusy(true);
    stuck.current = true; // a reply's thread moves to the bottom: follow it
    const ok = await sendMessage({ text: text.trim(), ...(target ? { re: target.id } : path ? { paths: [path] } : {}) });
    setBusy(false);
    if (ok) { edit(''); setTarget(null); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {!list.length ? <p className="px-4 py-3 text-muted-foreground">No history yet</p> : (
          <ol className="flex flex-col gap-4 px-4 py-3">
            {list.map(({ root, replies }) => {
              const note = root.kind === 'release' && root.body ? [root] : [];
              return (
                <li key={root.id}>
                  <Root e={root} reply={reply} />
                  {note.length + replies.length > 0 && (
                    <ol className="mt-2 ml-3 flex flex-col gap-3 border-l pl-4">
                      {[...note, ...replies].map((r) => (
                        <li key={r.id}>{said(r) != null ? <Message e={r} onReply={reply(r)} /> : <Root e={r} reply={reply} />}</li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
      <div className="shrink-0 px-3 pt-1 pb-3">
        <InputGroup>
          {target && (
            <InputGroupAddon align="block-start">
              <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs font-normal text-foreground">
                <span className="truncate">Replying to {target.label} · {when(target.at)}</span>
                <InputGroupButton size="icon-xs" aria-label="Stop replying" onClick={() => { setTarget(null); input.current?.focus(); }}><X /></InputGroupButton>
              </span>
            </InputGroupAddon>
          )}
          <InputGroupTextarea ref={input} value={text} rows={1} placeholder={`Message ${n.agent}`} aria-label={`Message ${n.agent}`}
            className="max-h-40 min-h-10 md:text-[13px]"
            onChange={(e) => edit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
              if (e.key === 'Escape') { e.preventDefault(); if (target) setTarget(null); else e.currentTarget.blur(); }
            }} />
          <InputGroupAddon align="block-end">
            <Kbd>{keys}</Kbd>
            <InputGroupButton variant="default" size="icon-xs" className="ml-auto rounded-full" aria-label="Send" disabled={!text.trim() || busy || offline} onClick={() => void submit()}>
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}
