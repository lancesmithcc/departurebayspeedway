// Authored pickup props. Shared resources keep the throw pool allocation-free.
import * as THREE from 'three';
let cache;
function canvasTexture(draw, w = 512, h = 512, color = true) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function speckle(base, colors, count, grain = 3) {
  return canvasTexture((c,w,h) => {
    c.fillStyle = base; c.fillRect(0,0,w,h);
    let seed = 8913;
    const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    for(let i=0;i<count;i++) { c.fillStyle=colors[i%colors.length]; c.beginPath(); c.ellipse(random()*w,random()*h,1+random()*grain,.6+random()*grain,random()*6.28,0,6.28); c.fill(); }
  });
}
function label(title, subtitle, bg, ink, border) {
  return canvasTexture((c,w,h) => {
    c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle=border;c.lineWidth=12;c.strokeRect(15,15,w-30,h-30);
    c.textAlign='center';c.fillStyle=ink;c.font='bold 104px Georgia';c.fillText(title,w/2,h*.52);
    c.font='bold 38px Georgia';c.fillText(subtitle,w/2,h*.75);
    c.fillStyle=border;c.fillRect(w*.25,h*.23,w*.5,4);
  },1024,512);
}
function mat(color, roughness=.7, metalness=0, map=null) { return new THREE.MeshStandardMaterial({color,roughness,metalness,map}); }
function rounded(w,h,d,r=.008) {
  const s=new THREE.Shape(); const x=-w/2+r,y=-h/2+r;
  s.moveTo(x,y);s.lineTo(x+w-2*r,y);s.lineTo(x+w-2*r,y+h-2*r);s.lineTo(x,y+h-2*r);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:d-2*r,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:r,bevelThickness:r,curveSegments:1});
  g.translate(0,0,-d/2+r);
  // Box-project every face separately so crumb grain does not smear along cut edges.
  const uv=g.attributes.uv,p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<uv.count;i++) {
    const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    if(ny>=nx&&ny>=nz)uv.setXY(i,p.getX(i)/w+.5,p.getZ(i)/d+.5);
    else if(nx>=nz)uv.setXY(i,p.getZ(i)/d+.5,p.getY(i)/h+.5);
    else uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);
  }
  return g;
}
function mesh(g,geometry,material,x=0,y=0,z=0) { const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m; }
// Bake static subparts into one draw per material; pool bars retain their shared layer meshes.
function batch(g) {
  g.updateMatrixWorld(true);
  const groups=new Map();
  g.traverse(o=>{if(o.isMesh){if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(o);}});
  const result=new THREE.Group();result.name=g.name;
  for(const [material,parts] of groups) {
    const arrays={position:[],normal:[],uv:[]};
    for(const part of parts) {
      const geo=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geo.applyMatrix4(part.matrixWorld);
      for(const key of Object.keys(arrays))arrays[key].push(geo.attributes[key].array);
      geo.dispose();
    }
    const geo=new THREE.BufferGeometry();
    for(const [key,sets] of Object.entries(arrays)) {
      const out=new Float32Array(sets.reduce((n,a)=>n+a.length,0));let at=0;for(const a of sets){out.set(a,at);at+=a.length;}
      geo.setAttribute(key,new THREE.BufferAttribute(out,key==='uv'?2:3));
    }
    mesh(result,geo,material);
  }
  return result;
}
function resources() {
  if(cache)return cache;
  const lucky=canvasTexture((c,w,h)=>{
    c.fillStyle='#eee2c3';c.fillRect(0,0,w,h);
    c.fillStyle='#b91e29';c.fillRect(0,h*.09,w,h*.82);
    for(const x of [w*.25,w*.75]) {
      c.fillStyle='#fff1ca';c.beginPath();c.ellipse(x,h*.5,w*.21,h*.31,0,0,Math.PI*2);c.fill();
      c.strokeStyle='#b99a54';c.lineWidth=6;c.stroke();c.textAlign='center';c.fillStyle='#b51d29';
      c.font='italic bold 75px Georgia';c.fillText('Lucky',x,h*.49);
      c.font='bold 35px Georgia';c.fillText('LAGER',x,h*.60);
      c.font='18px sans-serif';c.fillText('ORIGINAL • 355 mL',x,h*.71);
    }
    c.fillStyle='#c9b67b';c.fillRect(0,h*.075,w,7);c.fillRect(0,h*.9,w,7);
  },1024,512);
  const crumb=speckle('#483024',['#20160f','#82512f','#baa071','#dcc9a0'],3400,4);
  const chocolate=speckle('#3a2118',['#42271c','#301b14','#4a2b20'],1300,2);
  const custard=speckle('#f1d181',['#efcc76','#f9dfa0'],1700,1.2);
  const paper=speckle('#e2c89d',['#cdb487','#ecd8b3'],2800,1);
  const silver=mat(0xd7dee3,.23,.88), dark=mat(0x313332,.48,.3);
  cache={silver,dark,red:mat(0xb8212b,.66),gold:mat(0xe6b84f,.22,.82),paper:mat(0xffffff,.94,0,paper),parchment:mat(0xfff0d3,.96),
    lucky:mat(0xffffff,.35,.35,lucky),caseLabel:mat(0xffffff,.72,0,label('Lucky','ORIGINAL LAGER • SIX PACK','#b3212d','#fff3cf','#dbb65a')),
    bakeryLabel:mat(0xffffff,.8,0,label('NANAIMO','CHOCOLATE • CUSTARD • COCONUT','#f4e7c8','#402b24','#b5995c')),
    coffeeLabel:mat(0xffffff,.8,0,label('DOUBLE','DOUBLE  •  FRESH BREWED','#ac302a','#fff2d4','#d5a65c')),
    barParts:[{g:rounded(.3,.078,.22),mat:mat(0xffffff,.9,0,crumb),y:.039},{g:rounded(.299,.066,.219,.006),mat:mat(0xffffff,.55,0,custard),y:.109},{g:rounded(.304,.038,.224,.006),mat:mat(0xffffff,.27,0,chocolate),y:.160}],
    canBody:new THREE.CylinderGeometry(.139,.139,.45,32,1,true), rim:new THREE.TorusGeometry(.126,.010,8,32),top:new THREE.CylinderGeometry(.123,.127,.016,32),tab:new THREE.TorusGeometry(.027,.008,6,16),
  };
  cache.barParts[0].mat.bumpMap=crumb;cache.barParts[0].mat.bumpScale=.005;
  cache.barParts[2].mat.bumpMap=chocolate;cache.barParts[2].mat.bumpScale=.0006;
  return cache;
}
export function createNanaimoBar() {
  const g=new THREE.Group();g.name='Three-layer Nanaimo bar';
  for(const p of resources().barParts)mesh(g,p.g,p.mat,0,p.y,0);
  return g;
}
export function createLuckyCase() {
  const r=resources(),g=new THREE.Group();g.name='Lucky Lager six-pack';
  mesh(g,rounded(1.04,.12,.72,.018),r.red,0,-.25,0);
  for(const z of [-.35,.35]) {
    mesh(g,rounded(1.04,.24,.022,.006),r.red,0,-.16,z);
    const panel=mesh(g,new THREE.PlaneGeometry(.98,.20),r.caseLabel,0,-.15,z+Math.sign(z)*.015);if(z<0)panel.rotation.y=Math.PI;
  }
  for(const x of [-.51,.51])mesh(g,new THREE.BoxGeometry(.022,.24,.7),r.red,x,-.16,0);
  for(const x of [-.525,.525]) {const p=mesh(g,new THREE.PlaneGeometry(.66,.19),r.caseLabel,x,-.15,0);p.rotation.y=Math.sign(x)*Math.PI/2;}
  // Six identical cans share geometry, with exposed rolled aluminum shoulders and pull tabs.
  for(let i=0;i<6;i++) {
    const can=new THREE.Group();can.position.set((i%3-1)*.32,0,(Math.floor(i/3)-.5)*.32);g.add(can);
    mesh(can,r.canBody,r.lucky).rotation.y=Math.PI/2;
    for(const y of [-.229,.229]) {
      mesh(can,r.top,r.silver,0,y,0);
      const ring=mesh(can,r.rim,r.silver,0,y,0);ring.rotation.x=Math.PI/2;
    }
    const tab=mesh(can,r.tab,r.silver,0,.244,.025);tab.rotation.x=Math.PI/2;tab.scale.set(.8,1.4,1);
    const slot=mesh(can,new THREE.CircleGeometry(.026,16),r.dark,0,.239,-.045);slot.rotation.x=-Math.PI/2;slot.scale.y=1.4;
  }
  return batch(g);
}
export function createCoffee() {
  const r=resources(),g=new THREE.Group();g.name='Double-double coffee';
  mesh(g,new THREE.CylinderGeometry(.26,.19,.7,40),r.parchment);
  mesh(g,new THREE.CylinderGeometry(.241,.216,.26,40,1,true),r.coffeeLabel,0,-.02,0);
  for(const y of [-.343,.344]) {const ring=mesh(g,new THREE.TorusGeometry(y<0?.188:.261,.012,8,40),r.parchment,0,y,0);ring.rotation.x=Math.PI/2;}
  mesh(g,new THREE.CylinderGeometry(.279,.285,.048,40),r.dark,0,.375,0);
  mesh(g,new THREE.CylinderGeometry(.249,.275,.06,40),r.dark,0,.42,0);
  const ridge=mesh(g,new THREE.TorusGeometry(.244,.012,8,40),r.dark,0,.452,0);ridge.rotation.x=Math.PI/2;
  const sip=mesh(g,rounded(.086,.015,.035,.005),mat(0x090909,.4),0,.454,.175);
  sip.rotation.x=.08;
  mesh(g,new THREE.SphereGeometry(.008,8,6),r.silver,0,.453,-.12).scale.y=.25;
  return batch(g);
}
export function createBarCrate() {
  const r=resources(),g=new THREE.Group();g.name='Nanaimo bakery tray';
  mesh(g,rounded(1.04,.08,.74,.018),r.paper,0,-.22,0);
  for(const z of [-.36,.36])mesh(g,new THREE.BoxGeometry(1.04,.13,.025),r.paper,0,-.125,z);
  for(const x of [-.51,.51])mesh(g,new THREE.BoxGeometry(.025,.13,.72),r.paper,x,-.125,0);
  const liner=mesh(g,rounded(.98,.018,.69,.007),r.parchment,0,-.165,0);liner.rotation.y=.015;
  for(let i=0;i<6;i++){const bar=createNanaimoBar();bar.position.set((i%3-1)*.31,-.10,(Math.floor(i/3)-.5)*.3);bar.scale.set(1,1.4,1.25);g.add(bar);}
  for(const z of [-.377,.377]) {const sign=mesh(g,new THREE.PlaneGeometry(.78,.11),r.bakeryLabel,0,-.125,z);if(z<0)sign.rotation.y=Math.PI;}
  return batch(g);
}
export function createBlessing() {
  const r=resources(),g=new THREE.Group();g.name='Golden blessing aureole';
  for(const radius of [.41,.49])mesh(g,new THREE.TorusGeometry(radius,radius===.41?.026:.009,10,64),r.gold,0,.14,0);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;const ray=mesh(g,new THREE.ConeGeometry(.014,i%3===0?.17:.095,5),r.gold,Math.sin(a)*.55,.14+Math.cos(a)*.55,0);ray.rotation.z=-a;}
  mesh(g,rounded(.085,.51,.075,.009),r.gold,0,.15,0);
  mesh(g,rounded(.32,.077,.076,.009),r.gold,0,.24,0);
  const gem=mesh(g,new THREE.OctahedronGeometry(.066),new THREE.MeshStandardMaterial({color:0xffe9a8,metalness:.25,roughness:.14,emissive:0xffb13b,emissiveIntensity:.65}),0,.24,.058);gem.scale.z=.55;
  return batch(g);
}
