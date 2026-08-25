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

async function googleBooksRequest(
  params: Record<string, string>,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({
    ...params,
    key: apiKey,
  });
  const url = `https://www.googleapis.com/books/v1/volumes?${query.toString()}`;
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 350 * (2 ** attempt)));
      continue;
    }
    if (response.ok) return await response.json();

    let detail = "";
    try {
      const data = await response.json();
      detail = String(data?.error?.message || "").slice(0, 180);
    } catch {}
    if (!retryableStatuses.has(response.status) || attempt === 2) {
      throw new Error(`Google Books HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
    }
    await new Promise(resolve => setTimeout(resolve, 350 * (2 ** attempt)));
  }

  throw new Error("Google Books indisponible");
}

async function fetchUpcoming(apiKey: string): Promise<unknown[]> {
  const queries = [
    "subject:fiction",
    "subject:comics",
    "subject:juvenile",
    "subject:biography",
    "subject:history",
    "subject:science",
    "subject:self-help",
  ];
  const items: unknown[] = [];
  const errors: unknown[] = [];
  let successfulRequests = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < queries.length) {
      const q = queries[cursor++];
      try {
        const page = await googleBooksRequest({
          q,
          orderBy: "newest",
          printType: "books",
          projection: "full",
          langRestrict: "fr",
          showPreorders: "true",
          maxResults: "40",
        }, apiKey);
        successfulRequests += 1;
        if (Array.isArray(page?.items)) items.push(...page.items);
      } catch (error) {
        errors.push(error);
      }
    }
  };

  // Deux requêtes à la fois maximum : Google Books renvoie parfois 503 lors
  // d'une rafale, surtout juste après la création ou la rotation d'une clé.
  await Promise.all([worker(), worker()]);
  if (!successfulRequests) {
    throw errors[0] instanceof Error ? errors[0] : new Error("Google Books indisponible");
  }
  return items;
}

async function fetchDetails(
  apiKey: string,
  title: string,
  author: string,
  isbn: string,
): Promise<unknown[]> {
  const q = isbn
    ? `isbn:${isbn}`
    : [`intitle:"${title}"`, author ? `inauthor:"${author}"` : ""].filter(Boolean).join(" ");
  const request = (langRestrict = "") => googleBooksRequest({
    q,
    maxResults: "10",
    printType: "books",
    projection: "full",
    ...(langRestrict ? { langRestrict } : {}),
  }, apiKey);

  const french = await request("fr");
  const frenchItems = Array.isArray(french?.items) ? french.items : [];
  if (frenchItems.some((item: any) => item?.volumeInfo?.description)) return frenchItems;

  const allLanguages = await request();
  const fallbackItems = Array.isArray(allLanguages?.items) ? allLanguages.items : [];
  return fallbackItems.length ? fallbackItems : frenchItems;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY") || "";
    if (!apiKey) return jsonResponse({ error: "Secret GOOGLE_BOOKS_API_KEY absent" }, 503);

    const body = await req.json();
    const action = body?.action === "upcoming" || body?.action === "details"
      ? body.action
      : "";
    if (!action) return jsonResponse({ error: "Action invalide" }, 400);

    if (action === "upcoming") {
      return jsonResponse({ items: await fetchUpcoming(apiKey) });
    }

    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const author = typeof body?.author === "string" ? body.author.trim().slice(0, 160) : "";
    const isbn = typeof body?.isbn === "string"
      ? body.isbn.replace(/[^0-9Xx]/g, "").slice(0, 13)
      : "";
    if (!title && !isbn) return jsonResponse({ error: "Titre ou ISBN requis" }, 400);
    return jsonResponse({ items: await fetchDetails(apiKey, title, author, isbn) });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || "Erreur Google Books" }, 502);
  }
});
