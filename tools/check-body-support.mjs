import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`), import.meta.url);

const THREE=await import('three');
const {Terrain}=await import('../src/terrain.js');
const {settleBody}=await import('../src/body-support.js');
const {createCharacterCast}=await import('../src/character-cast.js');
const terrain=Object.create(Terrain.prototype);
terrain.meshHeight=()=>0;
const slab=new THREE.PlaneGeometry(4,4).rotateX(-Math.PI/2).translate(0,.28,0);
terrain.registerGroundGeometry(slab);
assert.ok(Math.abs(terrain.renderedGroundHeight(0,0)-.28)<1e-6);
assert.equal(terrain.renderedGroundHeight(2.1,0),0,'no phantom slab outside visible edge');
let checks=0;
for(const entry of createCharacterCast())for(const yaw of [0,.7,2]){
 const p=new THREE.Vector3(0,0,0),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,yaw,0,'YXZ')),scale=new THREE.Vector3(1,1,1);
 settleBody(entry.geometry,p,q,scale,()=>0);
 const v=entry.geometry.attributes.position,point=new THREE.Vector3();let min=Infinity;
 for(let i=0;i<v.count;i++){point.fromBufferAttribute(v,i).applyQuaternion(q).add(p);min=Math.min(min,point.y);}
 assert.ok(min>=-.005,entry.name+' fallen body must not sink');checks++;
}
console.log(JSON.stringify({result:'PASS',fallenBodyPoses:checks,visibleSlabBoundary:true}));
