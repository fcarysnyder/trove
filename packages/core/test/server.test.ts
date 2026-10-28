import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { running, serve } from '../src/app.js';

test('a second server on a repository refuses until the first closes; a stale server.json is overwritten', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trove-one-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  const state = join(root, '.git', 'trove', 'server.json');
  const opts = { root, port: 0, uiDir: null, agent: null, log: () => {} };
  try {
    const first = await serve({ ...opts, by: 'desktop' });
    expect(await running(root)).toMatchObject({ port: first.port, pid: process.pid, by: 'desktop' });
    await expect(serve(opts)).rejects.toThrow(`Trove is already serving this repository at http://127.0.0.1:${first.port} (desktop app).\n`
      + `Attach with: trove attach --port ${first.port} --agent claude. Pass --force to start another.`);
    await first.app.close();
    expect(await running(root)).toBe(null);
    const second = await serve(opts);
    await second.app.close();

    writeFileSync(state, JSON.stringify({ port: second.port, pid: 2 ** 22 + 1, startedAt: '', by: 'cli' })); // no such pid
    const third = await serve(opts);
    expect(await running(root)).toMatchObject({ port: third.port, by: 'cli' });
    await third.app.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
