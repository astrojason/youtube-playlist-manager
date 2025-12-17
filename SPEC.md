
# YouTube Playlist Manager — Local Web App Specification

## 1. Overview
A locally hosted web application for managing YouTube playlists and videos using the YouTube Data API v3.
The application runs on `localhost`, uses a browser-based dark-mode UI, and maintains a local JSON cache as the authoritative UI state.

This is **not** a native desktop app.

---

## 2. Platform & Runtime

### Environment
- **Host OS**: macOS (MacBook Pro)
- **Runtime**: Local web server
- **UI**: Browser-based (Chrome / Safari)
- **Theme**: Dark mode only

### Execution Model
- Backend server runs locally
- Frontend served from backend
- User opens the app via `http://localhost:<port>`

---

## 3. Persistence & Local State

### JSON Cache
- File: `playlists.json`
- Location: Project root
- Purpose: UI source of truth

### Rules
- If `playlists.json` does not exist:
  - Fetch all playlists and videos from YouTube
  - Create `playlists.json`
- If it exists:
  - Load on startup
- Any mutation:
  1. Apply change via YouTube API
  2. Update in-memory state
  3. Persist updated state to `playlists.json`
- Manual refresh:
  - Re-fetch all playlists and videos
  - Rebuild JSON from API data

---

## 4. External Integration

### YouTube Data API v3

#### OAuth
- Client type: **Web Application**
- Redirect URI:
  ```
  http://localhost:<port>/oauth/callback
  ```
- Tokens stored locally (file or memory)
- Refresh tokens supported

#### Required Scopes
- `youtube.readonly`
- `youtube.force-ssl`

#### Supported Operations
1. Fetch playlists
2. Create playlists
3. Delete playlists
4. Fetch playlist items
5. Add videos to playlists
6. Remove videos from playlists

Pagination and quota handling are mandatory.

---

## 5. Data Model

### Playlist
- playlistId
- title
- description (optional)
- videos[]

### Video
- videoId (YouTube ID)
- title
- durationSeconds
- position (playlist order)
- playlistId

---

## 6. Core Features

### Playlist Management
- List all playlists
- Create playlist
- Delete playlist
- View playlist details
- Search playlists by name (case-insensitive, partial match)

### Video Management
- Fetch all videos and compute total duration dynamically
- Sort videos by:
  - Title
  - Playlist order
  - Length
- Add video by YouTube video ID
- Remove videos:
  - Individual
  - Batch
- Move videos between playlists:
  - Individual
  - Batch
  - Preserve relative order unless explicitly changed

---

## 7. Shared Video Card Component

A reusable UI component used everywhere videos are displayed.

### Displayed Fields
- Video title (clickable)
- Duration (mm:ss)
- Playlist name (when outside playlist context)
- YouTube video ID (secondary / copyable)

### Interactions
- Clicking the video title opens the video in a **new browser tab**
- Supports selection for batch operations
- Supports context actions (remove, move, etc.)

---

## 8. Search

### Scope
- Global (all playlists)
- Playlist-scoped

### Targets
- Playlist names
- Video titles

### Results Include
- Playlist name
- Video title
- Duration
- Video ID

---

## 9. Random Video Selection

### Entry Points
- **Home view**: random video from all playlists
- **Playlist view**: random video from current playlist only

### Rules
- Random selection always renders exactly one Video Card
- Duration filter is applied before randomness
- If no videos match filters, show a clear empty-state message

---

## 10. Duration Filtering (Search + Random)

- User specifies target duration in minutes
- Fuzzy matching window: ±10%
- Applies to search results and random selection

---

## 11. API Boundary (Frontend ↔ Backend)

- Backend owns OAuth, YouTube API communication, and JSON persistence
- Frontend communicates with backend via HTTP
- No direct YouTube API calls from the browser

---

## 12. Error Handling

- OAuth failures
- API quota exhaustion
- Invalid YouTube IDs
- Partial batch-operation failures
- Network failures
- Corrupt or incompatible JSON

---

## 13. Explicit Non-Goals

- No video playback or embedding
- No offline edits without sync
- No mobile optimization
- No Electron or native wrappers

---

## 14. Codex / Code Generation Instructions

```
You are building a locally hosted web application for managing YouTube playlists.

This is NOT a native desktop app.

Requirements:
- Runs on localhost
- Browser-based UI (dark mode only)
- Backend handles OAuth and all YouTube API calls
- Frontend communicates with backend via HTTP
- Maintain a local JSON cache (playlists.json) as the UI source of truth

Functional requirements:
- List, create, delete playlists
- Fetch playlist videos and compute durations dynamically
- Sort videos by title, order, or length
- Add, remove, and move videos (single and batch)
- Global and playlist-scoped search
- Random video selection with duration-based fuzzy filtering (±10%)

UI rules:
- Implement a reusable VideoCard component
- Clicking a video title opens the video in a new browser tab
- Random selection renders exactly one VideoCard
- Dark mode only
- No playback or autoplay

Architecture rules:
- Separate concerns: API client, persistence, domain models, UI
- Handle pagination and API quotas
- Tolerate partial batch failures
- Prefer explicit, readable code over clever abstractions
- test all functonality thoroughly

Do not implement native desktop features.
Do not assume constant network availability.
```
