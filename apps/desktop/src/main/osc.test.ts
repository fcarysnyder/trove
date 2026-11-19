import { expect, test } from 'vitest';
import { osc9, osc9Kind } from './osc';

test('osc9 finds notifications, ended by BEL or ST, and passes over progress and other output', () => {
  expect(osc9('a\x1b]9;Approval requested: ls\x07b\x1b]9;Agent turn complete\x1b\\c\x1b]9;4;1;50\x07\x1b]0;title\x07')).toEqual({
    texts: ['Approval requested: ls', 'Agent turn complete'], carry: '' });
});

test('osc9 carries a sequence a chunk cut short into the next', () => {
  let r = osc9('out\x1b]9;Codex wants');
  expect(r).toEqual({ texts: [], carry: '\x1b]9;Codex wants' });
  r = osc9(' to edit a.md\x1b', r.carry);
  expect(r.texts).toEqual([]);
  expect(osc9('\\more', r.carry)).toEqual({ texts: ['Codex wants to edit a.md'], carry: '' });
  for (const cut of ['\x1b', '\x1b]', '\x1b]9']) expect(osc9(`done${cut}`).carry).toBe(cut);
  expect(osc9(';hi\x07', osc9('x\x1b]9').carry).texts).toEqual(['hi']);
  expect(osc9('\x1b[0m').carry).toBe('');
});

test('osc9Kind: an approval is a permission prompt, anything else a finished turn', () => {
  expect(['Approval requested: rm -rf build', 'Codex wants to edit 3 files', 'Claude needs your permission to use Bash', 'Fixed the intro.'].map(osc9Kind))
    .toEqual(['permission', 'permission', 'permission', 'idle']);
});
