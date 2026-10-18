// Seul le lien explicite version_parent autorise un repli vers le jeu de base.
export function igdbMediaData(game) {
  const parent = game?.version_parent_details;
  const valid = (item, key) => Number(item?.[key]) > 0 && Number(item?.[key]) <= 100 &&
    (item?.[`${key}_count`] == null || Number(item[`${key}_count`]) > 0);
  const choose = key => valid(game, key) ? game : valid(parent, key) ? parent : null;
  const players = choose('rating'), critics = choose('aggregated_rating');
  const screenshots = game?.screenshots?.length ? game.screenshots : parent?.screenshots || [];
  return {
    screenshots,
    players: players ? { value: players.rating, votes: players.rating_count, fromParent: players === parent } : null,
    critics: critics ? { value: critics.aggregated_rating, votes: critics.aggregated_rating_count, fromParent: critics === parent } : null,
  };
}
