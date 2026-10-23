import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTmdbLogo, selectIgdbLogo, supportsTitleLogo, prefersTextTitle, setTextTitle} from '../features/title-logo.js';
test('Logos TMDb : français prioritaire, puis neutre, chemins sûrs et PNG',()=>{
 const image={width:500,height:160,vote_average:8};
 assert.equal(selectTmdbLogo([{...image,file_path:'/en.png',iso_639_1:'en'},{...image,file_path:'/fr.png',iso_639_1:'fr',vote_average:1}]),'https://image.tmdb.org/t/p/original/fr.png');
 assert.equal(selectTmdbLogo([{...image,file_path:'/neutral.png',iso_639_1:null},{...image,file_path:'/en.png',iso_639_1:'en'}]),'https://image.tmdb.org/t/p/original/neutral.png');
 assert.equal(selectTmdbLogo([{...image,file_path:'https://evil/a.png'},{...image,file_path:'/x.jpg'}]),null);
});
test('Logos IGDB : transparence obligatoire, blanc prioritaire, animations et images opaques écartées',()=>{
 const logo={alpha_channel:true,image_id:'color',image_type:{name:'Colour Logo'},width:500};
 assert.match(selectIgdbLogo([logo,{...logo,image_id:'white',image_type:{name:'White Logo'},width:200}]),/white.png$/);
 assert.equal(selectIgdbLogo([{...logo,alpha_channel:false},{...logo,animated:true},{...logo,image_id:'../bad'}]),null);
});
test('Logos : sources reconnues uniquement, préférence isolée par compte et œuvre',()=>{
 assert.equal(supportsTitleLogo({media_type:'book',source_api:'hardcover',external_id:1}),false);
 assert.equal(supportsTitleLogo({media_type:'game',source_api:'igdb',external_id:1}),true);
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try {setTextTitle({id:1},'a',true);assert.equal(prefersTextTitle({id:1},'a'),true);assert.equal(prefersTextTitle({id:1},'b'),false);setTextTitle({id:1},'a',false);assert.equal(prefersTextTitle({id:1},'a'),false);} finally {delete globalThis.localStorage;}
});

test('Logo : apparition après décodage uniquement, pas de mutation après fermeture ni en erreur',async()=>{
 const {mountTitleLogo}=await import('../features/title-logo.js');
 const originals={Image:globalThis.Image,requestAnimationFrame:globalThis.requestAnimationFrame};
 let behavior='ok',decoded=false;
 globalThis.requestAnimationFrame=cb=>cb();
 globalThis.Image=class {
   naturalWidth=500;isConnected=false;
   setAttribute(){} removeAttribute(){}
   set src(value){queueMicrotask(()=>behavior==='error'?this.onerror?.(new Error('failed')):this.onload?.());}
   async decode(){decoded=true;}
 };
 const title=()=>({isConnected:true,children:[],classList:{add(){assert.equal(decoded,true);}},append(img){img.isConnected=true;this.children.push(img);}});
 try {
   const good=title();await mountTitleLogo(good,async()=>'/logo.png');assert.equal(good.children.length,1);
   const absent=title();await mountTitleLogo(absent,async()=>null);assert.equal(absent.children.length,0);
   behavior='error';const bad=title();await mountTitleLogo(bad,async()=>'/bad.png');assert.equal(bad.children.length,0);
   behavior='ok';let complete;const closed=title();const pending=mountTitleLogo(closed,()=>new Promise(r=>complete=r));closed.isConnected=false;complete('/late.png');await pending;assert.equal(closed.children.length,0);
   const controller=new AbortController();controller.abort();const cancelled=title();await mountTitleLogo(cancelled,async()=>'/logo.png',{signal:controller.signal});assert.equal(cancelled.children.length,0);
 } finally {Object.assign(globalThis, originals);}
});

test('IGDB : métadonnée alpha absente acceptée, noir lisible en secours, historique en dernier',async()=>{
 const {selectIgdbLogoAsset}=await import('../features/title-logo.js');
 assert.match(selectIgdbLogo([{image_id:'unknown'}]),/unknown.png$/);
 const black={image_id:'black',image_type:{name:'Black Logo'}};
 assert.equal(selectIgdbLogoAsset([black]).monochrome,true);
 assert.match(selectIgdbLogo([black,{image_id:'old',image_type:{name:'Historical White Logo'}}]),/black.png$/);
 assert.match(selectIgdbLogo([black,{image_id:'white',image_type:{name:'White Logo'}}]),/white.png$/);
});

test('TMDb : SVG, dimensions absentes et langue originale restent utilisables',async()=>{
 const {tmdbLogoCandidates}=await import('../features/title-logo.js');
 const list=tmdbLogoCandidates([{file_path:'/original.svg',iso_639_1:'ja'},{file_path:'/fr.png',iso_639_1:'fr'}]);
 assert.match(list[0].url,/fr.png$/);assert.match(list[1].url,/original.svg$/);
});
test('Logo : une image cassée ne bloque pas le candidat suivant',async()=>{
 const {mountTitleLogo}=await import('../features/title-logo.js');
 const originals={Image:globalThis.Image,requestAnimationFrame:globalThis.requestAnimationFrame};let attempts=[];
 globalThis.requestAnimationFrame=cb=>cb();
 globalThis.Image=class {naturalWidth=500;isConnected=false;setAttribute(){}removeAttribute(){}async decode(){} set src(value){attempts.push(value);queueMicrotask(()=>value==='bad'?this.onerror?.(new Error()):this.onload?.());}};
 const title={isConnected:true,children:[],classList:{add(){}},append(img){img.isConnected=true;this.children.push(img);}};
 try{await mountTitleLogo(title,async()=>[{url:'bad'},{url:'good'}]);assert.deepEqual(attempts,['bad','good']);assert.equal(title.children.length,1);}finally{Object.assign(globalThis,originals);}
});
