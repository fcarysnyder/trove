import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  writeFileSync(join(root, 'a.md'), '# A\n');
  writeFileSync(join(root, 'b.md'), '# B\n');
  const { line, kill } = await firstLine(['serve', '--root', root, '--port', '0']);
  let busy;
  try {
    const port = Number(line.match(/127\.0\.0\.1:(\d+);/)?.[1]);
    expect(line).toBe(`reviewing 2 files on main at http://127.0.0.1:${port}; notices in ${line.match(/notices in (.*?); /)?.[1]}; after each file run: node ${bundle} done <file> --port ${port}`);
    const files = await (await fetch(`http://127.0.0.1:${port}/api/files`)).json();
    expect(files.files.map((f: any) => f.path)).toEqual(['a.md', 'b.md']);
    expect((await (await fetch(`http://127.0.0.1:${port}/api/source`)).json()).kind).toBe('git');
    const run = (...a: string[]) => spawnSync(process.execPath, [bundle, ...a, '--port', String(port)], { encoding: 'utf8' });
    expect(run('info').stdout.trim()).toBe(line);
    expect(run('attach', '--agent', 'codex').stdout.trim()).toBe(line);
    expect((await (await fetch(`http://127.0.0.1:${port}/api/source`)).json()).agentInfo).toMatchObject({ id: 'codex', label: 'Codex', connected: true });
    run('detach');
    expect((await (await fetch(`http://127.0.0.1:${port}/api/source`)).json()).agentInfo.connected).toBe(false);
    expect(spawnSync(process.execPath, [bundle, 'info', '--root', root], { encoding: 'utf8' }).stdout.trim()).toBe(line);
    // say and done --note: text of any shape from an argument or stdin, into History.
    const say = spawnSync(process.execPath, [bundle, 'say', '-', '--file', join(root, 'a.md'), '--port', String(port)], { encoding: 'utf8', input: '- two lines,\n"quoted" `code`\n' });
    const id = say.stdout.match(/^message (\w+) is in History\n$/)?.[1];
    expect(id).toBeTruthy();
    expect(run('say', 'Short', 'answer', '--re', id!).status).toBe(0);
    expect(run('done', 'b.md', '--note', '-').stdout.trim()).toBe('b.md was not locked');
    expect(spawnSync(process.execPath, [bundle, 'done', 'b.md', '--note', '-', '--port', String(port)], { encoding: 'utf8', input: 'Tightened it.\n' }).stdout.trim())
      .toBe('b.md was not locked, with your note in History');
    expect(run('say', 'x', '--file', 'nope.md').stdout.trim()).toBe('say failed: not in the review set: nope.md');
    const said = (await (await fetch(`http://127.0.0.1:${port}/api/activity`)).json()).entries.filter((e: any) => e.kind === 'message');
    expect(said.map((e: any) => [e.from, e.body, e.paths, e.re])).toEqual([
      ['agent', '- two lines,\n"quoted" `code`', ['a.md'], undefined], ['agent', 'Short answer', undefined, id], ['agent', 'Tightened it.', ['b.md'], undefined]]);
    // signal, as the plugin's hooks run it: the project from the environment, the hook's JSON on stdin, nothing printed.
    const hook = (kind: string, input: object) => spawnSync(process.execPath, [bundle, 'signal', kind],
      { encoding: 'utf8', input: JSON.stringify(input), cwd: tmpdir(), env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    const waiting = async () => (await (await fetch(`http://127.0.0.1:${port}/api/source`)).json()).agentInfo;
    expect(hook('notification', { notification_type: 'elicitation_dialog', message: 'Pick one' })).toMatchObject({ status: 0, stdout: '', stderr: '' });
    expect(await waiting()).toMatchObject({ waiting: 'question', waitingText: 'Pick one' });
    expect(hook('permission', { tool_name: 'Bash' }).stdout).toBe('');
    expect(await waiting()).toMatchObject({ waiting: 'permission', waitingText: 'Bash' });
    hook('notification', { notification_type: 'auth_success' });
    expect((await waiting()).waiting).toBe('permission');
    hook('idle', {});
    expect((await waiting()).waiting).toBe('idle');
    const again = spawnSync(process.execPath, [bundle, 'serve', '--root', root, '--port', '0'], { encoding: 'utf8' });
    expect(again.stdout.trim()).toBe(`Trove is already serving this repository at http://127.0.0.1:${port} (trove serve).\n`
      + `Attach with: trove attach --port ${port} --agent claude. Pass --force to start another.`);
    busy = await firstLine(['serve', '--root', root, '--port', String(port), '--force']);
    expect(busy.line).toBe(`port ${port} is busy: another session is probably serving. Stop it, or pass --port.`);
  } finally {
    kill();
    busy?.kill();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

test('signal exits 0 and prints nothing when no Trove serves the project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trove-none-'));
  try {
    const run = spawnSync(process.execPath, [bundle, 'signal', 'permission'], { encoding: 'utf8', input: '{"tool_name":"Bash"}', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    expect([run.status, run.stdout, run.stderr]).toEqual([0, '', '']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('attach says so when nothing is serving', () => {
  const run = spawnSync(process.execPath, [bundle, 'attach', '--port', '1', '--agent', 'codex'], { encoding: 'utf8' });
  expect([run.stdout.trim(), run.status]).toEqual(['nothing is serving on port 1: start one with trove serve, or pass the right --port', 1]);
});

test('serve opens a file outside any repository in its folder, and the agent commands find that folder', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'trove-plain-')));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/a.md'), '# A\n');
  const { line, kill } = await firstLine(['serve', '--root', join(root, 'docs/a.md'), '--port', '0']);
  let stateDir = '';
  try {
    const port = Number(line.match(/127\.0\.0\.1:(\d+)\//)?.[1]);
    expect(line).toMatch(new RegExp(`^editing 1 files in docs at http://127\\.0\\.0\\.1:${port}/\\?file=a\\.md; notices in `));
    const source = await (await fetch(`http://127.0.0.1:${port}/api/source`)).json();
    stateDir = source.stateDir;
    expect([source.kind, source.root]).toEqual(['folder', join(root, 'docs')]);
    expect(spawnSync(process.execPath, [bundle, 'info', '--root', join(root, 'docs')], { encoding: 'utf8' }).stdout.trim()).toBe(line.replace('/?file=a.md', ''));
  } finally {
    kill();
    if (stateDir) rmSync(stateDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

test('serving a linked worktree names it after the branch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trove-wt-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(root, 'a.md'), '# A\n');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a');
  git('worktree', 'add', '-q', '-b', 'side', join(root, '.claude/worktrees/side'));
  const { line, kill } = await firstLine(['serve', '--root', join(root, '.claude/worktrees/side'), '--port', '0']);
  try {
    expect(line).toMatch(/^reviewing 0 files on side \(side\) at http:\/\/127\.0\.0\.1:\d+; /);
  } finally {
    kill();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
