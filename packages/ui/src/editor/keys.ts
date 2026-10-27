// The page's keys (README's table; / focuses the Files search, S skips or unskips the open file, X asks to reject it). Ignored
// while typing, in menus and dialogs, and on controls that own their arrows; j/k/arrows/Enter/S/X are
// ignored while an edit is open.
import { accept, entry, focusSearch, skip, step, togglePanel } from './actions';
import { get, set } from './store';
import { pickAction, toggleNew } from './doc/commands';

const OWNS_KEYS = 'textarea, input, select, [contenteditable=true], [role=menu], [role=dialog], [role=separator], [role=group], [role=radiogroup], [role=listbox]';

export function onKey(e: KeyboardEvent) {
  const s = get();
  if (s.editing?.mode === 'modal' || s.settingsOpen) return; // the dialog owns the keyboard
  const t = e.target as Element;
  if (t.closest?.(OWNS_KEYS) || e.metaKey || e.ctrlKey || e.altKey) return;
  const doc = t.ownerDocument ?? document;
  // Enter accepts and moves on only from the page itself or a tree row, never from another control.
  const onPage = t === doc.body || t === doc.documentElement || !!t.closest?.('[data-tree-row]');
  if (e.key === 'Enter' && entry()?.state === 'queue' && !s.editing && onPage) {
    e.preventDefault();
    void accept(true);
    return;
  }
  if (s.pick) {
    const act = ({ c: 'change', e: 'explain' } as const)[e.key.toLowerCase() as 'c' | 'e'];
    if (act) { e.preventDefault(); return pickAction(act); }
    if (e.key === 'Escape') { s.pick.range.startContainer.ownerDocument?.getSelection()?.removeAllRanges(); return set({ pick: null }); }
  }
  if (e.key === '[') togglePanel('files');
  else if (e.key === ']') togglePanel('changes');
  else if (e.key.toLowerCase() === 'a') togglePanel('agent');
  else if (e.key.toLowerCase() === 'n') toggleNew();
  if (s.editing) return; // stepping away would drop the open edit
  if (e.key === '/') { e.preventDefault(); return focusSearch(); }
  const f = entry();
  if (e.key.toLowerCase() === 's' && (f?.state === 'queue' || f?.state === 'skipped')) void skip(f.state === 'queue');
  if (e.key.toLowerCase() === 'x' && f?.state === 'queue') { e.preventDefault(); set({ rejecting: true }); }
  if (e.key === 'ArrowRight' || e.key === 'j') step(1);
  if (e.key === 'ArrowLeft' || e.key === 'k') step(-1);
}
