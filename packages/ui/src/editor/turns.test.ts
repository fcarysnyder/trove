import type { Activity } from '@trove/core/types';
import { describe, expect, it } from 'vitest';
import { firstLine, turnsOf, type Turn } from './turns';

let n = 0;
const e = (kind: Activity['kind'], text = '', more: Partial<Activity> = {}): Activity => ({ id: `e${++n}`, at: `2026-11-23T12:00:${String(n % 60).padStart(2, '0')}.000Z`, kind, text, ...more });
const turns = (...list: Activity[]) => turnsOf(list).filter((x): x is Turn => x.type === 'turn');

describe('turnsOf', () => {
  it('groups a prompt, its steps and its last message into one turn', () => {
    const [t, ...rest] = turns(e('prompt', 'Shorten it'), e('step', 'a.md', { tool: 'Read' }), e('step', 'a.md', { tool: 'Edit', added: 2, removed: 5 }), e('end', '', { from: 'agent', body: 'Done.' }));
    expect(rest).toEqual([]);
    expect([t!.title, t!.state, t!.result, t!.steps.length, t!.paths]).toEqual(['Shorten it', 'done', 'Done.', 2, ['a.md']]);
  });
  it('leaves the attach prompt and its setup steps out', () => {
    expect(turns(e('prompt', 'Start the markdown-editor skill attached to the Trove server'), e('step', 'x', { tool: 'Bash' }), e('end', '', { from: 'agent', body: 'Attached' }))).toEqual([]);
  });
  it('queues a batch sent mid-turn until the agent next steps', () => {
    const list = [e('prompt', 'First'), e('step', 'a.md', { tool: 'Read' }), e('batch', 'b', { comments: 2, paths: ['b.md'] })];
    expect(turns(...list).map((t) => t.state)).toEqual(['running', 'queued']);
    list.push(e('end', '', { from: 'agent', body: 'One' }));
    expect(turns(...list).map((t) => t.state)).toEqual(['done', 'queued']);
    list.push(e('step', 'b.md', { tool: 'Edit' }), e('release', 'b.md', { paths: ['b.md'] }), e('end', '', { from: 'agent', body: 'Two' }));
    const [, b] = turns(...list);
    expect([b!.state, b!.result, b!.steps.map((s) => s.tool)]).toEqual(['done', 'Two', ['Edit', 'Released']]);
  });
  it('finishes a batch whose file came back without any reported step (Codex)', () => {
    const [t] = turns(e('batch', 'b', { comments: 1, paths: ['a.md'] }), e('release', 'a.md', { paths: ['a.md'], body: 'Fixed.' }));
    expect([t!.state, t!.result]).toEqual(['done', 'Fixed.']);
  });
  it('closes the open turn on detach and folds repeated attach lines', () => {
    const out = turnsOf([e('attach', 'Claude'), e('attach', 'Claude'), e('prompt', 'Go'), e('detach', 'Claude')]);
    expect(out.map((x) => x.type)).toEqual(['divider', 'turn', 'divider']);
    expect((out[1] as Turn).state).toBe('done');
  });
});

it('names each row by what started it', () => {
  const list = turns(e('prompt', 'Shorten it'), e('end', '', { from: 'agent', body: 'Done.' }),
    e('prompt', 'docs/a.md:\n> a line\n\nmake this shorter'), e('end', ''),
    e('batch', 'b', { comments: 2, paths: ['docs/a.md'] }), e('release', 'docs/a.md', { paths: ['docs/a.md'] }),
    e('batch', 'c', { comments: 1, explains: 1, paths: ['b.md'] }), e('release', 'b.md', { paths: ['b.md'] }),
    e('edit', 'docs/a.md'), e('edit', 'docs/a.md'));
  expect(list.map((t) => [t.source, t.title])).toEqual([['chat', 'Shorten it'], ['quote', 'make this shorter'], ['comment', '2 comments on a.md'], ['explain', 'Explain in b.md'], ['edit', 'Edited a.md']]);
});

it('firstLine takes the first sentence without markdown', () => {
  expect(firstLine('**Cut** the intro. Kept the rest.\n\nMore')).toBe('Cut the intro.');
});
