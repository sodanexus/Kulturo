// Bannière des fiches livre : une photo de bibliothèque, la même pour tous les
// livres, puisque les API de livres ne fournissent pas de bannière. Le fichier
// est à la racine du projet (fond-biblio.jpg), donc embarqué dans l'application
// et disponible hors ligne. Pour la changer, remplacer ce fichier (ou modifier
// BOOK_BANNER_URL).
const BOOK_BANNER_URL = "fond-biblio.jpg";

// Bannière à afficher pour une fiche : celle d'un livre est toujours la photo de
// bibliothèque ; les films et les jeux gardent leur propre bannière.
function detailBackdropUrl(entry) {
  return entry?.media_type === "book" ? BOOK_BANNER_URL : entry?.backdrop_url;
}

export { BOOK_BANNER_URL, detailBackdropUrl };
