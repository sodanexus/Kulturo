import test from "node:test";
import assert from "node:assert/strict";
import { isLikelyFrench } from "../features/text-language.js";

test("un accent isolé dans un synopsis anglais ne le fait pas passer pour du français", () => {
  assert.equal(isLikelyFrench("A young man named Arié discovers a hidden world beneath his school and must decide what to protect."), false);
  assert.equal(isLikelyFrench("The story follows a café owner whose life changes after a letter arrives."), false);
  assert.equal(isLikelyFrench("Arié and the city of lost children."), false);
});

test("un synopsis français est reconnu, accents ou non", () => {
  assert.equal(isLikelyFrench("Un voyage inattendu conduit les personnages à découvrir un monde nouveau."), true);
  assert.equal(isLikelyFrench("Dans un petit village, une famille cache un secret que personne ne doit connaître."), true);
  assert.equal(isLikelyFrench("Une histoire de famille et de silence dans le sud de la France."), true);
});

test("un synopsis français qui cite un titre anglais reste français", () => {
  assert.equal(isLikelyFrench("Dans cette suite de The Last Light, les héros reviennent pour une dernière mission avec des alliés inattendus."), true);
});

test("textes courts : français reconnu, vide et anglais non", () => {
  assert.equal(isLikelyFrench("Un récit poignant."), true);
  assert.equal(isLikelyFrench("Roman noir très écrit, déjà traduit."), true);
  assert.equal(isLikelyFrench(""), false);
  assert.equal(isLikelyFrench("A gripping thriller."), false);
});
