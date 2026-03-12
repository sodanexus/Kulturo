// ============================================================
// app.js — Kulturo · Logique principale
// ============================================================

import { initSupabase, isConfigured, Auth, Media, computeStats, getClient, Profiles, Activity } from "./supabase.js";
import { searchMedia, apiAvailability }                            from "./api.js";

// ── État global ──────────────────────────────────────────────
const State = {
  user:       null,
  entries:    [],
  demoMode:   false,
  filters: {
    type:     "all",
    status:   "all",
    favorite: false,
    search:   "",
    sort:     "created_at",
  },
  editingId:  null,
  scrollPos:  {},          // #2 — mémorise la position de scroll par page
  savedFilters: null,      // #2 — mémorise les filtres avant changement de page
};

// ── Données de démo ──────────────────────────────────────────
const DEMO_DATA = [
  { id:"d1", title:"The Last of Us Part II", media_type:"game",  status:"finished",  rating:9, is_favorite:true,  cover_url:"https://images.igdb.com/igdb/image/upload/t_cover_big/co1tmu.webp",  notes:"Difficile émotionnellement. Chef-d'œuvre.", date_finished:"2023-06-12", date_started:"2023-05-28", release_year:2020, genre:"Action/Aventure", author:"Naughty Dog", created_at:"2023-06-12" },
  { id:"d2", title:"Oppenheimer",             media_type:"movie", status:"finished",  rating:9, is_favorite:true,  cover_url:"https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", notes:"Nolan à son meilleur.", date_finished:"2023-07-22", release_year:2023, genre:"Biopic/Drame", author:"Christopher Nolan", created_at:"2023-07-22" },
  { id:"d3", title:"Shōgun (2024)",           media_type:"movie", status:"finished",  rating:8, is_favorite:false, cover_url:"https://image.tmdb.org/t/p/w500/eM6fVLlKpFB3lnMlTlRSEBlyoEI.jpg", notes:"Série magistrale.", date_finished:"2024-04-10", release_year:2024, genre:"Historique/Drame", created_at:"2024-04-10" },
  { id:"d4", title:"Elden Ring",              media_type:"game",  status:"playing",   rating:8, is_favorite:true,  cover_url:"https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.webp",  notes:"Tellement grand...", release_year:2022, genre:"RPG/Action", author:"FromSoftware", created_at:"2024-01-05" },
  { id:"d5", title:"Dune (Livre)",            media_type:"book",  status:"finished",  rating:10,is_favorite:true,  cover_url:"https://covers.openlibrary.org/b/id/8475170-M.jpg",                   notes:"Masterpiece absolu.", date_finished:"2022-03-01", release_year:1965, genre:"Science-fiction", author:"Frank Herbert", created_at:"2022-03-01" },
  { id:"d6", title:"Hollow Knight",           media_type:"game",  status:"paused",    rating:7, is_favorite:false, cover_url:"https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgi.webp",  notes:"Très beau, mais je m'y perds.", release_year:2017, genre:"Metroidvania", created_at:"2023-11-20" },
  { id:"d7", title:"Andor",                   media_type:"movie", status:"playing",   rating:null, is_favorite:false, cover_url:"https://image.tmdb.org/t/p/w500/59SVNwLfoMnZPPB6ukW6dlPxAdI.jpg", notes:"Saison 2 en cours.", release_year:2022, genre:"SF/Thriller", created_at:"2024-03-15" },
  { id:"d8", title:"La Horde du Contrevent",  media_type:"book",  status:"wishlist",  rating:null, is_favorite:false, cover_url:"https://covers.openlibrary.org/b/id/8231856-M.jpg",                  notes:"Très recommandé.", release_year:2004, genre:"Fantasy", author:"Alain Damasio", created_at:"2024-02-01" },
  { id:"d9", title:"Cyberpunk 2077",          media_type:"game",  status:"dropped",   rating:5, is_favorite:false, cover_url:"https://images.igdb.com/igdb/image/upload/t_cover_big/co4g2b.webp",  notes:"Trop buggué à la sortie.", release_year:2020, genre:"RPG/Action", created_at:"2021-01-10" },
  { id:"d10",title:"Inception",               media_type:"movie", status:"finished",  rating:9, is_favorite:true,  cover_url:"https://image.tmdb.org/t/p/w500/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg", notes:"Revu pour la 5e fois.", date_finished:"2023-09-03", release_year:2010, genre:"SF/Thriller", author:"Christopher Nolan", created_at:"2023-09-03" },
];

// ── Labels ───────────────────────────────────────────────────
const TYPE_LABELS  = { game:"Jeu", movie:"Film", book:"Livre" };
const TYPE_ICONS   = { game:"🎮", movie:"🎬", book:"📚" };

// Retourne "Série" si c'est une série TMDb, sinon le label par défaut
function getTypeLabel(e) {
  if (e.media_type === "movie" && e.subtype === "tv") return "Série";
  return TYPE_LABELS[e.media_type] || e.media_type;
}
const STATUS_LABELS= { wishlist:"Wishlist", playing:"En cours", finished:"Terminé", paused:"En pause", dropped:"Abandonné" };

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (typeof CONFIG === "undefined") {
    console.error("CONFIG non défini — vérifiez que config.js est chargé.");
    document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem"><b>Erreur : config.js introuvable</b><p style="font-size:.85rem;color:#a0a0b0">Vérifiez que config.js est présent dans votre dépôt GitHub.</p></div>';
    return;
  }
  try {
    initSupabase();
    applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);

    if (!isConfigured() || CONFIG.app.demoMode) {
      State.demoMode = true;
      State.entries  = structuredClone(DEMO_DATA);
      renderApp();
      showPage("library");
    } else {
      const existingUser = await Auth.getUser().catch(() => null);
      if (existingUser) {
        State.user = existingUser;
        renderApp();
        await loadEntries();
        showPage("library");
      } else {
        renderAuthPage();
      }
      Auth.onAuthChange((event, user) => {
        State.user = user;
        if (event === "SIGNED_IN" && user) {
          renderApp();
          loadEntries();
          showPage("library");
        } else if (event === "SIGNED_OUT") {
          renderAuthPage();
        }
      });
    }
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
  document.querySelectorAll(".btn-theme").forEach(btn => {
    btn.innerHTML = t === "dark" ? iconSun() : iconMoon();
  });
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
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
        <div class="auth-form" id="auth-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="auth-email" placeholder="vous@exemple.com" />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input type="password" id="auth-password" placeholder="••••••••" />
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="UI.handleAuth()">Se connecter</button>
        </div>
        <div class="auth-divider">ou</div>
        <button class="auth-demo-btn" onclick="UI.enterDemo()">✨ Essayer en mode démo (sans compte)</button>
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
      <div class="topbar-right"></div>
    </header>

    <!-- Sidebar -->
    <nav id="sidebar">
      <div class="nav-indicator" id="nav-indicator" style="opacity:0;top:0"></div>
      <span class="nav-section-label">Navigation</span>
      <button class="nav-item active" data-nav="library" onclick="UI.navTo('library')">
        ${iconGrid()} Bibliothèque <span class="nav-badge" id="badge-all">—</span>
      </button>
      <button class="nav-item" data-nav="dashboard" onclick="UI.navTo('dashboard')">
        ${iconChart()} Mon profil
      </button>
      <span class="nav-section-label">Catégories</span>
      <button class="nav-item" data-nav="type-game" onclick="UI.navTo('type-game')">
        🎮 Jeux <span class="nav-badge" id="badge-game">—</span>
      </button>
      <button class="nav-item" data-nav="type-movie" onclick="UI.navTo('type-movie')">
        🎬 Films <span class="nav-badge" id="badge-movie">—</span>
      </button>
      <button class="nav-item" data-nav="type-book" onclick="UI.navTo('type-book')">
        📚 Livres <span class="nav-badge" id="badge-book">—</span>
      </button>
      <span class="nav-section-label">Accès rapide</span>
      <button class="nav-item" data-nav="status-playing" onclick="UI.navTo('status-playing')">
        ▶ En cours <span class="nav-badge" id="badge-playing">—</span>
      </button>
      <button class="nav-item" data-nav="status-wishlist" onclick="UI.navTo('status-wishlist')">
        🔖 Wishlist <span class="nav-badge" id="badge-wishlist">—</span>
      </button>
      <button class="nav-item" data-nav="fav" onclick="UI.navTo('fav')">
        ♥ Coups de cœur <span class="nav-badge" id="badge-fav">—</span>
      </button>
      <button class="nav-item" data-nav="discover" onclick="UI.navTo('discover')">
        ✦ Découverte
      </button>
      <button class="nav-item" data-nav="activity" onclick="UI.navTo('activity')">
        ${iconActivity()} Activité
      </button>
    </nav>

    <!-- Main -->
    <main id="main">
      <!-- Page Bibliothèque -->
      <section id="page-library" class="page active">
        <div class="page-header">
        </div>
        <div class="filter-bar" id="filter-bar">
          <select class="filter-select" id="sort-select" onchange="UI.setSort(this.value)">
            <option value="created_at">Date d'ajout</option>
            <option value="date_finished">Date de fin</option>
            <option value="rating">Note</option>
            <option value="title">Titre</option>
          </select>
        </div>
        <div class="category-tabs" id="category-tabs">
          <button class="category-tab active" onclick="UI.setTypeFilter('all')">Tous</button>
          <button class="category-tab" onclick="UI.setTypeFilter('game')">🎮 Jeux</button>
          <button class="category-tab" onclick="UI.setTypeFilter('movie')">🎬 Films</button>
          <button class="category-tab" onclick="UI.setTypeFilter('book')">📚 Livres</button>
          <button class="category-tab" onclick="UI.navTo('fav')">♥ Favoris</button>
        </div>
        <div id="cards-grid"></div>
      </section>

      <!-- Page Profil / Stats -->
      <section id="page-dashboard" class="page">
        <div class="page-header">
          <div class="page-actions">
            <select class="filter-select" id="profile-year-select" onchange="UI.setProfileYear(this.value)"></select>
            <button class="btn btn-secondary btn-icon-only btn-theme" title="Thème" onclick="UI.toggleTheme()">${iconSun()}</button>
          </div>
        </div>
        <div id="dashboard-content"></div>
      </section>

      <!-- Page Découverte -->
      <section id="page-discover" class="page">
        <div class="page-header">
          <div class="page-actions">
            <button class="btn btn-secondary" id="discover-filter-all"   onclick="UI.setDiscoverType('all')"  >Tout</button>
            <button class="btn btn-secondary" id="discover-filter-game"  onclick="UI.setDiscoverType('game')" >🎮 Jeux</button>
            <button class="btn btn-secondary" id="discover-filter-movie" onclick="UI.setDiscoverType('movie')">🎬 Films</button>
            <button class="btn btn-secondary" id="discover-filter-book"  onclick="UI.setDiscoverType('book')" >📚 Livres</button>
            <button class="btn btn-primary"   onclick="UI.refreshDiscover()">↻ Actualiser</button>
            <button class="btn btn-ghost btn-sm" onclick="UI.clearDiscoverMemory()" title="Effacer la mémoire des suggestions">🗑 Mémoire</button>
          </div>
        </div>
        <p style="color:var(--text-3);font-size:.85rem;margin-bottom:1.5rem">Basé sur vos coups de cœur et vos meilleures notes.</p>
        <div id="discover-grid" class="discover-grid"></div>
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
      <button class="bottom-nav-item" data-nav="activity" onclick="UI.navTo('activity')" title="Activité">
        ${iconActivity()}
      </button>
      <button class="bottom-nav-item bottom-nav-add" onclick="UI.openAddModal()" title="Ajouter">
        ${iconPlus()}
      </button>
      <button class="bottom-nav-item" data-nav="discover" onclick="UI.navTo('discover')" title="Découverte">
        ${iconCompass()}
      </button>
      <button class="bottom-nav-item" data-nav="dashboard" onclick="UI.navTo('dashboard')" title="Mon profil">
        ${iconUser()}
      </button>
    </nav>
  `;

  applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);
  // Restaure le tri mémorisé
  const savedSort = localStorage.getItem("kulturo-sort");
  if (savedSort) State.filters.sort = savedSort;
  const sortEl = document.getElementById("sort-select");
  if (sortEl && savedSort) sortEl.value = savedSort;
  buildFilterBar();
  renderCards();
  updateBadges();
  // Restaure la nav active
  const savedNav = localStorage.getItem("kulturo-nav") || "library";
  navTo(savedNav);
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
function navTo(key) {
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
  } else if (key === "discover") {
    showPage("discover");
  } else if (key === "activity") {
    showPage("activity");
  } else if (key === "profile") {
    showPage("dashboard");
    key = "dashboard";
  } else if (key.startsWith("type-")) {
    // Change uniquement le type, conserve le status en cours
    State.filters.type     = key.replace("type-", "");
    State.filters.favorite = false;
    showPage("library");
    renderCards();
    updateCategoryTabs(State.filters.type);
  } else if (key.startsWith("status-")) {
    // Change uniquement le status, conserve le type en cours
    State.filters.status   = key.replace("status-", "");
    State.filters.favorite = false;
    showPage("library");
    renderCards();
  } else if (key === "fav") {
    State.filters.favorite = true;
    State.filters.type     = "all";
    State.filters.status   = "all";
    showPage("library");
    renderCards();
    updateCategoryTabs("all", true);
  } else {
    // "library" → reset complet
    State.filters.type     = "all";
    State.filters.status   = "all";
    State.filters.favorite = false;
    showPage("library");
    renderCards();
    updateCategoryTabs("all");
  }
}

// ── Filtre type depuis les category-tabs (conserve le status) ─
function setTypeFilter(type) {
  State.filters.type     = type;
  State.filters.favorite = false;
  renderCards();
  updateCategoryTabs(type);
}

const PAGE_ORDER = ["library","dashboard","discover","activity"];
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
  if (name === "discover")  renderDiscover();
  if (name === "activity")  renderActivity();
}

// ── Filter bar ────────────────────────────────────────────────
function buildFilterBar() {
  const bar = document.getElementById("filter-bar");
  if (!bar) return;
  const statuses = ["all","wishlist","playing","finished","paused","dropped"];
  const chips = statuses.map(s => {
    const label = s === "all" ? "Tous" : STATUS_LABELS[s];
    return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}"
                    onclick="UI.setStatusChip('${s}')">${label}</button>`;
  }).join("");
  // Réinjecte les chips avant le select
  const select = bar.querySelector("select");
  bar.insertAdjacentHTML("afterbegin", chips);
}

// ── Rendu grille ──────────────────────────────────────────────
function renderCards() {
  const grid = document.getElementById("cards-grid");
  if (!grid) return;

  // Micro-animation au changement de filtre
  grid.classList.remove("filter-transition");
  requestAnimationFrame(() => grid.classList.add("filter-transition"));

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
      case "rating":        return (b.rating||0) - (a.rating||0);
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
    const full  = Math.floor(rating / 2);
    const half  = rating % 2 === 1;
    starsEl = `<div class="card-stars${perfect ? " perfect" : ""}">` +
      "★".repeat(full) +
      (half ? `<span class="card-star-half">½</span>` : "") +
      `</div>`;
  }
  const heartEl = is_favorite ? `<span class="card-heart">♥</span>` : "";
  return `<div class="card-bottom">${starsEl}${heartEl}</div>`;
}

function cardHTML(e, i = 0) {
  const coverHTML = e.cover_url
    ? `<img class="card-cover" src="${e.cover_url}" alt="${esc(e.title)}" loading="lazy" onerror="this.replaceWith(makePlaceholder('${TYPE_ICONS[e.media_type]}'))">`
    : `<div class="card-cover-placeholder">${TYPE_ICONS[e.media_type]||"🎭"}</div>`;

  const isPerfect = e.rating === 10;
  const classes = ["media-card",
    e.is_favorite ? "favorite" : "",
    isPerfect      ? "perfect"  : "",
    (e.is_favorite && isPerfect) ? "both" : ""
  ].filter(Boolean).join(" ");

  return `
    <article class="${classes}" style="animation-delay:${Math.min(i*25,250)}ms" onclick="UI.openEditModal('${e.id}')">
      ${coverHTML}
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

  // #15 — charge le username AVANT le rendu pour éviter le flash
  let cachedUsername = "";
  if (!State.demoMode && State.user) {
    try {
      const p = await Profiles.get(State.user.id);
      cachedUsername = p?.username || "";
    } catch {}
  }

  // Section identité (username) en haut
  const profileTopHTML = !State.demoMode ? `
    <div class="profile-section profile-identity-bar">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:200px">
          <span style="font-size:1.5rem">👤</span>
          <div>
            <div style="font-size:.75rem;color:var(--text-3)">Connecté en tant que</div>
            <div style="font-size:.88rem;font-weight:600;color:var(--text-1)">${esc(State.user?.email||"")}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <input type="text" id="input-username" placeholder="Ton pseudo…" maxlength="30"
            value="${esc(cachedUsername)}"
            style="font-size:.85rem;padding:.35rem .65rem;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-1);width:140px" />
          <button class="btn btn-primary btn-sm" onclick="UI.saveUsername()">Enregistrer</button>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="UI.signOut()">Déconnexion</button>
      </div>
    </div>` : "";

  // Populate year selector
  const yearSel = document.getElementById("profile-year-select");
  if (yearSel) {
    const years = [...new Set(State.entries
      .map(e => e.created_at ? new Date(e.created_at).getFullYear() : null)
      .filter(Boolean))].sort((a,b)=>b-a);
    if (!years.includes(_profileYear)) years.unshift(_profileYear);
    yearSel.innerHTML = years.map(y => `<option value="${y}" ${y===_profileYear?"selected":""}>${y}</option>`).join("");
  }

  // Stats globales
  const all   = State.entries;
  const stats = computeStats(all);
  const total = stats.total || 1;

  // Stats année sélectionnée
  const yearEntries   = all.filter(e => e.created_at && new Date(e.created_at).getFullYear() === _profileYear);
  const yearFinished  = yearEntries.filter(e => e.status === "finished");
  const yearFavs      = yearEntries.filter(e => e.is_favorite);

  // Activité mensuelle (année sélectionnée)
  const monthCounts = Array(12).fill(0);
  yearEntries.forEach(e => {
    const m = new Date(e.created_at).getMonth();
    monthCounts[m]++;
  });
  const maxMonth = Math.max(...monthCounts, 1);
  const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
  const monthBars = monthCounts.map((n, i) => `
    <div class="month-col">
      <div class="month-bar-wrap">
        <div class="month-bar" style="height:${Math.round(n/maxMonth*100)}%" title="${n} ajout${n>1?"s":""}"></div>
      </div>
      <div class="month-label">${MONTHS[i]}</div>
      ${n ? `<div class="month-count">${n}</div>` : ""}
    </div>`).join("");

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
    : `<p style="color:var(--text-3);font-size:.85rem">Aucun média noté en ${_profileYear}.</p>`;

  const barHTML = (label, value, tot, color) => `
    <div class="bar-item">
      <div class="bar-item-label"><span>${label}</span><span>${value}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(value/tot*100)}%;background:${color}"></div></div>
    </div>`;

  // Temps estimé
  const TIME_EST = { game: 20, movie: 2, book: 8 };
  const finishedAll = all.filter(e => e.status === "finished");
  const totalHours = finishedAll.reduce((acc, e) => acc + (TIME_EST[e.media_type] || 5), 0);

  // Journal — médias terminés (tous temps)
  const finished = [...all]
    .filter(e => e.status === "finished")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const journalHTML = finished.length ? finished.map(e => {
    const date = e.created_at ? new Date(e.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "";
    const icon = TYPE_ICONS[e.media_type] || "🎭";
    const stars = ratingStars(e.rating);
    return `
      <div class="journal-row" onclick="UI.openEditModal('${e.id}')">
        ${e.cover_url
          ? `<img src="${esc(e.cover_url)}" class="journal-cover" alt="" loading="lazy">`
          : `<div class="journal-cover journal-cover-ph">${icon}</div>`}
        <div class="journal-info">
          <div class="journal-title">${esc(e.title)}</div>
          <div class="journal-meta">
            <span class="badge badge-${e.media_type}">${icon} ${getTypeLabel(e)}</span>
            ${e.rating ? `<span class="journal-stars">${stars}</span>` : ""}
          </div>
          ${e.notes ? `<div class="journal-notes">${esc(e.notes)}</div>` : ""}
        </div>
        <div class="journal-date">${date}</div>
      </div>`;
  }).join("") : `<p style="color:var(--text-3);font-size:.85rem;padding:.5rem 0">Aucun média terminé pour l'instant.</p>`;

  // ── Histogramme des notes ─────────────────────────────────
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
        <h3 class="profile-section-title" style="margin:0">Notes</h3>
        <div class="rating-hist-meta">
          <span class="rating-hist-total">${totalRated} notes</span>
          ${avgRating ? `<span class="rating-hist-avg">moyenne <strong>${avgRating}</strong>/10</span>` : ""}
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
    <!-- Résumé annuel -->
    <div class="profile-section">
      <h3 class="profile-section-title">✦ Résumé ${_profileYear}</h3>
      <div class="stats-grid">
        <div class="stat-card accent"><div class="stat-value">${yearEntries.length}</div><div class="stat-label">Ajoutés</div></div>
        <div class="stat-card"><div class="stat-value">${yearFinished.length}</div><div class="stat-label">Terminés</div></div>
        <div class="stat-card"><div class="stat-value">${yearFavs.length}</div><div class="stat-label">Coups de cœur</div></div>
        <div class="stat-card"><div class="stat-value">${yearEntries.filter(e=>e.media_type==="game").length}</div><div class="stat-label">🎮 Jeux</div></div>
        <div class="stat-card"><div class="stat-value">${yearEntries.filter(e=>e.media_type==="movie").length}</div><div class="stat-label">🎬 Films</div></div>
        <div class="stat-card"><div class="stat-value">${yearEntries.filter(e=>e.media_type==="book").length}</div><div class="stat-label">📚 Livres</div></div>
      </div>
    </div>

    <!-- Graphique mensuel -->
    <div class="profile-section">
      <h3 class="profile-section-title">Activité mensuelle</h3>
      <div class="month-chart">${monthBars}</div>
    </div>

    <!-- Histogramme des notes -->
    ${ratingsHTML}

    <!-- Top de l'année -->
    <div class="charts-row">
      <div class="chart-card">
        <h3>Top ${_profileYear}</h3>
        <div class="top-list">${topHTML}</div>
      </div>

      <!-- Stats globales -->
      <div class="chart-card">
        <h3>Global — ${stats.total} médias</h3>
        <div class="bar-chart">
          ${barHTML("🎮 Jeux",   stats.byType.game,  total, "var(--game)")}
          ${barHTML("🎬 Films",  stats.byType.movie, total, "var(--movie)")}
          ${barHTML("📚 Livres", stats.byType.book,  total, "var(--book)")}
        </div>
        <div class="bar-chart" style="margin-top:1rem">
          ${barHTML("Terminés",  stats.byStatus.finished, total, "var(--success)")}
          ${barHTML("En cours",  stats.byStatus.playing,  total, "var(--game)")}
          ${barHTML("Wishlist",  stats.byStatus.wishlist, total, "var(--text-3)")}
          ${barHTML("En pause",  stats.byStatus.paused,   total, "var(--warn)")}
          ${barHTML("Abandonnés",stats.byStatus.dropped,  total, "var(--danger)")}
        </div>
        <div style="margin-top:1rem;padding:.75rem;background:var(--bg-3);border-radius:var(--radius);font-size:.85rem;color:var(--text-2)">
          ⏱ Temps estimé passé : <strong style="color:var(--text-1)">${totalHours}h</strong>
          <span style="font-size:.72rem;color:var(--text-3);display:block;margin-top:.2rem">(20h/jeu · 2h/film · 8h/livre)</span>
        </div>
      </div>
    </div>

    <!-- Comparaison -->
    <div class="profile-section" id="comparison-section">
      <h3 class="profile-section-title">👥 Comparaison</h3>
      <div id="comparison-content"><div style="display:flex;align-items:center;gap:.75rem;padding:1rem 0;color:var(--text-3)"><div class="spinner"></div><span>Chargement…</span></div></div>
    </div>`;

  // Charge la comparaison en async après le rendu initial
  if (!State.demoMode) renderComparison();
  else renderComparisonDemo();
}

async function renderComparison() {
  const container = document.getElementById("comparison-content");
  if (!container) return;
  try {
    const feed = await Activity.getFeed(200);
    const myId = State.user?.id;
    const otherEntries = feed.filter(e => e.user_id !== myId);
    const myEntries    = State.entries;

    if (!otherEntries.length) {
      container.innerHTML = `<p style="color:var(--text-3);font-size:.85rem">L'autre utilisateur n'a pas encore ajouté de médias.</p>`;
      return;
    }

    container.innerHTML = buildComparisonHTML(myEntries, otherEntries);
  } catch(e) {
    container.innerHTML = `<p style="color:var(--danger);font-size:.85rem">Erreur : ${esc(e.message)}</p>`;
  }
}

function renderComparisonDemo() {
  const container = document.getElementById("comparison-content");
  if (!container) return;
  // En démo, simule un second utilisateur avec quelques entrées
  const fakeOther = DEMO_DATA.slice(0, 5).map(e => ({ ...e, user_id: "other", username: "Ami" }));
  container.innerHTML = buildComparisonHTML(State.entries, fakeOther);
}

function buildComparisonHTML(myEntries, otherEntries) {
  const otherUsername = otherEntries[0]?.username || "L'autre";

  // Index par titre normalisé
  const myMap    = {};
  myEntries.forEach(e => { myMap[e.title.toLowerCase()] = e; });
  const otherMap = {};
  otherEntries.forEach(e => { otherMap[e.title.toLowerCase()] = e; });

  // Titres en commun
  const common = Object.keys(myMap).filter(k => otherMap[k]);
  // Titres que l'autre a mais pas moi
  const onlyOther = Object.keys(otherMap).filter(k => !myMap[k]);
  // Titres que j'ai mais pas l'autre
  const onlyMe = Object.keys(myMap).filter(k => !otherMap[k] && myMap[k].status === "finished");

  const starsBar = (rating, color) => {
    if (!rating) return `<span style="color:var(--text-3);font-size:.75rem">Non noté</span>`;
    const pct = Math.round(rating / 10 * 100);
    return `
      <div style="display:flex;align-items:center;gap:.4rem">
        <div style="flex:1;height:5px;background:var(--bg-4);border-radius:99px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:99px"></div>
        </div>
        <span style="font-size:.75rem;color:var(--text-2);width:2rem">${rating}/10</span>
      </div>`;
  };

  // Section en commun
  let commonHTML = "";
  if (common.length) {
    commonHTML = `
      <div class="comparison-block">
        <div class="comparison-block-title">🤝 En commun (${common.length})</div>
        ${common.slice(0, 10).map(k => {
          const me    = myMap[k];
          const other = otherMap[k];
          const icon  = TYPE_ICONS[me.media_type] || "🎭";
          const bothFav = me.is_favorite && other.is_favorite;
          return `
            <div class="comparison-row">
              ${me.cover_url
                ? `<img src="${esc(me.cover_url)}" class="comparison-cover" alt="" loading="lazy">`
                : `<div class="comparison-cover comparison-cover-ph">${icon}</div>`}
              <div class="comparison-info">
                <div class="comparison-title">${esc(me.title)} ${bothFav ? "♥" : ""}</div>
                <div class="comparison-bars">
                  <div class="comparison-bar-row">
                    <span class="comparison-name">Moi</span>
                    ${starsBar(me.rating, "var(--accent)")}
                  </div>
                  <div class="comparison-bar-row">
                    <span class="comparison-name">${esc(otherUsername)}</span>
                    ${starsBar(other.rating, "var(--movie)")}
                  </div>
                </div>
              </div>
            </div>`;
        }).join("")}
        ${common.length > 10 ? `<p style="font-size:.78rem;color:var(--text-3);margin-top:.5rem">+ ${common.length - 10} autres en commun</p>` : ""}
      </div>`;
  }

  // Section que l'autre a terminé, pas moi
  const otherFinished = onlyOther.filter(k => otherMap[k].status === "finished").slice(0, 5);
  let otherOnlyHTML = "";
  if (otherFinished.length) {
    otherOnlyHTML = `
      <div class="comparison-block">
        <div class="comparison-block-title">👀 ${esc(otherUsername)} a terminé, pas toi</div>
        ${otherFinished.map(k => {
          const e = otherMap[k];
          const icon = TYPE_ICONS[e.media_type] || "🎭";
          const stars = e.rating ? ratingStars(e.rating) : "";
          return `
            <div class="comparison-row comparison-row-sm">
              ${e.cover_url
                ? `<img src="${esc(e.cover_url)}" class="comparison-cover" alt="" loading="lazy">`
                : `<div class="comparison-cover comparison-cover-ph">${icon}</div>`}
              <div class="comparison-info">
                <div class="comparison-title">${esc(e.title)}</div>
                <div style="font-size:.75rem;color:var(--text-3)">${getTypeLabel(e)}${stars ? " · " + stars : ""}</div>
              </div>
            </div>`;
        }).join("")}
      </div>`;
  }

  // Section que j'ai terminé, pas l'autre
  const meFinished = onlyMe.slice(0, 5);
  let meOnlyHTML = "";
  if (meFinished.length) {
    meOnlyHTML = `
      <div class="comparison-block">
        <div class="comparison-block-title">🏁 Tu as terminé, pas ${esc(otherUsername)}</div>
        ${meFinished.map(k => {
          const e = myMap[k];
          const icon = TYPE_ICONS[e.media_type] || "🎭";
          const stars = e.rating ? ratingStars(e.rating) : "";
          return `
            <div class="comparison-row comparison-row-sm">
              ${e.cover_url
                ? `<img src="${esc(e.cover_url)}" class="comparison-cover" alt="" loading="lazy">`
                : `<div class="comparison-cover comparison-cover-ph">${icon}</div>`}
              <div class="comparison-info">
                <div class="comparison-title">${esc(e.title)}</div>
                <div style="font-size:.75rem;color:var(--text-3)">${getTypeLabel(e)}${stars ? " · " + stars : ""}</div>
              </div>
            </div>`;
        }).join("")}
      </div>`;
  }

  if (!commonHTML && !otherOnlyHTML && !meOnlyHTML) {
    return `<p style="color:var(--text-3);font-size:.85rem">Pas encore assez de médias en commun.</p>`;
  }

  // ── Score de compatibilité ────────────────────────────────
  let compatScore = 0;
  let compatDetails = [];

  // Points communs en base
  const commonCount = common.length;
  if (commonCount > 0) compatScore += Math.min(commonCount * 5, 30);

  // Notes similaires sur les titres en commun
  const ratedCommon = common.filter(k => myMap[k].rating && otherMap[k].rating);
  if (ratedCommon.length) {
    const avgDiff = ratedCommon.reduce((acc, k) =>
      acc + Math.abs(myMap[k].rating - otherMap[k].rating), 0) / ratedCommon.length;
    const noteScore = Math.round(Math.max(0, 30 - avgDiff * 6));
    compatScore += noteScore;
    if (avgDiff <= 1.5) compatDetails.push("notes très proches");
    else if (avgDiff <= 3) compatDetails.push("goûts similaires");
  }

  // Favoris en commun
  const commonFavs = common.filter(k => myMap[k].is_favorite && otherMap[k].is_favorite);
  if (commonFavs.length) {
    compatScore += Math.min(commonFavs.length * 8, 24);
    compatDetails.push(`${commonFavs.length} coup${commonFavs.length > 1 ? "s" : ""} de cœur en commun`);
  }

  // Genres en commun
  const myGenres   = new Set(myEntries.flatMap(e => e.genre?.split(/[,/]/).map(g => g.trim().toLowerCase()) || []));
  const otherGenres= new Set(otherEntries.flatMap(e => e.genre?.split(/[,/]/).map(g => g.trim().toLowerCase()) || []));
  const sharedGenres = [...myGenres].filter(g => g && otherGenres.has(g));
  if (sharedGenres.length) {
    compatScore += Math.min(sharedGenres.length * 2, 16);
    compatDetails.push(`${sharedGenres.length} genre${sharedGenres.length > 1 ? "s" : ""} en commun`);
  }

  compatScore = Math.min(compatScore, 100);
  const compatEmoji = compatScore >= 80 ? "🔥" : compatScore >= 60 ? "🎯" : compatScore >= 40 ? "👍" : "🌱";
  const compatColor = compatScore >= 80 ? "var(--success)" : compatScore >= 60 ? "var(--accent)" : compatScore >= 40 ? "var(--game)" : "var(--text-3)";
  const compatLabel = compatScore >= 80 ? "Excellente compatibilité !" : compatScore >= 60 ? "Très bons goûts communs" : compatScore >= 40 ? "Quelques points communs" : "Encore peu de données";

  const compatHTML = `
    <div class="compat-card">
      <div class="compat-header">
        <span class="compat-emoji">${compatEmoji}</span>
        <div class="compat-info">
          <div class="compat-label">${compatLabel}</div>
          ${compatDetails.length ? `<div class="compat-details">${compatDetails.join(" · ")}</div>` : ""}
        </div>
        <div class="compat-score" style="color:${compatColor}">${compatScore}%</div>
      </div>
      <div class="compat-bar-track">
        <div class="compat-bar-fill" style="width:${compatScore}%;background:${compatColor}"></div>
      </div>
    </div>`;

  // ── Course du mois ────────────────────────────────────────
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  const myMonth    = myEntries.filter(e => {
    const d = new Date(e.created_at);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
  const otherMonth = otherEntries.filter(e => {
    const d = new Date(e.created_at);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;

  const totalMonth = Math.max(myMonth + otherMonth, 1);
  const myPct      = Math.round(myMonth / totalMonth * 100);
  const otherPct   = 100 - myPct;
  const leader     = myMonth > otherMonth ? "Toi" : myMonth < otherMonth ? esc(otherUsername) : null;

  const raceHTML = `
    <div class="race-card">
      <div class="race-title">🏁 Course du mois — ${MONTHS_FR[month]}</div>
      <div class="race-bar-wrap">
        <div class="race-side race-side-me">
          <span class="race-name">Moi</span>
          <span class="race-count">${myMonth}</span>
        </div>
        <div class="race-bar-track">
          <div class="race-bar-me"   style="width:${myPct}%"></div>
          <div class="race-bar-other" style="width:${otherPct}%"></div>
        </div>
        <div class="race-side race-side-other">
          <span class="race-count">${otherMonth}</span>
          <span class="race-name">${esc(otherUsername)}</span>
        </div>
      </div>
      ${leader
        ? `<div class="race-leader">${leader} mène ce mois-ci 👑</div>`
        : `<div class="race-leader">Égalité parfaite ce mois 🤝</div>`}
    </div>`;

  return `
    <div class="comparison-top">${compatHTML}${raceHTML}</div>
    <div class="comparison-grid">${commonHTML}${otherOnlyHTML}${meOnlyHTML}</div>`;
}

// ── Modal Ajout / Édition ─────────────────────────────────────
function openModal(entry = null, prefillTitle = null) {
  const isEdit = !!entry;
  State.editingId = isEdit ? entry.id : null;

  const availability = apiAvailability();

  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>${isEdit ? "Modifier" : "Ajouter un média"}</h3>
          <button class="btn-icon" onclick="UI.closeModal()">${iconX()}</button>
        </div>
        <div class="modal-body">
          <!-- Recherche API -->
          <div class="form-group">
            <label>Catégorie *</label>
            <select id="f-type" onchange="UI.onTypeChange()">
              <option value="game"  ${entry?.media_type==="game" ?"selected":""}>🎮 Jeu vidéo</option>
              <option value="movie" ${entry?.media_type==="movie"?"selected":""}>🎬 Film / Série</option>
              <option value="book"  ${entry?.media_type==="book" ?"selected":""}>📚 Livre</option>
            </select>
          </div>
          <div class="form-group" id="api-search-group">
            <label>Recherche automatique <span style="color:var(--text-3);font-weight:400" id="api-avail-label"></span></label>
            <div class="api-search-wrap">
              <input type="text" id="f-api-search" placeholder="Chercher un titre…" autocomplete="off" />
              <div class="api-results" id="api-results" style="display:none"></div>
            </div>
          </div>
          <!-- Champs -->
          <div class="form-group">
            <label>Titre *</label>
            <input type="text" id="f-title" value="${esc(entry?.title||"")}" placeholder="Titre du média" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Statut</label>
              <select id="f-status">
                ${["wishlist","playing","finished","paused","dropped"].map(s =>
                  `<option value="${s}" ${(entry?.status===s||((!entry)&&s==="finished"))?"selected":""}>${STATUS_LABELS[s]}</option>`
                ).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Note (1–10) <span id="rating-tooltip" class="rating-tooltip-label"></span></label>
              <div class="rating-stars" id="rating-stars"></div>
            </div>
          </div>
          <!-- Infos avancées (repliées) -->
          <details class="advanced-details" ${entry?.genre||entry?.author||entry?.platform||entry?.cover_url ? "open" : ""}>
            <summary class="advanced-summary">Infos supplémentaires <span class="advanced-hint">genre, auteur, image…</span></summary>
            <div class="advanced-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Genre</label>
                  <input type="text" id="f-genre" value="${esc(entry?.genre||"")}" placeholder="Ex: RPG, Thriller…" />
                </div>
                <div class="form-group">
                  <label>Auteur / Réalisateur</label>
                  <input type="text" id="f-author" value="${esc(entry?.author||"")}" placeholder="Nom" />
                </div>
              </div>
              <div class="form-group">
                <label>Plateforme</label>
                <input type="text" id="f-platform" value="${esc(entry?.platform||"")}" placeholder="PS5, PC, Switch…" />
              </div>
              <div class="form-group">
                <label>Image de couverture (URL)</label>
                <input type="url" id="f-cover" value="${esc(entry?.cover_url||"")}" placeholder="https://…" />
              </div>
            </div>
          </details>

          <div class="form-group">
            <label>Notes personnelles</label>
            <textarea id="f-notes" placeholder="Ton avis, tes impressions…">${esc(entry?.notes||"")}</textarea>
          </div>

          <!-- Toggle coup de cœur -->
          <label class="toggle-row">
            <span class="toggle-label">♥ Coup de cœur</span>
            <span class="toggle-switch">
              <input type="checkbox" id="f-favorite" ${entry?.is_favorite?"checked":""} />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </span>
          </label>
        </div>
        <div class="modal-footer">
          ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="UI.deleteEntry('${entry.id}')">Supprimer</button>` : ""}
          <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
          <button class="btn btn-primary" onclick="UI.saveEntry()">${isEdit ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </div>
    </div>`;

  // Rating stars
  buildRatingStars(entry?.rating || 0);
  // Hints API
  updateApiAvailLabel(entry?.media_type || "game");
  // API search listener
  setupApiSearch();
  // Auto-focus
  setTimeout(() => document.getElementById("f-title")?.focus(), 100);
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
    const full = (i + 1) * 2;      // 2,4,6,8,10
    const half = full - 1;         // 1,3,5,7,9
    const filledFull = current >= full;
    const filledHalf = current >= half && current < full;
    return `
      <span class="star-wrap">
        <button type="button" class="star-half ${filledHalf || filledFull ? "on" : ""}"
          onclick="UI.setRating(${half})"
          onmouseenter="UI.showRatingLabel(${half})"
          onmouseleave="UI.hideRatingLabel()"
          title="${half}/10 — ${RATING_LABELS[half]}">½</button>
        <button type="button" class="star-full ${filledFull ? "on" : ""}"
          onclick="UI.setRating(${full})"
          onmouseenter="UI.showRatingLabel(${full})"
          onmouseleave="UI.hideRatingLabel()"
          title="${full}/10 — ${RATING_LABELS[full]}">★</button>
      </span>`;
  }).join("");
  if (current) showRatingLabel(current);
}

let _currentRating = 0;
function setRating(n) {
  _currentRating = n;
  buildRatingStars(n);
  showRatingLabel(n);
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
          ${it.cover_url ? `<img class="api-result-thumb" src="${it.cover_url}" alt="" loading="lazy">` : `<div class="api-result-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">${TYPE_ICONS[type]}</div>`}
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
  const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  set("f-title",  it.title);
  set("f-cover",  it.cover_url);
  set("f-genre",  it.genre);
  set("f-author", it.author);
  set("f-platform", it.platform);
  // Stocke pour sauvegarde
  window._apiSelected = it;
  document.getElementById("api-results").style.display = "none";
  document.getElementById("f-api-search").value = "";
}

// ── CRUD ──────────────────────────────────────────────────────
async function saveEntry() {
  const title = document.getElementById("f-title")?.value?.trim();
  if (!title) { toast("Le titre est obligatoire.", "error"); return; }

  // #7 — protection double-submit
  const saveBtn = document.querySelector(".modal-footer .btn-primary");
  if (saveBtn?.disabled) return;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "…"; }

  const payload = {
    title,
    media_type:    document.getElementById("f-type")?.value,
    status:        document.getElementById("f-status")?.value,
    rating:        _currentRating || null,
    is_favorite:   document.getElementById("f-favorite")?.checked || false,
    notes:         document.getElementById("f-notes")?.value?.trim() || null,
    cover_url:     document.getElementById("f-cover")?.value?.trim() || null,
    genre:         document.getElementById("f-genre")?.value?.trim() || null,
    author:        document.getElementById("f-author")?.value?.trim() || null,
    platform:      document.getElementById("f-platform")?.value?.trim() || null,
    external_id:   window._apiSelected?.external_id || null,
    source_api:    window._apiSelected?.source_api  || "manual",
    subtype:       window._apiSelected?.subtype     || null,
  };
  window._apiSelected = null;
  _currentRating = 0;

  try {
    if (State.demoMode) {
      if (State.editingId) {
        const idx = State.entries.findIndex(e => e.id === State.editingId);
        if (idx !== -1) State.entries[idx] = { ...State.entries[idx], ...payload };
      } else {
        State.entries.unshift({ ...payload, id: "d" + Date.now(), created_at: new Date().toISOString() });
      }
    } else {
      if (State.editingId) {
        const updated = await Media.update(State.editingId, payload);
        const idx = State.entries.findIndex(e => e.id === State.editingId);
        if (idx !== -1) State.entries[idx] = updated;
      } else {
        const created = await Media.create(payload);
        State.entries.unshift(created);
      }
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
  // #5 — modal de confirmation custom
  const confirmed = await confirmDialog("Supprimer ce média ?", "Cette action est irréversible.", "Supprimer", "danger");
  if (!confirmed) return;
  try {
    if (!State.demoMode) await Media.delete(id);
    State.entries = State.entries.filter(e => e.id !== id);
    closeModal();
    // #13 — mise à jour locale uniquement
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
    if (!State.demoMode) await Media.toggleFavorite(id, entry.is_favorite);
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
  document.getElementById("modal-root").innerHTML = "";
  _currentRating = 0;
}
function closeModalOnBg(e) {
  if (e.target.id === "modal-overlay") closeModal();
}

// #5 — modal de confirmation custom
function confirmDialog(title, message, confirmLabel = "Confirmer", variant = "danger") {
  return new Promise(resolve => {
    const root = document.getElementById("modal-root");
    const prev = root.innerHTML;
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
let _chipDebounce = null;
function setStatusChip(status) {
  State.filters.status = status;
  document.querySelectorAll(".filter-chip").forEach(c =>
    c.classList.toggle("active", c.textContent.trim() === (status==="all"?"Tous":STATUS_LABELS[status])));
  // #16 — debounce pour éviter re-render sur chaque clic rapide
  clearTimeout(_chipDebounce);
  _chipDebounce = setTimeout(() => renderCards(), 80);
}
function setSort(val) {
  State.filters.sort = val;
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
      // #3 — si on tape depuis une autre page, navigue vers library
      if (q.length > 0 && _currentPage !== "library") {
        State.filters.search = q;
        showPage("library");
        renderCards();
      }
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
const iconCompass = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
const iconPlus    = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
const iconSearch  = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const iconX       = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const iconGrid    = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const iconChart   = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`;
const iconSun     = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const iconMoon    = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const iconLogout  = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
const iconActivity = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const iconUser     = () => `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;


// ── Découverte ────────────────────────────────────────────────
const DiscoverState = { type: "all", results: [], loading: false };

// Demande à Groq de suggérer des titres précis basés sur la bibliothèque
async function getGroqSuggestions(liked, types, existingTitles) {
  if (!CONFIG?.groq?.apiKey || CONFIG.groq.apiKey.includes("VOTRE_")) return null;

  const summary = liked.slice(0, 20).map(e =>
    `- ${e.title} (${e.media_type}${e.genre ? ", " + e.genre : ""}${e.rating ? ", note " + e.rating + "/10" : ""}${e.is_favorite ? ", coup de cœur" : ""})`
  ).join("\n");

  const typeFilter = types.length === 3
    ? "jeux vidéo, films/séries ET livres"
    : types.map(t => ({ game:"jeux vidéo", movie:"films/séries", book:"livres" }[t])).join(" et ");

  const prompt = `Tu es un expert en recommandations culturelles. Voici la bibliothèque d'un utilisateur (ses coups de cœur et meilleures notes) :

${summary}

Suggère exactement 12 titres de ${typeFilter} que cet utilisateur devrait découvrir, qu'il n'a pas encore dans sa liste.
Ces titres doivent correspondre précisément à ses goûts.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans markdown, sans backticks :
{"suggestions":[{"title":"...","type":"game|movie|book","reason":"..."}]}

Types valides : "game", "movie", "book". Maximum 12 suggestions.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.groq.model || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed.suggestions || null;
  } catch (err) {
    console.warn("[Groq] Erreur suggestions :", err);
    return null;
  }
}

async function renderDiscover() {
  const grid = document.getElementById("discover-grid");
  if (!grid) return;
  if (_currentPage !== "discover") return;
  if (DiscoverState.results.length) { grid.innerHTML = DiscoverState.results.map((r,i) => discoverCardHTML(r,i)).join(""); return; }
  if (DiscoverState.loading) return;
  DiscoverState.loading = true;

  grid.innerHTML = `<div class="discover-loading"><div class="spinner"></div><span>Analyse de vos goûts avec l'IA…</span></div>`;
  loadingStart();

  const liked = State.entries.filter(e => e.is_favorite || (e.rating && e.rating >= 7));
  if (!liked.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>Pas encore assez de données</h3><p>Notez des médias (7+) ou marquez des coups de cœur pour recevoir des recommandations.</p></div>`;
    DiscoverState.loading = false;
    return;
  }

  const existingTitles = new Set(State.entries.map(e => e.title.toLowerCase()));
  const types = DiscoverState.type === "all" ? ["game","movie","book"] : [DiscoverState.type];

  // Étape 1 : Groq suggère des titres précis
  const suggestions = await getGroqSuggestions(liked, types, existingTitles);

  let allResults = [];

  if (suggestions && suggestions.length) {
    // Étape 2 : Pour chaque suggestion, on cherche la fiche via l'API
    grid.innerHTML = `<div class="discover-loading"><div class="spinner"></div><span>Récupération des fiches (${suggestions.length} titres)…</span></div>`;

    await Promise.allSettled(suggestions.map(async (s) => {
      const type = types.includes(s.type) ? s.type : types[0];
      if (existingTitles.has(s.title.toLowerCase())) return;
      try {
        const items = await searchMedia(s.title, type);
        if (items.length) {
          // Prend le premier résultat, le plus pertinent
          allResults.push({ ...items[0], media_type: type, groq_reason: s.reason });
        } else {
          // Aucune fiche API trouvée — on crée une entrée minimale
          allResults.push({
            title: s.title, media_type: type, cover_url: null,
            description: s.reason, source_api: "manual", groq_reason: s.reason,
          });
        }
      } catch {}
    }));
  } else {
    // Fallback : recherche par genres/auteurs si Groq indisponible
    const genreCount = {};
    liked.forEach(e => {
      if (e.genre) e.genre.split(/[,/]/).forEach(g => {
        const k = g.trim(); if (k) genreCount[k] = (genreCount[k] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
    const topTitles = liked.slice(0,3).map(e => e.title);
    const terms = [...topTitles, ...topGenres].slice(0,4);

    await Promise.allSettled(types.flatMap(type =>
      terms.slice(0,2).map(async term => {
        try {
          const items = await searchMedia(term, type);
          items.forEach(it => {
            if (!existingTitles.has(it.title.toLowerCase()))
              allResults.push({ ...it, media_type: type });
          });
        } catch {}
      })
    ));
  }

  // Dédupliquer
  const seen = new Set();
  const unique = allResults.filter(it => {
    const k = it.title.toLowerCase();
    if (seen.has(k) || existingTitles.has(k)) return false;
    seen.add(k);
    return true;
  });

  DiscoverState.results = unique;
  DiscoverState.loading = false;
  loadingDone();

  if (!unique.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Aucun résultat</h3><p>Vérifiez vos clés API dans config.js.</p></div>`;
    return;
  }

  grid.innerHTML = unique.map((it, idx) => discoverCardHTML(it, idx)).join("");
  requestAnimationFrame(() => {
    grid.querySelectorAll(".discover-card").forEach((card, i) => {
      card.style.animationDelay = `${i * 60}ms`;
    });
  });
}

function discoverCardHTML(it, idx) {
  const cover = it.cover_url
    ? `<img class="card-cover" src="${it.cover_url}" alt="${esc(it.title)}" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-cover-placeholder">${TYPE_ICONS[it.media_type]||"🎭"}</div>`;
  return `
    <article class="media-card discover-card" data-discover-idx="${idx}">
      ${cover}
      <div class="card-body">
        <div class="card-title">${esc(it.title)}</div>
        <div class="card-meta">
          <span class="badge badge-${it.media_type}">${TYPE_ICONS[it.media_type]} ${TYPE_LABELS[it.media_type]}</span>
          ${it.release_year ? `<span style="font-size:.72rem;color:var(--text-3)">${it.release_year}</span>` : ""}
        </div>
        ${it.author ? `<div style="font-size:.75rem;color:var(--text-3);margin-top:.2rem">${esc(it.author)}</div>` : ""}
        ${it.groq_reason ? `<div class="discover-reason">✦ ${esc(it.groq_reason)}</div>` : it.description ? `<div style="font-size:.75rem;color:var(--text-2);margin-top:.35rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(it.description)}</div>` : ""}
        <div style="display:flex;gap:.4rem;margin-top:.75rem">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="UI.addToWishlist(${idx})">+ Wishlist</button>
          <button class="btn btn-ghost btn-sm" title="Pas intéressé" onclick="UI.ignoreDiscover(${idx})">✕</button>
        </div>
      </div>
    </article>`;
}

async function addToWishlist(idx) {
  const it = DiscoverState.results[idx];
  if (!it) return;
  const payload = {
    title:       it.title,
    media_type:  it.media_type,
    status:      "wishlist",
    cover_url:   it.cover_url || null,
    genre:       it.genre     || null,
    author:      it.author    || null,
    external_id: it.external_id || null,
    source_api:  it.source_api  || "manual",
    is_favorite: false,
    rating:      null,
    notes:       null,
    platform:    it.platform  || null,
  };
  try {
    if (State.demoMode) {
      State.entries.unshift({ ...payload, id: "d" + Date.now(), created_at: new Date().toISOString() });
    } else {
      const created = await Media.create(payload);
      State.entries.unshift(created);
    }
    updateBadges();
    addIgnored(it.title); // ne plus proposer ce titre
    removeDiscoverCard(idx);
    toast(`"${it.title}" ajouté à la wishlist ✓`, "success");
    flashNewCard(it.title);
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

function removeDiscoverCard(idx) {
  // #14 — retire directement du DOM, pas de re-render complet
  DiscoverState.results.splice(idx, 1);
  const grid = document.getElementById("discover-grid");
  if (!grid) return;

  if (!DiscoverState.results.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>Plus de suggestions</h3><p><button class="btn btn-secondary btn-sm" onclick="UI.clearDiscoverMemory()">Effacer la mémoire</button> pour en voir de nouvelles.</p></div>`;
    return;
  }

  // Retire la carte par son index data-attribute
  const card = grid.querySelector(`[data-discover-idx="${idx}"]`);
  if (card) {
    card.style.transition = "opacity .2s, transform .2s";
    card.style.opacity = "0";
    card.style.transform = "scale(.95)";
    setTimeout(() => {
      card.remove();
      // Réindexe les data-attributes restants
      grid.querySelectorAll("[data-discover-idx]").forEach((c, i) => c.dataset.discoverIdx = i);
    }, 200);
  } else {
    // Fallback si pas de data-attribute
    grid.innerHTML = DiscoverState.results.map((r,i) => discoverCardHTML(r,i)).join("");
  }
}

function ignoreDiscover(idx) {
  const it = DiscoverState.results[idx];
  if (!it) return;
  addIgnored(it.title);
  removeDiscoverCard(idx);
  toast(`"${it.title}" ignoré`, "info");
}

function setDiscoverType(type) {
  DiscoverState.type = type;
  // Highlight boutons
  ["all","game","movie","book"].forEach(t => {
    const btn = document.getElementById(`discover-filter-${t}`);
    if (btn) btn.classList.toggle("btn-primary", t === type);
    if (btn) btn.classList.toggle("btn-secondary", t !== type);
  });
  renderDiscover();
}


// ── Fiche détaillée ───────────────────────────────────────────
function renderDetailPanel(e, description) {
  // Utilise les constantes globales TYPE_ICONS, TYPE_LABELS, STATUS_LABELS

  const stars = ratingStars(e.rating);

  const cover = e.cover_url
    ? `<img src="${esc(e.cover_url)}" alt="${esc(e.title)}" style="width:100%;border-radius:var(--radius);object-fit:cover;max-height:320px" onerror="this.style.display='none'">`
    : `<div style="width:100%;height:180px;background:var(--bg-3);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:4rem">${TYPE_ICONS[e.media_type]||"🎭"}</div>`;

  const metaRow = (label, value) => value
    ? `<div class="detail-meta-row"><span class="detail-meta-label">${label}</span><span class="detail-meta-value">${esc(value)}</span></div>`
    : "";

  const synopsisHTML = description
    ? `<div class="detail-synopsis"><div class="detail-notes-label">Synopsis</div><p>${esc(description)}</p></div>`
    : "";

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
    ? `<a href="${externalUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">${externalIcon} Voir sur ${externalLabel}</a>`
    : "";

  const youtubeQuery  = encodeURIComponent(`${e.title} ${e.media_type === "game" ? "trailer" : e.media_type === "movie" ? "bande annonce" : "book trailer"}`);
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;
  const youtubeHTML   = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm detail-ext-link">▶ Bande-annonce</a>`;

  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" onclick="UI.closeModalOnBg(event)">
      <div class="modal detail-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:.5rem">
            <span class="badge badge-${e.media_type}">${TYPE_ICONS[e.media_type]} ${getTypeLabel(e)}</span>
            <span class="badge badge-${e.status}">${STATUS_LABELS[e.status]}</span>
            ${e.is_favorite ? `<span style="color:var(--accent);font-size:1rem">♥</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:.4rem;margin-left:auto">
            ${externalHTML}${youtubeHTML}
            <button class="btn-icon" onclick="UI.closeModal()">${iconX()}</button>
          </div>
        </div>
        <div class="detail-body">
          <div class="detail-cover">${cover}</div>
          <div class="detail-info">
            <h2 class="detail-title">${esc(e.title)}</h2>
            <div class="detail-stars">${stars}</div>
            <div class="detail-meta">
              ${metaRow("Genre", e.genre)}
              ${metaRow("Auteur", e.author)}
              ${metaRow("Plateforme", e.platform)}
              ${metaRow("Année", e.release_year)}
              ${metaRow("Ajouté le", e.created_at ? new Date(e.created_at).toLocaleDateString("fr-FR") : null)}
            </div>
            ${synopsisHTML}
            ${e.notes ? `<div class="detail-notes"><div class="detail-notes-label">Notes personnelles</div><p>${esc(e.notes)}</p></div>` : ""}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger btn-sm" onclick="UI.deleteEntry('${e.id}')">Supprimer</button>
          <button class="btn btn-secondary" onclick="UI.closeModal()">Fermer</button>
          <button class="btn btn-primary" onclick="UI.openEditFromDetail('${e.id}')">✏ Modifier</button>
        </div>
      </div>
    </div>`;
}

async function openDetailPanel(id) {
  const e = State.entries.find(x => x.id === id);
  if (!e) return;

  // Affiche la fiche immédiatement avec ce qu'on a déjà
  renderDetailPanel(e, e.description || null);

  // Si pas de description stockée, on va la chercher via l'API
  if (!e.description && e.title) {
    try {
      const items = await searchMedia(e.title, e.media_type);
      const match = items.find(it => it.title.toLowerCase() === e.title.toLowerCase()) || items[0];
      if (match?.description) {
        // Met à jour l'affichage avec le synopsis récupéré
        const synopsisEl = document.querySelector(".detail-synopsis p");
        if (synopsisEl) {
          synopsisEl.textContent = match.description;
        } else {
          // Injecte le bloc synopsis s'il n'existait pas encore
          const notesEl = document.querySelector(".detail-notes");
          const infoEl  = document.querySelector(".detail-info");
          if (infoEl) {
            const div = document.createElement("div");
            div.className = "detail-synopsis";
            div.innerHTML = `<div class="detail-notes-label">Synopsis</div><p>${esc(match.description)}</p>`;
            infoEl.insertBefore(div, notesEl || null);
          }
        }
        // Sauvegarde en base et en local
        e.description = match.description;
        if (!State.demoMode) {
          Media.update(e.id, { description: match.description }).catch(() => {});
        }
      }
    } catch {}
  }
}


// ── Animation nouvelle carte ──────────────────────────────────
function flashNewCard(title) {
  // Attend que le DOM soit mis à jour puis anime la première carte correspondante
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll(".media-card");
    for (const card of cards) {
      const t = card.querySelector(".card-title");
      if (t && t.textContent.trim().toLowerCase().includes(title.toLowerCase())) {
        card.classList.add("card-flash");
        card.addEventListener("animationend", () => card.classList.remove("card-flash"), { once: true });
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        break;
      }
    }
  });
}

// ── Mémorisation découverte ───────────────────────────────────
const DISCOVER_IGNORED_KEY = "kulturo-discover-ignored";
const DISCOVER_SEEN_KEY    = "kulturo-discover-seen";

function getIgnored() {
  try { return new Set(JSON.parse(localStorage.getItem(DISCOVER_IGNORED_KEY) || "[]")); }
  catch { return new Set(); }
}
function addIgnored(title) {
  const s = getIgnored(); s.add(title.toLowerCase());
  localStorage.setItem(DISCOVER_IGNORED_KEY, JSON.stringify([...s]));
}
function clearDiscoverMemory() {
  localStorage.removeItem(DISCOVER_IGNORED_KEY);
  localStorage.removeItem(DISCOVER_SEEN_KEY);
  DiscoverState.results = [];
  renderDiscover();
  toast("Mémoire effacée — nouvelles suggestions en cours…", "info");
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
  _quickAddTimer = setTimeout(async () => {
    const existingTitles = new Set(State.entries.map(e => e.title.toLowerCase()));
    try {
      const [games, movies, books] = await Promise.allSettled([
        searchMedia(query, "game"),
        searchMedia(query, "movie"),
        searchMedia(query, "book"),
      ]);

      const allResults = [
        ...(games.value || []).slice(0, 2).map(r => ({ ...r, media_type: "game" })),
        ...(movies.value || []).slice(0, 2).map(r => ({ ...r, media_type: "movie" })),
        ...(books.value || []).slice(0, 2).map(r => ({ ...r, media_type: "book" })),
      ].filter(r => !existingTitles.has(r.title.toLowerCase()));

      const apiResultsEl = document.getElementById("quick-api-results");
      const spinnerEl = document.getElementById("quick-api-spinner");
      if (spinnerEl) spinnerEl.remove();
      if (!apiResultsEl) return;

      const currentQuery = document.getElementById("global-search")?.value?.trim() || "";
      if (!allResults.length) {
        apiResultsEl.innerHTML = `<div class="quick-add-fallback" onclick="UI.quickAdd('${currentQuery.replace(/'/g,"\\'")}')">
          ${iconPlus()} Ajouter "<strong>${esc(currentQuery)}</strong>" manuellement
        </div>`;
        return;
      }

      const q2 = document.getElementById("global-search")?.value?.trim() || "";
      apiResultsEl.innerHTML = allResults.map((r, i) => `
        <div class="quick-result quick-result-api" onclick="UI.quickAddFromResult(${i})">
          ${r.cover_url ? `<img src="${esc(r.cover_url)}" class="quick-thumb" alt="">` : `<div class="quick-thumb quick-thumb-ph">${TYPE_ICONS[r.media_type]||"🎭"}</div>`}
          <div class="quick-info">
            <div class="quick-title">${esc(r.title)}</div>
            <div class="quick-sub">${getTypeLabel(r)}${r.release_year ? " · " + r.release_year : ""}${r.author ? " · " + esc(r.author) : ""}</div>
          </div>
          <div class="quick-add-icon">${iconPlus()}</div>
        </div>`).join("") +
        `<div class="quick-add-fallback" onclick="UI.quickAdd('${q2.replace(/'/g,"\\'")}')">
          ${iconPlus()} Ajouter "<strong>${esc(q2)}</strong>" manuellement
        </div>`;

      // Store results for onclick access
      window._quickApiResults = allResults;
    } catch {
      const spinnerEl = document.getElementById("quick-api-spinner");
      if (spinnerEl) spinnerEl.remove();
    }
  }, 400);
}

function quickAdd(title) {
  const qa = document.getElementById("search-quick-add");
  if (qa) qa.style.display = "none";
  const searchEl = document.getElementById("global-search");
  if (searchEl) searchEl.value = "";
  _currentRating = 0;
  window._apiSelected = null;
  openModal(null, title);
}

function quickAddFromResult(idx) {
  const result = window._quickApiResults?.[idx];
  if (!result) return;
  const qa = document.getElementById("search-quick-add");
  if (qa) qa.style.display = "none";
  const searchEl = document.getElementById("global-search");
  if (searchEl) searchEl.value = "";
  _currentRating = result.rating || 0;
  window._apiSelected = result;
  // Sélectionne le bon type avant d'ouvrir
  openModal(null, result.title);
  // Pré-remplit les champs après que le modal soit dans le DOM
  requestAnimationFrame(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    // Set type first (triggers API label update)
    const typeEl = document.getElementById("f-type");
    if (typeEl && result.media_type) {
      typeEl.value = result.media_type;
      updateApiAvailLabel(result.media_type);
    }
    set("f-title",    result.title);
    set("f-cover",    result.cover_url);
    set("f-genre",    result.genre);
    set("f-author",   result.author);
    set("f-platform", result.platform);
    // Ouvre les détails avancés si on a des infos
    if (result.cover_url || result.genre || result.author) {
      const details = document.querySelector(".advanced-details");
      if (details) details.open = true;
    }
    // Note
    if (result.rating) buildRatingStars(result.rating);
  });
}


// ── Category tabs mobile ─────────────────────────────────────
function updateCategoryTabs(type, isFav = false) {
  const tabs = document.querySelectorAll(".category-tab");
  const map = ["all", "game", "movie", "book", "fav"];
  tabs.forEach((tab, i) => tab.classList.toggle("active", isFav ? map[i] === "fav" : map[i] === type));
}

// ── Vue grille / liste ────────────────────────────────────────
// ── Taille des cartes (small / medium) ───────────────────────


async function saveUsername() {
  const val = document.getElementById("input-username")?.value?.trim();
  if (!val) { toast("Le pseudo ne peut pas être vide.", "error"); return; }
  if (State.demoMode) { toast("Indisponible en mode démo", "info"); return; }
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

  if (State.demoMode) {
    container.innerHTML = renderActivityFeed(
      DEMO_DATA.map(e => ({ ...e, username: "DémoUser", isMe: true }))
    );
    return;
  }

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



window.UI = {
  openAddModal:    () => { _currentRating = 0; window._apiSelected = null; openModal(); },
  quickAdd,
  quickAddFromResult,
  openEditModal:   (id) => { openDetailPanel(id); },
  closeModal,
  openEditFromDetail: (id) => { const e = State.entries.find(x => x.id === id); _currentRating = e?.rating||0; window._apiSelected = null; closeModal(); openModal(e); },
  closeModalOnBg,
  saveEntry,
  deleteEntry,
  toggleFav,
  fillFromApi,
  setRating,
  navTo,
  setTypeFilter,
  setStatusChip,
  setSort,
  setProfileYear,
  setDiscoverType,
  refreshDiscover: () => { DiscoverState.results = []; renderDiscover(); },
  ignoreDiscover,
  clearDiscoverMemory,
  addToWishlist,
  toggleTheme,
  saveUsername,
  showRatingLabel,
  hideRatingLabel,
  onTypeChange:    () => { const t = document.getElementById("f-type")?.value; updateApiAvailLabel(t); },
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
  enterDemo: () => {
    State.demoMode = true;
    State.entries  = structuredClone(DEMO_DATA);
    renderApp();
    showPage("library");
    toast("Mode démo activé — données non sauvegardées", "info");
  },
  signOut: async () => {
    try { await Auth.signOut(); } catch (e) { toast(e.message, "error"); }
  },
};
window.showPage = showPage;
