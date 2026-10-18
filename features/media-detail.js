import { motionDuration, prepareDialogClose, animateHeightChange, replaceModalContent, transitionDialogReplacement } from "./motion.js";
// Fiches œuvre : rendu, enrichissement, métadonnées et ouverture de fiche.
import { mediaLinks } from "./media-links.js";
import { TMDb, TMDbDetails, TMDbImages, IGDBDetails, IGDBImages, OpenLibraryDetails } from "../api.js";
import { startBackdropDrift, startBackdropShow } from "./backdrop-motion.js";
import {
  formatReleaseDate, isReplayEntry, mediaWords, normalizeTitle, repeatInfo,
  repeatProgressLabel, staleRepeatEvents, statusLabelFor, statusTransitionChanges,
} from "../domain.js";
import {
  entriesForMetadata, metadataDefinition, metadataExternalLink, splitMetadataValues,
} from "./media-metadata.js";
import { createDetailSessionManager } from "./detail-session.js";
import { collectDetailUpdates } from "./detail-enrichment.js";

export function createMediaDetailFeature({
  State, Media, Journal, refreshJournalEvents, cacheEntriesLocally, safeMediaUrl, esc, uiAction,
  iconCalendar, iconPlay, iconEdit, iconTrash, iconRepeat, iconExternal, iconX,
  iconUser, iconMedia, iconStatus, getTypeLabel, ratingScoreHTML,
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
let _releaseDetailScroll = null;
let _releaseBackdropShow = null;

function releaseDetailDomResources() {
  _releaseBackdropShow?.();
  _releaseBackdropShow = null;
  _releaseDetailScroll?.();
  _releaseDetailScroll = null;
  document.querySelectorAll("#modal-root .detail-info-slot").forEach(slot => {
    clearTimeout(slot._detailInfoTimer);
    slot._detailInfoTimer = 0;
  });
  document.querySelectorAll("#modal-root .detail-backdrop-layer").forEach(layer => {
    layer.style.backgroundImage = "none";
  });
}

const detailSessions = createDetailSessionManager({ onDispose: releaseDetailDomResources });

function renderDetailPanel(e, options = {}) {
  rememberModalReturnFocus(options.transitionSource, e.id);
  markModalPristine();
  const isPreview = options.preview === true;
  const isReadOnly = options.readOnly === true;
  const ratingDisplay = isPreview ? "" : ratingScoreHTML(e.rating, "detail-rating-score");
  const headerStatusBadge = isPreview
    ? `<span class="badge badge-upcoming">${iconCalendar()} À venir</span>`
    : e.status
      ? `<span class="badge badge-${e.status}" id="detail-status-${e.id}">${iconStatus(e.status)} ${statusLabelFor(e.status, e.media_type)}</span>`
      : "";
  const backdropUrl = safeMediaUrl(e.backdrop_url);
  const coverUrl = safeMediaUrl(e.cover_url);

  const externalHTML = mediaLinks(e).map(link =>
    `<a href="${esc(link.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link" aria-label="${esc(link.label)} — nouvel onglet">${link.kind === "video" ? iconPlay() : iconExternal()}<span class="detail-ext-label">${esc(link.label)}</span></a>`
  ).join("");

  // Backdrop header
  const backdropClass = backdropUrl ? "detail-backdrop has-backdrop" : (coverUrl ? "detail-backdrop has-backdrop has-fallback" : "detail-backdrop");

  const posterHTML = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="${esc(e.title)}" class="detail-poster fade-image" decoding="async" data-fade-image data-image-fallback="hide">`
    : `<div class="detail-poster detail-poster-placeholder">${iconMedia(e.media_type, e.subtype)}</div>`;

  const root = document.getElementById("modal-root");
  const previousDetailDialog = root.querySelector("#modal-overlay .detail-modal");
  if (previousDetailDialog) dialogFocus.deactivate(previousDetailDialog, { restoreFocus: false });
  const detailSessionId = detailSessions.begin(e.id);
  replaceModalContent(root, `
    <div class="modal-overlay" id="modal-overlay" ${uiAction("closeModalOnBg", [], { event: true })}>
      <div class="modal detail-modal" data-detail-media-id="${esc(e.id || "")}" ${coverUrl ? `data-cover-accent-url="${esc(coverUrl)}"` : ""} role="dialog" aria-modal="true" aria-labelledby="detail-sheet-title">

        <div class="${backdropClass}">
          <div class="detail-swipe-handle" aria-hidden="true"></div>
          <div class="detail-backdrop-gradient"></div>
          <button class="detail-close-btn btn-icon" ${uiAction("closeModal")} aria-label="Fermer">${iconX()}</button>
          ${!isPreview ? `<div class="detail-compact-bar" aria-hidden="true">
            <span class="detail-compact-title">${esc(e.title)}</span>
            <span class="detail-compact-meta">
              <span class="detail-compact-badges" id="detail-compact-badges-${e.id}">${compactBadgesHTML(e)}</span>
              <span class="detail-compact-rating" id="detail-compact-rating-${e.id}">${compactRatingLabel(e.rating)}</span>
            </span>
          </div>` : `<div class="detail-compact-bar" aria-hidden="true"><span class="detail-compact-title">${esc(e.title)}</span></div>`}
          <div class="detail-backdrop-content">
            ${posterHTML}
            <div class="detail-backdrop-info">
              <h2 class="detail-title" id="detail-sheet-title">${esc(e.title)}</h2>
              ${ratingDisplay ? `<div class="detail-rating" id="detail-rating-${e.id}">${ratingDisplay}</div>` : ""}
              <div class="detail-badges">
                <span class="badge badge-${e.media_type === "movie" && e.subtype === "tv" ? "tv" : e.media_type}">${iconMedia(e.media_type, e.subtype)} ${getTypeLabel(e)}</span>
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
              ${externalHTML}
              <button class="btn btn-primary btn-sm" ${uiAction("closeModal")}>Fermer</button>
            </div>` : isPreview ? `
            <div class="detail-footer-actions">
              ${externalHTML}
              <button class="btn btn-primary btn-sm" ${uiAction("addUpcomingToWishlistFromModal", [options.upcomingKey])}>+ Envies</button>
            </div>` : `
            <button type="button" class="btn btn-danger btn-icon-only detail-delete-action" title="Supprimer cette œuvre" aria-label="Supprimer cette œuvre" ${uiAction("deleteEntry", [e.id])}><span class="detail-delete-icon">${iconTrash()}</span></button>
            <div class="detail-footer-actions">
              ${externalHTML}
              <button class="btn btn-primary btn-sm" ${uiAction("openEditFromDetail", [e.id])}>${iconEdit()} Modifier</button>
            </div>`}
        </div>
      </div>
    </div>`);

  if (options.history !== "none") {
    pushHistoryLayer("modal", { modal: options.preview ? "upcoming" : "detail", mediaId: e.id || null });
  }
  syncSystemBar(getCurrentPage(), null);
  bindCoverAccent(root.querySelector(".detail-modal"), coverUrl, backdropUrl);
  bindDetailScroll(root.querySelector(".detail-modal"));
  enhanceRatingScore(root.querySelector(`#detail-rating-${CSS.escape(String(e.id))}`), options.restoreView ? null : 0);
  if (!options.restoreView) popFavoriteHeart(root.querySelector(`#detail-fav-${CSS.escape(String(e.id))}`), 200);
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
  return detailSessionId;
}


// ── Mouvement de la fiche : défilement, note ─────────────────
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function formatRatingValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function compactRatingLabel(rating) {
  const value = Number(rating);
  return Number.isFinite(value) && value > 0 ? `★ ${formatRatingValue(value)}` : "";
}

// Barre compacte : coup de cœur et revisionnage, seulement s'il y en a.
// Mêmes couleurs que dans l'entête déployé (corail et turquoise).
function compactBadgesHTML(entry) {
  let html = "";
  if (entry.is_favorite) {
    html += `<span class="detail-compact-fav">♥</span>`;
  }
  if (isReplayEntry(entry)) {
    const info = repeatInfo(entry);
    const progress = repeatProgressLabel(entry, info);
    html += `<span class="detail-compact-repeat ${progress ? "is-progress" : ""}">${iconRepeat()}<strong>${info.total}×</strong></span>`;
  }
  return html;
}

// Cœur : même entrée en scène que l'étoile de la note. Il pop une fois, avec
// un léger décalage derrière l'étoile ; le délai passe par --fav-pop-delay pour
// que l'état de départ (invisible) s'applique dès l'ajout de la classe.
function popFavoriteHeart(el, delay = 0) {
  if (!el || !el.classList.contains("is-active") || prefersReducedMotion()) return;
  el._favPopCleanup?.();
  el.classList.remove("is-fav-pop");
  void el.offsetWidth; // relance l'animation si elle était en cours
  el.style.setProperty("--fav-pop-delay", `${delay}ms`);
  el.classList.add("is-fav-pop");
  // La classe part à la fin de la lueur (la dernière animation), avec un filet de sécurité.
  const cleanup = () => {
    clearTimeout(timer);
    el.removeEventListener("animationend", onEnd);
    el.classList.remove("is-fav-pop");
    el.style.removeProperty("--fav-pop-delay");
    el._favPopCleanup = null;
  };
  const onEnd = event => { if (event.animationName === "favHeartGlow") cleanup(); };
  const timer = setTimeout(cleanup, delay + 1600);
  el.addEventListener("animationend", onEnd);
  el._favPopCleanup = cleanup;
}

// Note affichée dans le conteneur (0 si « Non noté »).
function ratingValueOf(container) {
  const match = /Note ([\d.]+) sur 10/.exec(container?.querySelector(".rating-score")?.getAttribute("aria-label") || "");
  return match ? Number(match[1]) : 0;
}

// Étoile qui « pop » et note qui monte jusqu'à sa valeur.
// from === null ou from === note actuelle : affichage statique, sans animation.
function enhanceRatingScore(container, from = null) {
  const el = container?.querySelector(".rating-score");
  if (!el) return;
  const target = ratingValueOf(container);
  if (!target) return;
  const render = value => {
    const num = el.querySelector(".rating-num");
    if (num) num.textContent = formatRatingValue(value);
  };
  el.innerHTML = `<span class="rating-star" aria-hidden="true">★</span><span class="rating-num">${formatRatingValue(target)}</span>/10`;
  if (from === null || from === target || prefersReducedMotion()) return;

  el.classList.add("is-rating-pop");
  const decimals = Number.isInteger(target) && Number.isInteger(from) ? 0 : 1;
  const duration = 650;
  const delay = from === 0 ? 260 : 0; // à l'ouverture, on laisse la fiche se poser
  render(from);
  setTimeout(() => {
    const start = performance.now();
    const tick = now => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      render(t === 1 ? target : Number(value.toFixed(decimals)));
      if (t < 1) requestAnimationFrame(tick);
      else setTimeout(() => el.classList.remove("is-rating-pop"), 700);
    };
    requestAnimationFrame(tick);
  }, delay);
}

// Entête rétractable. Le bandeau est posé en absolu au-dessus du corps, qui
// réserve sa hauteur par un padding : le bandeau peut rétrécir sans jamais
// modifier la hauteur défilable (pas de saut ni de boucle de mise en page).
// --detail-p (0 → 1) = progression du repli ; --detail-h = hauteur déployée.
// Signale aussi s'il reste du contenu sous le pied de fiche.
function bindDetailScroll(modal) {
  const body = modal?.querySelector(".detail-body");
  const backdrop = modal?.querySelector(".detail-backdrop");
  if (!body || !backdrop) return;
  _releaseDetailScroll?.();
  let range = 1;
  let frame = 0;

  const measure = () => {
    if (!modal.isConnected) return;
    modal.classList.remove("is-collapsible");
    const full = backdrop.offsetHeight;
    const compact = parseFloat(getComputedStyle(modal).getPropertyValue("--detail-compact-h")) || 64;
    range = Math.max(1, full - compact);
    modal.style.setProperty("--detail-h", `${full}px`);
    modal.classList.add("is-collapsible");
    body.style.setProperty("--synopsis-reading-height", `${Math.max(0, body.clientHeight - compact - 8)}px`);
  };
  const update = () => {
    frame = 0;
    if (!modal.isConnected) return;
    const progress = Math.min(1, Math.max(0, body.scrollTop / range));
    modal.style.setProperty("--detail-p", progress.toFixed(3));
    modal.classList.toggle("is-detail-scrolled", progress > .5);
    modal.classList.toggle("has-more-below", body.scrollHeight - body.clientHeight - body.scrollTop > 6);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

  body.addEventListener("scroll", schedule, { passive: true });
  // Le contenu s'enrichit après l'ouverture (synopsis, détails) : on recalcule.
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  // Le bandeau change de hauteur quand l'image HD arrive (classe has-backdrop).
  const backdropObserver = new MutationObserver(() => { measure(); schedule(); });
  backdropObserver.observe(backdrop, { attributes: true, attributeFilter: ["class"] });
  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => { measure(); schedule(); }) : null;
  resizeObserver?.observe(modal);
  _releaseDetailScroll = () => {
    body.removeEventListener("scroll", schedule);
    bodyObserver.disconnect();
    backdropObserver.disconnect();
    resizeObserver?.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
  measure();
  update();
}

// ── Body enrichi de la fiche détail ──────────────────────────
function detailRepeatIndicatorHTML(entry) {
  const info = repeatInfo(entry);
  const progress = repeatProgressLabel(entry, info);
  const historyLabel = info.total ? `${info.done} ${info.total} fois` : info.noneLabel;
  const active = isReplayEntry(entry);
  const label = progress ? `${progress} · ${historyLabel}` : historyLabel;
  return `<span class="detail-repeat ${active ? "is-active" : ""} ${progress ? "is-progress" : ""}" id="detail-repeat-${entry.id}" title="${esc(label)}" aria-label="${esc(label)}">${iconRepeat()}<strong>${active ? `${info.total}×` : ""}</strong></span>`;
}

let _metadataReturnFocus = null;

function metadataTarget(entry, kind, value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue || !metadataDefinition(kind)) return null;
  let directUrl = "";
  if (kind === "cast" && Array.isArray(entry?.cast_people)) {
    const person = entry.cast_people.find(candidate => normalizeTitle(candidate?.name) === normalizeTitle(cleanValue));
    if (person?.imdb_id) directUrl = `https://www.imdb.com/name/${encodeURIComponent(person.imdb_id)}/`;
  }
  return { cleanValue, directUrl };
}

function metadataDataAttrs(kind, target) {
  return `data-meta-kind="${esc(kind)}"
      data-meta-value="${esc(target.cleanValue)}"
      data-meta-external="${esc(target.directUrl)}"
      ${uiAction("openMetadataFromElement", [], { control: true })}`;
}

// Puce du casting : même action qu'avant, sans la flèche (la rangée défile).
function metadataChipHTML(entry, kind, value) {
  const target = metadataTarget(entry, kind, value);
  if (!target) return "";
  return `
    <button type="button" class="detail-chip detail-meta-link"
      ${metadataDataAttrs(kind, target)}>
      <span>${esc(target.cleanValue)}</span>
    </button>`;
}

// Lien souligné dans une phrase (crédits, genres) : ouvre la même feuille.
function metadataLinkHTML(entry, kind, value) {
  const target = metadataTarget(entry, kind, value);
  if (!target) return "";
  return `<button type="button" class="detail-link"
      ${metadataDataAttrs(kind, target)}>${esc(target.cleanValue)}</button>`;
}

function metadataLinksHTML(entry, kind, value) {
  return splitMetadataValues(value).map(item => metadataLinkHTML(entry, kind, item)).filter(Boolean).join(", ");
}

function openMetadataFromElement(element) {
  const kind = element?.dataset?.metaKind;
  const value = element?.dataset?.metaValue;
  const definition = metadataDefinition(kind);
  if (!definition || !value) return;

  const previousMetadataDialog = document.querySelector("#metadata-overlay .metadata-sheet");
  const previousMetadataRect = previousMetadataDialog?.getBoundingClientRect();
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
    ? `${matches.length} œuvre${matches.length > 1 ? "s" : ""} dans votre bibliothèque`
    : "Aucune œuvre correspondante dans votre bibliothèque";

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
  if (previousMetadataRect) {
    overlay.classList.add("is-modal-replacement");
    transitionDialogReplacement(previousMetadataRect, overlay.querySelector(".metadata-sheet"));
  }
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
  prepareDialogClose(overlay);
  overlay.classList.add("is-closing");
  setTimeout(finish, motionDuration());
}

function openMetadataMedia(id) {
  if (!State.entries.some(entry => entry.id === id)) return;
  closeMetadataPanel({ restoreFocus: false });
  setTimeout(() => openDetailPanel(id), motionDuration() + 10);
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
    `<p class="detail-synopsis-empty">Aucun synopsis n’est disponible pour cette œuvre.</p>`,
    "detail-synopsis-section detail-synopsis-unavailable"
  );
}

function formatDuration(minutes) {
  const total = Number.parseInt(minutes, 10);
  if (!Number.isFinite(total) || total <= 0) return null;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

// Notes d'autres services : logo coloré de la source, jamais mélangées à la
// note perso. Le nom complet, le profil (joueurs, presse) et les votes restent
// dans l'infobulle et le libellé d'accessibilité.
function externalRatingsHTML(ratings) {
  return `<div class="detail-external-ratings" role="list">${ratings.map(rating => {
    const kind = rating.kind ? `<small>${esc(rating.kind)}</small>` : "";
    const votes = rating.votes ? ` · ${new Intl.NumberFormat("fr-FR").format(rating.votes)} votes` : "";
    const label = `${rating.label}${rating.kind ? ` ${rating.kind}` : ""} : ${formatRatingValue(rating.value)} sur 10${votes}`;
    const source = String(rating.source || "").replace(/[^a-z0-9_-]/gi, "").toLowerCase();
    return `<span class="detail-external-rating" data-source="${esc(source)}" role="listitem" title="${esc(label)}" aria-label="${esc(label)}">
      <span class="detail-external-logo is-${esc(source)}" aria-hidden="true">${esc(String(rating.label || "").toUpperCase())}</span>
      <strong>${esc(formatRatingValue(rating.value).replace(".", ","))}</strong>${kind}
    </span>`;
  }).join("")}</div>`;
}

function renderDetailInfoHTML(e, options = {}) {
  const isSeries = e.media_type === "movie" && e.subtype === "tv";
  const SEP = `<span class="detail-sep" aria-hidden="true"> · </span>`;
  let html = "";

  // Repères : une seule ligne discrète. L'année seule (jamais la date
  // complète), tirée de release_year ou, à défaut, de la date de sortie.
  const year = Number(e.release_year) ||
    Number.parseInt(String(e.release_date || "").slice(0, 4), 10) || null;
  const facts = [
    year,
    e.media_type === "movie" && !isSeries ? formatDuration(e.duration) : null,
    isSeries && e.seasons_count ? `${e.seasons_count} saison${e.seasons_count > 1 ? "s" : ""}` : null,
    isSeries && e.episodes_count ? `${e.episodes_count} épisodes` : null,
    isSeries ? e.air_status : null,
    e.media_type === "game" ? e.platform : null,
    e.media_type === "book" && e.page_count ? `${e.page_count} pages` : null,
    e.media_type === "book" && e.isbn ? `ISBN ${e.isbn}` : null,
  ].map(item => String(item ?? "").trim()).filter(Boolean);
  if (facts.length) {
    html += `<p class="detail-facts" data-block="facts">${facts.map(esc).join(SEP)}</p>`;
  }

  // Crédits : personnes, studios et genres, en liens soulignés explorables.
  const credit = (prefix, kind, value) => {
    const links = metadataLinksHTML(e, kind, value);
    return links ? `<span class="detail-credit" data-detail-key="${esc(kind)}">${prefix} ${links}</span>` : "";
  };
  const credits = [
    e.media_type === "movie"
      ? credit(isSeries ? "Créée par" : "De", "director", e.directors || e.author)
      : "",
    e.media_type === "game" ? credit("Développé par", "developer", e.developer || e.author) : "",
    e.media_type === "game" ? credit("Édité par", "publisher", e.publisher) : "",
    e.media_type === "book" ? credit("De", "author", e.author) : "",
    e.media_type === "book" ? credit("Édité par", "publisher", e.publisher) : "",
  ].filter(Boolean);
  const genres = metadataLinksHTML(e, "genre", e.genre);
  if (genres) credits.push(`<span class="detail-credit" data-detail-key="genre">${genres}</span>`);
  if (credits.length) {
    html += `<p class="detail-credits detail-credits-section" data-block="credits">${credits.join(SEP)}</p>`;
  }

  // Casting : rangée qui défile, une puce par personne.
  if (e.media_type === "movie" && e.cast_members) {
    const castNames = Array.isArray(e.cast_people) && e.cast_people.length
      ? e.cast_people.map(person => person.name).filter(Boolean)
      : e.cast_members.split(",").map(name => name.trim()).filter(Boolean);
    const cast = castNames.map(name => metadataChipHTML(e, "cast", name)).join("");
    if (cast) html += `<div class="detail-cast-section" data-block="cast" role="group" aria-label="Casting"><div class="detail-cast-row">${cast}</div></div>`;
  }

  // Notes externes : logo coloré + note, sans titre de section.
  const ratings = Array.isArray(e.external_ratings) ? e.external_ratings : [];
  const awaitsRatings = options.detailsLoading && !ratings.length &&
    ["movie", "game"].includes(e.media_type) && Boolean(e.external_id);
  if (ratings.length) {
    html += `<div class="detail-external-section" data-block="external">${externalRatingsHTML(ratings)}</div>`;
  } else if (awaitsRatings) {
    html += `<div class="detail-external-section" data-block="external"><div class="detail-external-skeleton" role="status" aria-label="Chargement des notes externes"><span class="sr-only">Chargement des notes externes…</span><i aria-hidden="true"></i></div></div>`;
  }

  // Un seul emplacement d'attente : celui de la note quand il y en a un ;
  // les barres génériques ne servent qu'aux fiches sans note externe (livres).
  const awaitsMoreInfo = options.detailsLoading && !awaitsRatings && (
    e.media_type === "book" || (["movie", "game"].includes(e.media_type) && Boolean(e.external_id))
  );
  if (awaitsMoreInfo) {
    html += `<div class="detail-info-skeleton" data-block="loading" role="status" aria-label="Chargement des informations complémentaires">
      <span class="sr-only">Chargement des informations complémentaires…</span>
      <i aria-hidden="true"></i><i aria-hidden="true"></i>
    </div>`;
  }

  // Historique : une ligne discrète qui clôt la fiche (absente des fiches partagées).
  if (!options.readOnly) {
    const info = repeatInfo(e);
    const words = mediaWords(e.media_type);
    const dateItem = (label, value) => value ? `${label} le ${formatReleaseDate(value)}` : "";
    const history = [
      e.created_at ? `Ajouté le ${new Date(e.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : "",
      dateItem("Commencé", e.date_started),
      dateItem(words.done, e.date_finished),
      info.total > 1 ? `${info.repeats} ${info.repeats > 1 ? words.replay[1] : words.replay[0]}` : "",
    ].filter(Boolean);
    if (history.length) html += `<p class="detail-history detail-history-section" data-block="history">${history.map(esc).join(SEP)}</p>`;
  }

  return html;
}

function renderDetailBody(e, options = {}) {
  let html = "";

  if (options.readOnly) {
    html += `<div class="activity-detail-notice">
      <span class="activity-detail-avatar" aria-hidden="true">${iconUser()}</span>
      <span><strong>${esc(e.username || "Un membre")}</strong> a partagé cette œuvre. Cette fiche est en lecture seule.</span>
    </div>`;
  }

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
    }, motionDuration("--motion-content", 420), sessionId);
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
    animateHeightChange(slot, () => slot.append(next));
    detailSessions.schedule(() => {
      if (!slot.isConnected) return;
      animateHeightChange(slot, () => previous.remove());
      next.classList.remove("detail-synopsis-arriving");
      slot.classList.remove("is-transitioning");
    }, motionDuration("--motion-content", 420), sessionId);
  } else {
    next.classList.add("detail-synopsis-arriving");
    animateHeightChange(slot, () => slot.replaceChildren(next));
    detailSessions.schedule(() => next.classList.remove("detail-synopsis-arriving"), motionDuration("--motion-content", 420), sessionId);
  }
}

function replaceDetailInfo(entry, options = {}) {
  const sessionId = detailSessions.activeId(entry.id);
  if (!sessionId) return;
  const slot = document.getElementById(`detail-info-slot-${entry.id}`);
  if (!slot) return;
  const body = slot.closest(".detail-body");
  const previousScroll = body?.scrollTop || 0;
  const current = slot.querySelector(":scope > .detail-info-content");
  const next = document.createElement("div");
  next.className = "detail-info-content";
  next.innerHTML = renderDetailInfoHTML(entry, options);
  const stableMarkup = node => {
    const copy = node.cloneNode(true);
    copy.classList.remove("detail-block-in");
    copy.querySelectorAll(".detail-block-in").forEach(block => block.classList.remove("detail-block-in"));
    // class="" and an absent class attribute must compare equally.
    copy.querySelectorAll('[class=""]').forEach(block => block.removeAttribute("class"));
    if (copy.getAttribute("class") === "") copy.removeAttribute("class");
    return copy.outerHTML;
  };
  if (current && stableMarkup(current) === stableMarkup(next)) return;

  clearTimeout(slot._detailInfoTimer);
  animateHeightChange(slot, () => {
    slot.style.height = "";
    slot.classList.remove("is-resizing", "is-revealing", "is-transitioning");
    if (!current) { next.classList.add("detail-block-in"); slot.replaceChildren(next); return; }
    // Par blocs : ce qui n'a pas changé reste en place (rien ne clignote) ;
    // seul ce qui arrive (note externe, casting…) entre en douceur, et la
    // hauteur de la fiche s'ajuste par l'animation de hauteur.
    const previous = new Map([...current.children].map(node => [node.dataset.block, node]));
    const blocks = [...next.children].map(node => {
      const before = previous.get(node.dataset.block);
      if (before && stableMarkup(before) === stableMarkup(node)) return before;
      node.classList.add("detail-block-in");
      return node;
    });
    current.replaceChildren(...blocks);
  });

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

// Retirer une relecture (depuis Modifier) doit aussi retirer ses événements du
// Journal et des statistiques (la base ne les supprime pas d'elle-même).
async function revokeStaleRepeatEvents(entry) {
  const owner = State.user?.id;
  if (!owner) return;
  try {
    if (State.journalDirty || !State.journalAvailable) await refreshJournalEvents({ silent: true });
    if (!sameOwner(owner, State.user?.id)) return;
    const stale = staleRepeatEvents(entry, State.events);
    if (!stale.length) return;
    for (const event of stale) {
      const revoked = await Journal.revoke(event.id, event.metadata || {});
      if (!sameOwner(owner, State.user?.id)) return;
      Object.assign(event, revoked);
    }
    markJournalDirty();
  } catch (error) {
    if (!sameOwner(owner, State.user?.id)) return;
    console.warn("[Journal] Relecture non retirée du Journal :", error);
    toast("Compteur mis à jour, mais le Journal n’a pas pu être corrigé. Réessayez en ligne.", "info");
  }
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
    startBackdropDrift(layer);
    const entry = State.entries.find(x => x.id === entryId);
    const narrow = window.matchMedia?.("(max-width: 680px)").matches;
    const getUrls = entry?.external_id && entry.source_api === "tmdb"
      ? () => TMDbImages.fetch(entry.external_id, entry.subtype || "movie", { size: narrow ? "w780" : "w1280" })
      : entry?.external_id && entry.source_api === "igdb"
        ? () => IGDBImages.fetch(entry.external_id, { size: narrow ? "t_screenshot_big" : "t_1080p" })
        : null;
    if (getUrls) {
      startBackdropShow({
        bdEl,
        firstLayer: layer,
        getUrls,
        isActive: () => detailSessions.isActive(sessionId, entryId),
        track: image => detailSessions.trackImage(image, sessionId),
      }).then(stop => {
        if (detailSessions.isActive(sessionId, entryId)) _releaseBackdropShow = stop;
        else stop?.();
      }).catch(() => {});
    }
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
  const detailsLoading = !e._detailsFetched && (canEnrichMediaDetails(e) || canResolveMediaIdentity(e));
  const detailSessionId = renderDetailPanel(e, { detailsLoading, transitionSource: options.transitionSource || null, restoreView: options.restoreView });
  const detailSignal = detailSessions.signal(detailSessionId);
  const ownsDetailSession = () => sameOwner(detailOwner, State.user?.id) &&
    detailSessions.isActive(detailSessionId, e.id);
  _scheduleSynopsisOverflowCheck(e.id);

  // Une ancienne fiche TMDb peut avoir été considérée comme enrichie avant
  // l'arrivée des bannières. Elle bénéficie d'une unique vérification fraîche.
  const needsBackdropRepair = (e.media_type === "movie" || (e.media_type === "game" && e.source_api === "igdb" && e.external_id)) &&
    !e.backdrop_url && !e._backdropRepairAttempted;
  const needsDetailRefresh = Boolean(e.external_id) &&
    (!e.backdrop_url || !e.external_ratings?.length) &&
    (!e._detailsFetchedAt || Date.now() - e._detailsFetchedAt > DETAIL_PREFETCH_TTL);
  if (e._detailsFetched && !needsBackdropRepair && !needsDetailRefresh) {
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
          toast("La sauvegarde des détails a encore échoué. Vos données personnelles restent intactes.", "error");
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

    const refreshBackdrop = (e.media_type === "movie" || (e.media_type === "game" && e.source_api === "igdb" && e.external_id)) && !e.backdrop_url;
    if (refreshBackdrop) e._backdropRepairAttempted = true;
    const details = await requestPrefetchedDetails(e, {
      fresh: refreshBackdrop || needsDetailRefresh,
      signal: detailSignal,
    });
    if (!ownsDetailSession()) return;

    if (!details) {
      refreshDetailEnrichment(e, { detailsLoading: false });
      return;
    }
    if (Array.isArray(details.cast_people)) e.cast_people = details.cast_people;
    if (Array.isArray(details.external_ratings)) e.external_ratings = details.external_ratings;
    // Ne sauvegarder que les champs nouveaux (ne pas écraser ce que l'utilisateur a saisi)
    const toSave = collectDetailUpdates(e, details);
    Object.assign(e, toSave);
    // Afficher les données dès leur réception, sans attendre une écriture réseau.
    _injectBackdrop(e.backdrop_url, e.id, detailSessionId);
    refreshDetailEnrichment(e, { detailsLoading: false });
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
    e._detailsFetchedAt = Date.now();

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
    revokeStaleRepeatEvents,

  };
}
