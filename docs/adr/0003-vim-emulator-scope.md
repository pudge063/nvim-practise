# ADR-0003: Vim Emulator — Deliberately Scoped Subset, Not a Full Clone

## Status
Accepted, 2026-08-18

## Context
`js/vim.js` is a from-scratch modal-editing engine running against the
virtual filesystem (ADR-0002) — it is not wrapping a real vim/neovim
binary (there isn't one available in a browser tab) and not embedding an
existing JS vim emulation library (ADR-0001 rules out third-party
dependencies of any kind, including JS libraries, not just UI frameworks).
Real vim's command surface is enormous (registers, marks, macros, folds,
jumplists, plugins...); implementing all of it is neither realistic nor
useful for a tool whose job is teaching the *basics*.

## Decision
The engine implements exactly this subset, chosen to cover every task
category in the initial task set (movement by several methods, word/line
selection, search, sorting, basic editing) and nothing beyond it:

**Modes:** Normal, Insert, Visual (charwise), Visual Line, Command-line (`:`).

**Motions** (usable standalone or as an operator's target), all
count-prefixable (`3w`, `5j`, ...):
`h l j k`, `0`, `^`, `$`, `w`, `b`, `e`, `gg`, `G`, `{count}G`, `f{char}`.

**Operators:** `d`, `y`, `c`, combined with the motions above plus the
text objects `iw`/`aw` (so `diw`, `ciw`, `daw`, `yiw` all work) and the
`dd`/`yy`/`cc` doubled-operator shorthand for whole lines.

**Standalone edits:** `x`, `r{char}`, `p`, `P`, `o`, `O`, `i`, `a`, `I`,
`A`, `u` (undo) / `Ctrl-r` (redo) — both backed by a linear snapshot
stack, not vim's real undo tree.

**Visual mode:** `v` / `V` to enter, any motion above to extend the
selection, then `d`/`y`/`x` to act on it and return to Normal.

**Search:** `/{pattern}` + `Enter`, `n` / `N` to repeat forward/backward.

**Command-line:** `:w` (marks the task complete — see ADR-0004), `:q`
(back to shell), `:wq`, `:{number}` (jump to line), `:sort`,
`:'<,'>sort` (sort the last visual selection), `:s/old/new/` and
`:%s/old/new/g` (JS `RegExp` under the hood, not vim's regex dialect).

**Explicitly not implemented** (real vim has it; this doesn't, and isn't
trying to fake it): named registers beyond the single default one, marks
(`` ` ``/`'`), macros (`q`), the dot-repeat command (`.`), folds, splits/
tabs/windows, `t`/`T`/`F` and the `;`/`,` repeat-find, jumplists,
`ci"`/`ci(` and other bracket/quote text objects (only `iw`/`aw`), visual
block mode (`Ctrl-v`).

## Rationale
- The task set this ships with (see README) only needs the motions/edits
  listed above — building further than that is speculative scope with no
  task to justify it yet (see project CLAUDE-style guidance: no code for
  hypothetical future requirements).
- `iw`/`aw` specifically are included over other text objects because
  "select/change/delete a word" is one of the single most-taught vim
  fundamentals and directly maps to a task category ("выделение слов").
- A linear undo/redo snapshot stack (full buffer copy per edit) is
  dramatically simpler than vim's actual undo tree and is indistinguishable
  from it for the "press u a few times" scale this tool's tasks need.
- Listing what's *not* implemented explicitly (rather than leaving it
  implicit) matters here specifically because the target audience is vim
  beginners who may not yet know what they're missing — the README /
  in-app help says as much so nobody assumes, say, macros work.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| Pull in an existing JS vim-emulation library (CodeMirror's vim mode, ace's, monaco-vim) | ADR-0001 rules out third-party dependencies outright — the requirement was "no frameworks," and while a vim-mode library isn't a UI framework, it's still an external dependency this project isn't taking on for a learning tool whose whole point is a hand-built, fully-understood engine. |
| Try to implement "all of vim" | Unbounded scope for a project that needs to ship; most of real vim's surface (macros, marks, folds, jumplists) has no corresponding beginner task and would be dead code. |
| Skip Visual mode / search / sort entirely, ship only basic motions+editing | Would fail three of the task categories explicitly requested up front (selection, search, sorting selected lines). |

## Consequences
### Positive
- Every implemented command has at least one task exercising it — no
  speculative surface area.
- Small enough engine (single `vim.js` module, one state object, one
  `handleKey` dispatch) to actually read and modify by hand later.

### Negative / Risks
- A user who already knows real vim will hit walls (no macros, no marks,
  no `.`) faster than a beginner will — acceptable, since the target
  audience is explicitly beginners learning the basics, not vim power
  users evaluating a drop-in editor replacement.
- `:s`/`:%s` uses JS regex syntax, which differs from vim's regex dialect
  in some escaping rules (`\d` vs `\d`, character classes mostly match,
  but e.g. vim's `\v` very-magic mode has no JS equivalent) — acceptable
  for the one substitution-focused task this ships with; documented as a
  known divergence rather than silently papered over.

## Compliance / Verification
- Verified directly, not assumed: `tests/vim.spec.mjs` (Node's built-in
  test runner, `node --test`) exercises every motion, both operators'
  text-object and doubled-letter forms, `x r p P o O i a I A`, undo/redo,
  charwise and linewise visual delete, `/` + `n` search with wraparound,
  `:sort` and `'<,'>sort`, `:s` vs `:%s/../../g`, and the `:w`/`:q`
  callbacks — 21 tests, all passing as of this ADR's acceptance.
- The `d{count}G` interaction specifically (an operator combined with a
  motion whose behavior depends on whether a count was explicit) was
  bug-prone during development — an earlier version silently ignored the
  count in this combination — and now has a dedicated regression test.

## Related ADRs
- ADR-0002 (virtual filesystem) — the buffer this engine edits is backed
  by that filesystem's file content.
- ADR-0004 (task validation) — defines which of the above commands each
  shipped task actually expects the learner to use.
