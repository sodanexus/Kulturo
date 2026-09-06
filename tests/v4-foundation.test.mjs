import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildAppRoute, parseAppRoute } from "../features/app-route.js";
import { createMediaRepository, mergeRemoteWithMutations } from "../features/media-repository.js";
import { annualRetrospective } from "../features/insights.js";
import { coalesceMutation } from "../features/local-database.js";

function fakeDatabase(initialEntries = []) {
  let entries = initialEntries.map(item => ({ ...item }));
  let mutations = [];
  return {
    async getEntries() { return entries.map(item => ({ ...item })); },
    async getEntry(owner, id) { return entries.find(item => item.id === id) || null; },
    async putEntry(owner, entry) {
      entries = [entry, ...entries.filter(item => item.id !== entry.id)];
    },
    async replaceEntries(owner, values) { entries = values.map(item => ({ ...item })); },
    async hasEntrySnapshot() { return true; },
    async getMutations() { return mutations.map(item => ({ ...item })); },
    async stageMutation(owner, incoming, entry) {
      const previous = mutations.find(item => item.targetId === incoming.targetId);
      const normalized = {
        queueId: previous?.queueId || `q-${mutations.length + 1}`,
        ownerId: owner,
        createdAt: previous?.createdAt || Date.now(),
        attempts: 0,
        revision: `r-${Date.now()}-${Math.random()}`,
        ...incoming,
        payload: incoming.payload || {},
      };
      const mutation = coalesceMutation(previous, normalized, entry);
      mutations = mutations.filter(item => item.targetId !== incoming.targetId);
      if (mutation) mutations.push(mutation);
      if (incoming.operation === "delete") entries = entries.filter(item => item.id !== incoming.targetId);
      else if (entry) entries = [entry, ...entries.filter(item => item.id !== entry.id)];
      return mutations.find(item => item.targetId === incoming.targetId) || null;
    },
    async resolveMutation(owner, mutation, canonical) {
      const current = mutations.find(item => item.queueId === mutation.queueId);
      if (!current) return false;
      if (current.revision !== mutation.revision) {
        if (mutation.operation === "create" && canonical) {
          current.operation = "update";
          current.previous = canonical;
        }
        return false;
      }
      mutations = mutations.filter(item => item !== current);
      if (canonical) entries = [canonical, ...entries.filter(item => item.id !== canonical.id)];
      return true;
    },
    async markMutationFailure() {},
    async undoDelete(owner, id) {
      const mutation = mutations.find(item => item.operation === "delete" && item.targetId === id);
      if (!mutation) return null;
      mutations = mutations.filter(item => item !== mutation);
      if (mutation.undoMutation) mutations.push({ ...mutation.undoMutation, revision: `undo-${Date.now()}` });
      entries = [mutation.previous, ...entries.filter(item => item.id !== id)];
      return mutation.previous;
    },
    async clearOwner() { entries = []; mutations = []; },
  };
}

test("la route 4.0 conserve page, filtres et fiche sans dépendre du chemin GitHub", () => {
  const hash = buildAppRoute({
    page: "library",
    layer: "modal",
    payload: { modal: "detail", mediaId: "media-42" },
    filters: { search: "Dune", type: "movie", subtype: "movie", status: "all", favorite: true, replay: false, sort: "title", year: 2026, month: "2026-09", rating: 9 },
    views: {
      profile: { year: 2026, month: "09", period: "year", media: "film" },
      journal: { mode: "community", periods: { personal: "2026-08", community: "all" } },
      upcoming: { type: "game", genre: "RPG", hideAdded: false },
    },
  });
  const route = parseAppRoute(hash);
  assert.equal(route.page, "library");
  assert.equal(route.filters.search, "Dune");
  assert.equal(route.filters.favorite, true);
  assert.equal(route.payload.mediaId, "media-42");
  assert.equal(route.views.profile.period, "year");
  assert.equal(route.views.journal.mode, "community");
  assert.equal(route.views.upcoming.genre, "RPG");
  assert.equal(hash.startsWith("#/library?"), true);
});

test("la route est appliquée avant le premier rendu afin d'éviter un flash de grille", () => {
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /const snapshot = restoreUiSnapshot\(\);\s+const route = applyRouteContext\(\);\s+renderApp\(\);\s+restoreNavigation\(snapshot, route\)/);
  assert.match(source, /existingHistoryOwnsDetail[\s\S]+history\.pushState\(detailState/);
});

test("une route invalide revient aux valeurs sûres", () => {
  assert.equal(parseAppRoute("#/admin"), null);
  const route = parseAppRoute("#/library?status=destroyed&type=podcast&rating=99");
  assert.equal(route.filters.status, "finished");
  assert.equal(route.filters.type, "all");
  assert.equal(route.filters.rating, "all");
});

test("les mutations locales restent visibles au-dessus d’un instantané distant", () => {
  const merged = mergeRemoteWithMutations(
    [{ id: "1", title: "Distant", status: "playing" }, { id: "2", title: "À supprimer" }],
    [{ id: "1", title: "Local", status: "finished" }, { id: "3", title: "Ajout local" }],
    [
      { operation: "update", targetId: "1" },
      { operation: "delete", targetId: "2" },
      { operation: "create", targetId: "3" },
    ],
  );
  assert.deepEqual(merged.map(item => item.id).sort(), ["1", "3"]);
  assert.equal(merged.find(item => item.id === "1").status, "finished");
  assert.equal(merged.every(item => item._syncState === "pending"), true);
});

test("une modification hors ligne est rejouée une fois le réseau revenu", async () => {
  let online = false;
  const calls = [];
  const database = fakeDatabase([{ id: "1", title: "Dune", status: "playing", created_at: "2026-01-01" }]);
  const remote = {
    async getAll() { return database.getEntries(); },
    async create(entry) { calls.push(["create", entry]); return entry; },
    async update(id, changes) { calls.push(["update", id, changes]); return { id, title: "Dune", status: changes.status, updated_at: "remote" }; },
    async delete(id) { calls.push(["delete", id]); },
  };
  const repository = createMediaRepository({ remote, database, getOwnerId: () => "owner-1", isOnline: () => online });
  await repository.hydrate();
  const local = await repository.update("1", { status: "finished" });
  assert.equal(local.status, "finished");
  assert.equal(repository.getStatus().state, "offline");
  assert.equal(repository.getStatus().pending, 1);
  assert.equal(calls.length, 0);

  online = true;
  await repository.flush();
  assert.deepEqual(calls[0].slice(0, 2), ["update", "1"]);
  assert.equal(repository.getStatus().pending, 0);
  assert.equal(repository.getStatus().state, "synced");
});

test("une deuxième modification ne peut pas être effacée par la réponse de la première", async () => {
  let releaseFirst;
  let announceFirst;
  let callCount = 0;
  const firstStarted = new Promise(resolve => { announceFirst = resolve; });
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  const calls = [];
  const database = fakeDatabase([{ id: "1", title: "Dune", status: "finished", created_at: "2026-01-01" }]);
  const remote = {
    async getAll() { return database.getEntries(); },
    async update(id, changes) {
      callCount++;
      calls.push({ ...changes });
      if (callCount === 1) {
        announceFirst();
        await firstBlocked;
      }
      return { id, title: "Dune", status: "finished", ...changes };
    },
  };
  const repository = createMediaRepository({ remote, database, getOwnerId: () => "owner-1", isOnline: () => true });
  await repository.hydrate();
  const first = repository.update("1", { rating: 8 });
  await firstStarted;
  const second = repository.update("1", { is_favorite: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  releaseFirst();
  await Promise.all([first, second]);
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { rating: 8, is_favorite: true });
  assert.equal((await database.getEntry(null, "1")).is_favorite, true);
  await repository.clearOwner("owner-1");
});

test("une bibliothèque locale vide reste un état valide hors connexion", async () => {
  const database = fakeDatabase([]);
  const repository = createMediaRepository({
    remote: { async getAll() { throw new Error("hors ligne"); } },
    database,
    getOwnerId: () => "owner-1",
    isOnline: () => false,
  });
  assert.deepEqual(await repository.getAll(), []);
  assert.equal(repository.getStatus().state, "offline");
});

test("deux écritures du cache conservent toujours la plus récente", async () => {
  let values = [];
  let writes = 0;
  const database = {
    async getMutations() { return []; },
    async replaceEntries(owner, entries) {
      writes++;
      if (writes === 1) await new Promise(resolve => setTimeout(resolve, 20));
      values = entries.map(entry => ({ ...entry }));
    },
  };
  const repository = createMediaRepository({ remote: {}, database, getOwnerId: () => "owner-1", isOnline: () => false });
  await Promise.all([
    repository.cache([{ id: "1", title: "Ancien" }]),
    repository.cache([{ id: "1", title: "Récent" }]),
  ]);
  assert.equal(values[0].title, "Récent");
});

test("Supabase reste utilisable si IndexedDB est refusé par le navigateur", async () => {
  const calls = [];
  const unavailableDatabase = {
    async getEntries() { return []; }, async getEntry() { return null; },
    async hasEntrySnapshot() { return false; }, async getMutations() { return []; },
    async replaceEntries() { return false; }, async putEntry() { return false; },
    async stageMutation() { return null; }, async markMutationFailure() {},
    async resolveMutation() {}, async undoDelete() { return null; }, async clearOwner() {},
  };
  const remote = {
    async getAll() { return [{ id: "1", title: "Dune", status: "playing" }]; },
    async create(entry) { calls.push(["create", entry.id]); return entry; },
    async update(id, changes) { calls.push(["update", id]); return { id, title: "Dune", ...changes }; },
    async delete(id) { calls.push(["delete", id]); },
  };
  const repository = createMediaRepository({ remote, database: unavailableDatabase, getOwnerId: () => "owner-1", isOnline: () => true });
  await repository.getAll();
  await repository.update("1", { status: "finished" });
  const created = await repository.create({ title: "Solaris", media_type: "book", status: "wishlist" });
  await repository.delete(created.id, { undoDelay: 0 });
  assert.deepEqual(calls.map(call => call[0]), ["update", "create", "delete"]);
});

test("une bibliothèque distante vide reste connue hors ligne sans IndexedDB", async () => {
  let online = true;
  const unavailableDatabase = {
    async getEntries() { return []; }, async getEntry() { return null; },
    async hasEntrySnapshot() { return false; }, async getMutations() { return []; },
    async replaceEntries() { return false; }, async putEntry() { return false; },
    async stageMutation() { return null; }, async markMutationFailure() {},
    async resolveMutation() {}, async undoDelete() { return null; }, async clearOwner() {},
  };
  const repository = createMediaRepository({
    remote: { async getAll() { return []; } },
    database: unavailableDatabase,
    getOwnerId: () => "owner-1",
    isOnline: () => online,
  });
  assert.deepEqual(await repository.getAll(), []);
  online = false;
  assert.deepEqual(await repository.getAll(), []);
  assert.equal(repository.getStatus().state, "offline");
});

test("une suppression peut être annulée avant sa synchronisation", async () => {
  const database = fakeDatabase([{ id: "7", title: "Solaris", status: "finished" }]);
  const repository = createMediaRepository({
    remote: { async getAll() { return []; }, async create() {}, async update() {}, async delete() { throw new Error("ne doit pas partir"); } },
    database,
    getOwnerId: () => "owner-1",
    isOnline: () => false,
  });
  await repository.hydrate();
  await repository.delete("7", { undoDelay: 7000 });
  assert.equal((await database.getEntries()).length, 0);
  const restored = await repository.undoDelete("7");
  assert.equal(restored.title, "Solaris");
  assert.equal(repository.getStatus().pending, 0);
});

test("annuler une suppression remet aussi la modification locale précédente en attente", () => {
  const previous = {
    queueId: "q-1", ownerId: "owner-1", operation: "update", targetId: "7",
    payload: { rating: 9 }, previous: { id: "7", rating: 8 }, revision: "before",
  };
  const latest = { id: "7", title: "Solaris", rating: 9 };
  const deletion = coalesceMutation(previous, {
    queueId: "q-1", ownerId: "owner-1", operation: "delete", targetId: "7",
    previous: latest, revision: "delete",
  });
  assert.deepEqual(deletion.previous, latest);
  assert.equal(deletion.undoMutation.operation, "update");
  assert.deepEqual(deletion.undoMutation.payload, { rating: 9 });
});

test("une nouvelle écriture change toujours la révision de la mutation fusionnée", () => {
  const base = {
    queueId: "q-1", ownerId: "owner-1", operation: "update", targetId: "7",
    payload: { rating: 8 }, revision: "ancienne", availableAt: 1,
  };
  const incoming = {
    ...base, payload: { is_favorite: true }, revision: "nouvelle", availableAt: 2,
  };
  const update = coalesceMutation(base, incoming, { id: "7", rating: 8, is_favorite: true });
  assert.equal(update.revision, "nouvelle");
  assert.deepEqual(update.payload, { rating: 8, is_favorite: true });

  const create = coalesceMutation(
    { ...base, operation: "create", payload: { id: "7", rating: 8 } },
    incoming,
    { id: "7", rating: 9 },
  );
  assert.equal(create.revision, "nouvelle");
  assert.equal(create.operation, "create");
  assert.equal(create.payload.rating, 9);
});

test("les courses créer-supprimer et supprimer-annuler possèdent une compensation", () => {
  const source = fs.readFileSync(new URL("../features/local-database.js", import.meta.url), "utf8");
  assert.match(source, /mutation\.operation === "create" && !entryRecord[\s\S]+operation: "delete"/);
  assert.match(source, /mutation\.operation === "delete" && entryRecord\?\.value[\s\S]+operation: "create"/);
  assert.match(source, /current\.revision !== mutation\.revision[\s\S]+mutation\.operation === "delete"[\s\S]+current\.operation = "create"/);
});

test("la rétrospective sépare les œuvres terminées des reprises en cours", () => {
  const entries = [
    { id: "1", title: "Terminé", media_type: "book", status: "finished", rating: 8, is_favorite: true, genre: "SF" },
    { id: "2", title: "Relancé", media_type: "movie", subtype: "movie", status: "playing", rating: 10, is_favorite: true, genre: "Drame" },
    { id: "3", title: "Souhait", media_type: "game", status: "wishlist", genre: "RPG" },
  ];
  const events = [
    { media_id: "1", event_type: "finished", occurred_at: "2026-02-01T10:00:00Z" },
    { media_id: "2", event_type: "finished", occurred_at: "2026-03-01T10:00:00Z" },
    { media_id: "2", event_type: "repeat_finished", occurred_at: "2026-04-01T10:00:00Z" },
    { media_id: "3", event_type: "added", occurred_at: "2026-05-01T10:00:00Z" },
  ];
  const retrospective = annualRetrospective(entries, events, 2026);
  assert.equal(retrospective.completed, 2);
  assert.equal(retrospective.replayCount, 1);
  assert.equal(retrospective.top.id, "1");
  assert.equal(retrospective.genreCount, 2);
  assert.equal(retrospective.dominantType, "film");
});

test("le socle local définit des transactions atomiques et ses magasins isolés", () => {
  const source = fs.readFileSync(new URL("../features/local-database.js", import.meta.url), "utf8");
  assert.match(source, /STORE_ENTRIES = "entries"/);
  assert.match(source, /STORE_EVENTS = "events"/);
  assert.match(source, /STORE_MUTATIONS = "mutations"/);
  assert.match(source, /STORE_META = "meta"/);
  assert.match(source, /library-snapshot/);
  assert.match(source, /journal-snapshot/);
  assert.match(source, /transaction\(\[STORE_ENTRIES, STORE_MUTATIONS\], "readwrite"\)/);
  assert.match(source, /ownerId/);
});

test("la chaîne 4.0 verrouille ses outils et son déploiement portable", () => {
  const packageManifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const vite = fs.readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  const workflow = fs.readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.equal(packageManifest.devDependencies.typescript, "7.0.2");
  assert.equal(packageManifest.devDependencies.vite, "8.2.0");
  assert.equal(packageLock.packages[""].version, packageManifest.version);
  assert.match(vite, /base:\s*"\.\/"/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /path: dist/);
});
