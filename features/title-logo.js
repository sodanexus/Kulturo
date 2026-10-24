// Logos facultatifs : le titre reste toujours disponible et accessible.
export function manualLogoUrl(value) {
  try { const url = new URL(String(value || '').trim()); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
// Logo animé : une vidéo WebM (transparence VP9) se lit dans <video>, pas dans <img>.
export function isVideoLogo(value) {
  try { return /\.webm$/i.test(new URL(String(value || '').trim()).pathname); } catch { return false; }
}
export function supportsTitleLogo(entry) {
  if (['movie', 'game'].includes(entry?.media_type) && manualLogoUrl(entry.logo_url)) return true;
  return Boolean(entry?.external_id && ((entry.media_type === 'movie' && entry.source_api === 'tmdb') || (entry.media_type === 'game' && entry.source_api === 'igdb')));
}
const preferenceKey = (entry, owner) => `kulturo:text-title:${owner || 'local'}:${entry.id}`;
export function prefersTextTitle(entry, owner) {
  try { return localStorage.getItem(preferenceKey(entry, owner)) === '1'; } catch { return false; }
}
export function setTextTitle(entry, owner, enabled) {
  try {
    const key = preferenceKey(entry, owner);
    if (enabled) localStorage.setItem(key, '1'); else localStorage.removeItem(key);
  } catch { /* Le titre reste utilisable si le stockage est indisponible. */ }
}
export function tmdbLogoCandidates(logos = []) {
  // Français d'abord, puis anglais, puis logo sans langue (souvent du texte d'une autre langue mal étiqueté).
  const rank = x => x.iso_639_1 === 'fr' ? 0 : x.iso_639_1 === 'en' ? 1 : !x.iso_639_1 ? 2 : 3;
  return (Array.isArray(logos) ? logos : []).filter(x => /^\/[a-z0-9_-]+\.(png|svg|webp)$/i.test(x?.file_path || ''))
    .sort((a,b) => rank(a)-rank(b) || (b.vote_average || 0)-(a.vote_average || 0))
    .slice(0,4).map(x => ({url:`https://image.tmdb.org/t/p/original${x.file_path}`}));
}
export function selectTmdbLogo(logos = []) { return tmdbLogoCandidates(logos)[0]?.url || null; }
export function igdbLogoCandidates(logos = []) {
  const label = x => String(x.image_type?.name || '').toLowerCase();
  // Champ absent ≠ absence de transparence : certaines images IGDB sont incomplètement renseignées.
  const candidates = (Array.isArray(logos) ? logos : []).filter(x => x && x.alpha_channel !== false && !x.animated && /^[a-z0-9]+$/i.test(x.image_id || ''));
  const rank = x => (/histor/.test(label(x)) ? 10 : 0) + (/white/.test(label(x)) ? 0 : /black/.test(label(x)) ? 2 : 1);
  candidates.sort((a,b) => rank(a)-rank(b) || (b.width || 0)-(a.width || 0));
  return candidates.slice(0,4).map(chosen => ({url:`https://images.igdb.com/igdb/image/upload/t_original/${chosen.image_id}.png`, monochrome:/black/.test(label(chosen))}));
}
export function steamGridLogoCandidates(logos = []) {
  return (Array.isArray(logos) ? logos : []).filter(x => {
    try { const url = new URL(x?.url); return url.protocol === 'https:' && /(^|\.)steamgriddb\.com$/i.test(url.hostname); } catch { return false; }
  }).slice(0,4).map(x => ({url:x.url, monochrome:x.style === 'black'}));
}
export function selectIgdbLogoAsset(logos = []) { return igdbLogoCandidates(logos)[0] || null; }
export function selectIgdbLogo(logos = []) { return selectIgdbLogoAsset(logos)?.url || null; }
// Le titre texte reste masqué pendant la recherche du logo ; sans logo, il apparaît en fondu.
export async function mountTitleLogo(title, getUrl, options = {}) {
  if (!title) return;
  const mounted = await tryMountTitleLogo(title, getUrl, options);
  if (!mounted && title.isConnected && !options.signal?.aborted) title.classList?.remove?.('is-logo-pending');
}
async function tryMountTitleLogo(title, getUrl, {signal, isActive = () => true} = {}) {
  if (!title) return false;
  const alive = () => !signal?.aborted && title.isConnected && isActive();
  try {
    const result = await getUrl();
    const assets = Array.isArray(result) ? result : [result];
    for (const asset of assets.slice(0,6)) {
      const url = typeof asset === 'string' ? asset : asset?.url;
      if (!alive()) return;
      if (!url) continue;
      const isVideo = isVideoLogo(url);
      const image = isVideo ? document.createElement('video') : new Image();
      const reduceMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      let timer, rejectLoad, mounted = false;
      const abort = () => { rejectLoad?.(new Error('Logo cancelled')); image.removeAttribute('src'); };
      image.className = 'detail-title-logo' + (asset?.monochrome ? ' is-monochrome-logo' : '');
      image.setAttribute('aria-hidden','true');
      if (isVideo) {
        // Lecture silencieuse en boucle ; avec « réduire les animations », une seule image fixe.
        image.muted = true; image.defaultMuted = true; image.loop = !reduceMotion;
        image.playsInline = true; image.disablePictureInPicture = true; image.controls = false;
        image.preload = 'auto'; image.tabIndex = -1;
        image.setAttribute('muted',''); image.setAttribute('playsinline','');
      } else {
        image.alt = ''; image.decoding = 'async';
      }
      signal?.addEventListener('abort',abort,{once:true});
      try {
        if (isVideo) {
          // Un <video> hors du document n'est pas chargé par tous les navigateurs
          // (mobile, économiseur de données) : on l'insère d'emblée, invisible
          // (opacity 0 tant que « has-title-logo » n'est pas posé), et on lance la lecture.
          title.querySelector?.('.detail-title-logo')?.remove();
          title.append(image);
        }
        await new Promise((resolve,reject) => {
          rejectLoad = reject;
          timer = setTimeout(() => reject(new Error('Logo timeout')), isVideo ? 12000 : 6000);
          if (isVideo) { image.onloadeddata = resolve; image.oncanplay = resolve; } else image.onload = resolve;
          image.onerror = () => reject(new Error(isVideo ? `Vidéo illisible (code ${image.error?.code ?? '?'})` : 'Image illisible'));
          image.src = url;
          if (isVideo) image.play?.().catch(() => { /* la lecture est relancée plus bas */ });
        });
        if (isVideo) {
          if (!alive() || !image.videoWidth) { if (alive()) throw new Error('Vidéo sans image'); return; }
          if (reduceMotion) { image.pause?.(); image.currentTime = 0; }
          else image.play?.().catch(() => { /* image fixe si la lecture est refusée */ });
        } else {
          // Le décodage peut échouer sur un SVG déjà chargé et pourtant affichable.
          try { await image.decode?.(); } catch { if (!image.naturalWidth) throw new Error('Invalid image'); }
          if (!alive() || !image.naturalWidth) return;
          title.querySelector?.('.detail-title-logo')?.remove();
          title.append(image);
        }
        mounted = true;
        requestAnimationFrame(() => { if (alive()) title.classList.add('has-title-logo'); });
        return true;
      } catch (error) { if (isVideo) console.warn('[Logo animé]', url, error?.message || error); /* Candidat suivant, le texte reste le secours. */ }
      finally {
        clearTimeout(timer); signal?.removeEventListener('abort',abort);
        image.onload = image.onloadeddata = image.oncanplay = image.onerror = null;
        // Un candidat refusé ne doit pas rester dans le titre (la vidéo y est insérée d'emblée).
        if (!mounted && image.isConnected) { image.pause?.(); image.remove(); }
        if (!image.isConnected) { image.removeAttribute('src'); if (isVideo) image.load?.(); }
      }
    }
  } catch { /* Le texte demeure le secours. */ }
}
