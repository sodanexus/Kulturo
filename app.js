// ============================================================
// app.js — Kulturo · Logique principale
// ============================================================

import { initSupabase, Auth, Media, Profiles, Journal, Activity } from "./supabase.js";
import { searchMedia, apiAvailability, TMDb, IGDB, GoogleBooks, TMDbDetails, IGDBDetails, OpenLibraryDetails } from "./api.js";
import {
  entryActivityMonth,
  entryActivityYear,
  eventsForPeriod,
  isCompletionEvent,
  isProfileTopEvent,
  journalEventPresentation,
  latestEventMonth,
  localISODate,
  normalizeTitle,
  normalizedSubtype,
  repeatInfo,
  repeatProgressLabel,
  statusTransitionChanges,
  uniqueEntriesForEvents,
  yearMonthOf,
} from "./domain.js";
import {
  ADD_PRIMARY_STATUSES,
  ADD_SECONDARY_STATUSES,
  createAddDraft,
  isSecondaryAddStatus,
  selectAddResult,
  selectManualAdd,
  setAddDraftStatus,
} from "./features/add-flow.js";
import {
  entriesForMetadata,
  metadataDefinition,
  metadataExternalLink,
  splitMetadataValues,
} from "./features/media-metadata.js";
import {
  buildLibraryAffinity,
  exploredGenres,
  journalMonthSummary,
  recommendationForUpcoming,
  repeatCountForPeriod,
} from "./features/insights.js";
import { elementFromHTML, patchKeyedSurface, reconcileKeyedChildren } from "./features/dom-updates.js";
import { cardSkeletons, emptyState, errorState, loadingState } from "./features/ui-states.js";
import { clearApiCache } from "./features/request-client.js";
import { applyCoverAccent, coverAccentForUrl } from "./features/cover-accent.js";

// En mode installé, WebKit peut initialiser la hauteur dynamique sans la zone
// du Home Indicator. La classe permet d'appliquer un correctif ciblé aux PWA
// sans modifier le comportement de Safari classique ou du desktop.
const IS_STANDALONE_DISPLAY = Boolean(
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  window.navigator.standalone === true
);
document.documentElement.classList.toggle("is-standalone", IS_STANDALONE_DISPLAY);

const LIBRARY_DENSITY_KEY = "kulturo-library-density";

function readLibraryDensity() {
  try {
    return localStorage.getItem(LIBRARY_DENSITY_KEY) === "compact" ? "compact" : "standard";
  } catch {
    return "standard";
  }
}

function applyLibraryDensity(value = readLibraryDensity()) {
  const density = value === "compact" ? "compact" : "standard";
  document.documentElement.dataset.libraryDensity = density;
  return density;
}
applyLibraryDensity();

let _updateBannerDismissed = false;
window.addEventListener("kulturo:update-ready", () => {
  _updateBannerDismissed = false;
  syncUpdateBanner();
});

// ── État global ──────────────────────────────────────────────
const State = {
  user:       null,
  username:   null,
  entries:    [],
  events:     [],
  journalAvailable: false,
  journalError: null,
  journalDirty: true,
  filters: {
    type:     "all",
    subtype:  "all",
    status:   "all",
    favorite: false,
    search:   "",
    sort:     "created_at",
    year:     "all",
    month:    "all",
    rating:   "all",
  },
  editingId:  null,
  scrollPos:  {},          // #2 — mémorise la position de scroll par page
};

const ENTRY_CACHE_PREFIX = "kulturo-entries-v1:";
const UI_SNAPSHOT_KEY = "kulturo-ui-snapshot-v1";

function persistUiSnapshot() {
  if (!State.user) return;
  const main = document.getElementById("main");
  let savedPage = "library";
  try { savedPage = localStorage.getItem("kulturo-nav") || savedPage; } catch {}
  const page = document.documentElement.dataset.page || savedPage;
  if (main && page) State.scrollPos[page] = main.scrollTop;
  try {
    sessionStorage.setItem(UI_SNAPSHOT_KEY, JSON.stringify({
      savedAt: Date.now(),
      page,
      scrollPos: State.scrollPos,
      filters: State.filters,
    }));
  } catch {}
}

function restoreUiSnapshot() {
  try {
    const snapshot = JSON.parse(sessionStorage.getItem(UI_SNAPSHOT_KEY) || "null");
    if (!snapshot || Date.now() - Number(snapshot.savedAt || 0) > 24 * 60 * 60_000) return null;
    const allowedPages = new Set(["library", "dashboard", "upcoming", "journal"]);
    if (allowedPages.has(snapshot.page)) {
      const safeScroll = Object.fromEntries(Object.entries(snapshot.scrollPos || {})
        .filter(([key, value]) => allowedPages.has(key) && Number.isFinite(Number(value)))
        .map(([key, value]) => [key, Math.max(0, Number(value))]));
      State.scrollPos = { ...State.scrollPos, ...safeScroll };
    }
    const filters = snapshot.filters;
    if (filters && typeof filters === "object") {
      const allowedTypes = new Set(["all", "movie", "game", "book"]);
      const allowedSubtypes = new Set(["all", "movie", "tv"]);
      const allowedStatuses = new Set(["all", "wishlist", "playing", "finished", "paused", "dropped"]);
      const allowedSorts = new Set(["created_at", "date_finished", "rating_desc", "rating_asc", "title"]);
      State.filters.type = allowedTypes.has(filters.type) ? filters.type : "all";
      State.filters.subtype = allowedSubtypes.has(filters.subtype) ? filters.subtype : "all";
      State.filters.status = allowedStatuses.has(filters.status) ? filters.status : "all";
      State.filters.favorite = Boolean(filters.favorite);
      State.filters.search = typeof filters.search === "string" ? filters.search.slice(0, 120) : "";
      State.filters.sort = allowedSorts.has(filters.sort) ? filters.sort : "created_at";
      State.filters.year = filters.year === "all" || Number.isFinite(Number(filters.year)) ? filters.year : "all";
      State.filters.month = typeof filters.month === "string" ? filters.month : "all";
      State.filters.rating = filters.rating === "all" || Number.isFinite(Number(filters.rating)) ? filters.rating : "all";
    }
    return snapshot;
  } catch {
    return null;
  }
}

function clearUiSnapshot() {
  try { sessionStorage.removeItem(UI_SNAPSHOT_KEY); } catch {}
}

function entryCacheKey() {
  return State.user?.id ? `${ENTRY_CACHE_PREFIX}${State.user.id}` : null;
}

// Le cache local est uniquement un instantané de secours hors ligne.
// Supabase reste toujours la source de vérité et n'est jamais alimenté depuis ce cache.
function cacheEntriesLocally() {
  const key = entryCacheKey();
  if (!key) return;
  try {
    const cleanEntries = State.entries.map(entry => Object.fromEntries(
      Object.entries(entry).filter(([field]) => !field.startsWith("_"))
    ));
    localStorage.setItem(key, JSON.stringify(cleanEntries));
  } catch (error) {
    console.warn("[Cache] Sauvegarde locale impossible :", error);
  }
}

function readCachedEntries() {
  const key = entryCacheKey();
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function primeEntriesFromCache() {
  const cached = readCachedEntries();
  if (!Array.isArray(cached)) return false;
  State.entries = cached;
  return true;
}

// ── Labels ───────────────────────────────────────────────────
const TYPE_LABELS  = { game:"Jeu", movie:"Film", book:"Livre" };
const TYPE_ICONS   = { game:"🎮", movie:"🎬", book:"📚" };

// Retourne "Série" si c'est une série TMDb, sinon le label par défaut
function getTypeLabel(e) {
  if (e.media_type === "movie" && e.subtype === "tv") return "Série";
  return TYPE_LABELS[e.media_type] || e.media_type;
}
const STATUS_LABELS= { wishlist:"Wishlist", playing:"En cours", finished:"Terminé", paused:"En pause", dropped:"Abandonné" };

function safeMediaUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function bindCoverAccent(element, coverUrl) {
  const cleanUrl = safeMediaUrl(coverUrl);
  if (!element) return;
  if (!cleanUrl) {
    delete element.dataset.coverAccentUrl;
    delete element.dataset.coverAccentTheme;
    delete element.dataset.coverAccent;
    element.style.removeProperty("--accent");
    element.style.removeProperty("--accent-2");
    element.style.removeProperty("--accent-glow");
    return;
  }
  element.dataset.coverAccentUrl = cleanUrl;
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  element.dataset.coverAccentTheme = theme;
  element.style.removeProperty("--accent");
  element.style.removeProperty("--accent-2");
  element.style.removeProperty("--accent-glow");
  element.dataset.coverAccent = "pending";
  coverAccentForUrl(cleanUrl, theme).then(accent => {
    if (!accent || !element.isConnected || element.dataset.coverAccentUrl !== cleanUrl || element.dataset.coverAccentTheme !== theme) return;
    applyCoverAccent(element, accent);
    if (element.matches(".detail-modal")) syncSystemBar(_currentPage, null, accent.system);
  }).catch(() => {});
}

function refreshOpenCoverAccent() {
  document.querySelectorAll("[data-cover-accent-url]").forEach(element => {
    bindCoverAccent(element, element.dataset.coverAccentUrl);
  });
}

function hydrateFadeImages(root = document) {
  root.querySelectorAll?.("img[data-fade-image]").forEach(image => {
    if (image.complete && image.naturalWidth > 0) image.classList.add("is-loaded");
  });
}

function findMatchingEntry(candidate, excludeId = null) {
  const candidateType = candidate.media_type || "movie";
  const candidateSubtype = normalizedSubtype({ ...candidate, media_type: candidateType });
  const title = normalizeTitle(candidate.title);

  return State.entries.find(entry => {
    if (entry.id === excludeId || entry.media_type !== candidateType) return false;
    const sameSubtype = normalizedSubtype(entry) === candidateSubtype;
    const sameExternalId = candidate.external_id && entry.external_id &&
      candidate.source_api === entry.source_api &&
      String(candidate.external_id) === String(entry.external_id) &&
      sameSubtype;
    if (sameExternalId) return true;

    const subtypeCompatible = sameSubtype || !entry.subtype || !candidate.subtype;
    return Boolean(title && subtypeCompatible && normalizeTitle(entry.title) === title);
  }) || null;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (typeof CONFIG === "undefined") {
    console.error("CONFIG non défini — vérifiez que config.js est chargé.");
    document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;height:100dvh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)"><b>Erreur : config.js introuvable</b><p style="font-size:.85rem;color:#a0a0b0">Vérifiez que config.js est présent dans votre dépôt GitHub.</p></div>';
    return;
  }
  try {
    if (!initSupabase()) {
      document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;height:100dvh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem;text-align:center;padding:max(2rem,env(safe-area-inset-top,0px)) max(2rem,env(safe-area-inset-right,0px)) max(2rem,env(safe-area-inset-bottom,0px)) max(2rem,env(safe-area-inset-left,0px))"><b>Configuration Supabase manquante</b><p style="font-size:.85rem;color:#a0a0b0">Renseignez les valeurs publiques Supabase dans config.js.</p></div>';
      return;
    }
    applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);

    const sessionUser = await Auth.getSessionUser().catch(() => null);
    const existingUser = sessionUser || await Auth.getUser().catch(() => null);
    if (existingUser) {
      State.user = existingUser;
      State.username = null;
      // Une restauration de page reste immédiatement utile même si le
      // navigateur a suspendu l'onglet et si Supabase met quelques instants à
      // répondre. Le réseau remplace ensuite cet instantané dès qu'il arrive.
      primeEntriesFromCache();
      renderApp();
      await loadEntries();
      restoreNavigation();
    } else {
      renderAuthPage();
    }
    Auth.onAuthChange(async (event, user) => {
      State.user = user;
      if (event === "SIGNED_IN" && user) {
        State.username = null;
        primeEntriesFromCache();
        renderApp();
        await loadEntries();
        restoreNavigation();
      } else if (event === "SIGNED_OUT") {
        clearUiSnapshot();
        State.entries = [];
        State.events = [];
        _communityEntries = [];
        _communityLoaded = false;
        State.journalAvailable = false;
        State.journalError = null;
        State.journalDirty = true;
        State.username = null;
        renderAuthPage();
      }
    });
    bindGlobalEvents();
  } catch(err) {
    console.error("Erreur init:", err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Les modules différés peuvent s'exécuter avec un document déjà
  // `interactive`, avant que les liaisons déclarées plus bas aient été
  // initialisées. Le microtour laisse l'évaluation du module se terminer.
  queueMicrotask(init);
}

// ── Thème et barre système ────────────────────────────────────
let _systemPage = "library";
let _systemMediaType = null;

function syncSystemBar(page = _systemPage, mediaType = _systemMediaType, customColor = null) {
  _systemPage = page || "library";
  _systemMediaType = mediaType || null;
  const light = document.documentElement.getAttribute("data-theme") === "light";
  const pageColors = light
    ? { library: "#f3f1ec", upcoming: "#f0f1f5", journal: "#eff2f1", dashboard: "#f3efe7" }
    : { library: "#0c0d11", upcoming: "#0e1017", journal: "#0c1011", dashboard: "#11100d" };
  const mediaColors = light
    ? { movie: "#f4e9ec", game: "#e9eef8", book: "#e9f3ee" }
    : { movie: "#171014", game: "#0e131d", book: "#0d1713" };
  const color = customColor || (mediaType ? (mediaColors[mediaType] || pageColors[page]) : (pageColors[page] || pageColors.library));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
  document.documentElement.style.setProperty("--system-bar-color", color);
}

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("kulturo-theme", t);
  syncSystemBar();
  refreshOpenCoverAccent();
  // btn-theme removed
}

// ── Historique de navigation ──────────────────────────────────
let _historyReady = false;
let _handlingPopState = false;

function appHistoryState(page, layer = null, payload = {}) {
  return { kulturo: true, page: page || "library", layer, ...payload };
}

function syncPageHistory(page, mode = "push") {
  if (_handlingPopState || mode === "none") return;
  const state = appHistoryState(page);
  if (mode === "replace" || !_historyReady || !history.state?.kulturo) {
    history.replaceState(state, "");
    return;
  }
  if (history.state?.page === page && !history.state?.layer) return;
  history.pushState(state, "");
}

function pushHistoryLayer(layer, payload = {}) {
  if (_handlingPopState || !layer) return;
  if (history.state?.kulturo && history.state.layer === layer) {
    history.replaceState(appHistoryState(_currentPage, layer, payload), "");
    return;
  }
  history.pushState(appHistoryState(_currentPage, layer, payload), "");
}

function historyOwnsLayer(layer) {
  return !_handlingPopState && history.state?.kulturo && history.state.layer === layer;
}

function restoreOpenLayerHistory() {
  let layer = null;
  if (document.getElementById("metadata-overlay")) layer = "metadata";
  else if (document.getElementById("filter-modal-overlay")) layer = "filters";
  else if (document.getElementById("modal-overlay")) layer = "modal";
  history.pushState(appHistoryState(_currentPage, layer), "");
}

function restoreNavigation() {
  const snapshot = restoreUiSnapshot();
  let saved = "library";
  try { saved = localStorage.getItem("kulturo-nav") || saved; } catch {}
  saved = snapshot?.page || saved;
  const allowed = new Set(["library", "dashboard", "upcoming", "journal"]);
  const normalized = saved === "activity" ? "journal" : saved === "discover" ? "upcoming" : saved;
  const target = allowed.has(normalized) ? normalized : "library";
  const search = document.getElementById("global-search");
  if (search) search.value = State.filters.search || "";
  navTo(target, { history: "replace", preserveFilters: true, preserveSearch: true });
  _historyReady = true;
}

// ── Auth UI ───────────────────────────────────────────────────
function renderAuthPage() {
  const app = document.getElementById("app");
  document.body.classList.remove("app-shell-active");
  app.style.cssText = "display:block";
  app.innerHTML = `
    <div id="page-auth">
      <div class="auth-card">
        <div class="logo">Kulturo</div>
        <p class="tagline">Votre journal culturel personnel</p>
        <h1 class="auth-title">Connexion</h1>
        <form class="auth-form" id="auth-form" onsubmit="event.preventDefault(); UI.handleAuth()">
          <div class="form-group">
            <label for="auth-email">Email</label>
            <input type="email" id="auth-email" placeholder="vous@exemple.com" autocomplete="email" required />
          </div>
          <div class="form-group">
            <label for="auth-password">Mot de passe</label>
            <input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password" minlength="6" required />
          </div>
          <button type="submit" class="btn btn-primary" id="auth-submit" style="width:100%">Se connecter</button>
        </form>
      </div>
    </div>
    <div id="toast-container"></div>`;
}

// ── App shell ─────────────────────────────────────────────────
function renderApp() {
  const app = document.getElementById("app");
  document.body.classList.add("app-shell-active");
  app.style.cssText = "";
  app.innerHTML = `
    <!-- Topbar -->
    <header id="topbar">
      <div class="topbar-logo">Kulturo<span class="topbar-tagline">Suivez votre culture</span></div>
      <div class="topbar-search-wrap">
        <span class="search-icon">${iconSearch()}</span>
        <input id="global-search" type="search" placeholder="Rechercher dans ma bibliothèque…" aria-label="Rechercher dans ma bibliothèque" autocomplete="off" />
      </div>
      <div id="loading-bar"><div id="loading-bar-fill"></div></div>
      <div class="topbar-right">
        <button class="topbar-filter-btn" id="btn-filter-toggle" onclick="UI.toggleFilterDrawer()" aria-label="Ouvrir les filtres de la bibliothèque">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filtres
        </button>
      </div>
    </header>

    <!-- Sidebar -->
    <nav id="sidebar">
      <div class="nav-indicator" id="nav-indicator" style="opacity:0;top:0"></div>
      <div class="nav-items-group">
        <button type="button" class="nav-item active" data-nav="library" data-tooltip="Bibliothèque" aria-label="Bibliothèque" aria-current="page" onclick="UI.navTo('library')">
          <span class="nav-icon">${iconGrid()}</span>
          <span class="nav-label">Bibliothèque</span>
        </button>
        <button type="button" class="nav-item" data-nav="upcoming" data-tooltip="Prochaines sorties" aria-label="Prochaines sorties" onclick="UI.navTo('upcoming')">
          <span class="nav-icon">${iconCalendar()}</span>
          <span class="nav-label">Sorties</span>
        </button>
        <button type="button" class="nav-item" data-nav="journal" data-tooltip="Journal" aria-label="Journal" onclick="UI.navTo('journal')">
          <span class="nav-icon">${iconJournal()}</span>
          <span class="nav-label">Journal</span>
        </button>
        <button type="button" class="nav-item" data-nav="dashboard" data-tooltip="Mon profil" aria-label="Mon profil" onclick="UI.navTo('dashboard')">
          <span class="nav-icon">${iconChart()}</span>
          <span class="nav-label">Profil</span>
        </button>
      </div>
      <button type="button" class="sidebar-add-btn" data-tooltip="Ajouter" aria-label="Ajouter un média" onclick="UI.openAddModal()">
        ${iconPlus()}
      </button>
    </nav>

    <!-- Main -->
    <main id="main">
      <!-- Page Bibliothèque -->
      <section id="page-library" class="page active">
        <header class="page-heading">
          <div>
            <span class="page-kicker">Votre collection</span>
            <h1>Bibliothèque</h1>
            <p id="library-summary">Tous vos films, séries, jeux et livres au même endroit.</p>
          </div>
        </header>
        <div id="active-filter-summary" class="active-filter-summary" aria-label="Filtres actifs" hidden></div>
        <section id="continue-section" class="continue-section" aria-labelledby="continue-title" hidden></section>
        <div class="section-heading library-list-heading" aria-live="polite">
          <span id="library-result-count" class="section-count"></span>
        </div>
        <div id="cards-grid"></div>

      </section>

      <!-- Page Profil / Stats -->
      <section id="page-dashboard" class="page">
        <header class="page-heading">
          <div>
            <span class="page-kicker">Votre année culturelle</span>
            <h1>Profil</h1>
            <p>Vos habitudes, vos favoris et vos meilleurs souvenirs.</p>
          </div>
        </header>
        <div id="dashboard-content"></div>
      </section>

      <!-- Page Prochaines sorties -->
      <section id="page-upcoming" class="page">
        <header class="page-heading">
          <div>
            <span class="page-kicker">À surveiller</span>
            <h1>Sorties</h1>
            <p>Films, séries, jeux vidéo et livres attendus en France dans les six prochains mois.</p>
          </div>
        </header>
        <div class="upcoming-toolbar" aria-label="Filtres des prochaines sorties">
          <div class="upcoming-toolbar-main">
            <div class="upcoming-type-switch" role="group" aria-label="Type de sortie">
              <button class="upcoming-type-btn active" id="upcoming-filter-all" onclick="UI.setUpcomingType('all')" aria-pressed="true">Tout</button>
              <button class="upcoming-type-btn" id="upcoming-filter-movie" onclick="UI.setUpcomingType('movie')" aria-pressed="false">Films</button>
              <button class="upcoming-type-btn" id="upcoming-filter-tv" onclick="UI.setUpcomingType('tv')" aria-pressed="false">Séries</button>
              <button class="upcoming-type-btn" id="upcoming-filter-game" onclick="UI.setUpcomingType('game')" aria-pressed="false">Jeux</button>
              <button class="upcoming-type-btn" id="upcoming-filter-book" onclick="UI.setUpcomingType('book')" aria-pressed="false">Livres</button>
            </div>
            <button class="btn btn-ghost btn-sm upcoming-refresh-btn" id="upcoming-refresh-btn" onclick="UI.refreshUpcoming()" title="Actualiser les sorties" aria-label="Actualiser les sorties">
              <span class="upcoming-refresh-icon" aria-hidden="true">↻</span>
              <span class="upcoming-refresh-label">Actualiser</span>
            </button>
          </div>
          <label class="upcoming-genre-filter" id="upcoming-genre-wrap" for="upcoming-genre-select">
            <span>Genre</span>
            <select id="upcoming-genre-select" onchange="UI.setUpcomingGenre(this.value)" disabled>
              <option value="all">Tous les genres</option>
            </select>
          </label>
          <div class="upcoming-toolbar-meta">
            <label class="compact-toggle">
              <input type="checkbox" id="upcoming-hide-added" onchange="UI.setUpcomingHideAdded(this.checked)" />
              <span class="compact-toggle-track" aria-hidden="true"><span></span></span>
              <span>Masquer les titres ajoutés</span>
            </label>
            <span id="upcoming-result-count" class="section-count"></span>
          </div>
        </div>
        <div id="upcoming-grid" class="upcoming-months"></div>
      </section>

      <!-- Journal personnel + activité communautaire -->
      <section id="page-journal" class="page">
        <header class="page-heading">
          <div>
            <span class="page-kicker">Votre parcours</span>
            <h1>Journal</h1>
            <p>Retrouvez votre parcours culturel et les derniers ajouts de la communauté.</p>
          </div>
        </header>

        <div class="journal-sticky-controls">
          <div class="journal-mode-switch" role="tablist" aria-label="Type de journal">
            <button type="button" class="journal-mode-btn active" id="journal-mode-personal" role="tab" aria-controls="journal-personal-panel" aria-selected="true" onclick="UI.setJournalMode('personal')">Mon journal</button>
            <button type="button" class="journal-mode-btn" id="journal-mode-community" role="tab" aria-controls="journal-community-panel" aria-selected="false" onclick="UI.setJournalMode('community')">Communauté</button>
          </div>
          <div class="journal-time-nav" id="journal-time-nav" aria-label="Navigation dans le temps">
            <button type="button" class="journal-time-step" id="journal-time-prev" onclick="UI.stepJournalMonth(1)" aria-label="Mois plus ancien">←</button>
            <label class="journal-month-select-wrap">
              <span class="sr-only">Aller à un mois</span>
              <select id="journal-month-select" onchange="UI.jumpJournalMonth(this.value)">
                <option value="all">Tout l’historique</option>
              </select>
            </label>
            <button type="button" class="journal-time-step" id="journal-time-next" onclick="UI.stepJournalMonth(-1)" aria-label="Mois plus récent">→</button>
          </div>
        </div>

        <section class="journal-panel" id="journal-personal-panel" role="tabpanel" aria-labelledby="journal-mode-personal">
          <div id="journal-feed"></div>
        </section>

        <section class="journal-panel" id="journal-community-panel" role="tabpanel" aria-labelledby="journal-mode-community" hidden>
          <div id="community-feed"></div>
        </section>
      </section>
    </main>

    <!-- Toast container -->
    <div id="toast-container"></div>

    <!-- Modal container -->
    <div id="modal-root"></div>

    <!-- Nouvelle version PWA -->
    <aside id="update-banner" class="update-banner" role="status" aria-live="polite" hidden>
      <div class="update-banner-icon" aria-hidden="true">↻</div>
      <div class="update-banner-copy">
        <strong>Nouvelle version disponible</strong>
        <span>Quelques secondes suffisent pour l’installer.</span>
      </div>
      <button class="btn btn-primary btn-sm" id="apply-update-btn" onclick="UI.applyAppUpdate()">Mettre à jour</button>
      <button class="update-banner-close" onclick="UI.dismissUpdateBanner()" aria-label="Masquer">${iconX()}</button>
    </aside>

    <button id="back-to-top" class="back-to-top" onclick="UI.scrollToTop()" aria-label="Revenir en haut" title="Revenir en haut" hidden>
      <span aria-hidden="true">↑</span>
    </button>

    <!-- Bottom nav (mobile) -->
    <nav id="bottom-nav">
      <button type="button" class="bottom-nav-item active" data-nav="library" onclick="UI.navTo('library')" aria-label="Bibliothèque" aria-current="page">
        ${iconGrid()}
        <span>Bibliothèque</span>
      </button>
      <button type="button" class="bottom-nav-item" data-nav="upcoming" onclick="UI.navTo('upcoming')" aria-label="Sorties">
        ${iconCalendar()}
        <span>Sorties</span>
      </button>
      <button type="button" class="bottom-nav-item bottom-nav-add" onclick="UI.openAddModal()" aria-label="Ajouter un média">
        ${iconPlus()}
        <span class="sr-only">Ajouter</span>
      </button>
      <button type="button" class="bottom-nav-item" data-nav="journal" onclick="UI.navTo('journal')" aria-label="Journal">
        ${iconJournal()}
        <span>Journal</span>
      </button>
      <button type="button" class="bottom-nav-item" data-nav="dashboard" onclick="UI.navTo('dashboard')" aria-label="Mon profil">
        ${iconUser()}
        <span>Profil</span>
      </button>
    </nav>
  `;

  applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);
  // Restaure le tri mémorisé
  const savedSort = localStorage.getItem("kulturo-sort");
  const allowedSorts = new Set(["created_at", "date_finished", "rating_desc", "rating_asc", "title"]);
  State.filters.sort = allowedSorts.has(savedSort) ? savedSort : "created_at";
  buildFilterBar();
  renderCards();
  updateBadges();
  syncUpdateBanner();
  document.getElementById("main")?.addEventListener("scroll", syncBackToTop, { passive: true });
  syncBackToTop();
}

// ── Chargement depuis Supabase ───────────────────────────────
async function refreshJournalEvents({ silent = false } = {}) {
  try {
    State.events = await Journal.getAll();
    State.journalAvailable = true;
    State.journalError = null;
    State.journalDirty = false;
    return State.events;
  } catch (error) {
    State.events = [];
    State.journalAvailable = false;
    State.journalError = error;
    State.journalDirty = false;
    if (!silent) toast("Journal indisponible : vérifiez media_events dans Supabase.", "error");
    return [];
  }
}

function markJournalDirty() {
  State.journalDirty = true;
  _communityLoaded = false;
  setTimeout(() => {
    if (_currentPage === "journal") renderJournal();
    else if (_currentPage === "dashboard") renderDashboard();
  }, 0);
}

async function loadEntries() {
  // Show skeletons while loading
  const grid = document.getElementById("cards-grid");
  if (grid && !State.entries.length) {
    grid.innerHTML = cardSkeletons(8);
  }
  try {
    // Charge tout, le filtrage se fait localement dans filterEntries()
    State.entries = await Media.getAll({});
    cacheEntriesLocally();
    renderCards();
    updateBadges();
  } catch (e) {
    const cached = readCachedEntries();
    if (cached) {
      State.entries = cached;
      renderCards();
      updateBadges();
      toast("Mode hors ligne : dernière bibliothèque enregistrée affichée.", "info");
    } else {
      if (grid) grid.innerHTML = errorState({ title: "Bibliothèque indisponible", message: "Impossible de charger vos médias pour le moment." });
      toast("Erreur de chargement : " + e.message, "error");
    }
  }
  await refreshJournalEvents({ silent: true });
}

// ── Navigation unifiée ───────────────────────────────────────
function navTo(key, options = {}) {
  // L'ancien alias reste accepté, mais toute la navigation utilise une seule clé.
  if (key === "profile") key = "dashboard";

  // #2 — sauvegarde le scroll de la page courante
  const main = document.getElementById("main");
  if (main) State.scrollPos[_currentPage] = main.scrollTop;

  // Les raccourcis de collection appartiennent tous à la Bibliothèque.
  const primaryKey = ["dashboard", "upcoming", "journal"].includes(key) ? key : "library";
  const isPrimaryPageRequest = ["library", "dashboard", "upcoming", "journal"].includes(key);
  if (isPrimaryPageRequest) {
    const historyMode = options.history || (_historyReady && primaryKey !== _currentPage ? "push" : "replace");
    syncPageHistory(primaryKey, historyMode);
  }

  // Synchronise systématiquement les deux navigations. Cela rend aussi un clic
  // répété utile si une page a été interrompue pendant son chargement.
  document.querySelectorAll(".nav-item[data-nav], .bottom-nav-item[data-nav]").forEach(b => {
    const isActive = b.dataset.nav === primaryKey;
    b.classList.toggle("active", isActive);
    if (isActive) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const btn = document.querySelector(`.nav-item[data-nav="${primaryKey}"]`);
  if (btn) {
    const indicator = document.getElementById("nav-indicator");
    if (indicator) {
      indicator.style.top  = btn.offsetTop + "px";
      indicator.style.opacity = "1";
    }
  }

  // Sauvegarde la nav active
  localStorage.setItem("kulturo-nav", primaryKey);

  if (key === "dashboard") {
    showPage("dashboard");
  } else if (key === "upcoming") {
    showPage("upcoming");
  } else if (key === "journal") {
    showPage("journal");
  } else if (key.startsWith("type-")) {
    State.filters.type     = key.replace("type-", "");
    State.filters.subtype  = "all";
    State.filters.status   = "all";
    State.filters.favorite = false;
    State.filters.year     = "all";
    State.filters.month    = "all";
    State.filters.rating   = "all";
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs(State.filters.type);
  } else if (key.startsWith("status-")) {
    State.filters.status   = key.replace("status-", "");
    State.filters.type     = "all";
    State.filters.subtype  = "all";
    State.filters.favorite = false;
    State.filters.year     = "all";
    State.filters.month    = "all";
    State.filters.rating   = "all";
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs("all");
  } else if (key === "fav") {
    State.filters.favorite = true;
    State.filters.type     = "all";
    State.filters.subtype  = "all";
    State.filters.status   = "all";
    State.filters.year     = "all";
    State.filters.month    = "all";
    State.filters.rating   = "all";
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs("all", true);
  } else {
    if (options.preserveFilters) {
      if (_currentPage !== "library") showPage("library");
      renderCards();
      updateCategoryTabs(State.filters.type, State.filters.favorite);
      return;
    }
    // "library" → reset complet
    State.filters.type     = "all";
    State.filters.subtype  = "all";
    State.filters.status   = "all";
    State.filters.favorite = false;
    State.filters.year     = "all";
    State.filters.month    = "all";
    State.filters.rating   = "all";
    if (!options.preserveSearch) {
      State.filters.search = "";
      const search = document.getElementById("global-search");
      if (search) search.value = "";
    }
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs("all");
  }
}

// ── Filtre type depuis les category-tabs (conserve le status) ─
function setTypeFilter(type) {
  State.filters.type     = type;
  State.filters.subtype  = "all";
  syncFilterChips();
  renderCards({ resetScroll: true });
  updateCategoryTabs(type);
  _updateFilterResultCount();
}

let _currentPage = "library";
function replayMotion(element, className) {
  if (!element || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  element.classList.remove(className);
  requestAnimationFrame(() => {
    if (element.isConnected) element.classList.add(className);
  });
}

function showPage(name) {
  const newPage = document.getElementById(`page-${name}`);
  if (!newPage) return;

  // Une animation unique évite que chaque onglet ait un mouvement différent.
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
    p.style.animation = "";
    p.style.display = "";
  });
  newPage.classList.add("active");
  _currentPage = name;
  document.documentElement.dataset.page = name;
  syncSystemBar(name, null);
  const filterBtn = document.getElementById("btn-filter-toggle");
  if (filterBtn) {
    const inactive = name !== "library";
    filterBtn.classList.toggle("is-inactive", inactive);
    filterBtn.setAttribute("aria-hidden", String(inactive));
    filterBtn.tabIndex = inactive ? -1 : 0;
  }

  // #1 — restaure la position de scroll
  const main = document.getElementById("main");
  if (main) {
    const saved = State.scrollPos[name] || 0;
    requestAnimationFrame(() => { main.scrollTop = saved; });
  }

  if (name === "dashboard") renderDashboard();
  if (name === "upcoming")  renderUpcoming();
  if (name === "journal")   renderJournal();
  requestAnimationFrame(syncBackToTop);
}

function syncBackToTop() {
  const main = document.getElementById("main");
  const button = document.getElementById("back-to-top");
  if (!main || !button) return;
  button.hidden = main.scrollTop < 560;
}

function scrollToTop() {
  const main = document.getElementById("main");
  if (!main) return;
  main.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Filter bar ────────────────────────────────────────────────
function buildFilterBar() {
  // Chips statut dans le drawer
  const chipsEl = document.getElementById("filter-status-chips");
  if (chipsEl) {
    const statuses = ["all","wishlist","playing","finished","paused","dropped"];
    chipsEl.innerHTML = statuses.map(s => {
      const label = s === "all" ? "Tous" : STATUS_LABELS[s];
      return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}" data-value="${s}"
                      onclick="UI.setStatusChip('${s}')">${label}</button>`;
    }).join("");
  }
  // Met à jour le label actif sur le bouton toggle
  _updateFilterToggleLabel();
}

function _countActiveFilters() {
  let n = 0;
  if (State.filters.subtype !== "all" || State.filters.type !== "all") n++;
  if (State.filters.favorite) n++;
  if (State.filters.status !== "all") n++;
  if (State.filters.sort !== "created_at") n++;
  if (State.filters.year !== "all" || State.filters.month !== "all") n++;
  if (State.filters.rating !== "all") n++;
  return n;
}

function _updateFilterModalTypeChips() {
  const chips = document.querySelectorAll("#fm-type-chips .filter-chip");
  const types = ["all","game","movie","book"];
  chips.forEach((c, i) => c.classList.toggle("active", types[i] === State.filters.type));
  _updateFilterToggleLabel();
  _updateFilterModalHeader();
  _updateResetBtn();
}

function _updateFilterToggleLabel() {
  const btn = document.getElementById("btn-filter-toggle");
  if (!btn) return;
  const n = _countActiveFilters();
  btn.classList.toggle("has-filter", n > 0);
  // Badge count
  let badge = btn.querySelector(".filter-fab-badge");
  if (n > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "filter-fab-badge";
      btn.appendChild(badge);
    }
    badge.textContent = n;
  } else {
    if (badge) badge.remove();
  }
}

function _updateFilterModalHeader() {
  const title = document.getElementById("fm-title");
  if (!title) return;
  const n = _countActiveFilters();
  title.innerHTML = n > 0 ? `Filtres <span class="filter-active-count">${n}</span>` : "Filtres";
}

function _updateResetBtn() {
  const btn = document.getElementById("fm-reset-btn");
  if (btn) btn.style.visibility = _countActiveFilters() > 0 ? "visible" : "hidden";
}

function _updateFilterResultCount() {
  const btn = document.getElementById("fm-apply-btn");
  if (!btn) return;
  const count = filterEntries(State.entries || []).length;
  btn.textContent = `Voir ${count} résultat${count > 1 ? "s" : ""}`;
}

// ── Accès rapide aux médias en cours ─────────────────────────
const CONTINUE_EXPANDED_KEY = "kulturo-continue-expanded";

function isLibraryViewUnfiltered() {
  const f = State.filters;
  return f.type === "all" && f.subtype === "all" && f.status === "all" && !f.favorite && !f.search && f.year === "all" && f.month === "all" && f.rating === "all";
}

function readContinueExpanded() {
  try {
    const saved = localStorage.getItem(CONTINUE_EXPANDED_KEY);
    if (saved === "true" || saved === "false") return saved === "true";
  } catch {}
  return !window.matchMedia?.("(max-width: 680px)").matches;
}

function continuePreviewHTML(entry) {
  const coverUrl = safeMediaUrl(entry.cover_url);
  return coverUrl
    ? `<span class="continue-preview-cover"><img src="${esc(coverUrl)}" alt="" loading="lazy" data-fade-image class="fade-image" onerror="this.parentElement.textContent='${TYPE_ICONS[entry.media_type] || "🎭"}'"></span>`
    : `<span class="continue-preview-cover">${TYPE_ICONS[entry.media_type] || "🎭"}</span>`;
}

function continueCardHTML(entry) {
  const coverUrl = safeMediaUrl(entry.cover_url);
  const cover = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" data-fade-image class="fade-image" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <span class="continue-cover-placeholder" style="display:none">${TYPE_ICONS[entry.media_type] || "🎭"}</span>`
    : `<span class="continue-cover-placeholder">${TYPE_ICONS[entry.media_type] || "🎭"}</span>`;

  return `
    <button type="button" class="continue-card" data-prefetch-media="${entry.id}" onclick="UI.openEditModal('${entry.id}')" aria-label="Reprendre ${esc(entry.title)}">
      <span class="continue-cover">${cover}<span class="continue-play" aria-hidden="true">${iconPlay()}</span></span>
      <span class="continue-card-copy">
        <strong>${esc(entry.title)}</strong>
        <small>${esc(getTypeLabel(entry))}</small>
      </span>
    </button>`;
}

function renderContinueSection() {
  const section = document.getElementById("continue-section");
  if (!section) return;

  const allItems = State.entries
    .filter(entry => entry.status === "playing")
    .sort((a, b) => new Date(b.date_started || b.created_at || 0) - new Date(a.date_started || a.created_at || 0));
  const items = allItems.slice(0, 8);

  if (!items.length || !isLibraryViewUnfiltered()) {
    section.hidden = true;
    section.innerHTML = "";
    return;
  }

  const expanded = readContinueExpanded();
  const countLabel = `${allItems.length} en cours`;
  section.hidden = false;
  section.classList.toggle("is-expanded", expanded);
  section.innerHTML = `
    <button type="button" class="continue-toggle" onclick="UI.toggleContinueSection()" aria-expanded="${expanded}" aria-controls="continue-content">
      <span class="continue-heading-copy">
        <h2 id="continue-title">À reprendre</h2>
        <span>${esc(countLabel)}</span>
      </span>
      <span class="continue-preview" aria-hidden="true">${items.slice(0, 3).map(continuePreviewHTML).join("")}</span>
      <span class="continue-chevron" aria-hidden="true"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="continue-expand" id="continue-content" aria-hidden="${!expanded}" ${expanded ? "" : "inert"}>
      <div class="continue-expand-inner">
        <div class="continue-expanded-head">
          <span>Reprenez là où vous vous êtes arrêté.</span>
          <button class="section-link" onclick="UI.navTo('status-playing')">Voir tout <span aria-hidden="true">→</span></button>
        </div>
        <div class="continue-track">${items.map(continueCardHTML).join("")}</div>
      </div>
    </div>
  `;
  hydrateFadeImages(section);
}

function toggleContinueSection() {
  const section = document.getElementById("continue-section");
  const toggle = section?.querySelector(".continue-toggle");
  const content = section?.querySelector(".continue-expand");
  if (!section || !toggle || !content) return;
  const expanded = !section.classList.contains("is-expanded");
  section.classList.toggle("is-expanded", expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  content.setAttribute("aria-hidden", String(!expanded));
  content.inert = !expanded;
  try { localStorage.setItem(CONTINUE_EXPANDED_KEY, String(expanded)); } catch {}
}

function updateLibraryHeading(entries) {
  const summary = document.getElementById("library-summary");
  const count = document.getElementById("library-result-count");
  if (summary) {
    const total = State.entries.length;
    summary.textContent = total
      ? `${total} média${total > 1 ? "s" : ""} sauvegardé${total > 1 ? "s" : ""}, toujours à portée de main.`
      : "Tous vos films, séries, jeux et livres au même endroit.";
  }
  if (count) count.textContent = `${entries.length} média${entries.length > 1 ? "s" : ""}`;
}

function renderActiveFilters() {
  const container = document.getElementById("active-filter-summary");
  if (!container) return;

  const typeLabels = { game: "Jeux", movie: "Films / Séries", book: "Livres" };
  const subtypeLabels = { movie: "Films", tv: "Séries" };
  const sortLabels = {
    date_finished: "Date de fin",
    rating_desc: "Meilleures notes",
    rating_asc: "Notes croissantes",
    title: "Titre",
  };
  const filters = [];
  if (State.filters.subtype !== "all") filters.push(["subtype", subtypeLabels[State.filters.subtype] || State.filters.subtype]);
  else if (State.filters.type !== "all") filters.push(["type", typeLabels[State.filters.type] || State.filters.type]);
  if (State.filters.status !== "all") filters.push(["status", STATUS_LABELS[State.filters.status] || State.filters.status]);
  if (State.filters.favorite) filters.push(["favorite", "Coups de cœur"]);
  if (State.filters.sort !== "created_at") filters.push(["sort", sortLabels[State.filters.sort] || State.filters.sort]);
  if (State.filters.rating !== "all") filters.push(["rating", `★ ${State.filters.rating}/10`]);
  if (State.filters.search) filters.push(["search", `“${State.filters.search}”`]);
  if (State.filters.month !== "all") {
    const [year, month] = String(State.filters.month).split("-").map(Number);
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
      .format(new Date(year, Math.max(0, month - 1), 1));
    filters.push(["period", label]);
  } else if (State.filters.year !== "all") {
    filters.push(["period", String(State.filters.year)]);
  }

  container.hidden = filters.length === 0;
  container.innerHTML = filters.length ? `
    <span class="active-filter-label">Filtres actifs</span>
    <div class="active-filter-chips">
      ${filters.map(([key, label]) => `
        <button type="button" class="active-filter-chip" onclick="UI.clearLibraryFilter('${key}')" aria-label="Retirer le filtre ${esc(label)}">
          ${esc(label)} <span aria-hidden="true">×</span>
        </button>`).join("")}
    </div>
    <button type="button" class="active-filter-reset" onclick="UI.clearAllLibraryFilters()">Tout effacer</button>` : "";
}

function clearLibraryFilter(key) {
  if (key === "type" || key === "subtype") {
    State.filters.type = "all";
    State.filters.subtype = "all";
  }
  else if (key === "status") State.filters.status = "all";
  else if (key === "favorite") State.filters.favorite = false;
  else if (key === "sort") {
    State.filters.sort = "created_at";
    localStorage.setItem("kulturo-sort", "created_at");
  } else if (key === "rating") State.filters.rating = "all";
  else if (key === "search") {
    State.filters.search = "";
    const search = document.getElementById("global-search");
    if (search) search.value = "";
  } else if (key === "period" || key === "year" || key === "month") {
    State.filters.year = "all";
    State.filters.month = "all";
  }
  syncFilterChips();
  updateCategoryTabs(State.filters.type, State.filters.favorite);
  renderCards({ resetScroll: true });
  _updateFilterResultCount();
}

function clearAllLibraryFilters() {
  State.filters.type = "all";
  State.filters.subtype = "all";
  State.filters.status = "all";
  State.filters.favorite = false;
  State.filters.search = "";
  State.filters.rating = "all";
  State.filters.sort = "created_at";
  State.filters.year = "all";
  State.filters.month = "all";
  localStorage.setItem("kulturo-sort", "created_at");
  const search = document.getElementById("global-search");
  if (search) search.value = "";
  syncFilterChips();
  updateCategoryTabs("all");
  renderCards({ resetScroll: true });
  _updateFilterResultCount();
}

// ── Rendu grille ──────────────────────────────────────────────
function renderCards(options = {}) {
  const grid = document.getElementById("cards-grid");
  if (!grid) return;

  if (options.resetScroll) {
    const main = document.getElementById("main");
    if (main) main.scrollTop = 0;
    State.scrollPos.library = 0;
  }

  let entries = filterEntries(State.entries);
  renderActiveFilters();
  renderContinueSection();
  updateLibraryHeading(entries);

  if (!entries.length) {
    const f = State.filters;
    let emptyMsg = "Ajoutez votre premier film, jeu ou livre pour commencer.";
    let emptyBtn = `<button class="btn btn-primary" onclick="UI.openAddModal()">${iconPlus()} Ajouter</button>`;
    if (f.search)                    emptyMsg = `Aucun résultat pour "<strong>${esc(f.search)}</strong>".`;
    else if (f.rating !== "all")   emptyMsg = `Aucun média noté <strong>★ ${f.rating}/10</strong>.`;
    else if (f.favorite)             emptyMsg = "Aucun coup de cœur pour l'instant. Marquez vos préférés avec ♥.";
    else if (f.month !== "all")     emptyMsg = "Aucun média ne correspond à ce mois.";
    else if (f.year !== "all")      emptyMsg = `Aucun média ne correspond à l’année <strong>${esc(String(f.year))}</strong>.`;
    else if (f.subtype === "movie") emptyMsg = "Aucun film ne correspond à ces filtres.";
    else if (f.subtype === "tv")    emptyMsg = "Aucune série ne correspond à ces filtres.";
    else if (f.status !== "all")     emptyMsg = `Aucun média avec le statut "<strong>${STATUS_LABELS[f.status]}</strong>".`;
    else if (f.type === "game")      emptyMsg = "Aucun jeu dans votre bibliothèque.";
    else if (f.type === "movie")     emptyMsg = "Aucun film ou série dans votre bibliothèque.";
    else if (f.type === "book")      emptyMsg = "Aucun livre dans votre bibliothèque.";
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎭</div>
        <h3>Rien ici</h3>
        <p>${emptyMsg}</p>
        ${f.search || f.favorite || f.status !== "all" || f.type !== "all" || f.subtype !== "all" || f.year !== "all" || f.month !== "all" || f.rating !== "all"
          ? `<button class="btn btn-secondary" onclick="UI.navTo('library')">Voir tout</button>`
          : emptyBtn}
      </div>`;
    return;
  }

  if ([...grid.children].some(node => !node.classList.contains("media-card"))) grid.replaceChildren();
  reconcileKeyedChildren(grid, entries, {
    key: entry => entry.id,
    create: (entry, index) => elementFromHTML(cardHTML(entry, index)),
    update: (node, entry) => patchMediaCardNode(node, entry),
  });
  hydrateFadeImages(grid);
}

function filterEntries(entries) {
  let res = [...entries];
  const f = State.filters;
  if (f.type    !== "all") res = res.filter(e => e.media_type === f.type);
  if (f.subtype !== "all") res = res.filter(e => e.media_type === "movie" && (e.subtype === "tv" ? "tv" : "movie") === f.subtype);
  if (f.status  !== "all") res = res.filter(e => e.status    === f.status);
  if (f.favorite)          res = res.filter(e => e.is_favorite);
  if (f.year !== "all")   res = res.filter(e => entryActivityYear(e) === Number(f.year));
  if (f.month !== "all")  res = res.filter(e => entryActivityMonth(e) === String(f.month));
  if (f.rating !== "all") res = res.filter(e => Number(e.rating) === Number(f.rating));
  if (f.search) {
    const expected = normalizeTitle(f.search);
    res = res.filter(e => normalizeTitle(e.title).includes(expected));
  }
  // Tri local
  res.sort((a, b) => {
    switch (f.sort) {
      case "title":         return a.title.localeCompare(b.title);
      case "rating_desc":   return (b.rating||0) - (a.rating||0);
      case "rating_asc":    return (a.rating||0) - (b.rating||0);
      case "date_finished": return new Date(b.date_finished||0) - new Date(a.date_finished||0);
      default:              return new Date(b.created_at||0)    - new Date(a.created_at||0);
    }
  });
  return res;
}

// ── Affichage numérique uniforme des notes ───────────────────
function ratingScoreHTML(rating, className = "") {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return `<span class="rating-unrated">Non noté</span>`;
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  const classes = ["rating-score", className, value === 10 ? "is-perfect" : ""].filter(Boolean).join(" ");
  return `<span class="${classes}" aria-label="Note ${display} sur 10">★ ${display}/10</span>`;
}

function cardMetaHTML(rating, is_favorite, repeatCount = 0) {
  const repeats = Math.max(0, Number.parseInt(repeatCount, 10) || 0);
  if (!rating && !is_favorite && !repeats) return "";
  const ratingEl = rating ? ratingScoreHTML(rating, "card-rating") : "";
  const heartEl = is_favorite ? `<span class="card-heart">♥</span>` : "";
  const repeatEl = repeats
    ? `<span class="card-repeat" title="Vu, lu ou terminé ${repeats + 1} fois">${iconRepeat()}<strong>${repeats + 1}×</strong></span>`
    : "";
  return `<div class="card-bottom">${ratingEl}<span class="card-markers">${heartEl}${repeatEl}</span></div>`;
}

function cardHTML(e, i = 0) {
  const coverUrl = safeMediaUrl(e.cover_url);
  const coverHTML = coverUrl
    ? `<img class="card-cover fade-image" data-fade-image src="${esc(coverUrl)}" alt="${esc(e.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="card-cover-placeholder" style="display:none">${TYPE_ICONS[e.media_type]||"🎭"}</div>`
    : `<div class="card-cover-placeholder">${TYPE_ICONS[e.media_type]||"🎭"}</div>`;

  const isPerfect = e.rating === 10;
  const statusClass = { wishlist: "is-wishlist", playing: "is-playing", paused: "is-paused", dropped: "is-dropped" }[e.status] || "";
  const classes = ["media-card",
    e.is_favorite ? "favorite" : "",
    isPerfect      ? "perfect"  : "",
    (e.is_favorite && isPerfect) ? "both" : "",
    statusClass
  ].filter(Boolean).join(" ");

  const statusLabel = {
    wishlist: "♡ Wishlist",
    playing:  "▶ En cours",
    paused:   "⏸ En pause",
    dropped:  "✕ Abandonné",
  }[e.status] || "";

  return `
    <article class="${classes}" data-id="${e.id}" data-key="${e.id}" data-prefetch-media="${e.id}" role="button" tabindex="0" aria-label="Ouvrir ${esc(e.title)}"
      style="animation-delay:${Math.min(i*25,250)}ms" onclick="UI.openEditModal('${e.id}')"
      onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();UI.openEditModal('${e.id}')}">
      ${coverHTML}
      <span class="card-title sr-only">${esc(e.title)}</span>
      ${statusLabel ? `<span class="card-status-label">${statusLabel}</span>` : ""}
      ${cardMetaHTML(e.rating, e.is_favorite, e.repeat_count)}
    </article>`;
}

function patchMediaCardNode(node, entry) {
  const next = elementFromHTML(cardHTML(entry));
  if (!node || !next) return;
  node.className = next.className;
  node.dataset.prefetchMedia = String(entry.id);
  node.setAttribute("aria-label", next.getAttribute("aria-label"));

  const currentTitle = node.querySelector(".card-title");
  if (currentTitle) currentTitle.textContent = entry.title;

  const currentCover = node.querySelector(".card-cover, .card-cover-placeholder");
  const nextCover = next.querySelector(".card-cover, .card-cover-placeholder");
  const coverChanged = currentCover?.tagName !== nextCover?.tagName
    || (currentCover?.tagName === "IMG" && currentCover.getAttribute("src") !== nextCover.getAttribute("src"));
  if (coverChanged && currentCover && nextCover) currentCover.replaceWith(nextCover);

  const currentStatus = node.querySelector(".card-status-label");
  const nextStatus = next.querySelector(".card-status-label");
  if (currentStatus && nextStatus) currentStatus.replaceWith(nextStatus);
  else if (currentStatus && !nextStatus) currentStatus.remove();
  else if (!currentStatus && nextStatus) {
    const bottom = node.querySelector(".card-bottom");
    node.insertBefore(nextStatus, bottom || null);
  }

  const currentBottom = node.querySelector(".card-bottom");
  const nextBottom = next.querySelector(".card-bottom");
  if (currentBottom && nextBottom) currentBottom.replaceWith(nextBottom);
  else if (currentBottom && !nextBottom) currentBottom.remove();
  else if (!currentBottom && nextBottom) node.append(nextBottom);
}

// ── Badges sidebar ────────────────────────────────────────────
function updateBadges() {
  const count = (fn) => State.entries.filter(fn).length;
  const set   = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    const old = el.textContent;
    el.textContent = n;
    if (String(old) !== String(n)) {
      el.classList.remove("bounce");
      requestAnimationFrame(() => el.classList.add("bounce"));
      el.addEventListener("animationend", () => el.classList.remove("bounce"), { once: true });
    }
  };
  set("badge-all",     State.entries.length);
  set("badge-game",    count(e => e.media_type === "game"));
  set("badge-movie",   count(e => e.media_type === "movie"));
  set("badge-book",    count(e => e.media_type === "book"));
  set("badge-playing", count(e => e.status === "playing"));
  set("badge-wishlist",count(e => e.status === "wishlist"));
  set("badge-fav",     count(e => e.is_favorite));
}

// ── Dashboard / Profil ────────────────────────────────────────
const _profileToday = new Date();
let _profileYear = _profileToday.getFullYear();
let _profileMonth = String(_profileToday.getMonth() + 1).padStart(2, "0");
let _profilePeriod = "month";
let _profileMedia = "all";
let _profileMonthAutoResolve = true;
const _profileNumberValues = new Map();
const LAST_BACKUP_KEY = "kulturo-last-backup";
const PROFILE_MEDIA_OPTIONS = [
  ["all", "Tout"],
  ["film", "Films"],
  ["tv", "Séries"],
  ["game", "Jeux"],
  ["book", "Livres"],
];

function profileNumberHTML(key, value, options = {}) {
  const numeric = Number(value) || 0;
  const decimals = Number(options.decimals || 0);
  const display = numeric.toFixed(decimals);
  return `<span class="profile-animated-number" data-profile-number="${esc(key)}" data-profile-value="${numeric}" data-profile-decimals="${decimals}" data-profile-prefix="${esc(options.prefix || "")}" data-profile-suffix="${esc(options.suffix || "")}">${esc(options.prefix || "")}${display}${esc(options.suffix || "")}</span>`;
}

function animateProfileNumbers(root) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  root?.querySelectorAll?.("[data-profile-number]").forEach(element => {
    const key = element.dataset.profileNumber;
    const target = Number(element.dataset.profileValue || 0);
    const decimals = Number(element.dataset.profileDecimals || 0);
    const prefix = element.dataset.profilePrefix || "";
    const suffix = element.dataset.profileSuffix || "";
    const previous = _profileNumberValues.get(key);
    _profileNumberValues.set(key, target);
    if (previous == null || previous === target || reduced) return;
    const start = performance.now();
    const duration = 440;
    const draw = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = previous + (target - previous) * eased;
      element.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
      if (progress < 1 && element.isConnected) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}

function profileMediaMatches(entry, media = _profileMedia) {
  if (media === "all") return true;
  if (media === "film") return entry.media_type === "movie" && entry.subtype !== "tv";
  if (media === "tv") return entry.media_type === "movie" && entry.subtype === "tv";
  return entry.media_type === media;
}

function profileEntriesForPeriod(entries, year, month = "all") {
  if (State.journalAvailable) {
    return uniqueEntriesForEvents(entries, eventsForPeriod(State.events, year, month));
  }
  return entries.filter(entry => {
    if (entryActivityYear(entry) !== Number(year)) return false;
    return month === "all" || entryActivityMonth(entry) === `${year}-${String(month).padStart(2, "0")}`;
  });
}

function profileTopEntriesForPeriod(entries, year, month = "all") {
  if (State.journalAvailable) {
    const topEvents = eventsForPeriod(State.events, year, month).filter(isProfileTopEvent);
    return uniqueEntriesForEvents(entries, topEvents)
      .filter(entry => profileMediaMatches(entry) && Boolean(entry.rating));
  }
  return profileEntriesForPeriod(entries, year, month)
    .filter(entry => profileMediaMatches(entry) && Boolean(entry.rating));
}

function latestProfileMonthBefore(entries, anchorMonth) {
  if (State.journalAvailable) {
    return latestEventMonth(
      State.events,
      entries,
      anchorMonth,
      entry => profileMediaMatches(entry) && Boolean(entry.rating),
      isProfileTopEvent,
    );
  }
  return entries
    .filter(entry => profileMediaMatches(entry) && entry.rating)
    .map(entryActivityMonth)
    .filter(month => month && month < anchorMonth)
    .sort((a, b) => b.localeCompare(a))[0] || null;
}

function setProfileYear(y) {
  const year = Number.parseInt(y, 10);
  if (!Number.isFinite(year)) return;
  _profileYear = year;
  _profileMonthAutoResolve = false;
  renderDashboard();
}

function setProfileMonth(month) {
  const normalized = String(month).padStart(2, "0");
  if (!/^(0[1-9]|1[0-2])$/.test(normalized)) return;
  _profileMonth = normalized;
  _profileMonthAutoResolve = false;
  renderDashboard();
}

function setProfilePeriod(period) {
  if (!['year', 'month'].includes(period) || period === _profilePeriod) return;
  _profilePeriod = period;
  if (period === "month") _profileMonthAutoResolve = true;
  renderDashboard();
}

function setProfileMedia(media) {
  if (!PROFILE_MEDIA_OPTIONS.some(([value]) => value === media) || media === _profileMedia) return;
  _profileMedia = media;
  renderDashboard();
}

function formatLastBackup() {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return "Aucune sauvegarde récente sur cet appareil";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "Aucune sauvegarde récente sur cet appareil";
    return `Dernière sauvegarde : ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "Historique local indisponible";
  }
}

function openProfileCollection(kind, year, month = "all", mediaFilter = "all") {
  navTo("library");
  State.filters.type = "all";
  State.filters.subtype = "all";
  State.filters.status = "all";
  State.filters.favorite = false;
  State.filters.search = "";
  State.filters.rating = "all";
  State.filters.year = Number(year) || "all";
  State.filters.month = /^(0[1-9]|1[0-2])$/.test(String(month)) && State.filters.year !== "all"
    ? `${State.filters.year}-${month}`
    : "all";
  const search = document.getElementById("global-search");
  if (search) search.value = "";

  const applyMedia = media => {
    if (media === "game" || media === "book") State.filters.type = media;
    else if (media === "film") {
      State.filters.type = "movie";
      State.filters.subtype = "movie";
    } else if (media === "tv") {
      State.filters.type = "movie";
      State.filters.subtype = "tv";
    }
  };

  if (["finished", "playing", "wishlist"].includes(kind)) {
    State.filters.status = kind;
    applyMedia(mediaFilter);
  } else if (kind === "favorite") {
    State.filters.favorite = true;
    applyMedia(mediaFilter);
  } else if (kind === "game" || kind === "book") State.filters.type = kind;
  else if (kind === "film") {
    State.filters.type = "movie";
    State.filters.subtype = "movie";
  } else if (kind === "tv") {
    State.filters.type = "movie";
    State.filters.subtype = "tv";
  }

  syncFilterChips();
  updateCategoryTabs(State.filters.type, State.filters.favorite);
  renderCards({ resetScroll: true });
  _updateFilterToggleLabel();
}

function openRatingCollection(value) {
  const rating = Number.parseInt(value, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return;
  navTo("library");
  State.filters.rating = rating;
  syncFilterChips();
  renderCards({ resetScroll: true });
  _updateFilterToggleLabel();
}

async function renderDashboard() {
  const container = document.getElementById("dashboard-content");
  if (!container) return;

  if (State.journalDirty) await refreshJournalEvents({ silent: true });

  // Charge le username AVANT le rendu pour éviter le flash
  if (State.user && State.username === null) {
    try {
      const p = await Profiles.get(State.user.id);
      State.username = p?.username || "";
    } catch {}
  }
  const cachedUsername = State.username || "";

  const all = State.entries;

  // À l'ouverture de la vue mensuelle, un mois courant vide bascule vers le
  // dernier mois réellement renseigné. Un choix manuel vide reste respecté.
  if (_profilePeriod === "month" && _profileMonthAutoResolve) {
    const anchorMonth = `${_profileYear}-${_profileMonth}`;
    const currentEntries = profileTopEntriesForPeriod(all, _profileYear, _profileMonth);
    if (!currentEntries.length) {
      const fallbackMonth = latestProfileMonthBefore(all, anchorMonth);
      if (fallbackMonth) {
        _profileYear = Number(fallbackMonth.slice(0, 4));
        _profileMonth = fallbackMonth.slice(5, 7);
      }
    }
    _profileMonthAutoResolve = false;
  }

  const eventYears = State.journalAvailable
    ? State.events.map(event => Number(yearMonthOf(event.occurred_at)?.slice(0, 4))).filter(Number.isFinite)
    : [];
  const years = [...new Set([...all.map(entryActivityYear).filter(Boolean), ...eventYears])]
    .sort((a,b)=>b-a);
  if (!years.includes(_profileYear)) years.unshift(_profileYear);
  const yearOptions = years.map(y => `<option value="${y}" ${y===_profileYear?"selected":""}>${y}</option>`).join("");

  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2024, index, 1));
    return `<option value="${value}" ${value === _profileMonth ? "selected" : ""}>${label[0].toUpperCase()}${label.slice(1)}</option>`;
  }).join("");
  const periodMonth = _profilePeriod === "month" ? _profileMonth : "all";
  const periodLabel = _profilePeriod === "month"
    ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(_profileYear, Number(_profileMonth) - 1, 1))
    : String(_profileYear);
  const dateScopedEntries = profileEntriesForPeriod(all, _profileYear, periodMonth);
  const scopedEntries = dateScopedEntries.filter(entry => profileMediaMatches(entry));
  const scopedIds = new Set(scopedEntries.map(entry => entry.id));
  const periodEvents = State.journalAvailable ? eventsForPeriod(State.events, _profileYear, periodMonth) : [];
  const scopedFinished = State.journalAvailable
    ? periodEvents.filter(event => scopedIds.has(event.media_id) && isCompletionEvent(event))
    : scopedEntries.filter(entry => entry.status === "finished" && entry.date_finished);
  const scopedPlaying = scopedEntries.filter(entry => entry.status === "playing");
  const scopedWishlist = scopedEntries.filter(entry => entry.status === "wishlist");
  const scopedFavs = scopedEntries.filter(entry => entry.is_favorite);
  const scopedRated = profileTopEntriesForPeriod(all, _profileYear, periodMonth);
  const scopedAverage = scopedRated.length
    ? (scopedRated.reduce((sum, entry) => sum + entry.rating, 0) / scopedRated.length).toFixed(1)
    : "—";
  const topScoped = [...scopedRated].sort((a,b) => b.rating - a.rating).slice(0, 6);
  const topHTML = topScoped.length
    ? topScoped.map((entry, index) => {
        const coverUrl = safeMediaUrl(entry.cover_url);
        return `
          <button type="button" class="profile-top-card" data-prefetch-media="${entry.id}" onclick="UI.openEditModal('${entry.id}')" aria-label="Ouvrir ${esc(entry.title)}">
            <span class="profile-top-rank">${index + 1}</span>
            <span class="profile-top-cover">
              ${coverUrl ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" data-fade-image class="fade-image">` : `<span>${TYPE_ICONS[entry.media_type] || "🎭"}</span>`}
            </span>
            <strong>${esc(entry.title)}</strong>
            <small>${ratingScoreHTML(entry.rating, "profile-top-rating")}</small>
          </button>`;
      }).join("")
    : `<div class="profile-inline-empty">Aucun média noté en ${esc(periodLabel)}.</div>`;

  const categories = [
    { key: "film", label: "Films", icon: "🎬", color: "var(--movie)", count: dateScopedEntries.filter(e => profileMediaMatches(e, "film")).length },
    { key: "tv", label: "Séries", icon: "▣", color: "var(--accent)", count: dateScopedEntries.filter(e => profileMediaMatches(e, "tv")).length },
    { key: "game", label: "Jeux", icon: "🎮", color: "var(--game)", count: dateScopedEntries.filter(e => profileMediaMatches(e, "game")).length },
    { key: "book", label: "Livres", icon: "📚", color: "var(--book)", count: dateScopedEntries.filter(e => profileMediaMatches(e, "book")).length },
  ];
  const categoryMax = Math.max(...categories.map(category => category.count), 1);
  const categoryHTML = categories.map(category => `
    <button type="button" class="profile-category-row" onclick="UI.openProfileCollection('${category.key}', ${_profileYear}, '${periodMonth}', '${category.key}')">
      <span class="profile-category-icon" aria-hidden="true">${category.icon}</span>
      <span class="profile-category-copy">
        <span><strong>${category.label}</strong><em>${category.count}</em></span>
        <span class="profile-category-track"><i style="width:${Math.round(category.count / categoryMax * 100)}%;background:${category.color}"></i></span>
      </span>
      <span class="profile-category-arrow" aria-hidden="true">→</span>
    </button>`).join("");

  const scopedRepeatCount = repeatCountForPeriod(
    State.journalAvailable ? State.events : [],
    scopedEntries,
    _profileYear,
    periodMonth,
  );
  const genreInsights = exploredGenres(scopedEntries, 6);
  const maxGenreCount = Math.max(...genreInsights.map(item => item.count), 1);
  const genresHTML = genreInsights.length ? genreInsights.map(item => `
    <div class="profile-genre-row">
      <span><strong>${esc(item.label)}</strong><em>${item.count}</em></span>
      <span class="profile-genre-track"><i style="width:${Math.round(item.count / maxGenreCount * 100)}%"></i></span>
    </div>`).join("") : `<p class="profile-inline-empty">Pas encore assez de genres renseignés sur cette période.</p>`;

  // Histogramme des notes (toutes années)
  const ratedAll      = all.filter(e => e.rating);
  const ratingCounts  = Array(10).fill(0);
  ratedAll.forEach(e => { if (e.rating >= 1 && e.rating <= 10) ratingCounts[e.rating - 1]++; });
  const maxRatingCount = Math.max(...ratingCounts, 1);
  const totalRated     = ratedAll.length;
  const avgRating      = totalRated
    ? (ratedAll.reduce((s, e) => s + e.rating, 0) / totalRated).toFixed(1)
    : null;
  const BAR_MAX_PX = 72;

  const ratingBars = ratingCounts.map((n, i) => {
    const note   = i + 1;
    const px     = n > 0 ? Math.max(Math.round(n / maxRatingCount * BAR_MAX_PX), 3) : 0;
    const isPeak = n > 0 && n === Math.max(...ratingCounts);
    return `
      <button type="button" class="rating-hist-col${n ? " is-clickable" : ""}" title="${n} média${n !== 1 ? "s" : ""} · ★ ${note}/10" ${n ? `onclick="UI.openRatingCollection(${note})" aria-label="Voir les ${n} médias notés ${note} sur 10"` : "disabled aria-hidden=\"true\""}>
        <div class="rating-hist-count">${n || ""}</div>
        <div class="rating-hist-bar${isPeak ? " peak" : ""}" style="height:${px}px"></div>
      </button>`;
  }).join("");

  const ratingsHTML = totalRated > 0 ? `
    <section class="profile-dashboard-card profile-ratings-card" data-ui-key="profile-ratings">
      <div class="rating-hist-header">
        <h3 class="profile-section-title" style="margin:0">Notes · toutes années</h3>
        <div class="rating-hist-meta">
          <span class="rating-hist-total">${totalRated} notés</span>
          ${avgRating ? `<span class="rating-hist-avg">moy. ${ratingScoreHTML(avgRating, "rating-average")}</span>` : ""}
        </div>
      </div>
      <div class="rating-hist">${ratingBars}</div>
      <div class="rating-hist-legend">
        <span>★ 1/10</span>
        <span>★ 10/10</span>
      </div>
    </section>` : "";

  const dashboardHTML = `
    <section class="profile-year-overview" data-ui-key="profile-overview">
      <div class="profile-year-header">
        <div>
          <span class="section-eyebrow">En un coup d’œil</span>
          <h2>${_profilePeriod === "month" ? "Votre mois" : "Votre année"} · ${esc(periodLabel)}</h2>
        </div>
        <div class="profile-date-controls">
          <select class="filter-select profile-year-inline" aria-label="Année" onchange="UI.setProfileYear(this.value)">${yearOptions}</select>
          ${_profilePeriod === "month" ? `<select class="filter-select profile-month-inline" aria-label="Mois" onchange="UI.setProfileMonth(this.value)">${monthOptions}</select>` : ""}
        </div>
      </div>
      <div class="profile-scope-toolbar">
        <div class="profile-period-switch" role="group" aria-label="Période des statistiques">
          <button type="button" class="${_profilePeriod === "year" ? "active" : ""}" onclick="UI.setProfilePeriod('year')" aria-pressed="${_profilePeriod === "year"}">Annuel</button>
          <button type="button" class="${_profilePeriod === "month" ? "active" : ""}" onclick="UI.setProfilePeriod('month')" aria-pressed="${_profilePeriod === "month"}">Mensuel</button>
        </div>
        <div class="profile-media-switch" role="group" aria-label="Type de média">
          ${PROFILE_MEDIA_OPTIONS.map(([value, label]) => `<button type="button" class="${_profileMedia === value ? "active" : ""}" onclick="UI.setProfileMedia('${value}')" aria-pressed="${_profileMedia === value}">${label}</button>`).join("")}
        </div>
      </div>
      <div class="profile-year-summary">
        <div class="profile-year-primary">
          <strong>${profileNumberHTML("finished", scopedFinished.length)}</strong>
          <span>média${scopedFinished.length > 1 ? "s" : ""} terminé${scopedFinished.length > 1 ? "s" : ""}</span>
          <small>${scopedEntries.length} suivi${scopedEntries.length > 1 ? "s" : ""} au total sur cette période</small>
        </div>
        <div class="profile-year-secondary">
          <span>Note moyenne</span>
          <strong>${scopedAverage === "—" ? "—" : profileNumberHTML("average", scopedAverage, { decimals: 1, prefix: "★ ", suffix: "/10" })}</strong>
          <small>${scopedRated.length} média${scopedRated.length > 1 ? "s" : ""} noté${scopedRated.length > 1 ? "s" : ""}</small>
        </div>
      </div>
      <div class="profile-action-grid">
        ${[
          ["finished", "✓", scopedFinished.length, "Terminés"],
          ["playing", "▶", scopedPlaying.length, "En cours"],
          ["favorite", "♥", scopedFavs.length, "Coups de cœur"],
          ["wishlist", "＋", scopedWishlist.length, "Wishlist"],
        ].map(([key, icon, value, label]) => `
          <button type="button" class="profile-action-card" onclick="UI.openProfileCollection('${key}', ${_profileYear}, '${periodMonth}', '${_profileMedia}')">
            <span class="profile-action-icon" aria-hidden="true">${icon}</span>
            <strong>${profileNumberHTML(`action-${key}`, value)}</strong>
            <span>${label}</span>
            <i aria-hidden="true">→</i>
          </button>`).join("")}
      </div>
    </section>

    ${ratingsHTML}

    <div class="profile-insights-grid" data-ui-key="profile-insights">
      <section class="profile-dashboard-card profile-top-section">
        <div class="profile-card-heading">
          <div><span class="section-eyebrow">Vos préférés</span><h3>Top · ${esc(periodLabel)}</h3></div>
          <span class="section-count">${topScoped.length} média${topScoped.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="profile-top-track">${topHTML}</div>
      </section>

      <section class="profile-dashboard-card profile-categories-section">
        <div class="profile-card-heading">
          <div><span class="section-eyebrow">Répartition</span><h3>Par catégorie</h3></div>
          <span class="section-count">${dateScopedEntries.length} au total</span>
        </div>
        <div class="profile-category-list">${categoryHTML}</div>
      </section>
    </div>

    <div class="profile-habits-grid" data-ui-key="profile-habits">
      <section class="profile-dashboard-card profile-genres-section">
        <div class="profile-card-heading">
          <div><span class="section-eyebrow">Vos terrains</span><h3>Genres les plus explorés</h3></div>
          <span class="section-count">${genreInsights.length} genre${genreInsights.length > 1 ? "s" : ""}</span>
        </div>
        <div class="profile-genre-list">${genresHTML}</div>
      </section>
      <section class="profile-dashboard-card profile-repeat-section">
        <span class="section-eyebrow">Revenir à ses favoris</span>
        <div class="profile-repeat-value">${profileNumberHTML("repeats", scopedRepeatCount)}</div>
        <h3>revisionnage${scopedRepeatCount === 1 ? "" : "s"}</h3>
        <p>Relectures, nouvelles parties et œuvres revues sur cette période.</p>
      </section>
    </div>

    <details class="profile-account-details" data-ui-key="profile-account">
      <summary>
        <span><strong>Compte et sauvegarde</strong><small>${esc(cachedUsername || State.user?.email || "Votre compte Kulturo")}</small></span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div class="profile-account-body">
        <div class="profile-account-main">
          <div class="profile-avatar-circle">${iconUser()}</div>
          <div class="profile-identity-meta">
            <div class="profile-identity-email">${esc(State.user?.email || "")}</div>
            <div class="profile-username-row">
              <input type="text" id="input-username" placeholder="Ton pseudo…" maxlength="30" value="${esc(cachedUsername)}" aria-label="Pseudo" />
              <button class="btn btn-primary btn-sm" onclick="UI.saveUsername()">Enregistrer</button>
            </div>
          </div>
        </div>
        <div class="profile-backup-panel">
          <div><strong>Copie de sécurité</strong><span id="last-backup-label">${esc(formatLastBackup())}</span></div>
          <button class="btn btn-secondary btn-sm" onclick="UI.exportLibrary()">↓ Sauvegarder</button>
        </div>
        <div class="profile-account-footer">
          <span>Kulturo ${esc(CONFIG?.app?.version || "")}</span>
          <button class="btn btn-ghost btn-sm" onclick="UI.signOut()">Se déconnecter</button>
        </div>
      </div>
    </details>
  `;
  const changedBlocks = patchKeyedSurface(container, dashboardHTML);
  changedBlocks.forEach(block => {
    replayMotion(block, "profile-block-enter");
    block.addEventListener("animationend", () => block.classList.remove("profile-block-enter"), { once: true });
  });
  animateProfileNumbers(container);
  hydrateFadeImages(container);
}

function openModal(entry = null, prefillTitle = null) {
  _modalDirty = false;
  const isEdit = !!entry;
  State.editingId = isEdit ? entry.id : null;

  // Mode édition : modal classique directe
  if (isEdit) {
    _wizardState = null;
    _openModalClassic(entry);
    return;
  }

  // Recherche universelle puis ajout compact, sans assistant visuel encombrant.
  _wizardState = createAddDraft(prefillTitle);
  _currentRating = 0;
  window._apiSelected = null;
  _renderWizard();
}

let _wizardState = null;
let _modalDirty = false;
let _modalClosePromptOpen = false;

function markModalDirty() {
  if (document.getElementById("modal-overlay") && (_wizardState || State.editingId)) _modalDirty = true;
}

function _captureWizardOpinion() {
  if (!_wizardState || _wizardState.step !== 2) return;
  _wizardState.rating = _currentRating;
  _wizardState.favorite = document.getElementById("f-favorite")?.checked || false;
  _wizardState._status = document.getElementById("f-status")?.value || _wizardState._status || "finished";
}

function _renderWizard() {
  const s = _wizardState;
  const root = document.getElementById("modal-root");
  const cover = s.step === 2 ? safeMediaUrl(s.apiSelected?.cover_url) : "";

  let bodyHTML = "";
  let footerHTML = "";
  let headerHTML = "";

  if (s.step === 1) {
    headerHTML = `
      <div class="wz-header-copy">
        <span>Nouvel ajout</span>
        <h3 id="add-sheet-title">Que souhaitez-vous ajouter ?</h3>
      </div>
      <button type="button" class="btn-icon" onclick="UI.closeModal()" aria-label="Fermer">${iconX()}</button>`;
    bodyHTML = `
      <div class="api-search-wrap wz-universal-search">
        <span class="wz-search-icon" aria-hidden="true">${iconSearch()}</span>
        <input type="text" id="f-api-search" placeholder="Ex. The Brutalist, Dune, Elden Ring…" autocomplete="off" value="${esc(s.apiSelected?.title || s.title)}" />
        <div class="api-results wz-universal-results" id="api-results" style="display:none"></div>
      </div>
      <div class="wz-search-start" id="wz-search-start">
        <span aria-hidden="true">⌕</span>
        <strong>Une seule recherche pour toute votre culture</strong>
        <small>Films, séries, jeux et livres</small>
      </div>`;
  }

  else if (s.step === 2) {
    const title = s.apiSelected?.title || s.title;
    const subtitle = `${getTypeLabel({ ...s.apiSelected, media_type: s.type })}${s.apiSelected?.release_year ? ` · ${s.apiSelected.release_year}` : ""}`;
    const primaryStatuses = ADD_PRIMARY_STATUSES.map(({ value, icon, label }) => `
      <button type="button" class="wz-status-btn ${value === s._status ? "active" : ""}" data-status="${value}" onclick="UI.wzSetStatus('${value}')" aria-pressed="${value === s._status}">
        <span aria-hidden="true">${icon}</span>${label}
      </button>`).join("");
    const secondaryStatuses = ADD_SECONDARY_STATUSES.map(({ value, icon, label }) => `
      <button type="button" class="wz-status-btn wz-status-secondary ${value === s._status ? "active" : ""}" data-status="${value}" onclick="UI.wzSetStatus('${value}')" aria-pressed="${value === s._status}">
        <span aria-hidden="true">${icon}</span>${label}
      </button>`).join("");
    headerHTML = `
      <button type="button" class="btn-icon wz-back-btn" onclick="UI.wzBack()" aria-label="Changer de média">←</button>
      <div class="wz-header-copy">
        <span>Nouvel ajout</span>
        <h3 id="add-sheet-title">Ajouter à la bibliothèque</h3>
      </div>
      <button type="button" class="btn-icon" onclick="UI.closeModal()" aria-label="Fermer">${iconX()}</button>`;
    bodyHTML = `
      <div class="wz-selected-card">
        ${cover
          ? `<img src="${esc(cover)}" class="wz-selected-cover" alt="">`
          : `<div class="wz-selected-cover wz-selected-placeholder" aria-hidden="true">${TYPE_ICONS[s.type] || "🎭"}</div>`}
        <div class="wz-selected-copy">
          <strong>${esc(title)}</strong>
          <span>${esc(subtitle)}</span>
        </div>
        <button type="button" class="wz-change-btn" onclick="UI.wzBack()">Changer</button>
      </div>

      <section class="wz-compact-section">
        <div class="wz-section-heading"><strong>Où en êtes-vous ?</strong></div>
        <div class="wz-status-grid" role="group" aria-label="Statut du média">${primaryStatuses}</div>
        <details class="wz-other-status" ${isSecondaryAddStatus(s._status) ? "open" : ""}>
          <summary>Autre statut</summary>
          <div class="wz-status-grid wz-status-grid-secondary">${secondaryStatuses}</div>
        </details>
      </section>

      <section class="wz-compact-section wz-opinion-section">
        <div class="wz-section-heading">
          <strong>Votre note</strong>
          <span id="rating-tooltip" class="rating-tooltip-label">${s.rating ? `★ ${s.rating}/10` : "Optionnelle"}</span>
        </div>
        <div class="rating-stars" id="rating-stars"></div>
        <label class="wz-favorite-toggle">
          <input type="checkbox" id="f-favorite" ${s.favorite ? "checked" : ""} />
          <span class="wz-favorite-icon" aria-hidden="true">♥</span>
          <span>Coup de cœur</span>
        </label>
      </section>`;
    footerHTML = `
      <button class="btn btn-primary wz-submit-btn" onclick="UI.saveEntry()">Ajouter à ma bibliothèque</button>`;
  }

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal modal-wizard" data-step="${s.step}" data-media-accent="${s.step === 2 ? esc(s.type) : "neutral"}" ${cover ? `data-cover-accent-url="${esc(cover)}"` : ""} role="dialog" aria-modal="true" aria-labelledby="add-sheet-title">
        <div class="modal-header wz-header">${headerHTML}</div>
        <div class="modal-body wz-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ""}
      </div>
    </div>`;
  pushHistoryLayer("modal", { modal: "add", step: s.step });
  syncSystemBar(_currentPage, s.step === 2 ? s.type : null);
  if (s.step === 2) bindCoverAccent(root.querySelector(".modal-wizard"), cover);

  if (s.step === 1) {
    setupWizardUniversalSearch();
    setTimeout(() => document.getElementById("f-api-search")?.focus(), 100);
  }

  if (s.step === 2) {
    // Hidden fields for saveEntry
    const body = document.querySelector(".modal-body");
    [
      ["f-type",   s.type],
      ["f-title",  s.apiSelected?.title || s.title],
      ["f-genre",  s.apiSelected?.genre || ""],
      ["f-author", s.apiSelected?.author || ""],
      ["f-cover",  s.apiSelected?.cover_url || ""],
      ["f-platform", s.apiSelected?.platform || ""],
    ].forEach(([id, val]) => {
      const el = document.createElement("input");
      el.type = "hidden"; el.id = id; el.value = val || "";
      body.appendChild(el);
    });
    // Status default
    const statusDefault = document.createElement("input");
    statusDefault.type = "hidden"; statusDefault.id = "f-status"; statusDefault.value = _wizardState._status || "finished";
    body.appendChild(statusDefault);

    _currentRating = s.rating || 0;
    buildRatingStars(_currentRating);
  }

  setupMobileSheetSwipe({
    overlay: root.querySelector("#modal-overlay"),
    sheet: root.querySelector(".modal-wizard"),
    dismiss: () => closeModal(),
    shouldResetBeforeDismiss: () => _modalDirty,
  });
}

function _openModalClassic(entry) {
  const root = document.getElementById("modal-root");
  const entryCoverUrl = safeMediaUrl(entry.cover_url);
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal edit-modal" data-edit-view="main" data-media-accent="${esc(entry.media_type || "movie")}" ${entryCoverUrl ? `data-cover-accent-url="${esc(entryCoverUrl)}"` : ""} role="dialog" aria-modal="true">
        <div class="modal-header">
          <button type="button" class="btn-icon edit-details-back" onclick="UI.setEditDetailsView(false)" aria-label="Revenir à la modification principale">←</button>
          <h3><span class="edit-title-main">Modifier</span><span class="edit-title-details">Détails facultatifs</span></h3>
          <button class="btn-icon" onclick="UI.closeModal()">${iconX()}</button>
        </div>
        <div class="modal-body">
          <div class="edit-primary-view">
            <div class="form-group modal-search-unified">
              <div class="modal-type-tabs">
                <button type="button" class="modal-type-tab ${entry.media_type==="movie" ? "active" : ""}" data-type="movie" onclick="UI.setModalType('movie')">🎬 Film / Série</button>
                <button type="button" class="modal-type-tab ${entry.media_type==="game" ? "active" : ""}" data-type="game" onclick="UI.setModalType('game')">🎮 Jeu</button>
                <button type="button" class="modal-type-tab ${entry.media_type==="book" ? "active" : ""}" data-type="book" onclick="UI.setModalType('book')">📚 Livre</button>
              </div>
              <div class="api-search-wrap">
                <input type="text" id="f-api-search" placeholder="Rechercher ou saisir un titre…" autocomplete="off" value="${esc(entry.title||"")}" />
                <div class="api-results" id="api-results" style="display:none"></div>
              </div>
              <input type="hidden" id="f-type" value="${entry.media_type || "movie"}" />
              <input type="hidden" id="f-title" value="${esc(entry.title||"")}" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Statut</label>
                <select id="f-status">
                  ${["wishlist","playing","finished","paused","dropped"].map(s =>
                    `<option value="${s}" ${entry.status===s?"selected":""}>${STATUS_LABELS[s]}</option>`
                  ).join("")}
                </select>
              </div>
              <div class="form-group">
                <label>Note <span id="rating-tooltip" class="rating-tooltip-label"></span></label>
                <div class="rating-stars" id="rating-stars"></div>
              </div>
            </div>
            <label class="toggle-row">
              <span class="toggle-label">♥ Coup de cœur</span>
              <span class="toggle-switch">
                <input type="checkbox" id="f-favorite" ${entry.is_favorite?"checked":""} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </span>
            </label>
            <button type="button" class="edit-details-trigger" onclick="UI.setEditDetailsView(true)">
              <span class="edit-details-trigger-icon" aria-hidden="true">＋</span>
              <span class="edit-details-trigger-copy">
                <strong>Détails facultatifs</strong>
                <small id="edit-details-summary">Genre, auteur, plateforme, couverture</small>
              </span>
              <span class="edit-details-trigger-arrow" aria-hidden="true">→</span>
            </button>
          </div>
          <details class="advanced-details edit-details-panel">
            <summary class="advanced-summary">Détails facultatifs <span class="advanced-hint" id="edit-details-desktop-summary">genre, auteur, plateforme, couverture</span></summary>
            <div class="advanced-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Genre</label>
                  <input type="text" id="f-genre" value="${esc(entry.genre||"")}" placeholder="Ex: RPG, Thriller…" />
                </div>
                <div class="form-group">
                  <label>Auteur / Réalisateur</label>
                  <input type="text" id="f-author" value="${esc(entry.author||"")}" placeholder="Nom" />
                </div>
              </div>
              <div class="form-group">
                <label>Plateforme</label>
                <input type="text" id="f-platform" value="${esc(entry.platform||"")}" placeholder="PS5, PC, Switch…" />
              </div>
              <div class="form-group">
                <label>Image de couverture (URL)</label>
                <input type="url" id="f-cover" value="${esc(entry.cover_url||"")}" placeholder="https://…" />
              </div>
            </div>
          </details>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger btn-sm" onclick="UI.deleteEntry('${entry.id}')">Supprimer</button>
          <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
          <button class="btn btn-primary" onclick="UI.saveEntry()">Enregistrer</button>
        </div>
      </div>
    </div>`;
  pushHistoryLayer("modal", { modal: "edit", mediaId: entry.id });
  syncSystemBar(_currentPage, entry.media_type);
  bindCoverAccent(root.querySelector(".edit-modal"), entryCoverUrl);
  _currentRating = entry.rating || 0;
  buildRatingStars(entry.rating || 0);
  updateApiAvailLabel(entry.media_type || "movie");
  setupApiSearch();
  syncEditDetailsSummary();
  ["f-genre", "f-author", "f-platform", "f-cover"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", syncEditDetailsSummary);
  });
  document.getElementById("f-cover")?.addEventListener("change", event => {
    bindCoverAccent(root.querySelector(".edit-modal"), event.target.value);
  });
  // Sur mobile, ne pas ouvrir le clavier dès l’arrivée : la fiche reste entière.
  if (!window.matchMedia?.("(max-width: 680px)")?.matches) {
    setTimeout(() => document.getElementById("f-api-search")?.focus(), 100);
  }
  setupMobileSheetSwipe({
    overlay: root.querySelector("#modal-overlay"),
    sheet: root.querySelector(".edit-modal"),
    dismiss: () => closeModal(),
    shouldResetBeforeDismiss: () => _modalDirty,
  });
}

function syncEditDetailsSummary() {
  const labels = [
    ["f-genre", "Genre"],
    ["f-author", "Auteur / réalisation"],
    ["f-platform", "Plateforme"],
    ["f-cover", "Couverture"],
  ].filter(([id]) => document.getElementById(id)?.value?.trim()).map(([, label]) => label);
  const text = labels.length ? labels.join(" · ") : "Genre, auteur, plateforme, couverture";
  const mobileSummary = document.getElementById("edit-details-summary");
  const desktopSummary = document.getElementById("edit-details-desktop-summary");
  if (mobileSummary) mobileSummary.textContent = text;
  if (desktopSummary) desktopSummary.textContent = text.toLowerCase();
  const trigger = document.querySelector(".edit-details-trigger");
  trigger?.classList.toggle("has-details", labels.length > 0);
  const icon = trigger?.querySelector(".edit-details-trigger-icon");
  if (icon) icon.textContent = labels.length ? "✓" : "＋";
}

function setEditDetailsView(showDetails) {
  const modal = document.querySelector(".edit-modal");
  const details = modal?.querySelector(".edit-details-panel");
  if (!modal || !details) return;
  modal.dataset.editView = showDetails ? "details" : "main";
  details.open = Boolean(showDetails);
  replayMotion(showDetails ? details : modal.querySelector(".edit-primary-view"), "edit-view-enter");
  const body = modal.querySelector(".modal-body");
  if (body) body.scrollTop = 0;
  requestAnimationFrame(() => {
    const target = showDetails
      ? modal.querySelector(".edit-details-back")
      : modal.querySelector(".edit-details-trigger");
    target?.focus({ preventScroll: true });
  });
}

const RATING_LABELS = {
  1:  "Fuyez cette merde",
  2:  "Vraiment pas fou",
  3:  "Bof",
  4:  "Pas terrible",
  5:  "Correct",
  6:  "Pas mal",
  7:  "Bien",
  8:  "Très bien",
  9:  "Excellent",
  10: "Chef-d'œuvre absolu",
};

// 5 étoiles, chaque étoile = 2 points, clic gauche = demi (impair), clic droit = plein (pair)
function buildRatingStars(current) {
  const wrap = document.getElementById("rating-stars");
  if (!wrap) return;

  wrap.innerHTML = Array.from({length: 5}, (_, i) => {
    const full = (i + 1) * 2;
    const half = full - 1;
    const filledFull = current >= full;
    const filledHalf = current >= half && current < full;
    const starColor = filledFull ? "var(--accent)" : "var(--star-empty)";
    const halfColor = (filledFull || filledHalf) ? "var(--accent)" : "none";
    return `<span class="star-wrap">
        <svg viewBox="0 0 20 20" width="28" height="28" class="star-svg">
          <defs>
            <clipPath id="hc${i}x"><rect x="0" y="0" width="10" height="20"/></clipPath>
          </defs>
          <polygon class="star-bg" points="10,2 12.9,7.6 19,8.5 14.5,12.9 15.6,19 10,16 4.4,19 5.5,12.9 1,8.5 7.1,7.6" fill="${starColor}"/>
          <polygon class="star-half-fill" points="10,2 12.9,7.6 19,8.5 14.5,12.9 15.6,19 10,16 4.4,19 5.5,12.9 1,8.5 7.1,7.6" fill="${halfColor}" clip-path="url(#hc${i}x)"/>
        </svg>
        <button type="button" class="star-zone star-zone-half"
          onclick="UI.setRating(${half})"
          onmouseenter="UI.previewRating(${half})"
          onfocus="UI.previewRating(${half})"
          aria-label="Noter ${half} sur 10"
          aria-pressed="${current === half}"></button>
        <button type="button" class="star-zone star-zone-full"
          onclick="UI.setRating(${full})"
          onmouseenter="UI.previewRating(${full})"
          onfocus="UI.previewRating(${full})"
          aria-label="Noter ${full} sur 10"
          aria-pressed="${current === full}"></button>
      </span>`;
  }).join("");

  if (current) showRatingLabel(current);

  // L'aperçu est réinitialisé uniquement à la sortie de la rangée complète.
  // Le faire sur chaque demi-étoile reconstruisait le DOM entre deux zones et
  // provoquait le scintillement visible au survol.
  if (!wrap.dataset.previewBound) {
    wrap.dataset.previewBound = "true";
    wrap.addEventListener("mouseleave", clearPreview);
    wrap.addEventListener("focusout", event => {
      if (!wrap.contains(event.relatedTarget)) clearPreview();
    });
  }

  if (!wrap.dataset.touchBound) {
    wrap.dataset.touchBound = "true";
    wrap.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = wrap.getBoundingClientRect();
      const x = Math.max(0, touch.clientX - rect.left);
      const n = Math.min(10, Math.max(1, Math.ceil((x / rect.width) * 10)));
      previewRating(n);
    }, { passive: false });
    wrap.addEventListener("touchend", (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = wrap.getBoundingClientRect();
      const x = Math.max(0, touch.clientX - rect.left);
      const n = Math.min(10, Math.max(1, Math.ceil((x / rect.width) * 10)));
      setRating(n);
    }, { passive: false });
    wrap.addEventListener("touchcancel", clearPreview);
  }
}

let _currentRating = 0;
function setRating(n) {
  _currentRating = n;
  if (_wizardState?.step === 2) _wizardState.rating = n;
  markModalDirty();
  buildRatingStars(n);
  showRatingLabel(n);
}
function previewRating(n) {
  document.querySelectorAll("#rating-stars .star-wrap").forEach((wrap, i) => {
    const full = (i + 1) * 2;
    const half = full - 1;
    const filledFull = n >= full;
    const filledHalf = n >= half && n < full;
    const bg   = wrap.querySelector(".star-bg");
    const hf   = wrap.querySelector(".star-half-fill");
    if (bg) bg.setAttribute("fill", filledFull ? "var(--accent)" : "var(--star-empty)");
    if (hf) hf.setAttribute("fill", (filledFull || filledHalf) ? "var(--accent)" : "none");
  });
  showRatingLabel(n);
}
function clearPreview() {
  buildRatingStars(_currentRating);
  if (!_currentRating) hideRatingLabel();
}
function showRatingLabel(n) {
  const el = document.getElementById("rating-tooltip");
  if (el) { el.textContent = `★ ${n}/10 — ${RATING_LABELS[n]}`; el.style.opacity = "1"; }
}
function hideRatingLabel() {
  const el = document.getElementById("rating-tooltip");
  if (el && !_currentRating) { el.style.opacity = "0"; }
}

function updateApiAvailLabel(type) {
  const avail = apiAvailability();
  const label = document.getElementById("api-avail-label");
  if (!label) return;
  const ok = avail[type];
  label.textContent = ok ? "(API disponible)" : "(API non configurée — manuel uniquement)";
  label.style.color = ok ? "var(--success)" : "var(--text-3)";
}

function setupWizardUniversalSearch() {
  const input = document.getElementById("f-api-search");
  const results = document.getElementById("api-results");
  if (!input || !results) return;
  let timer;
  let requestSeq = 0;
  let activeController = null;
  input.dataset.kulturoSearch = "true";
  input._kulturoAbortSearch = () => activeController?.abort();

  const scheduleSearch = (immediate = false) => {
    clearTimeout(timer);
    const query = input.value.trim();
    const start = document.getElementById("wz-search-start");
    if (_wizardState) _wizardState.title = query;
    if (query.length < 2) {
      activeController?.abort();
      requestSeq++;
      results.style.display = "none";
      results.innerHTML = "";
      if (start) start.hidden = false;
      return;
    }
    if (start) start.hidden = true;

    timer = setTimeout(async () => {
      const seq = ++requestSeq;
      activeController?.abort();
      activeController = new AbortController();
      const { signal } = activeController;
      results.style.display = "block";
      results.innerHTML = `
        <div class="wz-search-skeleton" role="status" aria-label="Recherche en cours">
          ${Array.from({ length: 3 }, () => `
            <div class="wz-skeleton-result"><i></i><span><b></b><small></small></span></div>`).join("")}
        </div>`;

      const requests = ["movie", "game", "book"].map(async type => {
        try {
          const items = await searchMedia(query, type, { signal });
          return (items || []).slice(0, 5).map(item => ({ ...item, media_type: type }));
        } catch {
          return [];
        }
      });
      const grouped = await Promise.all(requests);
      if (signal.aborted || seq !== requestSeq || input.value.trim() !== query) return;

      const items = grouped.flat().filter(item => !findMatchingEntry(item));
      window._apiResults = items;
      const resultItems = items.map((item, index) => {
        const coverUrl = safeMediaUrl(item.cover_url);
        return `
          <button type="button" class="api-result-item wz-universal-result" onclick="UI.fillFromApi(${index})">
            ${coverUrl ? `<img class="api-result-thumb" src="${esc(coverUrl)}" alt="" loading="lazy">` : `<div class="api-result-thumb api-result-placeholder">${TYPE_ICONS[item.media_type] || "🎭"}</div>`}
            <span class="api-result-info">
              <strong class="api-result-title">${esc(item.title)}</strong>
              <small class="api-result-sub">${esc(getTypeLabel(item))}${item.release_year ? ` · ${esc(item.release_year)}` : ""}${item.author ? ` · ${esc(item.author)}` : ""}</small>
            </span>
          </button>`;
      }).join("");
      results.innerHTML = `
        ${resultItems || `<div class="wz-search-empty">Aucun résultat précis pour « ${esc(query)} ».</div>`}
        <div class="wz-manual-result">
          <span>Pas le bon résultat ? Ajouter « ${esc(query)} » comme :</span>
          <div class="wz-manual-types" role="group" aria-label="Type pour un ajout manuel">
            <button type="button" onclick="UI.wzUseManualType('movie')">🎬 Film / Série</button>
            <button type="button" onclick="UI.wzUseManualType('game')">🎮 Jeu</button>
            <button type="button" onclick="UI.wzUseManualType('book')">📚 Livre</button>
          </div>
        </div>`;
    }, immediate ? 0 : 320);
  };

  input.addEventListener("input", () => scheduleSearch(false));
  input._kulturoSearch = () => scheduleSearch(true);
  if (input.value.trim().length >= 2 && !_wizardState?.apiSelected) scheduleSearch(true);
}

function setupApiSearch() {
  const input   = document.getElementById("f-api-search");
  const results = document.getElementById("api-results");
  if (!input || !results) return;
  let timer;
  let requestSeq = 0;
  let activeController = null;
  input.dataset.kulturoSearch = "true";
  input._kulturoAbortSearch = () => activeController?.abort();

  const scheduleSearch = (immediate = false) => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      activeController?.abort();
      requestSeq++;
      results.style.display = "none";
      return;
    }
    timer = setTimeout(async () => {
      const type  = document.getElementById("f-type")?.value || "game";
      const seq = ++requestSeq;
      activeController?.abort();
      activeController = new AbortController();
      const { signal } = activeController;
      const items = await searchMedia(q, type, { signal });
      if (signal.aborted || seq !== requestSeq || input.value.trim() !== q ||
          (document.getElementById("f-type")?.value || "game") !== type) return;
      if (!items.length) { results.style.display = "none"; return; }
      results.style.display = "block";
      results.innerHTML = items.map((it, idx) => `
        <button type="button" class="api-result-item" onclick="UI.fillFromApi(${idx})">
          ${safeMediaUrl(it.cover_url) ? `<img class="api-result-thumb" src="${esc(safeMediaUrl(it.cover_url))}" alt="" loading="lazy">` : `<div class="api-result-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">${TYPE_ICONS[type]}</div>`}
          <div class="api-result-info">
            <div class="api-result-title">${esc(it.title)}</div>
            <div class="api-result-sub">${esc(it.release_year||"")} ${esc(it.author||"")}</div>
          </div>
        </button>`).join("");
      // Stocker temporairement
      window._apiResults = items;
    }, immediate ? 0 : 350);
  };

  input.addEventListener("input", () => scheduleSearch(false));
  input._kulturoSearch = () => scheduleSearch(true);
}

function fillFromApi(idx) {
  const it = window._apiResults?.[idx];
  if (!it) return;
  markModalDirty();

  // Dans l'ajout compact, toucher un résultat ouvre directement la finalisation.
  if (_wizardState && _wizardState.step === 1) {
    _wizardState = selectAddResult(_wizardState, it);
    window._apiSelected = it;
    const input = document.getElementById("f-api-search");
    input?.blur();
    _renderWizard();
    return;
  }

  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
  const searchInput = document.getElementById("f-api-search");
  if (searchInput) searchInput.value = it.title;
  set("f-title",  it.title);
  set("f-cover",  it.cover_url);
  set("f-genre",  it.genre);
  set("f-author", it.author);
  set("f-platform", it.platform);
  window._apiSelected = it;
  document.getElementById("api-results").style.display = "none";
  syncEditDetailsSummary();
  const editModal = document.querySelector(".edit-modal");
  if (editModal) bindCoverAccent(editModal, it.cover_url);
  if (it.cover_url || it.genre) {
    const details = document.querySelector(".advanced-details");
    if (details && !window.matchMedia?.("(max-width: 680px)")?.matches) details.open = true;
  }
}

// ── CRUD ──────────────────────────────────────────────────────
async function saveEntry() {
  _captureWizardOpinion();
  // En édition, le champ visible doit pouvoir modifier le titre sans sélection API.
  const titleHidden = document.getElementById("f-title")?.value?.trim();
  const titleSearch = document.getElementById("f-api-search")?.value?.trim();
  const title = titleSearch || titleHidden;
  if (!title) { toast("Le titre est obligatoire.", "error"); return; }

  // #7 — protection double-submit
  const saveBtn = document.querySelector(".modal-footer .btn-primary");
  if (saveBtn?.disabled) return;
  if (saveBtn) {
    saveBtn.dataset.originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "…";
  }

  const existing = State.editingId ? State.entries.find(e => e.id === State.editingId) : null;
  const selected = window._apiSelected || null;
  const mediaType = document.getElementById("f-type")?.value;
  const keepExistingApi = Boolean(existing && !selected &&
    existing.media_type === mediaType && normalizeTitle(existing.title) === normalizeTitle(title));

  const payload = {
    title,
    media_type:    mediaType,
    status:        document.getElementById("f-status")?.value,
    rating:        _currentRating || null,
    is_favorite:   document.getElementById("f-favorite")?.checked || false,
    // L'ancienne colonne reste intacte pour ne supprimer aucune donnée, mais
    // les notes personnelles ne font plus partie de l'interface Kulturo.
    notes:         existing?.notes ?? null,
    cover_url:     document.getElementById("f-cover")?.value?.trim() || null,
    genre:         document.getElementById("f-genre")?.value?.trim() || null,
    author:        document.getElementById("f-author")?.value?.trim() || null,
    platform:      document.getElementById("f-platform")?.value?.trim() || null,
    external_id:   selected?.external_id ?? (keepExistingApi ? existing.external_id : null),
    source_api:    selected?.source_api  ?? (keepExistingApi ? existing.source_api : "manual"),
    subtype:       selected?.subtype     ?? (keepExistingApi ? existing.subtype : null),
    release_year:  selected?.release_year ?? (keepExistingApi ? existing.release_year : null),
    description:   selected?.description  ?? (keepExistingApi ? existing.description : null),
  };

  // Ces colonnes existent déjà. La même logique est utilisée dans Modifier et
  // dans les actions rapides afin qu'un revisionnage soit compté une seule fois.
  const today = localISODate();
  const statusTransition = statusTransitionChanges(existing, payload.status, today);
  if (statusTransition.changes.date_started) payload.date_started = statusTransition.changes.date_started;
  if (statusTransition.changes.date_finished) payload.date_finished = statusTransition.changes.date_finished;
  if (Object.prototype.hasOwnProperty.call(statusTransition.changes, "repeat_count")) {
    payload.repeat_count = statusTransition.changes.repeat_count;
  }

  // Une nouvelle identité API ne doit jamais conserver le casting/backdrop
  // de l'ancien média.
  const selectedIdentityChanged = Boolean(existing && selected && (
    existing.media_type !== mediaType ||
    existing.source_api !== selected.source_api ||
    String(existing.external_id || "") !== String(selected.external_id || "") ||
    normalizedSubtype(existing) !== normalizedSubtype({ ...selected, media_type: mediaType })
  ));
  if (existing && (selectedIdentityChanged || (!selected && !keepExistingApi))) {
    ["backdrop_url", "directors", "cast_members", "duration", "seasons_count",
     "episodes_count", "air_status", "watch_providers", "developer", "publisher",
     "page_count", "isbn"].forEach(field => { payload[field] = null; });
  }

  const duplicate = findMatchingEntry(payload, State.editingId);
  if (duplicate) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || (State.editingId ? "Enregistrer" : "Ajouter"); }
    toast(`"${duplicate.title}" est déjà dans votre bibliothèque.`, "info");
    return;
  }

  try {
    if (State.editingId) {
      const updated = await Media.update(State.editingId, payload);
      const idx = State.entries.findIndex(e => e.id === State.editingId);
      if (idx !== -1) State.entries[idx] = updated;
    } else {
      const created = await Media.create(payload);
      State.entries.unshift(created);
    }
    cacheEntriesLocally();
    markJournalDirty();
    const wasAdding = !State.editingId;
    const savedTitle = payload.title;
    const justFinished = payload.status === "finished";
    _modalDirty = false;
    closeModal();
    // #13 — State.entries déjà mis à jour localement, pas besoin de refetch
    renderCards();
    updateBadges();
    toast(wasAdding ? `"${savedTitle}" ajouté ✓` : "Mis à jour ✓", "success");
    if (wasAdding) flashNewCard(savedTitle);
    if (justFinished) launchConfetti();
  } catch (e) {
    const saveBtn = document.querySelector(".modal-footer .btn-primary");
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || (State.editingId ? "Enregistrer" : "Ajouter"); }
    toast("Erreur : " + e.message, "error");
  }
}

async function deleteEntry(id) {
  const confirmed = await confirmDialog("Supprimer ce média ?", "Cette action est irréversible.", "Supprimer", "danger");
  if (!confirmed) return;
  try {
    // Anime la card avant suppression
    const cardEl = document.querySelector(`.media-card[data-id="${id}"]`);
    if (cardEl) {
      cardEl.classList.add("card-exit");
      await new Promise(r => setTimeout(r, 300));
    }
    await Media.delete(id);
    State.entries = State.entries.filter(e => e.id !== id);
    cacheEntriesLocally();
    markJournalDirty();
    _modalDirty = false;
    closeModal();
    renderCards();
    updateBadges();
    toast("Supprimé", "info");
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

async function toggleFav(id) {
  // Anime le bouton fav
  const btn = document.querySelector(`.fav-btn[onclick*="${id}"]`);
  if (btn) {
    btn.classList.remove("pop");
    requestAnimationFrame(() => btn.classList.add("pop"));
    btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true });
  }
  const entry = State.entries.find(e => e.id === id);
  if (!entry) return;
  const next = !entry.is_favorite;
  try {
    await Media.toggleFavorite(id, entry.is_favorite);
    entry.is_favorite = next;
    cacheEntriesLocally();
    // #13 — mise à jour locale uniquement
    renderCards();
    updateBadges();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

// ── Modal helpers ─────────────────────────────────────────────
async function closeModal(force = false, options = {}) {
  if (!options.fromHistory && historyOwnsLayer("modal")) {
    history.back();
    return true;
  }
  if (_modalDirty && !force) {
    if (_modalClosePromptOpen) return;
    _modalClosePromptOpen = true;
    const discard = await confirmDialog(
      "Quitter sans enregistrer ?",
      "Les modifications saisies dans cette fenêtre seront perdues.",
      "Quitter",
      "danger"
    );
    _modalClosePromptOpen = false;
    if (!discard) return false;
  }
  const overlay = document.getElementById("modal-overlay");
  const cleanup = () => {
    document.querySelectorAll("[data-kulturo-search]").forEach(input => input._kulturoAbortSearch?.());
    const root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
    _currentRating = 0;
    _wizardState = null;
    State.editingId = null;
    window._apiSelected = null;
    window._apiResults = [];
    _modalDirty = false;
    _modalClosePromptOpen = false;
    syncSystemBar(_currentPage, null);
  };
  if (!overlay) { cleanup(); return true; }
  if (overlay.classList.contains("is-closing")) return true;
  overlay.classList.add("is-closing");
  setTimeout(cleanup, 180);
  return true;
}
function closeModalOnBg(e) {
  if (e.target.id === "modal-overlay") closeModal();
}

// #5 — modal de confirmation custom
function confirmDialog(title, message, confirmLabel = "Confirmer", variant = "danger") {
  return new Promise(resolve => {
    const root = document.getElementById("modal-root");
    const parentModal = root.querySelector("#modal-overlay .modal");
    if (parentModal) parentModal.inert = true;
    root.insertAdjacentHTML("beforeend", `
      <div class="modal-overlay confirm-overlay" id="confirm-overlay">
        <div class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
          <div class="modal-header confirm-modal-header">
            <div class="confirm-modal-heading">
              <span>Confirmation</span>
              <h3 id="confirm-title">${esc(title)}</h3>
            </div>
            <button type="button" class="btn-icon" id="confirm-close" aria-label="Fermer">${iconX()}</button>
          </div>
          <div class="modal-body confirm-modal-body">
            <span class="confirm-modal-symbol confirm-modal-symbol-${variant}" aria-hidden="true">!</span>
            <p id="confirm-message">${esc(message)}</p>
          </div>
          <div class="modal-footer confirm-modal-footer">
            <button type="button" class="btn btn-secondary" id="confirm-cancel">Annuler</button>
            <button type="button" class="btn btn-${variant}" id="confirm-ok">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`);
    const overlay = document.getElementById("confirm-overlay");
    const cleanup = (result) => {
      if (overlay.classList.contains("is-closing")) return;
      overlay.classList.add("is-closing");
      setTimeout(() => {
        overlay.remove();
        if (parentModal) parentModal.inert = false;
        resolve(result);
      }, 180);
    };
    document.getElementById("confirm-ok").onclick     = () => cleanup(true);
    document.getElementById("confirm-cancel").onclick = () => cleanup(false);
    document.getElementById("confirm-close").onclick = () => cleanup(false);
    overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(false); });
    setupMobileSheetSwipe({
      overlay,
      sheet: overlay.querySelector(".confirm-modal"),
      dismiss: () => cleanup(false),
    });
    document.getElementById("confirm-ok").focus();
  });
}


// ── Filtres chip (status bar) ─────────────────────────────────
function syncFilterChips() {
  const status = State.filters.status;
  document.querySelectorAll("#fm-status-chips .filter-chip").forEach(chip => {
    const value = chip.dataset.value;
    chip.classList.toggle("active", value === status);
  });
  _updateFilterModalTypeChips();
}

let _chipDebounce = null;
function setStatusChip(status) {
  State.filters.status = status;
  syncFilterChips();
  _updateFilterToggleLabel(); _updateFilterModalHeader();
  const fmChips = document.getElementById("fm-status-chips");
  if (fmChips) {
    fmChips.querySelectorAll(".filter-chip").forEach(b => {
      const s = b.getAttribute("onclick").match(/'([^']+)'/)?.[1];
      b.classList.toggle("active", s === status);
    });
  }
  _updateResetBtn();
  _updateFilterResultCount();
  clearTimeout(_chipDebounce);
  _chipDebounce = setTimeout(() => renderCards({ resetScroll: true }), 80);
}
function setSort(val) {
  State.filters.sort = val;
  _updateFilterToggleLabel(); _updateFilterModalHeader();
  const fmChips = document.getElementById("fm-sort-chips");
  if (fmChips) {
    fmChips.querySelectorAll(".filter-chip").forEach(b => {
      const v = b.getAttribute("onclick").match(/'([^']+)'/)?.[1];
      b.classList.toggle("active", v === val);
    });
  }
  _updateResetBtn();
  _updateFilterResultCount();
  localStorage.setItem("kulturo-sort", val);
  renderCards({ resetScroll: true });
}

// ── Global search ─────────────────────────────────────────────
async function handleSmartBack(event) {
  _handlingPopState = true;
  try {
    const confirmCancel = document.getElementById("confirm-cancel");
    if (confirmCancel) {
      confirmCancel.click();
      setTimeout(restoreOpenLayerHistory, 0);
      return;
    }
    if (document.getElementById("metadata-overlay")) {
      closeMetadataPanel({ restoreFocus: true });
      return;
    }
    if (document.getElementById("filter-modal-overlay")) {
      UI.closeFilterModal({ fromHistory: true });
      return;
    }
    if (document.getElementById("modal-overlay")) {
      const closed = await closeModal(false, { fromHistory: true });
      if (!closed) restoreOpenLayerHistory();
      return;
    }

    const target = event.state;
    if (target?.kulturo && target.page && target.page !== _currentPage) {
      navTo(target.page, { history: "none", preserveFilters: true, preserveSearch: true });
    }
  } finally {
    _handlingPopState = false;
  }
}

function bindGlobalEvents() {
  document.addEventListener("load", event => {
    if (event.target instanceof HTMLImageElement && event.target.matches("[data-fade-image]")) {
      event.target.classList.add("is-loaded");
    }
  }, true);

  let prefetchTimer = 0;
  let prefetchTarget = null;
  document.addEventListener("pointerover", event => {
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches) return;
    const target = event.target.closest?.("[data-prefetch-media]");
    if (!target || target === prefetchTarget) return;
    prefetchTarget = target;
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => prefetchDetail(target.dataset.prefetchMedia), 180);
  });
  document.addEventListener("pointerout", event => {
    const target = event.target.closest?.("[data-prefetch-media]");
    if (!target || target.contains(event.relatedTarget)) return;
    clearTimeout(prefetchTimer);
    if (prefetchTarget === target) prefetchTarget = null;
  });
  document.addEventListener("pointerdown", event => {
    const target = event.target.closest?.("[data-prefetch-media]");
    if (target) prefetchDetail(target.dataset.prefetchMedia);
  }, { passive: true });

  // Ripple effect sur les boutons
  document.addEventListener("click", e => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + "px";
    ripple.style.top  = (e.clientY - rect.top)  + "px";
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });

  document.addEventListener("input", e => {
    if (e.target.closest?.("#modal-overlay") && e.target.type !== "hidden") markModalDirty();
    if (e.target.id === "global-search") {
      const q = e.target.value.trim();
      State.filters.search = q;
      // Si on tape depuis une autre page, synchronise aussi toute la navigation.
      if (q.length > 0 && _currentPage !== "library") navTo("library", { preserveSearch: true });
      else if (_currentPage === "library") renderCards({ resetScroll: true });
    }
  });
  document.addEventListener("change", e => {
    if (e.target.closest?.("#modal-overlay") && e.target.type !== "hidden") markModalDirty();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistUiSnapshot();
    else syncBackToTop();
  });
  window.addEventListener("pagehide", persistUiSnapshot, { capture: true });
  window.addEventListener("beforeunload", e => {
    persistUiSnapshot();
    if (!_modalDirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
  window.addEventListener("popstate", handleSmartBack);
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const confirmCancel = document.getElementById("confirm-cancel");
    if (confirmCancel) confirmCancel.click();
    else if (document.getElementById("metadata-overlay")) closeMetadataPanel();
    else if (document.getElementById("filter-modal-overlay")) UI.closeFilterModal();
    else closeModal();
  });

  // La largeur de la fiche peut changer (rotation mobile, redimensionnement
  // desktop). On recalcule alors le vrai débordement du synopsis.
  let synopsisResizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(synopsisResizeTimer);
    synopsisResizeTimer = setTimeout(() => {
      document.querySelectorAll(".detail-synopsis-wrap[id^='syn-']").forEach(wrap => {
        _checkSynopsisOverflow(wrap.id.slice(4));
      });
    }, 120);
  });

  hydrateFadeImages(document);
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("removing");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 2800);
}

// ── Mise à jour de la PWA ────────────────────────────────────
function syncUpdateBanner() {
  const banner = document.getElementById("update-banner");
  if (!banner) return;
  const ready = Boolean(window.__kulturoUpdateRegistration?.waiting);
  banner.hidden = !ready || _updateBannerDismissed;
  document.getElementById("back-to-top")?.classList.toggle("is-obscured", !banner.hidden);
}

function dismissUpdateBanner() {
  _updateBannerDismissed = true;
  syncUpdateBanner();
}

function applyAppUpdate() {
  const registration = window.__kulturoUpdateRegistration;
  if (!registration?.waiting) {
    window.location.reload();
    return;
  }
  if (document.getElementById("modal-overlay") || document.getElementById("filter-modal-overlay")) {
    toast("Enregistre ou ferme d’abord la fenêtre ouverte.", "info");
    return;
  }

  const button = document.getElementById("apply-update-btn");
  if (button) {
    button.disabled = true;
    button.textContent = "Mise à jour…";
  }
  window.__kulturoUpdateAccepted = true;
  registration.waiting.postMessage({ type: "SKIP_WAITING" });

  // Secours pour les anciennes versions de WebKit qui omettent parfois
  // l'événement controllerchange en mode installé.
  setTimeout(() => {
    if (!window.__kulturoReloading) window.location.reload();
  }, 3500);
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Icons (inline SVG minifiés) ───────────────────────────────
const iconCalendar = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`;
const iconPlus    = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
const iconSearch  = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const iconX       = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const iconGrid    = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const iconPlay    = () => `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>`;
const iconEdit    = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const iconTrash   = () => `<svg class="icon-trash" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>`;
const iconRepeat  = () => `<svg class="icon-repeat" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`;
const iconChart   = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`;
const iconJournal = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M6 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z"/><path d="M7 17h13M8 7h8M8 11h6"/></svg>`;

const iconLogout  = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
const iconUser     = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;


// ── Prochaines sorties ────────────────────────────────────────
const UPCOMING_PREFS_KEY = "kulturo-upcoming-preferences";
const UPCOMING_TYPES = ["all", "movie", "tv", "game", "book"];
const UPCOMING_TYPE_META = {
  movie: { label: "Film",  icon: "🎬", mediaType: "movie", badge: "movie" },
  tv:    { label: "Série", icon: "📺", mediaType: "movie", badge: "movie" },
  game:  { label: "Jeu",   icon: "🎮", mediaType: "game",  badge: "game" },
  book:  { label: "Livre", icon: "📚", mediaType: "book",  badge: "book" },
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

function readUpcomingPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(UPCOMING_PREFS_KEY) || "{}");
    return {
      type: UPCOMING_TYPES.includes(saved.type) ? saved.type : "all",
      genre: typeof saved.genre === "string" && saved.genre ? saved.genre : "all",
      hideAdded: Boolean(saved.hideAdded),
    };
  } catch {
    return { type: "all", genre: "all", hideAdded: false };
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

function formatReleaseDate(value, precision = "day") {
  if (!value) return "Date à confirmer";
  const options = precision === "month"
    ? { month: "long", year: "numeric" }
    : { day: "numeric", month: "long", year: "numeric" };
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(`${value}T12:00:00`));
}

function daysUntilRelease(value, precision = "day") {
  if (!value || precision !== "day") return null;
  const today = new Date();
  const [year, month, day] = value.split("-").map(Number);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const releaseUtc = Date.UTC(year, month - 1, day);
  const days = Math.round((releaseUtc - todayUtc) / 86400000);
  return days >= 0 ? days : null;
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
  if (!grid || _currentPage !== "upcoming") return;
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
  const allResults = filteredUpcomingResults();
  const results = visibleUpcomingResults();
  const affinity = buildLibraryAffinity(State.entries);
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
      icon: "📅",
      title: emptyTitle,
      message: sourceMessage,
      actionHTML: hasFilter ? `<button class="btn btn-secondary btn-sm" onclick="UI.resetUpcomingFilters()">Tout afficher</button>` : "",
    };
    grid.innerHTML = sourceStatus === "error" ? errorState(stateOptions) : emptyState(stateOptions);
    return;
  }

  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const groups = new Map();
  results.forEach((it, idx) => {
    const date = it.release_date ? new Date(`${it.release_date}T12:00:00`) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "unknown";
    const label = date && !Number.isNaN(date.getTime())
      ? monthFormatter.format(date)
      : "Date à confirmer";
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push({ it, idx });
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
        ${group.items.map(({ it, idx }) => upcomingCardHTML(it, idx, recommendationForUpcoming(it, affinity))).join("")}
      </div>
    </section>`).join("");
  requestAnimationFrame(() => {
    grid.querySelectorAll(".upcoming-card").forEach((card, i) => {
      card.style.animationDelay = `${Math.min(i * 40, 480)}ms`;
    });
    hydrateFadeImages(grid);
  });
}

function upcomingCardHTML(it, idx, recommendation = null) {
  const inLibrary = isUpcomingInLibrary(it);
  const days = daysUntilRelease(it.release_date, it.date_precision);
  const type = upcomingTypeOf(it);
  const typeMeta = UPCOMING_TYPE_META[type] || UPCOMING_TYPE_META.movie;
  const regionIcon = type === "game"
    ? (it.availability_label === "Sortie Europe" ? "🇪🇺" : "🌍")
    : "🇫🇷";
  const secondary = type === "book" ? it.author : (type === "game" ? it.platform : null);
  const coverUrl = safeMediaUrl(it.cover_url);
  const cover = coverUrl
    ? `<img class="card-cover fade-image" data-fade-image src="${esc(coverUrl)}" alt="${esc(it.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="card-cover-placeholder" style="display:none">${typeMeta.icon}</div>`
    : `<div class="card-cover-placeholder">${typeMeta.icon}</div>`;

  return `
    <article class="media-card upcoming-card" data-upcoming-idx="${idx}" role="button" tabindex="0"
      onclick="UI.openUpcomingDetail(${idx})"
      onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();UI.openUpcomingDetail(${idx})}">
      <div class="upcoming-cover-wrap">
        ${cover}
        ${days !== null ? `<span class="release-countdown">${days === 0 ? "Aujourd'hui" : `J-${days}`}</span>` : ""}
        ${recommendation ? `<span class="upcoming-for-you" title="${esc(recommendation.reason)}" aria-label="Pour vous : ${esc(recommendation.reason)}">✦ Pour vous</span>` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(it.title)}</div>
        <div class="card-meta">
          <span class="badge badge-${typeMeta.badge}">${typeMeta.icon} ${typeMeta.label}</span>
          ${it.availability_label ? `<span class="upcoming-region-label">${regionIcon} ${esc(it.availability_label)}</span>` : ""}
        </div>
        <div class="release-date">${formatReleaseDate(it.release_date, it.date_precision)}</div>
        ${secondary ? `<div class="upcoming-secondary">${esc(secondary)}</div>` : ""}
        ${it.description ? `<div class="upcoming-desc">${esc(it.description)}</div>` : ""}
        <div class="upcoming-card-actions">
          <button class="btn ${inLibrary ? "btn-ghost" : "btn-secondary"} btn-sm upcoming-wishlist-btn" ${inLibrary ? "disabled" : ""} onclick="event.stopPropagation();UI.addUpcomingToWishlist(${idx})">
            ${inLibrary ? "✓ Dans la bibliothèque" : "+ Wishlist"}
          </button>
        </div>
      </div>
    </article>`;
}

async function addUpcomingToWishlist(idx, closeAfter = false) {
  const it = visibleUpcomingResults()[idx];
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

function canEnrichMediaDetails(entry) {
  if (!entry) return false;
  if (entry.media_type === "book") return true;
  return ["movie", "game"].includes(entry.media_type) && Boolean(entry.external_id);
}

const DETAIL_PREFETCH_TTL = 15 * 60_000;
const _detailPrefetchCache = new Map();

function detailPrefetchKey(entry) {
  return `${entry.media_type}:${entry.subtype || ""}:${entry.source_api || ""}:${entry.external_id || normalizeTitle(entry.title)}`;
}

async function fetchMediaDetails(entry) {
  if (entry.media_type === "movie" && entry.external_id) {
    return TMDbDetails.fetch(entry.external_id, entry.subtype || "movie");
  }
  if (entry.media_type === "game" && entry.external_id) return IGDBDetails.fetch(entry.external_id);
  if (entry.media_type === "book") return OpenLibraryDetails.fetch(entry.external_id, entry);
  return null;
}

function requestPrefetchedDetails(entry) {
  if (!canEnrichMediaDetails(entry)) return Promise.resolve(null);
  const key = detailPrefetchKey(entry);
  const cached = _detailPrefetchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = fetchMediaDetails(entry).catch(error => {
    _detailPrefetchCache.delete(key);
    throw error;
  });
  _detailPrefetchCache.set(key, { promise, expiresAt: Date.now() + DETAIL_PREFETCH_TTL });
  return promise;
}

function prefetchDetail(id) {
  const entry = State.entries.find(item => item.id === id);
  if (!entry || entry._detailsFetched || entry._detailsPending || !canEnrichMediaDetails(entry)) return;
  requestPrefetchedDetails(entry).catch(() => {});
}

async function openUpcomingDetail(idx) {
  const it = visibleUpcomingResults()[idx];
  if (!it) return;

  const mediaType = upcomingMediaTypeOf(it);
  const existing = findMatchingEntry({ ...it, media_type: mediaType });
  if (existing) {
    if (!existing.release_date) existing.release_date = it.release_date;
    openDetailPanel(existing.id);
    return;
  }

  const preview = {
    ...it,
    id: `upcoming-${String(upcomingKeyOf(it)).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    media_type: mediaType,
    status: null,
    rating: null,
    is_favorite: false,
  };

  const detailsLoading = !preview.description && canEnrichMediaDetails(preview);
  renderDetailPanel(preview, { preview: true, upcomingIdx: idx, detailsLoading });
  _scheduleSynopsisOverflowCheck(preview.id);

  try {
    const details = await requestPrefetchedDetails(preview);
    if (!details) {
      refreshDetailEnrichment(preview, { detailsLoading: false });
      return;
    }

    Object.entries(details).forEach(([field, value]) => {
      if (value != null && !preview[field]) preview[field] = value;
    });
    const body = document.getElementById(`detail-body-${preview.id}`);
    if (body) {
      _injectBackdrop(preview.backdrop_url, preview.id);
      refreshDetailEnrichment(preview, { detailsLoading: false });
    }
  } catch (err) {
    console.warn("[Detail upcoming] fetch error:", err);
    refreshDetailEnrichment(preview, { detailsLoading: false });
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


// ── Fiche détaillée ───────────────────────────────────────────
function renderDetailPanel(e, options = {}) {
  _modalDirty = false;
  const isPreview = options.preview === true;
  const isReadOnly = options.readOnly === true;
  const ratingDisplay = isPreview ? "" : ratingScoreHTML(e.rating, "detail-rating-score");
  const backdropUrl = safeMediaUrl(e.backdrop_url);
  const coverUrl = safeMediaUrl(e.cover_url);

  const externalUrl = (() => {
    const directUrl = safeMediaUrl(e.external_url);
    if (directUrl) return directUrl;
    if (!e.external_id && !e.title) return null;
    if (e.media_type === "game")  return `https://store.steampowered.com/search/?term=${encodeURIComponent(e.title)}`;
    if (e.media_type === "movie") return `https://www.imdb.com/find/?q=${encodeURIComponent(e.title)}`;
    if (e.media_type === "book")  return e.external_id ? `https://openlibrary.org/works/${e.external_id}` : `https://www.goodreads.com/search?q=${encodeURIComponent(e.title)}`;
    return null;
  })();
  const externalLabel = e.external_label || (e.media_type === "book" && e.external_id
    ? "Open Library"
    : ({ game:"Steam", movie:"IMDb", book:"Goodreads" }[e.media_type] || "Lien"));
  const externalIcon  = { game:"🎮", movie:"🎬", book:"📚" }[e.media_type] || "🔗";
  const externalHTML  = externalUrl
    ? `<a href="${esc(externalUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">${externalIcon} ${esc(externalLabel)}</a>`
    : "";

  const youtubeQuery     = encodeURIComponent(`${e.title} ${e.media_type === "game" ? "trailer" : e.media_type === "movie" ? "bande annonce" : "book trailer"}`);
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;
  const youtubeHTML      = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">▶ Trailer</a>`;

  // Backdrop header
  const backdropClass = backdropUrl ? "detail-backdrop has-backdrop" : (coverUrl ? "detail-backdrop has-backdrop has-fallback" : "detail-backdrop");

  const posterHTML = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="${esc(e.title)}" class="detail-poster fade-image" data-fade-image onerror="this.style.display='none'">`
    : `<div class="detail-poster detail-poster-placeholder">${TYPE_ICONS[e.media_type]||"🎭"}</div>`;

  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal detail-modal" data-media-accent="${esc(e.media_type || "movie")}" ${coverUrl ? `data-cover-accent-url="${esc(coverUrl)}"` : ""} role="dialog" aria-modal="true">

        <div class="${backdropClass}">
          <div class="detail-swipe-handle" aria-hidden="true"></div>
          <div class="detail-backdrop-gradient"></div>
          <button class="detail-close-btn btn-icon" onclick="UI.closeModal()">${iconX()}</button>
          <div class="detail-backdrop-content">
            ${posterHTML}
            <div class="detail-backdrop-info">
              <h2 class="detail-title">${esc(e.title)}</h2>
              ${ratingDisplay ? `<div class="detail-rating" id="detail-rating-${e.id}">${ratingDisplay}</div>` : ""}
              <div class="detail-badges">
                <span class="badge badge-${e.media_type}">${TYPE_ICONS[e.media_type]} ${getTypeLabel(e)}</span>
                ${e.status
                  ? `<span class="badge badge-${e.status}" id="detail-status-${e.id}">${STATUS_LABELS[e.status]}</span>`
                  : `<span class="badge badge-upcoming">📅 À venir</span>`}
                ${!isPreview ? `<span class="detail-fav ${e.is_favorite ? "is-active" : ""}" id="detail-fav-${e.id}" title="Coup de cœur" aria-label="Coup de cœur">♥</span>` : ""}
                ${!isPreview && !isReadOnly ? detailRepeatIndicatorHTML(e) : ""}
              </div>
            </div>
          </div>
        </div>

        <div class="detail-body" id="detail-body-${e.id}">${renderDetailBody(e, {
          readOnly: isReadOnly,
          detailsLoading: options.detailsLoading === true,
        })}</div>

        <div class="modal-footer">
          ${isReadOnly ? `
            <div class="detail-footer-actions detail-footer-actions-readonly">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" onclick="UI.closeModal()">Fermer</button>
            </div>` : isPreview ? `
            <div class="detail-footer-actions">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" onclick="UI.addUpcomingToWishlistFromModal(${options.upcomingIdx})">+ Wishlist</button>
            </div>` : `
            <button type="button" class="btn btn-danger btn-icon-only detail-delete-action" title="Supprimer ce média" aria-label="Supprimer ce média" onclick="UI.deleteEntry('${e.id}')"><span class="detail-delete-icon">${iconTrash()}</span></button>
            <div class="detail-footer-actions">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" onclick="UI.openEditFromDetail('${e.id}')">${iconEdit()} Modifier</button>
            </div>`}
        </div>
      </div>
    </div>`;

  pushHistoryLayer("modal", { modal: options.preview ? "upcoming" : "detail", mediaId: e.id || null });
  syncSystemBar(_currentPage, e.media_type);
  bindCoverAccent(root.querySelector(".detail-modal"), coverUrl);
  hydrateFadeImages(root);
  const backdropEl = root.querySelector(".detail-backdrop");
  if (backdropEl && coverUrl && !backdropUrl) {
    const cssCoverUrl = coverUrl.replace(/["\\\n\r]/g, "");
    backdropEl.style.setProperty("--fallback-img", `url("${cssCoverUrl}")`);
  }
  if (backdropUrl) requestAnimationFrame(() => _injectBackdrop(backdropUrl, e.id));
  setupMobileSheetSwipe({
    overlay: root.querySelector("#modal-overlay"),
    sheet: root.querySelector(".detail-modal"),
    handles: ".detail-backdrop",
    dismiss: () => closeModal(),
  });
}

function setupMobileSheetSwipe({ overlay, sheet, handles = ".modal-header", dismiss, shouldResetBeforeDismiss = () => false }) {
  if (!overlay || !sheet || typeof dismiss !== "function" || sheet.dataset.swipeBound === "true") return;
  const swipeHandles = [...sheet.querySelectorAll(handles)];
  if (!swipeHandles.length) return;
  sheet.dataset.swipeBound = "true";
  overlay.classList.add("mobile-swipe-overlay");
  sheet.classList.add("mobile-swipe-sheet");

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let distance = 0;
  let tracking = false;
  let resetTimer = 0;

  const reset = () => {
    tracking = false;
    distance = 0;
    overlay.classList.remove("is-swipe-tracking");
    sheet.style.transition = "transform var(--motion-base) var(--ease-interface)";
    sheet.style.transform = "translate3d(0, 0, 0)";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      if (!sheet.isConnected) return;
      sheet.style.transition = "";
      sheet.style.transform = "";
      sheet.style.animation = "";
    }, 230);
  };

  sheet.addEventListener("touchstart", event => {
    if (window.innerWidth > 680) return;
    const touch = event.touches[0];
    const gripDistance = touch.clientY - sheet.getBoundingClientRect().top;
    const touchesHeader = swipeHandles.some(handle => handle.contains(event.target));
    const touchesVisualGrip = event.target === sheet && gripDistance >= 0 && gripDistance <= 30;
    if (!touchesHeader && !touchesVisualGrip) return;
    if (event.target.closest("button, a, input, textarea, select, label")) return;
    clearTimeout(resetTimer);
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = performance.now();
    distance = 0;
    tracking = true;
    // Une animation CSS avec `fill: both` garde la priorité sur le transform.
    // On la fige donc avant de laisser la fiche suivre le doigt en direct.
    sheet.style.animation = "none";
    sheet.style.transition = "none";
    sheet.style.transform = "translate3d(0, 0, 0)";
    overlay.classList.add("is-swipe-settled");
    overlay.classList.add("is-swipe-tracking");
  }, { passive: true });

  sheet.addEventListener("touchmove", event => {
    if (!tracking) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (deltaY < 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      reset();
      return;
    }
    if (deltaY < 6) return;
    event.preventDefault();
    distance = Math.min(deltaY, window.innerHeight * .55);
    sheet.style.transform = `translate3d(0, ${distance}px, 0)`;
  }, { passive: false });

  sheet.addEventListener("touchend", () => {
    if (!tracking) return;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = distance / elapsed;
    tracking = false;
    if (distance > 92 || velocity > .55) {
      if (shouldResetBeforeDismiss()) {
        reset();
        dismiss();
        return;
      }
      overlay.classList.remove("is-swipe-tracking");
      overlay.classList.add("is-swipe-dismiss");
      sheet.style.setProperty("--swipe-start", `${distance}px`);
      sheet.style.animation = "";
      sheet.style.transition = "";
      sheet.style.transform = "";
      dismiss();
      return;
    }
    reset();
  }, { passive: true });

  sheet.addEventListener("touchcancel", reset, { passive: true });
}

// ── Body enrichi de la fiche détail ──────────────────────────
function quickRatingHTML(entry) {
  const current = Number(entry.rating) || 0;
  const safeId = String(entry.id).replace(/[^a-zA-Z0-9_-]/g, "");
  const stars = Array.from({ length: 5 }, (_, index) => {
    const full = (index + 1) * 2;
    const half = full - 1;
    const fullActive = current >= full;
    const halfActive = current >= half && !fullActive;
    const clipId = `quick-half-${safeId}-${index}`;
    return `
      <span class="quick-star-wrap">
        <svg class="quick-star-svg" viewBox="0 0 20 20" aria-hidden="true">
          <defs><clipPath id="${clipId}"><rect x="0" y="0" width="10" height="20"/></clipPath></defs>
          <polygon points="10,2 12.9,7.6 19,8.5 14.5,12.9 15.6,19 10,16 4.4,19 5.5,12.9 1,8.5 7.1,7.6" fill="${fullActive ? "var(--accent)" : "var(--border-2)"}"/>
          <polygon points="10,2 12.9,7.6 19,8.5 14.5,12.9 15.6,19 10,16 4.4,19 5.5,12.9 1,8.5 7.1,7.6" fill="${halfActive ? "var(--accent)" : "none"}" clip-path="url(#${clipId})"/>
        </svg>
        <button type="button" class="quick-star-zone quick-star-half" onclick="UI.quickRate('${entry.id}', ${half})" aria-label="Noter ${half} sur 10" aria-pressed="${current === half}"></button>
        <button type="button" class="quick-star-zone quick-star-full" onclick="UI.quickRate('${entry.id}', ${full})" aria-label="Noter ${full} sur 10" aria-pressed="${current === full}"></button>
      </span>`;
  }).join("");

  return `
    <div class="quick-rating" role="group" aria-label="Votre note">
      <div class="quick-rating-stars">${stars}</div>
      <span class="quick-rating-value">${current ? `★ ${current}/10` : "Non noté"}</span>
      ${current ? `<button type="button" class="quick-rating-clear" onclick="UI.quickRate('${entry.id}', 0)">Effacer</button>` : ""}
    </div>`;
}

function quickActionsHTML(entry) {
  const statusOptions = [
    ["wishlist", "♡", "Wishlist"],
    ["playing", "▶", "En cours"],
    ["finished", "✓", "Terminé"],
  ];
  return `
    <section class="detail-quick-actions" id="detail-quick-actions-${entry.id}" aria-label="Actions rapides">
      <div class="quick-actions-header">
        <span>Actions rapides</span>
        <span class="quick-actions-feedback" id="quick-feedback-${entry.id}" aria-live="polite"></span>
      </div>
      <div class="quick-status-control" role="group" aria-label="Statut">
        ${statusOptions.map(([value, icon, label]) => `
          <button type="button" class="quick-status-btn ${entry.status === value ? "active" : ""}" onclick="UI.quickSetStatus('${entry.id}', '${value}')" aria-pressed="${entry.status === value}">
            <span aria-hidden="true">${icon}</span>${label}
          </button>`).join("")}
      </div>
      <div class="quick-actions-row">
        <div class="quick-rating-group">
          <span class="quick-actions-label">Votre note</span>
          ${quickRatingHTML(entry)}
        </div>
        <div class="quick-personal-actions">
          <button type="button" class="quick-favorite-btn ${entry.is_favorite ? "active" : ""}" onclick="UI.quickToggleFavorite('${entry.id}')" aria-pressed="${Boolean(entry.is_favorite)}">
            <span aria-hidden="true">♥</span>
            <span>Coup de cœur</span>
          </button>
          ${quickRepeatHTML(entry)}
        </div>
      </div>
    </section>`;
}

function detailRepeatIndicatorHTML(entry) {
  const info = repeatInfo(entry);
  const progress = repeatProgressLabel(entry, info);
  const historyLabel = info.total ? `${info.done} ${info.total} fois` : "Aucun revisionnage";
  const active = info.repeats > 0 || Boolean(progress);
  const label = progress ? `${progress} · ${historyLabel}` : historyLabel;
  return `<span class="detail-repeat ${active ? "is-active" : ""} ${progress ? "is-progress" : ""}" id="detail-repeat-${entry.id}" title="${esc(label)}" aria-label="${esc(label)}">${iconRepeat()}<strong>${active ? `${info.total}×` : ""}</strong></span>`;
}

function quickRepeatHTML(entry) {
  const info = repeatInfo(entry);
  const progress = repeatProgressLabel(entry, info);
  const canAdd = Boolean(entry.status === "finished" || entry.date_finished || info.repeats > 0);
  const historyLabel = info.total ? `${info.done} ${info.total} fois` : "Pas encore terminé";
  const countLabel = progress || historyLabel;
  const fullLabel = progress ? `${progress} · ${historyLabel}` : historyLabel;
  const canAdjustDown = !progress && info.repeats > 0;
  const canAdjustUp = !progress && canAdd;
  const addTitle = progress
    ? "Le compteur augmentera au prochain passage sur Terminé"
    : canAdd ? info.action : "Disponible une fois terminé";
  return `
    <div class="quick-repeat-stepper ${canAdd ? "" : "is-disabled"} ${progress ? "is-progress" : ""}" role="group" aria-label="${esc(fullLabel)}">
      <button type="button" class="quick-repeat-adjust" onclick="UI.quickAdjustRepeat('${entry.id}', -1)" ${canAdjustDown ? "" : "disabled"} aria-label="Retirer un ${info.noun}">−</button>
      <span class="quick-repeat-value" title="${esc(fullLabel)}">${iconRepeat()}<span>${esc(countLabel)}</span></span>
      <button type="button" class="quick-repeat-adjust quick-repeat-add" onclick="UI.quickAdjustRepeat('${entry.id}', 1)" ${canAdjustUp ? "" : "disabled"} aria-label="${info.action} une fois de plus" title="${esc(addTitle)}">+</button>
    </div>`;
}

let _metadataReturnFocus = null;

function metadataChipHTML(entry, kind, value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue || !metadataDefinition(kind)) return "";
  let directUrl = "";
  if (kind === "cast" && Array.isArray(entry?.cast_people)) {
    const person = entry.cast_people.find(candidate => normalizeTitle(candidate?.name) === normalizeTitle(cleanValue));
    if (person?.imdb_id) directUrl = `https://www.imdb.com/name/${encodeURIComponent(person.imdb_id)}/`;
  }
  return `
    <button type="button" class="detail-chip detail-meta-link"
      data-meta-kind="${esc(kind)}"
      data-meta-value="${esc(cleanValue)}"
      data-meta-external="${esc(directUrl)}"
      onclick="UI.openMetadataFromElement(this)">
      <span>${esc(cleanValue)}</span><span aria-hidden="true">›</span>
    </button>`;
}

function metadataChipsHTML(entry, kind, value) {
  return splitMetadataValues(value).map(item => metadataChipHTML(entry, kind, item)).join("");
}

function openMetadataFromElement(element) {
  const kind = element?.dataset?.metaKind;
  const value = element?.dataset?.metaValue;
  const definition = metadataDefinition(kind);
  if (!definition || !value) return;

  document.getElementById("metadata-overlay")?.remove();
  _metadataReturnFocus = element;
  const matches = entriesForMetadata(State.entries, kind, value);
  const directUrl = safeMediaUrl(element.dataset.metaExternal);
  const external = metadataExternalLink(kind, value, directUrl || null);
  const externalUrl = safeMediaUrl(external?.url);
  const mediaRows = matches.map(entry => {
    const coverUrl = safeMediaUrl(entry.cover_url);
    return `
      <button type="button" class="metadata-media-row" data-media-id="${esc(entry.id)}" data-prefetch-media="${esc(entry.id)}" onclick="UI.openMetadataMedia(this.dataset.mediaId)">
        ${coverUrl
          ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" data-fade-image class="fade-image">`
          : `<span class="metadata-media-cover" aria-hidden="true">${TYPE_ICONS[entry.media_type] || "🎭"}</span>`}
        <span class="metadata-media-copy">
          <strong>${esc(entry.title)}</strong>
          <small>${esc(getTypeLabel(entry))}${entry.release_year ? ` · ${esc(entry.release_year)}` : ""}</small>
        </span>
        ${entry.rating ? ratingScoreHTML(entry.rating, "metadata-media-rating") : `<span class="metadata-media-arrow" aria-hidden="true">›</span>`}
      </button>`;
  }).join("");
  const countLabel = matches.length
    ? `${matches.length} média${matches.length > 1 ? "s" : ""} dans votre bibliothèque`
    : "Aucun média correspondant dans votre bibliothèque";

  document.body.insertAdjacentHTML("beforeend", `
    <div class="metadata-overlay" id="metadata-overlay" onclick="if(event.target.id==='metadata-overlay') UI.closeMetadataPanel()">
      <section class="metadata-sheet" role="dialog" aria-modal="true" aria-labelledby="metadata-sheet-title">
        <div class="metadata-sheet-handle" aria-hidden="true"></div>
        <header class="metadata-sheet-header">
          <div>
            <span>${esc(definition.label)}</span>
            <h3 id="metadata-sheet-title">${esc(value)}</h3>
            <p>${esc(countLabel)}</p>
          </div>
          <button type="button" class="btn-icon" onclick="UI.closeMetadataPanel()" aria-label="Fermer">${iconX()}</button>
        </header>
        <div class="metadata-sheet-body">
          ${mediaRows || `<div class="metadata-empty">Cette information deviendra utile lorsque votre bibliothèque contiendra une autre œuvre correspondante.</div>`}
        </div>
        ${externalUrl ? `
          <footer class="metadata-sheet-footer">
            <a class="btn btn-secondary" href="${esc(externalUrl)}" target="_blank" rel="noopener">${esc(external.label)} ↗</a>
          </footer>` : ""}
      </section>
    </div>`);
  pushHistoryLayer("metadata", { metadata: `${kind}:${value}` });
  hydrateFadeImages(document.getElementById("metadata-overlay"));

  const detailModal = document.querySelector("#modal-overlay .detail-modal");
  if (detailModal) detailModal.inert = true;
  const overlay = document.getElementById("metadata-overlay");
  setupMobileSheetSwipe({
    overlay,
    sheet: overlay?.querySelector(".metadata-sheet"),
    handles: ".metadata-sheet-handle, .metadata-sheet-header",
    dismiss: () => closeMetadataPanel(),
  });
  requestAnimationFrame(() => overlay?.classList.add("is-open"));
  setTimeout(() => overlay?.querySelector(".metadata-sheet .btn-icon")?.focus({ preventScroll: true }), 180);
}

function closeMetadataPanel({ restoreFocus = true, immediate = false } = {}) {
  if (!immediate && historyOwnsLayer("metadata")) {
    history.back();
    return;
  }
  const overlay = document.getElementById("metadata-overlay");
  const finish = () => {
    overlay?.remove();
    const detailModal = document.querySelector("#modal-overlay .detail-modal");
    if (detailModal) detailModal.inert = false;
    if (restoreFocus) _metadataReturnFocus?.focus?.({ preventScroll: true });
    _metadataReturnFocus = null;
  };
  if (!overlay || immediate) { finish(); return; }
  if (overlay.classList.contains("is-closing")) return;
  overlay.classList.add("is-closing");
  setTimeout(finish, 180);
}

function openMetadataMedia(id) {
  if (!State.entries.some(entry => entry.id === id)) return;
  closeMetadataPanel({ restoreFocus: false });
  setTimeout(() => openDetailPanel(id), 190);
}

function detailSectionHTML(label, html, className = "") {
  return `<div class="detail-section ${className}">
    <div class="detail-section-label">${label}</div>
    <div class="detail-section-content">${html}</div>
  </div>`;
}

function renderDetailSynopsisHTML(e, options = {}) {
  if (e.description) {
    const synId = `syn-${e.id}`;
    return detailSectionHTML("Synopsis",
      `<div class="detail-synopsis-wrap" id="${synId}">
        <div class="detail-synopsis-clip" id="${synId}-clip">
          <p class="detail-synopsis-text" id="${synId}-text">${esc(e.description)}</p>
        </div>
        <button type="button" class="detail-synopsis-toggle" onclick="UI.toggleSynopsis('${synId}')" aria-controls="${synId}-clip" aria-expanded="false" hidden>Voir plus</button>
      </div>`,
      "detail-synopsis-section"
    );
  }

  if (options.detailsLoading) {
    return detailSectionHTML("Synopsis",
      `<div class="detail-synopsis-skeleton" role="status" aria-busy="true" aria-label="Chargement du synopsis">
        <span class="sr-only">Chargement du synopsis…</span>
        <i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>
        <b aria-hidden="true"></b>
      </div>`,
      "detail-synopsis-section detail-synopsis-loading"
    );
  }

  return detailSectionHTML("Synopsis",
    `<p class="detail-synopsis-empty">Aucun synopsis n’est disponible pour ce média.</p>`,
    "detail-synopsis-section detail-synopsis-unavailable"
  );
}

function renderDetailInfoHTML(e, options = {}) {
  const metaRow = (label, value, key = label) => value
    ? `<div class="detail-meta-row" data-detail-key="${esc(String(key))}"><span class="detail-meta-label">${label}</span><span class="detail-meta-value">${esc(String(value))}</span></div>`
    : "";
  const metadataRow = (label, kind, value) => {
    const links = metadataChipsHTML(e, kind, value);
    return links
      ? `<div class="detail-meta-row detail-meta-row-links" data-detail-key="${esc(kind)}"><span class="detail-meta-label">${label}</span><span class="detail-meta-value detail-meta-links">${links}</span></div>`
      : "";
  };
  let html = "";

  // Informations factuelles non interactives propres à chaque type.
  const technicalMeta = [
    metaRow("Année", e.release_year),
    e.media_type === "movie" && e.subtype === "tv"
      ? metaRow("Saisons", e.seasons_count ? `${e.seasons_count} saison${e.seasons_count > 1 ? "s" : ""}` : null)
      : "",
    e.media_type === "movie" && e.subtype === "tv"
      ? metaRow("Épisodes", e.episodes_count ? `${e.episodes_count} épisodes` : null)
      : "",
    e.media_type === "movie" && e.subtype === "tv" ? metaRow("Statut", e.air_status) : "",
    e.media_type === "book" ? metaRow("Pages", e.page_count) : "",
    e.media_type === "book" ? metaRow("ISBN", e.isbn) : "",
  ].filter(Boolean).join("");
  if (technicalMeta) html += `<div class="detail-meta">${technicalMeta}</div>`;

  // Toutes les informations explorables sont regroupées vers le bas.
  const linkedMeta = [
    metadataRow("Genre", "genre", e.genre),
    e.media_type === "movie"
      ? metadataRow(e.subtype === "tv" ? "Créateur" : "Réalisateur", "director", e.directors || e.author)
      : "",
    e.media_type === "game" ? metadataRow("Développeur", "developer", e.developer || e.author) : "",
    e.media_type === "game" ? metadataRow("Éditeur", "publisher", e.publisher) : "",
    e.media_type === "book" ? metadataRow("Auteur", "author", e.author) : "",
    e.media_type === "book" ? metadataRow("Éditeur", "publisher", e.publisher) : "",
  ].filter(Boolean).join("");
  if (linkedMeta) html += `<div class="detail-meta detail-meta-linked">${linkedMeta}</div>`;

  if (e.media_type === "movie" && e.cast_members) {
    const castNames = Array.isArray(e.cast_people) && e.cast_people.length
      ? e.cast_people.map(person => person.name).filter(Boolean)
      : e.cast_members.split(",").map(name => name.trim()).filter(Boolean);
    const cast = castNames.map(name => metadataChipHTML(e, "cast", name)).join("");
    html += detailSectionHTML("Casting", `<div class="detail-chips">${cast}</div>`);
  }

  const awaitsMoreInfo = options.detailsLoading && (
    e.media_type === "book" || (["movie", "game"].includes(e.media_type) && Boolean(e.external_id))
  );
  if (awaitsMoreInfo) {
    html += `<div class="detail-info-skeleton" role="status" aria-label="Chargement des informations complémentaires">
      <span class="sr-only">Chargement des informations complémentaires…</span>
      <i aria-hidden="true"></i><i aria-hidden="true"></i>
    </div>`;
  }

  // L'historique personnel clôt systématiquement la fiche.
  const historyMeta = options.readOnly ? "" : [
    metaRow("Terminé", e.date_finished ? formatReleaseDate(e.date_finished) : null),
    metaRow("Ajouté", e.created_at ? new Date(e.created_at).toLocaleDateString("fr-FR") : null),
  ].filter(Boolean).join("");
  if (historyMeta) html += `<div class="detail-meta detail-meta-history">${historyMeta}</div>`;

  return html;
}

function renderDetailBody(e, options = {}) {
  let html = "";

  if (options.readOnly) {
    html += `<div class="activity-detail-notice">
      <span class="activity-detail-avatar" aria-hidden="true">${iconUser()}</span>
      <span><strong>${esc(e.username || "Un membre")}</strong> a partagé ce média. Cette fiche est en lecture seule.</span>
    </div>`;
  }

  if (e.status && !options.readOnly) html += quickActionsHTML(e);

  // Ces deux emplacements restent montés pendant l'enrichissement : les
  // actions, le focus et la position de lecture ne sont jamais reconstruits.
  html += `<div class="detail-synopsis-slot" id="detail-synopsis-slot-${e.id}">${renderDetailSynopsisHTML(e, options)}</div>`;
  html += `<div class="detail-info-slot" id="detail-info-slot-${e.id}"><div class="detail-info-content">${renderDetailInfoHTML(e, options)}</div></div>`;

  return html;
}

function replaceDetailSynopsis(entry, options = {}) {
  const slot = document.getElementById(`detail-synopsis-slot-${entry.id}`);
  if (!slot) return;
  const nextHTML = renderDetailSynopsisHTML(entry, options);
  const previous = slot.firstElementChild;
  const currentText = slot.querySelector(".detail-synopsis-text")?.textContent || "";

  // Si le synopsis était déjà présent et n'a pas changé, l'enrichissement des
  // autres informations ne doit pas le faire clignoter une seconde fois.
  if (entry.description && currentText === String(entry.description) &&
      !previous?.classList.contains("detail-synopsis-loading")) return;

  if (!nextHTML) {
    if (!previous) return;
    previous.classList.add("detail-synopsis-leaving");
    setTimeout(() => {
      if (!slot.isConnected) return;
      slot.replaceChildren();
      slot.classList.remove("is-transitioning");
    }, 180);
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = nextHTML.trim();
  const next = template.content.firstElementChild;
  if (!next) return;

  // Le squelette et le texte partagent temporairement la même cellule : la
  // place reste réservée pendant que leurs opacités se croisent.
  if (previous?.classList.contains("detail-synopsis-loading")) {
    slot.classList.add("is-transitioning");
    previous.classList.add("detail-synopsis-leaving");
    next.classList.add("detail-synopsis-arriving");
    slot.append(next);
    setTimeout(() => {
      if (!slot.isConnected) return;
      previous.remove();
      next.classList.remove("detail-synopsis-arriving");
      slot.classList.remove("is-transitioning");
    }, 270);
  } else {
    next.classList.add("detail-synopsis-arriving");
    slot.replaceChildren(next);
    setTimeout(() => next.classList.remove("detail-synopsis-arriving"), 270);
  }
}

function replaceDetailInfo(entry, options = {}) {
  const slot = document.getElementById(`detail-info-slot-${entry.id}`);
  if (!slot) return;
  const body = slot.closest(".detail-body");
  const previousScroll = body?.scrollTop || 0;
  const previousHeight = slot.getBoundingClientRect().height;
  const current = slot.querySelector(":scope > .detail-info-content");
  const next = document.createElement("div");
  next.className = "detail-info-content detail-info-arriving";
  next.innerHTML = renderDetailInfoHTML(entry, options);
  if (current?.innerHTML === next.innerHTML) return;

  clearTimeout(slot._detailInfoTimer);
  slot.classList.remove("is-resizing", "is-revealing", "is-transitioning");
  slot.style.height = `${previousHeight}px`;
  slot.classList.add("is-transitioning", "is-resizing", "is-revealing");
  current?.classList.add("detail-info-leaving");
  slot.append(next);
  const nextHeight = slot.getBoundingClientRect().height;
  const measuredNextHeight = next.scrollHeight;
  slot.getBoundingClientRect();
  requestAnimationFrame(() => {
    if (!slot.isConnected) return;
    slot.style.height = `${measuredNextHeight || nextHeight}px`;
  });
  slot._detailInfoTimer = setTimeout(() => {
    if (!slot.isConnected) return;
    current?.remove();
    next.classList.remove("detail-info-arriving");
    slot.style.height = "";
    slot.classList.remove("is-resizing", "is-revealing", "is-transitioning");
  }, 330);

  if (body) body.scrollTop = previousScroll;
}

function refreshDetailEnrichment(entry, options = {}) {
  replaceDetailSynopsis(entry, options);
  replaceDetailInfo(entry, options);
  if (entry.description) {
    // Le texte se pose d'abord ; le contrôle arrive ensuite sans clignoter.
    setTimeout(() => _scheduleSynopsisOverflowCheck(entry.id), 90);
  }
}

function syncOpenDetail(entry, feedback = "") {
  const quickActions = document.getElementById(`detail-quick-actions-${entry.id}`);
  if (quickActions) quickActions.outerHTML = quickActionsHTML(entry);

  const statusBadge = document.getElementById(`detail-status-${entry.id}`);
  if (statusBadge) {
    statusBadge.className = `badge badge-${entry.status}`;
    statusBadge.textContent = STATUS_LABELS[entry.status] || entry.status;
  }

  const favorite = document.getElementById(`detail-fav-${entry.id}`);
  if (favorite) favorite.classList.toggle("is-active", Boolean(entry.is_favorite));

  const repeat = document.getElementById(`detail-repeat-${entry.id}`);
  if (repeat) repeat.outerHTML = detailRepeatIndicatorHTML(entry);

  const ratingDisplay = document.getElementById(`detail-rating-${entry.id}`);
  if (ratingDisplay) ratingDisplay.innerHTML = ratingScoreHTML(entry.rating, "detail-rating-score");

  if (feedback) {
    const feedbackEl = document.getElementById(`quick-feedback-${entry.id}`);
    if (feedbackEl) {
      feedbackEl.textContent = feedback;
      feedbackEl.classList.add("is-visible");
      setTimeout(() => {
        if (!feedbackEl.isConnected) return;
        feedbackEl.classList.remove("is-visible");
        setTimeout(() => { if (feedbackEl.isConnected) feedbackEl.textContent = ""; }, 180);
      }, 1200);
    }
  }
}

async function persistQuickEntryChange(id, changes, feedback = "Enregistré") {
  const entry = State.entries.find(item => item.id === id);
  if (!entry || entry._quickSaving) return null;
  entry._quickSaving = true;

  const panel = document.getElementById(`detail-quick-actions-${id}`);
  panel?.classList.add("is-saving");
  panel?.querySelectorAll("button").forEach(button => { button.disabled = true; });
  const savingLabel = document.getElementById(`quick-feedback-${id}`);
  if (savingLabel) savingLabel.textContent = "Enregistrement…";

  try {
    const updated = await Media.update(id, changes);
    Object.assign(entry, updated);
    cacheEntriesLocally();
    markJournalDirty();
    renderCards();
    updateBadges();
    syncOpenDetail(entry, feedback);
    return entry;
  } catch (error) {
    const migrationMissing = Object.prototype.hasOwnProperty.call(changes, "repeat_count") &&
      /repeat_count|schema cache/i.test(String(error?.message || ""));
    toast(
      migrationMissing
        ? "Le compteur de revisionnage n’est pas disponible dans Supabase."
        : "Modification impossible : " + error.message,
      "error"
    );
    panel?.classList.remove("is-saving");
    panel?.querySelectorAll("button").forEach(button => { button.disabled = false; });
    if (savingLabel) savingLabel.textContent = "";
    return null;
  } finally {
    delete entry._quickSaving;
  }
}

async function quickSetStatus(id, status) {
  if (!["wishlist", "playing", "finished"].includes(status)) return;
  const entry = State.entries.find(item => item.id === id);
  if (!entry || entry.status === status) return;

  const previousStatus = entry.status;
  const transition = statusTransitionChanges(entry, status);
  const preview = { ...entry, ...transition.changes };
  const previewInfo = repeatInfo(preview);
  const feedback = transition.repeatStarted
    ? repeatProgressLabel(preview, previewInfo)
    : transition.repeatCompleted
      ? `${previewInfo.done} ${previewInfo.total} fois`
      : STATUS_LABELS[status];

  const updated = await persistQuickEntryChange(id, transition.changes, feedback);
  if (updated && status === "finished" && previousStatus !== "finished") launchConfetti();
}

async function quickRate(id, value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) return;
  const entry = State.entries.find(item => item.id === id);
  if (!entry || Number(entry.rating || 0) === rating) return;
  await persistQuickEntryChange(id, { rating: rating || null }, rating ? `★ ${rating}/10 enregistré` : "Note effacée");
}

async function quickToggleFavorite(id) {
  const entry = State.entries.find(item => item.id === id);
  if (!entry) return;
  const favorite = !entry.is_favorite;
  await persistQuickEntryChange(id, { is_favorite: favorite }, favorite ? "Ajouté aux favoris" : "Retiré des favoris");
}

async function quickAdjustRepeat(id, delta) {
  const direction = Number(delta);
  if (![1, -1].includes(direction)) return;
  const entry = State.entries.find(item => item.id === id);
  if (!entry) return;
  const info = repeatInfo(entry);
  if (direction > 0 && !entry.date_finished && entry.status !== "finished" && info.repeats === 0) {
    toast("Marquez d’abord ce média comme terminé.", "info");
    return;
  }
  const repeatCount = Math.max(0, Math.min(999, info.repeats + direction));
  if (repeatCount === info.repeats) return;
  const nextInfo = repeatInfo({ ...entry, repeat_count: repeatCount });
  await persistQuickEntryChange(
    id,
    { repeat_count: repeatCount },
    `${nextInfo.done} ${nextInfo.total} fois`
  );
}

function _checkSynopsisOverflow(entryId) {
  const wrap = document.getElementById(`syn-${entryId}`);
  if (!wrap) return;
  const p = wrap.querySelector(".detail-synopsis-text");
  const clip = wrap.querySelector(".detail-synopsis-clip");
  const btn = wrap.querySelector(".detail-synopsis-toggle");
  if (!p || !clip || !btn) return;

  const width = p.getBoundingClientRect().width;
  if (width < 1) return;

  // Mesurer une copie non tronquée est plus fiable que scrollHeight sur un
  // élément utilisant -webkit-line-clamp (résultat variable selon le navigateur).
  const styles = getComputedStyle(p);
  const measure = p.cloneNode(true);
  measure.removeAttribute("id");
  measure.setAttribute("aria-hidden", "true");
  Object.assign(measure.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${width}px`,
    height: "auto",
    maxHeight: "none",
    margin: "0",
    display: "block",
    overflow: "visible",
    visibility: "hidden",
    pointerEvents: "none",
    lineHeight: styles.lineHeight,
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
    fontWeight: styles.fontWeight,
    letterSpacing: styles.letterSpacing,
    whiteSpace: styles.whiteSpace,
    wordBreak: styles.wordBreak,
    overflowWrap: styles.overflowWrap,
    webkitLineClamp: "unset",
    webkitBoxOrient: "initial",
    webkitMaskImage: "none",
    maskImage: "none",
  });
  document.body.appendChild(measure);
  const naturalHeight = measure.scrollHeight;
  measure.remove();

  const lineHeight = Number.parseFloat(styles.lineHeight) || Number.parseFloat(styles.fontSize) * 1.65;
  const maxLines = Number.parseInt(getComputedStyle(wrap).getPropertyValue("--synopsis-lines"), 10) || 4;
  const collapsedHeight = Math.ceil(lineHeight * maxLines);
  const isOverflowing = naturalHeight > collapsedHeight + 1;

  // Ces deux hauteurs permettent une vraie transition dans les deux sens.
  // Une hauteur "auto" ne peut pas être animée de façon fiable sur Safari.
  wrap.style.setProperty("--synopsis-collapsed-height", `${collapsedHeight}px`);
  wrap.style.setProperty("--synopsis-expanded-height", `${naturalHeight}px`);

  wrap.classList.toggle("is-overflowing", isOverflowing);
  const wasHidden = btn.hidden;
  btn.hidden = !isOverflowing;
  if (isOverflowing && wasHidden) {
    btn.classList.remove("is-ready");
    requestAnimationFrame(() => {
      if (btn.isConnected && !btn.hidden) btn.classList.add("is-ready");
    });
  } else if (!isOverflowing) {
    btn.classList.remove("is-ready");
  }

  if (!isOverflowing) wrap.classList.remove("expanded");
  const isExpanded = isOverflowing && wrap.classList.contains("expanded");
  btn.textContent = isExpanded ? "Voir moins" : "Voir plus";
  btn.setAttribute("aria-expanded", String(isExpanded));
}

function _scheduleSynopsisOverflowCheck(entryId) {
  // Deux frames laissent à la modale le temps d'obtenir sa largeur définitive.
  requestAnimationFrame(() => requestAnimationFrame(() => _checkSynopsisOverflow(entryId)));

  // La police web peut modifier les retours à la ligne après le premier rendu.
  if (document.fonts?.ready) {
    document.fonts.ready
      .then(() => _checkSynopsisOverflow(entryId))
      .catch(() => {});
  }
}

function scrollExpandedSynopsisIntoView(wrap) {
  const body = wrap?.closest(".detail-body");
  const section = wrap?.closest(".detail-section");
  if (!body || !section) return;

  // Deux frames laissent démarrer l'ouverture du texte avant de déplacer le
  // conteneur. Le synopsis se cale alors en haut et masque Actions rapides.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!wrap.isConnected || !wrap.classList.contains("expanded")) return;
    const bodyRect = body.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const target = Math.max(0, body.scrollTop + sectionRect.top - bodyRect.top - 4);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    body.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
  }));
}

function _injectBackdrop(backdrop, entryId) {
  if (!backdrop) return;
  const detailBody = document.getElementById(`detail-body-${entryId}`);
  const bdEl = detailBody?.closest(".detail-modal")?.querySelector(".detail-backdrop");
  if (!bdEl) return;
  // Evite de doubler la couche si déjà présente
  if (bdEl.querySelector(".detail-backdrop-layer")) return;
  const img = new Image();
  img.onload = () => {
    if (!document.getElementById(`detail-body-${entryId}`) || !bdEl.isConnected || bdEl.querySelector(".detail-backdrop-layer")) return;
    const layer = document.createElement("div");
    layer.className = "detail-backdrop-layer";
    layer.style.backgroundImage = `url(${JSON.stringify(backdrop)})`;
    layer.style.opacity = "0";
    bdEl.insertBefore(layer, bdEl.firstChild);
    bdEl.style.backgroundImage = "none"; // retire la cover inline une fois le banner chargé
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.style.opacity = "1"; }));
    bdEl.classList.add("has-backdrop");
  };
  img.src = backdrop;
}

async function openDetailPanel(id) {
  const e = State.entries.find(x => x.id === id);
  if (!e) return;

  // Affichage immédiat avec ce qu'on a déjà en base
  const detailsLoading = !e.description && !e._detailsFetched && canEnrichMediaDetails(e);
  renderDetailPanel(e, { detailsLoading });
  _scheduleSynopsisOverflowCheck(e.id);

  // Si déjà enrichi, on injecte juste le backdrop sans refetch
  if (e._detailsFetched) {
    _injectBackdrop(e.backdrop_url, e.id);
    return;
  }
  if (e._detailsFetching) return;
  e._detailsFetching = true;

  try {
    // Si l'enrichissement précédent a été affiché mais pas sauvegardé, on
    // retente d'abord exactement ces champs sans refaire ni écraser les saisies.
    if (e._detailsPending && Object.keys(e._detailsPending).length) {
      try {
        const updated = await Media.update(e.id, e._detailsPending);
        Object.assign(e, updated);
        delete e._detailsPending;
        e._detailsFetched = true;
        cacheEntriesLocally();
        _injectBackdrop(e.backdrop_url, e.id);
      } catch (error) {
        console.warn("[Detail] persistence retry error:", error);
        toast("La sauvegarde des détails a encore échoué. Tes données personnelles restent intactes.", "error");
      }
      if (!e.description) refreshDetailEnrichment(e, { detailsLoading: false });
      return;
    }

    const details = await requestPrefetchedDetails(e);

    if (!details) {
      refreshDetailEnrichment(e, { detailsLoading: false });
      return;
    }
    if (Array.isArray(details.cast_people)) e.cast_people = details.cast_people;
    // Ne sauvegarder que les champs nouveaux (ne pas écraser ce que l'utilisateur a saisi)
    const toSave = {};
    const fields = ["backdrop_url","description","directors","cast_members","duration",
                    "seasons_count","episodes_count","air_status","watch_providers",
                    "developer","publisher","page_count","isbn","platform"];
    for (const f of fields) {
      const richerTranslatedDescription = f === "description" &&
        ["openlibrary", "igdb"].includes(e.source_api) && details[f] && details[f] !== e[f];
      if (details[f] != null && (!e[f] || richerTranslatedDescription)) {
        e[f] = details[f];
        toSave[f] = details[f];
      }
    }
    let persisted = true;
    if (Object.keys(toSave).length) {
      try {
        const updated = await Media.update(e.id, toSave);
        Object.assign(e, updated);
        cacheEntriesLocally();
      } catch (error) {
        persisted = false;
        e._detailsPending = { ...toSave };
        console.warn("[Detail] persistence error:", error);
        toast("Détails affichés, mais leur sauvegarde a échoué.", "error");
      }
    }
    e._detailsFetched = persisted;

    // Injecter le backdrop en fondu
    _injectBackdrop(e.backdrop_url, e.id);

    // Seuls les emplacements enrichis changent : les actions et le scroll
    // restent montés pendant l'arrivée progressive du synopsis.
    const body = document.getElementById(`detail-body-${e.id}`);
    if (body) {
      refreshDetailEnrichment(e, { detailsLoading: false });
    }

  } catch(err) {
    console.warn("[Detail] fetch error:", err);
    refreshDetailEnrichment(e, { detailsLoading: false });
  } finally {
    e._detailsFetching = false;
  }
}


// ── Animation nouvelle carte ──────────────────────────────────
function flashNewCard(title) {
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll(".media-card");
    for (const card of cards) {
      const t = card.querySelector(".card-title");
      if (t && t.textContent.trim().toLowerCase().includes(title.toLowerCase())) {
        card.classList.add("card-enter");
        card.addEventListener("animationend", () => card.classList.remove("card-enter"), { once: true });
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        break;
      }
    }
  });
}

// ── Interface publique (appelée depuis le HTML inline) ────────

// ── Loading bar ───────────────────────────────────────────────
let _loadingTimer = null;
function loadingStart() {
  const bar = document.getElementById("loading-bar-fill");
  if (!bar) return;
  if (_loadingTimer) clearTimeout(_loadingTimer);
  bar.style.transition = "none";
  bar.style.width = "0%";
  requestAnimationFrame(() => {
    bar.style.transition = "width 1.2s cubic-bezier(.1,0,.2,1)";
    bar.style.width = "70%";
  });
}
function loadingDone() {
  const bar = document.getElementById("loading-bar-fill");
  if (!bar) return;
  bar.style.transition = "width .2s ease";
  bar.style.width = "100%";
  _loadingTimer = setTimeout(() => {
    bar.style.transition = "opacity .3s ease";
    bar.style.opacity = "0";
    setTimeout(() => { bar.style.width = "0%"; bar.style.opacity = "1"; }, 300);
  }, 250);
}


// ── Confetti ──────────────────────────────────────────────────
function launchConfetti() {
  const colors = ["#d8b46a","#efcf8c","#7ea6ff","#ff7f96","#69d4a2","#fff"];
  const container = document.body;
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.cssText = `
      left: ${Math.random()*100}vw;
      background: ${colors[Math.floor(Math.random()*colors.length)]};
      width: ${4 + Math.random()*6}px;
      height: ${8 + Math.random()*8}px;
      animation-delay: ${Math.random()*600}ms;
      animation-duration: ${900 + Math.random()*800}ms;
      transform: rotate(${Math.random()*360}deg);
      border-radius: ${Math.random()>0.5?"50%":"2px"};
    `;
    container.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }
}



// ── Category tabs mobile ─────────────────────────────────────
function updateCategoryTabs(type, isFav = false) {
  // Tabs supprimés — on met juste à jour le badge FAB
  _updateFilterToggleLabel();
}

// ── Vue grille / liste ────────────────────────────────────────
// ── Taille des cartes (small / medium) ───────────────────────


async function saveUsername() {
  const val = document.getElementById("input-username")?.value?.trim();
  if (!val) { toast("Le pseudo ne peut pas être vide.", "error"); return; }
  try {
    await Profiles.upsert(State.user.id, val);
    State.username = val;
    toast("Pseudo enregistré ✓", "success");
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

function exportLibrary() {
  const cleanEntries = State.entries.map(entry => Object.fromEntries(
    Object.entries(entry).filter(([field]) => !field.startsWith("_"))
  ));
  const backup = {
    app: "Kulturo",
    version: CONFIG?.app?.version || null,
    exported_at: new Date().toISOString(),
    entries: cleanEntries,
    events: State.events.map(event => ({
      id: event.id,
      media_id: event.media_id,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      metadata: event.metadata || {},
    })),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kulturo-sauvegarde-${localISODate()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); } catch {}
  const backupLabel = document.getElementById("last-backup-label");
  if (backupLabel) backupLabel.textContent = formatLastBackup();
  toast(`${cleanEntries.length} média${cleanEntries.length > 1 ? "s" : ""} et ${State.events.length} événement${State.events.length > 1 ? "s" : ""} sauvegardés ✓`, "success");
}

function setLibraryDensity(value) {
  const density = applyLibraryDensity(value);
  try { localStorage.setItem(LIBRARY_DENSITY_KEY, density); } catch {}
  document.querySelectorAll(".library-density-btn").forEach(button => {
    const active = button.dataset.density === density;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

// ── Journal culturel personnel ────────────────────────────────
let _journalMode = (() => {
  try { return localStorage.getItem("kulturo-journal-mode") === "community" ? "community" : "personal"; }
  catch { return "personal"; }
})();
try {
  localStorage.removeItem("kulturo-journal-view");
  localStorage.removeItem("kulturo-community-view");
} catch {}
let _communityEntries = [];
let _communityLoaded = false;
let _journalMonthTarget = "all";
let _journalMonthKeys = [];

function syncJournalMode() {
  ["personal", "community"].forEach(mode => {
    const button = document.getElementById(`journal-mode-${mode}`);
    const panel = document.getElementById(`journal-${mode}-panel`);
    const active = _journalMode === mode;
    button?.classList.toggle("active", active);
    button?.setAttribute("aria-selected", String(active));
    if (button) button.tabIndex = active ? 0 : -1;
    if (panel) panel.hidden = !active;
  });
  const timeNav = document.getElementById("journal-time-nav");
  if (timeNav) timeNav.hidden = _journalMode !== "personal";
}

function setJournalMode(mode) {
  if (!["personal", "community"].includes(mode)) return;
  _journalMode = mode;
  try { localStorage.setItem("kulturo-journal-mode", mode); } catch {}
  renderJournal();
}

function visibleJournalEvents() {
  const existingIds = new Set(State.entries.map(entry => entry.id));
  // Les notations restent dans State.events pour les Tops et les sauvegardes.
  return State.events.filter(event => event.event_type !== "rated" && existingIds.has(event.media_id));
}

async function renderJournal() {
  syncJournalMode();
  if (_journalMode === "community") {
    await renderCommunity();
  } else {
    await renderPersonalJournal();
  }
  replayMotion(document.getElementById(`journal-${_journalMode}-panel`), "journal-panel-enter");
}

async function renderPersonalJournal() {
  const container = document.getElementById("journal-feed");
  if (!container) return;

  if (State.journalDirty) {
    container.innerHTML = loadingState("Chargement du journal…", { compact: true });
    await refreshJournalEvents({ silent: true });
  }

  if (!State.journalAvailable) {
    container.innerHTML = errorState({ title: "Journal indisponible", message: "Vérifiez la table <strong>media_events</strong> dans Supabase." });
    return;
  }
  renderCurrentJournalView();
}

function renderCurrentJournalView() {
  const container = document.getElementById("journal-feed");
  if (!container || !State.journalAvailable) return;
  const visible = visibleJournalEvents();
  container.innerHTML = renderJournalFeed(visible);
  syncJournalTimeNavigation(visible);
  hydrateFadeImages(container);
}

function journalDateLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd’hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function renderJournalFeed(events) {
  if (!events.length) {
    return emptyState({ icon: "📓", title: "Journal vide", message: "Vos prochaines actions apparaîtront ici." });
  }

  const months = new Map();
  events.forEach(event => {
    const key = yearMonthOf(event.occurred_at) || "unknown";
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(event);
  });

  return [...months.entries()].map(([monthKey, monthEvents]) => {
    const days = new Map();
    monthEvents.forEach(event => {
      const label = journalDateLabel(event.occurred_at);
      if (!days.has(label)) days.set(label, []);
      days.get(label).push(event);
    });
    const monthLabel = monthKey === "unknown"
      ? "Date inconnue"
      : new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
          .format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
    return `
      <section class="journal-month-group" id="journal-month-${esc(monthKey)}" data-journal-month="${esc(monthKey)}">
        <h2 class="journal-month-heading">${esc(monthLabel)}</h2>
        ${[...days.entries()].map(([date, items]) => `
          <section class="activity-date-group journal-date-group">
            <div class="activity-date-label">${esc(date)}</div>
            ${items.map(journalRowHTML).join("")}
          </section>`).join("")}
        ${monthKey === "unknown" ? "" : journalMonthSummaryHTML(monthKey)}
      </section>`;
  }).join("");
}

function journalMonthSummaryHTML(monthKey) {
  const summary = journalMonthSummary(State.events, State.entries, monthKey);
  const average = summary.average == null ? "—" : `★ ${summary.average.toFixed(1)}/10`;
  const favorite = summary.favorite;
  const favoriteCover = safeMediaUrl(favorite?.cover_url);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" })
    .format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
  return `
    <aside class="journal-month-summary" aria-label="Récapitulatif du mois">
      <div class="journal-month-summary-heading"><span>Le mois en bref</span><strong>${esc(monthLabel)}</strong></div>
      <div class="journal-month-summary-stats">
        <span><strong>${summary.completed}</strong><small>terminé${summary.completed > 1 ? "s" : ""}</small></span>
        <span><strong>${average}</strong><small>${summary.rated} noté${summary.rated > 1 ? "s" : ""}</small></span>
      </div>
      ${favorite ? `
        <button type="button" class="journal-month-favorite" data-prefetch-media="${esc(favorite.id)}" onclick="UI.openJournalMedia('${esc(favorite.id)}')">
          ${favoriteCover ? `<img src="${esc(favoriteCover)}" alt="" loading="lazy" data-fade-image class="fade-image">` : `<span aria-hidden="true">${TYPE_ICONS[favorite.media_type] || "🎭"}</span>`}
          <span><small>Favori du mois</small><strong>${esc(favorite.title)}</strong></span>
          ${favorite.rating ? ratingScoreHTML(favorite.rating, "journal-month-favorite-rating") : ""}
        </button>` : `<p class="journal-month-no-favorite">Aucun favori noté pour ce mois.</p>`}
    </aside>`;
}

function syncJournalTimeNavigation(events) {
  const select = document.getElementById("journal-month-select");
  const nav = document.getElementById("journal-time-nav");
  if (!select || !nav) return;
  _journalMonthKeys = [...new Set(events.map(event => yearMonthOf(event.occurred_at)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  if (_journalMonthTarget !== "all" && !_journalMonthKeys.includes(_journalMonthTarget)) _journalMonthTarget = "all";
  select.innerHTML = `<option value="all">Tout l’historique</option>` + _journalMonthKeys.map(key => {
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
      .format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
    return `<option value="${key}">${esc(label[0].toUpperCase() + label.slice(1))}</option>`;
  }).join("");
  select.value = _journalMonthTarget;
  syncJournalTimeButtons();
}

function syncJournalTimeButtons() {
  const index = _journalMonthKeys.indexOf(_journalMonthTarget);
  const previous = document.getElementById("journal-time-prev");
  const next = document.getElementById("journal-time-next");
  if (previous) previous.disabled = !_journalMonthKeys.length || (_journalMonthTarget !== "all" && index >= _journalMonthKeys.length - 1);
  if (next) next.disabled = _journalMonthTarget === "all" || index <= 0;
}

function jumpJournalMonth(value) {
  if (value !== "all" && !_journalMonthKeys.includes(value)) return;
  _journalMonthTarget = value;
  const select = document.getElementById("journal-month-select");
  if (select) select.value = value;
  syncJournalTimeButtons();
  const main = document.getElementById("main");
  const target = value === "all"
    ? document.querySelector("#journal-feed .journal-month-group")
    : document.getElementById(`journal-month-${value}`);
  if (!main || !target) return;
  const mainRect = main.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const stickyHeight = document.querySelector("#page-journal .journal-sticky-controls")?.offsetHeight || 0;
  const top = Math.max(0, main.scrollTop + targetRect.top - mainRect.top - stickyHeight - 8);
  main.scrollTo({ top, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
}

function stepJournalMonth(direction) {
  if (!_journalMonthKeys.length) return;
  const currentIndex = _journalMonthTarget === "all" ? -1 : _journalMonthKeys.indexOf(_journalMonthTarget);
  const nextIndex = Math.min(_journalMonthKeys.length - 1, Math.max(0, currentIndex + Number(direction || 0)));
  jumpJournalMonth(_journalMonthKeys[nextIndex]);
}

function journalRowHTML(event) {
  const entry = State.entries.find(item => item.id === event.media_id);
  if (!entry) return "";
  const presentation = journalEventPresentation(event, entry);
  const mediaIcon = TYPE_ICONS[entry.media_type] || "🎭";
  const coverUrl = safeMediaUrl(entry.cover_url);
  const coverHTML = coverUrl
    ? `<img src="${esc(coverUrl)}" class="activity-cover fade-image" data-fade-image alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="activity-cover activity-cover-ph">${mediaIcon}</div>`;
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const currentRating = Number(entry.rating);
  const ratingBadge = Number.isInteger(currentRating) && currentRating >= 1 && currentRating <= 10
    ? ratingScoreHTML(currentRating, "journal-rating-badge")
    : "";
  const type = getTypeLabel(entry);
  const dateOnly = Boolean(metadata.date_only || metadata.legacy);
  const time = dateOnly ? "" : new Date(event.occurred_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const attributes = `role="button" tabindex="0" data-prefetch-media="${entry.id}" aria-label="Ouvrir la fiche de ${esc(entry.title)}" onclick="UI.openJournalMedia('${entry.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();UI.openJournalMedia('${entry.id}')}"`;

  return `
    <article class="activity-row is-clickable journal-event-row" ${attributes}>
      ${coverHTML}
      <div class="activity-info">
        <div class="journal-event-label"><span aria-hidden="true">${presentation.icon}</span>${esc(presentation.label)}</div>
        <div class="activity-title">${esc(entry.title)}</div>
        <div class="activity-meta">
          <span class="badge badge-${entry.media_type}" style="font-size:.7rem">${esc(type)}</span>
          ${ratingBadge}
        </div>
      </div>
      ${time ? `<time class="activity-time" datetime="${esc(event.occurred_at)}">${time}</time>` : ""}
    </article>`;
}

function openJournalMedia(id) {
  const entry = State.entries.find(item => item.id === id);
  if (!entry) {
    toast("Ce média n’est plus disponible.", "error");
    return;
  }
  openDetailPanel(entry.id);
}

async function renderCommunity() {
  const container = document.getElementById("community-feed");
  if (!container) return;

  if (_communityLoaded) {
    container.innerHTML = renderCommunityFeed(_communityEntries);
    hydrateFadeImages(container);
    return;
  }

  container.innerHTML = loadingState("Chargement de la communauté…", { compact: true });

  try {
    const entries = await Activity.getFeed(100);
    _communityEntries = entries.filter(entry => entry.user_id !== State.user?.id);
    _communityLoaded = true;
    container.innerHTML = renderCommunityFeed(_communityEntries);
    hydrateFadeImages(container);
  } catch {
    container.innerHTML = errorState({ title: "Communauté indisponible", message: "Vérifiez la fonction <strong>get_activity_feed</strong> dans Supabase." });
  }
}

function renderCommunityFeed(entries) {
  if (!entries.length) {
    return `<div class="empty-state"><div class="empty-icon">🎭</div><h3>Aucune activité</h3><p>Les prochains ajouts des autres membres apparaîtront ici.</p></div>`;
  }

  const groups = new Map();
  entries.forEach(entry => {
    const label = journalDateLabel(entry.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  });

  return [...groups.entries()].map(([date, items]) => `
    <section class="activity-date-group community-date-group">
      <div class="activity-date-label">${esc(date)}</div>
      ${items.map(communityRowHTML).join("")}
    </section>
  `).join("");
}

function communityRowHTML(entry) {
  const icon = TYPE_ICONS[entry.media_type] || "🎭";
  const type = entry.media_type === "movie" && !entry.subtype ? "Film / Série" : getTypeLabel(entry);
  const status = STATUS_LABELS[entry.status] || "Ajouté";
  const coverUrl = safeMediaUrl(entry.cover_url);
  const coverHTML = coverUrl
    ? `<img src="${esc(coverUrl)}" class="activity-cover fade-image" data-fade-image alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="activity-cover activity-cover-ph">${icon}</div>`;
  const rating = entry.rating ? ratingScoreHTML(entry.rating, "community-rating") : "";
  const attributes = `role="button" tabindex="0" aria-label="Ouvrir la fiche de ${esc(entry.title)}" onclick="UI.openCommunityMedia('${entry.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();UI.openCommunityMedia('${entry.id}')}"`;

  return `
    <article class="activity-row is-clickable community-event-row" ${attributes}>
      ${coverHTML}
      <div class="activity-info">
        <div class="activity-line"><span class="activity-username">${esc(entry.username)}</span><span class="activity-verb">a ajouté</span></div>
        <div class="activity-title">${icon} ${esc(entry.title)}</div>
        <div class="activity-meta">
          <span class="badge badge-${entry.media_type}" style="font-size:.7rem">${esc(type)}</span>
          <span class="badge badge-${entry.status}" style="font-size:.7rem">${esc(status)}</span>
          ${rating}${entry.is_favorite ? `<span style="color:var(--accent)">♥</span>` : ""}
        </div>
      </div>
      <time class="activity-time" datetime="${esc(entry.created_at)}">${new Date(entry.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
    </article>`;
}

function openCommunityMedia(id) {
  const ownEntry = State.entries.find(entry => entry.id === id);
  if (ownEntry) {
    openDetailPanel(ownEntry.id);
    return;
  }

  const entry = _communityEntries.find(item => item.id === id);
  if (!entry) {
    toast("Ce média n’est plus disponible dans la communauté.", "error");
    return;
  }

  renderDetailPanel({
    ...entry,
    external_id: null,
    source_api: "activity",
  }, { readOnly: true });
}



window.UI = {
  openAddModal:    () => { _currentRating = 0; window._apiSelected = null; openModal(); },
  openEditModal:   (id) => { openDetailPanel(id); },
  openJournalMedia,
  openCommunityMedia,
  openMetadataFromElement,
  openMetadataMedia,
  closeMetadataPanel,
  setEditDetailsView,
  closeModal,
  openEditFromDetail: (id) => {
    const e = State.entries.find(x => x.id === id);
    if (!e) return;
    _currentRating = e.rating || 0;
    window._apiSelected = null;
    closeModal();
    setTimeout(() => openModal(e), 210);
  },
  closeModalOnBg,
  saveEntry,
  deleteEntry,
  toggleFav,
  quickSetStatus,
  quickRate,
  quickToggleFavorite,
  quickAdjustRepeat,
  fillFromApi,
  setRating,
  previewRating,
  clearPreview,
  navTo,
  scrollToTop,
  clearLibraryFilter,
  clearAllLibraryFilters,

  setTypeFilter,
  setStatusChip,
  toggleContinueSection,
  toggleFilterDrawer: () => {
    const root = document.getElementById("modal-root");
    // Evite double ouverture
    if (document.getElementById("filter-modal-overlay")) return;

    const _buildModal = () => {
      const statuses = ["all","wishlist","playing","finished","paused","dropped"];
      const sorts = [["created_at","Date d'ajout"],["date_finished","Date de fin"],["rating_desc","Note ↓"],["rating_asc","Note ↑"],["title","Titre"]];
      const types = [["all","Tous"],["game","🎮 Jeux"],["movie","🎬 Films / Séries"],["book","📚 Livres"]];
      const libraryDensity = readLibraryDensity();
      const typeChips = types.map(([v,l]) =>
        `<button class="filter-chip ${State.filters.type === v ? "active" : ""}"
          onclick="UI.setTypeFilter('${v}')">${l}</button>`
      ).join("");

      const activeCount = _countActiveFilters();
      const headerLabel = activeCount > 0 ? `Filtres <span class="filter-active-count">${activeCount}</span>` : "Filtres";

      const favChip = `<button class="filter-chip ${State.filters.favorite ? "active" : ""}"
        onclick="UI.toggleFavFilter()">♥ Coups de cœur</button>`;

      const statusChips = statuses.map(s => {
        const label = s === "all" ? "Tous" : STATUS_LABELS[s];
        return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}" data-value="${s}"
          onclick="UI.setStatusChip('${s}')">${label}</button>`;
      }).join("");

      const sortChips = sorts.map(([v, l]) =>
        `<button class="filter-chip ${State.filters.sort === v ? "active" : ""}"
          onclick="UI.setSort('${v}')">${l}</button>`
      ).join("");

      const hasActive = activeCount > 0;
      const resultCount = filterEntries(State.entries || []).length;

      return `
        <div class="modal-overlay filter-modal-overlay" id="filter-modal-overlay" onclick="if(event.target.id==='filter-modal-overlay') UI.closeFilterModal()">
          <div class="modal filter-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 id="fm-title">${headerLabel}</h3>
              <button class="btn-icon" onclick="UI.closeFilterModal()">${iconX()}</button>
            </div>
            <div class="modal-body">
              <div class="filter-modal-section">
                <div class="filter-modal-label">Catégorie</div>
                <div class="filter-modal-chips" id="fm-type-chips">${typeChips}</div>
              </div>
              <div class="filter-modal-section">
                <div class="filter-modal-label">Coup de cœur</div>
                <div class="filter-modal-chips" id="fm-fav-chips">${favChip}</div>
              </div>
              <div class="filter-modal-section">
                <div class="filter-modal-label">Statut</div>
                <div class="filter-modal-chips" id="fm-status-chips">${statusChips}</div>
              </div>

              <div class="filter-modal-section">
                <div class="filter-modal-label">Trier par</div>
                <div class="filter-modal-chips" id="fm-sort-chips">${sortChips}</div>
              </div>
              <div class="filter-modal-section">
                <div class="filter-modal-label">Densité de la bibliothèque</div>
                <div class="library-density-control" role="group" aria-label="Densité de la grille">
                  <button type="button" class="library-density-btn ${libraryDensity === "standard" ? "active" : ""}" data-density="standard" aria-pressed="${libraryDensity === "standard"}" onclick="UI.setLibraryDensity('standard')">
                    <span aria-hidden="true">▦</span><span><strong>Standard</strong><small>Affiches plus grandes</small></span>
                  </button>
                  <button type="button" class="library-density-btn ${libraryDensity === "compact" ? "active" : ""}" data-density="compact" aria-pressed="${libraryDensity === "compact"}" onclick="UI.setLibraryDensity('compact')">
                    <span aria-hidden="true">▦</span><span><strong>Compact</strong><small>Plus de titres visibles</small></span>
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="fm-reset-btn" style="${hasActive ? "" : "visibility:hidden"}" onclick="UI.resetFilters()">Réinitialiser</button>
              <button class="btn btn-primary" id="fm-apply-btn" onclick="UI.applyFilters()">Voir ${resultCount} résultat${resultCount > 1 ? "s" : ""}</button>
            </div>
          </div>
        </div>`;
    };

    root.insertAdjacentHTML("beforeend", _buildModal());
    pushHistoryLayer("filters");
    const overlay = document.getElementById("filter-modal-overlay");
    setupMobileSheetSwipe({
      overlay,
      sheet: overlay?.querySelector(".filter-modal"),
      dismiss: () => UI.closeFilterModal(),
    });
  },


  toggleSynopsis: (id) => {
    const wrap = document.getElementById(id);
    if (!wrap || !wrap.classList.contains("is-overflowing")) return;
    const isExpanded = wrap.classList.toggle("expanded");
    const btn = wrap.querySelector(".detail-synopsis-toggle");
    if (btn) {
      btn.textContent = isExpanded ? "Voir moins" : "Voir plus";
      btn.setAttribute("aria-expanded", String(isExpanded));
      btn.classList.remove("is-changing");
      requestAnimationFrame(() => btn.classList.add("is-changing"));
      btn.addEventListener("animationend", () => btn.classList.remove("is-changing"), { once: true });
    }
    if (isExpanded) scrollExpandedSynopsisIntoView(wrap);
  },

  applyFilters: () => {
    const count = filterEntries(State.entries || []).length;
    UI.closeFilterModal();
    setTimeout(() => toast(`${count} résultat${count > 1 ? "s" : ""}`, "info"), 220);
  },

  closeFilterModal: (options = {}) => {
    if (!options.fromHistory && historyOwnsLayer("filters")) {
      history.back();
      return;
    }
    const overlay = document.getElementById("filter-modal-overlay");
    if (!overlay) return;
    if (overlay.classList.contains("is-closing")) return;
    overlay.classList.add("is-closing");
    setTimeout(() => overlay.remove(), 180);
  },

  toggleFavFilter: () => {
    State.filters.favorite = !State.filters.favorite;
    renderCards({ resetScroll: true }); _updateFilterToggleLabel(); _updateFilterModalHeader();
    const btn = document.querySelector("#fm-fav-chips .filter-chip");
    if (btn) btn.classList.toggle("active", State.filters.favorite);
    _updateResetBtn();
    _updateFilterResultCount();
  },


  resetFilters: () => {
    State.filters.type = "all";
    State.filters.subtype = "all";
    State.filters.status = "all";
    State.filters.sort = "created_at";
    State.filters.favorite = false;
    State.filters.year = "all";
    State.filters.month = "all";
    State.filters.rating = "all";
    localStorage.setItem("kulturo-sort", "created_at");
    renderCards({ resetScroll: true }); buildFilterBar(); _updateFilterToggleLabel();
    UI.closeFilterModal();
  },
  setSort,
  setProfileYear,
  setProfileMonth,
  setProfilePeriod,
  setProfileMedia,
  openProfileCollection,
  openRatingCollection,
  setUpcomingType,
  setUpcomingGenre,
  setUpcomingHideAdded,
  resetUpcomingFilters,
  refreshUpcoming: () => {
    clearApiCache(key => key.includes("/discover/") || key.includes('"action":"upcoming"'));
    UpcomingState.loaded = false;
    UpcomingState.results = [];
    renderUpcoming(true);
  },
  addUpcomingToWishlist,
  addUpcomingToWishlistFromModal: (idx) => addUpcomingToWishlist(idx, true),
  openUpcomingDetail,
  setJournalMode,
  jumpJournalMonth,
  stepJournalMonth,
  saveUsername,
  exportLibrary,
  setLibraryDensity,
  applyAppUpdate,
  dismissUpdateBanner,
  showRatingLabel,
  hideRatingLabel,
  setModalType: (type) => {
    markModalDirty();
    const hidden = document.getElementById("f-type");
    if (hidden) hidden.value = type;
    document.querySelectorAll(".modal-type-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.type === type);
    });
    window._apiSelected = null;
    window._apiResults = [];
    updateApiAvailLabel(type);
    const q = document.getElementById("f-api-search")?.value?.trim();
    const input = document.getElementById("f-api-search");
    if (q && q.length >= 2) input?._kulturoSearch?.();
  },

  // ── Ajout compact ─────────────────────────────────────────
  wzSetStatus: (status) => {
    if (!_wizardState) return;
    markModalDirty();
    _wizardState = setAddDraftStatus(_wizardState, status);
    document.querySelectorAll(".wz-status-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.status === status);
      b.setAttribute("aria-pressed", String(b.dataset.status === status));
    });
    // Sync hidden field
    const el = document.getElementById("f-status");
    if (el) el.value = status;
    const secondary = document.querySelector(".wz-other-status");
    if (secondary) secondary.open = isSecondaryAddStatus(status);
  },

  wzUseManualType: (type) => {
    if (!_wizardState) return;
    const typed = document.getElementById("f-api-search")?.value?.trim() || _wizardState.title;
    const next = selectManualAdd(_wizardState, typed, type);
    if (next === _wizardState) {
      toast("Saisissez d’abord un titre.", "error");
      return;
    }
    markModalDirty();
    _wizardState = next;
    window._apiSelected = null;
    document.getElementById("f-api-search")?.blur();
    _renderWizard();
  },

  wzBack: () => {
    if (!_wizardState) return;
    if (_wizardState.step > 1) {
      _captureWizardOpinion();
      _wizardState = { ..._wizardState, step: 1, apiSelected: null };
      window._apiSelected = null;
      _renderWizard();
    }
  },
  handleAuth: async () => {
    const email    = document.getElementById("auth-email")?.value?.trim();
    const password = document.getElementById("auth-password")?.value;
    const btn = document.getElementById("auth-submit");
    if (!email || !password) { toast("Renseigne ton email et ton mot de passe.", "error"); return; }
    if (password.length < 6) { toast("Le mot de passe doit contenir au moins 6 caractères.", "error"); return; }
    try {
      if (btn) { btn.disabled = true; btn.textContent = "…"; }
      await Auth.signIn(email, password);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      if (btn?.isConnected) {
        btn.disabled = false;
        btn.textContent = "Se connecter";
      }
    }
  },
  signOut: async () => {
    try { await Auth.signOut(); } catch (e) { toast(e.message, "error"); }
  },
};
window.showPage = showPage;
