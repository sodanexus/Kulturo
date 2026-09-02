<div align="center">

# Kulturo
### Mon journal culturel personnel

<p><em>Regarder. Jouer. Lire. Garder une trace.</em></p>

Un espace privé pour rassembler films, séries, jeux vidéo et livres.

![HTML5](https://img.shields.io/badge/HTML5-static-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-native-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=111)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ECF8E?style=flat-square&logo=supabase&logoColor=111)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)

</div>

L’idée est simple : garder une mémoire de ce que j’ai découvert, de ce qui m’a marqué et de ce que j’ai envie de retrouver. Une collection vivante, personnelle, qui reste agréable à consulter au fil du temps.

---

## Le concept

Kulturo réunit au même endroit ce qui est souvent dispersé entre plusieurs listes, applications et souvenirs :

- ce que j’ai terminé ;
- ce que je suis en train de découvrir ;
- ce que je veux garder de côté ;
- les prochaines sorties qui pourraient m’intéresser.

Chaque œuvre conserve sa place dans un parcours. Une note, un favori, une reprise ou un nouveau visionnage viennent enrichir cette histoire sans la rendre compliquée à lire.

## Les grands principes

- **Une collection vivante** — les statuts, les notes et les favoris évoluent avec mes usages.
- **Une seule vue d’ensemble** — films, séries, jeux et livres partagent la même logique, chacun avec ses particularités.
- **Une mémoire du parcours** — le Journal garde la chronologie des ajouts, débuts, achèvements et reprises.
- **Une expérience calme** — une hiérarchie visuelle cohérente, des informations utiles et une attention particulière au mobile.

## Les grands espaces

### Bibliothèque

Le cœur de Kulturo : une collection personnelle organisée par statut, type, note, favori, année ou mois. Les fiches rassemblent l’essentiel d’une œuvre et les informations qui permettent de la retrouver rapidement.

Les notes restent lisibles et uniformes — `★ 8/10` — tandis que les revisionnages, relectures et nouvelles parties peuvent être comptés séparément.

### Journal

Un fil chronologique pour revoir le chemin parcouru. Les actions similaires peuvent être regroupées pour garder une lecture légère, sans perdre le détail des œuvres concernées.

### Profil

Une lecture plus personnelle de la collection : statistiques mensuelles ou annuelles, favoris, Tops, répartition par catégorie, genres explorés et revisionnages.

### Sorties

Les prochaines sorties françaises et les recommandations **Pour vous** ouvrent une fenêtre sur ce qui arrive, en s’appuyant sur les goûts déjà présents dans la bibliothèque.

### Communauté

Un espace discret pour découvrir l’activité des autres membres, séparé du Journal personnel et sans exposer les informations privées de suivi.

## Version en cours

**3.3.0**

Cette version relie davantage les quatre espaces de Kulturo, sans alourdir leur lecture : trouver une œuvre, attendre sa sortie, l’ouvrir puis retrouver son mois culturel forme désormais un parcours plus continu.

- recherche enrichie dans toute la bibliothèque : titres, réalisateurs, auteurs, casting, studios, genres, plateformes et années peuvent être retrouvés sans tenir compte du filtre actif ;
- résultats de recherche classés par pertinence, avec les correspondances exactes sur le titre placées en premier ;
- nouvelle rangée **Vos sorties attendues** dans Sorties, directement alimentée par la Wishlist et ordonnée par date ;
- dates de sortie conservées dans la bibliothèque lors d’un ajout à la Wishlist, puis actualisées discrètement depuis les catalogues disponibles ;
- œuvres déjà disponibles clairement signalées dans les sorties attendues, sans disparaître automatiquement de la Wishlist ;
- transition fluide de la jaquette vers la fiche, partagée par la Bibliothèque, À reprendre, le Journal, le Profil, la Communauté et les Sorties ;
- animation désactivée lorsque le système demande moins de mouvements et remplacée automatiquement par l’ouverture classique lorsque la jaquette n’est pas visible ;
- **Le mois en bref** affiché uniquement pour les mois entièrement terminés, afin d’éviter un bilan encore incomplet ;
- schéma Supabase étendu avec une date de sortie précise et son niveau de précision pour relier durablement Wishlist et Sorties.

La version conserve également tous les acquis de la série 3.2 :

- statistiques **Terminé** et **Replay** désormais strictement séparées, sans double comptage lors d’une reprise ;
- définition du replay partagée par la fiche, la Bibliothèque, le Journal et les filtres, y compris pendant une première reprise encore en cours ;
- tuile du Profil renommée **Revoir, relire, rejouer**, avec un vocabulaire commun de **reprises** ;
- boutons de statut de l’ajout accordés à l’accent de la jaquette, comme les actions de la fiche ;
- filtres allégés : type de média sans choix « Tous » redondant, libellés de tri explicites et description du mode Compact corrigée ;
- barre supérieure simplifiée avec une recherche mobile plus courte et un bouton de filtre réduit à son icône sur tous les écrans ;
- favicon et icônes d’installation recentrés sur les trois cercles seuls, sans fond noir intégré ;
- section **Marqueurs** ajoutée aux filtres de la Bibliothèque : **Coups de cœur** et **Replay** se filtrent côte à côte et peuvent être combinés ;
- le favori du **Mois en bref** et le Top **Vos préférés** ne retiennent plus les médias actuellement **En cours**, même lorsqu'ils avaient été terminés auparavant ;
- code couleur unifié dans les fiches, la Bibliothèque, le Journal, la Communauté, les Sorties et le Profil : films et séries en corail, jeux en sarcelle, livres et notes en or, coups de cœur en corail et revisionnages en sarcelle ;
- en-tête des fiches personnelles allégé du statut déjà visible dans les actions rapides ; ce badge reste présent dans les fiches Communauté en lecture seule et **À venir** reste visible dans les aperçus ;
- actions rapides et contrôle de reprise désormais accordés à la couleur extraite de la jaquette, sans détourner les couleurs fixes réservées aux informations ;
- cœur et replay réunis comme marqueurs secondaires dans la Bibliothèque et les deux vues du Journal ; le flux Communauté transmet maintenant aussi le compteur de reprise ;
- palette de marque désormais sémantique : or pour les actions principales, corail pour les coups de cœur et recommandations, sarcelle pour les éléments terminés, les reprises et les confirmations ;
- symbole desktop aligné sur l’axe de la navigation latérale et shell de la web app stabilisé lors du geste de rafraîchissement tactile ;
- identité recentrée sur une palette sombre unique : l’or du logo rejoint exactement celui de l’interface et les anciens styles du thème clair sont retirés ;
- fiche média recentrée sur les actions immédiates : statut et reprise uniquement ; la note et le **Coup de cœur** restent réunis dans **Modifier**, sans point d’entrée redondant ;
- nouvelle identité visuelle aux trois cercles, déclinée dans l’en-tête, le favicon et les icônes d’installation mobile ;
- recherche réellement globale dans toute la bibliothèque, quel que soit le filtre ou le statut actif ;
- médias **En cours** laissés pleinement colorés, avec un badge bleu qui suffit à les identifier ;
- interaction de jaquette unique dans la Bibliothèque, **À reprendre**, les Sorties et le Top du profil ;
- rangées horizontales alignées sur les mêmes marges, le même espacement et le même rythme de défilement ;
- icônes de catégories et de statuts réunies dans une même famille SVG ;
- styles de survol consolidés pour rendre les prochaines évolutions plus sûres.

Les densités **Standard** et **Compact** conservent leur présentation épurée, sans ajouter de titre visible sous les jaquettes de la bibliothèque.

## Dernières évolutions

- **3.3.0** — recherche enrichie et classée, Wishlist reliée aux Sorties, transition jaquette → fiche et bilans mensuels réservés aux mois clos.
- **3.2.18** — compteurs Terminé/Replay séparés, replay reconnu partout, filtres et barre de recherche simplifiés, icône aux trois cercles rendue transparente.
- **3.2.17** — Replay rejoint les marqueurs de filtre et les préférés du Journal/Profil suivent désormais le statut actuel des médias.
- **3.2.16** — code couleur sémantique étendu aux fiches et aux journaux, statut redondant retiré des fiches personnelles et commandes rapides rendues à l’accent de la jaquette.
- **3.2.15** — corail et sarcelle intégrés par rôle, logo desktop réaligné et rebond du shell corrigé dans la web app tactile.
- **3.2.14** — or du logo harmonisé avec l’interface et suppression complète de l’ancien mode clair devenu inaccessible.
- **3.2.13** — actions rapides simplifiées autour du statut et de la reprise ; note, effacement et Coup de cœur restent accessibles depuis **Modifier**.
- **3.2.12** — rebranding aux trois cercles et rythme uniformisé dans les actions rapides : reprise avant la note, espacements identiques et contrôles équilibrés.
- **3.2.11** — fiche mobile allégée : libellé et score redondants retirés, Coup de cœur explicite et reprise replacée sur toute la largeur.
- **3.2.10** — ergonomie mobile affinée dans les fiches : étoiles toujours visibles, cœur allégé et reprise compacte uniquement après une première fin.
- **3.2.9** — fiche média mobile raccourcie : Coup de cœur et reprise partagent désormais une même rangée, y compris sur les écrans étroits.
- **3.2.8** — recherche globale, médias en cours remis en couleur, jaquettes et rangées harmonisées, icônes unifiées et styles de survol consolidés.
- **3.2.7** — effet de survol harmonisé : le cadre complet des médias **À reprendre** s’agrandit avec la jaquette, sans être rogné par la rangée horizontale ni ses extrémités.
- **3.2.6** — logo mobile recentré avec des marges équilibrées ; slogan masqué sur les petits écrans pour préserver la lisibilité.
- **3.2.5** — en-tête mobile simplifié autour de la recherche.
- **3.2.4** — typographie harmonisée entre le bureau et le mobile.
- **3.2.3** — accents de couleur dérivés des jaquettes et finitions générales de l’interface.

## La direction

Kulturo reste un projet personnel, construit au fil des usages. Chaque version cherche moins à ajouter qu’à mieux ordonner : une interface plus juste, une lecture plus fluide et une collection qui ressemble davantage à la personne qui l’utilise.
