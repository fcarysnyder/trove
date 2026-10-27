import { useEffect, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { load, save } from '@/lib/storage';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { init, togglePanel } from './actions';
import { AgentDrawer } from './AgentDrawer';
import { ChangesColumn } from './ChangesColumn';
import { DocColumn } from './DocColumn';
import { FilesColumn } from './FilesColumn';
import { onKey } from './keys';
import { CommentPopover, SelectionToolbar } from './SelectionToolbar';
import { SettingsDialog } from './SettingsDialog';
import { get, set, useStore } from './store';
import { TitleStrip } from './bits';
import { TopBar } from './TopBar';
import { ModalEditor } from './doc/Editors';

const WIDTH = { files: 260, changes: 300, agent: 200 }; // agent: the drawer's height
const RAIL = 45; // the agent drawer shut: its header (44px) and the border above it

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
      <div className="grid h-screen grid-rows-[auto_auto_minmax(0,1fr)]">
        <TitleStrip />
        <TopBar />
        <Columns />
      </div>
      <SelectionToolbar />
      <CommentPopover />
      <ModalEditor />
      <SettingsDialog />
      <Toaster theme={theme} position="bottom-right" />
    </TooltipProvider>
  );
}

/**
 * Files | file | Changes over the agent drawer. Sides stay within 180-420px and leave the centre at least 360px; the
 * drawer stays within 120px and 60%, shut until opened; sizes and hidden panels are remembered.
 */
function Columns() {
  const hidden = useStore((s) => s.hidden);
  const panels = { files: useRef<PanelImperativeHandle>(null), changes: useRef<PanelImperativeHandle>(null), agent: useRef<PanelImperativeHandle>(null) };
  const [widths] = useState(() => ({ ...WIDTH, ...load<Partial<typeof WIDTH>>('widths', {}) }));
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    // Drawer motion starts after the first paint, so restoring a hidden column on load is instant.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    for (const name of ['files', 'changes', 'agent'] as const) {
      const p = panels[name].current;
      if (!p) continue;
      if (hidden[name] && !p.isCollapsed()) p.collapse();
      if (!hidden[name] && p.isCollapsed()) p.resize(widths[name]); // back to the remembered size, not the minimum
    }
  }, [hidden]);
  const side = (name: 'files' | 'changes') => ({
    id: name,
    panelRef: panels[name],
    collapsible: true,
    collapsedSize: 0,
    minSize: 180,
    maxSize: 420,
    defaultSize: hidden[name] ? 0 : widths[name],
    groupResizeBehavior: 'preserve-pixel-size' as const,
  });
  // A drag or the keyboard: dragging a panel shut hides it like its button does; an open panel's size is remembered.
  const changed = (names: (keyof typeof panels)[]) => (_: unknown, meta: { isUserInteraction: boolean }) => {
    if (!meta.isUserInteraction) return;
    for (const name of names) {
      const px = panels[name].current?.getSize().inPixels ?? 0;
      if (!px !== get().hidden[name]) togglePanel(name, !px);
      if (px) widths[name] = Math.round(px);
    }
    save('widths', widths);
  };
  // The drawers draw their own borders, so a collapsed drawer takes its line with it; the handle is an
  // invisible strip over that border that lights up on hover and while dragging.
  const handle = 'z-10 w-0 bg-transparent hover:after:bg-foreground/50 data-[separator=active]:after:bg-foreground/50';
  const reset = (name: keyof typeof panels) => () => panels[name].current?.resize(WIDTH[name]);
  return (
    <ResizablePanelGroup orientation="vertical" onLayoutChanged={changed(['agent'])} className={cn('row-start-3 min-h-0', animate && 'animate')}>
      <ResizablePanel id="columns" minSize={200}>
        <ResizablePanelGroup orientation="horizontal" onLayoutChanged={changed(['files', 'changes'])} className={cn(animate && 'animate')}>
          <ResizablePanel {...side('files')}><div inert={hidden.files} className="h-full border-r">{<FilesColumn />}</div></ResizablePanel>
          <ResizableHandle aria-label="Resize files" disableDoubleClick onDoubleClick={reset('files')} className={handle} />
          <ResizablePanel id="doc" minSize={360}><DocColumn /></ResizablePanel>
          <ResizableHandle aria-label="Resize changes" disableDoubleClick onDoubleClick={reset('changes')} className={handle} />
          <ResizablePanel {...side('changes')}><div inert={hidden.changes} className="h-full border-l">{<ChangesColumn />}</div></ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize agent" disableDoubleClick onDoubleClick={reset('agent')} className={handle} />
      <ResizablePanel id="agent" panelRef={panels.agent} collapsible collapsedSize={RAIL} minSize={120} maxSize="60%" defaultSize={hidden.agent ? RAIL : widths.agent} groupResizeBehavior="preserve-pixel-size">
        <div className="h-full overflow-hidden border-t"><AgentDrawer /></div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
