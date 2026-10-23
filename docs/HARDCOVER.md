# Livres

## Rôles
- Hardcover : recherche principale et nouveaux livres.
- Open Library : secours et anciennes fiches.
- BnF : parutions via book-releases-proxy. Aucun appel Google Books ne subsiste dans le code actif.

## Recherche et sélection
Une recherche par titre fait un appel à l’index Hardcover : titre, auteur et couverture de l’œuvre. Les éditions ne sont pas chargées. À la sélection, le proxy récupère les informations de cette œuvre et jusqu’à 30 éditions populaires, en privilégiant une édition française non audio parmi celles reçues. Ce n’est pas une garantie exhaustive de disponibilité française. Une recherche ISBN garde l’édition exacte.

La préparation de l’édition précède le formulaire d’ajout : titre et couverture peuvent donc correspondre à une édition différente de la vignette générale. Les métadonnées pages/ISBN/éditeur proviennent de la même édition. Un échec garde la recherche ouverte ; on peut réessayer ou utiliser Open Library. Changer de recherche, de sélection ou fermer la fenêtre invalide la réponse précédente.

Les requêtes details n’attribuent pas arbitrairement une nouvelle édition aux anciennes fiches portant seulement un identifiant d’œuvre. Les saisies personnelles et progressions restent prioritaires. Les notes externes des livres restent masquées.

Les réponses de recherche légère ne remplissent pas le cache de détails. Les réponses complètes sont mises en cache dix minutes ; la traduction se prépare à la sélection sans bloquer l’ajout. Les erreurs sont consignées dans Logs (étape, statut HTTP ou message GraphQL), sans jeton ni en-têtes d’authentification.

## Déploiement par l’éditeur Supabase
Voir DEPLOYMENT.md. Les deux fichiers hardcover-proxy/index.ts et hardcover-proxy/hardcover.js sont prêts à copier au même niveau, sans modifier l’import. Le module hardcover.js est une copie de features/hardcover.js ; un test impose leur égalité. Après modification du module partagé, exécuter node scripts/sync-hardcover.mjs.

## Validation
Tests locaux avec réponses simulées : titre et image dans l’index, ISBN, édition sélectionnée, authentification, erreurs, secours, sauvegarde et BnF. Aucun jeton réel Hardcover n’a été utilisé. Les parcours en production et le rendu sur appareil doivent être confirmés après déploiement. Un problème d’images chez Open Library reste externe.
