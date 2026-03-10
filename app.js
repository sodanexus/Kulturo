// ============================================================
// app.js — Kulturo · Logique principale
// ============================================================

import { initSupabase, isConfigured, Auth, Media, computeStats } from "./supabase.js";
import { searchMedia, apiAvailability }                            from "./api.js";

// ── État global ──────────────────────────────────────────────
const State = {
  user:       null,
  entries:    [],          // tableau local (cache)
  demoMode:   false,       // true = pas de Supabase
  filters: {
    type:     "all",
    status:   "all",
    favorite: false,
    search:   "",
    sort:     "created_at",
  },
  editingId:  null,        // null = création, sinon UUID
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
const STATUS_LABELS= { wishlist:"Wishlist", playing:"En cours", finished:"Terminé", paused:"En pause", dropped:"Abandonné" };

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (typeof CONFIG === "undefined") {
    console.error("CONFIG non défini — vérifiez que config.js est chargé.");
    document.getElementById("app").innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e05b5b;font-family:sans-serif;flex-direction:column;gap:1rem"><b>Erreur : config.js introuvable</b><p style="font-size:.85rem;color:#a0a0b0">Vérifiez que config.js est présent dans votre dépôt GitHub.</p></div>';
    return;
  }
  initSupabase();
  applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);

  if (!isConfigured() || CONFIG.app.demoMode) {
    State.demoMode = true;
    State.entries  = structuredClone(DEMO_DATA);
    renderApp();
    showPage("library");
  } else {
    // Vérifie d'abord si une session existe déjà (cas du refresh)
    const existingUser = await Auth.getUser().catch(() => null);
    if (existingUser) {
      State.user = existingUser;
      renderApp();
      await loadEntries();
      showPage("library");
    } else {
      renderAuthPage();
    }
    // Écoute les changements d'auth (login/logout)
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
  const btn = document.getElementById("btn-theme");
  if (btn) btn.innerHTML = t === "dark" ? iconSun() : iconMoon();
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
      <div class="topbar-logo">Kulturo</div>
      <div class="topbar-search-wrap">
        <span class="search-icon">${iconSearch()}</span>
        <input id="global-search" type="search" placeholder="Rechercher…" autocomplete="off" />
      </div>
      <div class="topbar-right">
        <button class="btn-icon" id="btn-theme" title="Thème" onclick="UI.toggleTheme()">${iconSun()}</button>
        ${!State.demoMode ? `<button class="btn-icon" title="Déconnexion" onclick="UI.signOut()">${iconLogout()}</button>` : ""}
      </div>
    </header>

    <!-- Sidebar -->
    <nav id="sidebar">
      <span class="nav-section-label">Navigation</span>
      <button class="nav-item active" data-nav="library" onclick="UI.navTo('library')">
        ${iconGrid()} Bibliothèque <span class="nav-badge" id="badge-all">—</span>
      </button>
      <button class="nav-item" data-nav="dashboard" onclick="UI.navTo('dashboard')">
        ${iconChart()} Statistiques
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
    </nav>

    <!-- Main -->
    <main id="main">
      <!-- Page Bibliothèque -->
      <section id="page-library" class="page active">
        <div class="page-header">
          <h2>Bibliothèque</h2>
          <div class="page-actions">
            <button class="btn btn-secondary btn-icon-only" id="btn-view-toggle" title="Changer la vue" onclick="UI.toggleView()">⊞</button>
            <button class="btn btn-primary" onclick="UI.openAddModal()">${iconPlus()} Ajouter</button>
          </div>
        </div>
        <div class="filter-bar" id="filter-bar">
          <select class="filter-select" id="sort-select" onchange="UI.setSort(this.value)">
            <option value="created_at">Date d'ajout</option>
            <option value="date_finished">Date de fin</option>
            <option value="rating">Note</option>
            <option value="title">Titre</option>
          </select>
        </div>
        <div id="cards-grid"></div>
      </section>

      <!-- Page Profil / Stats -->
      <section id="page-dashboard" class="page">
        <div class="page-header"><h2>Profil &amp; Statistiques</h2>
          <div class="page-actions">
            <select class="filter-select" id="profile-year-select" onchange="UI.setProfileYear(this.value)"></select>
          </div>
        </div>
        <div id="dashboard-content"></div>
      </section>

      <!-- Page Découverte -->
      <section id="page-discover" class="page">
        <div class="page-header">
          <h2>Découverte</h2>
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
    </main>

    <!-- Toast container -->
    <div id="toast-container"></div>

    <!-- Modal container -->
    <div id="modal-root"></div>
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
  // Restaure la vue grille/liste
  const savedView = localStorage.getItem("kulturo-view");
  if (savedView === "list") {
    const grid = document.getElementById("cards-grid");
    const btn  = document.getElementById("btn-view-toggle");
    if (grid) grid.classList.add("list-view");
    if (btn)  btn.textContent = "⊟";
  }
  // Restaure la nav active
  const savedNav = localStorage.getItem("kulturo-nav") || "library";
  navTo(savedNav);
}

// ── Chargement depuis Supabase ───────────────────────────────
async function loadEntries() {
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
  // Reset tous les filtres
  State.filters.type     = "all";
  State.filters.status   = "all";
  State.filters.favorite = false;

  // Désactive tous les nav-items
  document.querySelectorAll(".nav-item[data-nav]").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.nav-item[data-nav="${key}"]`);
  if (btn) btn.classList.add("active");

  // Sauvegarde la nav active
  localStorage.setItem("kulturo-nav", key);

  if (key === "dashboard") {
    showPage("dashboard");
  } else if (key === "discover") {
    showPage("discover");
  } else if (key.startsWith("type-")) {
    State.filters.type = key.replace("type-", "");
    showPage("library");
    renderCards();
  } else if (key.startsWith("status-")) {
    State.filters.status = key.replace("status-", "");
    showPage("library");
    renderCards();
  } else if (key === "fav") {
    State.filters.favorite = true;
    showPage("library");
    renderCards();
  } else {
    showPage("library");
    renderCards();
  }
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add("active");
  if (name === "dashboard") renderDashboard();
  if (name === "discover")  renderDiscover();
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

  let entries = filterEntries(State.entries);

  if (!entries.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎭</div>
        <h3>Rien ici pour le moment</h3>
        <p>Ajoutez votre premier film, jeu ou livre pour commencer.</p>
        <button class="btn btn-primary" onclick="UI.openAddModal()">${iconPlus()} Ajouter</button>
      </div>`;
    return;
  }

  grid.innerHTML = entries.map(e => cardHTML(e)).join("");
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

function cardHTML(e) {
  const coverHTML = e.cover_url
    ? `<img class="card-cover" src="${e.cover_url}" alt="${esc(e.title)}" loading="lazy" onerror="this.replaceWith(makePlaceholder('${TYPE_ICONS[e.media_type]}'))">`
    : `<div class="card-cover-placeholder">${TYPE_ICONS[e.media_type]||"🎭"}</div>`;

  const ratingHTML = e.rating
    ? `<div class="rating-display"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${e.rating}/10</div>`
    : `<span class="rating-empty" style="font-size:.75rem;color:var(--text-3)">Non noté</span>`;

  return `
    <article class="media-card${e.is_favorite?" favorite":""}" onclick="UI.openEditModal('${e.id}')">
      <button class="fav-btn${e.is_favorite?" on":""}" onclick="event.stopPropagation();UI.toggleFav('${e.id}')" title="${e.is_favorite?"Retirer des favoris":"Coup de cœur"}">
        ${e.is_favorite ? "♥" : "♡"}
      </button>
      ${coverHTML}
      <div class="card-body">
        <div class="card-title">${esc(e.title)}</div>
        <div class="card-meta">
          <span class="badge badge-${e.media_type}">${TYPE_ICONS[e.media_type]} ${TYPE_LABELS[e.media_type]}</span>
          <span class="badge badge-${e.status}">${STATUS_LABELS[e.status]}</span>
        </div>
        <div class="card-footer">${ratingHTML}</div>
      </div>
    </article>`;
}

// ── Badges sidebar ────────────────────────────────────────────
function updateBadges() {
  const count = (fn) => State.entries.filter(fn).length;
  const set   = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
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

function renderDashboard() {
  const container = document.getElementById("dashboard-content");
  if (!container) return;

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
          <span class="top-rating">★ ${e.rating}/10</span>
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

  container.innerHTML = `
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
    </div>`;
}

// ── Modal Ajout / Édition ─────────────────────────────────────
function openModal(entry = null) {
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
                  `<option value="${s}" ${entry?.status===s?"selected":""}>${STATUS_LABELS[s]}</option>`
                ).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Note (1–10)</label>
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

function buildRatingStars(current) {
  const wrap = document.getElementById("rating-stars");
  if (!wrap) return;
  wrap.innerHTML = Array.from({length:10}, (_,i) => {
    const n = i + 1;
    return `<button type="button" class="${n<=current?"on":""}" onclick="UI.setRating(${n})" title="${n}/10">${n<=current?"★":"☆"}</button>`;
  }).join("");
}

let _currentRating = 0;
function setRating(n) {
  _currentRating = n;
  buildRatingStars(n);
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
    closeModal();
    if (!State.demoMode) await loadEntries();
    else { renderCards(); updateBadges(); }
    toast(wasAdding ? `"${savedTitle}" ajouté ✓` : "Mis à jour ✓", "success");
    if (wasAdding) flashNewCard(savedTitle);
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

async function deleteEntry(id) {
  if (!confirm("Supprimer ce média ?")) return;
  try {
    if (!State.demoMode) await Media.delete(id);
    State.entries = State.entries.filter(e => e.id !== id);
    closeModal();
    if (!State.demoMode) await loadEntries();
    else { renderCards(); updateBadges(); }
    toast("Supprimé", "info");
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

async function toggleFav(id) {
  const entry = State.entries.find(e => e.id === id);
  if (!entry) return;
  const next = !entry.is_favorite;
  try {
    if (!State.demoMode) await Media.toggleFavorite(id, entry.is_favorite);
    entry.is_favorite = next;
    if (!State.demoMode) await loadEntries();
    else { renderCards(); updateBadges(); }
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


// ── Filtres chip (status bar) ─────────────────────────────────
function setStatusChip(status) {
  State.filters.status = status;
  document.querySelectorAll(".filter-chip").forEach(c =>
    c.classList.toggle("active", c.textContent.trim() === (status==="all"?"Tous":STATUS_LABELS[status])));
  renderCards();
}
function setSort(val) {
  State.filters.sort = val;
  localStorage.setItem("kulturo-sort", val);
  renderCards();
}

// ── Global search ─────────────────────────────────────────────
function bindGlobalEvents() {
  document.addEventListener("input", e => {
    if (e.target.id === "global-search") {
      State.filters.search = e.target.value;
      renderCards();
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
  setTimeout(() => el.remove(), 3200);
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Icons (inline SVG minifiés) ───────────────────────────────
const iconPlus    = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
const iconSearch  = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const iconX       = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const iconGrid    = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const iconChart   = () => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`;
const iconSun     = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const iconMoon    = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const iconLogout  = () => `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;


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
        model: CONFIG.groq.model || "llama3-8b-8192",
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
  if (DiscoverState.loading) return;
  DiscoverState.loading = true;

  grid.innerHTML = `<div class="discover-loading"><div class="spinner"></div><span>Analyse de vos goûts avec l'IA…</span></div>`;

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

  if (!unique.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Aucun résultat</h3><p>Vérifiez vos clés API dans config.js.</p></div>`;
    return;
  }

  grid.innerHTML = unique.map((it, idx) => discoverCardHTML(it, idx)).join("");
}

function discoverCardHTML(it, idx) {
  const typeLabel = { game:"Jeu", movie:"Film", book:"Livre" };
  const typeIcon  = { game:"🎮", movie:"🎬", book:"📚" };
  const cover = it.cover_url
    ? `<img class="card-cover" src="${it.cover_url}" alt="${esc(it.title)}" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-cover-placeholder">${typeIcon[it.media_type]||"🎭"}</div>`;
  return `
    <article class="media-card discover-card">
      ${cover}
      <div class="card-body">
        <div class="card-title">${esc(it.title)}</div>
        <div class="card-meta">
          <span class="badge badge-${it.media_type}">${typeIcon[it.media_type]} ${typeLabel[it.media_type]}</span>
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
  DiscoverState.results.splice(idx, 1);
  const grid = document.getElementById("discover-grid");
  if (grid) {
    if (!DiscoverState.results.length) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>Plus de suggestions</h3><p><button class="btn btn-secondary btn-sm" onclick="UI.clearDiscoverMemory()">Effacer la mémoire</button> pour en voir de nouvelles.</p></div>`;
    } else {
      grid.innerHTML = DiscoverState.results.map((r,i) => discoverCardHTML(r,i)).join("");
    }
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
  const TYPE_ICONS  = { game:"🎮", movie:"🎬", book:"📚" };
  const TYPE_LABELS = { game:"Jeu", movie:"Film", book:"Livre" };
  const STATUS_LABELS_L = { wishlist:"Wishlist", playing:"En cours", finished:"Terminé", paused:"En pause", dropped:"Abandonné" };

  const stars = e.rating
    ? Array.from({length:10}, (_,i) => `<span style="color:${i<e.rating?"var(--accent)":"var(--border-2)"}">★</span>`).join("")
    : "<span style='color:var(--text-3);font-size:.85rem'>Non noté</span>";

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
            <span class="badge badge-${e.media_type}">${TYPE_ICONS[e.media_type]} ${TYPE_LABELS[e.media_type]}</span>
            <span class="badge badge-${e.status}">${STATUS_LABELS_L[e.status]}</span>
            ${e.is_favorite ? `<span style="color:var(--accent);font-size:1rem">♥</span>` : ""}
          </div>
          <button class="btn-icon" onclick="UI.closeModal()">${iconX()}</button>
        </div>
        <div class="detail-ext-links">${externalHTML}${youtubeHTML}</div>
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
        // Sauvegarde en local pour ne pas refaire l'appel
        e.description = match.description;
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
function getSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(DISCOVER_SEEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function addIgnored(title) {
  const s = getIgnored(); s.add(title.toLowerCase());
  localStorage.setItem(DISCOVER_IGNORED_KEY, JSON.stringify([...s]));
}
function addSeen(titles) {
  const s = getSeen();
  titles.forEach(t => s.add(t.toLowerCase()));
  localStorage.setItem(DISCOVER_SEEN_KEY, JSON.stringify([...s]));
}
function clearDiscoverMemory() {
  localStorage.removeItem(DISCOVER_IGNORED_KEY);
  localStorage.removeItem(DISCOVER_SEEN_KEY);
  DiscoverState.results = [];
  renderDiscover();
  toast("Mémoire effacée — nouvelles suggestions en cours…", "info");
}

// ── Interface publique (appelée depuis le HTML inline) ────────
// ── Vue grille / liste ────────────────────────────────────────
function toggleView() {
  const grid = document.getElementById("cards-grid");
  const btn  = document.getElementById("btn-view-toggle");
  if (!grid) return;
  const isList = grid.classList.toggle("list-view");
  if (btn) btn.textContent = isList ? "⊟" : "⊞";
  localStorage.setItem("kulturo-view", isList ? "list" : "grid");
}

window.UI = {
  openAddModal:    () => { _currentRating = 0; window._apiSelected = null; openModal(); },
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
  setStatusChip,
  setSort,
  setDiscoverType,
  refreshDiscover: () => { DiscoverState.results = []; renderDiscover(); },
  ignoreDiscover,
  clearDiscoverMemory,
  addToWishlist,
  toggleTheme,
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
