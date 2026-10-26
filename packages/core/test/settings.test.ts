import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { enabledTypes, excluded, kindOf, loadSettings, mergeSettings, saveSettings } from '../src/settings.js';
import { DEFAULT_SETTINGS } from '../src/types.js';

test('doc kinds follow the enabled types', () => {
  const s = DEFAULT_SETTINGS;
  expect(enabledTypes(s).map((t) => t.id)).toEqual(['md', 'html']);
  expect(['a.md', 'docs/B.MARKDOWN', 'c.html', 'd.htm', 'e.mdx', 'f.txt', 'md', '.md'].map((p) => kindOf(p, s)))
    .toEqual(['markdown', 'markdown', 'html', 'html', null, null, null, null]);
  const on = mergeSettings(s, { types: { mdx: true, txt: true, html: false } });
  expect(['e.mdx', 'f.txt', 'c.html'].map((p) => kindOf(p, on))).toEqual(['markdown', 'text', null]);
});

test('exclude globs follow git pathspec glob rules', () => {
  const s = { ...DEFAULT_SETTINGS, exclude: ['gen/**', '*.draft.md', '**/tmp/**', 'a?.md'] };
  expect(['gen/x.md', 'gen/a/b.md', 'x.draft.md', 'sub/x.draft.md', 'tmp/x.md', 'a/tmp/x.md', 'ab.md', 'abc.md', 'general.md']
    .map((p) => excluded(p, s))).toEqual([true, true, true, false, true, true, true, false, false]);
});

test('settings merge, validate and round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trove-settings-'));
  try {
    expect(loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
    const s = mergeSettings(DEFAULT_SETTINGS, { theme: 'dark', exclude: [' a/** '], base: 'main' });
    expect([s.theme, s.exclude, s.base, s.scope]).toEqual(['dark', ['a/**'], 'main', 'uncommitted']);
    for (const bad of [{ theme: 'loud' }, { scope: 'all' }, { exclude: 'x' }, { types: { md: 1 } }, { base: '' }, { showNew: 'yes' }, null, []])
      expect(() => mergeSettings(DEFAULT_SETTINGS, bad)).toThrow();
    saveSettings(dir, s);
    expect(loadSettings(dir)).toEqual(s);
    writeFileSync(join(dir, 'settings.json'), '{"theme": "loud", "showNew": false}');
    expect(loadSettings(dir)).toEqual({ ...DEFAULT_SETTINGS, showNew: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
