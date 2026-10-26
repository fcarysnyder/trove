import { DEFAULT_SETTINGS, type FileRow } from '@trove/core/types';
import { describe, expect, it } from 'vitest';
import { diffSettings, parseExclude } from './settings';
import { names, status } from './status';
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
  });
  it('names another agent generically', () => {
    expect(status(row({ state: 'working' }), names('other')).label).toBe('The agent is working');
    expect(status(row({ updated: true }), names('other')).label).toBe('Updated by the agent');
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
