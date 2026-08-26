import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const style = await readFile(new URL("../style.css", import.meta.url), "utf8");
const supabase = await readFile(new URL("../supabase.js", import.meta.url), "utf8");

test("le Profil s'ouvre sur le mois courant", () => {
  assert.match(app, /let _profilePeriod = "month";/);
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

test("la barre de filtres Sorties possède son espacement mobile dédié", () => {
  assert.match(style, /#page-upcoming\s+\.upcoming-toolbar\s*\{[^}]*margin-top:\s*\.2rem/s);
});
