import { useEffect, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { load, save } from '@/lib/storage';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { init, togglePanel } from './actions';
import { ChangesColumn } from './ChangesColumn';
import { DocColumn } from './DocColumn';
import { FilesColumn } from './FilesColumn';
import { onKey } from './keys';
import { SelectionToolbar } from './SelectionToolbar';
import { SettingsDialog } from './SettingsDialog';
import { get, set, useStore } from './store';
import { TopBar } from './TopBar';
import { ModalEditor } from './doc/Editors';

const WIDTH = { files: 260, changes: 300 };

export function App() {
  const theme = useStore((s) => s.settings.theme);
  const agent = useStore((s) => s.source?.agentInfo?.id ?? s.source?.agent ?? 'claude');
  const question = useStore((s) => !!s.question);
  const name = useStore((s) => s.source && (s.source.worktree && !s.source.worktree.main ? `${s.source.worktree.name} · ${s.source.repo.name}` : s.source.repo?.name ?? s.source.name));
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => { document.documentElement.dataset.agent = agent; }, [agent]);
  useEffect(() => { document.title = `${question ? '(1) ' : ''}${name ? `${name} · ` : ''}Trove`; }, [question, name]);
  useEffect(() => {
    void init();
    const collapsed = () => {
      const p = get().pick;
      if (p && p.range.startContainer.ownerDocument === document && document.getSelection()?.isCollapsed) set({ pick: null });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('selectionchange', collapsed);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('selectionchange', collapsed); };
  }, []);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)]">
        <TopBar />
        <Columns />
      </div>
      <SelectionToolbar />
      <ModalEditor />
      <SettingsDialog />
      <Toaster theme={theme} position="bottom-right" />
    </TooltipProvider>
  );
}

/** Files | file | Changes. Sides stay within 180-420px and leave the centre at least 360px; widths and hidden columns are remembered. */
function Columns() {
  const hidden = useStore((s) => s.hidden);
  const files = useRef<PanelImperativeHandle>(null);
  const changes = useRef<PanelImperativeHandle>(null);
  const [widths] = useState(() => ({ ...WIDTH, ...load<Partial<typeof WIDTH>>('widths', {}) }));
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    // Drawer motion starts after the first paint, so restoring a hidden column on load is instant.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    for (const [name, ref] of [['files', files], ['changes', changes]] as const) {
      const p = ref.current;
      if (!p) continue;
      if (hidden[name] && !p.isCollapsed()) p.collapse();
      if (!hidden[name] && p.isCollapsed()) p.resize(widths[name]); // back to the remembered width, not the minimum
    }
  }, [hidden]);
  const side = (name: 'files' | 'changes') => ({
    id: name,
    panelRef: name === 'files' ? files : changes,
    collapsible: true,
    collapsedSize: 0,
    minSize: 180,
    maxSize: 420,
    defaultSize: hidden[name] ? 0 : widths[name],
    groupResizeBehavior: 'preserve-pixel-size' as const,
  });
  // A drag or the keyboard: dragging a side shut hides it like its button does; an open side's width is remembered.
  const changed = (_: unknown, meta: { isUserInteraction: boolean }) => {
    if (!meta.isUserInteraction) return;
    for (const [name, ref] of [['files', files], ['changes', changes]] as const) {
      const px = ref.current?.getSize().inPixels ?? 0;
      if (!px !== get().hidden[name]) togglePanel(name, !px);
      if (px) widths[name] = Math.round(px);
    }
    save('widths', widths);
  };
  const reset = (name: 'files' | 'changes') => () => (name === 'files' ? files : changes).current?.resize(WIDTH[name]);
  return (
    <ResizablePanelGroup orientation="horizontal" onLayoutChanged={changed} className={cn('min-h-0', animate && 'animate')}>
      <ResizablePanel {...side('files')}><div inert={hidden.files} className="h-full">{<FilesColumn />}</div></ResizablePanel>
      <ResizableHandle aria-label="Resize files" disableDoubleClick onDoubleClick={reset('files')} className="hover:bg-foreground/50 data-[separator=active]:bg-foreground/50" />
      <ResizablePanel id="doc" minSize={360}><DocColumn /></ResizablePanel>
      <ResizableHandle aria-label="Resize changes" disableDoubleClick onDoubleClick={reset('changes')} className="hover:bg-foreground/50 data-[separator=active]:bg-foreground/50" />
      <ResizablePanel {...side('changes')}><div inert={hidden.changes} className="h-full">{<ChangesColumn />}</div></ResizablePanel>
    </ResizablePanelGroup>
  );
}
