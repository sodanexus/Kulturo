const CORS = {
  "Access-Control-Allow-Origin":  "https://sodanexus.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function getIGDBToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!tokenRes.ok) throw new Error("Authentification IGDB impossible");
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error("Jeton IGDB manquant");
  return access_token;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeIgdbSearch(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

const IGDB_FIELDS = "name,cover.image_id,summary,first_release_date,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,platforms.name";
// Seule la fiche détaillée demande les captures d'écran (bannière animée) et
// les notes (joueurs / presse) :
// la recherche et les sorties gardent la même réponse, légère.
const IGDB_DETAIL_FIELDS = `${IGDB_FIELDS},screenshots.image_id,rating,rating_count,aggregated_rating,aggregated_rating_count,version_parent`;

async function igdbRequest(endpoint: string, query: string, headers: Record<string, string>): Promise<any[]> {
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers,
    body: query,
  });
  if (!response.ok) throw new Error(`IGDB ${endpoint} HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`Réponse IGDB ${endpoint} invalide`);
  return data;
}

function normalizeIgdbLabel(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function fetchUpcomingGames(headers: Record<string, string>): Promise<any[]> {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 183);
  const startUnix = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const endUnix = Math.floor(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59) / 1000);
  const sharedFields = [
    "date",
    "date_format.format",
    "platform.name",
    "game.id",
    "game.name",
    "game.cover.image_id",
    "game.genres.name",
    "game.involved_companies.company.name",
    "game.involved_companies.developer",
    "game.involved_companies.publisher",
    "game.game_type.type",
    "game.hypes",
    "game.version_parent",
  ].join(",");
  const dateWhere = `date >= ${startUnix} & date <= ${endUnix}`;
  const fetchPages = async (fields: string, where: string): Promise<any[]> => {
    const page = (offset: number) => igdbRequest(
      "release_dates",
      `fields ${fields}; where ${where}; sort date asc; limit 500; offset ${offset};`,
      headers,
    );
    const first = await page(0);
    if (first.length < 500) return first;
    // IGDB limite les appels rapprochés. La seconde page n'est demandée que
    // lorsqu'elle peut réellement contenir des résultats supplémentaires.
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...first, ...await page(500)];
  };

  // IGDB fait migrer l'ancien enum `region` vers la relation
  // `release_region`. Pendant la transition, certaines dates n'existent que
  // dans l'un des deux formats. On privilégie le nouveau modèle, puis on
  // retombe sur Europe=1 / Worldwide=8 uniquement s'il ne renvoie rien.
  // Les champs sont séparés afin que la suppression future de `region` ne
  // puisse pas casser la requête moderne.
  let releases: any[] = [];
  try {
    const regions = await igdbRequest(
      "release_date_regions",
      "fields id,region; limit 100;",
      headers,
    );
    const acceptedRegionIds = regions
      .filter(region => ["europe", "worldwide", "monde"].includes(normalizeIgdbLabel(region.region)))
      .map(region => Number(region.id))
      .filter(Number.isSafeInteger);
    if (acceptedRegionIds.length) {
      releases = await fetchPages(
        `${sharedFields},release_region.region`,
        `${dateWhere} & release_region = (${acceptedRegionIds.join(",")})`,
      );
    }
  } catch (error) {
    console.warn("[IGDB] Nouveau filtre régional indisponible, essai du format historique", error);
  }

  if (!releases.length) {
    releases = await fetchPages(
      `${sharedFields},region`,
      `${dateWhere} & region = (1,8)`,
    );
  }
  const allowedTypes = new Set([
    "main game",
    "remake",
    "remaster",
    "expanded game",
    "standalone expansion",
  ]);
  const grouped = new Map<number, any>();

  for (const release of releases) {
    const game = release?.game;
    const gameId = Number(game?.id);
    const timestamp = Number(release?.date);
    if (!Number.isSafeInteger(gameId) || !game?.name || !Number.isFinite(timestamp)) continue;
    if (game.version_parent) continue;
    const dateFormat = normalizeIgdbLabel(release.date_format?.format).replaceAll(" ", "");
    if (dateFormat && !["yyyymmmmdd", "yyyymmmm"].includes(dateFormat)) continue;
    const datePrecision = dateFormat === "yyyymmmm" ? "month" : "day";
    const gameType = normalizeIgdbLabel(game.game_type?.type);
    if (gameType && !allowedTypes.has(gameType)) continue;

    const modernRegion = normalizeIgdbLabel(release.release_region?.region);
    const legacyRegion = Number(release.region);
    const regionLabel = modernRegion === "europe" || legacyRegion === 1
      ? "Europe"
      : "Worldwide";
    const existing = grouped.get(gameId);
    if (!existing || timestamp < existing.release_timestamp) {
      grouped.set(gameId, {
        ...game,
        release_timestamp: timestamp,
        release_date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        date_precision: datePrecision,
        release_region: regionLabel,
        platforms: release.platform?.name ? [{ name: release.platform.name }] : [],
      });
      continue;
    }
    if (timestamp === existing.release_timestamp && release.platform?.name) {
      const names = new Set((existing.platforms || []).map((item: any) => item.name));
      if (!names.has(release.platform.name)) existing.platforms.push({ name: release.platform.name });
    }
    if (timestamp === existing.release_timestamp && datePrecision === "day") existing.date_precision = "day";
    if (regionLabel === "Europe") existing.release_region = "Europe";
  }

  // Certains jours, les deux index régionaux IGDB répondent correctement mais
  // sans aucune ligne, alors que les jeux possèdent bien une
  // `first_release_date` (GTA VI en est un exemple actuel). Ce troisième filet
  // évite un onglet vide : il ne prétend pas connaître une date française et
  // présente explicitement la date comme internationale.
  if (!grouped.size) {
    const fields = [
      "id",
      "name",
      "cover.image_id",
      "genres.name",
      "involved_companies.company.name",
      "involved_companies.developer",
      "involved_companies.publisher",
      "platforms.name",
      "game_type.type",
      "hypes",
      "version_parent",
      "first_release_date",
    ].join(",");
    const games = await igdbRequest(
      "games",
      `fields ${fields}; where first_release_date >= ${startUnix} & first_release_date <= ${endUnix}; sort first_release_date asc; limit 500;`,
      headers,
    );

    for (const game of games) {
      const gameId = Number(game?.id);
      const timestamp = Number(game?.first_release_date);
      if (!Number.isSafeInteger(gameId) || !game?.name || !Number.isFinite(timestamp)) continue;
      if (game.version_parent) continue;
      const gameType = normalizeIgdbLabel(game.game_type?.type);
      if (gameType && !allowedTypes.has(gameType)) continue;
      grouped.set(gameId, {
        ...game,
        release_timestamp: timestamp,
        release_date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        date_precision: "day",
        release_region: "International",
        platforms: Array.isArray(game.platforms) ? game.platforms : [],
      });
    }
  }

  // Éviter que des centaines de micro-sorties noient les jeux attendus : on
  // conserve les plus suivis de chaque mois, tout en gardant la chronologie.
  const byMonth = new Map<string, any[]>();
  for (const game of grouped.values()) {
    const month = game.release_date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(game);
  }
  return [...byMonth.values()]
    .flatMap(games => games
      .sort((a, b) => Number(b.hypes || 0) - Number(a.hypes || 0) || Number(Boolean(b.cover)) - Number(Boolean(a.cover)))
      .slice(0, 30))
    .sort((a, b) => a.release_date.localeCompare(b.release_date) || Number(b.hypes || 0) - Number(a.hypes || 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const id = Number(body?.id);
    const hasValidId = Number.isSafeInteger(id) && id > 0;
    const action = ["upcoming", "logos"].includes(body?.action) ? body.action : "";
    if (action === "logos" && !hasValidId) return jsonResponse({error:"Identifiant invalide"}, 400);

    if (!query && !hasValidId && !action) {
      return jsonResponse({ error: "query, id valide ou action requis" }, 400);
    }
    if (query.length > 120) {
      return jsonResponse({ error: "Recherche trop longue" }, 400);
    }

    const clientId     = Deno.env.get("IGDB_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("IGDB_CLIENT_SECRET") || "";
    if (!clientId || !clientSecret) {
      return jsonResponse({ error: "Configuration IGDB absente" }, 503);
    }

    const access_token = await getIGDBToken(clientId, clientSecret);

    const headers = {
      "Client-ID":     clientId,
      "Authorization": `Bearer ${access_token}`,
      "Content-Type":  "text/plain",
    };

    if (action === "logos") {
      // Requête séparée, sans modifier la réponse des notes et captures.
      const fields = "image_id,alpha_channel,animated,width,height,image_type.name";
      let logos: any[] = [];
      try {
        logos = await igdbRequest("logos", `fields ${fields}; where game = ${id}; limit 50;`, headers);
      } catch (error) { console.warn("[IGDB logos] Endpoint dédié indisponible", error); }
      if (!logos.some(logo => logo.image_id && logo.alpha_channel !== false && !logo.animated)) {
        // Anciennes contributions encore classées comme artworks : seulement les types logo.
        try {
          const legacy = await igdbRequest("artworks", `fields ${fields}; where game = ${id}; limit 50;`, headers);
          logos.push(...legacy.filter(image => /logo/i.test(image.image_type?.name || "")));
        } catch (error) { console.warn("[IGDB logos] Recherche artworks indisponible", error); }
      }
      console.info(`[IGDB logos] jeu=${id} candidats=${logos.length}`);
      return jsonResponse({logos});
    }

    let games: any[] = [];

    if (action === "upcoming") {
      games = await fetchUpcomingGames(headers);
    } else if (hasValidId) {
      // ── Détail par ID ──────────────────────────────────────
      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers,
        body: `fields ${IGDB_DETAIL_FIELDS}; where id = ${id}; limit 1;`,
      });
      if (!igdbRes.ok) throw new Error(`IGDB HTTP ${igdbRes.status}`);
      games = await igdbRes.json();
      const game = games[0];
      if (game) {
        // Temps de jeu IGDB (en secondes) : alimente « Temps passé » du Profil.
        // Une édition sans données retombe sur le jeu de base.
        for (const gameId of [id, Number(game.version_parent)]) {
          if (!Number.isSafeInteger(gameId) || gameId <= 0) continue;
          try {
            const [ttb] = await igdbRequest("game_time_to_beats", `fields hastily,normally,completely,count; where game_id = ${gameId}; limit 1;`, headers);
            if (ttb) { game.time_to_beat = ttb; break; }
          } catch { /* Facultatif : ne jamais casser la fiche. */ }
        }
      }
      if (game) {
        // Bande-annonce et saga : requêtes séparées et facultatives, pour qu'un
        // échec n'empêche jamais d'afficher la fiche du jeu.
        try { game.videos = await igdbRequest("game_videos", `fields name,video_id; where game = ${id}; limit 10;`, headers); } catch { /* Facultatif. */ }
        // IGDB distingue les « collections » (séries) des « franchises », et un jeu
        // peut appartenir à plusieurs des deux : on récupère tous les candidats,
        // le client retient le plus complet.
        const candidates: any[] = [];
        for (const endpoint of ["collections", "franchises"]) {
          try {
            const rows = await igdbRequest(endpoint, `fields name,games.name,games.cover.image_id,games.first_release_date,games.version_parent; where games = (${id}); limit 10;`, headers);
            candidates.push(...rows);
          } catch (error) { console.warn(`[IGDB ${endpoint}] indisponible`, error); }
        }
        console.info(`[IGDB saga] jeu=${id} candidats=${candidates.map(c => `${c.name}:${c.games?.length ?? 0}`).join(" | ") || "aucun"}`);
        if (candidates.length) game.collection_details = candidates;
      }
      const parentId = Number(game?.version_parent);
      if (Number.isSafeInteger(parentId) && parentId > 0 && parentId !== id &&
          (!game?.screenshots?.length || !game.rating || !game.aggregated_rating)) {
        // Une édition partage parfois ses médias avec le jeu de base. Ne jamais
        // utiliser parent_game : un DLC/remake doit conserver ses propres notes.
        try {
          const parents = await igdbRequest("games", `fields name,screenshots.image_id,rating,rating_count,aggregated_rating,aggregated_rating_count; where id = ${parentId}; limit 1;`, headers);
          if (parents[0]) game.version_parent_details = parents[0];
        } catch { /* Conserver les données de l'édition si le parent est indisponible. */ }
      }
    } else {
      // Ne pas dépendre uniquement du classement de l'index de recherche.
      const escaped = escapeIgdbSearch(query);
      games = await igdbRequest("games", `search "${escaped}"; fields ${IGDB_FIELDS}; limit 24;`, headers);
      const exact = (game: any) => normalizeIgdbLabel(game.name) === normalizeIgdbLabel(query);
      if (!games.some(exact)) {
        try {
          const direct = await igdbRequest("games", `fields ${IGDB_FIELDS}; where name ~ "${escaped}"; limit 12;`, headers);
          games = [...direct, ...games];
        } catch (error) {
          if (!games.length) throw error;
          console.warn("[IGDB] Recherche directe indisponible", error);
        }
      }
      const unique = new Map<number, any>();
      for (const game of games) {
        if (Number.isSafeInteger(Number(game.id)) && !unique.has(Number(game.id))) unique.set(Number(game.id), game);
      }
      games = [...unique.values()].sort((a, b) => Number(exact(b)) - Number(exact(a))).slice(0, 12);
    }

    if (!Array.isArray(games)) throw new Error("Réponse IGDB invalide");

    // La recherche n'affiche pas les résumés. Le détail conserve le texte IGDB
    // original ; la traduction passe par l'unique fonction groq-proxy, commune
    // aux jeux et aux livres.
    const normalized = hasValidId
      ? games
      : (games || []).map((g: any) => ({ ...g, summary: null }));

    return jsonResponse(normalized);

  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Erreur interne" }, 500);
  }
});
