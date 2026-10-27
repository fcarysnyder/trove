# Changelog

All notable changes to Trove are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Trove uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release notes on GitHub are generated from this file, so each version's
summary paragraph and sections are what readers see there.

## [Unreleased]

## [0.5.3] - 2026-10-27

Trove 0.5.3 adds Create PR. When you have finished a review, one button asks
your agent to commit what you accepted and open a pull request for it.

### Added

- Create PR in the Files header, once nothing is waiting for review and something you accepted is not yet committed. It asks the agent to commit only the staged files, on a new branch if you are on the default branch, push it and open the pull request with `gh`, then reply with its link. Trove itself still never commits.

## [0.5.2] - 2026-10-27

Trove 0.5.2 changes how the start screen opens a branch. Picking one now
switches the checkout you are in, as `git switch` would, and a new branch can
go in a worktree of its own, kept in one folder you choose instead of beside
your code. Agents can start in the terminal app you use.

### Added

- Tick Worktree when you create a branch to put it in a worktree of its own, at `<folder>/<repo>/<name>`. The folder is `~/.trove/worktrees` until you pick another with the cog, and the name starts as the branch's and can be changed.
- Delete a worktree's folder from Recent. The branch stays, and git refuses while the folder has uncommitted or untracked files, so nothing unsaved is lost.
- Start agents in Terminal, iTerm2, Ghostty, WezTerm, kitty or Alacritty: the Agent row lists the ones you have installed.

### Changed

- Picking an existing branch on the start screen switches this checkout to it instead of making a new folder. A branch already checked out in another worktree opens that worktree.
- Creating a branch without Worktree runs `git switch -c`, which carries your uncommitted edits onto the new branch.
- The open dialog's fields line up on one grid, the dialog stays pinned near the top as it grows, and Review is hidden while you create a branch.
- The start window opens larger, and Recent keeps every time in one column.
- The editor's three footers are the same height.

## [0.5.1] - 2026-10-27

Trove 0.5.1 lets you start work on a branch from the start screen. Open a
repository, pick any branch or name a new one, and Trove checks it out in a
worktree of its own and starts your agent there, so you no longer need a
Claude Code session open first. The open dialog is redesigned to match the
rest of the app.

### Added

- Create a branch from the open dialog: choose New, name it and pick what it branches from. Trove creates it in its own worktree beside the repository, `<repo>-<branch>`, opens it and starts Claude Code or Codex there. The branch does not track its base, so a plain `git push` cannot land on `main`.
- Open any local branch from the open dialog. A branch already checked out in a worktree opens that worktree; any other is checked out in a new one. Your main checkout is never switched.

### Changed

- The open dialog has labels over its fields, switches for Branch, Review and Agent, the agent command on one line with Copy, and Cancel beside Open. Options that do not apply are disabled rather than hidden, so the dialog keeps its shape as you change them. The Worktree and Branch menus are one Branch menu.
- The start screen has more room around it, and Recent scrolls inside its card instead of running off the window.
- Long paths are shortened in the middle, keeping the repository's folder, with `~` for your home folder.

### Fixed

- Dialogs no longer grow past the window when they show a long path or command.

## [0.5.0] - 2026-10-26

Trove 0.5 is the first release you can download. The Mac app comes as a disk
image on GitHub Releases, with its own icon and a new look, and the CLI ships
beside it as a single file. The start screen lets you open or clone a
repository in one step, one menu switches repository, worktree and branch,
and Trove now tells you when your agent has gone and starts a new one for you.

### Added

- Download Trove for Mac from GitHub Releases as a disk image for Apple silicon, with a SHA-256 checksum and a build provenance attestation you can verify with `gh attestation verify`.
- Download the CLI from the same release as one file, `trove-<version>.mjs`, that runs on Node 22 with nothing to install.
- Accept every pending file in view at once with Accept all in the Files header. It stages them in a single `git add`.
- Trove has an icon: a cube of glass blocks around an orange T. Small sizes use the T on its own so it stays legible, and browser tabs show the same mark.
- Clone a GitHub repository from the start screen: paste a URL or pick one of your repositories, choose where it goes, and it opens ready to review. It uses the GitHub CLI when you have it, so private repositories work with your existing sign-in.
- Go back to the start screen from any repository window with the home button.
- When there is nothing to review, Trove lists the other worktrees and recent repositories that have uncommitted changes, with a count for each, so you can jump to one. The start screen's recents show the same counts.
- Start Claude Code or Codex from the agent menu in a repository window. It opens in Terminal already attached; the commands to copy are still there underneath.

### Changed

- The Mac app is signed ad hoc, so it opens on Apple silicon.
- The start screen is one page instead of a three-step wizard. Opening a repository asks, in one dialog, what to review and which agent to start.
- One repository menu replaces the separate repository, worktree and branch menus. It has a tab for each, each with its own search, and the Worktree tab appears only when the repository has more than one.
- Trove has a new look, based on tweakcn's amber-minimal theme in Trove's orange, with larger buttons and a toolbar in the style of GitHub Desktop. On the Mac the window has no title text.
- Every column says what is going on when it is empty, and the progress bar shows even when there are no files.
- The README is rewritten for people evaluating Trove rather than for the agent.

### Fixed

- The agent status no longer says an agent is connected after it has quit. It follows the agent's process, so closing it shows "No agent connected" within a couple of seconds.

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
