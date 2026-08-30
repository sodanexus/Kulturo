import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildLibraryAffinity,
  exploredGenres,
  journalMonthSummary,
  recommendationForUpcoming,
  repeatCountForPeriod,
} from "../features/insights.js";
import { accentFromSample } from "../features/cover-accent.js";
import { clearApiCache, requestJSON } from "../features/request-client.js";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../api.js", import.meta.url), "utf8");
const requestSource = await readFile(new URL("../features/request-client.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const enhancementStyle = await readFile(new URL("../styles/enhancements.css", import.meta.url), "utf8");

test("le retour intelligent descend les couches avant de changer de page", () => {
  assert.match(appSource, /window\.addEventListener\("popstate", handleSmartBack\)/);
  assert.match(appSource, /metadata-overlay[\s\S]*filter-modal-overlay[\s\S]*modal-overlay/);
  assert.match(appSource, /navTo\(target\.page, \{ history: "none", preserveFilters: true/);
  assert.match(appSource, /pushHistoryLayer\("metadata"/);
  assert.match(appSource, /pushHistoryLayer\("filters"/);
  assert.match(appSource, /queueMicrotask\(init\)/);
});

test("la Bibliothèque possède une densité compacte facultative et locale", () => {
  assert.match(appSource, /const LIBRARY_DENSITY_KEY = "kulturo-library-density"/);
  assert.match(appSource, /function setLibraryDensity\(value\)/);
  assert.match(appSource, /reconcileKeyedChildren\(grid, entries/);
  assert.match(enhancementStyle, /data-library-density="compact"[\s\S]*#cards-grid/);
});

test("le Journal propose le saut temporel et un bilan mensuel", () => {
  assert.match(appSource, /id="journal-month-select"/);
  assert.match(appSource, /function jumpJournalMonth\(value\)/);
  assert.match(appSource, /function journalMonthSummaryHTML\(monthKey\)/);
  assert.match(appSource, /Favori du mois/);
});

test("le Profil garde les insights utiles sans mosaïque annuelle", () => {
  assert.match(appSource, /Genres les plus explorés/);
  assert.match(appSource, /profileNumberHTML\("repeats", scopedRepeatCount\)/);
  assert.match(appSource, /animateProfileNumbers\(container\)/);
  assert.match(appSource, /patchKeyedSurface\(container, dashboardHTML\)/);
  assert.doesNotMatch(appSource, /annualMosaicEntries|profile-mosaic/);
  assert.doesNotMatch(enhancementStyle, /profile-mosaic/);
});

test("la grille mobile utilise uniquement Standard et Compact", () => {
  assert.match(appSource, /const LIBRARY_DENSITY_KEY = "kulturo-library-density"/);
  assert.match(appSource, /Densité de la bibliothèque/);
  assert.doesNotMatch(appSource, /MOBILE_COLUMNS_KEY|setMobileColumns|2 colonnes|3 colonnes/);
  assert.doesNotMatch(enhancementStyle, /data-mobile-columns/);
});

test("la couleur de jaquette fournit un accent lisible avec un repli", () => {
  const dark = accentFromSample(220, 35, 70, "dark");
  const light = accentFromSample(35, 95, 220, "light");
  assert.match(dark.accent, /^hsl\(/);
  assert.match(dark.glow, /\/ \.18\)$/);
  assert.match(light.system, /^hsl\(/);
  assert.ok(dark.hue >= 0 && dark.hue <= 360);
});

test("l'état de l'interface est conservé pendant un changement d'onglet", () => {
  assert.match(appSource, /const UI_SNAPSHOT_KEY = "kulturo-ui-snapshot-v1"/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(appSource, /window\.addEventListener\("pagehide", persistUiSnapshot/);
  assert.match(appSource, /primeEntriesFromCache\(\);[\s\S]*?renderApp\(\);/);
  assert.match(indexSource, /updateControllerPending/);
  assert.match(indexSource, /document\.visibilityState === "hidden"/);
});

test("les fiches ont un vrai état sans synopsis et un enrichissement local", () => {
  assert.match(appSource, /Aucun synopsis n’est disponible pour ce média/);
  assert.match(appSource, /detail-info-content detail-info-arriving/);
  assert.match(enhancementStyle, /detail-info-leaving/);
});

test("toutes les APIs passent par la couche réseau commune", () => {
  assert.match(apiSource, /import \{ requestJSON \}/);
  const directFetchCalls = apiSource
    .split("\n")
    .filter(line => /\bfetch\(/.test(line) && !/^\s*async fetch\(/.test(line));
  assert.deepEqual(directFetchCalls, []);
  assert.match(requestSource, /timeoutMs = 8_000/);
  assert.match(requestSource, /retries = 1/);
  assert.match(requestSource, /responseCache/);
  assert.match(indexSource, /styles\/enhancements\.css/);
});

test("Pour vous exige une affinité forte et explique le rapprochement", () => {
  const entries = [
    { genre: "Horreur, Thriller", rating: 9, status: "finished", is_favorite: true },
    { genre: "Horreur", rating: 8, status: "finished" },
    { genre: "Comédie", rating: 5, status: "finished" },
  ];
  const affinity = buildLibraryAffinity(entries);
  const recommendation = recommendationForUpcoming({ genre: "Horreur, Mystère" }, affinity);
  assert.equal(recommendation?.label, "Pour vous");
  assert.equal(recommendation?.value, "Horreur");
  assert.match(recommendation?.reason || "", /Horreur/);
  assert.equal(recommendationForUpcoming({ genre: "Comédie" }, affinity), null);
});

test("le bilan mensuel compte les fins, la moyenne et le favori", () => {
  const entries = [
    { id: "a", title: "A", rating: 9, is_favorite: true },
    { id: "b", title: "B", rating: 7, is_favorite: false },
  ];
  const events = [
    { media_id: "a", event_type: "finished", occurred_at: "2026-08-02T12:00:00Z", metadata: { rating: 9 } },
    { media_id: "b", event_type: "repeat_finished", occurred_at: "2026-08-08T12:00:00Z", metadata: { rating: 7 } },
    { media_id: "a", event_type: "rated", occurred_at: "2026-07-02T12:00:00Z", metadata: { rating: 8 } },
  ];
  const summary = journalMonthSummary(events, entries, "2026-08");
  assert.equal(summary.completed, 2);
  assert.equal(summary.rated, 2);
  assert.equal(summary.average, 8);
  assert.equal(summary.favorite.id, "a");
});

test("les genres et revisionnages respectent la période", () => {
  assert.deepEqual(exploredGenres([
    { genre: "Drame, Thriller" },
    { genre: "Drame" },
  ]), [
    { label: "Drame", count: 2 },
    { label: "Thriller", count: 1 },
  ]);
  const events = [
    { media_id: "a", event_type: "repeat_finished", occurred_at: "2026-08-02T12:00:00Z" },
    { media_id: "a", event_type: "repeat_finished", occurred_at: "2026-07-02T12:00:00Z" },
  ];
  assert.equal(repeatCountForPeriod(events, [{ id: "a" }], 2026, "08"), 1);
});

test("la couche réseau met en cache et reprend une erreur temporaire", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ value: 42 }) };
  };
  try {
    clearApiCache();
    const first = await requestJSON("https://example.invalid/cache", {
      retries: 1,
      retryDelayMs: 1,
      cacheTtlMs: 10_000,
    });
    const second = await requestJSON("https://example.invalid/cache", { cacheTtlMs: 10_000 });
    assert.deepEqual(first, { value: 42 });
    assert.deepEqual(second, first);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearApiCache();
  }
});

test("une requête annulée ne produit pas un ancien résultat", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("annulée", "AbortError")), { once: true });
  });
  const controller = new AbortController();
  try {
    const pending = requestJSON("https://example.invalid/abort", { signal: controller.signal, retries: 0, timeoutMs: 10_000 });
    controller.abort();
    await assert.rejects(pending, error => error?.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
