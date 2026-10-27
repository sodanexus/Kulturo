# Audit Kulturo 4.9.11

24 octobre 2026. Base : dernière archive fournie (4.9.10), avec les correctifs de cadrage du palmarès et de largeur du Journal. Aucune donnée de production ni fonction Supabase modifiée.

## Corrections confirmées

- **Filtres desktop** : nettoyage des écouteurs et du ResizeObserver avant reconstruction de l’application ou de l’écran de connexion, même si le panneau a déjà disparu.
- **Clics rapides** : un panneau en cours de fermeture peut être remplacé immédiatement ; son ancien minuteur ne vise que l’ancien élément.
- **Accessibilité** : `aria-pressed` des statuts se met aussi à jour lors d’une réinitialisation des filtres.
- **Communauté** : le rafraîchissement des détails transmet désormais `readOnly: true`. L’historique personnel ne réapparaît plus dans le contenu partagé après l’appel API. Le parcours ne sauvegarde rien et ignore les réponses d’une session fermée.
- **Tests navigateur** : remplacement du parcours qui cherchait encore le bouton de densité Compact supprimé. Distinction entre palette desktop et panneau mobile.

## Nettoyage limité et vérifié

- Suppression du compteur DOM caché et de son recalcul dans la palette desktop. Le compteur de la bibliothèque reste présent ; l’indicateur animé des statuts reste actualisé.
- Suppression de sa règle CSS devenue inutile.
- Ajout de `dist/` et des archives de livraison aux exclusions Git.
- README et documentation des tests actualisés. L’ancien audit reste disponible dans [docs/audit-4.0.7.md](docs/audit-4.0.7.md) à titre historique.
- Aucun module `features/` sans référence littérale trouvé dans les sources et outils examinés. Aucun dossier supprimé sur simple présomption d’inutilité. Les compatibilités des anciennes données sont conservées.

## Vérification

- Suite Node complète et quatre régressions ciblées : nettoyage d’un panneau déjà retiré, fin de fermeture, lecture seule après enrichissement, réponse communautaire tardive.
- Contrôle de syntaxe JavaScript, cohérence des versions et fabrication de l’archive via le script de livraison.
- Build Vite et préparation des ressources PWA.
- Vérification des contrats TypeScript avec le compilateur JavaScript disponible localement. Le compilateur natif verrouillé dans le dépôt doit être confirmé dans GitHub Actions : cet environnement ne lui fournit pas `/proc/self/exe`.

## Limites

Les parcours navigateur ont été actualisés, mais pas exécutés ici dans un navigateur réel. Le rendu Safari, les gestes tactiles, l’installation PWA, les appels réels aux catalogues et la synchronisation multi-appareils restent à vérifier en situation réelle. Les tests simulés ne prouvent pas l’absence de tout bug. Pas de mise à jour des dépendances ni de refonte générale des styles pendant cet audit.

## Installation

Cette livraison modifie du code, les tests, la documentation et les fichiers de version. Utiliser l’archive complète en conservant sa configuration. Aucun SQL à exécuter et aucune Edge Function à redéployer.
