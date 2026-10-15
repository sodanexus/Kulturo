// ============================================================
// Accent de jaquette — extraction légère et non bloquante
// ============================================================

const accentCache = new Map();
const pendingAccents = new Map();
const MAX_ACCENT_CACHE = 120;
const ACCENT_CACHE_VERSION = "5";
const ACCENT_CACHE_VERSION_KEY = "kulturo-cover-accent-version";
const ACCENT_CACHE_STORAGE_KEY = "kulturo-cover-accents-v5";
let storageHydrated = false;

function ensureStorageVersion() {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(ACCENT_CACHE_VERSION_KEY) !== ACCENT_CACHE_VERSION) {
      localStorage.removeItem(ACCENT_CACHE_STORAGE_KEY);
      localStorage.removeItem("kulturo-cover-accents-v4");
      localStorage.setItem(ACCENT_CACHE_VERSION_KEY, ACCENT_CACHE_VERSION);
    }
  } catch {}
}

function hydrateAccentCache() {
  if (storageHydrated) return;
  storageHydrated = true;
  ensureStorageVersion();
  if (typeof localStorage === "undefined") return;
  try {
    const stored = JSON.parse(localStorage.getItem(ACCENT_CACHE_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return;
    stored.slice(-MAX_ACCENT_CACHE).forEach(([key, accent]) => {
      if (typeof key === "string" && accent?.accent && accent?.accent2 && accent?.system && accent?.ambient && accent?.ambientSoft) {
        accentCache.set(key, accent);
      }
    });
  } catch {}
}

function persistAccentCache() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACCENT_CACHE_STORAGE_KEY, JSON.stringify([...accentCache.entries()].slice(-MAX_ACCENT_CACHE)));
  } catch {}
}

function rememberAccent(key, accent) {
  if (!accent) return;
  if (accentCache.size >= MAX_ACCENT_CACHE) accentCache.delete(accentCache.keys().next().value);
  accentCache.set(key, accent);
  persistAccentCache();
}

export function resetCoverAccentCache() {
  accentCache.clear();
  storageHydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ACCENT_CACHE_STORAGE_KEY);
    localStorage.setItem(ACCENT_CACHE_VERSION_KEY, ACCENT_CACHE_VERSION);
  } catch {}
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return { h: 0, s: 0, l: lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  switch (max) {
    case r: hue = ((g - b) / delta) % 6; break;
    case g: hue = (b - r) / delta + 2; break;
    default: hue = (r - g) / delta + 4; break;
  }
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s: saturation, l: lightness };
}

// Regrouper par familles de teintes plutôt que par triplets RGB exacts :
// un fond nuancé compte comme une même couleur et ne perd pas face à un logo uni.
export function accentFromPixels(data) {
  const buckets = new Map();
  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < .45) continue;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    const neutral = s < .12 || l < .045 || l > .97;
    const key = neutral ? 'neutral' : Math.round(h / 30) % 12;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0, score: 0, neutral };
    bucket.r += r * alpha; bucket.g += g * alpha; bucket.b += b * alpha;
    bucket.count += alpha;
    // La surface domine ; une couleur vive ne reçoit qu'un petit bonus.
    bucket.score += alpha * (neutral ? 1 : 1 + s * .15);
    buckets.set(key, bucket);
  }
  const winner = [...buckets.values()].sort((a, b) => b.score - a.score)[0];
  if (!winner) return null;
  return accentFromRGB(winner.r / winner.count, winner.g / winner.count, winner.b / winner.count, winner.neutral);
}

function accentFromRGB(red, green, blue, forceNeutral = false) {
  const { h, s, l } = rgbToHsl(red, green, blue);
  const neutral = forceNeutral || s < .12;
  const hue = neutral ? 0 : Number(h.toFixed(1));
  const sat = neutral ? 0 : Number(clamp(s * 100, 0, 72).toFixed(1));
  // Les commandes restent claires sur la fiche sombre. L'ambiance conserve
  // séparément la luminosité et la saturation de la couleur source.
  const lightness = Number(clamp(60 + l * 12, 60, 72).toFixed(1));
  const ambientSat = neutral ? 0 : Number(clamp(s * 100, 0, 85).toFixed(1));
  const ambientLight = Number(clamp(l * 100, 12, 64).toFixed(1));
  return {
    accent: `hsl(${hue} ${sat}% ${lightness}%)`,
    accent2: `hsl(${hue} ${sat}% ${Math.min(82, lightness + 10)}%)`,
    ambient: `hsl(${hue} ${ambientSat}% ${ambientLight}%)`,
    ambientSoft: `hsl(${hue} ${ambientSat}% ${Math.min(74, ambientLight + 10)}%)`,
    glow: `hsl(${hue} ${ambientSat}% ${ambientLight}% / .16)`,
    system: `hsl(${hue} ${Math.min(40, ambientSat)}% 10%)`,
    hue,
  };
}

export function accentFromSample(red, green, blue) {
  return accentFromRGB(
    clamp(Number(red) || 0, 0, 255),
    clamp(Number(green) || 0, 0, 255),
    clamp(Number(blue) || 0, 0, 255),
  );
}

// Les affiches TMDb sont souvent déjà présentes dans le cache mémoire du
// navigateur après le rendu de la grille. Certains moteurs réutilisent alors
// cette première réponse chargée sans CORS pour le second <img>, même si
// crossOrigin est défini avant src. Une URL d'analyse distincte force une
// réponse CORS propre, sans modifier l'URL enregistrée ni l'image affichée.
export function accentImageRequestUrl(value) {
  const cleanUrl = String(value || "").trim();
  if (!cleanUrl) return "";
  try {
    const url = new URL(cleanUrl);
    if (url.hostname === "image.tmdb.org") {
      url.searchParams.set("kulturo-accent", ACCENT_CACHE_VERSION);
      return url.href;
    }
  } catch {}
  return cleanUrl;
}

function sampleImage(image) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 28;
    canvas.height = 28;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return accentFromPixels(data);
  } catch {
    // Les images distantes sans en-tête CORS ne peuvent pas être lues par un
    // canvas. Le composant conserve alors son accent de secours.
    return null;
  }
}

export function coverAccentForUrl(url) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl || typeof Image === "undefined") return Promise.resolve(null);
  hydrateAccentCache();
  const key = cleanUrl;
  if (accentCache.has(key)) return Promise.resolve(accentCache.get(key));
  if (pendingAccents.has(key)) return pendingAccents.get(key);

  const promise = new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      pendingAccents.delete(key);
      // Un échec réseau, un timeout ou une protection CORS ne doit pas rester
      // mémorisé : la prochaine ouverture pourra retenter l'analyse.
      rememberAccent(key, value);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 7000);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.onload = () => finish(sampleImage(image));
    image.onerror = () => finish(null);
    image.src = accentImageRequestUrl(cleanUrl);
  });
  pendingAccents.set(key, promise);
  return promise;
}

export function applyCoverAccent(element, accent) {
  if (!element || !accent) return false;
  element.style.setProperty("--accent", accent.accent);
  element.style.setProperty("--accent-2", accent.accent2);
  element.style.setProperty("--accent-glow", accent.glow);
  element.style.setProperty("--cover-ambient", accent.ambient);
  element.style.setProperty("--cover-ambient-soft", accent.ambientSoft);
  element.dataset.coverAccent = "dominant";
  return true;
}
