import {register} from 'node:module';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const THREE=await import('three');
const {Police}=await import('../src/police.js');
let checks=0;
for(const slope of [false,true]){
  const scene=new THREE.Scene(),height=(x,z)=>2+(slope?.13*x-.08*z:0);
  const voices=[];let shots=0;
  const police=new Police(scene,{renderedGroundHeight:height},{audio:{voice:(...args)=>voices.push(args)},onShot:()=>shots++});
  const car={type:'rcmp',active:true,gen:1,x:0,y:2,z:0,heading:.6,v:10};
  assert.ok(police.trigger(car));const e=police.encounters[0],p=e.officer.position.clone();
  e.state='aim';e.timer=.001;e.shots=1;e.officer.userData.rig.muzzle.visible=true;
  e.tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p,p.clone().addScalar(1)]),new THREE.LineBasicMaterial());
  scene.add(e.tracer);const tracer=e.tracer;
  assert.equal(police.hitSegment({x:p.x-10,y:p.y+4,z:p.z},{x:p.x+10,y:p.y+4,z:p.z}),null,'bar over head misses');
  assert.equal(police.hitSegment({x:p.x-10,y:p.y+1,z:p.z},{x:p.x+10,y:p.y+1,z:p.z}),e,'fast crossing bar defeats officer');
  assert.equal(e.state,'defeated');assert.equal(tracer.parent,null);assert.equal(e.officer.userData.rig.muzzle.visible,false);
  assert.equal(police.hitSegment({x:p.x-10,y:p.y+1,z:p.z},{x:p.x+10,y:p.y+1,z:p.z}),null,'corpse cannot be defeated twice');
  assert.equal(police.defeat(e),false);assert.equal(voices.length,1);assert.equal(voices[0][0],'police_defeated');assert.ok(voices[0][3]>=3,'high-priority defeat voice');
  const player={pos:new THREE.Vector3(p.x, p.y, p.z-9)};
  for(let i=0;i<60;i++){
    police.update(.05,player);
    const pos=e.fallGeometry.attributes.position,v=new THREE.Vector3();let min=Infinity;
    for(let j=0;j<pos.count;j++){
      v.fromBufferAttribute(pos,j).applyQuaternion(e.officer.quaternion).add(e.officer.position);
      min=Math.min(min,v.y-height(v.x,v.z));
    }
    assert.ok(min>=-.004,`falling body stays above visible surface: ${min} frame ${i} slope ${slope}`);
    assert.ok(min<.025,'body remains grounded through fall');checks++;
  }
  assert.equal(shots,0,'defeated officer cannot finish locked shot');assert.equal(voices.length,1);
  assert.ok(Math.abs(e.officer.rotation.x+Math.PI/2)<1e-9,'officer lies down');
  let disposed=false;e.fallGeometry.addEventListener('dispose',()=>disposed=true);
  police.reset();assert.ok(disposed);assert.equal(scene.children.length,0);assert.equal(car.policeStopped,false);
}
// Nearest hit wins, and recycling a patrol car still cleans up the corpse.
const scene=new THREE.Scene(),police=new Police(scene,{renderedGroundHeight:()=>0});
const cars=[0,6].map(z=>({type:'rcmp',active:true,gen:1,x:0,y:0,z,heading:0,v:10}));
cars.forEach(car=>assert.ok(police.trigger(car)));
const [near,far]=police.encounters;
assert.equal(police.hitSegment({x:-1.55,y:1,z:-5},{x:-1.55,y:1,z:12}),near);
assert.notEqual(far.state,'defeated');
cars[0].gen++;police.update(.05,{pos:new THREE.Vector3(-1.55,0,-5)});
assert.ok(!police.encounters.includes(near));assert.equal(police.encounters.length,1);
assert.equal(police.hitSegment({x:NaN,y:1,z:0},{x:0,y:1,z:1}),null);
police.reset();assert.equal(scene.children.length,0);
console.log(JSON.stringify({result:'PASS',groundedFallFrames:checks,checks:['swept bar collision','height miss','nearest officer only','voice once at high priority','shot cancelled','flat and sloped body contact','generation cleanup','reset disposes corpse resources']}));
