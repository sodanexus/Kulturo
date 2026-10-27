// Cache facultatif de réponses publiques, séparé de la bibliothèque personnelle.
const DAY = 86400_000;
export const CATALOGUE_TTL = Object.freeze({ daily: DAY, metadata: 7 * DAY, images: 30 * DAY });
const MAX_AGE = 90 * DAY;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 200;
let database;
function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (database) return database;
  database = new Promise(resolve => {
    let settled = false;
    const finish = db => { if (settled) { db?.close(); return; } settled = true; clearTimeout(timer); resolve(db); };
    const timer = setTimeout(() => finish(null), 700);
    try {
      const request = indexedDB.open('kulturo-catalogue-cache-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('responses', { keyPath: 'key' });
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; finish(db); };
      request.onerror = request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  return database;
}
async function transaction(mode, work) {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise(resolve => {
    let result = null, tx;
    const timer = setTimeout(() => { try { tx?.abort(); } catch {} resolve(null); }, 700);
    const finish = value => { clearTimeout(timer); resolve(value); };
    try {
      tx = db.transaction('responses', mode);
      tx.oncomplete = () => finish(result);
      tx.onerror = tx.onabort = () => finish(null);
      work(tx.objectStore('responses'), value => { result = value; });
    } catch { finish(null); }
  });
}
export const catalogueStore = {
  get(key) { return transaction('readonly', (store, done) => { const req = store.get(key); req.onsuccess = () => done(req.result); }); },
  put(record) {
    return transaction('readwrite', store => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result.filter(row => row.key !== record.key);
        rows.push(record);
        rows.sort((a, b) => b.usedAt - a.usedAt);
        let bytes = 0, count = 0;
        for (const row of rows) {
          if (Date.now() - row.savedAt > MAX_AGE || ++count > MAX_ENTRIES || (bytes += row.bytes) > MAX_BYTES) store.delete(row.key);
          else store.put(row);
        }
      };
    });
  },
};
const abort = () => new DOMException('Requête annulée', 'AbortError');
// Les erreurs, réponses négatives et résultats vides ne sont pas persistés.
export function usableCatalogueValue(value) {
  return Boolean(value && typeof value === 'object' && !value.error && !value.errors && value.success !== false &&
    (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0));
}
export function createCatalogueCache(store = catalogueStore, now = Date.now) {
  const refreshing = new Map();
  return async function cachedRequest(key, policy, load, { signal, fresh = false } = {}) {
    if (signal?.aborted) throw abort();
    const ttl = CATALOGUE_TTL[policy];
    if (!ttl) return load();
    const update = async (force = false) => {
      const value = await load(force);
      if (signal?.aborted) throw abort();
      if (usableCatalogueValue(value)) {
        try {
          const bytes = JSON.stringify(value).length * 2;
          if (bytes <= 512 * 1024) await store.put({ key, value, bytes, savedAt: now(), usedAt: now(), expiresAt: now() + ttl });
        } catch { /* Quota ou stockage refusé : le réseau reste utilisable. */ }
      }
      return value;
    };
    if (fresh) return update(true);
    let cached;
    try { cached = await store.get(key); } catch { /* Cache facultatif. */ }
    if (signal?.aborted) throw abort();
    if (cached && usableCatalogueValue(cached.value) && now() - cached.savedAt <= MAX_AGE && cached.savedAt <= now()) {
      try { void Promise.resolve(store.put({ ...cached, usedAt: now() })).catch(() => {}); } catch { /* Stockage facultatif. */ }
      if (cached.expiresAt <= now() && !refreshing.has(key)) {
        const promise = update(true).catch(() => {}).finally(() => { if (refreshing.get(key) === promise) refreshing.delete(key); });
        refreshing.set(key, promise);
      }
      // Pas de mutation de la fiche ouverte : la nouvelle réponse sert à la prochaine consultation.
      return structuredClone(cached.value);
    }
    return update();
  };
}
