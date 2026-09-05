// Black-tailed deer hazards. Locations use actual LiDAR canopy peaks and City/OSM
// footprint clearance; behaviour is fictional. A new race reset restores each deer.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CFG,clamp,pointInPoly,distPointToSeg} from './util.js';
export const DEER_FATAL_SPEED=CFG.player.vmax*.9;
export const DEER_PENALTY=250;

// The body is material-batched; four two-joint legs, neck and ears remain articulated.
export function buildDeer(buck=false) {
  const root=new THREE.Group();root.name=buck?'Black-tailed buck':'Black-tailed doe';
  const body=new THREE.Group();root.add(body);
  const mats={fur:new THREE.MeshStandardMaterial({color:buck?0x80674f:0x967959,roughness:.98}),light:new THREE.MeshStandardMaterial({color:0xd8cbb1,roughness:.98}),dark:new THREE.MeshStandardMaterial({color:0x322b26,roughness:.9}),eye:new THREE.MeshStandardMaterial({color:0x100d09,roughness:.12}),horn:new THREE.MeshStandardMaterial({color:0xb6a58a,roughness:.84})};
  function kit(parent){const parts={};return {ell(k,x,y,z,sx,sy,sz,rz=0){const g=new THREE.SphereGeometry(1,20,14);g.scale(sx,sy,sz);g.rotateZ(rz);g.translate(x,y,z);(parts[k]??=[]).push(g);},tube(k,a,b,r1,r2){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av),g=new THREE.CylinderGeometry(r2,r1,d.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());(parts[k]??=[]).push(g);},finish(){for(const[k,gs]of Object.entries(parts)){const g=mergeGeometries(gs.map(g=>g.index?g.toNonIndexed():g));const m=new THREE.Mesh(g,mats[k]);m.castShadow=m.receiveShadow=true;parent.add(m);for(const g of gs)g.dispose();}}};}
  const k=kit(body);
  // Forward +z: deep chest, tapering abdomen, broad haunches and cream rump.
  k.ell('fur',0,1.08,0,.29,.37,.66);k.ell('fur',0,1.13,.39,.30,.39,.30);k.ell('fur',0,1.10,-.46,.32,.36,.30);
  k.ell('light',0,.91,.08,.245,.13,.49);k.ell('light',0,1.10,-.695,.20,.23,.045);
  k.ell('dark',0,1.19,-.77,.08,.19,.055,-.12);k.finish();
  const neck=new THREE.Group();neck.position.set(0,1.23,.47);body.add(neck);const n=kit(neck);
  n.ell('fur',0,.24,.13,.18,.41,.20,-.05);n.ell('light',0,.25,.292,.11,.27,.035);
  n.ell('fur',0,.63,.22,.19,.23,.26);n.ell('fur',0,.55,.45,.128,.12,.24);n.ell('dark',0,.55,.652,.108,.069,.054);
  n.ell('light',0,.48,.45,.105,.055,.20);
  for(const side of [-1,1]){n.ell('dark',side*.169,.66,.34,.033,.036,.056);n.ell('eye',side*.19,.665,.352,.018,.023,.027);}
  if(buck)for(const side of [-1,1]){const chain=[[side*.105,.78,.13],[side*.17,1.01,.08],[side*.31,1.20,-.02],[side*.42,1.35,.07]];for(let j=1;j<chain.length;j++)n.tube('horn',chain[j-1],chain[j],.027-j*.004,.021-j*.004);n.tube('horn',chain[1],[side*.14,1.25,.25],.018,.005);n.tube('horn',chain[2],[side*.28,1.46,.16],.016,.004);}
  n.finish();const ears=[];
  for(const side of [-1,1]){const ear=new THREE.Group();ear.position.set(side*.13,.76,.19);ear.rotation.z=-side*.61;neck.add(ear);const e=kit(ear);e.ell('fur',0,.15,0,.08,.21,.043);e.ell('light',0,.15,.035,.052,.145,.018);e.finish();ears.push(ear);}
  const legs=[];
  for(const z of [.43,-.44])for(const side of [-1,1]){const hip=new THREE.Group();hip.position.set(side*.205,1.05,z);body.add(hip);const u=kit(hip);u.ell('fur',0,-.15,0,z<0?.105:.073,.22,.09);u.tube('fur',[0,-.11,0],[0,-.49,.025],.063,.038);u.finish();const shin=new THREE.Group();shin.position.set(0,-.49,.025);hip.add(shin);const l=kit(shin);l.tube('fur',[0,0,0],[0,-.43,-.015],.034,.022);l.ell('dark',0,-.49,.014,.043,.07,.067);l.finish();legs.push({hip,shin,phase:side*(z>0?1:-1)});}
  return {root,body,neck,ears,legs};
}

function routePoint(c,s){let i=0;while(i<c.cum.length-2&&c.cum[i+1]<s)i++;const t=clamp((s-c.cum[i])/(c.cum[i+1]-c.cum[i]||1),0,1),a=c.pts[i],b=c.pts[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,nx:-(b[1]-a[1])/len,nz:(b[0]-a[0])/len,hw:c.hw[i],s};}
export function selectDeerSites(map,corridor){
  const trees=map.canopyTrees??[],sites=[];
  for(const target of [1060,1610,1880,2110,2460]){
    let best=null;
    for(let s=target-45;s<=target+45;s+=15)for(const side of [-1,1]){
      if(s>=corridor.total-100)continue;const p=routePoint(corridor,s),offset=p.hw+10,x=p.x+p.nx*offset*side,z=p.z+p.nz*offset*side;
      const count=trees.filter(t=>(t.h??0)>6&&Math.hypot(t.x-x,t.z-z)<42).length;if(count<6)continue;
      if((map.buildings??[]).some(b=>pointInPoly(b.p,x,z)||b.p.some((a,i)=>{const q=b.p[(i+1)%b.p.length];return distPointToSeg(x,z,...a,...q).d<7;})))continue;
      const score=count-Math.abs(s-target)*.025;if(!best||score>best.score)best={...p,side,offset,canopyCount:count,score};
    }if(best)sites.push(best);
  }return sites;
}

/** onHit({fatalToDeer,penalty,speed,deer}) fires once per deer per reset.
 * Caller crashes rider for !fatalToDeer and deducts penalty otherwise.
 * player.pos is ground-level world position; player.v is m/s. */
export class Deer {
  constructor(scene,map,terrain,corridor,{onHit=()=>{}}={}){
    this.terrain=terrain;this.onHit=onHit;this.previous=null;this.time=0;
    this.animals=selectDeerSites(map,corridor).map((site,i)=>{const model=buildDeer(i%3===1);scene.add(model.root);return {...model,site,index:i};});this.reset();
  }
  ground(x,z){if(this.terrain.renderedGroundHeight)return this.terrain.renderedGroundHeight(x,z);const r=this.terrain.roadDeck(x,z);return r&&r.d<=r.hw+.7?r.y:(this.terrain.meshHeight(x,z)??this.terrain.groundHeight(x,z));}
  place(a){const p=a.site;a.root.position.set(p.x+p.nx*a.offset,p.y??0,p.z+p.nz*a.offset);a.root.position.y=this.ground(a.root.position.x,a.root.position.z);a.root.rotation.y=Math.atan2(-p.nx*p.side,-p.nz*p.side);}
  reset(){this.previous=null;this.time=0;for(const a of this.animals){a.offset=a.site.offset*a.site.side;a.state='waiting';a.timer=0;a.hit=false;a.body.rotation.set(0,0,0);a.body.position.set(0,0,0);a.root.visible=true;this.pose(a,0,0);this.place(a);}}
  pose(a,t,speed){const stride=Math.min(1,speed/3.6);for(const l of a.legs){const swing=Math.sin(t*7+(l.phase>0?Math.PI:0))*stride;l.hip.rotation.x=swing*.58;l.shin.rotation.x=Math.max(0,-swing)*.62;}a.neck.rotation.x=Math.sin(t*1.1+a.index)*.045;for(let i=0;i<2;i++)a.ears[i].rotation.y=Math.sin(t*.8+i*2)*.12;}
  update(dt,player,riding){
    if(!player?.pos)return;if(!riding||player.state==='crashed'){this.previous=null;return;}
    dt=Math.max(0,Math.min(dt,.12));this.time+=dt;const before=this.previous??{x:player.pos.x,y:player.pos.y,z:player.pos.z};
    for(const a of this.animals){
      const old=a.root.position.clone();let speed=0;const dist=Math.hypot(player.pos.x-old.x,player.pos.z-old.z);
      // Give fast riders the same visible crossing opportunity; approach starts at
      // a speed-scaled distance, never by spawning an animal on the asphalt.
      if(a.state==='waiting'&&dist<Math.max(115,Math.min(350,Math.abs(player.v)*7.4))){a.state='approach';a.timer=0;}
      if(a.state==='approach'){speed=1.6;a.offset-=a.site.side*speed*dt;if(Math.abs(a.offset)<=a.site.hw+1.2){a.state='alert';a.timer=0;}}
      else if(a.state==='alert'){a.timer+=dt;if(a.timer>.65){a.state='crossing';a.timer=0;}}
      else if(a.state==='crossing'||a.state==='flee'){speed=a.state==='flee'?7.2:3.8;a.offset-=a.site.side*speed*dt;if(a.offset*a.site.side < -a.site.offset-12){a.state='departed';}}
      else if(a.state==='fallen'){a.timer=Math.min(1,a.timer+dt*2.5);a.body.rotation.z=a.site.side*a.timer*Math.PI*.47;a.body.position.y=a.timer*.32;}
      this.place(a);if(a.state!=='fallen')this.pose(a,this.time+3*a.index,speed);
      // Relative swept segment accounts for both rider and animal motion. Keep jump
      // clearance: a rider whose wheels remain above the deer's back misses it.
      const end=a.root.position;const startX=before.x-old.x,startZ=before.z-old.z,endX=player.pos.x-end.x,endZ=player.pos.z-end.z;
      const sweep=distPointToSeg(0,0,startX,startZ,endX,endZ);
      const y=(before.y-old.y)+(player.pos.y-end.y-before.y+old.y)*sweep.t;
      if(!a.hit&&a.state!=='departed'&&a.state!=='fallen'&&sweep.d<1.10&&y<1.65&&y>-.8){
        a.hit=true;const speed=Math.abs(player.v),fatalToDeer=speed>=DEER_FATAL_SPEED;a.state=fatalToDeer?'fallen':'flee';a.timer=0;
        this.onHit({fatalToDeer,penalty:fatalToDeer?DEER_PENALTY:0,speed,deer:a});
      }
    }
    this.previous={x:player.pos.x,y:player.pos.y,z:player.pos.z};
  }
}
