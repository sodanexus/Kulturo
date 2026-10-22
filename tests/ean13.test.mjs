import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { decodeEan13Image, decodeEan13Row, ean13Checksum, isbnFromEan13 } from "../features/ean13.js";

function readPgm(name) {
  const buffer = zlib.gunzipSync(fs.readFileSync(new URL(`./fixtures/${name}.pgm.gz`, import.meta.url)));
  const header = buffer.subarray(0, 20).toString("latin1").match(/^P5\n(\d+) (\d+)\n255\n/);
  const offset = header[0].length;
  return { width: Number(header[1]), height: Number(header[2]), data: new Uint8Array(buffer.subarray(offset)) };
}

test("somme de contrôle EAN-13 et ISBN-13", () => {
  assert.equal(ean13Checksum("9780441172719"), true);
  assert.equal(ean13Checksum("9780441172718"), false);
  assert.equal(isbnFromEan13("9780441172719"), "9780441172719");
  assert.equal(isbnFromEan13("5901234123457"), null, "un EAN non-livre n'est pas un ISBN");
});

for (const name of ["ean13-clean", "ean13-blur", "ean13-rotated", "ean13-dark"]) {
  test(`décode un vrai code-barres généré : ${name}`, () => {
    const { width, height, data } = readPgm(name);
    assert.equal(decodeEan13Image(data, width, height), "9780441172719");
  });
}

test("l'image inversée (lecture de droite à gauche) est aussi lue", () => {
  const { width, height, data } = readPgm("ean13-clean");
  const row = data.slice(Math.floor(height / 2) * width, (Math.floor(height / 2) + 1) * width).reverse();
  assert.equal(decodeEan13Row(row), "9780441172719");
});

test("aucune fausse lecture sur du bruit ou une image unie", () => {
  const noise = new Uint8Array(640 * 40).map((_, i) => (i * 2654435761 >>> 7) & 255);
  assert.equal(decodeEan13Image(noise, 640, 40), null);
  assert.equal(decodeEan13Image(new Uint8Array(640 * 40).fill(200), 640, 40), null);
});

import { scannerErrorMessage } from "../features/barcode-scanner.js";
test("messages d'erreur caméra compréhensibles", () => {
  assert.match(scannerErrorMessage({ name: "NotAllowedError" }), /refusé/);
  assert.match(scannerErrorMessage({ name: "NotFoundError" }), /Aucune caméra/);
  assert.match(scannerErrorMessage({ name: "NotReadableError" }), /autre application/);
  assert.match(scannerErrorMessage(new Error("x")), /ISBN/);
});
