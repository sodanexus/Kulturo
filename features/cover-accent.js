// ============================================================
// Accent de jaquette — extraction légère et non bloquante
// ============================================================

const accentCache = new Map();
const pendingAccents = new Map();
const MAX_ACCENT_CACHE = 120;
const ACCENT_CACHE_VERSION = "7";
const ACCENT_CACHE_VERSION_KEY = "kulturo-cover-accent-version";
const ACCENT_CACHE_STORAGE_KEY = "kulturo-cover-accents-v6";
let storageHydrated = false;

function ensureStorageVersion() {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(ACCENT_CACHE_VERSION_KEY) !== ACCENT_CACHE_VERSION) {
      localStorage.removeItem(ACCENT_CACHE_STORAGE_KEY);
      localStorage.removeItem("kulturo-cover-accents-v4");
      localStorage.removeItem("kulturo-cover-accents-v5");
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

// ── Espace perceptuel OKLCH ──────────────────────────────────
// La saturation HSL est trompeuse : un noir à peine teinté (5, 8, 18) y paraît
// « bleu saturé à 60 % » et pouvait donc choisir la teinte d'une affiche
// presque noire. En OKLCH, la chroma mesure ce que l'œil voit réellement : un
// noir ou un blanc teinté reste neutre, et seule une vraie couleur compte.
const toLinear = value => {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
};
const toGamma = value => {
  const channel = clamp(value, 0, 1);
  return 255 * (channel <= .0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - .055);
};

export function rgbToOklch(red, green, blue) {
  const r = toLinear(red), g = toLinear(green), b = toLinear(blue);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}

function oklchToLinear(L, C, hue) {
  const a = C * Math.cos(hue * Math.PI / 180);
  const b = C * Math.sin(hue * Math.PI / 180);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s,
  ];
}

// Ramène la chroma dans le gamut sRGB (au lieu de couper un canal, ce qui
// décalerait la teinte) puis renvoie la couleur en hsl().
function oklchToHsl(L, C, hue) {
  let chroma = C;
  for (let step = 0; step < 14; step++) {
    const rgb = oklchToLinear(L, chroma, hue);
    if (rgb.every(channel => channel >= -.0005 && channel <= 1.0005)) break;
    chroma *= .93;
  }
  const [r, g, b] = oklchToLinear(L, chroma, hue).map(toGamma);
  const { h, s, l } = rgbToHsl(r, g, b);
  return { h: Number(h.toFixed(1)), s: Number((s * 100).toFixed(1)), l: Number((l * 100).toFixed(1)) };
}

const hsl = ({ h, s, l }, alpha = null) => `hsl(${h} ${s}% ${l}%${alpha == null ? "" : ` / ${alpha}`})`;

// Poids d'un pixel dans le choix de la teinte : la chroma (une couleur vive
// compte plus qu'un fond terne) tempérée par la clarté (les noirs et les blancs
// profonds, où l'œil ne voit plus de teinte, ne votent presque pas).
function pixelWeight(L, C) {
  const dark = clamp((L - .14) / .2, 0, 1);
  const light = clamp((.98 - L) / .12, 0, 1);
  return C ** 1 * dark * dark * light;
}

const HUE_BINS = 36;
const MIN_CHROMA = .035;
const MIN_COLOR_COVERAGE = .08;

// Choisit la couleur caractéristique d'une affiche : on cherche d'abord la
// famille de teintes qui pèse le plus (surface × chroma, histogramme circulaire
// lissé pour qu'une teinte ne soit pas coupée entre deux cases), puis on en fait
// la moyenne dans l'espace OKLab. Une affiche presque sans couleur reste neutre.
// `options.width` active deux corrections de position : marges ignorées et
// bandeau de crédits du bas allégé.
export function accentFromPixels(data, options = {}) {
  const width = Number(options.width) || 0;
  const rows = width ? Math.floor(data.length / 4 / width) : 0;
  const pixels = [];
  let total = 0;
  let colored = 0;
  let lightSum = 0;
  const bins = new Array(HUE_BINS).fill(0);

  for (let index = 0; index + 3 < data.length; index += 4) {
    let alpha = data[index + 3] / 255;
    if (alpha < .45) continue;
    if (width) {
      const position = index / 4;
      const x = (position % width) / width;
      const y = Math.floor(position / width) / rows;
      if (x < .05 || x > .95 || y < .03 || y > .97) continue;
      if (y > .82) alpha *= .45;
    }
    const { L, C, h } = rgbToOklch(data[index], data[index + 1], data[index + 2]);
    total += alpha;
    lightSum += L * alpha;
    if (C < MIN_CHROMA) continue;
    const weight = alpha * pixelWeight(L, C);
    if (weight <= 0) continue;
    colored += alpha;
    pixels.push({ L, C, h, weight });
    bins[Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)))] += weight;
  }
  if (!total) return null;

  const meanLight = lightSum / total;
  if (colored / total < MIN_COLOR_COVERAGE) return accentFromOklch(meanLight, 0, 0, true);

  // Lissage circulaire [1 2 3 2 1] puis pic.
  const kernel = [1, 2, 3, 2, 1];
  let peak = 0, peakValue = -1;
  for (let bin = 0; bin < HUE_BINS; bin++) {
    let value = 0;
    for (let k = -2; k <= 2; k++) value += bins[(bin + k + HUE_BINS) % HUE_BINS] * kernel[k + 2];
    if (value > peakValue) { peakValue = value; peak = bin; }
  }
  if (peakValue <= 0) return accentFromOklch(meanLight, 0, 0, true);

  const center = (peak + .5) * (360 / HUE_BINS);
  let sumA = 0, sumB = 0, sumL = 0, sumW = 0, sumC = 0;
  for (const pixel of pixels) {
    const distance = Math.abs(((pixel.h - center + 540) % 360) - 180);
    if (distance > 28) continue;
    sumA += pixel.C * Math.cos(pixel.h * Math.PI / 180) * pixel.weight;
    sumB += pixel.C * Math.sin(pixel.h * Math.PI / 180) * pixel.weight;
    sumL += pixel.L * pixel.weight;
    sumC += pixel.C * pixel.weight;
    sumW += pixel.weight;
  }
  if (!sumW) return accentFromOklch(meanLight, 0, 0, true);
  const hue = (Math.atan2(sumB, sumA) * 180 / Math.PI + 360) % 360;
  // La chroma est la moyenne pondérée (pas la longueur du vecteur moyen, que de
  // petites variations de teinte feraient fondre).
  return accentFromOklch(sumL / sumW, sumC / sumW, hue, false);
}

function accentFromRGB(red, green, blue, forceNeutral = false) {
  const { L, C, h } = rgbToOklch(red, green, blue);
  const neutral = forceNeutral || C < MIN_CHROMA;
  return accentFromOklch(L, neutral ? 0 : C, h, neutral);
}

// Trois rôles, trois réglages :
//  • accent  : commandes de la fiche, toujours claires et lisibles sur fond sombre ;
//  • ambient : la lumière de l'aura. Elle ne dépend plus de la luminosité de
//    l'affiche (une affiche sombre donnait une aura noire, invisible) mais reste
//    franche et assez saturée pour se voir ;
//  • system  : la barre système, très sombre et à peine teintée.
function accentFromOklch(L, C, hue, neutral) {
  if (neutral) {
    const light = Number(clamp(L * 100, 34, 58).toFixed(1));
    const gray = value => hsl({ h: 0, s: 0, l: value });
    return {
      accent: gray(70),
      accent2: gray(80),
      ambient: gray(light),
      ambientSoft: gray(Math.min(70, light + 10)),
      glow: hsl({ h: 0, s: 0, l: light }, .16),
      system: gray(10),
      hue: 0,
    };
  }
  const accent = oklchToHsl(clamp(L, .68, .76), clamp(C * 1.15, .09, .17), hue);
  const accent2 = oklchToHsl(clamp(L, .68, .76) + .08, clamp(C * .95, .07, .14), hue);
  const ambient = oklchToHsl(clamp(L * .6 + .32, .5, .66), clamp(C * 1.15, .09, .17), hue);
  const ambientSoft = oklchToHsl(clamp(L * .6 + .32, .5, .66) + .1, clamp(C * .95, .08, .14), hue);
  const system = oklchToHsl(.17, clamp(C * .3, .015, .045), hue);
  return {
    accent: hsl(accent),
    accent2: hsl(accent2),
    ambient: hsl(ambient),
    ambientSoft: hsl(ambientSoft),
    glow: hsl(ambient, .16),
    system: hsl(system),
    hue: accent.h,
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
    // Proportions d'une affiche : la couleur n'est plus mesurée sur une image écrasée.
    canvas.width = 40;
    canvas.height = 60;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return accentFromPixels(data, { width: canvas.width });
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
