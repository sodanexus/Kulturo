# Vérifier Kulturo

Ces tests n’utilisent pas le compte Supabase du projet.

## Tests techniques

Depuis la racine de Kulturo, avec Node.js 22 ou ultérieur :

```sh
node --test tests/technical-cleanup.test.mjs
```

Ils couvrent le cache, les règles de restauration, la navigation du Journal, le cycle de vie des fiches, le focus, les interactions et les ressources hors ligne de la PWA.

## Parcours dans un navigateur

```sh
node tests/browser-server.mjs
```

Ouvrir **http://localhost:4173/tests/browser.html**, puis cliquer sur **Lancer les parcours**. Un résultat vert ou rouge apparaît pour chaque parcours. Le serveur s’arrête avec `Ctrl+C` ; aucune installation npm n’est nécessaire.

L’interface et les modules testés sont ceux de l’application. Seuls la configuration, Supabase et les catalogues sont remplacés par des doubles locaux. Les données sont fictives, les écritures restent en mémoire, et le service worker est désactivé sur cette page pour éviter qu’un ancien cache fausse les résultats.

Les parcours vérifient :

- les proportions des squelettes et des jaquettes, les densités et l’absence de débordement à 390, 768 et 1120 pixels ;
- les actions proposées après une recherche vide, des filtres sans résultat et un échec de chargement ;
- quinze ouvertures et fermetures successives de fiches, avec restauration du focus ;
- le retour à la fiche après modification ou annulation, la note, le cœur et la position de lecture ;
- Tab, Maj+Tab, Échap et la confirmation d’abandon du brouillon ;
- une requête d’enregistrement interrompue avant écriture, puis un nouvel essai sans doublon ;
- la navigation dans le Profil et les deux Journaux, ainsi que la récupération des Sorties après erreur.

La coupure concerne la requête d’enregistrement simulée : elle ne coupe pas le réseau de l’appareil. Les largeurs de fenêtres intégrées vérifient la mise en page ; elles ne simulent ni le moteur Safari, ni les gestes tactiles, ni une PWA installée. Pour ceux-ci, compléter sur l’iPad ou l’iPhone réel avec une fiche longue, Modifier, Enregistrer, puis quelques ouvertures successives dans Sorties.

## Validation de l’archive 3.4.8

Les tests techniques et les contrôles de syntaxe ont été exécutés avec succès. Les parcours navigateur sont fournis mais **n’ont pas pu être exécutés dans l’environnement de préparation**, qui bloque l’accès du navigateur à la page locale. Une validation Safari/iPad reste donc à effectuer.
