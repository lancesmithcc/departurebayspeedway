import {register} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL('../data/'+p,import.meta.url),'utf8'));
const {ElevationGrid}=await import('../src/elevation-grid.js');
const {Terrain}=await import('../src/terrain.js');
const {TEX}=await import('../src/textures.js');TEX.groundDetail=null;
const {applyStreetProfile}=await import('../src/street-profile.js');
const {surveyedTreeGeometry}=await import('../src/surveyed-tree-geometry.js');
const raw=await readFile(new URL('../data/map.json',import.meta.url));
const map=JSON.parse(raw),survey=await json('route-elevation.json'),metadata=await json('terrain-dtm.json'),city=await json('city-buildings.json'),canopy=await json('canopy.json');
const bytes=await readFile(new URL('../data/terrain-dtm.f32',import.meta.url));
const raster=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const grid=new ElevationGrid(metadata,raster);assert.equal(raster.length,metadata.nx*metadata.nz);
assert.ok(raster.every(v=>Number.isFinite(v)&&v!==metadata.no_data));
assert.equal(grid.sample(grid.x0-1,grid.z0),null);
assert.equal(grid.sample(grid.x1,grid.z1),raster.at(-1));
assert.equal(grid.sample(NaN,0),null);
const errors=map.route.map(([x,z],i)=>Math.abs(grid.sample(x,z)-survey.elevations[i]));assert.ok(Math.max(...errors)<.06,'agreement with previous LiDAR road survey');
assert.equal(createHash('sha256').update(raw).digest('hex'),city.base_map_sha256,'city replacement indices match original map');
assert.ok(city.replaces.every(i=>!map.buildings[i].n),'named landmarks preserved');
assert.ok(city.buildings.every(b=>b.h>=2&&b.h<65&&b.p.length>=4));
assert.equal(new Set(city.buildings.map(b=>b.cityId)).size,city.buildings.length);
assert.ok(canopy.trees.every(p=>p.h>=5&&p.h<=42&&grid.sample(p.x,p.z)!==null));
for(const kind of ['conifer','broadleaf']){
 const parts=surveyedTreeGeometry(kind);let top=0,tris=0;
 for(const g of Object.values(parts)) {assert.ok(g.attributes.position.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));g.computeBoundingBox();assert.ok(g.boundingBox.min.y>=-1e-6);top=Math.max(top,g.boundingBox.max.y);tris+=(g.index?.count||g.attributes.position.count)/3;g.dispose();}
 assert.ok(Math.abs(top-1)<1e-6,'canopy height exact');assert.ok(tris<1600);
}
applyStreetProfile(map);map.elevationGrid=grid;map.routeElevation=survey.elevations;map.routeElevationOffsets=survey.lateral_offsets_m;map.routeElevationCross=survey.cross_sections;
const terrain=new Terrain(map);const mesh=terrain.buildMesh();const fine=terrain.detailGrid;
assert.ok(fine.dx<4&&fine.dz<4);let seam=0;
for(let i=0;i<=fine.sx;i++)for(const z of [fine.z0,fine.z1]){
 const x=fine.x0+i*fine.dx;seam=Math.max(seam,Math.abs(terrain.meshHeight(x,z)-terrain.gridHeight(x,z,terrain.meshGrid,terrain.meshHeights)));
}
for(let j=0;j<=fine.sz;j++)for(const x of [fine.x0,fine.x1]){
 const z=fine.z0+j*fine.dz;seam=Math.max(seam,Math.abs(terrain.meshHeight(x,z)-terrain.gridHeight(x,z,terrain.meshGrid,terrain.meshHeights)));
}
assert.ok(seam<.00002,'coarse/detail seam matches');
let vertices=0,triangles=0;mesh.traverse(o=>{if(o.isMesh){assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));vertices+=o.geometry.attributes.position.count;triangles+=o.geometry.index.count/3;o.geometry.dispose();o.material.dispose();}});
console.log(JSON.stringify({result:'PASS',rasterSamples:raster.length,routeMaxDifferenceM:Math.max(...errors),detailSpacingM:[fine.dx,fine.dz],seamMaxDifferenceM:seam,terrainVertices:vertices,terrainTriangles:triangles,city:city.counts,canopyPeaks:canopy.trees.length}));
