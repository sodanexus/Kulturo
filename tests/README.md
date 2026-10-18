# Vérifier Kulturo

Ces tests n’utilisent pas le compte Supabase du projet.

## Tests techniques

Depuis la racine de Kulturo, avec Node.js 22.12 ou ultérieur :

```sh
npm ci
npm test
```

Ils couvrent le cache, les règles de restauration, la navigation du Journal, le cycle de vie des fiches, le focus, les interactions, l’isolation des comptes, la file local-first, les routes 4.0, la rétrospective et les ressources hors ligne de la PWA.

## Parcours dans un navigateur

```sh
node tests/browser-server.mjs
```

Ouvrir **http://localhost:4173/tests/browser.html**, puis cliquer sur **Lancer les parcours**. Un résultat vert ou rouge apparaît pour chaque parcours. Le serveur s’arrête avec `Ctrl+C` ; aucune installation npm n’est nécessaire.

L’interface et les modules testés sont ceux de l’application. Seuls la configuration, Supabase et les catalogues sont remplacés par des doubles locaux. Les données sont fictives, les écritures restent en mémoire, et le service worker est désactivé sur cette page pour éviter qu’un ancien cache fausse les résultats.

Les parcours vérifient :

- les proportions des squelettes et des jaquettes, les densités et l’absence de débordement à 390, 768 et 1120 pixels ;
- les actions proposées après une recherche vide, des filtres sans résultat et un échec de chargement ;
- quarante ouvertures et fermetures successives de fiches, avec restauration du focus et sans clone de transition orphelin ;
- le retour à la fiche après modification ou annulation, la note, le cœur et la position de lecture ;
- Tab, Maj+Tab, Échap et la confirmation d’abandon du brouillon ;
- une requête d’enregistrement interrompue, son maintien local puis sa synchronisation automatique sans doublon ;
- l’actualisation d’une fiche et la restauration de sa page, de son URL et du bon média ;
- la navigation dans le Profil et les deux Journaux, ainsi que la récupération des Sorties après erreur.

Pour la 4.0, compléter manuellement par une modification en mode hors connexion, un retour réseau, une suppression annulée et l’actualisation d’une URL contenant une fiche ouverte.

La coupure concerne la requête d’enregistrement simulée : elle ne coupe pas le réseau de l’appareil. Les largeurs de fenêtres intégrées vérifient la mise en page ; elles ne simulent ni le moteur Safari, ni les gestes tactiles, ni une PWA installée. Pour ceux-ci, compléter sur l’iPad ou l’iPhone réel avec une fiche longue, Modifier, Enregistrer, puis quelques ouvertures successives dans Sorties.

## Validation de l’archive 4.2.1

Avant publication, `npm run verify` doit terminer sans erreur. Les parcours navigateur restent à compléter sur Safari/iPad réel pour les gestes tactiles, la suspension de la PWA et la pression mémoire après de nombreuses fiches.

### Contrôles de la modification UX initiale (4.0.2)

- `npm test` : 66 tests réussis, dont cinq nouvelles régressions UX (recherche + filtres, ajout Série, URL, liens des livres et jeux).
- `npm run check` : contrôle de syntaxe, cohérence des versions et tests techniques.
- `npm run build` : build Vite et préparation du cache PWA réussis.
- Interactions dans un DOM simulé (jsdom, IndexedDB simulé, doubles réseau fournis par le projet) : recherche combinée aux catégories/statuts ; ajout manuel d’une Série depuis une recherche vide avec conservation du titre ; enregistrement puis modification sans perdre le sous-type ; recherche Sorties indépendante, URL et réinitialisation. Aucune erreur JavaScript détectée sur ces parcours.
- Vérification des déclarations TypeScript avec TypeScript 5.9.3 : réussie en contrôle complémentaire. Le compilateur natif 7.0.2 verrouillé par le projet ne peut pas démarrer dans cet environnement (`/proc/self/exe` indisponible). Cette vérification complémentaire ne remplace pas `npm run typecheck` avec la version officielle du projet.

Les parcours du navigateur ont été enrichis dans `browser-runner.js`, mais n’ont pas pu être exécutés ici : aucun Chromium local disponible, téléchargement du navigateur inutilisable, et navigateur distant sans accès au serveur local. Le DOM simulé ne valide ni la mise en page, ni les gestes, ni le focus réel. Avant déploiement, exécuter `npm run verify` dans l’environnement habituel puis les parcours de `tests/browser.html` et vérifier Safari/iPhone/iPad. Les destinations externes sont vérifiées comme URLs produites par le code, pas comme pages consultées en direct.

### Ajustements 4.0.3

Le test des liens de livre vérifie maintenant qu’un seul lien « Chercher le livre » est proposé, même si des URLs d’extrait ou d’éditeur existent. Contrôles relancés : tests techniques, cohérence de version et build. L’alignement des en-têtes est corrigé dans la règle CSS commune ; validation visuelle sur navigateur réel toujours à effectuer, avec la Bibliothèque comme référence (mêmes limites d’environnement que ci-dessus).

### Audit 4.0.7

- 77 tests techniques et contrôles de syntaxe/version : réussis.
- Sept tests de régression Journal/recherche ajoutés ; exécutés aussi avec `TZ=America/Los_Angeles` pour les dates sans heure.
- Six parcours avec données fictives dans un DOM simulé : bibliothèque et recherche, Journal filtré, Communauté et clavier, Profil vers bibliothèque, Sorties et réinitialisation, fiche et sauvegarde du favori. Réussis, aucune erreur JavaScript remontée.
- Build de production : réussi.
- Contrôle TypeScript complémentaire 5.9.3 : réussi. La version native 7.0.2 reste celle du projet ; son exécution ici dépend de l’accès à `/proc/self/exe`, indisponible dans cet environnement.

Ces contrôles ne sont pas une validation du rendu visuel ni des interactions sur un navigateur réel. Les parcours `browser-runner.js` ont été adaptés au champ de recherche partagé, mais n’ont pas été exécutés dans Safari/Chromium. Vérifier les pages à 390, 768 et 1120 px, les feuilles mobiles, le focus réel et le défilement. Connexion et services externes n’ont pas été testés en production. Détails : [AUDIT.md](../AUDIT.md).

### Ajustement 4.0.8

Croix des fiches masquée sur mobile avec geste de fermeture ; sur desktop, icône discrète et espace réservé indépendant des notes dans la barre compacte. Seul `styles/finesse.css` change le rendu. Tests techniques et compilation vérifiés ; validation visuelle Safari/iPad et desktop à effectuer.

Correctif de l’archive 4.0.8 : installation `npm ci --ignore-scripts` vérifiée avec un cache vierge après restauration des dépendances originales dans `package-lock.json`.

### Journal 4.0.9

81 tests techniques, compilation et contrôle de cohérence de version. Quatre tests supplémentaires couvrent le filtre par mois, la conservation des choix, l’indépendance des modes, le contrôle flottant et son focus. Sept parcours en DOM simulé passent, dont le changement de mois depuis le véritable sélecteur flottant (géométrie simulée). Le rendu et l’ouverture du sélecteur natif sur Safari/iOS restent à confirmer sur appareil réel.

### Survol desktop 4.0.10

Suppression des deux effets de projecteur, remplacés par une élévation et un contour sur la seule affiche ciblée. Changement visuel dans `styles/finesse.css`. 81 tests et compilation vérifiés ; aspect final à confirmer dans un navigateur réel.

### Journal 4.0.11

Suppression des pseudo-éléments de la frise et de l’animation `journalThread` dans `styles/finesse.css`. Tests techniques, cohérence de version et build de production vérifiés. Validation visuelle sur appareil réel non effectuée.

### Interactions 4.0.12

82 tests Node réussis, build Vite réussi, contrôle TypeScript via le moteur JS 5.9.3 (le binaire natif 7.0.2 ne fonctionne pas dans cet environnement). Sept parcours fonctionnels validés dans un DOM simulé : bibliothèque, journal, communauté/clavier, profil, sorties, édition, mois flottant. Aucune validation visuelle dans un navigateur réel pour cette livraison. Les dépendances du package-lock sont inchangées.

### Synopsis 4.0.13

Build Vite et contrôle TypeScript JS réussis. La réserve de lecture ne s’applique qu’au synopsis déplié et est recalculée au redimensionnement. Alignement visuel desktop/mobile à confirmer en navigateur réel.

### Fluidité 4.0.14

88 tests Node validés, dont navigation concurrente, inversion de hauteur, fermeture depuis l’état visible, geste intentionnel et restauration des boutons. Huit parcours fonctionnels vérifiés dans un DOM simulé, dont le synopsis déplié/replié. Build Vite et TypeScript JS 5.9.3 validés ; le compilateur natif 7.0.2 reste indisponible dans cet environnement. Les animations, leurs performances et les gestes doivent encore être examinés sur de vrais navigateurs et téléphones. Les dépendances sont inchangées.

### Retour de synopsis 4.0.15

88 tests Node et huit parcours simulés validés. Le scénario synopsis vérifie désormais le retour du scroll à zéro après Voir moins. Build Vite et contrôle TypeScript JS 5.9.3 validés. Fluidité visuelle à confirmer sur appareil réel.

### Couleurs et ouverture 4.0.16

94 tests Node et huit parcours DOM simulés validés. Tests de couleur sur échantillons synthétiques : monochrome, transparence, détail saturé, fond nuancé. Build Vite et contrôle TypeScript JS 5.9.3 validés. Aucune vérification visuelle sur navigateur ou téléphone réel ; rendu sur des pochettes réelles et fluidité à confirmer. Dépendances inchangées.

### Synopsis synchronisé 4.0.17

104 tests Node réussis, dont progression commune hauteur/défilement et inversion à mi-parcours. Huit parcours DOM simulés réussis. Build Vite et contrôle TypeScript via JS 5.9.3 validés. Vérification visuelle sur navigateur réel non effectuée ; fluidité et survol à confirmer sur appareil. Dépendances inchangées.

### Texte progressif 4.0.18

104 tests Node réussis, avec vérification de la hauteur du texte à mi-parcours et lors de l’inversion. Huit parcours DOM simulés réussis. Build Vite et TypeScript JS 5.9.3 validés. Rendu visuel à confirmer sur appareil réel.

### Rythme uniforme 4.0.19

106 tests Node réussis, huit parcours DOM simulés validés, build Vite et contrôle TypeScript JS 5.9.3 réussis. Fluidité, mise en page pendant le changement fiche/édition et gestes tactiles à confirmer dans de vrais navigateurs. Dépendances inchangées.

### Survol et arrivée de page 4.0.20

106 tests Node, huit parcours DOM simulés et build Vite réussis. Contrôle TypeScript JS 5.9.3 validé. Causes CSS identifiées et corrigées ; le sursaut visuel signalé n’a pas été reproduit dans un navigateur réel. Validation visuelle à confirmer sur appareil.

### Durées 4.0.21

106 tests Node et build Vite validés, contrôle TypeScript JS 5.9.3 réussi. Les tests du synopsis vérifient le milieu et la fin de la nouvelle durée de 280 ms, y compris en cas d’inversion. Vérification visuelle sur appareil réel non effectuée.

### Retours de fenêtres 4.0.22

108 tests Node réussis, dont remplacement dans les deux sens et abandon des panneaux obsolètes. Neuf parcours DOM simulés validés, dont Annuler, Echap et sauvegarde. Build Vite et contrôle TypeScript JS 5.9.3 réussis. Animation et géométrie réelles à confirmer sur appareil.

### Sélecteur mobile 4.1.0

109 tests Node réussis, dont fermeture du focus tactile, conservation des options et retour au sommet. Build Vite et contrôle TypeScript JS 5.9.3 validés. Le menu natif mobile reste à vérifier sur téléphone réel.
