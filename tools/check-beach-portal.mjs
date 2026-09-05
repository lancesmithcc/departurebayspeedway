import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`), import.meta.url);


const THREE=await import('three');
const {Grid}=await import('../src/util.js');
const {buildBeachPortal,PORTAL_SITE}=await import('../src/beach-portal.js');
const {sweepBuildingContact}=await import('../src/player.js');
const grid=new Grid(12),p=buildBeachPortal({renderedGroundHeight:()=>3},grid);
let triangles=0;p.traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;assert.ok([...a.array].every(Number.isFinite));triangles+=a.count/3;}});
assert.equal(p.position.y,3);
const world=(x,z)=>new THREE.Vector3(x,1,z).applyAxisAngle(new THREE.Vector3(0,1,0),PORTAL_SITE.angle).add(p.position);
assert.equal(sweepBuildingContact(grid,world(0,-3),world(0,3),.5,1.6),null,'central passage open');
assert.ok(sweepBuildingContact(grid,world(1.73,-3),world(1.73,3),.5,1.6),'cedar post solid');
console.log(JSON.stringify({result:'PASS',triangles,meshes:p.children.length,checks:['finite geometry','ground placement','open passage','solid posts']}));
