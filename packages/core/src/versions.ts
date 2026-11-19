// A folder's numbered copies of each file: `<stateDir>/versions/<sha1 of path>/<n>.json` = {n, at, by, text}.
// Git has its own history; only a folder source keeps these.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha } from './source.js';
import type { Version, VersionBy } from './types.js';

// ponytail: the last 50 per file, each a whole copy; store diffs if big files with many saves fill the disk.
export const KEEP_VERSIONS = 50;

export function versionStore(stateDir: string) {
  const dirOf = (rel: string) => join(stateDir, 'versions', sha(rel));
  const numbers = (rel: string) => {
    try { return readdirSync(dirOf(rel)).map((f) => parseInt(f, 10)).filter((n) => n > 0).sort((a, b) => b - a); } catch { return []; }
  };
  const get = (rel: string, n: number): (Version & { text: string }) | null => {
    try { return JSON.parse(readFileSync(join(dirOf(rel), `${n}.json`), 'utf8')); } catch { return null; }
  };
  /** Newest first, without the text. ponytail: reads every copy (at most 50) to list them; keep an index file if that gets slow. */
  const list = (rel: string): Version[] => numbers(rel).flatMap((n) => { const v = get(rel, n); return v ? [{ n: v.n, at: v.at, by: v.by }] : []; });
  function add(rel: string, by: VersionBy, text: string): Version {
    const [last] = numbers(rel);
    const prev = last ? get(rel, last) : null;
    if (prev && prev.text === text) return { n: prev.n, at: prev.at, by: prev.by };
    const v = { n: (last ?? 0) + 1, at: new Date().toISOString(), by, text };
    mkdirSync(dirOf(rel), { recursive: true });
    writeFileSync(join(dirOf(rel), `${v.n}.json`), JSON.stringify(v));
    for (const old of numbers(rel).slice(KEEP_VERSIONS)) rmSync(join(dirOf(rel), `${old}.json`), { force: true });
    return { n: v.n, at: v.at, by };
  }
  /** What the text on disk is: the first copy (original), or, when it differs from the last copy, someone else's (agent). */
  const notice = (rel: string, text: string) => add(rel, numbers(rel).length ? 'agent' : 'original', text);
  return { list, get, add, notice };
}
