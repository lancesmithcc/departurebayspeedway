import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`), import.meta.url);
const { Traffic, TRAFFIC_CONTACTS, solveTrafficGrounding } = await import('../src/traffic.js');
let checks = 0;
for (const [name, contact] of Object.entries(TRAFFIC_CONTACTS)) {
  for (const heading of [0, Math.PI / 2, Math.PI, -.7]) {
    const surface = { renderedGroundHeight: (x,z) => 15 + .24*x - .19*z };
    const pose = solveTrafficGrounding(surface, 30, -20, heading, contact);
    assert.ok(pose.quaternion.toArray().every(Number.isFinite));
    for (const p of pose.contacts) assert.ok(Math.abs(p.clearance) < 1e-9, `${name}: all wheels contact compound grade`);
    checks++;
  }
}
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
const terrain = new Terrain(map); terrain.buildMesh(); buildRoads(map, terrain); buildRoadEdges(new Corridor(map.route, terrain), terrain);
let maxGap = 0;
for (let i = 12; i < map.route.length - 12; i += 7) {
  const [x,z] = map.route[i], [nx,nz] = map.route[i+1], heading = Math.atan2(x-nx,z-nz);
  for (const contact of Object.values(TRAFFIC_CONTACTS)) {
    const pose = solveTrafficGrounding(terrain, x,z,heading,contact);
    for (const p of pose.contacts) {
      assert.ok(Number.isFinite(p.y)); assert.ok(p.clearance > -1e-8, 'no buried wheel contacts');
      assert.ok(Math.abs(p.surface - terrain.renderedGroundHeight(p.x,p.z)) < 1e-9);
      maxGap = Math.max(maxGap, p.clearance);
    }
    checks++;
  }
}
assert.ok(maxGap < .2, 'representative route chassis clearance within suspension travel');
// A parked police vehicle must still follow the visible ground, without moving.
const traffic = Object.create(Traffic.prototype);
traffic.terrain = terrain;
const [x,z] = map.route[90];
const car = { type:'rcmp', contacts:TRAFFIC_CONTACTS.rcmp, active:true, policeStopped:true, x,z, heading:1, y:999, v:14 };
traffic.cars=[car]; traffic.writeMatrices=()=>{}; traffic.checkPlayer=()=>{};
traffic.update(1/60,{pos:{x,y:0,z}},true);
assert.equal(car.v,0); assert.equal(car.x,x); assert.equal(car.z,z); assert.ok(car.y<999);
assert.ok(car.wheelContacts.every(p=>p.clearance>=-1e-8));
console.log(JSON.stringify({result:'PASS',checks, maxRouteWheelGapM:maxGap, stoppedPoliceGrounded:true}));

traffic.terrain={renderedGroundHeight:(x,z)=>x>0&&z>0?3:0};
const unsupported={type:'sedan',contacts:TRAFFIC_CONTACTS.sedan,active:true,x:0,z:0,heading:0};
assert.equal(traffic.groundCar(unsupported),false,'reject peripheral lane over a retaining-wall discontinuity');
assert.equal(unsupported.active,false,'unsupported car must not render hovering');
