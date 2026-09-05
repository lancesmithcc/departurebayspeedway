// Facade construction vocabulary from the supplied residential drive stills.
// Footprints/elevations are measured inputs; individual window/door layouts are inferred.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const HOUSE_TYPES = new Set(['house','detached','semidetached_house','yes','residential']);
const SOURCES = ['t01m05.0s_00651.jpg','t01m35.0s_00951.jpg','t02m35.0s_01551.jpg'];
const PALETTE = [0xc4c6bd,0xb1b7ad,0xc6bead,0x9dadac,0xc9c9bd,0xbdb4a3];

export function buildReferenceResidential(map,corridor,terrain,keepClear=[]) {
  const group=new THREE.Group();group.name='Frame reference residential facades';
  const parts={siding:[],trim:[],glass:[],shadow:[],concrete:[],door:[]};
  const materials={
    siding:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91}),
    trim:new THREE.MeshStandardMaterial({color:0xe0dfd4,roughness:.77}),
    glass:new THREE.MeshStandardMaterial({color:0x526465,roughness:.24,metalness:.25}),
    shadow:new THREE.MeshStandardMaterial({color:0x424e4c,roughness:.9}),
    concrete:new THREE.MeshStandardMaterial({color:0xa5a398,roughness:1}),
    door:new THREE.MeshStandardMaterial({color:0x666d63,roughness:.83}),
  };
  const ground=(x,z)=>terrain.meshHeight(x,z)??terrain.groundHeight(x,z);
  const tint=(g,hex)=>{const c=new THREE.Color(hex),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)a.set([c.r,c.g,c.b],i*3);g.setAttribute('color',new THREE.BufferAttribute(a,3));};
  const box=(key,w,h,d,x,y,z,angle,color)=>{
    if(!(w>0&&h>0&&d>0))return;
    const g=new THREE.BoxGeometry(w,h,d);g.rotateY(angle);g.translate(x,y,z);
    if(key==='siding')tint(g,color);parts[key].push(g);
  };
  const details=[];
  for(const b of map.buildings) {
    if(b.n||!HOUSE_TYPES.has(b.t)||b.h<3||b.h>8||b.p.length<4)continue;
    // Match buildBuildings' closed-ring centroid and roof-allowance calculation.
    const cx=b.p.reduce((v,p)=>v+p[0],0)/b.p.length,cz=b.p.reduce((v,p)=>v+p[1],0)/b.p.length;
    const pr=corridor.projectExact(cx,cz);
    if(pr.s<400||pr.s>1600||pr.dist<13||pr.dist>46)continue;
    if(keepClear.some(p=>Math.hypot(cx-p.x,cz-p.z)<p.r))continue;
    const pts=b.p.slice();if(pts.length>1&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.001)pts.pop();
    let area=0,longest=0,ux=1,uz=0;
    for(let i=0;i<pts.length;i++){const a=pts[i],q=pts[(i+1)%pts.length],dx=q[0]-a[0],dz=q[1]-a[1],len=Math.hypot(dx,dz);area+=a[0]*q[1]-q[0]*a[1];if(len>longest){longest=len;ux=dx/len;uz=dz/len;}}
    const pu=pts.map(p=>(p[0]-cx)*ux+(p[1]-cz)*uz),pv=pts.map(p=>-(p[0]-cx)*uz+(p[1]-cz)*ux);
    const footprintArea=Math.abs(area)*.5;
    // Exclude large unnamed blocks and tiny outbuildings: these details are domestic.
    if(footprintArea<55||footprintArea>340)continue;
    const rectangularity=footprintArea/Math.max(1,(Math.max(...pu)-Math.min(...pu))*(Math.max(...pv)-Math.min(...pv)));
    const top=Math.max(2.8,b.h-(rectangularity>=.84?1.9:0)),gy=ground(cx,cz);
    const edges=[];
    for(let i=0;i<pts.length;i++) {
      const a=pts[i],q=pts[(i+1)%pts.length],dx=q[0]-a[0],dz=q[1]-a[1],len=Math.hypot(dx,dz);
      if(len<2.4)continue;
      const tx=dx/len,tz=dz/len,nx=tz*Math.sign(area),nz=-tx*Math.sign(area),x=(a[0]+q[0])/2,z=(a[1]+q[1])/2;
      const p=corridor.projectExact(x,z),c=corridor.pts[p.i];
      const toward=(c[0]-x)*nx+(c[1]-z)*nz;
      if(toward/Math.max(1,p.dist)<.3||p.dist<11)continue;
      edges.push({a,len,tx,tz,nx,nz,angle:Math.atan2(-tz,tx),p});
    }
    if(!edges.length)continue;
    const front=edges.reduce((a,q)=>q.len>a.len?q:a),color=PALETTE[Math.abs(b.cityId??Math.round(cx+cz))%PALETTE.length];
    let windows=0;
    for(const e of edges) {
      const {a,len,tx,tz,nx,nz,angle}=e;
      const at=(key,w,h,d,u,y,out=.05,c=color)=>box(key,w,h,d,a[0]+tx*u+nx*out,gy+y,a[1]+tz*u+nz*out,angle,c);
      // Thin cladding replaces the low-resolution window atlas on this face only.
      // Lower skirt follows the original building base; no second building mass.
      at('siding',len,top+1.3,.038,len/2,(top-1.3)/2,.043);
      at('concrete',len,.38,.075,len/2,.10,.081);
      for(let y=.32;y<top-.1;y+=.205)at('siding',len,.028,.045,len/2,y,.077);
      at('trim',.095,top,.105,.035,top/2,.105);at('trim',.095,top,.105,len-.035,top/2,.105);
      at('trim',len+.14,.15,.27,len/2,top-.05,.10);
      at('shadow',len+.12,.045,.25,len/2,top-.145,.14);
      // White gutters and corner downpipes, common in the supplied bungalow views.
      at('trim',.055,top-.28,.065,len-.11,(top-.28)/2,.185);
      const floors=Math.max(1,Math.round(top/2.8)),floorH=top/floors;
      const bays=Math.max(1,Math.floor((len-.8)/3.25)),pitch=(len-.8)/bays;
      const doorBay=edges.length&&e===front?Math.min(bays-1,Math.floor(bays*.28)):-1;
      for(let floor=0;floor<floors;floor++)for(let j=0;j<bays;j++) {
        const u=.4+(j+.5)*pitch,base=floor*floorH;
        if(floor===0&&j===doorBay&&bays>=2) {
          at('trim',1.02,2.12,.13,u,1.20,.15);
          at('door',.86,1.98,.05,u,1.20,.235);
          at('glass',.45,.67,.015,u,1.66,.269);
          at('trim',.03,.08,.03,u+.30,1.10,.284);
          at('trim',1.3,.13,.53,u,2.36,.31);
          // Small concrete threshold remains within half a metre of the facade.
          at('concrete',1.26,.17,.52,u,.15,.31);
          continue;
        }
        const w=Math.min(1.95,pitch-.45),h=Math.min(1.28,floorH-.9),y=base+floorH*.58;
        at('shadow',w+.18,h+.18,.065,u,y,.13);
        at('trim',w+.1,h+.1,.07,u,y,.178);
        at('glass',w-.07,h-.07,.02,u,y,.222);
        at('trim',.045,h-.06,.035,u+w*.16,y,.245);
        at('trim',w+.17,.075,.22,u,y-h/2-.035,.225);
        // Thin lower horizontal sash and subtle interior mullion detail.
        at('trim',w-.04,.025,.025,u,y-h*.21,.241);
        windows++;
      }
    }
    details.push({cityId:b.cityId??null,station:Math.round(pr.s),side:Math.sign(pr.lat),faces:edges.length,windows,footprintArea:Math.round(footprintArea)});
  }
  for(const [key,geos] of Object.entries(parts))if(geos.length){
    const mesh=new THREE.Mesh(mergeGeometries(geos,false),materials[key]);mesh.name=`Residential ${key}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);geos.forEach(g=>g.dispose());
  }
  group.userData={sourceFrames:SOURCES,stationRange:[400,1600],details,summary:{houses:details.length,faces:details.reduce((s,d)=>s+d.faces,0),windows:details.reduce((s,d)=>s+d.windows,0)},accuracy:'Mapped footprint positions; frame-observed construction vocabulary; inferred individual facade layouts'};
  return group;
}
