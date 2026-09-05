import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
globalThis.ProgressEvent=class {constructor(type,fields){this.type=type;Object.assign(this,fields)}};
const T=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {levelModel,fitModel}=await import('../src/models.js');
const {AuthoredRiderAnimation}=await import('../src/authored-rider-animation.js');
const bytes=await readFile(new URL('../Main-Character/gla6ndzKeKQ4tFJdAE4lu_model.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binStart=20+jsonLength+8;
json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(binStart).toString('base64');
// Textures are checked in the browser; Node needs geometry/UVs, not an image decoder.
for(const m of json.meshes)for(const p of m.primitives)delete p.material;
delete json.materials;delete json.textures;delete json.images;delete json.samplers;
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
assert.equal(gltf.animations.length,0,'source has no authored clips');
const model=levelModel(gltf.scene)||gltf.scene;fitModel(model,2.15,'z');model.rotation.y+=Math.PI;
const bike=new T.Group();bike.rotation.set(.3,.6,.2);bike.position.set(100,15,-200);bike.add(model);
const rig=new AuthoredRiderAnimation(model,bike);
const original=rig.parts.map(p=>p.original.attributes.position.array.slice());
const state={v:24,grounded:true,lean:.7,steerVis:1,_lastThrottle:1};
for(let frame=0;frame<720;frame++){
 state._landingImpact=frame===120?20:0;state._lastBrake=frame>240?1:0;
 rig.update(frame%60===0?.2:1/60,state);
 for(const p of rig.parts){assert.ok(p.position.array.every(Number.isFinite));assert.ok(p.normal.array.every(Number.isFinite));}
}
assert.ok(Math.abs(rig.compression)<.0001,'landing spring settles');
for(const [j,p] of rig.parts.entries()){
 assert.deepEqual(p.original.attributes.position.array,original[j],'source immutable');
 assert.deepEqual(p.geometry.attributes.uv.array,p.original.attributes.uv.array,'UVs preserved');
 const animated=new Set(p.entries.map(e=>e.i));
 let moved=0;
 for(let i=0;i<p.position.count;i++)for(let k=0;k<3;k++){
  const a=p.position.array[i*3+k],b=original[j][i*3+k];
  if(!animated.has(i))assert.equal(a,b,'bike region fixed');else if(Math.abs(a-b)>1e-4)moved++;
 }
 assert.ok(moved>100,'authored vertices animate');
}
rig.reset();
let idleLookMin=0,idleLookMax=0;
for(let frame=0;frame<17*60;frame++){
 rig.update(1/60,{v:0,grounded:true});
 idleLookMin=Math.min(idleLookMin,rig.look);idleLookMax=Math.max(idleLookMax,rig.look);
}
assert(idleLookMin<-.18 && idleLookMax>.24,'idle glances look both ways');
rig.reset();for(let i=0;i<180;i++)rig.update(1/60,{v:30,grounded:true,steerVis:1,lean:.5});
assert(rig.look>.35 && rig.look<=.48,'steering looks ahead without twisting neck excessively');
rig.reset();rig.update(0,{v:0,grounded:true});
for(const [j,p] of rig.parts.entries())for(let i=0;i<p.position.array.length;i++)assert.ok(Math.abs(p.position.array[i]-original[j][i])<2e-5,'rest pose restored');
rig.dispose();assert.equal(rig.parts.length,0);
console.log(JSON.stringify({result:'PASS',checks:['real GLB','transformed parent','source preservation','UV preservation','fixed bike','animated rider','spring recovery','idle glances','turn look ahead','rest pose','dispose']}));
