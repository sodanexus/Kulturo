// ============================================================
// Coordination des chargements asynchrones
// ============================================================

// Chaque nouveau travail invalide le précédent. Une réponse tardive peut
// terminer sa requête réseau, mais ne peut plus modifier l'état ni le DOM.
export function createAsyncGate() {
  let generation = 0;
  let controller = null;

  function begin() {
    controller?.abort();
    controller = new AbortController();
    return Object.freeze({
      generation: ++generation,
      signal: controller.signal,
    });
  }

  function isCurrent(task) {
    return Boolean(task && task.generation === generation && !task.signal.aborted);
  }

  function commit(task, callback) {
    if (!isCurrent(task)) return false;
    callback?.();
    return true;
  }

  function finish(task) {
    if (!isCurrent(task)) return false;
    controller = null;
    return true;
  }

  function cancel() {
    generation++;
    controller?.abort();
    controller = null;
  }

  return { begin, cancel, commit, finish, isCurrent };
}

export function sameOwner(owner, currentOwner) {
  return owner != null && String(owner) === String(currentOwner ?? "");
}
