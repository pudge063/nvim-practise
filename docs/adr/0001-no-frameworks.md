# ADR-0001: Vanilla HTML/CSS/JS, No Frameworks, No Build Step

## Status
Accepted, 2026-08-18

## Context
vimquest is a single-page browser game: a styled terminal (basic shell
commands + an in-browser vim emulator) with a task/hints panel next to it.
The explicit requirement going in was "html/css без каких-либо сторонних
фреймворков" — no React/Vue/etc., no CSS framework.

## Decision
Plain HTML, CSS, and JavaScript. JS is split into ES modules
(`<script type="module">`, native browser module loading — no bundler,
no npm, no `node_modules`). No build step: the files under `js/`/`css/`
are exactly what ships and exactly what the browser parses.

## Rationale
- Directly satisfies the stated requirement — this isn't a case of
  "frameworks would be better but the user said no," a hand-rolled
  terminal/vim-emulator/task-engine is small enough in scope that a
  framework wouldn't meaningfully simplify it anyway.
- No build step means the Docker image (ADR-0005) is a single `COPY` into
  nginx's webroot — no `npm install`/`npm run build` stage, no
  `node_modules` to cache or invalidate, nothing to keep in sync between
  a lockfile and the image.
- Native ES modules give real file-per-concern separation
  (`filesystem.js`/`shell.js`/`vim.js`/`tasks.js`/`terminal.js`/`main.js`)
  without needing a bundler just to get that.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| React/Vue + Vite | Explicitly ruled out by the requirement; also overkill for one page with no routing and a handful of interactive regions. |
| A single monolithic `app.js` | Would avoid needing ES modules at all, but mixes filesystem/shell/vim-engine/task-engine concerns in one file — harder to reason about and to extend with new task types later. |
| A CSS framework (Tailwind/Bootstrap) | Explicitly ruled out; the visual design here (glassmorphism terminal window, gradient background) is bespoke enough that utility classes wouldn't save much anyway. |

## Consequences
### Positive
- Zero install step for anyone cloning the repo — open `index.html`
  through any static server (or the Docker setup in ADR-0005) and it runs.
- No dependency-update treadmill (no `package.json`, no security
  advisories to track for a JS framework).

### Negative / Risks
- No framework reactivity/diffing — DOM updates in `terminal.js`/`tasks.js`
  are done by hand (direct `textContent`/`innerHTML` writes). Acceptable
  at this UI's scale (one terminal pane, one task list); would need
  rethinking if the UI grew substantially more complex.
- No TypeScript/type-checking — relying on discipline and manual testing
  (see TESTING notes in README) rather than a compiler to catch mistakes.

## Related ADRs
- ADR-0005 (Docker/nginx local run) — the no-build-step decision here is
  exactly what keeps that Dockerfile a single `COPY`.
