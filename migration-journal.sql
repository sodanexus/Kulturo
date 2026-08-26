-- ============================================================
-- Kulturo 3.0 — Journal personnel et historique daté
-- Migration de données additive et réexécutable ; aucun média n'est supprimé.
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_media_events_user_date
  ON public.media_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_events_media_date
  ON public.media_events (media_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_events_dedupe
  ON public.media_events (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.media_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_select_own" ON public.media_events;
CREATE POLICY "events_select_own"
  ON public.media_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT ON public.media_events TO authenticated;

-- L'ancien fil communautaire n'est plus utilisé. Le profil redevient lui aussi
-- strictement personnel, conformément à l'installation mono-utilisateur.
DROP FUNCTION IF EXISTS public.get_activity_feed(INTEGER);
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Reprend honnêtement l'état existant : une seule date certaine par média.
-- Les anciens repeat_count restent intacts, mais aucune date de revisionnage
-- inconnue n'est inventée pour gonfler les statistiques mensuelles.
INSERT INTO public.media_events (
  user_id, media_id, event_type, occurred_at, metadata, dedupe_key
)
SELECT
  media.user_id,
  media.id,
  CASE
    WHEN media.status = 'finished' AND media.date_finished IS NOT NULL THEN 'finished'
    WHEN media.status = 'playing'  AND media.date_started  IS NOT NULL THEN 'started'
    ELSE 'added'
  END,
  CASE
    WHEN media.status = 'finished' AND media.date_finished IS NOT NULL
      THEN (media.date_finished::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris'
    WHEN media.status = 'playing' AND media.date_started IS NOT NULL
      THEN (media.date_started::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris'
    ELSE media.created_at
  END,
  jsonb_build_object(
    'legacy', true,
    'date_only', CASE
      WHEN media.status = 'finished' AND media.date_finished IS NOT NULL THEN true
      WHEN media.status = 'playing' AND media.date_started IS NOT NULL THEN true
      ELSE false
    END,
    'status', media.status,
    'rating', media.rating,
    'occurrence', 1,
    'legacy_repeat_total', CASE
      WHEN media.date_finished IS NOT NULL OR media.status = 'finished' OR media.repeat_count > 0
        THEN media.repeat_count + 1
      ELSE 0
    END
  ),
  'legacy-primary:' || media.id::text
FROM public.media_entries AS media
ON CONFLICT DO NOTHING;

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
  AFTER INSERT OR UPDATE
  ON public.media_entries
  FOR EACH ROW EXECUTE FUNCTION public.capture_media_event();

REVOKE ALL ON FUNCTION public.capture_media_event() FROM PUBLIC;
