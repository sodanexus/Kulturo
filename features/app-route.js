// ============================================================
// Kulturo 4 — route portable dans le fragment d’URL
// ============================================================

const PAGES = new Set(["library", "dashboard", "upcoming", "journal"]);
const STATUSES = new Set(["all", "wishlist", "playing", "finished", "dropped"]);
const TYPES = new Set(["all", "movie", "game", "book"]);
const SUBTYPES = new Set(["all", "movie", "tv"]);
const SORTS = new Set(["created_at", "date_finished", "rating_desc", "rating_asc", "title"]);

function setWhen(params, key, value, fallback = null) {
  if (value == null || value === "" || value === fallback) return;
  params.set(key, String(value));
}

export function buildAppRoute({ page = "library", layer = null, payload = {}, filters = {}, views = {} } = {}) {
  const safePage = PAGES.has(page) ? page : "library";
  const params = new URLSearchParams();
  setWhen(params, "q", filters.search, "");
  setWhen(params, "type", filters.type, "all");
  setWhen(params, "subtype", filters.subtype, "all");
  setWhen(params, "status", filters.status, "finished");
  if (filters.favorite) params.set("heart", "1");
  if (filters.replay) params.set("replay", "1");
  setWhen(params, "sort", filters.sort, "created_at");
  setWhen(params, "year", filters.year, "all");
  setWhen(params, "month", filters.month, "all");
  setWhen(params, "rating", filters.rating, "all");

  const profile = views.profile || {};
  setWhen(params, "period", profile.period, "month");
  setWhen(params, "py", profile.year);
  setWhen(params, "pm", profile.month);
  setWhen(params, "media", profile.media, "all");

  const journal = views.journal || {};
  setWhen(params, "journal", journal.mode, "personal");
  setWhen(params, "jmine", journal.periods?.personal, "all");
  setWhen(params, "jcommunity", journal.periods?.community, "all");

  const upcoming = views.upcoming || {};
  setWhen(params, "utype", upcoming.type, "all");
  setWhen(params, "genre", upcoming.genre, "all");
  if (upcoming.hideAdded === false) params.set("show-added", "1");

  if (layer) params.set("layer", String(layer));
  setWhen(params, "modal", payload.modal);
  setWhen(params, "media-id", payload.mediaId);
  const query = params.toString();
  return `#/${safePage}${query ? `?${query}` : ""}`;
}

function validMonth(value) {
  return value === "all" || /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

export function parseAppRoute(hash = "") {
  const match = String(hash || "").match(/^#\/(library|dashboard|upcoming|journal)(?:\?(.*))?$/);
  if (!match) return null;
  const params = new URLSearchParams(match[2] || "");
  const filters = {
    search: "", type: "all", subtype: "all", status: "finished",
    favorite: false, replay: false, sort: "created_at",
    year: "all", month: "all", rating: "all",
  };
  if (params.has("q")) filters.search = params.get("q").slice(0, 120);
  if (TYPES.has(params.get("type"))) filters.type = params.get("type");
  if (SUBTYPES.has(params.get("subtype"))) filters.subtype = params.get("subtype");
  if (STATUSES.has(params.get("status"))) filters.status = params.get("status");
  if (params.get("heart") === "1") filters.favorite = true;
  if (params.get("replay") === "1") filters.replay = true;
  if (SORTS.has(params.get("sort"))) filters.sort = params.get("sort");
  const year = params.get("year");
  if (year === "all" || /^\d{4}$/.test(String(year || ""))) filters.year = year;
  const month = params.get("month");
  if (validMonth(month)) filters.month = month;
  const rating = params.get("rating");
  if (rating === "all" || /^(?:10|[1-9])$/.test(String(rating || ""))) filters.rating = rating;

  const views = {
    profile: {},
    journal: { mode: "personal", periods: { personal: "all", community: "all" } },
    upcoming: { type: "all", genre: "all", hideAdded: true },
  };
  const profileYear = Number(params.get("py"));
  if (profileYear >= 1900 && profileYear <= 2200) views.profile.year = profileYear;
  if (/^(0[1-9]|1[0-2])$/.test(params.get("pm") || "")) views.profile.month = params.get("pm");
  if (["month", "year"].includes(params.get("period"))) views.profile.period = params.get("period");
  if (["all", "film", "tv", "game", "book"].includes(params.get("media"))) views.profile.media = params.get("media");
  if (["personal", "community"].includes(params.get("journal"))) views.journal.mode = params.get("journal");
  if (validMonth(params.get("jmine"))) views.journal.periods.personal = params.get("jmine");
  if (validMonth(params.get("jcommunity"))) views.journal.periods.community = params.get("jcommunity");
  if (["all", "movie", "tv", "game", "book"].includes(params.get("utype"))) views.upcoming.type = params.get("utype");
  if (params.has("genre")) views.upcoming.genre = params.get("genre").slice(0, 80);
  if (params.get("show-added") === "1") views.upcoming.hideAdded = false;

  const layer = ["modal", "edit", "metadata", "filters"].includes(params.get("layer"))
    ? params.get("layer") : null;
  const mediaId = params.get("media-id");
  return {
    page: match[1], filters, views, layer,
    payload: {
      modal: params.get("modal") || null,
      mediaId: mediaId && mediaId.length <= 100 ? mediaId : null,
    },
  };
}
