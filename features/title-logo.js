// Logos facultatifs : le titre reste toujours disponible et accessible.
export function supportsTitleLogo(entry) {
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
  const rank = x => x.iso_639_1 === 'fr' ? 0 : !x.iso_639_1 ? 1 : x.iso_639_1 === 'en' ? 2 : 3;
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
export async function mountTitleLogo(title, getUrl, {signal, isActive = () => true} = {}) {
  if (!title) return;
  const alive = () => !signal?.aborted && title.isConnected && isActive();
  try {
    const result = await getUrl();
    const assets = Array.isArray(result) ? result : [result];
    for (const asset of assets.slice(0,6)) {
      const url = typeof asset === 'string' ? asset : asset?.url;
      if (!alive()) return;
      if (!url) continue;
      const image = new Image();
      let timer, rejectLoad;
      const abort = () => { rejectLoad?.(new Error('Logo cancelled')); image.removeAttribute('src'); };
      image.className = 'detail-title-logo' + (asset?.monochrome ? ' is-monochrome-logo' : '');
      image.alt = ''; image.setAttribute('aria-hidden','true'); image.decoding = 'async';
      signal?.addEventListener('abort',abort,{once:true});
      try {
        await new Promise((resolve,reject) => {
          rejectLoad = reject;
          timer = setTimeout(() => reject(new Error('Logo timeout')), 6000);
          image.onload = resolve; image.onerror = reject; image.src = url;
        });
        // Le décodage peut échouer sur un SVG déjà chargé et pourtant affichable.
        try { await image.decode?.(); } catch { if (!image.naturalWidth) throw new Error('Invalid image'); }
        if (!alive() || !image.naturalWidth) return;
        title.querySelector?.('.detail-title-logo')?.remove();
        title.append(image);
        requestAnimationFrame(() => { if (alive()) title.classList.add('has-title-logo'); });
        return;
      } catch { /* Essayer le candidat suivant sans masquer le texte. */ }
      finally {
        clearTimeout(timer); signal?.removeEventListener('abort',abort);
        image.onload = image.onerror = null;
        if (!image.isConnected) image.removeAttribute('src');
      }
    }
  } catch { /* Le texte demeure le secours. */ }
}
