// Ne modifier que les variantes reconnues de TMDb et IGDB. Les liens personnalisés
// et les images des autres catalogues gardent leur URL originale.
export function libraryCoverSources(value) {
  const src = String(value || '');
  let url;
  try { url = new URL(src); } catch { return { src, srcset: '' }; }
  if (url.hostname === 'images.igdb.com' && /^\/igdb\/image\/upload\/t_(?:cover_big|cover_small)(?:_2x)?\//.test(url.pathname)) {
    const variant = size => {
      const next = new URL(url);
      next.pathname = next.pathname.replace(/\/t_[^/]+\//, `/t_${size}/`);
      return next.href;
    };
    const highResolution = url.pathname.includes('cover_big_2x');
    return { src: variant('cover_big'), srcset: `${variant('cover_small_2x')} 180w, ${variant('cover_big')} 264w${highResolution ? `, ${variant('cover_big_2x')} 528w` : ''}` };
  }
  if (url.hostname !== 'image.tmdb.org' || !/^\/t\/p\/(?:original|w\d+)\/.+/.test(url.pathname)) return { src, srcset: '' };
  const variant = width => {
    const next = new URL(url);
    next.pathname = next.pathname.replace(/^\/t\/p\/[^/]+\//, `/t/p/w${width}/`);
    return next.href;
  };
  return { src: variant(342), srcset: [185, 342, 500].map(width => `${variant(width)} ${width}w`).join(', ') };
}
// Les tailles correspondent à la grille (3 colonnes mobile, auto-fill desktop).
export const LIBRARY_COVER_SIZES = '(max-width: 680px) 33vw, (max-width: 900px) 180px, 200px';
