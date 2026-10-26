// The Files column's search and filters: which rows the tree shows, and so what j/k, the n / N
// position and Accept and next step through.
import { stateOf, type ReviewState } from '@trove/core/anchor';
import type { FileRow } from '@trove/core/types';
import { PROGRESS } from './status';

/** One filter per review state, in the pill's order, then Committed. Each file has exactly one. */
export type FilterKey = ReviewState | 'committed';
export const FILTERS: FilterKey[] = [...PROGRESS, 'committed'];

type Row = Pick<FileRow, 'path' | 'state' | 'updated' | 'edited' | 'drafts' | 'committed'>;

export const keyOf = (f: Row): FilterKey => (f.committed ? 'committed' : stateOf(f));

/** Pending only hides everything already decided: accepted, skipped, rejected, committed. */
export const PENDING_OFF: FilterKey[] = ['accepted', 'skipped', 'rejected', 'committed'];
export const isPendingOnly = (off: FilterKey[]) => off.length === PENDING_OFF.length && PENDING_OFF.every((k) => off.includes(k));

/** The filters turned off, in FILTERS order, unknown keys dropped (storage can hold anything). */
export const normalizeOff = (off: unknown): FilterKey[] => (Array.isArray(off) ? FILTERS.filter((k) => off.includes(k)) : []);
export const toggleOff = (off: FilterKey[], key: FilterKey, on: boolean) =>
  normalizeOff(on ? off.filter((k) => k !== key) : [...off, key]);

/** Case-insensitive substring over the whole path, folder and name. */
export const matches = (path: string, query: string) => !query || path.toLowerCase().includes(query.toLowerCase());

/** The file passes the filters and the search. */
export const passes = (f: Row, off: FilterKey[], query: string) => !off.includes(keyOf(f)) && matches(f.path, query);

/** Where the search hits the file's name, as [start, end) in the name; the last hit in the path, so a name hit wins over a folder hit. */
export function markRange(path: string, query: string): [number, number] | null {
  if (!query) return null;
  const at = path.toLowerCase().lastIndexOf(query.toLowerCase());
  if (at < 0) return null;
  const nameAt = path.lastIndexOf('/') + 1;
  const end = at + query.length;
  return end <= nameAt ? null : [Math.max(at, nameAt) - nameAt, end - nameAt];
}

/** Files per filter, so each checkbox shows how many it holds. */
export const countKeys = (files: Row[]) =>
  files.reduce((c, f) => (c[keyOf(f)]++, c), Object.fromEntries(FILTERS.map((k) => [k, 0])) as Record<FilterKey, number>);
