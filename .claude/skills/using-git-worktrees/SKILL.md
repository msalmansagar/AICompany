---
name: using-git-worktrees
description: Use when starting isolated feature work or before committing changes on a branch that already has unrelated work-in-progress — get an isolated workspace instead of fighting a dirty tree.
---

# Using Git Worktrees

Adapted from obra/Superpowers for MSS Technologies, with the hard-won Windows lessons.

**Core principle:** detect existing isolation → use the native tool → only then fall
back to raw git. Never fight the harness.

## Step 0 — Are you already isolated?

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
```
If `GIT_DIR != GIT_COMMON` you are already in a linked worktree — do not create
another. (Guard: `git rev-parse --show-superproject-working-tree` returning a path
means you're in a submodule, not a worktree.)

## Step 1 — Prefer the native tool

This harness has native worktree tools: **`EnterWorktree` / `ExitWorktree`** (and the
`Agent` tool's `isolation: "worktree"`). Use them. They handle placement, branch
creation, and cleanup, and the harness can see the state. Reach for `git worktree add`
only if no native tool is available — a manual worktree the harness can't track is
phantom state.

## Step 2 — The Windows reality (why this skill exists here)

Raw `git worktree` on this machine has bitten us repeatedly. Know these before you use it:

- **`git worktree remove` fails with "Filename too long"** on deep `node_modules`
  paths (`GOT-020`). Fix: PowerShell
  `Remove-Item -LiteralPath "\\?\<path>" -Recurse -Force`, then `git worktree prune`.
- **"Device or resource busy"** when removing a dir the shell's cwd is inside, or that
  a `dotnet`/MSBuild process holds. Fix: `cd` to the repo root first; `dotnet
  build-server shutdown`; then remove.
- A full worktree checkout of `main` is large and pulls no `node_modules` — you can
  typecheck against another project's `tsc` by absolute path instead of installing.

## When NOT to use a worktree — the lighter alternative

If you only need to **commit or move a few files onto another branch without
disturbing a dirty working tree**, a worktree (and stash) is overkill and fragile.
Use the **temp-index plumbing** instead — it never touches the working tree:

```bash
IDX="$PWD/.git/tmp.index"
GIT_INDEX_FILE="$IDX" git read-tree <base-branch>
GIT_INDEX_FILE="$IDX" git add <specific paths>
TREE=$(GIT_INDEX_FILE="$IDX" git write-tree)
COMMIT=$(printf 'msg' | git commit-tree "$TREE" -p <base-branch>)
git branch -f <new-branch> "$COMMIT"          # or git update-ref for the current branch
rm -f "$IDX"
```
Verify the tree is untouched: `git status --porcelain | md5sum` before and after.
For blobs from a file outside the work tree, use `cat file | git hash-object -w --stdin`
(native git mis-resolves `/tmp` and absolute scratchpad paths).

**Rule of thumb:** parallel *work* → native worktree. Landing files on another branch
from a dirty tree → temp-index plumbing. Reserve the stash/checkout dance for last —
it is the one that broke most often this repo.
