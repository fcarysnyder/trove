---
name: bring-file
description: Bring one or more files, as they are at a given branch or commit in a git repository (this checkout or another one), into the current checkout's working tree as an uncommitted, unstaged change. Use when the user says "bring <file> from <commit or branch> into <branch>", "pull that file over from <repo> at <ref>", "restore this file from commit X uncommitted", or "copy the version of X at Y onto my branch". Never commits or stages unless asked.
---

# bring-file

Copies the content of a file at a ref into a working tree, as a plain uncommitted change.

## Inputs

- **repo**: the git repository that holds the ref. Default: the repository of the current working directory.
- **ref**: a branch, tag or commit SHA in that repository.
- **path**: one or more files, absolute or relative to the source repository's root.
- **target**: the checkout to write into. Default: the current working directory's repository, at the same relative path. The user may name a branch ("into main"): that names the branch the target checkout must be on, not a branch to switch to.

## Steps

1. Resolve the source root: `git -C <repo> rev-parse --show-toplevel`. Make each path relative to it.
2. Check the ref holds the file: `git -C <repo> cat-file -e <ref>:<rel>`. If not, say so and stop; do not guess another path.
3. If the user named a target branch, check `git -C <target> branch --show-current` is that branch. If it is not, say which branch the checkout is on and stop. Never switch branches, stash, or reset.
4. If the target file exists and is uncommitted-modified (`git -C <target> status --short -- <rel>` prints ` M` or `??`), say so before overwriting and wait, unless the user already said to overwrite.
5. Write it:

   ```bash
   mkdir -p "$(dirname "<target>/<rel>")" && git -C <repo> show "<ref>:<rel>" > "<target>/<rel>"
   ```

6. Show what changed against the target's HEAD: `git -C <target> diff --stat -- <rel>` (a new file shows as `??` in `git status --short`). Do not `git add`. Do not commit.
7. Only if the user asked for a commit: `git add` those paths alone and commit with a message that names the source ref and repository.

## Report

One line per file: where it came from (repo, short SHA, path), where it landed, and whether it is new, changed (insertions/deletions), or identical to what was there.
