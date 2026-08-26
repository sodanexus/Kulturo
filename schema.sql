-- ============================================================
-- schema.sql — Kulturo · installation Supabase complète
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Bibliothèque personnelle ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  media_type      TEXT NOT NULL CHECK (media_type IN ('game', 'movie', 'book')),
  status          TEXT NOT NULL DEFAULT 'wishlist'
                    CHECK (status IN ('wishlist', 'playing', 'finished', 'paused', 'dropped')),
  rating          SMALLINT CHECK (rating BETWEEN 1 AND 10),
  is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_count    SMALLINT NOT NULL DEFAULT 0
                    CHECK (repeat_count BETWEEN 0 AND 999),
  notes           TEXT,
  cover_url       TEXT,
  date_started    DATE,
  date_finished   DATE,
  external_id     TEXT,
  source_api      TEXT CHECK (source_api IN ('tmdb', 'igdb', 'rawg', 'openlibrary', 'manual')),
  subtype         TEXT CHECK (subtype IS NULL OR subtype IN ('movie', 'tv')),
  genre           TEXT,
  author          TEXT,
  release_year    SMALLINT,
  platform        TEXT,
  description     TEXT,
  backdrop_url    TEXT,
  directors       TEXT,
  cast_members    TEXT,
  duration        INTEGER,
  seasons_count   INTEGER,
  episodes_count  INTEGER,
  air_status      TEXT,
  watch_providers TEXT,
  developer       TEXT,
  publisher       TEXT,
  page_count      INTEGER,
  isbn            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rend le fichier réexécutable sur une installation plus ancienne.
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS subtype TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS backdrop_url TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS directors TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS cast_members TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS seasons_count INTEGER;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS episodes_count INTEGER;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS air_status TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS watch_providers TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS developer TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS page_count INTEGER;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS isbn TEXT;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS repeat_count SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_source_api_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_source_api_check
  CHECK (source_api IS NULL OR source_api IN ('tmdb', 'igdb', 'rawg', 'openlibrary', 'manual'));
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_subtype_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_subtype_check
  CHECK (subtype IS NULL OR subtype IN ('movie', 'tv'));
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_repeat_count_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_repeat_count_check
  CHECK (repeat_count BETWEEN 0 AND 999);

-- ── Journal personnel ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id     UUID NOT NULL REFERENCES public.media_entries(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN (
                 'added', 'started', 'repeat_started', 'finished',
                 'repeat_finished', 'rated', 'status_changed'
               )),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Profils publics minimaux ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL CHECK (char_length(username) BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilité avec une éventuelle table profiles plus ancienne.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.profiles
SET username = left(COALESCE(NULLIF(btrim(username), ''), 'Utilisateur'), 30)
WHERE username IS NULL OR username <> left(btrim(username), 30) OR btrim(username) = '';
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_check
  CHECK (char_length(username) BETWEEN 1 AND 30);

-- ── Index ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_media_user      ON public.media_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_media_type      ON public.media_entries (media_type);
CREATE INDEX IF NOT EXISTS idx_media_status    ON public.media_entries (status);
CREATE INDEX IF NOT EXISTS idx_media_favorite  ON public.media_entries (is_favorite);
CREATE INDEX IF NOT EXISTS idx_media_rating    ON public.media_entries (rating);
CREATE INDEX IF NOT EXISTS idx_media_created   ON public.media_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_finished  ON public.media_entries (date_finished DESC);
CREATE INDEX IF NOT EXISTS idx_media_events_user_date ON public.media_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_events_media_date ON public.media_events (media_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_events_dedupe
  ON public.media_events (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ── updated_at automatique ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_updated_at ON public.media_entries;
CREATE TRIGGER trg_media_updated_at
  BEFORE UPDATE ON public.media_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Journal automatique : la base enregistre les événements dans la même
-- transaction que la modification du média.
CREATE OR REPLACE FUNCTION public.capture_media_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_type TEXT;
  v_occurred_at TIMESTAMPTZ := NOW();
  v_metadata JSONB := '{}'::jsonb;
  v_occurrence INTEGER := 1;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'finished' AND NEW.date_finished IS NOT NULL THEN
      v_event_type := 'finished';
      v_occurred_at := (NEW.date_finished::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris';
    ELSIF NEW.status = 'playing' AND NEW.date_started IS NOT NULL THEN
      v_event_type := 'started';
      v_occurred_at := (NEW.date_started::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris';
    ELSE
      v_event_type := 'added';
      v_occurred_at := COALESCE(NEW.created_at, NOW());
    END IF;
    v_metadata := jsonb_build_object(
      'status', NEW.status,
      'rating', NEW.rating,
      'date_only', v_event_type IN ('finished', 'started'),
      'occurrence', CASE WHEN v_event_type = 'finished' THEN 1 ELSE NULL END
    );
    INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
    VALUES (NEW.user_id, NEW.id, v_event_type, v_occurred_at, v_metadata);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'playing' THEN
      IF OLD.date_finished IS NOT NULL OR OLD.status = 'finished' OR COALESCE(OLD.repeat_count, 0) > 0 THEN
        v_event_type := 'repeat_started';
        v_occurrence := COALESCE(OLD.repeat_count, 0) + 2;
      ELSE
        v_event_type := 'started';
        v_occurrence := 1;
      END IF;
    ELSIF NEW.status = 'finished' THEN
      IF COALESCE(NEW.repeat_count, 0) > COALESCE(OLD.repeat_count, 0) THEN
        v_event_type := 'repeat_finished';
        v_occurrence := COALESCE(NEW.repeat_count, 0) + 1;
      ELSE
        v_event_type := 'finished';
        v_occurrence := 1;
      END IF;
    ELSE
      v_event_type := 'status_changed';
      v_occurrence := 0;
    END IF;
    v_metadata := jsonb_build_object(
      'from', OLD.status,
      'to', NEW.status,
      'rating', NEW.rating,
      'occurrence', NULLIF(v_occurrence, 0)
    );
    INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
    VALUES (NEW.user_id, NEW.id, v_event_type, NOW(), v_metadata);
  END IF;

  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
    VALUES (
      NEW.user_id,
      NEW.id,
      'rated',
      NOW(),
      jsonb_build_object('previous_rating', OLD.rating, 'rating', NEW.rating)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_media_event ON public.media_entries;
CREATE TRIGGER trg_capture_media_event
  AFTER INSERT OR UPDATE ON public.media_entries
  FOR EACH ROW EXECUTE FUNCTION public.capture_media_event();
REVOKE ALL ON FUNCTION public.capture_media_event() FROM PUBLIC;

-- ── Sécurité ligne par ligne ────────────────────────────────
ALTER TABLE public.media_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select" ON public.media_entries;
DROP POLICY IF EXISTS "user_insert" ON public.media_entries;
DROP POLICY IF EXISTS "user_update" ON public.media_entries;
DROP POLICY IF EXISTS "user_delete" ON public.media_entries;
CREATE POLICY "user_select" ON public.media_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_insert" ON public.media_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update" ON public.media_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_delete" ON public.media_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "events_select_own" ON public.media_events;
CREATE POLICY "events_select_own" ON public.media_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.media_events TO authenticated;
