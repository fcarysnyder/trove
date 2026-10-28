import { Copy, MessageCircleQuestion, MessageSquare, MessageSquarePlus, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';
import { addComment } from './actions';
import { IconButton } from './bits';
import { NoteField } from './ChangesColumn';
import { set, useNames, useStore } from './store';
import { pickAction } from './doc/commands';
import { frameEl } from './doc/dom';

/**
 * Keeps `ref` (position: fixed) at `range` as the document scrolls: on the preferred side of it, the
 * other when that side has no room, slid inside the view when neither has, hidden while the passage is scrolled away.
 */
function useAtRange(ref: RefObject<HTMLDivElement | null>, range: Range | undefined, side: 'above' | 'below') {
  const [, redraw] = useReducer((k: number) => k + 1, 0);
  useEffect(() => {
    window.addEventListener('doc-scroll', redraw);
    window.addEventListener('resize', redraw);
    return () => { window.removeEventListener('doc-scroll', redraw); window.removeEventListener('resize', redraw); };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !range) return;
    const inFrame = range.startContainer.ownerDocument !== document;
    const off = inFrame ? frameEl()?.getBoundingClientRect() ?? { left: 0, top: 0 } : { left: 0, top: 0 };
    const box = range.getBoundingClientRect();
    const top = box.top + off.top, bottom = box.bottom + off.top;
    const view = document.getElementById('doc')!.getBoundingClientRect();
    const away = bottom < view.top || top > view.bottom; // scrolled away from the selection
    const above = top - el.offsetHeight - 6, below = bottom + 6;
    const fitsAbove = above >= view.top, fitsBelow = below + el.offsetHeight <= view.bottom;
    const wanted = side === 'above' ? (fitsAbove ? above : below) : (fitsBelow || !fitsAbove ? below : above);
    // Neither side has room (a tall card, a passage near an edge): slide it inside the view, over the passage if it must.
    const y = Math.max(view.top + 6, Math.min(wanted, view.bottom - el.offsetHeight - 6));
    const x = Math.max(8, Math.min(box.left + off.left, window.innerWidth - el.offsetWidth - 8));
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, visibility: away ? 'hidden' : 'visible' });
  });
}

/** A pill just above the selection (below it when there is no room), while the selection lasts. */
export function SelectionToolbar() {
  const pick = useStore((s) => s.pick);
  const n = useNames();
  const ref = useRef<HTMLDivElement>(null);
  useAtRange(ref, pick?.range, 'above');
  if (!pick) return null;
  const tools = [
    ['change', `Comment: ask ${n.agent} to change this (C)`, 'Comment', MessageSquarePlus],
    ['explain', `Explain: ask ${n.agent} about this, without changing it (E)`, 'Explain', MessageCircleQuestion],
    ['edit', 'Edit this block yourself', 'Edit this block', Pencil],
    ['copy', 'Copy the selected text', 'Copy', Copy],
  ] as const;
  return (
    <div ref={ref} data-pick role="toolbar" aria-label="Selection" onMouseDown={(e) => e.preventDefault()}
      className="fixed z-30 flex origin-left gap-0.5 rounded-full border bg-popover p-0.5 shadow-lg animate-in fade-in-0 zoom-in-[.97] duration-150 motion-reduce:zoom-in-100">
      {tools.map(([act, tip, label, I]) => (
        <IconButton key={act} label={label} tip={tip} side="top" className="size-7 rounded-full" onClick={() => pickAction(act)}><I /></IconButton>
      ))}
    </div>
  );
}

/**
 * Writing a comment, in a card under the passage it is about, which stays marked (the `composing`
 * highlight) while focus is in the card. Added, it joins the Changes column like any other.
 */
export function CommentPopover() {
  const composer = useStore((s) => s.composer);
  const n = useNames();
  const ref = useRef<HTMLDivElement>(null);
  useAtRange(ref, composer?.range, 'below');
  useEffect(() => {
    const view = composer?.range.startContainer.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!composer || !view?.CSS?.highlights) return;
    view.CSS.highlights.set('composing', new view.Highlight(composer.range));
    return () => void view.CSS.highlights.delete('composing');
  }, [composer]);
  if (!composer) return null;
  const { kind, anchor } = composer;
  const Kind = kind === 'explain' ? MessageCircleQuestion : MessageSquare;
  return (
    <div ref={ref} role="dialog" aria-label={kind === 'explain' ? 'Explain' : 'Comment'}
      className="fixed z-30 flex w-80 origin-top-left flex-col rounded-lg border bg-popover px-3 pt-2.5 shadow-lg animate-in fade-in-0 zoom-in-[.97] duration-150 motion-reduce:zoom-in-100">
      <div className="flex min-h-6 items-center gap-1.5 text-xs text-muted-foreground">
        <Kind className="size-3.5" aria-hidden /><span>{kind === 'explain' ? 'Explain' : 'Comment'}</span>
      </div>
      <div className="my-1.5 line-clamp-3 border-l-2 pl-2 text-muted-foreground">{anchor.quote}</div>
      <NoteField value="" placeholder={kind === 'explain' ? `What should ${n.agent} explain?` : 'What should change?'} verb="Add"
        submit={addComment} cancel={() => set({ composer: null })} />
    </div>
  );
}
