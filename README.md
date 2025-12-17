# YouTube Playlist Manager

This project spins up a local dark-themed web application for managing YouTube playlists and videos through the YouTube Data API v3. The Node/Express backend owns OAuth, API calls, cache persistence (`playlists.json`), and exposes REST endpoints. The browser-only frontend communicates over HTTP and applies the UI rules described in `SPEC.md`.

## Features

- OAuth-backed YouTube Data API client (web application flow, local tokens)
- Local JSON cache (`playlists.json`) as the source of truth
- Playlist CRUD, video add/remove/move operations with batch support
- Persisted YouTube API job queue (`jobs.json`) so every call is tracked, resumes are possible, and the UI exposes an indicator/button for incomplete jobs.
- Job queue view shows pending/running/error jobs along with a **Refresh jobs** button; use it whenever you need visibility into jobs that failed or are waiting.
- Global and playlist-scoped search with duration filtering (±10%)
- Random video selection filtered by playlist and duration
- Dark-mode browser UI with reusable video cards, batch actions, and clipboard helpers

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Provide OAuth credentials:
   - Place a Google Web Application credential file at `credentials.json` (standard form) **or**
   - Set environment variables:
     ```bash
     export YOUTUBE_CLIENT_ID=...
     export YOUTUBE_CLIENT_SECRET=...
     ```
   In both cases the redirect URI must be `http://localhost:3000/oauth/callback`.
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` and click **Connect** to authorize the app. Tokens are persisted to `tokens.json` for future runs.

## Development notes

- Frontend assets live under `public/` (static HTML/JS/CSS). `app.js` owns state management, filtering, random selection, and batch UI interactions.
- Backend modules:
  - `server/youtube.js`: OAuth client + YouTube API helpers (pagination, durations, playlist/video operations).
  - `server/cache.js`: Read/write helpers for `playlists.json`.
  - `server/index.js`: Express server wiring, REST routes, persistence logic, and manual refresh handling.
- On mutations: the workflow is API call → rebuild cache via fresh API data → persist `playlists.json`.

## API surface

- `GET /api/status`: auth + cache status (returns `/auth/start` URL when available).
- `GET /api/playlists`: cached playlists + metadata.
- `POST /api/refresh`: force re-sync with YouTube.
- `POST /api/playlists`: create playlist.
- `DELETE /api/playlists/:playlistId`: delete playlist.
- `POST /api/playlists/:playlistId/videos`: add video to playlist.
- `DELETE /api/playlist-items/:playlistItemId`: remove video.
- `POST /api/videos/batch-remove`: batch delete.
- `POST /api/videos/move`: batch move.
- `GET /api/random`: random selection with optional `playlistId` and `targetMinutes`.
- `/auth/start` and `/oauth/callback` handle OAuth flow.

## Cache expectations

- `playlists.json` (project root) stores playlists with `playlistId`, metadata, and `videos` (each `playlistItemId`, `videoId`, `durationSeconds`, `position`, etc.).
- If the file is absent, the server requires OAuth tokens to fetch all playlists/videos and build it automatically.
- On every mutation the cache and file are rebuilt from live API data to stay consistent.

## Next steps

1. Supply valid credentials and authorize once.
2. Use the UI to manage playlists/videos; search, sort, and random selection are client-side.
3. Consider adding automated tests or linting if the project grows.
4. When the resume jobs indicator appears, resolve the underlying issue (e.g., OAuth), click **Resume jobs**, and the queue will rerun any pending YouTube API requests before the cache syncs.
