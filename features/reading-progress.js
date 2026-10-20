// Progression personnelle ; les catalogues ne doivent jamais la modifier.
export function parseReadingProgress(currentValue, totalValue) {
  const parse = (value, label, minimum) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) throw new Error(`${label} doit être un nombre entier.`);
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < minimum || number > 2_147_483_647) {
      throw new Error(`${label} n’est pas valide.`);
    }
    return number;
  };
  const current_page = parse(currentValue, 'La page actuelle', 0);
  const page_count = parse(totalValue, 'Le nombre de pages', 1);
  if (current_page != null && page_count != null && current_page > page_count) {
    throw new Error('La page actuelle ne peut pas dépasser le nombre de pages.');
  }
  return { current_page, page_count };
}
export function readingProgress(entry) {
  const current = Number.isInteger(entry?.current_page) && entry.current_page >= 0 ? entry.current_page : null;
  const total = Number.isInteger(entry?.page_count) && entry.page_count > 0 ? entry.page_count : null;
  return { current, total, percent: current != null && total ? Math.min(100, Math.round(current / total * 100)) : null };
}

// Séries : saison et épisode en cours, sans total d'épisodes (TMDb ne donne que
// le nombre total de saisons). Les deux champs sont facultatifs, mais un épisode
// n'a de sens qu'avec sa saison.
export function parseSeriesProgress(seasonValue, episodeValue) {
  const parse = (value, label, maximum) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) throw new Error(`${label} doit être un nombre entier.`);
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`${label} n’est pas valide.`);
    return number;
  };
  const current_season = parse(seasonValue, 'La saison', 999);
  const current_episode = parse(episodeValue, 'L’épisode', 99_999);
  if (current_episode != null && current_season == null) throw new Error('Indiquez aussi la saison de l’épisode.');
  return { current_season, current_episode };
}
export function seriesProgress(entry) {
  const season = Number.isInteger(entry?.current_season) && entry.current_season >= 1 ? entry.current_season : null;
  const episode = Number.isInteger(entry?.current_episode) && entry.current_episode >= 1 ? entry.current_episode : null;
  const seasons = Number.isInteger(entry?.seasons_count) && entry.seasons_count > 0 ? entry.seasons_count : null;
  // La jauge indique la saison atteinte : sans total d'épisodes par saison, on
  // ne prétend pas mesurer l'avancement à l'intérieur d'une saison.
  const percent = season != null && seasons ? Math.min(100, Math.round(season / seasons * 100)) : null;
  return { season, episode, seasons, percent };
}
export function isSeries(entry) {
  return entry?.media_type === 'movie' && entry.subtype === 'tv';
}
