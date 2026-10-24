// Laisser le navigateur ignorer le contenu lointain, sans retirer les cartes
// du DOM ni changer la hauteur du défilement. Les cartes proches restent libres
// de déborder pour leurs ombres, leur cadre doré et leur effet de survol.
export function createLibraryVisibility(grid, root) {
  const cards = new Set();
  let width = 0;
  if (typeof IntersectionObserver !== 'function' || !globalThis.CSS?.supports?.('content-visibility', 'auto')) return { observe() {}, dispose() {} };
  const reveal = card => {
    card.classList.remove('library-card-offscreen');
    card.style.removeProperty('--library-card-height');
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target;
      if (entry.isIntersecting || card.matches(':focus-within, :hover') || !entry.boundingClientRect.height) {
        reveal(card);
      } else {
        card.style.setProperty('--library-card-height', `${entry.boundingClientRect.height}px`);
        card.classList.add('library-card-offscreen');
      }
    }
  }, { root, rootMargin: '900px 0px', threshold: 0 });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    const next = entries[0]?.contentRect.width || 0;
    if (!next || next === width) return;
    width = next;
    // Les dimensions changent avec le nombre de colonnes : remesurer avant
    // toute nouvelle économie de rendu pour conserver un scroll stable.
    observer.disconnect();
    for (const card of cards) { reveal(card); observer.observe(card); }
  }) : null;
  resize?.observe(grid);
  return {
    observe(nodes) { for (const card of nodes) { cards.add(card); observer.observe(card); } },
    dispose() { observer.disconnect(); resize?.disconnect(); for (const card of cards) reveal(card); cards.clear(); },
  };
}
