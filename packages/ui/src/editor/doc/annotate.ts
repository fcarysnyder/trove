// Marking an HTML file by its elements: the Pointer and Loop tools, what they pick in the frame, and
// what each picked element carries so the agent can find it in source. The geometry and the selector
// steps are pure (lib.test.ts); the rest reads the frame's DOM. A mark becomes an ordinary Draft.
import type { AnchorHit } from '@trove/core/anchor';
import type { Anchor, CommentKind, ElementTarget } from '@trove/core/types';
import { useSyncExternalStore } from 'react';
import { get } from '../store';
import { frameEl, headingPath } from './dom';

export type Pt = [number, number];
export interface Box { left: number; top: number; right: number; bottom: number }

// ---- pure ----------------------------------------------------------------------------------

export const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Even-odd ray cast, so a loop that crosses itself still has an inside. */
export function inPolygon([x, y]: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The share of a box inside the loop, sampled on an n×n grid. */
export function coverage(b: Box, poly: Pt[], n = 5) {
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (inPolygon([b.left + ((i + 0.5) * (b.right - b.left)) / n, b.top + ((j + 0.5) * (b.bottom - b.top)) / n], poly)) k++;
  return k / (n * n);
}

export function bounds(pts: Pt[]): Box {
  const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const [x, y] of pts) Object.assign(b, { left: Math.min(b.left, x), top: Math.min(b.top, y), right: Math.max(b.right, x), bottom: Math.max(b.bottom, y) });
  return b;
}

const MOSTLY = 0.6;
const MAX_TARGETS = 20; // ponytail: a loop around a long list keeps its first 20 elements; the shape still says where

/**
 * The fewest elements a loop encloses: from the roots down, an element mostly inside it is taken whole
 * and its descendants are not; any other is searched (children can overflow their parent). With none,
 * the deepest element that holds the whole loop.
 */
export function enclosed<T>(roots: T[], box: (t: T) => Box | null, kids: (t: T) => T[], poly: Pt[]): T[] {
  const lb = bounds(poly);
  const out: T[] = [];
  const visit = (t: T) => {
    const b = box(t);
    const touches = b && b.right > b.left && b.bottom > b.top && b.left < lb.right && b.right > lb.left && b.top < lb.bottom && b.bottom > lb.top;
    if (touches && coverage(b, poly) >= MOSTLY) return void out.push(t);
    kids(t).forEach(visit);
  };
  roots.forEach(visit);
  if (out.length) return out.slice(0, MAX_TARGETS);
  let hold: T | null = null;
  for (let level = roots; ;) {
    const next = level.find((t) => { const b = box(t); return !!b && b.left <= lb.left && b.top <= lb.top && b.right >= lb.right && b.bottom >= lb.bottom; });
    if (!next) break;
    hold = next;
    level = kids(next);
  }
  return hold ? [hold] : [];
}

function toSegment([x, y]: Pt, [ax, ay]: Pt, [bx, by]: Pt) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0]!, b = pts.at(-1)!;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = toSegment(pts[i]!, a, b);
    if (d > far) { far = d; at = i; }
  }
  if (far <= eps) return [a, b];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}
/** Ramer–Douglas–Peucker, loosened until at most `max` points are left, then rounded. */
export function simplify(pts: Pt[], max = 64): Pt[] {
  let out = pts;
  for (let eps = 1; (out = rdp(pts, eps)).length > max; eps *= 1.5);
  return out.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

/** One step from an element toward the page root: its tag, its id when that is unique and CSS-escaped, its place among same-tag siblings (0: it has none). */
export interface Step { tag: string; id?: string; nth: number }
/** Steps listed element first: stops at the first unique id; nth-of-type only where a tag repeats. */
export function selectorOf(steps: Step[]): string {
  const out: string[] = [];
  for (const s of steps) {
    if (s.id) { out.unshift(`#${s.id}`); break; }
    out.unshift(s.nth ? `${s.tag}:nth-of-type(${s.nth})` : s.tag);
  }
  return out.join(' > ');
}

/** A target as one short phrase: its text, else `<tag.class>`. */
export const nameOf = (t: Pick<ElementTarget, 'tag' | 'classes' | 'text'>) => (t.text ? clip(t.text, 60) : `<${[t.tag, ...(t.classes?.slice(0, 1) ?? [])].join('.')}>`);
/** What a mark's anchor quotes: its targets, named. */
export const summary = (targets: Pick<ElementTarget, 'tag' | 'classes' | 'text'>[]) => clip(targets.map(nameOf).join(' · '), 160);

// ---- the frame's DOM ------------------------------------------------------------------------

export function selectorFor(el: Element): string {
  const doc = el.ownerDocument;
  const steps: Step[] = [];
  for (let n: Element | null = el; n && n !== doc.documentElement; n = n.parentElement) {
    const id = n.id && doc.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1 ? CSS.escape(n.id) : undefined;
    const twins = n.parentElement ? [...n.parentElement.children].filter((c) => c.localName === n!.localName) : [];
    steps.push({ tag: n.localName, id, nth: twins.length > 1 ? twins.indexOf(n) + 1 : 0 });
  }
  return selectorOf(steps);
}

/** Its text nodes joined by spaces, so `<h3>Revenue</h3><div>$12,400</div>` reads as two words; scripts and styles left out. */
function textOf(el: Element) {
  const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n: Node | null; (n = walk.nextNode()); ) if (!/^(script|style|template)$/.test(n.parentElement?.localName ?? '')) out.push(n.nodeValue ?? '');
  return out.join(' ');
}

export function describe(el: Element): ElementTarget {
  const testIds: string[] = [];
  for (let n: Element | null = el; n && n !== el.ownerDocument.body; n = n.parentElement)
    for (const a of ['data-testid', 'data-component']) { const v = n.getAttribute(a); if (v) testIds.push(v); }
  const text = clip(textOf(el), 160) || clip(el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? el.getAttribute('title'), 160);
  return {
    selector: selectorFor(el),
    tag: el.localName,
    ...(el.id ? { id: el.id } : {}),
    ...(el.classList.length ? { classes: [...el.classList] } : {}),
    ...(testIds.length ? { testIds } : {}),
    ...(text ? { text } : {}),
    html: clip(el.outerHTML, 400),
  };
}

/** The element a target names now, if its selector still finds one of the same tag. */
export function resolve(doc: Document | null | undefined, t: ElementTarget): Element | null {
  try {
    const el = doc?.querySelector(t.selector);
    return el?.localName === t.tag ? el : null;
  } catch {
    return null;
  }
}

export function elementAnchor(els: Element[], shape?: Pt[]): Anchor {
  const targets = els.map(describe);
  return {
    quote: summary(targets), prefix: '', suffix: '', path: headingPath(els[0]!.ownerDocument, els[0]!), raw: targets[0]!.html, targets,
    ...(shape ? { shape: { kind: 'loop' as const, points: shape } } : {}),
  };
}

/** An element comment counts as found while any of its targets is still on the page; it has no text range. */
export const elementHit = (anchor: Anchor): AnchorHit | null =>
  anchor.targets!.some((t) => resolve(frameEl()?.contentDocument, t)) ? { i: 0, start: 0, end: 0, score: 0 } : null;

/** The elements a loop (document coordinates) encloses. */
function looped(doc: Document, poly: Pt[]): Element[] {
  const win = doc.defaultView!;
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: r.left + win.scrollX, top: r.top + win.scrollY, right: r.right + win.scrollX, bottom: r.bottom + win.scrollY };
  };
  const SKIP = new Set(['script', 'style', 'template', 'noscript', 'svg']);
  const kids = (el: Element) => (SKIP.has(el.localName) ? [] : [...el.children]);
  return enclosed([...doc.body.children], box, kids, poly);
}

// ---- tool state -------------------------------------------------------------------------------

export type Tool = 'text' | 'pointer' | 'loop';
/** A pending mark: the elements picked (shift-click adds or removes), and the loop when it was drawn. */
export interface Mark { els: Element[]; shape?: Pt[] }
export interface AnnState {
  tool: Tool;
  mark: Mark | null; // its note card is open
  kind: CommentKind; // what the card adds: a change or a question
  hover: Element | null; // the Pointer's outline
  drawing: Pt[] | null; // a loop being drawn, document coordinates
  flash: { k: number; at: number } | null; // a comment's elements, outlined for a moment
}
let state: AnnState = { tool: 'text', mark: null, kind: 'change', hover: null, drawing: null, flash: null };
const listeners = new Set<() => void>();
export const getAnn = () => state;
export function setAnn(patch: Partial<AnnState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const useAnn = <T,>(pick: (s: AnnState) => T): T =>
  useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => pick(state));

/** Pointer and Loop mark the open HTML file; neither works on a locked file or under an open edit. */
export const canMark = () => { const s = get(); return s.current?.kind === 'html' && !s.current.locked && !s.editing; };

export function setTool(tool: Tool) {
  if (tool !== 'text' && !canMark()) return;
  setAnn({ tool, mark: null, kind: 'change', hover: null, drawing: null });
  const root = frameEl()?.contentDocument?.documentElement;
  if (root) root.dataset.troveTool = tool;
}

/** Esc: let go of the pending mark, else back to selecting text. */
export function escapeTool() {
  if (state.mark) setAnn({ mark: null, kind: 'change' });
  else setTool('text');
}

export const cardField = () => document.querySelector<HTMLTextAreaElement>('[data-annotate-card] textarea');
export const focusCard = () => requestAnimationFrame(() => cardField()?.focus());

/** Bring a comment's elements into view and outline them for a moment. */
export function showTargets(k: number) {
  const doc = frameEl()?.contentDocument;
  const el = get().current?.drafts[k]?.anchor.targets?.map((t) => resolve(doc, t)).find(Boolean);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setAnn({ flash: { k, at: Date.now() } });
}

// The frame's cursors while a tool is on; page styles lose to !important.
const FRAME_CSS = `html[data-trove-tool=pointer], html[data-trove-tool=pointer] * { cursor: default !important; }
html[data-trove-tool=loop], html[data-trove-tool=loop] * { cursor: crosshair !important; user-select: none !important; }`;

/**
 * Called on each frame load. While Pointer or Loop is on, the page never sees a click: its buttons,
 * links and forms stay put, and the text-selection toolbar stays away. Capture on the frame's window
 * runs before the page's own listeners and DocColumn's.
 */
export function wireFrame(doc: Document, commit: (text: string) => void) {
  const win = doc.defaultView;
  if (!win) return;
  const style = doc.createElement('style');
  style.textContent = FRAME_CSS;
  doc.head.append(style);
  doc.documentElement.dataset.troveTool = state.tool;
  const on = () => state.tool !== 'text' && canMark();
  const pickable = (t: EventTarget | null) => (t instanceof win.Element && t !== doc.documentElement && t !== doc.body ? t : null);
  const at = (e: PointerEvent): Pt => [e.clientX + win.scrollX, e.clientY + win.scrollY];
  const swallow = (e: Event) => { if (on()) { e.preventDefault(); e.stopPropagation(); } };
  for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'auxclick']) win.addEventListener(type, swallow, true);

  win.addEventListener('pointerdown', (e) => {
    if (!on() || e.button !== 0) return;
    swallow(e);
    const el = state.tool === 'pointer' ? pickable(e.target) : null;
    const els = state.mark?.els ?? [];
    if (el && e.shiftKey) {
      // Shift adds an element to what the note is about, or takes it back out.
      const next = els.includes(el) ? els.filter((x) => x !== el) : [...els, el];
      setAnn({ mark: next.length ? { els: next } : null });
      return focusCard();
    }
    if (el && els.length === 1 && els[0] === el) return focusCard();
    // Clicking away from a written note adds it; an empty one is let go.
    const text = cardField()?.value.trim();
    if (text && state.mark) commit(text);
    if (state.tool === 'loop') {
      setAnn({ drawing: [at(e)], mark: null });
      return doc.documentElement.setPointerCapture(e.pointerId); // the loop can leave the frame and come back
    }
    setAnn({ mark: el ? { els: [el] } : null });
    if (el) focusCard();
  }, true);

  win.addEventListener('pointermove', (e) => {
    if (!on()) return;
    if (state.drawing) {
      const p = at(e), last = state.drawing.at(-1)!;
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 3) setAnn({ drawing: [...state.drawing, p] });
      return;
    }
    const el = state.tool === 'pointer' ? pickable(e.target) : null;
    if (el !== state.hover) setAnn({ hover: el });
  }, true);
  doc.documentElement.addEventListener('pointerleave', () => { if (state.hover) setAnn({ hover: null }); });

  const finish = (e: PointerEvent) => {
    const pts = state.drawing;
    if (!pts) return;
    swallow(e);
    setAnn({ drawing: null });
    const b = bounds(pts);
    if (b.right - b.left < 8 || b.bottom - b.top < 8) return; // a click or a stroke, not a loop
    const poly = simplify([...pts, at(e)]);
    const els = looped(doc, poly);
    setAnn({ mark: { els: els.length ? els : [doc.body], shape: poly } });
    focusCard();
  };
  win.addEventListener('pointerup', finish, true);
  win.addEventListener('pointercancel', () => setAnn({ drawing: null }), true);
}
