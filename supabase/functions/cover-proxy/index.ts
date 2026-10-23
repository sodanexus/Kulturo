// Jaquettes lisibles par le navigateur (couleur d'accent des fiches).
// Certains hébergeurs d'images (Hardcover…) n'envoient pas d'en-tête CORS : le
// navigateur affiche l'image mais refuse d'en lire les pixels. Cette fonction
// la récupère côté serveur et la renvoie avec les bons en-têtes.
// Aucun secret requis. Seuls quelques hébergeurs de jaquettes sont acceptés :
// ce n'est pas un proxy ouvert.
const CORS = {
  "Access-Control-Allow-Origin":  "https://sodanexus.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const ALLOWED_HOSTS = [
  /^(?:[a-z0-9-]+\.)*hardcover\.app$/i,
  /^covers\.openlibrary\.org$/i,
  /^(?:[a-z0-9-]+\.)*archive\.org$/i,
  /^books\.google\.com$/i,
  /^books\.googleusercontent\.com$/i,
];
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function allowedCoverUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    return ALLOWED_HOSTS.some(pattern => pattern.test(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}

// Suit les redirections à la main : chaque étape doit rester sur un hébergeur autorisé.
async function fetchCover(start: URL): Promise<Response> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "image/*", "User-Agent": "Kulturo-cover-proxy" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = allowedCoverUrl(new URL(response.headers.get("location") || "", url).href);
      if (!next) throw new Error("Redirection non autorisée");
      url = next;
      continue;
    }
    return response;
  }
  throw new Error("Trop de redirections");
}

async function readLimited(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) throw new Error("Image trop volumineuse");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Réponse vide");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Image trop volumineuse"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const url = allowedCoverUrl(body?.url);
    if (!url) return jsonResponse({ error: "Jaquette non autorisée" }, 400);

    const upstream = await fetchCover(url);
    if (!upstream.ok) return jsonResponse({ error: `Hébergeur d'image HTTP ${upstream.status}` }, 502);
    const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(?:jpeg|png|webp|gif|avif)$/.test(type)) return jsonResponse({ error: "Format d'image non pris en charge" }, 415);

    const bytes = await readLimited(upstream);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.warn("[cover-proxy]", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Jaquette momentanément indisponible" }, 502);
  }
});
