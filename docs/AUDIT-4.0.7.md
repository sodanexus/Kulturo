# Audit Kulturo 4.0.7

[Revenir à la présentation](../README.md) · [Historique des versions](../CHANGELOG.md)

Audit du 14 octobre 2026, à partir de la version 4.0.6 fournie dans cette conversation. Aucune donnée de production modifiée.

## Problèmes confirmés et corrigés

| Zone | Problème constaté dans le code | Correction |
| --- | --- | --- |
| Journal | Deux mécanismes de recherche ; seul le filtre DOM était branché. Une soustraction incorrecte pouvait masquer un mois contenant un résultat. Communauté n’était pas filtrée. | Une recherche sur les données, appliquée aux deux modes, avec état vide et liste des mois cohérente. |
| Journal | Mois sélectionné devenu absent conservé après une recherche vide. | Réinitialisation à Tout l’historique ; conservation du mois demandé pendant le chargement. |
| Journal | Bouton inactif retiré du parcours Tab, sans navigation par flèches. | Flèches gauche/droite, Home et End, avec activation du panneau et transfert du focus. |
| Journal | Dates sans heure interprétées en UTC dans certains endroits et localement dans d’autres. | Clés de mois partagées avec le domaine et libellés de jour en heure locale. |
| Journal | État de recherche et navigation conservé après déconnexion. | Réinitialisation du contexte pour la session suivante. |
| Recherche | Les ligatures françaises ne correspondaient pas à leur saisie ordinaire. | « œuvre » / « oeuvre » et « æ » / « ae » normalisés comme les accents. |
| Sorties | Réinitialiser les filtres laissait l’ancien texte dans le champ supérieur visible. | Synchronisation du champ partagé avec les filtres Sorties uniquement lorsque cette page est active. |
| Contrôles | Certaines règles communes utilisaient une spécificité trop faible et perdaient contre les styles des pages. Sélecteurs de dates de tailles différentes. | Sélecteurs explicites, dimensions, rayons et typographie partagés ; taille minimale de 44 px pour les contrôles communs sur pointeur tactile. |
| Défilement | Sorties conservait les panneaux flottants et offsets fixes retirés du Journal. | Commandes et en-têtes de mois dans le flux, sur fond transparent. |
| Navigation | Icônes Profil différentes sur ordinateur et mobile. | Même icône utilisateur. |
| Dialogues | Croix de fermeture masquées sur mobile ; éléments summary absents du cycle de focus. | Fermeture explicite conservée en complément du geste ; summary inclus dans le parcours clavier. |
| Mouvement | Retour en haut toujours animé. | Respect du réglage de mouvement réduit. |
| Profil | Observations de révélation en attente conservées au reset. | Nettoyage des observations à la réinitialisation. |

## Vérifications effectuées

- 77 tests techniques réussis, dont 7 nouveaux tests ciblés sur les régressions.
- Les 7 nouveaux tests passent aussi dans le fuseau America/Los_Angeles, qui révèle les décalages des dates sans heure.
- 6 parcours fonctionnels réussis dans un DOM simulé avec les modules réels et des doubles réseau locaux : recherche bibliothèque, recherche Journal, Communauté et clavier, raccourci Profil, filtres Sorties, modification/sauvegarde d’une fiche.
- Aucune erreur JavaScript remontée dans ces six parcours.
- Contrôle de syntaxe et cohérence des versions ; build Vite et validation des ressources de déploiement.
- Vérification TypeScript complémentaire avec 5.9.3. Le compilateur natif 7.0.2 doit toujours être validé dans GitHub Actions ; il ne peut pas démarrer ici (`/proc/self/exe` indisponible).

## Limites et vérification finale

La cohérence visuelle a été examinée dans les règles CSS et le balisage, pas dans un navigateur réel. Cet audit ne garantit pas l’absence de tout bug. Il reste à vérifier sur Safari/iPad et téléphone : espaces entre pages, retours à la ligne à 390/768/1120 px, sélecteurs natifs, feuilles de détail, fermeture au toucher et focus réel. Le comportement tactile, les animations et le rendu des polices ne sont pas validés par un DOM simulé.

Les appels réels Supabase/TMDb/IGDB/Google Books, la connexion de production, la synchronisation entre plusieurs appareils et l’installation hors ligne de la PWA n’ont pas été exercés. Les tests existants couvrent plusieurs courses de synchronisation avec des doubles, sans remplacer ces vérifications en situation réelle.

## Installation

Remplacer les fichiers du projet par l’intégralité du contenu de cette archive, dossier `tests/` compris. Les fichiers de version, de cache PWA et de documentation sont synchronisés en 4.0.7. Laisser GitHub Actions exécuter `npm run verify` avant le déploiement.

## Fichiers fonctionnels modifiés

`app.js`, `domain.js`, `features/journal.js`, `features/journal-navigation.js`, `features/upcoming.js`, `features/dialog-focus.js`, `features/profile.js`, `style.css`, `styles/enhancements.css`, `styles/design-system-v4.css`, `styles/mobile-polish.css`.

Tests : `tests/journal-audit.test.mjs`, `tests/browser-runner.js`. Les autres différences portent sur la version 4.0.7 et la documentation.
