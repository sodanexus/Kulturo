import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("la lueur au curseur couvre toutes les pages où il y a des affiches", () => {
  const js = read("../features/finesse.js");
  const hosts = js.match(/const POSTER_HOSTS = "([^"]+)"/)[1];
  for (const host of [".media-card", ".continue-card", ".profile-top-card", ".journal-event-row"]) assert.ok(hosts.includes(host), host);
  const covers = js.match(/const POSTER_COVERS = "([^"]+)"/)[1];
  for (const cover of [".card-cover", ".continue-cover", ".profile-top-cover", ".activity-cover-frame"]) assert.ok(covers.includes(cover), cover);
  assert.match(js, /closest\(POSTER_HOSTS\)/);
});

test("la lueur de la Bibliothèque passe devant la jaquette (z-index 3) et suit son inclinaison", () => {
  const css = read("../styles/finesse.css");
  assert.match(css, /\.media-card:not\(\.upcoming-card\)::after \{\s*z-index: 4;/);
  assert.match(css, /\.media-card:not\(\.upcoming-card\)\.is-tilting::after \{\s*transform: perspective\(800px\) rotateX\(var\(--rx/);
  // Sorties, Profil et Journal : la lueur vit dans le cadre de l'affiche.
  assert.match(css, /\.upcoming-card::after \{ display: none; \}/);
  for (const frame of [".upcoming-cover-wrap::after", ".profile-top-cover::after", ".activity-cover-frame::after"]) assert.ok(css.includes(frame), frame);
});

test("les affiches du Journal personnel et de la Communauté ont leur cadre", () => {
  const journal = read("../features/journal.js");
  assert.equal((journal.match(/<span class="activity-cover-frame">/g) || []).length, 4);
});

test("animations : courbes à départ rapide et survol d'affiche asymétrique", () => {
  const css = read("../styles/interactions.css");
  assert.doesNotMatch(css, /cubic-bezier\(\.333333, 0, \.666667, 1\)/);
  assert.match(css, /--poster-dur: 90ms/);
  assert.match(css, /--poster-dur: 260ms/);
  assert.match(read("../styles/finesse.css"), /transform var\(--poster-dur/);
});
