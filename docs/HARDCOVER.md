# Hardcover — installation 4.5.0

1. Exécuter `migrations/4.5.0-hardcover.sql` dans l’éditeur SQL Supabase, avant le nouveau site. Sur une installation neuve, utiliser schema.sql. Conserver les migrations antérieures nécessaires.
2. Créer un compte Hardcover et récupérer son jeton dans https://hardcover.app/account/api . Ne pas le mettre dans config.js, GitHub ou un message.
3. Dans Supabase → Edge Functions → Secrets, créer `HARDCOVER_TOKEN` avec ce jeton. `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont les variables natives du projet.
4. Déployer depuis la racine du projet : `supabase functions deploy hardcover-proxy`. La fonction importe aussi features/hardcover.js : utiliser le CLI pour inclure ce module. Garder la vérification JWT activée ; le proxy vérifie en plus la session utilisateur avec Supabase Auth.
5. Publier le site complet et tester en étant connecté. Les autres fonctions (groq-proxy et google-books-proxy pour les parutions BnF) sont conservées.

Le domaine CORS par défaut est https://sodanexus.github.io. Si le domaine change, définir APP_ORIGIN avec son origine exacte.

## Fonctionnement

Hardcover est prioritaire ; Open Library prend automatiquement le relais si le service échoue ou ne retourne rien. Le bouton « Chercher aussi dans Open Library » force cette source pour la requête courante, dans l’ajout comme dans Modifier. Un résultat Hardcover conserve source_api=hardcover et external_id=œuvre:édition. Une édition française non audio est préférée parmi les 5 éditions populaires reçues ; ce n’est pas une garantie de couverture française exhaustive. Une recherche ISBN cible exactement l’édition.

Les anciennes fiches restent liées à Open Library. Leur synopsis manquant peut être enrichi par Hardcover après une correspondance ISBN, ou titre ET auteur exacts. Aucune migration massive des données ni remplacement des saisies personnelles. Les notes externes des livres restent masquées.

Les données d’édition (pages, ISBN, éditeur) viennent de la même édition. Les résultats Hardcover sont mémorisés dix minutes, les détails/traductions sont préchargés à la sélection, et l’enrichissement utilise les emplacements et animations existants. Google Books n’est plus appelé pour enrichir les fiches ; les parutions BnF ne changent pas.

## Validation à faire après configuration

Rechercher un titre français, Nijigahara Holograph et un ISBN connu ; vérifier la source dans les requêtes réseau (hardcover-proxy retourne 200 et items non vide). Le secours peut masquer un problème de configuration : une recherche réussie seule ne prouve pas que Hardcover fonctionne. Ajouter un livre, ouvrir/annuler Modifier, vérifier sa progression puis exporter/importer une sauvegarde. Vérifier aussi une ancienne fiche Open Library et le bouton de secours.

Les tests locaux utilisent des données simulées. Aucun appel authentifié à Hardcover ni déploiement n’a été effectué lors de la préparation. Vérifier le schéma GraphQL réel avec votre compte lors de l’activation ; l’API est en bêta. Les quotas du service et du compte Supabase restent applicables.
