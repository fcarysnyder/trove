import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { expect, test } from 'vitest';

const bundle = new URL('../dist/trove.mjs', import.meta.url).pathname;
const firstLine = (args: string[]) => new Promise<{ line: string; kill: () => void }>((ok, fail) => {
  const child = spawn(process.execPath, [bundle, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.on('error', fail);
  createInterface({ input: child.stdout }).once('line', (line) => ok({ line, kill: () => child.kill() }));
});

test('the bundle builds, serves a repository and prints the done command', async () => {
  execFileSync(process.execPath, [new URL('../build.mjs', import.meta.url).pathname]);
  const root = mkdtempSync(join(tmpdir(), 'trove-cli-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, 'a.md'), '# A\n');
  writeFileSync(join(root, 'b.md'), '# B\n');
  const { line, kill } = await firstLine(['serve', '--root', root, '--port', '0']);
  let busy;
  try {
    const port = Number(line.match(/127\.0\.0\.1:(\d+);/)?.[1]);
    expect(line).toBe(`reviewing 2 files at http://127.0.0.1:${port}; notices in ${line.match(/notices in (.*?); /)?.[1]}; after each file run: node ${bundle} done <file> --port ${port}`);
    const files = await (await fetch(`http://127.0.0.1:${port}/api/files`)).json();
    expect(files.files.map((f: any) => f.path)).toEqual(['a.md', 'b.md']);
    expect((await (await fetch(`http://127.0.0.1:${port}/api/source`)).json()).kind).toBe('git');
    busy = await firstLine(['serve', '--root', root, '--port', String(port)]);
    expect(busy.line).toBe(`port ${port} is busy: another session is probably serving. Stop it, or pass --port.`);
  } finally {
    kill();
    busy?.kill();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

test('serve refuses a folder that is not a git repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'trove-plain-'));
  try {
    const run = spawnSync(process.execPath, [bundle, 'serve', '--root', root, '--port', '0'], { encoding: 'utf8' });
    expect([run.stdout.trim(), run.status]).toEqual([`not a git repository: ${root}`, 1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
