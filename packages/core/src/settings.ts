// Per-source settings in <stateDir>/settings.json, merged over DEFAULT_SETTINGS, and the doc-type
// helpers every listing goes through: which extensions are on, a path's DocKind, the exclude globs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DOC_TYPES, DEFAULT_SETTINGS, type DocKind, type DocType, type Settings } from './types.js';

export const settingsFile = (stateDir: string) => join(stateDir, 'settings.json');

export function loadSettings(stateDir: string): Settings {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(readFileSync(settingsFile(stateDir), 'utf8')); } catch {}
  // A hand-edited file with a bad key loses that key, not the whole file.
  let s = DEFAULT_SETTINGS;
  for (const [k, v] of Object.entries(saved ?? {})) try { s = mergeSettings(s, { [k]: v }); } catch {}
  return s;
}

export const saveSettings = (stateDir: string, s: Settings) => writeFileSync(settingsFile(stateDir), JSON.stringify(s, null, 1));

/** `base` with each valid key of `patch` applied. Throws (a 400 at the route) on a key of the wrong shape. */
export function mergeSettings(base: Settings, patch: unknown): Settings {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('settings must be an object');
  const p = patch as Record<string, unknown>;
  const out: Settings = { ...base, types: { ...base.types }, exclude: [...base.exclude] };
  const bad = (key: string) => { throw new TypeError(`bad setting: ${key}`); };
  if ('types' in p) {
    if (!p.types || typeof p.types !== 'object' || Array.isArray(p.types) || !Object.values(p.types).every((v) => typeof v === 'boolean')) bad('types');
    Object.assign(out.types, p.types);
  }
  if ('exclude' in p) {
    if (!Array.isArray(p.exclude) || !p.exclude.every((g) => typeof g === 'string' && g.trim())) bad('exclude');
    out.exclude = (p.exclude as string[]).map((g) => g.trim());
  }
  if ('theme' in p) { if (!['system', 'light', 'dark'].includes(p.theme as string)) bad('theme'); out.theme = p.theme as Settings['theme']; }
  if ('scope' in p) { if (!['uncommitted', 'branch'].includes(p.scope as string)) bad('scope'); out.scope = p.scope as Settings['scope']; }
  if ('base' in p) { if (p.base !== null && (typeof p.base !== 'string' || !p.base.trim())) bad('base'); out.base = p.base === null ? null : (p.base as string).trim(); }
  if ('showNew' in p) { if (typeof p.showNew !== 'boolean') bad('showNew'); out.showNew = p.showNew as boolean; }
  return out;
}

export const enabledTypes = (s: Settings): DocType[] => DEFAULT_DOC_TYPES.filter((t) => s.types[t.id] ?? t.enabled);

/** The kind a path renders as, or null when no enabled doc type claims its extension. */
export function kindOf(path: string, s: Settings): DocKind | null {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  return enabledTypes(s).find((t) => t.extensions.some((e) => name.endsWith(e) && name.length > e.length))?.kind ?? null;
}

// Git's `:(glob)` pathspec rules, so the seen set excludes what git would:
// `*` and `?` stop at `/`, `**/` is any number of folders, a trailing `/**` everything inside.
// ponytail: no `[...]` classes (matched literally); add them if someone's exclude needs one.
const globRe = (g: string) => new RegExp('^' + g.replace(/\*\*\/|\/\*\*$|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (m) =>
  m === '**/' ? '(?:.*/)?' : m === '/**' ? '/.*' : m === '**' ? '.*' : m === '*' ? '[^/]*' : m === '?' ? '[^/]' : '\\' + m) + '$');
export const excluded = (path: string, s: Settings) => s.exclude.some((g) => globRe(g).test(path));

/** In the queue as far as settings go: an enabled doc type and not excluded. */
export const included = (path: string, s: Settings) => kindOf(path, s) !== null && !excluded(path, s);
