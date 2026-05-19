const { useState, useMemo, useEffect, useCallback, useRef } = React;

/* ============================================================
   Utilities
   ============================================================ */
const DEFAULT_ADD_PLAYLIST = "Saved for Later";

function formatDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function descriptionPreview(text = "") {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length <= 120 ? t : t.slice(0, 120) + "…";
}

function normalizeVideoId(value = "") {
  const t = (value ?? "").trim();
  const m = t.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return m ? m[1] : t;
}

function parseVideoIds(value = "") {
  const seen = new Set();
  const result = [];
  for (const part of (value ?? "").split(/[\s,]+/)) {
    const id = normalizeVideoId(part);
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(id);
  }
  return result;
}

function alphabetize(list = []) {
  return [...list].sort((a, b) =>
    (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" })
  );
}

function sortVideos(videos, sortBy) {
  return [...videos].sort((a, b) => {
    if (sortBy === "title") return (a.title ?? "").localeCompare(b.title ?? "");
    if (sortBy === "duration") return (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0);
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

/* ============================================================
   API
   ============================================================ */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const err = new Error(data?.error ?? data?.message ?? res.statusText);
    if (data?.needsAuth) err.needsAuth = true;
    throw err;
  }
  return data ?? text;
}

/* ============================================================
   Icons
   ============================================================ */
const PATHS = {
  search:   <><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>,
  plus:     <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  refresh:  <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  trash:    <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  folder:   <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  chev:     <><path d="m9 6 6 6-6 6" /></>,
  shuffle:  <><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></>,
  dice:     <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="16" r="1" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="16" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>,
  move:     <><path d="M5 9 2 12l3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="m19 9 3 3-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></>,
  clock:    <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  list:     <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
  x:        <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  briefcase:<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>,
};

const Icon = ({ name, className = "icon" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    {PATHS[name] || null}
  </svg>
);

/* ============================================================
   Loading overlay
   ============================================================ */
const LoadingOverlay = ({ visible }) => (
  <div className={"loading-indicator" + (visible ? " visible" : "")} role="status">
    <div className="spinner" />
    <p>Working…</p>
  </div>
);

/* ============================================================
   Toast container
   ============================================================ */
const ToastContainer = ({ toasts, onRemove }) => (
  <div className="toast-container">
    {toasts.map(t => (
      <div key={t.id} className={"toast" + (t.type === "success" ? " success" : t.type === "error" ? " error" : "")}>
        <span>{t.text}</span>
        <button className="toast-close" onClick={() => onRemove(t.id)}>×</button>
      </div>
    ))}
  </div>
);

/* ============================================================
   Topbar
   ============================================================ */
const Topbar = ({ authorized, authUrl, jobList, jobSummary, onOpenSearch, onRefresh, onOpenCreate, onOpenJobPanel }) => {
  const mac = /Mac/.test(navigator.platform);
  const pending = (jobList ?? []).filter(j => j.status === "pending" || j.status === "running").length;
  const errors = jobSummary?.errors ?? 0;

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <span>Playlist Manager</span>
        <span className="brand-sep" />
        <span className="brand-sub">YouTube</span>
      </div>

      <div
        className="topbar-search"
        role="button"
        tabIndex={0}
        onClick={onOpenSearch}
        onKeyDown={e => e.key === "Enter" && onOpenSearch()}
      >
        <Icon name="search" />
        <span className="topbar-search-label">Search all playlists & videos…</span>
        <span className="kbd">{mac ? "⌘" : "Ctrl"}</span>
        <span className="kbd">K</span>
      </div>

      <div className="topbar-actions">
        {authorized ? (
          <span className="pill is-ok">
            <span className="dot" />
            Authorized
          </span>
        ) : (
          <button className="btn is-danger" onClick={() => window.open(authUrl ?? "/auth/start", "_blank", "noopener")}>
            Connect
          </button>
        )}

        <button
          className="pill is-mute"
          style={{ background: "none", border: "1px solid var(--line)" }}
          onClick={onOpenJobPanel}
          title="View job queue"
        >
          <Icon name="clock" />
          Jobs · {pending}{errors > 0 ? ` · ${errors} err` : ""}
        </button>

        <button className="btn is-ghost" onClick={onRefresh}>
          <Icon name="refresh" />
          Refresh cache
        </button>

        <div className="divider" />

        <button className="btn is-primary" onClick={onOpenCreate}>
          <Icon name="plus" />
          New playlist
        </button>
      </div>
    </div>
  );
};

/* ============================================================
   Search palette
   ============================================================ */
const SearchPalette = ({ open, onClose, playlists, onJump }) => {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  const index = useMemo(() => {
    const out = [];
    playlists.forEach(p =>
      (p.videos ?? []).forEach(v => out.push({ ...v, playlistId: p.playlistId, playlistName: p.title }))
    );
    return out;
  }, [playlists]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => document.getElementById("palette-input")?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return [{
        label: "Jump to playlist",
        items: playlists.slice(0, 14).map(p => ({
          type: "playlist", id: p.playlistId,
          title: p.title, meta: `${p.videos?.length ?? 0} videos`,
        })),
      }];
    }
    const plMatch = playlists
      .filter(p => p.title.toLowerCase().includes(query))
      .slice(0, 5)
      .map(p => ({ type: "playlist", id: p.playlistId, title: p.title, meta: `${p.videos?.length ?? 0} videos` }));
    const vMatch = index.filter(v =>
      v.title?.toLowerCase().includes(query) || v.description?.toLowerCase().includes(query)
    );
    const byPl = {};
    vMatch.forEach(v => {
      (byPl[v.playlistId] ||= { name: v.playlistName, items: [] }).items.push(v);
    });
    const vGroups = Object.entries(byPl).map(([pid, g]) => ({
      label: g.name,
      items: g.items.slice(0, 6).map(v => ({
        type: "video", id: v.videoId, playlistId: pid,
        title: v.title, meta: formatDuration(v.durationSeconds),
      })),
    }));
    const groups = [];
    if (plMatch.length) groups.push({ label: "Playlists", items: plMatch });
    groups.push(...vGroups);
    return groups;
  }, [q, index, playlists]);

  const flat = useMemo(() => results.flatMap(g => g.items), [results]);
  useEffect(() => { setCursor(0); }, [q]);

  if (!open) return null;

  const select = item => {
    if (!item) return;
    onJump(item.type === "playlist" ? item.id : item.playlistId);
    onClose();
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, flat.length - 1)); }
          else if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
          else if (e.key === "Enter")     { e.preventDefault(); select(flat[cursor]); }
        }}
      >
        <div className="palette-head">
          <Icon name="search" className="icon lg" />
          <input
            id="palette-input"
            className="palette-input"
            placeholder="Search playlists and videos…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <span className="palette-hint">
            <span className="kbd">↑</span><span className="kbd">↓</span> navigate
            <span className="kbd">↵</span> open
            <span className="kbd">esc</span> close
          </span>
        </div>

        <div className="palette-body">
          {flat.length === 0 ? (
            <div className="palette-empty">{q ? `No matches for "${q}"` : "No playlists loaded"}</div>
          ) : (
            results.map((g, gi) => (
              <div key={gi} className="palette-group">
                <div className="palette-group-label">{g.label}</div>
                {g.items.map((it, ii) => {
                  const idx = results.slice(0, gi).reduce((a, gg) => a + gg.items.length, 0) + ii;
                  return (
                    <div
                      key={it.id + "-" + ii}
                      className={"palette-item" + (idx === cursor ? " is-active" : "")}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => select(it)}
                    >
                      <span className="palette-icon">
                        <Icon name={it.type === "playlist" ? "folder" : "list"} />
                      </span>
                      <span className="palette-title">{it.title}</span>
                      <span className="palette-meta">{it.meta}</span>
                      <span className="palette-go"><Icon name="chev" /></span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="palette-foot">
          <span>
            <span className="mono">{flat.length}</span> results across{" "}
            <span className="mono">{playlists.length}</span> playlists
          </span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Sidebar
   ============================================================ */
const Sidebar = ({ playlists, activeId, onSelect, onDelete, onOpenCreate, filter, setFilter }) => {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? playlists.filter(p => p.title.toLowerCase().includes(q)) : playlists;
  }, [filter, playlists]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-title">
          <span>Your playlists</span>
          <span className="count">{playlists.length}</span>
        </div>
        <div className="input-wrap">
          <span className="input-icon"><Icon name="search" /></span>
          <input
            className="input"
            placeholder="Filter playlists"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-list">
        {filtered.map(p => (
          <div
            key={p.playlistId}
            className={"pl-row" + (p.playlistId === activeId ? " is-active" : "")}
            onClick={() => onSelect(p.playlistId)}
            tabIndex={0}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && onSelect(p.playlistId)}
          >
            <span className="pl-icon"><Icon name="folder" /></span>
            <span className="pl-name">{p.title}</span>
            <span className="pl-count">{(p.videos?.length ?? 0).toLocaleString()}</span>
            <button
              className="icon-btn is-danger pl-delete"
              title="Delete playlist"
              onClick={e => { e.stopPropagation(); onDelete(p); }}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        {filtered.length === 0 && filter && (
          <div style={{ padding: "20px 12px", color: "var(--fg-4)", fontSize: 12 }}>
            No playlists match "{filter}"
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <button className="btn is-ghost" onClick={onOpenCreate}>
          <Icon name="plus" />
          New
        </button>
      </div>
    </aside>
  );
};

/* ============================================================
   Filter bar
   ============================================================ */
const FilterBar = ({ search, setSearch, duration, setDuration, sort, setSort, onRandomAll, onRandomPlaylist }) => (
  <div className="filterbar">
    <div className="input-wrap">
      <span className="input-icon"><Icon name="search" /></span>
      <input
        className="input"
        placeholder="Search videos in this playlist…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ height: 34 }}
      />
    </div>
    <div className="input-wrap">
      <span className="input-icon"><Icon name="clock" /></span>
      <input
        className="input"
        type="number"
        min="0"
        step="0.1"
        placeholder="Max duration (min)"
        value={duration}
        onChange={e => setDuration(e.target.value)}
        style={{ height: 34 }}
      />
    </div>
    <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
      <option value="position">Sort — Order in playlist</option>
      <option value="duration">Sort — Duration</option>
      <option value="title">Sort — Title (A→Z)</option>
    </select>
    <div className="btn-group">
      <button className="btn" onClick={onRandomAll}>
        <Icon name="dice" />
        Random (all)
      </button>
      <button className="btn" onClick={onRandomPlaylist}>
        <Icon name="shuffle" />
        Random (playlist)
      </button>
    </div>
  </div>
);

/* ============================================================
   Add box
   ============================================================ */
const AddBox = ({ playlists, defaultPlaylistId, watchHistoryIds, onAddVideo, onImportVideos }) => {
  const [open, setOpen] = useState(false);
  const [singleInput, setSingleInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [targetId, setTargetId] = useState(defaultPlaylistId ?? "");

  useEffect(() => { if (defaultPlaylistId) setTargetId(defaultPlaylistId); }, [defaultPlaylistId]);

  const handleAdd = () => {
    if (singleInput.trim()) {
      onAddVideo(normalizeVideoId(singleInput), targetId);
      setSingleInput("");
    }
  };

  const handleImport = () => {
    if (bulkInput.trim()) {
      onImportVideos(parseVideoIds(bulkInput), targetId);
      setBulkInput("");
    }
  };

  return (
    <div className={"addbox " + (open ? "is-open" : "is-closed")}>
      <div className="addbox-head" onClick={() => setOpen(o => !o)}>
        <Icon name="chev" className="icon chev" />
        <span className="label">Add videos</span>
        <span className="hint">— paste a URL, video ID, or import a list</span>
        <div style={{ flex: 1 }} />
        <span className="kbd">A</span>
      </div>
      <div className="addbox-body">
        <div className="field">
          <label>Video URL or ID</label>
          <input
            className="input"
            placeholder="https://youtube.com/watch?v=… or dQw4w9WgXcQ"
            value={singleInput}
            onChange={e => setSingleInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
        </div>
        <div className="field">
          <label>Add to playlist</label>
          <select className="select" value={targetId} onChange={e => setTargetId(e.target.value)}>
            {playlists.map(p => (
              <option key={p.playlistId} value={p.playlistId}>{p.title}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Bulk import — paste URLs or IDs, one per line</label>
          <textarea
            className="input"
            placeholder={"dQw4w9WgXcQ\nhttps://youtu.be/abc123…\nhttps://youtube.com/watch?v=xyz789"}
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
          />
        </div>
        <div className="addbox-foot">
          <button className="btn is-primary" onClick={handleAdd} disabled={!singleInput.trim()}>
            <Icon name="plus" />
            Add
          </button>
          <button className="btn" onClick={handleImport} disabled={!bulkInput.trim()}>
            <Icon name="upload" />
            Import
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Video table
   ============================================================ */
const VideoTable = ({ videos, selected, toggleSelect, toggleAll, onRemove }) => {
  const allChecked = videos.length > 0 && videos.every(v => selected.has(v.playlistItemId));

  if (!videos.length) {
    return (
      <div className="vtable">
        <div className="empty">
          <h3>No videos in this playlist</h3>
          <div>Add videos using the box above.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="vtable">
      <div className="vhead">
        <span>
          <input
            type="checkbox"
            className="checkbox"
            checked={allChecked}
            onChange={() => toggleAll(!allChecked)}
          />
        </span>
        <span>Title</span>
        <span className="right">Duration</span>
        <span />
      </div>
      {videos.map(v => {
        const isSel = selected.has(v.playlistItemId);
        const preview = descriptionPreview(v.description ?? "");
        return (
          <div key={v.playlistItemId} className={"vrow" + (isSel ? " is-selected" : "")}>
            <span className="col-check">
              <input
                type="checkbox"
                className="checkbox"
                checked={isSel}
                onChange={() => toggleSelect(v.playlistItemId)}
              />
            </span>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
              {v.thumbnails ? (
                <div className="thumb" style={{ flexShrink: 0 }}>
                  <img
                    src={v.thumbnails}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }}
                  />
                </div>
              ) : (
                <div className="thumb stripe" style={{ flexShrink: 0 }}>
                  <div className="play" />
                </div>
              )}
              <div className="vtitle">
                <a
                  className="t"
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {v.title ?? "Untitled video"}
                </a>
                {preview && <div className="d">{preview}</div>}
              </div>
            </div>
            <span className="col-dur">{formatDuration(v.durationSeconds)}</span>
            <span className="col-actions">
              <button className="icon-btn is-danger" title="Remove from playlist" onClick={() => onRemove(v)}>
                <Icon name="trash" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* ============================================================
   Random result panel
   ============================================================ */
const RandomPanel = ({ video, onClose }) => {
  if (!video) return null;
  const preview = descriptionPreview(video.description ?? "");
  return (
    <div style={{
      margin: "0 20px 12px",
      border: "1px solid var(--accent-line)",
      borderRadius: "var(--radius)",
      background: "var(--accent-tint)",
      padding: "14px 16px",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)", fontWeight: 600 }}>
          Random pick
        </div>
        <button className="icon-btn" title="Dismiss" onClick={onClose}><Icon name="x" /></button>
      </div>
      <a
        href={`https://www.youtube.com/watch?v=${video.videoId}`}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none", color: "var(--fg)", fontWeight: 500, fontSize: 15, display: "block" }}
      >
        {video.title}
      </a>
      {preview && <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--fg-3)" }}>{preview}</div>}
      <div style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-3)" }}>
        {formatDuration(video.durationSeconds)}{video.playlistTitle ? ` · ${video.playlistTitle}` : ""}
      </div>
    </div>
  );
};

/* ============================================================
   Main area
   ============================================================ */
const Main = ({
  playlists, activeId, watchHistoryIds,
  onAddVideo, onImportVideos, onRemoveVideo, onRemoveSelected, onMoveSelected,
  onRandomAll, onRandomPlaylist, randomResult, onDismissRandom,
}) => {
  const playlist = playlists.find(p => p.playlistId === activeId);
  const [search, setSearch] = useState("");
  const [duration, setDuration] = useState("");
  const [sort, setSort] = useState("position");
  const [selected, setSelected] = useState(new Set());
  const [moveTo, setMoveTo] = useState("");

  useEffect(() => {
    setSelected(new Set());
    setSearch("");
  }, [activeId]);

  useEffect(() => {
    const other = playlists.find(p => p.playlistId !== activeId);
    if (other && !moveTo) setMoveTo(other.playlistId);
  }, [activeId, playlists]);

  const allVideos = useMemo(() =>
    sortVideos(playlist?.videos ?? [], sort),
    [playlist, sort]
  );

  const videos = useMemo(() => {
    let vs = allVideos;
    const q = search.trim().toLowerCase();
    if (q) vs = vs.filter(v =>
      v.title?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q)
    );
    const maxMin = parseFloat(duration);
    if (Number.isFinite(maxMin) && maxMin > 0) {
      vs = vs.filter(v => (v.durationSeconds ?? 0) <= maxMin * 60);
    }
    return vs;
  }, [allVideos, search, duration]);

  const toggleSelect = id => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleAll = on => setSelected(on ? new Set(videos.map(v => v.playlistItemId)) : new Set());

  const totalSec = (playlist?.videos ?? []).reduce((a, v) => a + (v.durationSeconds ?? 0), 0);
  const totalHM = `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`;

  const defaultPlaylistId = useMemo(() => {
    const found = playlists.find(p => p.title?.toLowerCase() === DEFAULT_ADD_PLAYLIST.toLowerCase());
    return found?.playlistId ?? activeId;
  }, [playlists, activeId]);

  const otherPlaylists = playlists.filter(p => p.playlistId !== activeId);

  const handleRemoveSelected = async () => {
    const ok = await onRemoveSelected(Array.from(selected));
    if (ok) setSelected(new Set());
  };

  const handleMoveSelected = async () => {
    if (!moveTo) return;
    const items = Array.from(selected).map(id => {
      const v = (playlist?.videos ?? []).find(v => v.playlistItemId === id);
      return v ? { playlistItemId: id, targetPlaylistId: moveTo, videoId: v.videoId } : null;
    }).filter(Boolean);
    const ok = await onMoveSelected(items);
    if (ok) setSelected(new Set());
  };

  return (
    <section className="main">
      <FilterBar
        search={search} setSearch={setSearch}
        duration={duration} setDuration={setDuration}
        sort={sort} setSort={setSort}
        onRandomAll={onRandomAll}
        onRandomPlaylist={() => onRandomPlaylist(activeId)}
      />

      <div className="playlist-head">
        <h2>{playlist?.title ?? "Select a playlist"}</h2>
        <div className="meta">
          <span><b>{allVideos.length}</b> videos</span>
          <span><b>{totalHM}</b> total</span>
        </div>
      </div>

      <div className="toolbar">
        <span className="sel-count">
          <b>{selected.size}</b> selected{selected.size > 0 ? ` of ${videos.length}` : ""}
        </span>
        <button className="btn" disabled={selected.size === 0} onClick={handleRemoveSelected}>
          <Icon name="trash" />
          Remove
        </button>
        <div className="flex-row">
          <select
            className="select"
            value={moveTo}
            onChange={e => setMoveTo(e.target.value)}
            style={{ height: 28, fontSize: 12.5 }}
          >
            {otherPlaylists.map(p => (
              <option key={p.playlistId} value={p.playlistId}>{p.title}</option>
            ))}
          </select>
          <button className="btn" disabled={selected.size === 0} onClick={handleMoveSelected}>
            <Icon name="move" />
            Move
          </button>
        </div>
        <div className="spacer" />
      </div>

      <AddBox
        playlists={playlists}
        defaultPlaylistId={defaultPlaylistId}
        watchHistoryIds={watchHistoryIds}
        onAddVideo={onAddVideo}
        onImportVideos={onImportVideos}
      />

      {randomResult && (
        <RandomPanel video={randomResult} onClose={onDismissRandom} />
      )}

      <div className="vlist">
        <VideoTable
          videos={videos}
          selected={selected}
          toggleSelect={toggleSelect}
          toggleAll={toggleAll}
          onRemove={v => onRemoveVideo(v, () =>
            setSelected(s => { const n = new Set(s); n.delete(v.playlistItemId); return n; })
          )}
        />
      </div>
    </section>
  );
};

/* ============================================================
   Create playlist modal
   ============================================================ */
const CreatePlaylistModal = ({ open, onClose, onSubmit }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  if (!open) return null;

  const handleSubmit = e => {
    e.preventDefault();
    if (title.trim()) {
      onSubmit(title.trim(), description.trim());
      setTitle("");
      setDescription("");
    }
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="palette-head">
          <Icon name="folder" className="icon lg" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>New playlist</span>
          <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 16 }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Title</label>
            <input
              className="input"
              placeholder="Playlist name"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ paddingLeft: 10 }}
              required
              autoFocus
            />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Description</label>
            <textarea
              className="input"
              placeholder="Optional description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ paddingLeft: 10, minHeight: 64 }}
            />
          </div>
          <div className="addbox-foot">
            <button type="submit" className="btn is-primary">
              <Icon name="plus" />
              Create playlist
            </button>
            <button type="button" className="btn is-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ============================================================
   Job panel modal
   ============================================================ */
const JobPanel = ({ open, onClose, jobList, jobSummary, onResume, onClearPending, onRefreshJobs }) => {
  if (!open) return null;

  const statusColor = s =>
    s === "error"    ? "var(--danger)" :
    s === "complete" ? "var(--ok)" :
    s === "running"  ? "var(--accent)" :
    "var(--fg-3)";

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="palette-head">
          <Icon name="briefcase" className="icon lg" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Job queue</span>
          <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="palette-body">
          {!jobList?.length ? (
            <div className="palette-empty">No active jobs.</div>
          ) : (
            jobList.map((job, i) => (
              <div key={job.id ?? i} style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "10px 12px", margin: "2px 6px",
                borderRadius: 8,
                background: job.status === "error" ? "var(--danger-tint)" : "transparent",
                border: "1px solid",
                borderColor: job.status === "error" ? "oklch(0.66 0.18 25 / 0.3)" : "var(--line)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{job.action}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 2 }}>
                    attempts: {job.attempts ?? 0} · {new Date(job.updatedAt ?? job.createdAt).toLocaleTimeString()}
                  </div>
                  {job.error && (
                    <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 4 }}>{job.error}</div>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "capitalize", color: statusColor(job.status) }}>
                  {job.status}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="palette-foot" style={{ gap: 8 }}>
          <button className="btn is-ghost" onClick={onRefreshJobs}>
            <Icon name="refresh" />
            Refresh
          </button>
          {(jobSummary?.incomplete ?? 0) > 0 && (
            <button className="btn is-primary" onClick={onResume}>
              <Icon name="chev" />
              Resume jobs
            </button>
          )}
          <button className="btn is-danger" onClick={onClearPending}>Clear pending</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: "var(--fg-4)" }}>{jobList?.length ?? 0} jobs</span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   App root
   ============================================================ */
const App = () => {
  const [playlists, setPlaylists] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [authUrl, setAuthUrl] = useState(null);
  const [jobSummary, setJobSummary] = useState({ total: 0, incomplete: 0, pending: 0, errors: 0 });
  const [jobList, setJobList] = useState([]);
  const [watchHistoryIds, setWatchHistoryIds] = useState(new Set());
  const [loading, setLoading] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [jobPanelOpen, setJobPanelOpen] = useState(false);
  const [randomResult, setRandomResult] = useState(null);
  const toastIdRef = useRef(0);

  const showMessage = useCallback((text, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts(ts => [...ts, { id, text, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4500);
  }, []);

  const withLoading = useCallback(async fn => {
    setLoading(n => n + 1);
    try { return await fn(); }
    finally { setLoading(n => Math.max(0, n - 1)); }
  }, []);

  const loadJobList = useCallback(async () => {
    const res = await fetchJson("/api/jobs");
    setJobList((res.jobs ?? []).filter(j => j.status !== "complete"));
  }, []);

  const refreshData = useCallback(async ({ suppressLoading = false } = {}) => {
    const run = async () => {
      try {
        const [status, payload] = await Promise.all([
          fetchJson("/api/status"),
          fetchJson("/api/playlists"),
        ]);
        setAuthorized(status.authorized);
        setAuthUrl(status.authUrl);
        setJobSummary(status.jobSummary ?? { total: 0, incomplete: 0, pending: 0, errors: 0 });
        setWatchHistoryIds(new Set(
          (Array.isArray(status.watchHistory) ? status.watchHistory : [])
            .filter(id => typeof id === "string")
            .map(id => id.toLowerCase())
        ));
        const sorted = alphabetize(payload.playlists ?? []);
        setPlaylists(sorted);
        setActiveId(prev => {
          if (!prev && sorted.length) return sorted[0].playlistId;
          if (prev && sorted.some(p => p.playlistId === prev)) return prev;
          return sorted.length ? sorted[0].playlistId : null;
        });
        setRandomResult(null);
        await loadJobList();
      } catch (err) {
        showMessage(err.message, "error");
        if (err.needsAuth) setAuthorized(false);
      }
    };
    suppressLoading ? await run() : await withLoading(run);
  }, [loadJobList, showMessage, withLoading]);

  useEffect(() => { refreshData(); }, []);

  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(o => !o);
      } else if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- Handlers ---- */

  const handleRefresh = async () => {
    try {
      await withLoading(async () => {
        await fetchJson("/api/refresh", { method: "POST" });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Cache refreshed", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleDeletePlaylist = async playlist => {
    if (!confirm(`Delete "${playlist.title}" permanently?`)) return;
    try {
      await withLoading(async () => {
        await fetchJson(`/api/playlists/${playlist.playlistId}`, { method: "DELETE" });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Playlist deleted", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleCreatePlaylist = async (title, description) => {
    try {
      await withLoading(async () => {
        await fetchJson("/api/playlists", {
          method: "POST",
          body: JSON.stringify({ title, description }),
        });
        setCreateOpen(false);
        await refreshData({ suppressLoading: true });
      });
      showMessage("Playlist created", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const findPlaylistsWithVideo = useCallback(videoId => {
    const norm = videoId.trim().toLowerCase();
    return playlists.filter(pl =>
      (pl.videos ?? []).some(v => v.videoId?.toLowerCase() === norm)
    );
  }, [playlists]);

  const handleAddVideo = async (videoId, targetPlaylistId) => {
    if (!videoId || !targetPlaylistId) {
      showMessage("Provide a video ID and select a playlist", "error");
      return;
    }
    const dupe = findPlaylistsWithVideo(videoId)[0];
    if (dupe) { showMessage(`Already in "${dupe.title}"`, "error"); return; }
    if (watchHistoryIds.has(videoId.toLowerCase())) {
      showMessage("Video is in watch history", "error");
      return;
    }
    try {
      await withLoading(async () => {
        await fetchJson(`/api/playlists/${targetPlaylistId}/videos`, {
          method: "POST",
          body: JSON.stringify({ videoId }),
        });
        await refreshData({ suppressLoading: true });
      });
      const pl = playlists.find(p => p.playlistId === targetPlaylistId);
      showMessage(`Added to ${pl?.title ?? "playlist"}`, "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleImportVideos = async (videoIds, targetPlaylistId) => {
    if (!videoIds.length) { showMessage("Provide at least one video ID", "error"); return; }
    if (!targetPlaylistId) { showMessage("Select a playlist", "error"); return; }
    let skippedExisting = 0, skippedHistory = 0;
    const toAdd = videoIds.filter(id => {
      if (findPlaylistsWithVideo(id).length) { skippedExisting++; return false; }
      if (watchHistoryIds.has(id.toLowerCase())) { skippedHistory++; return false; }
      return true;
    });
    if (!toAdd.length) {
      const parts = [];
      if (skippedExisting) parts.push(`${skippedExisting} already in playlists`);
      if (skippedHistory) parts.push(`${skippedHistory} in watch history`);
      showMessage(`No new videos (${parts.join("; ")})`, "info");
      return;
    }
    try {
      await withLoading(async () => {
        for (const id of toAdd) {
          await fetchJson(`/api/playlists/${targetPlaylistId}/videos`, {
            method: "POST",
            body: JSON.stringify({ videoId: id }),
          });
        }
        await refreshData({ suppressLoading: true });
      });
      const pl = playlists.find(p => p.playlistId === targetPlaylistId);
      const parts = [`Imported ${toAdd.length} video${toAdd.length === 1 ? "" : "s"} to ${pl?.title ?? "playlist"}`];
      if (skippedExisting) parts.push(`${skippedExisting} already in playlists`);
      if (skippedHistory) parts.push(`${skippedHistory} in watch history`);
      showMessage(parts.join("; "), "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleRemoveVideo = async (video, onSuccess) => {
    try {
      await withLoading(async () => {
        await fetchJson(`/api/playlist-items/${video.playlistItemId}`, { method: "DELETE" });
        if (onSuccess) onSuccess();
        await refreshData({ suppressLoading: true });
      });
      showMessage("Video removed", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleRemoveSelected = async itemIds => {
    if (!itemIds.length) { showMessage("No videos selected", "error"); return false; }
    try {
      await withLoading(async () => {
        await fetchJson("/api/videos/batch-remove", {
          method: "POST",
          body: JSON.stringify({ itemIds }),
        });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Selected videos removed", "success");
      return true;
    } catch (err) { showMessage(err.message, "error"); return false; }
  };

  const handleMoveSelected = async items => {
    if (!items.length) { showMessage("No videos to move", "error"); return false; }
    try {
      await withLoading(async () => {
        await fetchJson("/api/videos/move", {
          method: "POST",
          body: JSON.stringify({ items }),
        });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Videos moved", "success");
      return true;
    } catch (err) { showMessage(err.message, "error"); return false; }
  };

  const handleRandomAll = async () => {
    try {
      await withLoading(async () => {
        const res = await fetchJson("/api/random");
        setRandomResult(res.video ?? null);
        if (!res.video) showMessage("No videos matched", "info");
        else showMessage("Random video selected", "success");
      });
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleRandomPlaylist = async playlistId => {
    if (!playlistId) return;
    try {
      await withLoading(async () => {
        const res = await fetchJson(`/api/random?playlistId=${playlistId}`);
        setRandomResult(res.video ?? null);
        if (!res.video) showMessage("No videos matched", "info");
        else showMessage("Random video selected", "success");
      });
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleResume = async () => {
    try {
      await withLoading(async () => {
        await fetchJson("/api/jobs/resume", { method: "POST" });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Job queue resumed", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleClearPending = async () => {
    try {
      await withLoading(async () => {
        await fetchJson("/api/jobs/clear-pending", { method: "POST" });
        await refreshData({ suppressLoading: true });
      });
      showMessage("Pending jobs cleared", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  const handleRefreshJobs = async () => {
    try {
      await withLoading(loadJobList);
      showMessage("Jobs refreshed", "success");
    } catch (err) { showMessage(err.message, "error"); }
  };

  /* ---- Render ---- */

  return (
    <div className="app">
      <LoadingOverlay visible={loading > 0} />

      <Topbar
        authorized={authorized}
        authUrl={authUrl}
        jobList={jobList}
        jobSummary={jobSummary}
        onOpenSearch={() => setSearchOpen(true)}
        onRefresh={handleRefresh}
        onOpenCreate={() => setCreateOpen(true)}
        onOpenJobPanel={() => setJobPanelOpen(true)}
      />

      <Sidebar
        playlists={playlists}
        activeId={activeId}
        onSelect={id => { setActiveId(id); setRandomResult(null); }}
        onDelete={handleDeletePlaylist}
        onOpenCreate={() => setCreateOpen(true)}
        filter={sidebarFilter}
        setFilter={setSidebarFilter}
      />

      <Main
        playlists={playlists}
        activeId={activeId}
        watchHistoryIds={watchHistoryIds}
        onAddVideo={handleAddVideo}
        onImportVideos={handleImportVideos}
        onRemoveVideo={handleRemoveVideo}
        onRemoveSelected={handleRemoveSelected}
        onMoveSelected={handleMoveSelected}
        onRandomAll={handleRandomAll}
        onRandomPlaylist={handleRandomPlaylist}
        randomResult={randomResult}
        onDismissRandom={() => setRandomResult(null)}
      />

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        playlists={playlists}
        onJump={id => setActiveId(id)}
      />

      <CreatePlaylistModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreatePlaylist}
      />

      <JobPanel
        open={jobPanelOpen}
        onClose={() => setJobPanelOpen(false)}
        jobList={jobList}
        jobSummary={jobSummary}
        onResume={handleResume}
        onClearPending={handleClearPending}
        onRefreshJobs={handleRefreshJobs}
      />

      <ToastContainer
        toasts={toasts}
        onRemove={id => setToasts(ts => ts.filter(t => t.id !== id))}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
