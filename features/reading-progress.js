// Progression personnelle ; les catalogues ne doivent jamais la modifier.
export function parseReadingProgress(currentValue, totalValue) {
  const parse = (value, label, minimum) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) throw new Error(`${label} doit être un nombre entier.`);
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < minimum || number > 2_147_483_647) {
      throw new Error(`${label} n’est pas valide.`);
    }
    return number;
  };
  const current_page = parse(currentValue, 'La page actuelle', 0);
  const page_count = parse(totalValue, 'Le nombre de pages', 1);
  if (current_page != null && page_count != null && current_page > page_count) {
    throw new Error('La page actuelle ne peut pas dépasser le nombre de pages.');
  }
  return { current_page, page_count };
}
export function readingProgress(entry) {
  const current = Number.isInteger(entry?.current_page) && entry.current_page >= 0 ? entry.current_page : null;
  const total = Number.isInteger(entry?.page_count) && entry.page_count > 0 ? entry.page_count : null;
  return { current, total, percent: current != null && total ? Math.min(100, Math.round(current / total * 100)) : null };
}
