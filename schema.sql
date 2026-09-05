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
  release_date    DATE,
  release_date_precision TEXT NOT NULL DEFAULT 'day'
                    CHECK (release_date_precision IN ('day', 'month')),
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
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS release_date_precision TEXT NOT NULL DEFAULT 'day';

ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_source_api_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_source_api_check
  CHECK (source_api IS NULL OR source_api IN ('tmdb', 'igdb', 'rawg', 'openlibrary', 'manual'));
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_subtype_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_subtype_check
  CHECK (subtype IS NULL OR subtype IN ('movie', 'tv'));
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_repeat_count_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_repeat_count_check
  CHECK (repeat_count BETWEEN 0 AND 999);
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_release_date_precision_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_release_date_precision_check
  CHECK (release_date_precision IN ('day', 'month'));

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

-- Compatibilité avec une table Journal créée par une version antérieure.
ALTER TABLE public.media_events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE public.media_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
  -- Les restaurations atomiques importent ensuite le Journal d'origine.
  -- Ne pas générer d'événements artificiels pendant cette transaction.
  IF current_setting('app.kulturo_restore', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

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

-- ── Restauration atomique ──────────────────────────────────
-- Le navigateur prépare et valide le plan. Cette fonction réapplique le plan
-- dans une seule transaction, remappe les anciens identifiants et fusionne le
-- Journal sans supprimer les données déjà présentes.
DROP FUNCTION IF EXISTS public.restore_kulturo_backup(JSONB, JSONB, JSONB, JSONB);
CREATE FUNCTION public.restore_kulturo_backup(
  p_added JSONB DEFAULT '[]'::jsonb,
  p_updated JSONB DEFAULT '[]'::jsonb,
  p_existing JSONB DEFAULT '[]'::jsonb,
  p_events JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item JSONB;
  v_payload JSONB;
  v_changes JSONB;
  v_source_id TEXT;
  v_target_id UUID;
  v_event_id UUID;
  v_source_event_id UUID;
  v_event_type TEXT;
  v_occurred_at TIMESTAMPTZ;
  v_metadata JSONB;
  v_current public.media_entries%ROWTYPE;
  v_candidate public.media_entries%ROWTYPE;
  v_id_map JSONB := '{}'::jsonb;
  v_new_ids UUID[] := ARRAY[]::UUID[];
  v_added_count INTEGER := 0;
  v_updated_count INTEGER := 0;
  v_event_count INTEGER := 0;
  v_skipped_events INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Session expirée'; END IF;
  IF jsonb_typeof(COALESCE(p_added, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_updated, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_existing, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Plan de restauration invalide';
  END IF;
  IF jsonb_array_length(COALESCE(p_added, '[]'::jsonb)) > 10000
     OR jsonb_array_length(COALESCE(p_updated, '[]'::jsonb)) > 10000
     OR jsonb_array_length(COALESCE(p_existing, '[]'::jsonb)) > 10000
     OR jsonb_array_length(COALESCE(p_events, '[]'::jsonb)) > 100000 THEN
    RAISE EXCEPTION 'Plan de restauration trop volumineux';
  END IF;

  PERFORM set_config('app.kulturo_restore', 'on', TRUE);

  -- Médias déjà présents et inchangés : uniquement nécessaires au remappage
  -- des identifiants du Journal.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_existing, '[]'::jsonb))
  LOOP
    BEGIN
      v_target_id := NULLIF(v_item->>'id', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Identifiant existant invalide';
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.media_entries
      WHERE id = v_target_id AND user_id = v_user
    ) THEN
      RAISE EXCEPTION 'Média existant introuvable';
    END IF;
    v_source_id := NULLIF(v_item->>'sourceId', '');
    IF v_source_id IS NOT NULL THEN
      v_id_map := jsonb_set(v_id_map, ARRAY[v_source_id], to_jsonb(v_target_id::TEXT), TRUE);
    END IF;
  END LOOP;

  -- Nouveaux médias.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_added, '[]'::jsonb))
  LOOP
    v_payload := COALESCE(v_item->'payload', '{}'::jsonb) - 'id' - 'user_id' - 'updated_at';
    SELECT * INTO v_candidate FROM jsonb_populate_record(NULL::public.media_entries, v_payload);
    v_source_id := NULLIF(v_item->>'sourceId', '');
    -- Identifiant déterministe par utilisateur : si la réponse réseau se perd
    -- après validation côté serveur, un nouvel essai ne crée pas de doublon.
    v_target_id := uuid_generate_v5(
      v_user,
      'kulturo-restore:' || COALESCE(v_source_id, md5(v_payload::TEXT))
    );

    SELECT * INTO v_current
    FROM public.media_entries
    WHERE id = v_target_id AND user_id = v_user;
    IF FOUND THEN
      IF v_source_id IS NOT NULL THEN
        v_id_map := jsonb_set(v_id_map, ARRAY[v_source_id], to_jsonb(v_target_id::TEXT), TRUE);
      END IF;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.media_entries WHERE id = v_target_id) THEN
      RAISE EXCEPTION 'Collision d’identifiant pendant la restauration';
    END IF;

    INSERT INTO public.media_entries (
      id, user_id, title, media_type, status, rating, is_favorite, repeat_count,
      notes, cover_url, date_started, date_finished, external_id, source_api,
      subtype, genre, author, release_year, release_date, release_date_precision,
      platform, description, backdrop_url, directors, cast_members, duration,
      seasons_count, episodes_count, air_status, watch_providers, developer,
      publisher, page_count, isbn, created_at
    ) VALUES (
      v_target_id, v_user, v_candidate.title, v_candidate.media_type,
      COALESCE(v_candidate.status, 'wishlist'), v_candidate.rating,
      COALESCE(v_candidate.is_favorite, FALSE), COALESCE(v_candidate.repeat_count, 0),
      v_candidate.notes, v_candidate.cover_url, v_candidate.date_started,
      v_candidate.date_finished, v_candidate.external_id, v_candidate.source_api,
      v_candidate.subtype, v_candidate.genre, v_candidate.author,
      v_candidate.release_year, v_candidate.release_date,
      COALESCE(v_candidate.release_date_precision, 'day'), v_candidate.platform,
      v_candidate.description, v_candidate.backdrop_url, v_candidate.directors,
      v_candidate.cast_members, v_candidate.duration, v_candidate.seasons_count,
      v_candidate.episodes_count, v_candidate.air_status, v_candidate.watch_providers,
      v_candidate.developer, v_candidate.publisher, v_candidate.page_count,
      v_candidate.isbn, COALESCE(v_candidate.created_at, NOW())
    ) RETURNING * INTO v_current;

    v_added_count := v_added_count + 1;
    v_new_ids := array_append(v_new_ids, v_target_id);
    IF v_source_id IS NOT NULL THEN
      v_id_map := jsonb_set(v_id_map, ARRAY[v_source_id], to_jsonb(v_target_id::TEXT), TRUE);
    END IF;
  END LOOP;

  -- Médias existants à fusionner. L'utilisateur propriétaire est vérifié avant
  -- chaque écriture, même si la fonction est SECURITY DEFINER.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_updated, '[]'::jsonb))
  LOOP
    BEGIN
      v_target_id := NULLIF(v_item->>'id', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Identifiant de mise à jour invalide';
    END;
    SELECT * INTO v_current
    FROM public.media_entries
    WHERE id = v_target_id AND user_id = v_user
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Média à mettre à jour introuvable'; END IF;

    v_changes := COALESCE(v_item->'changes', '{}'::jsonb) - 'id' - 'user_id' - 'created_at' - 'updated_at';
    SELECT * INTO v_candidate FROM jsonb_populate_record(v_current, v_changes);
    UPDATE public.media_entries SET
      title = v_candidate.title,
      media_type = v_candidate.media_type,
      status = v_candidate.status,
      rating = v_candidate.rating,
      is_favorite = v_candidate.is_favorite,
      repeat_count = v_candidate.repeat_count,
      notes = v_candidate.notes,
      cover_url = v_candidate.cover_url,
      date_started = v_candidate.date_started,
      date_finished = v_candidate.date_finished,
      external_id = v_candidate.external_id,
      source_api = v_candidate.source_api,
      subtype = v_candidate.subtype,
      genre = v_candidate.genre,
      author = v_candidate.author,
      release_year = v_candidate.release_year,
      release_date = v_candidate.release_date,
      release_date_precision = v_candidate.release_date_precision,
      platform = v_candidate.platform,
      description = v_candidate.description,
      backdrop_url = v_candidate.backdrop_url,
      directors = v_candidate.directors,
      cast_members = v_candidate.cast_members,
      duration = v_candidate.duration,
      seasons_count = v_candidate.seasons_count,
      episodes_count = v_candidate.episodes_count,
      air_status = v_candidate.air_status,
      watch_providers = v_candidate.watch_providers,
      developer = v_candidate.developer,
      publisher = v_candidate.publisher,
      page_count = v_candidate.page_count,
      isbn = v_candidate.isbn
    WHERE id = v_target_id AND user_id = v_user
    RETURNING * INTO v_current;

    v_updated_count := v_updated_count + 1;
    v_source_id := NULLIF(v_item->>'sourceId', '');
    IF v_source_id IS NOT NULL THEN
      v_id_map := jsonb_set(v_id_map, ARRAY[v_source_id], to_jsonb(v_target_id::TEXT), TRUE);
    END IF;
  END LOOP;

  -- Journal original : conservation des identifiants pour rendre l'import
  -- idempotent. Réimporter la même sauvegarde ne crée donc aucun doublon.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_events, '[]'::jsonb))
  LOOP
    v_source_id := NULLIF(v_item->>'media_id', '');
    IF v_source_id IS NULL OR NOT (v_id_map ? v_source_id) THEN
      v_skipped_events := v_skipped_events + 1;
      CONTINUE;
    END IF;
    BEGIN
      v_target_id := (v_id_map->>v_source_id)::UUID;
      v_source_event_id := NULLIF(v_item->>'id', '')::UUID;
      v_occurred_at := NULLIF(v_item->>'occurred_at', '')::TIMESTAMPTZ;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      v_skipped_events := v_skipped_events + 1;
      CONTINUE;
    END;
    v_event_type := v_item->>'event_type';
    IF v_event_type NOT IN ('added', 'started', 'repeat_started', 'finished', 'repeat_finished', 'rated', 'status_changed') THEN
      v_skipped_events := v_skipped_events + 1;
      CONTINUE;
    END IF;
    v_metadata := COALESCE(v_item->'metadata', '{}'::jsonb);
    IF jsonb_typeof(v_metadata) <> 'object' THEN
      v_skipped_events := v_skipped_events + 1;
      CONTINUE;
    END IF;

    -- Sur le compte d'origine, l'événement peut déjà être présent avec son
    -- identifiant historique. Sur un autre compte, un UUID dérivé évite toute
    -- collision tout en gardant les nouveaux essais idempotents.
    IF EXISTS (
      SELECT 1 FROM public.media_events
      WHERE id = v_source_event_id AND user_id = v_user
    ) THEN
      CONTINUE;
    END IF;
    v_event_id := uuid_generate_v5(v_user, 'kulturo-event:' || v_source_event_id::TEXT);

    INSERT INTO public.media_events (
      id, user_id, media_id, event_type, occurred_at, metadata, dedupe_key
    ) VALUES (
      v_event_id, v_user, v_target_id, v_event_type, v_occurred_at,
      v_metadata, 'backup:' || v_source_event_id::TEXT
    ) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_event_count := v_event_count + v_rows;
  END LOOP;

  -- Compatibilité avec les anciennes sauvegardes dépourvues de Journal : une
  -- ligne de base est créée uniquement pour les nouveaux médias concernés.
  FOREACH v_target_id IN ARRAY v_new_ids
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.media_events WHERE user_id = v_user AND media_id = v_target_id) THEN
      SELECT * INTO v_current FROM public.media_entries WHERE id = v_target_id AND user_id = v_user;
      v_event_type := CASE
        WHEN v_current.status = 'finished' AND v_current.date_finished IS NOT NULL THEN 'finished'
        WHEN v_current.status = 'playing' AND v_current.date_started IS NOT NULL THEN 'started'
        ELSE 'added'
      END;
      v_occurred_at := CASE
        WHEN v_event_type = 'finished' THEN (v_current.date_finished::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris'
        WHEN v_event_type = 'started' THEN (v_current.date_started::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris'
        ELSE v_current.created_at
      END;
      INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
      VALUES (
        v_user, v_target_id, v_event_type, v_occurred_at,
        jsonb_build_object(
          'status', v_current.status,
          'rating', v_current.rating,
          'date_only', v_event_type IN ('finished', 'started'),
          'occurrence', CASE WHEN v_event_type = 'finished' THEN 1 ELSE NULL END
        )
      );
      v_event_count := v_event_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'added_count', v_added_count,
    'updated_count', v_updated_count,
    'events_restored', v_event_count,
    'events_skipped', v_skipped_events
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_kulturo_backup(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_kulturo_backup(JSONB, JSONB, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_kulturo_backup(JSONB, JSONB, JSONB, JSONB) TO authenticated;

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
DROP POLICY IF EXISTS "events_update_own" ON public.media_events;
CREATE POLICY "events_update_own" ON public.media_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
REVOKE INSERT, DELETE ON public.media_events FROM authenticated;
GRANT SELECT ON public.media_events TO authenticated;
GRANT UPDATE (metadata) ON public.media_events TO authenticated;

-- ── Activité communautaire à champs limités ─────────────────
DROP FUNCTION IF EXISTS public.get_activity_feed(INTEGER);
CREATE FUNCTION public.get_activity_feed(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  media_type TEXT,
  subtype TEXT,
  status TEXT,
  rating SMALLINT,
  is_favorite BOOLEAN,
  repeat_count SMALLINT,
  cover_url TEXT,
  created_at TIMESTAMPTZ,
  username TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    media.id,
    media.user_id,
    media.title,
    media.media_type,
    media.subtype,
    media.status,
    media.rating,
    media.is_favorite,
    media.repeat_count,
    media.cover_url,
    media.created_at,
    COALESCE(NULLIF(profile.username, ''), 'Utilisateur') AS username
  FROM public.media_entries AS media
  LEFT JOIN public.profiles AS profile ON profile.id = media.user_id
  WHERE auth.uid() IS NOT NULL
    AND media.user_id <> auth.uid()
  ORDER BY media.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.get_activity_feed(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_feed(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed(INTEGER) TO authenticated;
