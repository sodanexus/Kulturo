// ============================================================
// Accent de jaquette — extraction légère et non bloquante
// ============================================================

const accentCache = new Map();
const pendingAccents = new Map();
const MAX_ACCENT_CACHE = 120;
const ACCENT_CACHE_VERSION = "4";
const ACCENT_CACHE_VERSION_KEY = "kulturo-cover-accent-version";
const ACCENT_CACHE_STORAGE_KEY = "kulturo-cover-accents-v4";
let storageHydrated = false;

function ensureStorageVersion() {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(ACCENT_CACHE_VERSION_KEY) !== ACCENT_CACHE_VERSION) {
      localStorage.removeItem(ACCENT_CACHE_STORAGE_KEY);
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
      if (typeof key === "string" && accent?.accent && accent?.accent2 && accent?.system) {
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

function quantizedColor(data) {
  const buckets = new Map();
  let fallback = { r: 216, g: 180, b: 106, weight: 0 };

  for (let index = 0; index < data.length; index += 16) {
    const alpha = (data[index + 3] || 255) / 255;
    if (alpha < .45) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
    const saturation = max ? (max - min) / max : 0;
    const fallbackWeight = 1 + saturation * 2;

    // Les gris quasi blancs/noirs sont peu utiles comme couleur d'interface,
    // mais restent disponibles comme repli si la couverture est monochrome.
    if (luminance > .055 && luminance < .96 && saturation > .08) {
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const key = `${qr},${qg},${qb}`;
      const bucket = buckets.get(key) || { r: qr, g: qg, b: qb, weight: 0 };
      bucket.weight += fallbackWeight * (1 + (1 - Math.abs(luminance - .56)));
      buckets.set(key, bucket);
    }
    if (fallbackWeight > fallback.weight) fallback = { r, g, b, weight: fallbackWeight };
  }

  return [...buckets.values()].sort((a, b) => b.weight - a.weight)[0] || fallback;
}

function accentFromRGB(red, green, blue) {
  const { h, s, l } = rgbToHsl(red, green, blue);
  const saturation = clamp(Math.max(s * 100, 42), 42, 78);
  const lightness = clamp(52 + l * 18, 52, 70);
  const secondaryLightness = clamp(lightness + 11, 60, 82);
  const hue = Number(h.toFixed(1));
  const sat = Number(saturation.toFixed(1));
  const glowLightness = clamp(lightness - 8, 42, 64);
  const systemLightness = 10;

  return {
    accent: `hsl(${hue} ${sat}% ${Number(lightness.toFixed(1))}%)`,
    accent2: `hsl(${hue} ${sat}% ${Number(secondaryLightness.toFixed(1))}%)`,
    glow: `hsl(${hue} ${sat}% ${Number(glowLightness.toFixed(1))}% / .18)`,
    system: `hsl(${hue} ${Math.min(58, sat)}% ${systemLightness}%)`,
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
    const color = quantizedColor(data);
    return accentFromRGB(color.r, color.g, color.b);
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
  element.dataset.coverAccent = "dominant";
  return true;
}
