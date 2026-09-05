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
      node.classList.add("is-locally-added");
      node.addEventListener("animationend", () => node.classList.remove("is-locally-added"), { once: true });
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

export function patchKeyedSurface(container, html) {
  if (!container) return [];
  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();
  const nextNodes = [...template.content.children];
  const currentNodes = [...container.children];
  const current = new Map(currentNodes
    .map(node => [node.dataset.uiKey || node.id, node])
    .filter(([key]) => Boolean(key)));
  const keptNodes = new Set();
  const changed = [];
  let cursor = container.firstElementChild;
  const stableMarkup = node => {
    const clone = node.cloneNode(true);
    clone.classList.remove("profile-block-enter");
    clone.querySelectorAll(".is-loaded, .profile-block-enter").forEach(element => {
      element.classList.remove("is-loaded", "profile-block-enter");
    });
    clone.querySelectorAll("details[open]").forEach(element => element.removeAttribute("open"));
    return clone.outerHTML;
  };

  nextNodes.forEach(next => {
    const key = next.dataset.uiKey || next.id;
    if (!key) {
      container.insertBefore(next, cursor);
      cursor = next.nextElementSibling;
      changed.push(next);
      return;
    }
    const previous = current.get(key);
    let node = next;
    if (previous && stableMarkup(previous) === stableMarkup(next)) {
      node = previous;
      keptNodes.add(previous);
    } else {
      if (previous?.matches("details[open]") && next.matches("details")) next.open = true;
      const replacesCursor = previous === cursor;
      if (previous) previous.replaceWith(next);
      if (replacesCursor) cursor = next;
      changed.push(next);
    }

    if (node !== cursor) container.insertBefore(node, cursor);
    cursor = node.nextElementSibling;
  });

  currentNodes.forEach(node => {
    if (!keptNodes.has(node) && node.parentNode === container) node.remove();
  });
  return changed;
}
