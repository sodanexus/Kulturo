// ISBN-10 / ISBN-13 : normalisation et contrôle de la clé.
export function normalizeISBN(value) {
  const isbn = String(value || '').replace(/^ISBN(?:-1[03])?\s*:?\s*/i, '').replace(/[\s‐‑–-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return [...isbn].reduce((sum, n, i) => sum + (n === 'X' ? 10 : Number(n)) * (10 - i), 0) % 11 === 0 ? isbn : null;
  }
  if (/^97[89]\d{10}$/.test(isbn)) {
    return [...isbn].reduce((sum, n, i) => sum + Number(n) * (i % 2 ? 3 : 1), 0) % 10 === 0 ? isbn : null;
  }
  return null;
}
export function isLatinTitle(title) {
  const letters = String(title || '').match(/\p{L}/gu) || [];
  return letters.length > 0 && letters.every(letter => /\p{Script=Latin}/u.test(letter));
}
export function preferredBookTitle(work, alternative) {
  const editions = work.editions?.docs || [];
  const french = editions.find(e => e.title && e.language?.some(l => ['fre','fra','fr'].includes(l)));
  if (french) return french.title;
  const titles = [...editions.map(e => e.title), work.title, ...(alternative?.editions?.docs || []).map(e => e.title), alternative?.title];
  return titles.find(isLatinTitle) || work.title;
}

// Les « subjects » Open Library contiennent aussi des personnes, lieux et titres.
// Ne retenir que des catégories identifiées ; aucun genre n'est deviné.
const BOOK_GENRES = new Map();
for (const [label, aliases] of Object.entries({
  'Fiction': ['fiction', 'ficción', 'ficcion', 'belletristik'],
  'Fantasy': ['fantasy', 'fantasy fiction', 'epic fantasy', 'high fantasy'],
  'Fantastique': ['fantastique', 'fantastic fiction'],
  'Science-fiction': ['science-fiction', 'science fiction', 'ciencia ficción', 'science fiction stories'],
  'Policier': ['policier', 'detective and mystery stories', 'mystery fiction', 'crime fiction', 'detective fiction'],
  'Thriller': ['thriller', 'thrillers', 'thrillers (fiction)', 'suspense fiction'],
  'Horreur': ['horreur', 'horror', 'horror fiction', 'horror tales'],
  'Romance': ['romance', 'romance fiction', 'love stories'],
  'Aventure': ['aventure', 'adventure stories', 'adventure fiction'],
  'Roman historique': ['roman historique', 'historical fiction'],
  'Jeunesse': ['jeunesse', 'juvenile fiction', "children's fiction", 'young adult fiction'],
  'Bande dessinée': ['bande dessinée', 'bandes dessinées', 'comics', 'comic books, strips, etc.', 'graphic novels'],
  'Manga': ['manga', 'mangas'],
  'Poésie': ['poésie', 'poetry', 'poesia'],
  'Théâtre': ['théâtre', 'drama', 'plays'],
  'Nouvelles': ['nouvelles', 'short stories'],
  'Biographie': ['biographie', 'biography', 'biographies'],
  'Autobiographie': ['autobiographie', 'autobiography', 'memoirs'],
  'Essai': ['essai', 'essais', 'essays'],
  'Histoire': ['histoire', 'history'],
  'Philosophie': ['philosophie', 'philosophy'],
  'Psychologie': ['psychologie', 'psychology'],
  'Sciences': ['sciences', 'science'],
  'Art': ['art', 'arts'],
})) {
  for (const alias of [label, ...aliases]) BOOK_GENRES.set(bookGenreKey(alias), label);
}
function bookGenreKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[‐‑–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function cleanBookGenres(value) {
  if (!value) return [];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return cleanBookGenres(parsed); } catch {}
  }
  const values = Array.isArray(value) ? value : [value];
  const result = [];
  for (const item of values) {
    if (typeof item !== 'string') continue;
    const exact = BOOK_GENRES.get(bookGenreKey(item));
    const labels = exact ? [exact] : item.split(/[,;|]/).map(part => BOOK_GENRES.get(bookGenreKey(part)));
    for (const label of labels) if (label && !result.includes(label)) result.push(label);
  }
  return result.slice(0, 3);
}
