// Logos de secours pour les jeux sans logo IGDB (SteamGridDB).
// Secret requis : STEAMGRIDDB_API_KEY. Les logos sont facultatifs : en cas
// d'erreur ou d'absence de correspondance fiable, la fonction répond { logos: [] }.
const CORS = {
  "Access-Control-Allow-Origin":  "https://sodanexus.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const API = "https://www.steamgriddb.com/api/v2";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalize(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Correspondance prudente : un mauvais logo est pire que pas de logo.
export function pickGame(title: string, games: any[]): any | null {
  const wanted = normalize(title);
  if (!wanted) return null;
  const list = (Array.isArray(games) ? games : []).filter(game => game && Number.isSafeInteger(game.id));
  const exact = list.find(game => normalize(game.name) === wanted);
  if (exact) return exact;
  const close = list.find(game => {
    const name = normalize(game.name);
    return name && (name.startsWith(`${wanted} `) || wanted.startsWith(`${name} `));
  });
  return close || null;
}

export function pickLogos(logos: any[]): any[] {
  const rank = (logo: any) => ({ official: 0, white: 1, custom: 2, black: 3 } as Record<string, number>)[String(logo.style)] ?? 4;
  return (Array.isArray(logos) ? logos : [])
    .filter(logo => logo && !logo.nsfw && !logo.humor && !logo.epilepsy
      && /^https:\/\/[a-z0-9.-]*steamgriddb\.com\//i.test(String(logo.url || ""))
      && /^image\/(png|webp)$/.test(String(logo.mime || "image/png")))
    .sort((a, b) => rank(a) - rank(b) || Number(b.score || 0) - Number(a.score || 0) || Number(b.width || 0) - Number(a.width || 0))
    .slice(0, 4)
    .map(logo => ({ url: String(logo.url), style: String(logo.style || ""), width: Number(logo.width) || 0, height: Number(logo.height) || 0 }));
}

async function api(path: string, key: string): Promise<any> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`SteamGridDB HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.success) throw new Error("Réponse SteamGridDB invalide");
  return data.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (body?.action !== "logos" || title.length < 2 || title.length > 120) {
      return jsonResponse({ error: "action logos et titre valide requis" }, 400);
    }
    const key = Deno.env.get("STEAMGRIDDB_API_KEY") || "";
    if (!key) return jsonResponse({ error: "Configuration SteamGridDB absente" }, 503);

    const games = await api(`/search/autocomplete/${encodeURIComponent(title)}`, key);
    const game = pickGame(title, games);
    if (!game) {
      console.info(`[SteamGridDB logos] aucun jeu fiable pour « ${title} » (${Array.isArray(games) ? games.length : 0} résultats)`);
      return jsonResponse({ logos: [] });
    }
    const logos = await api(`/logos/game/${game.id}?mimes=image/png,image/webp&types=static&nsfw=false&humor=false&epilepsy=false`, key);
    const picked = pickLogos(logos);
    console.info(`[SteamGridDB logos] « ${title} » → #${game.id} ${game.name} : ${picked.length} logo(s)`);
    return jsonResponse({ logos: picked });
  } catch (error) {
    console.warn("[SteamGridDB logos]", error);
    // Secours facultatif : une panne ne doit jamais casser la fiche.
    return jsonResponse({ logos: [] });
  }
});
