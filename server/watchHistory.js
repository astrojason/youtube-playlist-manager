import { promises as fs } from "fs";
import { resolve } from "path";
import { DATA_DIR } from "./config.js";

const WATCH_HISTORY_PATH = resolve(DATA_DIR, "watch-history.json");

function normalizeId(id) {
  if (!id) {
    return null;
  }
  const trimmed = String(id).trim();
  return trimmed.length ? trimmed : null;
}

function extractIds(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.map(normalizeId).filter(Boolean);
  }
  if (Array.isArray(payload.videos)) {
    return payload.videos.map(normalizeId).filter(Boolean);
  }
  if (Array.isArray(payload.history)) {
    return payload.history.map(normalizeId).filter(Boolean);
  }
  return [];
}

export async function loadWatchHistory() {
  try {
    const raw = await fs.readFile(WATCH_HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { ids: extractIds(parsed), loaded: true };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ids: [], loaded: false };
    }
    throw error;
  }
}
