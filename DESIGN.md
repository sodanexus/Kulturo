# Kulturo 4.1.0 — Édition

## Direction

Une collection privée : fond encre légèrement végétal, ivoire, accent cuivre,
Manrope pour les contrôles, Archivo pour les grands titres, serif pour les mots
éditoriaux. Les œuvres gardent le premier rôle. Les trois cercles de la marque
inspirent le motif de connexion et les en-têtes secondaires.

## Périmètre livré

- Bibliothèque : en-tête éditorial, affiches, titres et type/année visibles,
  étagère À reprendre plus légère, densités standard et compacte.
- Sorties : titres et dates visibles, grandes séparations mensuelles,
  ajout aux envies conservé.
- Journal : hiérarchie de mois, lignes plus légères, récapitulatifs contrastés.
- Profil : grandes statistiques, titres éditoriaux et présentation des favoris.
- Connexion : composition en deux panneaux sur bureau et version compacte mobile.
- Fiches : format agrandi, couverture 2:3, titres plus expressifs, bouton de
  fermeture visible au clavier comme au toucher, cœur directement actionnable.
- Navigation : noms sur bureau, rail sur tablette et barre flottante mobile.
- Polices variables locales (latin et latin étendu), licences dans `fonts/`.
  Aucun chargement Google Fonts nécessaire.

## Mouvement

Les paramètres communs sont dans `styles/design-system-v4.css` :
pression 110 ms, retour 180 ms, contenu 260 ms, mise en page 320 ms.
La transition couverture/fiche prend 360 ms ; la fermeture restitue la jaquette.
Les cartes conservées se déplacent après un tri sans être recréées. La charge
est bornée et les cartes hors écran ne sont pas animées. Les réglages système
`prefers-reduced-motion` sont respectés. Aucun défilement forcé ni curseur custom.

## Explorer sans compte

Ouvrir `design/Kulturo-apercu.html` dans un navigateur. Ce fichier contient le
vrai code d’interface, les polices et un catalogue **entièrement fictif** avec
des couvertures géométriques. Les changements restent dans l’aperçu ; aucune
connexion à Supabase ni aux catalogues. L’aperçu emploie un espace de stockage
séparé et ne contient pas les clés de configuration du projet.

Pour voir la connexion, se déconnecter depuis Profil → Compte, ou ouvrir
l’aperçu avec `?connexion=1` s’il est servi par un serveur. Dans la démo, les
identifiants saisis ne sont ni transmis ni vérifiés.

Pour régénérer l’aperçu : `npm ci`, puis `npm run preview:design`.
Le build de production reste `npm run build` ; il n’inclut pas les doubles.
L’aperçu est un outil de revue du design, pas un export de données personnelles.

## Installation

Remplacer les fichiers du dépôt par cette archive, conserver la configuration
publique correspondant à votre propre environnement, puis suivre DEPLOYMENT.md.
Aucune migration SQL ni nouvelle fonction Supabase. Le cache PWA passe à 4.1.0.

## Vérifications et limites

Les contrôles exacts exécutés sont consignés dans `tests/README.md`.
Un DOM simulé vérifie le comportement, pas les pixels ni les performances GPU.
Le navigateur distant n’accède pas au serveur local ; Chromium installé ne
peut pas démarrer dans cet environnement. Les captures et les gestes sur un
vrai écran n’ont donc pas été validés ici. À vérifier avant publication :

- 320, 390, 768 et 1440 pixels ; zoom texte et titres très longs ;
- fiches depuis Bibliothèque, Sorties, Journal et Profil ; fermeture et retour ;
- clavier, lecteur d’écran, réduction des mouvements ;
- Safari/iPhone/iPad : gestes, clavier logiciel, PWA installée ;
- réseau lent, caches d’images, mise à jour PWA et collection volumineuse.

Cette version propose une direction ambitieuse. Une candidature à un prix de
web design demande encore une revue visuelle réelle et un contrôle de fluidité
sur les appareils ciblés ; elle ne constitue pas une certification de qualité.
