// What went back and forth with the agent, oldest first, as the top of the Changes column's thread:
// batches sent, files released, its questions and replies, attach and detach, other events-log lines.
import type { Activity } from '@trove/core/types';
import { CircleCheck, Dot, GitPullRequest, MessageCircleQuestion, MessageSquareReply, Plug, Send, Unplug } from 'lucide-react';
import { nameOf, plural } from '@/lib/text';
import { reveal } from './actions';
import { useNames, useStore } from './store';

const KIND: Record<Activity['kind'], [typeof Send, string]> = {
  batch: [Send, 'Sent'], release: [CircleCheck, 'Released'], question: [MessageCircleQuestion, 'Asked'], reply: [MessageSquareReply, 'Replied'],
  attach: [Plug, 'Attached'], detach: [Unplug, 'Detached'], event: [Dot, ''],
};

/** The entries about `path` (the batches it was in, its release), or with no path every entry. */
export const activityFor = (entries: Activity[], path?: string) =>
  path ? entries.filter((e) => (e.kind === 'batch' ? e.paths?.includes(path) : e.kind === 'release' && e.text === path)) : entries;

export function ActivityList({ path }: { path?: string }) {
  const entries = activityFor(useStore((s) => s.activity), path);
  const n = useNames();
  if (!entries.length) return null;
  const file = (p: string) => (
    <button key={p} title={p} className="text-foreground outline-none hover:underline focus-visible:underline" onClick={() => void reveal(p)}>{nameOf(p)}</button>
  );
  return (
    <ol aria-label="Activity" className="border-b py-2">
      {entries.map((e, k) => {
        // Create PR's line on the events log (`pr <id>: …`) reads as the request it is.
        const pr = e.kind === 'event' && /^pr \w+:/.test(e.text);
        const [Icon, verb] = pr ? [GitPullRequest, 'Asked'] : KIND[e.kind] ?? KIND.event;
        return (
          <li key={k} className="flex items-baseline gap-2 px-4 py-0.5 text-xs">
            <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
              {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
            <Icon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
            <span className="min-w-0 text-body [overflow-wrap:anywhere]">
              {verb && <span className="text-muted-foreground">{verb} </span>}
              {e.kind === 'batch' ? <>{plural(e.comments ?? 0, 'comment')} on {e.paths?.flatMap((p, i) => [i ? ', ' : '', file(p)])}</>
                : e.kind === 'release' ? file(e.text) : pr ? `${n.agent} to open a pull request` : e.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
