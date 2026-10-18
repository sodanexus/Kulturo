import test from 'node:test';
import assert from 'node:assert/strict';
import { revealImage } from '../features/image-reveal.js';
const flush = () => new Promise(resolve=>setImmediate(resolve));
function fixture(reduced=false) {
 const saved=new Map(['requestAnimationFrame','matchMedia'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const frames=[], classes=new Set();let decodes=0;
 globalThis.requestAnimationFrame=fn=>frames.push(fn);globalThis.matchMedia=()=>({matches:reduced});
 const image={complete:true,naturalWidth:200,isConnected:true,src:'first',decode:async()=>{decodes++},classList:{contains:k=>classes.has(k),add:k=>classes.add(k)}};
 return {image,classes,frames,get decodes(){return decodes},step(){const batch=frames.splice(0);batch.forEach(fn=>fn())},restore(){for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}};
}
test('cached cover is decoded and hidden for an initial frame before fading',async()=>{
 const f=fixture();try{revealImage(f.image);revealImage(f.image);await flush();assert.equal(f.decodes,1);assert.equal(f.classes.size,0);f.step();assert.equal(f.classes.size,0);f.step();assert.equal(f.classes.has('is-loaded'),true);revealImage(f.image);await flush();assert.equal(f.decodes,1);}finally{f.restore()}
});
test('a detached cover is never revealed by a late load',async()=>{
 const f=fixture();try{revealImage(f.image);await flush();f.image.isConnected=false;f.step();f.step();assert.equal(f.classes.size,0);}finally{f.restore()}
});
test('changing image source during decode retries the current cover',async()=>{
 const f=fixture();try{revealImage(f.image);await flush();f.image.src='second';f.step();f.step();await flush();f.step();f.step();assert.equal(f.decodes,2);assert.equal(f.classes.has('is-loaded'),true);}finally{f.restore()}
});
test('reduced motion reveals a decoded cover without frame delays',async()=>{
 const f=fixture(true);try{revealImage(f.image);await flush();assert.equal(f.classes.has('is-loaded'),true);assert.equal(f.frames.length,0);}finally{f.restore()}
});
