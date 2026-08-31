# Kulturo — journal culturel personnel

Kulturo permet de suivre ses films, séries, jeux vidéo et livres, de les noter et de consulter les prochaines sorties culturelles en France. L’application est une SPA statique déployée sur GitHub Pages, avec Supabase pour l’authentification, la base de données et les fonctions serveur.

Version actuelle : **3.2.6**

## Fonctionnalités

- Bibliothèque personnelle ouverte par défaut sur **Terminé**, avec favoris, notes sur 10 et recherche locale
- Étagère **À reprendre** repliable, compacte sur mobile et mémorisée par appareil
- Compteur de revisionnages, relectures et nouvelles parties
- Ajout compact avec recherche universelle TMDb, IGDB et Open Library
- Fiches détaillées : synopsis prioritaire et chargé progressivement, casting, informations essentielles et bandes-annonces
- Acteurs, réalisateurs, auteurs, genres, éditeurs et studios reliés à la bibliothèque
- Prochaines sorties françaises pour les films, séries, jeux et livres
- Chargement progressif des différentes sources dans **Sorties**
- Journal personnel chronologique : actions similaires regroupées à partir de trois, dépliables et masquables sans modifier les médias ni les statistiques
- Vue **Communauté** réservée aux autres membres, avec fiches en lecture seule
- Profil annuel ou mensuel avec statistiques, Top et répartition par catégorie
- Histogramme des notes toujours placé juste après **En un coup d’œil** et cliquable vers les médias concernés
- Navigation Retour intelligente pour les pages, fiches, filtres et panneaux d’informations
- Préchargement discret des fiches au survol ou au toucher, avec transitions locales des enrichissements
- Navigation temporelle dans le Journal et récapitulatif de chaque mois
- Recommandations **Pour vous** dans Sorties selon les genres, personnes et studios les plus présents dans la bibliothèque
- Profil enrichi : genres explorés et revisionnages
- Densité **Standard** ou **Compacte** pour les grandes bibliothèques, sans réglage mobile redondant
- Accents visuels dérivés de la couleur dominante de la jaquette, recalculables et conservés localement, avec couleur de barre système synchronisée
- Réparation progressive des anciennes identités TMDb et des bannières manquantes lors de l’ouverture d’une fiche
- États communs de chargement, de liste vide et d’erreur, avec mise à jour locale des cartes et blocs du Profil
- Couche réseau commune avec annulation des recherches obsolètes, cache à durée de vie, délai maximal et nouvelle tentative
- Export JSON de la bibliothèque et du Journal
- Interface responsive et PWA installable, avec toutes les modales refermables par glissement sur mobile
- Échelle typographique commune à toute l’interface, avec des textes mobiles lisibles sans casser les vues compactes
- En-tête mobile simplifié : seul le logo **Kulturo** reste à gauche de la recherche
- Logo mobile centré dans toute sa cellule, avec des marges équilibrées autour de lui
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
│   ├── mobile-polish.css
│   └── enhancements.css
├── features/
│   ├── add-flow.js
│   ├── dom-updates.js
│   ├── insights.js
│   ├── cover-accent.js
│   ├── journal-groups.js
│   ├── media-metadata.js
│   ├── request-client.js
│   └── ui-states.js
├── config.js
├── schema.sql
├── manifest.json
├── sw.js
├── icon.svg
├── icon-192.png
├── icon-512.png
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

Pour une installation Kulturo 3.2.x déjà fonctionnelle, il ne faut pas réexécuter tout `schema.sql` lors d’une simple mise à jour du frontend.

### Autorisation requise depuis la version 3.2.2

La suppression discrète d’un événement du Journal est un masquage non destructif dans sa colonne `metadata`. Pour l’autoriser sur une base existante, exécuter une seule fois dans **Supabase → SQL Editor** :

```sql
DROP POLICY IF EXISTS "events_update_own" ON public.media_events;
CREATE POLICY "events_update_own" ON public.media_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE (metadata) ON public.media_events TO authenticated;
```

Ce réglage ne modifie et ne supprime aucune ligne existante. Une installation neuve qui utilise le `schema.sql` fourni possède déjà cette politique.

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
    version: "3.2.6",
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

La bibliothèque affiche **Terminé** par défaut, tout en conservant l’étagère **À reprendre** au-dessus. Le filtre de statut propose **Terminé**, **Wishlist**, **En cours** et **Abandonné** ; les choix redondants **Tout** et **En pause** ne sont plus proposés. Les autres filtres portent sur le type, la note, le favori, l’année ou le mois. La recherche située dans l’en-tête filtre directement les cartes déjà présentes, sans liste de résultats superposée ; l’ajout d’une nouvelle œuvre passe exclusivement par le bouton central **+**. Les cartes ouvrent une fiche détaillée avec les informations enregistrées et, si nécessaire, les compléments récupérés auprès des APIs.

Le panneau Filtres propose une seule préférence de densité : **Standard** conserve les affiches confortables, tandis que **Compact** en affiche davantage, y compris sur mobile. L’ancien choix indépendant de deux ou trois colonnes n’est plus nécessaire.

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

À partir de trois actions identiques dans une même journée et pour un même type de média, le Journal les condense en une ligne — par exemple **3 films vus** ou **3 films ajoutés à la wishlist**. Un appui déplie les œuvres sans perdre la chronologie. Sur ordinateur, le sélecteur **Mon journal / Communauté**, le mois et les flèches restent ancrés pendant le défilement.

La petite corbeille d’une ligne retire seulement cet événement du fil visible. Le média, son statut, sa note, la date de l’action, les statistiques et les Tops restent inchangés ; l’événement est simplement marqué comme masqué afin que ce choix soit conservé entre les appareils.

La note affichée sur chaque ligne est toujours la note actuelle du média, au format **★ 8/10**. Ajouter, modifier ou effacer une note actualise ce badge sans créer de ligne visible, ni modifier les dates ou l’ordre des étapes. Les anciennes lignes de notation sont également masquées. Les événements de notation restent conservés pour les Tops mensuels et les sauvegardes ; aucune donnée n’est supprimée.

**Communauté** affiche uniquement l’activité partageable des autres membres. Le compte connecté n’y est jamais répété, puisqu’il possède déjà son Journal. Les notes textuelles, dates personnelles de suivi et autres informations privées ne sont pas exposées. Les fiches des autres restent en lecture seule.

Le Journal reste ouvert sur tout l’historique. Ses flèches et son sélecteur permettent de rejoindre rapidement un mois sans transformer le fil en filtre permanent. Un récapitulatif clôt chaque mois avec le nombre de médias terminés, la moyenne des médias notés sur la période et son favori éventuel.

### Profil

Le Profil propose une vue annuelle ou mensuelle, filtrable par films, séries, jeux et livres.

- **En un coup d’œil** compte les achèvements réellement datés dans la période.
- **Vos préférés** affiche les médias notés ou terminés pendant cette période.
- Une simple mise en cours ne fait pas remonter une ancienne note dans le Top.
- Un mois choisi manuellement reste affiché même s’il est vide.
- À l’ouverture, un mois courant sans Top peut revenir au dernier mois précédent renseigné.
- L’histogramme global reste toujours juste après **En un coup d’œil** et ouvre les médias correspondant exactement à la note sélectionnée.
- Les nombres principaux évoluent doucement lors d’un changement de période, sans reconstruire les blocs restés identiques.
- Les genres les plus explorés et le nombre de revisionnages complètent la lecture du Profil.

Les anciens médias marqués **Terminé** sans date ont été harmonisés en utilisant leur date d’ajout, conformément au fonctionnement personnel de cette installation.

### Prochaines sorties

TMDb fournit les films et premières diffusions de séries attendus en France, IGDB les jeux datés pour l’Europe ou à défaut à l’international, et les flux BnF les annonces françaises de livres, bandes dessinées et mangas.

Chaque source s’affiche dès qu’elle répond, sans attendre les autres. Les annonces BnF sont consultées à la volée et ne sont enregistrées dans la bibliothèque qu’après une action volontaire sur **Wishlist**.

Une sortie peut recevoir le badge **Pour vous** lorsqu’elle correspond fortement aux genres, réalisateurs, auteurs, studios ou éditeurs déjà représentés dans votre bibliothèque. Le badge reste volontairement exigeant : une seule correspondance isolée ne suffit pas.

## Navigation et performances

Le bouton Retour du navigateur ou du téléphone ferme d’abord le panneau actuellement ouvert (confirmation, information, filtres ou fiche), puis revient à la page précédente. La position, la page active et les filtres de la bibliothèque sont conservés lorsque l’onglet du navigateur est mis en arrière-plan ou restauré.

Les couvertures et les informations récupérées apparaissent par fondu local : la fiche conserve sa structure et ses actions pendant l’enrichissement, avec un message explicite lorsqu’aucun synopsis n’est disponible. Les cartes de la bibliothèque et les blocs du Profil sont réconciliés localement afin qu’une petite modification ne reconstruise pas toute la page.

Depuis la version 3.2.4, les tailles de texte reposent sur une échelle commune allant des micro-informations aux grands titres. Les composants conservent ainsi la même hiérarchie entre le bureau et le mobile ; seuls le logo, les grands indicateurs et les titres de page s’adaptent encore à l’espace disponible. Les versions 3.2.5 et 3.2.6 simplifient l’en-tête mobile : le slogan est masqué et le logo est centré dans sa cellule, sur les deux axes, à côté de la barre de recherche.

La fiche adapte son accent à la couleur dominante de la jaquette (note, boutons, focus et barre système). Les accents calculés avec succès sont conservés dans un cache local versionné. La version 3.2.3 invalide automatiquement les anciens résultats et utilise, pour les affiches TMDb, une URL d’analyse distincte de celle déjà affichée dans la page. Cela empêche le navigateur de réutiliser une copie mémoire non lisible par le calcul de couleur. Le cache d’images PWA est également renouvelé. Un échec réseau, un délai dépassé ou une image protégée par CORS n’est pas mémorisé et sera retenté à la prochaine ouverture. Si l’analyse reste impossible, la fiche revient à l’or neutre de Kulturo.

Les bannières sont enregistrées dans `media_entries.backdrop_url` sur Supabase après leur récupération. Lorsqu’un ancien film n’a pas encore de bannière, l’ouverture de sa fiche force une vérification TMDb fraîche. Si l’ancien média ne possède pas d’identifiant TMDb, Kulturo tente d’abord un rapprochement strict par titre, type et année ; il complète ensuite uniquement les champs manquants, sans écraser les informations personnelles. Une fiche comme **Fight Club** se répare ainsi progressivement, sans réinitialisation globale de la base.

Les recherches API interrompent la requête précédente dès qu’une nouvelle saisie commence. Les recherches, sorties, détails et traductions utilisent un cache mémoire à durée de vie limitée ; ce cache ne contient aucune donnée personnelle et disparaît au rechargement de la page. Chaque requête dispose aussi d’un délai maximal et d’une reprise limitée pour les erreurs transitoires.

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
- Garder les durées et courbes d’animation dans les variables de `styles/enhancements.css`.
- Ajouter toute nouvelle source externe derrière `features/request-client.js` plutôt qu’un appel réseau direct dans l’interface.

## Vérifications avant mise en ligne

- Vérifier que `config.js` ne contient aucun secret serveur.
- Tester connexion, ajout, modification, suppression et détection des doublons.
- Tester l’ajout compact avec un résultat API et avec les trois types d’ajout manuel.
- Ouvrir une information cliquable depuis une fiche et vérifier le retour vers les médias correspondants.
- Sur mobile, tester le glissement de fermeture depuis l’en-tête d’une fiche.
- Vérifier le Journal personnel et la Communauté.
- Regrouper au moins trois actions semblables, déplier le groupe puis masquer une ligne du Journal.
- Modifier puis effacer une note : le badge du Journal doit suivre la note actuelle, sans nouvelle ligne ni changement de date.
- Tester le switch annuel/mensuel et les filtres du Profil.
- Vérifier le Top mensuel et les compteurs d’achèvement.
- Tester les prochaines sorties et leur chargement progressif.
- Vérifier l’export JSON depuis le Profil.
- Ouvrir un ancien film sans bannière et vérifier que `backdrop_url` est complété après la récupération TMDb.
- Tester l’installation et le rafraîchissement de la PWA sur mobile.
