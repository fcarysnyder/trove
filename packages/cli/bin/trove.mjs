#!/usr/bin/env node
// @ts-check
// trove: the CLI. `serve` runs the review server over a git repository; `done`, `ask` and
// `reply` are the agent's side of it; `--selftest` checks the engine end to end.
//
//   trove serve [--root <path>] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>]
//   trove done <file> [--port 4824]
//   trove ask "<question>" | reply "<summary>" | ask --clear [--port 4824]
//   trove --selftest
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { call, selftest, serve } from '@trove/core';

const USAGE = 'usage: trove serve [--root <path>] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>]'
  + ' | done <file> [--port 4824] | ask "<question>" | reply "<summary>" | ask --clear [--port 4824] | --selftest';
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
      root: { type: 'string', default: '.' }, port: { type: 'string', default: '4824' }, exclude: { type: 'string', multiple: true },
      scope: { type: 'string' }, base: { type: 'string' }, ui: { type: 'string' }, clear: { type: 'boolean' },
    },
  });
  const port = Number(values.port);
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
  if (command !== 'serve' || (values.scope && !['uncommitted', 'branch'].includes(values.scope))) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const cmd = invoked();
  try {
    const { app, url } = await serve({
      root: resolve(values.root), port, exclude: values.exclude, scope: /** @type {'uncommitted' | 'branch' | undefined} */ (values.scope), base: values.base,
      uiDir: values.ui ? resolve(values.ui) : defaultUi(),
      doneCommand: (p) => `${cmd} done <file> --port ${p}`,
    });
    const info = app.info();
    const queued = app.list().filter((f) => !f.staged).length;
    const git = app.git();
    console.log(`reviewing ${queued} files on ${git.branch ?? git.head} at ${url}; notices in ${info.eventsLog}; after each file run: ${info.doneCommand}`);
  } catch (/** @type {any} */ error) {
    console.log(error.code === 'EADDRINUSE' ? `port ${port} is busy: another session is probably serving. Stop it, or pass --port.`
      : error.message.startsWith('not a git repository') ? error.message : `server failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
