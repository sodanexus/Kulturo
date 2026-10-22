import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileFeature } from '../features/profile.js';
import { buildAppRoute, parseAppRoute } from '../features/app-route.js';
test('Profil : année par défaut, mensuel explicite conservé dans un lien et reset annuel',()=>{
 const profile=createProfileFeature({});
 assert.equal(profile.context().period,'year');
 assert.equal(parseAppRoute('#/dashboard').views.profile.period,'year');
 const route=parseAppRoute(buildAppRoute({page:'dashboard',views:{profile:{period:'month',month:'09',year:2026}}}));
 profile.restoreContext(route.views.profile);assert.equal(profile.context().period,'month');
 profile.reset();assert.equal(profile.context().period,'year');
});
