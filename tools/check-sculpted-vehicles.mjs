import {register} from 'node:module';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const {buildSculptedVehicleKit}=await import('../src/sculpted-vehicles.js');
const {solveTrafficGrounding}=await import('../src/traffic.js');
const THREE=await import('three');
const result=[];
for(const car of buildSculptedVehicleKit()){
 assert.equal(car.renderParts.length,5);assert.equal(car.renderParts.filter(p=>p.tintable).length,1);
 for(const p of car.renderParts){for(const attr of Object.values(p.geometry.attributes))assert.ok(attr.array.every(Number.isFinite));}
 const box=car.geometry.boundingBox;assert.ok(Math.abs(box.min.y)<1e-6,'tyre contact is model origin');assert.ok(car.size.z>4.4&&car.size.z<5.6);
 const mesh=new THREE.Mesh(car.renderParts.find(p=>p.tintable).geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 const {halfTrack,front,rear}=car.contacts;
 for(const z of [front,rear]){
  const ray=new THREE.Raycaster(new THREE.Vector3(3,.5,z),new THREE.Vector3(-1,0,0),0,3-halfTrack+.05);
  assert.equal(ray.intersectObject(mesh).length,0,'wheel aperture not filled with body skin');
 }
 const pose=solveTrafficGrounding({renderedGroundHeight:(x,z)=>.21*x-.13*z},0,0,1.2,car.contacts);
 assert.ok(pose.contacts.every(p=>Math.abs(p.clearance)<1e-8));
 const triangles=car.geometry.attributes.position.count/3;assert.ok(triangles<26000);
 result.push({vehicle:car.url,triangles,batches:car.renderParts.length,dimensions:car.size.toArray()});
}
console.log(JSON.stringify({result:'PASS',vehicles:result,checks:['finite attributes','tyre origin','open arches','compound grade','paint-only tint','draw budget']}));
