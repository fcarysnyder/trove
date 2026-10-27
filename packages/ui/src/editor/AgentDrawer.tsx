// The agent drawer: who is attached and since when, then what went back and forth, oldest first.
import type { Activity } from '@trove/core/types';
import { CircleCheck, Dot, MessageCircleQuestion, MessageSquareReply, PanelBottomClose, Plug, Send, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ago, nameOf, plural } from '@/lib/text';
import { cn } from '@/lib/utils';
import { loadActivity, reveal, togglePanel } from './actions';
import { IconButton } from './bits';
import { useNames, useStore } from './store';

const KIND: Record<Activity['kind'], [typeof Send, string]> = {
  batch: [Send, 'Sent'], release: [CircleCheck, 'Released'], question: [MessageCircleQuestion, 'Asked'], reply: [MessageSquareReply, 'Replied'],
  attach: [Plug, 'Attached'], detach: [Unplug, 'Detached'], event: [Dot, ''],
};

export function AgentDrawer() {
  const agent = useStore((s) => s.source?.agentInfo);
  const entries = useStore((s) => s.activity);
  const hidden = useStore((s) => s.hidden.agent);
  const n = useNames();
  const end = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  useEffect(() => { if (!hidden) void loadActivity(); }, [hidden]);
  useEffect(() => { const id = setInterval(() => tick((t) => t + 1), 30_000); return () => clearInterval(id); }, []); // keeps "attached … ago" current
  useEffect(() => { if (!hidden) end.current?.scrollIntoView({ block: 'end' }); }, [entries.length, hidden]);
  const file = (path: string) => (
    <button key={path} title={path} className="text-foreground outline-none hover:underline focus-visible:underline" onClick={() => void reveal(path)}>{nameOf(path)}</button>
  );
  return (
    <section aria-label="Agent" className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <span className={cn('size-2 rounded-full', agent?.connected ? 'bg-agent' : 'border border-muted-foreground')} aria-hidden />
        <span className="font-semibold text-foreground">{agent?.at ? n.Agent : 'No agent connected'}</span>
        {agent?.at && <span className="flex-1 text-xs text-muted-foreground">{agent.connected ? 'connected' : 'disconnected'} · attached {ago(agent.at)}</span>}
        <IconButton side="top" label="Hide agent" tip="Hide agent (A)" className="ml-auto" onClick={() => togglePanel('agent', true)}><PanelBottomClose /></IconButton>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {!entries.length && <p className="px-4 py-3 text-muted-foreground">No activity</p>}
        <ol className="py-1">
          {entries.map((e, k) => {
            const [Icon, verb] = KIND[e.kind] ?? KIND.event;
            return (
              <li key={k} className="flex items-baseline gap-3 px-4 py-0.5 text-[13px]">
                <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="min-w-11 shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
                <Icon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
                <span className="min-w-0 text-body [overflow-wrap:anywhere]">
                  {verb && <span className="text-muted-foreground">{verb} </span>}
                  {e.kind === 'batch' ? <>{plural(e.comments ?? 0, 'comment')} on {e.paths?.flatMap((p, i) => [i ? ', ' : '', file(p)])}</>
                    : e.kind === 'release' ? file(e.text) : e.text}
                </span>
              </li>
            );
          })}
        </ol>
        <div ref={end} />
      </ScrollArea>
    </section>
  );
}
