// Updates from GitHub Releases without Squirrel. Squirrel.Mac installs an update only when its code
// signature satisfies the running app's, and an ad-hoc signature is different on every build, so it
// would refuse every one. Instead Trove downloads the release's installer itself, checks it against
// the SHA-256 the release publishes beside it, copies the app out of it, and on Restart swaps its own
// bundle with a short script that runs once Trove has quit.
import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { UpdateState } from '@trove/core';

const run = promisify(execFile);
const REPO = 'fcarysnyder/trove';
const EVERY = 6 * 60 * 60 * 1000;

let state: UpdateState = { state: 'none' };
let changed: (s: UpdateState) => void = () => {};
const put = (s: UpdateState) => { state = s; changed(s); };
export const updateState = () => state;

/** a > b, for plain major.minor.patch versions. */
const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

/** The running app's bundle (…/Trove.app), or null outside a packaged app. */
const bundle = () => {
  const b = resolve(process.execPath, '../../..');
  return app.isPackaged && b.endsWith('.app') ? b : null;
};

/**
 * Look for a newer release and, when there is one, download and verify it so Restart can install it.
 * Resolves with what it found; never throws (a failed check leaves `error` and tries again later).
 */
export async function checkForUpdate(): Promise<UpdateState> {
  if (!bundle() || state.state === 'downloading' || state.state === 'ready') return state;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const rel = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    const version = rel.tag_name.replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version) || !newer(version, app.getVersion())) return put({ state: 'none' }), state;
    const url = (name: string) => {
      const a = rel.assets.find((x) => x.name === name);
      if (!a) throw new Error(`${name} is missing from the release`);
      return a.browser_download_url;
    };
    put({ state: 'downloading', version });
    const dir = join(app.getPath('temp'), `trove-update-${version}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const dmgName = `Installer-Trove-${version}-arm64.dmg`;
    const [dmg, sum] = await Promise.all([fetch(url(dmgName)), fetch(url(`Checksum-Trove-${version}-arm64.dmg.sha256`))]);
    if (!dmg.ok || !sum.ok) throw new Error('The download failed');
    const bytes = Buffer.from(await dmg.arrayBuffer());
    const want = (await sum.text()).trim().split(/\s+/)[0];
    if (createHash('sha256').update(bytes).digest('hex') !== want) throw new Error('The download does not match its checksum');
    const file = join(dir, dmgName), mnt = join(dir, 'mnt'), next = join(dir, 'Trove.app');
    writeFileSync(file, bytes);
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mnt, file]);
    try { await run('ditto', [join(mnt, 'Trove.app'), next]); } finally { await run('hdiutil', ['detach', mnt]).catch(() => {}); }
    return put({ state: 'ready', version }), state;
  } catch (e) {
    return put({ state: 'error', message: e instanceof Error ? e.message : String(e) }), state;
  }
}

/**
 * Quit, swap the bundle and relaunch. The old app is moved aside first and put back if the copy fails,
 * so a failed update leaves the version that was running.
 */
export function installUpdate(): void {
  const target = bundle();
  if (state.state !== 'ready' || !target) return;
  const dir = join(app.getPath('temp'), `trove-update-${state.version}`);
  const script = join(dir, 'install.sh');
  const q = (p: string) => `'${p.replaceAll("'", "'\\''")}'`;
  writeFileSync(script, [
    '#!/bin/sh',
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done`,
    `old=${q(join(dir, 'old.app'))}; rm -rf "$old"`,
    `if mv ${q(target)} "$old" && ditto ${q(join(dir, 'Trove.app'))} ${q(target)}; then rm -rf "$old"; else rm -rf ${q(target)}; mv "$old" ${q(target)}; fi`,
    `open ${q(target)}`,
  ].join('\n'));
  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

/** Check now and every few hours; `onChange` hears each new state (the menu and the start page show it). */
export function watchForUpdates(onChange: (s: UpdateState) => void): void {
  changed = onChange;
  if (!bundle()) return;
  void checkForUpdate();
  setInterval(() => void checkForUpdate(), EVERY).unref();
}
