import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { entriesFingerprint, entriesForStorage } from "../features/library-cache.js";
import { createJournalNavigation } from "../features/journal-navigation.js";
import { collectDetailUpdates } from "../features/detail-enrichment.js";
import { createDetailSessionManager } from "../features/detail-session.js";
import { createUiActionDispatcher } from "../features/ui-actions.js";
import { dialogKeyIntent, nextFocusIndex } from "../features/dialog-focus.js";
import { createAsyncGate, sameOwner } from "../features/async-gate.js";
import { reconcileKeyedChildren } from "../features/dom-updates.js";
import { sameMediaIdentity } from "../domain.js";
import {
  buildRestorePlan,
  parseKulturoBackup,
  sanitizeBackupEntry,
  sanitizeBackupEvents,
} from "../features/backup-restore.js";

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

test("l'identifiant Supabase du propriétaire ne provoque pas un nouveau rendu", () => {
  const cached = [{ id: "1", title: "Film", status: "finished" }];
  const remote = [{ id: "1", user_id: "owner-1", title: "Film", status: "finished" }];
  assert.equal(entriesFingerprint(cached), entriesFingerprint(remote));
  assert.deepEqual(entriesForStorage(remote), cached);
});

test("une vraie modification Supabase change l'empreinte", () => {
  const cached = [{ id: "1", title: "Film", status: "playing" }];
  const remote = [{ id: "1", title: "Film", status: "finished" }];
  assert.notEqual(entriesFingerprint(cached), entriesFingerprint(remote));
});

test("les homonymes et remakes ne sont plus confondus", () => {
  const dune1984 = { media_type: "movie", subtype: "movie", title: "Dune", release_year: 1984, source_api: "tmdb", external_id: "841" };
  const dune2021 = { media_type: "movie", subtype: "movie", title: "Dune", release_year: 2021, source_api: "tmdb", external_id: "438631" };
  assert.equal(sameMediaIdentity(dune1984, dune2021), false);
  assert.equal(sameMediaIdentity(
    { media_type: "book", title: "L’Étranger", release_year: 1942, author: "Albert Camus" },
    { media_type: "book", title: "L Etranger", release_year: 1942, author: "Albert Camus" },
  ), true);
  assert.equal(sameMediaIdentity(
    { media_type: "book", title: "Le Livre", author: "Autrice A" },
    { media_type: "book", title: "Le Livre", author: "Auteur B" },
  ), false);
});

test("une grille déjà ordonnée ne déplace plus ses jaquettes", () => {
  class FakeNode {
    constructor(key) { this.dataset = { key }; this.parentNode = null; }
    get nextElementSibling() {
      const siblings = this.parentNode?.children || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    }
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
  }
  const nodes = ["a", "b", "c"].map(key => new FakeNode(key));
  const container = {
    children: nodes,
    moves: 0,
    get firstElementChild() { return this.children[0] || null; },
    insertBefore(node, reference) {
      this.moves++;
      if (node.parentNode) node.remove();
      const index = reference ? this.children.indexOf(reference) : this.children.length;
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
    },
  };
  nodes.forEach(node => { node.parentNode = container; });
  const options = { key: item => item, create: () => null, update() {} };

  reconcileKeyedChildren(container, ["a", "b", "c"], options);
  assert.equal(container.moves, 0);
  reconcileKeyedChildren(container, ["b", "a", "c"], options);
  assert.equal(container.moves, 1);
  assert.deepEqual(container.children.map(node => node.dataset.key), ["b", "a", "c"]);
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

test("le piège de focus boucle dans les deux sens", () => {
  assert.equal(nextFocusIndex(3, 2, false), 0);
  assert.equal(nextFocusIndex(3, 0, true), 2);
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(0, 0, false), -1);
});

test("les claviers iPad sont reconnus même lorsque event.key est indéterminé", () => {
  assert.deepEqual(dialogKeyIntent({ key: "Unidentified", code: "Tab" }), { escape: false, tab: true });
  assert.deepEqual(dialogKeyIntent({ key: "Unidentified", keyCode: 27 }), { escape: true, tab: false });
});

test("une réponse asynchrone tardive ne peut plus modifier la vue", () => {
  const gate = createAsyncGate();
  const first = gate.begin();
  const second = gate.begin();
  let committed = "";
  assert.equal(first.signal.aborted, true);
  assert.equal(gate.commit(first, () => { committed = "ancien"; }), false);
  assert.equal(gate.commit(second, () => { committed = "récent"; }), true);
  assert.equal(committed, "récent");
  gate.cancel();
  assert.equal(gate.isCurrent(second), false);
  assert.equal(sameOwner("compte-1", "compte-1"), true);
  assert.equal(sameOwner("compte-1", "compte-2"), false);
});

test("les écritures Supabase sont bornées et limitées au compte courant", () => {
  const source = fs.readFileSync(new URL("../supabase.js", import.meta.url), "utf8");
  assert.match(source, /async function executeQuery[\s\S]+timeoutMs[\s\S]+controller\.abort\(\)/);
  assert.match(source, /async update\(id, changes, options = \{\}\)[\s\S]+?\.eq\("id", id\)[\s\S]+?\.eq\("user_id", user\.id\)/);
  assert.match(source, /async delete\(id, options = \{\}\)[\s\S]+?\.eq\("id", id\)[\s\S]+?\.eq\("user_id", user\.id\)/);
  assert.match(source, /async getStats\(options = \{\}\)[\s\S]+?\.eq\("user_id", user\.id\)/);
});

test("le contexte restauré est rattaché explicitement à son propriétaire", () => {
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /ownerId: State\.user\.id/);
  assert.match(source, /String\(snapshot\.ownerId \|\| ""\) !== ownerId/);
  assert.match(source, /Sauvegarde reportée : le Journal n’a pas pu être chargé/);
});

test("la restauration fusionne sans suppression et sans muter l’aperçu courant", () => {
  const current = [
    { id: "1", title: "Dune", media_type: "movie", subtype: "movie", source_api: "tmdb", external_id: "438631", status: "finished", rating: 8, is_favorite: false },
    { id: "2", title: "Silo", media_type: "movie", subtype: "tv", source_api: "tmdb", external_id: "125988", status: "playing", is_favorite: false },
  ];
  const backup = parseKulturoBackup(JSON.stringify({
    app: "Kulturo",
    version: "3.4.5",
    entries: [
      { ...current[0], rating: 9 },
      { ...current[1] },
      { id: "old-id", title: "La Horde du Contrevent", media_type: "book", status: "wishlist", author: "Alain Damasio", is_favorite: true },
      { title: "Ligne cassée", media_type: "podcast" },
    ],
  }));
  const plan = buildRestorePlan(backup.entries, current);
  assert.equal(plan.added.length, 1);
  assert.equal(plan.updated.length, 1);
  assert.deepEqual(plan.updated[0].changes, { rating: 9 });
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.invalid.length, 1);
  assert.equal(Object.hasOwn(plan, "deleted"), false);
  assert.equal(current[0].rating, 8);
  assert.equal(Object.hasOwn(plan.added[0].payload, "id"), false);
  assert.equal(Object.hasOwn(plan.added[0].payload, "user_id"), false);
});

test("les sauvegardes 4.0 sont versionnées sans rendre les anciennes incompatibles", () => {
  const current = parseKulturoBackup(JSON.stringify({
    app: "Kulturo", format: "kulturo-backup", schema: 2, entries: [], events: [],
  }));
  const legacy = parseKulturoBackup(JSON.stringify({ app: "Kulturo", version: "3.4.9", entries: [] }));
  assert.equal(current.schema, 2);
  assert.deepEqual(legacy.events, []);
  assert.throws(
    () => parseKulturoBackup(JSON.stringify({ app: "Kulturo", format: "kulturo-backup", schema: 99, entries: [] })),
    /version plus récente/,
  );
});

test("un doublon nouveau dans la sauvegarde ne vise jamais un ancien identifiant", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const media = { id, title: "Doublon", media_type: "book", status: "wishlist", is_favorite: false };
  const plan = buildRestorePlan([media, { ...media, rating: 8 }], []);
  assert.equal(plan.added.length, 1);
  assert.equal(plan.updated.length, 0);
  assert.equal(plan.invalid.length, 1);
  assert.equal(plan.invalid[0].reason, "duplicate");
});

test("les homonymes ambigus deviennent des conflits sans écriture automatique", () => {
  const backup = [{
    id: "22222222-2222-4222-8222-222222222222",
    title: "Le Voyage",
    media_type: "book",
    status: "finished",
    is_favorite: false,
  }];
  const current = [
    { id: "a", title: "Le Voyage", media_type: "book", author: "Auteur A" },
    { id: "b", title: "Le Voyage", media_type: "book", author: "Auteur B" },
  ];
  const plan = buildRestorePlan(backup, current);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.added.length + plan.updated.length, 0);
});

test("les valeurs incompatibles avec Supabase sont refusées avant l’aperçu", () => {
  assert.equal(sanitizeBackupEntry({ title: "Année seule", media_type: "book", release_date_precision: "year" }), null);
  assert.equal(sanitizeBackupEntry({ title: "Mauvaise source", media_type: "book", source_api: "unknown" }), null);
  assert.equal(sanitizeBackupEntry({ title: "Mauvaise note", media_type: "book", rating: 8.5 }), null);
});

test("un JSON profondément imbriqué est ignoré sans faire tomber l’import", () => {
  const metadata = {};
  let cursor = metadata;
  for (let index = 0; index < 12_000; index++) {
    cursor.child = {};
    cursor = cursor.child;
  }
  const events = sanitizeBackupEvents([{
    id: "33333333-3333-4333-8333-333333333333",
    media_id: "44444444-4444-4444-8444-444444444444",
    event_type: "added",
    occurred_at: "2026-09-05T10:00:00.000Z",
    metadata,
  }]);
  assert.equal(events.valid.length, 0);
  assert.equal(events.invalid.length, 1);
});

test("le Journal valide est conservé dans le plan de restauration", () => {
  const events = sanitizeBackupEvents([{
    id: "55555555-5555-4555-8555-555555555555",
    media_id: "66666666-6666-4666-8666-666666666666",
    event_type: "repeat_finished",
    occurred_at: "2026-08-12T12:00:00.000Z",
    metadata: { occurrence: 2 },
  }]);
  assert.equal(events.invalid.length, 0);
  assert.equal(events.valid[0].event_type, "repeat_finished");
});

test("les fenêtres déclarées possèdent toutes un titre accessible", () => {
  const source = ["../app.js", "../features/media-detail.js"]
    .map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
  const dialogs = source.match(/<[^>]+role="(?:alert)?dialog"[^>]*>/g) || [];
  assert.ok(dialogs.length >= 7);
  dialogs.forEach(dialog => assert.match(dialog, /aria-labelledby="[^"]+"/));
});

test("la PWA reste portable quel que soit le nom du dépôt", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(worker.includes("/Kulturo/"), false);
  assert.equal(html.includes('register("/Kulturo/'), false);
  const context = {
    URL,
    self: {
      registration: { scope: "https://example.test/depot-renomme/" },
      location: { href: "https://example.test/depot-renomme/sw.js" },
      addEventListener() {},
    },
  };
  vm.runInNewContext(`${worker}\n;globalThis.__home = APP_HOME; globalThis.__assets = STATIC_ASSETS;`, context);
  assert.equal(context.__home, "https://example.test/depot-renomme/");
  assert.ok(context.__assets.every(asset => asset.startsWith(context.__home)));
});

test("la version publiée reste synchronisée dans tous les points d’entrée", () => {
  const version = fs.readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
  const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(config.includes(`version: "${version}"`));
  assert.ok(html.includes(`icon.svg?v=${version}`));
  assert.ok(worker.includes(`kulturo-static-v${version}`));
  assert.ok(manifest.icons.every(icon => icon.src.endsWith(`?v=${version}`)));
});

test("le premier démarrage hors ligne précharge tout le shell local", () => {
  const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const context = {
    URL,
    self: {
      registration: { scope: "https://example.test/kulturo/" },
      location: { href: "https://example.test/kulturo/sw.js" },
      addEventListener() {},
    },
  };
  vm.runInNewContext(`${worker}\n;globalThis.__assets = STATIC_ASSETS;`, context);
  const paths = context.__assets.map(asset => new URL(asset).pathname.replace("/kulturo/", ""));
  [
    "app.js", "api.js", "supabase.js", "domain.js", "style.css", "manifest.json",
    "styles/add-sheet.css", "styles/mobile-polish.css", "styles/enhancements.css",
    "features/upcoming.js", "features/backup-restore.js", "features/dialog-focus.js",
  ].forEach(asset => assert.ok(paths.includes(asset), `${asset} doit être préchargé`));
  // Parcourir les imports réels protège aussi les futures extractions : un
  // module oublié dans le cache empêche tout le démarrage hors connexion.
  const visited = new Set();
  const root = new URL("../", import.meta.url);
  function visit(module) {
    if (visited.has(module.href)) return;
    visited.add(module.href);
    const relative = module.href.slice(root.href.length);
    assert.ok(paths.includes(relative), `${relative} importé doit être préchargé`);
    const source = fs.readFileSync(module, "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.[^"']+)["']/g)) {
      visit(new URL(match[1], module));
    }
  }
  visit(new URL("app.js", root));
  paths.forEach(asset => assert.ok(fs.existsSync(new URL(asset, root)), `${asset} préchargé doit exister`));
});

test("le schéma fournit une restauration atomique et neutralise les faux événements", () => {
  const schema = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
  assert.match(schema, /CREATE FUNCTION public\.restore_kulturo_backup/);
  assert.match(schema, /set_config\('app\.kulturo_restore', 'on', TRUE\)/);
  assert.match(schema, /current_setting\('app\.kulturo_restore', TRUE\) = 'on'/);
  assert.match(schema, /ON CONFLICT DO NOTHING/);
  assert.match(schema, /REVOKE INSERT, DELETE ON public\.media_events FROM authenticated/);
});

test("l’onglet Sorties vit dans son module dédié", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const upcoming = fs.readFileSync(new URL("../features/upcoming.js", import.meta.url), "utf8");
  assert.equal(app.includes("const UpcomingState"), false);
  assert.equal(app.includes("function renderUpcoming("), false);
  assert.match(upcoming, /export function createUpcomingFeature/);
  assert.match(upcoming, /function renderUpcoming\(/);
  assert.equal(upcoming.includes("upcomingIdx"), false);
  assert.match(upcoming, /data-upcoming-key/);
});

test("les fiches média vivent dans leur module dédié", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const detail = fs.readFileSync(new URL("../features/media-detail.js", import.meta.url), "utf8");
  assert.match(app, /createMediaDetailFeature/);
  assert.doesNotMatch(app, /function renderDetailPanel\(/);
  assert.doesNotMatch(app, /function openDetailPanel\(/);
  assert.match(detail, /function renderDetailPanel\(/);
  assert.match(detail, /function openDetailPanel\(/);
  assert.match(detail, /function refreshDetailEnrichment\(/);
  assert.match(detail, /function startDetailCoverOpen\(/);
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

test("l’élagage du cache d’images est regroupé par rafale", async () => {
  let keyReads = 0;
  const cache = {
    async keys() { keyReads++; return []; },
    async delete() { return true; },
  };
  const context = {
    URL,
    setTimeout,
    clearTimeout,
    self: { addEventListener() {} },
    caches: { async open() { return cache; } },
  };
  const source = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  vm.runInNewContext(`${source}\n;globalThis.__scheduleTrim = scheduleCacheTrim;`, context);
  await Promise.all(Array.from({ length: 24 }, () => context.__scheduleTrim("covers", 240)));
  assert.equal(keyReads, 1);
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
