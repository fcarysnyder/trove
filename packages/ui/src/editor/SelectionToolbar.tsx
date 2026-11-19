import { AtSign, Copy, MessageCircleQuestion, MessageSquare, MessageSquarePlus, Pencil } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Popover, PopoverAnchor, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover';
import { addComment } from './actions';
import { IconButton } from './bits';
import { NoteField } from './ChangesColumn';
import { set, useNames, useStore } from './store';
import { pickAction } from './doc/commands';
import { frameEl, nodeEl } from './doc/dom';

/**
 * A Popover anchor at `range`, in this window's coordinates even when the range is in the HTML frame.
 * `contextElement` is what floating-ui follows: its scroll containers (#doc) and moves reposition the popover.
 */
export function rangeAnchor(range: Range) {
  const frame = range.startContainer.ownerDocument !== document ? frameEl() : null;
  return {
    current: {
      getBoundingClientRect() {
        const r = range.getBoundingClientRect();
        const off = frame?.getBoundingClientRect();
        return off ? new DOMRect(r.x + off.x, r.y + off.y, r.width, r.height) : r;
      },
      contextElement: frame ?? nodeEl(range.startContainer) ?? undefined,
    },
  };
}

// Their lifecycle is the store's (selection, keys.ts, Cancel/Add), not Radix's outside-click and focus rules.
const keep = (e: Event) => e.preventDefault();

/** A pill just above the selection (below it when #doc has no room), while the selection lasts. */
export function SelectionToolbar() {
  const pick = useStore((s) => s.pick);
  const n = useNames();
  const anchor = useMemo(() => pick && rangeAnchor(pick.range), [pick?.range]);
  if (!pick || !anchor) return null;
  const tools = [
    ['change', `Comment: ask ${n.agent} to change this (C)`, 'Comment', MessageSquarePlus],
    ['explain', `Explain: ask ${n.agent} about this, without changing it (E)`, 'Explain', MessageCircleQuestion],
    ['chat', `Add to chat: quote this in your next message to ${n.agent} (A)`, 'Add to chat', AtSign],
    ['edit', 'Edit this block yourself', 'Edit this block', Pencil],
    ['copy', 'Copy the selected text', 'Copy', Copy],
  ] as const;
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent data-pick role="toolbar" aria-label="Selection" side="top" align="start" sideOffset={6}
        collisionBoundary={document.getElementById('doc')} sticky="always" hideWhenDetached
        onOpenAutoFocus={keep} onCloseAutoFocus={keep} onInteractOutside={keep} onEscapeKeyDown={keep}
        onMouseDown={(e) => e.preventDefault()} // keep the selection
        className="w-auto flex-row gap-0.5 rounded-full p-0.5 shadow-lg">
        {tools.map(([act, tip, label, I]) => (
          <IconButton key={act} label={label} tip={tip} side="top" className="size-7 rounded-full" onClick={() => pickAction(act)}><I /></IconButton>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Writing a comment, in a card under the passage it is about (over it when there is more room there), which
 * stays marked (the `composing` highlight) while it is open. It never leaves the window: as the note grows the
 * card is capped at the room it has and the note scrolls. Added, it joins the Changes column like any other.
 */
export function CommentPopover() {
  const composer = useStore((s) => s.composer);
  const n = useNames();
  const anchor = useMemo(() => composer && rangeAnchor(composer.range), [composer?.range]);
  useEffect(() => {
    const view = composer?.range.startContainer.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!composer || !view?.CSS?.highlights) return;
    view.CSS.highlights.set('composing', new view.Highlight(composer.range));
    return () => void view.CSS.highlights.delete('composing');
  }, [composer]);
  if (!composer || !anchor) return null;
  const { kind, anchor: { quote } } = composer;
  const Kind = kind === 'explain' ? MessageCircleQuestion : MessageSquare;
  const label = kind === 'explain' ? 'Explain' : 'Comment';
  const cancel = () => set({ composer: null });
  return (
    <Popover open onOpenChange={(o) => { if (!o) cancel(); }}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent aria-label={label} side="bottom" align="start" sideOffset={6} sticky="always" hideWhenDetached
        onCloseAutoFocus={keep} onInteractOutside={keep} className="w-80 gap-2.5 p-3 shadow-lg">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground"><Kind className="size-3.5" aria-hidden />{label}</PopoverTitle>
        </PopoverHeader>
        <blockquote className="line-clamp-3 shrink-0 border-l-2 pl-2 text-muted-foreground">{quote}</blockquote>
        <NoteField value="" placeholder={kind === 'explain' ? `What should ${n.agent} explain?` : 'What should change?'} verb="Add"
          submit={addComment} cancel={cancel} />
      </PopoverContent>
    </Popover>
  );
}
