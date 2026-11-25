// Activity's model: the server's append-only log folded into the agent's turns. A turn starts with a prompt typed in
// the terminal or a batch of comments, collects each tool call, and ends with the agent's last message. A batch sent
// while the agent is busy waits as queued until the agent's next step.
import type { Activity } from '@trove/core/types';

/** What started a row: typed in the terminal, Add to agent, a Comment or Explain batch, the user's own edit, or the agent alone. */
export type Source = 'chat' | 'quote' | 'comment' | 'explain' | 'edit' | 'agent';
export interface Step { id: string; tool: string; text: string; at: string; added?: number; removed?: number }
export interface Turn {
  type: 'turn'; id: string; title: string; at: string; endedAt?: string;
  source: Source; file?: string; // file: the doc an `edit` row opens
  state: 'queued' | 'running' | 'done';
  result?: string; steps: Step[]; paths: string[]; batch?: Activity;
}
export interface Divider { type: 'divider'; id: string; at: string; text: string }
export type FeedItem = Turn | Divider;

/** The prompt Trove starts its agent with: setup, not a turn of work. */
const ATTACH = /^Start the markdown-editor skill attached/;
/** What Add to agent pastes: `path:`, the quoted lines, then whatever the user typed. */
const QUOTED = /^([^\n]+):\n((?:> .*(?:\n|$))+)\s*([\s\S]*)$/;
const base = (p: string) => p.split('/').at(-1) ?? p;
const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

export function turnsOf(entries: Activity[]): FeedItem[] {
  const out: FeedItem[] = [];
  const queued: Turn[] = [];
  let open: Turn | null = null;
  let setup = false; // inside the attach prompt's turn
  const make = (e: Activity, title: string, state: Turn['state'], source: Source = 'agent') => {
    const t: Turn = { type: 'turn', id: e.id, title, at: e.at, state, source, steps: [], paths: [] };
    out.push(t);
    return t;
  };
  const close = (t: Turn, at: string) => { t.state = 'done'; t.endedAt = at; };
  const touch = (t: Turn, p: string) => { if (!t.paths.includes(p)) t.paths.push(p); };
  const turns = () => out.filter((x): x is Turn => x.type === 'turn');
  const divider = (e: Activity, text: string) => {
    const d: Divider = { type: 'divider', id: e.id, at: e.at, text };
    if (out.at(-1)?.type === 'divider') out[out.length - 1] = d; else out.push(d);
  };

  for (const e of entries) {
    if (e.kind === 'prompt') {
      if (open) close(open, e.at);
      setup = ATTACH.test(e.text);
      const q = setup ? null : QUOTED.exec(e.text);
      open = setup ? null : q ? make(e, q[3]!.trim() || `Quote from ${base(q[1]!)}`, 'running', 'quote') : make(e, e.text, 'running', 'chat');
    } else if (e.kind === 'batch') {
      const n = e.comments ?? 0;
      const files = e.paths ?? [];
      const where = files.length === 1 ? base(files[0]!) : `${files.length} files`;
      const explain = n > 0 && e.explains === n;
      const t = make(e, explain ? `Explain in ${where}` : `${n} ${n === 1 ? 'comment' : 'comments'} on ${where}`, 'queued', explain ? 'explain' : 'comment');
      t.batch = e;
      t.paths = [...(e.paths ?? [])];
      queued.push(t);
    } else if (e.kind === 'step') {
      if (setup) continue;
      if (!open) { open = queued.shift() ?? make(e, 'Claude worked', 'running'); open.state = 'running'; }
      open.steps.push({ id: e.id, tool: e.tool ?? 'Tool', text: e.text, at: e.at, added: e.added, removed: e.removed });
      if (e.tool && EDITS.has(e.tool) && e.text) touch(open, e.text);
    } else if (e.kind === 'end') {
      if (setup) { setup = false; continue; }
      if (open) { if (e.body) open.result = e.body; close(open, e.at); open = null; }
    } else if (e.kind === 'release') {
      const q = queued.findIndex((t) => t.paths.includes(e.text));
      const waiting = q >= 0 && !open ? queued.splice(q, 1)[0]! : null;
      const t: Turn = open ?? waiting ?? turns().findLast((x) => x.paths.includes(e.text)) ?? make(e, `Released ${e.text}`, 'done');
      if (waiting) close(waiting, e.at);
      t.steps.push({ id: e.id, tool: 'Released', text: e.text, at: e.at });
      touch(t, e.text);
      if (e.body && !t.result) t.result = e.body;
    } else if (e.kind === 'message' || e.kind === 'question' || e.kind === 'reply') {
      const text = e.body ?? e.text;
      if (e.from === 'user') { // written before turns: a message from the old chat box
        if (open) { close(open, e.at); open = null; }
        make(e, text, 'done', 'chat').endedAt = e.at;
      } else {
        const last = turns().findLast((x) => x.source !== 'edit');
        const t = open ?? (last?.state === 'done' && !last.result ? last : null);
        if (t) t.result = text; else { make(e, firstLine(text), 'done').result = text; }
      }
    } else if (e.kind === 'edit') {
      const last = out.at(-1); // saving the same file again is the same row
      if (last?.type === 'turn' && last.file === e.text) last.at = e.at;
      else { const t = make(e, `Edited ${base(e.text)}`, 'done', 'edit'); t.file = e.text; t.endedAt = e.at; }
    } else if (e.kind === 'detach') {
      if (open) { close(open, e.at); open = null; }
      setup = false;
      divider(e, `${e.text} detached`);
    } else if (e.kind === 'attach') divider(e, `${e.text} attached`);
    else if (e.kind === 'event') divider(e, /^pr \w+:/.test(e.text) ? 'Asked for a pull request' : e.text);
  }
  return out;
}

/** The first sentence of a result, without its markdown: the collapsed turn's one line. */
export const firstLine = (text: string) =>
  (text.split('\n').find((l) => l.trim()) ?? '').replace(/^[#>*\-\s]+/, '').replace(/[*`_]/g, '').split(/(?<=[.!?])\s/)[0]!.trim();
