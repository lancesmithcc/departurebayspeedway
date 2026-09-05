import * as THREE from 'three';

// Owns only effect materials/geometries. Authored meshes are shared read-only.
export class BlessingEffects {
  constructor(scene,{maxAscensions=12,riderHalo=true}={}) {
    this.scene=scene;this.maxAscensions=maxAscensions;this.ascensions=[];this.glowing=[];this.time=0;
    this.halo=new THREE.Group();this.halo.name='Blessed rider halo';this.halo.visible=false;
    this.haloMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffdf79).multiplyScalar(2.5),transparent:true,opacity:.95,toneMapped:false});
    this.haloRing=new THREE.Mesh(new THREE.TorusGeometry(.32,.027,8,48),this.haloMaterial);this.haloRing.rotation.x=Math.PI/2;
    this.halo.add(this.haloRing);this.light=new THREE.PointLight(0xffe4a0,2.4,5,2);this.light.position.y=-.5;this.halo.add(this.light);if(riderHalo)scene.add(this.halo);
    this.bounds=new THREE.Box3();this.center=new THREE.Vector3();
  }
  restoreGlow(){for(const {mesh,original,owned} of this.glowing){mesh.material=original;for(const m of owned)m.dispose();}this.glowing=[];this.glowRoot=null;}
  glow(root){
    if(this.glowRoot===root)return;this.restoreGlow();this.glowRoot=root;
    root.traverse(o=>{if(!o.isMesh)return;const original=o.material,source=Array.isArray(original)?original:[original];const owned=source.map(m=>{const c=m.clone();if(c.emissive){c.emissive.set(0xffd26a);c.emissiveIntensity=.26;}return c;});o.material=Array.isArray(original)?owned:owned[0];this.glowing.push({mesh:o,original,owned});});
  }
  updateRider(player,blessed,dt){
    this.time+=dt;const root=player?.root;
    this.halo.visible=!!(blessed&&root&&root.visible);
    if(!this.halo.visible){this.restoreGlow();return;}
    this.glow(root);root.updateMatrixWorld(true);this.bounds.setFromObject(root);this.bounds.getCenter(this.center);
    this.halo.position.set(this.center.x,this.bounds.max.y+.19+Math.sin(this.time*3)*.035,this.center.z);
    this.haloRing.rotation.z=this.time*.4;this.haloMaterial.opacity=.84+Math.sin(this.time*4)*.1;
  }
  ascend(source){
    while(this.ascensions.length>=this.maxAscensions)this.release(this.ascensions.shift());
    source.updateMatrixWorld(true);
    const root=new THREE.Group();root.name='Ascension of light';
    const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffedbe).multiplyScalar(2.6),transparent:true,opacity:1,depthWrite:false,toneMapped:false});
    const ownedGeometries=[];
    source.traverseVisible(o=>{
      if(!o.isMesh||o.isInstancedMesh)return;
      let geometry=o.geometry;
      if(o.isSkinnedMesh){
        geometry=o.geometry.clone();const p=geometry.attributes.position,v=new THREE.Vector3();o.skeleton?.update();
        for(let i=0;i<p.count;i++){v.fromBufferAttribute(o.geometry.attributes.position,i);o.applyBoneTransform(i,v);p.setXYZ(i,v.x,v.y,v.z);}p.needsUpdate=true;geometry.computeVertexNormals();ownedGeometries.push(geometry);
      }
      const mesh=new THREE.Mesh(geometry,mat);mesh.matrixAutoUpdate=false;mesh.matrix.copy(o.matrixWorld);mesh.frustumCulled=false;root.add(mesh);
    });
    const box=new THREE.Box3().setFromObject(source),c=box.getCenter(new THREE.Vector3());
    const points=new Float32Array(36*3),seeds=[];
    for(let i=0;i<36;i++){const a=i*2.39996,r=.22+(i%7)*.085;seeds.push([Math.cos(a)*r,Math.sin(a)*r,(i%11)/11]);points.set([c.x+seeds[i][0],box.min.y+seeds[i][2]*Math.max(1,box.max.y-box.min.y),c.z+seeds[i][1]],i*3);}
    const sparkGeometry=new THREE.BufferGeometry();sparkGeometry.setAttribute('position',new THREE.BufferAttribute(points,3));
    const sparkMaterial=new THREE.PointsMaterial({color:new THREE.Color(0xffe6a0).multiplyScalar(2.2),size:.065,transparent:true,opacity:1,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const sparks=new THREE.Points(sparkGeometry,sparkMaterial);sparks.frustumCulled=false;root.add(sparks);this.scene.add(root);
    const effect={root,mat,sparks,sparkMaterial,sparkGeometry,ownedGeometries,seeds,t:0,duration:3.4};this.ascensions.push(effect);return effect;
  }
  updateAscensions(dt){for(let i=this.ascensions.length-1;i>=0;i--){const e=this.ascensions[i];e.t+=dt;const f=Math.min(1,e.t/e.duration);e.root.position.y=1.8*e.t+1.4*e.t*e.t;e.mat.opacity=1-f*f;e.sparkMaterial.opacity=1-f;const p=e.sparkGeometry.attributes.position;for(let j=0;j<p.count;j++)p.setY(j,p.getY(j)+dt*(.35+e.seeds[j][2]));p.needsUpdate=true;if(f>=1){this.release(e);this.ascensions.splice(i,1);}}}
  release(e){this.scene.remove(e.root);e.mat.dispose();e.sparkMaterial.dispose();e.sparkGeometry.dispose();for(const g of e.ownedGeometries)g.dispose();}
  reset(){this.restoreGlow();this.halo.visible=false;for(const e of this.ascensions)this.release(e);this.ascensions=[];this.time=0;}
  dispose(){this.reset();this.scene.remove(this.halo);this.haloRing.geometry.dispose();this.haloMaterial.dispose();}
}
