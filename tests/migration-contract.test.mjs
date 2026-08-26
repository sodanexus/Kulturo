import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migration-journal.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../schema.sql", import.meta.url), "utf8");

test("la migration Journal ne supprime ni ne réinitialise les médias", () => {
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.media_entries/i);
  assert.doesNotMatch(migration, /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.media_entries/i);
  assert.doesNotMatch(migration, /TRUNCATE\s+(?:TABLE\s+)?public\.media_entries/i);
});

test("le backfill du Journal est réexécutable", () => {
  assert.match(migration, /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_media_events_dedupe/i);
  assert.match(migration, /ON\s+CONFLICT\s+DO\s+NOTHING/i);
});

test("le schéma neuf et la migration installent le même déclencheur", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.capture_media_event/i);
    assert.match(sql, /CREATE\s+TRIGGER\s+trg_capture_media_event/i);
    assert.match(sql, /CREATE\s+POLICY\s+"events_select_own"/i);
  }
});
