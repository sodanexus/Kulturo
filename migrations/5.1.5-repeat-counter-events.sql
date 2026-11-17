-- Kulturo 5.1.5 : chaque incrément de repeat_count crée un événement de relecture.
-- À exécuter une fois dans l'éditeur SQL de Supabase.
-- Corrige aussi les compteurs manuels déjà enregistrés sans événement Journal.

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
      -- La fin d'une relecture est créée dans le bloc dédié au compteur
      -- ci-dessous, qu'elle provienne du statut ou du bouton + dans Modifier.
      IF COALESCE(NEW.repeat_count, 0) > COALESCE(OLD.repeat_count, 0) THEN
        v_event_type := NULL;
        v_occurrence := 0;
      ELSE
        v_event_type := 'finished';
        v_occurrence := 1;
      END IF;
    ELSE
      v_event_type := 'status_changed';
      v_occurrence := 0;
    END IF;
    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'rating', NEW.rating,
        'occurrence', NULLIF(v_occurrence, 0)
      );
      INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
      VALUES (NEW.user_id, NEW.id, v_event_type, NOW(), v_metadata);
    END IF;
  END IF;

  -- Une relecture ajoutée manuellement depuis « Modifier » ne change pas
  -- nécessairement le statut. Chaque incrément doit donc produire son propre
  -- événement. Le même bloc couvre aussi le passage En cours → Terminé.
  IF COALESCE(NEW.repeat_count, 0) > COALESCE(OLD.repeat_count, 0) THEN
    FOR v_occurrence IN (COALESCE(OLD.repeat_count, 0) + 2)..(COALESCE(NEW.repeat_count, 0) + 1) LOOP
      INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
      VALUES (
        NEW.user_id,
        NEW.id,
        'repeat_finished',
        NOW(),
        jsonb_build_object(
          'from', OLD.status,
          'to', NEW.status,
          'rating', NEW.rating,
          'occurrence', v_occurrence,
          'manual_entry', OLD.status IS NOT DISTINCT FROM NEW.status
        )
      );
    END LOOP;
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

-- Rattrapage des relectures déjà présentes dans les compteurs mais absentes
-- du Journal. Les dates de ces événements sont celles de l'application de
-- cette migration : la date historique exacte n'est pas disponible.
INSERT INTO public.media_events (user_id, media_id, event_type, occurred_at, metadata)
SELECT
  media.user_id,
  media.id,
  'repeat_finished',
  NOW(),
  jsonb_build_object(
    'occurrence', occurrence.number,
    'manual_entry', TRUE,
    'backfilled', TRUE
  )
FROM public.media_entries AS media
CROSS JOIN LATERAL generate_series(2, COALESCE(media.repeat_count, 0) + 1) AS occurrence(number)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.media_events AS event
  WHERE event.media_id = media.id
    AND event.event_type = 'repeat_finished'
    AND CASE
      WHEN event.metadata->>'occurrence' ~ '^[0-9]+$'
        THEN (event.metadata->>'occurrence')::INTEGER
      ELSE 0
    END = occurrence.number
);
