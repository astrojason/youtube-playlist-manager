
# YouTube Playlist Management App — Full Specification

## 1. Overview
A local macOS GUI application (dark mode only) for managing YouTube playlists and videos using the YouTube Data API v3. The app maintains a local JSON cache as the UI source of truth while keeping YouTube state fully synchronized.

---

## 2. Platform & Runtime
- **OS**: macOS (MacBook Pro)
- **Application Type**: Local GUI
- **Theme**: Dark mode only
- **Execution**: Runs locally, no server component
- **Persistence**: `playlists.json` in project root

### JSON Rules
- If `playlists.json` does not exist → fetch all data from YouTube and create it
- If it exists → load from disk
- Manual refresh or any mutation triggers a full or partial resync and overwrites JSON

---

## 3. External Integration
### YouTube Data API v3
**Required OAuth scopes**
- `youtube.readonly`
- `youtube.force-ssl`

**Supported API Operations**
1. Fetch playlists
2. Create playlists
3. Delete playlists
4. Fetch playlist items
5. Add videos to playlists
6. Remove videos from playlists

Pagination and quota limits must be handled explicitly.

---

## 4. Data Model

### Playlist
- playlistId
- title
- description (optional)
- videos[]

> Video count is derived from `len(videos)`

### Video
- videoId (YouTube ID)
- title
- durationSeconds
- position (playlist order)
- playlistId

---

## 5. Core Features

### Playlist Management
- List all playlists
- Create playlist
- Delete playlist
- View playlist details
- Search playlists by name (case-insensitive, partial match)

### Video Management (Per Playlist)
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

## 6. Shared Video Card Component

A reusable UI component used everywhere a video is displayed.

### Displayed Fields
- Video title (clickable)
- Duration (mm:ss)
- Playlist name (when shown outside playlist context)
- YouTube video ID (secondary / copyable)

### Interactions
- Clicking the video title opens the video in a new window (system browser or embedded web view)
- Supports selection for batch operations
- Supports context actions (remove, move, etc.)

---

## 7. Search

### Scope
- Global search (all playlists)
- Playlist-scoped search

### Targets
- Playlist names
- Video titles

### Results Include
- Playlist name
- Video title
- Duration
- Video ID

---

## 8. Random Video Selection

### Entry Points
- **Home view**: random video from all playlists
- **Playlist view**: random video from current playlist only

### Rules
- Random selection always renders exactly one Video Card
- Duration filter is applied before random selection
- If no videos match the filter, show a clear empty-state message

---

## 9. Duration Filtering (Search + Random)

- User specifies target duration in minutes
- Fuzzy matching window: ±10%
  - Example: 10 minutes → 9–11 minutes
- Applies to:
  - Search results
  - Random selection pool

---

## 10. Sync & State Management

- Local JSON is the authoritative UI state
- Any mutation:
  1. Apply change via YouTube API
  2. Update in-memory state
  3. Persist updated state to `playlists.json`
- Manual refresh:
  - Re-fetch all playlists and videos
  - Rebuild JSON from API data

---

## 11. Error Handling
- API quota exhaustion
- Invalid YouTube video IDs
- Partial failures in batch operations
- Network failures
- JSON corruption or schema mismatch

Errors must be surfaced clearly without crashing the application.

---

## 12. Non-Goals
- No video playback
- No offline edits without sync
- No mobile support
- No advanced OAuth UX polish

---

## 13. Codex / Code Generation Instructions

```
You are building a local macOS GUI application (dark mode only) for managing YouTube playlists.

Primary goals:
- Manage YouTube playlists and videos via YouTube Data API v3
- Maintain a local JSON cache (playlists.json) as the UI data source
- Keep local state and YouTube state strictly synchronized

Constraints:
- Runs locally on macOS
- GUI-based
- Dark mode only
- Reads from playlists.json in the root directory
- If playlists.json is missing or refresh is triggered, fetch all data from YouTube
- All write operations must update YouTube first, then persist JSON

Required features:
- List, create, delete playlists
- Fetch playlist videos and compute total duration dynamically
- Sort videos by title, order, or length
- Add/remove/move videos (single and batch)
- Global and playlist-scoped search
- Random video selection (global or per playlist)
- Duration-based fuzzy filtering (±10%)

UI rules:
- Implement a reusable VideoCard component
- Clicking a video title opens the video in a new window
- Random selection renders a VideoCard
- No playback or autoplay

Architecture expectations:
- Separate YouTube API client, local store, domain models, and GUI layer
- Handle pagination and quota limits
- Tolerate partial failures in batch operations
- Prefer explicit, readable code over clever abstractions

Do not implement playback.
Do not assume constant network availability.
```
