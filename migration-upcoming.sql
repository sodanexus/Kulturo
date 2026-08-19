-- Kulturo — migration "Prochaines sorties"
-- À exécuter une seule fois dans Supabase > SQL Editor sur un projet existant.

ALTER TABLE media_entries ADD COLUMN IF NOT EXISTS subtype TEXT;

ALTER TABLE media_entries
  DROP CONSTRAINT IF EXISTS media_entries_subtype_check;

ALTER TABLE media_entries
  ADD CONSTRAINT media_entries_subtype_check
  CHECK (subtype IS NULL OR subtype IN ('movie', 'tv'));
