import type { AgentTool } from '@trove/core/types';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { ChevronDown, ChevronUp, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconButton } from './bits';

const LABEL: Record<AgentTool, string> = { claude: 'Claude Code', codex: 'Codex' };
const DOT: Record<AgentTool, string> = { claude: 'bg-agent-claude', codex: 'bg-agent-codex' };

/** The page's colours and mono font, read from its CSS variables; xterm parses oklch() itself. */
function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    fontFamily: v('--font-mono'),
    theme: { background: v('--background'), foreground: v('--foreground'), cursor: v('--agent'), cursorAccent: v('--background'), selectionBackground: v('--hl-mine') },
  };
}

/**
 * The window's agent terminal (desktop only, through window.trove.pty): main's pty for this window, replayed
 * from its tail on mount. `hidden` folds it to this header; the agent keeps running.
 */
export default function Terminal({ hidden, onHide }: { hidden: boolean; onHide: (hidden: boolean) => void }) {
  const pty = window.trove!.pty;
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<XTerm | null>(null);
  const [tool, setTool] = useState<AgentTool | null>(null);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    const { fontFamily, theme: colours } = theme();
    const t = new XTerm({ fontFamily, fontSize: 13, theme: colours, cursorBlink: true });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(box.current!);
    term.current = t;
    // Each fit tells the pty, so Claude Code redraws (SIGWINCH) at the pane's size. Folded, there is nothing to fit.
    const refit = () => {
      if ((box.current?.clientHeight ?? 0) < 40) return;
      fit.fit();
      pty.resize(t.cols, t.rows);
    };
    const input = t.onData((d) => pty.write(d));
    let offData = () => {}, offExit = () => {};
    let gone = false;
    // Subscribed once the tail is written: IPC keeps order, so nothing falls between the two.
    void pty.state().then((s) => {
      if (gone) return;
      if (s) { setTool(s.tool); setExited(s.exitCode !== null); t.write(s.tail); }
      offData = pty.onData((d) => t.write(d));
      offExit = pty.onExit(() => setExited(true));
      refit();
    });
    const ro = new ResizeObserver(refit);
    ro.observe(box.current!);
    // The theme is the `dark` class and the agent colour is data-agent, both on <html>.
    const mo = new MutationObserver(() => { t.options.theme = theme().theme; });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-agent'] });
    return () => { gone = true; input.dispose(); offData(); offExit(); ro.disconnect(); mo.disconnect(); t.dispose(); };
  }, []);

  const start = () => {
    const t = term.current!;
    t.reset();
    setExited(false);
    void pty.start(tool!, t.cols, t.rows);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-9 shrink-0 items-center gap-1.5 border-b pr-2 pl-4 text-xs">
        {tool && <span className={cn('size-2 rounded-full', exited ? 'border border-muted-foreground' : DOT[tool])} aria-hidden />}
        <span className="text-foreground">{tool ? LABEL[tool] : 'Agent'}</span>
        {exited && <span className="text-muted-foreground">exited</span>}
        <span className="ml-auto flex items-center">
          {exited
            ? tool && <Button variant="ghost" size="sm" onClick={start}>Start</Button>
            : <IconButton side="bottom" label="Stop" onClick={() => void pty.kill()}><Square /></IconButton>}
          <IconButton side="bottom" label={hidden ? 'Show terminal' : 'Hide terminal'} onClick={() => onHide(!hidden)}>{hidden ? <ChevronDown /> : <ChevronUp />}</IconButton>
        </span>
      </div>
      <div ref={box} className="min-h-0 flex-1 bg-background py-1 pl-3" />
    </div>
  );
}
