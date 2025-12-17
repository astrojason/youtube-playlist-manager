import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const cachePath = resolve(dirname(fileURLToPath(import.meta.url)), "../playlists.json");

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
