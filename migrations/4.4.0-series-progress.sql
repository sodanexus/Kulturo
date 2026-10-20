-- Kulturo 4.4.0 — progression des séries (saison et épisode en cours).
-- À exécuter une fois dans Supabase → SQL Editor → Run, AVANT de déployer 4.4.0.
-- Rejouable sans risque : les colonnes sont ajoutées seulement si elles manquent,
-- puis la restauration atomique est recréée pour qu'elle les conserve.

-- Déjà ajoutée par la 4.3.0 ; rejouée ici sans effet pour que la restauration
-- recréée plus bas trouve toujours toutes ses colonnes.
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS current_page INTEGER CHECK (current_page >= 0);
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS current_season INTEGER CHECK (current_season >= 1);
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS current_episode INTEGER CHECK (current_episode >= 1);

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
      publisher, page_count, current_page, current_season, current_episode, isbn, created_at
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
      v_candidate.developer, v_candidate.publisher, v_candidate.page_count, v_candidate.current_page,
      v_candidate.current_season, v_candidate.current_episode,
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
      current_page = v_candidate.current_page,
      current_season = v_candidate.current_season,
      current_episode = v_candidate.current_episode,
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
