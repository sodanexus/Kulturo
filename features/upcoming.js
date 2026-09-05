// ============================================================
// Onglet Sorties : chargement, filtres, wishlist et rendu
// ============================================================

export function createUpcomingFeature(dependencies) {
  const {
    State,
    Media,
    TMDb,
    IGDB,
    GoogleBooks,
    getCurrentPage,
    normalizeTitle,
    normalizedSubtype,
    formatReleaseDate,
    findMatchingEntry,
    safeMediaUrl,
    esc,
    uiAction,
    iconMedia,
    iconStatus,
    continuePreviewHTML,
    hydrateFadeImages,
    loadingState,
    emptyState,
    errorState,
    loadingStart,
    loadingDone,
    cacheEntriesLocally,
    markJournalDirty,
    updateBadges,
    toast,
    closeModal,
    openDetailPanel,
    canEnrichMediaDetails,
    renderDetailPanel,
    scheduleSynopsisOverflowCheck,
    requestPrefetchedDetails,
    detailSessions,
    injectBackdrop,
    refreshDetailEnrichment,
    clearApiCache,
  } = dependencies;

// ── Prochaines sorties ────────────────────────────────────────
const UPCOMING_PREFS_KEY = "kulturo-upcoming-preferences-v2";
const UPCOMING_TYPES = ["all", "movie", "tv", "game", "book"];
const UPCOMING_TYPE_META = {
  movie: { label: "Film",  icon: iconMedia("movie"),       mediaType: "movie", badge: "movie" },
  tv:    { label: "Série", icon: iconMedia("movie", "tv"), mediaType: "movie", badge: "movie" },
  game:  { label: "Jeu",   icon: iconMedia("game"),        mediaType: "game",  badge: "game" },
  book:  { label: "Livre", icon: iconMedia("book"),        mediaType: "book",  badge: "book" },
};

function upcomingTypeOf(item) {
  if (UPCOMING_TYPE_META[item?.upcoming_type]) return item.upcoming_type;
  if (item?.media_type === "game" || item?.media_type === "book") return item.media_type;
  return item?.subtype === "tv" ? "tv" : "movie";
}

function upcomingMediaTypeOf(item) {
  return UPCOMING_TYPE_META[upcomingTypeOf(item)]?.mediaType || "movie";
}

function upcomingKeyOf(item) {
  return item?.upcoming_id
    || `${upcomingTypeOf(item)}:${item?.source_api || "manual"}:${item?.external_id || normalizeTitle(item?.title)}:${item?.release_date || ""}`;
}

function upcomingPreviewId(item) {
  return `upcoming-${String(upcomingKeyOf(item)).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function readUpcomingPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(UPCOMING_PREFS_KEY) || "{}");
    return {
      type: UPCOMING_TYPES.includes(saved.type) ? saved.type : "all",
      genre: typeof saved.genre === "string" && saved.genre ? saved.genre : "all",
      hideAdded: typeof saved.hideAdded === "boolean" ? saved.hideAdded : true,
    };
  } catch {
    return { type: "all", genre: "all", hideAdded: true };
  }
}

function persistUpcomingPreferences() {
  try {
    localStorage.setItem(UPCOMING_PREFS_KEY, JSON.stringify({
      type: UpcomingState.type,
      genre: UpcomingState.genre,
      hideAdded: UpcomingState.hideAdded,
    }));
  } catch {}
}

const _upcomingPreferences = readUpcomingPreferences();
const UpcomingState = {
  ..._upcomingPreferences,
  results: [],
  sourceResults: {},
  loading: false,
  loaded: false,
  adding: new Set(),
  sourceStatus: {},
};

function daysUntilRelease(value, precision = "day") {
  if (!value || precision !== "day") return null;
  const today = new Date();
  const [year, month, day] = value.split("-").map(Number);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const releaseUtc = Date.UTC(year, month - 1, day);
  const days = Math.round((releaseUtc - todayUtc) / 86400000);
  return days >= 0 ? days : null;
}

function releaseDayDelta(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const today = new Date();
  const [year, month, day] = value.split("-").map(Number);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const releaseUtc = Date.UTC(year, month - 1, day);
  return Math.round((releaseUtc - todayUtc) / 86400000);
}

function upcomingMatchesEntry(item, entry) {
  if (!item || !entry || upcomingMediaTypeOf(item) !== entry.media_type) return false;
  const itemSubtype = normalizedSubtype({ ...item, media_type: upcomingMediaTypeOf(item) });
  const entrySubtype = normalizedSubtype(entry);
  if (itemSubtype !== entrySubtype) return false;

  if (item.external_id && entry.external_id && item.source_api === entry.source_api) {
    return String(item.external_id) === String(entry.external_id);
  }

  if (normalizeTitle(item.title) !== normalizeTitle(entry.title)) return false;
  const itemYear = Number(item.release_year) || null;
  const entryYear = Number(entry.release_year) || null;
  if (itemYear && entryYear && itemYear !== entryYear) return false;
  if (item.author && entry.author && normalizeTitle(item.author) !== normalizeTitle(entry.author)) return false;
  return true;
}

function matchingUpcomingResult(entry) {
  return UpcomingState.results.find(item => upcomingMatchesEntry(item, entry)) || null;
}

function awaitedReleaseItems() {
  return State.entries
    .filter(entry => entry.status === "wishlist")
    .map(entry => {
      const live = matchingUpcomingResult(entry);
      const releaseDate = live?.release_date || entry.release_date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(releaseDate || ""))) return null;
      return {
        ...live,
        ...entry,
        release_date: releaseDate,
        release_date_precision: live?.date_precision || entry.release_date_precision || "day",
      };
    })
    .filter(Boolean)
    .filter(entry => UpcomingState.type === "all" || upcomingTypeOf(entry) === UpcomingState.type)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
}

function awaitedReleaseTiming(entry) {
  const delta = releaseDayDelta(entry.release_date);
  if (delta !== null && delta <= 0) return { label: "Disponible", available: true };
  if (delta !== null && entry.release_date_precision !== "month") return { label: `J-${delta}`, available: false };
  return { label: "À venir", available: false };
}

const AWAITED_RELEASES_EXPANDED_KEY = "kulturo-awaited-releases-expanded";

function readAwaitedReleasesExpanded() {
  try {
    const saved = localStorage.getItem(AWAITED_RELEASES_EXPANDED_KEY);
    if (saved === "true" || saved === "false") return saved === "true";
  } catch {}
  return !window.matchMedia?.("(max-width: 680px)").matches;
}

function awaitedReleaseCardHTML(entry) {
  const type = upcomingTypeOf(entry);
  const typeMeta = UPCOMING_TYPE_META[type] || UPCOMING_TYPE_META.movie;
  const timing = awaitedReleaseTiming(entry);
  const coverUrl = safeMediaUrl(entry.cover_url);
  const cover = coverUrl
    ? `<img class="awaited-release-cover fade-image" data-fade-image data-image-fallback="flex" src="${esc(coverUrl)}" alt="${esc(entry.title)}" loading="lazy">
       <span class="awaited-release-placeholder" style="display:none">${typeMeta.icon}</span>`
    : `<span class="awaited-release-placeholder">${typeMeta.icon}</span>`;
  return `
    <button type="button" class="continue-card awaited-release-card" data-prefetch-media="${esc(entry.id)}" data-transition-media="${esc(entry.id)}"
      ${uiAction("openEditModal", [entry.id], { control: true })} aria-label="Ouvrir ${esc(entry.title)}" title="${esc(entry.title)} · ${esc(formatReleaseDate(entry.release_date, entry.release_date_precision))}">
      <span class="continue-cover awaited-release-visual">
        ${cover}
        <span class="awaited-release-timing${timing.available ? " is-available" : ""}">${esc(timing.label)}</span>
      </span>
    </button>`;
}

function renderAwaitedReleases() {
  const section = document.getElementById("upcoming-wishlist-section");
  if (!section) return;
  const entries = awaitedReleaseItems();
  section.hidden = entries.length === 0;
  if (!entries.length) {
    section.innerHTML = "";
    return;
  }
  const expanded = readAwaitedReleasesExpanded();
  section.classList.toggle("is-expanded", expanded);
  section.innerHTML = `
    <button type="button" class="continue-toggle" ${uiAction("toggleAwaitedReleases")} aria-expanded="${expanded}" aria-controls="awaited-releases-content">
      <span class="continue-heading-copy">
        <h2 id="upcoming-wishlist-title">Mes sorties attendues</h2>
        <span>${entries.length} dans votre wishlist</span>
      </span>
      <span class="continue-preview" aria-hidden="true">${entries.slice(0, 3).map(continuePreviewHTML).join("")}</span>
      <span class="continue-chevron" aria-hidden="true"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="continue-expand" id="awaited-releases-content" aria-hidden="${!expanded}" ${expanded ? "" : "inert"}>
      <div class="continue-expand-inner">
        <div class="continue-expanded-head">
          <span>Les prochaines œuvres déjà ajoutées à votre wishlist.</span>
          <button class="section-link" ${uiAction("navTo", ["status-wishlist"])}>Voir la wishlist <span aria-hidden="true">→</span></button>
        </div>
        <div class="continue-track awaited-release-track">${entries.map(awaitedReleaseCardHTML).join("")}</div>
      </div>
    </div>`;
  hydrateFadeImages(section);
}

function toggleAwaitedReleases() {
  const section = document.getElementById("upcoming-wishlist-section");
  const toggle = section?.querySelector(".continue-toggle");
  const content = section?.querySelector(".continue-expand");
  if (!section || !toggle || !content) return;
  const expanded = !section.classList.contains("is-expanded");
  section.classList.toggle("is-expanded", expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  content.setAttribute("aria-hidden", String(!expanded));
  content.inert = !expanded;
  try { localStorage.setItem(AWAITED_RELEASES_EXPANDED_KEY, String(expanded)); } catch {}
}

const _wishlistReleaseSyncAttempts = new Set();
let _wishlistReleaseSyncTimer = 0;
function scheduleWishlistReleaseDateSync() {
  clearTimeout(_wishlistReleaseSyncTimer);
  _wishlistReleaseSyncTimer = setTimeout(async () => {
    const candidates = State.entries
      .filter(entry => entry.status === "wishlist")
      .map(entry => ({ entry, live: matchingUpcomingResult(entry) }))
      .filter(({ entry, live }) => live?.release_date && (
        entry.release_date !== live.release_date ||
        (entry.release_date_precision || "day") !== (live.date_precision || "day")
      ))
      .map(({ entry, live }) => ({
        entry,
        live,
        syncKey: `${entry.id}:${live.release_date}:${live.date_precision || "day"}`,
      }))
      .filter(({ syncKey }) => {
        if (_wishlistReleaseSyncAttempts.has(syncKey)) return false;
        _wishlistReleaseSyncAttempts.add(syncKey);
        return true;
      });
    if (!candidates.length) return;

    const results = await Promise.allSettled(candidates.map(async ({ entry, live }) => {
      const changes = {
        release_date: live.release_date,
        release_date_precision: live.date_precision === "month" ? "month" : "day",
      };
      const updated = await Media.update(entry.id, changes);
      Object.assign(entry, updated);
    }));
    if (results.some(result => result.status === "fulfilled")) {
      cacheEntriesLocally();
      renderAwaitedReleases();
    }
    results.forEach((result, index) => {
      if (result.status !== "rejected") return;
      _wishlistReleaseSyncAttempts.delete(candidates[index].syncKey);
      console.warn("[Sorties] Date de wishlist non sauvegardée :", result.reason);
    });
  }, 90);
}

function isUpcomingInLibrary(it) {
  return Boolean(findMatchingEntry({ ...it, media_type: upcomingMediaTypeOf(it) }));
}

function upcomingGenresForItem(it) {
  if (Array.isArray(it.genres)) return it.genres.filter(Boolean);
  return String(it.genre || "")
    .split(",")
    .map(genre => genre.trim())
    .filter(Boolean);
}

function availableUpcomingGenres() {
  const items = UpcomingState.type === "all"
    ? UpcomingState.results
    : UpcomingState.results.filter(it => upcomingTypeOf(it) === UpcomingState.type);
  return [...new Set(items.flatMap(upcomingGenresForItem))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

function syncUpcomingTypeButtons() {
  UPCOMING_TYPES.forEach(type => {
    const btn = document.getElementById(`upcoming-filter-${type}`);
    if (!btn) return;
    const isActive = type === UpcomingState.type;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

function syncUpcomingLoadingState() {
  const toolbar = document.querySelector(".upcoming-toolbar");
  const grid = document.getElementById("upcoming-grid");
  const refreshBtn = document.getElementById("upcoming-refresh-btn");
  const hideAdded = document.getElementById("upcoming-hide-added");
  toolbar?.setAttribute("aria-busy", String(UpcomingState.loading));
  grid?.setAttribute("aria-busy", String(UpcomingState.loading));
  if (hideAdded) hideAdded.checked = UpcomingState.hideAdded;
  if (refreshBtn) {
    refreshBtn.disabled = UpcomingState.loading;
    refreshBtn.classList.toggle("is-loading", UpcomingState.loading);
  }
}

function renderUpcomingGenreFilter() {
  const select = document.getElementById("upcoming-genre-select");
  const wrap = document.getElementById("upcoming-genre-wrap");
  if (!select) return;

  const genres = availableUpcomingGenres();
  if (UpcomingState.genre !== "all" && !genres.includes(UpcomingState.genre)) {
    UpcomingState.genre = "all";
    persistUpcomingPreferences();
  }
  select.innerHTML = [
    `<option value="all">Tous les genres</option>`,
    ...genres.map(genre => `<option value="${esc(genre)}">${esc(genre)}</option>`),
  ].join("");
  select.value = UpcomingState.genre;
  select.disabled = genres.length === 0;
  wrap?.classList.toggle("has-filter", UpcomingState.genre !== "all");
}

function rebuildUpcomingResults() {
  const unique = new Map();
  Object.values(UpcomingState.sourceResults).flat().forEach(item => {
    if (!item?.title || !item?.release_date) return;
    const key = upcomingKeyOf(item);
    const current = unique.get(key);
    if (!current || Number(item.popularity || 0) > Number(current.popularity || 0)) unique.set(key, item);
  });
  UpcomingState.results = [...unique.values()].sort((a, b) =>
    a.release_date.localeCompare(b.release_date) || Number(b.popularity || 0) - Number(a.popularity || 0)
  );
  scheduleWishlistReleaseDateSync();
}

function pendingUpcomingSourceLabels(forCurrentView = false) {
  const pending = [];
  const type = UpcomingState.type;
  const include = sourceType => !forCurrentView || type === "all" || type === sourceType
    || (sourceType === "movie" && type === "tv");
  if (include("movie") && (UpcomingState.sourceStatus.movie === "loading" || UpcomingState.sourceStatus.tv === "loading")) {
    pending.push("films et séries");
  }
  if (include("game") && UpcomingState.sourceStatus.game === "loading") pending.push("jeux");
  if (include("book") && UpcomingState.sourceStatus.book === "loading") pending.push("livres");
  return pending;
}

function filteredUpcomingResults() {
  let filtered = UpcomingState.type === "all"
    ? UpcomingState.results
    : UpcomingState.results.filter(it => upcomingTypeOf(it) === UpcomingState.type);
  if (UpcomingState.genre !== "all") {
    filtered = filtered.filter(it => upcomingGenresForItem(it).includes(UpcomingState.genre));
  }
  if (UpcomingState.hideAdded) filtered = filtered.filter(it => !isUpcomingInLibrary(it));
  return filtered;
}

function visibleUpcomingResults() {
  const filtered = filteredUpcomingResults();
  if (UpcomingState.type !== "all") return filtered.slice(0, 36);

  // Le flux "Tout" doit rester culturellement varié : réserver d'abord une
  // place équitable à chaque type, puis compléter avec les prochaines dates.
  const selected = [];
  const selectedKeys = new Set();
  UPCOMING_TYPES.slice(1).forEach(type => {
    filtered
      .filter(item => upcomingTypeOf(item) === type)
      .slice(0, 12)
      .forEach(item => {
        selected.push(item);
        selectedKeys.add(upcomingKeyOf(item));
      });
  });
  for (const item of filtered) {
    if (selected.length >= 48) break;
    const key = upcomingKeyOf(item);
    if (selectedKeys.has(key)) continue;
    selected.push(item);
    selectedKeys.add(key);
  }
  return selected.sort((a, b) =>
    a.release_date.localeCompare(b.release_date) || Number(b.popularity || 0) - Number(a.popularity || 0)
  );
}

async function renderUpcoming(force = false) {
  const grid = document.getElementById("upcoming-grid");
  if (!grid || getCurrentPage() !== "upcoming") return;
  syncUpcomingTypeButtons();
  syncUpcomingLoadingState();

  if (UpcomingState.loaded && !force) {
    renderUpcomingCards();
    return;
  }
  if (UpcomingState.loading) return;

  UpcomingState.loading = true;
  UpcomingState.loaded = false;
  const sources = [
    { key: "tmdb", types: ["movie", "tv"], enabled: TMDb.available(), load: () => TMDb.upcoming() },
    { key: "igdb", types: ["game"], enabled: IGDB.available(), load: () => IGDB.upcoming() },
    { key: "books", types: ["book"], enabled: GoogleBooks.available(), load: () => GoogleBooks.upcoming() },
  ];
  UpcomingState.sourceStatus = Object.fromEntries(sources.flatMap(source =>
    source.types.map(type => [type, source.enabled ? "loading" : "unavailable"])
  ));
  sources.filter(source => !source.enabled).forEach(source => { delete UpcomingState.sourceResults[source.key]; });
  rebuildUpcomingResults();
  syncUpcomingLoadingState();
  renderUpcomingCards();
  loadingStart();

  const loadSource = async source => {
    try {
      const value = await source.load();
      const sourceItems = Array.isArray(value) ? value : [];
      UpcomingState.sourceResults[source.key] = sourceItems;
      source.types.forEach(type => {
        UpcomingState.sourceStatus[type] = sourceItems.some(item => upcomingTypeOf(item) === type)
          ? "ok"
          : "empty";
      });
    } catch (error) {
      source.types.forEach(type => { UpcomingState.sourceStatus[type] = "error"; });
      if (!Array.isArray(UpcomingState.sourceResults[source.key])) UpcomingState.sourceResults[source.key] = [];
      console.warn(`[Sorties/${source.key}]`, error);
    } finally {
      rebuildUpcomingResults();
      renderUpcomingCards();
    }
  };

  try {
    await Promise.all(sources.filter(source => source.enabled).map(loadSource));
  } finally {
    UpcomingState.loading = false;
    UpcomingState.loaded = true;
    syncUpcomingLoadingState();
    renderUpcomingCards();
    loadingDone();
  }
}

function renderUpcomingCards() {
  const grid = document.getElementById("upcoming-grid");
  if (!grid) return;
  syncUpcomingTypeButtons();
  renderUpcomingGenreFilter();
  renderAwaitedReleases();
  const allResults = filteredUpcomingResults();
  const results = visibleUpcomingResults();
  const hideAdded = document.getElementById("upcoming-hide-added");
  if (hideAdded) hideAdded.checked = UpcomingState.hideAdded;
  const resultCount = document.getElementById("upcoming-result-count");
  if (resultCount) {
    const count = allResults.length > results.length
      ? `${results.length} affichés sur ${allResults.length}`
      : `${results.length} sortie${results.length > 1 ? "s" : ""}`;
    resultCount.textContent = UpcomingState.loading && pendingUpcomingSourceLabels(true).length
      ? `${count} · chargement…`
      : count;
  }

  if (!results.length) {
    const hasFilter = UpcomingState.type !== "all" || UpcomingState.genre !== "all" || UpcomingState.hideAdded;
    const pendingLabels = pendingUpcomingSourceLabels(true);
    if (pendingLabels.length) {
      grid.innerHTML = loadingState(`Chargement en cours : ${pendingLabels.join(", ")}…`);
      return;
    }
    const statuses = UpcomingState.type === "all"
      ? ["movie", "tv", "game", "book"].map(type => UpcomingState.sourceStatus[type]).filter(Boolean)
      : [UpcomingState.sourceStatus[UpcomingState.type]].filter(Boolean);
    const sourceStatus = UpcomingState.type === "all"
      ? (statuses.length && statuses.every(status => status === "error" || status === "unavailable")
          ? "error"
          : statuses.length && statuses.every(status => status === "empty" || status === "unavailable") ? "empty" : null)
      : statuses[0];
    const unavailableMessages = {
      movie: "Ajoutez une clé TMDb dans config.js pour charger les sorties cinéma.",
      tv: "Ajoutez une clé TMDb dans config.js pour charger les nouvelles séries.",
      game: "Configurez IGDB puis redéployez la fonction igdb-proxy pour charger les jeux.",
      book: "Déployez la dernière fonction google-books-proxy pour charger les annonces de livres de la BnF.",
    };
    const emptyMessages = {
      movie: "Aucune sortie cinéma française vérifiable n’a été trouvée sur cette période.",
      tv: "Aucune nouvelle série diffusée en France n’a été trouvée sur cette période.",
      game: "IGDB n’a renvoyé aucune sortie Europe, Monde ou internationale vérifiable sur cette période.",
      book: "La BnF n’a annoncé aucune parution future exploitable dans ses flux Livres et Jeunesse pour cette période.",
    };
    const sourceMessage = sourceStatus === "error"
      ? "Le catalogue correspondant n’a pas pu être joint. Réessayez après avoir actualisé."
      : sourceStatus === "unavailable"
        ? (unavailableMessages[UpcomingState.type] || "La source nécessaire n’est pas configurée sur cette installation.")
        : sourceStatus === "empty"
          ? (emptyMessages[UpcomingState.type] || "Aucune sortie vérifiable n’est disponible pour cette période.")
        : "Aucune sortie ne correspond à ces filtres actuellement.";
    const emptyTitle = sourceStatus === "error"
      ? "Catalogue indisponible"
      : sourceStatus === "empty" && UpcomingState.type === "book"
        ? "Aucune date française fiable"
        : "Aucune sortie trouvée";
    const stateOptions = {
      icon: "◇",
      title: emptyTitle,
      message: sourceMessage,
      actionHTML: hasFilter ? `<button class="btn btn-secondary btn-sm" ${uiAction("resetUpcomingFilters")}>Tout afficher</button>` : "",
    };
    grid.innerHTML = sourceStatus === "error" ? errorState(stateOptions) : emptyState(stateOptions);
    return;
  }

  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const groups = new Map();
  results.forEach(it => {
    const date = it.release_date ? new Date(`${it.release_date}T12:00:00`) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "unknown";
    const label = date && !Number.isNaN(date.getTime())
      ? monthFormatter.format(date)
      : "Date à confirmer";
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(it);
  });

  const pendingLabels = pendingUpcomingSourceLabels(true);
  const progress = pendingLabels.length
    ? `<div class="upcoming-progress" role="status"><div class="spinner"></div><span>Encore en chargement : ${esc(pendingLabels.join(", "))}…</span></div>`
    : "";
  grid.innerHTML = progress + [...groups.values()].map(group => `
    <section class="upcoming-month-section">
      <div class="upcoming-month-heading">
        <h2>${esc(group.label)}</h2>
        <span>${group.items.length} sortie${group.items.length > 1 ? "s" : ""}</span>
      </div>
      <div class="upcoming-grid">
        ${group.items.map(upcomingCardHTML).join("")}
      </div>
    </section>`).join("");
  requestAnimationFrame(() => {
    grid.querySelectorAll(".upcoming-card").forEach((card, i) => {
      card.style.animationDelay = `${Math.min(i * 40, 480)}ms`;
    });
    hydrateFadeImages(grid);
  });
}

function upcomingCardHTML(it) {
  const libraryEntry = findMatchingEntry({ ...it, media_type: upcomingMediaTypeOf(it) });
  const inLibrary = Boolean(libraryEntry);
  const transitionMediaId = libraryEntry?.id || upcomingPreviewId(it);
  const days = daysUntilRelease(it.release_date, it.date_precision);
  const type = upcomingTypeOf(it);
  const typeMeta = UPCOMING_TYPE_META[type] || UPCOMING_TYPE_META.movie;
  const upcomingKey = upcomingKeyOf(it);
  const secondary = type === "book" ? it.author : (type === "game" ? it.platform : null);
  const coverUrl = safeMediaUrl(it.cover_url);
  const cover = coverUrl
    ? `<img class="card-cover fade-image" data-fade-image data-image-fallback="flex" src="${esc(coverUrl)}" alt="${esc(it.title)}" loading="lazy">
       <span class="card-cover-placeholder" style="display:none">${typeMeta.icon}</span>`
    : `<span class="card-cover-placeholder">${typeMeta.icon}</span>`;

  return `
    <article class="media-card upcoming-card" data-upcoming-key="${esc(upcomingKey)}" data-transition-media="${esc(transitionMediaId)}">
      <div class="upcoming-cover-wrap">
        <button type="button" class="upcoming-card-open" ${uiAction("openUpcomingDetail", [upcomingKey], { control: true })} aria-label="Ouvrir ${esc(it.title)}">
          ${cover}
          ${days !== null ? `<span class="release-countdown">${days === 0 ? "Aujourd'hui" : `J-${days}`}</span>` : ""}
          <span class="sr-only">${esc(typeMeta.label)} · ${esc(formatReleaseDate(it.release_date, it.date_precision))}${secondary ? ` · ${esc(secondary)}` : ""}</span>
        </button>
        <button type="button" class="upcoming-wishlist-mark${inLibrary ? " is-added" : ""}" aria-pressed="${inLibrary}" aria-label="${inLibrary ? "Déjà dans votre bibliothèque" : `Ajouter ${esc(it.title)} à la wishlist`}" title="${inLibrary ? "Dans votre bibliothèque" : "Ajouter à la wishlist"}"
          ${inLibrary ? "" : uiAction("addUpcomingToWishlist", [upcomingKey])}>${iconStatus("wishlist")}</button>
      </div>
    </article>`;
}

async function addUpcomingToWishlist(upcomingKey, closeAfter = false) {
  const it = UpcomingState.results.find(item => upcomingKeyOf(item) === upcomingKey);
  if (!it || isUpcomingInLibrary(it)) return;
  const addingKey = upcomingKeyOf(it);
  if (UpcomingState.adding.has(addingKey)) return;
  UpcomingState.adding.add(addingKey);
  const mediaType = upcomingMediaTypeOf(it);
  const payload = {
    title: it.title,
    media_type: mediaType,
    subtype: mediaType === "movie" ? (it.subtype || "movie") : null,
    status: "wishlist",
    cover_url: it.cover_url || null,
    description: it.description || null,
    release_year: it.release_year || null,
    release_date: it.release_date || null,
    release_date_precision: it.date_precision === "month" ? "month" : "day",
    genre: it.genre || null,
    author: it.author || null,
    external_id: it.external_id || null,
    source_api: it.source_api || "manual",
    is_favorite: false,
    rating: null,
    notes: null,
    platform: it.platform || null,
  };
  if (it.publisher) payload.publisher = it.publisher;

  try {
    const created = await Media.create(payload);
    State.entries.unshift(created);
    cacheEntriesLocally();
    markJournalDirty();
    updateBadges();
    renderUpcomingCards();
    toast(`"${it.title}" ajouté à la wishlist ✓`, "success");
    if (closeAfter) closeModal();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  } finally {
    UpcomingState.adding.delete(addingKey);
  }
}

async function openUpcomingDetail(upcomingKey, transitionSource = null) {
  const it = UpcomingState.results.find(item => upcomingKeyOf(item) === upcomingKey);
  if (!it) return;

  const mediaType = upcomingMediaTypeOf(it);
  const existing = findMatchingEntry({ ...it, media_type: mediaType });
  if (existing) {
    if (!existing.release_date) existing.release_date = it.release_date;
    if (!existing.release_date_precision) existing.release_date_precision = it.date_precision === "month" ? "month" : "day";
    openDetailPanel(existing.id, { transitionSource });
    return;
  }

  const preview = {
    ...it,
    id: upcomingPreviewId(it),
    media_type: mediaType,
    status: null,
    rating: null,
    is_favorite: false,
  };

  const detailsLoading = !preview.description && canEnrichMediaDetails(preview);
  const detailSessionId = renderDetailPanel(preview, { preview: true, upcomingKey, detailsLoading, transitionSource });
  scheduleSynopsisOverflowCheck(preview.id);

  try {
    const details = await requestPrefetchedDetails(preview, {
      signal: detailSessions.signal(detailSessionId),
    });
    if (!detailSessions.isActive(detailSessionId, preview.id)) return;
    if (!details) {
      refreshDetailEnrichment(preview, { detailsLoading: false });
      return;
    }

    Object.entries(details).forEach(([field, value]) => {
      if (value != null && !preview[field]) preview[field] = value;
    });
    const body = document.getElementById(`detail-body-${preview.id}`);
    if (body) {
      injectBackdrop(preview.backdrop_url, preview.id, detailSessionId);
      refreshDetailEnrichment(preview, { detailsLoading: false });
    }
  } catch (err) {
    if (err?.name !== "AbortError") console.warn("[Detail upcoming] fetch error:", err);
    if (detailSessions.isActive(detailSessionId, preview.id)) {
      refreshDetailEnrichment(preview, { detailsLoading: false });
    }
  }
}

function setUpcomingType(type) {
  if (!UPCOMING_TYPES.includes(type)) return;
  UpcomingState.type = type;
  persistUpcomingPreferences();
  syncUpcomingTypeButtons();
  renderUpcomingCards();
}

function setUpcomingGenre(genre) {
  const allowed = new Set(["all", ...availableUpcomingGenres()]);
  if (!allowed.has(genre)) return;
  UpcomingState.genre = genre;
  persistUpcomingPreferences();
  renderUpcomingCards();
}

function setUpcomingHideAdded(value) {
  UpcomingState.hideAdded = Boolean(value);
  persistUpcomingPreferences();
  renderUpcomingCards();
}

function resetUpcomingFilters() {
  UpcomingState.type = "all";
  UpcomingState.genre = "all";
  UpcomingState.hideAdded = false;
  persistUpcomingPreferences();
  syncUpcomingTypeButtons();
  renderUpcomingCards();
}



  function refreshUpcoming() {
    clearApiCache(key => key.includes("/discover/") || key.includes('"action":"upcoming"'));
    UpcomingState.loaded = false;
    UpcomingState.results = [];
    return renderUpcoming(true);
  }

  return {
    render: renderUpcoming,
    renderCards: renderUpcomingCards,
    setType: setUpcomingType,
    setGenre: setUpcomingGenre,
    setHideAdded: setUpcomingHideAdded,
    toggleAwaitedReleases,
    resetFilters: resetUpcomingFilters,
    refresh: refreshUpcoming,
    addToWishlist: addUpcomingToWishlist,
    addToWishlistFromModal: upcomingKey => addUpcomingToWishlist(upcomingKey, true),
    openDetail: openUpcomingDetail,
  };
}
