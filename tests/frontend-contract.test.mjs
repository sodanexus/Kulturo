import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { eventsForPeriod, isProfileTopEvent, journalEventPresentation, uniqueEntriesForEvents } from "../domain.js";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const style = await readFile(new URL("../style.css", import.meta.url), "utf8");
const addStyle = await readFile(new URL("../styles/add-sheet.css", import.meta.url), "utf8");
const mobileStyle = await readFile(new URL("../styles/mobile-polish.css", import.meta.url), "utf8");
const metadataFeature = await readFile(new URL("../features/media-metadata.js", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const supabase = await readFile(new URL("../supabase.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../schema.sql", import.meta.url), "utf8");

// Exécute le vrai rendu HTML sans démarrer l'application ni contacter Supabase.
const journalRenderingSource = [
  "visibleJournalEvents", "journalDateLabel", "renderJournalFeed", "journalRowHTML",
  "ratingScoreHTML", "getTypeLabel", "safeMediaUrl", "esc", "profileTopEntriesForPeriod",
].map(name => {
  const match = app.match(new RegExp(`^function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(match, `Fonction de rendu manquante : ${name}`);
  return match[0];
}).join("\n");

function journalHarness(entries, events) {
  const context = vm.createContext({
    State: { entries, events, journalAvailable: true },
    TYPE_LABELS: { movie: "Film", game: "Jeu", book: "Livre" },
    TYPE_ICONS: { movie: "🎬", game: "🎮", book: "📚" },
    URL,
    window: { location: { href: "https://example.invalid/Kulturo/" } },
    journalEventPresentation,
    eventsForPeriod,
    isProfileTopEvent,
    uniqueEntriesForEvents,
    profileMediaMatches: () => true,
  });
  vm.runInContext(journalRenderingSource, context);
  return context;
}

function detailBodyHarness(entry) {
  const match = app.match(/^function renderDetailBody\([\s\S]*?^\}/m);
  assert.ok(match, "Fonction de fiche détaillée manquante");
  const context = vm.createContext({
    quickActionsHTML: () => '<div data-test="quick-actions">Actions rapides</div>',
    metadataChipsHTML: (_entry, kind, value) => value ? `<button>${kind}:${value}</button>` : "",
    metadataChipHTML: (_entry, kind, value) => `<button>${kind}:${value}</button>`,
    formatReleaseDate: value => String(value),
    esc: value => String(value ?? ""),
  });
  vm.runInContext(match[0], context);
  return context.renderDetailBody(entry);
}

test("le Profil s'ouvre sur le mois courant", () => {
  assert.match(app, /let _profilePeriod = "month";/);
});

test("le Top mensuel utilise uniquement les notes et achèvements de la période", () => {
  assert.match(app, /function profileTopEntriesForPeriod\(entries, year, month = "all"\)/);
  assert.match(app, /eventsForPeriod\(State\.events, year, month\)\.filter\(isProfileTopEvent\)/);
  assert.match(app, /const scopedRated = profileTopEntriesForPeriod\(all, _profileYear, periodMonth\);/);
  assert.match(app, /Aucun média noté en \$\{esc\(periodLabel\)\}\./);
});

test("la navigation principale utilise le Journal personnel", () => {
  assert.match(app, /data-nav="journal"/);
  assert.doesNotMatch(app, /data-nav="activity"/);
});

test("la page Journal conserve les vues personnelle et communautaire", () => {
  assert.match(app, /id="journal-mode-personal"/);
  assert.match(app, /id="journal-mode-community"/);
  assert.match(app, /function setJournalMode\(mode\)/);
  assert.match(supabase, /rpc\("get_activity_feed"/);
});

test("le Journal reste un historique des étapes sans sous-filtres", () => {
  assert.doesNotMatch(app, /journal-view-(?:all|completions|ratings)/);
  assert.doesNotMatch(app, /function setJournalView\(/);
  assert.doesNotMatch(app, /function setCommunityView\(/);
  assert.match(app, /return State\.events\.filter\(/);
  assert.match(app, /existingIds\.has\(event\.media_id\)/);
});

test("le Journal masque les notes ajoutées, modifiées et retirées, sans supprimer les événements", () => {
  const entries = [{ id: "media", title: "Magnolia", media_type: "movie", rating: 7 }];
  const types = ["added", "started", "repeat_started", "finished", "repeat_finished", "status_changed"];
  const events = [
    ...[8, 7, null].map((rating, index) => ({
      id: `rating-${index}`, media_id: "media", event_type: "rated",
      occurred_at: `2026-08-28T00:0${index}:00Z`, metadata: { rating },
    })),
    ...types.map(event_type => ({ id: event_type, media_id: "media", event_type, occurred_at: "2026-08-27T12:00:00Z" })),
    { id: "deleted-media", media_id: "missing", event_type: "finished" },
  ];
  const before = structuredClone(events);
  const ui = journalHarness(entries, events);
  assert.deepEqual(Array.from(ui.visibleJournalEvents(), event => event.id), types);
  assert.strictEqual(ui.State.events, events);
  assert.deepEqual(events, before);
});

test("Magnolia garde une seule fin et sa note actuelle, sans déplacement ni changement de date", () => {
  const entry = { id: "magnolia", title: "Magnolia", media_type: "movie", rating: 7 };
  const events = [
    { id: "new-rating", media_id: entry.id, event_type: "rated", occurred_at: "2026-08-28T00:39:00Z", metadata: { rating: 7 } },
    { id: "old-rating", media_id: entry.id, event_type: "rated", occurred_at: "2026-08-28T00:33:00Z", metadata: { rating: 8 } },
    { id: "finished", media_id: entry.id, event_type: "finished", occurred_at: "2026-08-27T20:00:00Z", metadata: { rating: 8 } },
  ];
  const before = structuredClone(events);
  const ui = journalHarness([entry], events);
  const first = ui.renderJournalFeed(ui.visibleJournalEvents());
  assert.equal((first.match(/<article /g) || []).length, 1);
  assert.match(first, /Visionnage terminé/);
  assert.match(first, /★ 7\/10/);
  assert.doesNotMatch(first, /Note enregistrée|★ 8\/10/);
  assert.match(first, /datetime="2026-08-27T20:00:00Z"/);

  entry.rating = 9;
  const updated = ui.renderJournalFeed(ui.visibleJournalEvents());
  assert.match(updated, /★ 9\/10/);
  assert.doesNotMatch(updated, /★ 7\/10|★ 8\/10/);
  assert.deepEqual(Array.from(ui.visibleJournalEvents(), event => event.id), ["finished"]);
  assert.deepEqual(events, before);
});

test("effacer la note masque aussi l'ancien score sur les lignes existantes", () => {
  const entry = { id: "book", title: "Livre", media_type: "book", rating: null };
  const event = { media_id: entry.id, event_type: "finished", occurred_at: "2026-08-26T12:00:00Z", metadata: { rating: 8, date_only: true } };
  const ui = journalHarness([entry], [event]);
  const html = ui.renderJournalFeed(ui.visibleJournalEvents());
  assert.match(html, /Lecture terminée/);
  assert.doesNotMatch(html, /journal-rating-badge|★ 8\/10|Note retirée/);
  assert.doesNotMatch(html, /<time /);
});

test("une note donnée plus tard apparaît sur la ligne d'origine auparavant non notée", () => {
  const entry = { id: "game", title: "Jeu", media_type: "game", rating: 8 };
  const event = { media_id: entry.id, event_type: "added", occurred_at: "2026-07-15T12:00:00Z", metadata: { rating: null, status: "wishlist" } };
  const ui = journalHarness([entry], [event]);
  const html = ui.renderJournalFeed(ui.visibleJournalEvents());
  assert.match(html, /Ajouté à la wishlist/);
  assert.match(html, /★ 8\/10/);
  assert.match(html, /datetime="2026-07-15T12:00:00Z"/);
});

test("les journées contenant uniquement des notes ne laissent aucun groupe vide", () => {
  const entry = { id: "movie", title: "Film", media_type: "movie", rating: 7 };
  const events = [
    { media_id: entry.id, event_type: "rated", occurred_at: "2026-08-27T12:00:00Z", metadata: { rating: 7 } },
    { media_id: entry.id, event_type: "finished", occurred_at: "2026-07-15T12:00:00Z", metadata: { rating: 6 } },
  ];
  const ui = journalHarness([entry], events);
  const html = ui.renderJournalFeed(ui.visibleJournalEvents());
  assert.equal((html.match(/class="activity-date-group /g) || []).length, 1);
  assert.doesNotMatch(html, /Note enregistrée/);
  ui.State.events = [events[0]];
  const empty = ui.renderJournalFeed(ui.visibleJournalEvents());
  assert.match(empty, /Journal vide/);
  assert.doesNotMatch(empty, /activity-date-group/);
});

test("une notation masquée dans le Journal reste utilisable par le Top mensuel", () => {
  const entry = { id: "movie", title: "Film", media_type: "movie", rating: 8 };
  const events = [
    { media_id: entry.id, event_type: "rated", occurred_at: "2026-08-15T12:00:00Z", metadata: { rating: 8 } },
    { media_id: entry.id, event_type: "finished", occurred_at: "2026-07-15T12:00:00Z", metadata: { rating: null } },
  ];
  const ui = journalHarness([entry], events);
  assert.equal(ui.visibleJournalEvents().length, 1);
  assert.deepEqual(Array.from(ui.profileTopEntriesForPeriod([entry], 2026, "08"), media => media.id), [entry.id]);
  assert.strictEqual(ui.State.events, events);
  assert.equal(events.length, 2);
});

test("la Communauté exclut toujours le compte connecté", () => {
  assert.match(app, /entries\.filter\(entry => entry\.user_id !== State\.user\?\.id\)/);
  assert.match(schema, /AND\s+media\.user_id\s*<>\s*auth\.uid\(\)/);
  assert.doesNotMatch(app, /community-view-(?:all|me)/);
});

test("les colonnes de notes ouvrent la collection correspondante", () => {
  assert.match(app, /UI\.openRatingCollection\(\$\{note\}\)/);
  assert.match(app, /State\.filters\.rating = rating;/);
});

test("les notes en lecture utilisent partout le format numérique sur 10", () => {
  assert.match(app, /function ratingScoreHTML\(rating, className = ""\)/);
  assert.match(app, /★ \$\{display\}\/10/);
  assert.doesNotMatch(app, /["']★["']\.repeat/);
});

test("la barre de filtres Sorties possède son espacement mobile dédié", () => {
  assert.match(style, /#page-upcoming\s+\.upcoming-toolbar\s*\{[^}]*margin-top:\s*\.2rem/s);
});

test("les contrôles du Journal restent groupés et visibles pendant le défilement mobile", () => {
  assert.match(app, /class="journal-sticky-controls"/);
  assert.match(style, /#page-journal\s+\.journal-sticky-controls\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*z-index:\s*80/s);
  assert.match(style, /\.journal-mode-switch\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
});

test("l’étagère À reprendre est un accordéon accessible et mémorisé", () => {
  assert.match(app, /const CONTINUE_EXPANDED_KEY = "kulturo-continue-expanded";/);
  assert.match(app, /const items = allItems\.slice\(0, 8\);/);
  assert.match(app, /const countLabel = `\$\{allItems\.length\} en cours`;/);
  assert.match(app, /aria-controls="continue-content"/);
  assert.match(app, /content\.inert = !expanded;/);
  assert.match(app, /localStorage\.setItem\(CONTINUE_EXPANDED_KEY, String\(expanded\)\)/);
  assert.match(style, /\.continue-expand\s*\{[^}]*grid-template-rows:\s*0fr/s);
  assert.match(style, /\.continue-section\.is-expanded\s+\.continue-expand\s*\{[^}]*grid-template-rows:\s*1fr/s);
});

test("les mouvements de finition restent désactivables par le système", () => {
  assert.match(style, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?animation-duration:\s*\.01ms\s*!important/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(style, /\.journal-panel-enter/);
  assert.match(style, /\.dashboard-refresh/);
  assert.doesNotMatch(style, /animation:\s*heartbeat[^;]*infinite/);
  assert.doesNotMatch(style, /animation:\s*bothPulse[^;]*infinite/);
});

test("l’aperçu de note ne reconstruit plus les étoiles entre deux demi-zones", () => {
  assert.doesNotMatch(app, /onmouseleave="UI\.clearPreview\(\)"/);
  assert.match(app, /wrap\.addEventListener\("mouseleave", clearPreview\)/);
  assert.match(app, /aria-label="Noter \$\{half\} sur 10"/);
  assert.match(app, /wrap\.addEventListener\("touchend",[\s\S]*?e\.preventDefault\(\)[\s\S]*?\{ passive: false \}\)/);
  assert.match(style, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
});

test("l'ajout central utilise une feuille compacte sans indicateur d'étapes", () => {
  assert.match(app, /createAddDraft\(prefillTitle\)/);
  assert.match(app, /_wizardState = selectAddResult\(_wizardState, it\);[\s\S]*?_renderWizard\(\);/);
  assert.match(app, /wzUseManualType:/);
  assert.doesNotMatch(app, /class="wz-progress"|UI\.wzNext|wz-selected-preview/);
  assert.match(addStyle, /\.modal-overlay:has\(\.modal-wizard\)[\s\S]*?height:\s*auto/);
  assert.match(addStyle, /\.wz-notes-details/);
});

test("les styles fonctionnels sont découpés et chargés explicitement", () => {
  assert.match(index, /href="styles\/add-sheet\.css"/);
  assert.match(index, /href="styles\/mobile-polish\.css"/);
  assert.match(app, /from "\.\/features\/add-flow\.js"/);
  assert.match(app, /from "\.\/features\/media-metadata\.js"/);
  assert.doesNotMatch(style, /\.wz-progress|\.wz-step3-header|\.detail-cast-link/);
});

test("les informations des fiches ouvrent la bibliothèque tout en conservant les liens externes", () => {
  assert.match(app, /data-meta-kind="\$\{esc\(kind\)\}"/);
  assert.match(app, /entriesForMetadata\(State\.entries, kind, value\)/);
  assert.match(app, /metadataExternalLink\(kind, value, directUrl \|\| null\)/);
  assert.match(app, /openMetadataFromElement,/);
  assert.match(mobileStyle, /\.metadata-sheet/);
  assert.match(mobileStyle, /\.detail-meta-link/);
});

test("les services de streaming restent masqués dans les fiches", () => {
  assert.doesNotMatch(app, /metadataRow\("Disponible sur"/);
  assert.doesNotMatch(metadataFeature, /provider:/);
});

test("les fiches suivent une hiérarchie commune et terminent par les dates personnelles", () => {
  const common = {
    id: "media", status: "finished", description: "Synopsis test", release_year: 1999,
    genre: "Drame", date_finished: "2026-08-28", created_at: "2026-08-29T12:00:00Z",
  };
  const movie = detailBodyHarness({
    ...common, media_type: "movie", directors: "Jane Doe", cast_members: "Alice, Bob", duration: 180,
  });
  const game = detailBodyHarness({
    ...common, media_type: "game", developer: "Studio", publisher: "Éditeur", platform: "PC",
  });
  const book = detailBodyHarness({
    ...common, media_type: "book", author: "Autrice", publisher: "Maison", page_count: 320, isbn: "123",
  });

  for (const html of [movie, game, book]) {
    const positions = ["Actions rapides", "Synopsis", "Année", "Genre", "Terminé", "Ajouté"].map(label => html.indexOf(label));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  }
  assert.ok(movie.indexOf("Réalisateur") < movie.indexOf("Casting"));
  assert.ok(movie.indexOf("Casting") < movie.indexOf("Terminé"));
  assert.ok(game.indexOf("Développeur") < game.indexOf("Terminé"));
  assert.ok(book.indexOf("Pages") < book.indexOf("Auteur"));
  assert.doesNotMatch(movie, /Durée|Commencé|Sortie/);
  assert.doesNotMatch(game, /Plateforme/);
});

test("la recherche globale reste strictement limitée à la bibliothèque", () => {
  const match = app.match(/^function renderLibrarySearchResults\([\s\S]*?^\}/m);
  assert.ok(match);
  assert.match(app, /placeholder="Rechercher dans ma bibliothèque…"/);
  assert.match(match[0], /State\.entries/);
  assert.doesNotMatch(match[0], /searchMedia|openModal|API/);
  assert.doesNotMatch(app, /function quickAdd\(|quickAddFromResult|Ajouter depuis les APIs/);
});

test("les fiches mobiles se ferment par un geste visible sans transition de jaquette", () => {
  assert.match(app, /function setupDetailSwipeToClose\(\)/);
  assert.match(app, /distance > 92 \|\| velocity > \.55/);
  assert.match(app, /event\.target\.closest\("button, a, input"\)/);
  assert.match(app, /modal\.style\.animation = "none"/);
  assert.match(app, /translate3d\(0, \$\{distance\}px, 0\)/);
  assert.doesNotMatch(app, /animateDetailPosterFromOrigin|detailCardOrigin|posterTransition/);
  assert.match(mobileStyle, /@keyframes detailSwipeOut/);
  assert.match(mobileStyle, /\.detail-swipe-handle/);
  assert.match(mobileStyle, /\.detail-close-btn\s*\{\s*display:\s*none/);
  assert.doesNotMatch(mobileStyle.match(/@keyframes detailSwipeOut\s*\{[\s\S]*?\n\}/)?.[0] || "", /opacity/);
  assert.match(mobileStyle, /@media \(prefers-reduced-motion: reduce\)/);
});
