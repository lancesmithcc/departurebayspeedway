import * as THREE from 'three';
export const PLAYER_COLORS=['#f04452','#268aff','#32d583','#ffd23f','#bd75ff','#ff8a32','#f064c8'];
export const PLAYER_COLOR_NAMES=['Red','Blue','Green','Yellow','Purple','Orange','Pink'];
export const validPlayerSlot=slot=>Number.isInteger(slot)&&slot>=0&&slot<7;
// Recolour the jersey/helmet fabric while retaining the authored texture shading.
// Animation buffers and materials are private to this rider, never shared peers.
export function colorRider(rig,slot){
 if(!rig||!validPlayerSlot(slot))return ()=>{};
 const records=[];
 for(const part of rig.parts){
  const geometry=part.geometry,mask=new Float32Array(geometry.attributes.position.count);
  for(const a of part.entries){
   const jersey=a.y>1.02&&a.y<1.39&&a.x>-.34&&a.x<.15&&a.z>-.14&&a.z<.37;
   const helmet=a.y>1.64;
   if(jersey||helmet)mask[a.i]=1;
  }
  geometry.setAttribute('playerTeamMask',new THREE.BufferAttribute(mask,1));
  const original=part.mesh.material;
  const paint=source=>{
   const m=source.clone();
   m.onBeforeCompile=shader=>{
    shader.uniforms.playerTeamColor={value:new THREE.Color(PLAYER_COLORS[slot])};
    shader.vertexShader='attribute float playerTeamMask;\nvarying float vPlayerTeamMask;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPlayerTeamMask = playerTeamMask;');
    shader.fragmentShader='uniform vec3 playerTeamColor;\nvarying float vPlayerTeamMask;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float fabricLight = dot(diffuseColor.rgb, vec3(.2126,.7152,.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb, playerTeamColor * (.38 + .62 * fabricLight), vPlayerTeamMask * .92);`);
   };
   m.customProgramCacheKey=()=> 'player-team-fabric-v1';m.needsUpdate=true;return m;
  };
  const colored=Array.isArray(original)?original.map(paint):paint(original);part.mesh.material=colored;
  records.push({mesh:part.mesh,geometry,original,colored});
 }
 return ()=>{for(const r of records){r.mesh.material=r.original;r.geometry.deleteAttribute('playerTeamMask');for(const m of Array.isArray(r.colored)?r.colored:[r.colored])m.dispose();}};
}
