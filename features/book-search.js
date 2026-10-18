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
