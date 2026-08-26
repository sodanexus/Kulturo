# Kulturo — journal culturel personnel

Kulturo permet de suivre ses films, séries, jeux vidéo et livres, de les noter et de consulter les prochaines sorties culturelles en France. L’application est une SPA statique déployée sur GitHub Pages, avec Supabase pour l’authentification, la base de données et les fonctions serveur.

Version actuelle : **3.0.7**

## Fonctionnalités

- Bibliothèque personnelle avec statuts, favoris, notes sur 10 et avis privés
- Étagère **En cours** pour reprendre rapidement un média
- Compteur de revisionnages, relectures et nouvelles parties
- Ajout guidé avec recherche TMDb, IGDB et Open Library
- Fiches détaillées : synopsis, casting, durée, saisons, plateformes et bandes-annonces
- Prochaines sorties françaises pour les films, séries, jeux et livres
- Chargement progressif des différentes sources dans **Sorties**
- Journal personnel chronologique : ajouts, débuts, achèvements et notes
- Vue **Communauté** réservée aux autres membres, avec fiches en lecture seule
- Profil annuel ou mensuel avec statistiques, Top et répartition par catégorie
- Histogramme des notes cliquable vers les médias concernés
- Export JSON de la bibliothèque et du Journal
- Interface responsive et PWA installable sur mobile

## Technologies

| Couche | Technologie |
|---|---|
| Frontend | HTML, CSS et JavaScript natif |
| Authentification et base | Supabase Auth + PostgreSQL + RLS |
| Fonctions serveur | Supabase Edge Functions |
| Films et séries | TMDb |
| Jeux vidéo | IGDB / Twitch |
| Livres | BnF, Open Library et Google Books |
| Traduction | Groq |
| Hébergement | GitHub Pages |

## Structure du projet

```text
Kulturo/
├── index.html
├── app.js
├── domain.js
├── api.js
├── supabase.js
├── style.css
├── config.js
├── schema.sql
├── package.json
├── manifest.json
├── sw.js
├── icon.svg
├── icon-192.png
├── icon-512.png
├── tests/
│   ├── domain.test.mjs
│   └── frontend-contract.test.mjs
└── supabase/functions/
    ├── igdb-proxy/index.ts
    ├── google-books-proxy/index.ts
    └── groq-proxy/index.ts
```

`schema.sql` est l’unique référence conservée pour créer une base Supabase neuve. La base déjà installée fonctionne indépendamment des fichiers SQL présents sur GitHub : leur suppression ne modifie ni les tables ni les données existantes.

## Installation neuve

### 1. Préparer Supabase

Créer un projet Supabase, ouvrir **SQL Editor**, puis exécuter une seule fois le contenu de :

```text
schema.sql
```

Ce fichier crée la structure complète actuelle : médias, profils, Journal, politiques RLS, déclencheur d’événements et fonction Communauté.

Pour une installation Kulturo 3.0.7 déjà fonctionnelle, il ne faut pas réexécuter `schema.sql` lors d’une simple mise à jour du frontend.

### 2. Déployer les Edge Functions

Depuis **Supabase → Edge Functions**, créer ou mettre à jour les trois fonctions avec leur fichier `index.ts` respectif :

- `igdb-proxy`
- `google-books-proxy`
- `groq-proxy`

Conserver la vérification JWT activée.

Ajouter ensuite les secrets nécessaires dans **Edge Functions → Secrets** :

| Secret | Utilisation |
|---|---|
| `IGDB_CLIENT_ID` | Identifiant Twitch/IGDB |
| `IGDB_CLIENT_SECRET` | Secret Twitch/IGDB |
| `GOOGLE_BOOKS_API_KEY` | Enrichissement des fiches de livres |
| `GROQ_API_KEY` | Traduction des descriptions |

Les fonctions autorisent actuellement l’origine `https://sodanexus.github.io`. En cas de changement de domaine, adapter `Access-Control-Allow-Origin` dans les trois fonctions.

### 3. Configurer le navigateur

`config.js` est public et ne doit contenir que des valeurs prévues pour le navigateur :

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
  googleBooks: {
    proxyFunction: "google-books-proxy",
  },
  app: {
    name: "Kulturo",
    version: "3.0.7",
    defaultTheme: "dark",
    itemsPerPage: 24,
  },
};
```

Ne jamais placer `IGDB_CLIENT_SECRET`, `GOOGLE_BOOKS_API_KEY`, `GROQ_API_KEY`, une clé Supabase `service_role` ou tout autre secret dans `config.js`.

### 4. Déployer sur GitHub Pages

1. Envoyer les fichiers à la racine du dépôt.
2. Dans **Settings → Pages**, sélectionner la branche `main` et le dossier `/`.
3. Conserver les chemins `/Kulturo/` dans `manifest.json`, `sw.js` et `index.html` tant que le dépôt garde ce nom.

Adresse attendue :

```text
https://sodanexus.github.io/Kulturo/
```

## Utilisation

### Bibliothèque et fiches

La bibliothèque peut être filtrée par type, statut, note, favori, année ou mois. Les cartes ouvrent une fiche détaillée avec les informations enregistrées et, si nécessaire, les compléments récupérés auprès des APIs.

Les actions rapides permettent de :

- passer entre **Wishlist**, **En cours** et **Terminé** ;
- attribuer une note de 1 à 10 par demi-étoile ;
- ajouter ou retirer un coup de cœur ;
- corriger le nombre de revisionnages, relectures ou parties terminées.

Lorsqu’un média déjà terminé repasse sur **En cours**, Kulturo conserve son premier achèvement. Le prochain passage sur **Terminé** incrémente automatiquement le compteur.

### Journal et Communauté

**Mon journal** regroupe chronologiquement toutes les actions personnelles, sans sous-filtre intermédiaire. Chaque ligne rouvre la fiche concernée.

**Communauté** affiche uniquement l’activité partageable des autres membres. Le compte connecté n’y est jamais répété, puisqu’il possède déjà son Journal. Les notes textuelles, dates personnelles de suivi et autres informations privées ne sont pas exposées. Les fiches des autres restent en lecture seule.

### Profil

Le Profil propose une vue annuelle ou mensuelle, filtrable par films, séries, jeux et livres.

- **En un coup d’œil** compte les achèvements réellement datés dans la période.
- **Vos préférés** affiche les médias notés ou terminés pendant cette période.
- Une simple mise en cours ne fait pas remonter une ancienne note dans le Top.
- Un mois choisi manuellement reste affiché même s’il est vide.
- À l’ouverture, un mois courant sans Top peut revenir au dernier mois précédent renseigné.
- L’histogramme global ouvre les médias correspondant exactement à la note sélectionnée.

Les anciens médias marqués **Terminé** sans date ont été harmonisés en utilisant leur date d’ajout, conformément au fonctionnement personnel de cette installation.

### Prochaines sorties

TMDb fournit les films et premières diffusions de séries attendus en France, IGDB les jeux datés pour l’Europe ou à défaut à l’international, et les flux BnF les annonces françaises de livres, bandes dessinées et mangas.

Chaque source s’affiche dès qu’elle répond, sans attendre les autres. Les annonces BnF sont consultées à la volée et ne sont enregistrées dans la bibliothèque qu’après une action volontaire sur **Wishlist**.

### Sauvegarde

Le bouton **Sauvegarder** du Profil télécharge un fichier JSON contenant la bibliothèque, les notes personnelles et les événements du Journal. Ce fichier reste sur l’appareil de l’utilisateur.

## PWA et fonctionnement hors ligne

Le service worker utilise une stratégie network-first pour l’application et un cache limité pour les images. Après une connexion réussie, la dernière bibliothèque chargée peut être affichée hors ligne en lecture seule. Les recherches externes, modifications et prochaines sorties nécessitent le réseau.

Sur iPhone et iPad, l’interface prend en compte les safe areas en mode installé. Lorsqu’une nouvelle version est disponible, Kulturo affiche un bandeau **Mettre à jour** avant de recharger l’application.

## Base de données et sécurité

`media_entries` utilise `media_type = 'movie'` pour les films et séries :

- `subtype = 'movie'` pour un film ;
- `subtype = 'tv'` pour une série.

Les politiques Row Level Security limitent chaque utilisateur à ses propres médias et événements personnels. La fonction Communauté ne retourne qu’un ensemble réduit de champs partageables.

La clé anonyme/publishable Supabase est conçue pour être utilisée par le client. La sécurité repose sur les politiques RLS. Toutes les clés sensibles restent dans les secrets Supabase.

## Maintenance

- Garder `schema.sql` synchronisé avec la structure complète de production.
- Après une future évolution de la base, intégrer son état final dans `schema.sql` avant d’archiver le script ponctuel correspondant.
- Mettre à jour la version dans `config.js` et le nom du cache dans `sw.js` uniquement lors d’une vraie publication de l’application.
- Lancer les tests avec :

```bash
node --test tests/*.test.mjs
```

## Vérifications avant mise en ligne

- Vérifier que `config.js` ne contient aucun secret serveur.
- Tester connexion, ajout, modification, suppression et détection des doublons.
- Vérifier le Journal personnel et la Communauté.
- Tester le switch annuel/mensuel et les filtres du Profil.
- Vérifier le Top mensuel et les compteurs d’achèvement.
- Tester les prochaines sorties et leur chargement progressif.
- Vérifier l’export JSON depuis le Profil.
- Tester l’installation et le rafraîchissement de la PWA sur mobile.
- Exécuter `node --test tests/*.test.mjs`.
