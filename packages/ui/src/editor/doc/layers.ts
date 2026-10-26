// Show new, measured on the rendered blocks: the word diffs per changed block, the CSS highlights,
// the run badges and the gutter bars. Ported from the old page's renderNew/placeBars. Nothing here
// changes a block's text: badges are empty elements whose number is CSS content.
import { addedSpans, blocks, matchBlocks, subtractSpans, wordDiff, type BlockMatch, type Blocks, type DiffOp, type Span } from '@trove/core/anchor';
import { marked } from '@trove/core/marked';
import type { BlockEdit } from '@trove/core/types';

export type Layer = 'added' | 'agent' | 'mine';
export const LAYERS: Layer[] = ['added', 'agent', 'mine'];

/** A baseline: the old text's blocks and how the open file's blocks pair with them. */
export type Baseline = (BlockMatch & { old: Blocks }) | null;

export const blockHtml = (b: Blocks[number], links: Blocks['links']): string => marked.parser(Object.assign([b.token], { links }));
const scratch = typeof document === 'undefined' ? null : document.createElement('div');
const textFromHtml = (html: string) => {
  scratch!.innerHTML = html;
  return scratch!.textContent ?? '';
};
export const textOf = (b: Blocks[number], links: Blocks['links']) => (b.type === 'frontmatter' ? b.raw : textFromHtml(blockHtml(b, links)));

export function baseline(oldText: string | null, parts: Blocks): Baseline {
  if (oldText == null) return null;
  const old = blocks(oldText);
  return { old, ...matchBlocks(old.map((b) => b.raw), parts.map((b) => b.raw)) };
}

/** Where a text offset range sits in a block's text nodes. */
export function toRange(root: Element | null | undefined, start: number, end: number): Range | null {
  if (!root) return null;
  const doc = root.ownerDocument;
  const walk = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let pos = 0, started = false, n: Node | null;
  while ((n = walk.nextNode())) {
    const len = (n as Text).length;
    if (!started && start <= pos + len) { range.setStart(n, start - pos); started = true; }
    if (started && end <= pos + len) { range.setEnd(n, end - pos); return range; }
    pos += len;
  }
  return null;
}

export interface BlockDiff { ops?: DiffOp[]; runs: Span[]; badges: { n: number; start: number; end: number }[]; cuts: number[]; mineN?: Set<number> }

/** One baseline's word diffs over the open file, per changed block. */
function diffAgainst(src: NonNullable<Baseline>, text: (i: number) => string): Map<number, BlockDiff> {
  const out = new Map<number, BlockDiff>();
  for (const [i, raw] of src.changed) {
    const t = text(i);
    if (raw === null) { out.set(i, { runs: [[0, t.length]], badges: [], cuts: [] }); continue; }
    const oldBlock = src.old.find((b) => b.raw === raw)!;
    const d: BlockDiff = { ops: wordDiff(textOf(oldBlock, src.old.links), t), runs: [], badges: [], cuts: [] };
    let at = 0, n = 0;
    for (const o of d.ops!) {
      if (o.op === '-') { d.cuts.push(at); continue; }
      const end = at + o.text.trimEnd().length;
      if (o.op === '+') n++; // counted even when blank, to keep step with the card's numbers
      if (o.op === '+' && end > at) { d.runs.push([at, end]); d.badges.push({ n, start: at, end }); }
      at += o.text.length;
    }
    out.set(i, d);
  }
  return out;
}

export interface Marks {
  ranges: { i: number; kind: Layer; range: Range }[];
  cuts: { i: number; range: Range }[];
  base: Map<number, BlockDiff>;
  agent: Map<number, BlockDiff>;
}

/**
 * Three layers, later ones winning: green, new against the base; the agent's colour, what changed
 * since the send; white, what the user wrote in a saved edit. Inserts the badges and returns the
 * marks to paint and to place bars from.
 */
export function applyLayers(body: (i: number) => Element | null, parts: Blocks, newness: Baseline, since: Baseline, saved: (i: number) => BlockEdit | undefined): Marks {
  const text = (i: number) => body(i)?.textContent ?? '';
  const marks: Marks = { ranges: [], cuts: [], base: newness ? diffAgainst(newness, text) : new Map(), agent: since ? diffAgainst(since, text) : new Map() };
  const white = new Map<number, Span[]>();
  parts.forEach((b, i) => {
    const mine = saved(i);
    if (!mine) return;
    const before = b.type === 'frontmatter' ? mine.before : textFromHtml(marked.parse(mine.before, undefined) as string);
    white.set(i, addedSpans(wordDiff(before, text(i))));
  });
  const places: [Range | null, number, string, string][] = [];
  for (const i of new Set([...marks.base.keys(), ...marks.agent.keys(), ...white.keys()])) {
    const root = body(i);
    if (!root) continue;
    const own = white.get(i) ?? [];
    const base = marks.base.get(i), agent = marks.agent.get(i);
    const layers: Record<Layer, Span[]> = {
      added: subtractSpans(subtractSpans(base?.runs ?? [], own), agent?.runs ?? []),
      agent: subtractSpans(agent?.runs ?? [], own),
      mine: own,
    };
    for (const kind of LAYERS)
      for (const [start, end] of layers[kind]) {
        const range = toRange(root, start, end);
        if (range) marks.ranges.push({ i, kind, range });
      }
    for (const at of [...(base?.cuts ?? []), ...(agent?.cuts ?? [])]) {
      const range = toRange(root, at, at);
      if (range) marks.cuts.push({ i, range });
    }
    // Badges: white when the run is all the user's words; a green run the agent's layer covers
    // gives way to the agent's own badge. Places are taken first, then filled last first, so a
    // badge going in never moves a place still to fill.
    const covered = (b: { start: number; end: number }, spans: Span[]) => !subtractSpans([[b.start, b.end]], spans).length;
    for (const [d, kind] of [[base, 'added'], [agent, 'agent']] as const) {
      if (!d) continue;
      d.mineN = new Set();
      for (const b of d.badges) {
        const mine = covered(b, own);
        if (mine) d.mineN.add(b.n);
        else if (kind === 'added' && covered(b, agent?.runs ?? [])) continue;
        places.push([toRange(root, b.end, b.end), b.n, mine ? 'mine' : kind, kind]);
      }
    }
  }
  for (const [range, n, cls, kind] of places.reverse()) range?.insertNode(badge(range.startContainer.ownerDocument!, n, cls, kind));
  return marks;
}

export function badge(doc: Document, n: number, cls: string, kind = cls) {
  const b = doc.createElement('span');
  b.className = `new-n ${cls}`;
  b.dataset.n = String(n);
  b.dataset.kind = kind;
  b.setAttribute('aria-hidden', 'true');
  return b;
}

/** The layers' highlights, set on this window's registry. */
export function paint(marks: Marks | null) {
  if (!CSS.highlights) return;
  for (const k of LAYERS) {
    const ranges = marks?.ranges.filter((r) => r.kind === k).map((r) => r.range) ?? [];
    if (ranges.length) CSS.highlights.set(k, new Highlight(...ranges));
    else CSS.highlights.delete(k);
  }
}

/**
 * Gutter bars beside only the lines that changed: each layer's line boxes merged where lines touch,
 * green, then the agent's colour, then white; a line that only lost words gets red. Measured from
 * layout, so call again whenever the column reflows.
 */
export function placeBars(blockEl: (i: number) => HTMLElement | null, marks: Marks | null) {
  document.querySelectorAll('.md .bars').forEach((b) => b.replaceChildren());
  if (!marks) return;
  const spans = (rects: DOMRect[]) => {
    const out: { top: number; bottom: number }[] = [];
    for (const r of rects.filter((r) => r.height).sort((a, b) => a.top - b.top)) {
      const last = out.at(-1);
      if (last && r.top <= last.bottom + r.height / 2) last.bottom = Math.max(last.bottom, r.bottom);
      else out.push({ top: r.top, bottom: r.bottom });
    }
    return out;
  };
  const rangesBy = Map.groupBy(marks.ranges, (r) => r.i);
  const cutsBy = Map.groupBy(marks.cuts, (r) => r.i);
  for (const i of new Set([...rangesBy.keys(), ...cutsBy.keys()])) {
    const block = blockEl(i);
    const bars = block?.querySelector('.bars');
    if (!block || !bars) continue;
    const top = block.getBoundingClientRect().top;
    const layers = LAYERS.map((k) => [k, spans((rangesBy.get(i) ?? []).filter((r) => r.kind === k).flatMap((r) => [...r.range.getClientRects()]))] as const);
    const lost = spans((cutsBy.get(i) ?? []).map((r) => r.range.getBoundingClientRect()))
      .filter((s) => !layers.some(([, l]) => l.some((a) => s.top < a.bottom && s.bottom > a.top)));
    for (const [kind, list] of [...layers, ['cut', lost] as const])
      for (const s of list) {
        const bar = document.createElement('span');
        bar.className = `chg ${kind}`;
        bar.dataset.kind = kind;
        Object.assign(bar.style, { top: `${s.top - top}px`, height: `${s.bottom - s.top}px` });
        bars.append(bar);
      }
  }
}

/** The editor tint: runs of the textarea's value new against each baseline, as [start, end, layer], in order. */
export function tintRuns(value: string, old: string | null, prior: string | null, mine: string | null): [number, number, Layer][] {
  const spans = (from: string | null) => (from == null ? [] : addedSpans(wordDiff(from, value)));
  const own = spans(mine), agent = subtractSpans(spans(prior), own);
  const added = subtractSpans(subtractSpans(spans(old), own), spans(prior));
  return [
    ...added.map(([s, e]) => [s, e, 'added'] as [number, number, Layer]),
    ...agent.map(([s, e]) => [s, e, 'agent'] as [number, number, Layer]),
    ...own.map(([s, e]) => [s, e, 'mine'] as [number, number, Layer]),
  ].sort((a, b) => a[0] - b[0]);
}
