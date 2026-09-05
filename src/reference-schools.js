// Real school footprints; facade rhythm inferred only where the road stills are obscured.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const REFERENCE_SCHOOLS = Object.freeze({
  wellington: {cityId:7100, name:'Wellington Secondary', pos:[-2922,-1414], wall:0xd7d4c8, base:0x777e74, trim:0xedece4, frames:['t00m30.0s_00301.jpg','t00m35.0s_00351.jpg']},
  rockCity: {cityId:6905, name:'Rock City Elementary', pos:[-2360,-1410], wall:0xb4b9b1, base:0x626b68, trim:0xe0e3dc, frames:['t01m25.0s_00851.jpg','t01m30.0s_00901.jpg','t01m35.0s_00951.jpg']},
  departureBay: {cityId:7064, name:'Departure Bay Elementary', pos:[-966.58,-1270.75], wall:0xd1d1c5, base:0x827b68, trim:0xe2e4de, frames:['t03m50.0s_02301.jpg','t04m00.0s_02401.jpg','t04m10.0s_02501.jpg']},
});

// NRCan HRDEM DSM roof medians from 2 m samples inside City footprint subregions.
// Subregion cuts follow mapped wing necks; local heights use the same DTM slab datum.
export const SCHOOL_ROOF_PARTS = {"6905":[{"p":[[-2351.41,-1448.9],[-2351.99,-1463.69],[-2357.57,-1468.83],[-2361.87,-1464.12],[-2376.17,-1463.56],[-2380.84,-1458.09],[-2374.98,-1452.24],[-2379.84,-1446.55],[-2375.15,-1441.58],[-2368.94,-1441.82],[-2369.0,-1443.36],[-2352.08,-1444.03],[-2352.11,-1444.76],[-2347.74,-1444.94],[-2347.21,-1431.56],[-2347.62,-1431.54],[-2347.5582352941174,-1430.0],[-2328.296053596615,-1430.0],[-2329.08,-1449.78],[-2351.41,-1448.9]],"roofElevation":95.34,"h":5.17,"samples":198},{"p":[[-2353.59,-1368.01],[-2352.92,-1340.84],[-2335.83,-1341.52],[-2336.38,-1355.33],[-2331.28,-1355.12],[-2332.15,-1374.19],[-2330.39,-1374.41],[-2330.4133255813954,-1375.0],[-2353.5430422264876,-1375.0],[-2353.59,-1368.01]],"roofElevation":96.67,"h":6.5,"samples":146},{"p":[[-2352.78,-1422.65],[-2347.6,-1418.43],[-2347.53,-1416.47],[-2351.93,-1410.09],[-2350.92,-1408.43],[-2350.5,-1397.78],[-2351.54,-1397.73],[-2350.61,-1378.12],[-2353.52,-1378.43],[-2353.5430422264876,-1375.0],[-2330.4133255813954,-1375.0],[-2330.39,-1374.41],[-2330.56,-1378.71],[-2326.27,-1378.88],[-2329.08,-1449.78],[-2328.296053596615,-1430.0],[-2347.5582352941174,-1430.0],[-2347.62,-1431.54],[-2347.47,-1427.8],[-2352.78,-1422.65]],"roofElevation":97.94,"h":7.77,"samples":284}],"7064":[{"p":[[-951.48,-1282.94],[-925.53,-1288.25],[-926.43,-1292.31],[-922.39,-1293.13],[-923.56,-1299.09],[-921.48,-1299.49],[-922.27,-1303.18],[-924.44,-1302.72],[-925.75,-1309.63],[-929.86,-1308.84],[-930.45,-1311.77],[-956.46,-1306.29],[-954.28,-1296.01],[-960.3,-1294.87],[-959.77,-1292.17],[-959.75,-1292.11],[-967.68,-1290.46],[-964.09,-1272.71],[-952.8,-1275.2],[-949.1301360863445,-1274.8559502580947],[-950.92,-1282.97],[-951.48,-1282.94]],"roofElevation":38.25,"h":9.09,"samples":210},{"p":[[-928.17,-1264.17],[-927.6,-1264.4],[-926.6,-1264.53],[-929.13,-1276.4],[-939.8,-1274.01],[-939.96,-1273.64],[-946.44,-1272.14],[-946.16,-1271.21],[-948.07,-1270.87],[-948.96,-1274.84],[-949.12,-1274.81],[-950.92,-1282.97],[-949.1301360863445,-1274.8559502580947],[-952.8,-1275.2],[-952.62,-1274.09],[-952.56,-1273.72],[-952.34,-1272.94],[-952.84,-1272.56],[-961.87,-1270.41],[-961.19,-1267.22],[-972.96,-1264.64],[-973.29,-1266.13],[-977.3,-1265.36],[-977.77,-1265.52],[-1002.3,-1260.44],[-1002.55,-1261.25],[-1001.81,-1261.44],[-1002.73,-1265.47],[-1006.14,-1264.75],[-1006.55,-1267.3],[-1017.47,-1264.73],[-1018.06,-1267.36],[-1035.72,-1263.57],[-1034.92,-1259.43],[-1035.22,-1259.05],[-1040.01,-1258.02],[-1036.48,-1241.53],[-1024.89,-1244.06],[-1024.79,-1244.0],[-1024.05,-1240.6],[-1008.81,-1243.78],[-1009.39,-1246.45],[-1009.46,-1246.81],[-999.75,-1248.83],[-999.52,-1248.2],[-998.28,-1241.8],[-947.86,-1252.43],[-947.46,-1250.71],[-939.32,-1252.55],[-939.58,-1254.1],[-926.64,-1256.77],[-928.17,-1264.17]],"roofElevation":33.2,"h":4.04,"samples":481}],"7100":[{"p":[[-2976.0,-1458.12],[-3009.16,-1475.32],[-3013.17,-1467.55],[-3015.61,-1468.83],[-3018.59,-1459.22],[-3017.73,-1458.73],[-3023.14,-1448.27],[-2990.18,-1431.16],[-2991.29,-1429.03],[-2956.6,-1411.19],[-2956.05,-1412.12],[-2955.39,-1411.75],[-2941.78,-1440.17],[-2976.0,-1458.12]],"roofElevation":130.95,"h":8.88,"samples":557},{"p":[[-2955.23,-1407.55],[-2955.25,-1407.62],[-2956.11,-1408.54],[-2982.73,-1382.17],[-2959.35,-1358.79],[-2932.96,-1385.1],[-2933.66,-1385.87],[-2955.39,-1411.75],[-2955.23,-1407.55]],"roofElevation":126.58,"h":4.51,"samples":282},{"p":[[-2903.39,-1444.1],[-2897.94,-1476.19],[-2934.23,-1482.26],[-2939.59,-1450.0],[-2937.21,-1449.75],[-2937.43,-1448.96],[-2938.4,-1441.48],[-2940.66,-1440.21],[-2906.02,-1444.56],[-2903.39,-1444.1]],"roofElevation":129.3,"h":7.23,"samples":301},{"p":[[-2905.88,-1435.04],[-2905.06,-1435.91],[-2906.16,-1437.17],[-2907.06,-1437.21],[-2906.02,-1444.56],[-2940.66,-1440.21],[-2941.78,-1440.17],[-2955.39,-1411.75],[-2933.66,-1385.87],[-2930.34,-1385.5],[-2900.73,-1400.02],[-2899.24,-1402.76],[-2884.0,-1405.19],[-2888.68,-1435.42],[-2904.0,-1433.18],[-2905.88,-1435.04]],"roofElevation":128.11,"h":6.04,"samples":647}]};

export const SCHOOL_IDS = Object.freeze(Object.values(REFERENCE_SCHOOLS).map(s=>s.cityId));

// Does not create, move or return gameplay crossings/signs. Callers retain those.
// Pass a City building record, before generic building geometry is emitted.
export function buildReferenceSchool(b, terrain) {
  const key=Object.keys(REFERENCE_SCHOOLS).find(key=>REFERENCE_SCHOOLS[key].cityId===b?.cityId);
  const spec=REFERENCE_SCHOOLS[key];
  if(!spec)return null;
  const pts=b.p.map(p=>p.slice());
  if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.001)pts.pop();
  const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
  const ground=(x,z)=>terrain.meshHeight?.(x,z)??terrain.groundHeight(x,z);
  // A common slab stays level; deep foundations follow terrain at each wall edge.
  const floor=ground(cx,cz),roofParts=SCHOOL_ROOF_PARTS[b.cityId]||[{p:b.p,h:b.h}];
  const group=new THREE.Group();group.name=`Surveyed ${spec.name}`;
  const mats={wall:new THREE.MeshStandardMaterial({color:spec.wall,roughness:.95}),base:new THREE.MeshStandardMaterial({color:spec.base,roughness:.98}),trim:new THREE.MeshStandardMaterial({color:spec.trim,roughness:.72}),glass:new THREE.MeshStandardMaterial({color:0x465b5a,roughness:.29,metalness:.32}),reveal:new THREE.MeshStandardMaterial({color:0x313b37,roughness:.83}),roof:new THREE.MeshStandardMaterial({color:0x595e59,roughness:1}),metal:new THREE.MeshStandardMaterial({color:0x969e9b,metalness:.65,roughness:.52})};
  const parts=Object.fromEntries(Object.keys(mats).map(k=>[k,[]]));
  function box(key,w,h,d,x,y,z,angle=0){const g=new THREE.BoxGeometry(w,h,d);g.rotateY(angle);g.translate(x,y,z);parts[key].push(g);}
  for(const part of roofParts){
    const ring=part.p.slice(0,-1),shape=new THREE.Shape(ring.map(p=>new THREE.Vector2(p[0],-p[1])));
    const shell=new THREE.ExtrudeGeometry(shape,{depth:part.h,bevelEnabled:false,steps:1});shell.rotateX(-Math.PI/2);shell.translate(0,floor,0);parts.wall.push(shell);
    const top=new THREE.ShapeGeometry(shape);top.rotateX(-Math.PI/2);top.translate(0,floor+part.h+.012,0);parts.roof.push(top);
  }
  const area=pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  const boundaryDistance=(x,z)=>{
    let nearest=Infinity;
    for(let i=0;i<pts.length;i++){
      const a=pts[i],q=pts[(i+1)%pts.length],dx=q[0]-a[0],dz=q[1]-a[1],len2=dx*dx+dz*dz;
      const t=len2?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/len2)):0;
      nearest=Math.min(nearest,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
    }
    return nearest;
  };
  // Only original outside edges receive windows. Internal roof steps stay solid;
  // splitting at the wing boundaries prevents fascia floating above low ranges.
  for(const part of roofParts)for(let e=1;e<part.p.length;e++){
    let a=part.p[e-1],q=part.p[e];
    if(boundaryDistance((a[0]+q[0])/2,(a[1]+q[1])/2)>.008)continue;
    const partArea=part.p.slice(0,-1).reduce((sum,p,i)=>{const q=part.p[i+1];return sum+p[0]*q[1]-q[0]*p[1];},0);
    if(Math.sign(partArea)!==Math.sign(area))[a,q]=[q,a];
    const dx=q[0]-a[0],dz=q[1]-a[1],len=Math.hypot(dx,dz),height=part.h;
    if(len<.05)continue;
    const tx=dx/len,tz=dz/len,nx=tz*Math.sign(area),nz=-tx*Math.sign(area),angle=Math.atan2(-tz,tx);
    const at=(key,w,h,d,u,y,out=.02)=>box(key,w,h,d,a[0]+tx*u+nx*out,floor+y,a[1]+tz*u+nz*out,angle);
    at('trim',len+.08,.23,.25,len/2,height+.02,.035);
    at('reveal',len,.10,.075,len/2,height-.19,.042);
    at('base',len,.86,.08,len/2,.43,.035);
    // Segment the footing vertically so a sloping campus cannot expose a floating slab.
    for(let u=0;u<len;u+=2){const w=Math.min(2,len-u),mid=u+w/2,y=ground(a[0]+tx*mid,a[1]+tz*mid);const depth=Math.max(.18,floor-y+.22);at('base',w+.015,depth,.22,mid,-depth/2+.10);}
    if(len<4)continue;
    // Long school fronts use group windows with recessed dark returns, operable
    // upper lights, projecting sills and slim anodised mullions (visible at 01:25).
    const bays=Math.max(1,Math.floor(len/4.2)),pitch=len/bays;
    const rows=key==='wellington'&&height>6.8?2:1;
    for(let j=0;j<bays;j++){
      const u=(j+.5)*pitch,w=Math.min(3.25,pitch-.85);
      for(let row=0;row<rows;row++){
        const y=1.22+row*3.55,h=1.72;
        at('reveal',w+.17,h+.17,.13,u,y+h/2,.073);
        at('trim',w+.08,h+.08,.075,u,y+h/2,.15);
        at('glass',w-.09,h-.10,.025,u,y+h/2,.198);
        for(const f of [-1/6,1/6])at('trim',.043,h,.042,u+w*f,y+h/2,.225);
        at('trim',w,.045,.045,u,y+h*.73,.228);
        at('trim',w+.20,.09,.30,u,y-.02,.15);
      }
      // Faint panel joint, not a huge decorative stripe absent from the stills.
      at('base',.025,Math.max(.1,height-1.1),.014,j*pitch,height/2,.05);
    }
    if(len>10){
      // Corner rainwater leaders tucked behind the fascia; low mesh cost after merge.
      for(const u of [.38,len-.38])at('metal',.075,height-.28,.085,u,(height-.28)/2,.095);
    }
  }
  for(const [key,geos] of Object.entries(parts))if(geos.length){
    // Extrusions are non-indexed; normalize all batches before merging.
    const normalized=geos.map(g=>g.index?g.toNonIndexed():g);
    const geo=mergeGeometries(normalized,false);
    if(!geo)throw new Error(`Cannot merge school ${spec.name}: ${key}`);
    const m=new THREE.Mesh(geo,mats[key]);m.castShadow=true;m.receiveShadow=true;group.add(m);
    for(const g of new Set([...geos,...normalized]))g.dispose();
  }
  group.userData={school:key,cityId:b.cityId,footprint:b.p,height:b.h,heightBasis:b.heightBasis,roofParts,roofHeightBasis:'NRCan HRDEM DSM medians per mapped wing, relative to local DTM datum',sourceFrames:spec.frames,facadeBasis:'visible palette and construction cues; window counts and unseen walls interpreted'};
  return group;
}

// Wellington's slim two-post board in 00:35 replaces the previous enormous brick
// monument. It uses the existing projected anchor and does not move any crossing.
export function buildReferenceSchoolBoard(corridor, terrain, key, texture) {
  const spec=REFERENCE_SCHOOLS[key];if(!spec)return null;
  const pr=corridor.projectExact(...spec.pos),i=pr.i,side=Math.sign(pr.lat)||1;
  const [nx,nz]=corridor.normalAt(i),base=corridor.pts[i],out=corridor.hw[i]+4.5;
  const x=base[0]+nx*side*out,z=base[1]+nz*side*out;
  const y=terrain.meshHeight?.(x,z)??terrain.groundHeight(x,z);
  const group=new THREE.Group();group.name=`${spec.name} reference reader board`;
  group.position.set(x,y,z);group.rotation.y=Math.atan2(nx*side,nz*side);
  const width=key==='wellington'?3.2:2.8,height=key==='wellington'?1.7:1.45,bottom=1.3;
  const grey=new THREE.MeshStandardMaterial({color:0x939b94,roughness:.65,metalness:.3});
  const frame=new THREE.MeshStandardMaterial({color:0xe0e3d8,roughness:.8});
  const add=(w,h,d,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;group.add(m);};
  for(const x of [-width*.43,width*.43])add(.11,bottom+height+.07,.11,x,(bottom+height+.07)/2,0,grey);
  add(width+.10,height+.10,.17,0,bottom+height/2,0,frame);
  const panel=new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.58,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.12});
  for(const side of [-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),panel);m.position.set(0,bottom+height/2,side*.09);m.rotation.y=side<0?Math.PI:0;group.add(m);}
  group.userData={school:key,referenceDimensionsEstimated:true,sourceFrames:spec.frames,index:i};
  return group;
}
