import {register} from 'node:module';import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:'${base}lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:'${base}lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);

const THREE=await import('three');const {PLAYER_COLORS,colorRider}=await import('../src/player-colors.js');
assert.equal(new Set(PLAYER_COLORS).size,7);
const original=new THREE.MeshStandardMaterial(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1.2,.1,0,1.5,0,0,1.7,0],3));
const mesh=new THREE.Mesh(geometry,original),rig={parts:[{mesh,geometry,entries:[{i:0,x:0,y:1.2,z:.1},{i:1,x:0,y:1.5,z:0},{i:2,x:0,y:1.7,z:0}]}]};
for(let slot=0;slot<7;slot++){
 const clear=colorRider(rig,slot);assert.notEqual(mesh.material,original);assert.deepEqual([...geometry.attributes.playerTeamMask.array],[1,0,1]);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};mesh.material.onBeforeCompile(shader);
 assert.equal('#'+shader.uniforms.playerTeamColor.value.getHexString(),PLAYER_COLORS[slot]);clear();assert.equal(mesh.material,original);assert.equal(geometry.attributes.playerTeamMask,undefined);
}
console.log('PASS seven distinct colors, isolated materials, jersey/helmet mask, face exclusion, restore');
