// ============================================================
// Mouvement commun — progressif, annulable et respectueux du système
// ============================================================

export function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

let activeViewTransition;
let viewSequence = 0;

export function runViewTransition(update, name = "page") {
  const sequence = ++viewSequence;
  activeViewTransition?.skipTransition?.();
  const documentRef = globalThis.document;
  if (!documentRef?.startViewTransition || prefersReducedMotion()) {
    if (documentRef?.documentElement) delete documentRef.documentElement.dataset.viewTransition;
    activeViewTransition = null;
    const result = update();
    revealSurface(documentRef?.querySelector?.(".page.active"), { from: 0 });
    return result;
  }
  documentRef.documentElement.dataset.viewTransition = name;
  try {
    const transition = documentRef.startViewTransition(() => { if (sequence === viewSequence) return update(); });
    activeViewTransition = transition;
    const cleanup = () => {
      if (sequence === viewSequence && documentRef.documentElement.dataset.viewTransition === name) {
        delete documentRef.documentElement.dataset.viewTransition;
        activeViewTransition = null;
      }
    };
    // Une transition peut être volontairement sautée par le navigateur. Son
    // rejet ne constitue pas une erreur applicative et ne doit pas produire de
    // promesse rejetée non observée dans Safari ou Chromium.
    transition.finished.then(cleanup, cleanup);
    return transition;
  } catch {
    if (sequence === viewSequence) delete documentRef.documentElement.dataset.viewTransition;
    const result = update();
    revealSurface(documentRef?.querySelector?.(".page.active"), { from: 0 });
    return result;
  }
}

// Le JS attend la même durée que le CSS avant de retirer une fenêtre.
export function motionDuration(token = "--motion-dialog", fallback = 280) {
  if (prefersReducedMotion()) return 0;
  const root = globalThis.document?.documentElement;
  const value = root && globalThis.getComputedStyle?.(root).getPropertyValue(token).trim();
  const match = value && /^(\d*\.?\d+)(ms|s)$/.exec(value);
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

export const MOTION_EASING = 'cubic-bezier(.333333, .666667, .666667, 1)';

// Mémoriser l'état réellement visible avant de remplacer l'animation CSS.
export function prepareDialogClose(overlay) {
  if (!overlay || prefersReducedMotion()) return;
  const sheet = overlay.querySelector('.modal, .metadata-sheet');
  const backdropStyle = getComputedStyle(overlay);
  overlay.style.setProperty('--close-opacity', backdropStyle.opacity);
  if (sheet) {
    const style = getComputedStyle(sheet);
    sheet.style.setProperty('--close-transform', style.transform);
    sheet.style.setProperty('--close-sheet-opacity', style.opacity);
  }
}

const heightAnimations = new WeakMap();
export async function waitForHeightTransition(element) {
  while (heightAnimations.has(element)) {
    const animation = heightAnimations.get(element);
    await animation.finished.catch(() => {});
    // Le nettoyage de animateHeightChange termine sa chaîne de promesses.
    await Promise.resolve();
  }
}
export function animateHeightChange(element, update) {
  if (!element) { update(); return Promise.resolve(true); }
  const from = element.getBoundingClientRect().height;
  heightAnimations.get(element)?.cancel();
  heightAnimations.delete(element);
  element.setAttribute('data-height-changing', '');
  update();
  const to = element.getBoundingClientRect().height;
  if (!element.animate || prefersReducedMotion() || Math.abs(to - from) < 1) {
    element.removeAttribute('data-height-changing');
    return Promise.resolve(true);
  }
  const animation = element.animate([
    { height: `${from}px`, minHeight: `${from}px`, maxHeight: `${from}px`, overflow: 'clip' },
    { height: `${to}px`, minHeight: `${to}px`, maxHeight: `${to}px`, overflow: 'clip' },
  ], { duration: motionDuration('--motion-layout', 360), easing: MOTION_EASING });
  heightAnimations.set(element, animation);
  return animation.finished.then(() => true, () => false).then(completed => {
    completed = completed && heightAnimations.get(element) === animation;
    if (heightAnimations.get(element) === animation) {
      heightAnimations.delete(element);
      element.removeAttribute('data-height-changing');
    }
    return completed;
  });
}

const surfaceAnimations = new WeakMap();
export function revealSurface(element, { from = 0, delay = 0 } = {}) {
  if (!element?.animate || prefersReducedMotion() ||
      globalThis.document?.documentElement?.dataset.viewTransition) return;
  const previous = surfaceAnimations.get(element);
  const opacity = previous ? getComputedStyle(element).opacity : from;
  previous?.cancel();
  const animation = element.animate([{ opacity }, { opacity: 1 }], {
    duration: motionDuration('--motion-content', 420), delay, fill: 'backwards', easing: 'cubic-bezier(.25, .1, .25, 1)',
  });
  surfaceAnimations.set(element, animation);
  animation.finished.then(cleanup, cleanup);
  function cleanup() {
    if (surfaceAnimations.get(element) === animation) surfaceAnimations.delete(element);
  }
}

export function shouldDismissSheet(distance, velocity) {
  // Une petite secousse ne doit jamais fermer une fiche.
  return distance > 92 || (distance > 24 && velocity > .55);
}

// Conserver une enveloppe continue entre consultation et édition, sans
// agrandir le texte : seules les dimensions du panneau sont interpolées.
const dialogAnimations = new WeakMap();
const dialogCleanups = new WeakMap();
export function isDialogTransitioning(element) { return dialogAnimations.has(element); }
function cancelDialogTransition(element) {
  const animation = dialogAnimations.get(element);
  dialogCleanups.get(element)?.();
  animation?.cancel();
}
export function waitForDialogTransition(element) {
  return dialogAnimations.get(element)?.finished.catch(() => {}) || Promise.resolve();
}
export function animateDialogUpdate(element, update) {
  if (!element) { update(); return; }
  const previous = element.getBoundingClientRect();
  cancelDialogTransition(element);
  update();
  return transitionDialogReplacement(previous, element);
}

export function transitionDialogReplacement(previousRect, next) {
  if (!previousRect || !next?.animate || prefersReducedMotion()) return;
  cancelDialogTransition(next);
  const rect = next.getBoundingClientRect();
  if (!rect.width || !rect.height || !previousRect.width || !previousRect.height) return;
  // Contraindre min ET max à chaque extrémité : la hauteur fixe de la fiche
  // et les contraintes flex mobiles ne doivent pas écraser le trajet retour.
  const frame = box => ({ width: `${box.width}px`, height: `${box.height}px`,
    minWidth: `${box.width}px`, maxWidth: `${box.width}px`,
    minHeight: `${box.height}px`, maxHeight: `${box.height}px`,
    flexShrink: 0, overflow: 'clip' });
  next.setAttribute?.('data-dialog-changing', '');
  // La taille de départ existe aussi dans le style réel, avant la peinture.
  // Safari ne doit pas montrer une frame à la taille finale entre deux panneaux.
  const initial = frame(previousRect);
  const properties = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'flexShrink', 'overflow'];
  const saved = properties.map(property => [property, next.style[property]]);
  Object.assign(next.style, initial);
  let animation;
  try {
    animation = next.animate([initial, frame(rect)], {
      duration: motionDuration('--motion-layout', 360), easing: MOTION_EASING, fill: 'both',
    });
  } catch {
    for (const [property, value] of saved) next.style[property] = value;
    return;
  }
  animation.pause?.();
  animation.currentTime = 0;
  dialogAnimations.set(next, animation);
  const cleanup = () => {
    if (dialogAnimations.get(next) !== animation) return;
    dialogAnimations.delete(next);
    dialogCleanups.delete(next);
    for (const [property, value] of saved) next.style[property] = value;
  };
  dialogCleanups.set(next, cleanup);
  animation.finished.then(() => { cleanup(); animation.cancel?.(); }, cleanup);
  // Une première peinture à l’ancienne taille, puis le même trajet aller/retour.
  // Les callbacks d’un panneau remplacé rapidement ne doivent pas le relancer.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (dialogAnimations.get(next) !== animation) return;
    if (!next.isConnected) { cleanup(); animation.cancel?.(); return; }
    animation.play?.();
  }));
  // Le marqueur reste sur cette instance pour ne pas relancer l’entrée CSS.

  for (const part of next.querySelectorAll(':scope > .modal-header, :scope > .modal-body, :scope > .detail-body, :scope > .detail-backdrop, :scope > .modal-footer, :scope > .metadata-sheet-header, :scope > .metadata-sheet-body, :scope > .metadata-sheet-footer')) {
    if (next.matches?.(".detail-modal") && part.matches(".detail-body, .detail-backdrop")) continue;
    revealSurface(part);
  }
  return animation;
}

// Tous les remplacements du panneau principal passent ici, indépendamment
// du bouton, du retour navigateur ou de l'étape de formulaire qui les déclenche.
export function replaceModalContent(root, html) {
  const previous = root.querySelector('#modal-overlay .modal');
  const previousRect = previous?.getBoundingClientRect();
  if (previous) cancelDialogTransition(previous);
  root.innerHTML = html;
  const next = root.querySelector('#modal-overlay .modal');
  if (!previousRect || !next) return;
  next.closest('.modal-overlay')?.classList.add('is-modal-replacement');
  // Attendre les réglages synchrones (synopsis, champs, focus), mais démarrer
  // avant la première peinture de la nouvelle fenêtre.
  queueMicrotask(() => {
    if (!next.isConnected || root.querySelector('#modal-overlay .modal') !== next) return;
    transitionDialogReplacement(previousRect, next);
  });
}

// Chaque groupe est déjà à sa place : seule son opacité change.
// Le remplissage backwards masque aussi les blocs pendant leur délai.
export function revealDetailSequence(modal) {
  if (!modal) return;
  queueMicrotask(() => {
    if (!modal.isConnected) return;
    const blocks = modal.querySelectorAll('.detail-title, .detail-hero-facts, .detail-rating, .detail-badges, .activity-detail-notice, .reading-progress, .detail-synopsis-slot > *, .detail-info-content > *');
    const start = dialogAnimations.has(modal) ? motionDuration('--motion-layout', 360) : 70;
    blocks.forEach((block, index) => revealSurface(block, { delay: start + Math.min(index * 75, 525) }));
  });
}
