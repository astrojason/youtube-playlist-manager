import dotenv from "dotenv";
import { google } from "googleapis";
import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];
const PORT = Number(process.env.PORT) || 3000;
const TOKEN_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../tokens.json");
const CREDENTIALS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../credentials.json");

let cachedOAuthClient = null;
let cachedConfig = null;

function durationToSeconds(value = "") {
  const ns = (match, factor) => (match ? Number(match) * factor : 0);
  const matches = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) {
    return 0;
  }
  const [, hours, minutes, seconds] = matches;
  return ns(hours, 3600) + ns(minutes, 60) + ns(seconds, 1);
}

async function loadClientConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const envCredentials = process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `http://localhost:${PORT}/oauth/callback`;

  if (envCredentials) {
    cachedConfig = {
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri,
    };
    return cachedConfig;
  }

  try {
    const fileContents = await fs.readFile(CREDENTIALS_PATH, "utf8");
    const parsed = JSON.parse(fileContents);
    const payload = parsed.web ?? parsed.installed;
    if (!payload?.client_id || !payload?.client_secret) {
      throw new Error("credentials.json is malformed; missing client_id/client_secret");
    }
    cachedConfig = {
      clientId: payload.client_id,
      clientSecret: payload.client_secret,
      redirectUri: payload.redirect_uris?.[0] ?? redirectUri,
    };
    return cachedConfig;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "YouTube OAuth credentials missing - create credentials.json or define YOUTUBE_CLIENT_ID & YOUTUBE_CLIENT_SECRET"
      );
    }
    throw error;
  }
}

async function getOAuthClient() {
  if (cachedOAuthClient) {
    return cachedOAuthClient;
  }

  const config = await loadClientConfig();
  cachedOAuthClient = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  return cachedOAuthClient;
}

async function loadTokens() {
  try {
    const tokensRaw = await fs.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(tokensRaw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function persistTokens(tokens) {
  const payload = JSON.stringify(tokens, null, 2) + "\n";
  await fs.writeFile(TOKEN_PATH, payload, "utf8");
}

export async function clearStoredTokens() {
  cachedOAuthClient = null;
  try {
    await fs.unlink(TOKEN_PATH);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function generateAuthUrl() {
  const client = await getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = await getOAuthClient();
  const response = await client.getToken(code);
  const tokens = { ...client.credentials, ...response.tokens };
  client.setCredentials(tokens);
  await persistTokens(tokens);
  return tokens;
}

export async function ensureTokens() {
  const client = await getOAuthClient();
  const tokens = await loadTokens();
  if (!tokens) {
    throw new Error("OAuth tokens missing - visit /auth/start to authorize the application.");
  }
  client.setCredentials(tokens);
  return client;
}

export async function hasStoredTokens() {
  const tokens = await loadTokens();
  return Boolean(tokens);
}

async function youtubeClient() {
  const authClient = await ensureTokens();
  return google.youtube({ version: "v3", auth: authClient });
}

async function fetchPlaylistItems(youtube, playlistId) {
  const items = [];
  let nextPageToken;

  do {
    const response = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });
    items.push(...(response.data.items ?? []));
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  return items;
}

async function fetchDurationMap(youtube, videoIds) {
  const durationMap = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    if (chunk.length === 0) {
      continue;
    }
    const response = await youtube.videos.list({
      part: ["contentDetails"],
      id: chunk.join(","),
      maxResults: 50,
    });
    for (const video of response.data.items ?? []) {
      durationMap.set(video.id, durationToSeconds(video.contentDetails?.duration));
    }
  }
  return durationMap;
}

export async function fetchAllPlaylistsWithVideos() {
  const youtube = await youtubeClient();
  const playlists = [];
  let nextPageToken;

  do {
    const response = await youtube.playlists.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken: nextPageToken,
    });
    playlists.push(...(response.data.items ?? []));
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  const playlistPayload = [];
  const videoIds = new Set();

  for (const playlist of playlists) {
    const rawVideos = await fetchPlaylistItems(youtube, playlist.id);
    const videos = rawVideos.map((item) => {
      const videoId = item.snippet?.resourceId?.videoId;
      const position = typeof item.snippet?.position === "number" ? item.snippet.position : item.contentDetails?.position ?? 0;
      if (videoId) {
        videoIds.add(videoId);
      }
      return {
        playlistItemId: item.id,
        videoId,
        title: item.snippet?.title ?? "Untitled video",
        playlistId: playlist.id,
        playlistTitle: playlist.snippet?.title ?? "Playlist",
        description: item.snippet?.description ?? "",
        position,
        playlistIndex: position,
        thumbnails: item.snippet?.thumbnails?.default?.url,
      };
    });
    playlistPayload.push({
      playlistId: playlist.id,
      title: playlist.snippet?.title ?? "Untitled playlist",
      description: playlist.snippet?.description ?? "",
      videos,
    });
  }

  const durations = await fetchDurationMap(youtube, Array.from(videoIds));

  for (const playlist of playlistPayload) {
    for (const video of playlist.videos) {
      video.durationSeconds = durations.get(video.videoId) ?? 0;
    }
    playlist.videos.sort((a, b) => a.position - b.position);
  }

  return {
    playlists: playlistPayload,
    syncedAt: new Date().toISOString(),
  };
}

export async function createPlaylist(title, description = "") {
  const youtube = await youtubeClient();
  const response = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
      },
      status: {
        privacyStatus: "private",
      },
    },
  });
  return response.data;
}

export async function deletePlaylist(playlistId) {
  const youtube = await youtubeClient();
  await youtube.playlists.delete({ id: playlistId });
}

export async function addVideoToPlaylist(playlistId, videoId, position) {
  const youtube = await youtubeClient();
  const requestBody = {
    snippet: {
      playlistId,
      resourceId: {
        kind: "youtube#video",
        videoId,
      },
    },
  };
  if (typeof position === "number") {
    requestBody.snippet.position = position;
  }
  const response = await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody,
  });
  return response.data;
}

export async function deletePlaylistItem(playlistItemId) {
  const youtube = await youtubeClient();
  await youtube.playlistItems.delete({ id: playlistItemId });
}

export async function movePlaylistItem({
  playlistItemId,
  targetPlaylistId,
  videoId,
}) {
  if (!playlistItemId || !targetPlaylistId || !videoId) {
    throw new Error("playlistItemId, targetPlaylistId, and videoId are required to move a video.");
  }

  let newItem = null;
  try {
    newItem = await addVideoToPlaylist(targetPlaylistId, videoId);
    await deletePlaylistItem(playlistItemId);
    return newItem;
  } catch (error) {
    if (newItem?.id) {
      try {
        await deletePlaylistItem(newItem.id);
      } catch (cleanupError) {
        console.warn("Failed to clean up newly added playlist item after move failure:", cleanupError);
      }
    }
    throw error;
  }
}

export { durationToSeconds };
export const oauthPort = PORT;
