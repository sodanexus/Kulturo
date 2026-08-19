// ============================================================
// app.js — Kulturo · Logique principale
// ============================================================

import { initSupabase, Auth, Media, computeStats, Profiles, Activity } from "./supabase.js";
import { searchMedia, apiAvailability, TMDb, TMDbDetails, IGDBDetails, OpenLibraryDetails } from "./api.js";

// ── État global ──────────────────────────────────────────────
const State = {
  user:       null,
  entries:    [],
  filters: {
    type:     "all",
    status:   "all",
    favorite: false,
    search:   "",
    sort:     "created_at",
  },
  editingId:  null,
  scrollPos:  {},          // #2 — mémorise la position de scroll par page
};

// ── Labels ───────────────────────────────────────────────────
const TYPE_LABELS  = { game:"Jeu", movie:"Film", book:"Livre" };
const TYPE_ICONS   = { game:"🎮", movie:"🎬", book:"📚" };

// Retourne "Série" si c'est une série TMDb, sinon le label par défaut
function getTypeLabel(e) {
  if (e.media_type === "movie" && e.subtype === "tv") return "Série";
  return TYPE_LABELS[e.media_type] || e.media_type;
}
const STATUS_LABELS= { wishlist:"Wishlist", playing:"En cours", finished:"Terminé", paused:"En pause", dropped:"Abandonné" };

function normalizeTitle(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR");
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

function normalizedSubtype(item) {
  return item?.media_type === "movie" || item?.subtype
    ? (item?.subtype === "tv" ? "tv" : "movie")
    : null;
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
    document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem"><b>Erreur : config.js introuvable</b><p style="font-size:.85rem;color:#a0a0b0">Vérifiez que config.js est présent dans votre dépôt GitHub.</p></div>';
    return;
  }
  try {
    if (!initSupabase()) {
      document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem;text-align:center;padding:2rem"><b>Configuration Supabase manquante</b><p style="font-size:.85rem;color:#a0a0b0">Renseignez les valeurs publiques Supabase dans config.js.</p></div>';
      return;
    }
    applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);

    const existingUser = await Auth.getUser().catch(() => null);
    if (existingUser) {
      State.user = existingUser;
      renderApp();
      await loadEntries();
      restoreNavigation();
    } else {
      renderAuthPage();
    }
    Auth.onAuthChange(async (event, user) => {
      State.user = user;
      if (event === "SIGNED_IN" && user) {
        renderApp();
        await loadEntries();
        restoreNavigation();
      } else if (event === "SIGNED_OUT") {
        State.entries = [];
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
  init();
}

// ── Thème ─────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("kulturo-theme", t);
  // btn-theme removed
}

function restoreNavigation() {
  const saved = localStorage.getItem("kulturo-nav") || "library";
  const allowed = new Set(["library", "dashboard", "upcoming", "activity"]);
  navTo(saved === "discover" ? "upcoming" : (allowed.has(saved) ? saved : "library"));
}

// ── Auth UI ───────────────────────────────────────────────────
function renderAuthPage() {
  const app = document.getElementById("app");
  app.style.cssText = "display:block";
  app.innerHTML = `
    <div id="page-auth">
      <div class="auth-card">
        <div class="logo">Kulturo</div>
        <p class="tagline">Votre journal culturel personnel</p>
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login"  onclick="UI.switchAuthTab('login')">Connexion</button>
          <button class="auth-tab"        id="tab-signup" onclick="UI.switchAuthTab('signup')">Inscription</button>
        </div>
        <form class="auth-form" id="auth-form" onsubmit="event.preventDefault(); UI.handleAuth()">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="auth-email" placeholder="vous@exemple.com" />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input type="password" id="auth-password" placeholder="••••••••" />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Se connecter</button>
        </form>
      </div>
    </div>`;
}

// ── App shell ─────────────────────────────────────────────────
function renderApp() {
  const app = document.getElementById("app");
  app.style.cssText = "";
  app.innerHTML = `
    <!-- Topbar -->
    <header id="topbar">
      <div class="topbar-logo">Kulturo<span class="topbar-tagline">Suivez votre culture</span></div>
      <div class="topbar-search-wrap">
        <span class="search-icon">${iconSearch()}</span>
        <input id="global-search" type="search" placeholder="Rechercher ou ajouter…" autocomplete="off" />
        <div id="search-quick-add" class="search-quick-add" style="display:none"></div>
      </div>
      <div id="loading-bar"><div id="loading-bar-fill"></div></div>
      <div class="topbar-right">
        <button class="topbar-filter-btn" id="btn-filter-toggle" onclick="UI.toggleFilterDrawer()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filtres
        </button>
      </div>
    </header>

    <!-- Sidebar -->
    <nav id="sidebar">
      <div class="nav-indicator" id="nav-indicator" style="opacity:0;top:0"></div>
      <div class="nav-items-group">
        <button class="nav-item active" data-nav="library" data-tooltip="Bibliothèque" onclick="UI.navTo('library')">
          <span class="nav-icon">${iconGrid()}</span>
        </button>
        <button class="nav-item" data-nav="dashboard" data-tooltip="Mon profil" onclick="UI.navTo('dashboard')">
          <span class="nav-icon">${iconChart()}</span>
        </button>
        <button class="nav-item" data-nav="activity" data-tooltip="Activité" onclick="UI.navTo('activity')">
          <span class="nav-icon">${iconActivity()}</span>
        </button>
        <button class="nav-item" data-nav="upcoming" data-tooltip="Prochaines sorties" onclick="UI.navTo('upcoming')">
          <span class="nav-icon">${iconCalendar()}</span>
        </button>
      </div>
    </nav>

    <!-- Main -->
    <main id="main">
      <!-- Page Bibliothèque -->
      <section id="page-library" class="page active">
        <div id="cards-grid"></div>

      </section>

      <!-- Page Profil / Stats -->
      <section id="page-dashboard" class="page">
        <div class="page-header">
          <div class="page-actions">
            <select class="filter-select" id="profile-year-select" onchange="UI.setProfileYear(this.value)"></select>
          </div>
        </div>
        <div id="dashboard-content"></div>
      </section>

      <!-- Page Prochaines sorties -->
      <section id="page-upcoming" class="page">
        <div class="page-header">
          <div class="page-actions">
            <button class="btn btn-primary" id="upcoming-filter-all" onclick="UI.setUpcomingType('all')">Tout</button>
            <button class="btn btn-secondary" id="upcoming-filter-movie" onclick="UI.setUpcomingType('movie')">🎬 Films</button>
            <button class="btn btn-secondary" id="upcoming-filter-tv" onclick="UI.setUpcomingType('tv')">📺 Séries</button>
            <button class="btn btn-ghost btn-sm" onclick="UI.refreshUpcoming()" title="Actualiser les sorties">↻ Actualiser</button>
          </div>
        </div>
        <p class="upcoming-intro">Films et nouvelles séries attendus en France au cours des six prochains mois.</p>
        <div id="upcoming-grid" class="upcoming-grid"></div>
      </section>

      <!-- Page Activité partagée -->
      <section id="page-activity" class="page">
        <p style="color:var(--text-3);font-size:.85rem;margin-bottom:1.5rem">Ce que tout le monde a ajouté ou terminé récemment.</p>
        <div id="activity-feed"></div>
      </section>
    </main>

    <!-- Toast container -->
    <div id="toast-container"></div>

    <!-- Modal container -->
    <div id="modal-root"></div>

    <!-- Bottom nav (mobile) -->
    <nav id="bottom-nav">
      <button class="bottom-nav-item active" data-nav="library" onclick="UI.navTo('library')" title="Bibliothèque">
        ${iconGrid()}
      </button>
      <button class="bottom-nav-item" data-nav="upcoming" onclick="UI.navTo('upcoming')" title="Prochaines sorties">
        ${iconCalendar()}
      </button>
      <button class="bottom-nav-item bottom-nav-add" onclick="UI.openAddModal()" title="Ajouter">
        ${iconPlus()}
      </button>
      <button class="bottom-nav-item" data-nav="activity" onclick="UI.navTo('activity')" title="Activité">
        ${iconActivity()}
      </button>
      <button class="bottom-nav-item" data-nav="dashboard" onclick="UI.navTo('dashboard')" title="Mon profil">
        ${iconUser()}
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
}

// ── Chargement depuis Supabase ───────────────────────────────
async function loadEntries() {
  // Show skeletons while loading
  const grid = document.getElementById("cards-grid");
  if (grid && !State.entries.length) {
    grid.innerHTML = Array(8).fill(0).map(() => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-cover"></div>
        <div class="skeleton-body">
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line xshort"></div>
        </div>
      </div>`).join("");
  }
  try {
    // Charge tout, le filtrage se fait localement dans filterEntries()
    State.entries = await Media.getAll({});
    renderCards();
    updateBadges();
  } catch (e) {
    toast("Erreur de chargement : " + e.message, "error");
  }
}

// ── Navigation unifiée ───────────────────────────────────────
function navTo(key, options = {}) {
  // ne rejoue pas l'animation si on clique exactement sur la même destination
  if (key !== "library" && (key === _currentPage || (key === "profile" && _currentPage === "dashboard"))) return;

  // #2 — sauvegarde le scroll de la page courante
  const main = document.getElementById("main");
  if (main) State.scrollPos[_currentPage] = main.scrollTop;

  // Désactive tous les nav-items
  document.querySelectorAll(".nav-item[data-nav]").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.nav-item[data-nav="${key}"]`);
  if (btn) {
    btn.classList.add("active");
    const indicator = document.getElementById("nav-indicator");
    if (indicator) {
      indicator.style.top  = btn.offsetTop + "px";
      indicator.style.opacity = "1";
    }
  }
  // Sync bottom nav
  document.querySelectorAll(".bottom-nav-item[data-nav]").forEach(b => {
    b.classList.toggle("active", b.dataset.nav === key);
  });

  // Sauvegarde la nav active
  localStorage.setItem("kulturo-nav", key);

  if (key === "dashboard") {
    showPage("dashboard");
  } else if (key === "upcoming") {
    showPage("upcoming");
  } else if (key === "activity") {
    showPage("activity");
  } else if (key === "profile") {
    showPage("dashboard");
    key = "dashboard";
  } else if (key.startsWith("type-")) {
    State.filters.type     = key.replace("type-", "");
    State.filters.status   = "all";
    State.filters.favorite = false;
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs(State.filters.type);
  } else if (key.startsWith("status-")) {
    State.filters.status   = key.replace("status-", "");
    State.filters.type     = "all";
    State.filters.favorite = false;
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs("all");
  } else if (key === "fav") {
    State.filters.favorite = true;
    State.filters.type     = "all";
    State.filters.status   = "all";
    syncFilterChips();
    if (_currentPage !== "library") showPage("library");
    renderCards();
    updateCategoryTabs("all", true);
  } else {
    // "library" → reset complet
    State.filters.type     = "all";
    State.filters.status   = "all";
    State.filters.favorite = false;
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
  State.filters.favorite = false;
  syncFilterChips();
  renderCards();
  updateCategoryTabs(type);
}

const PAGE_ORDER = ["library","dashboard","upcoming","activity"];
let _currentPage = "library";
function showPage(name) {
  const oldPage = document.getElementById(`page-${_currentPage}`);
  const newPage = document.getElementById(`page-${name}`);
  if (!newPage) return;

  const oldIdx = PAGE_ORDER.indexOf(_currentPage);
  const newIdx = PAGE_ORDER.indexOf(name);
  const dir    = newIdx >= oldIdx ? 1 : -1;

  // Cache toutes les pages explicitement
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active","slide-left","slide-right");
    p.style.animation = "";
    p.style.display   = "";
  });

  if (oldPage && oldPage !== newPage) {
    oldPage.style.animation = `pageSlideOut${dir>0?"Left":"Right"} .2s ease forwards`;
    setTimeout(() => {
      oldPage.style.animation = "";
      oldPage.style.display   = "";
    }, 220);
  }

  newPage.style.animation = `pageSlideIn${dir>0?"Right":"Left"} .28s var(--ease-spring) forwards`;
  newPage.classList.add("active");
  _currentPage = name;

  // #1 — restaure la position de scroll
  const main = document.getElementById("main");
  if (main) {
    const saved = State.scrollPos[name] || 0;
    requestAnimationFrame(() => { main.scrollTop = saved; });
  }

  if (name === "dashboard") renderDashboard();
  if (name === "upcoming")  renderUpcoming();
  if (name === "activity")  renderActivity();
}

// ── Filter bar ────────────────────────────────────────────────
function buildFilterBar() {
  // Chips statut dans le drawer
  const chipsEl = document.getElementById("filter-status-chips");
  if (chipsEl) {
    const statuses = ["all","wishlist","playing","finished","paused","dropped"];
    chipsEl.innerHTML = statuses.map(s => {
      const label = s === "all" ? "Tous" : STATUS_LABELS[s];
      return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}"
                      onclick="UI.setStatusChip('${s}')">${label}</button>`;
    }).join("");
  }
  // Met à jour le label actif sur le bouton toggle
  _updateFilterToggleLabel();
}

function _countActiveFilters() {
  let n = 0;
  if (State.filters.type !== "all") n++;
  if (State.filters.favorite) n++;
  if (State.filters.status !== "all") n++;
  if (State.filters.sort !== "created_at") n++;
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

// ── Rendu grille ──────────────────────────────────────────────
function renderCards() {
  const grid = document.getElementById("cards-grid");
  if (!grid) return;

  // Micro-animation au changement de filtre
  grid.classList.remove("filter-transition");
  requestAnimationFrame(() => grid.classList.add("filter-transition"));

  // Scroll to top
  const main = document.getElementById("main");
  if (main) main.scrollTop = 0;

  let entries = filterEntries(State.entries);

  if (!entries.length) {
    const f = State.filters;
    let emptyMsg = "Ajoutez votre premier film, jeu ou livre pour commencer.";
    let emptyBtn = `<button class="btn btn-primary" onclick="UI.openAddModal()">${iconPlus()} Ajouter</button>`;
    if (f.search)                    emptyMsg = `Aucun résultat pour "<strong>${esc(f.search)}</strong>".`;
    else if (f.favorite)             emptyMsg = "Aucun coup de cœur pour l'instant. Marquez vos préférés avec ♥.";
    else if (f.status !== "all")     emptyMsg = `Aucun média avec le statut "<strong>${STATUS_LABELS[f.status]}</strong>".`;
    else if (f.type === "game")      emptyMsg = "Aucun jeu dans votre bibliothèque.";
    else if (f.type === "movie")     emptyMsg = "Aucun film ou série dans votre bibliothèque.";
    else if (f.type === "book")      emptyMsg = "Aucun livre dans votre bibliothèque.";
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎭</div>
        <h3>Rien ici</h3>
        <p>${emptyMsg}</p>
        ${f.search || f.favorite || f.status !== "all" || f.type !== "all"
          ? `<button class="btn btn-secondary" onclick="UI.navTo('library')">Voir tout</button>`
          : emptyBtn}
      </div>`;
    return;
  }

  grid.innerHTML = entries.map((e, i) => cardHTML(e, i)).join("");
}

function filterEntries(entries) {
  let res = [...entries];
  const f = State.filters;
  if (f.type    !== "all") res = res.filter(e => e.media_type === f.type);
  if (f.status  !== "all") res = res.filter(e => e.status    === f.status);
  if (f.favorite)          res = res.filter(e => e.is_favorite);
  if (f.search)  res = res.filter(e => e.title.toLowerCase().includes(f.search.toLowerCase()));
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

// ── Helper notation 5 étoiles avec demies ─────────────────────
function ratingStars(rating) {
  if (!rating) return "<span style='color:var(--text-3);font-size:.85rem'>Non noté</span>";
  const full = Math.floor(rating / 2);
  const half = rating % 2 === 1;
  return `<span style="color:var(--accent)">${"★".repeat(full)}${half ? "½" : ""}</span>`;
}

function starsHTML(rating, is_favorite) {
  if (!rating && !is_favorite) return "";
  let starsEl = "";
  if (rating) {
    const perfect = rating === 10;
    const full    = Math.floor(rating / 2);
    const half    = rating % 2 === 1;
    starsEl = `<div class="card-stars${perfect ? " perfect" : ""}">` +
      "★".repeat(full) +
      (half ? `<span class="card-star-half">½</span>` : "") +
      `</div>`;
  }
  const heartEl = is_favorite ? `<span class="card-heart">♥</span>` : "";
  return `<div class="card-bottom">${starsEl}${heartEl}</div>`;
}

function cardHTML(e, i = 0) {
  const coverUrl = safeMediaUrl(e.cover_url);
  const coverHTML = coverUrl
    ? `<img class="card-cover" src="${esc(coverUrl)}" alt="${esc(e.title)}" loading="lazy" style="opacity:0" onload="this.style.opacity='1'" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='flex')">`
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
    <article class="${classes}" data-id="${e.id}" style="animation-delay:${Math.min(i*25,250)}ms" onclick="UI.openEditModal('${e.id}')">
      ${coverHTML}
      ${statusLabel ? `<span class="card-status-label">${statusLabel}</span>` : ""}
      ${starsHTML(e.rating, e.is_favorite)}
    </article>`;
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
let _profileYear = new Date().getFullYear();

function setProfileYear(y) {
  _profileYear = parseInt(y);
  renderDashboard();
}

async function renderDashboard() {
  const container = document.getElementById("dashboard-content");
  if (!container) return;

  // Charge le username AVANT le rendu pour éviter le flash
  let cachedUsername = "";
  if (State.user) {
    try {
      const p = await Profiles.get(State.user.id);
      cachedUsername = p?.username || "";
    } catch {}
  }

  // Section identité
  const profileTopHTML = `
    <div class="profile-identity-bar">
      <div class="profile-avatar-circle">👤</div>
      <div class="profile-identity-meta">
        <div class="profile-identity-email">${esc(State.user?.email||"")}</div>
        <div class="profile-username-row">
          <input type="text" id="input-username" placeholder="Ton pseudo…" maxlength="30"
            value="${esc(cachedUsername)}"
            aria-label="Pseudo" />
          <button class="btn btn-primary btn-sm" onclick="UI.saveUsername()">Enregistrer</button>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="UI.signOut()" title="Déconnexion" style="flex-shrink:0">↩</button>
    </div>`;

  // Populate year selector (inline dans le header Résumé)
  const all   = State.entries;
  const years = [...new Set(all
    .map(e => e.created_at ? new Date(e.created_at).getFullYear() : null)
    .filter(Boolean))].sort((a,b)=>b-a);
  if (!years.includes(_profileYear)) years.unshift(_profileYear);
  const yearOptions = years.map(y => `<option value="${y}" ${y===_profileYear?"selected":""}>${y}</option>`).join("");
  // Aussi mettre à jour le select dans la topbar si présent
  const yearSel = document.getElementById("profile-year-select");
  if (yearSel) yearSel.innerHTML = yearOptions;

  // Stats globales
  const stats = computeStats(all);
  const total = stats.total || 1;

  // Stats année sélectionnée
  const yearEntries  = all.filter(e => e.created_at && new Date(e.created_at).getFullYear() === _profileYear);
  const yearFinished = yearEntries.filter(e => e.status === "finished");
  const yearFavs     = yearEntries.filter(e => e.is_favorite);

  // Top médias de l'année (notés)
  const topYear = [...yearEntries].filter(e => e.rating).sort((a,b) => b.rating - a.rating).slice(0, 5);
  const topHTML = topYear.length
    ? topYear.map((e,i) => `
        <div class="top-row" onclick="UI.openEditModal('${e.id}')">
          <span class="top-rank">${i+1}</span>
          ${e.cover_url ? `<img src="${esc(e.cover_url)}" class="top-cover" alt="" loading="lazy">` : `<div class="top-cover top-cover-placeholder">${TYPE_ICONS[e.media_type]}</div>`}
          <span class="top-title">${esc(e.title)}</span>
          <span class="top-rating">${ratingStars(e.rating)}</span>
        </div>`).join("")
    : `<p style="color:var(--text-3);font-size:.82rem;padding:.5rem 0">Aucun média noté en ${_profileYear}.</p>`;

  const barHTML = (label, value, tot, color) => `
    <div class="bar-item">
      <div class="bar-item-label"><span>${label}</span><span>${value}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(value/tot*100)}%;background:${color}"></div></div>
    </div>`;

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
      <div class="rating-hist-col" title="${n} média${n !== 1 ? "s" : ""} · ${note}/10">
        <div class="rating-hist-count">${n || ""}</div>
        <div class="rating-hist-bar${isPeak ? " peak" : ""}" style="height:${px}px"></div>
      </div>`;
  }).join("");

  const ratingsHTML = totalRated > 0 ? `
    <div class="profile-section">
      <div class="rating-hist-header">
        <h3 class="profile-section-title" style="margin:0">Notes · toutes années</h3>
        <div class="rating-hist-meta">
          <span class="rating-hist-total">${totalRated} notés</span>
          ${avgRating ? `<span class="rating-hist-avg">moy. <strong>${avgRating}</strong>/10</span>` : ""}
        </div>
      </div>
      <div class="rating-hist">${ratingBars}</div>
      <div class="rating-hist-legend">
        <span>1★</span>
        <span>5★★★★★</span>
      </div>
    </div>` : "";

  container.innerHTML = `
    ${profileTopHTML}

    <!-- Notes en haut, juste après l'identité -->
    ${ratingsHTML}

    <!-- Résumé annuel avec sélecteur d'année intégré -->
    <div class="profile-section">
      <div class="profile-year-header">
        <span class="profile-year-label">Résumé</span>
        <select class="filter-select profile-year-inline" onchange="UI.setProfileYear(this.value)">
          ${yearOptions}
        </select>
      </div>
      <div class="stats-grid">
        <div class="stat-card accent">
          <div class="stat-value">${yearEntries.length}</div>
          <div class="stat-label">Ajoutés</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${yearFinished.length}</div>
          <div class="stat-label">Terminés</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${yearFavs.length}</div>
          <div class="stat-label">❤ Favoris</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${yearEntries.filter(e=>e.media_type==="game").length}</div>
          <div class="stat-label">🎮 Jeux</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${yearEntries.filter(e=>e.media_type==="movie").length}</div>
          <div class="stat-label">🎬 Films</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${yearEntries.filter(e=>e.media_type==="book").length}</div>
          <div class="stat-label">📚 Livres</div>
        </div>
      </div>
    </div>

    <!-- Section fusionnée : Top de l'année + Stats globales -->
    <div class="chart-card">
      <div class="merged-stats-layout">
        <!-- Colonne gauche : Top année -->
        <div class="merged-col merged-col-top">
          <h3 class="profile-section-title">Top ${_profileYear}</h3>
          <div class="top-list">${topHTML}</div>
        </div>
        <!-- Séparateur vertical -->
        <div class="merged-divider"></div>
        <!-- Colonne droite : Global -->
        <div class="merged-col merged-col-global">
          <h3 class="profile-section-title">Global · ${stats.total} médias</h3>
          <div class="bar-chart">
            ${barHTML("🎮 Jeux",   stats.byType.game,  total, "var(--game)")}
            ${barHTML("🎬 Films",  stats.byType.movie, total, "var(--movie)")}
            ${barHTML("📚 Livres", stats.byType.book,  total, "var(--book)")}
          </div>
          <div class="bar-chart" style="margin-top:.875rem">
            ${barHTML("Terminés",  stats.byStatus.finished, total, "var(--success)")}
            ${barHTML("En cours",  stats.byStatus.playing,  total, "var(--game)")}
            ${barHTML("Wishlist",  stats.byStatus.wishlist, total, "var(--text-3)")}
            ${barHTML("En pause",  stats.byStatus.paused,   total, "var(--warn)")}
            ${barHTML("Abandonnés",stats.byStatus.dropped,  total, "var(--danger)")}
          </div>
        </div>
      </div>
    </div>
  `;

}

function openModal(entry = null, prefillTitle = null) {
  const isEdit = !!entry;
  State.editingId = isEdit ? entry.id : null;

  // Mode édition : modal classique directe
  if (isEdit) {
    _openModalClassic(entry);
    return;
  }

  // Nouveau : wizard 3 étapes
  _wizardState = {
    step: 1,
    type: "movie",
    title: prefillTitle || "",
    apiSelected: null,
    rating: 0,
  };
  _currentRating = 0;
  window._apiSelected = null;
  _renderWizard();
}

let _wizardState = null;

function _renderWizard() {
  const s = _wizardState;
  const root = document.getElementById("modal-root");

  const steps = ["C\'est quoi ?", "On cherche", "Ton avis"];
  const progressHTML = steps.map((label, i) => `
    <div class="wz-step ${i + 1 === s.step ? "active" : i + 1 < s.step ? "done" : ""}">
      <div class="wz-dot">${i + 1 < s.step ? "✓" : i + 1}</div>
      <span>${label}</span>
    </div>`).join('<div class="wz-line"></div>');

  let bodyHTML = "";
  let footerHTML = "";

  if (s.step === 1) {
    bodyHTML = `
      <p class="wz-hint">Qu'est-ce que tu veux ajouter ?</p>
      <div class="wz-type-grid">
        <button type="button" class="wz-type-btn ${s.type === "movie" ? "active" : ""}" onclick="UI.wzSetType('movie')">
          <span class="wz-type-icon">🎬</span>
          <span class="wz-type-label">Film ou Série</span>
        </button>
        <button type="button" class="wz-type-btn ${s.type === "game" ? "active" : ""}" onclick="UI.wzSetType('game')">
          <span class="wz-type-icon">🎮</span>
          <span class="wz-type-label">Jeu vidéo</span>
        </button>
        <button type="button" class="wz-type-btn ${s.type === "book" ? "active" : ""}" onclick="UI.wzSetType('book')">
          <span class="wz-type-icon">📚</span>
          <span class="wz-type-label">Livre</span>
        </button>
      </div>`;
    footerHTML = `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="UI.wzNext()">C'est parti →</button>`;
  }

  else if (s.step === 2) {
    const icon = { movie: "🎬", game: "🎮", book: "📚" }[s.type];
    const label = { movie: "film ou série", game: "jeu vidéo", book: "livre" }[s.type];
    bodyHTML = `
      <p class="wz-hint">Quel ${label} tu veux ajouter ? ${icon}</p>
      <div class="api-search-wrap">
        <input type="text" id="f-api-search" placeholder="Tape le titre…" autocomplete="off" value="${esc(s.title)}" />
        <div class="api-results" id="api-results" style="display:none"></div>
      </div>
      <div id="wz-selected-preview" class="wz-selected-preview" style="display:${s.apiSelected ? "flex" : "none"}">
        ${s.apiSelected ? `
          ${s.apiSelected.cover_url ? `<img src="${esc(s.apiSelected.cover_url)}" class="wz-preview-cover" alt="">` : ""}
          <div>
            <div class="wz-preview-title">${esc(s.apiSelected.title)}</div>
            <div class="wz-preview-sub">${s.apiSelected.release_year || ""}</div>
          </div>
          <button type="button" class="wz-clear-btn" onclick="UI.wzClearSelected()">✕</button>
        ` : ""}
      </div>
      <p class="wz-skip-hint">Pas dans les résultats ? Tape juste le titre et continue.</p>`;
    footerHTML = `
      <button class="btn btn-secondary" onclick="UI.wzBack()">← Retour</button>
      <button class="btn btn-primary" onclick="UI.wzNext()">Suivant →</button>`;
  }

  else if (s.step === 3) {
    const title = s.apiSelected?.title || s.title;
    const cover = s.apiSelected?.cover_url;
    bodyHTML = `
      <div class="wz-step3-header">
        ${cover ? `<img src="${esc(cover)}" class="wz-step3-cover" alt="">` : ""}
        <div class="wz-step3-title">${esc(title)}</div>
      </div>
      <div class="form-group">
        <label>C'est où t'en es ? 👀</label>
        <div class="wz-status-grid">
          ${[
            ["finished","✅","Terminé"],
            ["playing","▶️","En cours"],
            ["wishlist","🔖","Dans ma liste"],
            ["paused","⏸️","En pause"],
            ["dropped","❌","Abandonné"],
          ].map(([val, ico, lbl]) => `
            <button type="button" class="wz-status-btn ${val === "finished" ? "active" : ""}" data-status="${val}" onclick="UI.wzSetStatus('${val}')">
              ${ico} ${lbl}
            </button>`).join("")}
        </div>
      </div>
      <div class="form-group">
        <label>Ta note <span id="rating-tooltip" class="rating-tooltip-label"></span></label>
        <div class="rating-stars" id="rating-stars"></div>
      </div>
      <div class="form-group">
        <label>Tes impressions ✍️ <span style="color:var(--text-3);font-weight:400">(optionnel)</span></label>
        <textarea id="f-notes" placeholder="Qu'est-ce que t'en as pensé ?">${esc("")}</textarea>
      </div>
      <label class="toggle-row">
        <span class="toggle-label">♥ Coup de cœur</span>
        <span class="toggle-switch">
          <input type="checkbox" id="f-favorite" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </span>
      </label>`;
    footerHTML = `
      <button class="btn btn-secondary" onclick="UI.wzBack()">← Retour</button>
      <button class="btn btn-primary" onclick="UI.saveEntry()">Ajouter ✨</button>`;
  }

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal modal-wizard" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>Ajouter à ma bibliothèque</h3>
          <button class="btn-icon" onclick="UI.closeModal()">${iconX()}</button>
        </div>
        <div class="wz-progress">${progressHTML}</div>
        <div class="modal-body wz-body">${bodyHTML}</div>
        <div class="modal-footer">${footerHTML}</div>
      </div>
    </div>`;

  if (s.step === 2) {
    const hiddenType = document.createElement("input");
    hiddenType.type = "hidden"; hiddenType.id = "f-type"; hiddenType.value = s.type;
    const hiddenTitle = document.createElement("input");
    hiddenTitle.type = "hidden"; hiddenTitle.id = "f-title"; hiddenTitle.value = s.apiSelected?.title || s.title;
    document.querySelector(".modal-body").appendChild(hiddenType);
    document.querySelector(".modal-body").appendChild(hiddenTitle);
    setupApiSearch();
    setTimeout(() => document.getElementById("f-api-search")?.focus(), 100);
  }

  if (s.step === 3) {
    // Hidden fields for saveEntry
    const body = document.querySelector(".modal-body");
    [
      ["f-type",   s.type],
      ["f-title",  s.apiSelected?.title || s.title],
      ["f-genre",  s.apiSelected?.genre || ""],
      ["f-author", s.apiSelected?.author || ""],
      ["f-cover",  s.apiSelected?.cover_url || ""],
      ["f-platform", ""],
    ].forEach(([id, val]) => {
      const el = document.createElement("input");
      el.type = "hidden"; el.id = id; el.value = val || "";
      body.appendChild(el);
    });
    // Status default
    const statusDefault = document.createElement("input");
    statusDefault.type = "hidden"; statusDefault.id = "f-status"; statusDefault.value = _wizardState._status || "finished";
    body.appendChild(statusDefault);

    buildRatingStars(0);
  }
}

function _openModalClassic(entry) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>Modifier</h3>
          <button class="btn-icon" onclick="UI.closeModal()">${iconX()}</button>
        </div>
        <div class="modal-body">
          <div class="form-group modal-search-unified">
            <div class="modal-type-tabs">
              <button type="button" class="modal-type-tab ${entry.media_type==="movie" ? "active" : ""}" data-type="movie" onclick="UI.setModalType('movie')">🎬 Film</button>
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
          <details class="advanced-details" ${entry.genre||entry.author||entry.platform||entry.cover_url ? "open" : ""}>
            <summary class="advanced-summary">Infos supplémentaires <span class="advanced-hint">genre, auteur, image…</span></summary>
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
          <div class="form-group">
            <label>Notes personnelles</label>
            <textarea id="f-notes" placeholder="Ton avis, tes impressions…">${esc(entry.notes||"")}</textarea>
          </div>
          <label class="toggle-row">
            <span class="toggle-label">♥ Coup de cœur</span>
            <span class="toggle-switch">
              <input type="checkbox" id="f-favorite" ${entry.is_favorite?"checked":""} />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger btn-sm" onclick="UI.deleteEntry('${entry.id}')">Supprimer</button>
          <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
          <button class="btn btn-primary" onclick="UI.saveEntry()">Enregistrer</button>
        </div>
      </div>
    </div>`;
  _currentRating = entry.rating || 0;
  buildRatingStars(entry.rating || 0);
  updateApiAvailLabel(entry.media_type || "movie");
  setupApiSearch();
  setTimeout(() => document.getElementById("f-api-search")?.focus(), 100);
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
          onmouseleave="UI.clearPreview()"></button>
        <button type="button" class="star-zone star-zone-full"
          onclick="UI.setRating(${full})"
          onmouseenter="UI.previewRating(${full})"
          onmouseleave="UI.clearPreview()"></button>
      </span>`;
  }).join("");

  if (current) showRatingLabel(current);

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
      const touch = e.changedTouches[0];
      const rect = wrap.getBoundingClientRect();
      const x = Math.max(0, touch.clientX - rect.left);
      const n = Math.min(10, Math.max(1, Math.ceil((x / rect.width) * 10)));
      setRating(n);
    });
  }
}

let _currentRating = 0;
function setRating(n) {
  _currentRating = n;
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
  if (el) { el.textContent = `— ${RATING_LABELS[n]}`; el.style.opacity = "1"; }
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

function setupApiSearch() {
  const input   = document.getElementById("f-api-search");
  const results = document.getElementById("api-results");
  if (!input || !results) return;
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = "none"; return; }
    timer = setTimeout(async () => {
      const type  = document.getElementById("f-type")?.value || "game";
      const items = await searchMedia(q, type);
      if (!items.length) { results.style.display = "none"; return; }
      results.style.display = "block";
      results.innerHTML = items.map((it, idx) => `
        <div class="api-result-item" onclick="UI.fillFromApi(${idx})">
          ${safeMediaUrl(it.cover_url) ? `<img class="api-result-thumb" src="${esc(safeMediaUrl(it.cover_url))}" alt="" loading="lazy">` : `<div class="api-result-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">${TYPE_ICONS[type]}</div>`}
          <div class="api-result-info">
            <div class="api-result-title">${esc(it.title)}</div>
            <div class="api-result-sub">${it.release_year||""} ${it.author||""}</div>
          </div>
        </div>`).join("");
      // Stocker temporairement
      window._apiResults = items;
    }, 350);
  });
}

function fillFromApi(idx) {
  const it = window._apiResults?.[idx];
  if (!it) return;

  // Wizard actif étape 2 : stocker et afficher preview
  if (_wizardState && _wizardState.step === 2) {
    _wizardState.apiSelected = it;
    window._apiSelected = it;
    const input = document.getElementById("f-api-search");
    if (input) input.value = it.title;
    const results = document.getElementById("api-results");
    if (results) results.style.display = "none";
    const preview = document.getElementById("wz-selected-preview");
    if (preview) {
      preview.style.display = "flex";
      preview.innerHTML =
        (it.cover_url ? `<img src="${esc(it.cover_url)}" class="wz-preview-cover" alt="">` : "") +
        `<div style="flex:1"><div class="wz-preview-title">${esc(it.title)}</div>` +
        `<div class="wz-preview-sub">${it.release_year || ""}</div></div>` +
        `<button type="button" class="wz-clear-btn" onclick="UI.wzClearSelected()">✕</button>`;
    }
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
  if (it.cover_url || it.genre) {
    const details = document.querySelector(".advanced-details");
    if (details) details.open = true;
  }
}

// ── CRUD ──────────────────────────────────────────────────────
async function saveEntry() {
  // En édition, le champ visible doit pouvoir modifier le titre sans sélection API.
  const titleHidden = document.getElementById("f-title")?.value?.trim();
  const titleSearch = document.getElementById("f-api-search")?.value?.trim();
  const title = titleSearch || titleHidden;
  if (!title) { toast("Le titre est obligatoire.", "error"); return; }

  // #7 — protection double-submit
  const saveBtn = document.querySelector(".modal-footer .btn-primary");
  if (saveBtn?.disabled) return;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "…"; }

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
    notes:         document.getElementById("f-notes")?.value?.trim() || null,
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
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = State.editingId ? "Enregistrer" : "Ajouter"; }
    toast(`"${duplicate.title}" est déjà dans votre bibliothèque.`, "info");
    return;
  }

  window._apiSelected = null;
  _currentRating = 0;

  try {
    if (State.editingId) {
      const updated = await Media.update(State.editingId, payload);
      const idx = State.entries.findIndex(e => e.id === State.editingId);
      if (idx !== -1) State.entries[idx] = updated;
    } else {
      const created = await Media.create(payload);
      State.entries.unshift(created);
    }
    const wasAdding = !State.editingId;
    const savedTitle = payload.title;
    const justFinished = payload.status === "finished";
    closeModal();
    // #13 — State.entries déjà mis à jour localement, pas besoin de refetch
    renderCards();
    updateBadges();
    toast(wasAdding ? `"${savedTitle}" ajouté ✓` : "Mis à jour ✓", "success");
    if (wasAdding) flashNewCard(savedTitle);
    if (justFinished) launchConfetti();
  } catch (e) {
    const saveBtn = document.querySelector(".modal-footer .btn-primary");
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = State.editingId ? "Enregistrer" : "Ajouter"; }
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
    // #13 — mise à jour locale uniquement
    renderCards();
    updateBadges();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

// ── Modal helpers ─────────────────────────────────────────────
function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (!overlay) { document.getElementById("modal-root").innerHTML = ""; return; }
  overlay.style.transition = "opacity .2s ease";
  overlay.style.opacity = "0";
  const modal = overlay.querySelector(".modal");
  if (modal) {
    modal.style.transition = "opacity .2s ease, transform .2s ease";
    modal.style.opacity = "0";
    modal.style.transform = "translateY(10px)";
  }
  setTimeout(() => {
    document.getElementById("modal-root").innerHTML = "";
    _currentRating = 0;
  }, 200);
}
function closeModalOnBg(e) {
  if (e.target.id === "modal-overlay") closeModal();
}

// #5 — modal de confirmation custom
function confirmDialog(title, message, confirmLabel = "Confirmer", variant = "danger") {
  return new Promise(resolve => {
    const root = document.getElementById("modal-root");
    root.insertAdjacentHTML("beforeend", `
      <div class="modal-overlay confirm-overlay" id="confirm-overlay" style="z-index:1100;background:rgba(0,0,0,.6)">
        <div class="modal confirm-modal" style="max-width:360px" role="alertdialog" aria-modal="true">
          <div class="modal-header"><h3>${esc(title)}</h3></div>
          <div class="modal-body" style="padding-top:.5rem">
            <p style="color:var(--text-2);font-size:.9rem">${esc(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="confirm-cancel">Annuler</button>
            <button class="btn btn-${variant}" id="confirm-ok">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`);
    const overlay = document.getElementById("confirm-overlay");
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    document.getElementById("confirm-ok").onclick     = () => cleanup(true);
    document.getElementById("confirm-cancel").onclick = () => cleanup(false);
    overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(false); });
    document.getElementById("confirm-ok").focus();
  });
}


// ── Filtres chip (status bar) ─────────────────────────────────
function syncFilterChips() {
  const status = State.filters.status;
  document.querySelectorAll(".filter-chip").forEach(c =>
    c.classList.toggle("active", c.textContent.trim() === (status === "all" ? "Tous" : STATUS_LABELS[status])));
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
  clearTimeout(_chipDebounce);
  _chipDebounce = setTimeout(() => renderCards(), 80);
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
  localStorage.setItem("kulturo-sort", val);
  renderCards();
}

// ── Global search ─────────────────────────────────────────────
function bindGlobalEvents() {
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
    if (e.target.id === "global-search") {
      const q = e.target.value.trim();
      State.filters.search = q;
      // Si on tape depuis une autre page, synchronise aussi toute la navigation.
      if (q.length > 0 && _currentPage !== "library") navTo("library", { preserveSearch: true });
      else if (_currentPage === "library") renderCards();
      updateQuickAdd(q);
    }
  });
  document.addEventListener("focusout", e => {
    if (e.target.id === "global-search") {
      setTimeout(() => {
        const qa = document.getElementById("search-quick-add");
        if (qa) qa.style.display = "none";
      }, 200);
    }
  });
  document.addEventListener("focusin", e => {
    if (e.target.id === "global-search" && e.target.value.trim().length > 1) {
      updateQuickAdd(e.target.value.trim());
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });


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
const iconChart   = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`;

const iconLogout  = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
const iconActivity = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const iconUser     = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;


// ── Prochaines sorties ────────────────────────────────────────
const UpcomingState = { type: "all", results: [], loading: false, loaded: false, adding: new Set() };

function formatReleaseDate(value) {
  if (!value) return "Date à confirmer";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function daysUntilRelease(value) {
  if (!value) return null;
  const today = new Date();
  const [year, month, day] = value.split("-").map(Number);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const releaseUtc = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.round((releaseUtc - todayUtc) / 86400000));
}

function isUpcomingInLibrary(it) {
  return Boolean(findMatchingEntry({ ...it, media_type: "movie" }));
}

function visibleUpcomingResults() {
  const filtered = UpcomingState.type === "all"
    ? UpcomingState.results
    : UpcomingState.results.filter(it => it.subtype === UpcomingState.type);
  return filtered.slice(0, UpcomingState.type === "all" ? 36 : 30);
}

async function renderUpcoming(force = false) {
  const grid = document.getElementById("upcoming-grid");
  if (!grid || _currentPage !== "upcoming") return;

  if (UpcomingState.loaded && !force) {
    renderUpcomingCards();
    return;
  }
  if (UpcomingState.loading) return;

  UpcomingState.loading = true;
  grid.innerHTML = `<div class="upcoming-loading"><div class="spinner"></div><span>Chargement des prochaines sorties TMDB…</span></div>`;
  loadingStart();

  try {
    UpcomingState.results = await TMDb.upcoming();
    UpcomingState.loaded = true;
    renderUpcomingCards();
  } catch (err) {
    console.error("[TMDB] Erreur prochaines sorties :", err);
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><h3>Sorties indisponibles</h3><p>Impossible de joindre TMDB pour le moment. Réessayez dans quelques instants.</p><button class="btn btn-secondary btn-sm" onclick="UI.refreshUpcoming()">Réessayer</button></div>`;
  } finally {
    UpcomingState.loading = false;
    loadingDone();
  }
}

function renderUpcomingCards() {
  const grid = document.getElementById("upcoming-grid");
  if (!grid) return;
  const results = visibleUpcomingResults();

  if (!TMDb.available()) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔑</div><h3>TMDB n'est pas configuré</h3><p>Ajoutez votre clé TMDB dans config.js pour afficher les prochaines sorties.</p></div>`;
    return;
  }
  if (!results.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><h3>Aucune sortie trouvée</h3><p>TMDB ne retourne aucune date pour ce filtre actuellement.</p></div>`;
    return;
  }

  grid.innerHTML = results.map((it, idx) => upcomingCardHTML(it, idx)).join("");
  requestAnimationFrame(() => {
    grid.querySelectorAll(".upcoming-card").forEach((card, i) => {
      card.style.animationDelay = `${Math.min(i * 40, 480)}ms`;
    });
  });
}

function upcomingCardHTML(it, idx) {
  const inLibrary = isUpcomingInLibrary(it);
  const days = daysUntilRelease(it.release_date);
  const typeLabel = it.subtype === "tv" ? "Série" : "Film";
  const typeIcon = it.subtype === "tv" ? "📺" : "🎬";
  const coverUrl = safeMediaUrl(it.cover_url);
  const cover = coverUrl
    ? `<img class="card-cover" src="${esc(coverUrl)}" alt="${esc(it.title)}" loading="lazy" style="opacity:0" onload="this.style.opacity='1'" onerror="this.style.display='none'">`
    : `<div class="card-cover-placeholder">${typeIcon}</div>`;

  return `
    <article class="media-card upcoming-card" data-upcoming-idx="${idx}" role="button" tabindex="0"
      onclick="UI.openUpcomingDetail(${idx})"
      onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();UI.openUpcomingDetail(${idx})}">
      <div class="upcoming-cover-wrap">
        ${cover}
        ${days !== null ? `<span class="release-countdown">${days === 0 ? "Aujourd'hui" : `J-${days}`}</span>` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(it.title)}</div>
        <div class="card-meta">
          <span class="badge badge-movie">${typeIcon} ${typeLabel}</span>
        </div>
        <div class="release-date">${formatReleaseDate(it.release_date)}</div>
        ${it.description ? `<div class="upcoming-desc">${esc(it.description)}</div>` : ""}
        <button class="btn ${inLibrary ? "btn-ghost" : "btn-secondary"} btn-sm upcoming-wishlist-btn" ${inLibrary ? "disabled" : ""} onclick="event.stopPropagation();UI.addUpcomingToWishlist(${idx})">
          ${inLibrary ? "✓ Dans la bibliothèque" : "+ Wishlist"}
        </button>
      </div>
    </article>`;
}

async function addUpcomingToWishlist(idx, closeAfter = false) {
  const it = visibleUpcomingResults()[idx];
  if (!it || isUpcomingInLibrary(it)) return;
  const addingKey = `${it.subtype}:${it.external_id}`;
  if (UpcomingState.adding.has(addingKey)) return;
  UpcomingState.adding.add(addingKey);
  const payload = {
    title: it.title,
    media_type: "movie",
    subtype: it.subtype,
    status: "wishlist",
    cover_url: it.cover_url || null,
    description: it.description || null,
    release_year: it.release_year || null,
    genre: null,
    author: null,
    external_id: it.external_id || null,
    source_api: "tmdb",
    is_favorite: false,
    rating: null,
    notes: null,
    platform: null,
  };

  try {
    const created = await Media.create(payload);
    State.entries.unshift(created);
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

async function openUpcomingDetail(idx) {
  const it = visibleUpcomingResults()[idx];
  if (!it) return;

  const existing = findMatchingEntry({ ...it, media_type: "movie" });
  if (existing) {
    if (!existing.release_date) existing.release_date = it.release_date;
    openDetailPanel(existing.id);
    return;
  }

  const preview = {
    ...it,
    id: `upcoming-${it.subtype}-${it.external_id}`,
    media_type: "movie",
    status: null,
    rating: null,
    is_favorite: false,
  };

  renderDetailPanel(preview, { preview: true, upcomingIdx: idx });
  requestAnimationFrame(() => _checkSynopsisOverflow(preview.id));

  try {
    const details = await TMDbDetails.fetch(preview.external_id, preview.subtype || "movie");
    if (!details) return;

    Object.entries(details).forEach(([field, value]) => {
      if (value != null && !preview[field]) preview[field] = value;
    });
    const body = document.getElementById(`detail-body-${preview.id}`);
    if (body) {
      _injectBackdrop(preview.backdrop_url, preview.id);
      body.innerHTML = renderDetailBody(preview);
      _checkSynopsisOverflow(preview.id);
    }
  } catch (err) {
    console.warn("[Detail upcoming] fetch error:", err);
  }
}

function setUpcomingType(type) {
  if (!["all", "movie", "tv"].includes(type)) return;
  UpcomingState.type = type;
  ["all", "movie", "tv"].forEach(t => {
    const btn = document.getElementById(`upcoming-filter-${t}`);
    if (btn) btn.classList.toggle("btn-primary", t === type);
    if (btn) btn.classList.toggle("btn-secondary", t !== type);
  });
  renderUpcomingCards();
}


// ── Fiche détaillée ───────────────────────────────────────────
function renderDetailPanel(e, options = {}) {
  const isPreview = options.preview === true;
  const stars = isPreview ? "" : ratingStars(e.rating);
  const backdropUrl = safeMediaUrl(e.backdrop_url);
  const coverUrl = safeMediaUrl(e.cover_url);

  const externalUrl = (() => {
    if (!e.external_id && !e.title) return null;
    if (e.media_type === "game")  return `https://store.steampowered.com/search/?term=${encodeURIComponent(e.title)}`;
    if (e.media_type === "movie") return e.external_id ? `https://www.imdb.com/find/?q=${encodeURIComponent(e.title)}` : null;
    if (e.media_type === "book")  return e.external_id ? `https://openlibrary.org/works/${e.external_id}` : `https://www.goodreads.com/search?q=${encodeURIComponent(e.title)}`;
    return null;
  })();
  const externalLabel = { game:"Steam", movie:"IMDb", book:"Goodreads" }[e.media_type] || "Lien";
  const externalIcon  = { game:"🎮", movie:"🎬", book:"📚" }[e.media_type] || "🔗";
  const externalHTML  = externalUrl
    ? `<a href="${externalUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">${externalIcon} ${externalLabel}</a>`
    : "";

  const youtubeQuery     = encodeURIComponent(`${e.title} ${e.media_type === "game" ? "trailer" : e.media_type === "movie" ? "bande annonce" : "book trailer"}`);
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;
  const youtubeHTML      = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">▶ Trailer</a>`;

  // Backdrop header
  const backdropClass = backdropUrl ? "detail-backdrop has-backdrop" : (coverUrl ? "detail-backdrop has-backdrop has-fallback" : "detail-backdrop");

  const posterHTML = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="${esc(e.title)}" class="detail-poster" onerror="this.style.display='none'">`
    : `<div class="detail-poster detail-poster-placeholder">${TYPE_ICONS[e.media_type]||"🎭"}</div>`;

  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal detail-modal" role="dialog" aria-modal="true">

        <div class="${backdropClass}">
          <div class="detail-backdrop-gradient"></div>
          <button class="detail-close-btn btn-icon" onclick="UI.closeModal()">${iconX()}</button>
          <div class="detail-backdrop-content">
            ${posterHTML}
            <div class="detail-backdrop-info">
              <h2 class="detail-title">${esc(e.title)}</h2>
              ${stars ? `<div class="detail-stars">${stars}</div>` : ""}
              <div class="detail-badges">
                <span class="badge badge-${e.media_type}">${TYPE_ICONS[e.media_type]} ${getTypeLabel(e)}</span>
                ${e.status
                  ? `<span class="badge badge-${e.status}">${STATUS_LABELS[e.status]}</span>`
                  : `<span class="badge badge-upcoming">📅 À venir</span>`}
                ${e.is_favorite ? `<span class="detail-fav">♥</span>` : ""}
              </div>
            </div>
          </div>
        </div>

        <div class="detail-body" id="detail-body-${e.id}">${renderDetailBody(e)}</div>

        <div class="modal-footer">
          ${isPreview ? `
            <div style="display:flex;gap:.5rem;margin-left:auto;flex-wrap:wrap;justify-content:flex-end">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" onclick="UI.addUpcomingToWishlistFromModal(${options.upcomingIdx})">+ Wishlist</button>
            </div>` : `
            <button class="btn btn-danger btn-icon-only" title="Supprimer" onclick="UI.deleteEntry('${e.id}')">🗑</button>
            <div style="display:flex;gap:.5rem;margin-left:auto">
              ${externalHTML}${youtubeHTML}
              <button class="btn btn-primary btn-sm" onclick="UI.openEditFromDetail('${e.id}')">✏ Modifier</button>
            </div>`}
        </div>
      </div>
    </div>`;

  const backdropEl = root.querySelector(".detail-backdrop");
  if (backdropEl && coverUrl && !backdropUrl) {
    const cssCoverUrl = coverUrl.replace(/["\\\n\r]/g, "");
    backdropEl.style.setProperty("--fallback-img", `url("${cssCoverUrl}")`);
  }
  if (backdropUrl) requestAnimationFrame(() => _injectBackdrop(backdropUrl, e.id));
}

// ── Body enrichi de la fiche détail ──────────────────────────
function renderDetailBody(e) {
  const metaRow = (label, value) => value
    ? `<div class="detail-meta-row"><span class="detail-meta-label">${label}</span><span class="detail-meta-value">${esc(String(value))}</span></div>`
    : "";

  const section = (label, html) =>
    `<div class="detail-section">
      <div class="detail-section-label">${label}</div>
      <div class="detail-section-content">${html}</div>
    </div>`;

  const chip = (txt) => `<span class="detail-chip">${esc(txt)}</span>`;

  let html = "";

  // ── Méta de base ──
  const baseMeta = [
    metaRow("Genre",    e.genre),
    metaRow("Année",    e.release_year),
    metaRow("Sortie",   e.release_date ? formatReleaseDate(e.release_date) : null),
    metaRow("Ajouté",   e.created_at ? new Date(e.created_at).toLocaleDateString("fr-FR") : null),
  ].filter(Boolean).join("");
  if (baseMeta) html += `<div class="detail-meta">${baseMeta}</div>`;

  // ── Synopsis ──
  if (e.description) {
    const synId = `syn-${e.id}`;
    html += section("Synopsis",
      `<div class="detail-synopsis-wrap" id="${synId}">
        <p class="detail-synopsis-text">${esc(e.description)}</p>
        <button class="detail-synopsis-toggle" onclick="UI.toggleSynopsis('${synId}')" style="display:none">Voir plus</button>
      </div>`
    );
  }

  // ── Films & Séries ──
  if (e.media_type === "movie") {
    const filmMeta = [
      metaRow(e.subtype === "tv" ? "Créateur" : "Réalisateur", e.directors),
      metaRow("Durée",     e.duration    ? `${e.duration} min` : null),
      metaRow("Saisons",   e.seasons_count  ? `${e.seasons_count} saison${e.seasons_count > 1 ? "s" : ""}` : null),
      metaRow("Épisodes",  e.episodes_count ? `${e.episodes_count} épisodes` : null),
      metaRow("Statut",    e.air_status),
      metaRow("Disponible sur", e.watch_providers),
    ].filter(Boolean).join("");
    if (filmMeta) html += `<div class="detail-meta">${filmMeta}</div>`;

    if (e.cast_members) {
      const cast = e.cast_members.split(",").map(n => chip(n.trim())).join("");
      html += section("Casting", `<div class="detail-chips">${cast}</div>`);
    }


  }

  // ── Jeux ──
  if (e.media_type === "game") {
    const gameMeta = [
      metaRow("Développeur", e.developer || e.author),
      metaRow("Éditeur",     e.publisher),
      metaRow("Plateforme",  e.platform),
    ].filter(Boolean).join("");
    if (gameMeta) html += `<div class="detail-meta">${gameMeta}</div>`;
  }

  // ── Livres ──
  if (e.media_type === "book") {
    const bookMeta = [
      metaRow("Auteur",   e.author),
      metaRow("Éditeur",  e.publisher),
      metaRow("Pages",    e.page_count),
      metaRow("ISBN",     e.isbn),
    ].filter(Boolean).join("");
    if (bookMeta) html += `<div class="detail-meta">${bookMeta}</div>`;
  }

  // ── Notes perso ──
  if (e.notes) {
    html += section("Notes personnelles", `<p class="detail-synopsis-text">${esc(e.notes)}</p>`);
  }

  return html || "";
}

function _checkSynopsisOverflow(entryId) {
  const wrap = document.getElementById(`syn-${entryId}`);
  if (!wrap) return;
  const p = wrap.querySelector(".detail-synopsis-text");
  const btn = wrap.querySelector(".detail-synopsis-toggle");
  if (!p || !btn) return;
  // Si le texte est tronqué (scrollHeight > clientHeight), on affiche le bouton
  if (p.scrollHeight > p.clientHeight + 2) {
    btn.style.display = "block";
  }
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
  renderDetailPanel(e);
  requestAnimationFrame(() => _checkSynopsisOverflow(e.id));

  // Si déjà enrichi, on injecte juste le backdrop sans refetch
  if (e._detailsFetched) {
    _injectBackdrop(e.backdrop_url, e.id);
    return;
  }
  if (e._detailsFetching) return;
  e._detailsFetching = true;

  try {
    let details = null;

    if (e.media_type === "movie" && e.external_id) {
      details = await TMDbDetails.fetch(e.external_id, e.subtype || "movie");
    } else if (e.media_type === "game" && e.external_id) {
      details = await IGDBDetails.fetch(e.external_id);
    } else if (e.media_type === "book" && e.external_id) {
      details = await OpenLibraryDetails.fetch(e.external_id);
    }

    if (!details) return;
    // Ne sauvegarder que les champs nouveaux (ne pas écraser ce que l'utilisateur a saisi)
    const toSave = {};
    const fields = ["backdrop_url","description","directors","cast_members","duration",
                    "seasons_count","episodes_count","air_status","watch_providers",
                    "developer","publisher","page_count","isbn","platform"];
    for (const f of fields) {
      if (details[f] != null && !e[f]) {
        e[f] = details[f];
        toSave[f] = details[f];
      }
    }
    let persisted = true;
    if (Object.keys(toSave).length) {
      try {
        await Media.update(e.id, toSave);
      } catch (error) {
        persisted = false;
        console.warn("[Detail] persistence error:", error);
        toast("Détails affichés, mais leur sauvegarde a échoué.", "error");
      }
    }
    e._detailsFetched = persisted;

    // Injecter le backdrop en fondu
    _injectBackdrop(e.backdrop_url, e.id);

    // Re-render le body enrichi (pas le backdrop — déjà géré ci-dessus)
    const body = document.getElementById(`detail-body-${e.id}`);
    if (body) {
      body.innerHTML = renderDetailBody(e);
      _checkSynopsisOverflow(e.id);
    }

  } catch(err) {
    console.warn("[Detail] fetch error:", err);
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
  const colors = ["#c8a96e","#e8c98e","#5b8dee","#e05b7f","#5bbf8d","#fff"];
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



// ── Recherche rapide + ajout depuis topbar ────────────────────
let _quickAddTimer = null;

async function updateQuickAdd(query) {
  const qa = document.getElementById("search-quick-add");
  if (!qa) return;
  if (!query || query.length < 2) { qa.style.display = "none"; return; }

  // Résultats locaux immédiats
  const localMatches = State.entries.filter(e =>
    e.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 3);

  // Affiche d'abord les résultats locaux + spinner API
  let html = "";
  if (localMatches.length) {
    html += `<div class="quick-section-label">Dans ma bibliothèque</div>`;
    html += localMatches.map(e => `
      <div class="quick-result" onclick="UI.openEditModal('${e.id}')">
        ${e.cover_url ? `<img src="${esc(e.cover_url)}" class="quick-thumb" alt="">` : `<div class="quick-thumb quick-thumb-ph">${TYPE_ICONS[e.media_type]||"🎭"}</div>`}
        <div class="quick-info">
          <div class="quick-title">${esc(e.title)}</div>
          <div class="quick-sub">${TYPE_LABELS[e.media_type]} · ${STATUS_LABELS[e.status]}</div>
        </div>
      </div>`).join("");
  }
  html += `<div class="quick-section-label">Ajouter depuis les APIs <span id="quick-api-spinner" class="quick-spinner"></span></div>
           <div id="quick-api-results"></div>`;
  qa.innerHTML = html;
  qa.style.display = "block";

  // Debounce API calls
  clearTimeout(_quickAddTimer);
  _quickAddTimer = setTimeout(() => {
    const currentQuery = query;
    let accumulated = [];

    function renderApiResults() {
      const apiResultsEl = document.getElementById("quick-api-results");
      if (!apiResultsEl) return;
      // Vérifie que la query est toujours la même
      const liveQuery = document.getElementById("global-search")?.value?.trim() || "";
      if (liveQuery !== currentQuery) return;

      window._quickApiResults = accumulated;

      if (!accumulated.length) return; // Spinner encore visible, on attend

      apiResultsEl.innerHTML = accumulated.map((r, i) => `
        <div class="quick-result quick-result-api" onclick="UI.quickAddFromResult(${i})">
          ${r.cover_url ? `<img src="${esc(r.cover_url)}" class="quick-thumb" alt="">` : `<div class="quick-thumb quick-thumb-ph">${TYPE_ICONS[r.media_type]||"🎭"}</div>`}
          <div class="quick-info">
            <div class="quick-title">${esc(r.title)}</div>
            <div class="quick-sub">${getTypeLabel(r)}${r.release_year ? " · " + r.release_year : ""}${r.author ? " · " + esc(r.author) : ""}</div>
          </div>
          <div class="quick-add-icon">${iconPlus()}</div>
        </div>`).join("") +
        `<div class="quick-add-fallback" data-manual-title="${esc(liveQuery)}" onclick="UI.quickAdd(this.dataset.manualTitle)">
          ${iconPlus()} Ajouter "<strong>${esc(liveQuery)}</strong>" manuellement
        </div>`;
    }

    let pendingCount = 3;
    function onApiDone() {
      pendingCount--;
      if (pendingCount === 0) {
        const spinnerEl = document.getElementById("quick-api-spinner");
        if (spinnerEl) spinnerEl.remove();
        // Si aucun résultat du tout après les 3 APIs
        const apiResultsEl = document.getElementById("quick-api-results");
        const liveQuery = document.getElementById("global-search")?.value?.trim() || "";
        if (apiResultsEl && !accumulated.length) {
          apiResultsEl.innerHTML = `<div class="quick-add-fallback" data-manual-title="${esc(liveQuery)}" onclick="UI.quickAdd(this.dataset.manualTitle)">
            ${iconPlus()} Ajouter "<strong>${esc(liveQuery)}</strong>" manuellement
          </div>`;
        }
      }
    }

    // Lance les 3 APIs indépendamment — chacune affiche dès qu'elle répond
    searchMedia(currentQuery, "game").then(results => {
      const liveQuery = document.getElementById("global-search")?.value?.trim() || "";
      if (liveQuery !== currentQuery) return;
      const newItems = (results || []).slice(0, 4)
        .map(r => ({ ...r, media_type: "game" }))
        .filter(r => !findMatchingEntry(r));
      accumulated = [...accumulated, ...newItems];
      renderApiResults();
    }).catch(() => {}).finally(onApiDone);

    searchMedia(currentQuery, "movie").then(results => {
      const liveQuery = document.getElementById("global-search")?.value?.trim() || "";
      if (liveQuery !== currentQuery) return;
      const newItems = (results || []).slice(0, 4)
        .map(r => ({ ...r, media_type: "movie" }))
        .filter(r => !findMatchingEntry(r));
      accumulated = [...accumulated, ...newItems];
      renderApiResults();
    }).catch(() => {}).finally(onApiDone);

    searchMedia(currentQuery, "book").then(results => {
      const liveQuery = document.getElementById("global-search")?.value?.trim() || "";
      if (liveQuery !== currentQuery) return;
      const newItems = (results || []).slice(0, 4)
        .map(r => ({ ...r, media_type: "book" }))
        .filter(r => !findMatchingEntry(r));
      accumulated = [...accumulated, ...newItems];
      renderApiResults();
    }).catch(() => {}).finally(onApiDone);

  }, 400);
}

function quickAdd(title) {
  const qa = document.getElementById("search-quick-add");
  if (qa) qa.style.display = "none";
  const searchEl = document.getElementById("global-search");
  if (searchEl) searchEl.value = "";
  State.filters.search = "";
  _currentRating = 0;
  window._apiSelected = null;
  openModal(null, title);
}

function quickAddFromResult(idx) {
  const result = window._quickApiResults?.[idx];
  if (!result) return;

  // Ferme le dropdown de recherche
  const qa = document.getElementById("search-quick-add");
  if (qa) qa.style.display = "none";
  const searchEl = document.getElementById("global-search");
  if (searchEl) searchEl.value = "";
  State.filters.search = "";

  // Ouvre le wizard directement à l'étape 3 avec tout pré-rempli
  _currentRating = 0;
  window._apiSelected = result;
  _wizardState = {
    step: 3,
    type: result.media_type || "movie",
    title: result.title,
    apiSelected: result,
    _status: "finished",
  };
  _renderWizard();
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

// ── Fil d'activité partagé ────────────────────────────────────
async function renderActivity() {
  const container = document.getElementById("activity-feed");
  if (!container) return;

  container.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;padding:2rem;color:var(--text-3)"><div class="spinner"></div><span>Chargement de l'activité…</span></div>`;

  try {
    const enriched = await Activity.getFeed(50);
    const withMe = enriched.map(e => ({ ...e, isMe: e.user_id === State.user?.id }));
    container.innerHTML = renderActivityFeed(withMe);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Erreur de chargement</h3><p>${esc(e.message)}</p></div>`;
  }
}

function renderActivityFeed(entries) {
  if (!entries.length) {
    return `<div class="empty-state"><div class="empty-icon">🎭</div><h3>Aucune activité</h3><p>Ajoutez des médias pour voir l'activité ici.</p></div>`;
  }

  // Groupe par date
  const groups = {};
  entries.forEach(e => {
    const d = new Date(e.created_at);
    const today    = new Date();
    const yesterday= new Date(); yesterday.setDate(today.getDate() - 1);
    let label;
    if (d.toDateString() === today.toDateString())     label = "Aujourd'hui";
    else if (d.toDateString() === yesterday.toDateString()) label = "Hier";
    else label = d.toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  });

  return Object.entries(groups).map(([date, items]) => `
    <div class="activity-date-group">
      <div class="activity-date-label">${date}</div>
      ${items.map(e => activityRowHTML(e)).join("")}
    </div>
  `).join("");
}

function activityRowHTML(e) {
  const icon   = TYPE_ICONS[e.media_type] || "🎭";
  const type   = getTypeLabel(e);
  const status = { wishlist:"a ajouté en wishlist", playing:"a commencé", finished:"a terminé", paused:"a mis en pause", dropped:"a abandonné" }[e.status] || "a ajouté";

  const starsHTML  = e.rating
    ? `<span class="activity-stars">${ratingStars(e.rating)}</span>`
    : "";

  const coverHTML = e.cover_url
    ? `<img src="${esc(e.cover_url)}" class="activity-cover" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="activity-cover activity-cover-ph">${icon}</div>`;

  const meLabel = e.isMe ? `<span class="activity-me-badge">moi</span>` : "";

  return `
    <div class="activity-row">
      ${coverHTML}
      <div class="activity-info">
        <div class="activity-line">
          <span class="activity-username">${esc(e.username)}${meLabel}</span>
          <span class="activity-verb">${status}</span>
        </div>
        <div class="activity-title">${icon} ${esc(e.title)}</div>
        <div class="activity-meta">
          <span class="badge badge-${e.media_type}" style="font-size:.7rem">${type}</span>
          ${starsHTML}
          ${e.is_favorite ? `<span style="color:var(--accent)">♥</span>` : ""}
        </div>
      </div>
      <div class="activity-time">${new Date(e.created_at).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" })}</div>
    </div>`;
}



window._updateFilterModalTypeChips = _updateFilterModalTypeChips;
window.UI = {
  openAddModal:    () => { _currentRating = 0; window._apiSelected = null; openModal(); },
  quickAdd,
  quickAddFromResult,
  openEditModal:   (id) => { openDetailPanel(id); },
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
  fillFromApi,
  setRating,
  previewRating,
  clearPreview,
  navTo,

  setTypeFilter,
  setStatusChip,
  toggleFilterDrawer: () => {
    const root = document.getElementById("modal-root");
    // Evite double ouverture
    if (document.getElementById("filter-modal-overlay")) return;

    const _buildModal = () => {
      const statuses = ["all","wishlist","playing","finished","paused","dropped"];
      const sorts = [["created_at","Date d'ajout"],["date_finished","Date de fin"],["rating_desc","Note ↓"],["rating_asc","Note ↑"],["title","Titre"]];
      const types = [["all","Tous"],["game","🎮 Jeux"],["movie","🎬 Films"],["book","📚 Livres"]];
      const typeChips = types.map(([v,l]) =>
        `<button class="filter-chip ${State.filters.type === v ? "active" : ""}"
          onclick="UI.setTypeFilter('${v}'); _updateFilterModalTypeChips();">${l}</button>`
      ).join("");

      const activeCount = _countActiveFilters();
      const headerLabel = activeCount > 0 ? `Filtres <span class="filter-active-count">${activeCount}</span>` : "Filtres";

      const favChip = `<button class="filter-chip ${State.filters.favorite ? "active" : ""}"
        onclick="UI.toggleFavFilter()">♥ Coups de cœur</button>`;

      const statusChips = statuses.map(s => {
        const label = s === "all" ? "Tous" : STATUS_LABELS[s];
        return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}"
          onclick="UI.setStatusChip('${s}')">${label}</button>`;
      }).join("");

      const sortChips = sorts.map(([v, l]) =>
        `<button class="filter-chip ${State.filters.sort === v ? "active" : ""}"
          onclick="UI.setSort('${v}')">${l}</button>`
      ).join("");

      const hasActive = activeCount > 0;

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
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="fm-reset-btn" style="${hasActive ? "" : "visibility:hidden"}" onclick="UI.resetFilters()">Réinitialiser</button>
              <button class="btn btn-primary" onclick="UI.applyFilters()">Appliquer</button>
            </div>
          </div>
        </div>`;
    };

    root.insertAdjacentHTML("beforeend", _buildModal());
  },


  toggleSynopsis: (id) => {
    const wrap = document.getElementById(id);
    if (!wrap) return;
    const isExpanded = wrap.classList.toggle("expanded");
    const btn = wrap.querySelector(".detail-synopsis-toggle");
    if (btn) btn.textContent = isExpanded ? "Voir moins" : "Voir plus";
  },

  applyFilters: () => {
    const count = filterEntries(State.entries || []).length;
    UI.closeFilterModal();
    setTimeout(() => toast(`${count} résultat${count > 1 ? "s" : ""}`, "info"), 220);
  },

  closeFilterModal: () => {
    const overlay = document.getElementById("filter-modal-overlay");
    if (!overlay) return;
    overlay.style.transition = "opacity .2s ease";
    overlay.style.opacity = "0";
    const modal = overlay.querySelector(".modal");
    if (modal) { modal.style.transition = "opacity .2s ease, transform .2s ease"; modal.style.opacity = "0"; modal.style.transform = "translateY(10px)"; }
    setTimeout(() => overlay.remove(), 200);
  },

  toggleFavFilter: () => {
    State.filters.favorite = !State.filters.favorite;
    renderCards(); _updateFilterToggleLabel(); _updateFilterModalHeader();
    const btn = document.querySelector("#fm-fav-chips .filter-chip");
    if (btn) btn.classList.toggle("active", State.filters.favorite);
    _updateResetBtn();
  },


  resetFilters: () => {
    State.filters.type = "all";
    State.filters.status = "all";
    State.filters.sort = "created_at";
    State.filters.favorite = false;
    renderCards(); buildFilterBar(); _updateFilterToggleLabel();
    UI.closeFilterModal();
  },
  setSort,
  setProfileYear,
  setUpcomingType,
  refreshUpcoming: () => {
    UpcomingState.loaded = false;
    UpcomingState.results = [];
    renderUpcoming(true);
  },
  addUpcomingToWishlist,
  addUpcomingToWishlistFromModal: (idx) => addUpcomingToWishlist(idx, true),
  openUpcomingDetail,
  saveUsername,
  showRatingLabel,
  hideRatingLabel,
  setModalType: (type) => {
    const hidden = document.getElementById("f-type");
    if (hidden) hidden.value = type;
    document.querySelectorAll(".modal-type-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.type === type);
    });
    updateApiAvailLabel(type);
    const q = document.getElementById("f-api-search")?.value?.trim();
    if (q && q.length >= 2) setupApiSearch._trigger?.();
  },

  // ── Wizard ───────────────────────────────────────────────
  wzSetType: (type) => {
    if (!_wizardState) return;
    _wizardState.type = type;
    document.querySelectorAll(".wz-type-btn").forEach(b => {
      b.classList.toggle("active", b.getAttribute("onclick").includes(type));
    });
  },

  wzSetStatus: (status) => {
    if (!_wizardState) return;
    _wizardState._status = status;
    document.querySelectorAll(".wz-status-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.status === status);
    });
    // Sync hidden field
    const el = document.getElementById("f-status");
    if (el) el.value = status;
  },

  wzClearSelected: () => {
    if (!_wizardState) return;
    _wizardState.apiSelected = null;
    window._apiSelected = null;
    const preview = document.getElementById("wz-selected-preview");
    if (preview) { preview.style.display = "none"; preview.innerHTML = ""; }
    const input = document.getElementById("f-api-search");
    if (input) { input.value = ""; input.focus(); }
  },

  wzNext: () => {
    if (!_wizardState) return;
    if (_wizardState.step === 1) {
      _wizardState.step = 2;
      _renderWizard();
    } else if (_wizardState.step === 2) {
      // Récupère le titre tapé ou sélectionné
      const typed = document.getElementById("f-api-search")?.value?.trim();
      if (!typed && !_wizardState.apiSelected) {
        toast("Tape au moins un titre 😊", "error"); return;
      }
      if (!_wizardState.apiSelected) _wizardState.title = typed;
      _wizardState.step = 3;
      _renderWizard();
    }
  },

  wzBack: () => {
    if (!_wizardState) return;
    if (_wizardState.step > 1) {
      _wizardState.step--;
      _renderWizard();
    }
  },
  switchAuthTab:   (tab) => {
    document.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("active", b.id === `tab-${tab}`));
    const btn = document.querySelector("#auth-form button[onclick]");
    if (btn) btn.textContent = tab === "login" ? "Se connecter" : "S'inscrire";
  },
  handleAuth: async () => {
    const email    = document.getElementById("auth-email")?.value?.trim();
    const password = document.getElementById("auth-password")?.value;
    const isSignup = document.getElementById("tab-signup")?.classList.contains("active");
    try {
      if (isSignup) await Auth.signUp(email, password);
      else          await Auth.signIn(email, password);
    } catch (e) { toast(e.message, "error"); }
  },
  signOut: async () => {
    try { await Auth.signOut(); } catch (e) { toast(e.message, "error"); }
  },
};
window.showPage = showPage;
