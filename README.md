# Trove

Trove is a local editor for markdown and HTML that an AI agent wrote. It lists the changed
documents in a git repository, shows each one rendered, and lets you accept it, edit it in
place, or select a passage and comment on it. Comments go to the agent in one batch; the agent
edits the files and hands each one back to your queue to be read again.

It is driven by git. Accepting a file stages it, and that is all Trove ever does
to your repo: it never commits, so the result is an ordinary staged diff you commit yourself
(`git commit` without `-a`). Everything runs on 127.0.0.1; nothing leaves your machine.

## Run it

**Claude Code plugin.** In Claude Code:

```
/plugin marketplace add fcarysnyder/trove
/plugin install trove@trove
```

Then say "review my docs". The `markdown-editor` skill starts the server, gives you the URL, and
listens for your comments.

**CLI, from this repo:**

```sh
pnpm install && pnpm build
node packages/cli/bin/trove.mjs serve --root <repo>
```

The first line it prints gives the URL and the command an agent runs after finishing each file
(`trove done <file> --port <port>`; `trove ask` and `trove reply` show a notice on the page).

The page's top bar switches branches like GitHub Desktop (a plain `git switch`, never a stash); a
branch checked out in another worktree opens that worktree instead.

**Desktop app:** `pnpm dev:desktop`. It asks for a git repository and opens a window for each; a folder that is not one cannot be opened.

## Mental model

Git's index is the only approval state. A file that is staged and unchanged since
staging is reviewed. Accept is the only `git add`; Undo accept is `git restore --staged`; anything
that changes a file, your own Save included, unstages it again. The queue is every file of the
enabled document types (markdown and HTML by default; MDX and plain text in Settings) that differs
from the index, plus untracked ones, or everything the branch changed since its base if you widen
the scope in Settings.

## Keys

| Key | Does |
|---|---|
| `j` / `→` | next file in the tree |
| `k` / `←` | previous file |
| `/` | focus the Files search; in it, `Enter` opens the first file, `Esc` clears it |
| `Enter` | Accept and next (only from the page itself or a tree row) |
| `[` / `]` | hide or show Files / Changes |
| `N` | Show new on or off |
| `S` | skip the open file, or unskip it |
| `X` | reject the open file (asks first) |
| `C` / `E` | with text selected: comment / explain |
| `Esc` | dismiss the selection toolbar; cancel an edit, a composer or the modal |
| `Cmd/Ctrl+Enter` | save an edit, add a comment, save the modal |
| `←` `→` on a divider | resize that column by 16px |
| arrows on the scope switch | This file / All files |
| `↑` `↓` `Home` `End` in the send menu | move between items; `Enter`/`Space` run one, `Esc` closes |

Keys are ignored while typing in a field, and j/k/arrows/Enter are ignored while an edit is open.

## More

Chrome and Edge only; Safari is not supported. The design, the package layout and the HTTP API
are in [docs/PLAN.md](docs/PLAN.md). `plugins/trove/dist` is generated; see
[plugins/trove/README.md](plugins/trove/README.md).

MIT licensed; see [LICENSE](LICENSE).
