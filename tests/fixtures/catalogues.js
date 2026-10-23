const run = new URLSearchParams(location.search).get("test") || "manual";
async function request(name, options = {}) {
  const response = await fetch(`/__test/${encodeURIComponent(run)}/${name}`, { signal: options.signal });
  if (!response.ok) throw new Error("Catalogue de test indisponible");
  return response.json();
}
const linkItem = (id, title, subtype = "movie") => ({ external_id: String(id), title, cover_url: null, description: "", release_year: 2024, genre: null, genres: [], genre_ids: [], author: null, platform: null, source_api: "tmdb", subtype });
export const TMDb = {
  available: () => true, upcoming: () => request("upcoming/movie"), search: async () => [],
  byId: async (id, subtype) => (window.__linkCalls ||= []).push(["byId", id, subtype]) && linkItem(id, `Fiche TMDb ${id}`, subtype),
  byImdb: async imdb => (window.__linkCalls ||= []).push(["byImdb", imdb]) && linkItem(777, `Fiche IMDb ${imdb}`),
};
export const IGDB = { available: () => true, upcoming: () => request("upcoming/game") };
export const BookReleases = { available: () => true, upcoming: () => request("upcoming/book") };
export const TMDbDetails = { fetch: (id, _subtype, options) => request(`details/${id}`, options) };
export const TMDbImages = { fetch: async () => [] };
export const IGDBImages = { fetch: async () => [] };
export const IGDBDetails = { fetch: (id, options) => request(`details/${id}`, options) };
export const OpenLibraryDetails = { fetch: (id, _fallback, options) => request(`details/${id}`, options) };
export const searchMedia = async (query, type) => { (window.__searches ||= []).push([query, type]); return [{ external_id: "9001", title: `Résultat ${query}`, cover_url: null, description: "", release_year: 2020, genre: null, author: type === "book" ? "Auteur" : null, platform: null, source_api: type === "game" ? "igdb" : type === "book" ? "hardcover" : "tmdb", subtype: "movie" }]; };
export const apiAvailability = () => ({ movie: true, game: true, book: true });
export { isLikelyFrench } from "./features/text-language.js";
import { isLikelyFrench } from "./features/text-language.js";
export const translateText = async (text, options = {}) => !options.force && isLikelyFrench(text) ? { text, translated: false } : { text: `Traduction : ${text}`, translated: true };

export const Books = {fetch:(entry,options)=>request(`details/${entry.external_id}`,options)};
export const Hardcover = {select:async()=>null,fetch:async()=>null};

// Même export que l’API réelle ; le catalogue simulé n’exige aucun appel externe.
export const TitleLogos = { async fetch() { return null; } };
