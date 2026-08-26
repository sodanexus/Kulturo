-- ============================================================
-- Kulturo 3.0.1 — Restauration de l'activité communautaire
-- Migration corrective réexécutable ; aucune donnée n'est modifiée.
-- ============================================================

-- La vue Communauté est calculée à la demande depuis les médias existants.
-- Seuls les champs déjà partageables dans Kulturo 2.5 sont exposés :
-- aucune note textuelle, date personnelle de suivi ou autre donnée privée.
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
    media.cover_url,
    media.created_at,
    COALESCE(NULLIF(profile.username, ''), 'Utilisateur') AS username
  FROM public.media_entries AS media
  LEFT JOIN public.profiles AS profile ON profile.id = media.user_id
  WHERE auth.uid() IS NOT NULL
  ORDER BY media.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.get_activity_feed(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_feed(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed(INTEGER) TO authenticated;

