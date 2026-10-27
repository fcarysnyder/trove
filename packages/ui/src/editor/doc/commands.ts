// Commands shared by the document, the selection toolbar, Changes and the keyboard.
import { makeAnchor } from '@trove/core/anchor';
import { toast } from 'sonner';
import { flash, open, setShowNew } from '../actions';
import { get, set } from '../store';
import { toRange } from './layers';
import { docModel } from './model';
import { blockEl, bodyOf, frameEl, headingPath, nodeEl } from './dom';

/** Tables and front matter edit in the modal; HTML files whole in the modal; the rest inline. */
const MODAL: Record<string, string> = { table: 'Edit table', frontmatter: 'Edit front matter' };

export function editBlock(i: number | null) {
  const { current, editing } = get();
  if (!current || current.locked || editing) return;
  getSelection()?.removeAllRanges();
  const base = { hash: current.hash };
  if (current.kind === 'html') return set({ pick: null, editing: { ...base, index: null, mode: 'modal', value: current.text, title: 'Edit file' } });
  if (current.kind === 'text') return set({ pick: null, editing: { ...base, index: null, mode: 'inline', value: current.text } });
  if (i == null) return;
  const b = docModel(current).parts[i];
  if (!b) return;
  const mode = MODAL[b.type] ? 'modal' : 'inline';
  const body = bodyOf(i);
  const cs = body && getComputedStyle(body.firstElementChild ?? body);
  const style = cs ? { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, marginTop: cs.marginTop, marginBottom: cs.marginBottom } : undefined;
  set({ pick: null, editing: { ...base, index: i, mode, value: b.raw.trimEnd(), title: MODAL[b.type] ?? 'Edit block', style } });
}

/** Expand: move an inline edit into the modal, keeping the hash it started with. */
export const expandEdit = (value: string) => set((s) => (s.editing ? { editing: { ...s.editing, mode: 'modal', value, title: s.editing.title ?? 'Edit block' } } : {}));

export function toggleNew() {
  const { current, editing, showNew } = get();
  if (!current || editing || !docModel(current).canShowNew) return; // an open editor keeps the tint it opened with
  setShowNew(!showNew);
}

/** Offer the selection toolbar for a selection inside one block (or the HTML frame). */
export function onSelect(doc: Document, target: EventTarget | null) {
  if ((target as Element | null)?.closest?.('[data-pick]')) return;
  setTimeout(() => {
    if (get().pick) set({ pick: null });
    const { current, editing, composer } = get();
    const sel = doc.getSelection();
    if (!current || current.locked || editing || composer || !sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const inFrame = doc !== document;
    const body = inFrame ? doc.body : nodeEl(r.startContainer)?.closest<HTMLElement>('.md .block-body');
    // ponytail: one markdown block per comment; a selection across blocks offers nothing.
    if (!body || (!inFrame && body !== nodeEl(r.endContainer)?.closest('.md .block-body'))) return;
    const before = doc.createRange();
    before.setStart(body, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const start = before.toString().length;
    const text = r.toString();
    const i = inFrame ? null : Number(body.parentElement?.dataset.i);
    const part = i == null ? null : docModel(current).parts[i];
    const path = part ? part.path : headingPath(doc, r.startContainer);
    const raw = part ? part.raw : (nodeEl(r.commonAncestorContainer) as Element | null)?.outerHTML ?? '';
    set({ pick: { anchor: makeAnchor(body.textContent ?? '', start, start + text.length, path, raw), text, range: r, block: i } });
  });
}

export function pickAction(act: 'change' | 'explain' | 'edit' | 'copy') {
  const { pick } = get();
  if (!pick) return;
  set({ pick: null });
  if (act === 'change' || act === 'explain') {
    set({ composer: { kind: act, anchor: pick.anchor, range: pick.range } });
  } else if (act === 'edit') editBlock(pick.block);
  else navigator.clipboard.writeText(pick.text).then(() => toast('Copied'), () => toast('Copy failed'));
}

/** Open the comment's file if needed, then bring its passage into view and flash it. */
export async function showPassage(path: string, n: number) {
  if (path !== get().current?.path) {
    await open(path);
    await new Promise((r) => requestAnimationFrame(r));
  }
  const hit = get().hits[n];
  const range = hit && toRange(bodyOf(hit.i), hit.start, hit.end);
  if (!range) return;
  range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const view = range.startContainer.ownerDocument?.defaultView;
  if (!view?.CSS?.highlights) return;
  view.CSS.highlights.set('flash', new view.Highlight(range));
  setTimeout(() => view.CSS.highlights.delete('flash'), 1200);
}

/** Open the edit's file if needed, then bring its block (or the whole file) into view and flash it. */
export async function showBlock(path: string, index: number | null) {
  if (path !== get().current?.path) {
    await open(path);
    await new Promise((r) => requestAnimationFrame(r));
  }
  flash(index == null ? frameEl() ?? document.querySelector('.md') : blockEl(index));
}
