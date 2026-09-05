import {register} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const {Terrain}=await import('../src/terrain.js');
const {ElevationGrid}=await import('../src/elevation-grid.js');
const {applyStreetProfile}=await import('../src/street-profile.js');
const {buildRoads}=await import('../src/roads.js');
const {TEX}=await import('../src/textures.js');TEX.asphalt=null;
const THREE=await import('three');
const {Player}=await import('../src/player.js');
const json=async p=>JSON.parse(await readFile(new URL('../data/'+p,import.meta.url),'utf8'));
const map=await json('map.json'), survey=await json('route-elevation.json');
const bytes=await readFile(new URL('../data/terrain-dtm.f32',import.meta.url));
map.elevationGrid=new ElevationGrid(await json('terrain-dtm.json'),new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
applyStreetProfile(map);
map.routeElevation=survey.elevations;map.routeElevationOffsets=survey.lateral_offsets_m;map.routeElevationCross=survey.cross_sections;
// Keep the identical pre-join runtime profile for locality and regression checks.
class BeforeTerrain extends Terrain {joinRouteJunctions(){}}
new BeforeTerrain(map);
const before=map.roads.map(r=>({...r,p:r.p.map(p=>p.slice()),e:r.e.slice(),cum:r.cum.slice()}));
const terrain=new Terrain(map);
const fullStarted=performance.now();
const fullRoads=buildRoads(map,terrain), fullBuildMs=performance.now()-fullStarted;
const fullTriangles=fullRoads.children.reduce((n,m)=>n+m.geometry.index.count/3,0);
let untrimmedTriangles=0;
for(const road of map.roads) {
  if(!road.br&&road.p.filter(p=>terrain.seaSignedDist(p[0],p[1]) < -4).length>road.p.length*.5)continue;
  // Isolated roads have no shared-primary clipping; same rendering rules and
  // water filter provide the full-world triangle baseline without a second implementation.
  const g=buildRoads({roads:[road]},{seaSignedDist:terrain.seaSignedDist.bind(terrain)});
  g.traverse(o=>{if(o.geometry){untrimmedTriangles+=o.geometry.index.count/3;o.geometry.dispose();o.material.dispose();}});
}
const player=Object.create(Player.prototype);player.terrain=terrain;player.ctx={};
const at=(r,p)=>r.p.findIndex(q=>q[0]===p[0]&&q[1]===p[1]);
const shared=new Map();
for(const r of map.roads) if(!r.br && !(r.l||0)) r.p.forEach((p,i)=>{
  const key=p.join(',');if(!shared.has(key))shared.set(key,[]);
  shared.get(key).push({name:r.n,e:r.e[i]});
});
let sharedCount=0;
for(const entries of shared.values()) if(entries.length>1&&entries.some(x=>x.name==='Departure Bay Road')) {
  assert.ok(Math.max(...entries.map(x=>x.e))-Math.min(...entries.map(x=>x.e))<1e-9,'all shared at-grade Departure Bay nodes agree');sharedCount++;
}
const reports=[];
for (const [main,side,p] of [
  [1283,1488,[-2851.77,-1338.54]],
  [1283,1272,[-2975.41,-1224.57]],
  [1715,1691,[-1845.33,-1514.11]],
  [1620,1621,[-873.41,-1218.52]],
]) {
  const a=map.roads[main], b=map.roads[side];
  assert.equal(a.e[at(a,p)],b.e[at(b,p)],'shared junction deck height');
  assert.deepEqual(a.e,before[main].e,'primary race road profile preserved');
  const oldB=before[side], oldJoin=oldB.cum[at(oldB,p)];
  for(let i=0;i<oldB.p.length;i++) if(Math.abs(oldB.cum[i]-oldJoin)>=18) {
    assert.ok(Math.abs(b.e[at(b,oldB.p[i])]-oldB.e[i])<1e-9,'remote side-road profile preserved');
  }
  // Inspect the actual asphalt mesh, not only centreline elevation arrays.
  const started=performance.now();
  const surfaces=[[a],[a,b]].map(roads=>buildRoads({roads},{seaSignedDist:()=>100}));
  const buildMs=performance.now()-started;
  // Float32 mesh coordinates can round an endpoint outside its triangle. Sample
  // 1 cm into the side road, inside both asphalt ribbons at the junction.
  const bi=at(b,p), inward=b.p[bi===0?1:bi-1];
  const dx=inward[0]-p[0], dz=inward[1]-p[1], len=Math.hypot(dx,dz);
  const ray=new THREE.Raycaster(new THREE.Vector3(p[0]+dx/len*.01,250,p[1]+dz/len*.01),new THREE.Vector3(0,-1,0));
  const heights=surfaces.map(g=>{g.updateMatrixWorld(true);return ray.intersectObject(g.children[0]).map(h=>h.point.y).sort((x,y)=>y-x)[0];});
  assert.ok(heights.every(Number.isFinite),'primary and joined decks cover shared node');
  assert.ok(Math.abs(heights[0]-heights[1])<.005,'rendered centreline decks agree');
  let edgeResidual=0;
  for(const off of [-b.w*.4,b.w*.4]) {
    ray.ray.origin.x=p[0]+dx/len*.01-dz/len*off;
    ray.ray.origin.z=p[1]+dz/len*.01+dx/len*off;
    const h=surfaces.map(g=>ray.intersectObject(g.children[0]).map(hit=>hit.point.y).sort((x,y)=>y-x)[0]);
    if(h.every(Number.isFinite))edgeResidual=Math.max(edgeResidual,Math.abs(h[0]-h[1]));
  }
  // Raster both complete asphalt surfaces throughout the junction: side triangles
  // must not introduce a bump anywhere over the primary deck or its shoulders.
  let rasterSamples=0, rasterResidual=0, supportResidual=0;
  for(let x=p[0]-8;x<=p[0]+8;x+=.5)for(let z=p[1]-8;z<=p[1]+8;z+=.5) {
    ray.ray.origin.set(x,250,z);
    const h=surfaces.map(g=>ray.intersectObject(g.children[0]).map(hit=>hit.point.y).sort((a,b)=>b-a)[0]);
    if(Number.isFinite(h[0])) {
      assert.ok(Number.isFinite(h[1]),'joined surface has no primary-deck holes');
      rasterResidual=Math.max(rasterResidual,Math.abs(h[0]-h[1]));rasterSamples++;
      supportResidual=Math.max(supportResidual,Math.abs(terrain.roadDeck(x,z).y-h[0]),Math.abs(player.groundAt(x,z)-h[0]));
    }
  }
  assert.ok(rasterResidual<.0001,'no side-road wedges anywhere across the primary lane');
  assert.ok(supportResidual<.0001,`physical support matches retained primary surface: ${supportResidual}`);
  const triangles=g=>g.children.reduce((n,m)=>n+m.geometry.index.count/3,0);
  const sideAlone=buildRoads({roads:[b]},{seaSignedDist:()=>100});
  const originalTriangles=triangles(surfaces[0])+triangles(sideAlone),joinedTriangles=triangles(surfaces[1]);
  sideAlone.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  reports.push({road:b.n,point:p,beforeGap:Math.abs(before[main].e[at(before[main],p)]-oldB.e[at(oldB,p)]),afterGap:Math.abs(heights[0]-heights[1]),edgeResidual,rasterSamples,rasterResidual,supportResidual,buildMs,originalTriangles,joinedTriangles});
  for(const g of surfaces)g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
}
// A shared coordinate on a bridge or another layer must never be welded.
const synthetic=[
  {n:'Departure Bay Road',p:[[0,0],[10,0]],e:[10,10],cum:[0,10]},
  {n:'Overpass',br:1,l:1,p:[[0,0],[0,10]],e:[20,20],cum:[0,10]},
  {n:'Tunnel',l:-1,p:[[0,0],[0,10]],e:[0,0],cum:[0,10]},
];
terrain.joinRouteJunctions(synthetic);
assert.deepEqual(synthetic.map(r=>r.e),[[10,10],[20,20],[0,0]]);
const gradeSeparated=buildRoads({roads:synthetic.map(r=>({...r,w:4,c:'service'}))},{seaSignedDist:()=>100});
const bridgeRay=new THREE.Raycaster(new THREE.Vector3(.1,30,.1),new THREE.Vector3(0,-1,0));
gradeSeparated.updateMatrixWorld(true);
assert.ok(Math.abs(bridgeRay.intersectObject(gradeSeparated.children[0])[0].point.y-20.07)<1e-5,'overpass rendering remains independent');
console.log(JSON.stringify({result:'PASS',sharedCount,fullBuildMs,fullTriangles,untrimmedTriangles,triangleGrowth:fullTriangles-untrimmedTriangles,junctions:reports,checks:['actual deck raycasts','full-lane raster','Player ground support','primary profiles unchanged','side-road changes bounded to 18 m','bridge and layer separation']}));
