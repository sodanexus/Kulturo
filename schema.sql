-- ============================================================
-- schema.sql — Kulturo · Schéma Supabase
-- À exécuter dans l'éditeur SQL de votre projet Supabase
-- ============================================================

-- ── Extension UUID ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Table principale ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contenu
  title         TEXT NOT NULL,
  media_type    TEXT NOT NULL CHECK (media_type IN ('game', 'movie', 'book')),
  status        TEXT NOT NULL DEFAULT 'wishlist'
                  CHECK (status IN ('wishlist', 'playing', 'finished', 'paused', 'dropped')),
  rating        SMALLINT CHECK (rating >= 1 AND rating <= 10),
  is_favorite   BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  cover_url     TEXT,

  -- Dates
  date_started  DATE,
  date_finished DATE,

  -- Enrichissement API
  external_id   TEXT,
  source_api    TEXT CHECK (source_api IN ('tmdb', 'rawg', 'openlibrary', 'manual')),
  genre         TEXT,
  author        TEXT,       -- livres : auteur / jeux : studio / films : réalisateur
  release_year  SMALLINT,
  platform      TEXT,       -- jeux uniquement
  description   TEXT,

  -- Meta
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX idx_media_user        ON media_entries (user_id);
CREATE INDEX idx_media_type        ON media_entries (media_type);
CREATE INDEX idx_media_status      ON media_entries (status);
CREATE INDEX idx_media_favorite    ON media_entries (is_favorite);
CREATE INDEX idx_media_rating      ON media_entries (rating);
CREATE INDEX idx_media_created     ON media_entries (created_at DESC);
CREATE INDEX idx_media_finished    ON media_entries (date_finished DESC);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_updated_at
  BEFORE UPDATE ON media_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE media_entries ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit que ses propres entrées
CREATE POLICY "user_select" ON media_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert" ON media_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_update" ON media_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_delete" ON media_entries
  FOR DELETE USING (auth.uid() = user_id);
