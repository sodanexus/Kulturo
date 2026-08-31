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
    container.appendChild(node);
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
  const current = new Map([...container.children].map(node => [node.dataset.uiKey || node.id, node]));
  const kept = new Set();
  const changed = [];
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
      container.appendChild(next);
      changed.push(next);
      return;
    }
    const previous = current.get(key);
    kept.add(key);
    if (previous && stableMarkup(previous) === stableMarkup(next)) {
      container.appendChild(previous);
      return;
    }
    if (previous?.matches("details[open]") && next.matches("details")) next.open = true;
    // Toujours placer le bloc traité à la fin de la séquence courante. Un
    // simple replaceWith conservait parfois son ancien index tandis que les
    // blocs inchangés étaient déplacés, ce qui pouvait faire remonter
    // l'histogramme du Profil au-dessus d'« En un coup d'œil ».
    if (previous) previous.remove();
    container.appendChild(next);
    changed.push(next);
  });

  current.forEach((node, key) => {
    if (key && !kept.has(key)) node.remove();
  });
  return changed;
}
