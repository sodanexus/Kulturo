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
    return update();
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
    return update();
  }
}

// Le JS attend la même durée que le CSS avant de retirer une fenêtre.
export function motionDuration(token = "--motion-dialog", fallback = 350) {
  if (prefersReducedMotion()) return 0;
  const root = globalThis.document?.documentElement;
  const value = root && globalThis.getComputedStyle?.(root).getPropertyValue(token).trim();
  const match = value && /^(\d*\.?\d+)(ms|s)$/.exec(value);
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : fallback;
}

export const MOTION_EASING = 'cubic-bezier(.333333, 0, .666667, 1)';

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
export function animateHeightChange(element, update) {
  if (!element) { update(); return Promise.resolve(true); }
  const from = element.getBoundingClientRect().height;
  heightAnimations.get(element)?.cancel();
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
  ], { duration: motionDuration('--motion-layout', 350), easing: MOTION_EASING });
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
export function revealSurface(element) {
  if (!element?.animate || prefersReducedMotion() ||
      globalThis.document?.documentElement?.dataset.viewTransition) return;
  const previous = surfaceAnimations.get(element);
  const opacity = previous ? getComputedStyle(element).opacity : '.7';
  previous?.cancel();
  const animation = element.animate([{ opacity }, { opacity: 1 }], {
    duration: motionDuration('--motion-content', 280), easing: MOTION_EASING,
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
export function transitionDialogReplacement(previousRect, next) {
  if (!previousRect || !next?.animate || prefersReducedMotion()) return;
  const rect = next.getBoundingClientRect();
  if (!rect.width || !rect.height || !previousRect.width || !previousRect.height) return;
  const maxWidth = `${Math.max(previousRect.width, rect.width)}px`;
  const maxHeight = `${Math.max(previousRect.height, rect.height)}px`;
  const animation = next.animate([
    { width: `${previousRect.width}px`, height: `${previousRect.height}px`, maxWidth, maxHeight, overflow: 'clip' },
    { width: `${rect.width}px`, height: `${rect.height}px`, maxWidth, maxHeight, overflow: 'clip' },
  ], { duration: motionDuration('--motion-layout', 350), easing: MOTION_EASING });
  animation.finished.catch(() => {});
  for (const part of next.querySelectorAll(':scope > .modal-header, :scope > .modal-body, :scope > .detail-body, :scope > .detail-backdrop, :scope > .modal-footer')) {
    revealSurface(part);
  }
}
