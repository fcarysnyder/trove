import { DEFAULT_DOC_TYPES, type DocType, type Settings } from '@trove/core/types';

export const typeOn = (s: Settings, t: DocType) => s.types[t.id] ?? t.enabled;

export const parseExclude = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * What Save posts: only the keys the draft changed. `types` goes whole when any type changed, and
 * a type set back to its default still counts as set. `changes` counts each changed type and field.
 */
export function diffSettings(saved: Settings, draft: Settings): { patch: Partial<Settings>; changes: number } {
  const patch: Partial<Settings> = {};
  let changes = 0;
  const typeChanges = DEFAULT_DOC_TYPES.filter((t) => typeOn(saved, t) !== typeOn(draft, t)).length;
  if (typeChanges) { patch.types = { ...draft.types }; changes += typeChanges; }
  if (JSON.stringify(saved.exclude) !== JSON.stringify(draft.exclude)) { patch.exclude = draft.exclude; changes++; }
  for (const k of ['theme', 'scope', 'base', 'showNew'] as const) {
    if (saved[k] !== draft[k]) { (patch as Record<string, unknown>)[k] = draft[k]; changes++; }
  }
  return { patch, changes };
}
