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
      <button class="nav-item active" data-page="library" onclick="showPage('library')">
        ${iconGrid()} Bibliothèque <span class="nav-badge" id="badge-all">—</span>
      </button>
      <button class="nav-item" data-page="dashboard" onclick="showPage('dashboard')">
        ${iconChart()} Statistiques
      </button>
      <span class="nav-section-label">Catégories</span>
      <button class="nav-item" data-filter-type="game" onclick="UI.setTypeFilter('game')">
        🎮 Jeux <span class="nav-badge" id="badge-game">—</span>
      </button>
      <button class="nav-item" data-filter-type="movie" onclick="UI.setTypeFilter('movie')">
        🎬 Films <span class="nav-badge" id="badge-movie">—</span>
      </button>
      <button class="nav-item" data-filter-type="book" onclick="UI.setTypeFilter('book')">
        📚 Livres <span class="nav-badge" id="badge-book">—</span>
      </button>
      <span class="nav-section-label">Accès rapide</span>
      <button class="nav-item" data-filter-status="playing" onclick="UI.setStatusFilter('playing')">
        ▶ En cours <span class="nav-badge" id="badge-playing">—</span>
      </button>
      <button class="nav-item" data-filter-status="wishlist" onclick="UI.setStatusFilter('wishlist')">
        🔖 Wishlist <span class="nav-badge" id="badge-wishlist">—</span>
      </button>
      <button class="nav-item" data-filter-fav onclick="UI.setFavFilter()">
        ♥ Coups de cœur <span class="nav-badge" id="badge-fav">—</span>
      </button>
    </nav>

    <!-- Main -->
    <main id="main">
      <!-- Page Bibliothèque -->
      <section id="page-library" class="page active">
        <div class="page-header">
          <h2>Bibliothèque</h2>
          <div class="page-actions">
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

      <!-- Page Dashboard -->
      <section id="page-dashboard" class="page">
        <div class="page-header"><h2>Statistiques</h2></div>
        <div id="dashboard-content"></div>
      </section>
    </main>

    <!-- Toast container -->
    <div id="toast-container"></div>

    <!-- Modal container -->
    <div id="modal-root"></div>
  `;

  applyTheme(localStorage.getItem("kulturo-theme") || CONFIG.app.defaultTheme);
  buildFilterBar();
  renderCards();
  updateBadges();
}

// ── Chargement depuis Supabase ───────────────────────────────
async function loadEntries() {
  console.log("loadEntries appelé");
  try {
    State.entries = await Media.getAll({});
    console.log("entrées :", State.entries.length);
    renderCards();
    updateBadges();
  } catch (e) {
    toast("Erreur de chargement : " + e.message, "error");
  }
}

// ── Navigation ────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item[data-page]").forEach(b => b.classList.remove("active"));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add("active");
  const navBtn = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (navBtn) navBtn.classList.add("active");
  if (name === "dashboard") renderDashboard();
}

// ── Filter bar ────────────────────────────────────────────────
function buildFilterBar() {
  const bar = document.getElementById("filter-bar");
  if (!bar) return;
  const statuses = ["all","wishlist","playing","finished","paused","dropped"];
  const chips = statuses.map(s => {
    const label = s === "all" ? "Tous" : STATUS_LABELS[s];
    return `<button class="filter-chip ${State.filters.status === s ? "active" : ""}"
                    onclick="UI.setStatusFilter('${s}')">${label}</button>`;
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

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const stats = computeStats(State.entries);
  const container = document.getElementById("dashboard-content");
  if (!container) return;

  const total = stats.total || 1; // évite div/0 dans les barres

  const barHTML = (label, value, total, color) => `
    <div class="bar-item">
      <div class="bar-item-label"><span>${label}</span><span>${value}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(value/total*100)}%;background:${color}"></div></div>
    </div>`;

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${stats.total}</div><div class="stat-label">Total médias</div></div>
      <div class="stat-card"><div class="stat-value">${stats.finished}</div><div class="stat-label">Terminés</div></div>
      <div class="stat-card"><div class="stat-value">${stats.inProgress}</div><div class="stat-label">En cours</div></div>
      <div class="stat-card"><div class="stat-value">${stats.favorites}</div><div class="stat-label">Coups de cœur</div></div>
      <div class="stat-card"><div class="stat-value">${stats.avgRating}</div><div class="stat-label">Note moyenne</div></div>
    </div>
    <div class="charts-row">
      <div class="chart-card">
        <h3>Par catégorie</h3>
        <div class="bar-chart">
          ${barHTML("🎮 Jeux",   stats.byType.game,  total, "var(--game)")}
          ${barHTML("🎬 Films",  stats.byType.movie, total, "var(--movie)")}
          ${barHTML("📚 Livres", stats.byType.book,  total, "var(--book)")}
        </div>
      </div>
      <div class="chart-card">
        <h3>Par statut</h3>
        <div class="bar-chart">
          ${barHTML("Terminés",  stats.byStatus.finished, total, "var(--success)")}
          ${barHTML("En cours",  stats.byStatus.playing,  total, "var(--game)")}
          ${barHTML("Wishlist",  stats.byStatus.wishlist, total, "var(--text-3)")}
          ${barHTML("En pause",  stats.byStatus.paused,   total, "var(--warn)")}
          ${barHTML("Abandonnés",stats.byStatus.dropped,  total, "var(--danger)")}
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
    closeModal();
    renderCards();
    updateBadges();
    toast(State.editingId ? "Mis à jour ✓" : "Ajouté ✓", "success");
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
    renderCards();
    updateBadges();
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


// ── Filtres ───────────────────────────────────────────────────
function setTypeFilter(type) {
  State.filters.type = type;
  // Highlight sidebar
  document.querySelectorAll(".nav-item[data-filter-type]").forEach(b =>
    b.classList.toggle("active", b.dataset.filterType === type));
  renderCards();
}
function setStatusFilter(status) {
  State.filters.status = status;
  document.querySelectorAll(".filter-chip").forEach(c =>
    c.classList.toggle("active", c.textContent.trim() === (status==="all"?"Tous":STATUS_LABELS[status])));
  renderCards();
}
function setFavFilter() {
  State.filters.favorite = !State.filters.favorite;
  const btn = document.querySelector(".nav-item[data-filter-fav]");
  if (btn) btn.classList.toggle("active", State.filters.favorite);
  renderCards();
}
function setSort(val) { State.filters.sort = val; renderCards(); }

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

// ── Interface publique (appelée depuis le HTML inline) ────────
window.UI = {
  openAddModal:    () => { _currentRating = 0; window._apiSelected = null; openModal(); },
  openEditModal:   (id) => { const e = State.entries.find(x => x.id === id); _currentRating = e?.rating||0; window._apiSelected = null; openModal(e); },
  closeModal,
  closeModalOnBg,
  saveEntry,
  deleteEntry,
  toggleFav,
  fillFromApi,
  setRating,
  setTypeFilter,
  setStatusFilter,
  setFavFilter,
  setSort,
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
