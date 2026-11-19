import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function exportedNames(source) {
  const names = new Set([...source.matchAll(/^export (?:async )?(?:const|function|class|let) (\w+)/gm)].map(match => match[1]));
  for (const block of source.matchAll(/^export \{([^}]*)\}/gm)) {
    block[1].split(",").map(part => part.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach(name => names.add(name));
  }
  return names;
}

// Les parcours navigateur remplacent api.js et supabase.js par ces doubles :
// un export manquant empêche l'application de se charger.
for (const [real, fixture, ignored] of [
  ["api.js", "tests/fixtures/catalogues.js", []],
  ["supabase.js", "tests/fixtures/backend.js", ["computeStats"]],
]) {
  test(`doubles de test : ${fixture} couvre les exports de ${real}`, () => {
    const missing = [...exportedNames(read(real))].filter(name => !exportedNames(read(fixture)).has(name) && !ignored.includes(name));
    assert.deepEqual(missing, []);
  });
}
