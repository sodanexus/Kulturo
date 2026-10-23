import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { manualLogoUrl, supportsTitleLogo } from '../features/title-logo.js';
const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('logo manuel : https uniquement', () => {
  assert.equal(manualLogoUrl('https://a.example/l.png'), 'https://a.example/l.png');
  assert.equal(manualLogoUrl('http://a.example/l.png'), null);
  assert.equal(manualLogoUrl('javascript:alert(1)'), null);
  assert.equal(manualLogoUrl(''), null);
});

test('logo manuel : actif même sans identité API, pour films et jeux seulement', () => {
  assert.equal(supportsTitleLogo({media_type:'game', source_api:'manual', logo_url:'https://a.example/l.png'}), true);
  assert.equal(supportsTitleLogo({media_type:'book', logo_url:'https://a.example/l.png'}), false);
  assert.equal(supportsTitleLogo({media_type:'game', source_api:'manual'}), false);
});

test('logo manuel : formulaire, enregistrement prudent, API, SQL et sauvegarde', () => {
  const app = read('app.js');
  assert.match(app, /id="f-logo"/);
  assert.match(app, /if \(logo \|\| existing\?\.logo_url\) payload\.logo_url = logo \|\| null;/);
  assert.match(read('api.js'), /const manual = manualLogoUrl\(entry\.logo_url\);\s+if \(manual\) return \[\{url:manual\}\];/);
  assert.match(read('migrations/4.9.2-logo-url.sql'), /ADD COLUMN IF NOT EXISTS logo_url TEXT/);
  assert.match(read('schema.sql'), /logo_url\s+TEXT/);
  assert.match(read('features/backup-restore.js'), /"logo_url"/);
});
