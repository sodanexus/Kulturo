// ============================================================
// supabase.js — Client Supabase + toutes les opérations DB
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let _client = null;

// ── Initialisation ───────────────────────────────────────────
export function initSupabase() {
  if (!CONFIG?.supabase?.url || CONFIG.supabase.url.includes("VOTRE_")) {
    console.warn("[Supabase] Clés non configurées — mode démo activé");
    return null;
  }
  _client = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

export function getClient() {
  return _client;
}

export function isConfigured() {
  return _client !== null;
}

// ── Auth ─────────────────────────────────────────────────────
export const Auth = {
  async signUp(email, password) {
    const { data, error } = await _client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await _client.auth.signOut();
    if (error) throw error;
  },

  async getUser() {
    const { data: { user } } = await _client.auth.getUser();
    return user;
  },

  onAuthChange(callback) {
    return _client.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user ?? null);
    });
  },
};

// ── Media CRUD ───────────────────────────────────────────────
export const Media = {
  async getAll(filters = {}) {
    let q = _client.from("media_entries").select("*");

    if (filters.media_type) q = q.eq("media_type", filters.media_type);
    if (filters.status)     q = q.eq("status", filters.status);
    if (filters.is_favorite) q = q.eq("is_favorite", true);
    if (filters.rating_min) q = q.gte("rating", filters.rating_min);
    if (filters.search)     q = q.ilike("title", `%${filters.search}%`);

    // Tri
    const sortMap = {
      created_at:    { col: "created_at",    asc: false },
      date_finished: { col: "date_finished", asc: false },
      rating:        { col: "rating",        asc: false },
      title:         { col: "title",         asc: true },
    };
    const sort = sortMap[filters.sort] || sortMap.created_at;
    q = q.order(sort.col, { ascending: sort.asc });

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async create(entry) {
    const user = await Auth.getUser();
    const { data, error } = await _client
      .from("media_entries")
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, changes) {
    const { data, error } = await _client
      .from("media_entries")
      .update(changes)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await _client
      .from("media_entries")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async toggleFavorite(id, current) {
    return Media.update(id, { is_favorite: !current });
  },

  async getStats() {
    const { data, error } = await _client
      .from("media_entries")
      .select("media_type, status, rating, is_favorite");
    if (error) throw error;
    return computeStats(data || []);
  },
};

// ── Calcul des statistiques (partagé avec le mode démo) ──────
export function computeStats(entries) {
  const total = entries.length;
  const finished = entries.filter(e => e.status === "finished").length;
  const inProgress = entries.filter(e => e.status === "playing").length;
  const favorites = entries.filter(e => e.is_favorite).length;
  const rated = entries.filter(e => e.rating);
  const avgRating = rated.length
    ? (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1)
    : "—";

  const byType = { game: 0, movie: 0, book: 0 };
  const byStatus = { wishlist: 0, playing: 0, finished: 0, paused: 0, dropped: 0 };
  entries.forEach(e => {
    if (byType[e.media_type] !== undefined) byType[e.media_type]++;
    if (byStatus[e.status] !== undefined) byStatus[e.status]++;
  });

  return { total, finished, inProgress, favorites, avgRating, byType, byStatus };
}
