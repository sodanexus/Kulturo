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

export function emptyState({ icon = "collection", title, message, actionHTML = "", className = "" }) {
  return '<div class="ui-state ui-state-empty empty-state ' + escapeHTML(className) + '" role="status">' +
    '<div class="empty-icon" aria-hidden="true">' + stateIcon(icon) + '</div>' +
    '<h3>' + escapeHTML(title) + '</h3><p>' + message + '</p>' +
    (actionHTML ? '<div class="ui-state-actions">' + actionHTML + '</div>' : '') + '</div>';
}

export function errorState({ title = "Indisponible", message, actionHTML = "", className = "" }) {
  return emptyState({ icon: "error", title, message, actionHTML, className: "ui-state-error " + className });
}

// Le squelette reprend uniquement la jaquette 2:3 de la carte finale.
// La grille parente décide de sa largeur dans les deux densités.
export function cardSkeletons(count = 8) {
  return Array.from({ length: Math.max(1, count) }, () =>
    '<div class="skeleton-card" aria-hidden="true"><div class="skeleton skeleton-cover"></div></div>'
  ).join("");
}

export function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-saving", busy);
  if (busy) {
    button.dataset.idleLabel = button.getAttribute("aria-label") || "";
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-label", "Enregistrement en cours");
  } else {
    button.removeAttribute("aria-busy");
    if (button.dataset.idleLabel) button.setAttribute("aria-label", button.dataset.idleLabel);
    else button.removeAttribute("aria-label");
    delete button.dataset.idleLabel;
  }
}
