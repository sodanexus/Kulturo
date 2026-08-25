// ============================================================
// config.js — configuration publique chargée par le navigateur.
// Ne jamais placer de secret serveur dans ce fichier.
// ============================================================

const CONFIG = {
  // ── Supabase ────────────────────────────────────────────
  supabase: {
    url: "https://ikxqwoatlqbbgskskzdo.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreHF3b2F0bHFiYmdza3NremRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzA5OTcsImV4cCI6MjA4ODcwNjk5N30.erdoDdmpLS104ZVbdFjurjBOwGA42CN3PaDk0cgNoVw",
  },

  // ── TMDb (films) — https://www.themoviedb.org/settings/api
  tmdb: {
    apiKey: "682221f4a6badf27a1894b5d60bbe80d",
    baseUrl: "https://api.themoviedb.org/3",
    imageBase: "https://image.tmdb.org/t/p/w500",
  },

  // ── IGDB/Twitch (jeux vidéo) — identifiant public uniquement.
  // Le secret client reste dans les secrets de la fonction Supabase.
  igdb: {
    clientId: "kg3t3t0fm5ufgc8pe4op8q38zewxlw",
  },

  // ── Open Library (livres) — pas de clé requise
  openLibrary: {
    baseUrl: "https://openlibrary.org",
    coverBase: "https://covers.openlibrary.org/b/id",
  },

  // ── App settings ────────────────────────────────────────
  app: {
    name: "Kulturo",
    version: "2.2.0",
    defaultTheme: "dark", // "dark" | "light"
    itemsPerPage: 24,
  },
};
