// ============================================================
// supabase.js — Client Supabase + toutes les opérations DB
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm";

let _client = null;

// ── Initialisation ───────────────────────────────────────────
export function initSupabase() {
  if (!CONFIG?.supabase?.url || CONFIG.supabase.url.includes("VOTRE_")) {
    console.warn("[Supabase] Configuration publique manquante");
    return null;
  }
  _client = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}


// ── Auth ─────────────────────────────────────────────────────
export const Auth = {
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
    const { data: { user }, error } = await _client.auth.getUser();
    if (error) throw error;
    return user;
  },

  // Lecture locale de la session persistée, utile pour afficher l'application
  // hors ligne. Les écritures restent protégées côté serveur par les policies RLS.
  async getSessionUser() {
    const { data, error } = await _client.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  },

  async getAccessToken() {
    const { data, error } = await _client.auth.getSession();
    if (error) throw error;
    return data.session?.access_token || null;
  },

  onAuthChange(callback) {
    return _client.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user ?? null);
    });
  },
};

async function requireCurrentUser() {
  const sessionUser = await Auth.getSessionUser().catch(() => null);
  const user = sessionUser || await Auth.getUser().catch(() => null);
  if (!user) throw new Error("Session expirée");
  return user;
}

function withAbortSignal(query, signal) {
  if (signal?.aborted) throw new DOMException("Chargement annulé", "AbortError");
  return signal && typeof query?.abortSignal === "function" ? query.abortSignal(signal) : query;
}

// ── Media CRUD ───────────────────────────────────────────────
export const Media = {
  async getAll(filters = {}) {
    const user = await requireCurrentUser();
    let q = _client.from("media_entries").select("*").eq("user_id", user.id);

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

    q = withAbortSignal(q, filters.signal);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async create(entry) {
    const user = await requireCurrentUser();
    const payload = { ...entry, user_id: user.id };
    const { data, error } = await _client
      .from("media_entries")
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error("[Supabase] insert error:", error, "\npayload:", payload);
      throw new Error(error.message + (error.details ? " — " + error.details : ""));
    }
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

  async getStats() {
    const { data, error } = await _client
      .from("media_entries")
      .select("media_type, status, rating, is_favorite");
    if (error) throw error;
    return computeStats(data || []);
  },
};

// ── Profiles ─────────────────────────────────────────────────
export const Profiles = {
  async get(userId, options = {}) {
    let query = _client
      .from("profiles")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();
    query = withAbortSignal(query, options.signal);
    const { data, error } = await query;
    if (error) throw error;
    return data || null;
  },

  async upsert(userId, username) {
    const { data, error } = await _client
      .from("profiles")
      .upsert({ id: userId, username })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Journal personnel ────────────────────────────────────────
export const Journal = {
  async getAll(options = {}) {
    const user = await requireCurrentUser();
    const pageSize = 1000;
    const events = [];

    for (let from = 0; ; from += pageSize) {
      let query = _client
        .from("media_events")
        .select("id, media_id, event_type, occurred_at, metadata")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false })
        .range(from, from + pageSize - 1);
      query = withAbortSignal(query, options.signal);
      const { data, error } = await query;
      if (error) throw error;
      events.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    return events;
  },

  // Retire uniquement la ligne du Journal visible. L'événement reste présent
  // pour les statistiques et le statut du média n'est jamais modifié.
  async hide(eventId, metadata = {}) {
    const user = await requireCurrentUser();
    const { data, error } = await _client
      .from("media_events")
      .update({
        metadata: {
          ...(metadata && typeof metadata === "object" ? metadata : {}),
          hidden_from_journal: true,
          hidden_at: new Date().toISOString(),
        },
      })
      .eq("id", eventId)
      .eq("user_id", user.id)
      .select("id, media_id, event_type, occurred_at, metadata")
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Restauration atomique ──────────────────────────────────
export const Backup = {
  async restore(plan, events = []) {
    const { data, error } = await _client.rpc("restore_kulturo_backup", {
      p_added: (plan?.added || []).map(item => ({
        sourceId: item.sourceId || null,
        payload: item.payload || {},
      })),
      p_updated: (plan?.updated || []).map(item => ({
        id: item.id,
        sourceId: item.sourceId || null,
        changes: item.changes || {},
      })),
      p_existing: (plan?.unchanged || []).map(item => ({
        id: item.id,
        sourceId: item.sourceId || null,
      })),
      p_events: events || [],
    });
    if (error) throw error;
    return data || { added_count: 0, updated_count: 0, events_restored: 0, events_skipped: 0 };
  },
};

// ── Activité communautaire ──────────────────────────────────
// La fonction SQL ne renvoie que les champs explicitement partageables.
export const Activity = {
  async getFeed(limit = 50, options = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    let query = _client.rpc("get_activity_feed", { p_limit: safeLimit });
    query = withAbortSignal(query, options.signal);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
};

// ── Calcul des statistiques ──────────────────────────────────
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
