import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {selectAddResult} from '../features/add-flow.js';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function fillFromApi('),source.indexOf('// ── CRUD'));
function fixture(){
 let resolve,rendered=0;
 const item={source_api:'hardcover',external_id:'2',title:'Work',media_type:'book'};
 const input={value:'Work',isConnected:true,blur(){}};
 const results={querySelector:()=>null,append(){}};
 const context=vm.createContext({AbortController,window:{_apiResults:[item]},document:{getElementById:id=>id==='f-api-search'?input:results,createElement:()=>({setAttribute(){},remove(){}})},Hardcover:{select:()=>new Promise(r=>{resolve=r;})},markModalDirty(){},toast(){},_wizardState:{step:1},selectAddResult,_renderWizard(){rendered++;}});
 vm.runInContext(fn,context);
 return{context,input,run:()=>context.fillFromApi(0),finish:()=>resolve({...item,external_id:'2:4',page_count:120}),renders:()=>rendered};
}
test('sélection : le formulaire attend les métadonnées de la même édition',async()=>{
 const f=fixture();const pending=f.run();assert.equal(f.renders(),0);f.finish();await pending;assert.equal(f.renders(),1);assert.equal(f.context.window._apiSelected.external_id,'2:4');assert.equal(f.context.window._apiSelected.page_count,120);
});
test('une réponse tardive ne rouvre pas une fenêtre fermée',async()=>{
 const f=fixture();const pending=f.run();f.input.isConnected=false;f.finish();await pending;assert.equal(f.renders(),0);
});
test('une nouvelle requête invalide la sélection précédente',async()=>{
 const f=fixture();const pending=f.run();f.input.value='Autre';f.finish();await pending;assert.equal(f.renders(),0);
});
