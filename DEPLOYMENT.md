# Mettre Kulturo à jour

[Revenir à la présentation](README.md)

## Installer l’archive 4.2.10

1. Remplacer les fichiers du dépôt par le contenu complet de l’archive **4.2.10**, en conservant les valeurs propres au projet dans `config.js`.
2. Conserver les dossiers `features/`, `styles/`, `src/`, `scripts/` et `.github/` ainsi que `package.json` et `package-lock.json` : ils font partie de l’application et de sa fabrication.
3. Publier le dépôt, puis accepter le bandeau **Nouvelle version disponible** dans Kulturo. La base IndexedDB locale est créée automatiquement ; aucune donnée Supabase n’est déplacée.

La source reste directement publiable depuis une branche GitHub Pages. Le mode recommandé est toutefois le workflow inclus : dans **Settings → Pages → Build and deployment**, sélectionner **GitHub Actions**. À chaque envoi sur `main`, il contrôle la version, exécute les tests, construit l’application avec Vite et publie exactement le dossier `dist`.

**La 4.1 demande de redéployer `igdb-proxy`** (Supabase → Edge Functions → igdb-proxy → coller le contenu de `supabase/functions/igdb-proxy/index.ts` → Deploy) pour que les fiches de jeux affichent leur bannière animée ; c'est optionnel, rien ne casse sans cela. Les autres fonctions n'ont pas changé. La suppression du statut *En pause* demande toutefois d'exécuter une fois `schema.sql` dans **Supabase → SQL Editor** (voir l'entrée « À venir » de l'historique) ; le script est rejouable sans risque.

## IGDB — recherche introduite en 4.2.5

La 4.2.10 ne modifie aucune fonction Supabase (la traduction utilise `groq-proxy`, déjà en place). Si igdb-proxy a déjà été déployée depuis la 4.2.5, aucune nouvelle action côté Supabase. Sinon, la recherche introduite en 4.2.5 exige cette mise à jour : la version antérieure pour les notes ne suffit pas. Tester ensuite « Returnal » dans la recherche du catalogue.

GitHub Pages ne met pas à jour les fonctions Supabase. Redéployer **igdb-proxy** avec le fichier `supabase/functions/igdb-proxy/index.ts` de cette archive (Supabase → Edge Functions → igdb-proxy → mise à jour du code → Deploy). Conserver les secrets et réglages d'authentification existants. Aucune migration SQL supplémentaire pour cette version.

Le repli des captures et notes d'une édition utilise seulement le lien explicite `version_parent` fourni par IGDB. La note du jeu de base est signalée dans le libellé. Un DLC ou remake n'emprunte pas automatiquement la note d'un autre jeu. Documentation : https://api-docs.igdb.com/#game

Les réponses du service réellement déployé et les jeux signalés par l'utilisateur n'ont pas été testés en ligne : aucun titre ni accès au service distant n'a été fourni. Un jeu sans identifiant IGDB ou sans ces médias dans l'API peut toujours rester incomplet.

## Depuis une version antérieure à la 3.4.6

Exécuter auparavant le contenu complet de `schema.sql` dans **Supabase → SQL Editor**. Il installe la restauration atomique de la bibliothèque et du Journal ainsi que ses autorisations. Mettre à jour uniquement les fichiers du site ne suffit pas à ajouter cette fonction.

## Construire et vérifier localement

Kulturo demande Node.js **22.12 ou ultérieur** pour sa chaîne de build.

```sh
npm ci
npm run verify
```

`verify` contrôle TypeScript, la cohérence de tous les numéros de version, la syntaxe, les tests, le manifeste PWA et le build portable. Le dossier `dist` obtenu correspond à l’artefact publié par GitHub Actions.

Pour produire l’archive source reproductible :

```sh
npm run release
```

À contenu identique, l’archive et son SHA-256 sont identiques.

## Fonctions Edge et traduction

GitHub Pages ne déploie pas les fonctions Supabase. Si les fonctions de la **3.4.0** n’ont jamais été installées, déployer `groq-proxy` et `igdb-proxy` depuis Supabase, puis tester `groq-proxy` avec `{ "action": "health" }`.

La version de ces fonctions reste indépendante de celle de l’interface. Les secrets `GROQ_API_KEY`, `IGDB_CLIENT_ID` et `IGDB_CLIENT_SECRET` restent uniquement dans Supabase.

## Contrôle après publication

- la version affichée dans **Profil → Compte et sauvegarde** est **4.2.10** ;
- une actualisation retrouve la page, ses filtres, sa période et une éventuelle fiche ouverte ;
- couper le réseau affiche la bibliothèque locale et l’indicateur **Hors connexion** ;
- modifier un média hors ligne affiche un changement en attente, ensuite synchronisé au retour du réseau ;
- supprimer puis choisir **Annuler** restaure immédiatement le média ;
- la vue annuelle du Profil affiche la rétrospective sans conserver un chargement au-dessus de son contenu.

Les parcours complémentaires sont décrits dans [tests/README.md](tests/README.md).
