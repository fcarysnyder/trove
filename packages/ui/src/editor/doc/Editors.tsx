// The block editors: inline (a textarea set in the block's own type) and the modal (source beside a
// live preview). Both keep Show new's tint in a mirror behind the textarea and save hash-checked.
import { marked } from '@trove/core/marked';
import { Maximize2, Undo2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { mod } from '@/lib/text';
import { cn } from '@/lib/utils';
import { cancelEdit, revertEdit, saveEdit } from '../actions';
import { IconButton } from '../bits';
import { get, set, useStore, type Editing } from '../store';
import { expandEdit } from './commands';
import { tintRuns, type Baseline } from './layers';
import { docModel } from './model';

const SAVE_KEY = mod === 'Cmd' ? '⌘↵' : 'Ctrl ↵';
const MIRRORED = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'textIndent',
  'whiteSpace', 'overflowWrap', 'wordBreak', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'] as const;

/** What the tint measures against, fixed when the editor opens. */
function useBaselines(index: number | null, opened: string) {
  const [b] = useState(() => {
    const { current, showNew } = get();
    if (!current || !showNew || index == null || current.kind !== 'markdown') return { old: null, prior: null, mine: null };
    const m = docModel(current);
    const rawFrom = (src: Baseline) => (!src ? null : src.changed.has(index) ? src.changed.get(index) ?? '' : m.parts[index]?.raw ?? null);
    // The user's own words: against the block before their first saved edit, or as the editor opened it.
    return { old: rawFrom(m.newness), prior: rawFrom(m.since), mine: m.savedEdit(index)?.before ?? opened };
  });
  return b;
}

/** A textarea with Show new's tint in a transparent mirror behind it. */
function TintedArea({ value, onChange, index, opened, grow, className, style, onKeyDown, label, wrap }: {
  value: string; onChange: (v: string) => void; index: number | null; opened: string; grow?: boolean; className?: string;
  style?: CSSProperties; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; label: string; wrap?: 'off';
}) {
  const { old, prior, mine } = useBaselines(index, opened);
  const tinted = old != null || prior != null || mine != null;
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const a = area.current!;
    a.focus();
    a.setSelectionRange(0, 0);
    if (!mirror.current) return;
    const cs = getComputedStyle(a);
    for (const p of MIRRORED) mirror.current.style[p] = cs[p];
  }, []);
  useLayoutEffect(() => {
    const a = area.current!;
    if (grow) {
      a.style.height = 'auto';
      a.style.height = `${a.scrollHeight}px`;
    }
    if (mirror.current) { mirror.current.scrollTop = a.scrollTop; mirror.current.scrollLeft = a.scrollLeft; }
  }, [value, grow]);
  const nodes: (string | React.ReactElement)[] = [];
  if (tinted) {
    let at = 0;
    for (const [s, e, cls] of tintRuns(value, old, prior, mine)) {
      nodes.push(value.slice(at, s), <mark key={s} className={cls}>{value.slice(s, e)}</mark>);
      at = e;
    }
    nodes.push(value.slice(at), '\n');
  }
  return (
    <div className={cn('tint-wrap', !grow && 'h-full')}>
      {tinted && <div ref={mirror} className="tint-mirror" aria-hidden>{nodes}</div>}
      <textarea
        ref={area}
        aria-label={label}
        value={value}
        wrap={wrap}
        spellCheck={!wrap}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => { if (mirror.current) { mirror.current.scrollTop = e.currentTarget.scrollTop; mirror.current.scrollLeft = e.currentTarget.scrollLeft; } }}
        onKeyDown={onKeyDown}
        className={className}
        style={style}
      />
    </div>
  );
}

export function InlineEditor({ editing }: { editing: Editing }) {
  const current = useStore((s) => s.current)!;
  const [value, setValue] = useState(editing.value);
  const [msg, setMsg] = useState('');
  const prior = docModel(current).savedEdit(editing.index);
  const save = async () => setMsg((await saveEdit(editing.index, value)) ?? '');
  const { marginTop, marginBottom, ...font } = editing.style ?? {};
  return (
    <div style={{ paddingTop: marginTop }}>
      <TintedArea
        label="Block source"
        value={value}
        onChange={setValue}
        index={editing.index}
        opened={editing.value}
        grow
        className={cn('quiet', editing.index == null && 'font-mono text-[13px]')}
        style={font}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
          if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        }}
      />
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" style={{ marginBottom: marginBottom ?? 12 }}>
        <Button variant="ghost" size="xs" onClick={() => void save()}>Save<Kbd>{SAVE_KEY}</Kbd></Button>
        <Button variant="ghost" size="xs" onClick={cancelEdit}>Cancel<Kbd>Esc</Kbd></Button>
        <IconButton label="Expand" onClick={() => expandEdit(value)}><Maximize2 /></IconButton>
        {prior && <Button variant="ghost" size="xs" onClick={() => { set({ editing: null }); void revertEdit(current.path, prior); }}><Undo2 />Revert</Button>}
        {msg && <span role="alert" className="text-destructive">{msg}</span>}
      </div>
    </div>
  );
}

export function ModalEditor() {
  const editing = useStore((s) => s.editing);
  const open = editing?.mode === 'modal';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancelEdit(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined}
        className="w-[min(1100px,90vw)] max-w-none gap-0 overflow-hidden rounded-lg border bg-background p-0 text-foreground ring-0 sm:max-w-none">
        {open && <ModalBody editing={editing} />}
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({ editing }: { editing: Editing }) {
  const current = useStore((s) => s.current)!;
  const [value, setValue] = useState(editing.value);
  const [shown, setShown] = useState(editing.value);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 150);
    return () => clearTimeout(t);
  }, [value]);
  const m = docModel(current);
  const prior = m.savedEdit(editing.index);
  const save = async () => setMsg((await saveEdit(editing.index, value)) ?? '');
  const fm = editing.index != null && m.parts[editing.index]?.type === 'frontmatter';
  return (
    <>
      <DialogTitle className="border-b px-4 py-3 text-sm font-semibold">{editing.title}</DialogTitle>
      <div className="grid h-[70vh] grid-cols-2">
        <div className="min-h-0 min-w-0 border-r">
          <TintedArea
            label="Source"
            value={value}
            onChange={setValue}
            index={editing.index}
            opened={editing.value}
            wrap="off"
            className="h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-[13px] leading-normal whitespace-pre text-foreground outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-border"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }}
          />
        </div>
        <div aria-label="Preview" className="preview min-h-0 min-w-0 overflow-auto p-4">
          {current.kind === 'html' ? <iframe sandbox="" srcDoc={shown} title="Preview" className="size-full rounded-md border-0 bg-white" />
            : fm ? <pre className="fm">{shown}</pre>
            : current.kind === 'text' ? <pre className="font-mono text-[13px] whitespace-pre-wrap">{shown}</pre>
            : <div className="block-body" dangerouslySetInnerHTML={{ __html: marked.parse(shown, undefined) as string }} />}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        {msg && <span role="alert" className="text-destructive">{msg}</span>}
        <span className="flex-1" />
        {prior && <Button variant="ghost" size="sm" onClick={() => { set({ editing: null }); void revertEdit(current.path, prior); }}><Undo2 />Revert</Button>}
        <Button variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Button>
        <Button size="sm" onClick={() => void save()}>Save<Kbd className="bg-primary-foreground/15 text-primary-foreground">{SAVE_KEY}</Kbd></Button>
      </div>
    </>
  );
}
