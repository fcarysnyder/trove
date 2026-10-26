// What the document view, the editors and the header derive from the open file, computed once per
// file response (cached by identity).
import { blocks, type Blocks } from '@trove/core/anchor';
import type { BlockEdit } from '@trove/core/types';
import type { State } from '../store';
import { baseline, blockHtml, type Baseline } from './layers';

type Current = NonNullable<State['current']>;
export interface DocModel {
  parts: Blocks;
  htmls: (string | null)[]; // rendered markdown per block; null for front matter and plain text
  newness: Baseline; // against the staged copy, else HEAD
  since: Baseline; // against the text before the agent's last update
  canShowNew: boolean;
  savedEdit: (index: number | null) => BlockEdit | undefined;
}

const cache = new WeakMap<Current, DocModel>();

export function docModel(current: Current): DocModel {
  const hit = cache.get(current);
  if (hit) return hit;
  const md = current.kind === 'markdown';
  const parts: Blocks = md ? blocks(current.text) : current.kind === 'text' ? [{ type: 'text', raw: current.text, path: [] }] : [];
  const htmls = parts.map((b) => (md && b.type !== 'frontmatter' ? blockHtml(b, parts.links) : null));
  const newness = md ? baseline(current.base, parts) : null;
  const since = md ? baseline(current.since, parts) : null;
  // The saved edit for a block (or the whole file), if this review has one and it still matches.
  const savedEdit = (index: number | null) =>
    current.edits.find((x) => (index == null ? x.index == null : x.index === index && x.after === parts[index]?.raw.trimEnd()));
  const model = { parts, htmls, newness, since, savedEdit, canShowNew: !!(newness || since || (md && current.edits.some((x) => x.index != null))) };
  cache.set(current, model);
  return model;
}
