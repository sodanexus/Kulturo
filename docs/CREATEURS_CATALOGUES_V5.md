# Fiches créateurs — correctifs Team17 / Kana (pré-5.0)

## Déploiement

Redéployer **les deux fonctions Edge** depuis CETTE archive :

```bash
supabase functions deploy igdb-proxy
supabase functions deploy hardcover-proxy
```

Dans le Dashboard Supabase, mettre à jour `index.ts` de chaque fonction (et conserver ses éventuels modules associés). Déployer aussi les fichiers frontend de cette archive : un proxy seul ne corrigera pas le routage éditeurs livres / jeux ni les liens des fiches jeux.

Les variables `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` et `HARDCOVER_TOKEN` restent inchangées.

## Comportement attendu

- Un éditeur sur une fiche **livre** (par ex. Kana) cherche une maison d'édition **Hardcover**, puis 75 éditions maximum sont parcourues pour présenter au plus 36 œuvres distinctes. Aucun appel IGDB n'est effectué pour ces éditeurs.
- Un studio ou éditeur sur une fiche **jeu** (par ex. Team17) utilise l'API sociétés **IGDB**, d'abord avec le slug direct puis via la recherche par nom. Le catalogue du rôle alternatif est utilisé si le rôle demandé n'est pas renseigné.
- Le bouton « Voir sur IGDB » d'une **fiche jeu** ne pointe plus vers une recherche. Il est inséré après l'enrichissement des données si IGDB fournit une URL de jeu précise.
- Les panneaux créateurs ont un changement d'onglet avec transition de hauteur et fondu. Les animations sont désactivées si « réduire les animations » est actif.

## Limites et validation en production

- Les recherches de maisons d'édition dépendent des résultats et de la structure publique de l'API Hardcover ; si cette source n'a pas de correspondance fiable, l'interface le signale.
- Les catalogues éditeurs volumineux sont volontairement tronqués.
- Les réponses IGDB et Hardcover n'ont pas pu être testées sur l'instance Supabase réelle. Vérifier Team17 et Kana sur le site déployé (ainsi que les erreurs de fonctions dans les logs Supabase).
- Le build Vite reste à vérifier sur une machine disposant des dépendances npm (dans cet environnement, Vite n'était pas installé).

## Tests locaux

```bash
NODE_OPTIONS=--experimental-strip-types npm test
npm run typecheck
npm run build
```
