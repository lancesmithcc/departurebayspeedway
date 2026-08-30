// buildings.js — extrude real OSM footprints, merged sector meshes
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Grid, choice, pointInPoly, clamp, rand, CFG } from './util.js';
import { TEX } from './textures.js';

const HOUSE_COLORS = ['#d8cfc0', '#cfd6d2', '#c9b8a3', '#b9c4c9', '#d6c6b0', '#c4b39c', '#aebfb4', '#d9d2c5', '#b8a88f', '#9fb3a6'];
const COMM_COLORS = ['#c6c2b8', '#b9bcbf', '#cfc8ba', '#a9b0b5', '#bdb3a4'];
const ROOF_COLORS = ['#4a4642', '#5a5048', '#3f4245', '#6b5b4d', '#54604f', '#5f5148'];
const HOUSE_TYPES = new Set(['house', 'detached', 'semidetached_house', 'yes', 'garage', 'hut', 'barn', 'boathouse', 'outbuilding', 'shed']);

// paint a flat vertex colour onto a geometry so it can merge with the tinted meshes
function tintGeo(g, r, gr, b) {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// mergeGeometries needs matching attribute sets: give everything position/normal/uv/color
function uniform(g) {
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('color')) tintGeo(g, 1, 1, 1);
  for (const k of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  }
  return g;
}

export function buildBuildings(map, terrain, skipNear = [], corridor = null, houseModels = null) {
  const SEC = 4;
  const W = CFG.world;
  const sectors = [];
  for (let i = 0; i < SEC * SEC; i++) sectors.push({ houseWalls: [], commWalls: [], roofs: [], trim: [] });
  const sw = (W.terrainMaxX - W.terrainMinX) / SEC, sh = (W.terrainMaxZ - W.terrainMinZ) / SEC;

  const buildingGrid = new Grid(24);
  const wallColor = new THREE.Color();
  const roofColor = new THREE.Color();
  let placed = 0;
  // When the CC0 suburban kit is loaded, small residential footprints get a real
  // house model dropped on them instead of an extruded box; the collision grid still
  // uses the true OSM outline either way.
  const housePlacements = houseModels && houseModels.length ? [] : null;

  // Some OSM footprints (the mall canopy at the start, a few carports) reach out over
  // the carriageway. Push any vertex that lands inside the driving corridor back to
  // its edge so nothing hangs over the road.
  // do two segments cross?
  const segCross = (ax, az, bx, bz, cx2, cz2, dx2, dz2) => {
    const d1 = (dx2 - cx2) * (az - cz2) - (dz2 - cz2) * (ax - cx2);
    const d2 = (dx2 - cx2) * (bz - cz2) - (dz2 - cz2) * (bx - cx2);
    const d3 = (bx - ax) * (cz2 - az) - (bz - az) * (cx2 - ax);
    const d4 = (bx - ax) * (dz2 - az) - (bz - az) * (dx2 - ax);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };

  const trimToCorridor = (poly) => {
    if (!corridor) return poly;
    // A footprint the road runs through — or whose wall crosses the carriageway
    // between two far-apart corners — is a data artifact (mall canopies, carports
    // drawn over the street). Those get dropped rather than trimmed.
    let cx0 = 0, cz0 = 0;
    for (const q of poly) { cx0 += q[0]; cz0 += q[1]; }
    cx0 /= poly.length; cz0 /= poly.length;
    const anchor = corridor.projectExact(cx0, cz0);
    if (anchor.dist < 260) {
      const lo = Math.max(1, anchor.i - 26), hi = Math.min(corridor.pts.length - 1, anchor.i + 26);
      for (let i = lo; i <= hi; i++) {
        const c = corridor.pts[i];
        if (pointInPoly(poly, c[0], c[1])) return null;
        const prev = corridor.pts[i - 1];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length];
          if (segCross(a[0], a[1], b[0], b[1], prev[0], prev[1], c[0], c[1])) return null;
        }
      }
    }
    // Which side of the road does this building belong to? Trimming each corner to its
    // own nearest kerb was the bug: two corners barely inside the corridor, one a touch
    // left of centre and one a touch right, got pushed to opposite kerbs and the wall
    // (and the roof over it) ended up bridging the carriageway. Every corner goes to
    // the side the building itself sits on.
    const lats = poly.map(([x, z]) => corridor.projectExact(x, z));
    let anyNear = false, sum = 0;
    for (const pr of lats) {
      if (Math.abs(pr.lat) < pr.hw + 1.2) anyNear = true;
      sum += pr.lat;
    }
    if (!anyNear) return poly;
    const buildingSide = Math.sign(sum) || 1;

    return poly.map(([x, z], i) => {
      const pr = lats[i];
      const clear = pr.hw + 1.4;
      if (pr.lat * buildingSide > clear) return [x, z];       // already well clear
      const [nx, nz] = corridor.normalAt(pr.i);
      const base = corridor.pts[pr.i];
      return [base[0] + nx * buildingSide * clear, base[1] + nz * buildingSide * clear];
    });
  };

  for (const b of map.buildings) {
    const pts = trimToCorridor(b.p);
    if (!pts) continue;                        // the road runs through it
    if (skipNear.some(s => Math.hypot(pts[0][0] - s[0], pts[0][1] - s[1]) < 40)) continue;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cz += p[1]; }
    cx /= pts.length; cz /= pts.length;
    const gy = terrain.groundHeight(cx, cz);
    const isHouse = b.h < 7.5 && HOUSE_TYPES.has(b.t);

    // Only the houses the rider can actually see get a model; the rest of the 8,000
    // OSM footprints stay as cheap extrusions, or the triangle count explodes.
    const nearRoute = corridor ? Math.abs(corridor.project(cx, cz).lat) < 150 : false;
    if (housePlacements && isHouse && nearRoute) {
      // oriented footprint: longest edge sets the ridge direction
      let bestLen = 0, ang = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const dx = c[0] - a[0], dz = c[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len > bestLen) { bestLen = len; ang = Math.atan2(dx, dz); }
      }
      // extent across that direction
      const ux = Math.sin(ang), uz = Math.cos(ang);
      let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9;
      for (const p of pts) {
        const du = (p[0] - cx) * ux + (p[1] - cz) * uz;
        const dv = (p[0] - cx) * -uz + (p[1] - cz) * ux;
        uMin = Math.min(uMin, du); uMax = Math.max(uMax, du);
        vMin = Math.min(vMin, dv); vMax = Math.max(vMax, dv);
      }
      const spanU = Math.max(5, uMax - uMin), spanV = Math.max(4.5, vMax - vMin);
      if (spanU < 34 && spanV < 26) {
        housePlacements.push({ x: cx, z: cz, gy, ang, spanU, spanV, h: b.h });
        let hx0 = 1e9, hx1 = -1e9, hz0 = 1e9, hz1 = -1e9;
        for (const p of pts) { hx0 = Math.min(hx0, p[0]); hx1 = Math.max(hx1, p[0]); hz0 = Math.min(hz0, p[1]); hz1 = Math.max(hz1, p[1]); }
        buildingGrid.insertAABB(hx0, hz0, hx1, hz1, { pts, x0: hx0, x1: hx1, z0: hz0, z1: hz1, h: b.h, gy });
        placed++;
        continue;
      }
    }
    const wallTop = isHouse ? b.h - 1.9 : b.h;
    wallColor.set(isHouse ? choice(HOUSE_COLORS) : choice(COMM_COLORS));
    roofColor.set(choice(ROOF_COLORS));

    // winding sign for outward normals
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      area2 += a[0] * c[1] - c[0] * a[1];
    }
    const wsign = area2 > 0 ? 1 : -1;

    const si = clamp(Math.floor((cx - W.terrainMinX) / sw), 0, SEC - 1);
    const sj = clamp(Math.floor((cz - W.terrainMinZ) / sh), 0, SEC - 1);
    const sector = sectors[sj * SEC + si];

    // ---- walls ----
    const pos = [], norm = [], uv = [], col = [], idx = [];
    let vi = 0;
    const baseY = gy - 1.6, topY = gy + wallTop;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const nx = wsign * dz / len, nz = -wsign * dx / len;
      pos.push(a[0], baseY, a[1], c[0], baseY, c[1], c[0], topY, c[1], a[0], topY, a[1]);
      norm.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      const tile = isHouse ? 3.0 : 3.3;
      const u0 = 0, u1 = len / tile, v0 = baseY / tile, v1 = topY / tile;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let k = 0; k < 4; k++) col.push(wallColor.r, wallColor.g, wallColor.b);
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    wallGeo.setIndex(idx);
    (isHouse ? sector.houseWalls : sector.commWalls).push(wallGeo);

    // ---- roof ----
    const rp = [], rn = [], rc = [], ri = [];
    let rv = 0;
    const ruv = [];
    const addQuad = (p4, n4) => {
      for (const p of p4) rp.push(p[0], p[1], p[2]);
      for (let k = 0; k < 4; k++) { rn.push(n4[0], n4[1], n4[2]); rc.push(roofColor.r, roofColor.g, roofColor.b); }
      // planar UVs from world x/z so shingle rows stay a constant real-world size
      const wq = Math.hypot(p4[1][0] - p4[0][0], p4[1][2] - p4[0][2]) / 1.6;
      const hq = Math.hypot(p4[3][0] - p4[0][0], p4[3][1] - p4[0][1], p4[3][2] - p4[0][2]) / 1.6;
      ruv.push(0, 0, wq, 0, wq, hq, 0, hq);
      ri.push(rv, rv + 1, rv + 2, rv, rv + 2, rv + 3);
      rv += 4;
    };
    if (isHouse) {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
      const alongX = (maxX - minX) >= (maxZ - minZ);
      const span = alongX ? (maxZ - minZ) : (maxX - minX);
      const rh = Math.min(2.3, Math.max(1.1, span * 0.32));
      const eaveY = topY, ridgeY = topY + rh, ov = 0.35;
      if (alongX) {
        const zA = minZ - ov, zB = maxZ + ov, zM = (minZ + maxZ) / 2;
        const xA = minX - ov, xB = maxX + ov;
        addQuad([[xA, eaveY, zA], [xB, eaveY, zA], [xB, ridgeY, zM], [xA, ridgeY, zM]], [0, 0.7, -0.7]);
        addQuad([[xB, eaveY, zB], [xA, eaveY, zB], [xA, ridgeY, zM], [xB, ridgeY, zM]], [0, 0.7, 0.7]);
      } else {
        const xA = minX - ov, xB = maxX + ov, xM = (minX + maxX) / 2;
        const zA = minZ - ov, zB = maxZ + ov;
        addQuad([[xA, eaveY, zB], [xA, eaveY, zA], [xM, ridgeY, zA], [xM, ridgeY, zB]], [-0.7, 0.7, 0]);
        addQuad([[xB, eaveY, zA], [xB, eaveY, zB], [xM, ridgeY, zB], [xM, ridgeY, zA]], [0.7, 0.7, 0]);
      }
      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      roofGeo.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
      roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
      roofGeo.setIndex(ri);
      sector.roofs.push(roofGeo);

      // fascia board under the eaves + an occasional chimney: breaks the plain box
      const fw = (maxX - minX) + ov * 2, fd = (maxZ - minZ) + ov * 2;
      const fascia = new THREE.BoxGeometry(fw, 0.22, fd);
      fascia.translate((minX + maxX) / 2, topY - 0.02, (minZ + maxZ) / 2);
      tintGeo(fascia, 0.93, 0.92, 0.88);
      sector.trim.push(fascia);
      if (Math.random() < 0.22) {
        const chim = new THREE.BoxGeometry(0.7, rh + 1.1, 0.7);
        const t = rand(0.3, 0.7);
        chim.translate(
          alongX ? minX + (maxX - minX) * t : (minX + maxX) / 2,
          topY + (rh + 1.1) / 2 - 0.2,
          alongX ? (minZ + maxZ) / 2 : minZ + (maxZ - minZ) * t,
        );
        tintGeo(chim, 0.55, 0.5, 0.47);
        sector.trim.push(chim);
      }
    } else {
      const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
      const cap = new THREE.ShapeGeometry(shape);
      cap.rotateX(-Math.PI / 2);
      cap.translate(0, gy + b.h + 0.02, 0);
      // flat commercial roofs read as tar/gravel membrane, not house shingles
      const g0 = rand(0.34, 0.44);
      tintGeo(cap, g0, g0 * 1.02, g0 * 1.04);
      sector.trim.push(cap);

      // parapet: a low wall ringing the roof edge, so the top isn't a bare slab
      const pPos = [], pNorm = [], pUv = [], pCol = [], pIdx = [];
      let pv = 0;
      const pTop = gy + b.h + 0.85, pBot = gy + b.h - 0.15;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const dx = c[0] - a[0], dz = c[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const nx = wsign * dz / len, nz = -wsign * dx / len;
        const ex = nx * 0.18, ez = nz * 0.18;   // slight overhang
        pPos.push(a[0] + ex, pBot, a[1] + ez, c[0] + ex, pBot, c[1] + ez, c[0] + ex, pTop, c[1] + ez, a[0] + ex, pTop, a[1] + ez);
        pNorm.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
        pUv.push(0, 0, len / 3, 0, len / 3, 0.3, 0, 0.3);
        for (let k = 0; k < 4; k++) pCol.push(0.86, 0.85, 0.82);
        pIdx.push(pv, pv + 1, pv + 2, pv, pv + 2, pv + 3);
        pv += 4;
      }
      if (pv) {
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
        pg.setAttribute('normal', new THREE.Float32BufferAttribute(pNorm, 3));
        pg.setAttribute('uv', new THREE.Float32BufferAttribute(pUv, 2));
        pg.setAttribute('color', new THREE.Float32BufferAttribute(pCol, 3));
        pg.setIndex(pIdx);
        sector.trim.push(pg);
      }
      // rooftop HVAC boxes on larger footprints
      let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9;
      for (const p of pts) { fx0 = Math.min(fx0, p[0]); fx1 = Math.max(fx1, p[0]); fz0 = Math.min(fz0, p[1]); fz1 = Math.max(fz1, p[1]); }
      if ((fx1 - fx0) * (fz1 - fz0) > 260) {
        const units = clamp(Math.floor((fx1 - fx0) * (fz1 - fz0) / 500), 1, 4);
        for (let u = 0; u < units; u++) {
          const ux = fx0 + (fx1 - fx0) * rand(0.25, 0.75), uz = fz0 + (fz1 - fz0) * rand(0.25, 0.75);
          if (!pointInPoly(pts, ux, uz)) continue;
          const box = new THREE.BoxGeometry(rand(1.6, 2.8), rand(0.7, 1.3), rand(1.4, 2.4));
          box.translate(ux, gy + b.h + 0.55, uz);
          tintGeo(box, 0.7, 0.71, 0.72);
          sector.trim.push(box);
        }
      }
    }

    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (const p of pts) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); }
    buildingGrid.insertAABB(bx0, bz0, bx1, bz1, { pts, x0: bx0, x1: bx1, z0: bz0, z1: bz1, h: b.h, gy });
    placed++;
  }

  const houseMat = new THREE.MeshStandardMaterial({ map: TEX.siding, vertexColors: true, roughness: 0.85, metalness: 0.03, side: THREE.DoubleSide });
  const commMat = new THREE.MeshStandardMaterial({ map: TEX.facade, vertexColors: true, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ map: TEX.shingle, vertexColors: true, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const addMesh = (geos, mat) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos.map(uniform), false), mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  for (const s of sectors) {
    addMesh(s.houseWalls, houseMat);
    addMesh(s.commWalls, commMat);
    addMesh(s.roofs, roofMat);
    addMesh(s.trim, trimMat);
  }
  // drop the authored houses on their real footprints
  if (housePlacements && housePlacements.length) {
    const per = Math.ceil(housePlacements.length / houseModels.length) + 4;
    const meshes = houseModels.map((hm) => {
      const inst = new THREE.InstancedMesh(hm.geometry, hm.material, per);
      inst.castShadow = true; inst.receiveShadow = true;
      inst.frustumCulled = false;
      inst.count = 0;
      group.add(inst);
      return { inst, size: hm.size, used: 0 };
    });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    housePlacements.forEach((hp, i) => {
      const slot = meshes[i % meshes.length];
      if (slot.used >= per) return;
      const sx = clamp(hp.spanV / Math.max(0.1, slot.size.x), 0.55, 2.4);
      const sz = clamp(hp.spanU / Math.max(0.1, slot.size.z), 0.55, 2.4);
      const sy = clamp((hp.h + 1.6) / Math.max(0.1, slot.size.y), 0.6, 1.9);
      P.set(hp.x, hp.gy - 0.15, hp.z);
      Q.setFromAxisAngle(up, hp.ang);
      S.set(sx, sy, sz);
      M.compose(P, Q, S);
      slot.inst.setMatrixAt(slot.used, M);
      slot.used++;
      slot.inst.count = slot.used;
    });
    for (const m of meshes) m.inst.instanceMatrix.needsUpdate = true;
  }

  return { group, buildingGrid, count: placed, houses: housePlacements ? housePlacements.length : 0 };
}

// resolve building collision for a point: returns push-out vector or null
export function buildingCollide(buildingGrid, x, z) {
  for (const b of buildingGrid.query(x, z, 4)) {
    if (x < b.x0 - 0.5 || x > b.x1 + 0.5 || z < b.z0 - 0.5 || z > b.z1 + 0.5) continue;
    if (pointInPoly(b.pts, x, z)) {
      let best = Infinity, px = x, pz = z;
      for (let i = 0; i < b.pts.length; i++) {
        const a = b.pts[i], c = b.pts[(i + 1) % b.pts.length];
        const dx = c[0] - a[0], dz = c[1] - a[1];
        const len2 = dx * dx + dz * dz || 1;
        let t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
        t = clamp(t, 0, 1);
        const qx = a[0] + t * dx, qz = a[1] + t * dz;
        const d = Math.hypot(x - qx, z - qz);
        if (d < best) { best = d; px = qx; pz = qz; }
      }
      return { nx: x - px, nz: z - pz, d: best, building: b };
    }
  }
  return null;
}
