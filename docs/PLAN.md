# Trove: plan

Trove productizes the `markdown-editor` skill from `crossnokaye/design-plugins`
(`.claude/skills/markdown-editor/`, the source of truth for today's behaviour; its README and
SKILL.md describe every state, key and route). The goal: a general-purpose editor for AI-written
markdown and HTML, driven by git where git exists, that runs three ways from one codebase:

1. **Claude Code plugin** (`plugins/trove`, skill `markdown-editor`): the exact experience of
   today's skill. Install from this repo, say "review my docs", get the same page and workflow.
2. **CLI** (`trove serve`, `trove done|ask|reply`): the plugin's runtime, also installable from
   npm for other agents and terminals.
3. **Desktop app** (`apps/desktop`, Electron): zero state asks for a folder or a git repo (and a
   branch scope); each source gets a window.

## Principles

- Git's index is the only approval state in a git source. Accept is the only `git add`; the tool
  never commits. Folder mode keeps a local "reviewed" marker instead and loses Show new, Undo
  accept's git meaning and the committed section; that is accepted.
- Comments are feedback on the document, never instructions to the agent.
- The plugin runtime stays Node built-ins only: one bundled server file and static UI assets,
  committed under `plugins/trove/dist`, so install-from-git needs no build. Node 22+.
- The HTTP API stays a superset of today's, so the new UI can be developed against the old
  server and the old page could be served by the new one.
- Visual continuity: same layout (Files / file / Changes), same neutral greys, same state colours,
  same keys. Built from vanilla shadcn/ui so it has light and dark modes and a maintainable
  component base. Not Titan-compliant and not using the CrossnoKaye registry; the greys happen
  to match.

## Layout

```
trove/
  packages/core      @trove/core   engine: sources, queue, drafts, edits, batches, locks, HTTP API, settings
  packages/ui        @trove/ui     Vite + React 19 + Tailwind v4 + shadcn: index.html (editor), start.html (desktop zero state)
  packages/cli       trove         bin + esbuild bundle of core; serves ui/dist
  apps/desktop       @trove/desktop  electron-vite; main runs core in-process, renderer is ui/dist
  plugins/trove      Claude Code plugin: SKILL.md + dist/ (built by scripts/build-plugin.mjs, committed)
  .claude-plugin/marketplace.json
  docs/PLAN.md       this file
```

## Contract

`packages/core/src/types.ts` is the contract: doc types, settings, file rows, anchors, every API
request and response, the desktop bridge. `packages/core/src/index.ts` declares the core's public
functions. Change the contract only with a note in the commit; every package depends on it.

### Sources

```
Source
  kind: 'git' | 'folder'
  list(): FileEntry[]          what the queue shows
  accept(rel) / unaccept(rel)  git: add / restore --staged;  folder: reviewed-set in stateDir
  unstage(rel)                 git: restore --staged;        folder: drop from reviewed-set
  baseOf(rel, text)            git: staged copy, else HEAD;  folder: null
  stateDir                     git: <git-dir>/trove/ (renamed from doc-review/ on first run if that exists)
                               folder: ~/.trove/state/<sha1(root)>/
```

Git scopes: `uncommitted` is today's `git status --porcelain=v1 -z -uall` over the enabled
extensions; `branch` unions in `git diff --name-only <merge-base>...HEAD`, where the base is
`Settings.base` or auto (origin/HEAD, main, master). A committed, unmodified file lists as staged
(accepted). Folder sources walk the tree for enabled extensions, skipping dot-folders,
`node_modules`, and `Settings.exclude` globs.

### Doc types

`DEFAULT_DOC_TYPES` in the contract: md (.md, .markdown) and html on by default; mdx and txt off.
Each is on or off in Settings. Kind drives rendering: `markdown` through marked's lexer with the
byte-exact block splice; `html` in the sandboxed frame, edited whole; `text` as one preformatted
block, edited whole. MDX renders as markdown: import/export lines and JSX blocks come through as
paragraph or html tokens and show as source, which is fine for a first version.

### Settings

Per source, in `<stateDir>/settings.json`, served by `GET/POST /api/settings`. Theme, doc types,
exclude globs, git scope and base, Show new default. The UI's settings dialog follows the shape of
Hyperion's site settings modal: a 216px rail of categories on the left, a scrolling pane of rows
on the right under a sticky title, each row a bold label with its control on the right, a footer
with Cancel/Save. Categories: General (theme, Show new), Documents (one switch per doc type,
exclude globs), Source (git scope and base; read-only facts for a folder).

### Routes

Today's routes unchanged (`/api/files`, `/api/drafts`, `/api/file`, `/api/accept`,
`/api/unaccept`, `/api/save`, `/api/revert`, `/api/send`, `/api/ask`, `/api/release`), plus
`GET /api/source` and `GET|POST /api/settings`. Security as today: Host must be
`127.0.0.1:<port>` or `localhost:<port>`; POST needs same-origin Origin and JSON up to 512KB; every
path resolves under the root and must be in the current set; a throwing route answers 500.
`GET /` and the UI assets come from `uiDir` with CSP `default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'`. The UI uses no
inline scripts.

### Agent protocol (unchanged)

A send appends one line to `batches.jsonl` and one notice to `events.log`
(`batch <id>: N comments on M files. Read it with: grep -F <id> '<file>'`). The agent runs
`<doneCommand> <file>` after each file; the quiet release covers a forgotten one. `ask` and
`reply` show a notice on the page. `SourceInfo.doneCommand` tells the page what to show the user
in "Connect an agent".

## Theme

shadcn neutral tokens, values tuned to today's page so it looks the same in dark mode:

| token | dark | light |
|---|---|---|
| background | #111111 | #ffffff |
| card / popover | #222222 | #f5f5f5 |
| accent (hover) | #333333 | #eeeeee |
| border / input | #444444 | #cccccc |
| foreground | #ffffff | #111111 |
| secondary text (body) | #cccccc | #666666 |
| muted-foreground | #999999 | #777777 |
| primary | #ffffff on #000 | #111111 on #fff |
| destructive / bad | #ef4e4e | #ef4e4e |
| custom: good | #46d401 | #2a8101 |
| custom: dirty | #ffd000 | #a78800 |
| custom: cool | #04b9fb | #0276a1 |
| custom: agent (Claude) | #d97757 | #c2410c |
| custom: agent (other) | #2dd4bf | #0f766e |

Radius 0.5rem (small 0.25rem). Inter, system-ui fallback. Body text is the secondary colour;
headings and names use the foreground. Buttons are ghosts unless primary (Accept and next, Save) or
the tier2 Send split button. Light values are a first pass; adjust for contrast.

## Work split (parallel agents, one package each)

| agent | owns | depends on |
|---|---|---|
| core | `packages/core`, `packages/cli` | contract |
| ui | `packages/ui` | contract; develops against the old server via Vite proxy |
| desktop | `apps/desktop` | contract (core signatures), ui/dist layout (`index.html`, `start.html`, `assets/`) |
| plugin | `plugins/trove`, `scripts/build-plugin.mjs`, `.github/workflows/ci.yml`, `README.md` | core and ui builds, at the end |

Integration (after all four): `pnpm install && pnpm build && pnpm test`, `pnpm build:plugin`,
run the plugin's selftest and open the page on a real repo, run the desktop app on a folder and
a repo, commit `plugins/trove/dist`.

## Out of scope for this pass

WYSIWYG editing, real MDX compilation, multi-user, publishing or sync, Safari, Windows packaging,
npm publishing (the bin works from the repo; publishing is a follow-up), per-file history views.
