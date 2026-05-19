# YouTube Playlist Manager

A locally hosted (or self-hosted) dark-mode web app for managing YouTube playlists via the YouTube Data API v3. The Node/Express backend owns OAuth, API calls, cache persistence, and the job queue. The React frontend communicates with it over HTTP.

## Features

- OAuth-backed YouTube Data API v3 client (web application flow, tokens persisted locally)
- Local JSON cache (`playlists.json`) rebuilt from live API data after every mutation
- Playlist CRUD, video add/remove/move with batch support
- Persisted job queue (`jobs.json`) — every mutation is enqueued, processed in order, and resumable after errors
- Global ⌘K search palette across all playlists and videos
- Per-playlist search, duration filter, and sort; random video selection (global or playlist-scoped)
- Modern dark UI: topbar / sidebar / main grid, Geist font, thumbnail video table

## Getting started (local)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Provide OAuth credentials — either place `credentials.json` (Google Web Application format) in the project root, or set environment variables:
   ```bash
   export YOUTUBE_CLIENT_ID=...
   export YOUTUBE_CLIENT_SECRET=...
   ```
   The redirect URI must be `http://localhost:3000/oauth/callback`.
3. Copy `.env.example` to `.env` and fill in credentials if using env vars.
4. Start the server:
   ```bash
   npm start   # http://localhost:3000
   ```
5. Open the app and click **Connect** to complete the OAuth flow. Tokens persist to `data/tokens.json`.

## Docker (local)

```bash
docker compose up --build
```

Persistent data (tokens, cache, jobs) lives in the named volume `app-data` mounted at `/app/data`. Set `DATA_DIR=/app/data` (already the default in `docker-compose.yml`).

## Deploying to a server

Run `deploy.sh` from the project root. It builds a `linux/amd64` image, ships it to `astroserver`, and restarts the container:

```bash
./deploy.sh
```

The script expects:
- Docker running locally
- `.env` in the project root (copied to `~/youtube-playlist-manager.env` on the server)
- SSH access to `astrojason@astroserver`
- Docker installed on the server

The container runs on port 3000 with `unless-stopped` restart policy and a named volume (`youtube-data`) for persistence.

## Architecture

```
public/
  index.html   — React app shell (loads React + Babel from CDN)
  app.js       — JSX: all UI components + API integration
  styles.css   — Design system (oklch dark palette, Geist font)

server/
  index.js     — Express server, REST routes, in-memory cache state
  youtube.js   — OAuth2 lifecycle, YouTube Data API v3 helpers
  jobs.js      — Persisted job queue (jobs.json)
  cache.js     — Read/write helpers for playlists.json
  watchHistory.js — Loads watch-history.json to block re-adds
  config.js    — DATA_DIR config
```

**Mutation flow:** `enqueueJob` → `processPendingJobs` → `rebuildCache` (full API re-fetch → write `playlists.json`). The cache is always rebuilt from live API data, never patched in place.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Auth state, job summary, watch-history count |
| `GET` | `/api/playlists` | Full cached playlist + video data |
| `POST` | `/api/refresh` | Force re-sync with YouTube |
| `POST` | `/api/playlists` | Create playlist |
| `DELETE` | `/api/playlists/:id` | Delete playlist |
| `POST` | `/api/playlists/:id/videos` | Add video |
| `DELETE` | `/api/playlist-items/:id` | Remove video |
| `POST` | `/api/videos/batch-remove` | Batch delete |
| `POST` | `/api/videos/move` | Batch move |
| `GET` | `/api/random` | Random video (`playlistId`, `targetMinutes` optional) |
| `GET` | `/api/jobs` | Job list |
| `POST` | `/api/jobs/resume` | Resume a stalled queue |
| `POST` | `/api/jobs/clear-pending` | Discard pending jobs |

## Job queue behaviour

The queue stops on the first error. When the UI shows a job error: fix the root cause (e.g. re-authorize), then use **Resume jobs** in the Jobs panel to rerun pending requests, or **Clear pending** to discard them.

## Watch history

Place `data/watch-history.json` containing an array of video IDs (or `{ videos: [...] }` / `{ history: [...] }`) to prevent those videos from being re-added to any playlist.

## Commands

```bash
npm start       # Run server at http://localhost:3000
npm run lint    # Syntax-check server JS via node --check
./deploy.sh     # Build + ship to astroserver
```
