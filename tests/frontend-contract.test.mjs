import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const style = await readFile(new URL("../style.css", import.meta.url), "utf8");
const supabase = await readFile(new URL("../supabase.js", import.meta.url), "utf8");

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
  assert.match(style, /\.journal-toolbar\[hidden\]\s*\{\s*display:\s*none\s*!important;/s);
});

test("l’aperçu de note ne reconstruit plus les étoiles entre deux demi-zones", () => {
  assert.doesNotMatch(app, /onmouseleave="UI\.clearPreview\(\)"/);
  assert.match(app, /wrap\.addEventListener\("mouseleave", clearPreview\)/);
  assert.match(app, /aria-label="Noter \$\{half\} sur 10"/);
  assert.match(app, /wrap\.addEventListener\("touchend",[\s\S]*?e\.preventDefault\(\)[\s\S]*?\{ passive: false \}\)/);
  assert.match(style, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
});
