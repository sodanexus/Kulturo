-- ============================================================
-- Kulturo 2.4 — compteur de revisionnage / relecture / rejeu
-- Migration additive et réexécutable : aucune ligne n'est supprimée.
-- ============================================================

BEGIN;

ALTER TABLE public.media_entries
  ADD COLUMN IF NOT EXISTS repeat_count SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.media_entries
  DROP CONSTRAINT IF EXISTS media_entries_repeat_count_check;

ALTER TABLE public.media_entries
  ADD CONSTRAINT media_entries_repeat_count_check
  CHECK (repeat_count BETWEEN 0 AND 999);

COMMIT;
