import express from "express";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  fetchAllPlaylistsWithVideos,
  generateAuthUrl,
  exchangeCode,
  hasStoredTokens,
  ensureTokens,
  clearStoredTokens,
} from "./youtube.js";
import { readCache, writeCache } from "./cache.js";
import {
  enqueueJob,
  processPendingJobs,
  jobSummary,
  listJobs,
  resumeErroredJobs,
  clearPendingJobs,
} from "./jobs.js";
import { loadWatchHistory } from "./watchHistory.js";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
const publicDir = resolve(__dirname, "../public");

const PORT = Number(process.env.PORT) || 3000;

function getChangelog() {
  const log = execSync(
    'git log --pretty=format:"%h|%s|%ad" --date=short -n 50',
    { cwd: resolve(__dirname, "..") }
  ).toString().trim();
  return log.split('\n').filter(l => l).map(l => {
    const [hash, ...rest] = l.split('|');
    const date = rest.pop();
    const message = rest.join('|');
    return { hash, message, date };
  });
}

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

let cacheState = {
  playlists: [],
  syncedAt: null,
  version: 0,
  watchHistory: [],
};
let cacheLoaded = false;

function metaFromState() {
  const playlists = cacheState.playlists ?? [];
  const totalDurationSeconds = playlists.reduce((acc, playlist) => {
    return (
      acc +
      (playlist.videos ?? []).reduce((sum, video) => sum + (video.durationSeconds ?? 0), 0)
    );
  }, 0);
  const videoCount = playlists.reduce((count, playlist) => count + (playlist.videos?.length ?? 0), 0);

  return {
    playlistCount: playlists.length,
    videoCount,
    totalDurationSeconds,
    syncedAt: cacheState.syncedAt,
    version: cacheState.version ?? 0,
  };
}

async function initializeCache() {
  try {
    const existing = await readCache();
    if (existing) {
      cacheState = {
        playlists: Array.isArray(existing.playlists) ? existing.playlists : [],
        syncedAt: existing.syncedAt ?? null,
        version: existing.version ?? 0,
        watchHistory: Array.isArray(existing.watchHistory) ? existing.watchHistory : [],
      };
      cacheLoaded = true;
      return;
    }
  } catch (error) {
    console.error("Unable to read cache at startup:", error.message);
  }
}

async function rebuildCache() {
  await ensureTokens();
  const fresh = await fetchAllPlaylistsWithVideos();
  const watchHistoryResult = await loadWatchHistory();
  const watchHistoryToStore =
    watchHistoryResult.loaded && Array.isArray(watchHistoryResult.ids)
      ? watchHistoryResult.ids
      : cacheState.watchHistory ?? [];
  cacheState = {
    ...fresh,
    playlists: Array.isArray(fresh.playlists) ? fresh.playlists : [],
    version: (cacheState.version ?? 0) + 1,
    watchHistory: watchHistoryToStore,
  };
  cacheLoaded = true;
  await writeCache(cacheState);
  return cacheState;
}

function isInvalidGrant(error) {
  if (!error) {
    return false;
  }
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("invalid_grant") || message.includes("invalid grant")) {
    return true;
  }
  const responseData = error.response?.data;
  if (responseData && typeof responseData === "object") {
    if (responseData.error === "invalid_grant") {
      return true;
    }
    const description = (responseData.error_description ?? "").toLowerCase();
    if (description.includes("invalid_grant") || description.includes("invalid grant")) {
      return true;
    }
  }
  return false;
}

async function handleError(res, error) {
  console.error(error);
  if (error.message?.includes("OAuth tokens missing")) {
    return res.status(401).json({ error: error.message, needsAuth: true });
  }
  if (isInvalidGrant(error)) {
    await clearStoredTokens();
    return res.status(401).json({
      error: "Stored OAuth tokens are invalid; please reconnect to authorize the application.",
      needsAuth: true,
    });
  }
  return res.status(500).json({ error: error.message ?? "Unexpected server error" });
}

async function processJobsAndRefresh() {
  const result = await processPendingJobs();
  if (result.processedCount > 0) {
    await rebuildCache();
  }
  if (result.error) {
    throw result.error;
  }
  return result;
}

app.get("/api/status", async (req, res) => {
  try {
    const authorized = await hasStoredTokens();
    let authUrl = null;
    try {
      authUrl = await generateAuthUrl();
    } catch (error) {
      console.warn("Unable to craft auth URL:", error.message);
    }
    const jobs = await jobSummary();
    res.json({
      authorized,
      cacheLoaded,
      authUrl,
      meta: metaFromState(),
      jobSummary: jobs,
      watchHistory: Array.isArray(cacheState.watchHistory) ? cacheState.watchHistory : [],
      watchHistoryCount: Array.isArray(cacheState.watchHistory)
        ? cacheState.watchHistory.length
        : 0,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/playlists", (req, res) => {
  res.json({
    playlists: cacheState.playlists,
    meta: metaFromState(),
  });
});

app.get("/api/playlists/:playlistId", (req, res) => {
  const playlist = (cacheState.playlists ?? []).find(
    (item) => item.playlistId === req.params.playlistId
  );
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  res.json({ playlist });
});

app.post("/api/refresh", async (req, res) => {
  try {
    const updated = await rebuildCache();
    res.json({ cache: updated });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/playlists", async (req, res) => {
  try {
    const { title, description = "" } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }
    await enqueueJob("createPlaylist", { title, description });
    await processJobsAndRefresh();
    res.status(201).json({ cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.delete("/api/playlists/:playlistId", async (req, res) => {
  try {
    await enqueueJob("deletePlaylist", { playlistId: req.params.playlistId });
    await processJobsAndRefresh();
    res.status(200).json({ cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/playlists/:playlistId/videos", async (req, res) => {
  try {
    const rawVideoId = req.body.videoId;
    const videoId = typeof rawVideoId === "string" ? rawVideoId.trim() : "";
    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }
    const position =
      typeof req.body.position === "number" ? req.body.position : undefined;
    const playlist = (cacheState.playlists ?? []).find(
      (item) => item.playlistId === req.params.playlistId
    );
    if (playlist) {
      const normalizedVideoId = videoId.toLowerCase();
      const alreadyPresent = (playlist.videos ?? []).some(
        (video) => (video.videoId ?? "").toLowerCase() === normalizedVideoId
      );
      if (alreadyPresent) {
        return res.status(409).json({ error: "Video already exists in the playlist" });
      }
    }
    const normalizedVideoId = videoId.toLowerCase();
    const playlists = cacheState.playlists ?? [];
    const alreadyInAnotherPlaylist = playlists.some((item) =>
      (item.videos ?? []).some(
        (video) => video && (video.videoId ?? "").toLowerCase() === normalizedVideoId
      )
    );
    if (alreadyInAnotherPlaylist) {
      return res
        .status(409)
        .json({ error: "Video already exists in another playlist" });
    }
    const historyLookup = new Set(
      (Array.isArray(cacheState.watchHistory) ? cacheState.watchHistory : [])
        .filter((id) => typeof id === "string")
        .map((id) => id.toLowerCase())
    );
    if (historyLookup.has(normalizedVideoId)) {
      return res.status(409).json({ error: "Video already exists in watch history" });
    }
    await enqueueJob("addVideo", {
      playlistId: req.params.playlistId,
      videoId,
      position,
    });
    await processJobsAndRefresh();
    res.status(201).json({ cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.delete("/api/playlist-items/:playlistItemId", async (req, res) => {
  try {
    await enqueueJob("deletePlaylistItem", { playlistItemId: req.params.playlistItemId });
    await processJobsAndRefresh();
    res.status(200).json({ cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/videos/batch-remove", async (req, res) => {
  try {
    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds : [];
    if (itemIds.length === 0) {
      return res.status(400).json({ error: "itemIds must be a non-empty array" });
    }
    for (const itemId of itemIds) {
      await enqueueJob("deletePlaylistItem", { playlistItemId: itemId });
    }
    await processJobsAndRefresh();
    res.json({ removed: itemIds.length, cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/videos/move", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: "items must be a non-empty array" });
    }
    for (const item of items) {
      if (!item.videoId) {
        return res.status(400).json({ error: "Every move item requires a videoId." });
      }
      await enqueueJob("moveVideo", {
        playlistItemId: item.playlistItemId,
        targetPlaylistId: item.targetPlaylistId,
        videoId: item.videoId,
        targetPosition:
          typeof item.targetPosition === "number" ? item.targetPosition : undefined,
      });
    }
    await processJobsAndRefresh();
    res.json({ moved: items.length, cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/jobs/resume", async (req, res) => {
  try {
    await resumeErroredJobs();
    await processJobsAndRefresh();
    const jobs = await jobSummary();
    res.json({ jobSummary: jobs, cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/jobs/clear-pending", async (req, res) => {
  try {
    await clearPendingJobs();
    await processJobsAndRefresh();
    const jobs = await jobSummary();
    res.json({ jobSummary: jobs, cache: cacheState });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/random", (req, res) => {
  const playlistId = req.query.playlistId;
  const targetMinutes = Number(req.query.targetMinutes);
  const playlists = cacheState.playlists ?? [];
  const videos = [];
  for (const playlist of playlists) {
    if (playlistId && playlist.playlistId !== playlistId) {
      continue;
    }
    for (const video of playlist.videos ?? []) {
      videos.push({
        ...video,
        playlistTitle: playlist.title,
      });
    }
  }
  let candidates = videos;
  if (!Number.isNaN(targetMinutes) && targetMinutes > 0) {
    const targetSeconds = targetMinutes * 60;
    const min = targetSeconds * 0.9;
    const max = targetSeconds * 1.1;
    candidates = candidates.filter(
      (video) => video.durationSeconds >= min && video.durationSeconds <= max
    );
  }
  if (candidates.length === 0) {
    return res.json({ video: null, candidates: 0 });
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  res.json({ video: pick, candidates: candidates.length });
});

app.get("/auth/start", async (req, res) => {
  try {
    const url = await generateAuthUrl();
    res.redirect(url);
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/oauth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("OAuth callback missing code");
  }
  try {
    await exchangeCode(code);
    res.send("Authorization complete. You can close this tab.");
  } catch (error) {
    console.error("OAuth exchange failed:", error);
    res.status(500).send("Unable to complete authorization");
  }
});

app.get("/api/changelog", (req, res) => {
  try {
    res.json({ version, entries: getChangelog() });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get("/changelog", (req, res) => {
  try {
    const entries = getChangelog();
    const rows = entries.map(e =>
      `<tr>
        <td style="font-family:monospace;padding:6px 12px 6px 0;color:#888;white-space:nowrap">${e.hash}</td>
        <td style="padding:6px 12px;color:#888;white-space:nowrap">${e.date}</td>
        <td style="padding:6px 0">${e.message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</td>
      </tr>`
    ).join("");
    res.send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Changelog – v${version}</title>
<link rel="stylesheet" href="/styles.css">
<style>
  body{max-width:860px;margin:0 auto;padding:32px 24px}
  h1{font-size:20px;font-weight:600;margin:0 0 4px}
  .sub{font-size:13px;color:var(--fg-3,#888);margin:0 0 24px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  tr{border-bottom:1px solid var(--line,#222)}
  tr:hover{background:var(--bg-2,#1a1a1a)}
  a{color:var(--accent,#88aaff)}
</style>
</head><body>
<p style="margin:0 0 20px"><a href="/">&#8592; back</a></p>
<h1>Changelog</h1>
<p class="sub">v${version}</p>
<table><tbody>${rows}</tbody></table>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(resolve(publicDir, "index.html"));
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Unexpected server error" });
});

async function bootstrap() {
  await initializeCache();
  try {
    await processJobsAndRefresh();
  } catch (error) {
    console.warn("Jobs pending on startup failed:", error.message);
  }
  app.listen(PORT, () => {
    console.log(`YouTube Playlist Manager running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
