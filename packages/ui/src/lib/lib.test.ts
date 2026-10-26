import { DEFAULT_SETTINGS, type FileRow } from '@trove/core/types';
import { describe, expect, it } from 'vitest';
import { diffSettings, parseExclude } from './settings';
import { countKeys, FILTERS, isPendingOnly, keyOf, markRange, matches, normalizeOff, passes, PENDING_OFF, toggleOff } from './filter';
import { inFolders, names, PROGRESS, status, stepFrom } from './status';
import { resolveTheme } from './theme';

const row = (o: Partial<FileRow>): FileRow => ({ path: 'a.md', kind: 'markdown', untracked: false, staged: false, state: 'queue', updated: false, edited: false, drafts: 0, ...o });

describe('status', () => {
  const claude = names('claude');
  it('maps each state to its icon and label, first match wins', () => {
    expect(status(row({ state: 'working', drafts: 2 }), claude)).toMatchObject({ icon: 'loader-circle', label: 'Claude is working' });
    expect(status(row({ state: 'accepted', updated: true }), claude)).toMatchObject({ icon: 'circle-check', label: 'Accepted (staged)', tone: 'accepted' });
    expect(status(row({ updated: true, edited: true }), claude)).toMatchObject({ icon: 'sparkles', label: 'Updated by Claude' });
    expect(status(row({ edited: true, drafts: 1 }), claude)).toMatchObject({ icon: 'file-pen', label: 'Edited' });
    expect(status(row({ drafts: 1 }), claude)).toMatchObject({ icon: 'message-square', label: 'Has comments', tone: 'drafts' });
    expect(status(row({}), claude)).toMatchObject({ icon: 'circle', label: 'Pending', tone: '' });
    expect(status(row({ untracked: true }), claude)).toMatchObject({ icon: 'file-plus', label: 'Newly added' });
    expect(status(row({ state: 'rejected', untracked: true }), claude)).toMatchObject({ icon: 'circle-x', label: 'Rejected', tone: 'rejected' });
    expect(status(row({ state: 'skipped', updated: true, drafts: 1 }), claude)).toMatchObject({ icon: 'circle-dashed', label: 'Skipped', tone: 'skipped' });
  });
  it('orders the pill with skipped before pending and rejected last', () => {
    expect(PROGRESS).toEqual(['accepted', 'updated', 'edited', 'drafts', 'working', 'skipped', 'pending', 'rejected']);
  });
  it('names another agent generically', () => {
    expect(status(row({ state: 'working' }), names('other')).label).toBe('The agent is working');
    expect(status(row({ updated: true }), names('other')).label).toBe('Updated by the agent');
  });
});

describe('stepping', () => {
  const files = [
    row({ path: 'a.md', state: 'accepted' }),
    row({ path: 'b.md', state: 'skipped' }),
    row({ path: 'c.md', state: 'rejected' }),
    row({ path: 'd.md' }),
    row({ path: 'e.md', state: 'accepted', committed: true }),
  ];
  const all = () => true;
  const pendingOnly = (f: FileRow) => passes(f, PENDING_OFF, '');
  it('keeps skipped files in the folders unless Pending only, and files rejected and committed ones apart', () => {
    expect(files.filter((f) => inFolders(f)).map((f) => f.path)).toEqual(['a.md', 'b.md', 'd.md']);
    expect(files.filter((f) => inFolders(f) && pendingOnly(f)).map((f) => f.path)).toEqual(['d.md']);
  });
  it('passes over skipped and rejected files, from any file', () => {
    expect(stepFrom(files, 'a.md', 1, all)?.path).toBe('d.md');
    expect(stepFrom(files, 'd.md', -1, all)?.path).toBe('a.md');
    expect(stepFrom(files, 'c.md', 1, all)?.path).toBe('d.md');
    expect(stepFrom(files, 'd.md', 1, all)).toBeUndefined();
    expect(stepFrom(files, 'd.md', -1, pendingOnly)).toBeUndefined();
  });
  it('steps over the searched list only, from a file the search hides', () => {
    const list = [row({ path: 'x/one.md' }), row({ path: 'y/two.md' }), row({ path: 'x/three.md' })];
    const inX = (f: FileRow) => passes(f, [], 'x/');
    expect(stepFrom(list, 'x/one.md', 1, inX)?.path).toBe('x/three.md');
    expect(stepFrom(list, 'y/two.md', -1, inX)?.path).toBe('x/one.md');
  });
});

describe('search and filters', () => {
  it('matches the whole path, case-insensitively', () => {
    expect(matches('docs/Guide/Intro.md', 'guide/in')).toBe(true);
    expect(matches('docs/intro.md', 'INTRO')).toBe(true);
    expect(matches('docs/intro.md', 'outro')).toBe(false);
    expect(matches('docs/intro.md', '')).toBe(true);
  });
  it('marks the hit in the name, preferring it over a folder hit, clipped at the slash', () => {
    expect(markRange('docs/readme.md', 'READ')).toEqual([0, 4]);
    expect(markRange('read/readme.md', 'read')).toEqual([0, 4]);
    expect(markRange('docs/guide.md', 'docs')).toBeNull();
    expect(markRange('docs/guide.md', 's/gu')).toEqual([0, 2]);
    expect(markRange('a.md', '')).toBeNull();
    expect(markRange('a.md', 'zz')).toBeNull();
  });
  it('gives each file exactly one filter, committed first', () => {
    expect(keyOf(row({ state: 'accepted', committed: true }))).toBe('committed');
    expect(keyOf(row({ updated: true, drafts: 2 }))).toBe('updated');
    expect(FILTERS).toEqual([...PROGRESS, 'committed']);
    expect(countKeys([row({}), row({ drafts: 1 }), row({ state: 'accepted', committed: true })])).toMatchObject({ pending: 1, drafts: 1, committed: 1, accepted: 0 });
  });
  it('hides unchecked states and keeps the off list in order', () => {
    expect(passes(row({ state: 'skipped' }), ['skipped'], '')).toBe(false);
    expect(passes(row({ state: 'skipped' }), ['accepted'], '')).toBe(true);
    expect(toggleOff(['skipped'], 'accepted', false)).toEqual(['accepted', 'skipped']);
    expect(toggleOff(['accepted', 'skipped'], 'accepted', true)).toEqual(['skipped']);
    expect(normalizeOff(['committed', 'bogus', 'pending'])).toEqual(['pending', 'committed']);
    expect(normalizeOff('nope')).toEqual([]);
  });
  it('reads Pending only exactly when the decided states are off', () => {
    expect(isPendingOnly(PENDING_OFF)).toBe(true);
    expect(isPendingOnly(normalizeOff([...PENDING_OFF].reverse()))).toBe(true);
    expect(isPendingOnly(['accepted', 'skipped', 'rejected'])).toBe(false);
    expect(isPendingOnly([...PENDING_OFF, 'pending'])).toBe(false);
    expect(isPendingOnly([])).toBe(false);
    for (const k of ['pending', 'updated', 'edited', 'drafts', 'working'] as const) expect(PENDING_OFF).not.toContain(k);
  });
});

describe('resolveTheme', () => {
  it('follows the system only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('diffSettings', () => {
  it('is empty when nothing changed', () => {
    expect(diffSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toEqual({ patch: {}, changes: 0 });
  });
  it('posts only what changed and counts each type', () => {
    const draft = { ...DEFAULT_SETTINGS, theme: 'dark' as const, types: { mdx: true, txt: true }, exclude: ['drafts/**'] };
    const { patch, changes } = diffSettings(DEFAULT_SETTINGS, draft);
    expect(patch).toEqual({ theme: 'dark', types: { mdx: true, txt: true }, exclude: ['drafts/**'] });
    expect(changes).toBe(4);
  });
  it('treats a type set to its default as unchanged', () => {
    expect(diffSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, types: { md: true } }).changes).toBe(0);
  });
  it('parses exclude globs one per line', () => {
    expect(parseExclude(' a/**\n\n b.md \n')).toEqual(['a/**', 'b.md']);
  });
});
