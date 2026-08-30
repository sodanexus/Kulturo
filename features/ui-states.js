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

export function emptyState({ icon = "◇", title, message, actionHTML = "", className = "" }) {
  return `<div class="ui-state ui-state-empty empty-state ${escapeHTML(className)}"><div class="empty-icon" aria-hidden="true">${escapeHTML(icon)}</div><h3>${escapeHTML(title)}</h3><p>${message}</p>${actionHTML}</div>`;
}

export function errorState({ title = "Indisponible", message, actionHTML = "", className = "" }) {
  return emptyState({ icon: "!", title, message, actionHTML, className: `ui-state-error ${className}` });
}

export function cardSkeletons(count = 8) {
  return Array.from({ length: Math.max(1, count) }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line xshort"></div>
      </div>
    </div>`).join("");
}
