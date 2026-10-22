import { startMeasurement, performanceDiagnostics } from "./features/performance.js";
window.KulturoPerformance = performanceDiagnostics;
import { parseReadingProgress, parseSeriesProgress } from "./features/reading-progress.js";
import { normalizeISBN } from "./features/book-search.js";
import { parseMediaLink, linkProblemMessage } from "./features/quick-add-links.js";
import { startBarcodeScan, scannerSupported, scannerErrorMessage } from "./features/barcode-scanner.js";
import { revealImage } from "./features/image-reveal.js";
import { animateSynopsis } from "./features/synopsis-motion.js";
// ============================================================
// app.js — Kulturo · Logique principale
// ============================================================

import { initSupabase, Auth, Media as RemoteMedia, Profiles, Journal, Backup, Activity } from "./supabase.js";
import { searchMedia, apiAvailability, TMDb, IGDB, BookReleases, Hardcover, translateText } from "./api.js";
import {
  DEFAULT_LIBRARY_SORT,
  DEFAULT_LIBRARY_STATUS,
  LIBRARY_SORT_LABELS,
  LIBRARY_SORTS,
  LIBRARY_STATUSES,
  STATUS_LABELS,
  filterLibraryEntries,
  formatReleaseDate,
  isReplayEntry,
  librarySearchScore,
  librarySortOptions,
  localISODate,
  normalizeLegacyEntries,
  normalizeTitle,
  normalizedSubtype,
  repeatInfo,
  repeatProgressLabel,
  replayFilterLabel,
  resolveLibrarySort,
  sameMediaIdentity,
  statusLabelFor,
  statusTransitionChanges,
  mediaWords,
} from "./domain.js";
import {
  ADD_PRIMARY_STATUSES,
  ADD_SECONDARY_STATUSES,
  createAddDraft, addSearchTypes,
  isSecondaryAddStatus,
  selectAddResult,
  selectManualAdd,
  setAddDraftStatus,
} from "./features/add-flow.js";
import { elementFromHTML, reconcileKeyedChildren } from "./features/dom-updates.js";
import { cardSkeletons, emptyState, errorState, loadingState, setButtonBusy } from "./features/ui-states.js";
import { clearApiCache } from "./features/request-client.js";
import { applyCoverAccent, coverAccentForUrl, accentFromSample } from "./features/cover-accent.js";
import { entriesFingerprint, entriesForStorage } from "./features/library-cache.js";
import { createUiActionDispatcher } from "./features/ui-actions.js";
import { createDialogFocusManager } from "./features/dialog-focus.js";
import { buildRestorePlan, parseKulturoBackup, sanitizeBackupEvents } from "./features/backup-restore.js";
import { createUpcomingFeature } from "./features/upcoming.js";
import { createProfileFeature, LAST_BACKUP_KEY, formatLastBackup } from "./features/profile.js";
import { createJournalFeature } from "./features/journal.js";
import { createAsyncGate, sameOwner } from "./features/async-gate.js";
import { createMediaDetailFeature } from "./features/media-detail.js";
import { createLocalDatabase } from "./features/local-database.js";
import { createMediaRepository } from "./features/media-repository.js";
import { buildAppRoute, parseAppRoute } from "./features/app-route.js";
import { prefersReducedMotion, runViewTransition, motionDuration, prepareDialogClose, animateHeightChange, revealSurface, shouldDismissSheet, replaceModalContent, animateDialogUpdate } from "./features/motion.js";
import { applySystemBarColor, playCardSheen } from "./features/finesse.js";

// En mode installé, WebKit peut initialiser la hauteur dynamique sans la zone
// du Home Indicator. La classe permet d'appliquer un correctif ciblé aux PWA
// sans modifier le comportement de Safari classique ou du desktop.
const IS_STANDALONE_DISPLAY = Boolean(
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  window.navigator.standalone === true
);
document.documentElement.classList.toggle("is-standalone", IS_STANDALONE_DISPLAY);

const LIBRARY_DENSITY_KEY = "kulturo-library-density";
// Seul un tri choisi explicitement est mémorisé ; « auto » suit le statut affiché.
// L'ancienne clé « kulturo-sort » mélangeait choix et défaut : elle est abandonnée.
const SORT_STORAGE_KEY = "kulturo-sort-v2";
function persistSortPreference(value) {
  try {
    if (value === DEFAULT_LIBRARY_SORT) localStorage.removeItem(SORT_STORAGE_KEY);
    else localStorage.setItem(SORT_STORAGE_KEY, value);
  } catch {}
}
const uiActionDispatcher = createUiActionDispatcher(() => window.UI);
const dialogFocus = createDialogFocusManager(document);
let _modalReturnFocus = null;
let _modalReturnMediaId = null;
let _modalReturnControlId = null;
let mediaDetailFeature;
let detailSessions;
let openDetailPanel;
let renderDetailPanel;
let prefetchDetail;
let openMetadataFromElement;
let openMetadataMedia;
let closeMetadataPanel;
let revokeStaleRepeatEvents;
let canEnrichMediaDetails;
let requestPrefetchedDetails;
let refreshDetailEnrichment;
let _injectBackdrop;
let _scheduleSynopsisOverflowCheck;

function rememberModalReturnFocus(preferred = null, mediaId = null) {
  if (document.getElementById("modal-overlay")) return;
  if (_modalReturnFocus?.isConnected) return;
  const candidate = preferred?.closest?.("button, a, [tabindex], [role='button']") || preferred || document.activeElement;
  _modalReturnFocus = candidate && candidate !== document.body ? candidate : null;
  _modalReturnMediaId = mediaId == null ? null : String(mediaId);
  _modalReturnControlId = _modalReturnFocus?.id || null;
}

function modalReturnFocusTarget() {
  if (_modalReturnFocus?.isConnected) return _modalReturnFocus;
  if (_modalReturnControlId) {
    const replacement = document.getElementById(_modalReturnControlId);
    if (replacement) return replacement;
  }
  if (!_modalReturnMediaId) return null;
  const surface = [...document.querySelectorAll("[data-transition-media]")]
    .find(element => element.dataset.transitionMedia === _modalReturnMediaId);
  return surface?.matches?.("button, a, [tabindex], [role='button']")
    ? surface
    : surface?.querySelector?.("button, a, [tabindex], [role='button']") || null;
}

function syncDialogBackground() {
  const blocked = Boolean(document.querySelector(
    "#modal-overlay, #filter-modal-overlay, #metadata-overlay, #confirm-overlay"
  ));
  document.querySelectorAll("#topbar, #main, #bottom-nav, #update-banner, #back-to-top, #journal-floating-month").forEach(element => {
    element.inert = blocked;
    if (blocked) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  });
  journalFeature.syncFloating();
}

function activateDialog(dialog, options = {}) {
  if (!dialog) return;
  syncDialogBackground();
  dialogFocus.activate(dialog, {
    returnFocus: options.returnFocus || modalReturnFocusTarget,
    initialFocus: options.initialFocus,
    onEscape: options.onEscape || (() => closeModal()),
  });
}

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
  libraryStatus: "loading",
  events:     [],
  journalAvailable: false,
  journalError: null,
  journalDirty: true,
  filters: {
    type:     "all",
    subtype:  "all",
    status:   DEFAULT_LIBRARY_STATUS,
    favorite: false,
    replay:   false,
    search:   "",
    sort:     DEFAULT_LIBRARY_SORT,
    year:     "all",
    month:    "all",
    rating:   "all",
  },
  editingId:  null,
  scrollPos:  {},          // #2 — mémorise la position de scroll par page
};

const localDatabase = createLocalDatabase();
const Media = createMediaRepository({
  remote: RemoteMedia,
  database: localDatabase,
  getOwnerId: () => State.user?.id || null,
  isOnline: () => navigator.onLine !== false,
});

const ENTRY_CACHE_PREFIX = "kulturo-entries-v1:";
const UI_SNAPSHOT_KEY = "kulturo-ui-snapshot-v3";
let _remoteSyncUnavailable = false;
const libraryLoadGate = createAsyncGate();
const journalLoadGate = createAsyncGate();
const authFlowGate = createAsyncGate();
const _pendingScrollRestores = new Set();
let _uiSnapshotTimer = 0;
let _pendingRouteDetailId = null;

function currentViewContext() {
  return {
    profile: profileFeature.context(),
    journal: journalFeature.context(),
    upcoming: upcomingFeature.context(),
  };
}

function historyUrl(page, layer = null, payload = {}) {
  return buildAppRoute({ page, layer, payload, filters: State.filters, views: currentViewContext() });
}

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
      ownerId: State.user.id,
      page,
      scrollPos: State.scrollPos,
      filters: State.filters,
      views: currentViewContext(),
    }));
    if (_historyReady && history.state?.kulturo && !_handlingPopState) {
      const state = history.state;
      history.replaceState(state, "", historyUrl(state.page || page, state.layer || null, state));
    }
  } catch {}
}

function scheduleUiSnapshot() {
  clearTimeout(_uiSnapshotTimer);
  _uiSnapshotTimer = setTimeout(persistUiSnapshot, 120);
}

function restoreUiSnapshot() {
  try {
    const snapshot = JSON.parse(sessionStorage.getItem(UI_SNAPSHOT_KEY) || "null");
    const ownerId = String(State.user?.id || "");
    const expired = !snapshot || Date.now() - Number(snapshot.savedAt || 0) > 24 * 60 * 60_000;
    const wrongOwner = snapshot && String(snapshot.ownerId || "") !== ownerId;
    if (expired || wrongOwner) {
      sessionStorage.removeItem(UI_SNAPSHOT_KEY);
      return null;
    }
    const allowedPages = new Set(["library", "dashboard", "upcoming", "journal"]);
    if (allowedPages.has(snapshot.page)) {
      const safeScroll = Object.fromEntries(Object.entries(snapshot.scrollPos || {})
        .filter(([key, value]) => allowedPages.has(key) && Number.isFinite(Number(value)))
        .map(([key, value]) => [key, Math.max(0, Number(value))]));
      State.scrollPos = { ...State.scrollPos, ...safeScroll };
      safeScroll && Object.keys(safeScroll).forEach(key => _pendingScrollRestores.add(key));
    }
    const filters = snapshot.filters;
    if (filters && typeof filters === "object") {
      const allowedTypes = new Set(["all", "movie", "game", "book"]);
      const allowedSubtypes = new Set(["all", "movie", "tv"]);
      const allowedStatuses = new Set(["all", ...LIBRARY_STATUSES]);
      const allowedSorts = new Set(LIBRARY_SORTS);
      State.filters.type = allowedTypes.has(filters.type) ? filters.type : "all";
      State.filters.subtype = allowedSubtypes.has(filters.subtype) ? filters.subtype : "all";
      State.filters.status = allowedStatuses.has(filters.status) ? filters.status : DEFAULT_LIBRARY_STATUS;
      State.filters.favorite = Boolean(filters.favorite);
      State.filters.replay = Boolean(filters.replay);
      State.filters.search = typeof filters.search === "string" ? filters.search.slice(0, 120) : "";
      State.filters.sort = allowedSorts.has(filters.sort) ? filters.sort : DEFAULT_LIBRARY_SORT;
      State.filters.year = filters.year === "all" || Number.isFinite(Number(filters.year)) ? filters.year : "all";
      State.filters.month = typeof filters.month === "string" ? filters.month : "all";
      State.filters.rating = filters.rating === "all" || Number.isFinite(Number(filters.rating)) ? filters.rating : "all";
    }
    profileFeature.restoreContext(snapshot.views?.profile);
    journalFeature.restoreContext(snapshot.views?.journal);
    upcomingFeature.restoreContext(snapshot.views?.upcoming);
    return snapshot;
  } catch {
    return null;
  }
}

function clearUiSnapshot() {
  try { sessionStorage.removeItem(UI_SNAPSHOT_KEY); } catch {}
  _pendingScrollRestores.clear();
}

function restorePageScroll(name) {
  if (!_pendingScrollRestores.has(name) || _currentPage !== name) return;
  if (name === "library" && State.libraryStatus === "loading" && !State.entries.length) return;
  const main = document.getElementById("main");
  if (!main) return;
  const requested = Math.max(0, Number(State.scrollPos[name]) || 0);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (_currentPage !== name || !main.isConnected) return;
    const maximum = Math.max(0, main.scrollHeight - main.clientHeight);
    main.scrollTop = Math.min(requested, maximum);
    _pendingScrollRestores.delete(name);
    syncBackToTop();
  }));
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
    const cleanEntries = entriesForStorage(State.entries);
    localStorage.setItem(key, JSON.stringify(cleanEntries));
  } catch (error) {
    console.warn("[Cache] Sauvegarde locale impossible :", error);
  }
  Media.cache(State.entries).catch(error => console.warn("[Local] Sauvegarde IndexedDB impossible :", error));
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

function clearCachedEntries(userId = State.user?.id) {
  if (!userId) return;
  try { localStorage.removeItem(`${ENTRY_CACHE_PREFIX}${userId}`); } catch {}
}

async function primeEntriesFromCache() {
  const legacy = readCachedEntries();
  try {
    const cached = await Media.hydrate(Array.isArray(legacy) ? legacy : []);
    const hasSnapshot = await localDatabase.hasEntrySnapshot(State.user?.id).catch(() => false);
    if (!Array.isArray(cached) || (!hasSnapshot && !cached.length)) return false;
    State.entries = normalizeLegacyEntries(cached);
    State.libraryStatus = "ready";
    return true;
  } catch (error) {
    if (!Array.isArray(legacy)) return false;
    console.warn("[Local] Lecture IndexedDB impossible, ancien instantané utilisé :", error);
    State.entries = normalizeLegacyEntries(legacy);
    return true;
  }
}

async function primeEventsFromCache() {
  if (!State.user?.id) return false;
  try {
    const [events, hasSnapshot] = await Promise.all([
      localDatabase.getEvents(State.user.id),
      localDatabase.hasEventSnapshot(State.user.id),
    ]);
    if (!hasSnapshot && !events.length) return false;
    State.events = events;
    State.journalAvailable = true;
    State.journalDirty = false;
    return true;
  } catch {
    return false;
  }
}

// ── Labels ───────────────────────────────────────────────────
const TYPE_LABELS  = { game:"Jeu", movie:"Film", book:"Livre" };

// Retourne "Série" si c'est une série TMDb, sinon le label par défaut
function getTypeLabel(e) {
  if (e.media_type === "movie" && e.subtype === "tv") return "Série";
  return TYPE_LABELS[e.media_type] || e.media_type;
}

function searchCoverUrl(value) {
  const safe = safeMediaUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  if (url.hostname === "image.tmdb.org") url.pathname = url.pathname.replace(/\/t\/p\/(?:w500|original)\//, "/t/p/w185/");
  if (url.hostname === "images.igdb.com") url.pathname = url.pathname.replace("/t_cover_big/", "/t_cover_small/");
  return url.href;
}

function safeMediaUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function bindCoverAccent(element, coverUrl, fallbackImageUrl = "") {
  const cleanUrl = safeMediaUrl(coverUrl);
  const cleanFallbackUrl = safeMediaUrl(fallbackImageUrl);
  if (!element) return;
  if (!cleanUrl && !cleanFallbackUrl) {
    delete element.dataset.coverAccentUrl;
    delete element.dataset.coverAccentFallback;
    delete element.dataset.coverAccent;
    element.style.removeProperty("--cover-ambient");
    element.style.removeProperty("--cover-ambient-soft");
    element.style.removeProperty("--accent");
    element.style.removeProperty("--accent-2");
    element.style.removeProperty("--accent-glow");
    return;
  }
  const preserveAccent = element.dataset.coverAccent === "dominant" && element.dataset.coverAccentUrl === (cleanUrl || cleanFallbackUrl);
  element.dataset.coverAccentUrl = cleanUrl || cleanFallbackUrl;
  element.dataset.coverAccentFallback = cleanUrl && cleanFallbackUrl ? cleanFallbackUrl : "";
  if (!preserveAccent) {
    applyCoverAccent(element, accentFromSample(128, 128, 128));
    element.dataset.coverAccent = "pending";
  }
  const identity = element.dataset.coverAccentUrl;
  const fallbackIdentity = element.dataset.coverAccentFallback;
  (async () => {
    let accent = await coverAccentForUrl(identity);
    if (!accent && fallbackIdentity) accent = await coverAccentForUrl(fallbackIdentity);
    if (!element.isConnected || element.dataset.coverAccentUrl !== identity || element.dataset.coverAccentFallback !== fallbackIdentity) return;
    if (!accent) {
      element.dataset.coverAccent = "fallback";
      return;
    }
    applyCoverAccent(element, accent);
    if (element.matches(".detail-modal, .modal-wizard, .edit-modal")) syncSystemBar(_currentPage, null, accent.system);
  })().catch(() => { if (element.isConnected) element.dataset.coverAccent = "fallback"; });
}

function hydrateFadeImages(root = document) {
  root.querySelectorAll?.("img[data-fade-image]").forEach(image => {
    revealImage(image);
  });
}

function findMatchingEntry(candidate, excludeId = null) {
  return State.entries.find(entry => entry.id !== excludeId && sameMediaIdentity(candidate, entry)) || null;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (typeof CONFIG === "undefined") {
    console.error("CONFIG non défini — vérifiez que config.js est chargé.");
    document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;height:100dvh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)"><b>Erreur : config.js introuvable</b><p style="font-size:var(--type-body);color:#a0a0b0">Vérifiez que config.js est présent dans votre dépôt GitHub.</p></div>';
    return;
  }
  try {
    if (!initSupabase()) {
      document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;height:100dvh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem;text-align:center;padding:max(2rem,env(safe-area-inset-top,0px)) max(2rem,env(safe-area-inset-right,0px)) max(2rem,env(safe-area-inset-bottom,0px)) max(2rem,env(safe-area-inset-left,0px))"><b>Configuration Supabase manquante</b><p style="font-size:var(--type-body);color:#a0a0b0">Renseignez les valeurs publiques Supabase dans config.js.</p></div>';
      return;
    }
    // L'instantané local est utilisable dès son affichage, même si Supabase
    // met plusieurs secondes à répondre.
    bindGlobalEvents();
    const startupTask = authFlowGate.begin();
    const sessionUser = await Auth.getSessionUser().catch(() => null);
    const existingUser = sessionUser || await Auth.getUser().catch(() => null);
    if (!authFlowGate.isCurrent(startupTask)) return;
    if (existingUser) {
      State.user = existingUser;
      State.username = null;
      // Une restauration de page reste immédiatement utile même si le
      // navigateur a suspendu l'onglet et si Supabase met quelques instants à
      // répondre. Le réseau remplace ensuite cet instantané dès qu'il arrive.
      await primeEntriesFromCache();
      await primeEventsFromCache();
      const snapshot = restoreUiSnapshot();
      const route = applyRouteContext();
      renderApp();
      restoreNavigation(snapshot, route);
      await loadEntries();
      if (!authFlowGate.isCurrent(startupTask)) return;
    } else {
      renderAuthPage();
    }
    authFlowGate.finish(startupTask);
    Auth.onAuthChange(async (event, user) => {
      const authTask = authFlowGate.begin();
      const previousUserId = State.user?.id || null;
      try {
        State.user = user;
        if (event === "SIGNED_IN" && user) {
          State.username = null;
          await primeEntriesFromCache();
          await primeEventsFromCache();
          const snapshot = restoreUiSnapshot();
          const route = applyRouteContext();
          renderApp();
          restoreNavigation(snapshot, route);
          await loadEntries();
          if (!authFlowGate.isCurrent(authTask) || !sameOwner(user.id, State.user?.id)) return;
        } else if (event === "SIGNED_OUT") {
          cancelScheduledLibraryRender();
          clearTimeout(_uiSnapshotTimer);
          _uiSnapshotTimer = 0;
          document.querySelectorAll("[data-kulturo-search]").forEach(input => input._kulturoAbortSearch?.());
          detailSessions?.dispose();
          dialogFocus.clear({ restoreFocus: false });
          libraryLoadGate.cancel();
          journalLoadGate.cancel();
          profileFeature.cancel();
          journalFeature.cancel();
          upcomingFeature.reset();
          clearCachedEntries(previousUserId);
          await Media.clearOwner(previousUserId).catch(() => {});
          clearUiSnapshot();
          _remoteSyncUnavailable = false;
          State.entries = [];
          State.libraryStatus = "loading";
          State.events = [];
          State.scrollPos = {};
          Object.assign(State.filters, {
            type: "all", subtype: "all", status: DEFAULT_LIBRARY_STATUS,
            favorite: false, replay: false, search: "", sort: DEFAULT_LIBRARY_SORT,
            year: "all", month: "all", rating: "all",
          });
          journalFeature.reset();
          profileFeature.reset();
          State.journalAvailable = false;
          State.journalError = null;
          State.journalDirty = true;
          State.username = null;
          _saveInProgress = false;
          _restoreInProgress = false;
          _modalDirty = false;
          _pendingRestorePlan = null;
          _pendingRestoreEvents = null;
          _modalReturnFocus = null;
          _modalReturnMediaId = null;
          _modalReturnControlId = null;
          _historyReady = false;
          renderAuthPage();
        }
      } finally {
        authFlowGate.finish(authTask);
      }
    });
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

// ── Barre système ─────────────────────────────────────────────
let _systemPage = "library";
let _systemMediaType = null;

function syncSystemBar(page = _systemPage, mediaType = _systemMediaType, customColor = null) {
  _systemPage = page || "library";
  _systemMediaType = mediaType || null;
  const pageColors = { library: "#0c0d11", upcoming: "#0e1017", journal: "#0c1011", dashboard: "#11100d" };
  const mediaColors = { movie: "#171014", game: "#0e131d", book: "#0d1713" };
  const color = customColor || (mediaType ? (mediaColors[mediaType] || pageColors[page]) : (pageColors[page] || pageColors.library));
  applySystemBarColor(color);
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
    history.replaceState(state, "", historyUrl(page));
    return;
  }
  if (history.state?.page === page && !history.state?.layer) return;
  history.pushState(state, "", historyUrl(page));
}

function pushHistoryLayer(layer, payload = {}) {
  if (_handlingPopState || !layer) return;
  if (history.state?.kulturo && history.state.layer === layer) {
    history.replaceState(appHistoryState(_currentPage, layer, payload), "", historyUrl(_currentPage, layer, payload));
    return;
  }
  history.pushState(appHistoryState(_currentPage, layer, payload), "", historyUrl(_currentPage, layer, payload));
}

function historyOwnsLayer(layer) {
  return !_handlingPopState && history.state?.kulturo && history.state.layer === layer;
}

function restoreOpenLayerHistory() {
  let layer = null;
  let payload = {};
  if (document.getElementById("metadata-overlay")) layer = "metadata";
  else if (document.getElementById("filter-modal-overlay")) layer = "filters";
  else if (document.getElementById("modal-overlay")) {
    layer = _detailEditContext ? "edit" : "modal";
    const detailId = document.querySelector("#modal-overlay .detail-modal")?.dataset.detailMediaId;
    payload = detailId
      ? { modal: "detail", mediaId: detailId }
      : _detailEditContext ? { modal: "edit", mediaId: _detailEditContext.id } : {};
  }
  history.pushState(appHistoryState(_currentPage, layer, payload), "", historyUrl(_currentPage, layer, payload));
}

function applyRouteContext(route = parseAppRoute(window.location.hash)) {
  if (route) {
    Object.assign(State.filters, route.filters);
    profileFeature.restoreContext(route.views.profile);
    journalFeature.restoreContext(route.views.journal);
    upcomingFeature.restoreContext(route.views.upcoming);
  }
  return route;
}

function restoreNavigation(snapshot = restoreUiSnapshot(), preparedRoute = undefined) {
  const route = preparedRoute === undefined ? applyRouteContext() : preparedRoute;
  const routeDetailId = route?.payload?.modal === "detail" ? route.payload.mediaId : null;
  const existingHistoryOwnsDetail = Boolean(
    history.state?.kulturo && history.state.layer === "modal"
    && history.state.modal === "detail"
    && String(history.state.mediaId || "") === String(routeDetailId || "")
  );
  let saved = "library";
  try { saved = localStorage.getItem("kulturo-nav") || saved; } catch {}
  saved = route?.page || snapshot?.page || saved;
  const allowed = new Set(["library", "dashboard", "upcoming", "journal"]);
  const normalized = saved === "activity" ? "journal" : saved === "discover" ? "upcoming" : saved;
  const target = allowed.has(normalized) ? normalized : "library";
  const search = document.getElementById("global-search");
  if (search) search.value = State.filters.search || "";
  navTo(target, {
    history: "replace",
    preserveFilters: true,
    preserveSearch: true,
    skipRender: target === "library",
    skipScrollSave: true,
  });
  _historyReady = true;
  if (routeDetailId) {
    const detailPayload = { modal: "detail", mediaId: routeDetailId };
    const detailState = appHistoryState(target, "modal", detailPayload);
    // Un lien ouvert directement reçoit d'abord une entrée « page », puis la
    // fiche : Fermer et Retour restent ainsi dans Kulturo. Après un simple
    // rechargement d'une fiche déjà ouverte, on réutilise l'entrée existante.
    if (existingHistoryOwnsDetail) {
      history.replaceState(detailState, "", historyUrl(target, "modal", detailPayload));
    } else {
      history.pushState(detailState, "", historyUrl(target, "modal", detailPayload));
    }
  }
  _pendingRouteDetailId = routeDetailId;
  if (!restorePendingRouteDetail()) openAddFromRoute(route);
}

function restorePendingRouteDetail() {
  if (!_pendingRouteDetailId || document.getElementById("modal-overlay")) return false;
  const entry = State.entries.find(item => String(item.id) === String(_pendingRouteDetailId));
  if (!entry) return false;
  const id = _pendingRouteDetailId;
  _pendingRouteDetailId = null;
  queueMicrotask(() => openDetailPanel(id, { history: "none" }));
  return true;
}

// Raccourci « Ajouter » du manifeste (#/library?add=1) : ouvre l'ajout une seule
// fois, puis l'URL retrouve sa forme normale pour qu'une actualisation ne le
// rouvre pas. Sans session, le paramètre attend la connexion.
function openAddFromRoute(route) {
  if (!route?.add || !State.user || document.getElementById("modal-overlay")) return false;
  history.replaceState(appHistoryState(_currentPage), "", historyUrl(_currentPage));
  queueMicrotask(() => { if (!document.getElementById("modal-overlay")) UI.openAddModal(); });
  return true;
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
        <form class="auth-form" id="auth-form" ${uiAction("handleAuth")}>
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
    <div id="toast-container" role="region" aria-label="Notifications" aria-live="polite"></div>`;
}

// ── App shell ─────────────────────────────────────────────────
function renderApp() {
  const app = document.getElementById("app");
  document.body.classList.add("app-shell-active");
  app.style.cssText = "";
  app.innerHTML = `
    <!-- Topbar -->
    <header id="topbar">
      <div class="topbar-logo" role="img" aria-label="Kulturo — Suivez votre culture">
        <img class="topbar-mark" src="logo.svg" alt="" width="64" height="38" aria-hidden="true">
        <span class="topbar-brand-copy">
          <span class="topbar-wordmark">Kulturo</span>
          <span class="topbar-tagline">Suivez votre culture</span>
        </span>
      </div>
      <nav id="topnav" aria-label="Navigation principale">
        <i class="topnav-indicator" id="topnav-indicator" aria-hidden="true"></i>
        <button type="button" class="top-tab active" data-nav="library" aria-label="Bibliothèque" title="Bibliothèque" aria-current="page" ${uiAction("navTo", ["library"])}>
          <span class="top-tab-icon">${iconGrid()}</span><span class="top-tab-label">Bibliothèque</span>
        </button>
        <button type="button" class="top-tab" data-nav="upcoming" aria-label="Prochaines sorties" title="Prochaines sorties" ${uiAction("navTo", ["upcoming"])}>
          <span class="top-tab-icon">${iconCalendar()}</span><span class="top-tab-label">Sorties</span>
        </button>
        <button type="button" class="top-tab" data-nav="journal" aria-label="Journal" title="Journal" ${uiAction("navTo", ["journal"])}>
          <span class="top-tab-icon">${iconJournal()}</span><span class="top-tab-label">Journal</span>
        </button>
        <button type="button" class="top-tab" data-nav="dashboard" aria-label="Mon profil" title="Mon profil" ${uiAction("navTo", ["dashboard"])}>
          <span class="top-tab-icon">${iconUser()}</span><span class="top-tab-label">Profil</span>
        </button>
      </nav>
      <div class="page-search-toolbar" id="page-search-toolbar" role="search" aria-label="Recherche dans la page">
      <div class="topbar-search-wrap">
        <span class="search-icon">${iconSearch()}</span>
        <input id="global-search" type="search" placeholder="Rechercher dans ma bibliothèque" aria-label="Rechercher dans ma bibliothèque par titre, artiste, auteur, casting, genre ou année" autocomplete="off" />
      </div>
        <button class="topbar-filter-btn" id="btn-filter-toggle" ${uiAction("toggleFilterDrawer")} aria-label="Ouvrir les filtres de la bibliothèque" title="Filtres">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
        </button>
      </div>
      <div id="loading-bar"><div id="loading-bar-fill"></div></div>
      <div class="topbar-right">
        <span class="network-status" id="network-status" role="status" aria-live="polite" aria-label="Hors connexion" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 2 20 20"/><path d="M8.5 8.5A8.4 8.4 0 0 1 12 7.8c3.4 0 6.5 1.4 8.7 3.7M5.3 11.5c.4-.4.8-.7 1.3-1M8.6 14.8A5.2 5.2 0 0 1 12 13.6c1.4 0 2.7.5 3.6 1.3M12 19h.01"/></svg>
          <span>Hors connexion</span>
        </span>
        <button type="button" class="topbar-add-btn" aria-label="Ajouter une œuvre" title="Ajouter" ${uiAction("openAddModal")}>
          ${iconPlus()}<span>Ajouter</span>
        </button>
      </div>
    </header>

    <!-- Main -->
    <main id="main">
      <h1 id="topbar-page-title">Bibliothèque</h1>
      <!-- Page Bibliothèque -->
      <section id="page-library" class="page active">
        <div id="active-filter-summary" class="active-filter-summary" aria-label="Filtres actifs" hidden></div>
        <section id="continue-section" class="continue-section" aria-labelledby="continue-title" hidden></section>
        <div class="section-heading library-list-heading" aria-live="polite">
          <span id="library-result-count" class="section-count"></span>
        </div>
        <div id="cards-grid"></div>

      </section>

      <!-- Page Profil / Stats -->
      <section id="page-dashboard" class="page">
        <div id="dashboard-content"></div>
      </section>

      <!-- Page Prochaines sorties -->
      <section id="page-upcoming" class="page">
        <div class="upcoming-toolbar" aria-label="Filtres des prochaines sorties">
          <div class="upcoming-toolbar-main">
            <div class="upcoming-type-switch" role="group" aria-label="Type de sortie">
              <button class="upcoming-type-btn active" id="upcoming-filter-all" ${uiAction("setUpcomingType", ["all"])} aria-pressed="true">Tout</button>
              <button class="upcoming-type-btn" id="upcoming-filter-movie" ${uiAction("setUpcomingType", ["movie"])} aria-pressed="false">Films</button>
              <button class="upcoming-type-btn" id="upcoming-filter-tv" ${uiAction("setUpcomingType", ["tv"])} aria-pressed="false">Séries</button>
              <button class="upcoming-type-btn" id="upcoming-filter-game" ${uiAction("setUpcomingType", ["game"])} aria-pressed="false">Jeux</button>
              <button class="upcoming-type-btn" id="upcoming-filter-book" ${uiAction("setUpcomingType", ["book"])} aria-pressed="false">Livres</button>
            </div>
            <button class="btn btn-ghost btn-sm upcoming-refresh-btn" id="upcoming-refresh-btn" ${uiAction("refreshUpcoming")} title="Actualiser les sorties" aria-label="Actualiser les sorties">
              <span class="upcoming-refresh-icon" aria-hidden="true">${iconRefresh()}</span>
              <span class="upcoming-refresh-label">Actualiser</span>
            </button>
          </div>
          <input type="search" id="upcoming-search" class="upcoming-search-state" aria-label="Recherche des prochaines sorties" tabindex="-1" autocomplete="off" />
          <label class="upcoming-genre-filter" id="upcoming-genre-wrap" for="upcoming-genre-select">
            <span>Genre</span>
            <select id="upcoming-genre-select" ${uiAction("setUpcomingGenre", [], { value: true })} disabled>
              <option value="all">Tous les genres</option>
            </select>
          </label>
          <div class="upcoming-toolbar-meta">
            <label class="compact-toggle">
              <input type="checkbox" id="upcoming-hide-added" ${uiAction("setUpcomingHideAdded", [], { checked: true })} />
              <span class="compact-toggle-track" aria-hidden="true"><span></span></span>
              <span>Masquer les titres ajoutés</span>
            </label>
            <span id="upcoming-result-count" class="section-count"></span>
          </div>
        </div>
        <section id="upcoming-wishlist-section" class="continue-section awaited-section" aria-labelledby="upcoming-wishlist-title" hidden></section>
        <div id="upcoming-grid" class="upcoming-months"></div>
      </section>

      <!-- Journal personnel + activité communautaire -->
      <section id="page-journal" class="page">

        <div class="journal-sticky-controls">
          <div class="journal-mode-switch" role="tablist" aria-label="Type de journal">
            <button type="button" class="journal-mode-btn active" id="journal-mode-personal" role="tab" aria-controls="journal-personal-panel" aria-selected="true" data-journal-action="mode" data-journal-mode="personal">Mon journal</button>
            <button type="button" class="journal-mode-btn" id="journal-mode-community" role="tab" aria-controls="journal-community-panel" aria-selected="false" data-journal-action="mode" data-journal-mode="community">Communauté</button>
          </div>
          <div class="journal-time-nav" id="journal-time-nav" aria-label="Navigation dans le temps">
            <label class="journal-month-select-wrap">
              <span class="sr-only">Filtrer par mois</span>
              <select id="journal-month-select" data-journal-action="select-month">
                <option value="all">Tout l’historique</option>
              </select>
            </label>
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
    <div id="toast-container" role="region" aria-label="Notifications" aria-live="polite"></div>

    <!-- Modal container -->
    <div id="modal-root"></div>

    <!-- Nouvelle version PWA -->
    <aside id="update-banner" class="update-banner" role="status" aria-live="polite" hidden>
      <div class="update-banner-icon" aria-hidden="true">${iconRefresh()}</div>
      <div class="update-banner-copy">
        <strong>Nouvelle version disponible</strong>
        <span>Quelques secondes suffisent pour l’installer.</span>
      </div>
      <button class="btn btn-primary btn-sm" id="apply-update-btn" ${uiAction("applyAppUpdate")}>Mettre à jour</button>
      <button class="update-banner-close" ${uiAction("dismissUpdateBanner")} aria-label="Masquer">${iconX()}</button>
    </aside>

    <label id="journal-floating-month" class="journal-floating-month" hidden>
      <span class="sr-only">Changer le mois du journal</span>
      <select id="journal-floating-month-select" data-journal-action="select-month">
        <option value="all">Tout l’historique</option>
      </select>
    </label>

    <button id="back-to-top" class="back-to-top" ${uiAction("scrollToTop")} aria-label="Revenir en haut" title="Revenir en haut" hidden>
      <span aria-hidden="true">↑</span>
    </button>

    <!-- Bottom nav (mobile) -->
    <nav id="bottom-nav">
      <i class="bottom-nav-indicator" id="bottom-nav-indicator" aria-hidden="true"></i>
      <button type="button" class="bottom-nav-item active" data-nav="library" ${uiAction("navTo", ["library"])} aria-label="Bibliothèque" aria-current="page">
        ${iconGrid()}
        <span>Bibliothèque</span>
      </button>
      <button type="button" class="bottom-nav-item" data-nav="upcoming" ${uiAction("navTo", ["upcoming"])} aria-label="Sorties">
        ${iconCalendar()}
        <span>Sorties</span>
      </button>
      <button type="button" class="bottom-nav-item bottom-nav-add" ${uiAction("openAddModal")} aria-label="Ajouter une œuvre">
        ${iconPlus()}
        <span class="sr-only">Ajouter</span>
      </button>
      <button type="button" class="bottom-nav-item" data-nav="journal" ${uiAction("navTo", ["journal"])} aria-label="Journal">
        ${iconJournal()}
        <span>Journal</span>
      </button>
      <button type="button" class="bottom-nav-item" data-nav="dashboard" ${uiAction("navTo", ["dashboard"])} aria-label="Mon profil">
        ${iconUser()}
        <span>Profil</span>
      </button>
    </nav>
  `;

  // Restaure le tri mémorisé
  let savedSort = null;
  try {
    localStorage.removeItem("kulturo-sort");
    savedSort = localStorage.getItem(SORT_STORAGE_KEY);
  } catch {}
  State.filters.sort = LIBRARY_SORTS.includes(savedSort) ? savedSort : DEFAULT_LIBRARY_SORT;
  const globalSearch = document.getElementById("global-search");
  if (globalSearch) globalSearch.value = State.filters.search || "";
  bindJournalInteractions();
  buildFilterBar();
  renderCards();
  updateBadges();
  syncUpdateBanner();
  syncNetworkStatus();
  document.getElementById("main")?.addEventListener("scroll", () => {
    syncBackToTop();
    scheduleUiSnapshot();
  }, { passive: true });
  syncBackToTop();
}

// ── Chargement depuis Supabase ───────────────────────────────
let _journalRefreshPromise = null;
let _journalRefreshOwner = null;
async function refreshJournalEvents({ silent = false } = {}) {
  const requestedOwner = State.user?.id;
  if (_journalRefreshPromise && sameOwner(requestedOwner, _journalRefreshOwner)) {
    return _journalRefreshPromise;
  }
  const task = journalLoadGate.begin();
  const owner = requestedOwner;
  _journalRefreshOwner = owner;
  const request = (async () => {
    try {
      const events = await Journal.getAll({ signal: task.signal });
      if (!journalLoadGate.isCurrent(task) || !sameOwner(owner, State.user?.id)) return [];
      State.events = events;
      State.journalAvailable = true;
      State.journalError = null;
      State.journalDirty = false;
      localDatabase.replaceEvents(owner, events).catch(error => console.warn("[Local] Journal non mis en cache :", error));
      return State.events;
    } catch (error) {
      if (!journalLoadGate.isCurrent(task) || !sameOwner(owner, State.user?.id)) return [];
      const [cachedEvents, hasSnapshot] = await Promise.all([
        localDatabase.getEvents(owner).catch(() => []),
        localDatabase.hasEventSnapshot(owner).catch(() => false),
      ]);
      State.events = cachedEvents;
      State.journalAvailable = hasSnapshot || cachedEvents.length > 0;
      State.journalError = error;
      State.journalDirty = false;
      if (!silent && !State.journalAvailable) toast("Journal indisponible : vérifiez media_events dans Supabase.", "error");
      return State.events;
    } finally {
      journalLoadGate.finish(task);
    }
  })();
  _journalRefreshPromise = request;
  try {
    return await request;
  } finally {
    if (_journalRefreshPromise === request) {
      _journalRefreshPromise = null;
      _journalRefreshOwner = null;
    }
  }
}

function markJournalDirty() {
  State.journalDirty = true;
  journalFeature.invalidate();
  setTimeout(() => {
    if (_currentPage === "journal") renderJournal();
    else if (_currentPage === "dashboard") renderDashboard();
  }, 0);
}

async function loadEntries() {
  const task = libraryLoadGate.begin();
  const loadingToken = loadingStart();
  const owner = State.user?.id;
  State.libraryStatus = "loading";
  const grid = document.getElementById("cards-grid");
  grid?.setAttribute("aria-busy", "true");
  if (!State.entries.length) renderCards();
  try {
    // Charge tout, le filtrage se fait localement dans filterEntries()
    const previousEntries = State.entries;
    const previousFingerprint = entriesFingerprint(previousEntries);
    const freshEntries = normalizeLegacyEntries(await Media.getAll({ signal: task.signal }));
    if (!libraryLoadGate.isCurrent(task) || !sameOwner(owner, State.user?.id)) return false;
    State.libraryStatus = "ready";
    _remoteSyncUnavailable = Media.getStatus().state === "error";
    syncNetworkStatus();
    const entriesChanged = previousFingerprint !== entriesFingerprint(freshEntries);
    State.entries = freshEntries;
    cacheEntriesLocally();
    // Un cache identique est déjà visible : ne reconstruisons ni les jaquettes,
    // ni l'étagère « À reprendre » lors de la simple validation Supabase.
    if (entriesChanged || previousEntries.length === 0) {
      renderCards();
      updateBadges();
    }
  } catch (e) {
    if (!libraryLoadGate.isCurrent(task) || !sameOwner(owner, State.user?.id)) return false;
    _remoteSyncUnavailable = true;
    syncNetworkStatus();
    const cached = await Media.hydrate(readCachedEntries() || []).catch(() => readCachedEntries());
    if (cached) {
      State.libraryStatus = "ready";
      const entriesChanged = entriesFingerprint(State.entries) !== entriesFingerprint(cached);
      State.entries = cached;
      if (entriesChanged || !State.entries.length) {
        renderCards();
        updateBadges();
      }
      toast("Mode hors ligne : dernière bibliothèque enregistrée affichée.", "info");
    } else {
      State.libraryStatus = "error";
      renderCards();
      console.warn("[Bibliothèque] chargement impossible", e);
    }
  } finally {
    // La confirmation du cache ne reconstruit pas les cartes, mais termine
    // tout de même l'annonce de chargement pour les lecteurs d'écran.
    if (libraryLoadGate.isCurrent(task)) grid?.setAttribute("aria-busy", "false");
    loadingDone(loadingToken);
  }
  if (!libraryLoadGate.isCurrent(task) || !sameOwner(owner, State.user?.id)) return false;
  libraryLoadGate.finish(task);
  restorePageScroll("library");
  await refreshJournalEvents({ silent: true });
  if (!libraryLoadGate.isCurrent(task) || !sameOwner(owner, State.user?.id)) return false;
  if (_currentPage === "upcoming") upcomingFeature.renderCards();
  restorePendingRouteDetail();
  return true;
}

// ── Navigation unifiée ───────────────────────────────────────
function navTo(key, options = {}) {
  // L'ancien alias reste accepté, mais toute la navigation utilise une seule clé.
  if (key === "profile") key = "dashboard";

  const requestedPage = ["dashboard", "upcoming", "journal"].includes(key) ? key : "library";
  if (!options.withinViewTransition && _historyReady && requestedPage !== _currentPage) {
    return runViewTransition(() => navTo(key, { ...options, withinViewTransition: true }), "page");
  }

  // #2 — sauvegarde le scroll de la page courante
  const main = document.getElementById("main");
  if (main && !options.skipScrollSave) State.scrollPos[_currentPage] = main.scrollTop;

  // Les raccourcis de collection appartiennent tous à la Bibliothèque.
  const primaryKey = ["dashboard", "upcoming", "journal"].includes(key) ? key : "library";
  const isPrimaryPageRequest = ["library", "dashboard", "upcoming", "journal"].includes(key);
  if (isPrimaryPageRequest) {
    const historyMode = options.history || (_historyReady && primaryKey !== _currentPage ? "push" : "replace");
    syncPageHistory(primaryKey, historyMode);
  }

  // Synchronise systématiquement les deux navigations. Cela rend aussi un clic
  // répété utile si une page a été interrompue pendant son chargement.
  document.querySelectorAll(".top-tab[data-nav], .bottom-nav-item[data-nav]").forEach(b => {
    const isActive = b.dataset.nav === primaryKey;
    b.classList.toggle("active", isActive);
    if (isActive) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  positionNavIndicators();

  // Sauvegarde la nav active
  try { localStorage.setItem("kulturo-nav", primaryKey); } catch {}

  if (key === "dashboard") {
    showPage("dashboard");
  } else if (key === "upcoming") {
    showPage("upcoming");
  } else if (key === "journal") {
    showPage("journal");
  } else if (key.startsWith("type-")) {
    State.filters.type     = key.replace("type-", "");
    State.filters.subtype  = "all";
    State.filters.status   = DEFAULT_LIBRARY_STATUS;
    State.filters.favorite = false;
    State.filters.replay   = false;
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
    State.filters.replay   = false;
    State.filters.year     = "all";
    State.filters.month    = "all";
    State.filters.rating   = "all";
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs("all");
  } else if (key === "fav") {
    State.filters.favorite = true;
    State.filters.replay   = false;
    State.filters.type     = "all";
    State.filters.subtype  = "all";
    State.filters.status   = DEFAULT_LIBRARY_STATUS;
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
      if (!options.skipRender) renderCards();
      updateCategoryTabs(State.filters.type, State.filters.favorite);
      return;
    }
    // "library" → reset complet
    State.filters.type     = "all";
    State.filters.subtype  = "all";
    State.filters.status   = DEFAULT_LIBRARY_STATUS;
    State.filters.favorite = false;
    State.filters.replay   = false;
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
  const current = State.filters.type === "movie" ? State.filters.subtype : State.filters.type;
  const nextType = current === type ? "all" : type;
  State.filters.type = nextType === "tv" ? "movie" : nextType;
  State.filters.subtype = ["movie", "tv"].includes(nextType) ? nextType : "all";
  syncFilterChips();
  renderCards({ resetScroll: true });
  updateCategoryTabs(nextType);
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
  if (name !== "dashboard") profileFeature.cancel();
  if (name !== "journal") journalFeature.cancel();
  if (name !== "upcoming") upcomingFeature.cancel();
  document.documentElement.dataset.page = name;
  syncSystemBar(name, null);
  const filterBtn = document.getElementById("btn-filter-toggle");
  if (filterBtn) {
    const inactive = name !== "library";
    filterBtn.classList.toggle("is-inactive", inactive);
    filterBtn.setAttribute("aria-hidden", String(inactive));
    filterBtn.tabIndex = inactive ? -1 : 0;
  }

  const searchWrap = document.querySelector(".topbar-search-wrap");
  const globalSearch = document.getElementById("global-search");
  if (searchWrap) searchWrap.hidden = !["library", "upcoming", "journal"].includes(name);
  document.getElementById("page-search-toolbar")?.toggleAttribute("hidden", name === "dashboard");
  const pageTitle = document.getElementById("topbar-page-title");
  const title = { library: "Bibliothèque", upcoming: "Sorties", journal: "Journal", dashboard: "Profil" }[name];
  if (pageTitle && pageTitle.textContent !== title) {
    pageTitle.textContent = title;
    if (!prefersReducedMotion()) {
      pageTitle.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      document.getElementById("page-search-toolbar")?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    }
  }
  if (globalSearch) {
    const searchConfig = {
      library: ["Rechercher dans ma bibliothèque", "Rechercher dans ma bibliothèque par titre, artiste, auteur, casting, genre ou année"],
      upcoming: ["Rechercher dans les prochaines sorties", "Rechercher un film, une série, un jeu ou un livre parmi les prochaines sorties"],
      journal: ["Rechercher dans le journal", "Rechercher une œuvre, une activité ou un membre dans le journal affiché"],
    }[name];
    if (searchConfig) {
      globalSearch.placeholder = searchConfig[0];
      globalSearch.setAttribute("aria-label", searchConfig[1]);
      const nextValue = name === "upcoming" ? (document.getElementById("upcoming-search")?.value || "") : name === "journal" ? (globalSearch.dataset.journalQuery || "") : (State.filters.search || "");
      if (globalSearch.value !== nextValue) globalSearch.value = nextValue;
    }
  }
  document.getElementById("btn-filter-toggle")?.toggleAttribute("hidden", name !== "library");

  // #1 — restaure la position de scroll
  const main = document.getElementById("main");
  if (main && !_pendingScrollRestores.has(name)) {
    const saved = State.scrollPos[name] || 0;
    requestAnimationFrame(() => { main.scrollTop = saved; });
  }

  if (name === "dashboard") renderDashboard();
  if (name === "upcoming")  upcomingFeature.render();
  if (name === "journal") renderJournal();
  if (name === "library")   restorePageScroll("library");
  requestAnimationFrame(syncBackToTop);
}

function syncBackToTop() {
  const main = document.getElementById("main");
  const button = document.getElementById("back-to-top");
  if (!main || !button) return;
  button.hidden = _currentPage === "journal" || main.scrollTop < 560;
  journalFeature.syncFloating();
}

function scrollToTop() {
  const main = document.getElementById("main");
  if (!main) return;
  main.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
}

// ── Filter bar ────────────────────────────────────────────────
function buildFilterBar() {
  // Chips statut dans le drawer
  const chipsEl = document.getElementById("filter-status-chips");
  if (chipsEl) {
    const statuses = ["all", ...LIBRARY_STATUSES];
    chipsEl.innerHTML = statuses.map(s => {
      return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}" data-value="${s}"
                      ${uiAction("setStatusChip", [s])}>${iconStatus(s)}${STATUS_LABELS[s]}</button>`;
    }).join("");
  }
  // Met à jour le label actif sur le bouton toggle
  _updateFilterToggleLabel();
}

function _countActiveFilters() {
  let n = 0;
  if (State.filters.subtype !== "all" || State.filters.type !== "all") n++;
  if (State.filters.favorite) n++;
  if (State.filters.replay) n++;
  if (State.filters.status !== DEFAULT_LIBRARY_STATUS) n++;
  if (State.filters.sort !== DEFAULT_LIBRARY_SORT) n++;
  if (State.filters.year !== "all" || State.filters.month !== "all") n++;
  if (State.filters.rating !== "all") n++;
  return n;
}

function _updateFilterModalTypeChips() {
  const chips = document.querySelectorAll("#fm-type-chips .filter-chip");
  chips.forEach(chip => {
    const active = chip.dataset.value === (State.filters.type === "movie" ? State.filters.subtype : State.filters.type);
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
  _updateFilterToggleLabel();
  _updateFilterModalHeader();
  _updateResetBtn();
}

function _updateFilterToggleLabel() {
  const btn = document.getElementById("btn-filter-toggle");
  if (!btn) return;
  const n = _countActiveFilters();
  btn.classList.toggle("has-filter", n > 0);
  const accessibleLabel = n > 0
    ? `Ouvrir les filtres de la bibliothèque · ${n} actif${n > 1 ? "s" : ""}`
    : "Ouvrir les filtres de la bibliothèque";
  btn.setAttribute("aria-label", accessibleLabel);
  btn.title = n > 0 ? `Filtres · ${n} actif${n > 1 ? "s" : ""}` : "Filtres";
  const unavailable = _currentPage !== "library";
  btn.setAttribute("aria-hidden", String(unavailable));
  btn.tabIndex = unavailable ? -1 : 0;
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
  return f.type === "all" && f.subtype === "all" && f.status === DEFAULT_LIBRARY_STATUS && !f.favorite && !f.replay && !f.search && f.year === "all" && f.month === "all" && f.rating === "all";
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
    ? `<span class="continue-preview-cover"><img src="${esc(coverUrl)}" alt="" loading="lazy" decoding="async" data-fade-image data-image-fallback="grid" class="fade-image"><span class="continue-preview-placeholder" style="display:none">${iconMedia(entry.media_type, entry.subtype)}</span></span>`
    : `<span class="continue-preview-cover continue-preview-placeholder">${iconMedia(entry.media_type, entry.subtype)}</span>`;
}

function continueCardHTML(entry) {
  const coverUrl = safeMediaUrl(entry.cover_url);
  const cover = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" decoding="async" data-fade-image data-image-fallback="flex" class="fade-image">
       <span class="continue-cover-placeholder" style="display:none">${iconMedia(entry.media_type, entry.subtype)}</span>`
    : `<span class="continue-cover-placeholder">${iconMedia(entry.media_type, entry.subtype)}</span>`;

  return `
    <button type="button" class="continue-card" data-prefetch-media="${entry.id}" data-transition-media="${entry.id}" ${uiAction("openEditModal", [entry.id], { control: true })} aria-label="Reprendre ${esc(entry.title)}">
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
    <button type="button" class="continue-toggle" ${uiAction("toggleContinueSection")} aria-expanded="${expanded}" aria-controls="continue-content">
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
          <button class="section-link" ${uiAction("navTo", ["status-playing"])}>Voir tout <span aria-hidden="true">→</span></button>
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
  const count = document.getElementById("library-result-count");
  if (count) count.textContent = `${entries.length} œuvre${entries.length > 1 ? "s" : ""}`;
}

function renderActiveFilters() {
  const container = document.getElementById("active-filter-summary");
  if (!container) return;

  const typeLabels = { game: "Jeux", movie: "Films · Séries", book: "Livres" };
  const subtypeLabels = { movie: "Films", tv: "Séries" };
  const filters = [];
  // Les critères restent visibles pendant la recherche.
  if (State.filters.search) {
    filters.push(["search", `“${State.filters.search}”`]);
  }
  {
    if (State.filters.subtype !== "all") filters.push(["subtype", subtypeLabels[State.filters.subtype] || State.filters.subtype]);
    else if (State.filters.type !== "all") filters.push(["type", typeLabels[State.filters.type] || State.filters.type]);
    if ((State.filters.search || State.filters.status !== DEFAULT_LIBRARY_STATUS) && State.filters.status !== "all") filters.push(["status", STATUS_LABELS[State.filters.status] || State.filters.status]);
    if (State.filters.favorite) filters.push(["favorite", "Coups de cœur"]);
    if (State.filters.replay) filters.push(["replay", replayFilterLabel(State.filters.type)]);
    if (State.filters.sort !== DEFAULT_LIBRARY_SORT) filters.push(["sort", LIBRARY_SORT_LABELS[resolveLibrarySort(State.filters)]]);
    if (State.filters.rating !== "all") filters.push(["rating", `★ ${State.filters.rating}/10`]);
    if (State.filters.month !== "all") {
      const [year, month] = String(State.filters.month).split("-").map(Number);
      const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
        .format(new Date(year, Math.max(0, month - 1), 1));
      filters.push(["period", label]);
    } else if (State.filters.year !== "all") {
      filters.push(["period", String(State.filters.year)]);
    }
  }

  container.hidden = filters.length === 0;
  container.innerHTML = filters.length ? `
    <span class="active-filter-label">${State.filters.search ? "Dans ma bibliothèque · filtres appliqués" : "Filtres actifs"}</span>
    <div class="active-filter-chips">
      ${filters.map(([key, label]) => `
        <button type="button" class="active-filter-chip" ${uiAction("clearLibraryFilter", [key])} aria-label="Retirer le filtre ${esc(label)}">
          ${esc(label)} <span aria-hidden="true">×</span>
        </button>`).join("")}
    </div>
    <button type="button" class="active-filter-reset" ${uiAction("clearAllLibraryFilters")}>Tout effacer</button>` : "";
}

function clearLibraryFilter(key) {
  if (key === "type" || key === "subtype") {
    State.filters.type = "all";
    State.filters.subtype = "all";
  }
  else if (key === "status") State.filters.status = State.filters.search ? "all" : DEFAULT_LIBRARY_STATUS;
  else if (key === "favorite") State.filters.favorite = false;
  else if (key === "replay") State.filters.replay = false;
  else if (key === "sort") {
    State.filters.sort = DEFAULT_LIBRARY_SORT;
    persistSortPreference(DEFAULT_LIBRARY_SORT);
  } else if (key === "rating") State.filters.rating = "all";
  else if (key === "search") {
    State.filters.search = "";
    const search = document.getElementById("global-search");
    if (search) search.value = "";
    _updateFilterToggleLabel();
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
  State.filters.status = DEFAULT_LIBRARY_STATUS;
  State.filters.favorite = false;
  State.filters.replay = false;
  State.filters.search = "";
  State.filters.rating = "all";
  State.filters.sort = DEFAULT_LIBRARY_SORT;
  State.filters.year = "all";
  State.filters.month = "all";
  persistSortPreference(DEFAULT_LIBRARY_SORT);
  const search = document.getElementById("global-search");
  if (search) search.value = "";
  syncFilterChips();
  updateCategoryTabs("all");
  renderCards({ resetScroll: true });
  _updateFilterResultCount();
}

// ── Rendu grille ──────────────────────────────────────────────
let _libraryRenderFrame = 0;
function scheduleLibraryRender(options = {}) {
  if (_libraryRenderFrame) cancelAnimationFrame(_libraryRenderFrame);
  _libraryRenderFrame = requestAnimationFrame(() => {
    _libraryRenderFrame = 0;
    renderCards(options);
  });
}

function cancelScheduledLibraryRender() {
  if (_libraryRenderFrame) cancelAnimationFrame(_libraryRenderFrame);
  _libraryRenderFrame = 0;
}

function renderCards(options = {}) {
  const finishRender = startMeasurement("library:render");
  try {
  cancelScheduledLibraryRender();
  const grid = document.getElementById("cards-grid");
  if (!grid) return;

  grid.setAttribute("aria-busy", String(State.libraryStatus === "loading"));
  if (!State.entries.length && State.libraryStatus === "loading") {
    grid.innerHTML = cardSkeletons() + '<span class="sr-only" role="status">Chargement de la bibliothèque…</span>';
    return;
  }
  if (!State.entries.length && State.libraryStatus === "error") {
    grid.innerHTML = errorState({
      title: "Bibliothèque indisponible",
      message: "Impossible de charger vos œuvres pour le moment.",
      actionHTML: '<button class="btn btn-secondary" ' + uiAction("retryLibrary") + '>Réessayer</button>',
    });
    return;
  }

  if (options.resetScroll) {
    const main = document.getElementById("main");
    if (main) main.scrollTop = 0;
    State.scrollPos.library = 0;
  }

  let entries = filterEntries(State.entries);
  renderActiveFilters();
  renderContinueSection();
  updateLibraryHeading(entries);
  _updateFilterToggleLabel();

  if (!entries.length) {
    const f = State.filters;
    const hasFilters = f.favorite || f.replay || f.status !== DEFAULT_LIBRARY_STATUS ||
      f.type !== "all" || f.subtype !== "all" || f.year !== "all" || f.month !== "all" || f.rating !== "all";
    const searchEmpty = Boolean(f.search);
    const libraryEmpty = State.entries.length === 0;
    const title = searchEmpty ? "Aucun résultat" : libraryEmpty ? "Votre bibliothèque commence ici" :
      hasFilters ? "Aucune œuvre correspondante" : "Aucune œuvre terminée";
    const message = searchEmpty ? 'Aucun résultat pour « ' + esc(f.search) + ' ».' :
      libraryEmpty ? "Ajoutez un film, une série, un jeu ou un livre pour commencer." :
      hasFilters ? "Essayez d’élargir vos filtres pour retrouver vos œuvres." :
      "Vos œuvres terminées apparaîtront ici. Vous pouvez consulter celles que vous suivez déjà.";
    const action = searchEmpty ? uiAction("clearLibraryFilter", ["search"]) :
      libraryEmpty ? uiAction("openAddModal") :
      hasFilters ? uiAction("clearAllLibraryFilters") : uiAction("navTo", ["status-all"]);
    const label = searchEmpty ? "Effacer la recherche" :
      libraryEmpty ? "Ajouter une œuvre" :
      hasFilters ? "Réinitialiser les filtres" : "Voir mes œuvres";
    grid.innerHTML = emptyState({
      icon: searchEmpty ? "search" : "collection", title, message,
      actionHTML: '<button class="btn ' + (libraryEmpty && !searchEmpty ? "btn-primary" : "btn-secondary") + '" ' + action + '>' + label + '</button>' + (searchEmpty
        ? '<button class="btn btn-primary" ' + uiAction("addFromLibrarySearch") + '>Chercher ce titre pour l’ajouter</button>'
          + '<button class="btn btn-secondary" ' + uiAction("broadenLibrarySearch") + '>Chercher dans toute ma bibliothèque</button>'
        : ''),
    });
    return;
  }

  if ([...grid.children].some(node => !node.classList.contains("media-card"))) grid.replaceChildren();
  reconcileKeyedChildren(grid, entries, {
    key: entry => entry.id,
    create: (entry, index) => createMediaCardNode(entry, index),
    update: (node, entry) => patchMediaCardNode(node, entry),
  });
  hydrateFadeImages(grid);
  // Les nouvelles cartes sont animées par reconcileKeyedChildren ; les cartes conservées restent stables.
  } finally { finishRender(); }
}

function filterEntries(entries) {
  const f = State.filters;
  const res = filterLibraryEntries(entries, f);
  if (f.search && f.sort === DEFAULT_LIBRARY_SORT) {
    return res.sort((a, b) =>
      librarySearchScore(b, f.search) - librarySearchScore(a, f.search) ||
      a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
    );
  }
  // Tri local : « auto » suit le statut affiché
  res.sort((a, b) => {
    switch (resolveLibrarySort(f)) {
      case "title":         return a.title.localeCompare(b.title);
      case "rating_desc":   return (b.rating||0) - (a.rating||0);
      case "rating_asc":    return (a.rating||0) - (b.rating||0);
      case "date_finished":
        // À date de fin égale (ou absente), les ajouts les plus récents passent devant.
        return (new Date(b.date_finished||0) - new Date(a.date_finished||0)) ||
               (new Date(b.created_at||0)    - new Date(a.created_at||0));
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

function cardMetaHTML(entry) {
  const info = repeatInfo(entry);
  const progress = repeatProgressLabel(entry, info);
  const hasReplay = isReplayEntry(entry);
  if (!entry?.rating && !entry?.is_favorite && !hasReplay) return "";
  const ratingEl = entry.rating ? ratingScoreHTML(entry.rating, "card-rating") : "";
  const heartEl = entry.is_favorite ? `<span class="card-heart">♥</span>` : "";
  const historyLabel = `${info.done} ${info.total} fois`;
  const repeatLabel = progress ? `${progress} · ${historyLabel}` : historyLabel;
  const repeatEl = hasReplay
    ? `<span class="card-repeat" title="${esc(repeatLabel)}" aria-label="${esc(repeatLabel)}">${iconRepeat()}<strong>${info.total}×</strong></span>`
    : "";
  return `<div class="card-bottom">${ratingEl}<span class="card-markers">${heartEl}${repeatEl}</span></div>`;
}

// Les marqueurs du Journal décrivent l'état actuel du média, indépendamment
// de l'événement historique affiché sur la ligne.
function activityStateMarkersHTML(entry) {
  const info = repeatInfo(entry);
  const progress = repeatProgressLabel(entry, info);
  const hasReplay = isReplayEntry(entry);
  const favorite = entry?.is_favorite
    ? `<span class="activity-favorite-marker" title="Actuellement : coup de cœur" aria-label="Actuellement coup de cœur">♥</span>`
    : "";
  const historyLabel = `${info.done} ${info.total} fois`;
  const repeatLabel = progress ? `${progress} · ${historyLabel}` : historyLabel;
  const repeat = hasReplay
    ? `<span class="activity-repeat-marker" title="Actuellement : ${esc(repeatLabel.toLowerCase())}" aria-label="Actuellement ${esc(repeatLabel.toLowerCase())}">${iconRepeat()}<strong>${info.total}×</strong></span>`
    : "";
  return favorite || repeat
    ? `<span class="activity-state-markers">${favorite}${repeat}</span>`
    : "";
}

function cardHTML(e, i = 0) {
  const coverUrl = safeMediaUrl(e.cover_url);
  const coverHTML = coverUrl
    ? `<img class="card-cover fade-image" data-fade-image data-image-fallback="flex" src="${esc(coverUrl)}" alt="${esc(e.title)}" loading="lazy" decoding="async">
       <div class="card-cover-placeholder" style="display:none">${iconMedia(e.media_type, e.subtype)}</div>`
    : `<div class="card-cover-placeholder">${iconMedia(e.media_type, e.subtype)}</div>`;

  const isPerfect = e.rating === 10;
  const statusClass = { wishlist: "is-wishlist", playing: "is-playing", dropped: "is-dropped" }[e.status] || "";
  const classes = ["media-card",
    e.is_favorite ? "favorite" : "",
    isPerfect      ? "perfect"  : "",
    (e.is_favorite && isPerfect) ? "both" : "",
    statusClass
  ].filter(Boolean).join(" ");

  const statusLabel = {
    wishlist: "Envies",
    playing:  "En cours",
    dropped:  "Abandonné",
  }[e.status] || "";

  return `
    <article class="${classes}" data-id="${e.id}" data-key="${e.id}" data-prefetch-media="${e.id}" data-transition-media="${e.id}" role="button" tabindex="0" aria-label="Ouvrir ${esc(e.title)}"
      style="animation-delay:${Math.min(i*25,250)}ms" ${uiAction("openEditModal", [e.id], { control: true })}>
      ${coverHTML}
      <span class="card-title sr-only">${esc(e.title)}</span>
      ${statusLabel ? `<span class="card-status-label">${iconStatus(e.status)}<span>${statusLabel}</span></span>` : ""}
      ${cardMetaHTML(e)}
    </article>`;
}

function mediaCardSignature(entry) {
  return JSON.stringify([
    entry.id, entry.title, entry.cover_url, entry.rating, entry.is_favorite,
    entry.repeat_count, entry.date_finished, entry.status, entry.media_type,
    entry.subtype,
  ]);
}

function createMediaCardNode(entry, index = 0) {
  const node = elementFromHTML(cardHTML(entry, index));
  if (node) node._kulturoRenderSignature = mediaCardSignature(entry);
  return node;
}

function patchMediaCardNode(node, entry) {
  const signature = mediaCardSignature(entry);
  const previousSignature = node?._kulturoRenderSignature;
  if (previousSignature === signature) return;
  const next = elementFromHTML(cardHTML(entry));
  if (!node || !next) return;
  node.className = next.className;
  playCardSheen(node, previousSignature, signature);
  node.dataset.prefetchMedia = String(entry.id);
  node.setAttribute("aria-label", next.getAttribute("aria-label"));

  const currentTitle = node.querySelector(".card-title");
  if (currentTitle) currentTitle.textContent = entry.title;

  const currentCover = node.querySelector(".card-cover, .card-cover-placeholder");
  const nextCover = next.querySelector(".card-cover, .card-cover-placeholder");
  const coverChanged = currentCover?.tagName !== nextCover?.tagName
    || (currentCover?.tagName === "IMG" && currentCover.getAttribute("src") !== nextCover.getAttribute("src"))
    || (currentCover?.tagName !== "IMG" && currentCover?.innerHTML !== nextCover?.innerHTML);
  if (coverChanged && currentCover && nextCover) currentCover.replaceWith(nextCover);
  else if (currentCover?.tagName === "IMG" && nextCover?.tagName === "IMG") {
    currentCover.alt = nextCover.alt;
  }

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
  node._kulturoRenderSignature = signature;
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
const MAX_BACKUP_IMPORT_BYTES = 10 * 1024 * 1024;
let _pendingRestorePlan = null;
let _pendingRestoreEvents = null;
let _restoreInProgress = false;

function openModal(entry = null, prefillTitle = null) {
  rememberModalReturnFocus();
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
let _wizardScanner = null;
let _modalDirty = false;
let _modalClosePromptOpen = false;
let _detailEditContext = null;
let _saveInProgress = false;

async function openEditFromDetail(id) {
  const entry = State.entries.find(item => item.id === id);
  const detail = document.querySelector("#modal-overlay .detail-modal");
  if (!entry || !detail || _detailEditContext) return;
  _detailEditContext = {
    id,
    scrollTop: detail.querySelector(".detail-body")?.scrollTop || 0,
    synopsisExpanded: Boolean(detail.querySelector(".detail-synopsis-wrap.expanded")),
  };
  detailSessions.dispose();
  dialogFocus.deactivate(detail, { restoreFocus: false });
  window._apiSelected = null;
  openModal(entry);
  document.getElementById("modal-overlay")?.classList.add("is-modal-replacement");
}

function returnToDetail() {
  const context = _detailEditContext;
  if (!context || !State.entries.some(entry => entry.id === context.id)) return false;
  _detailEditContext = null;
  const edit = document.querySelector("#modal-overlay .edit-modal");
  if (edit) dialogFocus.deactivate(edit, { restoreFocus: false });
  document.querySelectorAll("[data-kulturo-search]").forEach(input => input._kulturoAbortSearch?.());
  _wizardScanner?.stop(); _wizardScanner = null;
  _wizardState = null;
  State.editingId = null;
  _currentRating = 0;
  _modalDirty = false;
  window._apiSelected = null;
  window._apiResults = [];
  openDetailPanel(context.id, { restoreView: context });
  return true;
}

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
      <button type="button" class="btn-icon" ${uiAction("closeModal")} aria-label="Fermer">${iconX()}</button>`;
    bodyHTML = `
      <div class="add-search-types" id="add-search-types" role="group" aria-label="Type d’œuvre à rechercher">
        ${[["all", "Tout"], ["movie", "Films & séries"], ["game", "Jeux vidéo"], ["book", "Livres"]].map(([value, label]) => `<button type="button" data-search-type="${value}" aria-pressed="${(s.searchType || 'all') === value}">${label}</button>`).join("")}
      </div>
      <div class="api-search-wrap wz-universal-search">
        <span class="wz-search-icon" aria-hidden="true">${iconSearch()}</span>
        <input type="text" id="f-api-search" placeholder="Titre, ISBN ou lien…" autocomplete="off" value="${esc(s.apiSelected?.title || s.title)}" />
        <button type="button" class="wz-scan-btn" id="wz-scan-btn" ${uiAction("wzOpenScanner")} aria-label="Scanner le code-barres d’un livre" hidden>${iconScan()}</button>
        <div class="api-results wz-universal-results" id="api-results" style="display:none"></div>
      </div>
      <div class="wz-scanner" id="wz-scanner" hidden>
        <div class="wz-scanner-view">
          <video id="wz-scanner-video" playsinline muted></video>
          <div class="wz-scanner-frame" aria-hidden="true"><i></i></div>
        </div>
        <p id="wz-scanner-hint" role="status">Placez le code-barres au dos du livre dans le cadre.</p>
        <button type="button" class="btn btn-secondary btn-sm" ${uiAction("wzCloseScanner")}>Annuler</button>
      </div>
      <div class="wz-search-start" id="wz-search-start">
        <span aria-hidden="true">⌕</span>
        <strong>Une seule recherche pour toute votre culture</strong>
        <small>Films, séries, jeux et livres</small>
      </div>`;
  }

  else if (s.step === 2) {
    const title = s.apiSelected?.title || s.title;
    const subtitle = `${getTypeLabel({ ...s.apiSelected, media_type: s.type, subtype: s.subtype })}${s.apiSelected?.release_year ? ` · ${s.apiSelected.release_year}` : ""}`;
    const primaryStatuses = ADD_PRIMARY_STATUSES.map(({ value }) => { const label = statusLabelFor(value, s.type); return `
      <button type="button" class="wz-status-btn ${value === s._status ? "active" : ""}" data-status="${value}" ${uiAction("wzSetStatus", [value])} aria-pressed="${value === s._status}">
        <span aria-hidden="true">${iconStatus(value)}</span>${label}
      </button>`; }).join("");
    const secondaryStatuses = ADD_SECONDARY_STATUSES.map(({ value }) => { const label = statusLabelFor(value, s.type); return `
      <button type="button" class="wz-status-btn wz-status-secondary ${value === s._status ? "active" : ""}" data-status="${value}" ${uiAction("wzSetStatus", [value])} aria-pressed="${value === s._status}">
        <span aria-hidden="true">${iconStatus(value)}</span>${label}
      </button>`; }).join("");
    headerHTML = `
      <button type="button" class="btn-icon wz-back-btn" ${uiAction("wzBack")} aria-label="Changer d’œuvre">←</button>
      <div class="wz-header-copy">
        <span>Nouvel ajout</span>
        <h3 id="add-sheet-title">Ajouter à la bibliothèque</h3>
      </div>
      <button type="button" class="btn-icon" ${uiAction("closeModal")} aria-label="Fermer">${iconX()}</button>`;
    bodyHTML = `
      <div class="wz-selected-card">
        ${cover
          ? `<img src="${esc(cover)}" class="wz-selected-cover" alt="" decoding="async">`
          : `<div class="wz-selected-cover wz-selected-placeholder" aria-hidden="true">${iconMedia(s.type)}</div>`}
        <div class="wz-selected-copy">
          <strong>${esc(title)}</strong>
          <span>${esc(subtitle)}</span>
        </div>
        <button type="button" class="wz-change-btn" ${uiAction("wzBack")}>Changer</button>
      </div>

      <section class="wz-compact-section">
        <div class="wz-section-heading"><strong>Où en êtes-vous ?</strong></div>
        <div class="wz-status-grid" role="group" aria-label="Statut de l’œuvre">${primaryStatuses}</div>
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
      <button class="btn btn-primary wz-submit-btn" ${uiAction("saveEntry")}>Ajouter à ma bibliothèque</button>`;
  }

  const previousDialog = root.querySelector("#modal-overlay .modal");
  if (previousDialog) dialogFocus.deactivate(previousDialog, { restoreFocus: false });
  replaceModalContent(root, `
    <div class="modal-overlay" id="modal-overlay" ${uiAction("closeModalOnBg", [], { event: true })}>
      <div class="modal modal-wizard" data-step="${s.step}" ${cover ? `data-cover-accent-url="${esc(cover)}"` : ""} role="dialog" aria-modal="true" aria-labelledby="add-sheet-title">
        <div class="modal-header wz-header">${headerHTML}</div>
        <div class="modal-body wz-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ""}
      </div>
    </div>`);
  pushHistoryLayer("modal", { modal: "add", step: s.step });
  syncSystemBar(_currentPage, null);
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
      ["f-subtype", s.subtype],
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
  activateDialog(root.querySelector(".modal-wizard"), {
    initialFocus: s.step === 1 ? "#f-api-search" : ".wz-status-btn.active",
  });
}

function _openModalClassic(entry) {
  const root = document.getElementById("modal-root");
  const entryCoverUrl = safeMediaUrl(entry.cover_url);
  replaceModalContent(root, `
    <div class="modal-overlay" id="modal-overlay" ${uiAction("closeModalOnBg", [], { event: true })}>
      <div class="modal edit-modal" data-edit-view="main" ${entryCoverUrl ? `data-cover-accent-url="${esc(entryCoverUrl)}"` : ""} role="dialog" aria-modal="true" aria-labelledby="edit-sheet-title">
        <div class="modal-header">
          <button type="button" class="btn-icon edit-details-back" ${uiAction("setEditDetailsView", [false])} aria-label="Revenir à la modification principale">←</button>
          <h3 id="edit-sheet-title"><span class="edit-title-main">Modifier <span class="edit-title-name">${esc(entry.title || "cette œuvre")}</span></span><span class="edit-title-details">Détails facultatifs — ${esc(entry.title || "œuvre")}</span></h3>
          <button class="btn-icon" ${uiAction("closeModal")} aria-label="Fermer">${iconX()}</button>
        </div>
        <div class="modal-body">
          <div class="edit-primary-view">
            <div class="form-group modal-search-unified">
              <div class="edit-title-row">
                <select id="f-type-select" class="edit-type-select" aria-label="Type d’œuvre">
                  <option value="movie" ${entry.media_type==="movie" && entry.subtype!=="tv" ? "selected" : ""}>Film</option>
                  <option value="tv" ${entry.media_type==="movie" && entry.subtype==="tv" ? "selected" : ""}>Série</option>
                  <option value="game" ${entry.media_type==="game" ? "selected" : ""}>Jeu</option>
                  <option value="book" ${entry.media_type==="book" ? "selected" : ""}>Livre</option>
                </select>
              <div class="api-search-wrap">
                <input type="text" id="f-api-search" placeholder="Rechercher un titre ou un ISBN…" autocomplete="off" value="${esc(entry.title||"")}" />
                <div class="api-results" id="api-results" style="display:none"></div>
              </div>
              </div>
              <div class="modal-type-tabs edit-type-legacy" aria-hidden="true">
                <button type="button" class="modal-type-tab ${entry.media_type==="movie" && normalizedSubtype(entry)==="movie" ? "active" : ""}" data-type="movie" ${uiAction("setModalType", ["movie"])}>${iconMedia("movie")} Films</button>
                <button type="button" class="modal-type-tab ${entry.media_type==="movie" && entry.subtype==="tv" ? "active" : ""}" data-type="tv" ${uiAction("setModalType", ["tv"])}>${iconMedia("movie", "tv")} Séries</button>
                <button type="button" class="modal-type-tab ${entry.media_type==="game" ? "active" : ""}" data-type="game" ${uiAction("setModalType", ["game"])}>${iconMedia("game")} Jeux</button>
                <button type="button" class="modal-type-tab ${entry.media_type==="book" ? "active" : ""}" data-type="book" ${uiAction("setModalType", ["book"])}>${iconMedia("book")} Livres</button>
              </div>
              <input type="hidden" id="f-subtype" value="${normalizedSubtype(entry) || ""}" />
              <input type="hidden" id="f-type" value="${entry.media_type || "movie"}" />
              <input type="hidden" id="f-title" value="${esc(entry.title||"")}" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Statut</label>
                <select id="f-status">
                  ${["wishlist","playing","finished","dropped"].map(s =>
                    `<option value="${s}" ${entry.status===s?"selected":""}>${statusLabelFor(s, entry.media_type || "movie")}</option>`
                  ).join("")}
                </select>
              </div>
              <div class="form-group">
                <label>Mon avis <span id="rating-tooltip" class="rating-tooltip-label"></span></label>
                <div class="rating-stars" id="rating-stars"></div>
              </div>
            </div>
            <div class="edit-avis-grid">
            <div class="form-group edit-reading" id="edit-reading" hidden>
              <label for="f-current-page">Ma lecture</label>
              <div class="edit-reading-tile">
                <input id="f-current-page" type="number" min="0" step="1" inputmode="numeric" value="${entry.current_page ?? ""}" placeholder="Page" aria-label="Page actuelle" />
                <span class="edit-reading-sep" aria-hidden="true">/</span>
                <input id="f-page-count" type="number" min="1" step="1" inputmode="numeric" value="${entry.page_count || ""}" placeholder="Total" aria-label="Nombre total de pages, facultatif" />
                <span class="edit-reading-unit">pages</span>
                <span class="edit-reading-percent" id="edit-reading-percent" aria-live="polite"></span>
              </div>
            </div>
            <div class="form-group edit-reading edit-series" id="edit-series" hidden>
              <label for="f-current-season">Ma progression</label>
              <div class="edit-reading-tile">
                <span class="edit-reading-unit">Saison</span>
                <input id="f-current-season" type="number" min="1" step="1" inputmode="numeric" value="${entry.current_season ?? ""}" placeholder="–" aria-label="Saison en cours" />
                <span class="edit-series-total" id="edit-series-total">${entry.seasons_count ? `/ ${entry.seasons_count}` : ""}</span>
                <span class="edit-reading-sep" aria-hidden="true">·</span>
                <span class="edit-reading-unit">Épisode</span>
                <input id="f-current-episode" type="number" min="1" step="1" inputmode="numeric" value="${entry.current_episode ?? ""}" placeholder="–" aria-label="Épisode en cours" />
              </div>
            </div>
            <div class="form-group edit-repeat-group" id="edit-repeat" data-edit-repeat></div>
            <label class="toggle-row favorite-toggle">
              <span class="toggle-label">♥ Coup de cœur</span>
              <span class="toggle-switch">
                <input type="checkbox" id="f-favorite" ${entry.is_favorite?"checked":""} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </span>
            </label>
            </div>
            <button type="button" class="edit-details-trigger" ${uiAction("setEditDetailsView", [true])}>
              <span class="edit-details-trigger-icon" aria-hidden="true">＋</span>
              <span class="edit-details-trigger-copy">
                <strong>Détails facultatifs</strong>
                <small id="edit-details-summary">Genre, auteur, plateforme, couverture, synopsis</small>
              </span>
              <span class="edit-details-trigger-arrow" aria-hidden="true">→</span>
            </button>
          </div>
          <details class="advanced-details edit-details-panel">
            <summary class="advanced-summary">Détails facultatifs <span class="advanced-hint" id="edit-details-desktop-summary">genre, auteur, plateforme, couverture, synopsis</span></summary>
            <div class="advanced-body">
              <div class="edit-section-label">Informations</div>
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
              <div class="edit-section-label">Synopsis et couverture</div>
              <div class="form-group">
                <label for="f-description">Synopsis</label>
                <textarea id="f-description" rows="5" placeholder="Ajouter un synopsis si le catalogue n’en propose pas…">${esc(entry.description || "")}</textarea>
                <button type="button" class="btn btn-ghost btn-sm synopsis-translate" id="f-description-translate" hidden>Traduire en français</button>
              </div>
              <div class="form-group">
                <label>Image de couverture (URL)</label>
                <input type="url" id="f-cover" value="${esc(entry.cover_url||"")}" placeholder="https://…" />
              </div>
            </div>
          </details>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger btn-sm edit-delete-link" ${uiAction("deleteEntry", [entry.id])}>Supprimer</button>
          <button class="btn btn-secondary" ${uiAction("closeModal")}>Annuler</button>
          <button class="btn btn-primary" ${uiAction("saveEntry")}>Enregistrer</button>
        </div>
      </div>
    </div>`);
  pushHistoryLayer(_detailEditContext ? "edit" : "modal", { modal: "edit", mediaId: entry.id });
  syncSystemBar(_currentPage, null);
  bindCoverAccent(root.querySelector(".edit-modal"), entryCoverUrl);
  _currentRating = entry.rating || 0;
  buildRatingStars(entry.rating || 0);
  _editRepeatDelta = 0;
  renderEditRepeat();
  syncEditReading();
  ["f-current-page", "f-page-count"].forEach(id => document.getElementById(id)?.addEventListener("input", updateReadingPercent));
  document.getElementById("f-status")?.addEventListener("change", () => animateDialogUpdate(root.querySelector(".edit-modal"), () => { renderEditRepeat(); syncEditReading(); }));
  updateApiAvailLabel(entry.media_type || "movie");
  setupApiSearch();
  const detailsPanel = root.querySelector(".advanced-details");
  detailsPanel?.querySelector("summary")?.addEventListener("click", event => {
    event.preventDefault();
    animateDialogUpdate(root.querySelector(".edit-modal"), () => { detailsPanel.open = !detailsPanel.open; });
  });
  syncEditDetailsSummary();
  ["f-genre", "f-author", "f-platform", "f-cover", "f-description"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", syncEditDetailsSummary);
  });
  setupSynopsisTranslation();
  setupEditTypeSelect();
  document.getElementById("f-cover")?.addEventListener("change", event => {
    bindCoverAccent(root.querySelector(".edit-modal"), event.target.value);
  });
  // Sur mobile, ne pas ouvrir le clavier dès l’arrivée : la fiche reste entière.
  if (!window.matchMedia?.("(max-width: 680px)")?.matches) {
    const searchInput = root.querySelector("#f-api-search");
    setTimeout(() => { if (searchInput?.isConnected) searchInput.focus({ preventScroll: true }); }, 100);
  }
  setupMobileSheetSwipe({
    overlay: root.querySelector("#modal-overlay"),
    sheet: root.querySelector(".edit-modal"),
    dismiss: () => closeModal(),
    shouldResetBeforeDismiss: () => _modalDirty || _saveInProgress,
  });
  // Sur mobile la croix est masquée : le focus tombait sur le sélecteur de type,
  // dont l'anneau de focus s'affiche toujours. Annuler est un bouton neutre.
  const compactEdit = window.matchMedia?.("(max-width: 680px)")?.matches;
  activateDialog(root.querySelector(".edit-modal"), {
    initialFocus: compactEdit ? ".edit-modal .modal-footer .btn-secondary" : ".modal-header .btn-icon:last-child",
  });
}

// ── Relecture dans Modifier ─────────────────────────────────
// Rien n'est enregistré ici : _editRepeatDelta s'ajoute au compteur calculé
// par le changement de statut, et Enregistrer valide le tout en une fois.
let _editRepeatDelta = 0;

// Compteur de répétitions final pour la fiche en cours de modification.
// Le passage « En cours → Terminé » d'une reprise ajoute déjà 1 de lui-même :
// le pas manuel ne s'applique que par-dessus, sans double comptage.
function editRepeatState(existing, status) {
  const transition = statusTransitionChanges(existing, status);
  const base = repeatInfo(existing).repeats;
  const automatic = Object.prototype.hasOwnProperty.call(transition.changes, "repeat_count")
    ? transition.changes.repeat_count
    : base;
  const repeats = Math.max(0, Math.min(999, automatic + _editRepeatDelta));
  const preview = { ...existing, ...transition.changes, status, repeat_count: repeats };
  const info = repeatInfo(preview);
  return { transition, base, automatic, repeats, preview, info, progress: repeatProgressLabel(preview, info) };
}

function renderEditRepeat() {
  const host = document.getElementById("edit-repeat");
  const existing = State.editingId ? State.entries.find(item => item.id === State.editingId) : null;
  if (!host || !existing) return;
  const status = document.getElementById("f-status")?.value || existing.status;
  const state = editRepeatState(existing, status);
  const { info, progress, repeats } = state;
  host.hidden = !info.total;
  if (!info.total) { host.innerHTML = ""; return; }

  const words = mediaWords(existing.media_type);
  const [singular, plural] = info.unit;
  const countLabel = `${info.total} ${info.total > 1 ? plural : singular}`;
  const fullLabel = progress ? `${progress} · ${info.done} ${info.total} fois` : `${info.done} ${info.total} fois`;
  const canDown = !progress && repeats > 0;
  const canUp = !progress && repeats < 999;
  const pending = repeats !== state.base || state.transition.repeatStarted;
  const hint = progress
    ? "Le compteur augmentera quand vous passerez de nouveau sur Terminé."
    : pending ? "Pris en compte à l’enregistrement." : "";
  host.innerHTML = `
    <label id="edit-repeat-label">${words.eyebrow}</label>
    <div class="edit-repeat-row">
      <div class="quick-repeat-stepper ${progress ? "is-progress" : ""}" role="group" aria-labelledby="edit-repeat-label" aria-label="${esc(fullLabel)}">
        <button type="button" class="quick-repeat-adjust" data-repeat-dir="-1" ${uiAction("adjustEditRepeat", [-1])} ${canDown ? "" : "disabled"} aria-label="${esc(info.removeLabel)}">−</button>
        <span class="quick-repeat-value" title="${esc(fullLabel)}"><span>${esc(countLabel)}</span></span>
        <button type="button" class="quick-repeat-adjust quick-repeat-add" data-repeat-dir="1" ${uiAction("adjustEditRepeat", [1])} ${canUp ? "" : "disabled"} aria-label="${esc(info.action)} une fois de plus">+</button>
      </div>
      ${hint ? `<span class="edit-repeat-hint" aria-live="polite">${hint}</span>` : ""}
    </div>`;
}

function adjustEditRepeat(delta) {
  const direction = Number(delta) > 0 ? 1 : -1;
  const existing = State.editingId ? State.entries.find(item => item.id === State.editingId) : null;
  if (!existing) return;
  const status = document.getElementById("f-status")?.value || existing.status;
  const state = editRepeatState(existing, status);
  if (state.progress) return;
  const next = Math.max(0, Math.min(999, state.repeats + direction));
  if (next === state.repeats) return;
  _editRepeatDelta += next - state.repeats;
  markModalDirty();
  renderEditRepeat();
  // Le rendu remplace les boutons : le focus clavier revient sur le même sens.
  const buttons = [...document.querySelectorAll("#edit-repeat .quick-repeat-adjust")];
  (buttons.find(b => b.dataset.repeatDir === String(direction) && !b.disabled) || buttons.find(b => !b.disabled))?.focus({ preventScroll: true });
}

// Le type s'affiche en sélecteur compact. Les onglets d'origine restent dans la
// page, masqués : ils portent l'action setModalType et l'état du type, et le
// sélecteur ne fait que les piloter et les refléter.
function setupEditTypeSelect() {
  const select = document.getElementById("f-type-select");
  const tabs = [...document.querySelectorAll(".edit-modal .modal-type-tab")];
  const host = document.querySelector(".edit-modal .modal-type-tabs");
  if (!select || !tabs.length || !host) return;
  const sync = () => {
    const active = tabs.find(tab => tab.classList.contains("active"));
    if (active && select.value !== active.dataset.type) select.value = active.dataset.type;
  };
  select.addEventListener("change", () => tabs.find(tab => tab.dataset.type === select.value)?.click());
  new MutationObserver(sync).observe(host, { subtree: true, attributes: true, attributeFilter: ["class"] });
  sync();
}

// « Traduire en français » : propose la traduction dans le champ, sans rien
// enregistrer. L'utilisateur relit, puis enregistre ou rétablit l'original.
function setupSynopsisTranslation() {
  const field = document.getElementById("f-description");
  const button = document.getElementById("f-description-translate");
  if (!field || !button) return;
  let original = null;
  const refresh = () => {
    const text = field.value.trim();
    // Visible dès qu'il y a un texte : c'est l'utilisateur qui décide, la
    // détection de langue ne peut pas le cacher à tort.
    button.hidden = original === null && !text;
    button.textContent = original === null ? "Traduire en français" : "Rétablir l’original";
  };
  field.addEventListener("input", () => { original = null; refresh(); });
  button.addEventListener("click", async () => {
    if (original !== null) {
      field.value = original;
      original = null;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const source = field.value.trim();
    if (!source) return;
    button.disabled = true;
    button.textContent = "Traduction…";
    try {
      const result = await translateText(source, { force: true });
      if (!document.body.contains(field) || field.value.trim() !== source) return;
      if (!result.translated) { toast("Traduction indisponible pour le moment. Le texte est inchangé.", "error"); return; }
      if (result.text.trim() === source) { toast("Ce synopsis est déjà en français.", "info"); return; }
      field.value = result.text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      original = source;
    } finally {
      button.disabled = false;
      refresh();
    }
  });
  refresh();
}

// Pourcentage affiché dans la tuile « Ma lecture », recalculé à la frappe.
function updateReadingPercent() {
  const target = document.getElementById("edit-reading-percent");
  if (!target) return;
  const current = Number.parseInt(document.getElementById("f-current-page")?.value, 10);
  const total = Number.parseInt(document.getElementById("f-page-count")?.value, 10);
  target.textContent = Number.isInteger(current) && current >= 0 && total > 0 && current <= total
    ? `${Math.min(100, Math.round(current / total * 100))} %` : "";
}

function syncEditReading() {
  const row = document.getElementById("edit-reading");
  if (!row) return;
  const status = document.getElementById("f-status")?.value;
  row.hidden = document.getElementById("f-type")?.value !== "book" || status !== "playing";
  const seriesRow = document.getElementById("edit-series");
  if (seriesRow) {
    const wasHidden = seriesRow.hidden;
    seriesRow.hidden = !(document.getElementById("f-type")?.value === "movie" && document.getElementById("f-subtype")?.value === "tv" && status === "playing");
    const entryNow = State.entries.find(item => item.id === State.editingId);
    // Une série qui repasse En cours après un visionnage terminé repart de zéro.
    if (!seriesRow.hidden && seriesRow.dataset.status !== "playing" && entryNow && statusTransitionChanges(entryNow, status).repeatStarted) {
      document.getElementById("f-current-season").value = "";
      document.getElementById("f-current-episode").value = "";
    }
    seriesRow.dataset.status = status;
  }
  const entry = State.entries.find(item => item.id === State.editingId);
  const input = document.getElementById("f-current-page");
  if (!row.hidden && row.dataset.status !== "playing" && statusTransitionChanges(entry, status).repeatStarted) input.value = "0";
  row.dataset.status = status;
  updateReadingPercent();
}

function syncEditDetailsSummary() {
  const labels = [
    ["f-genre", "Genre"],
    ["f-author", "Auteur / réalisation"],
    ["f-platform", "Plateforme"],
    ["f-cover", "Couverture"],
    ["f-description", "Synopsis"],
  ].filter(([id]) => document.getElementById(id)?.value?.trim()).map(([, label]) => label);
  const text = labels.length ? labels.join(" · ") : "Genre, auteur, plateforme, couverture, synopsis";
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
  animateDialogUpdate(modal, () => {
    modal.dataset.editView = showDetails ? "details" : "main";
    details.open = Boolean(showDetails);
  });
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
    const starColor = filledFull ? "var(--brand-gold)" : "var(--star-empty)";
    const halfColor = (filledFull || filledHalf) ? "var(--brand-gold)" : "none";
    return `<span class="star-wrap">
        <svg viewBox="0 0 20 20" width="28" height="28" class="star-svg">
          <defs>
            <clipPath id="hc${i}x"><rect x="0" y="0" width="10" height="20"/></clipPath>
          </defs>
          <polygon class="star-bg" points="10,2 12.9,7.6 19,8.5 14.5,12.9 15.6,19 10,16 4.4,19 5.5,12.9 1,8.5 7.1,7.6" fill="${starColor}"/>
          <polygon class="star-half-fill" points="10,2 12.9,7.6 19,8.5 14.5,12.9 15.6,19 10,16 4.4,19 5.5,12.9 1,8.5 7.1,7.6" fill="${halfColor}" clip-path="url(#hc${i}x)"/>
        </svg>
        <button type="button" class="star-zone star-zone-half"
          data-rating-value="${half}"
          aria-label="Noter ${half} sur 10"
          aria-pressed="${current === half}"></button>
        <button type="button" class="star-zone star-zone-full"
          data-rating-value="${full}"
          aria-label="Noter ${full} sur 10"
          aria-pressed="${current === full}"></button>
      </span>`;
  }).join("");

  if (current) showRatingLabel(current);

  if (!wrap.dataset.ratingBound) {
    wrap.dataset.ratingBound = "true";
    wrap.addEventListener("click", event => {
      const zone = event.target.closest?.("[data-rating-value]");
      if (zone && wrap.contains(zone)) setRating(Number(zone.dataset.ratingValue));
    });
    wrap.addEventListener("pointerover", event => {
      const zone = event.target.closest?.("[data-rating-value]");
      if (zone && wrap.contains(zone)) previewRating(Number(zone.dataset.ratingValue));
    });
    wrap.addEventListener("focusin", event => {
      const zone = event.target.closest?.("[data-rating-value]");
      if (zone && wrap.contains(zone)) previewRating(Number(zone.dataset.ratingValue));
    });
  }

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
    if (bg) bg.setAttribute("fill", filledFull ? "var(--brand-gold)" : "var(--star-empty)");
    if (hf) hf.setAttribute("fill", (filledFull || filledHalf) ? "var(--brand-gold)" : "none");
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

function bookSearchSourceHTML(openLibrary = false, source = null) {
  return `<div class="book-search-source"><span>${source === "openlibrary" ? "Résultats Open Library" : source === "hardcover" ? "Résultats Hardcover" : "Un livre introuvable ?"}</span><button type="button" data-book-fallback>${openLibrary ? "Revenir à Hardcover" : "Essayer Open Library"}<span aria-hidden="true"> →</span></button></div>`;
}

function setupWizardUniversalSearch() {
  const input = document.getElementById("f-api-search");
  const results = document.getElementById("api-results");
  if (!input || !results) return;
  let timer;
  let requestSeq = 0;
  let activeController = null;
  input.dataset.kulturoSearch = "true";
  input._kulturoAbortSearch = () => {
    clearTimeout(timer);
    input._bookSelectionController?.abort();
    requestSeq++;
    activeController?.abort();
  };

  const typeLabels = { all: "Titre, ISBN ou lien…", movie: "Film ou série : titre ou lien…", game: "Jeu vidéo : titre ou lien Steam…", book: "Livre : titre, ISBN ou lien…" };
  const syncScanButton = () => {
    const button = document.getElementById("wz-scan-btn");
    if (!button) return;
    const type = _wizardState?.searchType || "all";
    button.hidden = !(scannerSupported() && (type === "all" || type === "book"));
  };
  const applySearchType = value => {
    if (!_wizardState) return;
    _wizardState.searchType = value;
    document.querySelectorAll("#add-search-types button").forEach(item => {
      item.setAttribute("aria-pressed", String(item.dataset.searchType === value));
    });
    input.placeholder = typeLabels[value] || typeLabels.all;
    const start = document.getElementById("wz-search-start");
    if (start) {
      start.querySelector("strong").textContent = value === "all" ? "Une seule recherche pour toute votre culture" : "Trouvez votre prochaine œuvre";
      start.querySelector("small").textContent = value === "all" ? "Films, séries, jeux et livres" : (document.querySelector(`#add-search-types [data-search-type="${value}"]`)?.textContent || "");
    }
    syncScanButton();
  };
  input._kulturoApplyIsbn = isbn => {
    delete input.dataset.openLibraryQuery;
    applySearchType("book");
    input.value = isbn;
    scheduleSearch(true);
  };
  syncScanButton();

  const scheduleSearch = (immediate = false) => {
    clearTimeout(timer);
    input._bookSelectionController?.abort();
    activeController?.abort();
    requestSeq++;
    let query = input.value.trim();
    // Ajout rapide : un lien collé est reconnu. Les liens TMDb/IMDb désignent
    // une fiche exacte ; les autres donnent un titre qui remplace le lien.
    const link = parseMediaLink(query);
    if (link && !link.unsupported && link.query) {
      query = link.query;
      input.value = query;
      delete input.dataset.openLibraryQuery;
      applySearchType(link.mediaType === "movie" ? "movie" : link.mediaType);
    } else if (link?.imdbId || link?.externalId) {
      applySearchType("movie");
    }
    const start = document.getElementById("wz-search-start");
    if (_wizardState) _wizardState.title = link?.imdbId || link?.externalId ? "" : query;
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
      if (!input.isConnected) return;
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

      const failures = [];
      let bookSource = null;
      if (link?.unsupported) {
        animateHeightChange(results, () => { results.innerHTML = `<div class="wz-search-empty" role="status">${esc(linkProblemMessage(link))}</div>`; });
        return;
      }
      const exactLink = link?.imdbId || link?.externalId ? link : null;
      const types = exactLink ? ["movie"] : addSearchTypes(query, _wizardState?.searchType, Boolean(normalizeISBN(query)));
      const requests = types.map(async type => {
        try {
          if (exactLink) {
            const item = exactLink.imdbId
              ? await TMDb.byImdb(exactLink.imdbId, { signal })
              : await TMDb.byId(exactLink.externalId, exactLink.subtype, { signal });
            return item ? [{ ...item, media_type: "movie" }] : [];
          }
          if (!apiAvailability()[type]) { failures.push(type); return []; }
          const items = await searchMedia(query, type, { signal, throwOnError: true, onBookSource: source => { bookSource = source; }, bookSource: input.dataset.openLibraryQuery === query ? "openlibrary" : undefined });
          return (items || []).slice(0, 5).map(item => ({ ...item, media_type: type }));
        } catch {
          if (!signal.aborted) failures.push(type);
          return [];
        }
      });
      const grouped = await Promise.all(requests);
      if (!input.isConnected || signal.aborted || seq !== requestSeq || input.value.trim() !== query) return;

      const allItems = grouped.flat();
      const items = allItems.filter(item => !findMatchingEntry(item));
      const unavailable = failures.map(type => ({movie: "films et séries", game: "jeux", book: "livres"})[type]).join(", ");
      const emptyMessage = allItems.length ? "Les œuvres trouvées sont déjà dans votre bibliothèque." : failures.length ? "La recherche est incomplète. Réessayez dans quelques instants ou ajoutez votre œuvre manuellement." : `Aucun résultat pour « ${esc(query)} ». Essayez un titre plus court ou, pour un livre, son ISBN.`;
      window._apiResults = items;
      const resultItems = items.map((item, index) => {
        const coverUrl = searchCoverUrl(item.cover_url);
        return `
          <button type="button" class="api-result-item wz-universal-result" ${uiAction("fillFromApi", [index])}>
            ${coverUrl ? `<img class="api-result-thumb fade-image" data-fade-image src="${esc(coverUrl)}" alt="" loading="lazy" decoding="async">` : `<div class="api-result-thumb api-result-placeholder">${iconMedia(item.media_type, item.subtype)}</div>`}
            <span class="api-result-info">
              <strong class="api-result-title">${esc(item.title)}</strong>
              <small class="api-result-sub">${esc(getTypeLabel(item))}${item.release_year ? ` · ${esc(item.release_year)}` : ""}${item.author ? ` · ${esc(item.author)}` : ""}</small>
            </span>
          </button>`;
      }).join("");
      animateHeightChange(results, () => { results.innerHTML = `
        ${failures.length ? `<p class="wz-search-empty" role="status">Catalogue indisponible : ${esc(unavailable)}.</p>` : ""}
        ${resultItems || `<div class="wz-search-empty" role="status">${emptyMessage}</div>`}
        ${types.includes("book") ? bookSearchSourceHTML(input.dataset.openLibraryQuery === query, bookSource) : ""}
        <div class="wz-manual-result">
          <span>Pas le bon résultat ? Ajouter « ${esc(query)} » comme :</span>
          <div class="wz-manual-types" role="group" aria-label="Type pour un ajout manuel">
            <button type="button" ${types.includes("movie") ? "" : "hidden"} ${uiAction("wzUseManualType", ["movie"])}>${iconMedia("movie")} Films</button>
            <button type="button" ${types.includes("movie") ? "" : "hidden"} ${uiAction("wzUseManualType", ["tv"])}>${iconMedia("movie", "tv")} Séries</button>
            <button type="button" ${types.includes("game") ? "" : "hidden"} ${uiAction("wzUseManualType", ["game"])}>${iconMedia("game")} Jeux</button>
            <button type="button" ${types.includes("book") ? "" : "hidden"} ${uiAction("wzUseManualType", ["book"])}>${iconMedia("book")} Livres</button>
          </div>
        </div>`;
        hydrateFadeImages(results);
      });
    }, immediate ? 0 : 320);
  };

  document.getElementById("add-search-types")?.addEventListener("click", event => {
    const button = event.target.closest("[data-search-type]");
    if (!button || !_wizardState) return;
    delete input.dataset.openLibraryQuery;
    applySearchType(button.dataset.searchType);
    scheduleSearch(true);
  });
  results.addEventListener("click", event => {
    if (!event.target.closest("[data-book-fallback]")) return;
    if (input.dataset.openLibraryQuery === input.value.trim()) delete input.dataset.openLibraryQuery;
    else input.dataset.openLibraryQuery = input.value.trim();
    scheduleSearch(true);
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    scheduleSearch(true);
  });
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
  input._kulturoAbortSearch = () => {
    clearTimeout(timer);
    input._bookSelectionController?.abort();
    requestSeq++;
    activeController?.abort();
  };

  const scheduleSearch = (immediate = false) => {
    clearTimeout(timer);
    input._bookSelectionController?.abort();
    activeController?.abort();
    requestSeq++;
    const q = input.value.trim();
    if (q.length < 2) {
      activeController?.abort();
      requestSeq++;
      results.style.display = "none";
      return;
    }
    timer = setTimeout(async () => {
      if (!input.isConnected) return;
      const type  = document.getElementById("f-type")?.value || "game";
      const requestedSubtype = document.getElementById("f-subtype")?.value;
      const seq = ++requestSeq;
      activeController?.abort();
      activeController = new AbortController();
      const { signal } = activeController;
      let items;
      let bookSource = null;
      try {
        items = await searchMedia(q, type, { signal, throwOnError: true, onBookSource: source => { bookSource = source; }, bookSource: input.dataset.openLibraryQuery === q ? "openlibrary" : undefined });
        if (type === "movie") items = items.filter(item => normalizedSubtype(item) === requestedSubtype);
      } catch (error) {
        if (signal.aborted || !input.isConnected || seq !== requestSeq) return;
        results.style.display = "block";
        results.innerHTML = '<div class="wz-search-empty">Recherche momentanément indisponible.</div>';
        console.warn("[Recherche œuvre]", error);
        return;
      }
      if (!input.isConnected || signal.aborted || seq !== requestSeq || input.value.trim() !== q ||
          (document.getElementById("f-type")?.value || "game") !== type ||
          document.getElementById("f-subtype")?.value !== requestedSubtype) return;
      if (!items.length) {
        window._apiResults = [];
        results.style.display = "block";
        results.innerHTML = `<div class="wz-search-empty" role="status">Aucun résultat. Essayez un autre titre${type === "book" ? " ou un ISBN" : ""}. Vous pouvez aussi conserver votre saisie.</div>${type === "book" ? bookSearchSourceHTML(input.dataset.openLibraryQuery === q, bookSource) : ""}`;
        return;
      }
      results.style.display = "block";
      animateHeightChange(results, () => { results.innerHTML = items.map((it, idx) => `
        <button type="button" class="api-result-item" ${uiAction("fillFromApi", [idx])}>
          ${searchCoverUrl(it.cover_url) ? `<img class="api-result-thumb fade-image" data-fade-image src="${esc(searchCoverUrl(it.cover_url))}" alt="" loading="lazy" decoding="async">` : `<div class="api-result-thumb api-result-placeholder">${iconMedia(type, it.subtype)}</div>`}
          <div class="api-result-info">
            <div class="api-result-title">${esc(it.title)}</div>
            <div class="api-result-sub">${esc(it.release_year||"")} ${esc(it.author||"")}</div>
          </div>
        </button>`).join("");
        hydrateFadeImages(results);
      });
      // Stocker temporairement
      window._apiResults = items;
      if (type === "book") results.insertAdjacentHTML("beforeend", bookSearchSourceHTML(input.dataset.openLibraryQuery === q, bookSource));
    }, immediate ? 0 : 350);
  };

  results.addEventListener("click", event => {
    if (!event.target.closest("[data-book-fallback]")) return;
    if (input.dataset.openLibraryQuery === input.value.trim()) delete input.dataset.openLibraryQuery;
    else input.dataset.openLibraryQuery = input.value.trim();
    scheduleSearch(true);
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    scheduleSearch(true);
  });
  input.addEventListener("input", () => scheduleSearch(false));
  input._kulturoSearch = () => scheduleSearch(true);
}

async function fillFromApi(idx) {
  let it = window._apiResults?.[idx];
  if (!it) return;
  document.getElementById("f-api-search")?._bookSelectionController?.abort();
  if (it.source_api === "hardcover") {
    const input = document.getElementById("f-api-search"), results = document.getElementById("api-results");
    if (!input || !results) return;
    const controller = new AbortController();
    input._bookSelectionController = controller;
    const original = it, query = input.value;
    results.querySelector(".book-selection-status")?.remove();
    const status = document.createElement("p");
    status.className = "book-selection-status";
    status.setAttribute("role","status");
    status.textContent = "Préparation de l’édition…";
    results.append(status);
    try {
      const selected = await Hardcover.select(it.external_id,{signal:controller.signal});
      if (controller.signal.aborted || !input.isConnected || input.value !== query || window._apiResults?.[idx] !== original) return;
      it = {...selected,genre:original.genre || selected.genre};
    } catch(error) {
      if (!controller.signal.aborted && input.isConnected) toast("L’édition n’a pas pu être chargée. Réessayez ou choisissez Open Library.","error");
      return;
    } finally {
      status.remove();
      if (input._bookSelectionController === controller) delete input._bookSelectionController;
    }
  }
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
  const synopsisInput = document.getElementById("f-description");
  if (synopsisInput && !synopsisInput.value.trim()) synopsisInput.value = it.description || "";
  const previous = window._apiSelected || State.entries.find(item => item.id === State.editingId);
  if (previous && (previous.source_api !== it.source_api || String(previous.external_id || "") !== String(it.external_id || ""))) {
    const page = document.getElementById("f-current-page"), total = document.getElementById("f-page-count");
    if (page) page.value = "";
    if (total) total.value = it.page_count || "";
    const seasonInput = document.getElementById("f-current-season"), episodeInput = document.getElementById("f-current-episode");
    if (seasonInput) seasonInput.value = "";
    if (episodeInput) episodeInput.value = "";
    const seasonTotal = document.getElementById("edit-series-total");
    if (seasonTotal) seasonTotal.textContent = it.seasons_count ? `/ ${it.seasons_count}` : "";
  }
  window._apiSelected = it;
  document.getElementById("api-results").style.display = "none";
  syncEditDetailsSummary();
  const editModal = document.querySelector(".edit-modal");
  if (editModal) bindCoverAccent(editModal, it.cover_url);
  if (it.cover_url || it.genre) {
    const details = document.querySelector(".advanced-details");
    if (details && !window.matchMedia?.("(max-width: 680px)")?.matches) animateDialogUpdate(editModal, () => { details.open = true; });
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
  setButtonBusy(saveBtn, true);

  const existing = State.editingId ? State.entries.find(e => e.id === State.editingId) : null;
  const selected = window._apiSelected || null;
  const mediaType = document.getElementById("f-type")?.value;
  const mediaSubtype = mediaType === "movie" ? (document.getElementById("f-subtype")?.value || "movie") : null;
  const keepExistingApi = Boolean(existing && !selected &&
    existing.media_type === mediaType && normalizedSubtype(existing) === mediaSubtype && normalizeTitle(existing.title) === normalizeTitle(title));

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
    subtype:       selected?.subtype     ?? mediaSubtype,
    release_year:  selected?.release_year ?? (keepExistingApi ? existing.release_year : null),
    release_date:  selected?.release_date ?? (keepExistingApi ? existing.release_date : null),
    release_date_precision: selected?.date_precision ?? selected?.release_date_precision
      ?? (keepExistingApi ? existing.release_date_precision : "day"),
    description: document.getElementById("f-description") ? document.getElementById("f-description").value.trim() || null : selected?.description ?? (keepExistingApi ? existing.description : null),
    isbn: selected?.isbn ?? (keepExistingApi ? existing.isbn : null),
    page_count: selected?.page_count ?? (keepExistingApi ? existing.page_count : null),
    publisher: selected?.publisher ?? (keepExistingApi ? existing.publisher : null),
  };

  // Ces colonnes existent déjà. La même logique est utilisée dans Modifier et
  // dans les actions rapides afin qu'un revisionnage soit compté une seule fois.
  const today = localISODate();
  const statusTransition = statusTransitionChanges(existing, payload.status, today);
  if (Object.prototype.hasOwnProperty.call(statusTransition.changes, "current_page")) payload.current_page = statusTransition.changes.current_page;
  for (const field of ["current_season", "current_episode"]) {
    if (Object.prototype.hasOwnProperty.call(statusTransition.changes, field)) payload[field] = statusTransition.changes[field];
  }
  if (statusTransition.changes.date_started) payload.date_started = statusTransition.changes.date_started;
  if (statusTransition.changes.date_finished) payload.date_finished = statusTransition.changes.date_finished;
  if (Object.prototype.hasOwnProperty.call(statusTransition.changes, "repeat_count")) {
    payload.repeat_count = statusTransition.changes.repeat_count;
  }
  // Pas manuel de la section « Relecture » : il s'ajoute au résultat du statut
  // (jamais deux fois) et n'est envoyé que si le compteur change réellement.
  const previousRepeats = existing ? repeatInfo(existing).repeats : 0;
  if (existing && _editRepeatDelta !== 0) {
    const finalRepeats = editRepeatState(existing, payload.status).repeats;
    if (finalRepeats !== previousRepeats) payload.repeat_count = finalRepeats;
    else delete payload.repeat_count;
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
     "page_count", "isbn", "release_date"].forEach(field => { payload[field] = null; });
    payload.release_date_precision = "day";
    if (existing.current_page != null && (selectedIdentityChanged || mediaType !== "book")) payload.current_page = null;
    if ((existing.current_season != null || existing.current_episode != null) &&
        (selectedIdentityChanged || mediaType !== "movie" || mediaSubtype !== "tv")) {
      payload.current_season = null;
      payload.current_episode = null;
    }
    if (!selected && existing.media_type === "book" && mediaType === "book") payload.page_count = existing.page_count ?? null;
  }

  const readingInput = document.getElementById("f-current-page");
  if (readingInput && mediaType === "book" && payload.status === "playing") {
    try {
      Object.assign(payload, parseReadingProgress(readingInput.value, document.getElementById("f-page-count").value));
    } catch (error) {
      setButtonBusy(saveBtn, false);
      toast(error.message, "error");
      readingInput.focus({ preventScroll: true });
      return;
    }
  }

  const seasonInput = document.getElementById("f-current-season");
  if (seasonInput && mediaType === "movie" && mediaSubtype === "tv" && payload.status === "playing") {
    try {
      Object.assign(payload, parseSeriesProgress(seasonInput.value, document.getElementById("f-current-episode").value));
    } catch (error) {
      setButtonBusy(saveBtn, false);
      toast(error.message, "error");
      seasonInput.focus({ preventScroll: true });
      return;
    }
  }

  const duplicate = findMatchingEntry(payload, State.editingId);
  if (duplicate) {
    setButtonBusy(saveBtn, false);
    toast(`"${duplicate.title}" est déjà dans votre bibliothèque.`, "info");
    return;
  }

  _saveInProgress = true;
  const saveOwner = State.user?.id;
  const editingId = State.editingId;
  if (!saveOwner) {
    _saveInProgress = false;
    setButtonBusy(saveBtn, false);
    return;
  }
  try {
    if (editingId) {
      const updated = await Media.update(editingId, payload);
      if (!sameOwner(saveOwner, State.user?.id)) return;
      // Une simple note ou un cœur ne justifie pas un nouvel enrichissement.
      // Les marqueurs internes ne sont jamais envoyés à Supabase.
      if (keepExistingApi) {
        for (const key of ["_detailsFetched", "_backdropRepairAttempted", "cast_people", "external_ratings"]) {
          if (existing[key] !== undefined) updated[key] = existing[key];
        }
      }
      const idx = State.entries.findIndex(e => e.id === editingId);
      if (idx !== -1) State.entries[idx] = updated;
    } else {
      const created = await Media.create(payload);
      if (!sameOwner(saveOwner, State.user?.id)) return;
      State.entries.unshift(created);
    }
    cacheEntriesLocally();
    markJournalDirty();
    const savedEntry = editingId ? State.entries.find(e => e.id === editingId) : null;
    if (savedEntry && repeatInfo(savedEntry).repeats < previousRepeats) void revokeStaleRepeatEvents(savedEntry);
    _editRepeatDelta = 0;
    const wasAdding = !State.editingId;
    const savedTitle = payload.title;
    const savedId = editingId || State.entries[0]?.id;
    const justFinished = payload.status === "finished" && existing?.status !== "finished";
    _modalDirty = false;
    _saveInProgress = false;
    closeModal();
    // #13 — State.entries déjà mis à jour localement, pas besoin de refetch
    renderCards();
    if (_currentPage === "upcoming") upcomingFeature.renderCards();
    updateBadges();
    const awaitsSync = Media.getStatus().pending > 0;
    toast(
      awaitsSync
        ? (wasAdding ? `"${savedTitle}" ajouté sur cet appareil` : "Mis à jour sur cet appareil")
        : (wasAdding ? `"${savedTitle}" ajouté ✓` : "Mis à jour ✓"),
      awaitsSync ? "info" : "success"
    );
    if (wasAdding) flashNewCard(savedId);
    if (justFinished) launchConfetti();
  } catch (e) {
    if (!sameOwner(saveOwner, State.user?.id)) return;
    const saveBtn = document.querySelector(".modal-footer .btn-primary");
    setButtonBusy(saveBtn, false);
    toast(
      /repeat_count|schema cache/i.test(String(e?.message || "")) && Object.prototype.hasOwnProperty.call(payload, "repeat_count")
        ? "Le compteur de reprises n’est pas disponible dans Supabase."
        : "Erreur : " + e.message,
      "error"
    );
  } finally {
    _saveInProgress = false;
  }
}

async function deleteEntry(id) {
  const confirmed = await confirmDialog("Supprimer cette œuvre ?", "Vous pourrez annuler pendant quelques secondes.", "Supprimer", "danger");
  if (!confirmed) return;
  const deleteOwner = State.user?.id;
  if (!deleteOwner) return;
  try {
    // Anime la card avant suppression
    const cardEl = document.querySelector(`.media-card[data-id="${id}"]`);
    if (cardEl) {
      cardEl.classList.add("card-exit");
      await new Promise(r => setTimeout(r, 300));
    }
    if (!sameOwner(deleteOwner, State.user?.id)) return;
    const removedEntry = await Media.delete(id, { undoDelay: 7000 });
    if (!sameOwner(deleteOwner, State.user?.id)) return;
    State.entries = State.entries.filter(e => e.id !== id);
    cacheEntriesLocally();
    markJournalDirty();
    _modalDirty = false;
    closeModal();
    renderCards();
    if (_currentPage === "upcoming") upcomingFeature.renderCards();
    updateBadges();
    toast("Œuvre supprimée", "info", {
      actionLabel: "Annuler",
      duration: 6800,
      onAction: async () => {
        let restored = await Media.undoDelete(id);
        // Un média créé puis supprimé entièrement hors ligne n’a encore aucune
        // ligne distante : sa suppression annule logiquement sa création. Le
        // bouton Annuler le recrée alors avec le même identifiant local.
        if (!restored && removedEntry) restored = await Media.create(removedEntry);
        if (!restored || !sameOwner(deleteOwner, State.user?.id)) return;
        if (!State.entries.some(entry => entry.id === restored.id)) State.entries.unshift(restored);
        cacheEntriesLocally();
        markJournalDirty();
        renderCards();
        if (_currentPage === "upcoming") upcomingFeature.renderCards();
        updateBadges();
        toast(`« ${removedEntry?.title || restored.title} » restauré`, "success");
      },
    });
  } catch (e) {
    if (sameOwner(deleteOwner, State.user?.id)) toast("Erreur : " + e.message, "error");
  }
}

// ── Modal helpers ─────────────────────────────────────────────
async function closeModal(force = false, options = {}) {
  if (_saveInProgress) {
    toast("Enregistrement en cours…", "info");
    return false;
  }
  if (_restoreInProgress && document.querySelector("#modal-overlay .backup-restore-modal")) {
    toast("La restauration est en cours, gardez cette fenêtre ouverte.", "info");
    return false;
  }
  if (!options.fromHistory && (historyOwnsLayer("modal") || historyOwnsLayer("edit"))) {
    if (_detailEditContext && !State.entries.some(entry => entry.id === _detailEditContext.id)) history.go(-2);
    else history.back();
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
  if (returnToDetail()) return true;
  _detailEditContext = null;
  const overlay = document.getElementById("modal-overlay");
  const closingDialog = overlay?.querySelector("[role='dialog'], [role='alertdialog']") || null;
  const closingSessionId = detailSessions.currentId();
  const cleanup = () => {
    const root = document.getElementById("modal-root");
    const currentOverlay = root?.querySelector("#modal-overlay") || null;
    const stillOwnsRoot = !overlay || currentOverlay === overlay;
    const stillOwnsSession = !closingSessionId || detailSessions.isCurrent(closingSessionId);
    // Une nouvelle fiche peut avoir été ouverte pendant la fin de l'animation.
    // L'ancien minuteur ne doit jamais démonter cette nouvelle fiche.
    if (!stillOwnsRoot || !stillOwnsSession) {
      overlay?.remove();
      if (closingDialog) dialogFocus.deactivate(closingDialog, { restoreFocus: false });
      return;
    }
    detailSessions.dispose(closingSessionId);
    document.querySelectorAll("[data-kulturo-search]").forEach(input => input._kulturoAbortSearch?.());
    if (root) {
      // Safari libère plus sûrement les gros bitmaps lorsque leurs références
      // sont retirées avant de démonter la fiche complète.
      root.querySelectorAll("img").forEach(image => {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      });
      root.innerHTML = "";
    }
    syncDialogBackground();
    if (closingDialog) dialogFocus.deactivate(closingDialog, { restoreFocus: true });
    _modalReturnFocus = null;
    _modalReturnMediaId = null;
    _modalReturnControlId = null;
    _currentRating = 0;
    _wizardScanner?.stop(); _wizardScanner = null;
    _wizardState = null;
    State.editingId = null;
    window._apiSelected = null;
    window._apiResults = [];
    _modalDirty = false;
    _modalClosePromptOpen = false;
    _pendingRestorePlan = null;
    _pendingRestoreEvents = null;
    _restoreInProgress = false;
    syncSystemBar(_currentPage, null);
  };
  if (!overlay) { cleanup(); return true; }
  if (overlay.classList.contains("is-closing")) return true;
  // La jaquette peut finir son animation, mais les enrichissements de la
  // fiche fermée n'ont plus aucune raison de continuer en arrière-plan.
  detailSessions.startClosing(closingSessionId);
  prepareDialogClose(overlay);
  overlay.classList.add("is-closing");
  setTimeout(cleanup, motionDuration());
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
    const returnFocus = document.activeElement;
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
    const confirmModal = overlay.querySelector(".confirm-modal");
    syncDialogBackground();
    const cleanup = (result) => {
      if (overlay.classList.contains("is-closing")) return;
      prepareDialogClose(overlay);
      overlay.classList.add("is-closing");
      setTimeout(() => {
        overlay.remove();
        if (parentModal) parentModal.inert = false;
        syncDialogBackground();
        dialogFocus.deactivate(confirmModal, { restoreFocus: true });
        resolve(result);
      }, motionDuration());
    };
    document.getElementById("confirm-ok").onclick     = () => cleanup(true);
    document.getElementById("confirm-cancel").onclick = () => cleanup(false);
    document.getElementById("confirm-close").onclick = () => cleanup(false);
    overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(false); });
    setupMobileSheetSwipe({
      overlay,
      sheet: confirmModal,
      dismiss: () => cleanup(false),
    });
    dialogFocus.activate(confirmModal, {
      returnFocus,
      initialFocus: "#confirm-ok",
      onEscape: () => cleanup(false),
    });
  });
}


// ── Filtres chip (status bar) ─────────────────────────────────
function syncFilterChips() {
  const status = State.filters.status;
  document.querySelectorAll("#fm-status-chips .filter-chip").forEach(chip => {
    const value = chip.dataset.value;
    chip.classList.toggle("active", value === status);
  });
  const favoriteChip = document.querySelector('#fm-marker-chips [data-marker="favorite"]');
  if (favoriteChip) {
    favoriteChip.classList.toggle("active", State.filters.favorite);
    favoriteChip.setAttribute("aria-pressed", String(State.filters.favorite));
  }
  const replayChip = document.querySelector('#fm-marker-chips [data-marker="replay"]');
  if (replayChip) {
    replayChip.classList.toggle("active", State.filters.replay);
    replayChip.setAttribute("aria-pressed", String(State.filters.replay));
    const replayLabel = replayChip.querySelector(".replay-chip-label");
    if (replayLabel) replayLabel.textContent = replayFilterLabel(State.filters.type);
  }
  refreshSortChips();
  _updateFilterModalTypeChips();
  scheduleUiSnapshot();
}

let _chipDebounce = null;
function setStatusChip(status) {
  State.filters.status = status;
  syncFilterChips();
  _updateFilterToggleLabel(); _updateFilterModalHeader();
  const fmChips = document.getElementById("fm-status-chips");
  if (fmChips) {
    fmChips.querySelectorAll(".filter-chip").forEach(b => {
      const s = b.dataset.value;
      b.classList.toggle("active", s === status);
      b.setAttribute("aria-pressed", String(s === status));
    });
  }
  _updateResetBtn();
  _updateFilterResultCount();
  clearTimeout(_chipDebounce);
  _chipDebounce = setTimeout(() => renderCards({ resetScroll: true }), 80);
}
// Puces de tri : « Fins récentes » n'est proposée que si le statut a une date de fin.
function sortChipsHTML() {
  const active = resolveLibrarySort(State.filters);
  return librarySortOptions(State.filters.status).map(([value, label]) =>
    `<button class="filter-chip ${active === value ? "active" : ""}" data-value="${value}"
      aria-pressed="${active === value}" ${uiAction("setSort", [value])}>${label}</button>`
  ).join("");
}

function refreshSortChips() {
  const chips = document.getElementById("fm-sort-chips");
  if (chips) chips.innerHTML = sortChipsHTML();
}

function setSort(val) {
  if (!LIBRARY_SORTS.includes(val)) return;
  // Cliquer le tri déjà appliqué par « auto » ne fige pas un choix explicite.
  if (State.filters.sort === DEFAULT_LIBRARY_SORT && val === resolveLibrarySort(State.filters)) return;
  State.filters.sort = val;
  _updateFilterToggleLabel(); _updateFilterModalHeader();
  refreshSortChips();
  _updateResetBtn();
  _updateFilterResultCount();
  persistSortPreference(val);
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

    const route = parseAppRoute(window.location.hash);
    const target = event.state?.kulturo ? event.state : route ? {
      kulturo: true, page: route.page, layer: route.layer, ...route.payload,
    } : null;
    if (route) {
      Object.assign(State.filters, route.filters);
      profileFeature.restoreContext(route.views.profile);
      journalFeature.restoreContext(route.views.journal);
      upcomingFeature.restoreContext(route.views.upcoming);
    }
    if (target?.kulturo && target.page && target.page !== _currentPage) {
      navTo(target.page, { history: "none", preserveFilters: true, preserveSearch: true });
    }
    if (target?.layer === "modal" && target.modal === "detail" && target.mediaId) {
      _pendingRouteDetailId = target.mediaId;
      restorePendingRouteDetail();
    } else if (openAddFromRoute(route)) {
      // Le raccourci « Ajouter » ouvre la feuille d'ajout par-dessus la page.
    } else if (target?.page === "library") {
      const search = document.getElementById("global-search");
      if (search) search.value = State.filters.search || "";
      syncFilterChips();
      renderCards();
    }
  } finally {
    _handlingPopState = false;
  }
}

function bindGlobalEvents() {
  uiActionDispatcher.bind(document);
  document.addEventListener("load", event => {
    if (event.target instanceof HTMLImageElement && event.target.matches("[data-fade-image]")) {
      revealImage(event.target);
    }
  }, true);
  document.addEventListener("error", event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches("[data-image-fallback]")) return;
    image.style.display = "none";
    const display = image.dataset.imageFallback;
    if (display !== "hide" && image.nextElementSibling) image.nextElementSibling.style.display = display;
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
  document.addEventListener("input", e => {
    if (e.target.closest?.("#modal-overlay") && e.target.type !== "hidden") markModalDirty();
    if (e.target.id === "upcoming-search") upcomingFeature.setSearch(e.target.value);
    if (e.target.id === "global-search") {
      const q = e.target.value.trim();
      if (_currentPage === "upcoming") {
        const pageSearch = document.getElementById("upcoming-search");
        if (pageSearch) pageSearch.value = q;
        upcomingFeature.setSearch(q);
      } else if (_currentPage === "journal") {
        e.target.dataset.journalQuery = q;
        journalFeature.setSearch(q);
      } else {
        State.filters.search = q;
        scheduleUiSnapshot();
        _updateFilterToggleLabel();
        if (_currentPage === "library") scheduleLibraryRender({ resetScroll: true });
      }
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
  window.addEventListener("online", () => {
    syncNetworkStatus();
    if (State.user) loadEntries();
  });
  window.addEventListener("offline", syncNetworkStatus);
  window.addEventListener("kulturo:sync-state", syncNetworkStatus);
  // La largeur de la fiche peut changer (rotation mobile, redimensionnement
  // desktop). On recalcule alors le vrai débordement du synopsis.
  let synopsisResizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(synopsisResizeTimer);
    synopsisResizeTimer = setTimeout(() => {
      syncBackToTop();
      document.querySelectorAll(".detail-synopsis-wrap[id^='syn-']").forEach(wrap => {
        _scheduleSynopsisOverflowCheck(wrap.id.slice(4));
      });
    }, 120);
  });

  hydrateFadeImages(document);
}

function syncNetworkStatus() {
  const indicator = document.getElementById("network-status");
  if (!indicator) return;
  const offline = navigator.onLine === false;
  const sync = Media.getStatus();
  const pending = Number(sync.pending || 0);
  const syncing = !offline && sync.state === "syncing";
  const unavailable = !offline && (sync.state === "error" || _remoteSyncUnavailable);
  const label = offline
    ? pending ? `Hors connexion · ${pending} en attente` : "Hors connexion"
    : syncing ? "Synchronisation…"
      : unavailable ? pending ? `Synchronisation indisponible · ${pending} en attente` : "Synchronisation indisponible"
        : pending ? `${pending} modification${pending > 1 ? "s" : ""} en attente` : "Synchronisé";
  indicator.hidden = !offline && !unavailable && !pending && !syncing;
  indicator.setAttribute("aria-label", label);
  indicator.dataset.state = offline ? "offline" : unavailable ? "error" : syncing ? "syncing" : pending ? "pending" : "synced";
  const text = indicator.querySelector("span");
  if (text) text.textContent = label;
  document.documentElement.classList.toggle("is-offline", offline);
  document.documentElement.classList.toggle("is-sync-unavailable", !offline && _remoteSyncUnavailable);
}

// ── Toast ─────────────────────────────────────────────────────
function dismissToast(element) {
  if (!element || element.classList.contains("removing")) return;
  clearTimeout(element._dismissTimer);
  element.classList.add("removing");
  element.addEventListener("animationend", () => element.remove(), { once: true });
  setTimeout(() => element.remove(), 260);
}

function toast(msg, type = "info", options = {}) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const normalizedType = ["success", "error", "info"].includes(type) ? type : "info";
  const key = `${normalizedType}:${String(msg)}`;
  const existing = [...container.children].find(item => item.dataset.toastKey === key);
  if (existing) {
    clearTimeout(existing._dismissTimer);
    existing.classList.remove("removing", "is-repeated");
    existing.getBoundingClientRect();
    existing.classList.add("is-repeated");
    existing._dismissTimer = setTimeout(() => dismissToast(existing), Number(options.duration) || (normalizedType === "error" ? 4600 : 3000));
    return existing;
  }
  while (container.children.length >= 3) container.firstElementChild?.remove();
  const el = document.createElement("div");
  el.className = `toast ${normalizedType}`;
  el.dataset.toastKey = key;
  el.setAttribute("role", normalizedType === "error" ? "alert" : "status");
  const copy = document.createElement("span");
  copy.className = "toast-copy";
  copy.textContent = msg;
  el.appendChild(copy);
  if (options.actionLabel && typeof options.onAction === "function") {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toast-action";
    action.textContent = options.actionLabel;
    action.addEventListener("click", async () => {
      if (action.disabled) return;
      action.disabled = true;
      clearTimeout(el._dismissTimer);
      try { await options.onAction(); } finally { dismissToast(el); }
    }, { once: true });
    el.appendChild(action);
  }
  container.appendChild(el);
  const duration = Number(options.duration) || (normalizedType === "error" ? 4600 : normalizedType === "success" ? 2600 : 3200);
  el._dismissTimer = setTimeout(() => dismissToast(el), duration);
  return el;
}

// ── Mise à jour de la PWA ────────────────────────────────────
function syncUpdateBanner() {
  const banner = document.getElementById("update-banner");
  if (!banner) return;
  const ready = Boolean(window.__kulturoUpdateRegistration?.waiting);
  banner.hidden = !ready || _updateBannerDismissed;
  document.getElementById("back-to-top")?.classList.toggle("is-obscured", !banner.hidden);
  journalFeature.syncFloating();
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

function uiAction(action, args = [], options = {}) {
  const attributes = [`data-ui-action="${esc(action)}"`];
  if (args.length) attributes.push(`data-ui-args="${esc(JSON.stringify(args))}"`);
  if (options.value) attributes.push('data-ui-trigger="change"', 'data-ui-value="true"');
  if (options.checked) attributes.push('data-ui-trigger="change"', 'data-ui-checked="true"');
  if (options.change) attributes.push('data-ui-trigger="change"');
  if (options.control) attributes.push('data-ui-control="true"');
  if (options.event) attributes.push('data-ui-event="true"');
  if (options.self) attributes.push('data-ui-self="true"');
  return attributes.join(" ");
}

// ── Icons (inline SVG minifiés) ───────────────────────────────
const iconCalendar = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`;
const iconPlus    = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;

// Indicateurs des deux navigations : trait sous l'onglet actif (desktop) et
// trait en haut de l'onglet actif (mobile). Seul transform/width est animé.
function placeIndicator(nav, indicator, active, { inset = 0, scale = 1 } = {}) {
  if (!nav || !indicator || !active) { indicator?.classList.remove("is-ready"); return; }
  const navBox = nav.getBoundingClientRect();
  const box = active.getBoundingClientRect();
  if (!box.width) { indicator.classList.remove("is-ready"); return; }
  const width = box.width * scale;
  indicator.style.setProperty("--w", `${Math.max(12, width - inset * 2)}px`);
  indicator.style.setProperty("--x", `${box.left - navBox.left + (box.width - width) / 2 + inset}px`);
  indicator.classList.add("is-ready");
}
function positionNavIndicators() {
  const top = document.getElementById("topnav");
  placeIndicator(top, document.getElementById("topnav-indicator"), top?.querySelector(".top-tab.active"), { inset: 14 });
  const bottom = document.getElementById("bottom-nav");
  placeIndicator(bottom, document.getElementById("bottom-nav-indicator"), bottom?.querySelector(".bottom-nav-item.active[data-nav]"), { scale: .5 });
}
window.addEventListener("resize", () => positionNavIndicators());
document.fonts?.ready?.then(() => positionNavIndicators());
const iconScan    = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 9v6M11 9v6M14 9v6M17 9v6"/></svg>`;
const iconSearch  = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const iconX       = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const iconGrid    = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const iconPlay    = () => `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>`;
const iconEdit    = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const iconTrash   = () => `<svg class="icon-trash" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>`;
const iconRepeat  = () => `<svg class="icon-repeat" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`;
const iconJournal = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M6 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z"/><path d="M7 17h13M8 7h8M8 11h6"/></svg>`;

const iconUser     = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const iconRefresh  = () => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.7-2.6L20 11M4 13l2.2 4.6A7 7 0 0 0 17.9 15"/></svg>`;
const iconExternal = () => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`;

function iconMedia(type, subtype = "", className = "") {
  const kind = type === "movie" && subtype === "tv" ? "tv" : type;
  const paths = {
    movie: `<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m3 10 18-4M7 5l2 4M13 4l2 4M19 3l2 4"/>`,
    tv: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m8 2 4 3 4-3M8 22h8"/>`,
    game: `<path d="M8.5 8h7a5.5 5.5 0 0 1 5.2 7.3l-1 2.8a2 2 0 0 1-3.2.8L14.7 17H9.3l-1.8 1.9a2 2 0 0 1-3.2-.8l-1-2.8A5.5 5.5 0 0 1 8.5 8Z"/><path d="M7 12v4M5 14h4M16.5 13h.01M18.5 15h.01"/>`,
    book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z"/>`,
    media: `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>`,
  };
  const safeKind = paths[kind] ? kind : "media";
  const classes = ["ui-icon", "ui-icon-media", `ui-icon-${safeKind}`, className].filter(Boolean).join(" ");
  return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[safeKind]}</svg>`;
}

function iconStatus(status, className = "") {
  const paths = {
    wishlist: `<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3-6 3Z"/>`,
    playing: `<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>`,
    finished: `<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/>`,
    paused: `<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>`,
    dropped: `<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>`,
    favorite: `<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>`,
    added: `<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>`,
  };
  const safeStatus = paths[status] ? status : "added";
  const classes = ["ui-icon", "ui-icon-status", `ui-icon-${safeStatus}`, className].filter(Boolean).join(" ");
  return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[safeStatus]}</svg>`;
}

function iconJournalAction(action, metadata = {}) {
  if (["repeat_started", "repeat_finished"].includes(action)) return iconRepeat();
  const targetStatus = metadata?.to || metadata?.status;
  if (["wishlist", "playing", "finished", "paused", "dropped"].includes(targetStatus)) return iconStatus(targetStatus);
  if (action === "started") return iconStatus("playing");
  if (action === "finished") return iconStatus("finished");
  if (action === "paused") return iconStatus("paused");
  if (action === "dropped") return iconStatus("dropped");
  if (action === "wishlist" || metadata?.to === "wishlist" || metadata?.status === "wishlist") return iconStatus("wishlist");
  if (action === "rated") return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/></svg>`;
  return iconStatus("added");
}

function journalActionTone(action, metadata = {}) {
  const targetStatus = metadata?.to || metadata?.status;
  return ["finished", "repeat_started", "repeat_finished"].includes(action) || targetStatus === "finished"
    ? "teal"
    : "";
}


// La fiche média vit dans features/media-detail.js.

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
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;

  const reset = () => {
    tracking = false;
    distance = 0;
    overlay.classList.remove("is-swipe-tracking");
    sheet.style.transition = "transform var(--motion-layout) var(--ease-interface)";
    sheet.style.transform = "translate3d(0, 0, 0)";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      if (!sheet.isConnected) return;
      sheet.style.transition = "";
      sheet.style.transform = "";
      sheet.style.animation = "";
    }, motionDuration("--motion-layout", 280));
  };

  sheet.addEventListener("touchstart", event => {
    if (window.innerWidth > 680 || overlay.classList.contains("is-closing") || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const gripDistance = touch.clientY - sheet.getBoundingClientRect().top;
    const touchesHeader = swipeHandles.some(handle => handle.contains(event.target));
    const touchesVisualGrip = event.target === sheet && gripDistance >= 0 && gripDistance <= 30;
    if (!touchesHeader && !touchesVisualGrip) return;
    if (event.target.closest("button, a, input, textarea, select, label")) return;
    clearTimeout(resetTimer);
    startX = touch.clientX;
    const transform = getComputedStyle(sheet).transform;
    let offset = 0;
    try { offset = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42; } catch {}
    startY = touch.clientY - Math.max(0, offset);
    startTime = performance.now();
    lastTime = startTime;
    lastY = touch.clientY;
    velocity = 0;
    distance = Math.max(0, offset);
    tracking = true;
    // Une animation CSS avec `fill: both` garde la priorité sur le transform.
    // On la fige donc avant de laisser la fiche suivre le doigt en direct.
    sheet.style.animation = "none";
    sheet.style.transition = "none";
    sheet.style.transform = `translate3d(0, ${distance}px, 0)`;
    overlay.classList.add("is-swipe-settled");
    overlay.classList.add("is-swipe-tracking");
  }, { passive: true });

  sheet.addEventListener("touchmove", event => {
    if (!tracking) return;
    if (event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (deltaY < 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      reset();
      return;
    }
    if (deltaY < 6) return;
    event.preventDefault();
    const now = performance.now();
    velocity = (touch.clientY - lastY) / Math.max(1, now - lastTime);
    lastY = touch.clientY;
    lastTime = now;
    const limit = window.innerHeight * .55;
    distance = deltaY <= limit ? deltaY : limit + (deltaY - limit) * .2;
    sheet.style.transform = `translate3d(0, ${distance}px, 0)`;
  }, { passive: false });

  sheet.addEventListener("touchend", () => {
    if (!tracking) return;
    if (performance.now() - lastTime > 100) velocity = 0;
    tracking = false;
    if (shouldDismissSheet(distance, velocity)) {
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
      sheet.style.transform = `translate3d(0, ${distance}px, 0)`;
      dismiss();
      return;
    }
    reset();
  }, { passive: true });

  sheet.addEventListener("touchcancel", reset, { passive: true });
}


// ── Animation nouvelle carte ──────────────────────────────────
function flashNewCard(id) {
  requestAnimationFrame(() => {
    const card = document.querySelector(`.media-card[data-id="${CSS.escape(String(id))}"]`);
    if (!card) return;
    card.classList.remove("is-locally-added");
    card.classList.add("card-enter");
    const clear = () => card.classList.remove("card-enter");
    card.addEventListener("animationend", clear, { once: true });
    setTimeout(clear, motionDuration("--motion-layout", 280) + 50);
    card.scrollIntoView({ behavior: motionDuration() ? "smooth" : "auto", block: "nearest" });
  });
}

// ── Interface publique (appelée depuis le HTML inline) ────────

// ── Loading bar ───────────────────────────────────────────────
let _loadingTimer = null;
let _loadingResetTimer = null;
let _loadingSequence = 0;
const _loadingOperations = new Set();
function loadingStart() {
  const token = ++_loadingSequence;
  const startsSequence = _loadingOperations.size === 0;
  _loadingOperations.add(token);
  const bar = document.getElementById("loading-bar-fill");
  if (!bar) return token;
  if (!startsSequence) return token;
  if (_loadingTimer) clearTimeout(_loadingTimer);
  if (_loadingResetTimer) clearTimeout(_loadingResetTimer);
  bar.style.transition = "none";
  bar.style.opacity = "1";
  bar.style.width = "0%";
  requestAnimationFrame(() => {
    bar.style.transition = "width 1.2s cubic-bezier(.1,0,.2,1)";
    bar.style.width = "70%";
  });
  return token;
}
function loadingDone(token = null) {
  if (token == null) _loadingOperations.clear();
  else _loadingOperations.delete(token);
  if (_loadingOperations.size) return;
  const bar = document.getElementById("loading-bar-fill");
  if (!bar) return;
  bar.style.transition = "width .2s ease";
  bar.style.width = "100%";
  _loadingTimer = setTimeout(() => {
    bar.style.transition = "opacity .3s ease";
    bar.style.opacity = "0";
    _loadingResetTimer = setTimeout(() => { bar.style.width = "0%"; bar.style.opacity = "1"; }, 300);
  }, 250);
}


// ── Confetti ──────────────────────────────────────────────────
function launchConfetti() {
  const colors = ["#d8b46a","#efcf8c","#e8553a","#1fa88c","#7ea6ff","#fff"];
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
function updateCategoryTabs() {
  // Tabs supprimés — on met juste à jour le badge FAB
  _updateFilterToggleLabel();
}

// ── Vue grille / liste ────────────────────────────────────────
// ── Taille des cartes (small / medium) ───────────────────────


async function exportLibrary(button = null) {
  if (button?.disabled) return;
  const owner = State.user?.id;
  if (!owner) return;
  setButtonBusy(button, true);
  try {
    // En ligne, on récupère le dernier Journal connu. Hors ligne, son dernier
    // instantané IndexedDB reste exportable avec l'état de synchronisation :
    // une panne réseau ne doit jamais empêcher de mettre ses données à l'abri.
    if (State.journalDirty && navigator.onLine !== false) await refreshJournalEvents({ silent: true });
    else if (!State.journalAvailable) await primeEventsFromCache();
    if (!sameOwner(owner, State.user?.id)) return;
    if (!State.journalAvailable) {
      toast("Sauvegarde reportée : le Journal n’a pas pu être chargé.", "error");
      return;
    }

    const cleanEntries = entriesForStorage(State.entries);
    const sync = Media.getStatus();
    const backup = {
      app: "Kulturo",
      format: "kulturo-backup",
      schema: 2,
      version: CONFIG?.app?.version || null,
      exported_at: new Date().toISOString(),
      synchronization: {
        fully_synced: sync.pending === 0,
        pending_changes: sync.pending,
      },
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
    // Safari peut démarrer le téléchargement après le retour de l'événement.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); } catch {}
    const backupLabel = document.getElementById("last-backup-label");
    if (backupLabel) backupLabel.textContent = formatLastBackup();
    const pendingLabel = sync.pending
      ? ` · ${sync.pending} modification${sync.pending > 1 ? "s" : ""} locale${sync.pending > 1 ? "s" : ""} incluse${sync.pending > 1 ? "s" : ""}`
      : "";
    toast(`${cleanEntries.length} œuvre${cleanEntries.length > 1 ? "s" : ""} et ${State.events.length} événement${State.events.length > 1 ? "s" : ""} sauvegardés${pendingLabel} ✓`, "success");
  } catch (error) {
    if (sameOwner(owner, State.user?.id)) toast("Sauvegarde impossible : " + error.message, "error");
  } finally {
    if (button?.isConnected) setButtonBusy(button, false);
  }
}

function chooseBackupFile() {
  if (navigator.onLine === false) {
    toast("La restauration nécessite une connexion à Supabase.", "info");
    return;
  }
  const input = document.getElementById("backup-import-input");
  if (!input) return;
  rememberModalReturnFocus(document.activeElement);
  input.value = "";
  input.click();
}

const RESTORE_FIELD_LABELS = Object.freeze({
  title: "titre", media_type: "type", status: "statut", rating: "note",
  is_favorite: "coup de cœur", repeat_count: "replay", notes: "notes",
  cover_url: "jaquette", date_started: "date de début", date_finished: "date de fin",
  genre: "genre", author: "auteur", release_year: "année", release_date: "sortie",
  platform: "plateforme", description: "synopsis", directors: "réalisation",
  cast_members: "casting", duration: "durée", seasons_count: "saisons",
  episodes_count: "épisodes", watch_providers: "diffusion", developer: "studio",
  publisher: "éditeur", page_count: "pages", current_page: "page actuelle", current_season: "saison en cours", current_episode: "épisode en cours", isbn: "ISBN",
});

function restorePreviewDetails(plan) {
  const sections = [];
  if (plan.added.length) {
    sections.push(`
      <details class="backup-restore-detail">
        <summary><span>À ajouter</span><strong>${plan.added.length}</strong></summary>
        <ul>${plan.added.map(item => `<li>${esc(item.title)}</li>`).join("")}</ul>
      </details>`);
  }
  if (plan.updated.length) {
    sections.push(`
      <details class="backup-restore-detail">
        <summary><span>À mettre à jour</span><strong>${plan.updated.length}</strong></summary>
        <ul>${plan.updated.map(item => {
          const fields = Object.keys(item.changes || {}).map(field => RESTORE_FIELD_LABELS[field] || field).join(", ");
          return `<li><span>${esc(item.title)}</span>${fields ? `<small>${esc(fields)}</small>` : ""}</li>`;
        }).join("")}</ul>
      </details>`);
  }
  if (plan.conflicts.length) {
    sections.push(`
      <details class="backup-restore-detail is-conflict" open>
        <summary><span>Conflits ignorés</span><strong>${plan.conflicts.length}</strong></summary>
        <ul>${plan.conflicts.map(item => `<li><span>${esc(item.title)}</span><small>Plusieurs correspondances possibles</small></li>`).join("")}</ul>
      </details>`);
  }
  return sections.length ? `<div class="backup-restore-details">${sections.join("")}</div>` : "";
}

function renderBackupRestorePreview(plan, fileName = "sauvegarde Kulturo") {
  const previousDialog = document.querySelector("#modal-overlay .backup-restore-modal");
  const alreadyOpen = Boolean(previousDialog);
  if (previousDialog) dialogFocus.deactivate(previousDialog, { restoreFocus: false });
  else rememberModalReturnFocus();
  _pendingRestorePlan = plan;
  const journalCount = Number(plan.journal?.valid || 0);
  const ignoredCount = plan.invalid.length + plan.conflicts.length + Number(plan.journal?.invalid || 0);
  const restorableCount = plan.added.length + plan.updated.length + journalCount;
  const root = document.getElementById("modal-root");
  replaceModalContent(root, `
    <div class="modal-overlay backup-restore-overlay" id="modal-overlay" ${uiAction("closeModalOnBg", [], { event: true })}>
      <div class="modal backup-restore-modal" role="dialog" aria-modal="true" aria-labelledby="backup-restore-title" aria-describedby="backup-restore-description">
        <div class="modal-header">
          <div class="backup-restore-heading">
            <span>Restauration sécurisée</span>
            <h3 id="backup-restore-title">Aperçu de l’import</h3>
          </div>
          <button type="button" class="btn-icon" ${uiAction("closeModal")} aria-label="Fermer">${iconX()}</button>
        </div>
        <div class="modal-body backup-restore-body">
          <p id="backup-restore-description">${esc(fileName)} a été vérifié. La bibliothèque et le Journal seront fusionnés en une seule opération, sans aucune suppression.</p>
          <div class="backup-restore-counts" aria-label="Résumé de la restauration">
            <div class="backup-restore-count is-added"><strong>${plan.added.length}</strong><span>à ajouter</span></div>
            <div class="backup-restore-count is-updated"><strong>${plan.updated.length}</strong><span>à mettre à jour</span></div>
            <div class="backup-restore-count is-unchanged"><strong>${plan.unchanged.length}</strong><span>inchangé${plan.unchanged.length > 1 ? "s" : ""}</span></div>
          </div>
          <div class="backup-restore-journal"><span aria-hidden="true">≡</span><span><strong>${journalCount} événement${journalCount > 1 ? "s" : ""}</strong> du Journal vérifié${journalCount > 1 ? "s" : ""} et prêt${journalCount > 1 ? "s" : ""} à être fusionné${journalCount > 1 ? "s" : ""}.</span></div>
          ${restorePreviewDetails(plan)}
          ${ignoredCount ? `<p class="backup-restore-warning" role="status">${ignoredCount} élément${ignoredCount > 1 ? "s" : ""} ambigu${ignoredCount > 1 ? "s" : ""} ou invalide${ignoredCount > 1 ? "s" : ""} sera${ignoredCount > 1 ? "ont" : ""} ignoré${ignoredCount > 1 ? "s" : ""}.</p>` : ""}
          <div class="backup-restore-rule"><span aria-hidden="true">✓</span><span>Les œuvres absentes de ce fichier restent dans votre bibliothèque.</span></div>
          <div class="backup-restore-rule"><span aria-hidden="true">✓</span><span>En cas d’erreur, aucune modification ne sera conservée.</span></div>
          <div class="backup-restore-progress" id="backup-restore-progress" role="status" aria-live="polite"></div>
        </div>
        <div class="modal-footer backup-restore-footer">
          <button type="button" class="btn btn-secondary" ${uiAction("closeModal")}>Annuler</button>
          <button type="button" class="btn btn-primary" id="backup-restore-confirm" ${restorableCount ? uiAction("restoreBackup") : "disabled"}>
            ${restorableCount ? "Restaurer" : "Rien à restaurer"}
          </button>
        </div>
      </div>
    </div>`);
  if (!alreadyOpen) pushHistoryLayer("modal", { modal: "backup-restore" });
  activateDialog(root.querySelector(".backup-restore-modal"), { initialFocus: "#backup-restore-confirm:not([disabled])" });
  setupMobileSheetSwipe({
    overlay: root.querySelector("#modal-overlay"),
    sheet: root.querySelector(".backup-restore-modal"),
    dismiss: () => closeModal(),
  });
}

async function previewBackupRestore(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const owner = State.user?.id;
  if (!owner) return;
  try {
    if (file.size > MAX_BACKUP_IMPORT_BYTES) throw new Error("Le fichier dépasse la limite de 10 Mo.");
    const contents = await file.text();
    if (!sameOwner(owner, State.user?.id)) return;
    const backup = parseKulturoBackup(contents);
    const plan = buildRestorePlan(backup.entries, State.entries);
    const eventPlan = sanitizeBackupEvents(backup.events);
    const mappedSourceIds = new Set([
      ...plan.added,
      ...plan.updated,
      ...plan.unchanged,
    ].map(item => item.sourceId).filter(Boolean));
    _pendingRestoreEvents = eventPlan.valid.filter(event => mappedSourceIds.has(event.media_id));
    plan.journal = {
      valid: _pendingRestoreEvents.length,
      invalid: eventPlan.invalid.length + eventPlan.valid.length - _pendingRestoreEvents.length,
    };
    renderBackupRestorePreview(plan, file.name);
  } catch (error) {
    _pendingRestorePlan = null;
    _pendingRestoreEvents = null;
    if (sameOwner(owner, State.user?.id)) toast(error.message || "Sauvegarde illisible.", "error");
  } finally {
    input.value = "";
  }
}

async function restoreBackup() {
  if (!_pendingRestorePlan || !_pendingRestoreEvents) return;
  if (navigator.onLine === false) {
    toast("Connexion requise pour restaurer la sauvegarde.", "error");
    return;
  }
  const button = document.getElementById("backup-restore-confirm");
  const progress = document.getElementById("backup-restore-progress");
  const mediaCount = _pendingRestorePlan.added.length + _pendingRestorePlan.updated.length;
  const journalCount = _pendingRestoreEvents.length;
  if (!mediaCount && !journalCount) return;
  const owner = State.user?.id;
  if (!owner) return;
  _restoreInProgress = true;
  document.querySelector(".backup-restore-modal")?.setAttribute("aria-busy", "true");
  document.querySelectorAll(".backup-restore-footer .btn").forEach(control => { control.disabled = true; });
  if (button) button.textContent = "Restauration…";
  if (progress) progress.textContent = "Vérification finale et restauration atomique…";
  try {
    await Media.flush({ throwOnError: true });
    if (Media.getStatus().pending) {
      throw new Error("Une modification locale est encore en attente. Patientez quelques secondes puis réessayez.");
    }
    const result = await Backup.restore(_pendingRestorePlan, _pendingRestoreEvents);
    if (!sameOwner(owner, State.user?.id)) {
      _restoreInProgress = false;
      return;
    }
    await loadEntries();
    if (!sameOwner(owner, State.user?.id)) {
      _restoreInProgress = false;
      return;
    }
    renderCards();
    updateBadges();
    if (_currentPage === "dashboard") await renderDashboard();
    if (_currentPage === "journal") await renderJournal();
    if (_currentPage === "upcoming") upcomingFeature.renderCards();

    const restoredMedia = Number(result?.added_count || 0) + Number(result?.updated_count || 0);
    const restoredEvents = Number(result?.events_restored || 0);
    _restoreInProgress = false;
    _pendingRestorePlan = null;
    _pendingRestoreEvents = null;
    _modalDirty = false;
    closeModal();
    toast(`${restoredMedia} œuvre${restoredMedia > 1 ? "s" : ""} et ${restoredEvents} événement${restoredEvents > 1 ? "s" : ""} restaurés ✓`, "success");
  } catch (error) {
    _restoreInProgress = false;
    if (!sameOwner(owner, State.user?.id)) return;
    document.querySelector(".backup-restore-modal")?.removeAttribute("aria-busy");
    document.querySelectorAll(".backup-restore-footer .btn").forEach(control => { control.disabled = false; });
    if (button) button.textContent = "Réessayer";
    if (progress) progress.textContent = "Aucune restauration partielle n’est possible. Vous pouvez réessayer sans créer de doublon.";
    const migrationMissing = /restore_kulturo_backup|schema cache|function public\.restore/i.test(String(error?.message || ""));
    toast(migrationMissing
      ? "Mettez d’abord à jour schema.sql dans Supabase."
      : "Restauration non confirmée : " + (error?.message || "erreur inconnue"), "error");
  }
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

// ── Fiches média ──────────────────────────────────────────────
mediaDetailFeature = createMediaDetailFeature({
  State,
  Media,
  Journal,
  refreshJournalEvents,
  cacheEntriesLocally,
  safeMediaUrl,
  esc,
  uiAction,
  iconCalendar,
  iconPlay,
  iconEdit,
  iconTrash,
  iconRepeat,
  iconExternal,
  iconX,
  iconUser,
  iconMedia,
  iconStatus,
  getTypeLabel,
  ratingScoreHTML,
  rememberModalReturnFocus,
  bindCoverAccent,
  dialogFocus,
  activateDialog,
  pushHistoryLayer,
  syncSystemBar,
  getCurrentPage: () => _currentPage,
  hydrateFadeImages,
  setupMobileSheetSwipe,
  closeModal,
  syncDialogBackground,
  historyOwnsLayer,
  updateBadges,
  markJournalDirty,
  renderCards,
  renderUpcomingCards: () => upcomingFeature.renderCards(),
  toast,
  launchConfetti,
  sameOwner,
  markModalPristine: () => { _modalDirty = false; },
  isModalDirty: () => _modalDirty,
});
({
  detailSessions,
  openDetailPanel,
  renderDetailPanel,
  prefetchDetail,
  openMetadataFromElement,
  openMetadataMedia,
  closeMetadataPanel,
  revokeStaleRepeatEvents,
  canEnrichMediaDetails,
  requestPrefetchedDetails,
  refreshDetailEnrichment,
  injectBackdrop: _injectBackdrop,
  scheduleSynopsisOverflowCheck: _scheduleSynopsisOverflowCheck,
} = mediaDetailFeature);

// ── Journal culturel personnel ────────────────────────────────
const profileFeature = createProfileFeature({
  State, Profiles, refreshJournalEvents, reloadEntries: loadEntries, navTo, syncFilterChips,
  updateCategoryTabs, renderCards, updateFilterToggleLabel: _updateFilterToggleLabel,
  safeMediaUrl, esc, uiAction, iconMedia, iconStatus, iconUser,
  ratingScoreHTML, replayMotion, hydrateFadeImages, toast,
  getCurrentPage: () => _currentPage,
  onContextChange: persistUiSnapshot,
  onViewReady: restorePageScroll,
});
const {
  render: renderDashboard, setProfileYear, setProfileMonth, setProfilePeriod,
  setProfileMedia, openProfileCollection, openRatingCollection, saveUsername,
} = profileFeature;

const journalFeature = createJournalFeature({
  State, Journal, Activity, refreshJournalEvents, replayMotion, hydrateFadeImages,
  esc, safeMediaUrl, uiAction, iconMedia, iconStatus, iconTrash, iconJournalAction,
  journalActionTone, ratingScoreHTML, activityStateMarkersHTML, getTypeLabel,
  confirmDialog, toast, openDetailPanel, renderDetailPanel,
  getCurrentPage: () => _currentPage,
  onContextChange: persistUiSnapshot,
  onViewReady: restorePageScroll,
  sameOwner,
});
const { render: renderJournal, bind: bindJournalInteractions } = journalFeature;

const upcomingFeature = createUpcomingFeature({
  State,
  Media,
  TMDb,
  IGDB,
  BookReleases,
  getCurrentPage: () => _currentPage,
  normalizeTitle,
  sameMediaIdentity,
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
  scheduleSynopsisOverflowCheck: _scheduleSynopsisOverflowCheck,
  requestPrefetchedDetails,
  detailSessions,
  injectBackdrop: _injectBackdrop,
  refreshDetailEnrichment,
  clearApiCache,
  onContextChange: persistUiSnapshot,
  onViewReady: restorePageScroll,
  sameOwner,
});

window.UI = {
  addFromLibrarySearch: () => openModal(null, State.filters.search),
  broadenLibrarySearch: () => {
    const query = State.filters.search;
    clearAllLibraryFilters();
    State.filters.status = "all";
    State.filters.search = query;
    document.getElementById("global-search").value = query;
    syncFilterChips();
    renderCards({ resetScroll: true });
  },
  openAddModal:    () => { _currentRating = 0; window._apiSelected = null; openModal(); },
  openEditModal:   (id, transitionSource = null) => { openDetailPanel(id, { transitionSource }); },
  openMetadataFromElement,
  openMetadataMedia,
  closeMetadataPanel,
  retryDetailInfo: id => mediaDetailFeature.retryDetailInfo(id),
  setEditDetailsView,
  closeModal,
  openEditFromDetail,
  closeModalOnBg,
  saveEntry,
  deleteEntry,
  adjustEditRepeat,
  fillFromApi,
  setRating,
  previewRating,
  clearPreview,
  navTo,
  scrollToTop,
  clearLibraryFilter,
  clearAllLibraryFilters,
  retryLibrary: loadEntries,
  retryJournal: () => journalFeature.retry(),
  retryProfile: () => profileFeature.retry(),

  setTypeFilter,
  setStatusChip,
  toggleContinueSection,
  toggleFilterDrawer: () => {
    const root = document.getElementById("modal-root");
    // Evite double ouverture
    if (document.getElementById("filter-modal-overlay")) return;

    const _buildModal = () => {
      const statuses = ["all", ...LIBRARY_STATUSES];
      const types = [
        ["movie", "Films", iconMedia("movie")],
        ["tv", "Séries", iconMedia("movie", "tv")],
        ["game", "Jeux", iconMedia("game")],
        ["book", "Livres", iconMedia("book")],
      ];
      const libraryDensity = readLibraryDensity();
      const typeChips = types.map(([v,l,icon]) =>
        `<button class="filter-chip ${(State.filters.type === "movie" ? State.filters.subtype : State.filters.type) === v ? "active" : ""}" data-value="${v}" aria-pressed="${(State.filters.type === "movie" ? State.filters.subtype : State.filters.type) === v}"
          ${uiAction("setTypeFilter", [v])}>${icon}${l}</button>`
      ).join("");

      const activeCount = _countActiveFilters();
      const headerLabel = activeCount > 0 ? `Filtres <span class="filter-active-count">${activeCount}</span>` : "Filtres";

      const markerChips = `
        <button type="button" class="filter-chip favorite-filter-chip ${State.filters.favorite ? "active" : ""}"
          data-marker="favorite" aria-pressed="${State.filters.favorite}" ${uiAction("toggleFavFilter")}>${iconStatus("favorite")}Coups de cœur</button>
        <button type="button" class="filter-chip replay-filter-chip ${State.filters.replay ? "active" : ""}"
          data-marker="replay" aria-pressed="${State.filters.replay}" ${uiAction("toggleReplayFilter")}>${iconRepeat()}<span class="replay-chip-label">${replayFilterLabel(State.filters.type)}</span></button>`;

      const statusChips = statuses.map(s => {
        return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}" data-value="${s}"
          aria-pressed="${State.filters.status === s}" ${uiAction("setStatusChip", [s])}>${iconStatus(s)}${STATUS_LABELS[s]}</button>`;
      }).join("");

      const sortChips = sortChipsHTML();

      const hasActive = activeCount > 0;
      const resultCount = filterEntries(State.entries || []).length;

      return `
        <div class="modal-overlay filter-modal-overlay" id="filter-modal-overlay" ${uiAction("closeFilterModal", [], { self: true })}>
          <div class="modal filter-modal" role="dialog" aria-modal="true" aria-labelledby="fm-title">
            <div class="modal-header">
              <h3 id="fm-title">${headerLabel}</h3>
              <button class="btn-icon" ${uiAction("closeFilterModal")} aria-label="Fermer">${iconX()}</button>
            </div>
            <div class="modal-body">
              <div class="filter-modal-section">
                <div class="filter-modal-label">Type d’œuvre</div>
                <div class="filter-modal-chips" id="fm-type-chips">${typeChips}</div>
              </div>
              <div class="filter-modal-section">
                <div class="filter-modal-label">Marqueurs</div>
                <div class="filter-modal-chips" id="fm-marker-chips">${markerChips}</div>
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
                  <button type="button" class="library-density-btn ${libraryDensity === "standard" ? "active" : ""}" data-density="standard" aria-pressed="${libraryDensity === "standard"}" ${uiAction("setLibraryDensity", ["standard"])}>
                    <span aria-hidden="true">▦</span><span><strong>Standard</strong><small>Affiches plus grandes</small></span>
                  </button>
                  <button type="button" class="library-density-btn ${libraryDensity === "compact" ? "active" : ""}" data-density="compact" aria-pressed="${libraryDensity === "compact"}" ${uiAction("setLibraryDensity", ["compact"])}>
                    <span aria-hidden="true">▦</span><span><strong>Compact</strong><small>Plus d’œuvres à l’écran</small></span>
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="fm-reset-btn" style="${hasActive ? "" : "visibility:hidden"}" ${uiAction("resetFilters")}>Réinitialiser</button>
              <button class="btn btn-primary" id="fm-apply-btn" ${uiAction("applyFilters")}>Voir ${resultCount} résultat${resultCount > 1 ? "s" : ""}</button>
            </div>
          </div>
        </div>`;
    };

    root.insertAdjacentHTML("beforeend", _buildModal());
    syncDialogBackground();
    pushHistoryLayer("filters");
    const overlay = document.getElementById("filter-modal-overlay");
    setupMobileSheetSwipe({
      overlay,
      sheet: overlay?.querySelector(".filter-modal"),
      dismiss: () => UI.closeFilterModal(),
    });
    dialogFocus.activate(overlay?.querySelector(".filter-modal"), {
      returnFocus: document.getElementById("btn-filter-toggle") || document.activeElement,
      initialFocus: ".filter-modal .btn-icon",
      onEscape: () => UI.closeFilterModal(),
    });
  },


  toggleSynopsis: (id) => {
    const wrap = document.getElementById(id);
    if (!wrap || !wrap.classList.contains("is-overflowing")) return;
    const isExpanded = !wrap.classList.contains("expanded");
    animateSynopsis(wrap, isExpanded);
    const btn = wrap.querySelector(".detail-synopsis-toggle");
    if (btn) {
      btn.textContent = isExpanded ? "Voir moins" : "Voir plus";
      btn.setAttribute("aria-expanded", String(isExpanded));
      btn.classList.remove("is-changing");
      requestAnimationFrame(() => btn.classList.add("is-changing"));
      btn.addEventListener("animationend", () => btn.classList.remove("is-changing"), { once: true });
    }

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
    const filterDialog = overlay.querySelector(".filter-modal");
    prepareDialogClose(overlay);
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.remove();
      syncDialogBackground();
      if (filterDialog) dialogFocus.deactivate(filterDialog, { restoreFocus: true });
    }, motionDuration());
  },

  toggleFavFilter: () => {
    State.filters.favorite = !State.filters.favorite;
    renderCards({ resetScroll: true }); _updateFilterToggleLabel(); _updateFilterModalHeader();
    const btn = document.querySelector('#fm-marker-chips [data-marker="favorite"]');
    if (btn) {
      btn.classList.toggle("active", State.filters.favorite);
      btn.setAttribute("aria-pressed", String(State.filters.favorite));
    }
    _updateResetBtn();
    _updateFilterResultCount();
  },

  toggleReplayFilter: () => {
    State.filters.replay = !State.filters.replay;
    renderCards({ resetScroll: true }); _updateFilterToggleLabel(); _updateFilterModalHeader();
    const btn = document.querySelector('#fm-marker-chips [data-marker="replay"]');
    if (btn) {
      btn.classList.toggle("active", State.filters.replay);
      btn.setAttribute("aria-pressed", String(State.filters.replay));
    }
    _updateResetBtn();
    _updateFilterResultCount();
  },


  resetFilters: () => {
    State.filters.type = "all";
    State.filters.subtype = "all";
    State.filters.status = DEFAULT_LIBRARY_STATUS;
    State.filters.sort = DEFAULT_LIBRARY_SORT;
    State.filters.favorite = false;
    State.filters.replay = false;
    State.filters.year = "all";
    State.filters.month = "all";
    State.filters.rating = "all";
    persistSortPreference(DEFAULT_LIBRARY_SORT);
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
  setUpcomingType: upcomingFeature.setType,
  setUpcomingGenre: upcomingFeature.setGenre,
  setUpcomingHideAdded: upcomingFeature.setHideAdded,
  toggleAwaitedReleases: upcomingFeature.toggleAwaitedReleases,
  resetUpcomingFilters: upcomingFeature.resetFilters,
  refreshUpcoming: upcomingFeature.refresh,
  addUpcomingToWishlist: upcomingFeature.addToWishlist,
  addUpcomingToWishlistFromModal: upcomingFeature.addToWishlistFromModal,
  openUpcomingDetail: upcomingFeature.openDetail,
  saveUsername,
  exportLibrary,
  chooseBackupFile,
  previewBackupRestore,
  restoreBackup,
  setLibraryDensity,
  applyAppUpdate,
  dismissUpdateBanner,
  showRatingLabel,
  hideRatingLabel,
  setModalType: (type) => {
    markModalDirty();
    const hidden = document.getElementById("f-type");
    if (hidden) hidden.value = type === "tv" ? "movie" : type;
    const subtype = document.getElementById("f-subtype");
    if (subtype) subtype.value = ["movie", "tv"].includes(type) ? type : "";
    document.querySelectorAll(".modal-type-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.type === type);
    });
    window._apiSelected = null;
    window._apiResults = [];
    document.querySelectorAll("select#f-status option").forEach(option => {
      option.textContent = statusLabelFor(option.value, type === "tv" ? "movie" : type);
    });
    animateDialogUpdate(document.querySelector(".edit-modal"), syncEditReading);
    updateApiAvailLabel(type === "tv" ? "movie" : type);
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

  wzOpenScanner: async () => {
    const panel = document.getElementById("wz-scanner");
    const video = document.getElementById("wz-scanner-video");
    const input = document.getElementById("f-api-search");
    const hint = document.getElementById("wz-scanner-hint");
    if (!panel || !video || !input || !scannerSupported()) return;
    _wizardScanner?.stop();
    panel.hidden = false;
    hint.textContent = "Démarrage de la caméra…";
    _wizardScanner = await startBarcodeScan(video, {
      onIsbn: isbn => {
        panel.hidden = true;
        _wizardScanner = null;
        toast("Code-barres lu ✓", "success");
        input._kulturoApplyIsbn?.(isbn);
      },
      onError: error => {
        panel.hidden = true;
        _wizardScanner = null;
        toast(scannerErrorMessage(error), "error");
      },
    });
    if (!panel.hidden) hint.textContent = "Placez le code-barres au dos du livre dans le cadre.";
  },

  wzCloseScanner: () => {
    _wizardScanner?.stop();
    _wizardScanner = null;
    const panel = document.getElementById("wz-scanner");
    if (panel) panel.hidden = true;
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
    if (!email || !password) { toast("Renseignez votre email et votre mot de passe.", "error"); return; }
    if (password.length < 6) { toast("Le mot de passe doit contenir au moins 6 caractères.", "error"); return; }
    try {
      setButtonBusy(btn, true);
      await Auth.signIn(email, password);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      if (btn?.isConnected) setButtonBusy(btn, false);
    }
  },
  signOut: async () => {
    try { await Auth.signOut(); } catch (e) { toast(e.message, "error"); }
  },
};
window.showPage = showPage;
