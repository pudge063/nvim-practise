# ADR-0004: Task Validation by Final-State Check, Not Keystroke Replay

## Status
Accepted, 2026-08-18

## Context
Each task needs to know whether the learner actually completed it —
"удали второе слово в строке", "отсортируй выделенные строки", "перейди
на 10 символов вправо самым быстрым способом" — and needs a hint button
that reveals what to do (and why) without giving away the exact keys.
Vim has no single correct keystroke sequence for almost anything (deleting
a word is `dw`, or `daw`, or `veld` if you really want to suffer, or
visual-select + `d`) — a checker that expects one specific key sequence
would mark correct solutions wrong.

## Decision
A task is a plain object:
```js
{
  id, category, title, description, hint,
  seed: { path, lines },       // file + starting content, written into
                                 // the virtual filesystem (ADR-0002) when
                                 // the task is opened
  targetKeystrokes: 3 | null,   // optional "do it in N presses" reference,
                                 // shown but not enforced
  check(state) { ... return boolean }, // inspects the vim engine's final
                                        // buffer/cursor/mode, NOT the key
                                        // log
}
```
`js/tasks.js` re-checks `check(state)` after every keystroke once the
learner is in a task (cheap — buffer sizes are small); the moment it
returns `true`, the task flips to "done" in the sidebar. A running
keystroke counter is shown next to `targetKeystrokes` for tasks that have
one, purely informational — it never blocks success.

The hint button reveals `hint` (a short "what to do and why" string) on
click; it does not reveal a keystroke sequence.

## Rationale
- Checking final buffer/cursor state instead of a keylog is the only way
  to accept the many equally-valid vim solutions to the same edit —
  matching how vim is actually used and taught (there is no "one true
  way" to delete a word).
- Re-checking after every keystroke (rather than only on `:w`) gives
  instant "✓ done" feedback the moment the buffer matches, without
  requiring the learner to remember to save — useful for early movement
  tasks where "save" isn't the point at all (e.g. "move the cursor to
  the last line").
- Keystroke count as a *visible but non-blocking* metric lets a task say
  "vim pros can do this in 2 keys" as a stretch goal / teaching moment,
  without punishing a beginner who gets there in 6.
- Hints describing intent ("what and why") rather than exact keys keep
  the learner in problem-solving mode — they still have to find the
  command, just know what they're looking for.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| Match an exact expected keystroke sequence | Rejects valid alternative solutions (`dw` vs `daw` vs visual+d) — actively teaches a false "one true way" that doesn't reflect real vim usage. |
| Only check on explicit `:w` | Works fine for edit-the-file tasks but is a bad fit for pure-movement tasks ("get the cursor here") where there's nothing to "save" — would need every movement task to invent a fake save step just to trigger a check. |
| Reveal the exact key sequence as the hint | Turns the game into copy-the-keys rather than learn-the-command; the chosen "what and why" phrasing keeps it a hint, not an answer key. |
| Enforce `targetKeystrokes` as a hard requirement for success | Would make the *only* correct solution the shortest one, which is a much higher bar than "learn this command exists and works" — appropriate for a later "speedrun" mode, not the base task set. |

## Consequences
### Positive
- New tasks are just a data object + a `check()` predicate — no changes
  needed to the vim engine or the checking loop to add one.
- Robust to the vim engine gaining new equivalent ways to do the same
  edit later (e.g. adding `ciw` doesn't break existing `dw`-based tasks'
  checks, since checks only look at the resulting buffer).

### Negative / Risks
- A task whose `check()` is too loose could report success on an
  accidental/unintended edit that happens to match (e.g. a "delete line
  2" task passing because the learner deleted a *different* line that
  happened to have the same content). Mitigated by seeding each task's
  file with content specific enough that this collision is unlikely;
  worth re-checking per-task as the task set grows.
- Per-keystroke re-checking is O(task complexity) on every key — fine at
  this scale (single small buffer, a handful of tasks active at once),
  would need throttling if buffers or the check functions ever got large.

## Related ADRs
- ADR-0002 (virtual filesystem) — tasks seed/read files through it.
- ADR-0003 (vim emulator scope) — defines the vocabulary of commands a
  task's `check()` can expect the learner to have available.
