-- Kulturo 4.9.2 : logo de titre saisi manuellement (facultatif).
ALTER TABLE public.media_entries ADD COLUMN IF NOT EXISTS logo_url TEXT;
