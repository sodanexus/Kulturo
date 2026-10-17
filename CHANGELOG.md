# Historique de Kulturo

[Revenir à la présentation](README.md)

## 4.1.0

Version de finition visuelle : bannière de fiche animée, survol des affiches uniforme et réactif, aura et couleur de nuance plus justes. Aucun SQL ni redéploiement de fonction Edge.

- **Aura un peu plus discrète** : environ un quart d'intensité en moins sur le liseré, les halos, la lueur de la bannière et le fond du corps de la fiche, et couleur d'aura légèrement moins saturée. Le caractère de l'effet ne change pas.
- **Bannière vivante dans la fiche.** L'image de fond dérive très lentement (zoom de 4 à 12 % sur 18 s, direction différente à chaque image). Pour les films et séries, 3 images de fond supplémentaires (sans texte, les mieux notées de TMDb) s'enchaînent en fondu toutes les 7 s ; l'image sortante reste opaque sous la nouvelle jusqu'à la fin du fondu, sans creux de luminosité. Les jeux et livres gardent la dérive sur leur image unique.
- Garde-fous : rien ne bouge avec « réduire les animations », le diaporama ne charge pas d'images supplémentaires en mode économie de données, se met en pause hors écran et quand l'onglet est masqué, et s'arrête à la fermeture de la fiche. Images en 780 px de large sur mobile. Aucune donnée enregistrée, aucun SQL : les images viennent de TMDb à l'ouverture (mises en cache par le client).
- **Animations plus vives, toujours douces.** Toutes les courbes étaient remplacées par une seule courbe symétrique (ease-in-out) qui démarre de vitesse nulle : même à 140 ms, le mouvement paraissait en retard. Les entrées et changements d'état reprennent une décélération franche (départ à pleine vitesse, arrivée douce), les fondus une courbe standard, les longues entrées la courbe « expo ». Aucun rebond. Durées inchangées.
- **Survol des affiches réactif sur ordinateur** : l'affiche atteint 90 % de son zoom en ~40 ms au lieu de ~125 ms (mesuré). Elle réagit en 90 ms à l'entrée et se relâche en 260 ms à la sortie ; la lueur utilise la même durée pour rester solidaire de l'affiche.
- **Lumière au curseur sur toutes les affiches.** La lueur qui suit la souris (et l'inclinaison) n'existait vraiment que dans « À reprendre » : sur la grille de la Bibliothèque elle était posée derrière l'image, donc invisible. Elle passe devant la jaquette et suit son inclinaison, et elle existe maintenant aussi dans les Sorties, le Top du Profil (qui s'incline aussi) et les lignes du Journal personnel et de la Communauté. Souris uniquement ; mouvement réduit respecté. Mêmes transformation, ombre et transition partout ; les Sorties et le Top du Profil promeuvent aussi l'affiche sur sa propre couche pendant l'inclinaison, comme la Bibliothèque.
- **Couleur de nuance plus juste.** Le calcul passe de la saturation HSL à l'espace perceptuel OKLCH. Un noir à peine teinté ne choisit plus de teinte « bleue » : l'affiche reste neutre. Une affiche sombre ou à fond blanc garde la couleur de son sujet (le rouge d'une affiche d'horreur, le bleu d'un personnage sur fond blanc) au lieu de tomber dans le gris. La teinte est choisie par surface × chroma sur un histogramme circulaire lissé (une teinte n'est plus coupée entre deux cases), puis moyennée dans l'espace OKLab.
- L'image est analysée aux proportions d'une affiche (40 × 60 au lieu de 28 × 28 écrasé) ; les marges sont ignorées et le bandeau de crédits du bas est allégé.
- L'aura ne reprend plus la luminosité de l'affiche (une affiche sombre donnait une aura noire, invisible) : c'est une lumière franche et saturée, distincte des couleurs plus claires des commandes. Les affiches presque monochromes restent neutres.
- **Aura de la fiche renforcée sur ordinateur** : liseré teinté, halo proche, grande nappe sous la fiche et reflet en haut ; lueur de l'entête un peu plus présente qu'avant mais mesurée, et plus profonde dans le corps. Mobile inchangé.
- Cache des couleurs invalidé (v7) : les affiches sont ré-analysées à la prochaine ouverture. Aucun SQL.
- Tests de couleur : l'ancien test « ambiance sombre » devient « aura visible sur affiche sombre » ; six nouveaux tests (noir teinté, sujet coloré sur fond sombre, fond blanc, teinte à cheval sur deux cases, validité des sorties).

## 4.0.23

- Journal mobile : retrait du focus du sélecteur natif avant le filtrage et suppression du transfert automatique vers l’autre select. Navigation clavier desktop conservée.
- Les options du mois ne sont plus reconstruites quand leur liste est inchangée, afin de ne pas perturber le menu natif.
- Durées et courbes d’animation inchangées.

## 4.0.22

- Remplacement du panneau principal centralisé : fiche, édition, étapes d’ajout et autres panneaux utilisent le même redimensionnement dans les deux sens.
- Démarrage avant peinture mais après préparation du contenu ; les retours Annuler, Echap, navigateur et Enregistrer partagent le même chemin.
- Dimensions minimales et flex contrôlés pendant la transition pour permettre aussi l’agrandissement depuis un panneau plus petit ; aucune animation différée sur un panneau déjà remplacé.
- Durée de 280 ms et respect du mouvement réduit conservés.

## 4.0.21

- Rythme plus réactif : appuis 80 ms, survols/états 140 ms, contenus 220 ms, panneaux et dépliages 280 ms.
- Courbes, synchronisation du synopsis et mouvement réduit conservés ; valeurs de repli JavaScript et tests ajustés aux nouvelles durées.

## 4.0.20

- Généralisation de la correction du survol à tous les boutons principaux, dont Enregistrer : le dégradé n’est plus supprimé par les anciennes règles background.
- Suppression du redémarrage de l’animation CSS de page à la fin d’une View Transition ; navigation par un fondu sans translation, avec repli en fondu lorsque l’API n’est pas disponible.
- Suppression du déplacement d’entrée des pochettes du Profil et de leurs blocs, sans modifier les effets de survol intentionnels.

## 4.0.19

- Rythme commun : appuis 100 ms, états des commandes 180 ms, contenus 280 ms, fenêtres et disposition 350 ms.
- Courbe commune aux panneaux, hauteurs, groupes du Journal et retours de geste mobile ; aucune cascade ajoutée.
- Fiche ↔ Modifier : transition des dimensions du panneau et fondu des contenus, sans mise à l’échelle du texte ; contexte de lecture conservé.
- Enrichissements des fiches et changements de résultats utilisent les durées communes ; délais de nettoyage synchronisés.
- Le synopsis garde sa progression synchronisée et lit désormais la durée de disposition partagée.
- Deux tests supplémentaires couvrent la transition fiche/édition et son absence en mouvement réduit.

## 4.0.18

- Voir plus / Voir moins : la zone visible du texte évolue sur les mêmes 350 ms que la hauteur de section et le défilement. Le texte ne passe plus instantanément de sa hauteur courte à sa hauteur complète.
- Une inversion en cours de mouvement reprend la hauteur visible du texte ; les dimensions temporaires sont libérées à la fin.

## 4.0.17

- Synopsis : dépliage/repli et défilement synchronisés sur 350 ms, avec une courbe commune et inversion depuis la position visible.
- Une réserve temporaire de défilement évite le retour brutal des informations au repli ; elle est supprimée à la fin ou à l’interruption. Mouvement réduit respecté.
- Desktop : conservation du dégradé de Modifier au survol, pour supprimer la bascule brusque vers un fond uni.
- Travail effectué sur l’archive « Kulturo-main (a jour).zip » fournie le 17 octobre, en conservant ses autres modifications.

## 4.0.16

- Retrait du clone animé de jaquette : ouverture douce de la fiche sur desktop, glissement depuis le bas sur mobile. La pochette reste dans son emplacement, restitution du focus conservée.
- Analyse des couleurs par familles de teintes et surface occupée, bonus de saturation limité.
- Gris, noir et blanc conservés neutres ; correction des pixels transparents traités comme opaques.
- Ambiance fidèle distincte des couleurs plus claires des commandes ; attente et échec d’analyse neutres dans la fiche.
- Réutilisation de la teinte déjà obtenue pendant les enrichissements ; invalidation du cache de couleurs précédent.
- Six tests de couleur ajoutés : monochrome, petit logo, fond nuancé, transparence et séparation ambiance/commandes.

## 4.0.15

- Voir moins : après le repli du synopsis, retour doux au sommet de la fiche pour retrouver l’entête déployé. Même enchaînement que Voir plus, sur desktop et mobile, avec respect du mouvement réduit et contrôle de l’état en cas de clics rapides.

## 4.0.14

- Courbe de décélération commune ; fermeture des fenêtres depuis leur état visible, même pendant leur ouverture.
- Le retour de la jaquette repart de sa position en cours et partage les 250 ms des fenêtres.
- Synopsis et enrichissement des fiches : hauteurs animées, interruptibles, sans empilement des anciens blocs.
- Geste mobile : reprise depuis la position visible, retour doux, résistance progressive, rejet des petites secousses et des gestes multitouch.
- Fondus courts des flux Journal, Sorties et des filtres de bibliothèque ; suppression des cascades redondantes.
- Dimensions des couvertures réservées et fondu de chargement conservé.
- Navigation rapide : un changement obsolète ne peut plus remplacer le dernier choix.
- Libération des observateurs de fiche ; restauration fiable du libellé et de l’état des boutons après chargement.
- Respect du mouvement réduit pour les nouveaux effets.

## 4.0.13

- Synopsis déplié : réserve une zone de lecture pour permettre son alignement sous la barre compacte même sur une grande fiche desktop. Voir moins libère cet espace ; la hauteur suit le redimensionnement.

## 4.0.12

- Rythme commun : appui 100 ms, changement d’état 180 ms, fenêtres 250 ms.
- Relief discret sur les affiches ; cadre doré réservé aux notes de 10/10.
- Boutons et sélecteurs sans soulèvement ; retour d’appui commun et focus clavier visible.
- Suppression des vagues au clic et des apparitions répétées de toute la grille.
- Fermeture des fenêtres synchronisée avec le CSS, y compris le mouvement réduit.

## 4.0.11

- Journal : suppression de la frise verticale décorative (ligne, point et animation au défilement), dans les deux modes et sur tous les écrans.

## 4.0.10

- Desktop : suppression des deux règles qui assombrissaient les couvertures voisines au survol.
- L’affiche ciblée se soulève de 4 px, avec un contour doré fin et une ombre douce ; zoom et inclinaison conservés. Retour visuel également au clavier.
- Le déplacement est désactivé lorsque le mouvement réduit est demandé.

## 4.0.9

- Journal : suppression des flèches ; le choix du mois filtre les événements au lieu de défiler vers une ancre. « Tout l’historique » restaure le flux complet.
- Sélecteur natif flottant lorsque celui du haut quitte l’écran, au-dessus de la navigation mobile ; les deux sélecteurs partagent le mois sélectionné.
- Mois indépendants pour Mon journal et Communauté ; changement de mois ramenant au début de la liste.
- Contrôle flottant masqué hors du Journal, pendant une fiche ou un bandeau de mise à jour. Retour du focus au sélecteur supérieur après changement depuis le contrôle flottant.
- Quatre tests de régression supplémentaires. Versions des dépendances conservées sans modification.

## 4.0.8

- Correctif de déploiement : restauration du verrouillage original des dépendances (picomatch 4.0.7). Seule la version du projet est 4.0.8.

- Fiche mobile : croix masquée lorsque le geste de fermeture est activé ; l’espace correspondant est libéré dans la barre compacte.
- Fiche desktop : croix plus petite et sans fond au repos, avec une zone réservée séparée des notes et badges en mode compact.

## 4.0.7

- Journal : recherche appliquée aux données personnelles et communautaires, avec état vide et mois synchronisés ; suppression du filtre DOM concurrent.
- Recherche : accents et ligatures normalisés dans toutes les vues utilisant la recherche commune.
- Journal : navigation clavier des onglets, réinitialisation des mois vides et des états à la déconnexion, dates sans heure interprétées localement.
- Sorties : champ de recherche visible synchronisé lors des réinitialisations ; commandes et mois dans le flux, sans fond flottant.
- Design : tailles et typographie communes des contrôles, cibles tactiles de 44 px pour ces contrôles, départ de page unifié, même icône Profil.
- Accessibilité : boutons de fermeture conservés sur mobile, éléments summary inclus dans le cycle de focus des dialogues, retour en haut respectant le mouvement réduit.
- Sept tests de régression ajoutés. Bilan et limites de l’audit dans AUDIT.md.

## 4.0.6

- Journal : les commandes défilent avec le contenu sur un fond transparent, sans rectangle opaque ni coupure de la frise dorée.
- Navigation mensuelle : alignement adapté à la suppression de la barre fixe.

## 4.0.5

- Journal : suppression du double décalage sous l’en-tête et des styles concurrents.
- Barre de commandes opaque au défilement, y compris au-dessus de la frise ; les titres de mois restent dans le flux sur mobile.
- Mon journal / Communauté reprennent les boutons segmentés communs ; flèches et mois utilisent les dimensions et arrondis du design system.

## À venir (non publié)

- **Raccourcis de l'icône** : un appui long sur l'icône de la PWA propose **Ajouter une œuvre**, **Journal** et **Sorties**. « Ajouter » ouvre directement la feuille d'ajout (`#/library?add=1`), puis l'URL redevient normale. Sans session, l'ajout s'ouvre après la connexion. Aucune migration SQL.
- Barre compacte de la fiche : la note garde son or d'origine au lieu de suivre la couleur de la jaquette, et affiche aussi le **coup de cœur** et le **revisionnage** (avec son compteur) lorsqu'ils existent. Ils se mettent à jour en direct.
- Fiche : le cœur du coup de cœur « pop » à l'ouverture, juste derrière l'étoile de la note, et quand une œuvre devient coup de cœur. Désactivé si le mouvement est réduit.
- Les grands titres de page (Bibliothèque, Profil, Sorties, Journal), leur phrase d'introduction et leur ligne de séparation sont supprimés. Toutes les pages démarrent à la même hauteur, sur ordinateur comme sur téléphone.
- Correction : depuis le Profil, un clic sur une note de l'histogramme (ou sur Terminés, En cours, Coups de cœur, Envies) ouvre bien la Bibliothèque filtrée. Les filtres étaient remis à zéro par la transition de page.
- Le statut **En pause** est supprimé : ces médias deviennent **En cours**. **Un SQL est nécessaire** : exécuter une fois `schema.sql` dans Supabase (il convertit les médias concernés sans créer de faux événements dans le Journal). Les anciennes sauvegardes contenant ce statut restent restaurables.
- Le tri par défaut de la Bibliothèque est **automatique** : Fins récentes pour **Terminé**, Ajouts récents pour les autres statuts. **Fins récentes** n'est proposé que lorsque le statut a une date de fin. Un tri choisi explicitement reste mémorisé (nouvelle clé de préférence : l'ancien choix mémorisé est abandonné).
- Retirer une relecture avec le bouton **−** de la fiche retire aussi ses événements du Journal et des statistiques.
- Un seul vocabulaire par type de média : **Vu / Lu / Terminé**, **Revisionnage / Relecture / Nouvelle partie**, dans les cartes, les fiches, les formulaires, le Journal, le filtre et le Profil. « Replay » ne subsiste que dans les vues qui mélangent plusieurs types.
- Les statuts, les tris et leurs libellés viennent d'une source unique (`domain.js`).
- Les titres de page, le titre des fiches et le logo passent de Newsreader à **Archivo** ; le synopsis utilise la police de l'interface.

## 4.0.4

- Séries en bleu : badges des fiches, Journal personnel et Communauté, icônes concernées et répartition du Profil. Films rouges, jeux verts et livres dorés restent inchangés.
- Synopsis à 14 px au lieu de 16 px, avec un interligne de 1,65, dans toutes les fiches. « Voir plus » continue de mesurer la hauteur réelle.
- Aucun changement de données ou migration SQL.

## 4.0.3

- Les titres Bibliothèque, Journal et Profil partagent le même espace vertical : une ligne est réservée sous le titre même sans description. La disposition de référence de Bibliothèque est conservée. Les en-têtes masqués sur téléphone restent masqués.
- Les livres n’affichent plus qu’un lien **Chercher le livre**, avec l’ISBN si disponible, sinon le titre et l’auteur. Les liens d’extrait et d’éditeur sont retirés.
- Aucun changement de données ni migration SQL.

## 4.0.2

- Films, Séries, Jeux et Livres sont séparés dans les filtres, l’ajout manuel et la modification. Les séries restent enregistrées sous `media_type: movie` et `subtype: tv` ; les anciennes données sont compatibles.
- « Envies », « Bande-annonce », le vouvoiement et « œuvre » harmonisent les textes visibles. Les introductions redondantes des pages sont retirées.
- La recherche Bibliothèque se combine aux filtres, qui restent accessibles. Les critères appliqués sont visibles, y compris le statut par défaut pendant une recherche. Une recherche vide permet de chercher le titre dans les catalogues pour l’ajouter, ou d’élargir à toute la bibliothèque.
- Sorties dispose d’une recherche locale indépendante, restaurée dans l’URL. La recherche Bibliothèque est réservée à sa page.
- Les livres proposent une fiche et une recherche d’extrait (ou un extrait / éditeur si une URL est disponible), sans bande-annonce générique. Les jeux utilisent leur plateforme pour choisir un lien pertinent ; sans plateforme reconnue, ils renvoient vers une recherche de fiche plutôt que Steam par défaut.
- Le cache PWA et les références de version sont mis à jour. Cette évolution UX n’ajoute aucune migration SQL ni fonction Edge.
- Tests de régression ajoutés pour les recherches combinées, le sous-type Série et les liens contextuels. Voir `tests/README.md` pour le périmètre effectivement vérifié et les limites de l’environnement.

## 4.0.1

- Le bloc **Rétrospective culturelle** est retiré du Profil afin d’éviter de répéter les statistiques annuelles déjà présentes dans les autres tuiles.
- Son rendu, ses calculs, ses styles et ses tests spécifiques ont été supprimés avec lui : la vue annuelle reste plus légère sans conserver de code dormant.
- Aucun changement SQL ni redéploiement de fonction Edge n’est nécessaire.

## 4.0.0

- Kulturo adopte une architecture **local-first** : la bibliothèque et le Journal sont conservés dans IndexedDB, séparément pour chaque compte, et apparaissent avant la réponse du réseau.
- Les ajouts, modifications et suppressions de médias sont enregistrés localement dans une file atomique, fusionnés sans écraser les changements plus récents, puis rejoués vers Supabase en arrière-plan.
- L’état hors connexion, la synchronisation et les changements en attente sont signalés discrètement dans la barre supérieure ; une suppression peut être annulée avant son envoi.
- La confirmation Supabase ne reconstruit plus une grille identique : les champs internes et l’identifiant propriétaire sont exclus de l’empreinte visuelle afin d’éviter le bref rafraîchissement des jaquettes au démarrage.
- L’URL conserve désormais la page, la recherche, les filtres, les périodes du Profil et du Journal, les réglages de Sorties et la fiche ouverte, sans dépendre du nom du dépôt GitHub Pages.
- Les changements de page partagent une transition légère avec repli automatique et respect de la préférence système de réduction des mouvements.
- Une rétrospective éditoriale apparaît dans la vue annuelle du Profil : œuvres terminées, genres explorés, rythme, mois le plus actif, catégorie dominante et souvenir de l’année.
- Les sauvegardes passent au schéma 2, restent rétrocompatibles et peuvent être exportées hors connexion ; elles précisent le nombre de changements locaux encore en attente.
- TypeScript sécurise les contrats des médias, événements, filtres et mutations. Vite produit un build optimisé, portable et contrôlé avant publication.
- Les versions npm sont verrouillées, l’archive ZIP reste déterministe et GitHub Actions vérifie, construit puis publie automatiquement l’artefact exact sur Pages.
- Les bibliothèques et journaux vides sont reconnus comme de vrais instantanés hors ligne, sans chargement infini ni faux message d’erreur.

**Mise à jour depuis 3.4.6 à 3.4.9 :** aucun changement SQL ni redéploiement de fonction Edge. La base locale 4.0 est créée automatiquement au premier lancement.

## 3.4.9

- La réconciliation des cartes conserve désormais les nœuds déjà à leur place : filtrer, rechercher ou actualiser ne redéclenche plus inutilement la peinture et le décodage de toutes les jaquettes.
- Les cartes inchangées sont reconnues par leur contenu utile et la recherche globale regroupe les frappes dans une seule mise à jour par image d’animation.
- Toutes les requêtes Supabase disposent d’un délai maximal, d’une annulation effective et, pour les écritures média, d’un verrou explicite sur le compte courant.
- Le contexte restauré, les ajouts Wishlist, les actions de fiche, le Journal et la restauration de sauvegarde ignorent toute réponse arrivée après une déconnexion ou un changement de compte.
- L’export JSON vérifie et recharge le Journal avant de créer le fichier afin de ne jamais présenter une sauvegarde partielle comme complète.
- Les homonymes et remakes partageant un titre ne sont plus confondus lorsque leurs identifiants externes, années ou auteurs les distinguent.
- Le service worker regroupe l’élagage des caches d’images par rafale, conserve ses écritures jusqu’à leur terme et limite l’attente du shell avant de reprendre sa copie hors ligne.
- Les images générées par l’interface sont décodées de manière asynchrone ; l’enregistrement du service worker contourne aussi le cache HTTP de son propre script.
- Passer d’une fiche à une autre depuis une métadonnée ne tente plus de refermer la seconde vers la jaquette d’origine de la première.
- Trente tests techniques et un parcours de quarante ouvertures successives protègent désormais ces corrections.

**Mise à jour depuis 3.4.6, 3.4.7 ou 3.4.8 :** aucun changement SQL ni redéploiement de fonction Edge.

## 3.4.8

- Les chargements de la Bibliothèque, du Journal, de la Communauté, du Profil et des Sorties possèdent désormais un cycle de vie explicite : la requête précédente est annulée et une réponse tardive ne peut plus modifier l’état ou le DOM.
- Les lectures Supabase et les trois catalogues de Sorties reçoivent réellement le signal d’annulation ; les demandes simultanées du Journal partagent la même requête.
- La reconnexion protège aussi le changement de compte afin qu’une ancienne session ne puisse pas remplacer la nouvelle interface.
- L’actualisation restaure l’onglet, la recherche, les filtres, le tri, la densité, la période du Profil, le mois des deux Journaux, les groupes ouverts, les filtres de Sorties et la position propre à chaque page.
- La page mémorisée réapparaît immédiatement depuis le cache local, pendant que Supabase confirme discrètement les données en arrière-plan.
- La fiche média quitte `app.js` : rendu, enrichissement, métadonnées cliquables, actions rapides, synopsis, ressources et transition de jaquette sont réunis dans `features/media-detail.js`.
- `app.js` passe d’environ 4 770 à 3 750 lignes sans modifier le parcours d’ajout ou de modification.
- La barre supérieure signale les validations réseau en arrière-plan ; l’ajout Wishlist, la connexion et le pseudo affichent un état occupé cohérent.
- Les notifications identiques sont regroupées, limitées à trois et restent plus longtemps visibles lorsqu’elles signalent une erreur.
- Un fichier `VERSION` et `scripts/release.mjs` contrôlent les numéros, la syntaxe, les tests et le shell hors ligne avant de produire une archive ZIP reproductible sans dépendance npm.
- Les tests protègent désormais la concurrence asynchrone et l’extraction complète des fiches média.

**Mise à jour depuis 3.4.6 ou 3.4.7 :** aucun changement SQL ni redéploiement de fonction Edge.

## 3.4.7

- États de chargement, d’erreur et de collection vide partagés par la Bibliothèque, les Sorties et le Journal.
- L’état d’attente du Profil disparaît dès que ses statistiques sont rendues.
- Squelettes limités aux jaquettes, avec les mêmes proportions et densités que les cartes finales.
- Actions adaptées au contexte : Réessayer, Effacer la recherche ou Réinitialiser les filtres.
- Modifier devient une étape de la fiche : Enregistrer ou Annuler ramène à la fiche, avec le synopsis déplié et la position de lecture conservés.
- Focus rendu au bouton Modifier au retour, puis à la jaquette à la fermeture ; un enregistrement en attente bloque la fermeture et conserve le brouillon en cas d’échec.
- Profil et rendu du Journal extraits dans deux modules dédiés, ajoutés au préchargement de la PWA.
- Parcours d’intégration fournis pour les tailles mobile, tablette et bureau, les ouvertures répétées, le clavier et les échecs réseau simulés. Leur lancement est documenté dans tests/README.md.
- README recentré sur le concept et les espaces ; historique et consignes de déploiement séparés.

**Mise à jour depuis 3.4.6 :** aucun changement de schéma ni de fonction Edge. Les installations plus anciennes doivent aussi appliquer le SQL de 3.4.6 ; voir [DEPLOYMENT.md](DEPLOYMENT.md).

## 3.4.6

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

## 3.4.5

- toutes les fenêtres conservent désormais le focus, gèrent `Tab` et `Échap` de manière identique et rendent le focus à la jaquette d’origine après fermeture ;
- chaque modale possède un titre accessible explicite, y compris les fiches, les filtres et la restauration ;
- la sauvegarde JSON peut maintenant être restaurée après un aperçu clair des médias ajoutés, mis à jour, inchangés ou ignorés ;
- la restauration fusionne les données sans aucune suppression automatique ;
- l’ensemble de la logique **Sorties** — sources, filtres, Wishlist, synchronisation, rendu et aperçu — quitte `app.js` pour un module dédié ;
- manifeste, démarrage et service worker n’utilisent plus le chemin fixe `/Kulturo/` et restent valides si le dépôt est renommé ou déplacé ;
- un indicateur discret apparaît uniquement lorsque l’application passe hors connexion ;
- les tests protègent ces comportements ainsi que les acquis des nettoyages précédents.

## 3.4.4

- les 95 gestionnaires `onclick` restants sont remplacés par une délégation d’événements unique et testable ;
- formulaires, listes, cases à cocher, navigation clavier et clics sur les fonds de modale suivent désormais le même mécanisme ;
- les erreurs de chargement des jaquettes sont gérées à un seul endroit, sans JavaScript injecté dans le HTML ;
- aucun attribut d’événement inline ne subsiste dans l’application ;
- largeur et espacements internes des fiches, filtres, confirmations et parcours d’ajout reposent sur les mêmes variables CSS ;
- les anciennes définitions visuelles des segments de modale, déjà remplacées par la charte commune, sont retirées ;
- huit tests techniques protègent maintenant le cache, le Journal, les fiches, les interactions et le service worker.

## 3.4.3

- cycle de vie des fiches isolé dans un gestionnaire dédié : requêtes, signaux d’annulation, minuteries et images temporaires sont libérés ensemble ;
- protection explicite contre une ancienne fermeture qui tenterait de démonter une nouvelle fiche déjà ouverte ;
- fusion des informations TMDb, IGDB et Open Library extraite et testée afin de ne jamais écraser une donnée personnelle existante ;
- jaquettes et grands arrière-plans répartis dans deux caches distincts avec des limites adaptées ;
- capacité portée à 240 jaquettes, tandis que les 36 arrière-plans les plus récents restent disponibles sans évincer la bibliothèque ;
- couvertures IGDB et Open Library désormais réellement éligibles au cache hors ligne ;
- polices retirées du quota des images et conservées avec les ressources statiques ;
- ancien cache d’images migré automatiquement lors de la mise à jour pour éviter un premier lancement à froid ;
- les tests techniques valident le démarrage, le Journal, l’enrichissement des fiches, leur fermeture et la politique de cache.

## 3.4.2

 Supabase ne déclenche aucun nouveau rendu lorsqu’il confirme simplement le même contenu que le cache local déjà affiché.

- comparaison stable entre l’instantané local et la réponse Supabase, indépendante de l’ordre des lignes et des propriétés JSON ;
- rendu des cartes et de l’étagère **À reprendre** relancé uniquement lorsqu’une donnée a réellement changé ;
- filtres et recherche restaurés avant le premier affichage de la bibliothèque ;
- restauration finale de la navigation sans troisième rendu inutile de la page Bibliothèque ;
- navigation temporelle, état des onglets et interactions du Journal extraits dans un module dédié ;
- anciens gestionnaires `onclick` du Journal remplacés par une seule délégation d’événements ;
- règles CSS Journal obsolètes retirées et styles communautaires regroupés avec le composant actif ;
- client Supabase verrouillé sur une version exacte et scripts externes rangés dans le cache statique adapté ;
- premiers tests techniques ajoutés pour protéger la comparaison cache/Supabase et l’état du Journal.

## 3.4.1

 même navigation temporelle, même découpage par mois et par jour et même structure de carte.

- contrôle **Tout l’historique** et navigation mensuelle disponibles dans les deux onglets ;
- période choisie mémorisée séparément pendant le passage entre Mon journal et Communauté ;
- titres de mois, séparateurs de jours, dimensions de jaquette, badges, heure et rythme vertical uniformisés ;
- cartes Communauté reconstruites sur le composant de Mon journal, tout en conservant le pseudo et le statut actuel du média ;
- bilan personnel **Le mois en bref** volontairement réservé à Mon journal.

## 3.4.0

 la transition jaquette → fiche garde une destination fixe pendant l’arrivée du synopsis et les ressources d’une fiche fermée sont libérées immédiatement.

- fiche détaillée maintenue à sa géométrie finale pendant le chargement, avec enrichissement limité au corps défilable ;
- appels TMDb, IGDB, Open Library, Google Books et Groq annulés dès la fermeture ou le remplacement d’une fiche ;
- caches de réponses et de préchargement bornés pour éviter leur croissance après de nombreuses ouvertures successives ;
- préchargement réservé au véritable survol avec une souris, sans requête anticipée au toucher ;
- chargements d’images, minuteries et anciennes mises à jour de fiche nettoyés lors de la fermeture ;
- traduction IGDB simplifiée autour d’un seul passage par `groq-proxy`, partagé avec les livres ;
- fonction Groq mise à jour vers `openai/gpt-oss-20b`, avec une route de diagnostic et des erreurs exploitables dans les journaux Supabase ;
- première passe de nettoyage technique centrée sur le cycle de vie des fiches et la couche réseau commune.

## Série 3.3

 trouver une œuvre, attendre sa sortie, l’ouvrir puis retrouver son mois culturel forme un ensemble continu.

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

## Série 3.2

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

## Repères des versions précédentes

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
