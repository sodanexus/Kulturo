BEGIN;
ALTER TABLE public.media_entries DROP CONSTRAINT IF EXISTS media_entries_source_api_check;
ALTER TABLE public.media_entries ADD CONSTRAINT media_entries_source_api_check
  CHECK (source_api IS NULL OR source_api IN ('tmdb','igdb','rawg','openlibrary','hardcover','manual'));
NOTIFY pgrst, 'reload schema';
COMMIT;
