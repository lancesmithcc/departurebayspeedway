// roads.js — road ribbon meshes + lane markings, merged into few draw calls
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';
import { clamp } from './util.js';

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

export function buildRoads(map, terrain) {
  const roadGeos = [], markGeos = [];
  const white = new THREE.Color('#f2ede4'), yellow = new THREE.Color('#d8a018');

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  for (const r of map.roads) {
    const pts = r.p, e = r.e;
    // Ferry-terminal aprons and dock lanes are mapped out over the water; without a
    // bridge tag they'd be laid as tarmac ribbons floating on the harbour.
    if (!r.br) {
      let wet = 0;
      for (const p of pts) if (terrain.seaSignedDist(p[0], p[1]) < -4) wet++;
      if (wet > pts.length * 0.5) continue;
    }
    // deck
    roadGeos.push(ribbon(pts, e, r.w / 2, 0.07));
    // shoulders (slightly wider dirt/gravel blend) — skip for service lanes
    if (r.w >= 6) {
      roadGeos.push(ribbon(pts, e, r.w / 2 + 0.55, 0.015));
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
          const w = 0.14;
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
          markGeos.push(g);
        }
      }
    };
    const solid = (off) => dashes('solid', white, off); // dash with 55% duty looks broken; use full duty
    // full-duty variant
    const solidLine = (off, color = white) => {
      for (let i = 0; i < pts.length - 1; i++) {
        let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        const px = -dz, pz = dx, w = 0.15;
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
        markGeos.push(g);
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
        solidLine(-0.18, yellow);
        solidLine(0.18, yellow);
        // These read as the real shoulder / parking / cycle-lane boundaries. Some
        // short driveway pieces omit them in life, but a continuous line is far less
        // misleading than the old yellow road edges at riding speed.
        if (r.w >= 7.5) {
          solidLine(r.w / 2 - 0.38, white);
          solidLine(-(r.w / 2 - 0.38), white);
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
  const asphaltMat = new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 0.94, metalness: 0 });
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
