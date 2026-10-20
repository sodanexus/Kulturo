import { prefersReducedMotion, motionDuration } from "./motion.js";

// ============================================================
// Mises à jour DOM locales — évite les reconstructions inutiles
// ============================================================

export function elementFromHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();
  return template.content.firstElementChild || null;
}

export function reconcileKeyedChildren(container, items, options) {
  if (!container) return;
  const { key, create, update } = options;
  const existing = new Map([...container.children].map(node => [node.dataset.key || node.dataset.id, node]));
  const keep = new Set();
  let cursor = container.firstElementChild;

  items.forEach((item, index) => {
    const itemKey = String(key(item));
    let node = existing.get(itemKey) || null;
    if (node) update?.(node, item, index);
    else {
      node = create(item, index);
      if (!node) return;
      node.dataset.key = itemKey;
      if (!prefersReducedMotion() && !globalThis.document?.documentElement?.dataset.viewTransition) {
        node.classList.add("is-locally-added");
        // Nettoyage même si un changement de page annule l'animation CSS.
        setTimeout(() => node.classList.remove("is-locally-added"), motionDuration("--motion-layout", 280) + 50);
      }
    }
    keep.add(itemKey);
    // Ne déplacer que les nœuds réellement désordonnés. appendChild sur
    // chaque élément détachait aussi toutes les cartes déjà à leur place,
    // relançant peinture et décodage des jaquettes à chaque rendu.
    if (node !== cursor) container.insertBefore(node, cursor);
    cursor = node.nextElementSibling;
  });

  existing.forEach((node, nodeKey) => {
    if (!keep.has(String(nodeKey))) node.remove();
  });
}
