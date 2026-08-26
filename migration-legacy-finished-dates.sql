-- ============================================================
-- Kulturo 3.0.6 — réparation des anciens médias terminés
--
-- Pour un média déjà marqué "finished" mais dépourvu de date de fin :
--   1. conserve une éventuelle vraie date issue du Journal ;
--   2. sinon utilise sa date d'ajout locale comme date de fin ;
--   3. transforme son ancien événement "added" en "finished",
--      ou crée l'événement manquant.
--
-- La migration est ciblée, transactionnelle et réexécutable.
-- Elle ne touche pas aux médias en cours, en wishlist, abandonnés,
-- ni aux dates de fin déjà renseignées.
-- ============================================================

BEGIN;

CREATE TEMP TABLE kulturo_legacy_finished_repair
ON COMMIT DROP
AS
SELECT
  media.id AS media_id,
  media.user_id,
  media.created_at,
  COALESCE(
    (
      SELECT (event.occurred_at AT TIME ZONE 'Europe/Paris')::date
      FROM public.media_events AS event
      WHERE event.media_id = media.id
        AND event.user_id = media.user_id
        AND event.event_type IN ('finished', 'repeat_finished')
      ORDER BY event.occurred_at ASC
      LIMIT 1
    ),
    (media.created_at AT TIME ZONE 'Europe/Paris')::date
  ) AS inferred_date,
  EXISTS (
    SELECT 1
    FROM public.media_events AS event
    WHERE event.media_id = media.id
      AND event.user_id = media.user_id
      AND event.event_type IN ('finished', 'repeat_finished')
  ) AS has_completion_event
FROM public.media_entries AS media
WHERE media.status = 'finished'
  AND media.date_finished IS NULL;

-- Renseigne uniquement les dates manquantes. Une date existante n'est jamais
-- remplacée, et aucun autre champ de la fiche n'est modifié.
UPDATE public.media_entries AS media
SET date_finished = repair.inferred_date
FROM pg_temp.kulturo_legacy_finished_repair AS repair
WHERE media.id = repair.media_id
  AND media.user_id = repair.user_id
  AND media.status = 'finished'
  AND media.date_finished IS NULL;

-- Le backfill initial du Journal avait honnêtement conservé "added" lorsqu'il
-- ne connaissait pas la date de fin. Pour les lignes réparées, cet événement
-- unique devient maintenant l'achèvement daté attendu.
WITH event_to_repair AS (
  SELECT DISTINCT ON (event.media_id)
    event.id AS event_id,
    repair.inferred_date
  FROM public.media_events AS event
  JOIN pg_temp.kulturo_legacy_finished_repair AS repair
    ON repair.media_id = event.media_id
   AND repair.user_id = event.user_id
  WHERE repair.has_completion_event = false
    AND event.event_type = 'added'
    AND COALESCE(event.metadata->>'status', '') = 'finished'
  ORDER BY
    event.media_id,
    COALESCE(event.dedupe_key = 'legacy-primary:' || event.media_id::text, false) DESC,
    event.occurred_at ASC,
    event.id
)
UPDATE public.media_events AS event
SET
  event_type = 'finished',
  occurred_at = (
    event_to_repair.inferred_date::timestamp + interval '12 hours'
  ) AT TIME ZONE 'Europe/Paris',
  metadata = COALESCE(event.metadata, '{}'::jsonb) || jsonb_build_object(
    'status', 'finished',
    'date_only', true,
    'occurrence', 1,
    'date_inferred_from_created_at', true,
    'repair_version', '3.0.6'
  )
FROM event_to_repair
WHERE event.id = event_to_repair.event_id;

-- Filet de sécurité pour un ancien média qui n'aurait même pas reçu son
-- événement initial. La clé de déduplication rend ce passage réexécutable.
INSERT INTO public.media_events (
  user_id,
  media_id,
  event_type,
  occurred_at,
  metadata,
  dedupe_key
)
SELECT
  repair.user_id,
  repair.media_id,
  'finished',
  (
    repair.inferred_date::timestamp + interval '12 hours'
  ) AT TIME ZONE 'Europe/Paris',
  jsonb_build_object(
    'status', 'finished',
    'date_only', true,
    'occurrence', 1,
    'date_inferred_from_created_at', true,
    'repair_version', '3.0.6'
  ),
  'legacy-finished-date-repair:' || repair.media_id::text
FROM pg_temp.kulturo_legacy_finished_repair AS repair
WHERE repair.has_completion_event = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.media_events AS event
    WHERE event.media_id = repair.media_id
      AND event.user_id = repair.user_id
      AND event.event_type IN ('finished', 'repeat_finished')
  )
ON CONFLICT DO NOTHING;

-- Résultat informatif affiché par l'éditeur SQL Supabase.
SELECT COUNT(*) AS medias_termines_repares
FROM pg_temp.kulturo_legacy_finished_repair;

COMMIT;
