// Authored reference fleet. Metres; front faces -Z and tyre contacts sit at Y=0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const REFERENCE_VEHICLES = {
  bus: { length: 12.2, width: 2.55 }, cybertruck: { length: 5.7, width: 2.1 }, rcmp: { length: 5.15, width: 2.05 },
};
function kit() {
  const materials = {
    paint: new THREE.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.28}),
    metal: new THREE.MeshStandardMaterial({vertexColors:true,roughness:.29,metalness:.8}),
    glass: new THREE.MeshStandardMaterial({color:0x233d48,roughness:.16,metalness:.65}),
    rubber: new THREE.MeshStandardMaterial({color:0x171b20,roughness:.85}),
    lamps: new THREE.MeshStandardMaterial({vertexColors:true,roughness:.25,emissive:0xffffff,emissiveIntensity:.3}),
  }, buckets={};
  function add(g,key='paint',color=0xffffff) {
    if(g.index)g=g.toNonIndexed();
    const c=new THREE.Color(color), n=g.attributes.position.count, a=new Float32Array(n*3);
    for(let i=0;i<n;i++)c.toArray(a,i*3);
    g.setAttribute('color',new THREE.BufferAttribute(a,3));
    (buckets[key]??=[]).push(g);
  }
  const box=(w,h,d,x,y,z,key='paint',color=0xffffff)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);add(g,key,color);};
  function profile(points,width,key='paint',color=0xffffff){
    const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(z,y):s.moveTo(z,y));s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:width,bevelEnabled:false,steps:1});g.translate(0,0,-width/2);g.rotateY(-Math.PI/2);add(g,key,color);
  }
  function rod(a,b,r=.025,key='rubber',color=0xffffff){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),g=new THREE.CylinderGeometry(r,r,p.distanceTo(q),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),q.clone().sub(p).normalize()));g.translate(...p.add(q).multiplyScalar(.5).toArray());add(g,key,color);}
  function wheel(x,z,r=.42,steel=false){
    const cyl=(radius,width,xx,key,color)=>{const g=new THREE.CylinderGeometry(radius,radius,width,24);g.rotateZ(Math.PI/2);g.translate(xx,r,z);add(g,key,color);};
    cyl(r,.3,x,'rubber');cyl(r*.68,.315,x,'metal',steel?0x32373c:0xa5adb2);cyl(r*.22,.34,x,'metal',0xaeb4b8);
    const outside=x+Math.sign(x)*.17;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;box(.025,.045,.045,outside,r+Math.cos(a)*r*.4,z+Math.sin(a)*r*.4,'rubber');}
  }
  function quad(points,key='glass',color=0xffffff){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,2,1,0,3,2].flatMap(i=>points[i]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));g.computeVertexNormals();add(g,key,color);}
  const labels=[];
  function label(text,w,h,x,y,z,side=0,bg='#ffffff',fg='#183b65',font='bold') {
    labels.push({text,w,h,x,y,z,side,bg,fg,font});
  }
  function finish(name){
    const result=Object.entries(buckets).map(([key,gs])=>({geometry:mergeGeometries(gs,false),material:materials[key],name:`${name} ${key}`}));
    // Single canvas atlas/material for destination displays, liveries and plates.
    const c=document.createElement('canvas');c.width=1024;c.height=128*Math.max(1,labels.length);const ctx=c.getContext('2d'), gs=[];
    labels.forEach((l,i)=>{ctx.fillStyle=l.bg;ctx.fillRect(0,i*128,1024,128);ctx.fillStyle=l.fg;ctx.font=`${l.font} 76px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';if(l.text==='CREST'){
        ctx.fillStyle='#b59b4c';ctx.beginPath();ctx.ellipse(512,i*128+71,145,48,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#223e6a';ctx.beginPath();ctx.ellipse(512,i*128+71,95,36,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c9ae58';ctx.font='bold 56px serif';ctx.fillText('RCMP',512,i*128+75,170);ctx.fillStyle='#b59b4c';ctx.fillRect(450,i*128+9,124,15);for(let j=0;j<5;j++)ctx.fillRect(450+j*26,i*128+1,12,12);
      }else ctx.fillText(l.text,512,i*128+64,990);
      const g=new THREE.PlaneGeometry(l.w,l.h);const uv=g.attributes.uv;for(let j=0;j<uv.count;j++)uv.setY(j,1-(i+1-uv.getY(j))/labels.length);
      g.rotateY(l.side===0?Math.PI:l.side>0?Math.PI/2:-Math.PI/2);g.translate(l.x,l.y,l.z);gs.push(g.toNonIndexed());});
    if(gs.length){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;result.push({geometry:mergeGeometries(gs,false),material:new THREE.MeshStandardMaterial({map:t,roughness:.45,transparent:true,alphaTest:.02}),name:`${name} lettering`});}
    return result;
  }
  return {box,profile,rod,wheel,label,quad,finish};
}
function bus(){
  const k=kit(),{box:b,rod:r}=k;
  k.profile([[-5.85,.48],[-5.97,1.15],[-5.86,2.95],[-5.55,3.18],[5.6,3.18],[5.9,2.94],[5.9,.48]],2.5);
  b(2.53,.63,11.65,0,.84,0,'metal',0x929ca3);b(2.48,.23,11.8,0,.48,0,'rubber');
  for(const side of [-1,1]){
    const x=side*1.268;
    b(.025,.10,11.45,x,1.32,0,'paint',0x164c6d);b(.027,.06,11.45,x,1.43,0,'paint',0x52a98f);
    for(let i=0;i<8;i++){
      const z=-4.9+i*1.36;
      // Right side entrance and rear exit retain visible paired door leaves.
      const door=side===1&&(i===0||i===4);
      b(.045,door?2.24:1.22,1.27,x,door?1.62:2.24,z,'rubber');
      b(.06,door?1.96:1.09,1.13,x+side*.013,door?1.67:2.24,z,'glass');
      b(.075,door?2.15:1.18,.045,x+side*.025,door?1.65:2.24,z,'metal',0x697278);
      if(!door)b(.075,.035,1.2,x+side*.025,2.56,z,'metal',0x697278);
    }
    for(let i=0;i<12;i++)b(.036,.012,.55,x,.91+i*.018,4.8,'rubber');
    k.label('BCTransit',2.1,.35,x+side*.045,1.07,-3.5,side,'#a7afb4');
    k.label('9201   www.bctransit.com',3.9,.18,x,3.03,-2.5,side);
    k.label('DEPARTURE BAY  •  RIDE LOCAL',3.1,.62,x+side*.04,.86,.3,side,'#233e5a','#ffffff');
    r([side*1.12,2.8,-5.65],[side*1.55,2.6,-6.0],.033);b(.17,.44,.12,side*1.56,2.38,-6.0,'rubber');
    for(const z of [-3.65,3.65])k.wheel(side*1.12,z,.52);
    b(.15,.08,.14,side*1.08,3.2,-5.55,'lamps',0xffab28);
    b(.25,.18,.07,side*.92,.99,-5.99,'lamps',0xffefc4);
    b(.18,.25,.08,side*1.02,1.04,5.93,'lamps',0xd52c25);
  }
  b(2.22,1.41,.055,0,2.08,-5.99,'glass');b(.045,1.4,.06,0,2.08,-6.03,'rubber');
  b(2.25,.36,.06,0,2.91,-5.91,'rubber');k.label('DEPARTURE BAY',2.13,.27,0,2.91,-5.952,0,'#101714','#ffae3a');
  k.label('BCTransit',1.9,.31,0,1.17,-6.018);k.label('BC • 9201',.39,.15,-.93,.52,-6.045);
  for(const s of [-1,1])r([s*.13,1.44,-6.04],[s*.85,1.76,-6.04],.018);
  b(2.42,.19,.16,0,.66,-5.98,'rubber');
  // Folded front cycle carrier: open tubular geometry rather than a painted square.
  for(const x of [-.74,.74]){r([x,.52,-6.16],[x,1.23,-6.16],.03);r([x,.54,-6.16],[x,.54,-6.29],.025);}
  for(const y of [.56,.9,1.21])r([-.75,y,-6.16],[.75,y,-6.16],.025);
  b(1.45,.2,2.25,0,3.29,3.0,'paint',0xd8dbdc);
  return k.finish('BC Transit');
}
function cybertruck(){
  const k=kit(),{box:b}=k;
  k.profile([[-2.84,.53],[-2.78,1.04],[-.62,1.93],[.13,1.95],[2.76,1.32],[2.8,.54]],2.05,'metal',0xa5aaad);
  k.profile([[-1.78,1.43],[-.57,1.9],[.10,1.9],[1.3,1.56],[1.3,1.34]],2.065,'glass');
  k.quad([[-.92,1.45,-1.82],[.92,1.45,-1.82],[.92,1.935,-.61],[-.92,1.935,-.61]]);
  b(1.7,.07,.10,0,1.08,-2.8,'lamps',0xe2f8ff);b(1.83,.045,.06,0,1.25,2.81,'lamps',0xde222e);
  b(2.05,.23,5.25,0,.52,0,'rubber');
  for(const s of [-1,1]){
    for(const z of [-1.81,1.72]){if(s===1)k.profile([[z-.61,.50],[z-.60,.88],[z-.37,1.1],[z+.37,1.1],[z+.60,.88],[z+.61,.50]],2.09,'rubber');k.wheel(s*1.0,z,.47,true);}
    b(.03,.025,.35,s*1.04,1.27,-.3,'rubber');b(.03,.025,.35,s*1.04,1.27,.62,'rubber');
    b(.024,.75,.018,s*1.037,.98,.18,'rubber');b(.15,.13,.24,s*1.09,1.5,-1.1,'rubber');
  }
  // Slatted tonneau cover follows rear roof slope.
  for(let i=0;i<14;i++)b(1.72,.025,.08,0,1.83-i*.031,.55+i*.14,'rubber');
  return k.finish('Cybertruck');
}
function rcmp(){
  const k=kit(),{box:b}=k;
  k.profile([[-2.53,.4],[-2.48,1.12],[-1.35,1.24],[-.72,1.83],[1.66,1.85],[2.45,1.55],[2.5,.4]],1.99);
  k.profile([[-1.18,1.31],[-.65,1.73],[1.57,1.75],[2.16,1.5],[2.16,1.29]],2.013,'glass');
  k.quad([[-.88,1.31,-1.31],[.88,1.31,-1.31],[.85,1.855,-.72],[-.85,1.855,-.72]]);
  b(1.95,.28,4.6,0,.4,0,'rubber');b(1.99,.34,.13,0,.65,-2.53,'rubber');b(1.35,.29,.08,0,1.04,-2.56,'rubber');
  // Recessed grille slats, centre badge, lower intake and road-use front plate.
  for(let row=0;row<5;row++)b(1.24,.015,.017,0,.935+row*.047,-2.608,'metal',0x535b62);
  b(.22,.055,.018,0,1.05,-2.625,'metal',0x88959e);
  b(1.14,.105,.017,0,.62,-2.604,'rubber');
  k.label('BC  •  405',.37,.16,.66,.67,-2.612,0,'#e3e7df','#243b60');
  for(const side of [-1,1])k.rod([side*.10,1.334,-1.327],[side*.69,1.386,-1.259],.014);
  for(const s of [-1,1]){
    k.wheel(s*.91,-1.62,.42,true);k.wheel(s*.91,1.54,.42,true);
    for(const z of [-.26,1.03])b(.025,.52,.095,s*1.02,1.51,z,'rubber');
    b(.02,.085,3.89,s*1.014,1.18,-.25,'paint',0xdba923);b(.021,.045,3.89,s*1.018,1.24,-.25,'paint',0xcc3b42);
    b(.024,.14,3.9,s*1.02,1.075,-.25,'paint',0x174e92);
    k.label('RCMP       GRC',1.5,.24,s*1.038,.77,-.29,s,'transparent');
    k.label('POLICE',.93,.19,s*1.037,.85,1.14,s,'transparent');
    // Gold badge silhouette with inset blue centre on both front doors.
    // Text atlas carries the crest motif to keep traffic draw calls bounded.
    k.label('CREST',.33,.37,s*1.044,.89,-.29,s,'transparent');
    b(.12,.045,2.25,s*.7,1.9,.39,'rubber');b(.16,.14,.22,s*1.085,1.36,-1.06,'rubber');
    b(.41,.15,.07,s*.72,1.12,-2.56,'lamps',0xe5f4ff);b(.2,.49,.09,s*.84,1.25,2.51,'lamps',0xce272d);
    for(const z of [-.72,.54])b(.035,.045,.23,s*1.032,1.27,z,'rubber');
  }
  b(1.2,.09,.31,0,1.96,-.18,'rubber');
  b(.53,.1,.28,-.31,2.05,-.18,'lamps',0xd94449);b(.53,.1,.28,.31,2.05,-.18,'lamps',0x4189e6);
  k.rod([.4,1.93,1.03],[.4,2.22,1.03],.012);
  b(1.92,.055,.27,0,1.86,2.04,'rubber');
  return k.finish('RCMP');
}
export function buildReferenceVehicle(type){return ({bus,cybertruck,rcmp})[type]?.()??null;}
