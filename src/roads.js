// roads.js — road ribbon meshes + lane markings, merged into few draw calls
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';
import { clamp } from './util.js';
import { streetProfile } from './street-profile.js';

function ribbon(pts, elev, halfW, yOff) {
  // builds a flat ribbon following polyline; returns BufferGeometry in XZ with y from elev
  const pos = [], norm = [], uv = [], idx = [];
  let dist = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i];
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const px = -dz, pz = dx; // perpendicular
    const y = (elev ? elev[i] : 0) + yOff;
    pos.push(x + px * halfW, y, z + pz * halfW, x - px * halfW, y, z - pz * halfW);
    norm.push(0, 1, 0, 0, 1, 0);
    if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    const u0 = 0, u1 = 1;
    uv.push(u0, dist / 8, u1, dist / 8);
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Keep side-road triangles out of the primary carriageway. Snapping only their
// centre nodes leaves a wedge: the arterial slopes across a flat side-road end.
// Clip against its actual triangle footprint and stitch the remaining boundary
// to the primary shoulder, leaving the primary deck and lane markings intact.
function primaryFootprints(roads) {
  const triangles = [];
  for (const r of roads) {
    if (r.n !== 'Departure Bay Road' || r.br || (r.l || 0) !== 0) continue;
    const shoulder = r.w >= 6;
    const g = ribbon(r.p, r.e, r.w / 2 + (shoulder ? .55 : 0), shoulder ? .015 : .07);
    const p = g.attributes.position, ids = g.index.array;
    for (let i = 0; i < ids.length; i += 3) {
      const v = [ids[i], ids[i + 1], ids[i + 2]].map(j => [p.getX(j), p.getY(j), p.getZ(j)]);
      const cross = (v[1][0]-v[0][0])*(v[2][2]-v[0][2])-(v[1][2]-v[0][2])*(v[2][0]-v[0][0]);
      if (Math.abs(cross) < 1e-8) continue;
      if (cross < 0) [v[1], v[2]] = [v[2], v[1]];
      triangles.push({road:r, v, x0:Math.min(...v.map(p=>p[0])), x1:Math.max(...v.map(p=>p[0])), z0:Math.min(...v.map(p=>p[2])), z1:Math.max(...v.map(p=>p[2]))});
    }
    g.dispose();
  }
  return triangles;
}

function trimPrimaryOverlap(geometry, footprints) {
  const attrs = Object.entries(geometry.attributes);
  const output = Object.fromEntries(attrs.map(([name]) => [name, []]));
  const ids = geometry.index.array;
  const distance = (p,a,b) => (b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);
  const split = (poly,a,b,inside) => {
    const result=[];
    for(let i=0;i<poly.length;i++) {
      const v=poly[i], next=poly[(i+1)%poly.length];
      const d=distance(v.position,a,b), nd=distance(next.position,a,b);
      const keep=inside?d>=0:d<=0, nextKeep=inside?nd>=0:nd<=0;
      if(keep)result.push(v);
      if(keep!==nextKeep) {
        const t=d/(d-nd);
        result.push(Object.fromEntries(attrs.map(([name])=>[name,v[name].map((value,j)=>value+(next[name][j]-value)*t)])));
      }
    }
    return result;
  };
  for(let i=0;i<ids.length;i+=3) {
    let pieces=[[ids[i],ids[i+1],ids[i+2]].map(j=>Object.fromEntries(attrs.map(([name,a])=>[name,Array.from(a.array.slice(j*a.itemSize,(j+1)*a.itemSize))])) )];
    const original=pieces[0], xs=original.map(v=>v.position[0]), zs=original.map(v=>v.position[2]);
    const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
    for(const tri of footprints) {
      if(tri.x1<x0||tri.x0>x1||tri.z1<z0||tri.z0>z1)continue;
      const nextPieces=[];
      for(const poly of pieces) {
        let overlap=poly;
        for(let edge=0;edge<3&&overlap.length;edge++)overlap=split(overlap,tri.v[edge],tri.v[(edge+1)%3],true);
        const area=overlap.reduce((sum,v,j)=>{const n=overlap[(j+1)%overlap.length];return sum+v.position[0]*n.position[2]-n.position[0]*v.position[2];},0);
        if(Math.abs(area)<1e-7){nextPieces.push(poly);continue;}
        let remaining=poly;
        for(let edge=0;edge<3&&remaining.length;edge++) {
          const outside=split(remaining,tri.v[edge],tri.v[(edge+1)%3],false);
          if(outside.length>=3) {
            for(const vertex of outside) {
              const p=vertex.position;
              if(tri.v.every((a,j)=>distance(p,a,tri.v[(j+1)%3])>=-1e-5)) {
                const [a,b,c]=tri.v, den=distance(c,a,b);
                const wb=((p[0]-a[0])*(c[2]-a[2])-(p[2]-a[2])*(c[0]-a[0]))/den;
                const wc=distance(p,a,b)/den;
                // Clone: another retained polygon can share this vertex object.
                vertex.position=[p[0],a[1]+wb*(b[1]-a[1])+wc*(c[1]-a[1]),p[2]];
              }
            }
            nextPieces.push(outside);
          }
          remaining=split(remaining,tri.v[edge],tri.v[(edge+1)%3],true);
        }
      }
      pieces=nextPieces;
      if(!pieces.length)break;
    }
    for(const poly of pieces)for(let j=1;j<poly.length-1;j++)for(const vertex of [poly[0],poly[j],poly[j+1]])for(const [name] of attrs)output[name].push(...vertex[name]);
  }
  const result=new THREE.BufferGeometry();
  for(const [name,a]of attrs)result.setAttribute(name,new THREE.Float32BufferAttribute(output[name],a.itemSize));
  result.setIndex(Array.from({length:result.attributes.position.count},(_,i)=>i));
  geometry.dispose();
  return result;
}

export function buildRoads(map, terrain) {
  const roadGeos = [], markGeos = [];
  const footprints = primaryFootprints(map.roads);
  const primaryNodes = new Map();
  for (const road of map.roads) if (road.n === 'Departure Bay Road' && !road.br && !(road.l || 0)) {
    for (const p of road.p) {
      const key=p.join(',');if(!primaryNodes.has(key))primaryNodes.set(key,new Set());
      primaryNodes.get(key).add(road);
    }
  }
  const junctionPoints = map.roads.filter(r=>r.n!=='Departure Bay Road'&&!r.br&&!(r.l||0)).flatMap(r=>r.p.filter(p=>primaryNodes.has(p.join(','))));
  const white = new THREE.Color('#f2ede4'), yellow = new THREE.Color('#d8a018');

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  for (const r of map.roads) {
    const pts = r.p, e = r.e;
    const trim = r.n !== 'Departure Bay Road' && !r.br && !(r.l || 0);
    const joins = trim ? pts.filter(p=>primaryNodes.has(p.join(','))) : [];
    const joinedRoads = new Set(joins.flatMap(p=>[...primaryNodes.get(p.join(','))]));
    const localFootprints = footprints.filter(t=>joinedRoads.has(t.road)&&joins.some(p=>t.x1>=p[0]-18&&t.x0<=p[0]+18&&t.z1>=p[1]-18&&t.z0<=p[1]+18));
    const conform = geometry => localFootprints.length ? trimPrimaryOverlap(geometry, localFootprints) : geometry;
    // Ferry-terminal aprons and dock lanes are mapped out over the water; without a
    // bridge tag they'd be laid as tarmac ribbons floating on the harbour.
    if (!r.br) {
      let wet = 0;
      for (const p of pts) if (terrain.seaSignedDist(p[0], p[1]) < -4) wet++;
      if (wet > pts.length * 0.5) continue;
    }
    // deck
    const deck=conform(ribbon(pts, e, r.w / 2, 0.07));
    if (r.n === 'Departure Bay Road' && !r.br && !(r.l || 0)) terrain.registerJunctionDeckGeometry?.(deck, junctionPoints);
    terrain.registerGroundGeometry?.(deck);roadGeos.push(deck);
    // shoulders (slightly wider dirt/gravel blend) — skip for service lanes
    if (r.w >= 6) {
      const shoulder=conform(ribbon(pts, e, r.w / 2 + 0.55, 0.015));
      if (r.n === 'Departure Bay Road' && !r.br && !(r.l || 0)) terrain.registerJunctionDeckGeometry?.(shoulder, junctionPoints);
      terrain.registerGroundGeometry?.(shoulder);roadGeos.push(shoulder);
    }
    // markings
    const dashes = (type, color, offA, offB) => {
      // thin ribbon segments between offsets offA..offB (meters from center), dashes along length
      let dist = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const segLen = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const steps = Math.max(1, Math.round(segLen / 3));
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 0.55) / steps; // ~55% duty dash
          const x0 = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t0;
          const z0 = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t0;
          const x1 = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t1;
          const z1 = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t1;
          const e0 = e[i] + (e[i + 1] - e[i]) * t0;
          const e1 = e[i] + (e[i + 1] - e[i]) * t1;
          let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
          const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
          const px = -dz, pz = dx;
          const w = 0.065;
          const a0 = offA - w, a1 = offA + w;
          const pos = [
            x0 + px * a1, e0 + 0.1, z0 + pz * a1,
            x0 + px * a0, e0 + 0.1, z0 + pz * a0,
            x1 + px * a1, e1 + 0.1, z1 + pz * a1,
            x1 + px * a0, e1 + 0.1, z1 + pz * a0,
          ];
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute([color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b], 3));
          g.setIndex([0, 2, 1, 1, 2, 3]);
          g.computeVertexNormals();
          markGeos.push(conform(g));
        }
      }
    };
    const solid = (off) => dashes('solid', white, off); // dash with 55% duty looks broken; use full duty
    // full-duty variant
    const solidLine = (off, color = white, accept = () => true) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const station = r.stations ? (r.stations[i] + r.stations[i + 1]) / 2 : 0;
        if (!accept(streetProfile(station))) continue;
        let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        const px = -dz, pz = dx, w = 0.065;
        const pos = [
          pts[i][0] + px * (off + w), e[i] + 0.1, pts[i][1] + pz * (off + w),
          pts[i][0] + px * (off - w), e[i] + 0.1, pts[i][1] + pz * (off - w),
          pts[i + 1][0] + px * (off + w), e[i + 1] + 0.1, pts[i + 1][1] + pz * (off + w),
          pts[i + 1][0] + px * (off - w), e[i + 1] + 0.1, pts[i + 1][1] + pz * (off - w),
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        // Four positions require four RGB triplets. The old eight-triplet buffer made
        // merged markings read colours from the following geometry, turning white
        // shoulder lines yellow on apparently random blocks of road.
        g.setAttribute('color', new THREE.Float32BufferAttribute([
          color.r, color.g, color.b,
          color.r, color.g, color.b,
          color.r, color.g, color.b,
          color.r, color.g, color.b,
        ], 3));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        g.computeVertexNormals();
        markGeos.push(conform(g));
      }
    };
    // Street View: Departure Bay Road is a conventional two-way Nanaimo arterial.
    // It carries a close double-yellow centreline and white shoulder / bike-lane
    // boundaries. Treating every OSM "primary" as a divided road put dashed white
    // lane lines down the middle and yellow lines at both kerbs.
    const isDepartureBay = r.n === 'Departure Bay Road';
    const isDivided = !isDepartureBay && (r.c === 'trunk' || r.c === 'motorway' || r.c === 'primary');
    if (r.w >= 5.8) {
      if (isDepartureBay) {
        solidLine(0, yellow, p => p.center === 'single');
        solidLine(-0.13, yellow, p => p.center === 'double');
        solidLine(0.13, yellow, p => p.center === 'double');
        solidLine(-1.65, yellow, p => p.center === 'turn-lane');
        solidLine(1.65, yellow, p => p.center === 'turn-lane');
        if (r.stations && Math.max(...r.stations) <= 507) {
          dashes('dash', yellow, -1.4); dashes('dash', yellow, 1.4);
        }
        if (r.w >= 7.5) {
          solidLine(r.w / 2 - 0.28, white, p => p.edgeLines);
          solidLine(-(r.w / 2 - 0.28), white, p => p.edgeLines);
        }
      } else if (isDivided) {
        // white edge lines + dashed lane dividers at quarters
        solidLine(r.w / 2 - 0.5); solidLine(-(r.w / 2 - 0.5));
        if (r.w > 9) { dashes('dash', white, r.w / 4); dashes('dash', white, -r.w / 4); }
      } else {
        dashes('dash', yellow, 0); // yellow centre line, BC style
        if (r.w > 8) { solidLine(r.w / 2 - 0.4); solidLine(-(r.w / 2 - 0.4)); }
      }
    }
  }

  const group = new THREE.Group();
  const asphaltMat = new THREE.MeshStandardMaterial({ map: TEX.asphalt, bumpMap: TEX.asphalt, bumpScale: 0.025, roughness: 0.91, metalness: 0 });
  const merged = mergeGeometries(roadGeos, false);
  const roadMesh = new THREE.Mesh(merged, asphaltMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  if (markGeos.length) {
    const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mm = new THREE.Mesh(mergeGeometries(markGeos, false), markMat);
    group.add(mm);
  }
  return group;
}
