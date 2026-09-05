import * as THREE from 'three';
const clouds = new WeakMap();
const point = new THREE.Vector3();
// Cache extremal surface vertices, not bounding-box corners outside the body.
function supportCloud(geometry) {
  if (clouds.has(geometry)) return clouds.get(geometry);
  const pos=geometry.attributes.position, ids=new Set();
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    if(!x&&!y&&!z)continue;
    let best=-Infinity,index=0;
    for(let i=0;i<pos.count;i++){
      const d=x*pos.getX(i)+y*pos.getY(i)+z*pos.getZ(i);
      if(d>best){best=d;index=i;}
    }
    ids.add(index);
  }
  const cloud=[...ids].map(i=>new THREE.Vector3().fromBufferAttribute(pos,i));
  clouds.set(geometry,cloud);return cloud;
}
export function settleBody(geometry,position,rotation,scale,heightAt){
  let lift=0;
  for(const vertex of supportCloud(geometry)){
    point.copy(vertex).multiply(scale).applyQuaternion(rotation).add(position);
    lift=Math.max(lift,heightAt(point.x,point.z)+.008-point.y);
  }
  position.y+=lift;
}
