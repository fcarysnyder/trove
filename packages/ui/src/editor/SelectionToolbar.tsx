import { Copy, MessageCircleQuestion, MessageSquarePlus, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { IconButton } from './bits';
import { useNames, useStore } from './store';
import { pickAction } from './doc/commands';
import { frameEl } from './doc/dom';

/** A pill just above the selection (below it when there is no room), while the selection lasts. */
export function SelectionToolbar() {
  const pick = useStore((s) => s.pick);
  const n = useNames();
  const ref = useRef<HTMLDivElement>(null);
  const [, redraw] = useReducer((k: number) => k + 1, 0);
  useEffect(() => {
    window.addEventListener('doc-scroll', redraw);
    window.addEventListener('resize', redraw);
    return () => { window.removeEventListener('doc-scroll', redraw); window.removeEventListener('resize', redraw); };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pick) return;
    const inFrame = pick.range.startContainer.ownerDocument !== document;
    const off = inFrame ? frameEl()?.getBoundingClientRect() ?? { left: 0, top: 0 } : { left: 0, top: 0 };
    const box = pick.range.getBoundingClientRect();
    const top = box.top + off.top, bottom = box.bottom + off.top;
    const view = document.getElementById('doc')!.getBoundingClientRect();
    const away = bottom < view.top || top > view.bottom; // scrolled away from the selection
    const above = top - el.offsetHeight - 6;
    Object.assign(el.style, { left: `${box.left + off.left}px`, top: `${above >= view.top ? above : bottom + 6}px`, visibility: away ? 'hidden' : 'visible' });
  });
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
