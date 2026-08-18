# ADR-0007: Guided Tutorial Mode, Separate from the Task Set

## Status
Accepted, 2026-08-18

## Context
The task set (ADR-0004) is free-choice: 28 tiles, pick any, get a hint on
request or after struggling. That's a good fit for someone who already
knows roughly what vim is and wants to practice specific commands, but a
brand-new visitor landing on the page has nothing telling them what to do
at all — no file is open, there's no tile obviously first, and the
"in-terminal hint" mechanism (ADR-0006) only activates once inside a task.
The ask was for the page to teach itself from the very first second: an
automatic, ordered, one-thing-at-a-time walkthrough — open vim, learn
`hjkl`, learn insert mode, learn `:wq` — with live coaching that advances
itself as the learner does the right thing, no submit button.

## Decision
`js/tutorial.js` adds a second, parallel mode to the existing task mode:

- **`TUTORIAL_STEPS`**: an ordered array, each step `{ id, location:
  "shell"|"vim", title, hint, isDone(state, stepStartState) }`.
  `isDone` is relative to `stepStartState` (a snapshot of `getState()`
  taken the instant the step became current) rather than absolute
  coordinates — "moved the cursor right by 3", not "cursor is at column
  3" — so it doesn't matter where in the file, or which file, the
  learner actually is.
- **`TutorialManager`**: mirrors `TaskManager`'s shape
  (`onVimKeystroke`/render methods) but drives a strictly linear
  sequence instead of free choice, and has an `onShellCommand` hook
  `TaskManager` doesn't need (its first step — "open vim" — happens
  before any `VimEngine` exists to have keystrokes at all).
- **Two hint surfaces**: `terminal.js` already had an in-vim hint popup
  (ADR-0006); this adds a twin `showShellHint()`/`hideShellHint()` pair
  for the shell view, since step 1 fires before vim is open. Both
  gained a `persistent` option — tutorial coaching stays up until the
  action is actually done (it's the instruction, not a nudge), unlike
  the tasks' stuck-nudge which still auto-hides after 8s.
- **`onVimExit` hook**: the final step ("save and quit") can't be
  detected by inspecting post-quit state — `:wq` tears the `VimEngine`
  down entirely. `terminal.js`'s `exitVim()` now calls a new
  `onVimExit()` callback, guarded so it only fires for a real vim
  session ending (not the unrelated directory browser's `q`/`Escape`,
  which also routes through `exitVim()`).
- **Mode switch, not a gate**: `main.js` holds a single `mode` variable
  ("tutorial" | "tasks") and a matching pair of tabs in the tasks pane;
  `Terminal`'s `onVimKeystroke`/`onShellCommand`/`onVimExit` callbacks
  dispatch to whichever manager is active. **`mode` starts as
  `"tutorial"`** — the walkthrough begins the instant the page loads
  (the shell hint for step 1 is visible with zero clicks), and the tabs
  just let the learner jump to the challenge set whenever they want, in
  either direction, without losing progress in the other one.
- **Own seed file, own path choice**: the tutorial writes
  `/home/user/tutorial.txt` (directly in `$HOME`, not under
  `practice/` like every task file) specifically so the very first
  command a brand-new learner ever types — `vim tutorial.txt`, exactly
  as the hint says — has no subdirectory to get wrong.

## Rationale
- Reusing `TaskManager`'s hint-popup plumbing (rather than building a
  separate coaching UI) kept this addition proportional — the new
  surface area is one more manager class plus two small hook additions
  to `terminal.js`, not a parallel app.
- Relative `isDone` checks were chosen after finding, while testing,
  that hardcoding the tutorial's own seed file's exact coordinates
  would make the step fragile to anything about how the learner arrived
  there (extra exploratory keystrokes, a different starting file if
  they'd already been poking around) — matching real teaching, where
  "you moved right" matters, not "you are at column 3."
- Defaulting `mode` to `"tutorial"` rather than requiring a click
  reflects the actual ask ("обучение стартует автоматически") — a
  mode *tab* pair alone, with neither pre-selected, would have left the
  page just as blank-feeling on load as it was before this ADR.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| Make the tutorial just another `tasks.js` entry (task #0) | Tasks are explicitly free-choice/any-order (ADR-0004); a strictly-ordered, auto-advancing, non-dismissable-until-done walkthrough is a different interaction model, not a variant task. |
| Absolute-coordinate `isDone` checks against the exact seed file | Works only if the learner is exactly where the tutorial assumes — breaks the moment they've moved around first, or (before the path fix below) opened a different file than intended. |
| Detect "save and quit" by polling for the vim view becoming hidden | Would need a `MutationObserver` or a render-loop poll for something `terminal.js` already knows synchronously the instant it happens — the `onVimExit` callback is strictly simpler and exact. |
| No default mode; blank mode-select screen until the learner picks one | Directly contradicts "obучение стартует автоматически" — and see Compliance below, this exact shape of gap (instruction not matching what's actually live) is what caused the real bug this ADR's Compliance section documents. |

## Consequences
### Positive
- A first-time visitor gets a concrete first action within seconds of
  the page loading, with no reading required beyond the one hint
  on-screen at any given moment.
- The relative-`isDone` design means new steps (or reordering existing
  ones) rarely need coordinate math — just "what changed since this
  step started."

### Negative / Risks
- Only one linear path exists — a learner who already knows `hjkl` and
  wants to skip to insert-mode steps can't, short of switching to Tasks
  mode entirely. Acceptable for a first pass; a "skip step" control is
  a plausible future addition, not implemented here.
- `TutorialManager` and `TaskManager` both exist and render simultaneously
  at all times (just one is `.hidden`) rather than being lazily
  constructed — harmless at this app's size (both are cheap DOM writes
  into elements nobody sees until switched to) but worth noting if the
  panel ever grows a third mode.

## Compliance / Verification
- Verified directly, not assumed: a scripted Playwright run against the
  built Docker image drove the **entire real keyboard path** — typed
  `vim tutorial.txt` into the actual shell input, then pressed the exact
  keys each step asks for (`l l l`, `j`, `0`, `$`, `i x Esc`, `d d`, `u`,
  `: w q Enter`) through real `keydown` events, confirming every one of
  the 9 steps advances, the step list turns green, the final "🎉"
  message appears, and the learner lands back in the shell — with zero
  console/page errors throughout.
- Found and fixed during that same verification, not caught by the
  logic-only test that preceded it (which called `TutorialManager`
  methods directly, bypassing the DOM entirely and so never exercised
  this): the seed file was written to `/home/user/practice/tutorial.txt`
  but the shell hint told the learner to type `vim tutorial.txt` — from
  `$HOME`, that resolves to a **different, blank, freshly-created**
  file. The tutorial silently stalled forever on step 2 (nothing to move
  the cursor into), with no error anywhere — this is exactly the kind
  of bug a function-level test cannot catch, only driving the real
  input pipeline surfaces it. Fixed by moving the seed file to
  `/home/user/tutorial.txt`, matching the hint exactly.
- Also verified the pre-existing features this touched still work after
  the `terminal.js` changes (moving the `onShellCommand` firing point,
  adding `onVimExit`): `rm -rf /`/`sudo` meltdown (both sounds play,
  reload happens), `echo`/redirection, `vi`/directory browser, and Tab
  completion — all re-driven end-to-end post-change, unaffected.

## Related ADRs
- ADR-0004 (task validation) — `TutorialManager` deliberately mirrors
  its shape where the interaction model is the same (hint button
  equivalent, final-state-ish checks) and diverges where it isn't
  (linear vs. free-choice, persistent vs. auto-hiding hints).
- ADR-0006 (in-terminal contextual hints, easter eggs) — this reuses and
  extends that ADR's hint-popup mechanism (the `persistent` option, the
  shell-side twin) rather than building a new one.
