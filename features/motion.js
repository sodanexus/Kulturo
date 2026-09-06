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
