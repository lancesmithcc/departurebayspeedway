// Node-only regression checks against the same bundled Three.js used by the game.
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){
if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};
if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};
return next(s,c);
}`), import.meta.url);
const THREE = await import('three');
const { hedgeGeometry } = await import('../src/foliage.js');
const { applyStreetProfile, streetProfile, routeStation } = await import('../src/street-profile.js');
const { RiderAnimation } = await import('../src/rider-animation.js');
const map = JSON.parse(await readFile(new URL('../data/map.json',import.meta.url),'utf8'));
const routeBefore = JSON.stringify(map.route);
applyStreetProfile(map);
assert.equal(JSON.stringify(map.route),routeBefore,'reference centreline unchanged');
assert.equal(routeStation(map.route,map.route[0]),0);
assert.equal(streetProfile(1207).center,'single');
assert.equal(streetProfile(1866).center,'double');
assert.equal(streetProfile(369).center,'turn-lane');
assert.ok(streetProfile(1866).sidewalkLeft && !streetProfile(1866).sidewalkRight);
const foliage = hedgeGeometry();
const count = foliage.attributes.position.count;
assert.ok(count/3<=600);
for (const attr of Object.values(foliage.attributes)) {
  assert.equal(attr.count,count,'matching attribute counts');
  assert.ok([...attr.array].every(Number.isFinite),'finite foliage attributes');
}
const pos=foliage.attributes.position;
const a=new THREE.Vector3(),b=a.clone(),c=a.clone();
for(let i=0;i<count;i+=3){a.fromBufferAttribute(pos,i);b.fromBufferAttribute(pos,i+1);c.fromBufferAttribute(pos,i+2);assert.ok(b.sub(a).cross(c.sub(a)).length()>1e-8,'nondegenerate triangle');}
const materials=Object.fromEntries(['jersey','pants','helmetM','visorM','red','plastic','boot','glove'].map(k=>[k,new THREE.MeshStandardMaterial()]));
const rig=new RiderAnimation(materials);
const player={_lastBrake:0,_lastThrottle:1,pose:0,poseAmt:0,grounded:true,v:20,vy:0,lean:0,steerVis:0,wheelie:0,offroad:false,steerG:new THREE.Group()};
player.steerG.position.set(0,1.02,-0.60);
for(let i=0;i<120;i++)rig.update(1/60,player);
const rest=rig.sides[0].hand.clone();
player.pose=2;player.poseAmt=1;
for(let i=0;i<120;i++)rig.update(1/60,player);
assert.ok(rest.distanceTo(rig.sides[0].hand)>0.2,'no-hander moves hand off grip');
player.pose=1;player.grounded=false;
for(let i=0;i<120;i++)rig.update(1/60,player);
rig.root.traverse(o=>assert.ok([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite),'finite rider transforms'));
player.pose=0;player.grounded=true;player._landingImpact=8;
rig.update(1/60,player);
for(let i=0;i<240;i++)rig.update(1/60,player);
assert.ok(Math.abs(rig.compression)<0.03,'landing spring settles');
console.log(JSON.stringify({result:'PASS',routePoints:map.route.length,foliageTriangles:count/3,checks:['profile','paint transitions','sidewalk sides','foliage attributes','rider poses','landing recovery']}));
