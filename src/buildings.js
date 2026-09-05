// buildings.js — extrude real OSM footprints, merged sector meshes
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Grid, pointInPoly, clamp, CFG } from './util.js';
import { TEX } from './textures.js';

const HOUSE_COLORS = ['#b4aa97', '#a5b0ab', '#a88b72', '#8cabb8', '#c4b798', '#988675', '#839784', '#cdc7b7', '#a28d70', '#7b9085'];
const COMM_COLORS = ['#c6c2b8', '#b9bcbf', '#cfc8ba', '#a9b0b5', '#bdb3a4'];
const ROOF_COLORS = ['#4a4642', '#5a5048', '#3f4245', '#6b5b4d', '#54604f', '#5f5148'];
const HOUSE_TYPES = new Set(['house', 'detached', 'semidetached_house', 'yes', 'garage', 'hut', 'barn', 'boathouse', 'outbuilding', 'shed']);
const PITCHED_TYPES = new Set(['apartments', 'residential', 'church']);

// Street View reference pass: visible corridor landmarks get fixed colours instead
// of changing every load. Remaining homes use muted local siding/roof palettes.
const LANDMARK_PALETTE = {
  "St. Andrew's Presbyterian Church": ['#c9c0ad', '#4c4943'],
  'Great Canadian Oil Change': ['#d4cebf', '#3e4447'],
  'Dairy Queen': ['#ede9df', '#8b312d'],
  'Kal Tire': ['#d5d9da', '#30363a'],
  'Central Nanaimo Urgent & Primary Care Centre': ['#c5cdcf', '#454b4e'],
  'ServiceXCEL': ['#c3c5c2', '#424649'],
  'The Logcom Group': ['#bdb8ab', '#46443f'],
  'Departure Bay Baptist Church': ['#c8bca6', '#55483e'],
  'M2 Green Mechanical': ['#b9c2b7', '#3e4940'],
  '7-Eleven': ['#e8e5dc', '#414447'],
  'Seaside Place': ['#e3e2dc', '#565350'],
  'Legasea': ['#dad9d3', '#504c49'],
  'Kin Hut': ['#b9aa91', '#50473e'],
};

function buildingRandom(x, z) {
  let state = (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663)) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

export function buildBuildings(map, terrain, skipNear = [], corridor = null) {
  const SEC = 4;
  const W = CFG.world;
  const sectors = [];
  for (let i = 0; i < SEC * SEC; i++) sectors.push({ houseWalls: [], commWalls: [], roofs: [], trim: [] });
  const sw = (W.terrainMaxX - W.terrainMinX) / SEC, sh = (W.terrainMaxZ - W.terrainMinZ) / SEC;

  const buildingGrid = new Grid(24);
  const wallColor = new THREE.Color();
  const roofColor = new THREE.Color();
  let placed = 0;

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
    const gy = terrain.meshHeight(cx, cz) ?? terrain.groundHeight(cx, cz);
    const random = buildingRandom(cx, cz);
    const pick = values => values[Math.floor(random() * values.length) % values.length];
    // OSM uses building=yes for many shops. Named footprints are landmarks or
    // commercial unless their type explicitly says residential.
    const isHouse = b.h < 11 && (HOUSE_TYPES.has(b.t) || b.t === 'residential') && !b.n;
    const wantsPitched = isHouse || PITCHED_TYPES.has(b.t);
    const palette = LANDMARK_PALETTE[b.n];
    wallColor.set(palette ? palette[0] : (isHouse ? pick(HOUSE_COLORS) : pick(COMM_COLORS)));
    roofColor.set(palette ? palette[1] : pick(ROOF_COLORS));

    // winding sign for outward normals
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      area2 += a[0] * c[1] - c[0] * a[1];
    }
    const wsign = area2 > 0 ? 1 : -1;
    // A rectangular gable over an L-shaped mapped footprint creates a visibly false
    // building. Only fit that roof where the OSM outline substantially fills its
    // oriented box; complex footprints retain their exact polygon at roof level.
    let roofUx = 1, roofUz = 0, roofBestLen = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len > roofBestLen) { roofBestLen = len; roofUx = dx / len; roofUz = dz / len; }
    }
    const roofVx = -roofUz, roofVz = roofUx;
    let ru0 = 1e9, ru1 = -1e9, rv0 = 1e9, rv1 = -1e9;
    for (const p of pts) {
      const pu = (p[0] - cx) * roofUx + (p[1] - cz) * roofUz;
      const pv = (p[0] - cx) * roofVx + (p[1] - cz) * roofVz;
      ru0 = Math.min(ru0, pu); ru1 = Math.max(ru1, pu); rv0 = Math.min(rv0, pv); rv1 = Math.max(rv1, pv);
    }
    const rectangularity = Math.abs(area2) * 0.5 / Math.max(1, (ru1 - ru0) * (rv1 - rv0));
    const isPitched = wantsPitched && rectangularity >= 0.84;
    const roofAllowance = isPitched ? (b.t === 'apartments' ? 1.35 : 1.9) : 0;
    const wallTop = Math.max(2.8, b.h - roofAllowance);

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
      // Whole window rows stop below the eaves, including short bungalows.
      const storeys = Math.max(1, Math.round(wallTop / 2.8));
      const floorHeight = wallTop / storeys;
      const u0 = 0, u1 = Math.max(1,Math.round(len / tile)), v0 = -1.6 / floorHeight, v1 = storeys;
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
    const addQuad = (p4) => {
      for (const p of p4) rp.push(p[0], p[1], p[2]);
      const ab = new THREE.Vector3(...p4[1]).sub(new THREE.Vector3(...p4[0]));
      const ac = new THREE.Vector3(...p4[2]).sub(new THREE.Vector3(...p4[0]));
      const normal = ab.cross(ac).normalize();
      if (normal.y < 0) normal.multiplyScalar(-1);
      for (let k = 0; k < 4; k++) { rn.push(normal.x, normal.y, normal.z); rc.push(roofColor.r, roofColor.g, roofColor.b); }
      // planar UVs from world x/z so shingle rows stay a constant real-world size
      const wq = Math.hypot(p4[1][0] - p4[0][0], p4[1][2] - p4[0][2]) / 1.6;
      const hq = Math.hypot(p4[3][0] - p4[0][0], p4[3][1] - p4[0][1], p4[3][2] - p4[0][2]) / 1.6;
      ruv.push(0, 0, wq, 0, wq, hq, 0, hq);
      ri.push(rv, rv + 1, rv + 2, rv, rv + 2, rv + 3);
      rv += 4;
    };
    if (isPitched) {
      // Longest footprint edge sets the ridge, preserving each building's mapped
      // orientation instead of snapping every roof to the world axes.
      const ux = roofUx, uz = roofUz;
      const vx = -uz, vz = ux;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const p of pts) {
        const pu = (p[0] - cx) * ux + (p[1] - cz) * uz;
        const pv = (p[0] - cx) * vx + (p[1] - cz) * vz;
        u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
      }
      const spanU = Math.max(3, u1 - u0), spanV = Math.max(3, v1 - v0);
      const ox = cx + ux * (u0 + u1) / 2 + vx * (v0 + v1) / 2;
      const oz = cz + uz * (u0 + u1) / 2 + vz * (v0 + v1) / 2;
      const local = (u, v, y) => [ox + ux * u + vx * v, y, oz + uz * u + vz * v];
      const rh = b.t === 'apartments'
        ? Math.min(1.7, Math.max(0.8, spanV * 0.12))
        : Math.min(2.5, Math.max(1.05, spanV * 0.31));
      const eaveY = topY, ridgeY = topY + rh, ov = 0.35;
      const hu = spanU / 2 + ov, hv = spanV / 2 + ov;
      addQuad([local(-hu, -hv, eaveY), local(hu, -hv, eaveY), local(hu, 0, ridgeY), local(-hu, 0, ridgeY)]);
      addQuad([local(hu, hv, eaveY), local(-hu, hv, eaveY), local(-hu, 0, ridgeY), local(hu, 0, ridgeY)]);
      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      roofGeo.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
      roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
      roofGeo.setIndex(ri);
      sector.roofs.push(roofGeo);

      // fascia board under the eaves + an occasional chimney: breaks the plain box
      const fascia = new THREE.BoxGeometry(spanU + ov * 2, 0.22, spanV + ov * 2);
      fascia.rotateY(Math.atan2(-uz, ux));
      fascia.translate(ox, topY - 0.02, oz);
      tintGeo(fascia, 0.93, 0.92, 0.88);
      sector.trim.push(fascia);
      if (isHouse && random() < 0.22) {
        const chim = new THREE.BoxGeometry(0.7, rh + 1.1, 0.7);
        const t = (random() - 0.5) * spanU * 0.45;
        chim.translate(ox + ux * t, topY + (rh + 1.1) / 2 - 0.2, oz + uz * t);
        tintGeo(chim, 0.55, 0.5, 0.47);
        sector.trim.push(chim);
      }
    } else {
      const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
      const cap = new THREE.ShapeGeometry(shape);
      cap.rotateX(-Math.PI / 2);
      cap.translate(0, gy + b.h + 0.02, 0);
      if (wantsPitched) {
        tintGeo(cap, roofColor.r, roofColor.g, roofColor.b);
        sector.roofs.push(cap);
      } else {
        // flat commercial roofs read as tar/gravel membrane, not house shingles
        const g0 = 0.34 + random() * 0.1;
        tintGeo(cap, g0, g0 * 1.02, g0 * 1.04);
        sector.trim.push(cap);
      }

      // parapet: a low wall ringing the roof edge, so the top isn't a bare slab
      if (!wantsPitched) {
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
          const hx = fx0 + (fx1 - fx0) * (0.25 + random() * 0.5), hz = fz0 + (fz1 - fz0) * (0.25 + random() * 0.5);
          if (!pointInPoly(pts, hx, hz)) continue;
          const box = new THREE.BoxGeometry(1.6 + random() * 1.2, 0.7 + random() * 0.6, 1.4 + random());
          box.translate(hx, gy + b.h + 0.55, hz);
          tintGeo(box, 0.7, 0.71, 0.72);
          sector.trim.push(box);
        }
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
  return { group, buildingGrid, count: placed };
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
