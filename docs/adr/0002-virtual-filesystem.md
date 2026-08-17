# ADR-0002: In-Memory Virtual Filesystem, Reset Per Page Load

## Status
Accepted, 2026-08-18

## Context
The terminal needs to back real-feeling `ls`, `cd`, `mkdir`, `touch`,
`cat`, `rm` — and vim needs actual files with actual content to open and
edit. None of this can touch the real filesystem (it's a browser page);
it needs its own fake one.

## Decision
`js/filesystem.js` implements a small in-memory tree: every node is
either `{ type: "dir", children: {...} }` or `{ type: "file", content:
"..." }`, rooted at `/`. A `FileSystem` class wraps it with path
resolution (relative to a tracked `cwd`, handling `.`/`..`/absolute
paths) and the operations the shell/vim layers need
(`list`, `stat`, `mkdir`, `touch`, `read`, `write`, `remove`, `exists`).

The tree is seeded once at page load with a fixed starting layout (a
`/home/user` directory containing a `welcome.txt` and a `practice/`
subdirectory) and is **not** persisted — a page reload gets a fresh copy.
Each vim task (see ADR-0004) additionally seeds its own scratch file
content directly into this filesystem when the task is opened, overwriting
whatever was there.

## Rationale
- A plain object tree is the simplest structure that supports everything
  the shell commands in scope (ADR list in README) actually need — no
  need for inode tables, permission bits, or symlinks for a teaching tool.
- Not persisting across reloads keeps the mental model simple ("reload =
  clean slate") and sidesteps a whole class of bugs (stale/corrupted
  localStorage state from a half-finished task). A reload during a task
  just means picking the task again from the list.
- Seeding fresh content per-task (rather than expecting the user to
  `:e otherfile` around a shared filesystem) keeps each task
  self-contained and re-attemptable without leftover edits from a
  previous try.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| `localStorage`-backed persistence | Adds real complexity (serialization, migration if the seed layout changes, "reset to default" UI) for a benefit — surviving a reload — that doesn't matter much for a task-based learning tool where each task resets its own file anyway. Noted as a plausible future enhancement, not ruled out forever. |
| IndexedDB / a real virtual-FS library (BrowserFS etc.) | Way more machinery than six shell commands and a handful of task files need. |
| Skip the filesystem abstraction, hardcode paths per task | Would make `ls`/`cd`/`mkdir` fake in a way that breaks the "basic terminal" requirement — those commands need to operate on *something* real-within-the-page, not just a canned transcript. |

## Consequences
### Positive
- Shell commands and the vim emulator both consume the exact same
  `FileSystem` instance — no duplicated path-resolution logic between them.
- Easy to unit-test in isolation (pure JS object manipulation, no DOM).

### Negative / Risks
- No persistence means a mid-task page refresh loses free-form exploration
  outside the current task (e.g. files created via `mkdir`/`touch` in the
  shell). Acceptable: tasks themselves are unaffected since they reseed on
  open.

## Related ADRs
- ADR-0004 (task validation) — tasks seed and read back from this same
  filesystem.
