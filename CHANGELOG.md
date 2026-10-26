# Changelog

All notable changes to Trove are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Trove uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release notes on GitHub are generated from this file, so each version's
summary paragraph and sections are what readers see there.

## [Unreleased]

## [0.5.0] - 2026-10-26

Trove 0.5 is the first release you can download. The Mac app now comes as a
disk image on GitHub Releases, with its own icon, and the CLI ships beside it
as a single file. This release also adds Accept all, so a reviewed batch can
be staged in one click.

### Added

- Download Trove for Mac from GitHub Releases as a disk image for Apple silicon, with a SHA-256 checksum and a build provenance attestation you can verify with `gh attestation verify`.
- Download the CLI from the same release as one file, `trove-<version>.mjs`, that runs on Node 22 with nothing to install.
- Accept every pending file in view at once with Accept all in the Files header. It stages them in a single `git add`.
- Trove has an icon: a cube of glass blocks around an orange T. Small sizes use the T on its own so it stays legible, and browser tabs show the same mark.

### Changed

- The Mac app is signed ad hoc, so it opens on Apple silicon.
- The README is rewritten for people evaluating Trove rather than for the agent.

### Upgrading

- The Mac app is not notarized yet. The first time you open it, macOS says it cannot check the app; open System Settings › Privacy & Security and choose Open Anyway. Later launches open normally.

## [0.4.0] - 2026-10-26

Trove 0.4 makes worktrees first class. You can pick one when you start a
review, see which one you are in, and find it again in your recents.

### Added

- Choose a worktree in the desktop wizard, after the repository.
- See the current worktree in the top bar, next to the repository and branch.

### Changed

- Recents and window titles name the repository and the worktree together, such as `trove / feature-x`.
- The CLI's first line names a linked worktree when you serve one.

## [0.3.0] - 2026-10-26

Trove 0.3 brings the agent into the app. The desktop app starts with a short
wizard that can launch Claude Code or Codex already attached to your review,
and any agent can now join a review that is already running.

### Added

- Start a review on the desktop in three steps: choose a repository, choose an agent (Claude Code, Codex or none), and open the editor. Trove opens the agent in Terminal with the command that attaches it to that window.
- Join a running review from an agent with `trove attach`, and leave it with `trove detach`. `trove info` prints the server's status line.
- See which agent is attached in the top bar, updated live as it joins or leaves.

### Changed

- The Claude Code skill attaches to an existing server when you name its port, instead of starting a new one.

## [0.2.0] - 2026-10-26

Trove 0.2 adds Skip and Reject, a repository and branch switcher, and search
and filters in the Files column. Trove now works only on git repositories,
since git's index is what records your approvals.

### Added

- Skip a file to come back to it later, with the S key.
- Reject a change with the X key: a tracked file goes back to HEAD and a new file is deleted. Trove keeps a backup, so Restore brings back the text, the index and any drafts.
- Switch repository, worktree and branch from two menus in the top bar. Switching is a plain `git switch` with no stash, is refused while the agent is working, and a branch checked out in another worktree opens that worktree instead.
- Search the Files column with `/`, open the first match with Enter and clear with Esc. Matches are highlighted and their folders open.
- Filter the Files column by state, with a count beside each one. Pending only is now a shortcut for that filter.

### Changed

- Trove opens git repositories only. A folder that is not inside a git working tree stays on the start screen with "Not a git repository", and the CLI refuses it.
- The CLI's first line names the branch.

### Upgrading

- Recent entries for plain folders are dropped from the desktop app's recents.

## [0.1.0] - 2026-10-26

The first version of Trove: a local review queue for the markdown and HTML an
agent writes, rendered the way a reader sees it. It ships as a Claude Code
plugin, a CLI and a desktop app, and all three run the same page.

### Added

- Review every changed markdown and HTML file in a repository, rendered from the working copy, with the agent's changes since your last read highlighted. MDX and plain text can be turned on in Settings.
- Accept a file to stage it, edit a block in place, or select a passage and comment on it. Comments are anchored to the quoted text, so they survive the agent's edits around them.
- Send your comments to the agent as one batch. Each commented file locks until the agent runs `trove done <file>`, then returns to your queue with its new text marked.
- Review what is uncommitted, or everything the branch changed since its base.
- Set the theme, document types, excludes and git scope in Settings. Light and dark follow the system by default.
- Use Trove from Claude Code with the `markdown-editor` skill, from the `trove` CLI, or from the desktop app, which opens one window and one server per repository and keeps a list of recents.
- Everything stays local: the server binds 127.0.0.1, checks the Host and Origin of every request, and reads and writes only inside the repository.
