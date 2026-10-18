// Détection légère du français, sans appel réseau. Un accent isolé ne suffit
// pas (« Arié », « café » dans un synopsis anglais) : on compare les petits
// mots français et anglais, et l'accent ne sert que d'appoint.
const FRENCH_WORDS = new Set(["le", "la", "les", "un", "une", "des", "du", "de", "dans", "avec", "pour", "qui", "que",
  "est", "sont", "sur", "aux", "et", "ce", "cette", "ses", "mais", "où", "il", "elle", "ils", "au", "par", "pas", "plus"]);
const ENGLISH_WORDS = new Set(["the", "and", "of", "to", "in", "is", "are", "was", "were", "with", "for", "that", "his",
  "her", "their", "by", "from", "as", "at", "it", "this", "who", "he", "she", "they", "an", "be", "has", "have", "when"]);
const ACCENTS = /[àâçéèêëîïôùûüÿœ]/gi;

export function isLikelyFrench(text) {
  const words = String(text || "").toLocaleLowerCase("fr-FR").match(/[a-zàâçéèêëîïôùûüÿœ']+/g) || [];
  let french = 0;
  let english = 0;
  for (const word of words) {
    if (FRENCH_WORDS.has(word)) french++;
    if (ENGLISH_WORDS.has(word)) english++;
  }
  const accents = String(text || "").match(ACCENTS)?.length || 0;
  if (french >= 3 && french > english) return true;
  // Texte court : un mot français ou deux accents, sans aucun mot anglais.
  return english === 0 && (french >= 1 || accents >= 2) && (accents >= 1 || french >= 2);
}
