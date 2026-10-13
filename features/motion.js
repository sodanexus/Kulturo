// ============================================================
// Mouvement commun — progressif, annulable et respectueux du système
// ============================================================

export function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function runViewTransition(update, name = "page") {
  const documentRef = globalThis.document;
  if (!documentRef?.startViewTransition || prefersReducedMotion()) return update();
  documentRef.documentElement.dataset.viewTransition = name;
  try {
    const transition = documentRef.startViewTransition(() => update());
    const cleanup = () => {
      if (documentRef.documentElement.dataset.viewTransition === name) {
        delete documentRef.documentElement.dataset.viewTransition;
      }
    };
    // Une transition peut être volontairement sautée par le navigateur. Son
    // rejet ne constitue pas une erreur applicative et ne doit pas produire de
    // promesse rejetée non observée dans Safari ou Chromium.
    transition.finished.then(cleanup, cleanup);
    return transition;
  } catch {
    delete documentRef.documentElement.dataset.viewTransition;
    return update();
  }
}

// Animate only retained, visible cards after a real reordering. The DOM and
// focus remain untouched; interrupted moves start from the current position.
const gridAnimations = new WeakMap();
export function captureGridLayout(container) {
  const positions = new Map();
  if (!container || prefersReducedMotion() || globalThis.document?.visibilityState === "hidden") return positions;
  const viewportHeight = globalThis.innerHeight || 1000;
  for (const node of container.children) {
    if (!node.dataset.key) continue;
    const rect = node.getBoundingClientRect();
    if (rect.bottom >= 0 && rect.top <= viewportHeight) positions.set(node.dataset.key, rect);
  }
  return positions;
}

export function animateGridLayout(container, previous) {
  if (!container || !previous?.size || prefersReducedMotion()) return;
  // Batch reads before writes, and cap the work for very large collections.
  const moves = [...container.children].slice(0, 100).flatMap(node => {
    const from = previous.get(node.dataset.key);
    if (!from || typeof node.animate !== "function") return [];
    gridAnimations.get(node)?.cancel();
    const to = node.getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return [];
    if (to.bottom < 0 || to.top > (globalThis.innerHeight || 1000)) return [];
    return [{ node, dx, dy }];
  });
  for (const { node, dx, dy } of moves) {
    const animation = node.animate([
      { translate: `${dx}px ${dy}px` }, { translate: "0px 0px" },
    ], { duration: 260, easing: "cubic-bezier(.22,.8,.2,1)" });
    gridAnimations.set(node, animation);
    animation.finished.catch(() => {}).finally(() => {
      if (gridAnimations.get(node) === animation) gridAnimations.delete(node);
    });
  }
}

// One delegated listener per app root; rerendering the shell never stacks
// listeners. Feedback decorates the existing actions without delaying them.
const feedbackRoots = new WeakSet();
export function installMotionFeedback(root) {
  if (!root || feedbackRoots.has(root)) return;
  feedbackRoots.add(root);
  root.addEventListener("click", event => {
    if (prefersReducedMotion()) return;
    const control = event.target.closest?.(".detail-fav-button, .wz-favorite-toggle, .quick-status-btn, .bottom-nav-item, .journal-mode-btn, .upcoming-type-btn, .profile-period-switch button, .profile-media-switch button");
    if (!control || control.disabled || !control.animate) return;
    control.animate([
      { scale: "1" }, { scale: ".94", offset: .35 }, { scale: "1" },
    ], { duration: 190, easing: "cubic-bezier(.22,.8,.2,1)" });
  });
}
