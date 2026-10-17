import test from 'node:test';
import assert from 'node:assert/strict';
import { animateSynopsis } from '../features/synopsis-motion.js';

function fixture() {
  const original = new Map(['requestAnimationFrame','cancelAnimationFrame','getComputedStyle','matchMedia','performance','document'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let clock=0, next=0, expanded=false;
  const callbacks=new Map();
  function style() {
    const props=new Map();
    return {getPropertyValue:k=>props.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k),
      get cssText(){return ''},set cssText(v){delete this.height;delete this.minHeight;delete this.maxHeight;delete this.overflow;}};
  }
  const modal={classList:{contains:()=>true}};
  const body={appendChild() {},style:style(),scrollTop:0,closest:()=>modal,getBoundingClientRect:()=>({top:0})};
  const attrs=new Set();
  const section={style:style(),setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k),getBoundingClientRect:()=>({top:300-body.scrollTop,height:section.style.height?parseFloat(section.style.height):(expanded?600:120)})};
  const clip={style:style(),getBoundingClientRect:()=>({height:clip.style.height?parseFloat(clip.style.height):(expanded?560:80)})};
  const wrap={querySelector:()=>clip,isConnected:true,closest:s=>s==='.detail-body'?body:section,classList:{toggle:(c,v)=>{expanded=v}}};
  Object.assign(globalThis,{
    document:{createElement:()=>({style:{},setAttribute(){},remove(){}})},
    requestAnimationFrame:fn=>{callbacks.set(++next,fn);return next},cancelAnimationFrame:id=>callbacks.delete(id),
    performance:{now:()=>clock},matchMedia:()=>({matches:false}),getComputedStyle:()=>({paddingBottom:'8px',getPropertyValue:()=> '64px'})
  });
  return {wrap,body,section,clip,attrs,step(time){clock=time;const batch=[...callbacks.values()];callbacks.clear();batch.forEach(fn=>fn(time));},restore(){for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}};
}
test('synopsis height and scroll share the same progress and clean up after collapse',()=>{
 const f=fixture();try{
  animateSynopsis(f.wrap,true);f.step(175);
  assert.equal(parseFloat(f.clip.style.height),320);
  assert.equal(parseFloat(f.section.style.height),360);
  assert.equal(f.body.scrollTop,114);
  f.step(350);assert.equal(f.body.scrollTop,228);assert.equal(f.attrs.size,0);
  animateSynopsis(f.wrap,false);f.step(525);
  assert.equal(parseFloat(f.clip.style.height),320);
  assert.equal(parseFloat(f.section.style.height),360);assert.equal(f.body.scrollTop,114);
  f.step(700);assert.equal(f.clip.style.height,undefined);assert.equal(f.body.scrollTop,0);assert.equal(f.body.style.getPropertyValue('padding-bottom'),'');
 }finally{f.restore()}
});
test('reversing a synopsis animation starts at its visible position',()=>{
 const f=fixture();try{
  animateSynopsis(f.wrap,true);f.step(175);
  animateSynopsis(f.wrap,false);
  assert.equal(parseFloat(f.clip.style.height),320);
  assert.equal(parseFloat(f.section.style.height),360);assert.equal(f.body.scrollTop,114);
  f.step(525);assert.equal(f.body.scrollTop,0);assert.equal(f.attrs.size,0);
 }finally{f.restore()}
});
