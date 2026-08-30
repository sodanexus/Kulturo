// ============================================================
// Couche réseau commune — annulation, cache, délai et reprise
// ============================================================

export const API_CACHE_TTL = Object.freeze({
  search: 5 * 60_000,
  upcoming: 30 * 60_000,
  detail: 6 * 60 * 60_000,
  translation: 24 * 60 * 60_000,
});

const responseCache = new Map();
const pendingRequests = new Map();

function abortError(message = "Requête annulée") {
  if (typeof DOMException === "function") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function requestKey(url, method, body, explicitKey) {
  if (explicitKey) return explicitKey;
  return `${method}:${url}:${typeof body === "string" ? body : ""}`;
}

function cachedValue(key) {
  const cached = responseCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

async function performRequest(url, options, key) {
  const {
    timeoutMs,
    retries,
    retryDelayMs,
    cacheTtlMs,
    signal,
    ...fetchOptions
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw abortError();

    const controller = new AbortController();
    let timedOut = false;
    const relayAbort = () => controller.abort();
    signal?.addEventListener("abort", relayAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const value = await response.json();
      if (cacheTtlMs > 0) {
        responseCache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
      }
      return value;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) {
        const timeoutError = new Error(`Délai maximal dépassé (${timeoutMs} ms)`);
        timeoutError.name = "TimeoutError";
        error = timeoutError;
      }
      const canRetry = attempt < retries && (
        error?.name === "TimeoutError" || error instanceof TypeError || retryableStatus(Number(error?.status || 0))
      );
      if (!canRetry) throw error;
      await wait(retryDelayMs * (attempt + 1), signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relayAbort);
    }
  }
  throw new Error("Requête impossible");
}

export async function requestJSON(url, options = {}) {
  const {
    timeoutMs = 8_000,
    retries = 1,
    retryDelayMs = 220,
    cachePolicy = null,
    cacheTtlMs = cachePolicy ? (API_CACHE_TTL[cachePolicy] || 0) : 0,
    cacheKey = null,
    dedupe = true,
    signal = null,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const key = requestKey(url, method, fetchOptions.body, cacheKey);
  const cached = cacheTtlMs > 0 ? cachedValue(key) : undefined;
  if (cached !== undefined) return cached;

  // Une recherche annulable ne partage pas son contrôleur avec une ancienne
  // saisie. Les autres requêtes identiques sont dédupliquées automatiquement.
  if (dedupe && !signal && pendingRequests.has(key)) return pendingRequests.get(key);

  const promise = performRequest(url, {
    ...fetchOptions,
    timeoutMs,
    retries,
    retryDelayMs,
    cacheTtlMs,
    signal,
  }, key).finally(() => {
    if (pendingRequests.get(key) === promise) pendingRequests.delete(key);
  });

  if (dedupe && !signal) pendingRequests.set(key, promise);
  return promise;
}

export function clearApiCache(predicate = null) {
  if (typeof predicate !== "function") {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (predicate(key)) responseCache.delete(key);
  }
}

export function apiCacheStats() {
  const now = Date.now();
  let valid = 0;
  for (const value of responseCache.values()) if (value.expiresAt > now) valid++;
  return { cached: valid, pending: pendingRequests.size };
}
