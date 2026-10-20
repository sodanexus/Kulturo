// ============================================================
// Morphing DOM + FLIP — le Profil se met à jour EN PLACE.
// Les éléments existants sont conservés (barres, boutons, cartes) : leurs
// changements s'animent au lieu de repartir de zéro, et les blocs glissent
// vers leur nouvelle hauteur sans sursaut.
// ============================================================
import { prefersReducedMotion } from "./motion.js";

// Classes posées par le JS (révélation, chargement d'image, pastille) : jamais écrasées.
const KEEP_CLASSES = new Set(["is-revealed", "is-reveal-pending", "profile-block-enter", "is-loaded", "has-pill", "is-pill-ready"]);
const EASE = "cubic-bezier(.2,.8,.2,1)";
const DURATION = 440;
const running = new Set();

const keyOf = node => node.nodeType === 1 ? (node.dataset.uiKey || node.dataset.prefetchMedia || node.id || null) : null;
const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

function syncAttributes(live, next) {
  for (const { name, value } of [...next.attributes]) {
    if (name === "open") continue; // état ouvert/fermé choisi par la personne
    if (name === "class") {
      const keep = [...live.classList].filter(item => KEEP_CLASSES.has(item));
      const target = [...new Set([...next.classList, ...keep])].join(" ");
      if (live.getAttribute("class") !== target) live.setAttribute("class", target);
    } else if (live.getAttribute(name) !== value) live.setAttribute(name, value);
  }
  for (const { name } of [...live.attributes]) {
    if (name === "open" || next.hasAttribute(name)) continue;
    if (name === "style" && live.classList.contains("has-pill")) continue; // variables de la pastille
    if (name === "class") { const keep = [...live.classList].filter(item => KEEP_CLASSES.has(item)); keep.length ? live.setAttribute("class", keep.join(" ")) : live.removeAttribute("class"); continue; }
    live.removeAttribute(name);
  }
}

function morphChildren(live, next, ctx) {
  const pool = new Map();
  const queue = [];
  for (const node of live.childNodes) {
    const key = keyOf(node);
    if (key) pool.set(key, node); else queue.push(node);
  }
  const order = [];
  for (const nextNode of [...next.childNodes]) {
    const key = keyOf(nextNode);
    let match = null;
    if (key) {
      match = pool.get(key) || null;
      pool.delete(key);
      if (match && !sameKind(match, nextNode)) match = null;
    } else if (queue.length && sameKind(queue[0], nextNode)) match = queue.shift();
    if (match) { morphNode(match, nextNode, ctx); order.push(match); }
    else { ctx.added.add(nextNode); order.push(nextNode); }
  }
  let ref = live.firstChild;
  for (const node of order) {
    if (node === ref) ref = ref.nextSibling;
    else live.insertBefore(node, ref);
  }
  while (ref) { const following = ref.nextSibling; live.removeChild(ref); ref = following; }
}

function morphNode(live, next, ctx) {
  if (live.nodeType !== 1) {
    if (live.nodeValue !== next.nodeValue) {
      live.nodeValue = next.nodeValue;
      if (live.parentElement) ctx.textChanged.add(live.parentElement);
    }
    return;
  }
  syncAttributes(live, next);
  // Les compteurs sont animés par leur propre tween ; les champs gardent leur saisie.
  if (live.hasAttribute("data-profile-number") || ["IMG", "INPUT", "TEXTAREA"].includes(live.tagName)) return;
  morphChildren(live, next, ctx);
  if (live.tagName === "SELECT") live.value = next.value;
}

const measure = elements => new Map([...elements].map(el => [el, el.getBoundingClientRect()]));

function play(element, frames, options = {}) {
  const animation = element.animate(frames, { duration: DURATION, easing: EASE, ...options });
  running.add(animation);
  animation.onfinish = animation.oncancel = () => running.delete(animation);
}

const insideAdded = (element, container, added) => {
  for (let parent = element.parentElement; parent && parent !== container; parent = parent.parentElement) {
    if (added.has(parent)) return true;
  }
  return false;
};

// Réconcilie `container` avec `html` sans le reconstruire. Retourne les blocs
// réellement nouveaux (premier rendu), pour leur animation d'entrée habituelle.
export function morphKeyedSurface(container, html) {
  if (!container) return [];
  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();
  const motion = !prefersReducedMotion() && container.children.length > 0 && typeof container.animate === "function";

  // Position VISUELLE de départ (animations en cours incluses) : un clic rapide
  // repart de là où l'écran en est, sans à-coup.
  const blocksBefore = motion ? measure(container.children) : null;
  const itemsBefore = motion ? measure(container.querySelectorAll("[data-prefetch-media]")) : null;
  running.forEach(animation => animation.cancel());
  running.clear();

  const ctx = { added: new Set(), textChanged: new Set() };
  morphChildren(container, template.content, ctx);
  const newBlocks = [...container.children].filter(element => ctx.added.has(element));
  if (!motion) return newBlocks;

  // Blocs : glissement vertical + hauteur qui s'ajuste en douceur.
  const blockShift = new Map();
  blocksBefore.forEach((from, element) => {
    if (!element.isConnected || ctx.added.has(element)) return;
    const to = element.getBoundingClientRect();
    const dy = from.top - to.top;
    const dh = from.height - to.height;
    blockShift.set(element, dy);
    if (Math.abs(dy) < .5 && Math.abs(dh) < .5) return;
    const start = { transform: `translateY(${dy}px)` };
    const end = { transform: "translateY(0)" };
    if (Math.abs(dh) >= .5) {
      Object.assign(start, { height: `${from.height}px`, boxSizing: "border-box", overflow: "hidden" });
      Object.assign(end, { height: `${to.height}px`, boxSizing: "border-box", overflow: "hidden" });
    }
    play(element, [start, end]);
  });

  // Cartes conservées : elles glissent vers leur nouvelle place (FLIP).
  itemsBefore.forEach((from, element) => {
    if (!element.isConnected || ctx.added.has(element)) return;
    let block = element;
    while (block.parentElement && block.parentElement !== container) block = block.parentElement;
    const to = element.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top - (blockShift.get(block) || 0);
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    play(element, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }]);
  });

  // Éléments neufs : fondu + léger relief, en cascade.
  [...ctx.added]
    .filter(element => element.nodeType === 1 && element.isConnected && !newBlocks.includes(element) && !insideAdded(element, container, ctx.added))
    .forEach((element, index) => play(element, [
      { opacity: 0, transform: "translateY(10px) scale(.97)" },
      { opacity: 1, transform: "none" },
    ], { delay: Math.min(index, 6) * 40, fill: "backwards" }));

  // Textes modifiés : fondu court plutôt qu'un changement sec.
  ctx.textChanged.forEach(element => {
    if (!element.isConnected || element.closest("select") || ctx.added.has(element) || insideAdded(element, container, ctx.added)) return;
    play(element, [{ opacity: .1, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 320 });
  });
  return newBlocks;
}

// Pastille qui glisse d'un choix à l'autre dans les commutateurs segmentés.
let pillResizeBound = false;
export function syncSegmentedPills(root) {
  root?.querySelectorAll?.(".profile-period-switch, .profile-media-switch").forEach(group => {
    const active = group.querySelector("button.active");
    if (!active || !active.offsetWidth) return;
    const first = !group.classList.contains("has-pill");
    group.style.setProperty("--pill-x", `${active.offsetLeft}px`);
    group.style.setProperty("--pill-y", `${active.offsetTop}px`);
    group.style.setProperty("--pill-w", `${active.offsetWidth}px`);
    group.style.setProperty("--pill-h", `${active.offsetHeight}px`);
    if (first) {
      group.classList.add("has-pill");
      // Pas de transition au tout premier placement.
      requestAnimationFrame(() => requestAnimationFrame(() => group.classList.add("is-pill-ready")));
    }
  });
  if (!pillResizeBound && typeof window !== "undefined") {
    pillResizeBound = true;
    window.addEventListener("resize", () => requestAnimationFrame(() => syncSegmentedPills(document.getElementById("dashboard-content"))));
  }
}
