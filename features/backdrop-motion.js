// Bannière vivante de la fiche : dérive lente de l'image (Ken Burns) et, pour
// les films et séries, fondu enchaîné entre plusieurs images de fond.
// Rien n'est enregistré : les images supplémentaires sont demandées à TMDb à
// l'ouverture de la fiche (le client met la réponse en cache).

const CYCLE_MS = 7000;
const FADE_MS = 1900;
const MAX_EXTRA = 3;
// Sens de dérive (en % du cadre) ; l'image grossit toujours plus vite que la
// dérive ne la déplace, donc aucun bord ne se découvre.
const DRIFTS = [[-2.5, -1.5], [2.5, -1], [-1.5, 2], [2, 1.5]];

export function backdropMotionAllowed() {
  try { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return true; }
}

function setDrift(layer, index) {
  const [dx, dy] = DRIFTS[index % DRIFTS.length];
  layer.style.setProperty("--bd-dx", `${dx}%`);
  layer.style.setProperty("--bd-dy", `${dy}%`);
}

function restartAnimation(layer, className) {
  layer.classList.remove("is-current", "is-leaving");
  void layer.offsetWidth;
  layer.classList.add(className);
}

// Dérive de l'unique image déjà posée dans la bannière.
export function startBackdropDrift(layer) {
  if (!layer || !backdropMotionAllowed()) return;
  setDrift(layer, 0);
  restartAnimation(layer, "is-current");
}

function saveDataOn() {
  try { return Boolean(navigator.connection?.saveData); } catch { return false; }
}

// Charge les images à l'avance, une par une, pour ne jamais fondre vers du vide.
function preload(urls, { track, isActive }) {
  return urls.reduce((chain, url) => chain.then(list => new Promise(resolve => {
    if (!isActive()) return resolve(list);
    const img = new Image();
    const release = track?.(img) || (() => {});
    const done = ok => { img.onload = img.onerror = null; release(); resolve(ok ? [...list, url] : list); };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.decoding = "async";
    img.src = url;
  })), Promise.resolve([]));
}

/**
 * @param {object} o
 * @param {HTMLElement} o.bdEl        la bannière (.detail-backdrop)
 * @param {HTMLElement} o.firstLayer  la couche de l'image principale
 * @param {() => Promise<string[]>} o.getUrls  images supplémentaires
 * @param {() => boolean} o.isActive  la fiche est-elle toujours ouverte ?
 * @param {(img: HTMLImageElement) => () => void} [o.track]
 */
export async function startBackdropShow({ bdEl, firstLayer, getUrls, isActive, track }) {
  if (!backdropMotionAllowed() || saveDataOn()) return null;
  let urls = [];
  try { urls = (await getUrls()) || []; } catch { return null; }
  const known = new Set([firstLayer.style.backgroundImage]);
  urls = urls.filter(url => url && !known.has(`url(${JSON.stringify(url)})`)).slice(0, MAX_EXTRA);
  if (!urls.length || !isActive() || !bdEl.isConnected) return null;
  urls = await preload(urls, { track, isActive });
  if (!urls.length || !isActive() || !bdEl.isConnected) return null;

  const layers = [firstLayer];
  let anchor = firstLayer;
  for (const url of urls) {
    const layer = document.createElement("div");
    layer.className = "detail-backdrop-layer";
    layer.style.backgroundImage = `url(${JSON.stringify(url)})`;
    layer.style.opacity = "0";
    anchor.after(layer);
    anchor = layer;
    layers.push(layer);
  }
  bdEl.classList.add("has-show");

  let index = 0;
  let timer = 0;
  let stopped = false;
  let visible = true;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const alive = () => !stopped && isActive() && bdEl.isConnected;
  const schedule = () => {
    clearTimeout(timer);
    if (!alive()) return stop();
    if (visible && !document.hidden) timer = setTimeout(next, CYCLE_MS);
  };
  const next = () => {
    if (!alive()) return stop();
    const leaving = layers[index];
    index = (index + 1) % layers.length;
    const entering = layers[index];
    setDrift(entering, index);
    restartAnimation(entering, "is-current");
    leaving.classList.remove("is-current");
    leaving.classList.add("is-leaving");
    entering.style.opacity = "1";
    // L'image sortante reste opaque sous la nouvelle jusqu'à la fin du fondu :
    // pas de creux de luminosité au milieu de la transition.
    setTimeout(() => {
      if (!leaving.isConnected) return;
      leaving.style.transition = "none";
      leaving.style.opacity = "0";
      leaving.classList.remove("is-leaving");
      void leaving.offsetWidth;
      leaving.style.transition = "";
    }, FADE_MS + 50);
    schedule();
  };
  const onVisibility = () => schedule();
  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); })
    : null;
  observer?.observe(bdEl);
  document.addEventListener("visibilitychange", onVisibility);
  schedule();
  return stop;
}
