# Kulturo — journal culturel personnel

Kulturo permet de suivre ses films, séries, jeux vidéo et livres, de les noter et de consulter les prochaines sorties culturelles en France. L’application est une SPA statique déployée sur GitHub Pages, avec Supabase pour l’authentification, la base de données et les fonctions serveur.

Version actuelle : **3.1.4**

## Fonctionnalités

- Bibliothèque personnelle avec statuts, favoris, notes sur 10 et recherche locale
- Étagère **À reprendre** repliable, compacte sur mobile et mémorisée par appareil
- Compteur de revisionnages, relectures et nouvelles parties
- Ajout compact avec recherche universelle TMDb, IGDB et Open Library
- Fiches détaillées : synopsis prioritaire et chargé progressivement, casting, informations essentielles et bandes-annonces
- Acteurs, réalisateurs, auteurs, genres, éditeurs et studios reliés à la bibliothèque
- Prochaines sorties françaises pour les films, séries, jeux et livres
- Chargement progressif des différentes sources dans **Sorties**
- Journal personnel chronologique : ajouts, débuts, achèvements et changements de statut, avec la note actuelle
- Vue **Communauté** réservée aux autres membres, avec fiches en lecture seule
- Profil annuel ou mensuel avec statistiques, Top et répartition par catégorie
- Histogramme des notes cliquable vers les médias concernés
- Export JSON de la bibliothèque et du Journal
- Interface responsive et PWA installable, avec toutes les modales refermables par glissement sur mobile
- Animations courtes et cohérentes, adaptées au réglage système de réduction des mouvements

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
├── styles/
│   ├── add-sheet.css
│   └── mobile-polish.css
├── features/
│   ├── add-flow.js
│   └── media-metadata.js
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
│   ├── frontend-contract.test.mjs
│   └── media-ui.test.mjs
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

Pour une installation Kulturo 3.1.4 déjà fonctionnelle, il ne faut pas réexécuter `schema.sql` lors d’une simple mise à jour du frontend.

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
    version: "3.1.4",
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

La bibliothèque peut être filtrée par type, statut, note, favori, année ou mois. La recherche située dans l’en-tête filtre directement les cartes déjà présentes, sans liste de résultats superposée ; l’ajout d’une nouvelle œuvre passe exclusivement par le bouton central **+**. Les cartes ouvrent une fiche détaillée avec les informations enregistrées et, si nécessaire, les compléments récupérés auprès des APIs.

L’étagère **À reprendre** est repliée par défaut sur mobile et ouverte sur ordinateur. Elle affiche un aperçu des médias en cours et mémorise son état séparément sur chaque appareil.

Les actions rapides permettent de :

- passer entre **Wishlist**, **En cours** et **Terminé** ;
- attribuer une note de 1 à 10 par demi-étoile ;
- ajouter ou retirer un coup de cœur ;
- corriger le nombre de revisionnages, relectures ou parties terminées.

Lorsqu’un média déjà terminé repasse sur **En cours**, Kulturo conserve son premier achèvement. Le prochain passage sur **Terminé** incrémente automatiquement le compteur.

### Ajout compact

Le bouton central **+** ouvre une recherche unique pour les films, séries, jeux et livres. Toucher un résultat conduit directement à une finalisation compacte : statut principal, note et coup de cœur. L’ajout manuel n’apparaît qu’après la saisie d’un titre. **En pause** et **Abandonné** restent disponibles sous **Autre statut**. Les notes personnelles ne sont plus affichées ni proposées dans l’ajout ou la modification ; d’éventuelles anciennes valeurs restent simplement conservées afin que la mise à jour ne supprime aucune donnée.

### Informations reliées

Dans une fiche, le synopsis vient immédiatement après les actions rapides. Lorsqu’il doit être récupéré, quatre lignes-squelettes réservent déjà sa place ; le texte les remplace ensuite par un fondu croisé très court, puis **Voir plus** apparaît légèrement après. La hauteur de la fiche reste stable sur mobile et les actions rapides ne sont jamais reconstruites pendant l’enrichissement. **Voir plus** déplie ensuite le texte puis le replace automatiquement en haut de la zone de lecture afin de masquer les actions et d’éviter un second geste. Les informations essentielles suivent, puis les acteurs, réalisateurs, auteurs, développeurs, éditeurs et genres cliquables. Les dates **Terminé** et **Ajouté** ferment toujours la fiche. La durée, les plateformes de jeu et les services de streaming ne sont pas affichés. Le panneau d’une information cliquable montre les médias correspondants déjà présents dans la bibliothèque et conserve, lorsqu’il est pertinent, un lien IMDb, Goodreads ou Steam.

Sur mobile, toutes les modales suivent le doigt lors d’un glissement vers le bas depuis leur en-tête, sans fondu, puis reprennent leur place si le seuil de fermeture n’est pas atteint. Les croix de fermeture sont masquées sur ce format ; les boutons de retour restent disponibles, et le geste n’intercepte ni les commandes ni le défilement du contenu. La confirmation de suppression reprend la même structure visuelle que les autres modales.

### Journal et Communauté

**Mon journal** regroupe chronologiquement les étapes du suivi : ajout à la bibliothèque ou à la wishlist, début, achèvement, reprise et autres changements de statut. Il n’y a pas de sous-filtre intermédiaire. Chaque ligne rouvre la fiche concernée.

La note affichée sur chaque ligne est toujours la note actuelle du média, au format **★ 8/10**. Ajouter, modifier ou effacer une note actualise ce badge sans créer de ligne visible, ni modifier les dates ou l’ordre des étapes. Les anciennes lignes de notation sont également masquées. Les événements de notation restent conservés pour les Tops mensuels et les sauvegardes ; aucune donnée n’est supprimée.

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

Le bouton **Sauvegarder** du Profil télécharge un fichier JSON contenant les données de la bibliothèque et les événements du Journal. Ce fichier reste sur l’appareil de l’utilisateur.

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
- Tester l’ajout compact avec un résultat API et avec les trois types d’ajout manuel.
- Ouvrir une information cliquable depuis une fiche et vérifier le retour vers les médias correspondants.
- Sur mobile, tester le glissement de fermeture depuis l’en-tête d’une fiche.
- Vérifier le Journal personnel et la Communauté.
- Modifier puis effacer une note : le badge du Journal doit suivre la note actuelle, sans nouvelle ligne ni changement de date.
- Tester le switch annuel/mensuel et les filtres du Profil.
- Vérifier le Top mensuel et les compteurs d’achèvement.
- Tester les prochaines sorties et leur chargement progressif.
- Vérifier l’export JSON depuis le Profil.
- Tester l’installation et le rafraîchissement de la PWA sur mobile.
- Exécuter `node --test tests/*.test.mjs`.
