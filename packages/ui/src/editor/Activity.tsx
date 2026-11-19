// The Agent pane's History: what went back and forth with the agent, as a timeline (a dot per entry on a thin
// line): batches sent (each opens to its comments), files released with the agent's note, its messages,
// questions and replies, yours, attach and detach, other events-log lines. Replies sit under the entry they
// answer, one level deep, and a thread with a new reply moves to the bottom, beside the composer.
import type { Activity, Batch } from '@trove/core/types';
import { marked } from '@trove/core/marked';
import { ArrowUp, ChevronRight, MessageCircleQuestion, MessageSquare, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { load, save } from '@/lib/storage';
import { mod, nameOf, plural } from '@/lib/text';
import { cn } from '@/lib/utils';
import { reveal, sendMessage } from './actions';
import { IconButton } from './bits';
import { useNames, useStore } from './store';

const VERB: Record<Activity['kind'], string> = {
  batch: 'Sent', release: 'Released', question: 'Asked', reply: 'Replied', attach: 'Attached', detach: 'Detached', event: '', message: '',
};

const pathsOf = (e: Activity) => e.paths ?? (e.kind === 'release' ? [e.text] : []);

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
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

/** Markdown as the document view renders it (the page's CSP keeps scripts out); links open outside the page. */
function Markdown({ text }: { text: string }) {
  const html = useMemo(() => (marked.parse(text, undefined) as string).replaceAll('<a ', '<a target="_blank" rel="noreferrer" '), [text]);
  return <div className="msg" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Who wrote it (for messages, notes, questions and replies), when, what it is about, and its Reply. */
function Entry({ e, onReply }: { e: Activity; onReply?: () => void }) {
  const n = useNames();
  const [open, setOpen] = useState(false);
  // Create PR's line on the events log (`pr <id>: …`) reads as the request it is.
  const pr = e.kind === 'event' && /^pr \w+:/.test(e.text);
  const verb = pr ? 'Asked' : VERB[e.kind];
  return (
    <div className="group/entry">
      <div className="flex h-5 items-center gap-1.5 text-xs">
        {e.from && <span className={cn('font-semibold', e.from === 'agent' ? 'text-agent' : 'text-foreground')}>{e.from === 'agent' ? n.Agent : 'You'}</span>}
        <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tabular-nums">{when(e.at)}</time>
        {e.kind === 'message' && !!e.paths?.length && <span className="min-w-0 truncate text-muted-foreground">· {files(e.paths)}</span>}
        {onReply && (
          <Button variant="ghost" size="xs" onClick={onReply}
            className="ml-auto h-5 px-1.5 text-muted-foreground opacity-0 group-focus-within/entry:opacity-100 group-hover/entry:opacity-100">Reply</Button>
        )}
      </div>
      {e.kind !== 'message' && (
        <span className="block text-sm text-foreground [overflow-wrap:anywhere]">
          {verb && <span className="text-muted-foreground">{verb} </span>}
          {e.kind === 'batch' ? (
            <>
              <button aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 outline-none hover:underline focus-visible:underline">
                {plural(e.comments ?? 0, 'comment')}<ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
              </button>
              {' '}on {files(e.paths ?? [])}
            </>
          ) : e.kind === 'release' ? file(e.text) : pr ? `${n.agent} to open a pull request` : e.text}
        </span>
      )}
      {open && <BatchComments id={e.id} />}
      {e.body && (
        <div className={cn('mt-1', e.from === 'user' && 'rounded-md bg-card px-2.5 py-1.5')}><Markdown text={e.body} /></div>
      )}
    </div>
  );
}

/** A send's comments as they went: each quote and note. */
function BatchComments({ id }: { id: string }) {
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  useEffect(() => { void api<Batch>(`batch?id=${encodeURIComponent(id)}`).then(setBatch, () => setBatch(null)); }, [id]);
  if (batch === undefined) return null;
  if (!batch) return <p className="mt-1 text-xs text-muted-foreground">This batch is no longer in the batches log</p>;
  const many = new Set(batch.items.map((c) => c.path)).size > 1;
  return (
    <ol className="mt-1.5 flex flex-col gap-2 border-l pl-3">
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
const bottomDraft = { text: '' }; // the bottom composer's text, kept while the Changes tab shows

/** A message to the agent. Cmd/Ctrl+Enter sends; Escape cancels a reply, or leaves the field. */
function Composer({ placeholder, send, cancel, draft }: { placeholder: string; send: (text: string) => Promise<boolean>; cancel?: () => void; draft?: { text: string } }) {
  const [text, setText] = useState(draft?.text ?? '');
  const [busy, setBusy] = useState(false);
  const offline = useStore((s) => s.offline);
  const edit = (t: string) => { setText(t); if (draft) draft.text = t; };
  const submit = async () => {
    if (!text.trim() || busy || offline) return;
    setBusy(true);
    if (await send(text.trim())) edit('');
    setBusy(false);
  };
  return (
    <div className="flex items-end gap-1">
      <Textarea value={text} placeholder={placeholder} autoFocus={!!cancel} rows={1} aria-label={placeholder}
        className="max-h-40 min-h-8 resize-none px-2 py-1.5 md:text-[13px]"
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
          if (e.key === 'Escape') { e.preventDefault(); if (cancel) cancel(); else e.currentTarget.blur(); }
        }} />
      {cancel && <IconButton label="Cancel" tip="Cancel (Esc)" onClick={cancel}><X /></IconButton>}
      <IconButton label="Send" tip={`Send (${keys})`} variant="default" className="text-primary-foreground" disabled={!text.trim() || busy || offline} onClick={() => void submit()}>
        <ArrowUp />
      </IconButton>
    </div>
  );
}

export function History({ path }: { path?: string }) {
  const entries = useStore((s) => s.activity);
  const list = activityFor(entries, path);
  const n = useNames();
  const [replying, setReplying] = useState<{ thread: string; re: string } | null>(null);
  // Follow new entries while scrolled to the bottom; scrolled up, stay put.
  const end = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const viewport = () => end.current?.closest<HTMLElement>('[data-slot=scroll-area-viewport]');
  useEffect(() => {
    const vp = viewport();
    if (!vp) return;
    const onScroll = () => { stuck.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 24; };
    vp.addEventListener('scroll', onScroll, { passive: true });
    return () => vp.removeEventListener('scroll', onScroll);
  }, []);
  const newest = entries.at(-1);
  useLayoutEffect(() => {
    const vp = viewport();
    if (vp && stuck.current) vp.scrollTop = vp.scrollHeight;
  }, [newest?.id, newest?.body, path]);

  const reply = (root: Activity, re: Activity) => () => setReplying({ thread: root.id, re: re.id });
  const answerable = (e: Activity) => !['attach', 'detach', 'event'].includes(e.kind);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {!list.length ? <p className="px-4 py-3 text-muted-foreground">No history yet</p> : (
          <ol className="px-4 py-3">
            {list.map(({ root, replies }, k) => {
              const last = k === list.length - 1;
              const composing = replying?.thread === root.id ? replying : null;
              return (
                <li key={root.id} className="relative pb-3 pl-5 last:pb-0">
                  {!last && <span aria-hidden className="absolute top-3 bottom-0 left-[3px] w-px bg-foreground/20" />}
                  <span aria-hidden className={cn('absolute top-1.5 left-0 size-2 rounded-full',
                    root.from === 'agent' ? 'bg-agent' : last || root.from === 'user' ? 'bg-foreground' : 'bg-muted-foreground')} />
                  <Entry e={root} onReply={answerable(root) ? reply(root, root) : undefined} />
                  {(replies.length > 0 || !!composing) && (
                    <ol className="mt-2 flex flex-col gap-2 border-l pl-3">
                      {replies.map((r) => <li key={r.id}><Entry e={r} onReply={r.from === 'agent' ? reply(root, r) : undefined} /></li>)}
                      {composing && (
                        <li>
                          <Composer placeholder="Reply" cancel={() => setReplying(null)}
                            send={async (text) => {
                              stuck.current = true; // the thread moves to the bottom: follow it
                              const ok = await sendMessage({ text, re: composing.re });
                              if (ok) setReplying(null);
                              return ok;
                            }} />
                        </li>
                      )}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
      <div className="shrink-0 border-t px-4 py-2">
        <Composer placeholder={`Message ${n.agent}`} draft={bottomDraft}
          send={(text) => { stuck.current = true; return sendMessage({ text, ...(path ? { paths: [path] } : {}) }); }} />
      </div>
    </div>
  );
}
