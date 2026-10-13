// ============================================================
// Finesse — micro-interactions de précision (aucune dépendance)
//  • barre de progression de lecture sous la barre supérieure
//  • inclinaison + lueur des affiches qui suivent le curseur
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
