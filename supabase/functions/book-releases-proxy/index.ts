const CORS = {
  "Access-Control-Allow-Origin":  "https://sodanexus.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const BNF_FEEDS = [
  { url: "https://nouveautes-editeurs.bnf.fr/neRss?type=livre", genre: "" },
  { url: "https://nouveautes-editeurs.bnf.fr/neRss?type=livre&jeunesse=true", genre: "Jeunesse" },
];
const BNF_CACHE_TTL_MS = 10 * 60 * 1000;
let bnfCache: { expiresAt: number; items: Record<string, unknown>[] } = {
  expiresAt: 0,
  items: [],
};

function decodeXmlEntities(value: unknown): string {
  let decoded = String(value || "")
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .trim();
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
      if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()] || _match;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded.trim();
}

function extractRssTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXmlEntities(match?.[1] || "");
}

function cleanPeople(value: string): string {
  const unique = new Map<string, string>();
  value.split(/\s*;\s*/).map(item => item.trim()).filter(Boolean).forEach(person => {
    const key = person.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key && !unique.has(key)) unique.set(key, person);
  });
  return [...unique.values()].join(", ");
}

function parseFrenchDate(value: string): string | null {
  const match = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function franceTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDaysIso(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseBnfFeed(xml: string, defaultGenre: string): Record<string, unknown>[] {
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return blocks.flatMap(block => {
    const title = extractRssTag(block, "title").replace(/\s+/g, " ").trim();
    const link = extractRssTag(block, "link");
    const descriptionHtml = extractRssTag(block, "description");
    const lines = descriptionHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .split("\n")
      .map(line => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const readLine = (pattern: RegExp) => {
      const line = lines.find(value => pattern.test(value));
      return line ? line.replace(pattern, "").trim() : "";
    };
    const author = cleanPeople(readLine(/^Auteurs?\s*:\s*/i));
    const publisher = readLine(/^(?:É|E)diteur\s*:\s*/i);
    const releaseDate = parseFrenchDate(readLine(/^Date de parution\s*:\s*/i));
    const enclosure = block.match(/<enclosure\b[^>]*\burl="([^"]+)"/i);
    const coverUrl = decodeXmlEntities(enclosure?.[1] || "");
    const declarationId = link.match(/[?&]id_declaration=([^&]+)/i)?.[1] || "";
    if (!title || !releaseDate || !link) return [];

    const genres = defaultGenre ? [defaultGenre] : [];
    const fallbackId = encodeURIComponent(`${title}|${author}|${releaseDate}`).slice(0, 180);
    return [{
      external_id: null,
      upcoming_id: `bnf:${declarationId || fallbackId}`,
      title,
      cover_url: coverUrl || null,
      description: null,
      release_year: Number(releaseDate.slice(0, 4)),
      release_date: releaseDate,
      date_precision: "day",
      genres,
      genre: genres.join(", ") || null,
      author: author || null,
      platform: null,
      publisher: publisher || null,
      source_api: "manual",
      media_type: "book",
      subtype: null,
      upcoming_type: "book",
      availability_label: "Annonce éditeur",
      external_url: link,
      external_label: "BnF — Nouveautés Éditeurs",
      popularity: 0,
    }];
  });
}

async function fetchBnfFeed(url: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9",
          "User-Agent": "Kulturo/2.5.3 (installation personnelle)",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return await response.text();
      lastError = new Error(`BnF HTTP ${response.status}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 450));
  }
  throw lastError instanceof Error ? lastError : new Error("Flux BnF indisponible");
}

async function fetchUpcomingBooks(): Promise<Record<string, unknown>[]> {
  if (bnfCache.expiresAt > Date.now()) return bnfCache.items;

  const settled = await Promise.allSettled(BNF_FEEDS.map(feed => fetchBnfFeed(feed.url)));
  if (settled.every(result => result.status === "rejected")) {
    const firstError = settled.find(result => result.status === "rejected");
    throw firstError?.reason instanceof Error ? firstError.reason : new Error("Flux BnF indisponible");
  }

  const startDate = franceTodayIso();
  const endDate = addDaysIso(startDate, 183);
  const unique = new Map<string, Record<string, unknown>>();
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    parseBnfFeed(result.value, BNF_FEEDS[index].genre).forEach(item => {
      const releaseDate = String(item.release_date || "");
      if (releaseDate < startDate || releaseDate > endDate) return;
      const key = String(item.upcoming_id || "");
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, item);
        return;
      }
      const mergedGenres = [...new Set([
        ...(Array.isArray(existing.genres) ? existing.genres : []),
        ...(Array.isArray(item.genres) ? item.genres : []),
      ])];
      existing.genres = mergedGenres;
      existing.genre = mergedGenres.join(", ") || null;
    });
  });

  const items = [...unique.values()]
    .sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)) || String(a.title).localeCompare(String(b.title), "fr"))
    .slice(0, 40);
  bnfCache = { expiresAt: Date.now() + BNF_CACHE_TTL_MS, items };
  return items;
}

Deno.serve(async req => {
  if(req.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
  if(req.method !== 'POST') return jsonResponse({error:'Méthode invalide'},405);
  try {
    const body = await req.json();
    if(body?.action !== 'upcoming') return jsonResponse({error:'Action invalide'},400);
    return jsonResponse({items:await fetchUpcomingBooks(),source:'bnf'});
  } catch(error) {
    console.error('book-releases-proxy:',error instanceof Error ? error.message : 'Erreur inconnue');
    return jsonResponse({error:'Parutions BnF indisponibles'},502);
  }
});
