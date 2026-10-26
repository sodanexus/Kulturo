import test from 'node:test';
import assert from 'node:assert/strict';
import { creatorRichText } from '../features/creator-rich-text.js';

test('les titres en italique et les expressions en gras sont rendus sans astérisques', () => {
  assert.equal(creatorRichText('Lire *Undercurrent*, **Coffee time** et du texte simple.'),
    'Lire <em>Undercurrent</em>, <strong>Coffee time</strong> et du texte simple.');
});

test('les descriptions restent sûres face au HTML fourni par une IA', () => {
  assert.equal(creatorRichText('<img src=x onerror=alert(1)> **Bonjour**'),
    '&lt;img src=x onerror=alert(1)&gt; <strong>Bonjour</strong>');
});

test('le texte sans Markdown reste inchangé et les apostrophes sont échappées', () => {
  assert.equal(creatorRichText('L’œuvre est belle.'), 'L’œuvre est belle.');
  assert.equal(creatorRichText("L'auteur"), 'L&#39;auteur');
});
