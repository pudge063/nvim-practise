# ADR-0005: Local Run via nginx in Docker on Port 80

## Status
Accepted, 2026-08-18

## Context
The app is static files (ADR-0001: no build step) that need to be served
over HTTP for local development and manual testing — `file://` URLs are
enough for a quick look but ES modules (`<script type="module">`) are
blocked by CORS under `file://` in every major browser, so a real HTTP
server is required even for local-only use.

## Decision
`docker/Dockerfile`: `FROM nginx:alpine`, `COPY` the project's static
files (`index.html`, `css/`, `js/`) into `/usr/share/nginx/html`, expose
port 80, no custom nginx config needed (default config already serves a
static webroot correctly for a single-page app with no client-side
routing to fall back for). `docker-compose.yml` at the repo root maps
host `80:80` and builds from `docker/Dockerfile`. `docker compose up
--build` is the one command to run the whole thing locally.

## Rationale
- `nginx:alpine` is a small, well-known base — no reason to reach for
  anything heavier to serve static files.
- Port 80 (not e.g. 8080) matches what was asked for directly and means
  the app is reachable at plain `http://localhost` with no port suffix.
- No build stage in the Dockerfile (just `COPY`) is possible precisely
  because ADR-0001 already ruled out anything that would need one (no
  npm install, no bundler) — the two decisions reinforce each other.
- `docker-compose.yml` over a bare `docker run` command: one file to read
  to see exactly how the container is meant to be started (port mapping,
  build context), rather than that knowledge only living in a README
  code block someone has to copy correctly.

## Alternatives Considered
| Option | Rejected because |
|---|---|
| `python3 -m http.server` / `npx serve` directly on the host | Simpler for a one-off check, but doesn't match "запускай локально приложение в контейнере nginx" — the container + nginx was explicitly requested, not just "some local server." |
| A Node-based static server (`serve`, `http-server`) in the container | Would pull in Node + npm packages inside the image for something nginx does natively and more simply; also contradicts the "no frameworks/deps" spirit extended to tooling. |
| Custom nginx config (gzip tuning, cache headers, etc.) | Nothing here needs it yet — this is a local dev/demo setup, not a production deployment with real traffic/perf requirements. Revisit if/when this ships somewhere real. |

## Consequences
### Positive
- One command (`docker compose up --build`) reproduces the exact same
  serving setup on any machine with Docker, independent of whatever else
  is (or isn't) installed on the host.
- Matches how the eventual production target (a static host — Cloudflare
  Pages/Workers static assets, or anything else) will serve the same
  files: no server-side logic to port over later, because there isn't any.

### Negative / Risks
- Port 80 typically needs elevated privileges to bind on the host in some
  environments (not inside the container — nginx there runs as its own
  user on its own network namespace — but the host-side `docker compose
  up` may need `sudo` depending on the machine's Docker setup). Documented
  in the README rather than silently working around it (e.g. defaulting
  to 8080), since port 80 was explicitly requested.

## Related ADRs
- ADR-0001 (no frameworks/build step) — what makes the Dockerfile a
  single `COPY` instead of a multi-stage build.
