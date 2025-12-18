import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  addVideoToPlaylist,
  createPlaylist,
  deletePlaylist,
  deletePlaylistItem,
  movePlaylistItem,
} from "./youtube.js";

const jobsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../jobs.json");
let processing = false;

async function readJobs() {
  try {
    const contents = await fs.readFile(jobsPath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { jobs: [] };
    }
    throw error;
  }
}

async function writeJobs(payload) {
  const body = JSON.stringify(payload, null, 2) + "\n";
  await fs.writeFile(jobsPath, body, "utf8");
}

async function persistJobs(jobs) {
  await writeJobs({ jobs });
}

const ACTION_HANDLERS = {
  createPlaylist: async ({ title, description }) => {
    await createPlaylist(title, description ?? "");
  },
  deletePlaylist: async ({ playlistId }) => {
    await deletePlaylist(playlistId);
  },
  addVideo: async ({ playlistId, videoId, position }) => {
    await addVideoToPlaylist(playlistId, videoId, position);
  },
  deletePlaylistItem: async ({ playlistItemId }) => {
    await deletePlaylistItem(playlistItemId);
  },
  moveVideo: async ({ playlistItemId, targetPlaylistId, videoId }) => {
    await movePlaylistItem({
      playlistItemId,
      targetPlaylistId,
      videoId,
    });
  },
};

export async function enqueueJob(action, payload) {
  const jobId = randomUUID();
  const state = await readJobs();
  const jobs = state.jobs ?? [];
  const job = {
    id: jobId,
    action,
    payload,
    status: "pending",
    error: null,
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.push(job);
  await persistJobs(jobs);
  return job;
}

export async function processPendingJobs() {
  if (processing) {
    return { processedCount: 0 };
  }
  processing = true;
  let processedCount = 0;
  let encounteredError = null;
  try {
    const state = await readJobs();
    const jobs = state.jobs ?? [];
    for (const job of jobs) {
      if (job.status === "complete" || job.status === "error") {
        continue;
      }
      job.status = "running";
      job.attempts = (job.attempts ?? 0) + 1;
      job.updatedAt = new Date().toISOString();
      await persistJobs(jobs);
      try {
        const handler = ACTION_HANDLERS[job.action];
        if (!handler) {
          throw new Error(`Unknown job action: ${job.action}`);
        }
        await handler(job.payload);
        job.status = "complete";
        job.error = null;
        job.updatedAt = new Date().toISOString();
        await persistJobs(jobs);
        processedCount += 1;
      } catch (error) {
        job.status = "error";
        job.error = error.message ?? "Unknown error";
        job.updatedAt = new Date().toISOString();
        await persistJobs(jobs);
        encounteredError = error;
        break;
      }
    }
  } finally {
    processing = false;
  }
  return { processedCount, error: encounteredError };
}

export async function jobSummary() {
  const state = await readJobs();
  const jobs = state.jobs ?? [];
  const incomplete = jobs.filter((job) => job.status !== "complete").length;
  const pending = jobs.filter((job) => job.status === "pending").length;
  const errors = jobs.filter((job) => job.status === "error").length;
  return {
    total: jobs.length,
    incomplete,
    pending,
    errors,
  };
}

export async function listJobs() {
  const state = await readJobs();
  return state.jobs ?? [];
}
