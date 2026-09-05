// Parcel-scale details inferred from supplied drive footage; building positions use
// OSM footprints. This is representative landscaping, not a cadastral survey.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hedgeGeometry } from './foliage.js';
import { leafSprayTexture } from './surveyed-tree-geometry.js';
import { TEX } from './textures.js';
import { streetProfile } from './street-profile.js';

export function buildStreetscape(map, corridor, terrain, keepClear = []) {
  const group = new THREE.Group(); group.name = 'Reference streetscape';
  const drives = [], fenceParts = [], shrubs = [], rocks = [];
  const vacant = (x,z) => !keepClear.some(p => Math.hypot(x-p.x,z-p.z)<p.r);
  const roadClear = (x,z) => {
    const rd = terrain.nearestRoad(x,z);
    return !rd || rd.d > rd.seg.hw + 1.0;
  };
  const ground = (x,z) => {
    const deck = terrain.roadDeck(x,z);
    return deck && deck.d < deck.hw + 0.55 ? deck.y : (terrain.meshHeight(x,z) ?? terrain.groundHeight(x,z));
  };
  const ribbon = (a,b,width,parts,offset=0.04) => {
    const dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
    if (len<0.2) return;
    const nx=-dz/len*width/2, nz=dx/len*width/2;
    const pos=[], uv=[], idx=[]; const steps=Math.ceil(len/1.5);
    for(let i=0;i<=steps;i++) {
      const x=a[0]+dx*i/steps,z=a[1]+dz*i/steps;
      for(const side of [-1,1]) {
        const xx=x+nx*side,zz=z+nz*side;
        pos.push(xx,ground(xx,zz)+offset,zz); uv.push((side+1)/2,i/steps*len/4);
      }
      if(i<steps){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();parts.push(geo);
  };
  let seed=741;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const lots=[];
  for(const b of map.buildings) {
    if(b.n || b.h>8 || b.p.length<3)continue;
    const cx=b.p.reduce((v,p)=>v+p[0],0)/b.p.length,cz=b.p.reduce((v,p)=>v+p[1],0)/b.p.length;
    const pr=corridor.projectExact(cx,cz);
    if(pr.s<180 || pr.s>2600 || pr.dist<12 || pr.dist>40 || !vacant(cx,cz))continue;
    const side=Math.sign(pr.lat),i=pr.i,[nx,nz]=corridor.normalAt(i),[tx,tz]=corridor.tan[i],c=corridor.pts[i];
    if(lots.some(l=>l.side===side && Math.abs(l.s-pr.s)<15))continue;
    lots.push({s:pr.s,side});
    const profile=streetProfile(pr.s),walk=side<0?profile.sidewalkLeft:profile.sidewalkRight;
    const verge=pr.hw+(walk?2.6:1.2);
    const frontage=b.p.map(p=>(p[0]-cx)*tx+(p[1]-cz)*tz);
    const half=Math.min(12,Math.max(5,(Math.max(...frontage)-Math.min(...frontage))/2+2));
    const entrance=[c[0]+nx*side*(pr.hw-0.5),c[1]+nz*side*(pr.hw-0.5)];
    const frontDist=Math.min(...b.p.map(p=>(p[0]-c[0])*nx*side+(p[1]-c[1])*nz*side));
    const end=[c[0]+nx*side*Math.max(verge+1,frontDist-0.4),c[1]+nz*side*Math.max(verge+1,frontDist-0.4)];
    ribbon(entrance,end,3.4,drives);
    const hedge=random()>0.3;
    for(let along=-half;along<half;along+=hedge?1.2:0.22) {
      if(Math.abs(along)<2.1)continue; // drive opening
      const x=c[0]+nx*side*verge+tx*along,z=c[1]+nz*side*verge+tz*along;
      if(!roadClear(x,z)||!vacant(x,z))continue;
      const y=ground(x,z);
      if(hedge) {
        const h=1.2+random()*1.1;
        shrubs.push({x,y:y+h*0.43,z,sx:0.82,sy:h*0.6,sz:0.78,a:random()*6.28,c:random()});
      } else {
        const g=new THREE.BoxGeometry(0.18,1.25,0.065);
        g.rotateY(Math.atan2(-tz,tx));g.translate(x,y+0.59,z);fenceParts.push(g);
      }
    }
  }
  // Dense mixed understorey on the wooded descent, with side-road sight lines clear.
  for(let i=170;i<corridor.pts.length-45;i+=2) {
    const [nx,nz]=corridor.normalAt(i),[tx,tz]=corridor.tan[i],c=corridor.pts[i];
    for(const side of [-1,1]) for(let row=0;row<3;row++) {
      const off=corridor.hw[i]+3.8+row*2.1;
      const x=c[0]+nx*side*off+tx*(random()-0.5)*5,z=c[1]+nz*side*off+tz*(random()-0.5)*5;
      if(!roadClear(x,z)||!vacant(x,z))continue;
      if(map.buildings.some(b=>b.p.some(p=>Math.hypot(p[0]-x,p[1]-z)<5)))continue;
      const h=0.7+random()*1.6;
      shrubs.push({x,y:ground(x,z)+h*0.35,z,sx:1.1+random(),sy:h*0.65,sz:0.8+random(),a:random()*6.28,c:random()});
      if(row===0&&random()>0.7)rocks.push({x,y:ground(x,z)+0.14,z,sx:0.35+random()*0.3,sy:0.3,sz:0.45,a:random()*6.28,c:random()});
    }
  }
  const add=(geos,mat)=>{
    if(!geos.length)return;
    const mesh=new THREE.Mesh(mergeGeometries(geos,false),mat);mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);
    geos.forEach(g=>g.dispose());
  };
  add(drives,new THREE.MeshStandardMaterial({map:TEX.asphalt,color:0x99958a,roughness:1,side:THREE.DoubleSide}));
  add(fenceParts,new THREE.MeshStandardMaterial({map:TEX.wood,color:0x9b805b,roughness:0.96}));
  const instance=(items,geo,mat,palette)=>{
    if(!items.length)return;
    const mesh=new THREE.InstancedMesh(geo,mat,items.length),dummy=new THREE.Object3D(),color=new THREE.Color();
    items.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.a;dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      color.set(palette[Math.floor(p.c*palette.length)]);mesh.setColorAt(i,color);
    });
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  };
  instance(shrubs,hedgeGeometry(),new THREE.MeshStandardMaterial({map:leafSprayTexture(),alphaTest:.32,roughness:0.9,vertexColors:true,side:THREE.DoubleSide}),[0xc2d2ab,0xe1dbb2,0xb9caaa,0xa9bba9,0xc9cfa9]);
  instance(rocks,new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({roughness:1}),[0x77766c,0x8b8677,0x64695f]);
  group.userData.summary={driveways:drives.length,frontages:lots.length,shrubs:shrubs.length};
  console.log('STREETSCAPE',JSON.stringify(group.userData.summary));
  return group;
}
