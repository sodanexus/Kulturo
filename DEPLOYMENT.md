# Installer l’archive **5.0.1**

## Site (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` lance `npm run verify` puis publie `dist/` à chaque push sur `main`. Remplacer les fichiers du dépôt par ceux de la version à installer, en conservant votre `config.js` (connexion Supabase, clés publiques TMDb et IGDB).

## Base de données Supabase

- Nouvelle installation : exécuter `schema.sql` une seule fois.
- Mise à jour : n’exécuter que les migrations de `migrations/` pas encore appliquées (`4.4.0-series-progress.sql`, `4.5.0-hardcover.sql`, `4.9.2-logo-url.sql`). Ne pas rejouer `schema.sql`.

## Fonctions Supabase

GitHub Pages ne déploie pas les fonctions. Pour chacune, copier le contenu de `supabase/functions/<nom>/index.ts` dans l’éditeur Supabase, avec les mêmes réglages d’authentification qu’`igdb-proxy`. À redéployer lorsque leur code change.

| Fonction | Secret requis |
|---|---|
| `igdb-proxy` | Secrets Twitch/IGDB |
| `steamgriddb-proxy` | `STEAMGRIDDB_API_KEY` |
| `hardcover-proxy` | `HARDCOVER_TOKEN` (copier aussi `hardcover.js`, voir [docs/HARDCOVER.md](docs/HARDCOVER.md)) |
| `book-releases-proxy` | Aucun |
| `cover-proxy` | Aucun |
| `groq-proxy` | Secret Groq |

Une fonction absente ne bloque pas l’app : les jeux gardent leur titre texte sans logo, les livres Hardcover l’accent par défaut, etc.

## Publier une nouvelle version

Modifier `VERSION`, puis lancer `npm run verify` : la synchronisation recopie le numéro dans les fichiers concernés avant les contrôles et le build. `npm run sync:version` fait uniquement la synchronisation ; `npm run release` vérifie puis produit l’archive. Ne pas modifier à la main les numéros dispersés.
