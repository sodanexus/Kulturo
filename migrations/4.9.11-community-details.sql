-- Kulturo 4.9.11 : fiches communauté enrichies (lecture seule).
-- À exécuter une fois dans l'éditeur SQL de Supabase.
-- Champs de catalogue uniquement : jamais les notes personnelles, dates ni progression.

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
  username TEXT,
  external_id TEXT,
  source_api TEXT,
  genre TEXT,
  author TEXT,
  release_year SMALLINT,
  release_date DATE,
  release_date_precision TEXT,
  platform TEXT,
  description TEXT,
  backdrop_url TEXT,
  logo_url TEXT,
  directors TEXT,
  cast_members TEXT,
  duration INTEGER,
  seasons_count INTEGER,
  episodes_count INTEGER,
  air_status TEXT,
  developer TEXT,
  publisher TEXT,
  page_count INTEGER,
  isbn TEXT
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
    COALESCE(NULLIF(profile.username, ''), 'Utilisateur') AS username,
    media.external_id,
    media.source_api,
    media.genre,
    media.author,
    media.release_year,
    media.release_date,
    media.release_date_precision,
    media.platform,
    media.description,
    media.backdrop_url,
    media.logo_url,
    media.directors,
    media.cast_members,
    media.duration,
    media.seasons_count,
    media.episodes_count,
    media.air_status,
    media.developer,
    media.publisher,
    media.page_count,
    media.isbn
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
