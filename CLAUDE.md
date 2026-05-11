# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the server (http://localhost:3000)
npm run lint       # Syntax-check server JS files via node --check
```

No automated tests exist yet (`npm test` is a no-op).

## Docker

```bash
docker compose up --build   # Build and run via Docker (port 3000)
```

Persistent data (tokens, cache, jobs) lives in a named Docker volume (`app-data`) mounted at `/app/data`.

## Architecture

This is a Node/Express backend + vanilla browser frontend. The backend owns everything: OAuth, YouTube API calls, cache persistence, and the job queue. The frontend (`public/`) is static HTML/CSS/JS and only communicates with the backend over HTTP.

**Backend modules** (`server/`):
- `index.js` — Express server, all REST routes, startup bootstrap. Holds in-memory `cacheState` (the live view of `playlists.json`).
- `youtube.js` — OAuth2 client lifecycle, YouTube Data API v3 helpers (paginated fetches, duration resolution, CRUD operations).
- `jobs.js` — Persisted job queue (`jobs.json`). Every mutation is enqueued as a job, processed sequentially, then triggers a full cache rebuild.
- `cache.js` — Read/write helpers for `playlists.json`.
- `watchHistory.js` — Loads `data/watch-history.json` to prevent re-adding already-watched videos.
- `config.js` — Exports `DATA_DIR` (defaults to `./data`, overridden via `DATA_DIR` env var).

**Mutation flow**: `enqueueJob` → `processPendingJobs` → `rebuildCache` (full API re-fetch → write `playlists.json`). The cache is always rebuilt from live API data after mutations, never patched in place.

**Data directory** (`DATA_DIR`, default `./data`):
- `tokens.json` — OAuth tokens (auto-created after first authorization)
- `playlists.json` — Full cache (playlists + videos with durations)
- `jobs.json` — Job queue state
- `watch-history.json` — Optional; array of video IDs (or `{ videos: [...] }` / `{ history: [...] }`) to block re-adding watched videos

## Environment / Credentials

Copy `.env.example` to `.env`. OAuth credentials can be provided as env vars (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`) or via a `credentials.json` file (Google Web Application format). The redirect URI must match `http://localhost:<PORT>/oauth/callback`.

First-run flow: start the server → open `http://localhost:3000` → click **Connect** → complete OAuth → tokens persist to `data/tokens.json`.

## Key Design Rules

- The job queue (`jobs.json`) stops processing on the first error. When the UI shows a job indicator, use **Resume jobs** (after fixing the root cause, e.g. re-authorizing) or **Clear pending** to discard the stuck jobs.
- `invalid_grant` errors automatically clear stored tokens and return `{ needsAuth: true }` so the frontend can prompt re-authorization.
- Adding a video checks for duplicates across all playlists and against `watch-history.json` before enqueuing.
- Search, sorting, duration filtering, and random selection are all client-side against the cached data from `/api/playlists`.
