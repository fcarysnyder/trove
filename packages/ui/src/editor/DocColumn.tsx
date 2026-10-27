import { findAnchor, type AnchorHit } from '@trove/core/anchor';
import type { DiffOp } from '@trove/core/anchor';
import { GitBranch, MessageSquare, PanelLeft, PanelRight, Pencil, Undo2 } from 'lucide-react';
import { recentName } from '@trove/core/types';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { status } from '@/lib/status';
import { nameOf, plural, tilde } from '@/lib/text';
import { cn } from '@/lib/utils';
import { accept, entry, focusComment, loadRecents, nextPending, openRecent, openWorktree, post, reject, restore, revertAll, setShowNew, skip, togglePanel } from './actions';
import { Count, IconButton, nothingText, PathLabel } from './bits';
import { StateIcons } from './StateIcon';
import { get, set, useNames, useStore } from './store';
import { editBlock, onSelect } from './doc/commands';
import { blockEl, bodyOf } from './doc/dom';
import { InlineEditor } from './doc/Editors';
import { applyLayers, paint, placeBars, textOf, toRange, type Marks } from './doc/layers';
import { docModel } from './doc/model';
import { onKey } from './keys';

export function DocColumn() {
  const current = useStore((s) => s.current);
  const hidden = useStore((s) => s.hidden);
  const showNew = useStore((s) => s.showNew);
  const editing = useStore((s) => s.editing);
  const model = current && docModel(current);
  const own = current ? current.drafts.length + current.edits.length : 0;
  const newTip = model?.canShowNew ? 'Show new (N)' : current?.kind === 'markdown' ? 'No earlier version to compare with' : 'Markdown files only';
  return (
    <section aria-label="File" className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        {hidden.files && <IconButton side="bottom" label="Show files" tip="Show files ([)" className="-ml-2" onClick={() => togglePanel('files', false)}><PanelLeft /></IconButton>}
        <span className="flex min-w-0 flex-1 items-center font-semibold">
          {current && <PathLabel path={current.path} nameClass="text-foreground" />}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-2">
              <Switch id="show-new" size="default" checked={showNew} disabled={!model?.canShowNew || !!editing} onCheckedChange={setShowNew} />
              <Label htmlFor="show-new" className="text-xs font-normal whitespace-nowrap text-muted-foreground peer-disabled:opacity-40">Show new</Label>
            </span>
          </TooltipTrigger>
          <TooltipContent>{newTip}</TooltipContent>
        </Tooltip>
        {hidden.changes && (
          <IconButton side="bottom" label={own ? `Show changes, ${plural(own, 'change')}` : 'Show changes'} tip="Show changes (])" className="relative" onClick={() => togglePanel('changes', false)}>
            {own > 0 && <span aria-hidden className="absolute top-px right-px size-2 rounded-full bg-destructive shadow-[0_0_0_1.5px_var(--background)]" />}
            <PanelRight />
          </IconButton>
        )}
      </div>
      <DocBody />
      <DocFooter />
    </section>
  );
}

function DocBody() {
  const current = useStore((s) => s.current);
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div ref={scroller} id="doc" onScroll={() => window.dispatchEvent(new Event('doc-scroll'))}
      className={cn('min-h-0 flex-1 overflow-auto py-6 [container-type:inline-size]', current?.locked && 'doc-locked')}>
      {current ? <DocView key={current.path} /> : <Nothing />}
    </div>
  );
}

/** No file open: pick one, or, with nothing to review here, the worktrees and recent repositories that have changes. */
function Nothing() {
  const loaded = useStore((s) => s.loaded);
  const any = useStore((s) => s.files.length > 0);
  const source = useStore((s) => s.source);
  const git = useStore((s) => s.git);
  const recents = useStore((s) => s.recents);
  useEffect(() => { void loadRecents(); }, []);
  if (!loaded) return null;
  if (any) return <p className="grid min-h-full place-items-center text-muted-foreground">Select a file</p>;
  const ours = new Set(git?.worktrees.map((w) => w.path));
  const elsewhere = [
    ...(git?.worktrees ?? []).filter((w) => !w.current && w.changes).map((w) => ({
      key: w.path, title: w.main ? `${git!.repo.name} · main checkout` : `${git!.repo.name} / ${w.name}`, sub: w.branch ?? w.head, n: w.changes!, go: () => openWorktree(w.path),
    })),
    ...recents.filter((r) => r.changes && !ours.has(r.path)).map((r) => ({ key: r.path, title: recentName(r), sub: tilde(r.path), n: r.changes!, go: () => openRecent(r) })),
  ];
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6">
      <p className="font-medium text-foreground">{nothingText(source)}</p>
      {elsewhere.length > 0 && (
        <div className="flex w-full max-w-sm flex-col">
          <span className="px-2 pb-1 text-xs text-muted-foreground">Changes elsewhere</span>
          {elsewhere.map((e) => (
            <button key={e.key} onClick={() => void e.go()} title={e.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-foreground">{e.title}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{e.sub}</span>
              </span>
              <Count n={e.n} />
            </button>
          ))}
        </div>
      )}
      {git && (
        <Button variant="outline" onClick={() => set({ switcher: 'branch' })}>
          <GitBranch />Switch branch or repository
        </Button>
      )}
    </div>
  );
}

interface Card { target: Element; label: string; ops: DiffOp[]; kind: string; mineN?: Set<number>; y: number }

function DocView() {
  const current = useStore((s) => s.current)!;
  const showNew = useStore((s) => s.showNew);
  const editing = useStore((s) => s.editing);
  const hits = useStore((s) => s.hits);
  const n = useNames();
  const model = docModel(current);
  const md = useRef<HTMLDivElement>(null);
  const marks = useRef<Marks | null>(null);
  const [frameLoads, setFrameLoads] = useState(0); // the HTML frame's text is measurable once it has loaded
  const [card, setCard] = useState<Card | null>(null);
  const layered = showNew && !editing && current.kind === 'markdown';

  // Show new: tints, badges and bars, measured on the rendered blocks.
  useLayoutEffect(() => {
    md.current?.querySelectorAll('.new-n').forEach((b) => b.remove());
    marks.current = layered ? applyLayers(bodyOf, model.parts, model.newness, model.since, model.savedEdit) : null;
    paint(marks.current);
    placeBars(blockEl, marks.current);
    setCard(null);
  }, [model, layered]);
  useEffect(() => {
    let frame = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => placeBars(blockEl, marks.current)); });
    if (md.current) ro.observe(md.current);
    return () => { ro.disconnect(); paint(null); };
  }, []);

  // Comments: find each anchored passage and highlight it; unanchored ones stay listed in Changes.
  useLayoutEffect(() => {
    if (editing) return;
    let found: (AnchorHit | null)[];
    if (current.kind === 'html') {
      // ponytail: the whole body is one block, so the heading path does not narrow the search; prefix and suffix break ties.
      const text = frameLoads ? bodyOf(null)?.textContent ?? null : null;
      found = current.drafts.map((c) => (text == null ? null : findAnchor([{ text, path: c.anchor.path }], c.anchor)));
    } else {
      const items = model.parts.map((b, i) => ({ text: bodyOf(i)?.textContent ?? '', path: b.path }));
      found = current.drafts.map((c) => findAnchor(items, c.anchor));
    }
    if (JSON.stringify(found) !== JSON.stringify(get().hits)) set({ hits: found });
    const view = (current.kind === 'html' ? document.querySelector<HTMLIFrameElement>('iframe.doc-frame')?.contentWindow : window) as (Window & typeof globalThis) | null | undefined;
    const ranges = found.flatMap((h) => (h ? [toRange(bodyOf(h.i), h.start, h.end)] : [])).filter((r): r is Range => !!r);
    if (view?.CSS?.highlights) view.CSS.highlights.set('comment', new view.Highlight(...ranges));
  }, [model, current.drafts, frameLoads, editing]);
  useEffect(() => () => { CSS.highlights?.delete('comment'); set({ hits: [] }); }, []);

  useEffect(() => {
    const up = (e: MouseEvent) => onSelect(document, e.target);
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);
  useEffect(() => {
    const hide = () => setCard(null);
    window.addEventListener('doc-scroll', hide);
    return () => window.removeEventListener('doc-scroll', hide);
  }, []);

  // A click on a highlighted passage brings its comment into view in Changes.
  const commentAt = (e: MouseEvent | ReactMouseEvent) => {
    const t = e.target as Element;
    if (!t.ownerDocument.getSelection()?.isCollapsed || t.closest('button')) return;
    const inside = (r: DOMRect) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const i = get().hits.findIndex((h) => h && [...(toRange(bodyOf(h.i), h.start, h.end)?.getClientRects() ?? [])].some(inside));
    if (i >= 0) focusComment(i);
  };

  // Hovering a tint, badge or bar opens the Before card for its layer.
  const onMove = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (!layered || !marks.current) return setCard(null);
    const gone = t.closest<HTMLElement>('.gone');
    const show = (c: Omit<Card, 'y'>) => setCard((old) => (old?.target === c.target && old.label === c.label ? old : { ...c, y: e.clientY }));
    if (gone) return show({ target: gone, label: 'Removed', ops: [{ op: '=', text: '', old: gone.dataset.text ?? '' }], kind: 'added' });
    const block = t.closest<HTMLElement>('.block');
    if (!block) return setCard(null);
    const i = Number(block.dataset.i);
    const m = marks.current;
    const inside = (r: DOMRect) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const hit = t.dataset.kind ?? m.ranges.find((r) => r.i === i && [...r.range.getClientRects()].some(inside))?.kind;
    const base = m.base.get(i), agent = m.agent.get(i);
    if (!hit) return setCard(null);
    const useAgent = !!agent?.ops && (hit === 'agent' || !base?.ops);
    const d = useAgent ? agent : base;
    if (!d?.ops) return setCard(null);
    show({ target: block, label: useAgent ? `Before ${n.agent}'s update` : 'Before', ops: d.ops, kind: useAgent ? 'agent' : 'added', mineN: d.mineN });
  };

  // Comment markers in the right gutter: one per block with comments, its count as CSS content.
  const markers = new Map<number, [first: number, count: number]>();
  hits.forEach((h, k) => h && markers.set(h.i, [markers.get(h.i)?.[0] ?? k, (markers.get(h.i)?.[1] ?? 0) + 1]));

  // Whole blocks removed, from either baseline, as one red bar where they sat.
  const gone = new Map<number, string>();
  if (layered) {
    const removed = [...(model.newness?.removed ?? []).map((r) => [r, model.newness!] as const), ...(model.since?.removed ?? []).map((r) => [r, model.since!] as const)];
    for (const [before, list] of Map.groupBy(removed, ([r]) => r.before))
      gone.set(before, [...new Set(list.map(([r, src]) => textOf(src.old.find((b) => b.raw === r.raw)!, src.old.links).trim()))].join('\n\n'));
  }
  const goneBar = (i: number) => gone.has(i) && <div className="gone" data-text={gone.get(i)} />;

  if (current.kind === 'html') {
    return (
      <>
        <iframe
          key={current.hash}
          className="doc-frame mx-12 block min-h-[60vh] w-[calc(100%-96px)] rounded-lg border-0 bg-white"
          sandbox="allow-same-origin"
          title="Rendered file"
          srcDoc={current.text}
          onLoad={(e) => {
            const doc = e.currentTarget.contentDocument;
            if (!doc) return;
            const style = doc.createElement('style');
            style.textContent = '::highlight(comment) { background: rgb(255 208 0 / .4); } ::highlight(flash) { background: rgb(255 208 0 / .7); }';
            doc.head.append(style);
            doc.addEventListener('mouseup', (ev) => onSelect(doc, ev.target));
            doc.addEventListener('click', commentAt);
            doc.addEventListener('selectionchange', () => { if (get().pick && doc.getSelection()?.isCollapsed) set({ pick: null }); });
            doc.addEventListener('keydown', onKey);
            doc.addEventListener('dblclick', () => editBlock(null));
            e.currentTarget.style.height = `${doc.documentElement.scrollHeight}px`;
            setFrameLoads((k) => k + 1);
          }}
        />
        {card && <DiffCard card={card} />}
      </>
    );
  }

  return (
    <div ref={md} className={cn('md', editing && 'doc-editing')} onClick={commentAt} onMouseMove={onMove} onMouseLeave={() => setCard(null)}
      onDoubleClick={(e) => { const b = (e.target as Element).closest<HTMLElement>('.block'); if (b && !(e.target as Element).closest('textarea, button')) editBlock(Number(b.dataset.i)); }}>
      {model.parts.map((b, i) => (
        <Fragment key={i}>
          {goneBar(i)}
          <div className="block" data-i={i}>
            {editing?.mode === 'inline' && (editing.index === i || (editing.index == null && current.kind === 'text')) ? <InlineEditor editing={editing} /> : (
              <>
                {b.type === 'frontmatter' ? <div className="block-body"><pre className="fm">{b.raw}</pre></div>
                  : b.type === 'text' ? <div className="block-body"><pre className="text">{b.raw}</pre></div>
                  : <div className="block-body" dangerouslySetInnerHTML={{ __html: model.htmls[i]! }} />}
                <div className="bars" />
                {/* No text inside the gutter buttons, so the block's text stays what anchors measure. */}
                <IconButton label="Edit block" className="edit-btn" side="left" onClick={() => editBlock(i)}><Pencil /></IconButton>
                {markers.has(i) && (
                  <Button variant="ghost" size="xs" className="marker gap-0.5 px-1 text-[11px] text-muted-foreground after:content-[attr(data-count)]"
                    data-count={markers.get(i)![1]} aria-label={plural(markers.get(i)![1], 'comment')} title={plural(markers.get(i)![1], 'comment')}
                    onClick={() => focusComment(markers.get(i)![0])}>
                    <MessageSquare className="size-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </Fragment>
      ))}
      {goneBar(model.parts.length)}
      {card && <DiffCard card={card} />}
    </div>
  );
}

/**
 * The page shows the new text with its new words tinted; the card shows the old text, the words
 * that were cut or replaced struck through and, where new words went in, their badge's number.
 * Below the block, else above it, else at the pointer.
 */
function DiffCard({ card }: { card: Card }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const r = card.target.getBoundingClientRect();
    const h = el.offsetHeight;
    const top = r.bottom + 6 + h <= innerHeight ? r.bottom + 6 : r.top - 6 - h >= 0 ? r.top - 6 - h : Math.min(card.y + 16, innerHeight - h - 8);
    Object.assign(el.style, { left: `${r.left}px`, top: `${top}px`, width: `${Math.min(r.width, 640)}px`, visibility: 'visible' });
  }, [card]);
  let k = 0;
  const parts = card.ops.map((o, j) => {
    if (o.op === '=') {
      let t = o.old;
      if (j === 0) t = t.trimStart();
      if (j === card.ops.length - 1) t = t.trimEnd();
      return t;
    }
    if (o.op === '-') return <del key={j} className="text-destructive">{o.text}</del>;
    const num = ++k;
    const cls = card.mineN?.has(num) ? 'mine' : card.kind;
    return <span key={j} className={`new-n ${cls}`} data-n={num} />;
  });
  return (
    <div ref={ref} aria-hidden style={{ visibility: 'hidden' }}
      className="pointer-events-none fixed z-20 max-w-[640px] rounded-lg border bg-popover px-3 py-2 text-[13px] whitespace-pre-wrap text-body shadow-lg [overflow-wrap:anywhere]">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{card.label}</div>
      {parts}
    </div>
  );
}

function DocFooter() {
  const current = useStore((s) => s.current);
  const editing = useStore((s) => s.editing);
  const n = useNames();
  useStore((s) => s.files);
  const f = entry();
  if (!current || !f) return <div className="min-h-12 shrink-0 border-t" />;
  const s = status(f, n);
  // The second click of a double-click lands on the next file's buttons; ignore it.
  const act = (fn: () => unknown) => (e: ReactMouseEvent) => { if (e.detail <= 1) void fn(); };
  const busy = !!editing;
  const next = nextPending();
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t px-4 py-1.5">
      <span className="flex min-w-0 flex-[1_1_auto] cursor-default items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-muted-foreground select-none">
        <StateIcons file={f} names={n} className="size-3.5" />{s.label}
      </span>
      {f.state === 'working' ? <Button variant="ghost" size="default" disabled={busy} onClick={act(() => post('release'))}>Unlock</Button>
        : f.state === 'accepted' ? <Button variant="ghost" size="default" disabled={busy} onClick={act(() => post('unaccept'))}>Undo accept</Button>
        : f.state === 'rejected' ? <Button variant="ghost" size="default" onClick={act(restore)}>Restore</Button>
        : f.state === 'skipped' ? (
          <>
            <Button variant="ghost" size="default" disabled={busy} onClick={act(() => skip(false))}>Unskip</Button>
            <Button variant="ghost" size="default" disabled={busy} onClick={act(() => accept(false))}>Accept</Button>
          </>
        ) : (
          <>
            {f.edited && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={current.revertable ? -1 : 0} className="inline-flex">
                    <Button variant="ghost" size="default" disabled={busy || !current.revertable} onClick={act(revertAll)}><Undo2 />Revert all edits</Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{current.revertable ? 'Back to the text before your first edit' : 'The file changed since your edit'}</TooltipContent>
              </Tooltip>
            )}
            <RejectButton path={current.path} untracked={f.untracked} disabled={busy} />
            <Button variant="ghost" size="default" disabled={busy} onClick={act(() => skip(true))}>Skip</Button>
            <Button variant="ghost" size="default" disabled={busy} onClick={act(() => accept(false))}>Accept</Button>
            {next && <Button size="default" disabled={busy} onClick={act(() => accept(true))}>Accept and next</Button>}
          </>
        )}
    </div>
  );
}

/** Reject, behind a confirm that says what happens to the file. X opens it too. */
function RejectButton({ path, untracked, disabled }: { path: string; untracked: boolean; disabled: boolean }) {
  const open = useStore((s) => s.rejecting);
  const what = untracked ? `Deletes ${nameOf(path)}.` : `Undoes every uncommitted change to ${nameOf(path)}.`;
  return (
    <Popover open={open} onOpenChange={(o) => set({ rejecting: o })}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="default" disabled={disabled} className="text-destructive hover:text-destructive aria-expanded:text-destructive">Reject</Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 gap-3"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-confirm]')?.focus(); }}
        onCloseAutoFocus={(e) => e.preventDefault()}>
        <p className="text-[13px] text-body">{what} Restore brings it back.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="default" onClick={() => set({ rejecting: false })}>Cancel</Button>
          <Button size="default" data-confirm onClick={() => { set({ rejecting: false }); void reject(); }}>Reject</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
