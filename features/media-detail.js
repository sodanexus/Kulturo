// Fiches média : rendu, enrichissement, métadonnées et transitions de jaquette.
import { TMDb, TMDbDetails, IGDBDetails, OpenLibraryDetails } from "../api.js";
import {
  formatReleaseDate, isReplayEntry, normalizeTitle, repeatInfo,
  repeatProgressLabel, statusTransitionChanges,
} from "../domain.js";
import {
  entriesForMetadata, metadataDefinition, metadataExternalLink, splitMetadataValues,
} from "./media-metadata.js";
import { createDetailSessionManager } from "./detail-session.js";
import { collectDetailUpdates } from "./detail-enrichment.js";

export function createMediaDetailFeature({
  State, Media, cacheEntriesLocally, safeMediaUrl, esc, uiAction,
  iconCalendar, iconPlay, iconEdit, iconTrash, iconRepeat, iconExternal, iconX,
  iconUser, iconMedia, iconStatus, getTypeLabel, STATUS_LABELS, ratingScoreHTML,
  rememberModalReturnFocus, bindCoverAccent, dialogFocus, activateDialog,
  pushHistoryLayer, syncSystemBar, getCurrentPage, hydrateFadeImages,
  setupMobileSheetSwipe, closeModal, syncDialogBackground, historyOwnsLayer,
  updateBadges, markJournalDirty, renderCards, renderUpcomingCards, toast,
  launchConfetti, markModalPristine, sameOwner,
}) {
function canEnrichMediaDetails(entry) {
  if (!entry) return false;
  if (entry.media_type === "book") return true;
  return ["movie", "game"].includes(entry.media_type) && Boolean(entry.external_id);
}

function canResolveMediaIdentity(entry) {
  return Boolean(
    entry?.media_type === "movie" &&
    !entry.external_id &&
    entry.title &&
    TMDb.available(),
  );
}

async function repairMissingTMDbIdentity(entry, options = {}) {
  if (!canResolveMediaIdentity(entry)) return false;
  const owner = options.owner || State.user?.id;
  if (!owner) return false;
  const expectedSubtype = entry.subtype === "tv" ? "tv" : "movie";
  const expectedTitle = normalizeTitle(entry.title);
  const expectedYear = Number(entry.release_year) || null;
  const results = await TMDb.search(entry.title, options);
  const exactMatches = results.filter(candidate =>
    normalizeTitle(candidate.title) === expectedTitle &&
    (candidate.subtype === "tv" ? "tv" : "movie") === expectedSubtype
  );
  const match = (expectedYear
    ? exactMatches.find(candidate => Number(candidate.release_year) === expectedYear)
    : null) || (!expectedYear ? exactMatches[0] : null);
  if (!match) return false;
  if (options.signal?.aborted || !sameOwner(owner, State.user?.id)) return false;

  const identity = {
    external_id: match.external_id,
    source_api: "tmdb",
  };
  ["subtype", "release_year", "cover_url", "genre", "description"].forEach(field => {
    if (!entry[field] && match[field] != null) identity[field] = match[field];
  });
  const updated = await Media.update(entry.id, identity, { signal: options.signal });
  if (options.signal?.aborted || !sameOwner(owner, State.user?.id)) return false;
  Object.assign(entry, updated);
  cacheEntriesLocally();

  const detailModal = document.getElementById(`detail-body-${entry.id}`)?.closest(".detail-modal");
  if (detailModal) bindCoverAccent(detailModal, entry.cover_url, entry.backdrop_url);
  return true;
}

const DETAIL_PREFETCH_TTL = 15 * 60_000;
const MAX_DETAIL_PREFETCH_ENTRIES = 12;
const _detailPrefetchCache = new Map();

function pruneDetailPrefetchCache() {
  const now = Date.now();
  for (const [key, cached] of _detailPrefetchCache) {
    if (cached.expiresAt <= now) _detailPrefetchCache.delete(key);
  }
  while (_detailPrefetchCache.size > MAX_DETAIL_PREFETCH_ENTRIES) {
    _detailPrefetchCache.delete(_detailPrefetchCache.keys().next().value);
  }
}

function detailPrefetchKey(entry) {
  return `${entry.media_type}:${entry.subtype || ""}:${entry.source_api || ""}:${entry.external_id || normalizeTitle(entry.title)}`;
}

async function fetchMediaDetails(entry, options = {}) {
  if (entry.media_type === "movie" && entry.external_id) {
    return TMDbDetails.fetch(entry.external_id, entry.subtype || "movie", options);
  }
  if (entry.media_type === "game" && entry.external_id) return IGDBDetails.fetch(entry.external_id, options);
  if (entry.media_type === "book") return OpenLibraryDetails.fetch(entry.external_id, entry, options);
  return null;
}

function requestPrefetchedDetails(entry, options = {}) {
  if (!canEnrichMediaDetails(entry)) return Promise.resolve(null);
  const key = detailPrefetchKey(entry);
  pruneDetailPrefetchCache();
  if (options.fresh) {
    _detailPrefetchCache.delete(key);
    return fetchMediaDetails(entry, options);
  }
  let cached = _detailPrefetchCache.get(key);
  if (cached?.signal?.aborted) {
    _detailPrefetchCache.delete(key);
    cached = null;
  }
  if (cached && cached.expiresAt > Date.now()) {
    _detailPrefetchCache.delete(key);
    _detailPrefetchCache.set(key, cached);
    return cached.promise;
  }
  let promise;
  promise = fetchMediaDetails(entry, options).catch(error => {
    if (_detailPrefetchCache.get(key)?.promise === promise) {
      _detailPrefetchCache.delete(key);
    }
    throw error;
  });
  _detailPrefetchCache.delete(key);
  _detailPrefetchCache.set(key, {
    promise,
    signal: options.signal || null,
    expiresAt: Date.now() + DETAIL_PREFETCH_TTL,
  });
  pruneDetailPrefetchCache();
  return promise;
}

function prefetchDetail(id) {
  const entry = State.entries.find(item => item.id === id);
  if (!entry || entry._detailsFetched || entry._detailsPending || !canEnrichMediaDetails(entry)) return;
  requestPrefetchedDetails(entry).catch(() => {});
}

// ── Fiche détaillée ───────────────────────────────────────────
const DETAIL_COVER_TRANSITION_MS = 340;
let _activeDetailCoverTransition = null;
let _detailCoverFlight = null;

function releaseDetailDomResources() {
  document.querySelectorAll("#modal-root .detail-info-slot").forEach(slot => {
    clearTimeout(slot._detailInfoTimer);
    slot._detailInfoTimer = 0;
  });
  document.querySelectorAll("#modal-root .detail-backdrop-layer").forEach(layer => {
    layer.style.backgroundImage = "none";
  });
}

const detailSessions = createDetailSessionManager({ onDispose: releaseDetailDomResources });

function transitionCoverImage(source) {
  if (!source) return null;
  if (source instanceof HTMLImageElement) return source;
  return source.querySelector?.(
    ".card-cover, .awaited-release-cover, .continue-cover img, .profile-top-cover img, .activity-cover, img"
  ) || null;
}

function validTransitionRect(rect) {
  return Boolean(rect && rect.width >= 24 && rect.height >= 32 &&
    rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth);
}

function captureDetailCoverOrigin(source, mediaId, coverUrl) {
  if (!source || !coverUrl || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return null;
  const image = transitionCoverImage(source);
  if (!image || !image.complete || image.naturalWidth < 1) return null;
  const rect = image.getBoundingClientRect();
  if (!validTransitionRect(rect)) return null;
  const style = getComputedStyle(image);
  return {
    mediaId: String(mediaId || ""),
    sourceElement: image,
    sourceContainer: source,
    src: image.currentSrc || image.src || coverUrl,
    sourceRadius: style.borderRadius || "0px",
  };
}

function finishDetailCoverFlight() {
  const flight = _detailCoverFlight;
  if (!flight) return;
  _detailCoverFlight = null;

  // Sur Safari, annuler une animation déjà arrivée à son terme peut renvoyer
  // son calque à la position de départ pendant une image. On ne l'annule que
  // lorsqu'elle est réellement encore en cours.
  try {
    if (flight.animation && flight.animation.playState !== "finished") flight.animation.cancel();
  } catch {}

  // Le clone et les vraies images se passent le relais dans la même frame,
  // sans réutiliser le fondu générique de chargement des jaquettes.
  const handoffElements = [...new Set([flight.source, flight.target].filter(Boolean))];
  handoffElements.forEach(element => element.classList.add("is-cover-transition-handoff"));
  flight.clone?.remove();
  flight.source?.classList.remove("is-cover-transition-source");
  flight.target?.classList.remove("is-cover-transition-target");
  flight.overlay?.classList.remove("is-cover-transitioning");
  requestAnimationFrame(() => {
    handoffElements.forEach(element => element.classList.remove("is-cover-transition-handoff"));
  });
}

function createCoverFlightClone(src, rect, radius) {
  const clone = new Image();
  clone.className = "detail-cover-flight";
  clone.alt = "";
  clone.src = src;
  Object.assign(clone.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: radius || "0px",
  });
  document.body.appendChild(clone);
  return clone;
}

function animateCoverFlight({ clone, fromRect, toRect, fromRadius, toRadius }) {
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const scaleX = toRect.width / fromRect.width;
  const scaleY = toRect.height / fromRect.height;
  return clone.animate([
    {
      transform: "translate3d(0,0,0) scale(1,1)",
      borderRadius: fromRadius,
      boxShadow: "0 4px 18px rgba(0,0,0,.28)",
    },
    {
      transform: `translate3d(${dx}px,${dy}px,0) scale(${scaleX},${scaleY})`,
      borderRadius: toRadius,
      boxShadow: "0 10px 30px rgba(0,0,0,.56)",
    },
  ], {
    duration: DETAIL_COVER_TRANSITION_MS,
    easing: "cubic-bezier(.2,.78,.18,1)",
    fill: "forwards",
  });
}

function startDetailCoverOpen(origin, target, overlay) {
  if (!origin || !(target instanceof HTMLImageElement) || !overlay) {
    target?.classList.remove("is-cover-transition-target");
    return false;
  }
  finishDetailCoverFlight();
  const fromRect = origin.sourceElement.getBoundingClientRect();
  const toRect = target.getBoundingClientRect();
  if (!validTransitionRect(fromRect) || !validTransitionRect(toRect)) {
    target.classList.remove("is-cover-transition-target");
    return false;
  }

  origin.sourceElement.classList.add("is-cover-transition-source");
  target.classList.add("is-cover-transition-target");
  overlay.classList.add("is-cover-transitioning");
  const clone = createCoverFlightClone(origin.src, fromRect, origin.sourceRadius);
  const toRadius = getComputedStyle(target).borderRadius || origin.sourceRadius;
  const animation = animateCoverFlight({
    clone,
    fromRect,
    toRect,
    fromRadius: origin.sourceRadius,
    toRadius,
  });
  const flight = { animation, clone, source: origin.sourceElement, target, overlay };
  _detailCoverFlight = flight;
  _activeDetailCoverTransition = origin;
  animation.finished
    .catch(() => {})
    .finally(() => { if (_detailCoverFlight === flight) finishDetailCoverFlight(); });
  return true;
}

function resolveDetailCoverDestination(state) {
  if (!state) return null;
  const direct = state.sourceElement;
  if (direct?.isConnected && validTransitionRect(direct.getBoundingClientRect())) return direct;
  const candidates = [...document.querySelectorAll("[data-transition-media]")]
    .filter(element => element.dataset.transitionMedia === state.mediaId);
  for (const candidate of candidates) {
    const image = transitionCoverImage(candidate);
    if (image?.complete && image.naturalWidth > 0 && validTransitionRect(image.getBoundingClientRect())) return image;
  }
  return null;
}

function startDetailCoverClose(overlay) {
  if (!_activeDetailCoverTransition || !overlay || overlay.classList.contains("is-swipe-dismiss") ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return 0;
  finishDetailCoverFlight();
  const target = overlay.querySelector(".detail-poster");
  const destination = resolveDetailCoverDestination(_activeDetailCoverTransition);
  if (!(target instanceof HTMLImageElement) || !destination) return 0;
  const fromRect = target.getBoundingClientRect();
  const toRect = destination.getBoundingClientRect();
  if (!validTransitionRect(fromRect) || !validTransitionRect(toRect)) return 0;

  const fromRadius = getComputedStyle(target).borderRadius || "0px";
  const toRadius = getComputedStyle(destination).borderRadius || fromRadius;
  target.classList.add("is-cover-transition-target");
  destination.classList.add("is-cover-transition-source");
  overlay.classList.add("is-cover-transitioning", "is-cover-transition-closing");
  const clone = createCoverFlightClone(target.currentSrc || target.src || _activeDetailCoverTransition.src, fromRect, fromRadius);
  const animation = animateCoverFlight({ clone, fromRect, toRect, fromRadius, toRadius });
  const flight = { animation, clone, source: destination, target, overlay };
  _detailCoverFlight = flight;
  animation.finished
    .catch(() => {})
    .finally(() => { if (_detailCoverFlight === flight) finishDetailCoverFlight(); });
  // Laisse une frame de sécurité avant de retirer le DOM : le dernier état
  // de la jaquette atteint ainsi toujours sa destination, même à 120 Hz.
  return DETAIL_COVER_TRANSITION_MS + 34;
}

function renderDetailPanel(e, options = {}) {
  rememberModalReturnFocus(options.transitionSource, e.id);
  markModalPristine();
  const isPreview = options.preview === true;
  const isReadOnly = options.readOnly === true;
  const ratingDisplay = isPreview ? "" : ratingScoreHTML(e.rating, "detail-rating-score");
  const headerStatusBadge = isPreview
    ? `<span class="badge badge-upcoming">${iconCalendar()} À venir</span>`
    : isReadOnly && e.status
      ? `<span class="badge badge-${e.status}" id="detail-status-${e.id}">${iconStatus(e.status)} ${STATUS_LABELS[e.status]}</span>`
      : "";
  const backdropUrl = safeMediaUrl(e.backdrop_url);
  const coverUrl = safeMediaUrl(e.cover_url);
  const transitionOrigin = captureDetailCoverOrigin(options.transitionSource, e.id, coverUrl);

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
  const externalHTML  = externalUrl
    ? `<a href="${esc(externalUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">${iconExternal()} ${esc(externalLabel)}</a>`
    : "";

  const youtubeQuery     = encodeURIComponent(`${e.title} ${e.media_type === "game" ? "trailer" : e.media_type === "movie" ? "bande annonce" : "book trailer"}`);
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;
  const youtubeHTML      = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">${iconPlay()} Trailer</a>`;

  // Backdrop header
  const backdropClass = backdropUrl ? "detail-backdrop has-backdrop" : (coverUrl ? "detail-backdrop has-backdrop has-fallback" : "detail-backdrop");

  const posterHTML = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="${esc(e.title)}" class="detail-poster fade-image${transitionOrigin ? " is-cover-transition-target" : ""}" decoding="async" data-fade-image data-image-fallback="hide">`
    : `<div class="detail-poster detail-poster-placeholder">${iconMedia(e.media_type, e.subtype)}</div>`;

  const root = document.getElementById("modal-root");
  const previousDetailDialog = root.querySelector("#modal-overlay .detail-modal");
  if (previousDetailDialog) dialogFocus.deactivate(previousDetailDialog, { restoreFocus: false });
  const detailSessionId = detailSessions.begin(e.id);
  root.innerHTML = `
    <div class="modal-overlay${transitionOrigin ? " has-cover-transition" : ""}" id="modal-overlay" ${uiAction("closeModalOnBg", [], { event: true })}>
      <div class="modal detail-modal" data-detail-media-id="${esc(e.id || "")}" ${coverUrl ? `data-cover-accent-url="${esc(coverUrl)}"` : ""} role="dialog" aria-modal="true" aria-labelledby="detail-sheet-title">

        <div class="${backdropClass}">
          <div class="detail-swipe-handle" aria-hidden="true"></div>
          <div class="detail-backdrop-gradient"></div>
          <button class="detail-close-btn btn-icon" ${uiAction("closeModal")} aria-label="Fermer">${iconX()}</button>
          <div class="detail-backdrop-content">
            ${posterHTML}
            <div class="detail-backdrop-info">
              <h2 class="detail-title" id="detail-sheet-title">${esc(e.title)}</h2>
              ${ratingDisplay ? `<div class="detail-rating" id="detail-rating-${e.id}">${ratingDisplay}</div>` : ""}
              <div class="detail-badges">
                <span class="badge badge-${e.media_type}">${iconMedia(e.media_type, e.subtype)} ${getTypeLabel(e)}</span>
                ${headerStatusBadge}
                ${!isPreview ? `<span class="detail-fav ${e.is_favorite ? "is-active" : ""}" id="detail-fav-${e.id}" title="Coup de cœur" aria-label="Coup de cœur">♥</span>` : ""}
                ${!isPreview ? detailRepeatIndicatorHTML(e) : ""}
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
              <button class="btn btn-primary btn-sm" ${uiAction("closeModal")}>Fermer</button>
            </div>` : isPreview ? `
            <div class="detail-footer-actions">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" ${uiAction("addUpcomingToWishlistFromModal", [options.upcomingKey])}>+ Wishlist</button>
            </div>` : `
            <button type="button" class="btn btn-danger btn-icon-only detail-delete-action" title="Supprimer ce média" aria-label="Supprimer ce média" ${uiAction("deleteEntry", [e.id])}><span class="detail-delete-icon">${iconTrash()}</span></button>
            <div class="detail-footer-actions">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" ${uiAction("openEditFromDetail", [e.id])}>${iconEdit()} Modifier</button>
            </div>`}
        </div>
      </div>
    </div>`;

  if (options.history !== "none") {
    pushHistoryLayer("modal", { modal: options.preview ? "upcoming" : "detail", mediaId: e.id || null });
  }
  syncSystemBar(getCurrentPage(), null);
  bindCoverAccent(root.querySelector(".detail-modal"), coverUrl, backdropUrl);
  hydrateFadeImages(root);
  const backdropEl = root.querySelector(".detail-backdrop");
  if (backdropEl && coverUrl && !backdropUrl) {
    const cssCoverUrl = coverUrl.replace(/["\\\n\r]/g, "");
    backdropEl.style.setProperty("--fallback-img", `url("${cssCoverUrl}")`);
  }
  if (backdropUrl) requestAnimationFrame(() => {
    if (detailSessions.isActive(detailSessionId, e.id)) _injectBackdrop(backdropUrl, e.id, detailSessionId);
  });
  setupMobileSheetSwipe({
    overlay: root.querySelector("#modal-overlay"),
    sheet: root.querySelector(".detail-modal"),
    handles: ".detail-backdrop",
    dismiss: () => closeModal(),
  });
  if (options.restoreView) {
    const overlay = root.querySelector("#modal-overlay");
    overlay.classList.add("is-modal-replacement", "is-restoring-view");
    const synopsis = root.querySelector(".detail-synopsis-wrap");
    if (synopsis && options.restoreView.synopsisExpanded) {
      synopsis.classList.add("expanded");
      const toggle = synopsis.querySelector(".detail-synopsis-toggle");
      if (toggle) { toggle.textContent = "Voir moins"; toggle.setAttribute("aria-expanded", "true"); }
    }
    // La hauteur dépliée doit être connue avant scrollTop : sinon Safari
    // borne la position à la hauteur du synopsis encore replié.
    _checkSynopsisOverflow(e.id);
    const body = root.querySelector(".detail-body");
    if (body) body.scrollTop = options.restoreView.scrollTop;
    requestAnimationFrame(() => overlay.classList.remove("is-restoring-view"));
  }
  activateDialog(root.querySelector(".detail-modal"), {
    initialFocus: options.restoreView ? '[data-ui-action="openEditFromDetail"]' : ".detail-close-btn",
  });
  if (transitionOrigin) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!detailSessions.isActive(detailSessionId, e.id)) return;
      const overlay = root.querySelector("#modal-overlay");
      const target = overlay?.querySelector(".detail-poster");
      startDetailCoverOpen(transitionOrigin, target, overlay);
    }));
  }
  return detailSessionId;
}


// ── Body enrichi de la fiche détail ──────────────────────────
function quickActionsHTML(entry) {
  const statusOptions = [
    ["wishlist", "Wishlist"],
    ["playing", "En cours"],
    ["finished", "Terminé"],
  ];
  const repeatControl = quickRepeatHTML(entry);
  return `
    <section class="detail-quick-actions" id="detail-quick-actions-${entry.id}" aria-label="Actions rapides">
      <div class="quick-actions-header">
        <span>Actions rapides</span>
        <span class="quick-actions-feedback" id="quick-feedback-${entry.id}" aria-live="polite"></span>
      </div>
      <div class="quick-status-control" role="group" aria-label="Statut">
        ${statusOptions.map(([value, label]) => `
          <button type="button" class="quick-status-btn ${entry.status === value ? "active" : ""}" data-status="${value}" ${uiAction("quickSetStatus", [entry.id, value])} aria-pressed="${entry.status === value}">
            <span aria-hidden="true">${iconStatus(value)}</span>${label}
          </button>`).join("")}
      </div>
      ${repeatControl ? `<div class="quick-repeat-row">${repeatControl}</div>` : ""}
    </section>`;
}

function detailRepeatIndicatorHTML(entry) {
  const info = repeatInfo(entry);
  const progress = repeatProgressLabel(entry, info);
  const historyLabel = info.total ? `${info.done} ${info.total} fois` : "Aucun revisionnage";
  const active = isReplayEntry(entry);
  const label = progress ? `${progress} · ${historyLabel}` : historyLabel;
  return `<span class="detail-repeat ${active ? "is-active" : ""} ${progress ? "is-progress" : ""}" id="detail-repeat-${entry.id}" title="${esc(label)}" aria-label="${esc(label)}">${iconRepeat()}<strong>${active ? `${info.total}×` : ""}</strong></span>`;
}

function quickRepeatHTML(entry) {
  const info = repeatInfo(entry);
  if (!info.total) return "";

  const progress = repeatProgressLabel(entry, info);
  const historyLabel = `${info.done} ${info.total} fois`;
  const [singular, plural] = entry.media_type === "book"
    ? ["lecture", "lectures"]
    : entry.media_type === "game"
      ? ["partie", "parties"]
      : ["vue", "vues"];
  const countLabel = `${info.total} ${info.total > 1 ? plural : singular}`;
  const fullLabel = progress ? `${progress} · ${historyLabel}` : historyLabel;
  const canAdjustDown = !progress && info.repeats > 0;
  const canAdjustUp = !progress;
  const addTitle = progress
    ? "Le compteur augmentera au prochain passage sur Terminé"
    : info.action;
  return `
    <div class="quick-repeat-stepper ${progress ? "is-progress" : ""}" role="group" aria-label="${esc(fullLabel)}">
      <button type="button" class="quick-repeat-adjust" ${uiAction("quickAdjustRepeat", [entry.id, -1])} ${canAdjustDown ? "" : "disabled"} aria-label="Retirer un ${info.noun}">−</button>
      <span class="quick-repeat-value" title="${esc(fullLabel)}">${iconRepeat()}<span>${esc(countLabel)}</span></span>
      <button type="button" class="quick-repeat-adjust quick-repeat-add" ${uiAction("quickAdjustRepeat", [entry.id, 1])} ${canAdjustUp ? "" : "disabled"} aria-label="${info.action} une fois de plus" title="${esc(addTitle)}">+</button>
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
      ${uiAction("openMetadataFromElement", [], { control: true })}>
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

  const previousMetadataDialog = document.querySelector("#metadata-overlay .metadata-sheet");
  if (previousMetadataDialog) dialogFocus.deactivate(previousMetadataDialog, { restoreFocus: false });
  document.getElementById("metadata-overlay")?.remove();
  _metadataReturnFocus = element;
  const matches = entriesForMetadata(State.entries, kind, value);
  const directUrl = safeMediaUrl(element.dataset.metaExternal);
  const external = metadataExternalLink(kind, value, directUrl || null);
  const externalUrl = safeMediaUrl(external?.url);
  const mediaRows = matches.map(entry => {
    const coverUrl = safeMediaUrl(entry.cover_url);
    return `
      <button type="button" class="metadata-media-row" data-media-id="${esc(entry.id)}" data-prefetch-media="${esc(entry.id)}" ${uiAction("openMetadataMedia", [entry.id])}>
        ${coverUrl
          ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" decoding="async" data-fade-image class="fade-image">`
          : `<span class="metadata-media-cover" aria-hidden="true">${iconMedia(entry.media_type, entry.subtype)}</span>`}
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
    <div class="metadata-overlay" id="metadata-overlay" ${uiAction("closeMetadataPanel", [], { self: true })}>
      <section class="metadata-sheet" role="dialog" aria-modal="true" aria-labelledby="metadata-sheet-title">
        <div class="metadata-sheet-handle" aria-hidden="true"></div>
        <header class="metadata-sheet-header">
          <div>
            <span>${esc(definition.label)}</span>
            <h3 id="metadata-sheet-title">${esc(value)}</h3>
            <p>${esc(countLabel)}</p>
          </div>
          <button type="button" class="btn-icon" ${uiAction("closeMetadataPanel")} aria-label="Fermer">${iconX()}</button>
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
  syncDialogBackground();
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
  dialogFocus.activate(overlay?.querySelector(".metadata-sheet"), {
    returnFocus: _metadataReturnFocus,
    initialFocus: ".metadata-sheet .btn-icon",
    onEscape: () => closeMetadataPanel(),
  });
}

function closeMetadataPanel({ restoreFocus = true, immediate = false } = {}) {
  if (!immediate && historyOwnsLayer("metadata")) {
    history.back();
    return;
  }
  const overlay = document.getElementById("metadata-overlay");
  const metadataDialog = overlay?.querySelector(".metadata-sheet") || null;
  const finish = () => {
    overlay?.remove();
    const detailModal = document.querySelector("#modal-overlay .detail-modal");
    if (detailModal) detailModal.inert = false;
    syncDialogBackground();
    if (metadataDialog) dialogFocus.deactivate(metadataDialog, { restoreFocus });
    _metadataReturnFocus = null;
  };
  if (!overlay || immediate) { finish(); return; }
  if (overlay.classList.contains("is-closing")) return;
  overlay.classList.add("is-closing");
  setTimeout(finish, 180);
}

function openMetadataMedia(id) {
  if (!State.entries.some(entry => entry.id === id)) return;
  // La seconde fiche n'a pas été ouverte depuis la jaquette d'origine : la
  // faire repartir vers cette ancienne carte produirait un trajet trompeur.
  if (_activeDetailCoverTransition?.mediaId !== String(id)) _activeDetailCoverTransition = null;
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
        <button type="button" class="detail-synopsis-toggle" ${uiAction("toggleSynopsis", [synId])} aria-controls="${synId}-clip" aria-expanded="false" hidden>Voir plus</button>
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
    e.release_date
      ? metaRow("Sortie", formatReleaseDate(e.release_date, e.release_date_precision || e.date_precision || "day"))
      : metaRow("Année", e.release_year),
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
  const sessionId = detailSessions.activeId(entry.id);
  if (!sessionId) return;
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
    detailSessions.schedule(() => {
      if (!slot.isConnected) return;
      slot.replaceChildren();
      slot.classList.remove("is-transitioning");
    }, 180, sessionId);
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
    detailSessions.schedule(() => {
      if (!slot.isConnected) return;
      previous.remove();
      next.classList.remove("detail-synopsis-arriving");
      slot.classList.remove("is-transitioning");
    }, 270, sessionId);
  } else {
    next.classList.add("detail-synopsis-arriving");
    slot.replaceChildren(next);
    detailSessions.schedule(() => next.classList.remove("detail-synopsis-arriving"), 270, sessionId);
  }
}

function replaceDetailInfo(entry, options = {}) {
  const sessionId = detailSessions.activeId(entry.id);
  if (!sessionId) return;
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
  slot._detailInfoTimer = detailSessions.schedule(() => {
    if (!slot.isConnected) return;
    current?.remove();
    next.classList.remove("detail-info-arriving");
    slot.style.height = "";
    slot.classList.remove("is-resizing", "is-revealing", "is-transitioning");
  }, 330, sessionId);

  if (body) body.scrollTop = previousScroll;
}

function refreshDetailEnrichment(entry, options = {}) {
  const sessionId = detailSessions.activeId(entry.id);
  if (!sessionId) return;
  replaceDetailSynopsis(entry, options);
  replaceDetailInfo(entry, options);
  if (entry.description) {
    // Le texte se pose d'abord ; le contrôle arrive ensuite sans clignoter.
    detailSessions.schedule(() => _scheduleSynopsisOverflowCheck(entry.id), 90, sessionId);
  }
}

function syncOpenDetail(entry, feedback = "") {
  const quickActions = document.getElementById(`detail-quick-actions-${entry.id}`);
  if (quickActions) quickActions.outerHTML = quickActionsHTML(entry);

  const statusBadge = document.getElementById(`detail-status-${entry.id}`);
  if (statusBadge) {
    statusBadge.className = `badge badge-${entry.status}`;
    statusBadge.innerHTML = `${iconStatus(entry.status)} ${esc(STATUS_LABELS[entry.status] || entry.status)}`;
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
  const owner = State.user?.id;
  if (!owner) return null;
  entry._quickSaving = true;

  const panel = document.getElementById(`detail-quick-actions-${id}`);
  panel?.classList.add("is-saving");
  panel?.querySelectorAll("button").forEach(button => { button.disabled = true; });
  const savingLabel = document.getElementById(`quick-feedback-${id}`);
  if (savingLabel) savingLabel.textContent = "Enregistrement…";

  try {
    const updated = await Media.update(id, changes);
    if (!sameOwner(owner, State.user?.id)) return null;
    Object.assign(entry, updated);
    cacheEntriesLocally();
    markJournalDirty();
    renderCards();
    if (getCurrentPage() === "upcoming") renderUpcomingCards();
    updateBadges();
    syncOpenDetail(entry, Media.getStatus?.().pending > 0 ? "Synchronisation en attente" : feedback);
    return entry;
  } catch (error) {
    if (!sameOwner(owner, State.user?.id)) return null;
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

function _injectBackdrop(backdrop, entryId, sessionId = detailSessions.activeId(entryId)) {
  if (!backdrop || !detailSessions.isActive(sessionId, entryId)) return;
  const detailBody = document.getElementById(`detail-body-${entryId}`);
  const detailModal = detailBody?.closest(".detail-modal");
  const bdEl = detailModal?.querySelector(".detail-backdrop");
  if (!bdEl) return;
  const currentAccentImage = detailModal.dataset.coverAccentUrl || "";
  bindCoverAccent(detailModal, currentAccentImage, backdrop === currentAccentImage ? "" : backdrop);
  // Evite de doubler la couche si déjà présente
  if (bdEl.querySelector(".detail-backdrop-layer")) return;
  const img = new Image();
  const releaseTrackedImage = detailSessions.trackImage(img, sessionId);
  const releaseLoader = () => {
    img.onload = null;
    img.onerror = null;
    releaseTrackedImage();
  };
  img.onload = () => {
    if (!detailSessions.isActive(sessionId, entryId) || !bdEl.isConnected || bdEl.querySelector(".detail-backdrop-layer")) {
      releaseLoader();
      return;
    }
    const layer = document.createElement("div");
    layer.className = "detail-backdrop-layer";
    layer.style.backgroundImage = `url(${JSON.stringify(backdrop)})`;
    layer.style.opacity = "0";
    bdEl.insertBefore(layer, bdEl.firstChild);
    bdEl.style.backgroundImage = "none"; // retire la cover inline une fois le banner chargé
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (detailSessions.isActive(sessionId, entryId) && layer.isConnected) layer.style.opacity = "1";
    }));
    bdEl.classList.add("has-backdrop");
    releaseLoader();
  };
  img.onerror = releaseLoader;
  img.decoding = "async";
  img.src = backdrop;
}

async function openDetailPanel(id, options = {}) {
  const e = State.entries.find(x => x.id === id);
  if (!e) return;
  const detailOwner = State.user?.id;
  if (!detailOwner) return;

  // Affichage immédiat avec ce qu'on a déjà en base
  const detailsLoading = !e.description && !e._detailsFetched && (canEnrichMediaDetails(e) || canResolveMediaIdentity(e));
  const detailSessionId = renderDetailPanel(e, { detailsLoading, transitionSource: options.transitionSource || null, restoreView: options.restoreView });
  const detailSignal = detailSessions.signal(detailSessionId);
  const ownsDetailSession = () => sameOwner(detailOwner, State.user?.id) &&
    detailSessions.isActive(detailSessionId, e.id);
  _scheduleSynopsisOverflowCheck(e.id);

  // Une ancienne fiche TMDb peut avoir été considérée comme enrichie avant
  // l'arrivée des bannières. Elle bénéficie d'une unique vérification fraîche.
  const needsBackdropRepair = e.media_type === "movie" && !e.backdrop_url && !e._backdropRepairAttempted;
  if (e._detailsFetched && !needsBackdropRepair) {
    _injectBackdrop(e.backdrop_url, e.id, detailSessionId);
    return;
  }
  e._detailsFetching = true;
  e._detailsFetchingSession = detailSessionId;

  try {
    // Les anciens ajouts manuels n'avaient parfois pas d'identifiant TMDb.
    // Un rapprochement strict titre + type (+ année si connue) permet de
    // réparer Fight Club et les fiches équivalentes sans associer une œuvre au hasard.
    if (canResolveMediaIdentity(e)) {
      try {
        await repairMissingTMDbIdentity(e, { signal: detailSignal, owner: detailOwner });
      } catch (error) {
        if (error?.name !== "AbortError") console.warn("[Detail] identity repair error:", error);
      }
      if (!ownsDetailSession()) return;
    }

    // Si l'enrichissement précédent a été affiché mais pas sauvegardé, on
    // retente d'abord exactement ces champs sans refaire ni écraser les saisies.
    if (e._detailsPending && Object.keys(e._detailsPending).length) {
      try {
        const updated = await Media.update(e.id, e._detailsPending, { signal: detailSignal });
        if (!ownsDetailSession()) return;
        Object.assign(e, updated);
        delete e._detailsPending;
        e._detailsFetched = true;
        cacheEntriesLocally();
      } catch (error) {
        if (error?.name !== "AbortError") console.warn("[Detail] persistence retry error:", error);
        if (error?.name !== "AbortError" && ownsDetailSession()) {
          toast("La sauvegarde des détails a encore échoué. Tes données personnelles restent intactes.", "error");
        }
      }
      if (ownsDetailSession()) {
        _injectBackdrop(e.backdrop_url, e.id, detailSessionId);
        if (!e.description) refreshDetailEnrichment(e, { detailsLoading: false });
      }
      return;
    }

    if (!canEnrichMediaDetails(e)) {
      if (ownsDetailSession()) {
        refreshDetailEnrichment(e, { detailsLoading: false });
      }
      return;
    }

    const refreshBackdrop = e.media_type === "movie" && !e.backdrop_url;
    if (refreshBackdrop) e._backdropRepairAttempted = true;
    const details = await requestPrefetchedDetails(e, {
      fresh: refreshBackdrop,
      signal: detailSignal,
    });
    if (!ownsDetailSession()) return;

    if (!details) {
      refreshDetailEnrichment(e, { detailsLoading: false });
      return;
    }
    if (Array.isArray(details.cast_people)) e.cast_people = details.cast_people;
    // Ne sauvegarder que les champs nouveaux (ne pas écraser ce que l'utilisateur a saisi)
    const toSave = collectDetailUpdates(e, details);
    Object.assign(e, toSave);
    let persisted = true;
    if (Object.keys(toSave).length) {
      try {
        const updated = await Media.update(e.id, toSave, { signal: detailSignal });
        if (!ownsDetailSession()) return;
        Object.assign(e, updated);
        cacheEntriesLocally();
      } catch (error) {
        persisted = false;
        e._detailsPending = { ...toSave };
        if (error?.name !== "AbortError") console.warn("[Detail] persistence error:", error);
        if (error?.name !== "AbortError" && ownsDetailSession()) {
          toast("Détails affichés, mais leur sauvegarde a échoué.", "error");
        }
      }
    }
    e._detailsFetched = persisted;

    // Injecter le backdrop en fondu
    _injectBackdrop(e.backdrop_url, e.id, detailSessionId);

    // Seuls les emplacements enrichis changent : les actions et le scroll
    // restent montés pendant l'arrivée progressive du synopsis.
    const body = document.getElementById(`detail-body-${e.id}`);
    if (body) {
      refreshDetailEnrichment(e, { detailsLoading: false });
    }

  } catch(err) {
    if (err?.name !== "AbortError") console.warn("[Detail] fetch error:", err);
    if (ownsDetailSession()) {
      refreshDetailEnrichment(e, { detailsLoading: false });
    }
  } finally {
    if (e._detailsFetchingSession === detailSessionId) {
      e._detailsFetching = false;
      delete e._detailsFetchingSession;
    }
  }
}



  return {
    detailSessions,
    canEnrichMediaDetails,
    requestPrefetchedDetails,
    prefetchDetail,
    renderDetailPanel,
    refreshDetailEnrichment,
    injectBackdrop: _injectBackdrop,
    scheduleSynopsisOverflowCheck: _scheduleSynopsisOverflowCheck,
    openDetailPanel,
    openMetadataFromElement,
    openMetadataMedia,
    closeMetadataPanel,
    quickSetStatus,
    quickAdjustRepeat,
    scrollExpandedSynopsisIntoView,
    finishCoverFlight: finishDetailCoverFlight,
    startCoverClose: startDetailCoverClose,
    activeCoverOrigin: () => _activeDetailCoverTransition,
    setActiveCoverOrigin: value => { _activeDetailCoverTransition = value || null; },
    clearActiveCoverOrigin: () => { _activeDetailCoverTransition = null; },
  };
}
