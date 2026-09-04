import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { entriesFingerprint, entriesForStorage } from "../features/library-cache.js";
import { createJournalNavigation } from "../features/journal-navigation.js";
import { collectDetailUpdates } from "../features/detail-enrichment.js";
import { createDetailSessionManager } from "../features/detail-session.js";
import { createUiActionDispatcher } from "../features/ui-actions.js";

test("le cache ignore l'ordre JSON et les champs internes", () => {
  const first = [
    { id: "2", title: "Livre", metadata: { b: 2, a: 1 }, _temporary: true },
    { id: "1", title: "Film", rating: 8 },
  ];
  const second = [
    { rating: 8, title: "Film", id: "1" },
    { metadata: { a: 1, b: 2 }, title: "Livre", id: "2" },
  ];
  assert.equal(entriesFingerprint(first), entriesFingerprint(second));
  assert.deepEqual(entriesForStorage(first)[0], { id: "2", title: "Livre", metadata: { b: 2, a: 1 } });
});

test("une vraie modification Supabase change l'empreinte", () => {
  const cached = [{ id: "1", title: "Film", status: "playing" }];
  const remote = [{ id: "1", title: "Film", status: "finished" }];
  assert.notEqual(entriesFingerprint(cached), entriesFingerprint(remote));
});

test("la navigation du Journal conserve son mode et ses identifiants sûrs", () => {
  const values = new Map([["kulturo-journal-mode", "community"]]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const journal = createJournalNavigation();
  assert.equal(journal.mode, "community");
  assert.equal(journal.monthDomId("personal", "2026-09"), "journal-personal-month-2026-09");
  assert.equal(journal.groupDomId("Films du jour !"), "journal-group-Films-du-jour-");
  assert.equal(journal.setMode("personal"), true);
  assert.equal(values.get("kulturo-journal-mode"), "personal");
  assert.equal(journal.setMode("invalid"), false);
});

test("l'enrichissement d'une fiche préserve les données personnelles existantes", () => {
  const film = { source_api: "tmdb", description: "Mon résumé", directors: "Réalisatrice" };
  const filmUpdates = collectDetailUpdates(film, {
    description: "Résumé distant",
    directors: "Autre valeur",
    backdrop_url: "https://image.tmdb.org/t/p/w1280/example.jpg",
  });
  assert.deepEqual(filmUpdates, { backdrop_url: "https://image.tmdb.org/t/p/w1280/example.jpg" });

  const game = { source_api: "igdb", description: "English text" };
  assert.deepEqual(collectDetailUpdates(game, { description: "Texte français" }), { description: "Texte français" });
});

test("une ancienne fermeture ne peut pas détruire la nouvelle fiche", () => {
  const cleared = [];
  const disposed = [];
  let timerId = 0;
  const sessions = createDetailSessionManager({
    setTimer: () => ++timerId,
    clearTimer: id => cleared.push(id),
    onDispose: session => disposed.push(session.id),
  });
  const first = sessions.begin("film-1");
  const image = { onload: () => {}, onerror: () => {}, removed: false, removeAttribute() { this.removed = true; } };
  sessions.trackImage(image, first);
  const timer = sessions.schedule(() => {}, 200, first);
  assert.equal(sessions.signal(first).aborted, false);
  sessions.startClosing(first);
  assert.equal(sessions.signal(first), null);
  assert.equal(sessions.dispose(first), true);
  assert.equal(image.removed, true);
  assert.deepEqual(cleared, [timer]);

  const second = sessions.begin("film-2");
  assert.equal(sessions.dispose(first), false);
  assert.equal(sessions.currentId(), second);
  assert.deepEqual(disposed, [first]);
});

test("les actions déléguées transmettent des arguments typés sans code inline", () => {
  const calls = [];
  const dispatcher = createUiActionDispatcher(() => ({
    open: (...args) => calls.push(args),
  }));
  const control = {
    disabled: false,
    dataset: {
      uiAction: "open",
      uiArgs: '["media-1",2]',
      uiValue: "true",
      uiControl: "true",
      uiEvent: "true",
    },
    value: "finished",
    getAttribute: () => null,
  };
  const event = { target: control };
  assert.equal(dispatcher.invoke(control, event), true);
  assert.deepEqual(calls[0], ["media-1", 2, "finished", control, event]);

  control.dataset.uiSelf = "true";
  assert.equal(dispatcher.invoke(control, { target: {} }), false);
  assert.equal(calls.length, 1);
});

test("l’interface générée ne contient plus de gestionnaire d’événement inline", () => {
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.equal(/\son(?:click|change|submit|keydown|mouseenter|focus|error)\s*=/.test(source), false);
  assert.equal(source.includes('getAttribute("onclick")'), false);
});

test("les jaquettes et les arrière-plans utilisent des caches distincts", () => {
  const source = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const context = {
    URL,
    self: { addEventListener() {} },
  };
  vm.runInNewContext(`${source}\n;globalThis.__cacheFor = mediaImageCache; globalThis.__networkOnly = isNetworkOnlyUrl; globalThis.__looksLikeImage = looksLikeImage;`, context);
  assert.equal(context.__cacheFor(new URL("https://image.tmdb.org/t/p/w1280/backdrop.jpg")).name, "kulturo-backdrops-v1");
  assert.equal(context.__cacheFor(new URL("https://image.tmdb.org/t/p/w500/poster.jpg")).name, "kulturo-covers-v1");
  assert.equal(context.__cacheFor(new URL("https://images.igdb.com/igdb/image/upload/t_cover_big/game.webp")).name, "kulturo-covers-v1");
  assert.equal(context.__networkOnly(new URL("https://images.igdb.com/igdb/image/upload/t_cover_big/game.webp")), false);
  assert.equal(context.__networkOnly(new URL("https://covers.openlibrary.org/b/id/123-M.jpg")), false);
  assert.equal(context.__networkOnly(new URL("https://api.igdb.com/v4/games")), true);
  assert.equal(context.__looksLikeImage({ url: "https://books.google.com/books/content?id=1", destination: "image" }, null), true);
});

test("la mise à jour migre les anciennes images sans conserver les scripts égarés", async () => {
  const coverRequest = { url: "https://images.igdb.com/igdb/image/upload/t_cover_big/game.webp", destination: "image" };
  const backdropRequest = { url: "https://image.tmdb.org/t/p/w1280/backdrop.jpg", destination: "image" };
  const scriptRequest = { url: "https://cdn.example.test/library.js", destination: "script" };
  const imageResponse = { headers: { get: () => "image/jpeg" } };
  const scriptResponse = { headers: { get: () => "text/javascript" } };

  function makeCache(initial = []) {
    const items = new Map(initial.map(([request, response]) => [request.url, { request, response }]));
    return {
      items,
      async keys() { return [...items.values()].map(item => item.request); },
      async match(request) { return items.get(request.url)?.response || null; },
      async put(request, response) { items.set(request.url, { request, response }); },
      async delete(request) { return items.delete(request.url); },
    };
  }

  const stores = new Map([
    ["kulturo-images-v3", makeCache([
      [coverRequest, imageResponse],
      [backdropRequest, imageResponse],
      [scriptRequest, scriptResponse],
    ])],
  ]);
  const context = {
    URL,
    self: { addEventListener() {} },
    caches: {
      async keys() { return [...stores.keys()]; },
      async open(name) {
        if (!stores.has(name)) stores.set(name, makeCache());
        return stores.get(name);
      },
      async delete(name) { return stores.delete(name); },
    },
  };
  const source = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  vm.runInNewContext(`${source}\n;globalThis.__migrate = migrateLegacyImages;`, context);
  await context.__migrate();

  assert.equal(stores.has("kulturo-images-v3"), false);
  assert.equal(stores.get("kulturo-covers-v1").items.has(coverRequest.url), true);
  assert.equal(stores.get("kulturo-backdrops-v1").items.has(backdropRequest.url), true);
  assert.equal(stores.get("kulturo-covers-v1").items.has(scriptRequest.url), false);
});
