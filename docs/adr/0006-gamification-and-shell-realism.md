# ADR-0006: Gamification (Stars, Tiles, In-Terminal Hints) and Shell Realism (Tab Completion, English Output)

## Status
Accepted, 2026-08-18

## Context
The initial task set (ADR-0004) shipped with a plain vertical list, a
manual-only hint button, and a shell whose commands/errors were in
Russian. A follow-up round of requests asked for this to feel more like
a real terminal and more like a game: a compact terminal window sized
like a real one, a tile grid instead of a list with completed tasks
turned green, celebratory effects and a star rating on completion, a
free-play mode with no checks, contextual hints that surface inside the
terminal itself when a learner is visibly stuck, real Tab completion,
and all *terminal* output in English (matching how a real shell behaves,
regardless of the learner's own language) while the *teaching* content in
the tasks panel stays Russian.

## Decision
Several related but separable decisions, grouped here because they
shipped together and reference each other:

1. **Star rating** (`js/tasks.js`, `computeStars`): 1–3 stars per task
   based on `keystrokes / targetKeystrokes` (≤1.5× → 3, ≤3× → 2, else 1;
   tasks with no `targetKeystrokes` always award 3 for completing at
   all). Purely a reward on top of the existing pass/fail check from
   ADR-0004 — never a stricter gate.
2. **Tile grid** replaces the task list: `.task-grid` of small square
   buttons, numbered, turning solid green with a checkmark once done.
   Full title/description still only appears in the detail panel below
   — tiles are for scanning/switching, not for reading.
3. **Completion celebration** (`js/effects.js`): a burst of star/spark
   glyphs animated outward from the status box, plus a pulse ring on it.
   Self-contained (elements remove themselves after their animation),
   deliberately kept out of `tasks.js` so "what counts as done" stays
   decoupled from "what that looks like."
4. **Free mode**: a dedicated button opens a scratch file
   (`/home/user/practice/freeplay.txt`) with `activeTaskId`/`freeMode`
   set such that `onVimKeystroke` no-ops entirely — no checks, no hints,
   re-seeded fresh every time the button is pressed.
5. **In-terminal contextual hints**: alongside the pre-existing manual
   "show hint" button in the tasks panel, `terminal.js` gained
   `showInlineHint()`/`hideInlineHint()` rendering a popup *inside the
   vim view itself*. `tasks.js`'s `_maybeShowInlineHint` triggers it once
   the learner is `targetKeystrokes + 2` keystrokes in without passing
   (or 10 keystrokes for tasks with no target), and re-triggers every 6
   further keystrokes while still stuck — never on the very first
   over-threshold check without the "+2" grace, and never spamming every
   keystroke.
6. **Tab completion** (`terminal.js`'s `_completeShellInput`): first word
   completes against `shell.js`'s exported `COMMAND_NAMES`; anything
   after completes against the target directory's entries. One match
   completes it outright; several complete to their longest common
   prefix, and if that doesn't advance anything, print the candidate
   list — collapsing real bash's double-Tab behavior into a single Tab
   since there's no "did nothing yet" state to wait on here. `Tab`'s
   default browser behavior (move focus to the next element) is always
   prevented in the shell input, matching a real terminal rather than a
   web form.
7. **English terminal output**: `shell.js`, `filesystem.js`'s `FsError`
   messages, and `vim.js`'s status/error messages (`E486`, `E492`,
   `E20`, "Already at oldest change", etc.) are all English, matching
   real Unix tools' and real vim's own default messages. The tasks
   panel's Russian descriptions/hints are unaffected — that boundary is
   deliberate (see Rationale).
8. **`rm -rf /` easter egg**: `shell.js`'s `looksLikeRmRfRoot` detects
   the usual spellings (`-rf`/`-fr`/separate `-r -f`/`--recursive
   --force`) targeting `/` or `/*` and returns a `meltdown` action;
   `terminal.js`'s `_startMeltdown` disables the shell input, adds a
   shaking/red-glow CSS class to the terminal pane, and starts an
   interval printing random fake kernel/filesystem errors that never
   stops on its own — a page reload is the only way out, which is the
   point (the fake breakage is the joke, not something to gracefully
   recover from).
9. **New shell commands**: `ll` (one-per-line fake-permissions listing),
   `whoami`, `w`, `reboot` (`window.location.reload()`), and `cd`
   support for `-` (previous directory, tracked as `FileSystem.prevCwd`)
   and a leading `--`.

## Rationale
- Stars reuse `targetKeystrokes`, a field that already existed purely as
  a reference number (ADR-0004) — turning it into a scoring input was
  free, no new per-task data needed.
- The tile grid trades "read every title at a glance" for "see 28 tasks'
  status at a glance" — appropriate once the task count grew past what a
  scrolling list shows comfortably in a panel this size (ADR-0005/this
  ADR's compact terminal sizing shrank available vertical space too).
- Splitting hints into "on demand" (button, unchanged from ADR-0004) and
  "unprompted, in-terminal" (new) rather than replacing one with the
  other: the button is for a learner who wants the answer's reasoning
  immediately; the in-terminal nudge is for a learner who didn't think
  to ask but is visibly floundering — different moments, worth both.
- The `+2` grace and 6-keystroke repeat interval on the in-terminal hint
  are deliberately not configurable per-task or empirically tuned —
  chosen as "clearly past normal exploration, not so late it feels
  unhelpful," acceptable as a flat constant for a first pass; revisit if
  playtesting says otherwise.
- Free mode's own file (rather than reusing `welcome.txt` or a task's
  scratch file) avoids any chance of a stray edit leaking into a task's
  expected seed state, and re-seeding on every open matches ADR-0002's
  existing "tasks reseed on open" model instead of inventing a second one.
- English terminal output / Russian task panel is a deliberate split,
  not an oversight: a real terminal's own program output (`ls`, `vim`,
  kernel panics) is English regardless of the operator's language on any
  real system — matching that is *more* authentic, not less localized.
  The teaching layer (what to do, why, hints) is where the learner's own
  language actually helps and stays Russian.
- Collapsing bash's double-Tab ("first press extends to common prefix,
  second press lists candidates when nothing changed") to a single Tab
  is a deliberate simplification: implementing real double-Tab requires
  tracking "was the previous keypress also a no-progress Tab on this
  exact input," which is more statefulness than the benefit justifies
  here — one Tab that lists candidates whenever completion can't
  otherwise advance covers the same practical need.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| Hard star-rating gate (must get 3★ to "pass") | Contradicts ADR-0004's explicit stance that completion is result-based, not keystroke-count-based; would punish beginners for not yet knowing the fastest command. |
| Keep the vertical list, just recolor done items green | Doesn't solve the actual problem (28 titles is a lot of vertical scroll in a ~460px-tall panel) — the tile grid is a scan-then-drill-in pattern suited to the new task count. |
| Only in-terminal hints, drop the manual button | Removes an on-demand path a learner might want before they've "struggled" by the threshold's definition — strictly worse, not just different. |
| A `<textarea readonly>` fake terminal history for the easter egg instead of a live `setInterval` | Wouldn't be "infinite" (a fixed transcript has an end) — the ask was specifically unbounded output, which needs an interval that never clears itself. |
| Real double-Tab (track previous-Tab state) | More state (per-input "last completion attempt") for a UX difference (one keypress vs. two) too small to justify it here. |

## Consequences
### Positive
- Every new piece (stars, tiles, hints, completion, easter egg) is
  additive and independently toggleable in code — none of them changed
  `vim.js`'s engine contract or `FileSystem`'s core API beyond the small,
  backward-compatible `prevCwd` addition.
- The English/Russian split gives the terminal a more "real" feel
  without having to translate 28 tasks' worth of teaching prose, which
  would've been by far the larger, riskier translation surface.

### Negative / Risks
- The in-terminal hint's timing constants (`+2`, repeat-every-6,
  fallback-target-10) are guesses, not measured from real learners —
  flagged in Rationale as worth revisiting after actual use.
- `rm -rf /`'s DOM-growth safety cap (see `terminal.js`'s `_printLine`,
  400-line cap) means a learner who leaves the meltdown running for a
  long time won't see literally every error line scroll past forever in
  the DOM — the *generation* of new errors is genuinely infinite, but
  old ones get pruned. Accepted: the joke is "it never stops," not
  "every single line is preserved forever."
- Tab-completion's directory listing calls `fs.list()` inside a
  try/catch that silently treats a bad path as "no candidates" — matches
  real shells' quiet behavior on a nonexistent completion target, but
  means a typo'd directory gives no feedback at all on Tab (as opposed
  to an error), same as real bash.

## Compliance / Verification
- Verified directly via a scripted Playwright pass against the running
  Docker container (not committed — same one-off-script pattern as
  ADR-0005's verification): tile grid renders all 28 tasks, completing
  one turns its tile green and fires the star burst with no console/page
  errors, free mode opens a checks-free buffer, the in-terminal hint
  popup appears after the threshold and dismisses via its close button,
  `whoami`/`ll`/`pwd`/`cd -`/Tab-completion (single match, multi-match
  listing, focus staying on the input) all behave as designed, `rm -rf
  /` disables input and grows the error log over time, and `reboot`
  reloads back to the welcome state.
- Found and fixed during that same pass (not just theoretical risks):
  the in-terminal hint's "already shown" tracking started at `0`, which
  is `< HINT_REPEAT_EVERY` away from any real first keystroke count and
  so suppressed the *first* hint entirely — fixed by starting that
  tracker at `-Infinity` instead of `0`.
- Also found in this same work session, unrelated to the gamification
  features but caught while exercising `f`/`r`/`gg` for the new tasks:
  a count typed before `f`, `r`, or `gg` (e.g. `3ry`, `2f-`, `3gg`) was
  silently dropped by the time the follow-up keystroke arrived, because
  the pending count was consumed via `_takeCount()` a second time at the
  wrong moment. Fixed in `vim.js` via a new `pendingPrefixCount` field
  captured at the moment the prefix is entered; covered by two new
  regression tests in `tests/vim.spec.mjs` (23 tests total, up from 21).

## Related ADRs
- ADR-0003 (vim emulator scope) — the count-prefix bug fixed alongside
  this work lives in the engine that ADR defines the scope of.
- ADR-0004 (task validation) — stars and in-terminal hints both build on
  fields/mechanisms (`targetKeystrokes`, final-state `check()`) that ADR
  already established; neither changes its core contract.
- ADR-0005 (Docker/nginx local run) — the compact, real-terminal-sized
  window (this ADR) is a pure CSS/layout change, no effect on how the
  app is built or served.
