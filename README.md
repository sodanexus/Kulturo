# Kulturo — journal culturel personnel

Kulturo permet de suivre ses jeux, films, séries et livres, de les noter et de consulter les prochaines sorties culturelles en France. L’application est une SPA statique déployable sur GitHub Pages, avec Supabase pour l’authentification, la base de données et les fonctions serveur.

## Fonctionnalités

- Bibliothèque personnelle : statuts, favoris, notes sur 10, dates et notes privées
- Étagère **En cours** pour reprendre immédiatement un média
- Actions rapides dans la fiche : statut, note, coup de cœur et compteur de revisionnage sans ouvrir le formulaire
- Grille mobile réglable sur deux ou trois colonnes
- Ajout simplifié en deux étapes avec recherche simultanée dans toutes les catégories
- Filtres actifs visibles et supprimables directement depuis la bibliothèque
- Recherche enrichie via TMDb, IGDB et Open Library
- Fiche détaillée au clic depuis la bibliothèque, les prochaines sorties, le Journal **et** la Communauté
- Prochaines sorties sur six mois, filtrables par films, séries, jeux vidéo ou livres, affichées progressivement dès qu'une source répond
- Sélection France renforcée : dates cinéma françaises, diffuseurs TV présents en France, jeux Europe/monde et éditions françaises
- Sorties regroupées par mois avec préférences mémorisées et masquage des titres déjà ajoutés
- Synopsis, casting, durée, saisons, plateformes et bande-annonce selon les données disponibles
- Page Journal à deux vues : parcours personnel daté et activité communautaire
- Profil annuel ou mensuel, filtrable par type : statistiques, catégories et tops cliquables
- Histogramme des notes cliquable vers les médias correspondant à chaque note
- Export JSON en un clic depuis le profil pour conserver une copie de sécurité
- Interface responsive et PWA installable sur mobile
- Bandeau **Mettre à jour** lorsqu'une nouvelle version de la PWA est prête
- Casting cliquable vers les fiches IMDb des acteurs
- Résumés de livres enrichis par Open Library puis Google Books, avec traduction française via Groq
- Résumés de jeux retraduits en français si une ancienne fonction IGDB renvoie encore l’anglais

L’ancien onglet Discover et son système de recommandations ont été supprimés. Groq n’est utilisé que pour la traduction de descriptions.

## Stack

| Couche | Technologie |
|---|---|
| Frontend | HTML, CSS et JavaScript natif |
| Authentification et base | Supabase Auth + PostgreSQL + RLS |
| Fonctions serveur | Supabase Edge Functions (Deno) |
| Films et séries | TMDb |
| Jeux vidéo | IGDB / Twitch |
| Livres | BnF Nouveautés Éditeurs + Open Library + Google Books |
| Traduction | Groq |
| Hébergement | GitHub Pages |

## Structure

```text
Kulturo/
├── index.html
├── app.js
├── domain.js                 # Règles métier pures et testables
├── api.js
├── supabase.js
├── style.css
├── config.js                  # Configuration publique du navigateur
├── schema.sql                 # Installation Supabase neuve
├── migration-v2.sql           # Mise à niveau d'une installation existante
├── migration-repeat-count.sql # Ajout sûr du compteur de revisionnage
├── migration-journal.sql     # Journal daté et événements automatiques
├── migration-community-3.0.1.sql # Réactivation sûre de la Communauté
├── package.json              # Commande des tests sans dépendance
├── tests/domain.test.mjs     # Non-régressions dates, mois et revisionnages
├── manifest.json
├── sw.js
├── icon.svg
├── icon-192.png
├── icon-512.png
└── supabase/functions/
    ├── igdb-proxy/index.ts     # Requêtes IGDB + traduction des résumés
    ├── google-books-proxy/index.ts # Parutions BnF + détails Google Books
    └── groq-proxy/index.ts     # Traduction des descriptions de livres
```

## Installation

### Correctif Kulturo 3.0.4

La sélection d'une note dans l'ajout ou la modification d'un média est désormais stable : le passage entre les deux moitiés d'une étoile ne reconstruit plus toute la rangée, le grossissement n'est appliqué qu'aux véritables pointeurs de souris et un tap mobile ne peut plus déclencher deux sélections successives. Les étoiles conservent un retour visuel léger, avec prise en charge de la préférence système de réduction des animations. **Aucune migration SQL ni aucun redéploiement de fonction Supabase n'est nécessaire.**

### Ajustement Kulturo 3.0.3

Sur mobile, le sélecteur **Mon journal / Communauté** et ses filtres restent désormais visibles ensemble pendant le défilement, avec le même comportement collant et le même fond translucide que le bloc supérieur de **Sorties**. Le changement de vue remplace le filtre à l'intérieur du bloc sans superposition. **Aucune migration SQL ni aucun redéploiement de fonction Supabase n'est nécessaire.**

### Ajustement Kulturo 3.0.2

Tous les affichages de note utilisent désormais la notation numérique **★ 8/10** : cartes de la bibliothèque, fiches média, Top et moyennes du Profil, filtres, Journal et Communauté. Les cinq étoiles restent uniquement dans les contrôles interactifs servant à choisir ou modifier une note. **Aucune migration SQL ni aucun redéploiement de fonction Supabase n'est nécessaire.**

### Correctif Kulturo 3.0.1

Kulturo 3.0.1 conserve le nouveau Journal personnel et rétablit l'activité des autres membres dans la même page. Deux onglets séparent désormais clairement **Mon journal** et **Communauté** sans ajouter de destination à la navigation mobile. La Communauté retrouve aussi ses filtres **Tout le monde** et **Moi** ; les fiches des autres restent en lecture seule.

Si Kulturo 3.0 est déjà installé, exécuter uniquement dans **Supabase > SQL Editor** :

```text
migration-community-3.0.1.sql
```

Cette migration recrée la fonction à champs limités qui compose le fil à partir des médias existants. Elle ne modifie et ne supprime aucune ligne de `media_entries`, `media_events` ou `profiles`. Les profils restent directement lisibles par leur propriétaire uniquement ; la fonction Communauté n'expose ni notes textuelles, ni dates personnelles de suivi.

Envoyer ensuite les fichiers du site sur GitHub. Aucune Edge Function ne doit être redéployée.

### Mise à jour vers Kulturo 3.0

Kulturo 3.0 ajoute un **Journal personnel**. Supabase enregistre automatiquement les ajouts, débuts, achèvements, nouvelles parties et changements de note dans la même transaction que le média concerné.

Avant d'envoyer les fichiers du site, exécuter dans **Supabase > SQL Editor** :

```text
migration-journal.sql
```

Cette migration est additive pour les données et réexécutable. Elle crée `media_events`, ajoute ses règles RLS et installe un déclencheur sur `media_entries`. Aucun média, statut, compteur, avis ou note existante n'est supprimé ou réinitialisé. Les médias existants reçoivent un seul événement initial fondé sur leur date réellement connue ; une date d'ajout ne remplace plus une date de fin manquante dans les statistiques.

Le Profil utilise ensuite le Journal pour calculer les achèvements mensuels. Un mois courant sans média noté bascule automatiquement vers le dernier mois antérieur permettant d'afficher un Top, tandis qu'un mois choisi manuellement reste respecté. Chaque barre de l'histogramme des notes ouvre désormais les médias portant exactement cette note.

La logique des dates, périodes et revisionnages a été extraite dans `domain.js` et couverte par des tests exécutables avec :

```bash
node --test tests/*.test.mjs
```

Aucune Edge Function ne doit être redéployée.

### Ajustement Kulturo 2.5.9

Sur mobile, les en-têtes de pages **Votre collection · Bibliothèque**, **À surveiller · Sorties**, **La communauté · Activité** et **Votre année culturelle · Profil** sont masqués. La barre de navigation basse nomme déjà chaque destination : leur retrait libère de la hauteur sans modifier la version ordinateur ni les titres internes utiles. **Aucune migration SQL n'est nécessaire et aucune donnée n'est modifiée.**

### Correctif Kulturo 2.5.8

La version 2.5.8 automatise les revisionnages, relectures et nouvelles parties. Lorsqu'un média déjà terminé repasse sur **En cours**, sa fiche indique désormais **Revisionnage en cours**, **Relecture en cours** ou **Nouvelle partie en cours** sans augmenter le compteur. Le prochain passage sur **Terminé** ajoute automatiquement une occurrence — par exemple **Terminé 1 fois** devient **Terminé 2 fois** — tandis que les boutons − et + restent disponibles ensuite pour corriger manuellement l'historique. La date du premier achèvement est conservée. **Aucune migration SQL n'est nécessaire et aucune donnée existante n'est supprimée ou réinitialisée.**

### Correctif Kulturo 2.5.7

La version 2.5.7 maintient entièrement le curseur de **Masquer les titres ajoutés** à l'intérieur de son switch, y compris sur Safari iOS. Elle fiabilise aussi les quatre destinations principales — Bibliothèque, Sorties, Activité et Profil — en resynchronisant les navigations desktop/mobile à chaque appui et en autorisant un nouvel appui sur **Sorties** pendant ou après son chargement. **Aucune migration SQL n'est nécessaire et aucune donnée n'est modifiée.**

### Correctif Kulturo 2.5.6

La version 2.5.6 fixe la hiérarchie typographique de Kulturo. Newsreader est réservée au logo, aux grands titres de pages, aux titres des médias dans leur fiche et au texte des synopsis. Manrope structure tout le reste de l'interface : titres fonctionnels, cartes, sections, boutons, filtres, navigation, informations et statistiques. Le libellé **Synopsis** reste en Manrope pour distinguer clairement l'interface du contenu éditorial. **Aucune migration SQL n'est nécessaire et aucune donnée n'est modifiée.**

### Correctif Kulturo 2.5.5

La version 2.5.5 utilise **Manrope ExtraBold** pour les titres des fiches média. Newsreader reste réservée aux grands titres de pages afin de conserver l'identité éditoriale de Kulturo, tandis que les modales gagnent en lisibilité et en modernité. **Aucune migration SQL n'est nécessaire et aucune donnée n'est modifiée.**

### Correctif Kulturo 2.5.4

La version 2.5.4 augmente légèrement la taille des titres dans toutes les fiches média, sur mobile comme sur ordinateur. Les titres longs continuent de revenir proprement à la ligne. **Aucune migration SQL n'est nécessaire et aucune donnée de la bibliothèque n'est modifiée.**

### Correctif Kulturo 2.5.3

La version 2.5.3 remplace Google Books par les flux **BnF Nouveautés Éditeurs** pour les livres à paraître. La fonction interroge les flux Livres et Jeunesse à la volée, conserve au maximum 40 annonces comprises dans les six prochains mois et les met en cache en mémoire pendant dix minutes. Ce fonctionnement est prévu pour cette installation personnelle : le flux n'est ni copié dans Supabase, ni enregistré dans la bibliothèque tant que vous ne cliquez pas vous-même sur **Wishlist**.

La page **Sorties** charge maintenant TMDb, IGDB et la BnF en parallèle. Les films/séries, jeux ou livres apparaissent dès que leur propre source répond ; un indicateur discret précise ce qui continue de charger. Une source lente ne bloque donc plus les autres.

Enfin, l'écran d'authentification ne propose plus d'inscription : il affiche uniquement **Connexion**. La désactivation des inscriptions reste gérée dans Supabase, comme sur votre projet.

**Aucune migration SQL n'est nécessaire et aucune donnée existante n'est lue, modifiée ou supprimée par cette mise à jour.** Dans le tableau de bord Supabase, il suffit d'ouvrir **Edge Functions > google-books-proxy**, de remplacer son code par `supabase/functions/google-books-proxy/index.ts`, puis de cliquer sur **Deploy updates**. Les fonctions IGDB et Groq n'ont pas besoin d'être redéployées.

Le secret `GOOGLE_BOOKS_API_KEY` reste utile uniquement pour enrichir les fiches de livres qui n'ont pas de résumé dans Open Library. Il n'est plus nécessaire pour afficher les parutions BnF.

### Correctif Kulturo 2.5.2

La version 2.5.2 retire la clé Google Books du navigateur et de GitHub. Toutes les requêtes Livres passent désormais par `google-books-proxy`, avec la clé stockée dans les secrets Supabase. Cela évite les alertes GitHub/Google et les erreurs réseau `503` masquées par le service worker.

Le catalogue Jeux possède aussi un troisième filet : si les deux index régionaux d’IGDB sont vides, Kulturo utilise `first_release_date` et affiche honnêtement **Date internationale** au lieu de laisser l’onglet vide.

**Aucune migration SQL n’est nécessaire et aucune donnée de la bibliothèque n’est modifiée.** Une ancienne clé Google publiée doit être révoquée, même après sa suppression du dernier commit, car elle reste visible dans l’historique Git.

Révoquer d’abord l’ancienne clé publiée, puis créer de préférence un projet Google Cloud dédié à Kulturo. Pour la nouvelle clé, choisir **Restrictions relatives aux applications : Aucune** (l’appel part de Supabase, pas du navigateur) et **Restrictions relatives aux API : Books API**. La stocker ensuite uniquement dans Supabase :

```bash
supabase secrets set GOOGLE_BOOKS_API_KEY="VOTRE_NOUVELLE_CLE"
supabase functions deploy google-books-proxy
supabase functions deploy igdb-proxy
```

Il n’est pas nécessaire de redéployer `groq-proxy` pour ce correctif.

### Correctif Kulturo 2.5.1

La version 2.5.1 corrige le catalogue **Jeux** pendant la migration régionale d’IGDB. La fonction utilise le nouveau champ `release_region`, puis retombe automatiquement sur les anciennes régions Europe/Monde si le nouveau catalogue ne contient encore aucune date.

Google Books reste utile pour enrichir les fiches et peut fournir quelques parutions futures, mais son moteur de recherche ne constitue pas un calendrier exhaustif des sorties françaises. Lorsque la clé est valide mais qu’aucune date future suffisamment précise n’est renvoyée, Kulturo l’indique désormais explicitement au lieu de présenter la source comme mal configurée. Aucune édition étrangère ou date ancienne n’est ajoutée pour remplir artificiellement l’onglet.

**Aucune migration SQL n’est nécessaire et aucun média existant n’est lu, modifié ou supprimé par ce correctif.** Après avoir remplacé les fichiers du site, redéployer uniquement :

```bash
supabase functions deploy igdb-proxy
```

### Mise à jour vers Kulturo 2.5

La version 2.5 étend **Sorties** aux jeux vidéo et aux livres, et retire la majorité des séries sans diffusion française identifiable. **Aucune migration SQL n’est nécessaire et aucun média existant n’est modifié.**

Après avoir remplacé les fichiers du site, redéployer uniquement la fonction IGDB pour activer les dates de sorties européennes des jeux :

```bash
supabase functions deploy igdb-proxy
```

Depuis la version 2.5.2, la clé Google Books ne doit plus être renseignée dans `config.js`. Elle est stockée sous le secret Supabase `GOOGLE_BOOKS_API_KEY` et utilisée uniquement par `google-books-proxy` :

```bash
supabase secrets set GOOGLE_BOOKS_API_KEY="VOTRE_NOUVELLE_CLE"
supabase functions deploy google-books-proxy
```

Sans ce secret, le reste de Kulturo fonctionne normalement ; seul le catalogue Google Books est indisponible.

### Correctif Kulturo 2.4.2

Cette révision corrige uniquement l’interface : superposition de la recherche dans la fenêtre d’ajout desktop, espacement uniforme sous les en-têtes, activité plus lisible et cliquable, alignement des boutons dans les cartes Sorties, détails facultatifs séparés dans la modification mobile et accroches de pages visibles sur mobile. **Aucune migration SQL ni aucune modification des données n’est nécessaire.**

### Mise à jour vers Kulturo 2.4

La version 2.4 ajoute une seule colonne, `repeat_count`. Avant de remplacer les fichiers du site, exécuter dans **Supabase > SQL Editor** :

```text
migration-repeat-count.sql
```

Cette migration est **additive, réexécutable et sans suppression** : elle ne modifie ni les titres, ni les notes, ni les dates, ni les médias existants. Chaque ligne reçoit simplement `repeat_count = 0`. Le compteur mémorise uniquement les visionnages, lectures ou parties terminées supplémentaires ; Kulturo affiche le total en ajoutant la première consommation déjà terminée.

Redéployer ensuite les deux Edge Functions pour profiter des résumés français fiabilisés :

```bash
supabase functions deploy igdb-proxy
supabase functions deploy google-books-proxy
supabase functions deploy groq-proxy
```

Enfin, remplacer les fichiers du site. Si le frontend est déployé avant la migration, le reste de l’application continue de fonctionner ; seule l’action de revisionnage affiche un rappel de migration.

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

Puis, pour la version 2.4 :

```text
migration-repeat-count.sql
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
supabase secrets set GOOGLE_BOOKS_API_KEY="..."
supabase secrets set GROQ_API_KEY="..."
```

| Secret | Origine |
|---|---|
| `IGDB_CLIENT_ID` | [Console développeur Twitch](https://dev.twitch.tv/console) |
| `IGDB_CLIENT_SECRET` | Console développeur Twitch |
| `GOOGLE_BOOKS_API_KEY` | Google Cloud, limitée à Books API |
| `GROQ_API_KEY` | [Console Groq](https://console.groq.com) |

Les fonctions autorisent actuellement l’origine `https://sodanexus.github.io`. En cas de changement de domaine, modifier `Access-Control-Allow-Origin` dans les trois fichiers `index.ts`, puis les redéployer.

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
  googleBooks: {
    proxyFunction: "google-books-proxy",
  },
  app: {
    name: "Kulturo",
    version: "3.0.4",
    defaultTheme: "dark",
    itemsPerPage: 24,
  },
};
```

Ne jamais placer `IGDB_CLIENT_SECRET`, `GOOGLE_BOOKS_API_KEY`, `GROQ_API_KEY`, une clé Supabase `service_role` ou tout autre secret dans `config.js`.

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
- Pastilles de filtres actifs retirables en un clic
- Bouton de retour en haut après un long défilement
- Filtre de période issu du profil, y compris un mois précis

### Copie de sécurité

Le bouton **Sauvegarde** du profil télécharge un fichier JSON contenant la bibliothèque, les notes personnelles et les événements du Journal. Ce fichier reste sur l’appareil de l’utilisateur et aucune donnée n’est envoyée à un service supplémentaire.

### Fiche détaillée

Un clic sur une carte ouvre une modale. Elle affiche immédiatement les informations déjà enregistrées, puis récupère au besoin les détails de l’API associée :

- TMDb : synopsis, backdrop, réalisation/création, casting, durée, saisons, statut et plateformes françaises ;
- IGDB : description, développeur, éditeur et plateformes ;
- Open Library : description, nombre de pages, ISBN et éditeur.

Les détails récupérés sont enregistrés dans `media_entries` afin d’être disponibles aux prochaines ouvertures. Si l’API échoue, la modale garde les données locales et pourra réessayer plus tard.

Les actions rapides de la fiche permettent de passer entre **Wishlist**, **En cours** et **Terminé**, de changer la note, de marquer un coup de cœur et d’ajuster le nombre de revisionnages, relectures ou jeux terminés. Les boutons `−` et `+` évitent les erreurs de comptage. La date de fin d’origine n’est jamais remplacée par cette action. Chaque modification est envoyée à Supabase séparément ; l’interface locale n’est mise à jour qu’après confirmation de la base.

Pour les films et séries, les noms du casting sont des liens. TMDb fournit l’identifiant de la personne puis Kulturo ouvre sa fiche IMDb exacte ; si IMDb ne renvoie pas d’identifiant, le lien utilise la recherche de personnes IMDb.

Pour les livres, Kulturo cherche d’abord le résumé du livre et de ses éditions dans Open Library. S’il manque, Google Books sert de secours en privilégiant une édition française. Un texte encore anglais est envoyé à la fonction `groq-proxy`. Pour les jeux, la fiche repasse également par cette traduction si `igdb-proxy` a renvoyé le résumé original.

Depuis **Prochaines sorties**, un clic sur l’affiche ouvre la même fiche détaillée. Le bouton d’ajout place le titre dans la wishlist.

### Prochaines sorties

TMDb fournit les films et premières diffusions de séries attendus en France pendant environ six mois, IGDB les jeux datés pour l'Europe ou à défaut à l'international, et les flux BnF Nouveautés Éditeurs les annonces françaises de livres, bandes dessinées et mangas déclarées par les éditeurs. Les boutons **Tout**, **Films**, **Séries**, **Jeux** et **Livres** changent uniquement l’affichage ; ils ne modifient pas la bibliothèque.

Les trois catalogues sont interrogés en parallèle. Chaque famille de médias apparaît dès que sa source répond, sans attendre les deux autres. Les annonces BnF sont seulement consultées à la volée et mises en cache brièvement par la fonction serveur ; elles ne sont pas enregistrées dans la base de données.

Les anciennes dates parfois renvoyées par TMDb à cause d’une ressortie régionale sont écartées : l’onglet conserve uniquement les dates réellement comprises entre aujourd’hui et la fin de la période affichée.

Les résultats sont regroupés par mois. Le choix du type, le genre et l’option de masquage des titres déjà ajoutés sont mémorisés localement.

### Profil, Journal et Communauté

Le profil permet de passer de **Annuel** à **Mensuel**, de choisir l’année ou le mois, puis de filtrer par films, séries, jeux ou livres. Les statuts principaux et le top utilisent ce périmètre. Les cartes et catégories ouvrent directement la bibliothèque avec exactement la même période et le même type. L’histogramme **Notes · toutes années** reste volontairement global, mais chaque barre ouvre les médias correspondant exactement à la note choisie.

**Mon journal** regroupe chronologiquement les ajouts, débuts, achèvements, revisionnages, nouvelles parties et notes. Ses vues **Tout**, **Terminés** et **Notes** restent strictement personnelles ; chaque ligne rouvre la fiche correspondante. **Communauté** affiche les derniers ajouts des membres et ouvre les fiches des autres en lecture seule.

### PWA

Le service worker utilise une stratégie network-first pour l’application et un cache limité pour les images. Après une première connexion réussie, la dernière bibliothèque chargée peut être affichée hors ligne en lecture seule. Supabase reste la source de vérité : ce cache local n’est jamais renvoyé vers la base. Les recherches externes, les modifications et les prochaines sorties nécessitent le réseau.

Sur iPhone et iPad, l’interface tient compte des safe areas en mode web app : barre d’état et Dynamic Island en haut, indicateur d’accueil en bas, ainsi que les marges latérales en orientation paysage. Lorsqu’une nouvelle version est prête, un bandeau propose **Mettre à jour** ; Kulturo recharge ensuite l’interface sans modifier les données Supabase.

## Base de données et sécurité

`media_entries` utilise `media_type = 'movie'` pour les films et séries, avec :

- `subtype = 'movie'` pour un film ;
- `subtype = 'tv'` pour une série.

Les données personnelles restent protégées par Row Level Security : chaque utilisateur ne peut lire et modifier que ses propres médias, et ne peut lire que ses propres événements du Journal. La fonction Communauté expose uniquement le titre, le type, le statut, la note chiffrée, le favori, la couverture, la date d'ajout et le pseudo. Le déclencheur `capture_media_event` écrit l’historique dans la même transaction que la modification du média.

Les clés sensibles restent dans les secrets Supabase. La clé anonyme/publishable Supabase est conçue pour le client ; la sécurité des données repose sur les policies RLS, pas sur la dissimulation de cette clé.

## Vérifications avant mise en ligne

- Exécuter `migration-v2.sql` si la base existait avant la v2
- Exécuter `migration-repeat-count.sql` avant d’utiliser le compteur de revisionnage
- Exécuter `migration-journal.sql` avant d’ouvrir le Journal
- Après une installation 3.0, exécuter `migration-community-3.0.1.sql` pour réactiver la Communauté
- Déployer les trois Edge Functions
- Vérifier que `config.js` ne contient aucun secret serveur
- Tester connexion, ajout, modification, suppression et détection de doublon
- Vérifier l’export JSON depuis le profil
- Tester les filtres Films/Séries et la modale depuis Prochaines sorties
- Tester les actions rapides et le choix de grille mobile
- Tester la recherche universelle en deux étapes et la protection des saisies non enregistrées
- Tester les filtres cliquables du profil et les groupes mensuels des sorties
- Exécuter `node --test tests/*.test.mjs`
- Tester le switch annuel/mensuel et les filtres Films/Séries/Jeux/Livres du profil
- Vérifier un lien acteur IMDb, un résumé de livre et un résumé de jeu en français
- Vérifier les boutons `−` / `+` du compteur puis la présence de l’icône sur la carte
- Tester l’installation et le rafraîchissement de la PWA sur mobile
