const run = new URLSearchParams(location.search).get("test") || "manual";
async function request(name, options = {}) {
  const response = await fetch(`/__test/${encodeURIComponent(run)}/${name}`, { signal: options.signal });
  if (!response.ok) throw new Error("Catalogue de test indisponible");
  return response.json();
}
export const TMDb = { available: () => true, upcoming: () => request("upcoming/movie"), search: async () => [] };
export const IGDB = { available: () => true, upcoming: () => request("upcoming/game") };
export const GoogleBooks = { available: () => true, upcoming: () => request("upcoming/book") };
export const TMDbDetails = { fetch: (id, _subtype, options) => request(`details/${id}`, options) };
export const IGDBDetails = { fetch: (id, options) => request(`details/${id}`, options) };
export const OpenLibraryDetails = { fetch: (id, _fallback, options) => request(`details/${id}`, options) };
export const searchMedia = async () => [];
export const apiAvailability = () => ({ movie: true, game: true, book: true });
