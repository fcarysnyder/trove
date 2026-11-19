# plugins/trove: maintainer's note

The Claude Code plugin. `skills/markdown-editor/SKILL.md` is the agent's side and `dist/` is what it
runs; `skills/html-prototype/SKILL.md` is how the agent edits an HTML page in its own style;
`skills/bring-file/SKILL.md` copies a file from a ref into the working tree, uncommitted.
`hooks/hooks.json` runs `trove signal` on Claude Code's `PermissionRequest`, `Notification` and
`Stop`, so the page knows when the agent needs the user; it prints nothing and does nothing when no
Trove serves the project.

`dist/` is generated: `trove.mjs` is the CLI bundle from `packages/cli` (core included, Node
built-ins only, Node 22+), `ui/` is the built page from `packages/ui`, and `BUILD.json` records the
commit and time it was built from. The CLI serves the `ui/` folder next to itself.

Rebuild it with `pnpm build:plugin` (`scripts/build-plugin.mjs`) after any change to core, cli or
ui, and commit the result with that change. It is committed so installing the plugin from git
needs no build step. CI rebuilds it and fails when the committed copy is stale (`BUILD.json` is
left out of that check, since it always changes), and runs `node plugins/trove/dist/trove.mjs
--selftest` against the committed bundle.
