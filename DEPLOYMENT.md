# Mettre Kulturo à jour

[Revenir à la présentation](README.md)

## Depuis la 3.4.6

1. Remplacer les fichiers de l’application par le contenu complet de l’archive **3.4.7**, en conservant les valeurs propres au projet dans `config.js`.
2. Inclure les dossiers `features/` et `styles/` : ils font partie de l’application. Le Profil et le Journal ne sont plus dans `app.js`.
3. Après la publication GitHub Pages, accepter la mise à jour proposée par Kulturo lorsqu’elle est disponible.

**Aucune nouvelle requête SQL et aucun redéploiement de fonction Edge ne sont nécessaires pour passer de 3.4.6 à 3.4.7.** Le schéma et les fonctions Supabase sont identiques dans ces deux archives.

## Depuis une version antérieure à la 3.4.6

Exécuter le contenu complet de `schema.sql` dans **Supabase → SQL Editor**, puis publier les fichiers de l’application.

La 3.4.6 ajoute la fonction de restauration atomique de la bibliothèque et du Journal ainsi que les autorisations associées. Mettre à jour uniquement les fichiers du site ne suffit pas à installer cette restauration. L’ancienne mention générale « aucune modification SQL nécessaire » ne s’applique donc pas à ce passage de version.

## Fonctions Edge et traduction

GitHub Pages publie l’interface ; il ne déploie pas les fonctions Supabase. Si les corrections des fonctions Edge de la **3.4.0** ne sont pas encore installées :

1. Dans **Supabase → Edge Functions → `groq-proxy`**, remplacer `index.ts` par le fichier correspondant du dossier `supabase/functions/`, puis déployer.
2. Faire de même pour **`igdb-proxy`**, afin que la traduction ne soit pas exécutée à deux endroits.
3. Tester `groq-proxy` avec `{ "action": "health" }` : la réponse attendue indique la version de fonction `3.4.0`, le modèle actif et `configured: true`.

La version de cette fonction reste **3.4.0** ; elle est indépendante de la version de l’interface. Les secrets `GROQ_API_KEY`, `IGDB_CLIENT_ID` et `IGDB_CLIENT_SECRET` restent configurés uniquement dans Supabase.

## Vérifier la mise à jour

La version affichée dans **Moi** doit être **3.4.7**. Ouvrir une fiche, utiliser Modifier, changer une note, puis enregistrer : la fiche doit revenir avec la nouvelle note. Les [tests de parcours](tests/README.md) permettent de vérifier ce comportement avec des données fictives.
