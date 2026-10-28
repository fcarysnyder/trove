// The Agent pane's History: what went back and forth with the agent, oldest first, as a timeline (a dot
// per entry on a thin line, the newest dot in the foreground colour): batches sent, files released, its
// questions and replies, attach and detach, other events-log lines.
import type { Activity } from '@trove/core/types';
import { nameOf, plural } from '@/lib/text';
import { cn } from '@/lib/utils';
import { reveal } from './actions';
import { useNames, useStore } from './store';

const VERB: Record<Activity['kind'], string> = {
  batch: 'Sent', release: 'Released', question: 'Asked', reply: 'Replied', attach: 'Attached', detach: 'Detached', event: '',
};

/** The entries about `path` (the batches it was in, its release), or with no path every entry. */
export const activityFor = (entries: Activity[], path?: string) =>
  path ? entries.filter((e) => (e.kind === 'batch' ? e.paths?.includes(path) : e.kind === 'release' && e.text === path)) : entries;

export function ActivityList({ path }: { path?: string }) {
  const entries = activityFor(useStore((s) => s.activity), path);
  const n = useNames();
  if (!entries.length) return <p className="px-4 py-3 text-muted-foreground">No history yet</p>;
  const file = (p: string) => (
    <button key={p} title={p} className="text-foreground outline-none hover:underline focus-visible:underline" onClick={() => void reveal(p)}>{nameOf(p)}</button>
  );
  return (
    <ol className="px-4 py-3">
      {entries.map((e, k) => {
        // Create PR's line on the events log (`pr <id>: …`) reads as the request it is.
        const pr = e.kind === 'event' && /^pr \w+:/.test(e.text);
        const verb = pr ? 'Asked' : VERB[e.kind] ?? '';
        const last = k === entries.length - 1;
        return (
          <li key={k} className="relative pb-3 pl-5 last:pb-0">
            {!last && <span aria-hidden className="absolute top-3 bottom-0 left-[3px] w-px bg-foreground/20" />}
            <span aria-hidden className={cn('absolute top-1 left-0 size-2 rounded-full', last ? 'bg-foreground' : 'bg-muted-foreground')} />
            <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="block text-[10px] font-semibold text-muted-foreground uppercase tabular-nums">
              {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
            <span className="block text-sm text-foreground [overflow-wrap:anywhere]">
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
