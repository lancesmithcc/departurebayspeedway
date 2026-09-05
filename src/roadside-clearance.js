import {distPointToSeg} from './util.js';
// Check every nearby deck: the closest centreline is not always the widest road.
export function roadClearance(x,z,terrain){
 const segments=terrain.roadGrid?.query(x,z,64);
 if(segments?.length){let gap=Infinity;for(const s of segments)gap=Math.min(gap,distPointToSeg(x,z,s.ax,s.az,s.bx,s.bz).d-s.hw);return gap;}
 const nr=terrain.nearestRoad(x,z);return nr?nr.d-nr.seg.hw:Infinity;
}
export function pushOffRoad(x,z,terrain,clearance=1.1){
 if(roadClearance(x,z,terrain)>=clearance)return [x,z];
 // Search around the intended verge rather than alternating between intersecting
 // road normals, which can leave a pole back on the first carriageway.
 for(let radius=.5;radius<=80;radius+=.5){
  const steps=Math.max(24,Math.ceil(radius*8));
  for(let i=0;i<steps;i++){const angle=i/steps*Math.PI*2,px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
   if(roadClearance(px,pz,terrain)>=clearance)return [px,pz];
  }
 }
 throw new Error('No safe roadside position within 80m');
}
