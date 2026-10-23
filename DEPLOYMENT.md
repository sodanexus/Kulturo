# Installer l’archive **4.8.5**

Depuis la 4.8.2 : remplacer les fichiers du site uniquement. Aucun nouveau déploiement Supabase.

Depuis la 4.8.0 ou 4.8.1 : remplacer les fichiers du site et redéployer **igdb-proxy** avec le contenu complet de `supabase/functions/igdb-proxy/index.ts` dans l’éditeur Supabase. Conserver les réglages d’authentification de la fonction et les secrets existants. Aucun nouveau secret et aucune migration SQL.

Les logos de films/séries utilisent TMDb, déjà configuré. Sans redéploiement du proxy, les jeux conservent simplement leur titre texte. Les logos ne sont pas garantis pour chaque œuvre.

Pour une installation plus ancienne, suivre docs/HARDCOVER.md : les migrations 4.4.0 et 4.5.0 et les fonctions hardcover-proxy, book-releases-proxy, groq-proxy et igdb-proxy sont nécessaires selon les fonctionnalités utilisées.

## Versions et publication

Pour cette mise à jour, remplacer les fichiers du dépôt par ceux de l’archive, en conservant vos réglages de connexion. Redéployer igdb-proxy comme indiqué ci-dessus.

Pour les prochaines versions, modifier `VERSION` puis compléter `CHANGELOG.md`. Exécuter `npm run verify` : la synchronisation recopie la version dans les fichiers concernés avant les vérifications et le build. Le workflow GitHub qui appelle cette commande bénéficie de la même synchronisation. Ne plus modifier manuellement les numéros dispersés dans les fichiers.

`npm run sync:version` synchronise uniquement les références ; `npm run release` vérifie puis produit l’archive. Les validations restent bloquantes en cas de référence absente ou de code invalide.

La 4.8.2 ajoute une recherche de secours IGDB parmi les artworks de type logo. Redéployer le proxy même si la version 4.8.1 était déjà installée. Si un jeu reste sans logo, relever son ID IGDB et le log `[IGDB logos] jeu=… candidats=…` pour identifier le cas précis.
