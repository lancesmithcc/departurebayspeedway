import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Reference: supplied RCMP duty-uniform photograph. Proportions and insignia
// are authored game geometry; officers are fictional, not portraits.
export function buildPoliceOfficer() {
  const root=new THREE.Group();root.name='RCMP patrol officer';
  const mats={shirt:new THREE.MeshStandardMaterial({color:0xc9d0d3,roughness:.92}),navy:new THREE.MeshStandardMaterial({color:0x17202c,roughness:.88}),vest:new THREE.MeshStandardMaterial({color:0x111923,roughness:.9}),skin:new THREE.MeshStandardMaterial({color:0xbe8c69,roughness:.82}),black:new THREE.MeshStandardMaterial({color:0x111214,roughness:.47}),gold:new THREE.MeshStandardMaterial({color:0xeac445,roughness:.65}),silver:new THREE.MeshStandardMaterial({color:0xb8bec4,metalness:.65,roughness:.3}),eye:new THREE.MeshStandardMaterial({color:0x242525,roughness:.6})};
  const batches=new Map();
  function part(parent,mat,geo,x,y,z){geo.translate(x,y,z);let b=batches.get(parent);if(!b)batches.set(parent,b=new Map());if(!b.has(mat))b.set(mat,[]);b.get(mat).push(geo.index?geo.toNonIndexed():geo);}
  const box=(p,m,w,h,d,x,y,z)=>part(p,m,new THREE.BoxGeometry(w,h,d),x,y,z);
  function oval(p,m,w,h,d,x,y,z){const g=new THREE.SphereGeometry(1,14,10);g.scale(w,h,d);part(p,m,g,x,y,z);}
  const hip=new THREE.Group();hip.position.y=.907;root.add(hip);
  oval(hip,'navy',.185,.14,.135,0,0,0);box(hip,'black',.39,.065,.285,0,.075,0);box(hip,'silver',.055,.044,.02,0,.078,-.151);
  for(const s of [-1,1]){box(hip,'black',.08,.135,.07,s*.2,.03,-.04);box(hip,'black',.07,.105,.07,s*.11,.01,.16);}
  const torso=new THREE.Group();hip.add(torso);
  oval(torso,'shirt',.22,.245,.135,0,.27,0);box(torso,'vest',.39,.36,.265,0,.25,-.015);
  for(const s of [-1,1]){box(torso,'vest',.078,.095,.04,s*.09,.19,-.17);box(torso,'navy',.08,.04,.15,s*.17,.445,0);box(torso,'silver',.024,.02,.016,s*.175,.469,-.02);}
  box(torso,'black',.06,.115,.035,-.16,.34,-.17);box(torso,'black',.013,.07,.013,-.175,.43,-.16);box(torso,'silver',.034,.035,.018,.13,.36,-.163);
  oval(torso,'skin',.064,.085,.061,0,.5,0);
  const head=new THREE.Group();head.position.y=.61;torso.add(head);
  oval(head,'skin',.092,.123,.089,0,0,-.008);oval(head,'skin',.065,.055,.075,0,-.064,-.025);
  oval(head,'skin',.023,.037,.035,0,-.005,-.095);
  for(const s of [-1,1]){oval(head,'skin',.019,.035,.024,s*.093,-.008,0);oval(head,'eye',.015,.008,.006,s*.035,.025,-.091);box(head,'navy',.034,.007,.008,s*.035,.045,-.087);}
  box(head,'skin',.042,.01,.016,0,-.048,-.091);oval(head,'navy',.096,.069,.09,0,.085,.008);
  oval(head,'navy',.102,.068,.098,0,.115,0);oval(head,'navy',.098,.011,.079,0,.082,-.072);oval(head,'gold',.015,.019,.006,0,.121,-.098);
  const legs=[],knees=[],arms=[],elbows=[];
  for(const s of [-1,1]){
    const leg=new THREE.Group();leg.position.set(s*.105,-.04,0);hip.add(leg);legs.push(leg);
    oval(leg,'navy',.091,.235,.09,0,-.205,0);box(leg,'gold',.009,.38,.022,s*.088,-.22,0);
    const knee=new THREE.Group();knee.position.y=-.42;leg.add(knee);knees.push(knee);oval(knee,'navy',.074,.207,.075,0,-.18,0);box(knee,'gold',.008,.31,.021,s*.073,-.18,0);oval(knee,'black',.08,.067,.14,0,-.38,-.044);box(knee,'black',.16,.028,.24,0,-.43,-.038);
    const arm=new THREE.Group();arm.position.set(s*.235,.4,0);torso.add(arm);arms.push(arm);
    oval(arm,'shirt',.079,.11,.076,0,-.075,0);oval(arm,'navy',.006,.033,.027,s*.077,-.06,0);oval(arm,'skin',.051,.115,.052,0,-.21,0);
    const elbow=new THREE.Group();elbow.position.y=-.29;arm.add(elbow);elbows.push(elbow);oval(elbow,'skin',.047,.122,.046,0,-.105,0);oval(elbow,'skin',.047,.057,.035,0,-.24,-.007);box(elbow,'black',.075,.025,.07,0,-.18,0);
  }
  const pistol=new THREE.Group();pistol.position.set(0,-.267,-.018);elbows[1].add(pistol);box(pistol,'black',.04,.075,.046,0,-.015,0);box(pistol,'black',.046,.043,.18,0,.032,-.058);box(pistol,'silver',.037,.008,.12,0,.057,-.076);
  const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:0xffc66e}));muzzle.scale.set(.6,.6,2);muzzle.position.set(0,.03,-.17);muzzle.visible=false;pistol.add(muzzle);
  if(typeof document!=='undefined'){
    const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#141c25';ctx.fillRect(0,0,256,64);ctx.fillStyle='#edf2f4';ctx.font='bold 44px sans-serif';ctx.textAlign='center';ctx.fillText('POLICE',128,48);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.9});for(const side of [-1,1]){const label=new THREE.Mesh(new THREE.PlaneGeometry(.23,.059),mat);label.position.set(0,.35,side*.151);if(side===-1)label.rotation.y=Math.PI;torso.add(label);}
  }
  for(const [parent,byMat] of batches)for(const [mat,geos]of byMat){const mesh=new THREE.Mesh(mergeGeometries(geos,false),mats[mat]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);for(const geo of geos)geo.dispose();}
  root.userData.rig={hip,torso,legs,knees,arms,elbows,muzzle,pistol};
  return root;
}
export function animatePoliceOfficer(root,time,mode='run',flash=false){const r=root.userData.rig,run=mode==='run';r.hip.position.y=.907+(run?Math.abs(Math.sin(time*9))*.025:0);r.torso.rotation.x=run?-.08:0;for(let i=0;i<2;i++){const step=Math.sin(time*9+i*Math.PI);r.legs[i].rotation.x=run?step*.58:(i?-.12:.12);r.knees[i].rotation.x=run?Math.max(0,-step)*.8:.06;r.arms[i].rotation.set(run?-step*.4:1.32,0,run?0:(i?-.3:.3));r.elbows[i].rotation.x=run?.85:.2;}r.pistol.rotation.x=run?0:-1.52;r.muzzle.visible=flash;}
function dispose(group){const geometries=new Set(),materials=new Set(),maps=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.map)maps.add(m.map);}});geometries.forEach(g=>g.dispose());maps.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();}
export class Police {
  constructor(scene,terrain,{audio=null,effects=null,onShot=()=>{},isBlocked=()=>false}={}){Object.assign(this,{scene,terrain,audio,effects,onShot,isBlocked});this.encounters=[];this.time=0;this.serial=0;}
  ground(x,z){if(this.terrain.renderedGroundHeight)return this.terrain.renderedGroundHeight(x,z);const rd=this.terrain.roadDeck?.(x,z);return rd&&rd.d<rd.hw+.3?rd.y:(this.terrain.meshHeight?.(x,z)??this.terrain.surfaceHeight?.(x,z)??0);}
  trigger(car){if(car?.type!=='rcmp'||!car.active||this.encounters.length>=2||this.encounters.some(e=>e.car===car&&e.gen===car.gen))return false;
    const officer=buildPoliceOfficer(),lights=new THREE.Group();lights.name='Flashing RCMP emergency lights';for(const side of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(.55,.12,.30),new THREE.MeshBasicMaterial({color:side<0?0xff1439:0x146cff}));m.position.set(side*.31,2.06,-.18);lights.add(m);}
    const a=car.headingSmooth??car.heading??0;let x=car.x-1.55*Math.cos(a),z=car.z+1.55*Math.sin(a);if(this.isBlocked(x,z)){x=car.x+1.55*Math.cos(a);z=car.z-1.55*Math.sin(a);}if(this.isBlocked(x,z)){dispose(officer);dispose(lights);return false;}
    officer.position.set(x,this.ground(x,z),z);officer.rotation.y=a;this.scene.add(officer,lights);car.policeStopped=true;car.v=0;
    this.audio?.blip?.(740,.18,.12,'sine');this.encounters.push({car,gen:car.gen,officer,lights,age:0,state:'exit',timer:1.1,cooldown:0,flash:0,shots:0,id:++this.serial,aim:new THREE.Vector3()});return true;}
  clear(e){if(e.car.gen===e.gen)e.car.policeStopped=false;dispose(e.officer);dispose(e.lights);if(e.tracer)dispose(e.tracer);e.fallGeometry?.dispose();this.encounters.splice(this.encounters.indexOf(e),1);}
  // Swept collision avoids fast bars passing through an officer between frames.
  // Only the nearest live encounter is defeated by one projectile.
  hitSegment(from,to,radius=.14){
    if(![from.x,from.y,from.z,to.x,to.y,to.z,radius].every(Number.isFinite)||radius<0)return null;
    const start=new THREE.Vector3().copy(from),delta=new THREE.Vector3().copy(to).sub(start),length=delta.length();
    const ray=new THREE.Ray(start,length?delta.clone().divideScalar(length):new THREE.Vector3(0,0,1));
    const box=new THREE.Box3(),point=new THREE.Vector3();let hit=null,nearest=Infinity;
    for(const e of this.encounters){
      if(e.state==='defeated'||!e.car.active||e.car.gen!==e.gen)continue;
      const p=e.officer.position;
      box.min.set(p.x-.38-radius,p.y-radius,p.z-.38-radius);
      box.max.set(p.x+.38+radius,p.y+1.9+radius,p.z+.38+radius);
      const distance=box.containsPoint(start)?0:ray.intersectBox(box,point)?start.distanceTo(point):Infinity;
      if(distance<=length&&distance<nearest){nearest=distance;hit=e;}
    }
    if(hit)this.defeat(hit);
    return hit;
  }
  raptureTouch(pos, effects) {
    if (!effects) return 0;
    let count=0;
    for (const e of this.encounters) {
      const p=e.officer.position;
      if (e.state==='defeated' || !e.car.active || e.car.gen!==e.gen || Math.abs(pos.y-p.y)>2.1 || Math.hypot(pos.x-p.x,pos.z-p.z)>1.45) continue;
      effects.ascend(e.officer);
      e.state='defeated';e.raptured=true;e.flash=0;e.officer.visible=false;
      e.officer.userData.rig.muzzle.visible=false;
      if(e.tracer){dispose(e.tracer);e.tracer=null;}
      count++;
    }
    return count;
  }
  defeat(e){
    if(!this.encounters.includes(e)||e.state==='defeated')return false;
    e.state='defeated';e.flash=0;e.cooldown=Infinity;e.fallTime=0;
    e.officer.userData.rig.muzzle.visible=false;
    if(e.tracer){dispose(e.tracer);e.tracer=null;}
    e.fallOrigin=e.officer.position.clone();e.fallHeading=e.officer.rotation.y;
    // Cache the frozen articulated pose in root space for actual body support.
    // Dense directional extrema retain curved boots and elbows while avoiding
    // a scan of every mesh vertex on each falling frame.
    e.officer.updateMatrixWorld(true);
    const inverse=e.officer.matrixWorld.clone().invert(),v=new THREE.Vector3(),positions=[];
    e.officer.traverse(o=>{if(!o.isMesh||!o.visible)return;const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(matrix);positions.push(v.x,v.y,v.z);}});
    e.fallGeometry=new THREE.BufferGeometry();e.fallGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const indices=new Set();
    for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++){
      if(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))!==3)continue;
      let best=-Infinity,index=0;
      for(let i=0;i<positions.length;i+=3){const dot=x*positions[i]+y*positions[i+1]+z*positions[i+2];if(dot>best){best=dot;index=i;}}
      indices.add(index);
    }
    e.supportPoints=[...indices].map(i=>new THREE.Vector3(positions[i],positions[i+1],positions[i+2]));
    this.audio?.voice?.('police_defeated',1,.18,5);
    return true;
  }
  clearLine(a,b){for(let t=.08;t<1;t+=.08){const x=THREE.MathUtils.lerp(a.x,b.x,t),z=THREE.MathUtils.lerp(a.z,b.z,t);if(this.isBlocked(x,z)||this.ground(x,z)>THREE.MathUtils.lerp(a.y+1.4,b.y+1,t))return false;}return true;}
  update(dt,player,active=true){if(!active)return;dt=Math.min(.1,Math.max(0,dt));this.time+=dt;const p=player.pos??player;
    for(const e of [...this.encounters]){const o=e.officer,c=e.car;e.age+=dt;if(e.state!=='defeated'&&e.age<1.25&&Math.floor(e.age/.22)!==Math.floor((e.age-dt)/.22))this.audio?.blip?.(Math.floor(e.age/.22)%2?980:740,.18,.1,'sine');if(!c.active||c.gen!==e.gen||e.age>25||o.position.distanceTo(p)>160){this.clear(e);continue;}
      e.lights.position.set(c.x,c.ySmooth??c.y??this.ground(c.x,c.z),c.z);if(c.groundQuaternion)e.lights.quaternion.copy(c.groundQuaternion);else e.lights.rotation.set(c.pitch??0,c.headingSmooth??c.heading??0,c.tilt??0);e.lights.children.forEach((m,i)=>m.visible=(Math.floor(this.time*12)%4<2)===(i===0));
      if(e.raptured)continue;
      if(e.state==='defeated'){
        e.fallTime+=dt;const t=Math.min(1,e.fallTime/.55),angle=-Math.PI/2*t*t*(3-2*t);
        o.rotation.set(angle,e.fallHeading,0,'YXZ');o.position.copy(e.fallOrigin);o.position.y=this.ground(o.position.x,o.position.z);
        const vertex=new THREE.Vector3();let lift=0;
        for(const point of e.supportPoints){vertex.copy(point).multiply(o.scale).applyQuaternion(o.quaternion).add(o.position);lift=Math.max(lift,this.ground(vertex.x,vertex.z)+.008-vertex.y);}
        o.position.y+=lift;
        continue;
      }
      e.flash=Math.max(0,e.flash-dt);if(e.tracer){e.tracer.visible=e.flash>0;}
      const dx=p.x-o.position.x,dz=p.z-o.position.z,dist=Math.hypot(dx,dz);o.rotation.y=Math.atan2(-dx,-dz);e.timer-=dt;e.cooldown-=dt;
      if(e.state==='exit'){if(e.timer<=0)e.state='run';}
      else if(e.state==='run'){
        if(dist>7){const step=Math.min(dist-7,4.6*dt),x=o.position.x+dx/dist*step,z=o.position.z+dz/dist*step,y=this.ground(x,z);if(!this.isBlocked(x,z)&&Math.abs(y-o.position.y)<.5)o.position.set(x,y,z);}
        if(dist<26&&e.cooldown<=0&&this.clearLine(o.position,p)){e.state='aim';e.timer=1.35;e.aim.copy(p);}
      }else if(e.state==='aim'){
        // Aim locks before firing. Continued riding or changing direction evades it.
        if(e.timer>.55)e.aim.copy(p);
        if(e.timer<=0){e.state='run';e.cooldown=2.1;e.flash=.085;e.shots++;this.audio?.noiseBurst?.(.1,1800,.2,'bandpass');this.audio?.blip?.(95,.11,.13,'triangle');o.updateMatrixWorld(true);const start=o.userData.rig.muzzle.getWorldPosition(new THREE.Vector3()),end=e.aim.clone().add(new THREE.Vector3(0,.9,0));if(e.tracer)dispose(e.tracer);e.tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineBasicMaterial({color:0xffdc90,transparent:true,opacity:.85}));this.scene.add(e.tracer);
          // Every third shot deliberately misses; range, cover and locked aim also gate hits.
          if(dist<28&&e.aim.distanceTo(p)<1.35&&e.shots%3!==1&&this.clearLine(o.position,p))this.onShot({officer:o,car:c,damage:1});
        }
      }
      animatePoliceOfficer(o,this.time,e.state==='run'&&dist>7?'run':'aim',e.flash>0);
    }
  }
  reset(){for(const e of [...this.encounters])this.clear(e);this.time=0;}
}
