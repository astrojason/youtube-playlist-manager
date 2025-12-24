import express from "express";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  fetchAllPlaylistsWithVideos,
  generateAuthUrl,
  exchangeCode,
  hasStoredTokens,
  ensureTokens,
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

let cacheState = {
  playlists: [],
  syncedAt: null,
  version: 0,
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
  cacheState = {
    ...fresh,
    playlists: Array.isArray(fresh.playlists) ? fresh.playlists : [],
    version: (cacheState.version ?? 0) + 1,
  };
  cacheLoaded = true;
  await writeCache(cacheState);
  return cacheState;
}

function handleError(res, error) {
  console.error(error);
  if (error.message?.includes("OAuth tokens missing")) {
    return res.status(401).json({ error: error.message, needsAuth: true });
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
    const videoId = req.body.videoId;
    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }
    const position =
      typeof req.body.position === "number" ? req.body.position : undefined;
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
