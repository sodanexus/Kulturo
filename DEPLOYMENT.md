# Installer l’archive **4.8.0**

Depuis la 4.5.4 : remplacer les fichiers du site ; aucune nouvelle migration SQL ni modification des fonctions Supabase.

Pour une installation plus ancienne, suivre docs/HARDCOVER.md : les migrations 4.4.0 et 4.5.0 et les fonctions hardcover-proxy, book-releases-proxy, groq-proxy et igdb-proxy sont nécessaires selon les fonctionnalités utilisées.

## Versions et publication

Pour cette mise à jour, remplacer les fichiers du dépôt par ceux de l’archive, en conservant vos réglages de connexion. Aucun changement Supabase n’est nécessaire.

Pour les prochaines versions, modifier `VERSION` puis compléter `CHANGELOG.md`. Exécuter `npm run verify` : la synchronisation recopie la version dans les fichiers concernés avant les vérifications et le build. Le workflow GitHub qui appelle cette commande bénéficie de la même synchronisation. Ne plus modifier manuellement les numéros dispersés dans les fichiers.

`npm run sync:version` synchronise uniquement les références ; `npm run release` vérifie puis produit l’archive. Les validations restent bloquantes en cas de référence absente ou de code invalide.
