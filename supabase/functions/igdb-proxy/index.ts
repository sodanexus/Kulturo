const CORS = {
  "Access-Control-Allow-Origin":  "https://sodanexus.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function translateWithGroq(text: string, groqKey: string): Promise<string> {
  if (!text || !groqKey) return text;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Traduis ce texte en français de façon naturelle. Réponds UNIQUEMENT avec la traduction, sans guillemets ni explication :\n\n${text}`,
        }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text; // fallback anglais si Groq échoue
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const { query } = await req.json();
    if (!query) return new Response(JSON.stringify({ error: "query requis" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });

    const clientId     = Deno.env.get("IGDB_CLIENT_ID")!;
    const clientSecret = Deno.env.get("IGDB_CLIENT_SECRET")!;
    const groqKey      = Deno.env.get("GROQ_API_KEY") || "";

    // Token Twitch
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST" }
    );
    const { access_token } = await tokenRes.json();

    // Appel IGDB
    const igdbRes = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID":     clientId,
        "Authorization": `Bearer ${access_token}`,
        "Content-Type":  "text/plain",
      },
      body: `search "${query}"; fields name,cover.image_id,summary,first_release_date,genres.name,involved_companies.company.name,involved_companies.developer,platforms.name; limit 6;`,
    });

    const games = await igdbRes.json();

    // Traduction des descriptions en parallèle via Groq
    const translated = await Promise.all(
      (games || []).map(async (g: any) => {
        const summary = g.summary
          ? await translateWithGroq(g.summary, groqKey)
          : null;
        return { ...g, summary };
      })
    );

    return new Response(JSON.stringify(translated), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
