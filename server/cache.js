import { promises as fs } from "fs";
import { resolve } from "path";
import { DATA_DIR } from "./config.js";

const cachePath = resolve(DATA_DIR, "playlists.json");

export async function readCache() {
  try {
    const data = await fs.readFile(cachePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeCache(data) {
  const payload = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(cachePath, payload, "utf8");
}
