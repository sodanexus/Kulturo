// ============================================================
// Kulturo 4 — base locale IndexedDB, isolée par utilisateur
// ============================================================

const DATABASE_NAME = "kulturo-local-v4";
const DATABASE_VERSION = 2;
const STORE_ENTRIES = "entries";
const STORE_EVENTS = "events";
const STORE_MUTATIONS = "mutations";
const STORE_META = "meta";

function ownerKey(ownerId, id) {
  return `${String(ownerId)}:${String(id)}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB indisponible"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Transaction locale impossible"));
    transaction.onabort = () => reject(transaction.error || new Error("Transaction locale annulée"));
  });
}

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanRecord(value) {
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, item]) => [key, item]));
}

function mutationId() {
  return globalThis.crypto?.randomUUID?.()
    || `mutation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function coalesceMutation(existing, incoming, entry) {
  if (!existing) return incoming;
  if (existing.operation === "create" && incoming.operation === "update") {
    return {
      ...existing,
      payload: cleanRecord(entry || { ...existing.payload, ...incoming.payload }),
      availableAt: incoming.availableAt,
      revision: incoming.revision,
    };
  }
  if (existing.operation === "create" && incoming.operation === "delete") return null;
  if (existing.operation === "update" && incoming.operation === "update") {
    return {
      ...existing,
      payload: { ...existing.payload, ...incoming.payload },
      availableAt: incoming.availableAt,
      revision: incoming.revision,
    };
  }
  if (incoming.operation === "delete") {
    return {
      ...incoming,
      // Annuler doit restaurer le dernier aperçu local, puis remettre dans la
      // file l'écriture qui précédait la suppression.
      previous: incoming.previous || existing.previous,
      undoMutation: cleanRecord(existing),
    };
  }
  return incoming;
}

function createStores(database, transaction) {
  if (!database.objectStoreNames.contains(STORE_ENTRIES)) {
    const entries = database.createObjectStore(STORE_ENTRIES, { keyPath: "key" });
    entries.createIndex("ownerId", "ownerId", { unique: false });
  }
  if (!database.objectStoreNames.contains(STORE_EVENTS)) {
    const events = database.createObjectStore(STORE_EVENTS, { keyPath: "key" });
    events.createIndex("ownerId", "ownerId", { unique: false });
  }
  if (!database.objectStoreNames.contains(STORE_MUTATIONS)) {
    const mutations = database.createObjectStore(STORE_MUTATIONS, { keyPath: "queueId" });
    mutations.createIndex("ownerId", "ownerId", { unique: false });
  }
  if (!database.objectStoreNames.contains(STORE_META)) {
    const meta = database.createObjectStore(STORE_META, { keyPath: "key" });
    meta.createIndex("ownerId", "ownerId", { unique: false });
  } else {
    const meta = transaction.objectStore(STORE_META);
    if (!meta.indexNames.contains("ownerId")) meta.createIndex("ownerId", "ownerId", { unique: false });
  }
}

export function createLocalDatabase(options = {}) {
  const indexedDBFactory = options.indexedDB || globalThis.indexedDB;
  let opening = null;

  function open() {
    if (!indexedDBFactory) return Promise.resolve(null);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDBFactory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => createStores(request.result, request.transaction);
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible"));
      request.onblocked = () => console.warn("[Local] Migration en attente de la fermeture d’un ancien onglet.");
    }).catch(error => {
      opening = null;
      console.warn("[Local] Base IndexedDB indisponible :", error);
      return null;
    });
    return opening;
  }

  async function recordsForOwner(storeName, ownerId, transaction = null) {
    const database = await open();
    if (!database || !ownerId) return [];
    const ownTransaction = transaction || database.transaction(storeName, "readonly");
    const store = ownTransaction.objectStore(storeName);
    const index = store.index("ownerId");
    const records = await requestResult(index.getAll(String(ownerId)));
    return records || [];
  }

  async function replaceOwnerRecords(storeName, ownerId, values) {
    const database = await open();
    if (!database || !ownerId) return false;
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const existing = await requestResult(store.index("ownerId").getAll(String(ownerId)));
    existing.forEach(record => store.delete(record.key));
    for (const value of values || []) {
      if (!value?.id) continue;
      store.put({
        key: ownerKey(ownerId, value.id),
        ownerId: String(ownerId),
        id: String(value.id),
        value: cleanRecord(value),
      });
    }
    await transactionDone(transaction);
    return true;
  }

  async function getEntries(ownerId) {
    return (await recordsForOwner(STORE_ENTRIES, ownerId)).map(record => cloneValue(record.value));
  }

  async function getEntry(ownerId, id) {
    const database = await open();
    if (!database || !ownerId || !id) return null;
    const transaction = database.transaction(STORE_ENTRIES, "readonly");
    const record = await requestResult(transaction.objectStore(STORE_ENTRIES).get(ownerKey(ownerId, id)));
    return record?.value ? cloneValue(record.value) : null;
  }

  async function replaceEntries(ownerId, entries) {
    const replaced = await replaceOwnerRecords(STORE_ENTRIES, ownerId, entries);
    if (replaced) await setMeta(ownerId, "library-snapshot", true).catch(() => false);
    return replaced;
  }

  async function putEntry(ownerId, entry) {
    const database = await open();
    if (!database || !ownerId || !entry?.id) return false;
    const transaction = database.transaction(STORE_ENTRIES, "readwrite");
    transaction.objectStore(STORE_ENTRIES).put({
      key: ownerKey(ownerId, entry.id),
      ownerId: String(ownerId),
      id: String(entry.id),
      value: cleanRecord(entry),
    });
    await transactionDone(transaction);
    await setMeta(ownerId, "library-snapshot", true).catch(() => false);
    return true;
  }

  async function getEvents(ownerId) {
    return (await recordsForOwner(STORE_EVENTS, ownerId))
      .map(record => cloneValue(record.value))
      .sort((a, b) => String(b.occurred_at || "").localeCompare(String(a.occurred_at || "")));
  }

  async function replaceEvents(ownerId, events) {
    const replaced = await replaceOwnerRecords(STORE_EVENTS, ownerId, events);
    if (replaced) await setMeta(ownerId, "journal-snapshot", true).catch(() => false);
    return replaced;
  }

  async function setMeta(ownerId, name, value) {
    const database = await open();
    if (!database || !ownerId || !name) return false;
    const transaction = database.transaction(STORE_META, "readwrite");
    transaction.objectStore(STORE_META).put({
      key: ownerKey(ownerId, `meta:${name}`),
      ownerId: String(ownerId),
      name: String(name),
      value: cloneValue(value),
    });
    await transactionDone(transaction);
    return true;
  }

  async function getMeta(ownerId, name, fallback = null) {
    const database = await open();
    if (!database || !ownerId || !name) return fallback;
    const transaction = database.transaction(STORE_META, "readonly");
    const record = await requestResult(transaction.objectStore(STORE_META).get(ownerKey(ownerId, `meta:${name}`)));
    return record ? cloneValue(record.value) : fallback;
  }

  async function hasEventSnapshot(ownerId) {
    return Boolean(await getMeta(ownerId, "journal-snapshot", false));
  }

  async function hasEntrySnapshot(ownerId) {
    return Boolean(await getMeta(ownerId, "library-snapshot", false));
  }

  async function getMutations(ownerId) {
    return (await recordsForOwner(STORE_MUTATIONS, ownerId))
      .map(record => cloneValue(record))
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  // L’entrée optimiste et sa mutation sont écrites dans une même transaction :
  // un arrêt brutal ne peut pas conserver l’une sans l’autre.
  async function stageMutation(ownerId, mutation, entry = null) {
    const database = await open();
    if (!database || !ownerId || !mutation?.targetId) return null;
    const transaction = database.transaction([STORE_ENTRIES, STORE_MUTATIONS], "readwrite");
    const entries = transaction.objectStore(STORE_ENTRIES);
    const mutations = transaction.objectStore(STORE_MUTATIONS);
    const ownerMutations = await requestResult(mutations.index("ownerId").getAll(String(ownerId)));
    const matching = ownerMutations.filter(item => String(item.targetId) === String(mutation.targetId));
    const previous = matching.at(-1) || null;
    const normalized = {
      queueId: mutation.queueId || previous?.queueId || mutationId(),
      ownerId: String(ownerId),
      entity: "media",
      operation: mutation.operation,
      targetId: String(mutation.targetId),
      payload: cleanRecord(mutation.payload || {}),
      previous: cleanRecord(mutation.previous || previous?.previous || null),
      createdAt: previous?.createdAt || mutation.createdAt || Date.now(),
      availableAt: mutation.availableAt || Date.now(),
      attempts: previous?.attempts || 0,
      revision: mutationId(),
    };
    const coalesced = coalesceMutation(previous, normalized, entry);
    matching.forEach(item => mutations.delete(item.queueId));
    if (coalesced) mutations.put(coalesced);

    const key = ownerKey(ownerId, mutation.targetId);
    if (mutation.operation === "delete") entries.delete(key);
    else if (entry) entries.put({
      key,
      ownerId: String(ownerId),
      id: String(mutation.targetId),
      value: cleanRecord(entry),
    });
    await transactionDone(transaction);
    await setMeta(ownerId, "library-snapshot", true).catch(() => false);
    return coalesced ? cloneValue(coalesced) : null;
  }

  async function resolveMutation(ownerId, mutation, canonicalEntry = null) {
    const database = await open();
    if (!database || !ownerId || !mutation?.queueId) return false;
    const transaction = database.transaction([STORE_ENTRIES, STORE_MUTATIONS], "readwrite");
    const mutations = transaction.objectStore(STORE_MUTATIONS);
    const current = await requestResult(mutations.get(mutation.queueId));
    // Une mutation plus récente a pu remplacer celle qui vient de finir.
    if (!current || String(current.ownerId) !== String(ownerId)) {
      const entryRecord = await requestResult(
        transaction.objectStore(STORE_ENTRIES).get(ownerKey(ownerId, mutation.targetId))
      );
      const ownerMutations = await requestResult(mutations.index("ownerId").getAll(String(ownerId)));
      const hasReplacement = ownerMutations.some(item => String(item.targetId) === String(mutation.targetId));
      if (!hasReplacement && mutation.operation === "create" && !entryRecord) {
        // La création distante a fini juste après une suppression locale : une
        // suppression compensatoire empêche le média de réapparaître au refetch.
        mutations.put({
          queueId: mutationId(), ownerId: String(ownerId), entity: "media",
          operation: "delete", targetId: String(mutation.targetId), payload: {}, previous: null,
          createdAt: Date.now(), availableAt: Date.now(), attempts: 0, revision: mutationId(),
        });
      } else if (!hasReplacement && mutation.operation === "delete" && entryRecord?.value) {
        // Symétriquement, une suppression déjà partie au moment de « Annuler »
        // est compensée par la recréation de l'aperçu restauré.
        mutations.put({
          queueId: mutationId(), ownerId: String(ownerId), entity: "media",
          operation: "create", targetId: String(mutation.targetId),
          payload: cleanRecord(entryRecord.value), previous: null,
          createdAt: Date.now(), availableAt: Date.now(), attempts: 0, revision: mutationId(),
        });
      }
      await transactionDone(transaction);
      return false;
    }
    // Une action plus récente peut avoir été fusionnée pendant la requête.
    // La réponse ancienne ne doit ni l'effacer, ni remplacer son aperçu local.
    if (current.revision !== mutation.revision) {
      if (mutation.operation === "create" && canonicalEntry) {
        current.operation = "update";
        current.previous = cleanRecord(canonicalEntry);
        current.availableAt = Date.now();
        mutations.put(current);
      } else if (mutation.operation === "delete") {
        const restored = await requestResult(
          transaction.objectStore(STORE_ENTRIES).get(ownerKey(ownerId, mutation.targetId))
        );
        if (restored?.value) {
          current.operation = "create";
          current.payload = cleanRecord(restored.value);
          current.availableAt = Date.now();
          mutations.put(current);
        }
      }
      await transactionDone(transaction);
      return false;
    }
    mutations.delete(mutation.queueId);
    if (canonicalEntry?.id) {
      transaction.objectStore(STORE_ENTRIES).put({
        key: ownerKey(ownerId, canonicalEntry.id),
        ownerId: String(ownerId),
        id: String(canonicalEntry.id),
        value: cleanRecord(canonicalEntry),
      });
    }
    await transactionDone(transaction);
    return true;
  }

  async function markMutationFailure(ownerId, mutation) {
    const database = await open();
    if (!database || !ownerId || !mutation?.queueId) return;
    const transaction = database.transaction(STORE_MUTATIONS, "readwrite");
    const store = transaction.objectStore(STORE_MUTATIONS);
    const current = await requestResult(store.get(mutation.queueId));
    if (current && String(current.ownerId) === String(ownerId)) {
      current.attempts = Number(current.attempts || 0) + 1;
      current.lastAttemptAt = Date.now();
      store.put(current);
    }
    await transactionDone(transaction);
  }

  async function undoDelete(ownerId, targetId) {
    const database = await open();
    if (!database || !ownerId || !targetId) return null;
    const transaction = database.transaction([STORE_ENTRIES, STORE_MUTATIONS], "readwrite");
    const mutations = transaction.objectStore(STORE_MUTATIONS);
    const all = await requestResult(mutations.index("ownerId").getAll(String(ownerId)));
    const pending = all.find(item => item.operation === "delete" && String(item.targetId) === String(targetId));
    if (!pending?.previous) {
      await transactionDone(transaction);
      return null;
    }
    mutations.delete(pending.queueId);
    if (pending.undoMutation) {
      mutations.put({
        ...cleanRecord(pending.undoMutation),
        availableAt: Date.now(),
        revision: mutationId(),
      });
    }
    transaction.objectStore(STORE_ENTRIES).put({
      key: ownerKey(ownerId, targetId), ownerId: String(ownerId), id: String(targetId),
      value: cleanRecord(pending.previous),
    });
    await transactionDone(transaction);
    return cloneValue(pending.previous);
  }

  async function clearOwner(ownerId) {
    const database = await open();
    if (!database || !ownerId) return;
    const stores = [STORE_ENTRIES, STORE_EVENTS, STORE_MUTATIONS, STORE_META];
    const transaction = database.transaction(stores, "readwrite");
    for (const storeName of stores) {
      const store = transaction.objectStore(storeName);
      const records = await requestResult(store.index("ownerId").getAll(String(ownerId)));
      records.forEach(record => store.delete(record.key || record.queueId));
    }
    await transactionDone(transaction);
  }

  return {
    open, getEntries, getEntry, putEntry, replaceEntries, getEvents, replaceEvents,
    setMeta, getMeta, hasEntrySnapshot, hasEventSnapshot,
    getMutations, stageMutation, resolveMutation, markMutationFailure,
    undoDelete, clearOwner,
  };
}
