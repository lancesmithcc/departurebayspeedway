import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {register} from 'node:module';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const THREE=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {fitModel}=await import('../src/models.js');
const {addChurchCharacterDetail}=await import('../src/church-character-detail.js');
// Canvas texture is visually checked in browser; this test covers rig/state geometry.
globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){}}}}}};
const bytes=await fs.readFile(new URL('../assets/peds/person-1.glb',import.meta.url));
const loadGLBFull=()=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
let source = await fs.readFile(new URL('../src/props.js',import.meta.url), 'utf8');
source = source.slice(source.indexOf('  // ---- Jesus, out on the grass'), source.indexOf('  // ---- the sign beside the front steps'));
source = source.replace("import('./models.js')", 'Promise.resolve(modelTools)');
const make = new Function('THREE','modelTools','opts','addChurchCharacterDetail',`const lx=0,lz=0,lawnY=0,faceAng=0; const g=new THREE.Group(); const rand=(a,b)=>(a+b)/2; let dead=false;const setJesusDead=v=>dead=v;const recolorFlattened=geo=>geo.clone();${source}\nreturn {characterDetail,jesus,rig,headDetails,tail,horns,bodyFrames,animateJesus,becomeSatan,riseAsSatan,satanSlain,reviveJesus,get live(){return liveCharacter},get dead(){return dead}};`);
const geo = new THREE.BoxGeometry(.3, 1.74, .2).translate(0,.87,0);
const c = make(THREE,{loadGLBFull,fitModel},{pedKit:[{url:'person-1.glb',parts:[],geometry:geo,material:new THREE.MeshStandardMaterial()}]},addChurchCharacterDetail);
for(let i=0;!c.live && i<100;i++) await new Promise(r=>setTimeout(r,10));
assert.ok(c.live, 'original skeleton loads');
assert.equal(c.bodyFrames.some(f=>f.visible), false, 'no duplicate body');
assert.ok(c.live.actions.greet && c.live.actions.attack && c.live.actions.run);
const poses=[];
for(let frame=0;frame<600;frame++){ c.jesus.position.x += frame<300 ? .016 : 0; c.animateJesus(frame/60,1/60);if(frame%100===0)poses.push(c.live.layers.map(l=>l.bone.quaternion.toArray())); }
assert.notDeepEqual(poses[0],poses[4], 'joints articulate');
for(const mode of ['fallen','risen','slain','revived']){
 if(mode==='fallen')c.becomeSatan(); if(mode==='risen')c.riseAsSatan(); if(mode==='slain')c.satanSlain(); if(mode==='revived')c.reviveJesus();
 for(let f=0;f<180;f++)c.animateJesus(10+f/60,1/60);
 c.jesus.traverse(o=>{assert.ok([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite), `${mode}: finite transform ${o.name}`)});
 if(mode==='risen')assert.ok(c.tail.visible && c.horns.every(h=>h.visible));
 if(mode==='revived'){
   assert.ok(!c.dead && !c.tail.visible && c.horns.every(h=>!h.visible));
   c.characterDetail.eyes.forEach(eye=>assert.equal(eye.children[1].material.emissive.getHex(),0,'eye glow resets'));
 }
 c.characterDetail.face.traverse(o=>{if(o.geometry)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});
}
console.log(JSON.stringify({result:'PASS',authoredClips:Object.keys(c.live.actions),jointSamples:poses.length,lifecycle:'holy -> fallen -> Satan -> slain -> revived',bodyCount:c.bodyFrames.filter(m=>m.visible).length+1}));
