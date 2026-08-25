# Kulturo — journal culturel personnel

Kulturo permet de suivre ses jeux, films, séries et livres, de les noter et de consulter les prochaines sorties cinéma et TV. L’application est une SPA statique déployable sur GitHub Pages, avec Supabase pour l’authentification, la base de données et les fonctions serveur.

## Fonctionnalités

- Bibliothèque personnelle : statuts, favoris, notes sur 10, dates et notes privées
- Étagère **En cours** pour reprendre immédiatement un média
- Actions rapides dans la fiche : statut, note et coup de cœur sans ouvrir le formulaire
- Grille mobile réglable sur deux ou trois colonnes
- Recherche enrichie via TMDb, IGDB et Open Library
- Fiche détaillée au clic depuis la bibliothèque **et** les prochaines sorties
- Prochaines sorties françaises sur six mois, filtrables par films ou séries
- Synopsis, casting, durée, saisons, plateformes et bande-annonce selon les données disponibles
- Dashboard personnel et fil d’activité partagé
- Export JSON en un clic depuis le profil pour conserver une copie de sécurité
- Interface responsive et PWA installable sur mobile
- Bandeau **Mettre à jour** lorsqu'une nouvelle version de la PWA est prête
- Traduction française des descriptions anglaises via Groq

L’ancien onglet Discover et son système de recommandations ont été supprimés. Groq n’est utilisé que pour la traduction de descriptions.

## Stack

| Couche | Technologie |
|---|---|
| Frontend | HTML, CSS et JavaScript natif |
| Authentification et base | Supabase Auth + PostgreSQL + RLS |
| Fonctions serveur | Supabase Edge Functions (Deno) |
| Films et séries | TMDb |
| Jeux vidéo | IGDB / Twitch |
| Livres | Open Library |
| Traduction | Groq |
| Hébergement | GitHub Pages |

## Structure

```text
Kulturo/
├── index.html
├── app.js
├── api.js
├── supabase.js
├── style.css
├── config.js                  # Configuration publique du navigateur
├── schema.sql                 # Installation Supabase neuve
├── migration-v2.sql           # Mise à niveau d'une installation existante
├── manifest.json
├── sw.js
├── icon.svg
├── icon-192.png
├── icon-512.png
└── supabase/functions/
    ├── igdb-proxy/index.ts     # Requêtes IGDB + traduction des résumés
    └── groq-proxy/index.ts     # Traduction des descriptions de livres
```

## Installation

### Mise à jour vers Kulturo 2.2

La version 2.2 ne nécessite **aucune migration SQL**. Remplacer les fichiers du site suffit : les tables, colonnes et médias existants ne sont ni supprimés ni réécrits. Les actions rapides utilisent les champs déjà présents. Elles complètent `date_started` ou `date_finished` uniquement lorsque la date correspondante est vide ; l’historique existant n’est jamais effacé.

Pour profiter de l’optimisation des recherches IGDB, redéployer uniquement `igdb-proxy`. Ce redéploiement ne touche pas la base de données.

### 1. Préparer Supabase

Créer un projet sur [Supabase](https://supabase.com), puis ouvrir le **SQL Editor**.

Pour une installation neuve, exécuter le contenu de :

```text
schema.sql
```

Pour un projet Kulturo déjà installé, exécuter :

```text
migration-v2.sql
```

La migration v2 est réexécutable et ne supprime pas les médias. Elle :

- ajoute les champs de la fiche enrichie ;
- autorise `igdb` dans `source_api` ;
- crée ou complète la table `profiles` ;
- installe la fonction sécurisée `get_activity_feed`.

Il n’est pas nécessaire d’exécuter `schema.sql` puis `migration-v2.sql` sur une installation neuve : `schema.sql` suffit.

### 2. Déployer les Edge Functions

Depuis un projet lié avec la CLI Supabase :

```bash
supabase functions deploy igdb-proxy
supabase functions deploy groq-proxy
```

Conserver la vérification JWT par défaut : les appels sont envoyés avec la session de l’utilisateur connecté. Ne pas déployer ces fonctions avec `--no-verify-jwt`.

Configurer ensuite les secrets dans **Supabase > Edge Functions > Secrets**, ou avec la CLI :

```bash
supabase secrets set IGDB_CLIENT_ID="..."
supabase secrets set IGDB_CLIENT_SECRET="..."
supabase secrets set GROQ_API_KEY="..."
```

| Secret | Origine |
|---|---|
| `IGDB_CLIENT_ID` | [Console développeur Twitch](https://dev.twitch.tv/console) |
| `IGDB_CLIENT_SECRET` | Console développeur Twitch |
| `GROQ_API_KEY` | [Console Groq](https://console.groq.com) |

Les fonctions autorisent actuellement l’origine `https://sodanexus.github.io`. En cas de changement de domaine, modifier `Access-Control-Allow-Origin` dans les deux fichiers `index.ts`, puis les redéployer.

### 3. Configurer le navigateur

`config.js` est chargé directement par le site et doit donc être présent dans le dépôt GitHub Pages. Il ne doit contenir que des valeurs utilisables publiquement par le navigateur :

```js
const CONFIG = {
  supabase: {
    url: "https://VOTRE_PROJET.supabase.co",
    anonKey: "VOTRE_CLE_ANON_OU_PUBLISHABLE",
  },
  tmdb: {
    apiKey: "VOTRE_CLE_TMDB",
    baseUrl: "https://api.themoviedb.org/3",
    imageBase: "https://image.tmdb.org/t/p/w500",
  },
  igdb: {
    clientId: "VOTRE_CLIENT_ID_PUBLIC",
  },
  openLibrary: {
    baseUrl: "https://openlibrary.org",
    coverBase: "https://covers.openlibrary.org/b/id",
  },
  app: {
    name: "Kulturo",
    version: "2.2.0",
    defaultTheme: "dark",
    itemsPerPage: 24,
  },
};
```

Ne jamais placer `IGDB_CLIENT_SECRET`, `GROQ_API_KEY`, une clé Supabase `service_role` ou tout autre secret dans `config.js`.

### 4. Déployer sur GitHub Pages

1. Pousser les fichiers à la racine du dépôt.
2. Dans **Settings > Pages**, choisir la branche `main` et le dossier `/`.
3. Vérifier les chemins `/Kulturo/` dans `manifest.json`, `sw.js` et l’enregistrement du service worker dans `index.html` si le dépôt change de nom.

URL attendue pour ce dépôt :

```text
https://sodanexus.github.io/Kulturo/
```

## Utilisation

### Bibliothèque

- Filtres par jeu, film, série ou livre
- Statuts : wishlist, en cours, terminé, en pause ou abandonné
- Note de 1 à 10 par demi-étoile
- Recherche globale et ajout rapide via les APIs
- Détection des doublons par API/identifiant, type et titre normalisé
- Dates de début et de fin ajoutées lors des futurs changements de statut, sans rétroactivité
- Étagère **En cours** visible en haut lorsque les filtres sont désactivés
- Choix de deux ou trois colonnes sur mobile depuis **Filtres > Affichage mobile**

### Copie de sécurité

Le bouton **Sauvegarde** du profil télécharge un fichier JSON contenant la bibliothèque et les notes personnelles. Ce fichier reste sur l’appareil de l’utilisateur et aucune donnée n’est envoyée à un service supplémentaire.

### Fiche détaillée

Un clic sur une carte ouvre une modale. Elle affiche immédiatement les informations déjà enregistrées, puis récupère au besoin les détails de l’API associée :

- TMDb : synopsis, backdrop, réalisation/création, casting, durée, saisons, statut et plateformes françaises ;
- IGDB : description, développeur, éditeur et plateformes ;
- Open Library : description, nombre de pages, ISBN et éditeur.

Les détails récupérés sont enregistrés dans `media_entries` afin d’être disponibles aux prochaines ouvertures. Si l’API échoue, la modale garde les données locales et pourra réessayer plus tard.

Les actions rapides de la fiche permettent de passer entre **Wishlist**, **En cours** et **Terminé**, de changer la note et de marquer un coup de cœur. Chaque modification est envoyée à Supabase séparément ; l’interface locale n’est mise à jour qu’après confirmation de la base.

Depuis **Prochaines sorties**, un clic sur l’affiche ouvre la même fiche détaillée. Le bouton d’ajout place le titre dans la wishlist.

### Prochaines sorties

TMDb fournit les films et premières diffusions de séries attendus en France pendant environ six mois. Les boutons **Tout**, **Films** et **Séries** changent uniquement l’affichage ; ils ne modifient pas la bibliothèque.

Les anciennes dates parfois renvoyées par TMDb à cause d’une ressortie régionale sont écartées : l’onglet conserve uniquement les dates réellement comprises entre aujourd’hui et la fin de la période affichée.

### PWA

Le service worker utilise une stratégie network-first pour l’application et un cache limité pour les images. Après une première connexion réussie, la dernière bibliothèque chargée peut être affichée hors ligne en lecture seule. Supabase reste la source de vérité : ce cache local n’est jamais renvoyé vers la base. Les recherches externes, les modifications et les prochaines sorties nécessitent le réseau.

Sur iPhone et iPad, l’interface tient compte des safe areas en mode web app : barre d’état et Dynamic Island en haut, indicateur d’accueil en bas, ainsi que les marges latérales en orientation paysage. Lorsqu’une nouvelle version est prête, un bandeau propose **Mettre à jour** ; Kulturo recharge ensuite l’interface sans modifier les données Supabase.

## Base de données et sécurité

`media_entries` utilise `media_type = 'movie'` pour les films et séries, avec :

- `subtype = 'movie'` pour un film ;
- `subtype = 'tv'` pour une série.

Les données personnelles restent protégées par Row Level Security : chaque utilisateur ne peut lire et modifier que ses propres lignes. Le fil partagé passe par `get_activity_feed`, une fonction qui ne renvoie que les champs nécessaires à l’activité publique. Les notes textuelles privées, dates personnelles et métadonnées détaillées n’y sont pas exposées.

Les clés sensibles restent dans les secrets Supabase. La clé anonyme/publishable Supabase est conçue pour le client ; la sécurité des données repose sur les policies RLS, pas sur la dissimulation de cette clé.

## Vérifications avant mise en ligne

- Exécuter `migration-v2.sql` si la base existait avant la v2
- Déployer les deux Edge Functions
- Vérifier que `config.js` ne contient aucun secret serveur
- Tester connexion, ajout, modification, suppression et détection de doublon
- Vérifier l’export JSON depuis le profil
- Tester les filtres Films/Séries et la modale depuis Prochaines sorties
- Tester les actions rapides et le choix de grille mobile
- Tester l’installation et le rafraîchissement de la PWA sur mobile
