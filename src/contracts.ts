export type MediaType = "movie" | "game" | "book";
export type MediaSubtype = "movie" | "tv" | null;
export type MediaStatus = "wishlist" | "playing" | "finished" | "paused" | "dropped";
export type SyncState = "idle" | "offline" | "pending" | "syncing" | "synced" | "error";

export interface MediaEntry {
  id: string;
  user_id?: string;
  title: string;
  media_type: MediaType;
  subtype?: MediaSubtype;
  status: MediaStatus;
  rating?: number | null;
  is_favorite?: boolean;
  repeat_count?: number;
  cover_url?: string | null;
  created_at?: string;
  updated_at?: string;
  [field: string]: unknown;
}

export interface JournalEvent {
  id: string;
  media_id: string;
  event_type: string;
  occurred_at: string;
  metadata?: Record<string, unknown>;
}

export interface SyncMutation {
  queueId: string;
  ownerId: string;
  operation: "create" | "update" | "delete";
  targetId: string;
  payload: Partial<MediaEntry>;
  previous?: MediaEntry | null;
  createdAt: number;
  availableAt: number;
  attempts: number;
  revision: string;
}

export interface SyncSnapshot {
  state: SyncState;
  pending: number;
  error: Error | null;
}

export interface AppFilters {
  type: "all" | MediaType;
  subtype: "all" | Exclude<MediaSubtype, null>;
  status: "all" | MediaStatus;
  favorite: boolean;
  replay: boolean;
  search: string;
  sort: "created_at" | "date_finished" | "rating_desc" | "rating_asc" | "title";
  year: "all" | number | string;
  month: "all" | string;
  rating: "all" | number | string;
}
