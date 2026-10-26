// Blocks, comment anchors, review states and the Show new diff. No DOM and no Node imports: the
// browser UI, the server and the tests all import it. Anchor offsets are into one block's rendered
// text (its textContent).
import { lexer } from './vendor/marked.esm.mjs';
import type { Anchor, FileRow } from './types.js';

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const CONTEXT = 32;

export interface Block {
  type: string; // marked token type, or 'frontmatter'
  raw: string;
  token?: any; // the marked token, for rendering (absent on front matter)
  path: string[]; // heading path the block sits under; a heading's path ends with itself
}
export type Blocks = Block[] & { links?: Record<string, unknown> };

/**
 * The file split into top-level blocks whose raws join back to the file byte for byte. Blank-line
 * tokens fold into the block before them, so every block is something to show.
 */
export function blocks(src: string): Blocks {
  const out: Blocks = [];
  const fm = src.match(FRONT_MATTER);
  if (fm) out.push({ type: 'frontmatter', raw: fm[0], path: [] });
  const tokens: any = lexer(src.slice(fm ? fm[0].length : 0));
  const path: (string | undefined)[] = [];
  for (const token of tokens) {
    if (token.type === 'space' && out.length) {
      out[out.length - 1].raw += token.raw;
      continue;
    }
    if (token.type === 'heading') {
      path.length = token.depth - 1;
      path[token.depth - 1] = token.text;
    }
    out.push({ type: token.type, raw: token.raw, token, path: path.filter((h): h is string => h !== undefined) });
  }
  out.links = tokens.links;
  return out;
}

/** Replace block i, keeping the block's trailing blank lines so it cannot run into the next one. */
export function splice(src: string, i: number, raw: string): string {
  const all = blocks(src);
  if (!Number.isInteger(i) || !all[i]) throw new RangeError(`no block ${i}`);
  all[i].raw = raw.trimEnd() + (all[i].raw.match(/\s*$/) as RegExpMatchArray)[0];
  return all.map((b) => b.raw).join('');
}

export function makeAnchor(text: string, start: number, end: number, path: string[], raw = ''): Anchor {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    path,
    raw: raw.slice(0, 400),
  };
}

export interface AnchorHit { i: number; start: number; end: number; score: number }

/**
 * items[i] = {text, path} per block. Searches the anchor's own section first, then the whole
 * file; prefix and suffix break ties. Null means unanchored: the caller keeps the comment.
 */
export function findAnchor(items: { text: string; path: string[] }[], anchor: Anchor | null | undefined): AnchorHit | null {
  if (!anchor?.quote) return null;
  const key = anchor.path.join('\n');
  for (const inSection of [true, false]) {
    let best: AnchorHit | null = null;
    items.forEach(({ text, path }, i) => {
      if (inSection && path.join('\n') !== key) return;
      for (let s = text.indexOf(anchor.quote); s !== -1; s = text.indexOf(anchor.quote, s + 1)) {
        const end = s + anchor.quote.length;
        const score = shared(text.slice(0, s), anchor.prefix, true) + shared(text.slice(end), anchor.suffix, false);
        if (!best || score > best.score) best = { i, start: s, end, score };
      }
    });
    if (best) return best;
  }
  return null;
}

export type ReviewState = 'working' | 'rejected' | 'accepted' | 'skipped' | 'updated' | 'edited' | 'drafts' | 'pending';
export type StateCounts = Record<ReviewState, number>;

/**
 * Review state of a file, first match wins: the server's state (working, rejected, accepted,
 * skipped), then updated by the agent, edited, has comments, pending. The tree icons, footer and
 * progress pill all use it.
 */
export const stateOf = (f: Pick<FileRow, 'state' | 'updated' | 'edited' | 'drafts'>): ReviewState =>
  f.state !== 'queue' ? f.state : f.updated ? 'updated' : f.edited ? 'edited' : f.drafts ? 'drafts' : 'pending';
export const countStates = (files: Pick<FileRow, 'state' | 'updated' | 'edited' | 'drafts'>[]): StateCounts =>
  files.reduce((c, f) => (c[stateOf(f)]++, c),
    { accepted: 0, rejected: 0, skipped: 0, updated: 0, edited: 0, drafts: 0, working: 0, pending: 0 } as StateCounts);

export interface BlockMatch {
  /** new block index -> the old raw it replaced, or null for an added block */
  changed: Map<number, string | null>;
  /** old raws no new block replaced, each with the new block index it sat before */
  removed: { before: number; raw: string }[];
}

/**
 * What is new in a file since `base`, block by block. Unchanged blocks match on their trimmed raw;
 * in each run between matches a new block pairs with the most similar old block still unpaired
 * after the last pairing (half its words shared, at least).
 */
export function matchBlocks(oldRaws: string[], newRaws: string[]): BlockMatch {
  const key = (r: string) => r.trim();
  const changed = new Map<number, string | null>();
  const removed: { before: number; raw: string }[] = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...lcs(oldRaws.map(key), newRaws.map(key)), [oldRaws.length, newRaws.length] as [number, number]]) {
    let from = i;
    for (; j < pj; j++) {
      let best = -1, score = 0.5;
      for (let k = from; k < pi; k++) {
        const s = similarity(oldRaws[k], newRaws[j]);
        if (s >= score) [best, score] = [k, s];
      }
      if (best === -1) { changed.set(j, null); continue; }
      for (; from < best; from++) removed.push({ before: j, raw: oldRaws[from] });
      changed.set(j, oldRaws[best]);
      from = best + 1;
    }
    for (; from < pi; from++) removed.push({ before: pj, raw: oldRaws[from] });
    [i, j] = [pi + 1, pj + 1];
  }
  return { changed, removed };
}

export type DiffOp = { op: '+' | '-'; text: string } | { op: '='; text: string; old: string };

/**
 * Word diff of two strings: runs of {op: '=' | '+' | '-', text}. A word keeps its trailing space
 * but matches without it, so an '=' run carries both spellings: `text` is b's (its lengths are
 * offsets into b), `old` is a's.
 */
export function wordDiff(a: string, b: string): DiffOp[] {
  const split = (s: string) => s.match(/[\p{L}\p{N}_]+\s*|[^\p{L}\p{N}_\s]+\s*|\s+/gu) ?? [];
  const x = split(a), y = split(b);
  const out: DiffOp[] = [];
  const push = (op: '+' | '-' | '=', text: string, old = '') => {
    const last = out[out.length - 1];
    if (last?.op !== op) return out.push(op === '=' ? { op, text, old } : { op, text });
    last.text += text;
    if (last.op === '=') last.old += old;
  };
  const trim = (t: string) => t.trimEnd();
  let i = 0, j = 0;
  for (const [pi, pj] of [...lcs(x.map(trim), y.map(trim)), [x.length, y.length] as [number, number]]) {
    while (i < pi) push('-', x[i++]);
    while (j < pj) push('+', y[j++]);
    if (i < x.length) push('=', y[j++], x[i++]);
  }
  return out;
}

export type Span = [number, number];

/** Where wordDiff's '+' runs sit in b, trailing space left off: [[start, end]], in order. */
export function addedSpans(ops: DiffOp[]): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const { op, text } of ops) {
    if (op === '-') continue;
    const end = at + text.trimEnd().length;
    if (op === '+' && end > at) out.push([at, end]);
    at += text.length;
  }
  return out;
}

/** Spans a with spans b cut out of them; both [[start, end]], sorted and disjoint. */
export function subtractSpans(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (let [s, e] of a) {
    for (const [bs, be] of b) {
      if (be <= s || bs >= e) continue;
      if (bs > s) out.push([s, bs]);
      s = Math.max(s, be);
    }
    if (s < e) out.push([s, e]);
  }
  return out;
}

const similarity = (a: string, b: string) => {
  const ops = wordDiff(a, b);
  const len = (op: string) => ops.reduce((n, o) => n + (o.op === op ? o.text.length : 0), 0);
  return (2 * len('=')) / (a.length + b.length || 1);
};

/** Longest common subsequence of two arrays (by ===), as [i, j] pairs in order. O(n·m). */
function lcs<T>(a: T[], b: T[]): [number, number][] {
  const t = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Characters two strings share at their ends (fromEnd) or starts. */
function shared(a: string, b: string, fromEnd: boolean): number {
  let n = 0;
  while (n < a.length && n < b.length && (fromEnd ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])) n++;
  return n;
}
