# Plan: the agent's terminal inside Trove

Issue [#15](https://github.com/fcarysnyder/trove/issues/15), stage 2. Desktop app only.

## Where things stand

Stage 1 of the issue is done, in a different shape than the issue describes. The bottom drawer on
`feat/agent-drawer` was merged, then reworked on `feat/agent-rail` into the right-hand **Agent**
pane that shipped in 0.5.6: History (the activity timeline from `GET /api/activity`) over
Changes. The bottom drawer and rail are gone (`8640e13`). So "the agents drawer" today is the
Agent pane in `packages/ui/src/editor/ChangesColumn.tsx`, and that is where the terminal goes.

The pain: the agent runs in a Terminal window off to the side, and Cmd-Tab to Trove loses it.
Anything short of the terminal living in Trove's window (raising the Terminal window alongside,
a hotkey to it) still leaves two windows, so the plan is the real thing.

## Shape

The Agent pane becomes two stacked, resizable panels:

```
┌ Agent ─────────────── This file ▾ ⟩ ┐
│ ● Claude                 attached 3m │   terminal header: state, Start/Stop, hide
│ $ claude "Start the markdown-…"      │
│ ╭────────────────────────────────╮   │   xterm.js, fills the panel, resizes with it
│ │ > Reading batch a1b2c3d4 …     │   │
│ ╰────────────────────────────────╯   │
├──────────────────────────────────────┤   drag handle (vertical), remembered height
│ History                              │   the existing scroll area, unchanged
│   10:42 Sent 3 comments on README    │
│ Changes                           2  │
│   …                                  │
├──────────────────────────────────────┤
│ Send 2 comments                      │
└──────────────────────────────────────┘
```

- **One session per repository window.** It starts when the window opens with an agent chosen
  (the start page's Agent step, or Start Claude Code in the Connect popover), ends when the window
  closes. The agent exiting leaves the panel showing its last screen with a Start button.
- **Terminal, not chat.** It is the agent's real TTY: Claude Code's own UI, keys, permission
  prompts, `/` commands. Trove adds nothing in front of it.
- **The terminal app setting gains a first choice, "In Trove", which is the default.** Terminal,
  iTerm2 and the rest stay for anyone who wants their own terminal; `launchAgent` branches on it.
- **Plugin and CLI builds never see it.** The page shows the panel only when `window.trove.pty`
  exists, and the xterm code is a lazy chunk, so the committed plugin dist does not grow. There
  is no HTTP route for the shell: a shell over the local server would let any local process run
  commands.

## Step 0: one server per repository

Lands first, on its own, because the embedded terminal makes "Trove is running in its own app"
the common case. Today a running server leaves no trace a second agent can find: the desktop
serves on a random port, so Claude started elsewhere (Claude desktop, a plain terminal) runs
`serve --root <repo>`, binds 4824, and two servers share one `<git-dir>/trove/` with two pages
that disagree. Nothing refuses it. The skill's attach step only works when the prompt names a
port.

- **The server leaves a calling card.** On start, `createApp` writes `<git-dir>/trove/server.json`:
  `{ port, pid, startedAt, by: 'desktop' | 'cli' }`. `close()` deletes it.
- **`serve` reads it first.** Alive is the pid (`alive()` in `presence.ts`, a fast path) and
  `GET /api/source` on that port answering (the real test; pids get reused). When alive, refuse:
  ```
  Trove is already serving this repository at http://127.0.0.1:NNNN (desktop app).
  Attach with: trove attach --port NNNN --agent claude. Pass --force to start another.
  ```
  Stale (dead pid, or no answer) is overwritten.
- **`info` and `attach` take `--root <repo>`** as an alternative to `--port`, resolved through the
  same file. `--root` defaults to the current directory's repository.
- **The skill attaches unconditionally.** Its Start section becomes: run `info --root <repo>`;
  if it answers, attach and go on from step 2; else serve. `--force` only when the user asked for
  a separate server. That makes any Claude, wherever it runs, join the desktop's session.
- **The other direction**, later: the desktop opening a repository a CLI session already serves
  can load that server's URL instead of starting one. One check in `openNow`; not in the first PR.
- Ceiling, unchanged: one attach slot per server, so a second agent attaching replaces the first
  on the page.

About 40 lines in core and the CLI, a few in the skill, no UI. One test in `packages/core/test`:
serve twice on one repository, the second refuses; kill the first, the second starts.

## Pieces

### 1. Main process: the pty session (`apps/desktop/src/main/index.ts`, ~80 lines)

`node-pty` in the desktop package's `dependencies` (electron-vite externalizes it; `@trove/core`
stays the only bundled dependency).

```ts
interface SourceWindow { …; pty: { proc: IPty; tool: AgentTool; tail: string[] } | null }

function startPty(s: SourceWindow, tool: AgentTool, cols: number, rows: number) {
  if (s.pty) return;                                   // one per window
  const shell = process.env.SHELL || '/bin/zsh';       // login shell: PATH as in tools()
  const proc = pty.spawn(shell, ['-ilc', attachCommand(tool, s.root, s.port, true)], {
    cwd: s.root, cols, rows, name: 'xterm-256color', env: { ...process.env, COLORTERM: 'truecolor' },
  });
  proc.onData((d) => { tail(s, d); s.win.webContents.send('trove:pty:data', d); });
  proc.onExit(({ exitCode }) => { s.pty = null; s.win.webContents.send('trove:pty:exit', exitCode); });
  s.pty = { proc, tool, tail: [] };
}
```

- `tail` keeps the last ~256 KB of output so a page reload or React remount replays the screen
  instead of showing a blank panel. Deliberate ceiling: no scrollback across app restarts.
- IPC handlers `trove:pty:start|write|resize|kill|state`, each resolving the session from
  `BrowserWindow.fromWebContents(e.sender)`, so a window only ever reaches its own session.
- `win.on('closed')` kills the pty beside `core.close()`. `app.on('before-quit')` kills them all.
- `launchAgent(tool, root, port)`: when the terminal setting is `'Trove'`, find the window's
  source and `startPty` at 80×24 instead of writing the `.command` file; the page resizes it to
  the panel on attach. Main owns the start in both paths of `openNow`: the already-open window
  (which never reloads, so a `?waiting` parameter would not reach it) and the first open, where
  the window must now be created before the agent starts. Output before the page listens sits in
  `tail` and replays.
- `TerminalApp` in `packages/core/src/types.ts` gains `'Trove'`; `terminal()` returns it without
  the installed check and it is the default when nothing is set.

### 2. Preload bridge (`apps/desktop/src/preload/index.ts`, `TroveBridge` in core types)

```ts
pty: {
  start(tool: AgentTool, cols: number, rows: number): Promise<void>;
  write(data: string): void;                 // ipcRenderer.send, not invoke: keystrokes are fire-and-forget
  resize(cols: number, rows: number): void;
  kill(): Promise<void>;
  state(): Promise<{ tool: AgentTool; tail: string } | null>;
  onData(cb: (d: string) => void): () => void;
  onExit(cb: (code: number) => void): () => void;
}
```

### 3. UI: `packages/ui/src/editor/Terminal.tsx` (~150 lines) and the Agent pane

- `@xterm/xterm` and `@xterm/addon-fit` in `@trove/ui`. The component is reached only through
  `lazy(() => import('./Terminal'))` behind `window.trove?.pty`, so it is its own chunk.
- Theme from the page's CSS variables (`--background`, `--foreground`, `--muted-foreground`,
  the agent colour for the cursor), re-read when the theme changes; the page's mono font.
- `FitAddon.fit()` on mount and from a `ResizeObserver` on the panel; each fit calls
  `pty.resize`. Claude Code redraws on SIGWINCH, so dragging the pane re-flows it.
- On mount: `pty.state()`; replay `tail` if a session is running, then fit and `resize`.
  Subscribe to data and exit; unsubscribe on unmount. `pty.start` is only for the Start button
  after the agent exits; the first session is main's.
- Header: the agent's dot and label as in Connect, "exited" after exit with a Start button, a
  Stop button (`kill`) and a hide button.
- Keys: the page's `onKey` already ignores events from a `textarea`; xterm's input is one, so
  `[`, `]`, `j`, `k` and the rest reach Claude Code while the terminal has focus. Cmd-K clears,
  Cmd-C/V as usual; nothing else to add.
- Layout in `ChangesColumn.tsx`: a vertical `ResizablePanelGroup` with the terminal panel on top
  (collapsible, `minSize` 160, remembered height like the columns' widths) and the existing
  History/Changes scroll area below. The Agent pane's `maxSize` goes from 50% to 60%: Claude
  Code wants about 80 columns, and at the page's 13px mono that is ~640px.

### 4. Start page and Connect popover

- `Start.tsx`: `TERMINAL_NAMES` gains `Trove: 'In Trove'` and it lists first.
- `Connect` in `TopBar.tsx`: Start Claude Code / Start Codex keep calling `bridge.open({agent})`;
  with the setting on In Trove, main starts the session in this window instead of a Terminal
  window, and the panel shows it on the next `pty:data`. The "Starting Claude Code…" pulse clears
  when `agentInfo.connected` flips, as now; `?waiting` stays for that.

### 5. Packaging (`apps/desktop/electron-builder.yml`, `package.json`, release workflow)

This is the risky part; do it first, as a spike, before any UI.

- `pnpm-workspace.yaml` `onlyBuiltDependencies` must list `node-pty`, or pnpm skips its
  install script and there is no binary at all.
- node-pty's install script fetches a prebuilt binary for the running Node ABI and otherwise runs
  node-gyp. The app needs the Electron 45 ABI: a desktop `postinstall` of
  `electron-rebuild -f -w node-pty` (`@electron/rebuild`) is the standard route, with Xcode CLT
  on the Mac and already on the `macos-15` runner. `npmRebuild: false` stays. The ubuntu CI job
  runs that postinstall too; it has the toolchain, but if it proves slow, gate the rebuild on
  `process.platform === 'darwin'`.
- `files` must stop excluding node_modules for this one package, and the binary cannot load
  from inside the asar:
  ```yaml
  files:
    - node_modules/node-pty/**
  asarUnpack:
    - node_modules/node-pty/**     # pty.node and the spawn-helper executable
  ```
  pnpm's symlinked `node_modules/node-pty` is the thing to verify here: electron-builder 26
  follows pnpm layouts, but if it packages the symlink or misses `node-addon-api`, the fallback is
  the pattern already used for the UI: copy node-pty's `lib/`, `build/Release/` and
  `package.json` into `out/node-pty/` from the electron-vite `closeBundle` hook and `require` it
  from there (`out/**` is already packaged; unpack `out/node-pty/**`).
- Signing: hardened runtime needs every Mach-O signed, including `spawn-helper`. electron-builder
  signs what it finds in `app.asar.unpacked` with the Developer ID; the ad-hoc fallback uses
  `--deep`, which also covers it. No new entitlements: node-pty does not JIT or load unsigned code.
- Release workflow "Check the app" gains two checks: `app.asar.unpacked/node_modules/node-pty/build/Release/pty.node`
  exists and `codesign --verify` passes on `spawn-helper`. That is the one runnable check for
  the packaging.
- `docs/DISTRIBUTION.md` gets a paragraph on the native module and the rebuild step.

### 6. Docs

README's desktop paragraph ("can start Claude Code or Codex in Terminal") becomes "in a terminal
inside the window, or in your own terminal app"; CHANGELOG Unreleased entry; close #15 with a
note that stage 1 landed as the Agent pane.

## Order of work

0. **One server per repository** (step 0 above), its own PR.
1. **Spike, packaging only.** Add node-pty, rebuild for Electron 45, `pnpm dist`, open the
   packaged app and spawn `/bin/zsh -ilc 'echo ok'` from main, logging the output. If pnpm and
   electron-builder disagree about the symlink, switch to the copy-into-`out/` fallback. Nothing
   else is worth writing until this runs from the DMG.
2. Main + preload: session, IPC, `'Trove'` terminal choice, kill on close and quit.
3. UI: `Terminal.tsx`, the stacked layout in the Agent pane, theme and fit.
4. Start page and Connect wiring; the `?waiting` start.
5. Release checks, docs, changelog. Rebuild the plugin dist (the UI chunking changes it).

About 400 lines plus the packaging, as the issue estimated. Two to three days with the spike.

## Not in this plan

- More than one terminal, or a plain shell tab: one session, the agent's, per window.
- Search, link detection, scrollback across restarts.
- Windows and Linux (conpty): the desktop app is Mac-only.
- A `script(1)`-based pty to avoid the native module. It cannot be resized from outside, so
  Claude Code's UI would be stuck at its launch width.
