// Joel Good's 2018 Snuneymuxw beachfront portal. Visual reconstruction, not a scan.
// Placement: supplied 04:36–04:40 footage. Carved faces point toward the water.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const PORTAL_SITE={x:-694,z:-1065,angle:Math.PI/2+.12,height:4.88};
export function buildBeachPortal(terrain,buildingGrid){
 const group=new THREE.Group();group.name='Snuneymuxw beachfront portal';
 const colors={cedar:0x98734d,cut:0x684c32,black:0x182728,red:0xa72e3b,turquoise:0x43a8ad,ivory:0xe5dfc9,beak:0xc39235,steel:0x444648,concrete:0xaaa698};
 const grainData=new Uint8Array(128*512*4);
 for(let y=0;y<512;y++)for(let x=0;x<128;x++){
  const wave=Math.sin(x*1.81+Math.sin(y*.024)*.65)+.45*Math.sin(x*5.7+y*.011);
  const v=Math.round(211+wave*20),i=(y*128+x)*4;
  grainData[i]=v;grainData[i+1]=v;grainData[i+2]=v;grainData[i+3]=255;
 }
 const grain=new THREE.DataTexture(grainData,128,512);grain.needsUpdate=true;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.magFilter=THREE.LinearFilter;grain.minFilter=THREE.LinearFilter;
 const parts=Object.fromEntries(Object.keys(colors).map(k=>[k,[]]));
 const add=(key,g,x=0,y=0,z=0)=>{g.translate(x,y,z);parts[key].push(g);};
 const ell=(key,x,y,z,sx,sy,sz)=>{const g=new THREE.SphereGeometry(1,20,14);g.scale(sx,sy,sz);add(key,g,x,y,z);};
 const box=(key,x,y,z,w,h,d)=>add(key,new THREE.BoxGeometry(w,h,d),x,y,z);
 const relief=(key,pts,z,depth=.025)=>{const shape=new THREE.Shape(pts.map(([x,y])=>new THREE.Vector2(x,y)));add(key,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.009,bevelThickness:.008,bevelSegments:1,steps:1}),0,0,z);};
 const eye=(x,y,z,s=.12)=>{ell('black',x,y,z,s*1.5,s, .037);ell('ivory',x,y,z+.031,s*.86,s*.76,.02);ell('black',x,y,z+.053,s*.44,s*.48,.015);};
 const ground=(x,z)=>terrain.renderedGroundHeight?.(x,z)??terrain.meshHeight(x,z)??terrain.groundHeight(x,z);
 const {x:cx,z:cz,angle}=PORTAL_SITE,base=ground(cx,cz);
 group.position.set(cx,base,cz);group.rotation.y=angle;
 const world=(x,z)=>[cx+Math.cos(angle)*x+Math.sin(angle)*z,cz-Math.sin(angle)*x+Math.cos(angle)*z];
 const collider=(x,z,w,d,h,gy)=>{
  const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>world(x+a,z+b));
  const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),b={pts,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs),h,gy,name:group.name};
  buildingGrid?.insertAABB(b.x0,b.z0,b.x1,b.z1,b);
 };
 for(const side of [-1,1]){
  const x=side*1.73,[wx,wz]=world(x,0),foot=ground(wx,wz)-base;
  box('concrete',x,foot+.08,0,.86,.2,.9);
  const post=new THREE.CylinderGeometry(.31,.39,4.64,24,20);add('cedar',post,x,foot+2.52,0);
  // Vertical splits and tool marks on the unpainted back, seen from the road.
  for(let i=0;i<20;i++){
   const a=i/20*Math.PI*2,r=.337;
   const g=new THREE.CylinderGeometry(.003,.006,2.7+(i%4)*.3,3);add('cut',g,x+Math.cos(a)*r,foot+2.4,Math.sin(a)*r);
  }
  for(const y of [.29,.62])for(const dx of [-.27,.27])ell('steel',x+dx,foot+y,.31,.026,.026,.025);
  // Stacked carved forms: broad lower face, relief eyes and curved beak/mouth.
  ell('cedar',x,1.18,.24,.37,.63,.22);
  for(const e of [-1,1]){ell('red',x+e*.18,1.4,.418,.19,.15,.05);eye(x+e*.18,1.4,.47,.105);}
  relief('black',[[x-.31,.95],[x-.2,1.08],[x+.24,1.08],[x+.32,.95],[x+.22,.86],[x-.24,.86]],.43);
  box('ivory',x,.98,.48,.4,.05,.018);
  ell('cedar',x,2.15,.21,.37,.48,.23);
  for(const e of [-1,1]){relief('black',[[x+e*.05,2.38],[x+e*.31,2.41],[x+e*.33,2.2],[x+e*.08,2.24]],.4);eye(x+e*.18,2.28,.47,.105);}
  ell('black',x,1.99,.445,.18,.055,.055);
  // Dark feather panels with turquoise and red inset shapes visible in close photo.
  for(let row=0;row<3;row++)for(const sideWing of [-1,1]){
   const u=x+sideWing*.18,v=2.64+row*.36;
   ell('black',u,v,.3,.16,.29,.12);ell('turquoise',u,v+.045,.412,.105,.19,.018);ell('cedar',u,v+.075,.431,.067,.15,.012);
   relief('red',[[u-.07,v-.11],[u,v-.16],[u+.07,v-.11],[u,v-.21]],.435,.01);
  }
  // Distinct bird heads at the top: raven and pale eagle, both seaward-facing.
  ell(side===1?'ivory':'black',x,4.29,.07,.35,.43,.34);
  for(const e of [-1,1]){ell('turquoise',x+e*.18,4.33,.343,.16,.19,.035);eye(x+e*.17,4.35,.384,.11);}
  const beak=new THREE.Shape();beak.moveTo(x-.15,4.27);beak.quadraticCurveTo(x,4.44,x+.15,4.27);beak.lineTo(x+.13,4.05);beak.lineTo(x,3.97);beak.lineTo(x-.13,4.05);beak.closePath();
  add(side===1?'beak':'black',new THREE.ExtrudeGeometry(beak,{depth:.48,bevelEnabled:true,bevelSize:.035,bevelThickness:.03,bevelSegments:2}),0,0,.23);
  collider(x,0,.82,.95,4.88,base+foot);
 }
 // The red steel frog-shaped portal: open passage, real cutouts, no opaque panel.
 const s=new THREE.Shape();s.moveTo(-1.4,.22);s.lineTo(-1.4,3.47);s.bezierCurveTo(-1.35,4.28,-.76,4.35,-.36,3.95);s.quadraticCurveTo(0,3.7,.36,3.95);s.bezierCurveTo(.76,4.35,1.35,4.28,1.4,3.47);s.lineTo(1.4,.22);s.lineTo(1.11,.22);s.lineTo(1.11,1.53);s.bezierCurveTo(1.07,2.7,-1.07,2.7,-1.11,1.53);s.lineTo(-1.11,.22);s.closePath();
 const hole=(draw)=>{const p=new THREE.Path();draw(p);s.holes.push(p);};
 for(const e of [-1,1]){
  hole(p=>{p.moveTo(e*.56,3.92);p.quadraticCurveTo(e*.99,4.12,e*1.2,3.63);p.quadraticCurveTo(e*.72,3.36,e*.56,3.92);});
  hole(p=>{p.moveTo(e*.17,3.58);p.quadraticCurveTo(e*.29,3.82,e*.45,3.31);p.lineTo(e*.17,3.4);p.closePath();});
  hole(p=>{p.moveTo(e*1.22,3.18);p.quadraticCurveTo(e*.68,3.48,e*.1,3.01);p.quadraticCurveTo(e*.73,3.23,e*1.22,2.99);p.closePath();});
  hole(p=>{p.moveTo(e*.14,2.79);p.lineTo(e*.42,3.02);p.quadraticCurveTo(e*.73,2.96,e*.94,2.7);p.quadraticCurveTo(e*.52,2.94,e*.14,2.79);});
  hole(p=>{p.moveTo(e*1.2,.61);p.quadraticCurveTo(e*1.37,.9,e*1.21,1.2);p.closePath();});
 }
 add('red',new THREE.ExtrudeGeometry(s,{depth:.07,bevelEnabled:true,bevelSize:.014,bevelThickness:.009,bevelSegments:2,curveSegments:24}),0,0,-.06);
 for(const side of [-1,1])for(const y of [.65,2.5,3.6])box('steel',side*1.47,y,-.02,.39,.07,.11);
 // Only the narrow legs block ground-level movement; the opening stays passable.
 for(const side of [-1,1])collider(side*1.27,0,.26,.12,3.4,base);
 for(const [key,geos] of Object.entries(parts)){
  if(!geos.length)continue;const flat=geos.map(g=>g.index?g.toNonIndexed():g),geo=mergeGeometries(flat,false);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:colors[key],roughness:key==='red'?.44:.86,metalness:key==='red'?.48:key==='steel'?.7:0}));if(key==='cedar'){mesh.material.map=grain;mesh.material.bumpMap=grain;mesh.material.bumpScale=.018;}mesh.name=key;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  new Set([...geos,...flat]).forEach(g=>g.dispose());
 }
 group.userData={sourceFrames:['t04m36.0s_02761.jpg','t04m40.0s_02801.jpg'],artist:'Joel Good',year:2018,estimatedPlacement:true,reportedPoleHeight:4.88};
 return group;
}
