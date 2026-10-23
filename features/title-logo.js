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
export function selectTmdbLogo(logos = []) {
  const rank = logo => logo.iso_639_1 === 'fr' ? 0 : !logo.iso_639_1 ? 1 : 2;
  const candidates = logos.filter(x => /^\/[a-z0-9_-]+\.png$/i.test(x?.file_path || '') && ['fr', 'en', null, undefined].includes(x.iso_639_1) && x.width >= 120 && x.height > 0);
  candidates.sort((a,b) => rank(a)-rank(b) || (b.vote_average || 0)-(a.vote_average || 0) || b.width-a.width);
  return candidates[0] ? `https://image.tmdb.org/t/p/w500${candidates[0].file_path}` : null;
}
export function selectIgdbLogo(logos = []) {
  const label = x => String(x.image_type?.name || '').toLowerCase();
  const candidates = logos.filter(x => x?.alpha_channel === true && !x.animated && /^[a-z0-9]+$/i.test(x.image_id || '') && !/black|histor/.test(label(x)));
  candidates.sort((a,b) => Number(/white/.test(label(b)))-Number(/white/.test(label(a))) || (b.width || 0)-(a.width || 0));
  return candidates[0] ? `https://images.igdb.com/igdb/image/upload/t_720p/${candidates[0].image_id}.png` : null;
}
export async function mountTitleLogo(title, getUrl, {signal, isActive = () => true} = {}) {
  if (!title) return;
  let image;
  let timer;
  let rejectLoad;
  const alive = () => !signal?.aborted && title.isConnected && isActive();
  const abort = () => { rejectLoad?.(new Error('Logo cancelled')); if (image) { image.onload = image.onerror = null; image.removeAttribute('src'); } };
  try {
    const url = await getUrl();
    if (!url || !alive()) return;
    image = new Image();
    image.className = 'detail-title-logo';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    signal?.addEventListener('abort', abort, {once:true});
    await Promise.race([
      new Promise((resolve,reject) => {
        rejectLoad = reject;
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Logo timeout')), 8000); }),
    ]);
    if (image.decode) await image.decode();
    if (!alive() || !image.naturalWidth) return;
    title.append(image);
    requestAnimationFrame(() => { if (alive()) title.classList.add('has-title-logo'); });
  } catch { /* Image absente, lente ou invalide : conserver le titre texte. */ }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (image) { image.onload = image.onerror = null; if (!image.isConnected) image.removeAttribute('src'); }
  }
}
