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

Les prochaines sorties françaises ouvrent une fenêtre simple sur ce qui arrive et se relient directement aux œuvres conservées dans la Wishlist.

### Communauté

Un espace discret pour découvrir l’activité des autres membres, séparé du Journal personnel et sans exposer les informations privées de suivi.

## Version en cours

**3.4.6**

Cette version corrige les anomalies révélées par l’examen technique de la 3.4.5 et rend la restauration réellement complète, sans modifier la structure des tables.

- bibliothèque et Journal sont restaurés ensemble dans une transaction atomique Supabase : aucune restauration partielle n’est conservée ;
- les anciens identifiants sont remappés de manière idempotente afin qu’un nouvel essai après une coupure ne crée aucun doublon ;
- homonymes et correspondances ambiguës deviennent des conflits ignorés, visibles dans l’aperçu, au lieu de modifier le mauvais média ;
- le JSON est contrôlé selon le schéma réel : types, dates, sources, tailles et profondeur des métadonnées sont validés avant toute écriture ;
- l’aperçu détaille les titres ajoutés, les médias mis à jour, les champs concernés, les conflits et le nombre d’événements du Journal ;
- les fiches **Sorties** utilisent une clé stable : l’arrivée tardive d’une autre source ne peut plus déplacer le média ajouté à la Wishlist ;
- le service worker précharge l’intégralité du shell local pour permettre un premier lancement installé hors ligne ;
- le contenu derrière les modales devient réellement inerte, y compris pour VoiceOver, et les claviers d’iPad sont mieux reconnus ;
- l’interface issue du cache répond immédiatement pendant la validation Supabase et l’indicateur distingue désormais hors connexion et synchronisation indisponible ;
- le cache privé de la bibliothèque est supprimé à la déconnexion et les anciens restes du bouton favori ont été retirés ;
- vingt-deux tests automatisés protègent désormais ces comportements.

La version conserve les améliorations introduites en 3.4.5 :

- toutes les fenêtres conservent désormais le focus, gèrent `Tab` et `Échap` de manière identique et rendent le focus à la jaquette d’origine après fermeture ;
- chaque modale possède un titre accessible explicite, y compris les fiches, les filtres et la restauration ;
- la sauvegarde JSON peut maintenant être restaurée après un aperçu clair des médias ajoutés, mis à jour, inchangés ou ignorés ;
- la restauration fusionne les données sans aucune suppression automatique ;
- l’ensemble de la logique **Sorties** — sources, filtres, Wishlist, synchronisation, rendu et aperçu — quitte `app.js` pour un module dédié ;
- manifeste, démarrage et service worker n’utilisent plus le chemin fixe `/Kulturo/` et restent valides si le dépôt est renommé ou déplacé ;
- un indicateur discret apparaît uniquement lorsque l’application passe hors connexion ;
- les tests protègent ces comportements ainsi que les acquis des nettoyages précédents.

La version conserve le nettoyage d’interface introduit en 3.4.4 :

- les 95 gestionnaires `onclick` restants sont remplacés par une délégation d’événements unique et testable ;
- formulaires, listes, cases à cocher, navigation clavier et clics sur les fonds de modale suivent désormais le même mécanisme ;
- les erreurs de chargement des jaquettes sont gérées à un seul endroit, sans JavaScript injecté dans le HTML ;
- aucun attribut d’événement inline ne subsiste dans l’application ;
- largeur et espacements internes des fiches, filtres, confirmations et parcours d’ajout reposent sur les mêmes variables CSS ;
- les anciennes définitions visuelles des segments de modale, déjà remplacées par la charte commune, sont retirées ;
- huit tests techniques protègent maintenant le cache, le Journal, les fiches, les interactions et le service worker.

La version conserve le cycle de vie renforcé introduit en 3.4.3 :

- cycle de vie des fiches isolé dans un gestionnaire dédié : requêtes, signaux d’annulation, minuteries et images temporaires sont libérés ensemble ;
- protection explicite contre une ancienne fermeture qui tenterait de démonter une nouvelle fiche déjà ouverte ;
- fusion des informations TMDb, IGDB et Open Library extraite et testée afin de ne jamais écraser une donnée personnelle existante ;
- jaquettes et grands arrière-plans répartis dans deux caches distincts avec des limites adaptées ;
- capacité portée à 240 jaquettes, tandis que les 36 arrière-plans les plus récents restent disponibles sans évincer la bibliothèque ;
- couvertures IGDB et Open Library désormais réellement éligibles au cache hors ligne ;
- polices retirées du quota des images et conservées avec les ressources statiques ;
- ancien cache d’images migré automatiquement lors de la mise à jour pour éviter un premier lancement à froid ;
- les tests techniques valident le démarrage, le Journal, l’enrichissement des fiches, leur fermeture et la politique de cache.

La version conserve le démarrage stabilisé introduit en 3.4.2 : Supabase ne déclenche aucun nouveau rendu lorsqu’il confirme simplement le même contenu que le cache local déjà affiché.

- comparaison stable entre l’instantané local et la réponse Supabase, indépendante de l’ordre des lignes et des propriétés JSON ;
- rendu des cartes et de l’étagère **À reprendre** relancé uniquement lorsqu’une donnée a réellement changé ;
- filtres et recherche restaurés avant le premier affichage de la bibliothèque ;
- restauration finale de la navigation sans troisième rendu inutile de la page Bibliothèque ;
- navigation temporelle, état des onglets et interactions du Journal extraits dans un module dédié ;
- anciens gestionnaires `onclick` du Journal remplacés par une seule délégation d’événements ;
- règles CSS Journal obsolètes retirées et styles communautaires regroupés avec le composant actif ;
- client Supabase verrouillé sur une version exacte et scripts externes rangés dans le cache statique adapté ;
- premiers tests techniques ajoutés pour protéger la comparaison cache/Supabase et l’état du Journal.

La version conserve l’uniformisation de **Mon journal** et **Communauté** introduite en 3.4.1 : même navigation temporelle, même découpage par mois et par jour et même structure de carte.

- contrôle **Tout l’historique** et navigation mensuelle disponibles dans les deux onglets ;
- période choisie mémorisée séparément pendant le passage entre Mon journal et Communauté ;
- titres de mois, séparateurs de jours, dimensions de jaquette, badges, heure et rythme vertical uniformisés ;
- cartes Communauté reconstruites sur le composant de Mon journal, tout en conservant le pseudo et le statut actuel du média ;
- bilan personnel **Le mois en bref** volontairement réservé à Mon journal.

La version conserve également la stabilisation introduite en 3.4.0 : la transition jaquette → fiche garde une destination fixe pendant l’arrivée du synopsis et les ressources d’une fiche fermée sont libérées immédiatement.

- fiche détaillée maintenue à sa géométrie finale pendant le chargement, avec enrichissement limité au corps défilable ;
- appels TMDb, IGDB, Open Library, Google Books et Groq annulés dès la fermeture ou le remplacement d’une fiche ;
- caches de réponses et de préchargement bornés pour éviter leur croissance après de nombreuses ouvertures successives ;
- préchargement réservé au véritable survol avec une souris, sans requête anticipée au toucher ;
- chargements d’images, minuteries et anciennes mises à jour de fiche nettoyés lors de la fermeture ;
- traduction IGDB simplifiée autour d’un seul passage par `groq-proxy`, partagé avec les livres ;
- fonction Groq mise à jour vers `openai/gpt-oss-20b`, avec une route de diagnostic et des erreurs exploitables dans les journaux Supabase ;
- première passe de nettoyage technique centrée sur le cycle de vie des fiches et la couche réseau commune.

La version conserve le parcours unifié introduit en 3.3 : trouver une œuvre, attendre sa sortie, l’ouvrir puis retrouver son mois culturel forme un ensemble continu.

- **Mes sorties attendues** reprend le panneau repliable, les dimensions et la rangée horizontale de **À reprendre** ;
- la découverte des sorties adopte la grille, les proportions, les densités et le survol de la Bibliothèque ;
- titres, dates complètes, descriptions et informations éditoriales sont retirés de la grille et restent disponibles dans la fiche ;
- seuls les marqueurs immédiatement utiles demeurent sur les jaquettes : compte à rebours et Wishlist ;
- les titres déjà ajoutés sont masqués par défaut du flux de découverte pour éviter leur répétition sous la rangée personnelle ;
- une charte de contrôles commune fixe les hauteurs, rayons, espacements et états actifs des boutons de Sorties, du Journal, du Profil et des fiches ;
- les contrôles standards mesurent 40 px, les contrôles compacts 36 px et les sélecteurs segmentés partagent les mêmes rayons 14/9 px.

- recherche enrichie dans toute la bibliothèque : titres, réalisateurs, auteurs, casting, studios, genres, plateformes et années peuvent être retrouvés sans tenir compte du filtre actif ;
- résultats de recherche classés par pertinence, avec les correspondances exactes sur le titre placées en premier ;
- nouvelle rangée **Mes sorties attendues** dans Sorties, directement alimentée par la Wishlist et ordonnée par date ;
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
- palette de marque désormais sémantique : or pour les actions principales, corail pour les coups de cœur, sarcelle pour les éléments terminés, les reprises et les confirmations ;
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

- **3.4.6** — restauration atomique de la bibliothèque et du Journal, conflits sécurisés, Sorties stabilisé et premier lancement PWA hors ligne.
- **3.4.5** — modales accessibles, restauration JSON sans suppression, Sorties extrait, PWA portable et état hors connexion discret.
- **3.4.4** — interactions déléguées sans JavaScript inline et structure CSS des modales consolidée à rendu identique.
- **3.4.3** — cycle de vie des fiches isolé, enrichissement non destructif testé et caches séparés pour les jaquettes et les arrière-plans.
- **3.4.2** — premier nettoyage modulaire, dépendance Supabase stabilisée et suppression du bref double rendu de la bibliothèque au démarrage.
- **3.4.1** — Mon journal et Communauté réunis autour de la même navigation temporelle, des mêmes sections mois/jour et du même modèle de carte.
- **3.4.0** — fiches stabilisées sur iPad, ressources et caches bornés, traduction des jeux centralisée et fonction Groq rendue vérifiable.
- **3.3.3** — ancien marqueur **Pour vous**, calcul d’affinité et styles associés entièrement retirés de Sorties.
- **3.3.2** — Sorties aligné sur les modèles Bibliothèque/À reprendre et charte commune appliquée aux boutons et sélecteurs de l’application.
- **3.3.1** — arrivée de la jaquette stabilisée : destination immobile et passage instantané vers l’image réelle, sans sursaut ni image vide sur iOS.
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

## Déployer les fonctions Supabase

GitHub Pages publie l’interface, mais ne redéploie pas automatiquement les fonctions Edge. Après la mise à jour du dépôt :

1. dans **Supabase → Edge Functions → `groq-proxy`**, remplacer le fichier `index.ts` par celui du dépôt puis déployer ;
2. faire de même pour **`igdb-proxy`** afin que la traduction ne soit plus exécutée à deux endroits ;
3. appeler `groq-proxy` avec `{ "action": "health" }` : la réponse doit indiquer la version `3.4.0`, le modèle actif et `configured: true`.

Les secrets existants `GROQ_API_KEY`, `IGDB_CLIENT_ID` et `IGDB_CLIENT_SECRET` restent configurés uniquement dans Supabase. Aucune modification SQL n’est nécessaire pour cette version.

## La direction

Kulturo reste un projet personnel, construit au fil des usages. Chaque version cherche moins à ajouter qu’à mieux ordonner : une interface plus juste, une lecture plus fluide et une collection qui ressemble davantage à la personne qui l’utilise.
