import test from 'node:test';
import assert from 'node:assert/strict';
import { igdbMediaData } from '../features/igdb-media.js';

test('IGDB preserves edition-specific ratings and screenshots', () => {
 const data=igdbMediaData({rating:90,rating_count:2,screenshots:[{image_id:'edition'}],version_parent_details:{rating:70,rating_count:50,screenshots:[{image_id:'base'}]}});
 assert.equal(data.players.value,90);assert.equal(data.players.fromParent,false);assert.equal(data.screenshots[0].image_id,'edition');
});
test('IGDB missing edition media uses only the explicitly linked base game', () => {
 const data=igdbMediaData({version_parent_details:{rating:80,rating_count:10,aggregated_rating:85,aggregated_rating_count:2,screenshots:[{image_id:'base'}]}});
 assert.equal(data.players.fromParent,true);assert.equal(data.critics.value,85);assert.equal(data.screenshots.length,1);
 assert.equal(igdbMediaData({parent_game:{rating:90,rating_count:3}}).players,null);
});
test('IGDB accepts absent vote counts but rejects empty or invalid ratings', () => {
 assert.equal(igdbMediaData({rating:82}).players.value,82);
 for(const rating of [0,-1,101,'bad',null]) assert.equal(igdbMediaData({rating}).players,null);
 assert.equal(igdbMediaData({rating:82,rating_count:0}).players,null);
});
