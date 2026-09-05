// Supplied 04:45–04:55 frames: observed beach-village facades on mapped footprints.
// Detail dimensions are visual estimates; see docs/lower-street-reference.md.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const REFERENCE_LOWER_NAMES=['Legasea','Seaside Place'];

function palette(){
 const colors={wall:0xe3e2db,white:0xe9ece7,stone:0x8e9595,red:0x77504b,dark:0x303c3d,glass:0x547177,railGlass:0xadc2c4,wood:0x7b7161,concrete:0xa19f91,earth:0x7c715c};
 const mats=Object.fromEntries(Object.entries(colors).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:k==='glass'?.2:.85,metalness:k==='glass'?.35:0})]));
 mats.railGlass.transparent=true;mats.railGlass.opacity=.48;mats.railGlass.depthWrite=false;mats.railGlass.roughness=.16;mats.railGlass.side=THREE.DoubleSide;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#5f6869';c.fillRect(0,0,256,256);
 let seed=733;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let row=0;row<16;row++){let x=-40-rand()*35;while(x<256){const w=25+rand()*42,shade=105+rand()*75;c.fillStyle=`rgb(${shade|0},${shade+3|0},${shade+1|0})`;c.fillRect(x,row*16+1,w-1,14);c.fillStyle='rgba(220,225,222,.14)';c.fillRect(x+1,row*16+2,w-3,2);x+=w;}}
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;mats.stone.map=tex;mats.stone.bumpMap=tex;mats.stone.bumpScale=.028;
 return mats;
}
function builder(name){
 const group=new THREE.Group();group.name=name;const mats=palette(),parts=Object.fromEntries(Object.keys(mats).map(k=>[k,[]]));
 const box=(key,w,h,d,x,y,z,ang=0)=>{const g=new THREE.BoxGeometry(w,h,d);g.rotateY(ang);g.translate(x,y,z);parts[key].push(g);};
 const finish=()=>{for(const [key,list]of Object.entries(parts)){if(!list.length)continue;const flat=list.map(g=>g.index?g.toNonIndexed():g);const mesh=new THREE.Mesh(mergeGeometries(flat,false),mats[key]);mesh.castShadow=key!=='railGlass';mesh.receiveShadow=true;mesh.name=`${name}: ${key}`;group.add(mesh);new Set([...list,...flat]).forEach(g=>g.dispose());}return group;};
 return{group,parts,box,finish};
}
function facade(box,a,b,y,normal=null){
 const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),tx=dx/len,tz=dz/len,[nx,nz]=normal||[tz,-tx],angle=Math.atan2(-tz,tx);
 return {len,at:(key,w,h,d,u,up,out=.04)=>box(key,w,h,d,a[0]+tx*u+nx*out,y+up,a[1]+tz*u+nz*out,angle),point:(u,up,out)=>new THREE.Vector3(a[0]+tx*u+nx*out,y+up,a[1]+tz*u+nz*out),normal:new THREE.Vector3(nx,0,nz)};
}
function label(group,text,width,height,pos,normal){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#293335';c.fillRect(0,0,512,128);c.fillStyle='#f2f1e8';c.font='300 80px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,65);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:tex,roughness:.8}));mesh.position.copy(pos);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);group.add(mesh);
}
export function buildReferenceLowerBuilding(b,terrain,corridor){
 if(!REFERENCE_LOWER_NAMES.includes(b.n))return null;
 const {group,parts,box,finish}=builder(`Reference ${b.n}`),pts=b.p.slice(0,-1);
 const ground=(x,z)=>terrain.meshHeight(x,z)??terrain.groundHeight(x,z);
 const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length,y=ground(cx,cz),h=b.h;
 const shape=new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],-p[1])));
 const body=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false});body.rotateX(-Math.PI/2);body.translate(0,y,0);parts[b.n==='Legasea'?'red':'wall'].push(body);
 const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,y+h+.02,0);parts.dark.push(roof);
 if(b.n==='Legasea'){
  // East corner faces Departure Bay Road. South return is visible on approach.
  const front=facade(box,[-759.07,-943.34],[-761.17,-932.25],y);
  const side=facade(box,[-805.82,-950.17],[-758.89,-944.93],y);
  for(const [f,isFront] of [[front,true],[side,false]]){
   const {at,len}=f;
   at('red',len,h-.3,.12,len/2,h/2,.09);
   at('stone',len,4.45,.16,len/2,2.22,.19);
   const bays=isFront?2:8,pitch=len/bays;
   for(let k=0;k<bays;k++){
    const u=(k+.5)*pitch,w=pitch-.5;
    // Deep dark frames and individual tall panes instead of a repeated window decal.
    if(!isFront||k===0){at('dark',w,3.18,.15,u,1.92,.32);at('glass',w-.16,2.99,.045,u,1.92,.41);
    at('white',.07,3.04,.08,u,1.92,.45);at('white',w-.1,.055,.08,u,2.2,.45);}
    at('white',.21,h-.22,.29,k*pitch+.11,h/2,.27);
    at('dark',w,3.5,.12,u,6.37,.27);at('glass',w-.15,3.35,.04,u,6.37,.35);
    for(let v=-w/2+.9;v<w/2;v+=1.05)at('dark',.06,3.4,.055,u+v,6.37,.39);
    // White concrete balcony plate, clear infill and thin black posts.
    at('white',w+.13,.22,1.44,u,4.55,.88);
    at('railGlass',w-.15,.94,.035,u,5.13,1.59);at('dark',w+.08,.045,.045,u,5.65,1.63);
    for(let v=-w/2;v<=w/2+.01;v+=w/3)at('dark',.047,1.13,.047,u+v,5.1,1.63);
    at('white',w+.18,.28,1.6,u,8.23,.9);
    // Recessed top floor and floating white roof eaves.
    at('dark',w-.3,1.95,.10,u,9.4,.11);at('glass',w-.47,1.76,.04,u,9.4,.18);
    at('white',w+.3,.21,2,u,h+.08,.62);
    at('dark',w,.035,.035,u,8.94,1.72);
    for(let v=-w/2;v<=w/2+.01;v+=w/3)at('dark',.035,.67,.035,u+v,8.61,1.72);
   }
   at('white',.34,7.3,.52,.17,7.42,.53);at('white',.34,7.3,.52,len-.17,7.42,.53);
   at('white',len+.35,.34,.62,len/2,h-.15,.56);
  }
  // The photographed corner cafe fascia and stone-wall louvre.
  front.at('dark',front.len+1.05,.64,1.42,front.len/2,4.09,.81);
  label(group,'drip',2.35,.57,front.point(3,4.09,1.535),front.normal);
  side.at('dark',5,.64,1.42,side.len-2.5,4.09,.81);
  label(group,'drip',2.35,.57,side.point(side.len-2.5,4.09,1.535),side.normal);
  front.at('stone',front.len*.45,4.36,.13,front.len*.77,2.18,.31);
  front.at('white',2.9,1.02,.09,front.len-2,3.28,.40);
  for(let k=0;k<9;k++)front.at('dark',2.7,.04,.055,front.len-2,2.91+k*.085,.46);
  // Paved corner apron in front of the cafe, preserving the left-side beach road.
  const ap=[[-757.4,-945.4],[-759.7,-931.2],[-747.8,-929.4],[-743.6,-942.5]],ag=new THREE.BufferGeometry();
  ag.setAttribute('position',new THREE.Float32BufferAttribute(ap.flatMap(([x,z])=>[x,ground(x,z)+.035,z]),3));ag.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,1,1,0],2));ag.setIndex([0,1,2,0,2,3]);ag.computeVertexNormals();parts.concrete.push(ag);
 }else{
  // Long sea-facing elevation: white balcony frames, pale siding, dark pitched eaves.
  const f=facade(box,[-763.91,-930.3],[-764.79,-873.06],y),{at,len}=f,bays=13,pitch=len/bays;
  at('dark',len+.65,.35,1.1,len/2,h+.05,.15);
  for(let k=0;k<bays;k++){
   const u=(k+.5)*pitch;
   at('white',.22,h,.28,k*pitch,h/2,.16);
   for(let floor=0;floor<3;floor++){
    const level=.65+floor*3.23;
    at('dark',3.28,2.2,.10,u,level+1.24,.15);at('glass',3.1,2.05,.04,u,level+1.24,.23);
    at('white',.07,2.08,.06,u+.48,level+1.24,.27);
    at('white',pitch-.12,.17,1.3,u,level,.68);
    at('white',pitch-.18,.065,.06,u,level+1.08,1.29);
    at('white',pitch-.18,.06,.06,u,level+.2,1.29);
    for(let v=-pitch/2+.14;v<pitch/2-.1;v+=.2)at('white',.025,.88,.025,u+v,level+.64,1.29);
    at('white',.12,3.16,1.34,u-pitch/2+.08,level+1.49,.68);
    // Fine horizontal weatherboard joints on the narrow facade piers.
    for(let line=0;line<13;line++)at('concrete',.56,.015,.025,u+pitch/2-.35,level+.14+line*.23,.29);
   }
  }
  label(group,'SEASIDE PLACE',3.9,.46,f.point(5.5,1.4,1.37),f.normal);
 }
 group.userData={sourceFrames:['t04m45.0s_02851.jpg','t04m50.0s_02901.jpg','t04m55.0s_02951.jpg'],footprint:b.p,height:h,estimatedFacade:true};
 return finish();
}

export function buildReferenceLowerStreet(map,corridor,terrain){
 const {group,box,finish}=builder('Reference wooded descent frontage');
 const ground=(x,z)=>terrain.meshHeight(x,z)??terrain.groundHeight(x,z);
 const at=(s,off)=>{let i=corridor.cum.findIndex(v=>v>=s);i=Math.max(1,i<0?corridor.cum.length-1:i);const t=(s-corridor.cum[i-1])/(corridor.cum[i]-corridor.cum[i-1]);const a=corridor.pts[i-1],b=corridor.pts[i],[nx,nz]=corridor.normalAt(i);return[a[0]+(b[0]-a[0])*t+nx*off,a[1]+(b[1]-a[1])*t+nz*off];};
 // 03:50: raised left bank, grey boundary panels inland of the left footpath.
 // Only the visible lot above Alan A Dale receives these panels, with entrance gaps.
 for(let s=2285;s<2330;s+=2.4){if(s>2304&&s<2311)continue;const a=at(s,-12.7),b=at(s+2.4,-12.7),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,y=Math.min(ground(...a),ground(...b)),angle=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);box('concrete',2.44,.5,.32,x,y+.2,z,angle);box('wall',2.38,1.35,.1,x,y+1.08,z,angle);box('white',2.43,.07,.17,x,y+1.79,z,angle);box('concrete',.11,1.63,.15,a[0],y+1.06,a[1],angle);for(let j=1;j<12;j++){const p=at(s+j*.2,-12.63);box('concrete',.012,1.31,.02,p[0],y+1.08,p[1],angle);}}
 group.userData={sourceFrames:['t03m50.0s_02301.jpg'],stationRanges:[[2285,2330]],placement:'Estimated from Alan A Dale junction; LiDAR ground sampled per panel'};
 return finish();
}
