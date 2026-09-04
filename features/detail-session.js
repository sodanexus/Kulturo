// ============================================================
// Fiche média — cycle de vie des requêtes, minuteries et images
// ============================================================

export function createDetailSessionManager(options = {}) {
  const setTimer = options.setTimer || globalThis.setTimeout;
  const clearTimer = options.clearTimer || globalThis.clearTimeout;
  const createAbortController = options.createAbortController || (() => new AbortController());
  const onDispose = typeof options.onDispose === "function" ? options.onDispose : () => {};
  let sequence = 0;
  let active = null;

  function isCurrent(sessionId) {
    return Boolean(active && active.id === sessionId);
  }

  function isActive(sessionId, entryId = null) {
    return Boolean(
      isCurrent(sessionId) &&
      !active.disposed &&
      !active.closing &&
      (entryId == null || active.entryId === String(entryId))
    );
  }

  function currentId() {
    return active?.id || 0;
  }

  function activeId(entryId = null) {
    if (!active || active.disposed || active.closing) return 0;
    if (entryId != null && active.entryId !== String(entryId)) return 0;
    return active.id;
  }

  function signal(sessionId) {
    return isActive(sessionId) ? active.controller.signal : null;
  }

  function dispose(sessionId = currentId()) {
    const session = active;
    if (!session || (sessionId && session.id !== sessionId)) return false;
    session.disposed = true;
    session.controller.abort();
    session.timers.forEach(timer => clearTimer(timer));
    session.timers.clear();
    session.images.forEach(image => {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute?.("src");
    });
    session.images.clear();
    onDispose(session);
    if (active === session) active = null;
    return true;
  }

  function begin(entryId) {
    dispose();
    active = {
      id: ++sequence,
      entryId: String(entryId || ""),
      timers: new Set(),
      images: new Set(),
      controller: createAbortController(),
      disposed: false,
      closing: false,
    };
    return active.id;
  }

  function startClosing(sessionId = currentId()) {
    if (!isCurrent(sessionId) || active.disposed) return 0;
    active.closing = true;
    active.controller.abort();
    return active.id;
  }

  function schedule(callback, delay, sessionId = activeId()) {
    const session = active;
    if (!session || session.id !== sessionId || session.disposed || session.closing) return 0;
    const timer = setTimer(() => {
      session.timers.delete(timer);
      if (isActive(sessionId)) callback();
    }, delay);
    session.timers.add(timer);
    return timer;
  }

  function trackImage(image, sessionId = activeId()) {
    const session = active;
    if (!image || !session || session.id !== sessionId || session.disposed || session.closing) return () => {};
    session.images.add(image);
    return () => session.images.delete(image);
  }

  return {
    activeId,
    begin,
    currentId,
    dispose,
    isActive,
    isCurrent,
    schedule,
    signal,
    startClosing,
    trackImage,
  };
}
