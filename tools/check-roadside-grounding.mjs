import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`), import.meta.url);
const { Traffic, TRAFFIC_CONTACTS, solveTrafficGrounding } = await import('../src/traffic.js');
const json = async p => JSON.parse(await readFile(new URL('../data/' + p, import.meta.url), 'utf8'));
const { TEX } = await import('../src/textures.js');
for (const key of ['asphalt','concrete','groundDetail','grass','sand','rock']) TEX[key] = null;
const { Terrain } = await import('../src/terrain.js');
const { ElevationGrid } = await import('../src/elevation-grid.js');
const { applyStreetProfile } = await import('../src/street-profile.js');
const { buildRoads } = await import('../src/roads.js');
const { buildRoadEdges } = await import('../src/props.js');
const { Corridor } = await import('../src/corridor.js');
const map = await json('map.json'), survey = await json('route-elevation.json'), metadata = await json('terrain-dtm.json');
const bytes = await readFile(new URL('../data/terrain-dtm.f32', import.meta.url));
map.elevationGrid = new ElevationGrid(metadata, new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
map.routeElevation = survey.elevations; map.routeElevationOffsets = survey.lateral_offsets_m; map.routeElevationCross = survey.cross_sections;
applyStreetProfile(map);
const terrain = new Terrain(map); const groundMesh=terrain.buildMesh(), roads=buildRoads(map, terrain), corridor=new Corridor(map.route, terrain), edges=buildRoadEdges(corridor, terrain);

const THREE=await import('three');
// Spatially crop actual rendered triangles for efficient local ray tests.
const local=[];for(const group of [groundMesh,roads,edges])group.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,idx=o.geometry.index,pos=[];for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)],xs=ids.map(j=>a.getX(j)),zs=ids.map(j=>a.getZ(j));if(Math.max(...xs)<-3020||Math.min(...xs)>-2700||Math.max(...zs)<-1545||Math.min(...zs)>-1180)continue;for(const j of ids)pos.push(a.getX(j),a.getY(j),a.getZ(j));}if(pos.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));local.push(new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));}});
const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));function visible(x,z){ray.ray.origin.set(x,250,z);return ray.intersectObjects(local)[0]?.point.y;}
let worst=[];for(let s=200;s<=500;s+=8){const i=corridor.cum.findIndex(v=>v>=s),p=corridor.pts[i],[nx,nz]=corridor.normalAt(i);for(let off=-10;off<=10;off+=1){const x=p[0]+nx*off,z=p[1]+nz*off,h=visible(x,z),support=terrain.renderedGroundHeight(x,z);worst.push({s,off,x,z,h,support,delta:support-h});}}worst.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));assert.ok(worst.every(p=>Number.isFinite(p.h)&&Math.abs(p.delta)<.001),'roadside support matches actual terrain, road and sidewalk triangles');
const traffic=Object.create(Traffic.prototype);traffic.terrain=terrain;traffic.buildLanePaths(map);let cars=[];for(const path of traffic.paths){if(!['Departure Bay Road','Mexicana Road','Wassell Way'].includes(path.name))continue;for(let s=2;s<path.total-2;s+=2){const sm=traffic.sample(path,s);if(sm.x< -3020||sm.x> -2700||sm.z< -1545||sm.z> -1180)continue;for(const [type,contact] of Object.entries(TRAFFIC_CONTACTS)){const car={active:true,type,contacts:contact,x:sm.x,z:sm.z,heading:Math.atan2(-sm.dx,-sm.dz)};const active=traffic.groundCar(car),max=Math.max(...car.wheelContacts.map(w=>w.clearance));cars.push({name:path.name,type,s,x:sm.x,z:sm.z,max,active,wheels:car.wheelContacts});}}}cars.sort((a,b)=>b.max-a.max);let wheelRayResidual=0;for(const car of cars.slice(0,20))for(const w of car.wheels)wheelRayResidual=Math.max(wheelRayResidual,Math.abs(w.surface-visible(w.x,w.z)));assert.ok(wheelRayResidual<.001,'worst lane wheel contacts match actual visible triangles');assert.ok(cars.filter(c=>c.active).every(c=>c.max<=.32),'unsupported cars retired');console.log(JSON.stringify({result:'PASS',roadsideSamples:worst.length,maxRoadsideRayResidual:Math.abs(worst[0].delta),lanePoses:cars.length,retired:cars.filter(c=>!c.active).length,maxActiveWheelClearance:Math.max(...cars.filter(c=>c.active).map(c=>c.max)),wheelRayResidual,worst:cars.slice(0,5).map(({wheels,...rest})=>rest)}));
