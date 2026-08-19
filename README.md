# Kulturo — Journal culturel personnel

> Suis tes jeux, films, séries et livres. Enrichissement automatique via les APIs, calendrier des prochaines sorties, fil d'activité partagé entre utilisateurs.

![GitHub Pages](https://img.shields.io/badge/hébergement-GitHub%20Pages-black) ![Supabase](https://img.shields.io/badge/base%20de%20données-Supabase-3ECF8E) ![Groq](https://img.shields.io/badge/IA-Groq-F55036) ![TMDb](https://img.shields.io/badge/films-TMDb-01B4E4) ![IGDB](https://img.shields.io/badge/jeux-IGDB-9146FF)

---

## Ce que ça fait

- 🎮 **Catalogue jeux, films, séries et livres** — recherche via IGDB, TMDb et Open Library
- ⭐ **Notation demi-étoiles** — swipe mobile, coups de cœur avec animation dorée
- 📅 **Prochaines sorties** — films et nouvelles séries attendus en France via TMDB
- 🌍 **Descriptions traduites en français** — automatiquement via Groq pour les jeux et livres
- 📊 **Dashboard personnel** — stats, progression, journal des médias terminés
- 👥 **Fil d'activité partagé** — voir ce que les autres utilisateurs ajoutent
- 📱 **PWA installable** — iOS et Android, fonctionne hors ligne

---

## Stack

| Couche | Techno |
|---|---|
| Frontend | HTML + CSS + JS vanilla (SPA, zéro dépendance) |
| Auth & DB | Supabase (Auth + PostgreSQL + RLS) |
| Edge Functions | Supabase Edge Functions (Deno) — proxy IGDB + relay Groq |
| Films & Séries | TMDb API |
| Jeux vidéo | IGDB API (via Twitch) |
| Livres | Open Library API (sans clé) |
| Traduction | Groq — descriptions de jeux et livres en français |
| Hébergement | GitHub Pages |

---

## Structure du projet

```
kulturo/
├── index.html                          # Shell de l'app
├── style.css                           # Design complet
├── app.js                              # Logique principale (SPA)
├── api.js                              # Clients TMDb, IGDB, Open Library
├── supabase.js                         # Auth, Media, Stats, Profiles, Activity
├── config.js                           # Clés API — ne pas committer (voir .gitignore)
├── sw.js                               # Service Worker (cache + offline)
├── schema.sql                          # Schéma Supabase à exécuter
├── migration-upcoming.sql              # Migration d'une installation existante
├── manifest.json                       # PWA manifest
├── icon.svg / icon-192.png / icon-512.png
└── supabase/functions/
    └── igdb-proxy/index.ts             # Edge Function — IGDB + traduction Groq
```

> ⚠️ `config.js` est dans `.gitignore`. Ne jamais committer les clés API.

---

## Déploiement

### 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. **SQL Editor** → coller et exécuter `schema.sql`
3. **Settings > API** → noter `Project URL` et `anon public key`

> Projet Kulturo déjà installé : exécuter `migration-upcoming.sql` une fois pour ajouter la colonne `subtype` utilisée par les séries. La migration conserve les données existantes.

#### Déployer les Edge Functions

```bash
supabase functions deploy igdb-proxy
```

Ajouter les secrets dans **Settings > Edge Functions** :

| Secret | Valeur |
|---|---|
| `IGDB_CLIENT_ID` | Client ID depuis [dev.twitch.tv](https://dev.twitch.tv/console) |
| `IGDB_CLIENT_SECRET` | Client Secret Twitch |
| `GROQ_API_KEY` | Clé depuis [console.groq.com](https://console.groq.com) |

> La Edge Function `groq-proxy` reste utilisée uniquement pour traduire les descriptions de livres.

---

### 2. Configurer config.js

Copier `config.js` et remplir les valeurs :

```js
const CONFIG = {
  supabase: {
    url:     'https://VOTRE_PROJET.supabase.co',
    anonKey: 'VOTRE_ANON_KEY',
  },
  tmdb: {
    apiKey:    'VOTRE_CLE_TMDB',        // themoviedb.org/settings/api
    baseUrl:   'https://api.themoviedb.org/3',
    imageBase: 'https://image.tmdb.org/t/p/w500',
  },
  igdb: {
    clientId:     'VOTRE_CLIENT_ID',    // dev.twitch.tv/console
    clientSecret: 'VOTRE_SECRET',
  },
  openLibrary: {
    baseUrl:   'https://openlibrary.org',
    coverBase: 'https://covers.openlibrary.org/b/id',
  },
  app: {
    name:         'Kulturo',
    defaultTheme: 'dark',   // "dark" | "light"
    itemsPerPage: 24,
  },
};
```

---

### 3. GitHub Pages

1. Créer un repo GitHub et pousser tous les fichiers à la racine
2. **Settings > Pages** → branche `main`, dossier `/`
3. L'app est accessible sur `https://VOTRE_USERNAME.github.io/kulturo`

---

### 4. Installer sur mobile (PWA)

**iPhone** — Safari → ouvrir le site → bouton partage **↑** → **"Sur l'écran d'accueil"**

**Android** — Chrome → menu ⋮ → **"Ajouter à l'écran d'accueil"**

---

## Fonctionnalités détaillées

### Bibliothèque
- Grille avec filtres par type (jeux / films / séries / livres), statut, favoris et recherche
- Tri par date d'ajout, note, titre ou date de fin
- Statuts : Wishlist · En cours · Terminé · En pause · Abandonné
- Notation demi-étoiles (1–10 en incréments de 0.5), swipe mobile
- Coups de cœur avec animation dorée
- Mémorisation de la position de scroll et des filtres entre pages

### Fiche détail enrichie
- Backdrop TMDb en fondu pour films & séries
- Poster flouté en fallback pour jeux & livres
- Métadonnées complètes : réalisateur, casting, durée, saisons, développeur, éditeur, plateformes, pages, ISBN
- Synopsis tronqué avec "Voir plus" sur mobile
- Descriptions jeux et livres traduites en français via Groq
- Saisie manuelle possible si l'API ne retourne rien

### Prochaines sorties
- Films et nouvelles séries prévus en France dans les six prochains mois
- Données TMDB triées par date de sortie
- Filtres Tout / Films / Séries
- Compte à rebours et date française sur chaque carte
- Fiche détaillée au clic avec synopsis, casting, durée et bande-annonce
- Ajout direct à la wishlist, avec détection des titres déjà présents

### Dashboard
- Statistiques personnelles (totaux par type, par statut, temps estimé)
- Journal des médias terminés avec dates
- Graphe d'activité mensuelle

### Fil d'activité
- Activité en temps réel de tous les utilisateurs
- Filtrable pour n'afficher que son propre historique

### Sécurité
- Clés Groq et IGDB stockées uniquement dans les secrets Supabase (Edge Functions)
- `config.js` exclu du repo via `.gitignore`
- Row Level Security — chaque utilisateur ne voit que ses propres données
- Tout le HTML est échappé côté client

---

## Base de données

Table principale `media_entries` :

| Colonne | Type | Description |
|---|---|---|
| `media_type` | TEXT | `game` · `movie` · `book` |
| `status` | TEXT | `wishlist` · `playing` · `finished` · `paused` · `dropped` |
| `rating` | SMALLINT | 1–10 (demi-étoiles × 2) |
| `is_favorite` | BOOLEAN | Coup de cœur |
| `external_id` | TEXT | ID TMDb / IGDB / OpenLibrary |
| `source_api` | TEXT | `tmdb` · `rawg` · `openlibrary` · `manual` |
| `subtype` | TEXT | `movie` · `tv` pour distinguer films et séries TMDB |
| `author` | TEXT | Auteur (livres) · Studio (jeux) · Réalisateur (films) |

RLS activée — policies `SELECT / INSERT / UPDATE / DELETE` restreintes à `auth.uid() = user_id`.

---

## Notes techniques

**Rate limits API (plans gratuits)**
- TMDb : 50 requêtes / seconde
- IGDB : 4 requêtes / seconde
- Open Library : pas de limite officielle
- Groq : selon les limites du modèle configuré pour les traductions

**Service Worker**
- Network-first pour HTML / JS / CSS (toujours à jour)
- Cache-first pour images et fonts (performances)
- Fallback `index.html` en cas d'erreur réseau
