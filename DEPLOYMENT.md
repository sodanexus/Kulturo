# Installer l’archive **4.5.2**

Depuis la 4.5.1, aucune nouvelle migration SQL.

1. Mettre à jour hardcover-proxy dans Supabase : copier les DEUX fichiers de supabase/functions/hardcover-proxy/ dans l’éditeur (index.ts et hardcover.js). L’import ./hardcover.js est déjà correct. Garder HARDCOVER_TOKEN dans Secrets.
2. Créer book-releases-proxy via Editor avec supabase/functions/book-releases-proxy/index.ts. Cette fonction utilise uniquement la BnF, sans secret Google.
3. Publier le contenu complet du dépôt 4.5.2.
4. Tester une recherche titre, une sélection et un ajout, un ISBN, le secours Open Library et les parutions de livres dans Sorties. Vérifier les statuts 200 dans Invocations et les erreurs éventuelles dans Logs.
5. Seulement après ces vérifications, supprimer l’ancienne fonction google-books-proxy. Le secret GOOGLE_BOOKS_API_KEY peut être supprimé s’il n’est utilisé par aucun autre service.

Ne supprimer aucune fonction avant d’avoir publié et validé le site. Pour revenir à la 4.5.1 avant validation, conserver google-books-proxy ; son ancien rôle BnF reste nécessaire à l’ancien site.

Les anciennes migrations 4.4.0 et 4.5.0 restent nécessaires si elles n’ont pas été appliquées. schema.sql est réservé à la création/configuration complète de la base, pas à cette mise à jour.

Détails et limites : docs/HARDCOVER.md.
