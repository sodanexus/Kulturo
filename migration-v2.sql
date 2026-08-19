-- ============================================================
-- Kulturo v2 — migration d'une installation existante
-- Peut être relancée sans supprimer les médias existants.
-- ============================================================

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

ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_source_api_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_source_api_check
  CHECK (source_api IS NULL OR source_api IN ('tmdb', 'igdb', 'rawg', 'openlibrary', 'manual'));
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_subtype_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_subtype_check
  CHECK (subtype IS NULL OR subtype IN ('movie', 'tv'));

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL CHECK (char_length(username) BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
CREATE TRIGGER trg_media_updated_at BEFORE UPDATE ON public.media_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_activity_feed(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID, user_id UUID, title TEXT, media_type TEXT, status TEXT,
  rating SMALLINT, is_favorite BOOLEAN, cover_url TEXT,
  created_at TIMESTAMPTZ, username TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    media.id, media.user_id, media.title, media.media_type, media.status,
    media.rating, media.is_favorite, media.cover_url, media.created_at,
    COALESCE(NULLIF(profile.username, ''), 'Utilisateur') AS username
  FROM public.media_entries AS media
  LEFT JOIN public.profiles AS profile ON profile.id = media.user_id
  ORDER BY media.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.get_activity_feed(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_feed(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed(INTEGER) TO authenticated;
