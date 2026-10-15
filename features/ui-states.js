// ============================================================
// États visuels communs — chargement, vide et erreur
// ============================================================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function loadingState(label, options = {}) {
  const { compact = false, className = "" } = options;
  return `<div class="ui-state ui-state-loading ${compact ? "is-compact" : ""} ${escapeHTML(className)}" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span>${escapeHTML(label)}</span></div>`;
}

function stateIcon(kind = "collection") {
  const paths = {
    collection: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    journal: '<path d="M6 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z"/><path d="M7 17h13M8 7h8M8 11h6"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[kind] || paths.collection) + '</svg>';
}

// Les états vides reprennent les trois cercles du logo ; seule l'erreur garde son pictogramme.
function brandTrio() {
  return '<svg class="trio" viewBox="0 0 64 36" aria-hidden="true"><circle class="trio-c trio-coral" cx="14" cy="18" r="11"/><circle class="trio-c trio-teal" cx="32" cy="18" r="11"/><circle class="trio-c trio-gold" cx="50" cy="18" r="11"/></svg>';
}

export function emptyState({ icon = "collection", title, message, actionHTML = "", className = "" }) {
  const isError = icon === "error";
  return '<div class="ui-state ui-state-empty empty-state ' + escapeHTML(className) + '" role="status">' +
    '<div class="empty-icon' + (isError ? '' : ' is-trio') + '" aria-hidden="true">' + (isError ? stateIcon(icon) : brandTrio()) + '</div>' +
    '<h3>' + escapeHTML(title) + '</h3><p>' + message + '</p>' +
    (actionHTML ? '<div class="ui-state-actions">' + actionHTML + '</div>' : '') + '</div>';
}

export function errorState({ title = "Indisponible", message, actionHTML = "", className = "" }) {
  return emptyState({ icon: "error", title, message, actionHTML, className: "ui-state-error " + className });
}

// Le squelette reprend la carte finale : jaquette 2:3 puis, pour la plupart
// des cartes, la ligne note / cœur. Le nombre de cartes suit la largeur d'écran
// (la grille parente décide des colonnes), et l'éclat se propage en diagonale.
export function cardSkeletons(count = defaultSkeletonCount()) {
  return Array.from({ length: Math.max(1, count) }, (_, index) =>
    '<div class="skeleton-card" aria-hidden="true" style="--i:' + index + '">' +
      '<div class="skeleton skeleton-cover"></div>' +
      (index % 3 === 2 ? '' : '<div class="skeleton-card-meta"><i class="skeleton"></i>' + (index % 2 ? '' : '<b class="skeleton"></b>') + '</div>') +
    '</div>'
  ).join("");
}

function defaultSkeletonCount() {
  const width = typeof window === "undefined" ? 1200 : window.innerWidth;
  if (width <= 680) return 9;
  if (width <= 1100) return 12;
  return 18;
}

// Profil : mêmes blocs que le tableau de bord final (bilan, 4 compteurs,
// Top, catégories) pour que la page ne « saute » pas à l'arrivée des données.
export function profileSkeleton() {
  const bar = (width, height = 10) => '<i class="skeleton" style="width:' + width + ';height:' + height + 'px"></i>';
  const covers = Array.from({ length: 6 }, () => '<div class="skeleton profile-skel-cover"></div>').join("");
  const rows = [78, 56, 42, 28].map(width =>
    '<div class="profile-skel-row"><i class="skeleton profile-skel-dot"></i><span>' + bar("46%", 10) + bar(width + "%", 4) + '</span></div>'
  ).join("");
  const tiles = Array.from({ length: 4 }, () =>
    '<div class="profile-skel-tile"><i class="skeleton profile-skel-icon"></i>' + bar("38%", 22) + bar("62%", 9) + '</div>'
  ).join("");
  return '<div class="ui-state-loading profile-skeleton" role="status" aria-busy="true" aria-label="Chargement du profil">' +
    '<section class="profile-skel-card">' +
      '<div class="profile-skel-header">' + bar("34%", 22) + '<i class="skeleton profile-skel-pill"></i></div>' +
      '<div class="profile-skel-toolbar"><i class="skeleton profile-skel-pill"></i><i class="skeleton profile-skel-pill"></i></div>' +
      '<div class="profile-skel-summary"><div class="skeleton profile-skel-hero"></div><div class="skeleton profile-skel-hero"></div></div>' +
      '<div class="profile-skel-tiles">' + tiles + '</div>' +
    '</section>' +
    '<section class="profile-skel-card"><div class="profile-skel-heading">' + bar("30%", 12) + '</div><div class="profile-skel-covers">' + covers + '</div></section>' +
    '<section class="profile-skel-card"><div class="profile-skel-heading">' + bar("26%", 12) + '</div>' + rows + '</section>' +
  '</div>';
}

// Journal : titre de mois puis lignes « jaquette + deux lignes de texte ».
export function journalSkeleton(rows = 5) {
  const row = () =>
    '<div class="journal-skel-row"><i class="skeleton journal-skel-cover"></i>' +
    '<span><i class="skeleton" style="width:52%;height:11px"></i><i class="skeleton" style="width:32%;height:8px"></i></span>' +
    '<i class="skeleton journal-skel-date"></i></div>';
  return '<div class="ui-state-loading journal-skeleton" role="status" aria-busy="true" aria-label="Chargement du journal">' +
    '<i class="skeleton journal-skel-month"></i>' + Array.from({ length: rows }, row).join("") + '</div>';
}

const busyButtons = new WeakMap();
export function setButtonBusy(button, busy) {
  if (!button) return;
  if (busy) {
    if (!busyButtons.has(button)) busyButtons.set(button, {
      disabled: button.disabled, label: button.getAttribute("aria-label"),
    });
    button.disabled = true;
    button.classList.add("is-saving");
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-label", "Enregistrement en cours");
  } else {
    const idle = busyButtons.get(button);
    if (!idle) return;
    button.disabled = idle.disabled;
    button.classList.remove("is-saving");
    button.removeAttribute("aria-busy");
    if (idle.label !== null) button.setAttribute("aria-label", idle.label);
    else button.removeAttribute("aria-label");
    busyButtons.delete(button);
  }
}
