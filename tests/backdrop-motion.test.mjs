import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("la bannière vivante est branchée : module, API, service worker, fiche", () => {
  const module = read("../features/backdrop-motion.js");
  assert.match(module, /export function startBackdropDrift/);
  assert.match(module, /export async function startBackdropShow/);
  assert.match(read("../api.js"), /export const TMDbImages/);
  assert.match(read("../sw.js"), /features\/backdrop-motion\.js/);
  const detail = read("../features/media-detail.js");
  assert.match(detail, /startBackdropDrift\(layer\)/);
  assert.match(detail, /TMDbImages\.fetch/);
});

test("la bannière vivante respecte les garde-fous", () => {
  const module = read("../features/backdrop-motion.js");
  assert.match(module, /prefers-reduced-motion/);
  assert.match(module, /saveData/);
  assert.match(module, /IntersectionObserver/);
  assert.match(module, /visibilitychange/);
  const css = read("../styles/finesse.css");
  assert.match(css, /@keyframes backdropDrift/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.detail-backdrop-layer\.is-current/);
});

test("les images supplémentaires ne sont pas enregistrées en base", () => {
  const module = read("../features/backdrop-motion.js");
  assert.doesNotMatch(module, /supabase|saveEntry|updateEntry/i);
});
