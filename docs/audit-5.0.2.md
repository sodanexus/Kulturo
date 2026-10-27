# Audit Kulturo 5.0.2

27 octobre 2026. Base : archive 5.0.1 fournie par l’utilisateur. Corrections ciblées, sans changement de données, de dépendances, de fonctions Supabase ni de direction visuelle.

## Corrections

- Les demandes de profils et catalogues créateurs TMDb, Hardcover, Open Library et IGDB transmettent un signal d’annulation. La fermeture ou le remplacement du panneau annule aussi l’enrichissement de sa présentation ; une annulation ne déclenche pas de requête de secours.
- Une requête déjà annulée ne peut plus retourner immédiatement une valeur du cache. Cela évite de poursuivre un enchaînement devenu inutile.
- Le minuteur d’un ancien panneau créateur ne déverrouille plus la fiche ni ne restaure le focus lorsqu’un nouveau panneau est ouvert entre-temps.
- Un logo WebM déjà chargé est arrêté et libère sa source quand sa session de fiche est annulée.
- Les réponses tardives ne remplacent pas le contenu d’un panneau fermé ou remplacé.

## Cohérence et nettoyage

Les durées, fondus, redimensionnements et styles existants sont conservés. Les protections de survol pendant le scroll desktop et le chargement progressif de la bibliothèque restent en place. Le travail porte sur le cycle de vie des éléments, sans prétendre à un gain de FPS mesuré.

Aucun module de `features/` sans référence littérale n’a été identifié dans les sources et outils examinés. Ce contrôle ne constitue pas une preuve exhaustive d’absence de code mort. Les compatibilités des anciennes données sont conservées. Un commentaire obsolète sur les fournisseurs a été corrigé ; le README décrit maintenant les profils créateurs et les logos WebM. Audit précédent : [audit 4.9.11](docs/audit-4.9.11.md).

## Validation

- 308 tests Node : suite existante et régressions sur le cache annulé, la fermeture concurrente et l’arrêt des logos WebM.
- Un test de cache figé sur 5.0.1 lit maintenant `VERSION` : il contrôle la cohérence sans bloquer chaque nouvelle publication.
- Le script de livraison exécute les fichiers de tests successivement pour limiter les processus simultanés sur les petits runners.
- Contrôle de syntaxe JavaScript et cohérence des fichiers de version via le script de livraison.
- Build Vite et préparation des ressources de distribution.
- Contrats TypeScript vérifiés avec le compilateur JavaScript 5.9.3 disponible pour l’audit. Le compilateur natif 7.0.2 verrouillé dans le projet ne démarre pas dans cet environnement sans `/proc/self/exe` ; la validation avec cette version reste à confirmer dans GitHub Actions. Les dépendances du projet n’ont pas été remplacées.

## Limites et vérifications manuelles restantes

Pas de validation visuelle dans un navigateur réel : le navigateur local n’a pas pu démarrer. Pas de mesure de performance sur appareil, ni de vérification des services de production avec les comptes utilisateur. Vérifier sur mobile et desktop : ouverture/fermeture rapide de créateurs, aller-retour fiche → modifier → annuler, logo WebM, navigation avec retour navigateur et grand scroll de bibliothèque. Les tests automatisés ne garantissent pas l’absence de tout bug.

## Installation

Utiliser l’archive complète 5.0.2 en conservant sa configuration. Aucun SQL à exécuter ni Edge Function à redéployer depuis la version 5.0.1 fournie.
