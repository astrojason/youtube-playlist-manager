# YouTube Playlist Manager — Specification

## 1. Overview

A locally hosted (or self-hosted) web application for managing YouTube playlists and videos via the YouTube Data API v3. Runs on `localhost` or a remote server, served by a Node/Express backend. The frontend is a single-page React app compiled in-browser by Babel Standalone.

---

## 2. Platform & Runtime

| Concern | Detail |
|---------|--------|
| Host OS | macOS (dev), Linux (server via Docker) |
| Runtime | Node.js / Express |
| UI | Browser-based (Chrome / Safari), dark mode only |
| Deployment | Docker — `docker compose up` locally, `./deploy.sh` for remote |

**Remote server:** `astrojason@astroserver`, port 3000, `unless-stopped` restart policy, named Docker volume `youtube-data` for persistence.

---

## 3. Persistence

| File | Location | Purpose |
|------|----------|---------|
| `playlists.json` | `DATA_DIR` (default `./data`) | Full playlist + video cache |
| `tokens.json` | `DATA_DIR` | OAuth tokens |
| `jobs.json` | `DATA_DIR` | Job queue state |
| `watch-history.json` | `DATA_DIR` | Optional; video IDs to block re-adding |

### Rules
- On startup: load `playlists.json` if present; otherwise wait for OAuth + first refresh.
- On any mutation: enqueue job → process → rebuild cache via full API re-fetch → write `playlists.json`.
- Manual refresh: same rebuild flow triggered by the UI button.
- The cache is never patched in place — it is always rebuilt from live API data.

---

## 4. External Integration

### YouTube Data API v3

**OAuth:** Web Application flow. Redirect URI: `http://localhost:<PORT>/oauth/callback`. Refresh tokens supported. `invalid_grant` clears stored tokens and surfaces a re-auth prompt.

**Required scopes:**
- `youtube.readonly`
- `youtube.force-ssl`

**Operations:**
1. Fetch playlists (paginated)
2. Create / delete playlists
3. Fetch playlist items (paginated)
4. Add / remove videos
5. Move videos between playlists
6. Resolve video durations via the Videos API

---

## 5. Data Model

### Playlist
```
playlistId    string
title         string
description   string (optional)
videos        Video[]
```

### Video
```
videoId         string   (YouTube ID)
playlistItemId  string
title           string
description     string
durationSeconds number
position        number
thumbnails      string   (default thumbnail URL, may be absent)
playlistTitle   string
```

---

## 6. Job Queue

- Every mutation (add, remove, move, create playlist, delete playlist) is written as a job to `jobs.json` before any API call is made.
- Jobs are processed sequentially. On error the queue halts; the UI surfaces the error count in the Jobs pill.
- **Resume jobs** retries from the first non-complete job.
- **Clear pending** discards all non-complete jobs without running them.

---

## 7. UI Architecture

The frontend is a vanilla-JS-free React SPA served as a static file. Babel Standalone compiles JSX in the browser at page load (acceptable for a personal tool; no build step required).

```
public/index.html  — shell: loads React + ReactDOM + Babel from CDN, then app.js
public/app.js      — JSX source: all components + API wiring
public/styles.css  — full design system
```

### Layout

```
┌────────────────────────────────────────┐
│  Topbar (full width)                   │
├────────────┬───────────────────────────┤
│  Sidebar   │  Main                     │
│  (280px)   │  - Filter bar             │
│            │  - Playlist header        │
│            │  - Toolbar (batch ops)    │
│            │  - Add box (collapsible)  │
│            │  - Video table            │
└────────────┴───────────────────────────┘
```

### Topbar
- Brand mark + "Playlist Manager · YouTube"
- Global search trigger (opens palette; also ⌘K / Ctrl+K / `/`)
- Auth status pill (green "Authorized" or red "Connect" button)
- Jobs pill — shows pending count; click to open Job Panel modal
- Refresh cache button
- New playlist button

### Global search palette (⌘K)
- Searches playlist names and video titles/descriptions across all playlists
- Keyboard navigation (↑ ↓ ↵ Esc)
- Default view: jump-to-playlist list

### Sidebar
- Playlist count, filter input
- Playlist rows: folder icon, name, video count, hover-reveal delete button
- Active row highlighted with accent left-bar
- Footer: New playlist button

### Filter bar (top of main)
- Per-playlist video search
- Max duration filter (minutes)
- Sort select (playlist order / duration / title A→Z)
- Random (all) and Random (playlist) buttons

### Toolbar
- Selection count, Remove selected, Move selected (with target playlist select)

### Add box
- Collapsible (chevron toggle, hint text, `A` keyboard shortcut hint)
- Single URL/ID field + playlist select + Add button
- Bulk textarea + Import button

### Video table
- Zebra-striped rows
- Columns: checkbox | thumbnail + title/description | duration | delete button
- Thumbnail: uses `video.thumbnails` URL if present, striped placeholder otherwise
- Title links to `youtube.com/watch?v=<videoId>` in a new tab

### Modals (palette-backdrop style)
- **Create playlist** — title + description form
- **Job panel** — job list with status colours, Resume / Clear pending / Refresh buttons

---

## 8. Search

| Scope | Targets |
|-------|---------|
| Global palette | Playlist names, video titles, video descriptions |
| Per-playlist filter bar | Video titles, video descriptions |

Duration filter in the filter bar: max duration in minutes (videos exceeding the limit are hidden).

---

## 9. Random Video Selection

- **Random (all):** picks from all videos across all playlists.
- **Random (playlist):** picks from the current playlist only.
- Optional duration filter (max minutes) applied before selection.
- Result displayed as a dismissible panel above the video table; links to YouTube.

---

## 10. Watch History

- `data/watch-history.json`: array of video IDs (or `{ videos: [...] }` / `{ history: [...] }` shape).
- Add single video and bulk import both check this list and skip blocked IDs with a count in the toast.

---

## 11. Error Handling

- OAuth failures (`invalid_grant`) → clear tokens, return `{ needsAuth: true }`, frontend prompts re-auth.
- Duplicate add → blocked client-side (cache check) with toast.
- Watch-history block → same.
- API errors → toast with server error message.
- Job queue halt → Jobs pill shows error count; Resume or Clear pending available.

---

## 12. Deployment

### Local (dev)
```bash
npm start
```
Redirect URI: `http://localhost:3000/oauth/callback`

### Docker (local)
```bash
docker compose up --build
```
Data volume: `app-data` → `/app/data`

### Remote (astroserver)
```bash
./deploy.sh
```
Builds `linux/amd64` image, SCPs image + `.env` to server, stops old container, loads and starts new one. Data volume: `youtube-data` → `/app/data`. Port: 3000.

---

## 13. Non-Goals

- No video playback or embedding
- No offline edits without sync
- No mobile optimization
- No Electron or native wrappers
- No server-side rendering or build pipeline
