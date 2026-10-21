// Normalisation commune au navigateur, au proxy et aux tests.
export function hardcoverIdentity(value) {
  const match = /^(\d+)(?::(\d+))?$/.exec(String(value || ''));
  return match ? { bookId: Number(match[1]), editionId: Number(match[2]) || null } : null;
}
export function selectHardcoverEdition(editions = [], isbn = '') {
  if (isbn) return editions.find(e => e.isbn_13 === isbn || e.isbn_10 === isbn) || null;
  return editions.find(e => /^(French|français|fr|fra)$/i.test(e.language?.language || '') && e.reading_format_id !== 2)
    || editions.find(e => e.reading_format_id !== 2) || null;
}
export function normalizeHardcoverBook(book, edition = null) {
  return {
    media_type: 'book', source_api: 'hardcover',
    external_id: `${book.id}${edition ? `:${edition.id}` : ''}`,
    title: edition?.title || book.title,
    author: (book.contributions || []).map(c => c.author?.name).filter(Boolean).join(', ') || null,
    cover_url: edition?.image?.url || book.image?.url || null,
    description: edition?.description || book.description || null,
    page_count: edition?.pages || null,
    isbn: edition?.isbn_13 || edition?.isbn_10 || null,
    publisher: edition?.publisher?.name || null,
    release_year: edition?.release_year || book.release_year || null,
    genre: Array.isArray(book.genres) ? book.genres.filter(g => typeof g === 'string').slice(0, 3).join(', ') || null : null, platform: null,
  };
}
export async function searchBooksWithFallback(query, options, primary, fallback) {
  if (options.bookSource === 'openlibrary') return fallback(query, options);
  try {
    const items = await primary(query, options);
    if (items.length) return items;
  } catch (error) {
    if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
  }
  return fallback(query, options);
}
