export function profileRepeatLabel(media) {
  return ({film:"Revisionnages", tv:"Revisionnages", game:"Parties rejouées", book:"Relectures"})[media] || "Reprises";
}
// Profil : périodes, statistiques, préférés et compte.
import {
  entryActivityMonth, entryActivityYear, eventsForPeriod, isCompletionEvent,
  isProfileTopEvent, latestEventMonth, uniqueEntriesForEvents, yearMonthOf,
} from "../domain.js";
import { exploredGenres, formatWatchTime, repeatCountForPeriod, watchTimeByMedia } from "./insights.js";
import { morphKeyedSurface, syncSegmentedPills } from "./dom-morph.js";
import { errorState, profileSkeleton, setButtonBusy } from "./ui-states.js";
import { createAsyncGate } from "./async-gate.js";
import { prefersReducedMotion } from "./motion.js";
export const LAST_BACKUP_KEY = "kulturo-last-backup";

export function formatLastBackup() {
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

export function createProfileFeature({
  State, Profiles, refreshJournalEvents, reloadEntries, navTo, syncFilterChips,
  updateCategoryTabs, renderCards, updateFilterToggleLabel,
  safeMediaUrl, esc, uiAction, iconMedia, iconStatus, iconUser,
  ratingScoreHTML, replayMotion, hydrateFadeImages, toast,
  getCurrentPage, onContextChange, onViewReady,
}) {
  const _profileToday = new Date();
  let _profileYear = _profileToday.getFullYear();
  let _profileMonth = String(_profileToday.getMonth() + 1).padStart(2, "0");
  let _profilePeriod = "year";
  let _profileMedia = "all";
  let _profileMonthAutoResolve = true;
  const _profileNumberValues = new Map();
  const renderGate = createAsyncGate();
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

  const REVEAL_SELECTOR = ".profile-year-overview, .profile-dashboard-card";
  // Départ des compteurs en attente de leur entrée à l'écran (WeakMap : aucun
  // attribut ajouté au DOM, donc rien qui perturbe la comparaison des blocs).
  const _pendingNumberFrom = new WeakMap();
  const _pendingBlocks = new Set();
  let _revealObserver = null;

  function setProfileNumberText(element, value) {
    const decimals = Number(element.dataset.profileDecimals || 0);
    element.textContent = `${element.dataset.profilePrefix || ""}${value.toFixed(decimals)}${element.dataset.profileSuffix || ""}`;
  }

  function tweenProfileNumber(element, from, duration = 700) {
    const target = Number(element.dataset.profileValue || 0);
    const start = performance.now();
    const draw = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setProfileNumberText(element, progress === 1 ? target : from + (target - from) * eased);
      if (progress < 1 && element.isConnected) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  function revealProfileBlock(block, { animate = true } = {}) {
    if (!_pendingBlocks.delete(block)) return;
    _revealObserver?.unobserve(block);
    block.classList.remove("is-reveal-pending");
    block.classList.add("is-revealed");
    block.querySelectorAll("[data-profile-number]").forEach(element => {
      if (!_pendingNumberFrom.has(element)) return;
      const from = _pendingNumberFrom.get(element);
      _pendingNumberFrom.delete(element);
      if (animate) tweenProfileNumber(element, from);
      else setProfileNumberText(element, Number(element.dataset.profileValue || 0));
    });
  }

  // Les blocs neufs ou modifiés attendent d'entrer dans l'écran : barres,
  // compteurs et vignettes se jouent alors à ce moment-là, pas hors champ.
  function prepareProfileReveal(container) {
    if (!container || prefersReducedMotion() || typeof IntersectionObserver !== "function") return;
    _revealObserver ||= new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) revealProfileBlock(entry.target); });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    container.querySelectorAll(REVEAL_SELECTOR).forEach(block => {
      if (block.classList.contains("is-revealed") || _pendingBlocks.has(block)) return;
      block.classList.add("is-reveal-pending");
      _pendingBlocks.add(block);
    });
  }

  function observeProfileReveal() {
    _pendingBlocks.forEach(block => _revealObserver?.observe(block));
  }

  // Quitter le Profil ne doit jamais laisser un bloc invisible à moitié révélé.
  function flushProfileReveal() {
    [..._pendingBlocks].forEach(block => revealProfileBlock(block, { animate: false }));
    _revealObserver?.disconnect();
  }

  function animateProfileNumbers(root) {
    const reduced = prefersReducedMotion();
    root?.querySelectorAll?.("[data-profile-number]").forEach(element => {
      const key = element.dataset.profileNumber;
      const target = Number(element.dataset.profileValue || 0);
      const previous = _profileNumberValues.get(key);
      _profileNumberValues.set(key, target);
      if (reduced) return;
      const pending = Boolean(element.closest(".is-reveal-pending"));
      // Première apparition : on compte depuis 0 ; sinon depuis l'ancienne valeur.
      const from = previous == null ? 0 : previous;
      if (from === target) return;
      if (pending) {
        _pendingNumberFrom.set(element, from);
        setProfileNumberText(element, from);
      } else if (previous != null) {
        tweenProfileNumber(element, from, 440);
      }
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
    onContextChange?.();
    renderDashboard();
  }

  function setProfileMonth(month) {
    const normalized = String(month).padStart(2, "0");
    if (!/^(0[1-9]|1[0-2])$/.test(normalized)) return;
    _profileMonth = normalized;
    _profileMonthAutoResolve = false;
    onContextChange?.();
    renderDashboard();
  }

  function setProfilePeriod(period) {
    if (!['year', 'month'].includes(period) || period === _profilePeriod) return;
    _profilePeriod = period;
    if (period === "month") _profileMonthAutoResolve = true;
    onContextChange?.();
    renderDashboard();
  }

  function setProfileMedia(media) {
    if (!PROFILE_MEDIA_OPTIONS.some(([value]) => value === media) || media === _profileMedia) return;
    _profileMedia = media;
    onContextChange?.();
    renderDashboard();
  }

  // Ouvre la Bibliothèque avec des filtres précis. Les filtres sont posés AVANT
  // la navigation et conservés (preserveFilters) : navTo passe par une View
  // Transition qui s'exécute après coup et remettrait sinon tout à zéro.
  function openLibraryWithFilters(applyFilters) {
    State.filters.type = "all";
    State.filters.subtype = "all";
    State.filters.status = "all";
    State.filters.favorite = false;
    State.filters.replay = false;
    State.filters.search = "";
    State.filters.year = "all";
    State.filters.month = "all";
    State.filters.rating = "all";
    applyFilters();
    State.scrollPos.library = 0;
    const search = document.getElementById("global-search");
    if (search) search.value = "";
    syncFilterChips();
    navTo("library", { preserveFilters: true, preserveSearch: true });
    updateFilterToggleLabel();
  }

  function openProfileCollection(kind, year, month = "all", mediaFilter = "all") {
    openLibraryWithFilters(() => {
      State.filters.year = Number(year) || "all";
      State.filters.month = /^(0[1-9]|1[0-2])$/.test(String(month)) && State.filters.year !== "all"
        ? `${State.filters.year}-${month}`
        : "all";

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
    });
  }

  function openRatingCollection(value) {
    const rating = Number.parseInt(value, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return;
    // L'histogramme couvre toutes les œuvres notées, quels que soient leur
    // type et leur statut : la Bibliothèque montre exactement le même ensemble.
    openLibraryWithFilters(() => { State.filters.rating = rating; });
  }

  async function renderDashboard() {
    const container = document.getElementById("dashboard-content");
    if (!container || getCurrentPage?.() !== "dashboard") return;
    const task = renderGate.begin();

    if (!State.entries.length && State.libraryStatus === "error") {
      container.innerHTML = errorState({
        title: "Profil indisponible",
        message: "Impossible de charger vos œuvres pour afficher vos statistiques.",
        actionHTML: '<button class="btn btn-secondary" ' + uiAction("retryProfile") + '>Réessayer</button>',
      });
      renderGate.finish(task);
      onViewReady?.("dashboard");
      return;
    }
    if (!container.children.length && (State.journalDirty || (State.user && State.username === null))) {
      container.innerHTML = profileSkeleton();
    }

    if (State.journalDirty) await refreshJournalEvents({ silent: true });
    if (!renderGate.isCurrent(task) || getCurrentPage?.() !== "dashboard") return;

    // Charge le username AVANT le rendu pour éviter le flash
    if (State.user && State.username === null) {
      try {
        const p = await Profiles.get(State.user.id, { signal: task.signal });
        if (!renderGate.isCurrent(task) || getCurrentPage?.() !== "dashboard") return;
        State.username = p?.username || "";
      } catch {}
    }
    if (!renderGate.isCurrent(task) || getCurrentPage?.() !== "dashboard") return;
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
    const periodEvents = State.journalAvailable ? eventsForPeriod(State.events, _profileYear, periodMonth) : [];
    const finishedOf = list => State.journalAvailable
      ? uniqueEntriesForEvents(list, periodEvents.filter(isCompletionEvent))
      : list.filter(entry => entry.status === "finished" && entry.date_finished);
    const scopedFinished = finishedOf(scopedEntries);
    const scopedPlaying = scopedEntries.filter(entry => entry.status === "playing");
    const scopedWishlist = scopedEntries.filter(entry => entry.status === "wishlist");
    const scopedFavs = scopedEntries.filter(entry => entry.is_favorite);
    const scopedRated = profileTopEntriesForPeriod(all, _profileYear, periodMonth);
    const scopedAverage = scopedRated.length
      ? (scopedRated.reduce((sum, entry) => sum + entry.rating, 0) / scopedRated.length).toFixed(1)
      : "—";
    // « Vos préférés » représente les œuvres actuellement terminées. Une œuvre
    // relancée reste comptée dans les statistiques, mais quitte temporairement ce Top.
    const topScoped = scopedRated
      .filter(entry => entry.status === "finished")
      .sort((a,b) => b.rating - a.rating)
      .slice(0, 6);
    const topHTML = topScoped.length
      ? topScoped.map((entry, index) => {
          const coverUrl = safeMediaUrl(entry.cover_url);
          return `
            <button type="button" class="profile-top-card" data-prefetch-media="${entry.id}" data-transition-media="${entry.id}" ${uiAction("openEditModal", [entry.id], { control: true })} aria-label="Ouvrir ${esc(entry.title)}">
              <span class="profile-top-rank">${index + 1}</span>
              <span class="profile-top-cover">
                ${coverUrl ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" decoding="async" data-fade-image class="fade-image">` : `<span>${iconMedia(entry.media_type, entry.subtype)}</span>`}
              </span>
              <strong>${esc(entry.title)}</strong>
              <small>${ratingScoreHTML(entry.rating, "profile-top-rating")}</small>
            </button>`;
        }).join("")
      : `<div class="profile-inline-empty">Aucune œuvre terminée et notée en ${esc(periodLabel)}.</div>`;

    const scopedRepeatCount = repeatCountForPeriod(
      State.journalAvailable ? State.events : [],
      scopedEntries,
      _profileYear,
      periodMonth,
    );
    const timeAll = watchTimeByMedia(finishedOf(dateScopedEntries));
    const timeScoped = watchTimeByMedia(scopedFinished);
    const timeHours = timeScoped.total / 60;
    const TIME_MEDIA = [
      ["film", "Films", "var(--brand-coral)"], ["tv", "Séries", "var(--brand-blue)"],
      ["game", "Jeux", "var(--brand-teal)"], ["book", "Livres", "var(--brand-gold)"],
    ];
    const timeParts = TIME_MEDIA.filter(([key]) => timeAll[key] > 0);
    const timeStackHTML = TIME_MEDIA.map(([key, , color]) => `<i class="${timeAll[key] > 0 ? "" : "is-empty"}" style="flex:${timeAll[key]} 1 0%;background:${color};opacity:${_profileMedia === "all" || _profileMedia === key ? 1 : .25}"></i>`).join("");
    const timeLegendHTML = TIME_MEDIA.map(([key, label, color]) => `
      <button type="button" class="${timeAll[key] > 0 ? "" : "is-empty"}" style="--c:${color}" ${uiAction("openProfileCollection", ["finished", _profileYear, periodMonth, key])}>${label} · ${timeAll[key] > 0 ? formatWatchTime(timeAll[key]) : "—"}</button>`).join("");
    const timeNote = `Films : durée TMDb · séries : épisodes × durée d’épisode · livres : ≈ 40 pages/h${timeAll.missing ? ` · ${timeAll.missing} œuvre${timeAll.missing > 1 ? "s" : ""} sans durée connue exclue${timeAll.missing > 1 ? "s" : ""}` : ""}.`;
    const genreInsights = exploredGenres(scopedEntries, 6);
    const genresHTML = genreInsights.map(item => `<span class="profile-chip">${esc(item.label)}<b>${item.count}</b></span>`).join("");

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
        <button type="button" class="rating-hist-col${n ? " is-clickable" : ""}" title="${n} œuvre${n !== 1 ? "s" : ""} · ★ ${note}/10" ${n ? `${uiAction("openRatingCollection", [note])} aria-label="Voir les ${n} œuvres notées ${note} sur 10"` : "disabled aria-hidden=\"true\""}>
          <div class="rating-hist-count">${n || ""}</div>
          <div class="rating-hist-bar${isPeak ? " peak" : ""}" style="height:${px}px"></div>
        </button>`;
    }).join("");

    const ratingsHTML = totalRated > 0 ? `
      <section class="profile-dashboard-card profile-ratings-card" data-ui-key="profile-ratings">
        <div class="rating-hist-header">
          <h3 class="profile-section-title" style="margin:0">Notes · toutes années</h3>
          <div class="rating-hist-meta">
            <span class="rating-hist-total">${totalRated} notée${totalRated > 1 ? "s" : ""}</span>
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
      <section class="profile-page-toolbar" data-ui-key="profile-toolbar" aria-label="Filtres du profil">
          <div class="profile-date-controls">
            <select class="filter-select profile-year-inline" aria-label="Année" ${uiAction("setProfileYear", [], { value: true })}>${yearOptions}</select>
            <select class="filter-select profile-month-inline${_profilePeriod === "month" ? "" : " is-collapsed"}" aria-label="Mois" ${_profilePeriod === "month" ? "" : 'aria-hidden="true" tabindex="-1"'} ${uiAction("setProfileMonth", [], { value: true })}>${monthOptions}</select>
          </div>
        <div class="profile-scope-toolbar">
          <div class="profile-period-switch" role="group" aria-label="Période des statistiques">
            <button type="button" class="${_profilePeriod === "year" ? "active" : ""}" ${uiAction("setProfilePeriod", ["year"])} aria-pressed="${_profilePeriod === "year"}">Annuel</button>
            <button type="button" class="${_profilePeriod === "month" ? "active" : ""}" ${uiAction("setProfilePeriod", ["month"])} aria-pressed="${_profilePeriod === "month"}">Mensuel</button>
          </div>
          <div class="profile-media-switch" role="group" aria-label="Type d’œuvre">
            ${PROFILE_MEDIA_OPTIONS.map(([value, label]) => `<button type="button" class="${_profileMedia === value ? "active" : ""}" ${uiAction("setProfileMedia", [value])} aria-pressed="${_profileMedia === value}">${label}</button>`).join("")}
          </div>
        </div>
      </section>
      <section class="profile-year-overview" data-ui-key="profile-overview">
        <div class="profile-year-header">
          <div>
            <span class="section-eyebrow">En un coup d’œil</span>
            <h2>${_profilePeriod === "month" ? "Votre mois" : "Votre année"} · ${esc(periodLabel)}</h2>
          </div>
        </div>
        <div class="profile-kpis">
          <button type="button" class="profile-kpi" ${uiAction("openProfileCollection", ["finished", _profileYear, periodMonth, _profileMedia])}>
            <span>Terminés</span>
            <strong>${profileNumberHTML("finished", scopedFinished.length)}</strong>
            <small>${scopedEntries.length} suivi${scopedEntries.length > 1 ? "s" : ""}</small>
          </button>
          <div class="profile-kpi">
            <span>Note moyenne</span>
            <strong>${scopedAverage === "—" ? "—" : profileNumberHTML("average", scopedAverage, { decimals: 1, prefix: "★ " })}</strong>
            <small>${scopedRated.length} notée${scopedRated.length > 1 ? "s" : ""}</small>
          </div>
          <div class="profile-kpi is-time">
            <span>Temps passé</span>
            <strong>${timeScoped.total ? profileNumberHTML("time", timeHours, { decimals: timeHours < 10 ? 1 : 0, suffix: " h" }) : "—"}</strong>
            <small>${timeScoped.total ? (timeHours >= 24 ? `≈ ${(timeHours / 24).toFixed(1).replace(".", ",")} jours` : "temps cumulé") : "aucune durée connue"}</small>
          </div>
          <div class="profile-kpi">
            <span>${profileRepeatLabel(_profileMedia)}</span>
            <strong>${profileNumberHTML("repeats", scopedRepeatCount)}</strong>
            <small>reprise${scopedRepeatCount > 1 ? "s" : ""} supplémentaire${scopedRepeatCount > 1 ? "s" : ""}</small>
          </div>
        </div>
        <div class="profile-chip-row">
          ${[
            ["playing", scopedPlaying.length, "En cours"],
            ["favorite", scopedFavs.length, "Coups de cœur"],
            ["wishlist", scopedWishlist.length, "Envies"],
          ].map(([key, value, label]) => `<button type="button" class="profile-chip" ${uiAction("openProfileCollection", [key, _profileYear, periodMonth, _profileMedia])}>${label}<b>${profileNumberHTML(`action-${key}`, value)}</b></button>`).join("")}
        </div>
      </section>

      <section class="profile-dashboard-card profile-time-card" data-ui-key="profile-time">
        <div class="profile-card-heading">
          <div><span class="section-eyebrow">Répartition du temps</span><h3>Où est passé votre temps</h3></div>
          <span class="section-count">${timeAll.total ? formatWatchTime(timeAll.total) : ""}</span>
        </div>
        ${timeParts.length
          ? `<div class="profile-time-stack">${timeStackHTML}</div><div class="profile-time-legend">${timeLegendHTML}</div><p class="profile-time-note">${esc(timeNote)}</p>`
          : `<div class="profile-inline-empty">Terminez des œuvres avec une durée connue pour voir où va votre temps.</div>`}
      </section>

      ${ratingsHTML}

      <section class="profile-dashboard-card profile-top-section" data-ui-key="profile-top">
        <div class="profile-card-heading">
          <div><span class="section-eyebrow">Palmarès</span><h3>Top · ${esc(periodLabel)}</h3></div>
          <span class="section-count">${topScoped.length} œuvre${topScoped.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="profile-top-track">${topHTML}</div>
        ${genresHTML ? `<div class="profile-chip-row">${genresHTML}</div>` : ""}
      </section>

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
                <input type="text" id="input-username" placeholder="Votre pseudo…" maxlength="30" value="${esc(cachedUsername)}" aria-label="Pseudo" />
                <button class="btn btn-primary btn-sm" ${uiAction("saveUsername", [], { control: true })}>Enregistrer</button>
              </div>
            </div>
          </div>
          <div class="profile-backup-panel">
            <div><strong>Copie de sécurité</strong><span id="last-backup-label">${esc(formatLastBackup())}</span></div>
            <div class="profile-backup-actions">
              <button class="btn btn-secondary btn-sm" ${uiAction("exportLibrary", [], { control: true })}>↓ Sauvegarder</button>
              <button class="btn btn-secondary btn-sm" id="backup-restore-picker" ${uiAction("chooseBackupFile")}>↑ Restaurer</button>
              <input class="sr-only" id="backup-import-input" type="file" accept=".json,application/json" ${uiAction("previewBackupRestore", [], { change: true, control: true })} />
            </div>
          </div>
          <div class="profile-account-footer">
            <span>Kulturo ${esc(CONFIG?.app?.version || "")}</span>
            <button class="btn btn-ghost btn-sm" ${uiAction("signOut")}>Se déconnecter</button>
          </div>
        </div>
      </details>
    `;
    // L'état d'attente n'appartient pas à la surface statistique indexée :
    // le retirer explicitement avant de réconcilier les blocs du Profil.
    container.querySelector(":scope > .ui-state-loading")?.remove();
    const changedBlocks = morphKeyedSurface(container, dashboardHTML);
    changedBlocks.forEach(block => {
      replayMotion(block, "profile-block-enter");
      block.addEventListener("animationend", () => block.classList.remove("profile-block-enter"), { once: true });
    });
    prepareProfileReveal(container);
    animateProfileNumbers(container);
    observeProfileReveal();
    hydrateFadeImages(container);
    syncSegmentedPills(container);
    renderGate.finish(task);
    onViewReady?.("dashboard");
  }

  async function saveUsername(button = null) {
    const val = document.getElementById("input-username")?.value?.trim();
    if (!val) { toast("Le pseudo ne peut pas être vide.", "error"); return; }
    if (button?.disabled) return;
    const owner = State.user?.id;
    if (!owner) return;
    setButtonBusy(button, true);
    try {
      await Profiles.upsert(owner, val);
      if (String(State.user?.id || "") !== String(owner)) return;
      State.username = val;
      toast("Pseudo enregistré ✓", "success");
    } catch (e) {
      if (String(State.user?.id || "") === String(owner)) toast("Erreur : " + e.message, "error");
    } finally {
      if (button?.isConnected) setButtonBusy(button, false);
    }
  }

  return {
    render: renderDashboard, setProfileYear, setProfileMonth, setProfilePeriod,
    async retry() {
      const container = document.getElementById("dashboard-content");
      if (container) container.innerHTML = profileSkeleton();
      await reloadEntries();
      await renderDashboard();
    },
    context() {
      return { year: _profileYear, month: _profileMonth, period: _profilePeriod, media: _profileMedia };
    },
    restoreContext(value = {}) {
      const year = Number.parseInt(value?.year, 10);
      const month = String(value?.month || "").padStart(2, "0");
      if (Number.isInteger(year) && year >= 1900 && year <= 2200) _profileYear = year;
      if (/^(0[1-9]|1[0-2])$/.test(month)) _profileMonth = month;
      if (["year", "month"].includes(value?.period)) _profilePeriod = value.period;
      if (PROFILE_MEDIA_OPTIONS.some(([key]) => key === value?.media)) _profileMedia = value.media;
      _profileMonthAutoResolve = false;
    },
    cancel() { renderGate.cancel(); flushProfileReveal(); },
    setProfileMedia, openProfileCollection, openRatingCollection, saveUsername,
    reset() {
      renderGate.cancel();
      flushProfileReveal();
      _profileNumberValues.clear();
      _profileYear = _profileToday.getFullYear();
      _profileMonth = String(_profileToday.getMonth() + 1).padStart(2, "0");
      _profilePeriod = "year";
      _profileMedia = "all";
      _profileMonthAutoResolve = true;
    },
  };
}
