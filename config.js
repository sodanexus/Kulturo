// ============================================================
// config.example.js — Copier ce fichier en config.js
// et remplir vos vraies clés. Ne jamais committer config.js.
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

// ── IGDB/Twitch (jeux vidéo) — https://dev.twitch.tv/console
igdb: {
  clientId:     "kg3t3t0fm5ufgc8pe4op8q38zewxlw",
  clientSecret: "zdh8tg73y428kydfkfmz4ijxqvzm2j",
},

  // ── Open Library (livres) — pas de clé requise
  openLibrary: {
    baseUrl: "https://openlibrary.org",
    coverBase: "https://covers.openlibrary.org/b/id",
  },

  groq: {
  apiKey: "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",
  model:  "llama3-8b-8192",
},

  // ── App settings ────────────────────────────────────────
  app: {
    name: "Kulturo",
    version: "1.0.0",
    defaultTheme: "dark", // "dark" | "light"
    itemsPerPage: 24,
    demoMode: false, // true = données de démo si Supabase non configuré
  },
};


