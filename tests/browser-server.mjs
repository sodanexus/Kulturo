// node tests/browser-server.mjs — http://localhost:4173/tests/browser.html
// Le serveur substitue uniquement les modules réseau et la configuration.
// L'interface, les styles et les modules fonctionnels servis sont les vrais.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessions = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const userId = "00000000-0000-4000-8000-000000000001";
const synopsis = "Un voyage inattendu conduit les personnages à découvrir un monde nouveau. Au fil de leurs rencontres, ils apprennent à se connaître et à regarder autrement leur quotidien. ".repeat(16);

function seed() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = Array.from({ length: 18 }, (_, index) => ({
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`, user_id: userId,
    title: `Œuvre de test ${String(index + 1).padStart(2, "0")}`,
    media_type: ["movie", "game", "book"][index % 3], subtype: index % 3 === 0 ? "movie" : null,
    status: index === 17 ? "playing" : "finished", rating: 6 + index % 4, is_favorite: false, repeat_count: 0,
    cover_url: `/tests/cover.svg?variant=${index}`, backdrop_url: "/tests/cover.svg",
    description: synopsis, genre: "Drame, Aventure", author: "Auteur de test", directors: "Réalisation de test",
    cast_members: "Interprète A, Interprète B", duration: 120, platform: "PC", release_year: 2024,
    external_id: String(index + 1), source_api: ["tmdb", "igdb", "openlibrary"][index % 3],
    date_started: today, date_finished: index === 17 ? null : today,
    created_at: `${today}T09:00:00Z`, updated_at: `${today}T09:00:00Z`, _detailsFetched: true,
  }));
  const events = entries.map((entry, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    media_id: entry.id, event_type: entry.status === "finished" ? "finished" : "started",
    occurred_at: entry.created_at, metadata: {},
  }));
  return { entries, events, controls: { readDelay: 30, writeDelay: 40 }, writes: 0 };
}
async function body(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text ? JSON.parse(text) : {};
}
function json(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/__test/")) {
      const [, , run, resource, id] = url.pathname.split("/");
      if (!sessions.has(run)) sessions.set(run, seed());
      const session = sessions.get(run);
      if (resource === "control") {
        if (request.method === "POST") Object.assign(session.controls, await body(request));
        return json(response, { ...session.controls, writes: session.writes });
      }
      if (request.method === "GET") {
        while (resource === "entries" && session.controls.holdEntries && !response.destroyed) await delay(25);
        if (response.destroyed) return;
        await delay(session.controls.readDelay);
        const failure = { entries: "failEntries", events: "failEvents", community: "failCommunity", upcoming: "failUpcoming" }[resource];
        if (failure && session.controls[failure] > 0) {
          session.controls[failure]--;
          return json(response, { error: "Indisponibilité simulée" }, 503);
        }
      }
      if (resource === "entries") {
        if (request.method === "PATCH") {
          const changes = await body(request);
          await delay(session.controls.writeDelay);
          if (session.controls.failWrites > 0) {
            session.controls.failWrites--;
            response.destroy(); // coupure réelle de cette requête avant écriture
            return;
          }
          const entry = session.entries.find(item => item.id === id);
          if (!entry) return json(response, {}, 404);
          Object.assign(entry, changes);
          session.writes++;
          return json(response, entry);
        }
        if (request.method === "POST") {
          const entry = { ...await body(request), id: crypto.randomUUID(), user_id: userId };
          session.entries.push(entry);
          return json(response, entry);
        }
        if (request.method === "DELETE") {
          session.entries = session.entries.filter(entry => entry.id !== id);
          return json(response, {});
        }
        return json(response, session.controls.emptyLibrary ? [] : session.entries);
      }
      if (resource === "events") return json(response, session.controls.emptyLibrary ? [] : session.events);
      if (resource === "profile") return json(response, { username: "Compte de test" });
      if (resource === "community") return json(response, session.controls.emptyCommunity ? [] : session.entries.slice(0, 3).map(entry => ({ ...entry, user_id: "other-user", username: "Autre compte" })));
      if (resource === "upcoming") {
        const date = new Date(); date.setDate(date.getDate() + 12);
        return json(response, session.controls.emptyUpcoming ? [] : [{
          title: `Prochaine sortie ${id}`, external_id: `upcoming-${id}`, source_api: id === "movie" ? "tmdb" : id === "game" ? "igdb" : "openlibrary",
          media_type: id, upcoming_type: id, subtype: id === "movie" ? "movie" : null,
          release_date: date.toISOString().slice(0, 10), cover_url: "/tests/cover.svg", popularity: 30, description: synopsis,
        }]);
      }
      if (resource === "details") {
        await delay(120);
        return json(response, { description: synopsis, backdrop_url: "/tests/cover.svg" });
      }
      return json(response, {}, 404);
    }
    if (url.pathname === "/tests/cover.svg") {
      response.writeHead(200, { "Content-Type": "image/svg+xml" });
      return response.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#1e3336"/><circle cx="260" cy="195" r="112" fill="#d8b46a"/><circle cx="150" cy="395" r="96" fill="#e8553a"/><circle cx="290" cy="490" r="78" fill="#1fa88c"/></svg>');
    }
    let relative = decodeURIComponent(url.pathname);
    if (relative === "/") { response.writeHead(302, { Location: "/tests/browser.html" }); return response.end(); }
    if (relative.startsWith("/app/")) {
      relative = relative.slice(5) || "index.html";
      if (relative === "config.js") {
        response.writeHead(200, { "Content-Type": "text/javascript" });
        return response.end('const CONFIG = { app: { version: "4.0.0-test" }, supabase: { url: "http://localhost.invalid", anonKey: "test" }, tmdb: { apiKey: "test" }, igdb: { clientId: "test" } };');
      }
      if (relative === "supabase.js") relative = "tests/fixtures/backend.js";
      if (relative === "api.js") relative = "tests/fixtures/catalogues.js";
      if (relative === "sw.js") return json(response, {}, 404);
    }
    relative = relative.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return json(response, {}, 403);
    let data = await fs.readFile(file);
    if (file === path.join(root, "index.html")) data = Buffer.from(data.toString().split("<!-- Service Worker -->")[0] + "</body></html>");
    const type = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(file)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(data);
  } catch (error) { json(response, { error: String(error.message) }, 500); }
});
server.listen(Number(process.env.KULTURO_TEST_PORT || 4173), "localhost", () => console.log("Tests locaux : http://localhost:4173/tests/browser.html"));
