// The end-to-end check, ported from doc-review.mjs --selftest: anchoring, the block splice, hash
// checks, Host/Origin checks and every state transition against a throwaway git repo, plus the
// refusal of a plain folder, a branch scope, settings and the UI static files. Node built-ins only, so the bundled CLI
// runs it (`trove --selftest`) with no devDependencies; vitest calls it too.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { addedSpans, blocks, countStates, findAnchor, makeAnchor, matchBlocks, splice, subtractSpans, wordDiff } from './anchor.js';
import { call, createApp, type AppOptions } from './app.js';
import { agentAbove, alive } from './presence.js';
import { probeGit, sha } from './source.js';

const listen = async (o: AppOptions) => {
  const app = createApp({ log: () => {}, agent: 'other', ...o });
  await new Promise<void>((ok) => app.server.listen(0, '127.0.0.1', ok));
  return { app, port: (app.server.address() as AddressInfo).port };
};
const raw = (port: number, path: string) => new Promise<{ status: number; type: string; csp: string; text: string }>((ok) =>
  request({ host: '127.0.0.1', port, path }, (res) => {
    let text = '';
    res.setEncoding('utf8').on('data', (c) => (text += c)).on('end', () =>
      ok({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), csp: String(res.headers['content-security-policy']), text }));
  }).end());
const gitIn = (root: string) => (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const newRepo = (prefix: string) => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const sh = gitIn(root);
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 't@t');
  sh('config', 'user.name', 't');
  return { root, sh };
};

export async function selftest(): Promise<void> {
  const temps: string[] = [];
  try {
    await pure();
    await gitCase(temps);
    await branchCase(temps);
    await switchCase(temps);
    await agentCase(temps);
    notARepo(temps);
  } finally {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }
}

async function pure() {
  // Status counts: one state per file, by priority.
  assert.deepEqual(countStates([
    { state: 'working', drafts: 2, updated: true, edited: true },
    { state: 'rejected', updated: false, edited: false, drafts: 0 },
    { state: 'skipped', updated: true, edited: false, drafts: 1 },
    { state: 'accepted', updated: true, edited: true, drafts: 0 },
    { state: 'queue', updated: true, edited: true, drafts: 1 },
    { state: 'queue', updated: false, edited: true, drafts: 1 },
    { state: 'queue', updated: false, edited: false, drafts: 1 },
    { state: 'queue', updated: false, edited: false, drafts: 0 },
  ]), { working: 1, rejected: 1, skipped: 1, accepted: 1, updated: 1, edited: 1, drafts: 1, pending: 1 });

  // Anchoring: survives an edit before it, prefers its own section, breaks ties on context, and
  // reports a vanished quote as unanchored rather than guessing.
  const items = [
    { text: 'Intro says use a badge here.', path: ['A'] },
    { text: 'Use a badge for counts. Use a badge for status.', path: ['A', 'B'] },
  ];
  const a = makeAnchor(items[1].text, 24, 47, ['A', 'B']);
  assert.equal(a.quote, 'Use a badge for status.');
  const edited = [items[0], { text: 'New first line. ' + items[1].text, path: ['A', 'B'] }];
  assert.deepEqual(findAnchor(edited, a), { i: 1, start: 40, end: 63, score: 24 });
  const tie = makeAnchor(items[1].text, 0, 11, ['A', 'B']); // "Use a badge" occurs twice
  assert.equal(findAnchor(items, tie)?.start, 0);
  const second = makeAnchor(items[1].text, 24, 35, ['A', 'B']);
  assert.equal(findAnchor(items, second)?.start, 24, 'prefix picks the second occurrence');
  const moved = { ...makeAnchor(items[0].text, 0, 5, ['Old heading']) };
  assert.equal(findAnchor(items, moved)?.i, 0, 'a renamed section falls back to the whole file');
  assert.equal(findAnchor(items, { ...a, quote: 'gone' }), null);

  // Blocks: front matter is a block, raws join back exactly, a splice touches one block only.
  const b = blocks(DOC);
  assert.equal(b.map((x) => x.raw).join(''), DOC);
  assert.deepEqual(b.map((x) => x.type), ['frontmatter', 'heading', 'paragraph', 'heading', 'list']);
  assert.deepEqual(b[4].path, ['A', 'B']);
  assert.equal(splice(DOC, 2, 'Para 1.'), DOC.replace('Para one.', 'Para 1.'));

  // Show new: an edited block pairs with the one it replaced, an unrelated one is added, a dropped
  // one is removed where it sat; the word diff marks only what changed.
  const m = matchBlocks(['# A\n\n', 'Use a badge for counts.\n\n', 'Old aside.\n\n', 'End.\n'],
    ['# A\n\n', 'Use a badge for status counts.\n\n', 'Brand new section here.\n\n', 'End.\n']);
  assert.deepEqual([...m.changed], [[1, 'Use a badge for counts.\n\n'], [2, null]]);
  assert.deepEqual(m.removed, [{ before: 3, raw: 'Old aside.\n\n' }]);
  assert.deepEqual(matchBlocks(['x\n'], ['x\n']), { changed: new Map(), removed: [] });
  assert.deepEqual(wordDiff('Use a badge for counts.', 'Use a badge for status counts.'),
    [{ op: '=', text: 'Use a badge for ', old: 'Use a badge for ' }, { op: '+', text: 'status ' }, { op: '=', text: 'counts.', old: 'counts.' }]);
  assert.deepEqual(wordDiff('hide content.', 'hide content more'),
    [{ op: '=', text: 'hide content ', old: 'hide content' }, { op: '-', text: '.' }, { op: '+', text: 'more' }],
    'trailing space does not break a match, and the old spelling is kept');
  assert.deepEqual(addedSpans(wordDiff('Use a badge.', 'Use a big badge now.')), [[6, 9], [16, 19]]);
  assert.deepEqual(subtractSpans([[0, 10], [20, 30]], [[2, 4], [8, 22]]), [[0, 2], [4, 8], [22, 30]], 'cuts holes and trims ends');
  assert.deepEqual(subtractSpans([[5, 9]], [[0, 20]]), [], 'a span covered whole is gone');
}

const DOC = '---\ntitle: T\n---\n# A\n\nPara one.\n\n## B\n\n- x\n- y\n';

// Server and git: a throwaway repo with one tracked, one untracked and one excluded file.
async function gitCase(temps: string[]) {
  const doc = DOC;
  const { root, sh } = newRepo('trove-git-');
  temps.push(root);
  writeFileSync(join(root, 'a.md'), doc);
  mkdirSync(join(root, 'gen'));
  writeFileSync(join(root, 'gen/x.md'), '# gen\n');
  writeFileSync(join(root, 'r.md'), '# R\n');
  sh('add', '.');
  sh('commit', '-qm', 'base');
  sh('mv', 'r.md', 'r é ñ.md'); // a staged rename to a path with spaces and non-ASCII
  writeFileSync(join(root, 'a.md'), doc.replace('Para one.', 'Para one, changed.'));
  writeFileSync(join(root, 'b.md'), '# B\n');
  for (const out of ['x.mdx', 't.txt', 'c.html']) writeFileSync(join(root, out), '<h1>C</h1><p>Hi</p>\n');
  writeFileSync(join(root, 'gen/x.md'), '# gen 2\n');
  // A repo that ran doc-review keeps its files: the state dir is renamed on first run.
  const gitDir = join(root, '.git');
  mkdirSync(join(gitDir, 'doc-review'));
  writeFileSync(join(gitDir, 'doc-review', 'events.log'), 'old\n');
  const ui = mkdtempSync(join(tmpdir(), 'trove-ui-'));
  temps.push(ui);
  mkdirSync(join(ui, 'assets'));
  writeFileSync(join(ui, 'index.html'), '<!doctype html><title>Trove</title>');
  writeFileSync(join(ui, 'assets', 'app.js'), 'export {};\n');
  writeFileSync(join(tmpdir(), 'trove-outside.txt'), 'secret');

  const lines: string[] = [];
  const opts = { root, exclude: ['gen/**'] };
  const { app, port } = await listen({ ...opts, quietMs: 300, log: (l) => lines.push(l), uiDir: ui });
  const stateDir = app.info().stateDir;
  const files = { drafts: join(stateDir, 'drafts.json'), edits: join(stateDir, 'edits.json'), batches: join(stateDir, 'batches.jsonl') };
  assert.equal(readFileSync(join(gitDir, 'trove', 'events.log'), 'utf8'), 'old\n', 'doc-review/ became trove/');
  assert.equal(existsSync(join(gitDir, 'doc-review')), false);
  const post = (path: string, body: unknown, headers?: Record<string, string>) => call(port, 'POST', path, body, headers);
  const get = (path: string, p = port) => call(p, 'GET', path);
  const states = async () => Object.fromEntries((await get('/api/files')).body.files.map((f: any) => [f.path, f.state]));
  const staged = () => sh('diff', '--cached', '--name-only').trim();
  const restart = async () => (await listen(opts));

  assert.deepEqual(await states(), { 'a.md': 'queue', 'b.md': 'queue', 'c.html': 'queue', 'r é ñ.md': 'accepted' }, 'only .md and .html; excluded and committed files stay out; a rename lists its new path once');
  sh('commit', '-qm', 'rename'); // keeps the index clean for the checks below; seen keeps it listed
  const baseOfFile = async (p: string) => (await get(`/api/file?path=${encodeURIComponent(p)}`)).body.base;
  assert.equal(await baseOfFile('a.md'), doc, 'base: the staged copy');
  assert.equal(await baseOfFile('b.md'), null, 'base: nothing for an untracked file');
  assert.equal((await get('/api/file?path=c.html')).body.kind, 'html');
  assert.equal((await get('/api/file?path=a.md')).body.kind, 'markdown');

  // Source and settings.
  const info = (await get('/api/source')).body;
  assert.deepEqual([info.kind, info.branch, info.scope, info.base, info.agent, info.port, info.doneCommand],
    ['git', 'main', 'uncommitted', null, 'other', port, `trove done <file> --port ${port}`]);
  assert.equal(info.eventsLog, join(stateDir, 'events.log'));
  assert.deepEqual((await get('/api/settings')).body.exclude, ['gen/**'], 'options override settings for this run');
  assert.equal((await post('/api/settings', { theme: 'loud' })).status, 400);
  assert.equal((await post('/api/settings', { theme: 'dark' }, { origin: 'https://evil.example' })).status, 403);
  const s1 = await post('/api/settings', { theme: 'dark', types: { txt: true } });
  assert.deepEqual([s1.status, s1.body.theme, s1.body.exclude], [200, 'dark', ['gen/**']]);
  assert.equal((await states())['t.txt'], 'queue', 'turning a type on lists it on the next request');
  assert.equal((await get('/api/file?path=t.txt')).body.kind, 'text');
  await post('/api/settings', { types: { txt: false } });
  assert.equal((await states())['t.txt'], undefined);
  assert.equal(JSON.parse(readFileSync(join(stateDir, 'settings.json'), 'utf8')).theme, 'dark', 'saved per source');
  assert.equal(JSON.parse(readFileSync(join(stateDir, 'settings.json'), 'utf8')).exclude.length, 0, 'a run override is not saved');
  assert.deepEqual(probeGit(join(root, 'gen'))?.branch, 'main');

  // A listed file that cannot be read (a dangling link) is a 500, and the server keeps serving.
  symlinkSync(join(root, 'gone.md'), join(root, 'l.md'));
  assert.equal((await get('/api/file?path=l.md')).status, 500);
  assert.equal((await get('/api/files')).status, 200);
  rmSync(join(root, 'l.md'));

  // The UI: index.html and its assets under the CSP, nothing outside uiDir.
  const page = await raw(port, '/');
  assert.deepEqual([page.status, page.type, page.text], [200, 'text/html; charset=utf-8', '<!doctype html><title>Trove</title>']);
  assert.match(page.csp, /script-src 'self';/, 'no inline scripts');
  assert.equal((await raw(port, '/assets/app.js')).type, 'text/javascript; charset=utf-8');
  for (const p of ['/../trove-outside.txt', '/%2e%2e/trove-outside.txt', '/assets/nope.js', '/api/nope']) assert.equal((await raw(port, p)).status, 404, p);
  // Documents' own frames: any file under the root at /raw/, under no policy, nothing outside it or in .git.
  const frame = await raw(port, '/raw/c.html');
  assert.deepEqual([frame.status, frame.type, frame.csp, frame.text], [200, 'text/html; charset=utf-8', 'undefined', '<h1>C</h1><p>Hi</p>\n']);
  for (const p of ['/raw/../trove-outside.txt', '/raw/%2e%2e/trove-outside.txt', '/raw/.git/config', '/raw/nope.html', '/raw/gen']) assert.equal((await raw(port, p)).status, 404, p);
  const bare = await listen(opts);
  assert.equal((await raw(bare.port, '/')).status, 404, 'no uiDir: no page');
  assert.equal((await get('/api/files', bare.port)).status, 200, 'but the API answers');
  await bare.app.close();

  // HTML: accepted and saved whole, like markdown.
  const html = (await get('/api/file?path=c.html')).body;
  assert.equal((await post('/api/save', { path: 'c.html', hash: html.hash, raw: '<p>Whole</p>\n' })).status, 200);
  assert.equal(readFileSync(join(root, 'c.html'), 'utf8'), '<p>Whole</p>\n');
  assert.equal(staged(), '', 'an HTML save does not stage');
  assert.equal((await post('/api/accept', { path: 'c.html', hash: sha('<p>Whole</p>\n') })).status, 200);
  assert.equal((await states())['c.html'], 'accepted');
  assert.equal((await post('/api/unaccept', { path: 'c.html' })).status, 200);
  assert.equal((await states())['c.html'], 'queue', 'undo accept unstages');
  assert.equal(staged(), '');
  const all = await post('/api/accept-all', { paths: ['a.md', 'c.html', 'c.html', 'nope.md', '../etc/passwd'] });
  assert.deepEqual([all.status, all.body], [200, { accepted: 2 }], 'accept all: listed paths once, the rest passed over');
  assert.deepEqual(await states(), { 'a.md': 'accepted', 'b.md': 'queue', 'c.html': 'accepted', 'r é ñ.md': 'accepted' });
  for (const path of ['a.md', 'c.html']) assert.equal((await post('/api/unaccept', { path })).status, 200);
  assert.equal(staged(), '');

  // Security: foreign Host, foreign or missing Origin, non-JSON, paths outside the set.
  assert.equal((await post('/api/reveal', { path: '../etc/passwd' })).status, 404, 'reveal: only a file in the set');
  assert.equal((await post('/api/accept', { path: 'a.md' }, { host: 'evil.example' })).status, 403);
  assert.equal((await post('/api/accept', { path: 'a.md' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/accept', { path: 'a.md' }, { origin: '' })).status, 403);
  assert.equal((await post('/api/accept', { path: 'a.md' }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/drafts', { path: 'a.md', drafts: ['x'.repeat(600 * 1024)] })).status, 413);
  for (const path of ['../etc/passwd', 'gen/x.md', join(root, '.git/config')]) {
    assert.equal((await get(`/api/file?path=${encodeURIComponent(path)}`)).status, 404, path);
  }
  assert.equal(staged(), '', 'nothing refused touched the index');

  // Accept stages; a later change puts the file back in the queue.
  const shown = (await get('/api/file?path=a.md')).body.hash;
  const stale = await post('/api/accept', { path: 'a.md', hash: 'stale' });
  assert.deepEqual([stale.status, stale.body.hash], [409, shown], 'accepting a version the user did not see is refused');
  assert.equal(staged(), '', 'a refused accept leaves the index alone');
  assert.equal((await post('/api/accept', { path: 'a.md', hash: shown })).status, 200);
  assert.equal(staged(), 'a.md');
  assert.equal((await states())['a.md'], 'accepted');
  sh('commit', '-qm', 'committed elsewhere');
  assert.equal((await states())['a.md'], 'accepted', 'a file seen this session stays listed after git stops reporting it');
  const committedRow = async (p: number) => (await get('/api/files', p)).body.files.find((f: any) => f.path === 'a.md');
  assert.equal((await committedRow(port)).committed, true, 'and is marked committed');
  const later2 = await restart();
  assert.equal((await committedRow(later2.port))?.committed, true, 'still listed as committed after a restart');
  await later2.app.close();

  // Save: refused on a stale hash, otherwise splices one block and writes it. It never stages: a
  // staged file goes back to pending and shows as Edited, even to a fresh server on the same repo.
  const file = (await get('/api/file?path=a.md')).body;
  assert.equal((await post('/api/save', { path: 'a.md', hash: 'stale', index: 2, raw: 'X' })).status, 409);
  sh('add', 'a.md');
  const beforeEdit = readFileSync(join(root, 'a.md'), 'utf8');
  const saved = await post('/api/save', { path: 'a.md', hash: file.hash, index: 2, raw: 'Para one, edited.' });
  assert.equal(saved.status, 200);
  assert.equal(staged(), '', 'a save unstages and does not stage');
  const row = async (p: string) => (await get('/api/files')).body.files.find((f: any) => f.path === p);
  assert.deepEqual([(await row('a.md')).state, (await row('a.md')).edited], ['queue', true]);
  const again = await restart();
  assert.equal((await get('/api/files', again.port)).body.files.find((f: any) => f.path === 'a.md').edited, true, 'Edited survives a restart');
  await again.app.close();
  // A second Save keeps the first snapshot; Revert restores exactly the pre-edit bytes, unstaged.
  assert.equal((await post('/api/save', { path: 'a.md', hash: saved.body.hash, index: 2, raw: 'Para one, twice.' })).status, 200);
  assert.equal((await post('/api/revert', { path: 'a.md' })).status, 200);
  assert.equal(readFileSync(join(root, 'a.md'), 'utf8'), beforeEdit, 'revert restores the text before the first edit');
  assert.deepEqual([(await row('a.md')).edited, staged()], [false, '']);
  assert.equal((await post('/api/revert', { path: 'a.md' })).status, 404, 'nothing left to revert');
  // Revert is refused once the file changed after the edit (say, the agent edited it).
  const s2 = await post('/api/save', { path: 'a.md', hash: sha(beforeEdit), index: 2, raw: 'Para two.' });
  assert.equal(s2.status, 200);
  writeFileSync(join(root, 'a.md'), readFileSync(join(root, 'a.md'), 'utf8') + '\nMore.\n');
  assert.equal((await get('/api/file?path=a.md')).body.revertable, false);
  assert.equal((await post('/api/revert', { path: 'a.md' })).status, 409);
  writeFileSync(join(root, 'a.md'), doc.replace('Para one.', 'Para two.'));
  // Accept is the only stage, and it clears Edited and its snapshot.
  const now = (await get('/api/file?path=a.md')).body.hash;
  assert.equal((await post('/api/accept', { path: 'a.md', hash: now })).status, 200);
  assert.deepEqual([(await row('a.md')).state, (await row('a.md')).edited], ['accepted', false]);
  assert.equal(JSON.parse(readFileSync(files.edits, 'utf8'))['a.md'], undefined, 'the snapshot is gone');

  // Per-block edits: one entry per block, keeping the first `before`; reverting one restores that
  // block's bytes only, is refused once its text changed, and the last one clears Edited.
  const base = readFileSync(join(root, 'a.md'), 'utf8');
  const saveBlock = async (index: number, raw: string) => post('/api/save', { path: 'a.md', hash: sha(readFileSync(join(root, 'a.md'), 'utf8')), index, raw });
  await saveBlock(2, 'Para X.');
  await saveBlock(2, 'Para Y.');
  await saveBlock(4, '- z');
  const editsNow = (await get('/api/file?path=a.md')).body.edits;
  assert.deepEqual(editsNow.map((x: any) => [x.index, x.before, x.after, x.ok]), [[2, 'Para two.', 'Para Y.', true], [4, '- x\n- y', '- z', true]]);
  const later = await restart();
  assert.equal((await get('/api/file?path=a.md', later.port)).body.edits.length, 2, 'edits survive a restart');
  await later.app.close();
  const withList = readFileSync(join(root, 'a.md'), 'utf8');
  assert.equal((await post('/api/revert', { path: 'a.md', edit: editsNow[0].id, hash: sha(withList) })).status, 200);
  assert.equal(readFileSync(join(root, 'a.md'), 'utf8'), withList.replace('Para Y.', 'Para two.'), 'only that block changed');
  assert.equal(staged(), '', 'reverting does not stage');
  writeFileSync(join(root, 'a.md'), readFileSync(join(root, 'a.md'), 'utf8').replace('- z', '- w'));
  assert.equal((await get('/api/file?path=a.md')).body.edits[0].ok, false);
  assert.equal((await post('/api/revert', { path: 'a.md', edit: editsNow[1].id })).status, 409, 'refused once the text changed');
  writeFileSync(join(root, 'a.md'), readFileSync(join(root, 'a.md'), 'utf8').replace('- w', '- z'));
  assert.equal((await post('/api/revert', { path: 'a.md', edit: editsNow[1].id })).status, 200);
  assert.equal(readFileSync(join(root, 'a.md'), 'utf8'), base, 'both reverts give back the original bytes');
  assert.equal((await row('a.md')).edited, false, 'the last revert clears Edited');
  await saveBlock(2, 'Para Z.');
  assert.equal((await post('/api/accept', { path: 'a.md', hash: sha(readFileSync(join(root, 'a.md'), 'utf8')) })).status, 200);
  assert.deepEqual((await get('/api/file?path=a.md')).body.edits, [], 'Accept clears the edits');

  // Drafts persist under the git dir; send locks change files only, unstages them, announces once.
  const anchor = makeAnchor('Para two.', 0, 4, ['A']);
  await post('/api/drafts', { path: 'a.md', drafts: [{ kind: 'change', note: 'shorter', anchor }] });
  await post('/api/drafts', { path: 'b.md', drafts: [{ kind: 'explain', note: 'why?', anchor }] });
  assert.equal(JSON.parse(readFileSync(files.drafts, 'utf8'))['a.md'][0].note, 'shorter');
  const stored = JSON.parse(readFileSync(files.drafts, 'utf8'));
  writeFileSync(files.drafts, JSON.stringify({ ...stored, 'gone.md': [{ kind: 'change', note: 'x', anchor }] }));
  assert.deepEqual(Object.keys((await get('/api/drafts')).body.drafts).sort(), ['a.md', 'b.md'], 'only listed files');
  assert.equal((await call(port, 'GET', '/api/drafts', undefined, { host: 'evil.example' })).status, 403);
  writeFileSync(files.drafts, JSON.stringify(stored));
  const atSend = readFileSync(join(root, 'a.md'), 'utf8');
  const sent = await post('/api/send', {});
  assert.deepEqual([sent.body.comments, sent.body.files, sent.body.locked], [2, 2, ['a.md']]);
  assert.deepEqual(await states(), { 'a.md': 'working', 'b.md': 'queue', 'c.html': 'queue', 'r é ñ.md': 'accepted' }, 'explain-only files do not lock');
  assert.equal(staged(), '', 'sending unstages');
  assert.deepEqual(lines, [`batch ${sent.body.id}: 2 comments on 2 files. Read it with: grep -F ${sent.body.id} '${files.batches}'`]);
  assert.equal(readFileSync(join(stateDir, 'events.log'), 'utf8'), `old\n${lines[0]}\n`, 'the notice goes to the events log');
  assert.equal(JSON.parse(readFileSync(files.batches, 'utf8')).items.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(files.drafts, 'utf8')), {});
  const busy = await post('/api/accept', { path: 'a.md', hash: sha(readFileSync(join(root, 'a.md'), 'utf8')) });
  assert.deepEqual([busy.status, busy.body.error], [409, 'The agent is working on this file'], 'locked: no accept');
  assert.equal((await post('/api/unaccept', { path: 'a.md' })).status, 409, 'locked: no undo accept');
  assert.equal((await post('/api/save', { path: 'a.md', hash: sha(readFileSync(join(root, 'a.md'), 'utf8')), index: 2, raw: 'Y' })).status, 409, 'locked: no edit');
  assert.equal((await post('/api/send', {})).status, 400, 'nothing left to send');
  // A locked file's new drafts wait: Send posts the others and leaves those in place.
  await post('/api/drafts', { path: 'a.md', drafts: [{ kind: 'change', note: 'later', anchor }] });
  await post('/api/drafts', { path: 'b.md', drafts: [{ kind: 'explain', note: 'now', anchor }] });
  const partial = await post('/api/send', {});
  assert.deepEqual([partial.body.comments, partial.body.locked], [1, []]);
  assert.equal(JSON.parse(readFileSync(files.batches, 'utf8').trim().split('\n').at(-1)!).items[0].path, 'b.md');
  assert.deepEqual(Object.keys((await get('/api/drafts')).body.drafts), ['a.md'], 'the locked file keeps its drafts');
  // Filters: `paths` sends one file and leaves the others; `kind` sends one kind and keeps the rest.
  const ex = { kind: 'explain', note: 'why', anchor };
  const ch = { kind: 'change', note: 'fix', anchor };
  await post('/api/drafts', { path: 'b.md', drafts: [ch, ex] });
  await post('/api/drafts', { path: 'c.html', drafts: [ex] });
  const onlyC = await post('/api/send', { paths: ['c.html'] });
  assert.deepEqual([onlyC.body.comments, onlyC.body.files], [1, 1]);
  assert.deepEqual((await get('/api/drafts')).body.drafts['b.md'].length, 2, 'other files keep their drafts');
  const explains = await post('/api/send', { kind: 'explain' });
  assert.deepEqual([explains.body.comments, explains.body.locked], [1, []]);
  assert.deepEqual((await get('/api/drafts')).body.drafts['b.md'], [ch], 'the change comment stays a draft');
  assert.equal((await post('/api/send', { kind: 'nope' })).status, 400);
  assert.equal((await post('/api/send', { paths: ['../x.md'] })).status, 400, 'a path outside the set sends nothing');
  await post('/api/drafts', { path: 'b.md', drafts: [] });

  // Ask: shown in the file list until cleared; a foreign origin cannot raise one.
  assert.equal((await post('/api/ask', { text: 'Which tier?' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/ask', { text: '  Which tier?  ' })).body.question.text, 'Which tier?');
  assert.equal((await get('/api/files')).body.question.text, 'Which tier?');
  const reopened = await restart();
  assert.equal((await get('/api/files', reopened.port)).body.question.text, 'Which tier?', 'a waiting question survives a restart');
  await reopened.app.close();
  assert.equal((await post('/api/ask', { text: 'Answered 2 explain comments', kind: 'reply' })).body.question.kind, 'reply');
  assert.equal((await post('/api/ask', { text: 'x', kind: 'nope' })).status, 400);
  await post('/api/ask', { text: '' });
  assert.equal((await get('/api/files')).body.question, null, 'an empty text clears it');

  // Explicit release: `done` with an absolute path, as the agent runs it.
  writeFileSync(join(root, 'a.md'), doc.replace('Para one.', 'Para, by the agent.'));
  assert.deepEqual((await post('/api/release', { path: join(root, 'a.md') })).body, { released: true, updated: true });
  const after = (await get('/api/files')).body.files.find((f: any) => f.path === 'a.md');
  assert.deepEqual([after.state, after.updated], ['queue', true]);
  assert.equal((await get('/api/file?path=a.md')).body.since, atSend, 'an updated file keeps its text from the send');
  const restarted = await restart();
  assert.equal((await get('/api/file?path=a.md', restarted.port)).body.since, atSend, 'the snapshot survives a restart');
  await restarted.app.close();

  // Fallback release: changed, then quiet for quietMs.
  const working = async () => Object.values(await states()).filter((s) => s === 'working').length;
  await post('/api/drafts', { path: 'a.md', drafts: [{ kind: 'change', note: 'again', anchor }] });
  await post('/api/send', {});
  app.tick(0);
  assert.equal(await working(), 1, 'unchanged stays locked');
  writeFileSync(join(root, 'a.md'), 'edited\n');
  app.tick(1000);
  assert.equal(await working(), 1, 'still changing stays locked');
  app.tick(1200);
  assert.equal(await working(), 1);
  app.tick(1300);
  assert.equal(await working(), 0, 'quiet long enough releases');

  // Manual unlock without a change: back in the queue, not marked as updated by the agent.
  await post('/api/drafts', { path: 'b.md', drafts: [{ kind: 'change', note: 'x', anchor }] });
  await post('/api/send', {});
  const relaunched = await restart();
  assert.equal((await get('/api/files', relaunched.port)).body.files.find((f: any) => f.path === 'b.md').state, 'working', 'a lock survives a restart');
  await relaunched.app.close();
  assert.deepEqual((await post('/api/release', { path: 'b.md' })).body, { released: true, updated: false });

  // Skip: the editor's mark only. Reject: a tracked file back to HEAD, a new one deleted, each saved
  // first so Restore puts the text, the index and the drafts back; a stale hash is refused.
  const indexed = (p: string) => sh('diff', '--cached', '--name-only', '--', p).trim();
  assert.equal((await post('/api/skip', { path: 'b.md', on: true })).status, 200);
  assert.deepEqual([(await states())['b.md'], indexed('b.md')], ['skipped', ''], 'skipping touches no git state');
  await post('/api/skip', { path: 'b.md', on: false });
  assert.equal((await states())['b.md'], 'queue');
  writeFileSync(join(root, 'a.md'), doc.replace('Para one.', 'Para, to reject.'));
  const aText = readFileSync(join(root, 'a.md'), 'utf8');
  await post('/api/skip', { path: 'a.md', on: true });
  assert.equal((await post('/api/reject', { path: 'a.md', hash: 'stale' })).status, 409);
  assert.equal((await post('/api/reject', { path: 'a.md', hash: sha(aText) })).status, 200);
  assert.equal(readFileSync(join(root, 'a.md'), 'utf8'), sh('show', 'HEAD:a.md'), 'a tracked file goes back to HEAD');
  assert.deepEqual([(await states())['a.md'], indexed('a.md')], ['rejected', '']);
  const shownGone = (await get('/api/file?path=a.md')).body;
  assert.deepEqual([shownGone.text, shownGone.locked, shownGone.rejected, shownGone.base], [aText, true, true, sh('show', 'HEAD:a.md')], 'a rejected file shows what was rejected, read-only, against the file now');
  assert.deepEqual((await post('/api/accept', { path: 'a.md', hash: sha(aText) })).body, { error: 'Rejected: restore it first' }, 'no accepting a rejected file');
  assert.equal((await post('/api/save', { path: 'a.md', hash: sha(aText), index: 2, raw: 'X' })).status, 409, 'no editing a rejected file');
  assert.equal((await post('/api/reject', { path: 'a.md', hash: sha(aText) })).status, 409, 'already rejected');
  assert.equal((await post('/api/restore', { path: 'a.md' })).status, 200);
  assert.deepEqual([readFileSync(join(root, 'a.md'), 'utf8'), (await states())['a.md']], [aText, 'queue'], 'restore puts it back, no longer skipped');
  await post('/api/drafts', { path: 'b.md', drafts: [{ kind: 'change', note: 'keep me', anchor }] });
  const bText = readFileSync(join(root, 'b.md'), 'utf8');
  assert.equal((await post('/api/reject', { path: 'b.md', hash: sha(bText) })).status, 200);
  assert.equal(existsSync(join(root, 'b.md')), false, 'a new file is deleted');
  assert.equal((await get('/api/drafts')).body.drafts['b.md'], undefined, 'its drafts go with it');
  assert.equal((await post('/api/send', { paths: ['b.md'] })).status, 400, 'nothing of a rejected file is sent');
  const afterRestart = await restart();
  assert.equal((await get('/api/files', afterRestart.port)).body.files.find((f: any) => f.path === 'b.md')?.state, 'rejected', 'the backup survives a restart');
  await afterRestart.app.close();
  assert.equal((await post('/api/restore', { path: 'b.md' })).status, 200);
  assert.equal(readFileSync(join(root, 'b.md'), 'utf8'), bText);
  assert.equal((await get('/api/drafts')).body.drafts['b.md'][0].note, 'keep me', 'and its drafts come back');
  // Regenerated: a rejected path git reports again with new content is live again, its backup gone.
  assert.equal((await post('/api/reject', { path: 'b.md', hash: sha(bText) })).status, 200);
  writeFileSync(join(root, 'b.md'), '# B, regenerated\n');
  assert.equal((await states())['b.md'], 'queue');
  assert.equal((await post('/api/restore', { path: 'b.md' })).status, 404);

  // Create PR: refused while a file waits; then one line for the agent, and no commit by Trove.
  assert.equal((await post('/api/pr', {})).status, 409, 'pending files: no PR');
  await post('/api/accept-all', { paths: Object.keys(await states()) });
  const head = sh('rev-parse', 'HEAD');
  const pr = await post('/api/pr', {});
  assert.equal(pr.status, 200);
  assert.equal(lines.at(-1), `pr ${pr.body.id}: the review is done; commit the ${pr.body.files} staged files and open a pull request.`);
  assert.equal(readFileSync(join(stateDir, 'events.log'), 'utf8').trim().split('\n').at(-1), lines.at(-1), 'the request goes to the events log');
  assert.equal(sh('rev-parse', 'HEAD'), head, 'Trove never commits');

  await app.close();
  rmSync(join(tmpdir(), 'trove-outside.txt'), { force: true });
}

// Branch scope: everything the branch changed since main, committed and unmodified files as accepted.
async function branchCase(temps: string[]) {
  const { root, sh } = newRepo('trove-branch-');
  temps.push(root);
  for (const f of ['old.md', 'same.md', 'edit.md']) writeFileSync(join(root, f), `# ${f}\n`);
  sh('add', '.');
  sh('commit', '-qm', 'base');
  sh('checkout', '-qb', 'feature');
  writeFileSync(join(root, 'edit.md'), '# edit.md\n\nOn the branch.\n');
  writeFileSync(join(root, 'new.md'), '# new\n');
  sh('add', '.');
  sh('commit', '-qm', 'branch work');
  writeFileSync(join(root, 'old.md'), '# old.md, uncommitted\n');
  const probe = probeGit(root)!;
  assert.deepEqual([probe.branch, probe.branches, probe.defaultBase, probe.local.map((b) => [b.name, b.current, b.worktree])],
    ['feature', ['feature', 'main'], 'main', [['feature', true, null], ['main', false, null]]]);

  const { app, port } = await listen({ root });
  const rows = async () => Object.fromEntries((await call(port, 'GET', '/api/files')).body.files.map((f: any) => [f.path, f.state]));
  assert.deepEqual(await rows(), { 'old.md': 'queue' }, 'uncommitted: the working tree only');
  const s = await call(port, 'POST', '/api/settings', { scope: 'branch' });
  assert.equal(s.body.scope, 'branch');
  assert.deepEqual(await rows(), { 'edit.md': 'accepted', 'new.md': 'accepted', 'old.md': 'queue' }, 'branch: committed changes list as accepted');
  const info = (await call(port, 'GET', '/api/source')).body;
  assert.deepEqual([info.scope, info.base, info.branch], ['branch', 'main', 'feature']);
  const edit = (await call(port, 'GET', '/api/file?path=edit.md')).body;
  assert.equal(edit.base, '# edit.md\n', 'Show new marks against the merge-base');
  assert.equal((await call(port, 'GET', '/api/file?path=new.md')).body.base, null, 'a file the branch added has no earlier copy');
  // Edit and accept a committed file: it queues like any other, then accepts back.
  const saved = await call(port, 'POST', '/api/save', { path: 'edit.md', hash: edit.hash, index: 1, raw: 'Edited on review.' });
  assert.equal(saved.status, 200);
  assert.equal((await rows())['edit.md'], 'queue');
  assert.equal((await call(port, 'POST', '/api/accept', { path: 'edit.md', hash: saved.body.hash })).status, 200);
  assert.equal((await rows())['edit.md'], 'accepted');
  await call(port, 'POST', '/api/settings', { base: 'feature' });
  assert.deepEqual(Object.keys(await rows()), ['edit.md', 'old.md'], 'base = HEAD: only uncommitted work (and what was seen)');
  await call(port, 'POST', '/api/settings', { scope: 'uncommitted', base: null });
  assert.equal((await rows())['new.md'], undefined, 'back to uncommitted: branch files never seen are not listed as committed');
  await app.close();
  // A run override (--scope branch) applies without being saved.
  const cli = await listen({ root, scope: 'branch' });
  assert.equal(cli.app.settings().scope, 'branch');
  assert.equal(JSON.parse(readFileSync(join(cli.app.info().stateDir, 'settings.json'), 'utf8')).scope, 'uncommitted');
  await cli.app.close();
}

// The switcher: branches and worktrees, a switch that re-lists the queue, and every refusal.
async function switchCase(temps: string[]) {
  const { root, sh } = newRepo('trove-switch-');
  const wtDir = mkdtempSync(join(tmpdir(), 'trove-wt-'));
  temps.push(root, wtDir);
  writeFileSync(join(root, 'a.md'), '# A\n');
  writeFileSync(join(root, 'b.md'), '# B\n');
  sh('add', '.');
  sh('commit', '-qm', 'base');
  sh('branch', 'wt');
  sh('checkout', '-qb', 'free');
  writeFileSync(join(root, 'a.md'), '# A on free\n');
  sh('commit', '-qam', 'free');
  sh('checkout', '-q', 'main');
  rmSync(wtDir, { recursive: true });
  sh('worktree', 'add', '-q', wtDir, 'wt');
  const wtPath = realpathSync(wtDir);
  const { app, port } = await listen({ root });
  const get = async (path: string) => (await call(port, 'GET', path)).body;
  const sw = (branch: string) => call(port, 'POST', '/api/switch', { branch });
  const paths = async () => (await get('/api/files')).files.map((f: any) => f.path);

  const info = await get('/api/git');
  assert.deepEqual([info.branch, info.branches.map((b: any) => [b.name, b.current, b.worktree])],
    ['main', [['free', false, null], ['main', true, null], ['wt', false, wtPath]]], 'the worktree branch says where it is checked out');
  assert.deepEqual(info.worktrees.map((w: any) => [w.path, w.branch, w.current]), [[realpathSync(root), 'main', true], [wtPath, 'wt', false]]);
  assert.equal(info.dirty, 0);
  assert.equal(probeGit(wtDir)?.branch, 'wt', 'a worktree is a repository of its own');
  const main = realpathSync(root);
  assert.deepEqual([info.repo, info.worktree], [{ root: main, name: basename(main) }, { path: main, name: basename(main), branch: 'main', main: true }]);

  // A worktree inside the repository, where Claude Code puts them: probed from a folder in it, it names the
  // repository and itself, and lists every worktree; the main checkout's queue and count ignore it.
  sh('worktree', 'add', '-q', '-b', 'nested', join(root, '.claude/worktrees/nested'));
  const nested = realpathSync(join(root, '.claude/worktrees/nested'));
  mkdirSync(join(nested, 'docs'));
  const probe = probeGit(join(nested, 'docs'))!;
  assert.deepEqual([probe.branch, probe.repo, probe.worktree], ['nested', { root: main, name: basename(main) }, { path: nested, name: 'nested', branch: 'nested', main: false }]);
  const rows = (list: any[]) => list.map((w) => [w.path, w.name, w.branch, w.current, w.main]).sort((a, b) => Number(b[4]) - Number(a[4]) || a[0].localeCompare(b[0]));
  assert.deepEqual(rows(probe.worktrees), rows([
    { path: main, name: basename(main), branch: 'main', current: false, main: true },
    { path: wtPath, name: basename(wtPath), branch: 'wt', current: false, main: false },
    { path: nested, name: 'nested', branch: 'nested', current: true, main: false },
  ]));
  assert.equal(probe.worktrees[0].path, main, 'the main checkout first');
  const nestedApp = await listen({ root: join(nested, 'docs') });
  const nestedSource = (await call(nestedApp.port, 'GET', '/api/source')).body;
  assert.deepEqual([nestedSource.root, nestedSource.repo.name, nestedSource.worktree.name, nestedSource.worktree.main], [nested, basename(main), 'nested', false]);
  await nestedApp.app.close();
  const again = await get('/api/git');
  assert.deepEqual([again.worktrees.length, again.dirty, again.worktree.main], [3, 0, true]);

  writeFileSync(join(root, 'b.md'), '# B, uncommitted\n');
  writeFileSync(join(root, 'a.md'), '# A, uncommitted\n');
  assert.equal((await get('/api/git')).dirty, 2);
  assert.deepEqual((await get('/api/git')).worktrees.map((w: any) => [w.path, w.changes]).filter(([p]: string[]) => p !== nested),
    [[main, 2], [wtPath, 0]], 'each worktree counts its own changes');
  assert.equal(probeGit(wtDir)!.worktrees.find((w) => w.main)!.changes, 2, 'a probe from another worktree sees them too');
  const refused = await sw('free');
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /overwritten/, "git's own message");
  assert.deepEqual([(await get('/api/git')).branch, readFileSync(join(root, 'a.md'), 'utf8')], ['main', '# A, uncommitted\n'], 'nothing changed');
  sh('checkout', '--', 'a.md');

  const busy = await sw('wt');
  assert.deepEqual([busy.status, busy.body.worktree], [409, wtPath], 'a branch checked out elsewhere: open that worktree instead');
  assert.equal((await sw('nope')).status, 404);

  await call(port, 'POST', '/api/drafts', { path: 'b.md', drafts: [{ kind: 'change', note: 'n', anchor: { quote: 'B', prefix: '', suffix: '', path: [], raw: '' } }] });
  assert.equal((await call(port, 'POST', '/api/send', {})).status, 200);
  assert.match((await sw('free')).body.error, /working on a file/, 'no switching under the agent');
  await call(port, 'POST', '/api/release', { path: 'b.md' });

  assert.deepEqual(await paths(), ['b.md']);
  const done = await sw('free');
  assert.deepEqual([done.status, done.body.branch, done.body.dirty], [200, 'free', 1]);
  assert.deepEqual([await paths(), readFileSync(join(root, 'a.md'), 'utf8'), (await get('/api/source')).branch], [['b.md'], '# A on free\n', 'free'],
    'the queue re-lists on the new branch; uncommitted work comes along, as with git switch');
  assert.equal((await sw('free')).status, 200, 'the current branch is a no-op');
  await app.close();
  sh('worktree', 'remove', '--force', wtDir);
  sh('worktree', 'remove', '--force', nested);
}

// The attached agent: attach names it and picks its colour id, the errors use its label, detach
// clears it, and both survive a restart. A serving agent (CLAUDECODE) is attached by definition.
async function agentCase(temps: string[]) {
  const { root } = newRepo('trove-agent-');
  temps.push(root);
  writeFileSync(join(root, 'a.md'), '# A\n\nText.\n');
  // Presence: a dead pid is gone, a live one is here, and only claude and codex are looked for.
  assert.deepEqual([alive(process.pid), alive(2 ** 22 + 7), agentAbove(process.pid, 'other')], [true, false, null]);
  const opts = { root, agent: null };
  let { app, port } = await listen(opts);
  const source = async () => (await call(port, 'GET', '/api/source')).body;
  const none = { id: 'other', label: 'the agent', connected: false, at: null };
  assert.deepEqual([(await source()).agentInfo, (await source()).agent], [none, 'other'], 'nothing attached');
  assert.equal((await call(port, 'POST', '/api/agent', { id: 'cursor' })).status, 400);
  const codex = await call(port, 'POST', '/api/agent', { id: 'codex' });
  assert.deepEqual([codex.status, codex.body.id, codex.body.label, codex.body.connected], [200, 'codex', 'Codex', true]);
  assert.deepEqual([(await source()).agentInfo, (await source()).agent], [codex.body, 'other'], '/api/source reflects it');
  const anchor = { quote: 'Text', prefix: '', suffix: '', path: [], raw: '' };
  await call(port, 'POST', '/api/drafts', { path: 'a.md', drafts: [{ kind: 'change', note: 'n', anchor }] });
  const sent = (await call(port, 'POST', '/api/send', {})).body;
  const hash = sha(readFileSync(join(root, 'a.md'), 'utf8'));
  assert.equal((await call(port, 'POST', '/api/accept', { path: 'a.md', hash })).body.error, 'Codex is working on this file', 'BUSY names it');
  await call(port, 'POST', '/api/agent', { id: 'other', label: 'Cursor' });
  assert.equal((await call(port, 'POST', '/api/accept', { path: 'a.md', hash })).body.error, 'Cursor is working on this file', 'a label of its own');
  const claude = (await call(port, 'POST', '/api/agent', { id: 'claude' })).body;
  await app.close();
  ({ app, port } = await listen(opts));
  assert.deepEqual([(await source()).agentInfo, (await source()).agent], [{ ...claude, connected: false }, 'claude'],
    'who attached survives a restart; with no process to follow, connected does not');
  assert.deepEqual((await call(port, 'POST', '/api/agent', { id: null })).body, none, 'detach');
  // Activity: past sends from the batches log, then this run's moves; any other events-log line as written.
  appendFileSync((await source()).eventsLog, 'pr 7: opened\n');
  const activity = (await call(port, 'GET', '/api/activity')).body.entries.map((e: any) => [e.kind, e.text, e.comments]);
  assert.deepEqual(activity, [['batch', sent.id, 1], ['detach', 'Claude', undefined], ['event', 'pr 7: opened', undefined]]);
  assert.equal((await call(port, 'GET', '/api/activity', undefined, { host: 'evil.example' })).status, 403);
  assert.equal((await call(port, 'POST', '/api/accept', { path: 'a.md', hash })).body.error, 'The agent is working on this file');
  await app.close();
  ({ app, port } = await listen(opts));
  assert.deepEqual((await source()).agentInfo, none, 'detach survives a restart');
  await app.close();
  ({ app, port } = await listen({ root, agent: 'claude' }));
  assert.deepEqual([(await source()).agentInfo.label, (await source()).agentInfo.connected], ['Claude', true], 'the serving agent is attached');
  await app.close();
}

// A folder outside any git repository is refused, and the probe says so.
function notARepo(temps: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'trove-plain-'));
  temps.push(root);
  writeFileSync(join(root, 'a.md'), '# A\n');
  assert.equal(probeGit(root), null);
  assert.throws(() => createApp({ root, log: () => {} }), { message: `not a git repository: ${root}` });
}
