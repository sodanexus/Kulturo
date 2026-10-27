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
