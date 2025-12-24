const state = {
  playlists: [],
  selectedPlaylistId: null,
  searchTerm: "",
  targetMinutes: "",
  sortBy: "position",
  selectedItems: new Set(),
  randomResult: null,
  authorized: false,
  authUrl: null,
  jobSummary: { total: 0, incomplete: 0, pending: 0, errors: 0 },
  jobList: [],
  jobPanelVisible: false,
  playlistFilter: "",
};

const TOAST_DURATION = 4500;

const elements = {
  authStatus: document.getElementById("auth-status"),
  connectBtn: document.getElementById("connect-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  resumeJobsBtn: document.getElementById("resume-jobs-btn"),
  refreshJobsBtn: document.getElementById("refresh-jobs-btn"),
  playlistList: document.getElementById("playlist-list"),
  playlistTitle: document.getElementById("playlist-title"),
  playlistDescription: document.getElementById("playlist-description"),
  playlistCount: document.getElementById("playlist-count"),
  videoList: document.getElementById("video-list"),
  playlistDetail: document.querySelector(".playlist-detail"),
  videoListWrapper: document.getElementById("video-list-wrapper"),
  searchInput: document.getElementById("search-input"),
  durationInput: document.getElementById("duration-input"),
  sortSelect: document.getElementById("sort-select"),
  searchResults: document.getElementById("search-results"),
  searchCount: document.getElementById("search-count"),
  searchPanel: document.getElementById("search-panel"),
  addVideoForm: document.getElementById("add-video-form"),
  newVideoId: document.getElementById("new-video-id"),
  playlistForm: document.getElementById("playlist-create-form"),
  playlistTitleInput: document.getElementById("new-playlist-title"),
  playlistDescriptionInput: document.getElementById("new-playlist-description"),
  playlistFilterInput: document.getElementById("playlist-filter-input"),
  clearPlaylistFilterBtn: document.getElementById("clear-playlist-filter-btn"),
  randomResult: document.getElementById("random-result"),
  randomPanel: document.getElementById("random-panel"),
  randomGlobalBtn: document.getElementById("random-global-btn"),
  randomPlaylistBtn: document.getElementById("random-playlist-btn"),
  selectedCount: document.getElementById("selected-count"),
  removeSelectedBtn: document.getElementById("remove-selected-btn"),
  moveSelectedBtn: document.getElementById("move-selected-btn"),
  moveSelect: document.getElementById("move-target-select"),
  openCreatePlaylistBtn: document.getElementById("open-create-playlist-btn"),
  playlistFilterInput: document.getElementById("playlist-filter-input"),
  loadingIndicator: document.getElementById("loading-indicator"),
  jobList: document.getElementById("job-list"),
  jobPanel: document.getElementById("job-panel"),
  createPlaylistFlyout: document.getElementById("create-playlist-flyout"),
  closeCreatePlaylistBtn: document.getElementById("close-create-playlist-btn"),
  toggleJobPanelBtn: document.getElementById("toggle-job-panel-btn"),
  toastContainer: document.getElementById("toast-container"),
  clearPendingJobsBtn: document.getElementById("clear-pending-jobs-btn"),
};

let loadingCount = 0;

function showMessage(text, type = "info") {
  if (!text) {
    return;
  }
  const container = elements.toastContainer;
  if (!container) {
    if (type === "error") {
      console.error(text);
    } else {
      console.log(text);
    }
    return;
  }

  const toastType =
    type === "success" ? "success" : type === "error" ? "error" : "toast-info";
  const toast = document.createElement("div");
  toast.className = `toast ${toastType}`;
  const label = document.createElement("span");
  label.textContent = text;
  toast.appendChild(label);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "toast-close";
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    clearTimeout(autoRemoveId);
    removeToast();
  });
  toast.appendChild(closeButton);

  let autoRemoveId;
  const removeToast = () => {
    if (toast.parentNode) {
      toast.remove();
    }
  };
  const startAutoRemove = (delay) => {
    clearTimeout(autoRemoveId);
    autoRemoveId = setTimeout(removeToast, delay);
  };

  startAutoRemove(TOAST_DURATION);
  toast.addEventListener("mouseenter", () => {
    clearTimeout(autoRemoveId);
  });
  toast.addEventListener("mouseleave", () => {
    startAutoRemove(2000);
  });

  container.appendChild(toast);
}

function updateLoadingIndicator() {
  if (!elements.loadingIndicator) {
    return;
  }
  elements.loadingIndicator.classList.toggle("visible", loadingCount > 0);
}

async function withLoading(action) {
  loadingCount += 1;
  updateLoadingIndicator();
  try {
    return await action();
  } finally {
    loadingCount = Math.max(0, loadingCount - 1);
    updateLoadingIndicator();
  }
}

function scrollPlaylistCardToTop() {
  if (elements.playlistDetail) {
    elements.playlistDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (elements.videoListWrapper) {
    elements.videoListWrapper.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function openCreatePlaylistFlyout() {
  if (!elements.createPlaylistFlyout) {
    return;
  }
  elements.createPlaylistFlyout.classList.remove("hidden");
  elements.playlistTitleInput?.focus();
}

function closeCreatePlaylistFlyout() {
  if (!elements.createPlaylistFlyout) {
    return;
  }
  elements.createPlaylistFlyout.classList.add("hidden");
}

function formatDuration(seconds = 0) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function descriptionPreview(text = "") {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const singleLine = trimmed.replace(/\s+/g, " ");
  const maxLength = 150;
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength).trim()}…`;
}

function parseDurationFilter() {
  const value = parseFloat(state.targetMinutes);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

function sortVideos(videos, sortBy) {
  return [...videos].sort((a, b) => {
    if (sortBy === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
    }
    if (sortBy === "duration") {
      return (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0);
    }
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

function alphabetizePlaylists(list = []) {
  return [...list].sort((a, b) =>
    (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" })
  );
}

function findVideoByPlaylistItemId(itemId) {
  for (const playlist of state.playlists) {
    const match = (playlist.videos ?? []).find(
      (video) => video.playlistItemId === itemId
    );
    if (match) {
      return match;
    }
  }
  return null;
}

function toggleSelection(itemId, checked) {
  if (!itemId) {
    return;
  }
  if (checked) {
    state.selectedItems.add(itemId);
  } else {
    state.selectedItems.delete(itemId);
  }
  elements.selectedCount.textContent = `${state.selectedItems.size} selected`;
  renderVideoList();
  renderSearchResults();
}

function createVideoCard(video, options = {}) {
  const card = document.createElement("article");
  const isSelected = state.selectedItems.has(video.playlistItemId);
  card.className = `video-card ${isSelected ? "active" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isSelected;
  checkbox.addEventListener("change", () => toggleSelection(video.playlistItemId, checkbox.checked));

  const info = document.createElement("div");
  info.className = "info";
  const titleRow = document.createElement("div");
  titleRow.className = "title-row";
  const titleLink = document.createElement("a");
  titleLink.textContent = video.title ?? "Untitled video";
  titleLink.href = `https://www.youtube.com/watch?v=${video.videoId}`;
  titleLink.target = "_blank";
  titleLink.rel = "noreferrer";
  titleRow.appendChild(titleLink);
  const duration = document.createElement("span");
  duration.textContent = formatDuration(video.durationSeconds);
  titleRow.appendChild(duration);
  info.appendChild(titleRow);

  if (options.showPlaylistName && video.playlistTitle) {
    const meta = document.createElement("div");
    meta.className = "meta";
    const playlistItem = document.createElement("span");
    playlistItem.textContent = video.playlistTitle;
    meta.appendChild(playlistItem);
    info.appendChild(meta);
  }

  const preview = descriptionPreview(video.description ?? "");
  if (preview) {
    const description = document.createElement("p");
    description.className = "description";
    description.textContent = preview;
    info.appendChild(description);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  if (options.onRemove) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Delete";
    removeButton.addEventListener("click", () => options.onRemove(video));
    removeButton.classList.add("delete");
    actions.appendChild(removeButton);
  }

  card.appendChild(checkbox);
  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

function invalidateAuthorization() {
  if (!state.authorized) {
    return;
  }
  state.authorized = false;
  updateAuthStatus();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  let payload;
  if (isJson) {
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      throw new Error("Invalid JSON response from server");
    }
  } else {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    if (payload?.needsAuth) {
      invalidateAuthorization();
    }
    const message = payload?.error ?? payload?.message ?? response.statusText;
    const error = new Error(message);
    if (payload?.needsAuth) {
      error.needsAuth = true;
    }
    throw error;
  }
  return payload ?? text;
}

function renderPlaylistList() {
  elements.playlistList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const sortedPlaylists = alphabetizePlaylists(state.playlists);
  const filterTerm = (state.playlistFilter ?? "").trim().toLowerCase();
  const filteredPlaylists =
    filterTerm.length > 0
      ? sortedPlaylists.filter((playlist) =>
          (playlist.title ?? "").toLowerCase().includes(filterTerm)
        )
      : sortedPlaylists;
  if (filteredPlaylists.length === 0) {
    elements.playlistList.innerHTML = `<p class="muted">No matching playlists.</p>`;
    renderMoveTargets();
    return;
  }
  filteredPlaylists.forEach((playlist) => {
    const entry = document.createElement("div");
    entry.className = "playlist-entry";
    if (playlist.playlistId === state.selectedPlaylistId) {
      entry.classList.add("active");
    }
    entry.dataset.playlistId = playlist.playlistId;
    const title = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = playlist.title;
    title.appendChild(heading);
    const stats = document.createElement("small");
    stats.textContent = `${playlist.videos?.length ?? 0} videos`;
    stats.className = "playlist-stats";
    title.appendChild(stats);
    entry.appendChild(title);

    const actions = document.createElement("div");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.classList.add("delete");
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm("Delete playlist permanently?")) {
        return;
      }
      try {
        await withLoading(async () => {
          await fetchJson(`/api/playlists/${playlist.playlistId}`, { method: "DELETE" });
          await refreshData({ suppressLoading: true });
        });
        showMessage("Playlist deleted", "success");
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
    actions.appendChild(deleteButton);
    entry.appendChild(actions);

    entry.addEventListener("click", () => {
      state.selectedPlaylistId = playlist.playlistId;
      state.selectedItems.clear();
      render();
      scrollPlaylistCardToTop();
    });
    entry.tabIndex = 0;
    entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        entry.click();
      }
    });

    fragment.appendChild(entry);
  });
  elements.playlistList.appendChild(fragment);
  renderMoveTargets();
}

function renderPlaylistDetail() {
  const playlist = state.playlists.find(
    (item) => item.playlistId === state.selectedPlaylistId
  );
  if (!playlist) {
    elements.playlistTitle.textContent = "Select a playlist";
    elements.playlistDescription.textContent = "";
    elements.playlistCount.textContent = "";
    elements.videoList.innerHTML = `<p class="muted">Choose a playlist to view videos.</p>`;
    return;
  }
  elements.playlistTitle.textContent = playlist.title;
  elements.playlistDescription.textContent = playlist.description ?? "";
  elements.playlistCount.textContent = `${playlist.videos?.length ?? 0} videos`;
  renderVideoList();
}

function renderVideoList() {
  const playlist = state.playlists.find(
    (item) => item.playlistId === state.selectedPlaylistId
  );
  if (!playlist) {
    elements.videoList.innerHTML = `<p class="muted">No playlist selected.</p>`;
    return;
  }
  const videos = sortVideos(playlist.videos ?? [], state.sortBy);
  if (videos.length === 0) {
    elements.videoList.innerHTML = `<p class="muted">Playlist is empty.</p>`;
    return;
  }
  elements.videoList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  videos.forEach((video) => {
    const card = createVideoCard(video, {
      onRemove: async () => {
        try {
          await withLoading(async () => {
            await fetchJson(`/api/playlist-items/${video.playlistItemId}`, {
              method: "DELETE",
            });
            state.selectedItems.delete(video.playlistItemId);
            elements.selectedCount.textContent = `${state.selectedItems.size} selected`;
            await refreshData({ suppressLoading: true });
          });
          showMessage("Video removed", "success");
        } catch (error) {
          showMessage(error.message, "error");
        }
      },
    });
    fragment.appendChild(card);
  });
  elements.videoList.appendChild(fragment);
  elements.selectedCount.textContent = `${state.selectedItems.size} selected`;
}

function renderSearchResults() {
  const rawTerm = state.searchTerm.trim();
  const term = rawTerm.toLowerCase();
  const durationMinutes = parseDurationFilter();
  const durationFilterActive = durationMinutes !== null;
  const shouldShowResults = Boolean(rawTerm) || durationFilterActive;

  if (elements.searchPanel) {
    elements.searchPanel.classList.toggle("hidden", !shouldShowResults);
  }

  if (!shouldShowResults) {
    if (elements.searchResults) {
      elements.searchResults.innerHTML = "";
    }
    if (elements.searchCount) {
      elements.searchCount.textContent = "";
    }
    return;
  }

  const matcher = (text) => text?.toLowerCase().includes(term);
  const results = [];
  state.playlists.forEach((playlist) => {
    const playlistMatch = matcher(playlist.title);
    (playlist.videos ?? []).forEach((video) => {
      const videoMatch = matcher(video.title);
      if (!term || playlistMatch || videoMatch) {
        if (durationFilterActive) {
          const targetSeconds = durationMinutes * 60;
          const min = targetSeconds * 0.9;
          const max = targetSeconds * 1.1;
          if (
            video.durationSeconds < min ||
            video.durationSeconds > max
          ) {
            return;
          }
        }
        results.push({
          ...video,
          playlistTitle: playlist.title,
        });
      }
    });
  });

  const sortedResults = sortVideos(results, state.sortBy);
  elements.searchCount.textContent = `${sortedResults.length} match${sortedResults.length === 1 ? "" : "es"}`;
  if (results.length === 0) {
    elements.searchResults.innerHTML = `<p class="muted">No videos matched your filters.</p>`;
    return;
  }
  elements.searchResults.innerHTML = "";
  const fragment = document.createDocumentFragment();
  sortedResults.forEach((video) => {
    const card = createVideoCard(video, {
      showPlaylistName: true,
      onRemove: async () => {
        try {
          await withLoading(async () => {
            await fetchJson(`/api/playlist-items/${video.playlistItemId}`, {
              method: "DELETE",
            });
            state.selectedItems.delete(video.playlistItemId);
            elements.selectedCount.textContent = `${state.selectedItems.size} selected`;
            await refreshData({ suppressLoading: true });
          });
          showMessage("Video removed", "success");
        } catch (error) {
          showMessage(error.message, "error");
        }
      },
    });
    fragment.appendChild(card);
  });
  elements.searchResults.appendChild(fragment);
}

function renderJobList() {
  if (!elements.jobList) {
    return;
  }
  if (!state.jobList || state.jobList.length === 0) {
    elements.jobList.innerHTML = `<p class="muted">No jobs recorded yet.</p>`;
    return;
  }
  elements.jobList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  state.jobList.forEach((job) => {
    const entry = document.createElement("div");
    entry.className = `job-entry ${job.status ?? ""}`;
    const label = document.createElement("div");
    label.innerHTML = `<strong>${job.action}</strong>`;
    const info = document.createElement("small");
    info.className = "muted";
    info.textContent = `attempts: ${job.attempts ?? 0} · updated ${new Date(
      job.updatedAt ?? job.createdAt
    ).toLocaleTimeString()}`;
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = job.status;
    entry.appendChild(label);
    entry.appendChild(info);
    entry.appendChild(status);
    if (job.error) {
      const errorNode = document.createElement("small");
      errorNode.textContent = job.error;
      entry.appendChild(errorNode);
    }
    fragment.appendChild(entry);
  });
  elements.jobList.appendChild(fragment);
}

async function loadJobList() {
  try {
    const response = await fetchJson("/api/jobs", { method: "GET" });
    const jobs = response.jobs ?? [];
    state.jobList = jobs.filter((job) => job.status !== "complete");
    updateJobQueueButton();
    renderJobList();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function renderRandomResult() {
  if (elements.randomPanel) {
    elements.randomPanel.classList.toggle("hidden", !state.randomResult);
  }
  elements.randomResult.innerHTML = "";
  if (!state.randomResult) {
    return;
  }
  const card = createVideoCard(state.randomResult, {
    showPlaylistName: true,
  });
  elements.randomResult.appendChild(card);
}

function renderMoveTargets() {
  elements.moveSelect.innerHTML = "";
  state.playlists.forEach((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.playlistId;
    option.textContent = playlist.title;
    if (playlist.playlistId === state.selectedPlaylistId) {
      option.disabled = true;
      option.textContent += " (current)";
    }
    elements.moveSelect.appendChild(option);
  });
}

function render() {
  renderPlaylistList();
  renderPlaylistDetail();
  renderSearchResults();
  renderRandomResult();
  renderJobList();
}

async function refreshData({ suppressLoading = false } = {}) {
  const runner = async () => {
    try {
      const [status, payload] = await Promise.all([
        fetchJson("/api/status", { method: "GET" }),
        fetchJson("/api/playlists", { method: "GET" }),
      ]);
      state.authorized = status.authorized;
      state.authUrl = status.authUrl;
      state.jobSummary = status.jobSummary ?? state.jobSummary ?? {
        total: 0,
        incomplete: 0,
        pending: 0,
        errors: 0,
      };
      state.playlists = alphabetizePlaylists(payload.playlists ?? []);
      if (!state.selectedPlaylistId && state.playlists.length > 0) {
        state.selectedPlaylistId = state.playlists[0].playlistId;
      } else if (
        state.selectedPlaylistId &&
        !state.playlists.some((item) => item.playlistId === state.selectedPlaylistId)
      ) {
        state.selectedPlaylistId = state.playlists.length
          ? state.playlists[0].playlistId
          : null;
      }
      state.selectedItems.clear();
      state.randomResult = null;
      await loadJobList();
      render();
      updateAuthStatus();
      updateJobIndicator();
      updateJobQueueButton();
      updateJobPanelVisibility();
    } catch (error) {
      showMessage(error.message, "error");
    }
  };

  if (suppressLoading) {
    return runner();
  }
  return withLoading(runner);
}

function updateAuthStatus() {
  if (elements.authStatus) {
    if (state.authorized) {
      elements.authStatus.textContent = "Authorized";
      elements.authStatus.className = "pill success";
      elements.authStatus.classList.remove("hidden");
    } else {
      elements.authStatus.className = "pill neutral hidden";
    }
  }
  if (elements.connectBtn) {
    elements.connectBtn.textContent = "Connect";
    elements.connectBtn.hidden = state.authorized;
    elements.connectBtn.disabled = false;
  }
}

function updateJobIndicator() {
  if (!elements.resumeJobsBtn) {
    return;
  }
  const count = state.jobSummary?.incomplete ?? 0;
  elements.resumeJobsBtn.hidden = count === 0;
  if (count > 0) {
    elements.resumeJobsBtn.textContent = `Resume jobs (${count})`;
  }
}

function updateJobQueueButton() {
  if (!elements.toggleJobPanelBtn) {
    return;
  }
  const pendingJobs = (state.jobList ?? []).filter((job) => job.status === "pending").length;
  elements.toggleJobPanelBtn.textContent = `Jobs (${pendingJobs})`;
}

function updateJobPanelVisibility() {
  if (!elements.jobPanel || !elements.toggleJobPanelBtn) {
    return;
  }
  elements.jobPanel.classList.toggle("hidden", !state.jobPanelVisible);
  elements.toggleJobPanelBtn.setAttribute("aria-pressed", state.jobPanelVisible ? "true" : "false");
  elements.toggleJobPanelBtn.classList.toggle("active", state.jobPanelVisible);
}

elements.connectBtn.addEventListener("click", () => {
  const url = state.authUrl ?? "/auth/start";
  window.open(url, "_blank", "noopener");
  showMessage("Authorization flow opened", "success");
});

elements.refreshBtn.addEventListener("click", async () => {
  try {
    await withLoading(async () => {
      await fetchJson("/api/refresh", { method: "POST" });
      await refreshData({ suppressLoading: true });
    });
    showMessage("Cache refreshed", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

if (elements.resumeJobsBtn) {
  elements.resumeJobsBtn.addEventListener("click", async () => {
    try {
      await withLoading(async () => {
        await fetchJson("/api/jobs/resume", { method: "POST" });
      });
      showMessage("Job queue resumed", "success");
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
}

if (elements.refreshJobsBtn) {
  elements.refreshJobsBtn.addEventListener("click", async () => {
    try {
      await withLoading(loadJobList);
      showMessage("Jobs refreshed", "success");
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
}

if (elements.clearPendingJobsBtn) {
  elements.clearPendingJobsBtn.addEventListener("click", async () => {
    try {
      await withLoading(async () => {
        await fetchJson("/api/jobs/clear-pending", { method: "POST" });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Pending jobs cleared", "success");
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
}

if (elements.toggleJobPanelBtn) {
  elements.toggleJobPanelBtn.addEventListener("click", async () => {
    state.jobPanelVisible = !state.jobPanelVisible;
    updateJobPanelVisibility();
    if (state.jobPanelVisible) {
      try {
        await withLoading(loadJobList);
      } catch (error) {
        showMessage(error.message, "error");
      }
    }
  });
}

elements.searchInput.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderSearchResults();
});

elements.durationInput.addEventListener("input", (event) => {
  state.targetMinutes = event.target.value;
  renderSearchResults();
});

elements.sortSelect.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  renderPlaylistDetail();
});

if (elements.playlistFilterInput) {
  elements.playlistFilterInput.addEventListener("input", (event) => {
    state.playlistFilter = event.target.value ?? "";
    renderPlaylistList();
  });
}

if (elements.clearPlaylistFilterBtn) {
  elements.clearPlaylistFilterBtn.addEventListener("click", () => {
    state.playlistFilter = "";
    if (elements.playlistFilterInput) {
      elements.playlistFilterInput.value = "";
    }
    renderPlaylistList();
  });
}

elements.playlistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = elements.playlistTitleInput.value.trim();
  const description = elements.playlistDescriptionInput.value.trim();
  if (!title) {
    showMessage("Title is required", "error");
    return;
  }
  try {
    await withLoading(async () => {
      await fetchJson("/api/playlists", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      elements.playlistForm.reset();
      closeCreatePlaylistFlyout();
      await refreshData({ suppressLoading: true });
    });
    showMessage("Playlist created", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.addVideoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const videoId = elements.newVideoId.value.trim();
  if (!videoId || !state.selectedPlaylistId) {
    showMessage("Select a playlist and provide a video ID", "error");
    return;
  }
  try {
    await withLoading(async () => {
      await fetchJson(`/api/playlists/${state.selectedPlaylistId}/videos`, {
        method: "POST",
        body: JSON.stringify({ videoId }),
      });
      elements.addVideoForm.reset();
      await refreshData({ suppressLoading: true });
    });
    showMessage("Video added to playlist", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.removeSelectedBtn.addEventListener("click", async () => {
  if (state.selectedItems.size === 0) {
    showMessage("No videos selected", "error");
    return;
  }
  try {
    await withLoading(async () => {
      await fetchJson("/api/videos/batch-remove", {
        method: "POST",
        body: JSON.stringify({ itemIds: Array.from(state.selectedItems) }),
      });
      state.selectedItems.clear();
      await refreshData({ suppressLoading: true });
    });
    showMessage("Selected videos removed", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.moveSelectedBtn.addEventListener("click", async () => {
  if (state.selectedItems.size === 0) {
    showMessage("Select videos to move", "error");
    return;
  }
  const targetPlaylistId = elements.moveSelect.value;
  if (!targetPlaylistId || targetPlaylistId === state.selectedPlaylistId) {
    showMessage("Select a different playlist", "error");
    return;
  }
  const items = Array.from(state.selectedItems)
    .map((id) => {
      const video = findVideoByPlaylistItemId(id);
      return video
        ? {
            playlistItemId: id,
            targetPlaylistId,
            videoId: video.videoId,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.targetPosition ?? 0) - (b.targetPosition ?? 0));
  if (items.length === 0) {
    showMessage("Unable to resolve selected videos", "error");
    return;
  }
  try {
    await withLoading(async () => {
      await fetchJson("/api/videos/move", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      state.selectedItems.clear();
      await refreshData({ suppressLoading: true });
    });
    showMessage("Videos moved", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.randomGlobalBtn.addEventListener("click", async () => {
  await pickRandom();
});

elements.randomPlaylistBtn.addEventListener("click", async () => {
  await pickRandom(state.selectedPlaylistId);
});

if (elements.openCreatePlaylistBtn) {
  elements.openCreatePlaylistBtn.addEventListener("click", () => {
    openCreatePlaylistFlyout();
  });
}

if (elements.closeCreatePlaylistBtn) {
  elements.closeCreatePlaylistBtn.addEventListener("click", () => {
    closeCreatePlaylistFlyout();
  });
}

if (elements.createPlaylistFlyout) {
  elements.createPlaylistFlyout.addEventListener("click", (event) => {
    if (event.target === elements.createPlaylistFlyout) {
      closeCreatePlaylistFlyout();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.createPlaylistFlyout) {
    if (!elements.createPlaylistFlyout.classList.contains("hidden")) {
      closeCreatePlaylistFlyout();
    }
  }
});

async function pickRandom(playlistId) {
  try {
    await withLoading(async () => {
      const params = new URLSearchParams();
      const durationMinutes = parseDurationFilter();
      if (durationMinutes !== null) {
        params.set("targetMinutes", durationMinutes);
      }
      if (playlistId) {
        params.set("playlistId", playlistId);
      }
      const query = params.toString();
      const result = await fetchJson(
        query ? `/api/random?${query}` : "/api/random",
        { method: "GET" }
      );
      state.randomResult = result.video;
      renderRandomResult();
      if (result.video) {
        showMessage("Random video selected", "success");
      } else {
        showMessage("No videos matched the random filters", "error");
      }
    });
  } catch (error) {
    showMessage(error.message, "error");
  }
}

refreshData();
