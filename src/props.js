// props.js — trees, streetlights, docks, ferries, gas station, landmark signs, beach clutter
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { recolorFlattened } from './models.js';
import { Grid, rand, choice, clamp, smoothstep, fbm } from './util.js';
import { TEX, streetBlade } from './textures.js';

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  return m;
}

// ---------- trees ----------
// Two species so the verges aren't a row of identical cones: coastal douglas fir and
// a broadleaf. Vertex colours are deliberately dark — bright greens bloom out into
// pale cardboard cut-outs under the post chain.
function tintTree(g, trunkTop, foliage, bark) {
  const pos = g.getAttribute('position');
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const c = y < trunkTop ? bark : foliage;
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function firGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.28, 3.0, 6);
  trunk.translate(0, 1.5, 0);
  parts.push(trunk);
  // uneven tiers read as a real conifer instead of a stacked toy
  const tiers = [[1.8, 3.6, 2.9], [1.5, 3.1, 4.6], [1.12, 2.6, 6.2], [0.7, 2.0, 7.6]];
  tiers.forEach(([r, h, y], i) => {
    const c = new THREE.ConeGeometry(r, h, 7);
    c.rotateY(i * 0.6);
    c.translate((i % 2 ? 0.08 : -0.06), y, (i % 2 ? -0.05 : 0.07));
    parts.push(c);
  });
  const g = mergeGeometries(parts, false);
  return tintTree(g, 2.4, [0.20, 0.30, 0.18], [0.24, 0.19, 0.15]);
}

function broadleafGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3.2, 6);
  trunk.translate(0, 1.6, 0);
  parts.push(trunk);
  for (const [r, x, y, z] of [[1.75, 0, 4.3, 0], [1.25, 1.0, 3.7, 0.5], [1.15, -0.9, 3.9, -0.6], [1.0, 0.2, 5.3, -0.4]]) {
    const b = new THREE.IcosahedronGeometry(r, 0);
    b.scale(1, 0.85, 1);
    b.translate(x, y, z);
    parts.push(b);
  }
  // icosahedra are non-indexed while the trunk is indexed: flatten before merging
  const g = mergeGeometries(parts.map(q => (q.index ? q.toNonIndexed() : q)), false);
  return tintTree(g, 3.0, [0.26, 0.34, 0.16], [0.27, 0.22, 0.17]);
}

export function buildTrees(map, terrain, buildingGrid, corridor = null, cedarAsset = null, avoid = [], treeKit = null) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const MAX = 5200, MAX_LEAF = 1400;
  // authored CC0 trees when the kit is present, procedural cones otherwise
  const kitConifer = treeKit && treeKit.length ? treeKit[0] : null;
  const kitBroadleaf = treeKit && treeKit.length > 1 ? treeKit[1] : null;
  const inst = new THREE.InstancedMesh(kitConifer ? kitConifer.geometry : firGeometry(),
    kitConifer ? kitConifer.material : mat, MAX);
  inst.castShadow = true;
  inst.receiveShadow = false;
  inst.frustumCulled = false;
  const leaf = new THREE.InstancedMesh(kitBroadleaf ? kitBroadleaf.geometry : broadleafGeometry(),
    kitBroadleaf ? kitBroadleaf.material : mat, MAX_LEAF);
  leaf.castShadow = true;
  leaf.receiveShadow = false;
  leaf.frustumCulled = false;
  const kitTinting = !kitConifer;
  let leafCount = 0;
  // authored western redcedar: the hero tree, kept to the stretch the rider can see
  const MAX_CEDAR = 260;
  let cedar = null, cedarCount = 0;
  if (cedarAsset) {
    const cmat = cedarAsset.material.clone();
    cmat.side = THREE.DoubleSide;               // authored fronds are single-sided cards
    cedar = new THREE.InstancedMesh(cedarAsset.geometry, cmat, MAX_CEDAR);
    cedar.castShadow = true;
    cedar.receiveShadow = false;
    cedar.frustumCulled = false;
  }
  const treeGrid = new Grid(16);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const C = new THREE.Color();
  let count = 0;

  const placeable = (x, z, minD = 0) => {
    if (terrain.seaSignedDist(x, z) < 34 + minD) return false;
    // hand-built landmarks (schools, church, forecourts) are not in the OSM building
    // grid, so keep the planting off their lots
    for (const a of avoid) {
      if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) return false;
    }
    const nr = terrain.nearestRoad(x, z);
    if (nr && nr.d < nr.seg.hw + 5.5) return false;
    for (const b of buildingGrid.query(x, z, 8)) {
      if (x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2) return false;
    }
    return true;
  };

  const tryPlace = (x, z, minD = 0) => {
    if (count >= MAX) return;
    const d = terrain.seaSignedDist(x, z);
    if (d < 34 + minD) return;
    const nr = terrain.nearestRoad(x, z);
    if (nr && nr.d < nr.seg.hw + 5.5) return;
    for (const b of buildingGrid.query(x, z, 8)) {
      if (x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2) return;
    }
    const y = terrain.groundHeight(x, z);
    const s = rand(0.75, 1.5);
    P.set(x, y - 0.2, z);
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
    S.set(s, s * rand(0.9, 1.25), s);
    M.compose(P, Q, S);
    // roughly a third broadleaf, and they favour the tended verges over the forest
    const wantLeaf = leafCount < MAX_LEAF && Math.random() < 0.32;
    C.setRGB(rand(0.82, 1.12), rand(0.86, 1.08), rand(0.78, 1.02));
    if (wantLeaf) {
      leaf.setMatrixAt(leafCount, M);
      if (kitTinting) leaf.setColorAt(leafCount, C);
      leafCount++;
    } else {
      inst.setMatrixAt(count, M);
      if (kitTinting) inst.setColorAt(count, C);
      count++;
    }
    treeGrid.insert(x, z, { x, z, r: 0.55 * s, y });
  };

  // scatter in forest polygons (area-weighted)
  const forestPolys = map.green.filter(g => g.k === 'forest');
  const areas = forestPolys.map(g => {
    let a = 0;
    for (let i = 0; i < g.p.length; i++) {
      const p = g.p[i], q = g.p[(i + 1) % g.p.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  });
  const totalArea = areas.reduce((a, b) => a + b, 0) || 1;
  const forestTarget = 3100;
  forestPolys.forEach((g, gi) => {
    const n = Math.floor(areas[gi] / totalArea * forestTarget);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of g.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    for (let i = 0; i < n * 2 && i < 6000; i++) {
      const x = rand(x0, x1), z = rand(z0, z1);
      if (pointInPolyCached(g.p, x, z)) tryPlace(x, z);
    }
  });
  // Newcastle Island + general scatter
  let placed2 = 0;
  while (placed2 < 1600 && count < MAX - 5) {
    const x = rand(850, 3300), z = rand(-2600, 2800);
    if (terrain.seaSignedDist(x, z) > 60 && fbm(x * 0.004, z * 0.004, 3) > 0.38) { tryPlace(x, z); placed2++; }
  }
  // sparse scatter inland near route
  let placed3 = 0;
  while (placed3 < 420 && count < MAX - 5) {
    const x = rand(-3400, 0), z = rand(-1500, 700);
    if (terrain.seaSignedDist(x, z) > 55 && Math.random() < 0.5) { tryPlace(x, z); placed3++; }
  }

  // Stands of second-growth forest that come right down to the shoulder on one side,
  // the way the road runs between subdivisions on Vancouver Island.
  if (corridor) {
    const belts = [[0.16, 0.27], [0.44, 0.53], [0.66, 0.74]];   // fractions along the route
    const cp0 = corridor.pts;
    for (const [f0, f1] of belts) {
      const i0 = Math.floor(cp0.length * f0), i1 = Math.floor(cp0.length * f1);
      const side = 1;                       // the right-hand side as you ride down
      for (let i = i0; i < i1 && count < MAX - 5; i++) {
        const [nx, nz] = corridor.normalAt(i);
        const hw = corridor.hw[i];
        for (let k = 0; k < 5; k++) {
          const off = hw + rand(3.5, 46);
          const jitter = rand(-4, 4);
          const tx = cp0[i][0] + nx * side * off + corridor.tan[i][0] * jitter;
          const tz = cp0[i][1] + nz * side * off + corridor.tan[i][1] * jitter;
          if (!placeable(tx, tz)) continue;
          if (cedar && cedarCount < MAX_CEDAR && Math.random() < 0.18) {
            const y = terrain.groundHeight(tx, tz);
            const sc = rand(0.8, 1.35);
            P.set(tx, y - 0.15, tz);
            Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
            S.set(sc, sc * rand(0.92, 1.2), sc);
            M.compose(P, Q, S);
            cedar.setMatrixAt(cedarCount, M);
            cedarCount++;
            treeGrid.insert(tx, tz, { x: tx, z: tz, r: 0.9 * sc, y });
          } else {
            tryPlace(tx, tz, 0);
          }
        }
      }
    }
  }

  // Boulevard and front-yard planting along the road itself — the route runs through
  // a treed Vancouver Island suburb, and without this the verges read as bare lawn.
  if (corridor) {
    const cp = corridor.pts;
    for (let i = 2; i < cp.length - 2 && count < MAX - 5; i++) {
      const [nx, nz] = corridor.normalAt(i);
      const hw = corridor.hw[i];
      for (const side of [-1, 1]) {
        if (Math.random() > 0.55) continue;
        const off = hw + rand(4.5, 16);
        const tx = cp[i][0] + nx * side * off, tz = cp[i][1] + nz * side * off;
        // every third verge tree is an authored cedar while the budget lasts
        if (cedar && cedarCount < MAX_CEDAR && Math.random() < 0.34 && placeable(tx, tz)) {
          const y = terrain.groundHeight(tx, tz);
          const sc = rand(0.72, 1.25);
          P.set(tx, y - 0.15, tz);
          Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
          S.set(sc, sc * rand(0.92, 1.2), sc);
          M.compose(P, Q, S);
          cedar.setMatrixAt(cedarCount, M);
          cedarCount++;
          treeGrid.insert(tx, tz, { x: tx, z: tz, r: 0.9 * sc, y });
          continue;
        }
        tryPlace(tx, tz, 0);
      }
    }
  }

  inst.count = count;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  leaf.count = leafCount;
  leaf.instanceMatrix.needsUpdate = true;
  if (leaf.instanceColor) leaf.instanceColor.needsUpdate = true;
  if (cedar) {
    cedar.count = cedarCount;
    cedar.instanceMatrix.needsUpdate = true;
  }
  return { inst, leaf, cedar, treeGrid, count: count + leafCount + cedarCount };
}

function pointInPolyCached(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// ---------- streetlights along route ----------
export function buildStreetlights(corridor, terrain) {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.09, 0.13, 7.2, 6);
  pole.translate(0, 3.6, 0);
  parts.push(pole);
  const arm = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5);
  arm.rotateZ(Math.PI / 2);
  arm.translate(0.9, 7.1, 0);
  parts.push(arm);
  const head = new THREE.BoxGeometry(0.65, 0.18, 0.3);
  head.translate(1.7, 7.0, 0);
  parts.push(head);
  const geo = mergeGeometries(parts, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0x50555a, roughness: 0.6, metalness: 0.7 });
  const pts = corridor.pts;
  const spots = [];
  let dist = 0, side = 1;
  for (let i = 1; i < pts.length; i++) {
    dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (dist > 46) {
      dist = 0;
      // no lamps on the beach run-out / ramp chute, and none past the road end
      if (corridor.cum[i] < corridor.total - 110) spots.push({ i, side });
      side = -side;
    }
  }
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach(({ i, side }, k) => {
    // stand just outside the road edge, arm reaching back over the lane
    const [nx, nz] = corridor.normalAt(i);
    const off = corridor.hw[i] + 1.0;
    const px = pts[i][0] + nx * side * off, pz = pts[i][1] + nz * side * off;
    const gy = terrain.groundHeight(px, pz);
    P.set(px, gy, pz);
    // local +x (the arm) must point back toward the road centre
    Q.setFromAxisAngle(up, Math.atan2(nz * side, -nx * side));
    M.compose(P, Q, S);
    inst.setMatrixAt(k, M);
  });
  inst.castShadow = true;
  return inst;
}

// ---------- docks/piers ----------
export function buildPiers(map, terrain) {
  const geos = [];
  const woodMat = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.95 });
  for (const pier of map.piers) {
    const pts = pier.p;
    // keep piers over water
    let ok = false;
    for (const p of pts) if (terrain.seaSignedDist(p[0], p[1]) < 5) ok = true;
    if (!ok) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2) continue;
      const g = new THREE.BoxGeometry(pier.w, 0.35, len);
      g.translate(0, 0, 0);
      const ang = Math.atan2(bx - ax, bz - az);
      g.rotateY(-ang + Math.PI);
      g.translate((ax + bx) / 2, 1.15, (az + bz) / 2);
      geos.push(g);
      // posts
      const steps = Math.floor(len / 5);
      for (let s = 0; s <= steps; s++) {
        const t = s / Math.max(1, steps);
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        const post = new THREE.CylinderGeometry(0.14, 0.16, 4.2, 6);
        post.translate(px, -0.8, pz);
        geos.push(post);
      }
    }
  }
  if (!geos.length) return new THREE.Group();
  const m = new THREE.Mesh(mergeGeometries(geos, false), woodMat);
  m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ---------- BC Ferries ship ----------
export function buildFerry() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x1c3f63, roughness: 0.55, metalness: 0.25 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.6, metalness: 0.1 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x27589a, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.7 });
  const L = 118, W = 19;
  const hull = box(W, 5.2, L, hullMat); hull.position.y = 2.6; g.add(hull);
  const lower = box(W - 0.6, 3.4, L - 8, whiteMat); lower.position.y = 6.8; g.add(lower);
  // window band
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.25, metalness: 0.5 });
  const band = box(W - 0.2, 0.85, L - 12, bandMat); band.position.y = 7.1; g.add(band);
  const upper = box(W - 3.2, 3.0, L * 0.45, whiteMat); upper.position.set(0, 9.9, -L * 0.16); g.add(upper);
  const upperBand = box(W - 3.0, 0.7, L * 0.45 - 3, bandMat); upperBand.position.set(0, 10.2, -L * 0.16); g.add(upperBand);
  const bridge = box(W - 4.5, 2.6, 8, whiteMat); bridge.position.set(0, 12.6, -L * 0.32); g.add(bridge);
  const bridgeGlass = box(W - 4.7, 1.1, 8.3, bandMat); bridgeGlass.position.set(0, 13.0, -L * 0.32); g.add(bridgeGlass);
  const f1 = cyl(1.1, 1.3, 5.4, blueMat, 10); f1.position.set(-3.4, 12.2, L * 0.05); g.add(f1);
  const f2 = cyl(1.1, 1.3, 5.4, blueMat, 10); f2.position.set(3.4, 12.2, L * 0.05); g.add(f2);
  const mast = cyl(0.12, 0.18, 10, darkMat, 6); mast.position.set(0, 16, -L * 0.3); g.add(mast);
  // bow/stern visor
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.01, W / 2, 4.5, 3), hullMat);
  visor.rotation.x = Math.PI / 2;
  visor.rotation.y = Math.PI / 2;
  visor.scale.set(1, 1, 0.9);
  visor.position.set(0, 3.4, -L / 2 - 1.4);
  visor.castShadow = true;
  g.add(visor);
  // waterline red
  const wl = box(W + 0.15, 1.1, L - 2, new THREE.MeshStandardMaterial({ color: 0x8c1f28, roughness: 0.7 }));
  wl.position.y = 0.55; g.add(wl);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- Circle K gas station ----------
export function buildGasStation(pos, heading, terrain) {
  const g = new THREE.Group();
  const gy = terrain.groundHeight(pos[0], pos[1]);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xd6001c, roughness: 0.6 });
  const grayMat = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.85 });

  // concrete pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(34, 0.16, 24), new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.95 }));
  pad.position.y = gy + 0.08; pad.receiveShadow = true;
  g.add(pad);

  // branded materials
  const bandMat = new THREE.MeshStandardMaterial({
    map: TEX.petroBand, roughness: 0.45, emissive: 0xffffff, emissiveMap: TEX.petroBand, emissiveIntensity: 0.30,
  });
  const markMat = new THREE.MeshStandardMaterial({
    map: TEX.petroCanada, transparent: false, roughness: 0.45,
    emissive: 0xffffff, emissiveMap: TEX.petroCanada, emissiveIntensity: 0.35,
  });
  const priceMat = new THREE.MeshStandardMaterial({
    map: TEX.circleKPrice, roughness: 0.5, emissive: 0xffffff, emissiveMap: TEX.circleKPrice, emissiveIntensity: 0.5,
  });
  // decal helper: double-sided plane pinned just off a surface
  const decal = (tex, w, h, x, y, z, ry = 0, emissive = 0.35) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.45, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    m.position.set(x, y, z); m.rotation.y = ry;
    return m;
  };

  // canopy — white deck, red under-fascia, branded band on the long faces
  const canopy = box(22, 1.1, 13, whiteMat); canopy.position.set(0, gy + 6.0, 0); g.add(canopy);
  const stripe = box(22.2, 0.5, 13.2, redMat); stripe.position.set(0, gy + 5.4, 0); g.add(stripe);
  const soffit = box(21.4, 0.12, 12.4, new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.5, emissive: 0x1a1a18 }));
  soffit.position.set(0, gy + 5.16, 0); g.add(soffit);
  // the canopy carries the fuel brand; the store carries Circle K
  for (const [zz, ry] of [[6.62, 0], [-6.62, Math.PI]]) g.add(decal(TEX.petroBand, 20, 1.5, 0, gy + 5.85, zz, ry, 0.45));
  for (const [xx, ry] of [[11.15, Math.PI / 2], [-11.15, -Math.PI / 2]]) g.add(decal(TEX.petroBand, 11.5, 1.5, xx, gy + 5.85, 0, ry, 0.45));
  for (const [px, pz] of [[-9, -5], [-9, 5], [9, -5], [9, 5]]) {
    const post = cyl(0.28, 0.28, 5.6, grayMat, 10);
    post.position.set(px, gy + 2.8, pz); g.add(post);
    const skirt = cyl(0.4, 0.44, 0.9, redMat, 10);
    skirt.position.set(px, gy + 0.6, pz); g.add(skirt);
  }
  // pumps — island kerb, dispenser with screens both sides, nozzles on hoses
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.85 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0d1116, roughness: 0.25, emissive: 0x14304a, emissiveIntensity: 0.6,
  });
  for (const px of [-3.5, 3.5]) {
    // concrete island the two dispensers stand on
    const island = box(2.6, 0.22, 8.4, grayMat);
    island.position.set(px, gy + 0.28, 0); g.add(island);
    for (const pz of [-2.6, 2.6]) {
      const pump = box(0.62, 1.55, 1.5, whiteMat); pump.position.set(px, gy + 1.15, pz); g.add(pump);
      const skirtP = box(0.66, 0.3, 1.54, redMat); skirtP.position.set(px, gy + 0.52, pz); g.add(skirtP);
      const topper = box(0.72, 0.34, 0.9, redMat); topper.position.set(px, gy + 2.05, pz); g.add(topper);
      for (const s of [-1, 1]) {
        // display + keypad facing each side of the island
        const screen = box(0.06, 0.42, 0.62, screenMat);
        screen.position.set(px + s * 0.33, gy + 1.62, pz); g.add(screen);
        const keypad = box(0.05, 0.18, 0.4, darkMat);
        keypad.position.set(px + s * 0.33, gy + 1.3, pz); g.add(keypad);
        // hose loop + nozzle holstered on the flank
        const hose = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.038, 6, 16, Math.PI * 1.3), hoseMat);
        hose.position.set(px + s * 0.36, gy + 1.05, pz + 0.35);
        hose.rotation.set(Math.PI / 2, 0.4 * s, 0);
        g.add(hose);
        const nozzle = box(0.12, 0.34, 0.16, chromeMat);
        nozzle.position.set(px + s * 0.37, gy + 1.12, pz - 0.42);
        nozzle.rotation.z = s * 0.25; g.add(nozzle);
      }
    }
    for (const s of [-1, 1]) {
      const bollard = cyl(0.11, 0.13, 1.0, new THREE.MeshStandardMaterial({ color: 0xe8b423, roughness: 0.8 }), 8);
      bollard.position.set(px, gy + 0.55, s * 4.0); g.add(bollard);
    }
  }
  // store building — white box, red fascia band with the logo, glazed storefront
  const store = box(15, 4.6, 9, whiteMat); store.position.set(0, gy + 2.3, -15); g.add(store);
  const parapet = box(15.4, 0.5, 9.4, whiteMat); parapet.position.set(0, gy + 4.8, -15); g.add(parapet);
  const awning = box(15.6, 0.4, 3.2, redMat); awning.position.set(0, gy + 3.6, -10); g.add(awning);
  g.add(decal(TEX.circleKBand, 12.5, 1.7, 0, gy + 4.05, -10.42, 0, 0.5));   // fascia logo, faces the pumps
  const storefront = box(11, 2.4, 0.2, new THREE.MeshStandardMaterial({
    map: TEX.storefront, roughness: 0.25, metalness: 0.3, emissive: 0xffffff, emissiveMap: TEX.storefront, emissiveIntensity: 0.45,
  }));
  storefront.position.set(0, gy + 1.8, -10.44); g.add(storefront);
  g.add(decal(TEX.circleK, 2.2, 2.2, -6.2, gy + 2.6, -10.46, 0, 0.4));      // door-side window decal
  // big pole sign — branded cabinet on both faces + fuel price panel
  const pole = cyl(0.3, 0.34, 9.5, grayMat, 10); pole.position.set(13, gy + 4.75, 8); g.add(pole);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 0.35), [grayMat, grayMat, grayMat, grayMat, markMat, markMat]);
  sign.position.set(13, gy + 9.6, 8); g.add(sign);
  sign.rotation.y = heading;
  const price = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.9, 0.3), [grayMat, grayMat, grayMat, grayMat, priceMat, priceMat]);
  price.position.set(13, gy + 7.2, 8); price.rotation.y = heading; g.add(price);
  // roadside monument sign so the brand reads from the road too
  const ckBandMat = new THREE.MeshStandardMaterial({
    map: TEX.circleKBand, roughness: 0.45, emissive: 0xffffff, emissiveMap: TEX.circleKBand, emissiveIntensity: 0.3,
  });
  const mon = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.5, 0.3), [grayMat, grayMat, grayMat, grayMat, ckBandMat, ckBandMat]);
  mon.position.set(-13.5, gy + 1.5, 9.5); g.add(mon);
  const monBase = box(4.8, 1.0, 0.6, grayMat); monBase.position.set(-13.5, gy + 0.5, 9.5); g.add(monBase);

  g.position.set(pos[0], 0, pos[1]);
  g.rotation.y = heading;
  return g;
}

// ---------- 7-Eleven (real Departure Bay branch, by the beach) ----------
export function buildSevenEleven(spot, terrain, heading = 0) {
  const g = new THREE.Group();
  const [px, pz] = spot.p;
  const gy = terrain.groundHeight(px, pz);
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.7 });
  const gray = new THREE.MeshStandardMaterial({ color: 0x8d9297, roughness: 0.8 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9b6f57, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.85 });

  // footprint size from the real OSM polygon, so the store sits on its actual pad
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const q of spot.poly) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  // the OSM way covers the whole parcel; the store itself is a normal convenience box
  // a real 7-Eleven is a small roadside box, not a warehouse
  const bw = clamp(x1 - x0, 14, 18), bd = clamp(z1 - z0, 10, 12.5), bh = 3.9;

  const pad = new THREE.Mesh(new THREE.BoxGeometry(bw + 20, 0.16, bd + 18),
    new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.95 }));
  pad.position.set(0, gy + 0.08, 0); pad.receiveShadow = true; g.add(pad);

  const store = box(bw, bh, bd, white); store.position.set(0, gy + bh / 2, 0); g.add(store);
  const base = box(bw + 0.1, 1.1, bd + 0.1, brick); base.position.set(0, gy + 0.55, 0); g.add(base);
  const parapet = box(bw + 0.5, 0.7, bd + 0.5, white); parapet.position.set(0, gy + bh + 0.3, 0); g.add(parapet);

  const bandMat = new THREE.MeshStandardMaterial({
    map: TEX.sevenBand, roughness: 0.45, emissive: 0xffffff, emissiveMap: TEX.sevenBand, emissiveIntensity: 0.35,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const bandFront = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.82, 1.5), bandMat);
  bandFront.position.set(0, gy + bh + 0.25, bd / 2 + 0.3); g.add(bandFront);
  const bandSide = new THREE.Mesh(new THREE.PlaneGeometry(bd * 0.8, 1.4), bandMat);
  bandSide.position.set(bw / 2 + 0.3, gy + bh + 0.25, 0); bandSide.rotation.y = Math.PI / 2; g.add(bandSide);

  // glazed shopfront under a slim canopy
  const glassMat = new THREE.MeshStandardMaterial({
    map: TEX.storefront, roughness: 0.25, metalness: 0.3,
    emissive: 0xffffff, emissiveMap: TEX.storefront, emissiveIntensity: 0.5,
  });
  const glass = box(bw * 0.78, 2.5, 0.2, glassMat);
  glass.position.set(0, gy + 1.9, bd / 2 + 0.06); g.add(glass);
  const canopy = box(bw * 0.9, 0.3, 1.8, white);
  canopy.position.set(0, gy + 3.4, bd / 2 + 0.9); g.add(canopy);
  for (const s of [-1, 1]) {
    const post = cyl(0.08, 0.08, 3.3, gray, 8);
    post.position.set(s * bw * 0.4, gy + 1.65, bd / 2 + 1.6); g.add(post);
  }

  // pole sign facing the road + a bollard row along the front
  const pole = cyl(0.26, 0.3, 7.5, gray, 10);
  pole.position.set(-bw / 2 - 5, gy + 3.75, bd / 2 + 3); g.add(pole);
  const signMat = new THREE.MeshStandardMaterial({
    map: TEX.sevenEleven, roughness: 0.45, emissive: 0xffffff, emissiveMap: TEX.sevenEleven, emissiveIntensity: 0.45,
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.3),
    [gray, gray, gray, gray, signMat, signMat]);
  sign.position.set(-bw / 2 - 5, gy + 8.4, bd / 2 + 3); g.add(sign);
  for (let i = -3; i <= 3; i++) {
    const b = cyl(0.11, 0.13, 0.95, new THREE.MeshStandardMaterial({ color: 0xe0b32c, roughness: 0.8 }), 8);
    b.position.set(i * 1.9, gy + 0.48, bd / 2 + 2.4); g.add(b);
  }
  // dumpster corral + a couple of parking stalls' worth of curb
  const bin = box(2.2, 1.4, 1.4, dark); bin.position.set(bw / 2 - 2, gy + 0.7, -bd / 2 - 2.4); g.add(bin);

  g.position.set(px, 0, pz);
  g.rotation.y = heading;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- junction furniture: real street-name blades + stop signs ----------
export function buildJunctionSigns(map, corridor, terrain) {
  const group = new THREE.Group();
  if (!map.junctions) return group;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b7075, roughness: 0.65, metalness: 0.5 });
  const seen = new Set();

  for (const j of map.junctions) {
    const name = j.n;
    if (!name || /^\(/.test(name)) continue;              // unnamed service roads: no blade
    const pr = corridor.projectExact(j.p[0], j.p[1]);
    if (pr.dist > 30 || pr.s > corridor.total) continue;   // off the race section
    const key = name + '|' + (pr.i / 6 | 0);
    if (seen.has(key)) continue;
    seen.add(key);

    const [nx, nz] = corridor.normalAt(pr.i);
    const tan = corridor.tan[pr.i];
    const side = pr.lat >= 0 ? 1 : -1;
    const cx = corridor.pts[pr.i][0] + nx * side * (pr.hw + 1.6);
    const cz = corridor.pts[pr.i][1] + nz * side * (pr.hw + 1.6);
    const gy = terrain.groundHeight(cx, cz);

    const pole = cyl(0.055, 0.06, 3.4, poleMat, 6);
    pole.position.set(cx, gy + 1.7, cz);
    group.add(pole);

    // green blade, aligned with the side road it names. Two single-sided faces
    // back to back: a DoubleSide plane shows the text mirrored from behind.
    const bladeMat = new THREE.MeshStandardMaterial({ map: streetBlade(name), roughness: 0.6 });
    const bladeAng = Math.atan2(tan[0], tan[1]) + Math.PI / 2;
    for (const flip of [0, Math.PI]) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), bladeMat);
      blade.position.set(cx, gy + 3.3, cz);
      blade.rotation.y = bladeAng + flip;
      group.add(blade);
    }

  }
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// ---------- real signals, stop signs, crosswalks and lamps (from OSM) ----------
export function buildTrafficFurniture(map, corridor, terrain) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.6, metalness: 0.55 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x2b3033, roughness: 0.7 });
  const lens = (hex, glow) => new THREE.MeshStandardMaterial({
    color: hex, roughness: 0.3, emissive: hex, emissiveIntensity: glow,
  });
  const red = lens(0xd8242b, 0.9), amber = lens(0xe8a11c, 0.12), green = lens(0x2fbf5b, 0.12);
  const stopFace = new THREE.MeshStandardMaterial({ color: 0xcf2027, roughness: 0.55, emissive: 0x2a0507 });
  const stopEdge = new THREE.MeshStandardMaterial({ color: 0xa4181e, roughness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({
    color: 0xf2f2ee, roughness: 0.85,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });

  const tangentAt = (p) => {
    const pr = corridor.projectExact(p[0], p[1]);
    return { tan: corridor.tan[pr.i], n: corridor.normalAt(pr.i), hw: pr.hw, d: pr.dist, i: pr.i };
  };

  // --- signal heads on mast arms over the road ---
  for (const p of map.signals || []) {
    const { tan, n, hw, d } = tangentAt(p);
    if (d > 45) continue;
    const gy = terrain.groundHeight(p[0], p[1]);
    for (const side of [-1, 1]) {
      const bx = p[0] + n[0] * side * (hw + 0.8), bz = p[1] + n[1] * side * (hw + 0.8);
      const bgy = terrain.groundHeight(bx, bz);
      const mast = cyl(0.11, 0.14, 6.4, poleMat, 8);
      mast.position.set(bx, bgy + 3.2, bz);
      group.add(mast);
      // arm reaching out over the lane
      const armLen = Math.min(7.5, hw);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, armLen, 8), poleMat);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = Math.atan2(-n[0] * side, -n[1] * side) + Math.PI / 2;
      arm.position.set(bx - n[0] * side * armLen / 2, bgy + 6.2, bz - n[1] * side * armLen / 2);
      group.add(arm);
      // head hanging at the end of the arm, facing oncoming traffic
      const hx = bx - n[0] * side * armLen, hz = bz - n[1] * side * armLen;
      const head = box(0.4, 1.15, 0.34, boxMat);
      head.position.set(hx, bgy + 5.5, hz);
      head.rotation.y = Math.atan2(tan[0] * side, tan[1] * side);
      group.add(head);
      const facing = new THREE.Vector3(tan[0] * side * 0.19, 0, tan[1] * side * 0.19);
      for (let k = 0; k < 3; k++) {
        // spherical lenses: no orientation to get wrong, and they read at distance
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), [red, amber, green][k]);
        l.position.set(hx + facing.x, bgy + 5.9 - k * 0.36, hz + facing.z);
        group.add(l);
      }
    }
  }

  // --- stop signs: OSM maps them as nodes ON the carriageway, so shift each one out
  // to the shoulder it actually stands on ---
  for (const p of map.stops || []) {
    const { n, hw, d, i } = tangentAt(p);
    if (d > 45) continue;
    const side = Math.sign((p[0] - corridor.pts[i][0]) * n[0] + (p[1] - corridor.pts[i][1]) * n[1]) || 1;
    const sx = corridor.pts[i][0] + n[0] * side * (hw + 1.3);
    const sz = corridor.pts[i][1] + n[1] * side * (hw + 1.3);
    const gy = terrain.groundHeight(sx, sz);
    const pole = cyl(0.05, 0.055, 2.3, poleMat, 6);
    pole.position.set(sx, gy + 1.15, sz);
    group.add(pole);
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8), [stopEdge, stopFace, stopFace]);
    sign.rotation.x = Math.PI / 2;
    sign.position.set(sx, gy + 2.2, sz);
    group.add(sign);
  }

  // --- painted crosswalks across the real crossing points ---
  const stripes = [];
  for (const p of map.crossings || []) {
    const { tan, n, hw, d } = tangentAt(p);
    if (d > 26) continue;
    const bars = 7;
    for (let b = 0; b < bars; b++) {
      const t = (b / (bars - 1) - 0.5) * (hw * 1.5);
      const bx = p[0] + n[0] * t, bz = p[1] + n[1] * t;
      const g = new THREE.BoxGeometry(0.55, 0.03, 3.0);
      g.rotateY(Math.atan2(tan[0], tan[1]));
      // the deck, not groundHeight(): the ground is carved 0.4 m under the asphalt
      g.translate(bx, terrain.surfaceHeight(bx, bz) + 0.02, bz);
      stripes.push(g);
    }
  }
  if (stripes.length) {
    const m = new THREE.Mesh(mergeGeometries(stripes, false), paint);
    m.receiveShadow = true;
    group.add(m);
  }

  group.traverse(o => { if (o.isMesh && !o.material.polygonOffset) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// ---------- road edges: curb + sidewalk through town, guardrail where it belongs ----------
// Departure Bay Road is a curbed suburban arterial, not a barriered raceway, so the
// containment edge is dressed as real roadside: concrete curb and walk, with steel
// W-beam only where the shoulder actually drops away or the water is close.
export function buildRoadEdges(corridor, terrain) {
  const group = new THREE.Group();
  const curbGeos = [], walkGeos = [], railGeos = [], postGeos = [], poleGeos = [];
  const pts = corridor.pts;

  const needsRail = (x, z) => {
    const gy = terrain.groundHeight(x, z);
    let drop = 0;
    for (const d of [3, 6]) {
      for (const [ox, oz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        drop = Math.max(drop, gy - terrain.groundHeight(x + ox, z + oz));
      }
    }
    return drop > 1.3 || terrain.seaSignedDist(x, z) < 45;
  };

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 1; i < pts.length; i++) {
      const a = corridor.edgePoint(i - 1, side);
      const c = corridor.edgePoint(i, side);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.4) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      // leave a gap where the rail is deliberately open (the church entrance) —
      // a curb the bike drives straight through looks like a bug
      if (corridor.inOpenZone(mx, mz)) continue;
      const gyA = terrain.groundHeight(a[0], a[1]);
      const gyC = terrain.groundHeight(c[0], c[1]);
      const midY = (gyA + gyC) / 2;
      const ang = Math.atan2(c[0] - a[0], c[1] - a[1]);
      const [nx, nz] = corridor.normalAt(i);

      // curb face
      const curb = new THREE.BoxGeometry(0.34, 0.3, len + 0.2);
      curb.rotateY(ang);
      curb.translate(mx, midY + 0.12, mz);
      curbGeos.push(curb);
      // sidewalk slab just outside the curb
      const walk = new THREE.BoxGeometry(1.7, 0.16, len + 0.2);
      walk.rotateY(ang);
      walk.translate(mx + nx * side * 1.0, midY + 0.2, mz + nz * side * 1.0);
      walkGeos.push(walk);

      if (needsRail(mx, mz)) {
        for (const [hy, th] of [[0.86, 0.26], [0.6, 0.2]]) {
          const rail = new THREE.BoxGeometry(0.1, th, len + 0.25);
          rail.rotateY(ang);
          rail.translate(mx + nx * side * 1.9, midY + hy, mz + nz * side * 1.9);
          railGeos.push(rail);
        }
        if (i % 3 === 0) {
          const post = new THREE.BoxGeometry(0.14, 1.05, 0.14);
          post.translate(c[0] + nx * side * 1.9, gyC + 0.45, c[1] + nz * side * 1.9);
          postGeos.push(post);
        }
      } else if (side > 0 && i % 14 === 0) {
        // hydro pole line on one side, the way the real street is strung
        const px = c[0] + nx * side * 2.6, pz = c[1] + nz * side * 2.6;
        // a pole standing in a side road reads as a mistake — skip those spots
        const onRoad = terrain.nearestRoad(px, pz);
        if (onRoad && onRoad.d < onRoad.seg.hw + 1.2) continue;
        const pgy = terrain.groundHeight(px, pz);
        const pole = new THREE.CylinderGeometry(0.16, 0.21, 10.5, 7);
        pole.translate(px, pgy + 5.2, pz);
        poleGeos.push(pole);
        const arm = new THREE.BoxGeometry(2.0, 0.14, 0.14);
        arm.rotateY(ang);
        arm.translate(px, pgy + 9.6, pz);
        poleGeos.push(arm);
      }
    }
  }

  const add = (geos, mat, shadow = true) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
  };
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.95, metalness: 0 });
  const walkMat = new THREE.MeshStandardMaterial({ map: TEX.concrete, color: 0xd8d5cd, roughness: 0.95 });
  add(curbGeos, concrete);
  add(walkGeos, walkMat);
  add(railGeos, new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.75 }));
  add(postGeos, new THREE.MeshStandardMaterial({ color: 0x54595e, roughness: 0.7, metalness: 0.4 }));
  add(poleGeos, new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.95 }));
  return group;
}

// ---------- generic pylon sign ----------
export function pylonSign(pos, tex, terrain, w = 8, h = 4, poleH = 11, heading = 0) {
  const g = new THREE.Group();
  const gy = terrain.groundHeight(pos[0], pos[1]);
  const grayMat = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.7 });
  const pole = cyl(0.32, 0.4, poleH, grayMat, 8); pole.position.set(pos[0], gy + poleH / 2, pos[1]); g.add(pole);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0x111111 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  sign.position.set(pos[0], gy + poleH + h / 2 - 1.2, pos[1]);
  sign.rotation.y = heading;
  g.add(sign);
  const back = sign.clone();
  back.rotation.y = heading + Math.PI;
  g.add(back);
  return g;
}

// ---------- beach clutter ----------
export function buildBeachClutter(terrain, center, radius) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1, flatShading: true });
  const geosW = [], geosR = [];
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), r = rand(15, radius);
    const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r;
    const d = terrain.seaSignedDist(x, z);
    if (d < 3 || d > 30) continue;
    const y = terrain.groundHeight(x, z);
    const log = new THREE.CylinderGeometry(rand(0.28, 0.45), rand(0.3, 0.5), rand(2.5, 5), 7);
    log.rotateZ(Math.PI / 2 + rand(-0.2, 0.2));
    log.rotateY(rand(0, 6.28));
    log.translate(x, y + 0.35, z);
    geosW.push(log);
  }
  for (let i = 0; i < 22; i++) {
    const a = rand(0, Math.PI * 2), r = rand(10, radius);
    const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r;
    const d = terrain.seaSignedDist(x, z);
    if (d < 2 || d > 34) continue;
    const y = terrain.groundHeight(x, z);
    const s = rand(0.3, 1.4);
    const rock = new THREE.DodecahedronGeometry(s, 0);
    rock.scale(1, rand(0.5, 0.8), rand(0.7, 1.1));
    rock.rotateY(rand(0, 6.28));
    rock.translate(x, y + s * 0.25, z);
    geosR.push(rock);
  }
  if (geosW.length) {
    const m = new THREE.Mesh(mergeGeometries(geosW, false), woodMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  if (geosR.length) {
    const m = new THREE.Mesh(mergeGeometries(geosR, false), rockMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// ---------- a roadside reader board, the kind every school and church has ----------
// Returns { group, crossing } — crossing is the point on the road the sign faces,
// which the school zone uses for its crosswalk and its kids.
export function buildReaderBoard(corridor, terrain, anchorPos, tex, opts = {}) {
  const g = new THREE.Group();
  // projectExact, not project(): the cached window guesses wrong for build-time
  // queries that arrive in arbitrary order, and a sign's little roof ends up over
  // some other stretch of road entirely.
  const pr = corridor.projectExact(anchorPos[0], anchorPos[1]);
  const i = pr.i;
  const [nx, nz] = corridor.normalAt(i);
  const tan = corridor.tan[i];
  const side = Math.sign(pr.lat) || 1;
  const base = corridor.pts[i];
  const out = corridor.hw[i] + (opts.setback ?? 4.2);
  const px = base[0] + nx * side * out, pz = base[1] + nz * side * out;
  const gy = terrain.groundHeight(px, pz);
  const w = opts.width ?? 7.4, ph = opts.height ?? 3.3;

  const post = new THREE.MeshStandardMaterial({ color: opts.postColor ?? 0x6b5a45, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: opts.trimColor ?? 0x2c3a30, roughness: 0.75 });
  const faceAng = Math.atan2(nx * side, nz * side);
  const put = (mesh, along, y, offOut = 0) => {
    mesh.position.set(px + tan[0] * along + nx * side * offOut, y, pz + tan[1] * along + nz * side * offOut);
    mesh.rotation.y = faceAng;
    g.add(mesh);
    return mesh;
  };
  put(box(w + 1.0, 0.9, 1.2, post), 0, gy + 0.45);                 // low plinth
  for (const s of [-1, 1]) put(box(0.55, ph + 1.6, 0.9, post), s * (w / 2 + 0.3), gy + (ph + 1.6) / 2);
  put(box(w, ph, 0.42, trim), 0, gy + 0.9 + ph / 2);
  const capH = 0.5;
  put(box(w + 1.4, capH, 1.3, trim), 0, gy + 0.9 + ph + capH / 2); // little roof

  const signMat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.4,
  });
  for (const flip of [0, Math.PI]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, ph - 0.35), signMat);
    const o = flip ? -0.28 : 0.28;
    panel.position.set(px + nx * side * o, gy + 0.9 + ph / 2, pz + nz * side * o);
    panel.rotation.y = faceAng + flip;
    g.add(panel);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, crossing: [base[0], base[1]], index: i, side };
}

// ---------- an elementary school: landmark block + school zone ----------
// Both schools on the route are the same 1970s sprawl — single-storey ranges around a
// gym, a reader board out at the kerb and a painted crossing in front of it — so they
// come off one builder and differ only in colours, name board and how far back the
// site sits. Returns { group, crossing } — crossing is the point on the road the kids
// shuttle across.
export function buildElementarySchool(map, corridor, terrain, opts = {}) {
  const pos = opts.pos || [-2360, -1410];
  const g = new THREE.Group();
  const [px, pz] = pos;
  const gy = terrain.groundHeight(px, pz);
  const pr = corridor.projectExact(px, pz);
  const [nx, nz] = corridor.normalAt(pr.i);
  const side = Math.sign(pr.lat) || 1;
  const tan = corridor.tan[pr.i];
  const faceAng = Math.atan2(-nx * side, -nz * side);       // front toward the road

  const brick = new THREE.MeshStandardMaterial({ color: opts.brick ?? 0xa8593f, roughness: 0.92 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe6dfcd, roughness: 0.85 });
  const green = new THREE.MeshStandardMaterial({ color: opts.band ?? 0x1d5b3a, roughness: 0.7 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x585d62, roughness: 0.9, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27414f, roughness: 0.2, metalness: 0.5 });

  const put = (mesh, ax, ay, az) => {
    // ax across the frontage, az back from the road
    mesh.position.set(px + tan[0] * ax - nx * side * az, ay, pz + tan[1] * ax - nz * side * az);
    mesh.rotation.y = faceAng;
    g.add(mesh);
    return mesh;
  };
  // single-storey ranges around a gym, the way these 1970s elementary schools sprawl
  put(box(46, 5.4, 15, cream), 0, gy + 2.7, 16);
  put(box(46.4, 0.7, 15.4, roofM), 0, gy + 5.7, 16);
  put(box(22, 7.6, 18, brick), -30, gy + 3.8, 20);            // gym
  put(box(22.4, 0.8, 18.4, roofM), -30, gy + 7.9, 20);
  put(box(18, 4.6, 12, cream), 26, gy + 2.3, 14);             // kindergarten wing
  put(box(18.4, 0.7, 12.4, roofM), 26, gy + 4.9, 14);
  put(box(46.6, 1.1, 15.6, green), 0, gy + 1.2, 16);          // colour band
  for (let i = -2; i <= 2; i++) put(box(7.2, 1.6, 0.3, glass), i * 8.6, gy + 3.4, 8.6);
  // covered entry
  put(box(9, 0.4, 4, green), 6, gy + 4.4, 7.2);
  for (const s of [-1, 1]) put(cyl(0.16, 0.16, 4.2, cream, 8), 6 + s * 4, gy + 2.1, 5.6);
  // playground: a little climbing frame and a ball court
  const court = new THREE.Mesh(new THREE.BoxGeometry(26, 0.12, 18),
    new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.95 }));
  put(court, 30, gy + 0.06, 34);
  for (const s of [-1, 1]) {
    const hoop = cyl(0.09, 0.09, 3.2, new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.6 }), 6);
    put(hoop, 30 + s * 11, gy + 1.6, 34);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // the reader board out on the road, and the crossing it guards
  const board = buildReaderBoard(corridor, terrain, pos, opts.tex || TEX.rockCity, {
    width: 7.8, height: 3.4, postColor: 0x6b5a45, trimColor: opts.band ?? 0x1d5b3a, setback: 3.6,
  });
  g.add(board.group);

  // painted school crossing across the corridor, plus zone signs on both approaches
  const paint = new THREE.MeshStandardMaterial({
    color: 0xf6f4ec, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const ci = board.index;
  const cbase = corridor.pts[ci];
  const hw = corridor.hw[ci];
  const stripes = [];
  const ctan = corridor.tan[ci];
  const [cnx, cnz] = corridor.normalAt(ci);
  for (let b = 0; b < 9; b++) {
    // ladder bars spread across the road, oriented by the corridor AT the crossing —
    // the school sits 90 m back off the road, and borrowing its tangent skewed the
    // whole crossing sideways.
    const t = (b / 8 - 0.5) * (hw * 1.7);
    const bx = cbase[0] + cnx * t, bz = cbase[1] + cnz * t;
    const bar = new THREE.BoxGeometry(0.62, 0.04, 3.4);
    bar.rotateY(Math.atan2(ctan[0], ctan[1]));
    bar.translate(bx, terrain.surfaceHeight(bx, bz) + 0.02, bz);
    stripes.push(bar);
  }
  const zebra = new THREE.Mesh(mergeGeometries(stripes, false), paint);
  zebra.receiveShadow = true;
  g.add(zebra);

  // SLOW / children-crossing signs on both approaches, on both kerbs: the fluorescent
  // diamond with the two kids on it, and the SLOW tab bolted underneath. A rider
  // coming down the hill has to be told before the crossing, not at it.
  const diaMat = new THREE.MeshStandardMaterial({
    map: TEX.slowChildren, roughness: 0.55,
    emissive: 0xffffff, emissiveMap: TEX.slowChildren, emissiveIntensity: 0.35,
  });
  const tabMat = new THREE.MeshStandardMaterial({
    map: TEX.slowTab, roughness: 0.55,
    emissive: 0xffffff, emissiveMap: TEX.slowTab, emissiveIntensity: 0.35,
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.6, metalness: 0.5 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x8b9095, roughness: 0.7, metalness: 0.3 });
  for (const s of [-1, 1]) {
    for (const kerb of [-1, 1]) {
      const along = s * 34;
      const sx = cbase[0] + ctan[0] * along + cnx * kerb * (hw + 1.4);
      const sz = cbase[1] + ctan[1] * along + cnz * kerb * (hw + 1.4);
      const sgy = terrain.groundHeight(sx, sz);
      const pole = cyl(0.05, 0.055, 3.4, poleMat, 6);
      pole.position.set(sx, sgy + 1.7, sz);
      g.add(pole);
      // A sign faces the traffic that is still coming at it: the one before the
      // crossing looks back up the road, the one past it looks the other way for
      // oncoming. A plane's face is its +z, so the heading IS the way it looks —
      // negating it turned both panels around and showed the rider their backs.
      const face = Math.atan2(ctan[0] * s, ctan[1] * s);
      // grey backing plates, so from behind a sign is the back of a sign
      const panel = (geo, mat, y, roll) => {
        const front = new THREE.Mesh(geo, mat);
        front.position.set(sx, y, sz);
        front.rotation.y = face;
        front.rotation.z = roll;
        g.add(front);
        const back = new THREE.Mesh(geo, backMat);
        back.position.set(sx - Math.sin(face) * 0.03, y, sz - Math.cos(face) * 0.03);
        back.rotation.y = face + Math.PI;
        back.rotation.z = -roll;
        g.add(back);
      };
      panel(new THREE.PlaneGeometry(1.15, 1.15), diaMat, sgy + 2.85, Math.PI / 4);
      panel(new THREE.PlaneGeometry(1.0, 0.5), tabMat, sgy + 1.95, 0);
    }
  }

  return { group: g, crossing: [cbase[0], cbase[1]], index: ci, side: board.side };
}

// Rock City Elementary, up by the saddle
export function buildRockCitySchool(map, corridor, terrain, pos = [-2360, -1410]) {
  return buildElementarySchool(map, corridor, terrain, { pos, tex: TEX.rockCity });
}

// Departure Bay Elementary, down where the road flattens out toward the bay
// (OSM way 531410514, the school site off the water side of Departure Bay Road)
export function buildDepartureBaySchool(map, corridor, terrain, pos = [-966.58, -1270.75]) {
  return buildElementarySchool(map, corridor, terrain, {
    pos, tex: TEX.departureBay, band: 0x1d4e6b, brick: 0x9a6a4a,
  });
}

// ---------- Departure Bay Baptist Church, mid-party ----------
// The church throws a lawn party on the water side of the road: bouncy castles, the
// congregation in white tearing around them, and Jesus himself out on the grass.
// Returns { group, crossing, party, castles } — `party` is the lawn centre the crowd
// circulates around, `castles` are trampolines the rider can launch off.
export function buildBaptistChurch(corridor, terrain, anchorPos, opts = {}) {
  const g = new THREE.Group();
  const pr = corridor.projectExact(anchorPos[0], anchorPos[1]);
  const i = pr.i;
  const [nx, nz] = corridor.normalAt(i);
  const tan = corridor.tan[i];
  const side = Math.sign(pr.lat) || 1;
  const base = corridor.pts[i];
  const hw = corridor.hw[i];
  // out from the kerb onto the lawn
  const at = (along, out) => [
    base[0] + tan[0] * along + nx * side * (hw + out),
    base[1] + tan[1] * along + nz * side * (hw + out),
  ];
  const faceAng = Math.atan2(nx * side, nz * side);

  const white = new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 0.82 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2f4a63, roughness: 0.7 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x4a5259, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27414f, roughness: 0.2, metalness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 0.35, metalness: 0.8, emissive: 0x2a1e05 });

  const put = (mesh, along, out, yOff) => {
    const [x, z] = at(along, out);
    mesh.position.set(x, terrain.groundHeight(x, z) + yOff, z);
    mesh.rotation.y = faceAng;
    g.add(mesh);
    return mesh;
  };

  // Nave, gabled roof and a squat bell tower — the plain west-coast Baptist shape.
  // The whole building sits down the frontage from the driveway, or the only way onto
  // the lawn runs straight through the sanctuary.
  const CH = -36;                                          // church centre, along the road
  const nave = put(box(26, 6.4, 14, white), CH, 34, 3.2);
  put(box(26.6, 0.8, 14.6, roofM), CH, 34, 6.8);
  put(box(27, 1.0, 3.0, roofM), CH, 34, 7.5);
  const tower = put(box(7.5, 11, 7.5, white), CH + 18, 30, 5.5);   // tower
  put(box(8, 0.7, 8, roofM), CH + 18, 30, 11.2);
  put(box(0.5, 3.0, 0.5, gold), CH + 18, 30, 13.1);        // cross
  put(box(2.2, 0.5, 0.5, gold), CH + 18, 30, 13.6);
  for (let k = -2; k <= 2; k++) put(box(2.0, 3.0, 0.3, glass), CH + k * 5, 27.2, 3.6);
  put(box(3.4, 3.6, 0.4, trim), CH, 27.0, 1.8);            // doors
  put(box(9, 0.35, 4, trim), CH, 25.4, 4.0);               // entry canopy
  for (const sgn of [-1, 1]) put(cyl(0.14, 0.14, 4.0, white, 8), CH + sgn * 4, 24.0, 2.0);

  // ---- the party on the lawn ----
  const [lx, lz] = at(6, 62);                               // lawn centre, straight out
  // A gravel apron off the kerb, so the way in reads as a way in. The corridor gets a
  // matching open zone in main.js — the guardrail has to let go here or the lawn (and
  // the castles on it) can never be reached.
  // One ribbon, vertices sampled off the terrain: a run of flat slabs turns into a
  // staircase the moment the verge rolls.
  const APRON_STEPS = 40, APRON_HW = 5.5;
  const apronPos = [], apronNorm = [], apronUV = [], apronIdx = [];
  for (let k = 0; k <= APRON_STEPS; k++) {
    const out = -2 + 66 * (k / APRON_STEPS);
    const [ax, az] = at(6, out);
    for (const sgn of [-1, 1]) {
      const px = ax + tan[0] * sgn * APRON_HW, pz = az + tan[1] * sgn * APRON_HW;
      apronPos.push(px, terrain.groundHeight(px, pz) + 0.06, pz);
      apronNorm.push(0, 1, 0);
      apronUV.push(sgn > 0 ? 1 : 0, out / 6);
    }
    if (k < APRON_STEPS) {
      const a = k * 2;
      apronIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const apronGeo = new THREE.BufferGeometry();
  apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(apronPos, 3));
  apronGeo.setAttribute('normal', new THREE.Float32BufferAttribute(apronNorm, 3));
  apronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(apronUV, 2));
  apronGeo.setIndex(apronIdx);
  const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({
    map: TEX.concrete, color: 0xbcb5a6, roughness: 0.98,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  apron.receiveShadow = true;
  g.add(apron);
  const lawnY = terrain.groundHeight(lx, lz);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(30, 28),
    new THREE.MeshStandardMaterial({ color: 0x6f9a4d, roughness: 0.95 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(lx, lawnY + 0.04, lz);
  lawn.receiveShadow = true;
  g.add(lawn);
  // The disc is flat and the ground under it is not, so anybody standing at
  // terrain height inside it stands *under* it. Hand the platform out and the
  // pedestrian system can put the party on top of the lawn it is drawn on.
  const lawnPlatform = { x: lx, z: lz, r: 30, y: lawnY + 0.04 };

  // bunting strung between poles round the lawn
  const buntCols = [0xd6202c, 0xffd23f, 0x2f8fd6, 0x3f8f57, 0xffffff];
  const poles = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = lx + Math.cos(a) * 26, pz = lz + Math.sin(a) * 26;
    const pgy = terrain.groundHeight(px, pz);
    const pole = cyl(0.09, 0.11, 5.0, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }), 6);
    pole.position.set(px, pgy + 2.5, pz);
    g.add(pole);
    poles.push([px, pgy + 4.4, pz]);
  }
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x413a30, roughness: 0.9 });
  const cords = [];
  for (let k = 0; k < poles.length; k++) {
    const a = poles[k], b = poles[(k + 1) % poles.length];
    // a catenary in eight straight hops: without the cord the flags read as confetti
    const sagAt = (t) => Math.sin(t * Math.PI) * 1.1;
    for (let seg = 0; seg < 8; seg++) {
      const t0 = seg / 8, t1 = (seg + 1) / 8;
      const p0 = new THREE.Vector3(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - sagAt(t0), a[2] + (b[2] - a[2]) * t0);
      const p1 = new THREE.Vector3(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - sagAt(t1), a[2] + (b[2] - a[2]) * t1);
      const dir = new THREE.Vector3().subVectors(p1, p0);
      const cord = new THREE.CylinderGeometry(0.025, 0.025, dir.length(), 4);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      cord.applyQuaternion(q);
      cord.translate(p0.x + dir.x / 2, p0.y + dir.y / 2, p0.z + dir.z / 2);
      cords.push(cord);
    }
    for (let f = 0; f < 7; f++) {
      const t = (f + 0.5) / 7;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.42),
        new THREE.MeshStandardMaterial({ color: buntCols[f % buntCols.length], roughness: 0.8, side: THREE.DoubleSide }));
      const sag = sagAt(t);
      flag.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag - 0.24, a[2] + (b[2] - a[2]) * t);
      flag.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
      g.add(flag);
    }
  }
  if (cords.length) g.add(new THREE.Mesh(mergeGeometries(cords, false), cordMat));

  // ---- bouncy castles ----
  // Each one is a walled inflatable with a soft top. The top is registered as a
  // trampoline so the bike launches instead of stopping dead on it.
  const castles = [];
  const castleSpots = [[-16, 0], [12, -8], [2, 16]];
  const castleCols = [0xd6202c, 0x2f8fd6, 0xffd23f];
  castleSpots.forEach(([ox, oz], k) => {
    const cx = lx + ox, cz = lz + oz;
    const cgy = terrain.groundHeight(cx, cz);
    const col = castleCols[k % castleCols.length];
    const skin = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
    const skin2 = new THREE.MeshStandardMaterial({ color: 0xf5f1e6, roughness: 0.55 });
    const W = 9, D = 8, H = 1.5;
    const bed = box(W, H, D, skin2);
    bed.position.set(cx, cgy + H / 2, cz);
    g.add(bed);
    // three walls of fat inflatable tubes, front left open
    for (const [wx, wz, ww, wd] of [[0, -D / 2, W, 0.9], [-W / 2, 0, 0.9, D], [W / 2, 0, 0.9, D]]) {
      for (let t = 0; t < 3; t++) {
        const tube = box(ww, 1.0, wd, t % 2 ? skin2 : skin);
        tube.position.set(cx + wx, cgy + H + 0.5 + t * 0.95, cz + wz);
        g.add(tube);
      }
    }
    // turrets on the back corners
    for (const sx of [-1, 1]) {
      const tur = cyl(0.9, 1.1, 3.4, skin, 10);
      tur.position.set(cx + sx * (W / 2 - 0.2), cgy + H + 1.7, cz - D / 2 + 0.2);
      g.add(tur);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.6, 10), skin2);
      cone.position.set(cx + sx * (W / 2 - 0.2), cgy + H + 4.1, cz - D / 2 + 0.2);
      cone.castShadow = true;
      g.add(cone);
    }
    // w/d are the soft top the bike lands on; bw/bd are the outside of the inflatable,
    // which is what people have to walk round instead of through
    castles.push({ x: cx, z: cz, y: cgy + H, w: W / 2 - 0.9, d: D / 2 - 0.9, bw: W / 2, bd: D / 2 });
  });

  // ---- Jesus, out on the grass with the kids ----
  // He is built out of the same authored character kit as everybody else on the
  // lawn — same body, same six baked walk frames — so he reads as a person rather
  // than a stack of cones. What he gets on top of that is his own: robe whites, long
  // hair, a beard, a stole, a girdle and a halo, all parented to a rig group that
  // bobs and turns underneath the transform the pedestrian system writes.
  //
  // And he can be killed. Take him out with a Nanaimo bar or the front wheel and the
  // body swaps to its damned skin — red hide, black hair, yellow eyes — the horns
  // come out and the halo drops.
  const [jx, jz] = [lx + 4, lz - 2];
  const jgy = terrain.groundHeight(jx, jz);
  const sash = new THREE.MeshStandardMaterial({ color: 0xa2262c, roughness: 0.75 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xc8a86a, roughness: 0.9 });
  const skinM = new THREE.MeshStandardMaterial({ color: 0xc79a72, roughness: 0.8 });
  const hairM = new THREE.MeshStandardMaterial({ color: 0x4a3323, roughness: 0.9 });

  const jesus = new THREE.Group();          // the pedestrian system owns this transform
  const rig = new THREE.Group();            // and this one is ours to animate
  jesus.add(rig);

  const kit = (opts.pedKit && opts.pedKit.length) ? opts.pedKit[0] : null;
  const bodyFrames = [];
  let satanGeos = null, holyGeos = null;
  let jH = 1.74;                            // body height, for hanging the extras off
  if (kit && kit.parts) {
    const linen = new THREE.Color(0xf5f2e8);
    const brimstone = new THREE.Color(0x39090d);
    // robed: everything he is wearing goes to linen, he keeps his own face
    const holy = (name, col) => (
      /skin|eye|brow|hair|shoe|sock/i.test(name) ? null : col.clone().lerp(linen, 0.93)
    );
    // damned: red hide, black hair, yellow eyes, robes scorched
    const damned = (name, col) => {
      if (/eye/i.test(name)) return new THREE.Color(0xffd21e);
      if (/skin/i.test(name)) return new THREE.Color(0x9e1f14);
      if (/hair|brow/i.test(name)) return new THREE.Color(0x120708);
      return col.clone().lerp(brimstone, 0.9);
    };
    const src = (kit.frames && kit.frames.length ? kit.frames : [kit.geometry]);
    satanGeos = src.map(geo => recolorFlattened(geo, kit.parts, damned));
    holyGeos = src.map(geo => recolorFlattened(geo, kit.parts, holy));
    holyGeos.forEach((geo, k) => {
      const m = new THREE.Mesh(geo, kit.material);
      m.castShadow = true; m.receiveShadow = true;
      m.visible = k === 0;
      rig.add(m);
      bodyFrames.push(m);
    });
    const bb = new THREE.Box3().setFromBufferAttribute(src[0].getAttribute('position'));
    jH = Math.max(1.2, bb.max.y - bb.min.y);
  } else {
    // no kit: a plain robed stand-in, so the lawn is never short a Jesus
    const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.5, 14),
      new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.82 }));
    gown.position.y = 0.78;
    rig.add(gown);
    const bh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinM);
    bh.position.y = 1.62;
    rig.add(bh);
  }
  // The kit models face +z — their own hair sits on the back of the head at -z — so
  // that is the side the locks fall down and the far side is where the beard hangs.
  // The head centre is about 94% of the way up the body.
  const headY = jH * 0.937;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(jH * 0.079, 14, 12), hairM);
  hair.position.set(0, headY + 0.025, -0.035);
  hair.scale.set(1.05, 1.0, 1.1);
  rig.add(hair);
  for (const sl of [-1, 1]) {               // locks down past the shoulders
    const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 3, 7), hairM);
    lock.position.set(sl * 0.115, headY - 0.13, -0.045);
    lock.rotation.z = sl * 0.08;
    rig.add(lock);
  }
  // The beard has to clear the front of the head — parked on the chin line it
  // disappears inside it and he comes out clean-shaven.
  const beard = new THREE.Mesh(new THREE.SphereGeometry(jH * 0.055, 12, 10), hairM);
  beard.position.set(0, headY - 0.075, 0.075);
  beard.scale.set(1, 1.5, 0.9);
  rig.add(beard);
  const tache = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.05), hairM);
  tache.position.set(0, headY - 0.005, 0.115);
  rig.add(tache);
  const stole = new THREE.Mesh(new THREE.BoxGeometry(0.1, jH * 0.42, 0.34), sash);
  stole.position.set(0, jH * 0.6, 0.015);
  rig.add(stole);
  const girdle = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 6, 16), rope);
  girdle.rotation.x = Math.PI / 2;
  girdle.position.y = jH * 0.52;
  rig.add(girdle);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 22),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb400, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.5 }));
  halo.rotation.x = Math.PI / 2 - 0.25;
  halo.position.y = headY + 0.26;
  rig.add(halo);
  // horns, waiting
  const horns = [];
  // Bone, not black: black horns on black hair over a red face are three shapes you
  // cannot tell apart at speed.
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xcbbb9c, roughness: 0.45, metalness: 0.1 });
  for (const sh of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 8), hornMat);
    horn.position.set(sh * 0.085, headY + 0.15, -0.005);
    horn.rotation.z = sh * 0.42;
    horn.rotation.x = -0.2;
    horn.visible = false;
    rig.add(horn);
    horns.push(horn);
  }
  jesus.position.set(jx, jgy, jz);
  jesus.rotation.y = faceAng + Math.PI;
  jesus.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(jesus);
  // enough to read as a halo, not enough to blow his face out under the bloom pass.
  // Parented to the rig, so when he goes down the light goes down with him.
  const glow = new THREE.PointLight(0xfff0b8, 34, 22, 2);
  glow.position.set(0, jH + 0.7, 0);
  rig.add(glow);

  let fallen = false;                       // put down; the ragdoll owns the pose
  let risen = false;                        // back on his feet, and not as himself
  let riseT = 0;                            // seconds since he stood up, for the ramp
  // Smitten. The body takes its damned skin, the horns come through, the halo drops
  // into the grass and the light over the lawn goes from gold to furnace.
  const becomeSatan = () => {
    if (fallen) return;
    fallen = true;
    if (satanGeos) bodyFrames.forEach((m, k) => { m.geometry = satanGeos[k] || satanGeos[0]; });
    hairM.color.set(0x120708);
    skinM.color.set(0x9e1f14);
    sash.color.set(0x2a0508);
    rope.color.set(0x4a2410);
    for (const h of horns) h.visible = true;
    // The halo is his, not the body's: it comes off him and stays in the grass where
    // he dropped it. Parented to the rig it would stand back up with him, so it is
    // handed to the church group at the world position it fell to.
    jesus.updateMatrixWorld(true);
    const drop = halo.getWorldPosition(new THREE.Vector3());
    halo.material.color.set(0x8e0f0f);
    halo.material.emissive.set(0x5a0000);
    halo.material.emissiveIntensity = 0.35;
    if (halo.parent !== g) g.add(halo);       // add() reparents
    halo.position.set(drop.x + 0.5, terrain.groundHeight(drop.x, drop.z) + 0.06, drop.z + 0.3);
    halo.rotation.set(-Math.PI / 2 + 0.18, 0, rand(0, Math.PI));
    glow.color.set(0xff3a12);
    glow.intensity = 26;
    glow.distance = 26;
  };

  // ---- and on the third second he rose again ----
  // The pedestrian ragdoll lets go, the body comes back up off the grass, and what
  // stands there is not who went down. Nothing about the skin changes here — that
  // happened when he fell — this is the part where he starts moving again.
  const riseAsSatan = () => {
    if (!fallen || risen) return;
    risen = true;
    riseT = 0;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    rig.scale.setScalar(1.12);                // he came back bigger
    glow.color.set(0xff2a08);
    glow.intensity = 60;
    glow.distance = 40;
  };

  // Back on his feet for a fresh run — the holy one this time.
  const reviveJesus = () => {
    if (!fallen) return;
    fallen = false;
    risen = false;
    if (holyGeos) bodyFrames.forEach((m, k) => { m.geometry = holyGeos[k] || holyGeos[0]; });
    hairM.color.set(0x4a3323);
    skinM.color.set(0xc79a72);
    sash.color.set(0xa2262c);
    rope.color.set(0xc8a86a);
    for (const h of horns) h.visible = false;
    halo.material.color.set(0xffd23f);
    halo.material.emissive.set(0xffb400);
    halo.material.emissiveIntensity = 1.1;
    if (halo.parent !== rig) rig.add(halo);
    halo.rotation.set(Math.PI / 2 - 0.25, 0, 0);
    halo.position.set(0, headY + 0.26, 0);
    glow.color.set(0xfff0b8);
    glow.intensity = 34;
    glow.distance = 22;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    rig.scale.setScalar(1);
  };

  // He is on his feet for most of the race: rocking on his heels, working the crowd,
  // and stepping through his own walk frames so the arms and legs keep moving. Driven
  // off the clock rather than a rig, so it costs nothing and never desyncs. While he
  // is down the rig goes still — the pedestrian ragdoll owns him from there — and once
  // he is back up it runs again, harder and lower, for whatever it is now.
  let jesusPhase = 0;
  const animateJesus = (t, dt) => {
    if (fallen && !risen) {
      glow.intensity = 22 + Math.sin(t * 7.3) * 6;      // the fire gutters
      return;
    }
    const hell = risen ? 1 : 0;
    if (hell) riseT += dt;
    jesusPhase += dt * (hell ? 8.2 : 5.4);
    if (bodyFrames.length > 1) {
      const fi = Math.floor((jesusPhase / (Math.PI * 2)) * bodyFrames.length) % bodyFrames.length;
      bodyFrames.forEach((m, k) => { m.visible = k === fi; });
    }
    rig.position.y = Math.abs(Math.sin(jesusPhase * 0.5)) * (hell ? 0.11 : 0.06);
    rig.rotation.y = Math.sin(t * (hell ? 1.1 : 0.42)) * (hell ? 0.9 : 0.5);
    rig.rotation.z = Math.sin(t * (hell ? 3.1 : 1.25)) * (hell ? 0.07 : 0.03);
    if (hell) {
      // the first second back is the flare; after that it burns and gutters
      const flare = Math.max(0, 1 - riseT);
      glow.intensity = 34 + flare * 90 + Math.sin(t * 9.1) * 10;
      rig.scale.setScalar(1.12 + flare * 0.16);
    } else {
      halo.rotation.z += dt * 0.9;
      halo.position.y = headY + 0.26 + Math.sin(t * 2.1) * 0.03;
      glow.intensity = 34 + Math.sin(t * 1.7) * 7;
    }
  };

  // The reader board goes down the frontage, clear of the driveway — parked on the
  // apron it stands square in the only way onto the lawn.
  const boardAnchor = [anchorPos[0] + tan[0] * 34, anchorPos[1] + tan[1] * 34];
  const board = buildReaderBoard(corridor, terrain, boardAnchor, TEX.baptist, {
    width: 8.0, height: 3.5, postColor: 0x6f6353, trimColor: 0x2f4a63, setback: 4.4,
  });
  g.add(board.group);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const [ex, ez] = at(6, 40);
  return {
    group: g,
    jesus,
    halo,
    animate: animateJesus,
    becomeSatan,
    riseAsSatan,
    reviveJesus,
    jesusHeight: jH,
    lawn: lawnPlatform,
    jesusSpot: { x: jx, z: jz, heading: faceAng + Math.PI },
    party: { x: lx, z: lz, r: 22 },
    // solid things on the lawn. People walk round these instead of through them; the
    // bike still launches off the castle tops, which is a separate list.
    blockers: [
      { x: nave.position.x, z: nave.position.z, hw: 13, hd: 7, rot: faceAng },
      { x: tower.position.x, z: tower.position.z, hw: 3.75, hd: 3.75, rot: faceAng },
      ...castles.map(c => ({ x: c.x, z: c.z, hw: c.bw, hd: c.bd, rot: 0 })),
    ],
    // the hole in the guardrail: wide enough to reach from the carriageway to the far
    // side of the lawn, so the whole detour is one continuous open patch
    entry: { x: ex, z: ez, r: 47 },
    castles,
    index: i,
  };
}

// ---------- Wellington's roadside sign on the Departure Bay Road frontage ----------
// The campus itself sits ~100 m back off Mexicana Road, so from the saddle you would
// never read it. Schools put their reader board out at the street entrance, and this
// one goes on the corridor edge nearest the campus, angled at oncoming riders.
export function buildWellingtonRoadSign(corridor, terrain, schoolPos = [-2922, -1414]) {
  const g = new THREE.Group();
  const pr = corridor.projectExact(schoolPos[0], schoolPos[1]);
  const i = pr.i;
  const [nx, nz] = corridor.normalAt(i);
  const side = Math.sign(pr.lat) || 1;               // the side the school is on
  const base = corridor.pts[i];
  const off = corridor.hw[i] + 4.5;
  const px = base[0] + nx * side * off, pz = base[1] + nz * side * off;
  const gy = terrain.groundHeight(px, pz);

  const brick = new THREE.MeshStandardMaterial({ color: 0x9c5b43, roughness: 0.95 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x0e2a5c, roughness: 0.7 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.95 });

  // everything is laid out along the sign's own face direction, not world x — the
  // piers were landing in front of the panel and covering the text
  const tan = corridor.tan[i];
  const faceAng = Math.atan2(nx * side, nz * side);
  const alongX = tan[0], alongZ = tan[1];
  const put = (mesh, along, y, out = 0) => {
    mesh.position.set(px + alongX * along + nx * side * out, y, pz + alongZ * along + nz * side * out);
    mesh.rotation.y = faceAng;
    g.add(mesh);
  };
  put(box(9.6, 1.5, 1.7, brick), 0, gy + 0.75);
  put(box(10.0, 0.35, 2.0, stone), 0, gy + 1.65);
  for (const sx of [-1, 1]) put(box(0.9, 5.0, 1.5, brick), sx * 4.7, gy + 2.5);
  put(box(8.8, 4.2, 0.45, navy), 0, gy + 3.7);

  // the board itself: two single-sided faces so the text never reads mirrored
  const signMat = new THREE.MeshStandardMaterial({
    map: TEX.wellington, roughness: 0.5,
    emissive: 0xffffff, emissiveMap: TEX.wellington, emissiveIntensity: 0.45,
  });
  for (const flip of [0, Math.PI]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.9, 3.5), signMat);
    const out = flip ? -0.3 : 0.3;                   // proud of the navy frame on both faces
    panel.position.set(px + nx * side * out, gy + 3.7, pz + nz * side * out);
    panel.rotation.y = faceAng + flip;
    g.add(panel);
  }
  // a pair of ground-wash lights so it reads in any light
  for (const sx of [-1, 1]) {
    const can = cyl(0.16, 0.2, 0.4, new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 }), 8);
    can.position.set(px + alongX * sx * 2.6 + nx * side * 0.75, gy + 1.9, pz + alongZ * sx * 2.6 + nz * side * 0.75);
    g.add(can);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- Wellington Secondary School (real site, ~49.2093 -124.0002) ----------
// The campus reads as connected blocks from its phased construction: two classroom
// ranges, a taller gym, a wood-and-metal entrance canopy, and the Wildcats sign.
export function buildWellingtonSchool(terrain, pos = [-2922, -1414]) {
  const g = new THREE.Group();
  const [px, pz] = pos;
  // face the campus toward the nearest mapped road
  const nr = terrain.nearestRoad(px, pz);
  let ry = Math.PI;
  if (nr) {
    const s = nr.seg;
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((px - s.ax) * dx + (pz - s.az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = s.ax + t * dx, cz = s.az + t * dz;
    const tx = cx - px, tz = cz - pz;
    if (Math.hypot(tx, tz) > 1) ry = Math.atan2(tx, tz); // local +z toward the road
  }
  const gy = terrain.groundHeight(px, pz);

  const beige = new THREE.MeshStandardMaterial({ color: 0xd9d0bd, roughness: 0.85 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.8 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x14335f, roughness: 0.7 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9c5b43, roughness: 0.95 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.9, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27414f, roughness: 0.2, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 });

  // local frame: +z toward the street (front), x across
  // main two-storey classroom block
  const main = box(58, 9.4, 17, beige); main.position.set(0, gy + 4.7, -16); g.add(main);
  const mainBand = box(58.3, 1.3, 17.3, navy); mainBand.position.set(0, gy + 3.0, -16); g.add(mainBand);
  // second classroom range, offset like a later phase
  const wing = box(34, 7.6, 15, cream); wing.position.set(-44, gy + 3.8, -6); g.add(wing);
  const wingBand = box(34.3, 1.0, 15.3, navy); wingBand.position.set(-44, gy + 2.6, -6); g.add(wingBand);
  // gym: taller block with a high roof
  const gym = box(30, 11, 22, brick); gym.position.set(38, gy + 5.5, -8); g.add(gym);
  const gymRoof = box(30.6, 1.1, 22.6, roofM); gymRoof.position.set(38, gy + 11.3, -8); g.add(gymRoof);
  // link corridor between main and gym
  const link = box(24, 4.2, 8, cream); link.position.set(16, gy + 2.1, -13); g.add(link);
  // entrance: wood canopy + mullioned glass front on the main block
  const canopy = box(12, 0.7, 6, wood); canopy.position.set(0, gy + 5.6, -5.5); g.add(canopy);
  for (const s of [-1, 1]) {
    const post = cyl(0.16, 0.16, 5.4, wood, 8);
    post.position.set(s * 5.2, gy + 2.7, -3.2); g.add(post);
  }
  const entry = box(10, 4.6, 0.4, glass); entry.position.set(0, gy + 2.4, -7.3); g.add(entry);
  // window bands along the blocks
  for (let i = -2; i <= 2; i++) {
    if (Math.abs(i) < 1) continue;
    const wb = box(8.6, 1.5, 0.35, glass); wb.position.set(i * 11, gy + 6.4, -7.4); g.add(wb);
    const wb2 = box(8.6, 1.5, 0.35, glass); wb2.position.set(i * 11, gy + 2.1, -7.4); g.add(wb2);
  }
  for (let i = -1; i <= 1; i++) {
    const wb = box(9, 1.4, 0.35, glass); wb.position.set(-44 + i * 11, gy + 4.6, 1.6); g.add(wb);
  }
  // flat roofs with parapets
  const roofA = box(58.6, 0.8, 17.6, roofM); roofA.position.set(0, gy + 9.8, -16); g.add(roofA);
  const roofB = box(34.6, 0.8, 15.6, roofM); roofB.position.set(-44, gy + 8.0, -6); g.add(roofB);

  // parking pad in front
  const pad = new THREE.Mesh(new THREE.BoxGeometry(96, 0.14, 30),
    new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.95 }));
  pad.position.set(-6, gy + 0.07, 12); pad.receiveShadow = true; g.add(pad);

  // flag pole
  const flag = cyl(0.09, 0.12, 13, new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.4, metalness: 0.8 }), 8);
  flag.position.set(22, gy + 6.5, 6); g.add(flag);

  // the sign: big brick monument, panel readable from the road
  const signBase = box(13.5, 2.9, 1.4, brick); signBase.position.set(0, gy + 1.45, 26); g.add(signBase);
  const signCap = box(14.1, 0.5, 2.0, new THREE.MeshStandardMaterial({ color: 0x14335f, roughness: 0.7 })); signCap.position.set(0, gy + 3.05, 26); g.add(signCap);
  const signMat = new THREE.MeshStandardMaterial({
    map: TEX.wellington, roughness: 0.55,
    emissive: 0xffffff, emissiveMap: TEX.wellington, emissiveIntensity: 0.3,
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(13.0, 6.5, 0.35),
    [brick, brick, brick, brick, signMat, signMat]);
  panel.position.set(0, gy + 6.6, 26); g.add(panel);
  for (const s of [-1, 1]) {
    const stud = cyl(0.34, 0.4, 0.8, new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 }), 8);
    stud.position.set(s * 5.6, gy + 3.4, 26.4); g.add(stud);
  }

  g.position.set(px, 0, pz);
  g.rotation.y = ry;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
