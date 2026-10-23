<div align="center">
<img src="logo.svg" width="96" alt="Kulturo : quatre cercles, films corail, séries bleu, jeux sarcelle et livres doré" />

# Kulturo

**Mon journal culturel personnel**

*Regarder. Jouer. Lire. Garder une trace.*
</div>

Kulturo réunit films, séries, jeux vidéo et livres dans une bibliothèque personnelle. Son logo aligne quatre cercles légèrement superposés, dans les couleurs des catégories : corail, bleu, sarcelle et doré. Interface sombre, notes dorées, accents tirés des couvertures, utilisation sur mobile et desktop.

## Version actuelle · 4.9.0

Le bandeau Cinéma, agrandi en 4.8.5 avec des logos plus discrets sur mobile, met l’image en valeur et ancre le logo/titre dans un dégradé sombre, avec la note et les étiquettes dessous. Les livres partagent cette ambiance en conservant leur jaquette. Le contenu à partir du synopsis reste identique.

Les fiches peuvent afficher le logo du film, de la série ou du jeu à la place du titre dans le bandeau déplié. Les jaquettes sont retirées des fiches films, séries et jeux ; les livres conservent leur couverture. Le mode compact conserve le titre texte. Le logo apparaît après décodage dans un espace stable ; si le catalogue ne fournit pas de logo adapté, le texte reste visible. Plusieurs candidats sont essayés en cas d’image défaillante ; les logos TMDb en langue originale et SVG sont également pris en charge. Dans Modifier, « Afficher le titre en texte » désactive ce rendu pour cette œuvre sur cet appareil.

Pour les jeux, redéployer `supabase/functions/igdb-proxy/index.ts` : l’action `logos` utilise l’endpoint dédié d’IGDB. Aucun nouveau secret ni SQL. Les logos sont facultatifs et ne bloquent pas les notes ou synopsis.

Les effets et leurs durées sont conservés. Les fiches regroupent leurs mesures de mise en page, les diaporamas suspendent leurs animations hors écran et Sorties conserve les cartes déjà affichées pendant l’arrivée des catalogues. Le Profil s’ouvre par défaut sur la période annuelle.

Pour publier une nouvelle version, modifier uniquement `VERSION` : `npm run verify` synchronise les références dans le runtime, les caches et la documentation avant les contrôles et le build. `npm run sync:version` permet aussi cette synchronisation seule. Ajouter les changements au `CHANGELOG.md` reste nécessaire.

La bibliothèque affiche 48 cartes, puis ajoute des lots de 48 à l’approche du bas. Les nouvelles cartes apparaissent en fondu lorsqu’elles entrent dans l’écran. Recherche, tri et compteurs portent toujours sur toute la collection ; la profondeur affichée est conservée dans la session. Les données restent chargées comme auparavant : cette optimisation réduit le rendu initial, pas la requête Supabase.

Le bandeau réunit le logo, les onglets par icônes sur desktop, la recherche contextuelle et les filtres. Ajouter reste en haut sur desktop et uniquement en bas sur mobile. Les titres de page redondants sont supprimés ; les sélecteurs du Profil sont regroupés avant les statistiques.

**Navigation.** Onglets dans la barre du haut sur desktop, barre du bas sobre sur mobile, avec un trait qui glisse sous l'onglet actif.

**Ajout rapide.** Dans « Nouvel ajout », collez un lien TMDb, IMDb, Steam, Goodreads ou Hardcover : l’œuvre est reconnue directement. Sur un livre, l’icône de code-barres à droite de la recherche scanne l’ISBN avec la caméra (autorisation demandée au premier usage ; iPhone compris).

Le profil adapte les reprises au média : **Revisionnages**, **Parties rejouées**, **Relectures**, ou **Reprises** pour Tout. Le retour de Modifier vers une fiche conserve la transition de taille sans rejouer l’apparition progressive de son contenu. Lors du filtrage, les cartes communes conservent leurs images ; seules les nouvelles cartes apparaissent en fondu.

Le schéma SQL ne change pas. La 4.8.1 met à jour uniquement la fonction igdb-proxy pour les logos des jeux.

## Les espaces

| Espace | Usage |
|---|---|
| Bibliothèque | Collection, filtres, envies et œuvres à reprendre. |
| Sorties | Parutions à venir et ajout aux envies. |
| Journal | Historique personnel par mois et activité de la communauté. |
| Profil | Bilan mensuel/annuel par média, notes, temps estimé, palmarès et sauvegardes. |

## Ajouter et suivre une œuvre

L’ajout propose **Tout / Films & séries / Jeux vidéo / Livres**. Un ISBN valide recherche seulement les livres. Les recherches récentes ne sont plus enregistrées.

Pour les livres, Hardcover fournit d’abord titre, auteur et couverture de l’œuvre. Les éditions sont chargées à la sélection ; une édition française non audio est privilégiée parmi celles reçues. L’ISBN cible une édition exacte. Pages, ISBN et éditeur proviennent d’une même édition. Open Library reste disponible automatiquement en secours et via l’action sous les résultats. La source des résultats est indiquée.

Les corrections manuelles et les anciennes fiches sont conservées. Les notes externes des livres sont masquées. Les synopsis externes peuvent être traduits via Groq ; un synopsis déjà renseigné n’est pas écrasé automatiquement.

Dans Modifier, les livres En cours disposent du suivi page actuelle/total et les séries du suivi saison/épisode. Un indicateur discret apparaît sur la fiche. Une reprise après achèvement réinitialise la progression ; terminer reste une action explicite.

## Catalogues et fonctions Supabase

| Fonction / source | Rôle | Secret serveur |
|---|---|---|
| TMDb | Films et séries | Configuration publique existante dans config.js |
| igdb-proxy | Jeux, notes et captures IGDB | Secrets Twitch/IGDB du projet |
| steamgriddb-proxy | Logos de secours des jeux | `STEAMGRIDDB_API_KEY` |
| hardcover-proxy | Recherche et métadonnées des livres | HARDCOVER_TOKEN |
| Open Library | Livres en secours, anciennes fiches | Aucun |
| book-releases-proxy | Parutions des flux publics BnF | Aucun secret Google |
| groq-proxy | Traduction des synopsis | Secret Groq du projet |

**Google Books n’est plus utilisé.** L’ancienne fonction google-books-proxy ne doit être supprimée qu’après activation de book-releases-proxy et vérification des parutions. Les secrets restent dans Supabase, jamais dans le dépôt.

Pour déployer Hardcover via l’éditeur Supabase, copier **index.ts et hardcover.js**, côte à côte, depuis supabase/functions/hardcover-proxy/. Leur import relatif fonctionne sans modification. Le script `node scripts/sync-hardcover.mjs` synchronise le module partagé si features/hardcover.js change ; un test contrôle l’égalité.

## Données et fonctionnement hors ligne

La bibliothèque utilise IndexedDB et une file de synchronisation vers Supabase. Les sauvegardes JSON permettent l’export/restauration de la collection et des événements pris en charge. Le service worker met en cache le shell et les images consultées ; une recherche dans les catalogues externes nécessite une connexion. Les images absentes ou les pannes de fournisseur restent dépendantes de ces services.

## Développement et validation

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Le code applicatif est en modules JavaScript, avec un point d’entrée et des contrats TypeScript. Vite produit `dist/`. `npm run verify` contrôle types, cohérence de version, tests et build ; `npm run release` prépare l’archive. Le workflow GitHub Pages publie `dist/`.

| Dossier / fichier | Responsabilité |
|---|---|
| app.js | État de l’interface, navigation, bibliothèque et formulaires |
| api.js | Adaptateurs des catalogues et traductions |
| features/ | Fiches, profil, journal, stockage, animations et modules fonctionnels |
| styles/ et style.css | Styles communs et spécialisés |
| supabase/functions/ | Code serveur déployé séparément de GitHub Pages |
| migrations/ | Historique des évolutions SQL ; à conserver dans le repo |
| tests/ | Tests automatisés et parcours de navigateur avec services simulés |

Les vignettes de recherche TMDb et IGDB demandent une taille adaptée (w185 / cover_small). Les URLs originales restent conservées pour les fiches et la bibliothèque. Les URLs Hardcover et Open Library ne sont pas transformées arbitrairement.

## Mesurer la fluidité

Les mesures sont **désactivées par défaut**, locales et sans télémétrie. Dans la console du navigateur :

```js
KulturoPerformance.enable();
// Effectuer une recherche, sélectionner un livre, ouvrir une fiche, filtrer.
console.table(KulturoPerformance.samples());
KulturoPerformance.clear();
KulturoPerformance.enable(false);
```

Au maximum 100 mesures sont conservées en mémoire, sans titres ni identifiants :
- `search:book`, `search:movie`, `search:game` : attente du catalogue, cache/secours inclus ; hors délai de frappe et peinture des résultats.
- `book:selection` : préparation de l’édition, hors traduction préchargée en arrière-plan.
- `detail:visible` : construction de la fiche jusqu’à deux frames ; ne garantit pas que les images ou enrichissements distants soient terminés.
- `library:render` : travail JavaScript synchrone de la grille, hors peinture/décodage.

Les erreurs et annulations sont également chronométrées. Les mesures dépendent du réseau, du cache et de l’appareil. Le rapport [docs/performance-local.json](docs/performance-local.json) mesure la réconciliation DOM sous Node/jsdom : ce n’est pas un benchmark mobile ou réseau. Aucune accélération des fournisseurs n’est garantie.

## Installation et mises à jour

Suivre [DEPLOYMENT.md](DEPLOYMENT.md) et [docs/HARDCOVER.md](docs/HARDCOVER.md). Sur une installation existante, appliquer seulement les migrations requises non encore exécutées ; ne pas rejouer schema.sql pour une simple mise à jour du site. GitHub Pages ne déploie pas les fonctions Supabase.

[Historique](CHANGELOG.md) · [Tests et parcours](tests/README.md)
