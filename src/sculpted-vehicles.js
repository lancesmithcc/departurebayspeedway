// Continuous body panels, recessed glazing and open wheel arches. Metres, nose -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SPECS = {
  sedan:{length:4.55,width:1.83,roof:1.48,shoulder:.93,front:-1.44,rear:1.4,radius:.345,cabFront:-1.12,cabRear:1.45,roofFront:-.48,roofRear:.68},
  suv:{length:4.75,width:1.95,roof:1.83,shoulder:1.13,front:-1.5,rear:1.49,radius:.405,cabFront:-1.13,cabRear:2.01,roofFront:-.6,roofRear:1.54},
  pickup:{length:5.25,width:1.97,roof:1.89,shoulder:1.18,front:-1.68,rear:1.66,radius:.425,cabFront:-1.3,cabRear:.63,roofFront:-.74,roofRear:.43},
};
const mat = (color,roughness,metalness,more={}) => new THREE.MeshStandardMaterial({color,roughness,metalness,vertexColors:true,...more});
function workshop(){
  const materials={paint:mat(0xffffff,.27,.58),glass:mat(0x24404b,.12,.72),rubber:mat(0x191b1e,.84,.02),metal:mat(0xa1a8af,.24,.87),lamp:mat(0xffffff,.23,.3,{emissive:0xffffff,emissiveIntensity:.12})},buckets={};
  const add=(g,key='paint',color=0xffffff)=>{if(g.index)g=g.toNonIndexed();const c=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(a.length/3*2),2));(buckets[key]??=[]).push(g);};
  const box=(w,h,d,x,y,z,key='paint',color=0xffffff,bevel=.025)=>{
    const shape=new THREE.Shape(),a=w/2,b=h/2,r=Math.min(bevel,a*.45,b*.45);shape.moveTo(-a+r,-b);shape.lineTo(a-r,-b);shape.quadraticCurveTo(a,-b,a,-b+r);shape.lineTo(a,b-r);shape.quadraticCurveTo(a,b,a-r,b);shape.lineTo(-a+r,b);shape.quadraticCurveTo(-a,b,-a,b-r);shape.lineTo(-a,-b+r);shape.quadraticCurveTo(-a,-b,-a+r,-b);
    const g=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.001,d-2*r),steps:1,curveSegments:2,bevelEnabled:true,bevelSize:r*.5,bevelThickness:r,bevelSegments:1});g.translate(x,y,z-(d-2*r)/2);add(g,key,color);
  };
  const tube=(points,r,key='rubber',color=0xffffff)=>{const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i-1]),new THREE.Vector3(...points[i])));add(new THREE.TubeGeometry(curve,Math.max(4,points.length*3),r,6,false),key,color);};
  const quad=(points,key='paint',color=0xffffff)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,1,2,0,2,3].flatMap(i=>points[i]),3));g.computeVertexNormals();add(g,key,color);};
  const loft=(rings,key='paint')=>{const positions=[],indices=[],n=rings[0].length;rings.forEach(r=>r.forEach(p=>positions.push(...p)));for(let j=0;j<rings.length-1;j++)for(let i=0;i<n-1;i++){const a=j*n+i;indices.push(a,a+n,a+1,a+1,a+n,a+n+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(g,key);};
  return {add,box,tube,quad,loft,finish(){return Object.entries(buckets).map(([key,geos])=>({name:`Sculpted ${key}`,geometry:mergeGeometries(geos,false),material:materials[key],tintable:key==='paint'}));}};
}

export function buildSculptedVehicle(type='sedan'){
  const s=SPECS[type];if(!s)throw new Error(`Unknown sculpted vehicle ${type}`);
  const k=workshop(),half=s.width/2,end=s.length/2,track=half-.065,R=s.radius;
  const shoulder=z=>s.shoulder-.13*Math.pow(Math.abs(z/end),4);
  const arch=z=>{let bottom=.3;for(const axle of [s.front,s.rear]){const dz=z-axle,ar=R+.075;if(Math.abs(dz)<ar)bottom=Math.max(bottom,R+Math.sqrt(ar*ar-dz*dz));}return bottom;};
  // Side skins terminate on the arch curve instead of filling the tyre openings.
  for(const side of [-1,1]){
    const rings=[];for(let i=0;i<=112;i++){const z=-end+i*s.length/112,b=arch(z),top=shoulder(z),taper=1-.09*Math.pow(Math.abs(z/end),6);rings.push([[side*half*.96*taper,b,z],[side*half*taper,Math.max(b+.012,top-.18),z],[side*(half-.035)*taper,top,z],[side*(half-.16)*taper,top+.045,z]]);}if(side>0)rings.forEach(r=>r.reverse());k.loft(rings);
    for(const axle of [s.front,s.rear]){const pts=[];for(let i=0;i<=32;i++){const a=i*Math.PI/32;pts.push([side*(half+.009),R+Math.sin(a)*(R+.08),axle+Math.cos(a)*(R+.08)]);}k.tube(pts,type==='sedan'?.019:.035,type==='sedan'?'paint':'rubber');}
    // Long lower sills between wheel openings.
    k.box(.10,.12,s.rear-s.front-2*(R+.12),side*(half-.025),.32,(s.front+s.rear)/2,'rubber');
  }
  // Hood and boot are smooth crowned surfaces, sampled across both axes.
  function deck(z0,z1,y0,y1){const rings=[];for(let j=0;j<=14;j++){const t=j/14,z=z0+(z1-z0)*t,row=[];for(let i=0;i<=16;i++){const u=-1+i/8,x=u*(half-.145)*(1-.09*Math.pow(Math.abs(z/end),6));row.push([x,y0+(y1-y0)*t+.042*(1-u*u),z]);}rings.push(row);}k.loft(rings);}
  deck(-end,s.cabFront,shoulder(-end)+.04,s.shoulder+.035);
  if(type!=='pickup')deck(s.cabRear,end,s.shoulder+.035,shoulder(end)+.04);
  k.box(s.width*.74,.12,s.length-.25,0,.28,0,'rubber');
  for(const [z,back] of [[-end,false],[end,true]]){
    const fasciaTop=shoulder(z)+.055;k.box(s.width*.91,fasciaTop-.34,.15,0,(fasciaTop+.34)/2,z,'paint');k.box(s.width*.85,.095,.15,0,.335,z,'rubber');
    k.box(.52,.16,.03,0,.54,z+(back?.09:-.09),'metal',0xe2e5e2,.008);
    k.box(.4,.055,.034,0,.54,z+(back?.11:-.11),'rubber',0xffffff,.003);
    if(!back){k.box(s.width*.48,.235,.04,0,.76,z-.081,'rubber');for(let n=0;n<5;n++)k.box(s.width*.45,.018,.045,0,.67+n*.041,z-.11,'metal',0xffffff,.004);}
    for(const side of [-1,1]){const x=side*s.width*.34;
      k.box(s.width*.23,.18,.055,x,s.shoulder-.16,z+(back?.073:-.073),'rubber');
      k.box(s.width*.20,.115,.07,x,s.shoulder-.15,z+(back?.085:-.085),'lamp',back?0xd72330:0xe8f4ff,.025);
      k.box(s.width*.19,.018,.08,x,s.shoulder-.081,z+(back?.09:-.09),'lamp',back?0xff5760:0xffffff,.005);
      if(!back)k.box(.14,.055,.035,side*s.width*.38,.48,z-.083,'lamp',0xeaf6ff,.012);
    }
  }
  // Curved greenhouse: inset side glazing, raked screen and separate painted roof.
  const baseX=half-.14,topX=half-.29,by=s.shoulder+.065,ry=s.roof-.085;
  const frontBottom=[[-baseX,by,s.cabFront],[baseX,by,s.cabFront]],frontTop=[[-topX,ry,s.roofFront],[topX,ry,s.roofFront]];
  for(const rear of [false,true]){
    const rings=[];for(let j=0;j<=8;j++){const t=j/8,row=[];for(let i=0;i<=16;i++){const u=-1+i/8;row.push([u*(baseX+(topX-baseX)*t),by+(ry-by)*t+.085*(1-u*u)*t,(rear?s.cabRear:s.cabFront)+((rear?s.roofRear:s.roofFront)-(rear?s.cabRear:s.cabFront))*t]);}if(rear)row.reverse();rings.push(row);}k.loft(rings,'glass');
  }
  for(const side of [-1,1]){
    const outline=[[side*baseX,by,s.cabFront],[side*topX,ry,s.roofFront],[side*topX,ry,s.roofRear],[side*baseX,by,s.cabRear]];
    k.quad(side<0?[outline[3],outline[2],outline[1],outline[0]]:outline,'glass');
    k.tube([...outline,outline[0]],.031,'rubber');
    k.tube([outline[0],outline[1]],.05,'paint');k.tube([outline[2],outline[3]],.061,'paint');
    const pillar=type==='pickup'?-.17:.18;
    k.tube([[side*baseX,by,pillar],[side*topX,ry,pillar]],.038,'rubber');
    if(type==='suv')k.tube([[side*baseX,by,1.16],[side*topX,ry,1.16]],.028,'rubber');
    for(const dz of type==='pickup'?[-.21]:[-.18,.96]){
      k.tube([[side*(half+.003),s.shoulder-.075,dz],[side*(half+.005),.56,dz],[side*(half-.008),.39,dz+.045]],.008,'rubber');
      k.box(.03,.045,.17,side*(half+.024),s.shoulder-.095,dz-.15,'metal',0xffffff,.01);
    }
    k.tube([[side*baseX,by+.07,s.cabFront+.12],[side*(half+.14),by+.07,s.cabFront+.18]],.026,'rubber');
    k.box(.19,.105,.24,side*(half+.15),by+.12,s.cabFront+.21,'paint',0xffffff,.035);
    k.box(.16,.065,.025,side*(half+.15),by+.12,s.cabFront+.345,'metal',0xc2d8e0,.015);
  }
  const roof=[];for(let j=0;j<=10;j++){const z=s.roofFront+(s.roofRear-s.roofFront)*j/10,row=[];for(let i=0;i<=16;i++){const u=-1+i/8;row.push([u*topX,ry+.085*(1-u*u)+.025*Math.sin(j*Math.PI/10),z]);}roof.push(row);}k.loft(roof);
  // Screen wipers and windshield cowl give the front a visible sense of scale.
  for(const side of [-1,1])k.tube([[side*.62,by+.019,s.cabFront-.006],[side*.22,by+.065,s.cabFront+.04]],.012,'rubber');
  if(type==='pickup'){
    const bedStart=s.cabRear+.07,bedLen=end-bedStart;
    k.box(s.width*.80,.085,bedLen-.06,0,.88,bedStart+bedLen/2,'rubber');
    for(let i=-5;i<=5;i++)k.box(.026,.028,bedLen-.12,i*.13,.94,bedStart+bedLen/2,'rubber');
    for(const side of [-1,1]){k.box(.16,.33,bedLen,side*(half-.09),1.075,bedStart+bedLen/2,'paint');k.box(.19,.045,bedLen,side*(half-.08),1.25,bedStart+bedLen/2,'rubber');}
    k.box(s.width*.86,.38,.10,0,1.06,end-.04,'paint');k.box(.21,.06,.026,0,1.16,end+.025,'rubber');
  }
  if(type==='suv')for(const side of [-1,1]){k.tube([[side*.57,s.roof+.01,s.roofFront+.1],[side*.57,s.roof+.07,s.roofFront+.3],[side*.57,s.roof+.07,s.roofRear-.1]],.024,'metal');for(const z of [s.roofFront+.3,s.roofRear-.1])k.box(.08,.115,.16,side*.57,s.roof+.005,z,'rubber');}
  // Tyres use rounded shoulders, a recessed alloy rim, brake disc and tread ribs.
  for(const side of [-1,1])for(const axle of [s.front,s.rear]){
    const x=side*track,thick=.105;
    const tire=new THREE.TorusGeometry(R-thick,thick,10,40);tire.rotateY(Math.PI/2);tire.translate(x,R,axle);k.add(tire,'rubber');
    const cylinder=(radius,width,xx,key,color)=>{const g=new THREE.CylinderGeometry(radius,radius,width,32);g.rotateZ(Math.PI/2);g.translate(xx,R,axle);k.add(g,key,color);};
    cylinder(R*.64,.075,x+side*.073,'rubber');cylinder(R*.58,.017,x+side*.104,'metal',0x646970);
    const lip=new THREE.TorusGeometry(R*.65,.019,6,32);lip.rotateY(Math.PI/2);lip.translate(x+side*.11,R,axle);k.add(lip,'metal');
    for(let i=0;i<10;i++){const a=i*Math.PI/5;k.tube([[x+side*.13,R+Math.cos(a)*R*.18,axle+Math.sin(a)*R*.18],[x+side*.124,R+Math.cos(a+.09)*R*.59,axle+Math.sin(a+.09)*R*.59]],.018,'metal');}
    cylinder(R*.18,.045,x+side*.125,'metal');
    for(let i=0;i<32;i++){const a=i*Math.PI/16;for(const offset of [-.035,.035]){const g=new THREE.BoxGeometry(.048,.005,.024);g.rotateX(-a);g.translate(x+offset,R+Math.cos(a)*(R-.006),axle+Math.sin(a)*(R-.006));k.add(g,'rubber',0x777777);}}
  }
  const parts=k.finish(),geometry=mergeGeometries(parts.map(p=>p.geometry),false);geometry.computeBoundingBox();
  return {geometry,material:parts[0].material,renderParts:parts,size:geometry.boundingBox.getSize(new THREE.Vector3()),url:`sculpted-${type}`,contacts:{halfTrack:track,front:s.front,rear:s.rear,y:0}};
}
export function buildSculptedVehicleKit(){return ['sedan','suv','pickup'].map((type,i)=>{const entry=buildSculptedVehicle(type);entry.url+=`-${i}`;return entry;});}
