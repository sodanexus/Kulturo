import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncVersion } from '../scripts/sync-version.mjs';
const names=['VERSION','package.json','package-lock.json','config.js','src/main.ts','index.html','manifest.json','sw.js','README.md','DEPLOYMENT.md','tests/README.md','tests/browser-server.mjs'];
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kulturo-version-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const name of names){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.copyFileSync(new URL('../'+name,import.meta.url),path.join(root,name));}
  return root;
}
test('VERSION régénère les références périmées sans modifier les dépendances ni les réglages',t=>{
 const root=fixture(t);const before=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));const config=fs.readFileSync(path.join(root,'config.js'),'utf8');
 fs.writeFileSync(path.join(root,'VERSION'),'9.8.7\n');
 assert.equal(syncVersion(root),'9.8.7');
 const after=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
 assert.deepEqual(after.packages['node_modules/vite'],before.packages['node_modules/vite']);
 assert.equal(fs.readFileSync(path.join(root,'config.js'),'utf8'),config.replace(/version:\s*["']\d+\.\d+\.\d+["']/,'version: "9.8.7"'));
 assert.match(fs.readFileSync(path.join(root,'src/main.ts'),'utf8'),/KULTURO_RUNTIME = "9.8.7"/);
 assert.match(fs.readFileSync(path.join(root,'sw.js'),'utf8'),/kulturo-static-v9.8.7/);
 const once=names.map(n=>fs.readFileSync(path.join(root,n),'utf8'));syncVersion(root);assert.deepEqual(names.map(n=>fs.readFileSync(path.join(root,n),'utf8')),once);
});
test('une version invalide ou un fichier sans référence bloque avant toute écriture',t=>{
 const root=fixture(t);const original=fs.readFileSync(path.join(root,'package.json'),'utf8');
 fs.writeFileSync(path.join(root,'VERSION'),'incorrect');assert.throws(()=>syncVersion(root));
 fs.writeFileSync(path.join(root,'VERSION'),'9.8.7');fs.writeFileSync(path.join(root,'src/main.ts'),'import "../app.js";');assert.throws(()=>syncVersion(root));
 assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),original);
});
