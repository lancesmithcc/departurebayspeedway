import * as THREE from 'three';

// Detail meshes follow the existing head tracker; the original skeleton continues
// to own the body, locomotion and combat. All state-sensitive materials reset.
export function addChurchCharacterDetail({headDetails,rig,robe,sash,halo,horns,characterMaterials}) {
  const material=(holy,damned,extra={})=>{
    const m=new THREE.MeshStandardMaterial({color:holy,roughness:.72,...extra});
    m.userData.holyColor=new THREE.Color(holy);m.userData.damnedColor=new THREE.Color(damned);characterMaterials.push(m);return m;
  };
  const skin=material(0xbd8c68,0x9b251a),hair=material(0x39261d,0x160c0e,{roughness:.93});
  const lip=material(0x845040,0x401015),white=material(0xd6ccb0,0xffb743);
  const iris=material(0x543921,0xff791c),black=new THREE.MeshStandardMaterial({color:0x100b0a,roughness:.6});
  const face=new THREE.Group();face.name='Detailed animated face';headDetails.add(face);
  const ellipsoid=(parent,mat,position,scale)=>{
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,18),mat);m.position.set(...position);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  ellipsoid(face,skin,[0,-.002,.038],[.126,.147,.111]);
  ellipsoid(face,skin,[0,-.032,.141],[.024,.036,.027]);
  for(const side of [-1,1]){
    ellipsoid(face,skin,[side*.123,-.013,.015],[.025,.044,.025]);
    ellipsoid(face,lip,[side*.128,-.013,.029],[.010,.025,.007]);
    ellipsoid(face,skin,[side*.021,-.047,.143],[.015,.012,.015]);
  }
  const tube=(parent,points,radius,mat,segments=16)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,6,false),mat);mesh.castShadow=true;parent.add(mesh);return mesh;
  };
  const eyes=[],brows=[],pupils=[];
  for(const side of [-1,1]){
    const eye=new THREE.Group();eye.position.set(side*.047,.027,.139);face.add(eye);eyes.push(eye);
    ellipsoid(eye,white,[0,0,0],[.028,.013,.010]);
    ellipsoid(eye,iris,[0,0,.009],[.010,.010,.004]);
    pupils.push(ellipsoid(eye,black,[0,0,.013],[.0047,.007,.002]));
    const brow=tube(face,[[side*.023,.056,.143],[side*.047,.061,.146],[side*.075,.050,.125]],.008,hair,12);brows.push(brow);
    tube(face,[[side*.024,.015,.145],[side*.048,.009,.145],[side*.070,.015,.133]],.003,skin,12);
  }
  tube(face,[[-.028,-.069,.143],[0,-.075,.149],[.028,-.069,.143]],.005,lip);
  // Multiple fine locks make a continuous beard silhouette with visible direction.
  for(let i=0;i<25;i++){
    const u=(i-12)/12,x=u*.084;
    tube(face,[[x,-.073+Math.abs(u)*.029,.117],[x*.88,-.115,.137],[x*.61,-.19+Math.abs(u)*.055,.11]],.0075,hair,14);
  }
  for(const side of [-1,1])for(let i=0;i<4;i++)tube(face,[[side*.007,-.054+i*.002,.158],[side*.029,-.057-i*.003,.155],[side*.052,-.07-i*.003,.143]],.004,hair,10);
  // Back/crown cap with overlapping strands; the face is never covered by a sphere.
  ellipsoid(face,hair,[0,.052,-.045],[.137,.13,.095]);
  const locks=[];
  for(const side of [-1,1])for(let i=0;i<7;i++){
    tube(face,[[side*.008,.144-i*.004,.055],[side*.065,.132-i*.004,.097],[side*.12,.069-i*.004,.056]],.0065,hair,16);
  }
  for(let i=0;i<30;i++){
    const angle=i/30*Math.PI*2,x=Math.cos(angle)*.114,z=Math.sin(angle)*.086-.035;
    if(z>.005 && Math.abs(x)<.092)continue;
    const lock=tube(face,[[x*.3,.16,z*.3],[x,.09,z],[x*1.11,-.04,z-.01],[x*1.04,-.19-(i%3)*.009,z-.02]],.009,hair,18);
    locks.push(lock);
  }
  // Fine linen weave, kept subtle enough to avoid moire at gameplay distances.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#c9c5bb';ctx.fillRect(0,0,256,256);
  for(let i=0;i<256;i+=4){ctx.fillStyle=i%8?'#c3bfb6':'#d3cfc5';ctx.fillRect(i,0,1,256);ctx.fillStyle='#d7d2c7';ctx.fillRect(0,i,256,1);}
  const weave=new THREE.CanvasTexture(canvas);weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(4,5);weave.anisotropy=4;
  robe.material.bumpMap=weave;robe.material.bumpScale=.007;robe.material.roughness=.96;robe.material.needsUpdate=true;
  sash.bumpMap=weave;sash.bumpScale=.004;sash.needsUpdate=true;
  const trim=material(0xb99a54,0x673020,{metalness:.28,roughness:.65});
  // Braided waist cord, tie and tassels.
  for(let i=0;i<2;i++){
    const cord=new THREE.Mesh(new THREE.TorusGeometry(.195+i*.006,.009,7,64),trim);cord.rotation.x=Math.PI/2;cord.position.y=.91+i*.013;rig.add(cord);
  }
  for(const side of [-1,1]){
    tube(rig,[[.07,.90,.19],[.07+side*.023,.80,.22],[.07+side*.038,.65,.22]],.009,trim);
    for(let i=0;i<5;i++)tube(rig,[[.07+side*.038+(i-2)*.004,.66,.22],[.07+side*.04+(i-2)*.006,.60,.22]],.0027,trim,4);
  }
  const hem=new THREE.Mesh(new THREE.TorusGeometry(.302,.009,6,80),trim);hem.rotation.x=Math.PI/2;hem.position.y=.166;rig.add(hem);
  const inset=new THREE.Mesh(new THREE.TorusGeometry(.26,.008,8,72),halo.material);inset.position.z=.013;halo.add(inset);
  for(let i=0;i<24;i++){
    const a=i*Math.PI/12,ray=new THREE.Mesh(new THREE.CylinderGeometry(.002,.004,i%3===0?.052:.026,5),halo.material);
    ray.position.set(Math.cos(a)*.282,Math.sin(a)*.282,0);ray.rotation.z=a-Math.PI/2;halo.add(ray);
  }
  // Curved, tapered horns with integrated growth ridges instead of straight cones.
  for(let sideIndex=0;sideIndex<horns.length;sideIndex++){
    const horn=horns[sideIndex],side=sideIndex?1:-1;
    horn.rotation.z=-side*.12;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.06,0),new THREE.Vector3(side*.07,.05,-.025),new THREE.Vector3(side*.10,.20,-.06),new THREE.Vector3(side*.045,.34,-.025)]);
    const frames=curve.computeFrenetFrames(36,false),positions=[],colors=[],uv=[],indices=[];
    for(let i=0;i<=36;i++){
      const t=i/36,p=curve.getPointAt(t),radius=(.046*Math.pow(1-t,.8)+.0005)*(1+Math.sin(t*25*Math.PI)*.065);
      const colour=new THREE.Color(0x493329).lerp(new THREE.Color(0xd9c6a0),Math.pow(t,.5));
      for(let j=0;j<=12;j++){
        const a=j/12*Math.PI*2,v=p.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius).addScaledVector(frames.binormals[i],Math.sin(a)*radius);
        positions.push(v.x,v.y,v.z);colors.push(colour.r,colour.g,colour.b);uv.push(j/12,t);
        if(i<36&&j<12){const k=i*13+j;indices.push(k,k+13,k+1,k+1,k+13,k+14);}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();horn.geometry.dispose();horn.geometry=geo;horn.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55});
  }
  const rest=Float32Array.from(robe.geometry.attributes.position.array);
  return {face,eyes,locks,update(t,hell,speed=0){
    const phase=t%4.7,blink=phase<.15?Math.sin(phase/.15*Math.PI):0;
    eyes.forEach(eye=>eye.scale.y=Math.max(.08,1-blink*.94));
    pupils.forEach(p=>p.scale.x=hell?.0024:.0047);
    iris.emissive.set(hell?0xff7a18:0x000000);iris.emissiveIntensity=hell?1.8+Math.sin(t*5)*.25:0;
    brows.forEach((b,i)=>b.rotation.z=hell?(i?-.13:.13):0);
    locks.forEach((l,i)=>l.rotation.z=Math.sin(t*1.6+i*.55)*Math.min(.028,.008+speed*.006));
    const pos=robe.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2],weight=THREE.MathUtils.smoothstep(.38-y,0,.8);
      pos.setXYZ(i,x+Math.sin(t*2.2+y*8)*weight*.009,y,z+Math.sin(t*2.7+x*14)*weight*(.004+Math.min(speed,.8)*.012));
    }
    pos.needsUpdate=true;robe.geometry.computeVertexNormals();
  }};
}
