// Marking HTML files by their elements: the floating toolbar over the document, the layer over the
// frame (hover and pick outlines, loops, each comment's numbered badges) and the note card. The frame
// logic is in doc/annotate.ts; a mark is added as an ordinary Draft.
import type { CommentKind } from '@trove/core/types';
import { GripHorizontal, Lasso, Maximize2, MessageCircleQuestion, MessageSquare, Minimize2, MousePointer2, TextCursor } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { load, save } from '@/lib/storage';
import { plural } from '@/lib/text';
import { addComment, focusComment, togglePanel } from './actions';
import { Count, IconButton } from './bits';
import { NoteField } from './ChangesColumn';
import { useNames, useStore } from './store';
import { bounds, canMark, cardField, elementAnchor, getAnn, resolve, setAnn, setTool, summary, describe, useAnn, type Pt, type Tool } from './doc/annotate';
import { frameEl } from './doc/dom';

/** Add the pending mark as a comment with this note; the card closes. */
export function commitMark(note: string) {
  const { mark, kind } = getAnn();
  const els = mark?.els.filter((el) => el.isConnected) ?? [];
  if (!note || !els.length) return;
  addComment(note, { kind, anchor: elementAnchor(els, mark!.shape) });
  setAnn({ mark: null, kind: 'change' });
}
const dropMark = () => setAnn({ mark: null, kind: 'change' });

const TOOLS = [
  ['text', 'Select text', 'T', TextCursor],
  ['pointer', 'Pointer', 'V', MousePointer2],
  ['loop', 'Loop', 'L', Lasso],
] as const;

type Pos = { x: number; y: number } | null;

/**
 * Docked at the doc view's left edge, centred; dragged by its grip it stays where it was left (kept
 * inside the view), and a double-click on the grip docks it again.
 */
export function AnnotateBar() {
  const html = useStore((s) => s.current?.kind === 'html');
  const count = useStore((s) => s.current?.drafts.length ?? 0);
  const can = useStore(canMark);
  const focus = useStore((s) => s.hidden.files && s.hidden.changes);
  const tool = useAnn((s) => s.tool);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>(() => load<Pos>('annotate-bar', null));
  const [size, setSize] = useState({ w: 42, h: 280 });
  const drag = useRef<{ dx: number; dy: number; at: Pos } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  if (!html) return null;
  const active: Tool = can ? tool : 'text';

  const grip = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const r = ref.current!.getBoundingClientRect();
      drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, at: pos };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current, box = ref.current?.offsetParent?.getBoundingClientRect();
      if (!d || !box) return;
      d.at = { x: Math.round(e.clientX - box.left - d.dx), y: Math.round(e.clientY - box.top - d.dy) };
      setPos(d.at);
    },
    onPointerUp: () => {
      if (drag.current) save('annotate-bar', drag.current.at);
      drag.current = null;
    },
    onDoubleClick: () => { setPos(null); save('annotate-bar', null); },
  };
  const place = pos
    ? { left: `clamp(8px, ${pos.x}px, calc(100% - ${size.w + 8}px))`, top: `clamp(8px, ${pos.y}px, calc(100% - ${size.h + 8}px))` }
    : { left: 4, top: `max(4px, calc(50% - ${size.h / 2}px))` };
  return (
    // Focus stays where it was (the page or the frame), so V, L and T keep working after a click here.
    <div ref={ref} role="toolbar" aria-label="Annotate" aria-orientation="vertical" style={place} onMouseDown={(e) => e.preventDefault()}
      className="absolute z-20 flex max-h-[calc(100%-8px)] flex-col items-center gap-0.5 overflow-y-auto rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur-sm [scrollbar-width:none]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Move toolbar" {...grip} onPointerCancel={grip.onPointerUp}
            className="grid h-5 w-8 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing">
            <GripHorizontal className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Drag to move, double-click to dock</TooltipContent>
      </Tooltip>
      {TOOLS.map(([t, label, key, Icon]) => (
        <IconButton key={t} label={label} tip={`${label} (${key})`} side="right" aria-pressed={active === t} disabled={t !== 'text' && !can}
          className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85"
          onClick={() => setTool(active === t ? 'text' : t)}><Icon /></IconButton>
      ))}
      <Separator className="my-0.5 data-horizontal:w-5" />
      <IconButton label={plural(count, 'comment')} side="right" className="relative" onClick={() => togglePanel('changes', false)}>
        <MessageSquare />{count > 0 && <Count n={count} className="absolute -top-1 -right-1" />}
      </IconButton>
      <IconButton label={focus ? 'Show files and agent' : 'Hide files and agent'} side="right" aria-pressed={focus} className="aria-pressed:bg-muted aria-pressed:text-foreground"
        onClick={() => { togglePanel('files', !focus); togglePanel('changes', !focus); }}>
        {focus ? <Minimize2 /> : <Maximize2 />}
      </IconButton>
    </div>
  );
}

/**
 * Over the frame, the same size: the Pointer's hover outline, the pending mark's outlines (and its
 * loop), the loop being drawn, and every element comment's number badge and faint loop. Drawn from
 * the frame's layout on each change to it; only the badges take the pointer.
 */
export function AnnotateLayer({ loads }: { loads: number }) {
  const drafts = useStore((s) => s.current?.drafts);
  const editing = useStore((s) => !!s.editing);
  const { tool, mark, hover, drawing, flash } = useAnn((s) => s);
  const [shown, setShown] = useState<number | null>(null); // a badge under the pointer: its comment's elements outlined
  const [, redraw] = useReducer((k: number) => k + 1, 0);

  // The page can move under the marks: scrolled panes, a resized column, a prototype changing itself.
  useEffect(() => {
    const f = frameEl(), d = f?.contentDocument, w = d?.defaultView;
    setAnn({ mark: null, hover: null, drawing: null });
    if (!f || !d?.body || !w) return;
    let raf = 0;
    const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(redraw); };
    const outer = new ResizeObserver(tick), inner = new w.ResizeObserver(tick), mo = new MutationObserver(tick);
    outer.observe(f);
    inner.observe(d.body);
    mo.observe(d.body, { subtree: true, childList: true, attributes: true, characterData: true });
    d.addEventListener('scroll', tick, true);
    tick();
    return () => {
      cancelAnimationFrame(raf);
      outer.disconnect(); inner.disconnect(); mo.disconnect();
      d.removeEventListener('scroll', tick, true);
      setAnn({ mark: null, hover: null, drawing: null });
    };
  }, [loads]);

  const frame = frameEl();
  const doc = frame?.contentDocument;
  const win = doc?.defaultView;
  if (!frame || !doc?.body || !win || editing) return null;
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  const path = (pts: Pt[], close = true) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x - win.scrollX} ${y - win.scrollY}`).join(' ') + (close ? ' Z' : '');
  const comments = (drafts ?? []).map((c, k) => ({ k, c, els: (c.anchor.targets ?? []).map((t) => resolve(doc, t)).filter((el): el is Element => !!el) }));
  const stacked = new Map<Element, number>(); // a second comment on the same element puts its badge beside the first
  const badges = comments.flatMap(({ k, els }) => els.map((el) => {
    const r = box(el), n = stacked.get(el) ?? 0;
    stacked.set(el, n + 1);
    return { k, key: `${k}:${n}:${r.left}`, left: r.left - 8 + n * 22, top: r.top - 8 };
  }));
  const outline = (els: Element[], cls: string, key: string) => els.filter((el) => el.isConnected).map((el, i) => (
    <div key={`${key}${i}`} className={`absolute rounded-[2px] ${cls}`} style={box(el)} />
  ));
  const flashed = flash && comments.find((x) => x.k === flash.k);
  return (
    // Clipped a little outside the frame: a badge sits over its element's corner, but nothing shows for an element scrolled out of the frame.
    <div aria-hidden={!badges.length} className="pointer-events-none absolute overflow-clip [overflow-clip-margin:12px]"
      style={{ left: frame.offsetLeft, top: frame.offsetTop, width: frame.offsetWidth, height: frame.offsetHeight }}>
      {/* Clipped to the frame: a loop is stored where it was drawn, and the page may have reflowed since. */}
      <svg className="absolute inset-0 size-full overflow-hidden">
        {comments.map(({ k, c }) => c.anchor.shape && <path key={k} d={path(c.anchor.shape.points)} className="fill-none stroke-dirty opacity-40" strokeWidth={1.5} strokeDasharray="4 3" />)}
        {mark?.shape && <path d={path(mark.shape)} className="fill-cool/10 stroke-cool" strokeWidth={1.5} />}
        {drawing && <path d={path(drawing, false)} className="fill-none stroke-cool" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {shown != null && outline(comments.find((x) => x.k === shown)?.els ?? [], 'outline-2 outline-dirty', 's')}
      {flashed && outline(flashed.els, 'flash outline-offset-2', `f${flash.at}`)}
      {tool === 'pointer' && hover && !mark?.els.includes(hover) && outline([hover], 'outline-2 outline-dashed outline-cool', 'h')}
      {mark && outline(mark.els, 'outline-2 outline-cool bg-cool/5', 'm')}
      {badges.map((b) => (
        <button key={b.key} type="button" aria-label={`Comment ${b.k + 1}`} style={{ left: b.left, top: b.top }}
          onClick={() => focusComment(b.k)} onMouseEnter={() => setShown(b.k)} onMouseLeave={() => setShown(null)}
          className="pointer-events-auto absolute grid h-5 min-w-5 place-items-center rounded-full bg-dirty px-1 text-[11px] leading-none font-semibold text-black tabular-nums shadow-sm ring-2 ring-background outline-none hover:scale-110 focus-visible:ring-ring">
          {b.k + 1}
        </button>
      ))}
      {mark && !drawing && <MarkCard />}
    </div>
  );
}

/** Where the card points: the loop's box or the picked elements', in the app's viewport, cut to the visible part of the doc view. */
function markRect(): DOMRect {
  const m = getAnn().mark, f = frameEl(), win = f?.contentWindow;
  const view = f?.closest('#doc')?.getBoundingClientRect(); // the scroller; the column's panel has id doc too
  if (!m || !f || !win || !view) return new DOMRect();
  const off = f.getBoundingClientRect();
  const b = m.shape
    ? (({ left, top, right, bottom }) => ({ left: left - win.scrollX, top: top - win.scrollY, right: right - win.scrollX, bottom: bottom - win.scrollY }))(bounds(m.shape))
    : bounds(m.els.filter((el) => el.isConnected).flatMap((el) => { const r = el.getBoundingClientRect(); return [[r.left, r.top], [r.right, r.bottom]] as Pt[]; }));
  const left = b.left + off.left, right = b.right + off.left;
  const top = Math.max(b.top + off.top, view.top), bottom = Math.min(b.bottom + off.top, view.bottom);
  if (bottom <= top) return new DOMRect(left, b.top + off.top, right - left, b.bottom - b.top); // scrolled away
  // Taller than half the view: point at its visible top, so the card opens over it rather than off screen.
  return new DOMRect(left, top, right - left, bottom - top > view.height / 2 ? 0 : bottom - top);
}

/** The note for a pending mark, beside it, kept inside the window. Comment or Explain; Add (Cmd/Ctrl+Enter), Esc cancels, a click elsewhere adds what is written. */
function MarkCard() {
  const mark = useAnn((s) => s.mark)!;
  const kind = useAnn((s) => s.kind);
  const n = useNames();
  const anchor = useRef({ getBoundingClientRect: markRect });
  return (
    <Popover open onOpenChange={(o) => { if (!o) dropMark(); }}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent data-annotate-card side="bottom" align="start" sideOffset={8} collisionPadding={8} avoidCollisions sticky="always" updatePositionStrategy="always"
        aria-label={kind === 'explain' ? 'Explain' : 'Comment'}
        className="max-h-(--radix-popover-content-available-height) w-80 gap-0 overflow-y-auto rounded-lg border px-3 pt-2.5 pb-0 shadow-lg ring-0"
        onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}
        // Clicks in the frame are the Pointer's (shift-click adds); focus moving there is not a dismissal.
        onFocusOutside={(e) => e.preventDefault()}
        onPointerDownOutside={() => { const text = cardField()?.value.trim(); if (text) commitMark(text); }}>
        <ToggleGroup type="single" size="sm" value={kind} onValueChange={(v) => v && setAnn({ kind: v as CommentKind })} aria-label="Kind" className="-ml-1.5">
          <ToggleGroupItem value="change" className="h-6 gap-1.5 px-1.5 text-xs text-muted-foreground data-[state=on]:text-foreground"><MessageSquare className="size-3.5" />Comment</ToggleGroupItem>
          <ToggleGroupItem value="explain" className="h-6 gap-1.5 px-1.5 text-xs text-muted-foreground data-[state=on]:text-foreground"><MessageCircleQuestion className="size-3.5" />Explain</ToggleGroupItem>
        </ToggleGroup>
        <div className="my-1.5 line-clamp-3 border-l-2 pl-2 text-muted-foreground [overflow-wrap:anywhere]">{summary(mark.els.filter((el) => el.isConnected).map(describe))}</div>
        <NoteField value="" placeholder={kind === 'explain' ? `What should ${n.agent} explain?` : 'What should change?'} verb="Add" submit={commitMark} cancel={dropMark} />
      </PopoverContent>
    </Popover>
  );
}
