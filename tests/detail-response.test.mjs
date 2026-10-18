import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDetailResponse} from '../features/detail-enrichment.js';
test('stale persistence cannot replace fresh catalogue ratings or active request state', () => {
 const ratings=[{source:'igdb',value:87}];
 const entry={id:'game',external_ratings:ratings,cast_people:[{name:'New'}],_detailsFetching:true,_detailsFetchingSession:5};
 mergeDetailResponse(entry,{description:'Saved',external_ratings:[],cast_people:[],_detailsFetching:false,_detailsFetchingSession:2});
 assert.equal(entry.external_ratings,ratings);
 assert.deepEqual(entry.cast_people,[{name:'New'}]);
 assert.equal(entry._detailsFetching,true);
 assert.equal(entry._detailsFetchingSession,5);
 assert.equal(entry.description,'Saved');
});
