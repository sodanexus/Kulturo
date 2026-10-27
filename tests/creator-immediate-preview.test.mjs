import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const text = readFileSync(new URL("../features/media-detail.js", import.meta.url), "utf8");
const click = text.slice(text.indexOf("async function openCreatorWorkFromElement("), text.indexOf("\nfunction openMetadataFromElement("));
test("la fiche choisie utilise les données de la carte et ne bloque pas sur une requête préalable", () => {
  assert.match(text, /data-creator-title=/);
  assert.match(text, /data-creator-cover=/);
  assert.match(click, /const title = element\.dataset\.creatorTitle/);
  assert.match(click, /const item = \{/);
  assert.doesNotMatch(click, /await TMDb\.byId|await CreatorCatalogWorks\./);
  assert.match(click, /closeMetadataPanel\(\{ restoreFocus: false, immediate: true \}\)/);
  assert.match(click, /openUnownedCatalogueDetail\(item, "creator"/);
});
