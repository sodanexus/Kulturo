<div align="center">

<img src="logo.svg" width="96" alt="Logo Kulturo : trois cercles" />

# Kulturo

**Mon journal culturel personnel**

*Regarder. Jouer. Lire. Garder une trace.*

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![IndexedDB](https://img.shields.io/badge/local--first-1FA88C?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=111)
![PWA](https://img.shields.io/badge/PWA-installable-D8B46A?style=flat-square&logo=pwa&logoColor=111)

</div>

---

Kulturo rassemble mes films, séries, jeux vidéo et livres dans un même espace. Ce que je découvre, ce qui m’a marqué, ce que j’aimerais retrouver : une mémoire personnelle qui se construit au fil des œuvres.

Une collection à parcourir par ses jaquettes, avec seulement les repères utiles — statut, note, coup de cœur et reprise — dans une interface sombre pensée aussi bien pour le téléphone que pour le bureau.

## Les espaces

| | |
| :--- | :--- |
| **Bibliothèque** | Retrouver ma collection, ce que je suis en train de suivre et mes prochaines envies. |
| **Sorties** | Découvrir ce qui arrive et relier naturellement ces découvertes à ma Wishlist. |
| **Journal** | Revoir mon parcours mois après mois et parcourir les ajouts de la Communauté. |
| **Profil** | Comprendre mes habitudes, retrouver mes préférés et raconter mon année culturelle. |

## Version actuelle · 4.0.1

La 4.0 rend Kulturo plus immédiat et plus fiable, sans changer ce qui faisait la simplicité de son interface.

- **Ouverture instantanée** — la bibliothèque et le Journal apparaissent depuis la base locale, puis Supabase se synchronise discrètement en arrière-plan.
- **Véritable mode hors connexion** — ajouts, modifications et suppressions restent utilisables ; les changements en attente repartent automatiquement lorsque le réseau revient.
- **Navigation retrouvée** — page, recherche, filtres, période et fiche ouverte sont inscrits dans une URL portable et restaurés après actualisation.
- **Gestes plus naturels** — transitions de page cohérentes, mouvement réduit respecté et suppression annulable pendant quelques secondes.
- **Profil recentré** — les vues mensuelle et annuelle conservent uniquement les statistiques utiles, sans répétition éditoriale.
- **Fondations durables** — TypeScript et Vite encadrent désormais le build, avec versions verrouillées, contrôles automatisés et déploiement GitHub Pages reproductible.

Les sauvegardes JSON restent compatibles avec les anciennes versions. Leur nouveau format indique aussi si des changements locaux attendaient encore leur synchronisation au moment de l’export.

[Historique des versions](CHANGELOG.md) · [Mise à jour et déploiement](DEPLOYMENT.md) · [Vérifications](tests/README.md)

Depuis la **3.4.6**, la 4.0 ne demande aucun nouveau SQL ni redéploiement de fonction Edge. La migration de la base locale IndexedDB est automatique sur chaque appareil.

---

*Un projet personnel, qui évolue au fil de mes usages. Garder l’essentiel, lui donner une place, et prendre plaisir à le retrouver.*
