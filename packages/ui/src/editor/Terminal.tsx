import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, type ReactNode } from 'react';

/** The page's colours and mono font, read from its CSS variables; xterm parses oklch() itself. */
function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    fontFamily: v('--font-mono'),
    theme: { background: v('--terminal'), foreground: v('--foreground'), cursor: v('--agent'), cursorAccent: v('--terminal'), selectionBackground: v('--hl-mine') },
  };
}

/**
 * The window's agent terminal (desktop only, through window.trove.pty) under `header`, the Agent pane's status strip:
 * main's pty for this window, replayed from its tail on mount. A session started after one exited starts on a clean
 * screen. `onInput` sees what the user types before the pty does.
 */
export default function Terminal({ header, onInput }: { header: ReactNode; onInput: (data: string) => void }) {
  const pty = window.trove!.pty;
  const box = useRef<HTMLDivElement>(null);
  const typed = useRef(onInput);
  typed.current = onInput;

  useEffect(() => {
    const { fontFamily, theme: colours } = theme();
    const t = new XTerm({ fontFamily, fontSize: 13, theme: colours, cursorBlink: true });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(box.current!);
    // Each fit tells the pty, so Claude Code redraws (SIGWINCH) at the pane's size. Folded, there is nothing to fit.
    const refit = () => {
      if ((box.current?.clientHeight ?? 0) < 40) return;
      fit.fit();
      pty.resize(t.cols, t.rows);
    };
    const input = t.onData((d) => { typed.current(d); pty.write(d); });
    let offData = () => {}, offExit = () => {};
    let gone = false, dead = false;
    // Subscribed once the tail is written: IPC keeps order, so nothing falls between the two.
    void pty.state().then((s) => {
      if (gone) return;
      if (s) { dead = s.exitCode !== null; t.write(s.tail); }
      offData = pty.onData((d) => {
        if (dead) { dead = false; t.reset(); refit(); } // a new session, at this pane's size
        t.write(d);
      });
      offExit = pty.onExit(() => { dead = true; });
      refit();
    });
    const ro = new ResizeObserver(refit);
    ro.observe(box.current!);
    // The theme is the `dark` class and the agent colour is data-agent, both on <html>.
    const mo = new MutationObserver(() => { t.options.theme = theme().theme; });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-agent'] });
    return () => { gone = true; input.dispose(); offData(); offExit(); ro.disconnect(); mo.disconnect(); t.dispose(); };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-terminal">
      {header}
      <div ref={box} className="min-h-0 flex-1 py-1 pl-3" />
    </div>
  );
}
