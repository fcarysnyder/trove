#!/usr/bin/env node
// @ts-check
// trove: the CLI. `serve` runs the review server over a git repository, or a plain folder (a file opens its
// folder with the file selected); `attach` joins one that is already running (the desktop's); `done`, `say`, `ask`
// and `reply` are the agent's side of it; `--selftest` checks the engine end to end.
//
//   trove serve [--root <path>] [--folder] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>] [--force]
//   trove attach [--root <repo> | --port N] [--agent claude|codex|other] | detach [--root <repo> | --port N] | info [--root <repo> | --port N]
//   trove done <file> [--note "<markdown>" | --note -] [--root <repo> | --port N]
//   trove say "<markdown>" | say - [--file <path>]... [--re <entry id>] [--root <repo> | --port N]   (-: the text from stdin)
//   trove ask "<question>" | reply "<summary>" | ask --clear [--root <repo> | --port N]
// Without --port these find the server running on --root's repository, else on its folder or the nearest one above
// (default: the current directory). --folder serves a folder inside a repository as a folder: no git writes.
//   trove --selftest
import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { call, running, selftest, serve } from '@trove/core';

const USAGE = 'usage: trove serve [--root <path>] [--folder] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>] [--force]'
  + ' | attach [--root <repo> | --port N] [--agent claude|codex|other] | detach [--root <repo> | --port N] | info [--root <repo> | --port N]'
  + ' | done <file> [--note "<markdown>" | --note -] [--root <repo> | --port N] | say "<markdown>" | say - [--file <path>]... [--re <entry id>] [--root <repo> | --port N] | ask "<question>" | reply "<summary>" | ask --clear [--root <repo> | --port N] | --selftest';
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
// The done command is this binary's own, whoever started the server. `file`: the page opens on it.
async function firstLine(/** @type {number} */ port, /** @type {string | null} */ file = null) {
  const [source, files] = await Promise.all(['/api/source', '/api/files'].map((p) => call(port, 'GET', p)));
  const folder = source.body?.kind === 'folder';
  const git = folder ? null : await call(port, 'GET', '/api/git');
  if ([source, files, git ?? source].some((r) => r.status !== 200) || !source.body?.eventsLog) throw new Error(`port ${port} is not a Trove server`);
  const queued = files.body.files.filter((/** @type {{staged: boolean}} */ f) => !f.staged).length;
  // A folder has no review: its files are edited in place.
  const what = git ? `reviewing ${queued} files on ${git.body.branch ?? git.body.head}${git.body.worktree && !git.body.worktree.main ? ` (${git.body.worktree.name})` : ''}`
    : `editing ${files.body.files.length} files in ${source.body.name}`;
  return `${what} at http://127.0.0.1:${port}${file ? `/?file=${encodeURIComponent(file)}` : ''}; notices in ${source.body.eventsLog}; after each file run: ${invoked()} done <file> --port ${port}`;
}

/** Everything on stdin: long text (many lines, quotes) without shell quoting. */
async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
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
      root: { type: 'string', default: '.' }, port: { type: 'string' }, force: { type: 'boolean' }, folder: { type: 'boolean' }, exclude: { type: 'string', multiple: true },
      scope: { type: 'string' }, base: { type: 'string' }, ui: { type: 'string' }, clear: { type: 'boolean' }, agent: { type: 'string', default: 'claude' },
      note: { type: 'string' }, file: { type: 'string', multiple: true }, re: { type: 'string' },
    },
  });
  // serve binds 4824 by default; the other commands go to --port, else the server on --root's repository.
  const finds = ['attach', 'detach', 'info', 'done', 'say', 'ask', 'reply'].includes(command);
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
  // A path as the server takes it: absolute when it exists from here, so any working directory works.
  const pathOf = (/** @type {string} */ p) => (existsSync(p) ? resolve(p) : p);
  if (command === 'done' && positionals[0]) {
    const note = values.note === '-' ? await stdin() : values.note;
    const r = await call(port, 'POST', '/api/release', { path: pathOf(positionals[0]), ...(note ? { note } : {}) }).catch(failed);
    const noted = note ? ', with your note in History' : '';
    console.log(r.status === 200 ? (r.body.released ? `released ${positionals[0]}${noted}` : `${positionals[0]} was not locked${noted}`) : `done failed: ${r.body?.error ?? r.status}`);
    process.exitCode = r.status === 200 ? 0 : 1;
    return;
  }
  if (command === 'say' && positionals.length) {
    const text = positionals.join(' ') === '-' ? await stdin() : positionals.join(' ');
    const r = await call(port, 'POST', '/api/message', { text, from: 'agent', paths: (values.file ?? []).map(pathOf), ...(values.re ? { re: values.re } : {}) }).catch(failed);
    console.log(r.status === 200 ? `message ${r.body.id} is in History` : `say failed: ${r.body?.error ?? r.status}`);
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
  const root = resolve(values.root);
  try {
    const { app, port: bound } = await serve({
      root, folder: values.folder, port, force: values.force, by: 'cli', exclude: values.exclude, scope: /** @type {'uncommitted' | 'branch' | undefined} */ (values.scope), base: values.base,
      uiDir: values.ui ? resolve(values.ui) : defaultUi(),
      doneCommand: (p) => `${cmd} done <file> --port ${p}`,
    });
    // A file as --root: the printed address opens the page on it.
    const file = statSync(root).isFile() ? relative(app.info().root, realpathSync(root)).split(sep).join('/') : null;
    console.log(await firstLine(bound, file));
  } catch (/** @type {any} */ error) {
    console.log(error.code === 'EADDRINUSE' ? `port ${port} is busy: another session is probably serving. Stop it, or pass --port.`
      : /^(not a git repository|Trove is already serving)/.test(error.message) ? error.message : `server failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
