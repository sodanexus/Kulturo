## 4.9.3

- Logos de jeux : SteamGridDB passe en priorité, IGDB sert de secours. Mémoire locale des logos renouvelée pour appliquer le nouvel ordre. Aucun changement Supabase.

## 4.9.2

- Modifier › Détails facultatifs : champ « Logo du titre (URL) » pour les films, séries et jeux. Il remplace le logo automatique, s'affiche sans appel réseau d'API et se synchronise entre appareils.
- Migration SQL à exécuter une fois : `migrations/4.9.2-logo-url.sql` (ajoute la colonne `logo_url`). Avant la migration, tout fonctionne sauf l'enregistrement d'un logo manuel.
- Limite : la restauration d'une sauvegarde ne remet pas encore les logos manuels.

