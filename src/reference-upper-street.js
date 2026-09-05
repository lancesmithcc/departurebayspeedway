// Opening street landmarks. City outlines/heights retained; details read from 00:08–00:30.
import * as THREE from 'three';
import {surveyedTreeGeometry,leafSprayTexture} from './surveyed-tree-geometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const UPPER_BUILDING_IDS=new Set([1308,5875]);
function kit(){
 const mats={wall:new THREE.MeshStandardMaterial({color:0x8c8980,roughness:.94}),brick:new THREE.MeshStandardMaterial({color:0x9a8a74,roughness:.94}),dark:new THREE.MeshStandardMaterial({color:0x343b36,roughness:.83}),trim:new THREE.MeshStandardMaterial({color:0xd4ceba,roughness:.75}),glass:new THREE.MeshStandardMaterial({color:0x526166,roughness:.24,metalness:.28}),concrete:new THREE.MeshStandardMaterial({color:0x99988b,roughness:.98}),green:new THREE.MeshStandardMaterial({color:0x175337,roughness:.82}),yellow:new THREE.MeshStandardMaterial({color:0xd9ba35,roughness:.82}),blue:new THREE.MeshStandardMaterial({color:0x294c81,roughness:.8})};
 const parts=Object.fromEntries(Object.keys(mats).map(k=>[k,[]])),group=new THREE.Group();
 const box=(key,w,h,d,x,y,z,rot=0)=>{const g=new THREE.BoxGeometry(w,h,d);g.rotateY(rot);g.translate(x,y,z);parts[key].push(g);};
 const finish=()=>{for(const [key,gs]of Object.entries(parts))if(gs.length){const flat=gs.map(g=>g.index?g.toNonIndexed():g);const g=mergeGeometries(flat,false),m=new THREE.Mesh(g,mats[key]);m.castShadow=m.receiveShadow=true;group.add(m);new Set([...gs,...flat]).forEach(g=>g.dispose());}return group;};
 return {mats,parts,group,box,finish};
}
function texture(draw,w=1024,h=256){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
function sign(group,map,w,h,x,y,z,rot){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,roughness:.72}));m.position.set(x,y,z);m.rotation.y=rot;group.add(m);return m;}
export function buildReferenceUpperBuilding(b,terrain,corridor){
 const k=kit(),{box,parts,group,mats}=k;group.name=b.cityId===1308?'Subway and grocery — reference frontage':'Rosedale Manor — reference frontage';
 const pts=b.p.slice(0,-1),cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length,gy=terrain.meshHeight(cx,cz)??terrain.groundHeight(cx,cz),h=b.h;
 const shape=new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],-p[1]))),mass=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false});mass.rotateX(-Math.PI/2);mass.translate(0,gy,0);parts.wall.push(mass);
 const cap=new THREE.ShapeGeometry(shape);cap.rotateX(-Math.PI/2);cap.translate(0,gy+h+.01,0);parts.dark.push(cap);
 let area=0;pts.forEach((p,i)=>{const q=pts[(i+1)%pts.length];area+=p[0]*q[1]-q[0]*p[1];});
 const manor=b.cityId===5875; if(manor)mats.wall.color.set(0x8e8171);
 for(let i=0;i<pts.length;i++){
  const a=pts[i],c=pts[(i+1)%pts.length],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz),tx=dx/len,tz=dz/len,nx=tz*Math.sign(area),nz=-tx*Math.sign(area),rot=Math.atan2(-tz,tx);
  const at=(key,w,hh,d,u,y,out=.05)=>box(key,w,hh,d,a[0]+tx*u+nx*out,gy+y,a[1]+tz*u+nz*out,rot);
  at('dark',len+.1,.23,.4,len/2,h-.04,.12);
  if(len<3)continue;
  const bays=Math.max(1,Math.floor(len/(manor?4.5:4.1))),pitch=len/bays;
  for(let bay=0;bay<bays;bay++){
   const u=(bay+.5)*pitch;
   if(manor){
    const pr=corridor.projectExact(a[0]+tx*u,a[1]+tz*u),roadFacing=nx*(corridor.pts[pr.i][0]-a[0])+nz*(corridor.pts[pr.i][1]-a[1])>0;
    for(let f=0;f<3;f++){
     const y=.4+f*3.14;
     at('dark',Math.min(3.4,pitch-.25),2.66,.06,u,y+1.33,.05);
     at('glass',2.32,1.93,.05,u,y+1.24,.105);
     at('trim',.065,2,.06,u,y+1.24,.14);
     if(roadFacing){
      at('dark',pitch-.1,.14,1.35,u,y+.1,.68);
      at('dark',pitch-.15,.06,.06,u,y+1.16,1.31);
      for(let r=-pitch/2+.18;r<pitch/2-.1;r+=.16)at('dark',.03,1.04,.035,u+r,y+.62,1.31);
      at('wall',.17,3.1,1.4,u-pitch/2+.05,y+1.52,.66);
     }
    }
   }else{
    at('trim',2.75,1.68,.07,u,4.48,.09);at('glass',2.58,1.51,.03,u,4.48,.145);
    at('trim',.045,1.6,.04,u,4.48,.17);
   }
  }
  if(!manor){
   // Fine horizontal shakes on the grey upper floor, tan brick at ground level.
   for(let y=3.65;y<h-.22;y+=.17)at('dark',len,.012,.016,len/2,y,.09);
   at('brick',len,2.85,.08,len/2,1.5,.06);
   if(i===0){
    for(let u=1;u<len-.5;u+=2.15){at('trim',1.9,2.55,.075,u,1.6,.13);at('glass',1.76,2.4,.025,u,1.6,.18);at('trim',1.85,.07,.03,u,1.03,.205);}
    at('green',len*.68,.73,1.22,len*.34,3.2,.6);at('yellow',len*.32,.73,1.22,len*.84,3.2,.6);
    const subway=texture((g,w,hh)=>{g.fillStyle='#175337';g.fillRect(0,0,w,hh);g.textAlign='center';g.font='italic 900 156px Arial';g.fillStyle='#fff3cb';g.fillText('SUB',w*.28,hh*.76);g.fillStyle='#f2ce35';g.fillText('WAY',w*.68,hh*.76);});
    const grocery=texture((g,w,hh)=>{g.fillStyle='#d9ba35';g.fillRect(0,0,w,hh);g.fillStyle='#3c603b';g.textAlign='center';g.font='bold 108px Arial';g.fillText('GRAB & GO',w/2,hh*.69);});
    for(const [tex,u,w]of [[subway,len*.34,len*.58],[grocery,len*.84,len*.30]])sign(group,tex,w,.57,a[0]+tx*u+nx*1.22,gy+3.2,a[1]+tz*u+nz*1.22,Math.atan2(nx,nz));
    for(let u=.2;u<len;u+=3.85)at('brick',.24,3,.3,u,1.5,1.0);
    // The broad forecourt is below the road in the reference. Sample ground at each
    // vertex instead of laying a floating horizontal parking slab over LiDAR.
    const pp=[],ind=[],uv=[];const cols=16,rows=14;
    for(let z=0;z<=rows;z++)for(let x=0;x<=cols;x++){
     const u=-4+(len+8)*x/cols,out=1.4+22*z/rows,xx=a[0]+tx*u+nx*out,zz=a[1]+tz*u+nz*out;
     pp.push(xx,(terrain.meshHeight(xx,zz)??terrain.groundHeight(xx,zz))+.035,zz);uv.push(x/cols,z/rows);
     if(x<cols&&z<rows){const n=z*(cols+1)+x;ind.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}
    }
    const lot=new THREE.BufferGeometry();lot.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));lot.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));lot.setIndex(ind);lot.computeVertexNormals();const pavement=new THREE.Mesh(lot,new THREE.MeshStandardMaterial({color:0x656963,roughness:1,side:THREE.DoubleSide}));pavement.receiveShadow=true;group.add(pavement);
    for(let u=0;u<len;u+=2.6){const xx=a[0]+tx*u+nx*4,zz=a[1]+tz*u+nz*4;box('concrete',1.6,.14,.2,xx,(terrain.meshHeight(xx,zz)??gy)+.1,zz,rot);}
   }
  }
 }
 group.userData={cityId:b.cityId,sourceFrames:manor?['t00m08.0s_00081.jpg']:['t00m25.0s_00251.jpg'],height:h};return k.finish();
}
export function buildReferenceUpperStreet(map,corridor,terrain){
 const k=kit(),{box,group}=k;group.name='Upper street reference signs and boundaries';
 const point=(s,side,off)=>{const i=Math.max(1,corridor.cum.findIndex(v=>v>=s)),t=(s-corridor.cum[i-1])/(corridor.cum[i]-corridor.cum[i-1]),a=corridor.pts[i-1],b=corridor.pts[i],[nx,nz]=corridor.normalAt(i);return {x:a[0]+(b[0]-a[0])*t+nx*side*off,z:a[1]+(b[1]-a[1])*t+nz*side*off,nx,nz,tx:corridor.tan[i][0],tz:corridor.tan[i][1]};};
 const ground=p=>terrain.meshHeight(p.x,p.z)??terrain.groundHeight(p.x,p.z);
 // Rosedale's tan closeboard boundary follows the right sidewalk, interrupted at drive.
 for(let s=42;s<138;s+=1.8){if(s>111&&s<128)continue;const p=point(s,1,10),y=ground(p),angle=Math.atan2(-p.tz,p.tx);box('wall',1.83,1.72,.13,p.x,y+.86,p.z,angle);box('trim',1.9,.08,.21,p.x,y+1.77,p.z,angle);box('brick',.14,1.88,.18,p.x,y+.94,p.z,angle);}
 const st=point(158,1,11.2),y=ground(st),rot=Math.atan2(-st.nx,-st.nz);
 for(const side of [-1,1])box('blue',.14,3.3,.16,st.x+st.tx*side*.82,y+1.65,st.z+st.tz*side*.82,rot);
 box('blue',2.65,.79,.2,st.x,y+3.0,st.z,rot);box('dark',2.45,.93,.2,st.x,y+2.1,st.z,rot);
 const board=texture((g,w,h)=>{g.fillStyle='#294c81';g.fillRect(0,0,w,h);g.fillStyle='#ecebd8';g.textAlign='center';g.font='bold 120px Georgia';g.fillText("ST. ANDREW'S",w/2,h*.50);g.font='52px Arial';g.fillText('UNITED CHURCH',w/2,h*.82);});
 // Board inscription in the supplied frame reads UNITED CHURCH; OSM's denomination
 // label is not used to overwrite visible evidence.
 sign(group,board,2.55,.72,st.x-st.nx*.12,y+3,st.z-st.nz*.12,rot);
 const text=texture((g,w,h)=>{g.fillStyle='#182220';g.fillRect(0,0,w,h);g.fillStyle='#e3d7a1';g.font='bold 43px monospace';g.textAlign='center';g.fillText('Join us with Pasteur Jeremy,',w/2,h*.28);g.fillText('he puts the STUD',w/2,h*.57);g.fillText('in Bible Study.',w/2,h*.86);});
 sign(group,text,2.34,.83,st.x-st.nx*.12,y+2.1,st.z-st.nz*.12,rot);
 // 00:20–00:30: tall conifers dominate the right verge, above a red closeboard
 // boundary. Their positions/heights are visual estimates, not individual surveys.
 const fir=surveyedTreeGeometry('conifer'),foliage=new THREE.MeshStandardMaterial({map:leafSprayTexture(),color:0xa8b5a0,alphaTest:.4,side:THREE.DoubleSide,roughness:1}),bark=new THREE.MeshStandardMaterial({color:0x746958,roughness:1});
 const stand=[[151,19,24],[169,17,22],[192,19,25],[214,20,27],[237,17,24],[254,22,22],[272,20,23]];
 const leaf=new THREE.InstancedMesh(fir.foliage,foliage,stand.length),wood=new THREE.InstancedMesh(fir.wood,bark,stand.length),dummy=new THREE.Object3D();
 stand.forEach(([s,off,h],i)=>{const p=point(s,1,off);dummy.position.set(p.x,ground(p),p.z);dummy.scale.set(h*1.1,h,h*1.1);dummy.rotation.y=i*1.37;dummy.updateMatrix();leaf.setMatrixAt(i,dummy.matrix);wood.setMatrixAt(i,dummy.matrix);});
 leaf.castShadow=true;wood.castShadow=true;leaf.receiveShadow=true;group.add(leaf,wood);
 k.mats.green.color.set(0x753c35);
 for(let s=197;s<267;s+=2){if(s>231&&s<241)continue;const p=point(s,1,11.8),base=ground(p),angle=Math.atan2(-p.tz,p.tx);box('green',2.03,1.42,.10,p.x,base+.71,p.z,angle);box('dark',.11,1.5,.12,p.x,base+.75,p.z,angle);}

 return k.finish();
}
