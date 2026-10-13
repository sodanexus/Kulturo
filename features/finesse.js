// ============================================================
// Finesse — micro-interactions de précision (aucune dépendance)
//  • barre de progression de lecture sous la barre supérieure
//  • inclinaison + lueur des affiches qui suivent le curseur
//  • reflet doré quand une œuvre change de statut (playCardSheen)
//  • fondu progressif de la couleur de la barre système (applySystemBarColor)
// Tout est délégué au document : les re-rendus de l'application
// n'ont rien à rebrancher. Désactivé si le mouvement est réduit.
// ============================================================

import { prefersReducedMotion } from "./motion.js";

const TILT_MAX = 5; // degrés
let frame = 0;
let active = null;
let scrollTicking = false;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function releaseCard(card) {
  if (!card) return;
  card.classList.remove("is-tilting");
  for (const name of ["--mx", "--my", "--rx", "--ry"]) card.style.removeProperty(name);
}

function onPointerMove(event) {
  if (event.pointerType !== "mouse" || prefersReducedMotion()) return;
  const card = event.target instanceof Element ? event.target.closest(".media-card, .continue-card") : null;
  if (card !== active) {
    releaseCard(active);
    active = card;
  }
  if (!card) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const cover = card.querySelector(".card-cover, .card-cover-placeholder, .continue-cover") || card;
    const rect = cover.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    card.style.setProperty("--rx", `${((0.5 - y) * TILT_MAX * 2).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${((x - 0.5) * TILT_MAX * 2).toFixed(2)}deg`);
    card.classList.add("is-tilting");
  });
}

function resetActive() {
  cancelAnimationFrame(frame);
  releaseCard(active);
  active = null;
}

function progressBar() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return null;
  let bar = topbar.querySelector(".scroll-progress");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    topbar.append(bar);
  }
  return bar;
}

function onScroll(event) {
  const main = event.target;
  if (!(main instanceof Element) || main.id !== "main" || scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    scrollTicking = false;
    const max = main.scrollHeight - main.clientHeight;
    const progress = max > 0 ? clamp(main.scrollTop / max, 0, 1) : 0;
    const bar = progressBar();
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    document.body.dataset.scrolled = main.scrollTop > 8 ? "true" : "false";
    // La carte sous le curseur change pendant le défilement : on repart propre.
    if (active) resetActive();
  });
}

if (typeof document !== "undefined") {
  // Le scroll ne remonte pas dans le DOM : on l'écoute en capture sur #main.
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerdown", resetActive, { passive: true });
  document.addEventListener("pointerout", event => { if (!event.relatedTarget) resetActive(); }, { passive: true });
}

// ── Reflet doré sur une affiche dont le statut change ────────
// Signature : [id, titre, jaquette, note, coup de cœur, répétitions, date, statut, type, sous-type]
export function playCardSheen(node, previousSignature, nextSignature) {
  if (!node || !previousSignature || previousSignature === nextSignature || prefersReducedMotion()) return;
  let before; let after;
  try { before = JSON.parse(previousSignature); after = JSON.parse(nextSignature); } catch { return; }
  const statusChanged = before[7] !== after[7];
  const becameFavorite = !before[4] && Boolean(after[4]);
  const becamePerfect = before[3] !== 10 && after[3] === 10;
  if (!statusChanged && !becameFavorite && !becamePerfect) return;
  node.classList.remove("is-sheen");
  void node.offsetWidth; // relance l'animation si elle était en cours
  node.classList.add("is-sheen");
  setTimeout(() => node.classList.remove("is-sheen"), 1300);
}

// ── Barre système : la couleur glisse au lieu de sauter ──────
let systemTween = 0;
let shownRGB = null;
let probe = null;

function toRGB(color) {
  if (typeof document === "undefined") return null;
  try {
    probe ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!probe) return null;
    probe.canvas.width = probe.canvas.height = 1;
    probe.fillStyle = "#000";
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  } catch { return null; }
}

export function applySystemBarColor(color) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector('meta[name="theme-color"]');
  // Le fond du corps possède déjà sa propre transition CSS : la variable passe directement à la cible.
  document.documentElement.style.setProperty("--system-bar-color", color);
  cancelAnimationFrame(systemTween);
  const target = toRGB(color);
  const from = shownRGB || toRGB(meta?.getAttribute("content") || color);
  if (!meta || !target || !from || prefersReducedMotion()) {
    meta?.setAttribute("content", color);
    shownRGB = target;
    return;
  }
  const start = performance.now();
  const duration = 450;
  const step = now => {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    shownRGB = from.map((value, i) => Math.round(value + (target[i] - value) * eased));
    meta.setAttribute("content", t < 1 ? `rgb(${shownRGB.join(",")})` : color);
    if (t < 1) systemTween = requestAnimationFrame(step);
  };
  systemTween = requestAnimationFrame(step);
}
