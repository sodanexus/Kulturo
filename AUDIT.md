# Vérification Kulturo 5.0.3

Base : 5.0.2 auditée. Ajout ciblé d’un cache persistant TMDb/IGDB, sans modification visuelle, de données personnelles ou des fonctions Supabase.

## Comportement

Base IndexedDB séparée `kulturo-catalogue-cache-v1`. Seules les réponses publiques explicitement sélectionnées dans les adaptateurs sont enregistrées. Les clés persistées sont des identités de catalogue : aucun en-tête d’authentification ou clé API TMDb enregistré.

Réponse valide : lecture locale. Réponse expirée : dernière donnée disponible immédiatement, actualisation silencieuse et dédupliquée par clé. La nouvelle réponse sert à une prochaine ouverture, sans mutation de la fiche pendant la lecture. Les fermetures annulent les requêtes liées à leur session. Le bouton de rafraîchissement explicite garde priorité sur le cache.

Durées et plafonds détaillés dans le README. Les notes et captures IGDB étant renvoyées dans la même réponse, celle-ci utilise une durée de 24 h. Aucun changement du cache local existant des logos de jeux.

## Points corrigés pendant l’intégration

- Distinction entre réparation automatique et rafraîchissement explicite : les ouvertures automatiques ne contournent plus inutilement le cache persistant.
- Relecture des enrichissements à la réouverture afin de récupérer une actualisation terminée, au lieu de rester bloqué sur le drapeau `_detailsFetched` ou un ancien préchargement.
- Retour au réseau si IndexedDB est refusé, bloqué ou trop lent ; échec de stockage non bloquant.
- Pas de persistance des erreurs, résultats vides, réponses trop volumineuses ou résultats reçus après annulation.
- Le module fait partie des ressources du service worker ; versions synchronisées.

## Validation

313 tests Node, build Vite, contrôle de syntaxe et de version. Vérification complémentaire avec une simulation IndexedDB : persistance entre deux clients réseau, éviction à 200 réponses et rafraîchissement explicite. Tests de péremption, panne API, stockage refusé, réponse isolée des modifications personnelles et annulation pendant la lecture du cache.

Contrats TypeScript vérifiés avec le compilateur JavaScript 5.9.3 de l’environnement. Le compilateur natif 7.0.2 du projet reste à valider dans GitHub Actions (environnement local sans `/proc/self/exe`). Aucun changement des dépendances du projet.

Pas de mesure sur appareil ni d’appel aux services de production. Le rendu Safari/PWA et les gains de temps réels restent à vérifier sur appareil. Les tests ne garantissent pas l’absence de tout bug.

## Installation

Archive complète 5.0.3. Aucun SQL ni redéploiement Supabase requis depuis 5.0.2. Conserver sa configuration. Les nouvelles optimisations ne changent ni les durées d’animation, ni le design.

## Correctif 5.0.4 — 28 octobre 2026

Les initiales de secours des créateurs et organisations sont masquées dès que leur image est chargée, y compris avec un logo transparent. Elles restent présentes si le chargement échoue ; le fond du logo est réinitialisé en cas d’erreur. Le fondu du logo est conservé. Aucun changement des API ou du cache catalogue.

## 5.1.0 — « Mon mot »

Un petit commentaire privé par œuvre, affiché dans la fiche juste après le synopsis. Aucun SQL, aucune fonction Supabase à redéployer : il réutilise la colonne `notes`, déjà présente, sauvegardée, restaurée et synchronisée hors ligne.

- **Affichage** : bloc « Mon mot » (texte doux en italique, entre guillemets) ou, s’il est vide, bouton discret « + Ajouter un mot ».
- **Édition dans la fiche** : champ de 500 caractères maximum, compteur, « Enregistrer » / « Annuler », Échap pour annuler, Ctrl/Cmd+Entrée pour enregistrer. Enregistrer un champ vide supprime le mot. Le champ est écrit à 16 px (pas de zoom automatique sur iOS) et se recadre au-dessus de la barre d’actions.
- **Emplacement stable** : le bloc a son propre emplacement entre le synopsis et les informations ; l’enrichissement (synopsis, casting, notes externes) ne remplace que le contenu des deux autres emplacements, donc un texte en cours de saisie n’est jamais remplacé.
- **Enregistrement** : même mécanisme que les autres modifications (`Media.update`), donc fonctionnel hors connexion. En cas d’erreur, le texte et le champ sont conservés.
- **Confidentialité** : visible du propriétaire uniquement. Absent des fiches partagées (lecture seule), des aperçus et des sagas. Les fonctions d’activité communautaire n’exposent toujours pas `notes` (test ajouté).
- Enregistrer un mot ne crée aucun événement de Journal (les déclencheurs ne réagissent qu’au statut, aux dates et à la note).
- Le formulaire *Modifier* conserve le mot existant sans l’afficher.

Validation : 317 tests Node (dont 4 nouveaux), contrôle de syntaxe et de version. Vérification dans un navigateur avec la vraie fiche : ajout, modification, annulation, vidage, erreur d’enregistrement, Échap, absence du bloc en lecture seule et en aperçu. Pas de mesure sur iPhone ni de test avec Supabase en production.

## Correctif 5.1.1 — « Mon mot » après le synopsis

Le bloc « Mon mot » passe juste après le synopsis (avant les repères, crédits et casting). Texte en italique, sans la barre verticale. Un test vérifie l’ordre synopsis → mon mot → informations ; la vérification dans un navigateur confirme qu’une mise à jour d’enrichissement pendant la saisie ne remplace ni le champ, ni le texte, ni le focus. Aucun SQL ni redéploiement Supabase.
