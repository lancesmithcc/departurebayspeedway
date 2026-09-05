// Animate the supplied fused rider/bike mesh without replacing its geometry or
// textures. Smooth, bounded weights keep the frame, wheels and hand grips fixed.
import * as THREE from 'three';
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

export class AuthoredRiderAnimation {
  constructor(model, bike) {
    this.parts=[];
    model.updateWorldMatrix(true,true);
    const inverse=bike.matrixWorld.clone().invert();
    const v=new THREE.Vector3(), n=new THREE.Vector3();
    model.traverse(mesh=>{
      if(!mesh.isMesh || mesh.isSkinnedMesh)return;
      const original=mesh.geometry, geometry=original.clone();
      mesh.geometry=geometry;
      const toBike=inverse.clone().multiply(mesh.matrixWorld);
      const toLocal=toBike.clone().invert();
      const normalToBike=new THREE.Matrix3().getNormalMatrix(toBike);
      const normalToLocal=normalToBike.clone().invert();
      const position=geometry.attributes.position, normal=geometry.attributes.normal;
      const entries=[];
      for(let i=0;i<position.count;i++) {
        v.fromBufferAttribute(position,i).applyMatrix4(toBike);
        // Handlebars reach into the same height band as the forearms. Fade to
        // zero towards the grips instead of rotating the bike's controls.
        const grip=1-smooth(.20,.48,-v.z);
        const body=smooth(.86,1.27,v.y)*grip;
        if(body<.00001)continue;
        if(normal)n.fromBufferAttribute(normal,i).applyMatrix3(normalToBike).normalize();
        entries.push({i,x:v.x,y:v.y,z:v.z,nx:n.x,ny:n.y,nz:n.z,
          body,head:smooth(1.34,1.49,v.y)});
      }
      position.setUsage(THREE.DynamicDrawUsage);
      if(normal)normal.setUsage(THREE.DynamicDrawUsage);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      // Accommodate the largest deformation for frustum/shadow culling.
      geometry.boundingSphere.radius += .18 / Math.max(.001, new THREE.Vector3().setFromMatrixScale(toBike).length()/Math.sqrt(3));
      this.parts.push({mesh,original,geometry,position,normal,entries,toLocal,normalToLocal});
    });
    this.v=new THREE.Vector3();this.n=new THREE.Vector3();
    this.bodyQ=new THREE.Quaternion();this.headQ=new THREE.Quaternion();
    this.euler=new THREE.Euler();
    this.reset();
  }
  reset(){this.time=0;this.pitch=0;this.roll=0;this.look=0;this.compression=0;this.springV=0;}
  update(dt,p) {
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);this.time+=dt;
    const speed=clamp(Math.abs(p.v||0)/26,0,1);
    const throttle=clamp(p._lastThrottle||0,0,1),brake=clamp(p._lastBrake||0,0,1);
    const blend=1-Math.exp(-dt*8);
    const targetPitch= -.09*throttle*speed+.11*brake*speed-.05*clamp(p.wheelie||0,0,1);
    this.pitch+=(targetPitch-this.pitch)*blend;
    this.roll+=(-clamp(p.lean||0,-.7,.7)*.32-this.roll)*blend;
    this.look+=(clamp(p.steerVis||0,-1,1)*.18-this.look)*blend;
    if(p._landingImpact>0){this.springV-=Math.min(.9,p._landingImpact*.045);p._landingImpact=0;}
    // Substeps prevent a long render frame from destabilising the spring.
    for(let left=dt;left>0;){const h=Math.min(left,1/120);this.springV+=(-95*this.compression-14*this.springV)*h;this.compression+=this.springV*h;left-=h;}
    this.compression=clamp(this.compression,-.07,.02);
    const breath=Math.sin(this.time*2.5)*.003;
    const road=p.grounded ? Math.sin(this.time*(15+speed*12))*.0025*speed : .014;
    this.bodyQ.setFromEuler(this.euler.set(this.pitch,0,this.roll));
    this.headQ.setFromEuler(this.euler.set(-this.pitch*.45,this.look,-this.roll*.5));
    const v=this.v,n=this.n;
    for(const part of this.parts) {
      for(const a of part.entries) {
        v.set(a.x+.10,a.y-.91,a.z-.18).applyQuaternion(this.bodyQ);
        let x=v.x-.10,y=v.y+.91+this.compression+breath+road,z=v.z+.18;
        if(a.head>0){v.set(x+.10,y-1.40,z+.02).applyQuaternion(this.headQ);x+=(v.x-.10-x)*a.head;y+=(v.y+1.40-y)*a.head;z+=(v.z-.02-z)*a.head;}
        v.set(a.x+(x-a.x)*a.body,a.y+(y-a.y)*a.body,a.z+(z-a.z)*a.body).applyMatrix4(part.toLocal);
        part.position.setXYZ(a.i,v.x,v.y,v.z);
        if(part.normal){
          n.set(a.nx,a.ny,a.nz).applyQuaternion(this.bodyQ);
          if(a.head>0){v.copy(n).applyQuaternion(this.headQ);n.lerp(v,a.head);}
          n.set(a.nx+(n.x-a.nx)*a.body,a.ny+(n.y-a.ny)*a.body,a.nz+(n.z-a.nz)*a.body).applyMatrix3(part.normalToLocal).normalize();
          part.normal.setXYZ(a.i,n.x,n.y,n.z);
        }
      }
      part.position.needsUpdate=true;if(part.normal)part.normal.needsUpdate=true;
    }
  }
  dispose(){for(const p of this.parts){p.mesh.geometry=p.original;p.geometry.dispose();}this.parts=[];}
}
