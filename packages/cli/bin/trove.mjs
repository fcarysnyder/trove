#!/usr/bin/env node
// @ts-check
// trove: the CLI. `serve` runs the review server over a git repository; `attach` joins one that
// is already running (the desktop's); `done`, `ask` and `reply` are the agent's side of it;
// `--selftest` checks the engine end to end.
//
//   trove serve [--root <path>] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>] [--force]
//   trove attach [--root <repo> | --port N] [--agent claude|codex|other] | detach [--root <repo> | --port N] | info [--root <repo> | --port N]
//   trove done <file> [--root <repo> | --port N]
//   trove ask "<question>" | reply "<summary>" | ask --clear [--root <repo> | --port N]
// Without --port these find the server running on --root's repository (default: the current directory's).
//   trove --selftest
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { call, running, selftest, serve } from '@trove/core';

const USAGE = 'usage: trove serve [--root <path>] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>] [--force]'
  + ' | attach [--root <repo> | --port N] [--agent claude|codex|other] | detach [--root <repo> | --port N] | info [--root <repo> | --port N]'
  + ' | done <file> [--root <repo> | --port N] | ask "<question>" | reply "<summary>" | ask --clear [--root <repo> | --port N] | --selftest';
const here = dirname(fileURLToPath(import.meta.url));

// How the agent should call this binary back: `trove` when it runs from PATH (an npm bin link),
// else node and the absolute path of the running file (the bundle, or bin/ in the workspace).
const invoked = () => {
  const script = process.argv[1] ?? '';
  if (basename(script) === 'trove') return 'trove';
  const path = realpathSync(script);
  return /[\s'"$`\\]/.test(path) ? `node '${path.replaceAll("'", String.raw`'\''`)}'` : `node ${path}`; // a path with spaces is quoted for the shell
};

// The built UI: a ui/ folder next to the running file (the plugin and npm layouts), else the
// workspace's packages/ui/dist, else none (the API only).
const defaultUi = () => [join(here, 'ui'), resolve(here, '../../ui/dist')].find((d) => existsSync(join(d, 'index.html'))) ?? null;

// The line `serve`, `attach` and `info` print, read from the running server so the three always agree.
// The done command is this binary's own, whoever started the server.
async function firstLine(/** @type {number} */ port) {
  const [source, files, git] = await Promise.all(['/api/source', '/api/files', '/api/git'].map((p) => call(port, 'GET', p)));
  if ([source, files, git].some((r) => r.status !== 200) || !source.body?.eventsLog) throw new Error(`port ${port} is not a Trove server`);
  const queued = files.body.files.filter((/** @type {{staged: boolean}} */ f) => !f.staged).length;
  return `reviewing ${queued} files on ${git.body.branch ?? git.body.head}${git.body.worktree && !git.body.worktree.main ? ` (${git.body.worktree.name})` : ''} at http://127.0.0.1:${port}; notices in ${source.body.eventsLog}; after each file run: ${invoked()} done <file> --port ${port}`;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--selftest') {
    await selftest();
    console.log('selftest ok');
    return;
  }
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      root: { type: 'string', default: '.' }, port: { type: 'string' }, force: { type: 'boolean' }, exclude: { type: 'string', multiple: true },
      scope: { type: 'string' }, base: { type: 'string' }, ui: { type: 'string' }, clear: { type: 'boolean' }, agent: { type: 'string', default: 'claude' },
    },
  });
  // serve binds 4824 by default; the other commands go to --port, else the server on --root's repository.
  const finds = ['attach', 'detach', 'info', 'done', 'ask', 'reply'].includes(command);
  const port = values.port ? Number(values.port) : finds ? (await running(values.root))?.port : 4824;
  if (port === undefined) {
    console.log(`nothing is serving ${resolve(values.root)}: start one with trove serve, or pass --port`);
    process.exitCode = 1;
    return;
  }
  const failed = (/** @type {Error} */ e) => ({ status: 0, body: { error: e.message } });
  if ((command === 'ask' || command === 'reply') && (positionals[0] || values.clear)) {
    const kind = command === 'reply' ? 'reply' : 'question';
    const r = await call(port, 'POST', '/api/ask', { text: values.clear ? '' : positionals.join(' '), kind }).catch(failed);
    console.log(r.status === 200 ? (r.body.question ? `the page shows your ${kind} is waiting` : 'cleared') : `${command} failed: ${r.body?.error ?? r.status}`);
    process.exitCode = r.status === 200 ? 0 : 1;
    return;
  }
  if (command === 'done' && positionals[0]) {
    const file = existsSync(positionals[0]) ? resolve(positionals[0]) : positionals[0];
    const r = await call(port, 'POST', '/api/release', { path: file }).catch(failed);
    console.log(r.status === 200 ? (r.body.released ? `released ${positionals[0]}` : `${positionals[0]} was not locked`) : `done failed: ${r.body?.error ?? r.status}`);
    process.exitCode = r.status === 200 ? 0 : 1;
    return;
  }
  if (command === 'attach' || command === 'detach' || command === 'info') {
    if (command === 'attach' && !['claude', 'codex', 'other'].includes(values.agent)) {
      console.log(USAGE);
      process.exitCode = 1;
      return;
    }
    try {
      if (command !== 'info') {
        const r = await call(port, 'POST', '/api/agent', { id: command === 'attach' ? values.agent : null });
        if (r.status !== 200) throw new Error(`port ${port} is not a Trove server`);
      }
      console.log(command === 'detach' ? `detached from port ${port}` : await firstLine(port));
    } catch (/** @type {any} */ error) {
      console.log(error.code === 'ECONNREFUSED' ? `nothing is serving on port ${port}: start one with trove serve, or pass the right --port` : `${command} failed: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }
  if (command !== 'serve' || (values.scope && !['uncommitted', 'branch'].includes(values.scope))) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const cmd = invoked();
  try {
    const { port: bound } = await serve({
      root: resolve(values.root), port, force: values.force, by: 'cli', exclude: values.exclude, scope: /** @type {'uncommitted' | 'branch' | undefined} */ (values.scope), base: values.base,
      uiDir: values.ui ? resolve(values.ui) : defaultUi(),
      doneCommand: (p) => `${cmd} done <file> --port ${p}`,
    });
    console.log(await firstLine(bound));
  } catch (/** @type {any} */ error) {
    console.log(error.code === 'EADDRINUSE' ? `port ${port} is busy: another session is probably serving. Stop it, or pass --port.`
      : /^(not a git repository|Trove is already serving)/.test(error.message) ? error.message : `server failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
