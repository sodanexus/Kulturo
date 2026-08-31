export const ADD_PRIMARY_STATUSES = Object.freeze([
  Object.freeze({ value: "wishlist", label: "Wishlist" }),
  Object.freeze({ value: "playing", label: "En cours" }),
  Object.freeze({ value: "finished", label: "Terminé" }),
]);

export const ADD_SECONDARY_STATUSES = Object.freeze([
  Object.freeze({ value: "paused", label: "En pause" }),
  Object.freeze({ value: "dropped", label: "Abandonné" }),
]);

const ADD_MEDIA_TYPES = new Set(["movie", "game", "book"]);
const ADD_STATUSES = new Set([
  ...ADD_PRIMARY_STATUSES.map(status => status.value),
  ...ADD_SECONDARY_STATUSES.map(status => status.value),
]);

export function createAddDraft(prefillTitle = "") {
  return {
    step: 1,
    type: "movie",
    title: String(prefillTitle || "").trim(),
    apiSelected: null,
    rating: 0,
    favorite: false,
    _status: "finished",
  };
}

export function selectAddResult(draft, item) {
  if (!draft || !item?.title) return draft;
  return {
    ...draft,
    step: 2,
    type: ADD_MEDIA_TYPES.has(item.media_type) ? item.media_type : draft.type,
    title: String(item.title).trim(),
    apiSelected: item,
    rating: 0,
    favorite: false,
  };
}

export function selectManualAdd(draft, title, type) {
  const normalizedTitle = String(title || "").trim();
  if (!draft || !normalizedTitle || !ADD_MEDIA_TYPES.has(type)) return draft;
  return {
    ...draft,
    step: 2,
    type,
    title: normalizedTitle,
    apiSelected: null,
    rating: 0,
    favorite: false,
  };
}

export function setAddDraftStatus(draft, status) {
  if (!draft || !ADD_STATUSES.has(status)) return draft;
  return { ...draft, _status: status };
}

export function isSecondaryAddStatus(status) {
  return ADD_SECONDARY_STATUSES.some(option => option.value === status);
}
