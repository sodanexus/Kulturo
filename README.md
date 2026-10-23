<div align="center">
<img src="logo.svg" width="96" alt="Kulturo : quatre cercles, films corail, séries bleu, jeux sarcelle et livres doré" />

# Kulturo

**Mon journal culturel personnel**

*Regarder. Jouer. Lire. Garder une trace.*
</div>

Kulturo réunit films, séries, jeux vidéo et livres dans une bibliothèque personnelle. Interface sombre, notes dorées, accents tirés des couvertures, PWA utilisable sur mobile et desktop, avec un fonctionnement local-first (IndexedDB + synchronisation Supabase).

Version actuelle · 4.9.4

## Fonctionnalités

| Espace | Usage |
|---|---|
| Bibliothèque | Collection, recherche, filtres, tri, envies et œuvres à reprendre. |
| Sorties | Parutions à venir (films, séries, jeux, livres) et ajout aux envies. |
| Journal | Historique personnel par mois et activité de la communauté. |
| Profil | Bilan mensuel/annuel par média, notes, temps estimé, palmarès et sauvegardes. |

- **Ajout rapide** : recherche par catégorie (Tout, Films & séries, Jeux vidéo, Livres) ou collage d’un lien TMDb, IMDb, Steam, Goodreads ou Hardcover. Sur un livre, scan du code-barres ISBN avec la caméra.
- **Fiches** : synopsis (traduisible via Groq), casting, notes, logo du titre pour films, séries et jeux (modifiable ou désactivable dans *Modifier*), jaquette conservée pour les livres.
- **Suivi** : page actuelle/totale pour les livres, saison/épisode pour les séries, reprises (revisionnages, parties rejouées, relectures).
- **Sauvegardes** : export et restauration JSON de la collection et des événements.
- **Hors ligne** : le shell et les images consultées sont mis en cache ; les recherches dans les catalogues externes nécessitent une connexion.
- Un petit secret se cache dans le logo, en haut à gauche.

## Sources de données

| Source | Rôle | Secret serveur |
|---|---|---|
| TMDb | Films et séries | Clé publique dans `config.js` |
| `igdb-proxy` | Jeux, notes, captures et logos IGDB | Secrets Twitch/IGDB |
| `steamgriddb-proxy` | Logos des jeux (prioritaires) | `STEAMGRIDDB_API_KEY` |
| `hardcover-proxy` | Recherche et métadonnées des livres | `HARDCOVER_TOKEN` |
| Open Library | Livres en secours, anciennes fiches | Aucun |
| `book-releases-proxy` | Parutions de livres (flux publics BnF) | Aucun |
| `cover-proxy` | Couleur d’accent des jaquettes Hardcover | Aucun |
| `groq-proxy` | Traduction des synopsis | Secret Groq |

Les secrets restent dans Supabase, jamais dans le dépôt. Les fonctions sont dans `supabase/functions/` et se déploient séparément de GitHub Pages. Détails sur les livres : [docs/HARDCOVER.md](docs/HARDCOVER.md).

## Développement

Node.js 22.12 ou ultérieur.

```bash
npm ci
npm run dev        # serveur Vite
npm test           # tests techniques
npm run typecheck  # TypeScript
npm run build      # build dans dist/
npm run verify     # synchronisation de version + types + tests + build
npm run release    # verify, puis archive ZIP
```

Pour changer de version, modifier uniquement le fichier `VERSION` : `npm run verify` répercute le numéro dans le runtime, le service worker, le manifeste et la documentation.

| Dossier / fichier | Responsabilité |
|---|---|
| `app.js` | État de l’interface, navigation, bibliothèque et formulaires |
| `api.js` | Adaptateurs des catalogues et traductions |
| `features/` | Fiches, profil, journal, stockage, animations et autres modules |
| `styles/`, `style.css` | Styles communs et spécialisés |
| `supabase/functions/` | Fonctions serveur (Edge Functions) |
| `migrations/` | Évolutions SQL, à conserver dans le repo |
| `tests/` | Tests automatisés et parcours navigateur avec services simulés |

## Mesurer la fluidité

Les mesures sont **désactivées par défaut**, locales et sans télémétrie. Dans la console du navigateur :

```js
KulturoPerformance.enable();
// Effectuer une recherche, ouvrir une fiche, filtrer…
console.table(KulturoPerformance.samples());
KulturoPerformance.clear();
KulturoPerformance.enable(false);
```

100 mesures au maximum sont gardées en mémoire, sans titres ni identifiants (`search:*`, `book:selection`, `detail:visible`, `library:render`). Elles dépendent du réseau, du cache et de l’appareil. [docs/performance-local.json](docs/performance-local.json) mesure la réconciliation DOM sous Node/jsdom : ce n’est pas un benchmark mobile.

## Installation et mises à jour

Voir [DEPLOYMENT.md](DEPLOYMENT.md). Sur une installation existante, n’appliquer que les migrations pas encore exécutées ; ne pas rejouer `schema.sql` pour une simple mise à jour du site. Tests et parcours navigateur : [tests/README.md](tests/README.md).

## Licence

Voir [LICENSE](LICENSE).
