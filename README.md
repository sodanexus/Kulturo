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
| **Sorties** | Découvrir ce qui arrive et relier naturellement ces découvertes à mes envies. |
| **Journal** | Revoir mon parcours mois après mois et parcourir les ajouts de la Communauté. |
| **Profil** | Comprendre mes habitudes, retrouver mes préférés et raconter mon année culturelle. |

## Version actuelle · 4.2.15

Reprise de la sauvegarde 4.2.11, sans changement de palette. Les livres n’affichent plus de notes externes ni de bloc de chargement dédié. Les genres Open Library sont filtrés et francisés, y compris sur les fiches existantes.

Les synopsis étrangers des livres sont traduits en français par Groq, y compris pour les ajouts par ISBN, avec une seule apparition en fondu. Un bouton **Traduire en français** (Modifier → Détails facultatifs) permet de traduire un synopsis déjà enregistré : la traduction est proposée, puis enregistrée seulement si tu la valides. Les textes saisis à la main ne sont jamais modifiés automatiquement.

Recherche des livres par titre ou ISBN-10/13 avec contrôle de clé. Titres des éditions françaises privilégiés, puis alternatives en alphabet latin. Le synopsis est modifiable dans Modifier → Détails facultatifs ; un texte déjà renseigné n’est plus écrasé par les catalogues. Aucun SQL et aucune nouvelle fonction Supabase.

Le synopsis déjà affiché reste stable pendant la lecture. La traduction reste utilisée pour enrichir les fiches sans synopsis ; les textes déjà renseignés sont conservés. Aucun changement de fonction Supabase depuis 4.2.5.

La 4.2 refond les fiches : la fiche sert à consulter, **Modifier** sert à gérer.

- **Nouvel en-tête** — jaquette agrandie qui chevauche la bannière, avec le titre et la note personnelle à côté. Les badges (type, statut, coup de cœur, reprises) sont informatifs et ne se modifient plus d'un toucher ; la barre compacte du défilement est conservée.
- **Fiche allégée** — la barre d'actions rapides disparaît. En bas, seulement Supprimer et Modifier.
- **Sections claires** — Informations, Crédits, Casting, Notes externes et Historique, adaptées au type d'œuvre et aux données disponibles.
- **Notes externes** — TMDb pour les films et séries, IGDB (joueurs et presse) pour les jeux. Elles sont toujours nommées, distinctes de la note personnelle, et ne sont pas enregistrées en base.
- **Relecture dans Modifier** — le statut, la note et le compteur de relectures, revisionnages ou nouvelles parties se règlent au même endroit et ne sont enregistrés que par **Enregistrer** ; **Annuler** abandonne tout. Passer de Terminé à En cours démarre une reprise, sans double comptage.

La 4.2 demande de redéployer `igdb-proxy` (notes des jeux, optionnel : sans cela, les jeux n'ont simplement pas de note externe). Aucun SQL.

La 4.1 donnait de la vie à l'interface sans la rendre bruyante :

- **Bannière vivante** — dans la fiche, l'image de fond dérive très lentement ; pour les films, séries et jeux, plusieurs images de fond (TMDb, captures IGDB) s'enchaînent en fondu. Rien ne bouge avec « réduire les animations », et rien n'est enregistré en base.
- **Survol des affiches** — même comportement partout (Bibliothèque, À reprendre, Sorties, Profil, Journal) : légère inclinaison et lueur qui suit la souris, avec une réponse immédiate à l'entrée et un relâchement doux à la sortie.
- **Animations plus vives** — des courbes qui démarrent à pleine vitesse, pour un rendu fluide qui semble réactif.
- **Aura et couleur de nuance** — la couleur de la jaquette est extraite en espace perceptuel (OKLCH) ; l'aura de la fiche est plus présente sur ordinateur.

La 4.0.23 distingue les séries en bleu et réduit le texte des synopsis de 16 à 14 px.

La 4.0.3 aligne les titres Journal et Profil sur Bibliothèque et simplifie les livres à un seul lien « Chercher le livre ».

La 4.0.2 harmonise **Films · Séries · Jeux · Livres**, les libellés **Envies** et **Bande-annonce**, le vouvoiement et les liens des fiches. La recherche Bibliothèque respecte les filtres ; Sorties dispose de sa propre recherche. Les en-têtes sont allégés.

La 4.0 rend Kulturo plus immédiat et plus fiable, sans changer ce qui faisait la simplicité de son interface.

- **Ouverture instantanée** — la bibliothèque et le Journal apparaissent depuis la base locale, puis Supabase se synchronise discrètement en arrière-plan.
- **Véritable mode hors connexion** — ajouts, modifications et suppressions restent utilisables ; les changements en attente repartent automatiquement lorsque le réseau revient.
- **Navigation retrouvée** — page, recherche, filtres, période et fiche ouverte sont inscrits dans une URL portable et restaurés après actualisation.
- **Gestes plus naturels** — transitions de page cohérentes, mouvement réduit respecté et suppression annulable pendant quelques secondes.
- **Profil recentré** — les vues mensuelle et annuelle conservent uniquement les statistiques utiles, sans répétition éditoriale.
- **Fondations durables** — TypeScript et Vite encadrent désormais le build, avec versions verrouillées, contrôles automatisés et déploiement GitHub Pages reproductible.

Les sauvegardes JSON restent compatibles avec les anciennes versions. Leur nouveau format indique aussi si des changements locaux attendaient encore leur synchronisation au moment de l’export.

[Historique des versions](CHANGELOG.md) · [Mise à jour et déploiement](DEPLOYMENT.md) · [Vérifications](tests/README.md)

Depuis la **3.4.6**, les versions 4.x ne demandent aucun nouveau SQL. Les 4.1 et 4.2 demandent de redéployer `igdb-proxy` (bannière puis notes des jeux, optionnel). La migration de la base locale IndexedDB est automatique sur chaque appareil.

---

*Un projet personnel, qui évolue au fil de mes usages. Garder l’essentiel, lui donner une place, et prendre plaisir à le retrouver.*
