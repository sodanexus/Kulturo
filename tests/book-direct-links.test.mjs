import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaLinks } from '../features/media-links.js';
const link = entry => mediaLinks({media_type:'book',title:'Example',...entry});
test('Hardcover ID and edition resolve to book ID route', () => {
  assert.deepEqual(link({source_api:'hardcover',external_id:'382700:8548995'}), [{url:'https://hardcover.app/book/382700',label:'Voir sur Hardcover',kind:'external'}]);
});
test('Open Library work and edition go directly to record', () => {
  assert.equal(link({source_api:'openlibrary',external_id:'OL45804W'})[0]?.url,'https://openlibrary.org/works/OL45804W');
  assert.equal(link({source_api:'openlibrary',external_id:'OL7353617M'})[0]?.url,'https://openlibrary.org/books/OL7353617M');
});
test('Unknown book IDs must not silently link to unrelated searches', () => {
  assert.deepEqual(link({source_api:'hardcover',external_id:'oops'}), []);
  assert.deepEqual(link({source_api:'openlibrary',external_id:'oops'}), []);
});
