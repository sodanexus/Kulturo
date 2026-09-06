// ============================================================
// Kulturo 4 — dépôt média local-first et synchronisation cloud
// ============================================================

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function internalFree(value, omitted = []) {
  const blocked = new Set(["user_id", ...omitted]);
  return Object.fromEntries(Object.entries(value || {})
    .filter(([key]) => !key.startsWith("_") && !blocked.has(key)));
}

function localId() {
  return globalThis.crypto?.randomUUID?.()
    || `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

export function mergeRemoteWithMutations(remoteEntries, localEntries, mutations) {
  const merged = new Map((remoteEntries || []).map(entry => [String(entry.id), clone(entry)]));
  const local = new Map((localEntries || []).map(entry => [String(entry.id), clone(entry)]));
  for (const mutation of mutations || []) {
    const id = String(mutation.targetId);
    if (mutation.operation === "delete") {
      merged.delete(id);
      continue;
    }
    const base = local.get(id) || merged.get(id) || { id };
    merged.set(id, { ...base, _syncState: "pending" });
  }
  return [...merged.values()].sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}

export function createMediaRepository({ remote, database, getOwnerId, isOnline = () => navigator.onLine !== false }) {
  let syncState = "idle";
  let pendingCount = 0;
  let lastError = null;
  let flushPromise = null;
  let flushTimer = 0;
  let cachePromise = Promise.resolve();
  let cacheGeneration = 0;
  let memoryOwner = null;
  let memorySnapshotOwner = null;
  let memoryEntries = [];
  const listeners = new Set();

  function remember(ownerId, entries) {
    memoryOwner = String(ownerId);
    memoryEntries = (entries || []).map(entry => clone(entry));
    return memoryEntries;
  }

  function remembered(ownerId) {
    return memoryOwner === String(ownerId) ? memoryEntries.map(entry => clone(entry)) : [];
  }

  function markMemorySnapshot(ownerId) {
    memorySnapshotOwner = String(ownerId);
  }

  function rememberEntry(ownerId, entry) {
    const current = remembered(ownerId).filter(item => String(item.id) !== String(entry.id));
    remember(ownerId, [clone(entry), ...current]);
  }

  function forgetEntry(ownerId, id) {
    remember(ownerId, remembered(ownerId).filter(item => String(item.id) !== String(id)));
  }

  function owner() {
    const value = getOwnerId?.();
    if (!value) throw new Error("Session expirée");
    return String(value);
  }

  function snapshot() {
    return { state: syncState, pending: pendingCount, error: lastError };
  }

  function emit(state = syncState, error = lastError) {
    syncState = state;
    lastError = error || null;
    const detail = snapshot();
    listeners.forEach(listener => listener(detail));
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("kulturo:sync-state", { detail }));
    }
  }

  async function updatePending(ownerId = null) {
    const currentOwner = ownerId || owner();
    pendingCount = (await database.getMutations(currentOwner)).length;
    return pendingCount;
  }

  async function hydrate(fallbackEntries = []) {
    const ownerId = owner();
    const hadStoredSnapshot = Boolean(await database.hasEntrySnapshot?.(ownerId));
    let entries = await database.getEntries(ownerId);
    if (!entries.length && fallbackEntries.length) {
      entries = fallbackEntries.map(entry => internalFree(entry));
      await database.replaceEntries(ownerId, entries);
    }
    const mutations = await database.getMutations(ownerId);
    pendingCount = mutations.length;
    if (pendingCount) entries = mergeRemoteWithMutations([], entries, mutations);
    remember(ownerId, entries);
    if (hadStoredSnapshot || fallbackEntries.length) markMemorySnapshot(ownerId);
    emit(!isOnline() ? "offline" : pendingCount ? "pending" : "idle");
    return entries;
  }

  async function cache(entries) {
    const ownerId = owner();
    const generation = cacheGeneration;
    const values = (entries || []).map(entry => internalFree(entry));
    remember(ownerId, values);
    markMemorySnapshot(ownerId);
    // Plusieurs vues peuvent demander une mise en cache presque simultanément.
    // Leur ordre est conservé afin qu'une ancienne écriture, plus lente, ne
    // puisse jamais remplacer le dernier état affiché.
    cachePromise = cachePromise.catch(() => {}).then(async () => {
      if (String(getOwnerId?.() || "") !== ownerId) return false;
      const mutations = await database.getMutations(ownerId);
      if (generation !== cacheGeneration || String(getOwnerId?.() || "") !== ownerId) return false;
      // Une suppression locale en attente ne doit pas être réintroduite par un
      // ancien rendu encore présent dans une autre vue.
      const deleted = new Set(mutations.filter(item => item.operation === "delete").map(item => String(item.targetId)));
      await database.replaceEntries(ownerId, values.filter(entry => !deleted.has(String(entry.id))));
      pendingCount = mutations.length;
      return true;
    });
    return cachePromise;
  }

  function scheduleFlush(delay = 0) {
    clearTimeout(flushTimer);
    if (!isOnline()) return;
    flushTimer = setTimeout(() => flush().catch(() => {}), Math.max(0, delay));
  }

  async function flush(options = {}) {
    if (flushPromise) return flushPromise;
    const ownerId = owner();
    if (!isOnline()) {
      await updatePending(ownerId);
      emit("offline");
      return { pending: pendingCount, synced: 0 };
    }
    flushPromise = (async () => {
      let synced = 0;
      let mutations = await database.getMutations(ownerId);
      pendingCount = mutations.length;
      if (!mutations.length) {
        emit("synced");
        return { pending: 0, synced: 0 };
      }
      lastError = null;
      emit("syncing");
      for (const mutation of mutations) {
        if (String(getOwnerId?.() || "") !== ownerId) break;
        const wait = Number(mutation.availableAt || 0) - Date.now();
        if (wait > 0) {
          scheduleFlush(wait + 20);
          continue;
        }
        try {
          let canonical = null;
          if (mutation.operation === "create") {
            canonical = await remote.create(internalFree(mutation.payload));
          } else if (mutation.operation === "update") {
            canonical = await remote.update(mutation.targetId, internalFree(mutation.payload, ["id", "created_at", "updated_at"]));
          } else if (mutation.operation === "delete") {
            await remote.delete(mutation.targetId);
          }
          if (String(getOwnerId?.() || "") !== ownerId) break;
          await database.resolveMutation(ownerId, mutation, canonical);
          synced++;
        } catch (error) {
          await database.markMutationFailure(ownerId, mutation);
          lastError = error;
          break;
        }
      }
      const remainingMutations = await database.getMutations(ownerId);
      pendingCount = remainingMutations.length;
      // Un autre onglet peut avoir terminé la même mutation pendant notre
      // requête. Si la file est désormais vide, son éventuelle erreur de
      // doublon n'est plus un échec de synchronisation pour l'utilisateur.
      if (!pendingCount) lastError = null;
      emit(lastError ? "error" : pendingCount ? "pending" : "synced", lastError);
      if (!lastError && pendingCount) {
        const nextAvailableAt = Math.min(...remainingMutations.map(item => Number(item.availableAt || 0)));
        scheduleFlush(Math.max(0, nextAvailableAt - Date.now() + 20));
      } else if (lastError && pendingCount && isOnline()) {
        const attempts = Math.max(...remainingMutations.map(item => Number(item.attempts || 1)));
        scheduleFlush(Math.min(60_000, 1500 * (2 ** Math.min(attempts - 1, 6))));
      }
      if (lastError && options.throwOnError) throw lastError;
      return { pending: pendingCount, synced };
    })().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  async function getAll(options = {}) {
    const ownerId = owner();
    const storedEntries = await database.getEntries(ownerId);
    const localEntries = storedEntries.length ? storedEntries : remembered(ownerId);
    const hasLocalSnapshot = await database.hasEntrySnapshot?.(ownerId)
      || memorySnapshotOwner === ownerId
      || localEntries.length > 0;
    if (!isOnline()) {
      await updatePending(ownerId);
      emit("offline");
      if (hasLocalSnapshot) return mergeRemoteWithMutations([], localEntries, await database.getMutations(ownerId));
      throw new Error("Aucune bibliothèque locale disponible hors connexion");
    }
    await flush();
    try {
      const remoteEntries = await remote.getAll(options);
      if (String(getOwnerId?.() || "") !== ownerId) return [];
      const mutations = await database.getMutations(ownerId);
      const currentLocal = await database.getEntries(ownerId);
      const merged = mergeRemoteWithMutations(remoteEntries, currentLocal.length ? currentLocal : remembered(ownerId), mutations);
      await database.replaceEntries(ownerId, merged);
      remember(ownerId, merged);
      markMemorySnapshot(ownerId);
      pendingCount = mutations.length;
      emit(pendingCount ? "pending" : "synced");
      return merged;
    } catch (error) {
      pendingCount = (await database.getMutations(ownerId)).length;
      emit(isOnline() ? "error" : "offline", error);
      const storedCurrent = await database.getEntries(ownerId);
      const currentLocal = storedCurrent.length ? storedCurrent : remembered(ownerId);
      const hasCurrentSnapshot = await database.hasEntrySnapshot?.(ownerId)
        || memorySnapshotOwner === ownerId
        || currentLocal.length > 0;
      if (hasCurrentSnapshot) return mergeRemoteWithMutations([], currentLocal, await database.getMutations(ownerId));
      throw error;
    }
  }

  async function create(payload, options = {}) {
    if (options.signal?.aborted) throw new DOMException("Chargement annulé", "AbortError");
    const ownerId = owner();
    const now = new Date().toISOString();
    const entry = {
      ...internalFree(payload),
      id: payload?.id || localId(),
      user_id: ownerId,
      created_at: payload?.created_at || now,
      updated_at: now,
      _syncState: "pending",
    };
    const mutation = await database.stageMutation(ownerId, {
      operation: "create", targetId: entry.id, payload: internalFree(entry), availableAt: Date.now(),
    }, entry);
    if (!mutation) {
      if (!isOnline()) throw new Error("Le stockage local est indisponible hors connexion");
      const canonical = await remote.create(internalFree(entry));
      await database.putEntry(ownerId, canonical);
      rememberEntry(ownerId, canonical);
      markMemorySnapshot(ownerId);
      emit("synced");
      return canonical;
    }
    await updatePending(ownerId);
    emit(isOnline() ? "pending" : "offline");
    if (mutation && isOnline()) await flush();
    const result = { ...(await database.getEntry(ownerId, entry.id) || entry), _syncState: pendingCount ? "pending" : undefined };
    rememberEntry(ownerId, result);
    markMemorySnapshot(ownerId);
    return result;
  }

  async function update(id, changes, options = {}) {
    if (options.signal?.aborted) throw new DOMException("Chargement annulé", "AbortError");
    const ownerId = owner();
    let current = await database.getEntry(ownerId, id)
      || remembered(ownerId).find(entry => String(entry.id) === String(id));
    if (!current && isOnline()) {
      const canonical = await remote.update(id, internalFree(changes, ["id", "created_at", "updated_at"]), options);
      await database.putEntry(ownerId, canonical);
      rememberEntry(ownerId, canonical);
      markMemorySnapshot(ownerId);
      return canonical;
    }
    if (!current) throw new Error("Média local introuvable");
    const updated = { ...current, ...internalFree(changes), updated_at: new Date().toISOString(), _syncState: "pending" };
    const mutation = await database.stageMutation(ownerId, {
      operation: "update", targetId: id,
      payload: internalFree(changes, ["id", "created_at", "updated_at"]),
      previous: current, availableAt: Date.now(),
    }, updated);
    if (!mutation) {
      if (!isOnline()) throw new Error("Le stockage local est indisponible hors connexion");
      const canonical = await remote.update(id, internalFree(changes, ["id", "created_at", "updated_at"]), options);
      await database.putEntry(ownerId, canonical);
      rememberEntry(ownerId, canonical);
      emit("synced");
      return canonical;
    }
    await updatePending(ownerId);
    emit(isOnline() ? "pending" : "offline");
    if (isOnline()) await flush();
    const result = { ...(await database.getEntry(ownerId, id) || updated), _syncState: pendingCount ? "pending" : undefined };
    rememberEntry(ownerId, result);
    markMemorySnapshot(ownerId);
    return result;
  }

  async function remove(id, options = {}) {
    if (options.signal?.aborted) throw new DOMException("Chargement annulé", "AbortError");
    const ownerId = owner();
    const current = await database.getEntry(ownerId, id)
      || remembered(ownerId).find(entry => String(entry.id) === String(id));
    if (!current) return null;
    const before = await database.getMutations(ownerId);
    const cancelsPendingCreate = before.some(item => item.operation === "create" && String(item.targetId) === String(id));
    const undoDelay = Math.max(0, Number(options.undoDelay ?? 6500));
    const mutation = await database.stageMutation(ownerId, {
      operation: "delete", targetId: id, previous: current,
      availableAt: Date.now() + undoDelay,
    });
    if (!mutation && !cancelsPendingCreate) {
      if (!isOnline()) throw new Error("Le stockage local est indisponible hors connexion");
      await remote.delete(id, options);
      forgetEntry(ownerId, id);
      markMemorySnapshot(ownerId);
      emit("synced");
      return current;
    }
    forgetEntry(ownerId, id);
    markMemorySnapshot(ownerId);
    await updatePending(ownerId);
    emit(isOnline() ? "pending" : "offline");
    if (mutation) scheduleFlush(undoDelay + 20);
    return current;
  }

  async function undoDelete(id) {
    const ownerId = owner();
    const restored = await database.undoDelete(ownerId, id);
    if (restored) rememberEntry(ownerId, restored);
    await updatePending(ownerId);
    emit(!isOnline() ? "offline" : pendingCount ? "pending" : "synced");
    return restored;
  }

  async function clearOwner(ownerId) {
    clearTimeout(flushTimer);
    cacheGeneration++;
    if (ownerId) await database.clearOwner(ownerId);
    if (!ownerId || memoryOwner === String(ownerId)) {
      memoryOwner = null;
      memorySnapshotOwner = null;
      memoryEntries = [];
    }
    pendingCount = 0;
    emit("idle");
  }

  return {
    getAll, create, update, delete: remove, undoDelete, flush, hydrate, cache, clearOwner,
    getStatus: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
