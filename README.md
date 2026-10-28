```
 ____   ____   ____
/___/| /___/| /___/|
|   || |   || |   ||
|___|/ |___|/ |___|/      __________  ____ _    ________
        ____             /_  __/ __ \/ __ \ |  / / ____/
       /___/|             / / / /_/ / / / / | / / __/
       |   ||            / / / _, _/ /_/ /| |/ / /___
       |___|/           /_/ /_/ |_|\____/ |___/_____/
        ____
       /___/|
       |   ||
       |___|/
```

Trove is a local review tool for documentation that a coding agent writes or changes. Point it at a
git repository and it lists every markdown and HTML file that differs from the index, renders each
one, and lets you read it the way a reader would: accept it, fix a sentence in place, or select a
passage and say what should change. Your comments go back to the agent as one batch. The agent
applies them, releases each file, and the file returns to your queue with the new text marked.

It is built for the moment after an agent has rewritten a dozen docs and someone has to read them
all before they are committed. Diffs are the wrong tool for that: you want the rendered page, a way
to point at a paragraph, and a queue that remembers where you were.

Trove works with any agent that can run a shell command. It ships as a Claude Code plugin, a CLI
and a desktop app, and the same page runs in all three.

## How a review works

1. Start a server on a repository. The page lists the changed documents as a tree, pending first.
2. Open a file. It is rendered from the working copy, with the agent's changes since your last read
   highlighted.
3. Do one of four things:
   - **Accept** stages the file (`git add`). Accept all stages every pending file in view.
   - **Edit** a block in place. Trove saves it to disk and leaves the file unstaged.
   - **Comment** on a selection: ask for a change, or ask the agent to explain the passage.
   - **Skip** it for later, or **Reject** it: a tracked file goes back to HEAD, a new file is
     deleted, and either can be restored from a backup Trove keeps.
4. **Send** your comments. Trove writes them to a log the agent is watching and locks each commented
   file. The agent edits, runs `trove done <file>`, and the file comes back to you unlocked with its
   new text marked.
5. Commit when you are happy. Trove never commits; the staged files are an ordinary diff for
   `git commit`.

Git's index is the only approval state. A file that is staged and unchanged since staging is
reviewed; anything that changes it, your own edit included, unstages it again. There is no state
to get out of sync with the repository, and nothing to clean up when you stop.

## Install

**[Download Trove for Mac](https://github.com/fcarysnyder/trove/releases/latest)** (Apple silicon) · [Changelog](CHANGELOG.md) · [All releases](https://github.com/fcarysnyder/trove/releases)

### Claude Code plugin

```
/plugin marketplace add fcarysnyder/trove
/plugin install trove@trove
```

Then ask Claude to review your docs. The `markdown-editor` skill starts the server, gives you the
URL, applies the comments you send and releases each file when it is done.

### CLI

Trove is not on npm yet. Each [release](https://github.com/fcarysnyder/trove/releases/latest) has the CLI as
one file, `trove-<version>.mjs`, that runs with Node 22: `node trove-<version>.mjs serve --root <repo>`.
From a checkout:

```sh
pnpm install && pnpm build
node packages/cli/bin/trove.mjs serve --root <repo>
```

The plugin's bundle is a single file with no dependencies beyond Node 22, so
`node plugins/trove/dist/trove.mjs serve` works from a plain clone with no install at all.

```
trove serve [--root <path>] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--force]
trove attach [--root <repo> | --port N] --agent claude|codex|other   join a running server as the agent
trove detach [--root <repo> | --port N]
trove info [--root <repo> | --port N]                the server's status line
trove done <file> [--root <repo> | --port N]         release a file back to the reviewer
trove ask "<question>"                               show a question on the page
trove reply "<summary>"                              answer a question the reviewer asked
```

A running server records itself in `<git-dir>/trove/server.json`, so without `--port` these
commands find the server on `--root`'s repository (default: the current directory's), and a second
`serve` on that repository refuses with the first one's address unless you pass `--force`.

### Desktop app

Download `Installer-Trove-<version>-arm64.dmg` from the
[latest release](https://github.com/fcarysnyder/trove/releases/latest), open it and drag Trove to
Applications. It runs on Apple silicon Macs.

The app opens a repository, picks a worktree and branch, and can start Claude Code or Codex,
already attached to that window's server, in a terminal inside the window, or in your own terminal app. Each repository gets its own window and its own
server on a random local port.

To run it from a checkout instead:

```sh
pnpm install && pnpm dev:desktop
```

How releases are built, signed and published is in [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

## Working with an agent

The protocol is three commands and a log file, so any agent can take part.

When a server starts it prints one line: how many files are queued, the branch, the URL, the path
of its events log, and the exact `done` command to run. An agent that reads that line has
everything it needs.

Sending comments appends a batch to `<git-dir>/trove/batches.jsonl` and a one-line notice to
`<git-dir>/trove/events.log`. Each comment carries the file path, the quoted passage with enough
context to find it again, the heading path above it, and the request. The agent edits the file
and runs `trove done <file>`, which unlocks it and marks it updated on the page. `trove ask` and
`trove reply` put a question or an answer in the page's notice area, so a short exchange does not
need a terminal.

The Claude Code skill in `plugins/trove/skills/markdown-editor` is the reference implementation of
the agent's side.

## Features

- **Rendered review.** Markdown and HTML rendered from the working copy; MDX and plain text can be
  turned on in Settings. Changes since your last read are highlighted.
- **In-place editing.** Edit a block, save, and revert one block or every edit of the review.
- **Comments with anchors.** Comments attach to a quoted passage, not a line number, so they
  survive the agent's edits around them.
- **Accept, Accept all, Undo accept, Skip, Reject, Restore.**
- **Search and filters** in the Files column, by name and by state.
- **Repository, worktree and branch switcher** in the top bar. Switching is a plain `git switch`
  with no stash; a branch checked out in another worktree opens that worktree instead.
- **Scope.** Review what is uncommitted, or everything the branch changed since its base.
- **Excludes.** Glob pathspecs to keep generated folders out of the queue.
- **Light and dark**, following the system or set in Settings.
- **Local only.** The server binds 127.0.0.1, checks the Host and Origin of every request, and
  reads and writes only inside the repository. Nothing leaves your machine.

Chrome and Edge are supported. Safari is not, because comment highlighting uses the CSS Custom
Highlight API.

## Keyboard

| Key | Does |
|---|---|
| `j` / `→` | next file in the tree |
| `k` / `←` | previous file |
| `/` | focus the Files search; in it, `Enter` opens the first match, `Esc` clears |
| `Enter` | Accept and next (from the page or a tree row) |
| `[` / `]` | hide or show Files / Agent |
| `N` | show new files on or off |
| `S` | skip the open file, or unskip it |
| `X` | reject the open file (asks first) |
| `C` / `E` | with text selected: comment / explain |
| `Esc` | dismiss the selection toolbar; cancel an edit, a composer or a dialog |
| `Cmd/Ctrl+Enter` | save an edit, add a comment, save a dialog |
| `←` `→` on a divider | resize that column |

Keys are ignored while typing in a field, and the navigation keys are ignored while an edit is open.

## Development

Trove is a pnpm workspace. Node 22 and pnpm 10.

| Package | What it is |
|---|---|
| `packages/core` | The engine: git source, review state, the HTTP API, the comment anchoring. Node built-ins plus a vendored copy of marked. |
| `packages/ui` | The page: Vite, React, Tailwind and shadcn/ui. |
| `packages/cli` | The `trove` command, bundled to one file with esbuild. |
| `apps/desktop` | The Electron app. Runs core in the main process, one server per window. |
| `plugins/trove` | The Claude Code plugin: the `markdown-editor` and `bring-file` skills and a committed build of the CLI and page. |

```sh
pnpm install
pnpm build          # core, ui, cli
pnpm typecheck
pnpm test
pnpm dev:ui         # the page against a server you started yourself
pnpm dev:desktop
pnpm build:plugin   # refresh plugins/trove/dist; commit it with the change
node packages/cli/bin/trove.mjs --selftest   # end-to-end check against a temporary repository
```

`plugins/trove/dist` is committed so the plugin installs from git without a build step. CI
rebuilds it and fails if the committed copy is stale, and runs the selftest against the committed
bundle. The design notes and the HTTP API are in [docs/PLAN.md](docs/PLAN.md).

Issues and pull requests are welcome. If you add an agent integration for another tool, the skill
in `plugins/trove/skills/markdown-editor` shows what the agent's side has to do.

## License

MIT. See [LICENSE](LICENSE).
