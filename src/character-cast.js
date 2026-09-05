// Authored adult local cast. Clothing patterns and details are geometry/vertex colour,
// so the animated instanced crowd keeps them without texture loads or extra draws.
import * as THREE from 'three';
import {flatten} from './models.js';
const TAU=Math.PI*2;
export const CHARACTER_KINDS=['muscular','hoodie','shirtless','leopard','shirtlessBlue','leopardPink'];
const specs={
 muscular:{name:'The moustached lifter',gender:'male',skin:0xb77b58,shirt:0x264a4c,pants:0x293641,width:.25,belly:.16},
 hoodie:{name:'The sidewalk dancer',gender:'female',skin:0x9d674f,shirt:0x915bd5,pants:0x253c47,width:.29,belly:.23,dance:true},
 shirtless:{name:'The denim regular',gender:'male',skin:0xc99676,shirt:0xc99676,pants:0x304b69,width:.31,belly:.28},
 leopard:{name:'The turquoise local',gender:'female',skin:0xc38361,shirt:0x26bdaf,pants:0x271e35,width:.31,belly:.25},
 shirtlessBlue:{name:'The cap and chain regular',gender:'male',skin:0x835941,shirt:0x835941,pants:0x627b93,width:.33,belly:.29},
 leopardPink:{name:'The fuchsia local',gender:'female',skin:0xe0ae8b,shirt:0xe33691,pants:0x442e58,width:.30,belly:.25}
};
function material(name,color){const m=new THREE.MeshStandardMaterial({color,roughness:.78});m.name=name;return m;}
function ell(parent,mat,x,y,z,sx,sy,sz,detail=12){const o=new THREE.Mesh(new THREE.SphereGeometry(1,detail,8),mat);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;}
function box(parent,mat,x,y,z,w,h,d){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);parent.add(o);return o;}
function line(parent,mat,points,r=.006){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const o=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(5,points.length*3),r,5,false),mat);parent.add(o);return o;}
function ring(parent,mat,x,y,z,r=.015){const o=new THREE.Mesh(new THREE.TorusGeometry(r,.0035,4,9),mat);o.position.set(x,y,z);parent.add(o);return o;}
function group(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function segment(parent,mat,r1,r2,length){const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,length,10),mat);o.position.y=-length/2;parent.add(o);return o;}
function leopard(mesh){mesh.material=mesh.material.clone();mesh.material.vertexColors=true;const g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv,c=new Float32Array(p.count*3),dark=new THREE.Color(0x201523),gold=new THREE.Color(0xedbc70),white=new THREE.Color(0xffffff);for(let i=0;i<p.count;i++){const u=uv.getX(i)*9,v=uv.getY(i)*6,row=Math.floor(v),col=Math.floor(u),du=u+Math.sin(row*13.1)*.25,a=du-Math.floor(du)-.5,b=v-row-.5,d=Math.hypot(a*(1+.12*Math.sin(row)),b*(1+.2*Math.sin(col*3))),angle=Math.atan2(b,a),edge=.3+.05*Math.sin(angle*3+row+col);const cc=d>edge-.08&&d<edge+.06&&Math.sin(angle+row*2)>.0?dark:d<edge?gold:white;cc.toArray(c,i*3);}g.setAttribute('color',new THREE.BufferAttribute(c,3));}

// Smooth lofted cross-sections make one continuous skin/cloth surface. Radius,
// front/back depth and centre shift vary independently along the body.
function sculpt(parent,mat,rings,{segments=24,steps=28,fold=0,deform=null,name='Sculpted surface'}={}){
 const curve=new THREE.CatmullRomCurve3(rings.map(r=>new THREE.Vector3(r[1],r[2],r[3]||0)));
 const ys=rings.map(r=>r[0]),pos=[],uv=[],indices=[];
 for(let j=0;j<=steps;j++){const t=j/steps,at=t*(rings.length-1),i=Math.min(rings.length-2,Math.floor(at)),f=at-i;
  const y=THREE.MathUtils.lerp(ys[i],ys[i+1],f),r=curve.getPoint(t);
  for(let k=0;k<=segments;k++){const a=k/segments*TAU,wrinkle=fold*Math.sin(t*35+Math.sin(a*3)*1.3)*Math.pow(Math.sin(a),2);
   let x=Math.cos(a)*(r.x+wrinkle),z=Math.sin(a)*(r.y+wrinkle)+r.z;
   if(deform){const point=deform(x,y,z,a,t);x=point[0];z=point[1];}
   pos.push(x,y,z);uv.push(k/segments,t);
   if(j<steps&&k<segments){const n=j*(segments+1)+k;indices.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2);}
  }
 }
 if(ys[ys.length-1]<ys[0])for(let i=0;i<indices.length;i+=3){const a=indices[i];indices[i]=indices[i+2];indices[i+2]=a;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 // Smooth the duplicated radial seam explicitly.
 const n=g.attributes.normal;for(let j=0;j<=steps;j++){const a=j*(segments+1),b=a+segments,v=new THREE.Vector3().fromBufferAttribute(n,a).add(new THREE.Vector3().fromBufferAttribute(n,b)).normalize();n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);}
 const mesh=new THREE.Mesh(g,mat);mesh.name=name;parent.add(mesh);return mesh;
}
function gauss(x,c,w){return Math.exp(-Math.pow((x-c)/w,2));}
export function buildCharacter(kind='muscular'){
 const s=specs[kind]||specs.muscular,shirtless=kind.startsWith('shirtless'),print=kind.startsWith('leopard'),root=new THREE.Group();root.name=s.name;
 const skin=material('Skin',s.skin),shirt=material('Shirt',s.shirt),pants=material('Pants',s.pants),hair=material('Hair',0x30251f),shoe=material('Shoes',0x25272c),sole=material('Shoes soles',0xd6d2c6),trim=material('Shirt stitching',0xc7aa78),metal=material('Accessory silver',0xb8bfc3),eye=material('Eyes',0x1e2426),lip=material('Skin lips',0x985e50),white=material('Eyes whites',0xe5dfd4);
 const body=group(root,0,0,0),w=s.width;
 const muscular=kind==='muscular';
 const torso=sculpt(body,shirtless?skin:shirt,[
 [.84,w*.66,.135,0],[.9,w*.82,s.belly*.78,.016],
 [1.01,w*.98,s.belly,.036],[1.13,w,s.belly*.95,.025],
 [1.24,w*(muscular?.98:.94),s.belly*.86,.01],
 [1.35,w*(muscular?1.12:.94),muscular?.15:s.belly*.77,0],
 [1.43,w*.88,.122,-.005],[1.48,.10,.079,0],[1.50,.077,.067,0]
 ],{segments:print?48:32,steps:print?40:32,fold:shirtless?0:.0035,name:'Continuous torso',deform:(x,y,z,a)=>{
   const front=Math.max(0,Math.sin(a));
   if(muscular)z+=front*(.020*gauss(y,1.34,.09)*(1-.6*gauss(x,0,.035))-.012*gauss(y,1.19,.07));
   if(shirtless)z+=front*(.010*gauss(y,1.32,.075)-.009*gauss(y,1.015,.025)*gauss(x,0,.018));
   return[x,z];
 }});
 if(print)leopard(torso);
 sculpt(body,pants,[[.72,w*.53,.135,0],[.77,w*.79,.16,-.015],[.85,w*.85,.16,-.012],[.91,w*.80,.153,0]],{steps:12,fold:.002,name:'Denim hips'});
 if(shirtless){ell(body,lip,0,1.018,s.belly+.021,.007,.010,.002);for(const side of [-1,1])ell(body,lip,side*.13,1.322,s.belly*.78+.018,.012,.007,.002);}
 if(muscular)for(const side of [-1,1])line(body,trim,[[side*.16,1.458,.09],[side*.227,1.39,.095],[side*.25,1.31,.055]],.003);
 // Belt loops, pocket welts, fly and a draped wallet chain.
 box(body,shoe,0,.91,.17,w*1.66,.035,.025);box(body,metal,0,.91,.191,.055,.042,.012);
 for(const side of [-1,1]){line(body,trim,[[side*.055,.9,.175],[side*.14,.83,.177],[side*.22,.86,.14]],.004);box(body,pants,side*.13,.81,-.174,.1,.09,.008);box(body,trim,side*.18,.92,.178,.017,.056,.009);}
 if(shirtless)for(let i=0;i<17;i++){const t=i/16;const q=ring(body,metal,w*.74+Math.sin(t*Math.PI)*.09,.90-Math.sin(t*Math.PI)*.16,.12-t*.20,.014);q.rotation.y=i%2?Math.PI/2:.2;}
 const head=group(body,0,1.48,0);
 sculpt(head,skin,[[-.065,.074,.068,0],[.02,.076,.072,.004],[.038,.075,.081,.014],[.075,.099,.095,.005],[.115,.12,.104,-.002],[.17,.126,.113,-.003],[.22,.126,.112,-.008],[.27,.12,.111,-.009],[.315,.092,.087,-.008],[.341,.040,.042,-.008],[.347,.001,.001,-.008]],{segments:40,steps:40,name:'Sculpted head jaw cheeks and nose',deform:(x,y,z,a)=>{
  const front=Math.pow(Math.max(0,Math.sin(a)),6);
  z+=front*(.033*gauss(x,0,.024)*gauss(y,.167,.063)+.027*gauss(x,0,.030)*gauss(y,.138,.021));
  z+=front*(.009*gauss(Math.abs(x),.065,.038)*gauss(y,.125,.026)-.012*gauss(Math.abs(x),.047,.025)*gauss(y,.203,.023));
  z+=front*(.009*gauss(x,0,.046)*gauss(y,.071,.021));return[x,z];
 }});
 for(const side of [-1,1]){
  ell(head,skin,side*.123,.174,-.007,.018,.033,.016,16);line(head,lip,[[side*.133,.195,0],[side*.136,.181,.006],[side*.132,.153,.003]],.003);
  ell(head,white,side*.047,.202,.103,.023,.011,.009,16);ell(head,eye,side*.047,.202,.112,.008,.009,.003,16);
  line(head,skin,[[side*.022,.202,.107],[side*.04,.216,.112],[side*.067,.209,.101]],.004);
  line(head,hair,[[side*.020,.229,.105],[side*.045,.235,.111],[side*.075,.226,.096]],.005);
  ell(head,lip,side*.013,.132,.151,.008,.003,.004);
 }
 line(head,lip,[[-.034,.089,.119],[-.014,.092,.125],[0,.089,.126],[.014,.092,.125],[.034,.089,.119]],.0035);
 line(head,skin,[[-.026,.082,.121],[0,.077,.127],[.026,.082,.121]],.004);
 if(kind==='muscular'){
  for(const side of [-1,1]){ell(head,eye,side*.063,.206,.135,.056,.034,.013);ring(head,metal,side*.063,.206,.147,.040).scale.set(1.3,.73,1);line(head,hair,[[side*.01,.112,.149],[side*.044,.106,.153],[side*.077,.12,.14],[side*.081,.144,.13]],.017);line(head,eye,[[side*.11,.213,.13],[side*.13,.213,.02]],.006);}box(head,metal,0,.212,.145,.026,.006,.005);
 }else{
  const haircap=sculpt(head,hair,[[.232,.129,.115,-.008],[.27,.124,.115,-.009],[.315,.096,.091,-.008],[.342,.044,.046,-.008],[.351,.001,.001,-.008]],{steps:16,segments:32,name:'Fitted hair scalp'});
  if(s.gender==='female'){for(const side of [-1,1]){ell(head,hair,side*.117,.118,-.044,.044,.16,.07);ring(head,metal,side*.142,.137,.025,.022);}}
  if(kind!=='hoodie'){const cap=shirtless?material('Shirt cap',kind==='shirtlessBlue'?0x923e36:0x22394a):shirt;ell(head,cap,0,.293,-.003,.148,.073,.14);const brim=ell(head,cap,0,.27,-.161,.14,.014,.098);box(head,shoe,0,.275,.134,.08,.032,.011);for(let i=-1;i<=1;i++)line(head,trim,[[i*.05,.354,0],[i*.065,.321,-.08],[i*.07,.28,-.137]],.0035);}
 }
 if(kind==='hoodie'){
  ell(body,shirt,0,1.46,-.08,.18,.14,.16);line(body,trim,[[-.056,1.44,.147],[-.061,1.3,.207],[-.065,1.21,.224]],.006);line(body,trim,[[.056,1.44,.147],[.069,1.31,.209],[.071,1.22,.23]],.006);line(body,trim,[[-.14,1.087,.225],[-.10,1.04,.253],[-.12,.982,.255],[0,.965,.269],[.12,.982,.255],[.10,1.04,.253],[.14,1.087,.225]],.003);
 }
 const arms=[];
 for(const side of [-1,1]){
  const shoulder=group(body,side*w*.90,1.37,0),bare=shirtless||kind==='muscular',am=bare?skin:shirt;
  sculpt(shoulder,am,[[.096,.001,.001,0],[.035,bare?.085:.105,.085,0],[-.045,bare?.089:.103,.10,.005],[-.12,bare?.087:.099,.083,.012],[-.205,.067,.068,0],[-.28,.057,.058,0],[-.30,.05,.05,0]],{steps:24,fold:bare?0:.003,name:'Sculpted upper arm'});
  const elbow=group(shoulder,0,-.28,0);
  sculpt(elbow,am,[[.02,.055,.056,0],[-.01,.061,.059,0],[-.07,.065,.066,.003],[-.145,.055,.052,.004],[-.23,.04,.035,0],[-.255,.041,.034,0]],{steps:22,fold:bare?0:.002,name:'Tapered forearm'});
  if(!bare)sculpt(elbow,shirt,[[-.217,.044,.039,0],[-.23,.044,.039,0],[-.254,.043,.037,0]],{steps:5,name:'Ribbed cuff'});
  const hand=group(elbow,0,-.285,0);ell(hand,skin,0,0,0,.047,.062,.022);
  for(let f=0;f<4;f++)line(hand,skin,[[(f-1.5)*.022,-.035,.003],[(f-1.5)*.022,-.09,.012],[(f-1.5)*.021,-.107,.026]],.010);
  line(hand,skin,[[side*.037,0,0],[side*.065,-.029,.006],[side*.06,-.049,.025]],.014);arms.push({shoulder,elbow,hand,side});
 }
 const legs=[];
 for(const side of [-1,1]){
  const upper=group(root,side*w*.49,.86,0);
  sculpt(upper,pants,[[.035,.10,.12,0],[-.015,.123,.13,-.01],[-.11,.119,.113,0],[-.23,.10,.102,0],[-.33,.083,.088,.004],[-.40,.082,.083,0]],{steps:26,fold:.004,name:'Tailored denim thigh'});
  const lower=group(root,0,0,0);ell(lower,pants,0,0,0,.083,.081,.084,20);
  sculpt(lower,pants,[[.02,.082,.084,0],[-.04,.085,.083,0],[-.12,.083,.081,-.008],[-.24,.067,.067,-.007],[-.33,.065,.060,0],[-.375,.068,.062,.002]],{steps:24,fold:.004,name:'Creased denim calf'});
  line(upper,trim,[[side*.116,-.035,.015],[side*.107,-.2,.016],[side*.082,-.36,.012]],.002);
  const foot=group(root,side*w*.49,0,0);
  const soleShape=[[.001,.062,.12,.043],[.007,.080,.144,.045],[.028,.082,.145,.045],[.039,.077,.139,.046]];
  sculpt(foot,sole,soleShape,{steps:8,segments:32,name:'Rounded moulded sneaker sole'});
  sculpt(foot,shoe,[[.036,.075,.133,.044],[.057,.077,.129,.046],[.092,.066,.10,.03],[.126,.057,.073,.001],[.159,.049,.055,-.025],[.169,.043,.05,-.027]],{steps:18,name:'Shaped leather sneaker upper'});
  line(foot,sole,[[-.07,.047,.08],[-.072,.049,.14],[0,.05,.177],[.072,.049,.14],[.07,.047,.08]],.0025);
  for(let i=0;i<4;i++)line(foot,sole,[[-.036,.133-i*.011,.023+i*.019],[0,.138-i*.011,.03+i*.019],[.036,.133-i*.011,.023+i*.019]],.0028);
  legs.push({upper,lower,foot,side});
 }
 root.userData={kind,voiceGender:s.gender,body,head,arms,legs,dance:!!s.dance,width:w};animateCharacter(root,0);return root;
}
const axis=new THREE.Vector3(0,-1,0);
function aimBone(g,a,b){g.position.copy(a);g.quaternion.setFromUnitVectors(axis,b.clone().sub(a).normalize());}
export function animateCharacter(root,time=0,mode){
 const d=root.userData,phase=time*TAU, dance=mode==='dance'||(mode!=='walk'&&d.dance);d.body.position.y=.008*Math.cos(phase*2);d.body.rotation.z=dance?.035*Math.sin(phase):.008*Math.sin(phase);d.head.rotation.y=.08*Math.sin(phase*.5);d.head.rotation.z=.035*Math.sin(phase);
 for(const a of d.arms){const p=phase+(a.side>0?Math.PI:0);a.shoulder.rotation.set(dance?-.45+.28*Math.cos(p):.36*Math.sin(p),0,dance?a.side*(1.75+.35*Math.sin(p)):-a.side*.08);a.elbow.rotation.x=dance?-.8+.3*Math.sin(p*.5):-.18-Math.max(0,Math.sin(p))*.25;a.hand.rotation.z=.12*Math.sin(p+.6);}
 for(const l of d.legs){const p=phase+(l.side>0?Math.PI:0),stride=dance?.065:.15,lift=Math.max(0,Math.sin(p))*(dance?.025:.055),hip=new THREE.Vector3(l.side*d.width*.49,.83+d.body.position.y,0),ankle=new THREE.Vector3(l.side*d.width*.49,.095+lift,Math.cos(p)*stride);l.foot.position.set(ankle.x,lift,ankle.z);const delta=ankle.clone().sub(hip),len=delta.length(),mid=hip.clone().addScaledVector(delta,.5),bend=Math.sqrt(Math.max(0,.39*.39-len*len*.25));mid.z+=bend;aimBone(l.upper,hip,mid);aimBone(l.lower,mid,ankle);l.upper.scale.y=hip.distanceTo(mid)/.39;l.lower.scale.y=mid.distanceTo(ankle)/.36;}
}
let cached;
export function createCharacterCast(){
 if(cached)return cached;
 cached=CHARACTER_KINDS.map(kind=>{const root=buildCharacter(kind),frames=[];let flat;
  for(let i=0;i<8;i++){animateCharacter(root,i/8);flat=flatten(root);flat.geometry.computeBoundingBox();frames.push(flat.geometry);if(i<7)flat.material.dispose();}
  const bounds=new THREE.Box3();frames.forEach(g=>bounds.union(g.boundingBox));const size=bounds.getSize(new THREE.Vector3());
  root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});const mats=new Set();root.traverse(o=>{if(o.isMesh)mats.add(o.material);});mats.forEach(m=>m.dispose());
  return {geometry:frames[0],frames,material:flat.material,parts:flat.parts,size,url:`cast:${kind}`,name:specs[kind].name,voiceGender:specs[kind].gender,animation:specs[kind].dance?'dance':'walk',adult:true};
 });return cached;
}
