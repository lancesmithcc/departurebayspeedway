// City footprint 7037; facade and frontage observed in supplied 00:05–00:15 stills.
// Dimensions of trim/landscaping are visual estimates, not surveyed measurements.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {surveyedTreeGeometry,leafSprayTexture} from './surveyed-tree-geometry.js';
export const REFERENCE_APARTMENT_ID=7037;
export function buildReferenceApartment(b,terrain,corridor){
 const group=new THREE.Group();group.name='Reference apartment and boundary wall';
 const materials={plaster:new THREE.MeshStandardMaterial({color:0xd9d9ce,roughness:.9}),panel:new THREE.MeshStandardMaterial({color:0x737e7a,roughness:.8}),dark:new THREE.MeshStandardMaterial({color:0x343c3b,roughness:.7}),frame:new THREE.MeshStandardMaterial({color:0xbac1b9,roughness:.48,metalness:.25}),glass:new THREE.MeshStandardMaterial({color:0x52656a,roughness:.23,metalness:.35}),concrete:new THREE.MeshStandardMaterial({color:0x91938a,roughness:1}),wood:new THREE.MeshStandardMaterial({color:0x535d5b,roughness:.96})};
 // Fine mottling and runoff marks keep the retaining plinth from reading as plastic.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#bbbcb3';ctx.fillRect(0,0,256,256);
 let seed=913;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<3500;i++){const c=110+Math.floor(rand()*65);ctx.fillStyle=`rgba(${c},${c},${c-8},.16)`;ctx.fillRect(rand()*256,rand()*256,1+rand()*3,1+rand()*3);}
 for(let i=0;i<100;i++){ctx.fillStyle='rgba(68,74,54,.065)';ctx.fillRect(rand()*256,160+rand()*70,1+rand()*6,45+rand()*35);}
 const concreteMap=new THREE.CanvasTexture(canvas);concreteMap.colorSpace=THREE.SRGBColorSpace;concreteMap.anisotropy=4;
 materials.concrete.map=concreteMap;materials.concrete.bumpMap=concreteMap;materials.concrete.bumpScale=.025;
 const parts=Object.fromEntries(Object.keys(materials).map(k=>[k,[]]));
 const box=(key,w,h,d,x,y,z,angle=0)=>{const geo=new THREE.BoxGeometry(w,h,d);geo.rotateY(angle);geo.translate(x,y,z);parts[key].push(geo);};
 const pts=b.p.slice(0,-1),cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
 const ground=(x,z)=>terrain.meshHeight(x,z)??terrain.groundHeight(x,z);
 const gy=ground(cx,cz),height=b.h;
 const shape=new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],-p[1])));
 const mass=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});mass.rotateX(-Math.PI/2);mass.translate(0,gy,0);parts.plaster.push(mass);
 const cap=new THREE.ShapeGeometry(shape);cap.rotateX(-Math.PI/2);cap.translate(0,gy+height+.02,0);parts.dark.push(cap);
 let area=0;pts.forEach((p,i)=>{const q=pts[(i+1)%pts.length];area+=p[0]*q[1]-q[0]*p[1];});
 for(let e=0;e<pts.length;e++){
  const a=pts[e],b1=pts[(e+1)%pts.length],dx=b1[0]-a[0],dz=b1[1]-a[1],len=Math.hypot(dx,dz),tx=dx/len,tz=dz/len,nx=tz*Math.sign(area),nz=-tx*Math.sign(area),angle=Math.atan2(-tz,tx);
  const at=(key,w,h,d,u,y,out=.03)=>box(key,w,h,d,a[0]+tx*u+nx*out,gy+y,a[1]+tz*u+nz*out,angle);
  at('dark',len+.2,.3,.38,len/2,height+.02,.05);
  at('concrete',len,.45,.16,len/2,.18,.04);
  const bays=Math.max(1,Math.floor(len/3.8)),pitch=len/bays;
  for(let k=0;k<bays;k++){
   const u=(k+.5)*pitch,balcony=len>12&&k%5===3;
   at('panel',Math.min(2.05,pitch-.65),height-.36,.08,u,height/2,.07);
   if(balcony)at('dark',pitch-.4,height-.35,.10,u,height/2,.12);
   for(let floor=0;floor<4;floor++){
    const y=.42+floor*(height-.5)/4;
    at('frame',1.73,1.54,.08,u,y+1.27,.14);
    at('glass',1.58,1.39,.025,u,y+1.27,.19);
    at('frame',.045,1.43,.025,u+.28,y+1.27,.211);
    at('frame',1.68,.065,.19,u,y+.51,.17);
    if(balcony){
     at('concrete',pitch-.35,.14,1.1,u,y+.05,.58);
     at('dark',pitch-.42,.045,.05,u,y+1.1,1.09);
     for(let t=-pitch/2+.3;t<pitch/2-.2;t+=.19)at('dark',.028,.97,.028,u+t,y+.6,1.09);
     at('dark',.1,2.5,1.12,u-pitch/2+.12,y+1.23,.59);
    }
   }
  }
 }
 // The tall edge is grey vertical boarding on a weathered concrete retaining base.
 // Keep it behind the sidewalk; follow road station and actual rendered ground.
 const point=(s,off)=>{let i=corridor.cum.findIndex(v=>v>=s);i=Math.max(1,i);const t=(s-corridor.cum[i-1])/(corridor.cum[i]-corridor.cum[i-1]);const a=corridor.pts[i-1],b1=corridor.pts[i],[nx,nz]=corridor.normalAt(i);return [a[0]+(b1[0]-a[0])*t-nx*off,a[1]+(b1[1]-a[1])*t-nz*off];};
 for(let s=65;s<145;s+=2){
  const a=point(s,10.5),c=point(s+2,10.5),x=(a[0]+c[0])/2,z=(a[1]+c[1])/2,y=Math.min(ground(...a),ground(...c)),angle=Math.atan2(-(c[1]-a[1]),c[0]-a[0]);
  box('concrete',2.04,.85,.45,x,y+.32,z,angle);
  box('wood',2.04,1.75,.16,x,y+1.59,z,angle);
  box('dark',2.08,.065,.22,x,y+2.48,z,angle);
  for(let j=0;j<10;j++){const p=point(s+j*.2,10.39);box('dark',.014,1.73,.018,p[0],y+1.59,p[1],angle);}
  if(s%6===5)box('wood',.12,1.95,.22,x,y+1.57,z,angle);
 }
 // Purple-leaf ornamental street trees visible ahead of the evergreen hedge.
 const tree=surveyedTreeGeometry('broadleaf');tree.foliage.deleteAttribute('color');
 const leaves=new THREE.MeshStandardMaterial({map:leafSprayTexture(['#715163','#815567','#614755','#916071','#624655']),color:0xddd0d1,emissive:0x261821,emissiveIntensity:.16,alphaTest:.38,side:THREE.DoubleSide,roughness:.95});
 const bark=new THREE.MeshStandardMaterial({color:0x736558,roughness:1});
 for(let s=78;s<149;s+=8){const p=point(s,8.1),y=ground(...p),h=5.2+.25*Math.sin(s);for(const [geo,mat] of [[tree.wood,bark],[tree.foliage,leaves]]){const m=new THREE.Mesh(geo,mat);m.position.set(p[0],y,p[1]);m.scale.set(h*1.8,h,h*1.8);m.castShadow=true;m.receiveShadow=true;group.add(m);}}
 const hedgeMat=new THREE.MeshStandardMaterial({map:leafSprayTexture(),color:0x567143,alphaTest:.35,side:THREE.DoubleSide,roughness:1});
 for(let s=70;s<119;s+=1.5){const p=point(s,12.2),y=ground(...p);const m=new THREE.Mesh(tree.foliage,hedgeMat);m.position.set(p[0],y+.8,p[1]);m.scale.set(6,4.5,6);m.castShadow=true;group.add(m);}
 for(const key of Object.keys(parts))if(parts[key].length){const mesh=new THREE.Mesh(mergeGeometries(parts[key],false),materials[key]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);parts[key].forEach(g=>g.dispose());}
 group.userData={cityId:b.cityId,height,footprint:b.p,wallStations:[65,145],sourceFrames:['t00m05.0s_00051.jpg','t00m08.0s_00081.jpg','t00m10.0s_00101.jpg']};
 return group;
}
