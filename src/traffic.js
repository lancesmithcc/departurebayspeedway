// traffic.js — AI cars driving lane paths on the real road network
import * as THREE from 'three';
import { buildReferenceVehicle, REFERENCE_VEHICLES } from './traffic-models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, rand, choice, lerp, distPointToSeg } from './util.js';

const CAR_COLORS = ['#c8c9cc', '#2e3236', '#8a1f26', '#1d3a5f', '#5d6266', '#e8e6df', '#4a5d3a', '#7a4a21', '#b8b49a', '#33393f', '#722f37', '#dbe4ea'];

// ---- car geometry builders (front = -z) ----
// Bodies are side profiles (x = length, front at -x; y = height) extruded across
// the car's width with a bevel, so silhouettes curve instead of reading as boxes.
function profileGeo(pts, width, bevel = 0.07) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const depth = Math.max(0.04, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 2, steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);   // length -> z (front at -z), extrusion -> x
  g.computeVertexNormals();
  return g;
}
function wheelGeo(r, w) {
  const g = new THREE.CylinderGeometry(r, r, w, 14);
  g.rotateZ(Math.PI / 2);
  return g;
}
// tire + protruding rim face, as parts ready for bakeParts
function wheelParts(parts, r, w, x, y, z) {
  const tire = wheelGeo(r, w); tire.translate(x, y, z);
  parts.push({ g: tire, c: [0.07, 0.07, 0.08] });
  const rim = new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 1.12, 12);
  rim.rotateZ(Math.PI / 2); rim.translate(x, y, z);
  parts.push({ g: rim, c: [0.62, 0.64, 0.67] });
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 1.2, 8);
  hub.rotateZ(Math.PI / 2); hub.translate(x, y, z);
  parts.push({ g: hub, c: [0.3, 0.31, 0.33] });
}
// thin slab helper (bumpers, lights, trim)
function slab(parts, w, h, d, x, y, z, c) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
  parts.push({ g, c });
}
const GLASS = [0.09, 0.12, 0.15];
const TRIM = [0.13, 0.14, 0.15];
const LAMP = [1.0, 0.96, 0.82];
const TAIL = [0.62, 0.05, 0.05];

function carSedan() {
  const parts = [];
  const W = 1.8;
  // side profile: bumper → hood → raked windshield → roof → fastback → trunk
  const body = profileGeo([
    [-2.25, 0.34], [-2.22, 0.66], [-1.85, 0.76], [-1.05, 0.82], [-0.62, 0.86],
    [-0.18, 1.24], [0.62, 1.30], [1.32, 1.10], [1.86, 0.94], [2.22, 0.86],
    [2.25, 0.40], [1.6, 0.28], [-1.6, 0.28],
  ], W);
  parts.push({ g: body, c: [1, 1, 1] });
  // greenhouse glass, slightly proud of the body sides so windows read
  const glass = profileGeo([
    [-0.56, 0.92], [-0.26, 1.16], [0.66, 1.20], [1.20, 1.02], [1.20, 0.92],
  ], W + 0.03, 0.02);
  parts.push({ g: glass, c: GLASS });
  // rocker skirts + bumpers
  slab(parts, W + 0.04, 0.16, 2.6, 0, 0.30, 0.1, TRIM);
  slab(parts, W - 0.06, 0.22, 0.26, 0, 0.48, -2.26, TRIM);
  slab(parts, W - 0.06, 0.22, 0.26, 0, 0.50, 2.26, TRIM);
  // lights
  for (const s of [-1, 1]) {
    slab(parts, 0.42, 0.16, 0.12, s * 0.6, 0.70, -2.30, LAMP);
    slab(parts, 0.44, 0.16, 0.12, s * 0.58, 0.86, 2.29, TAIL);
    // mirrors
    slab(parts, 0.16, 0.09, 0.16, s * (W / 2 + 0.06), 1.02, -0.5, TRIM);
  }
  wheelParts(parts, 0.34, 0.25, -0.80, 0.34, -1.42);
  wheelParts(parts, 0.34, 0.25, 0.80, 0.34, -1.42);
  wheelParts(parts, 0.34, 0.25, -0.80, 0.34, 1.44);
  wheelParts(parts, 0.34, 0.25, 0.80, 0.34, 1.44);
  return parts;
}

function carSUV() {
  const parts = [];
  const W = 1.94;
  const body = profileGeo([
    [-2.35, 0.42], [-2.32, 0.86], [-1.95, 1.00], [-1.20, 1.06], [-0.86, 1.10],
    [-0.42, 1.52], [1.35, 1.58], [1.90, 1.44], [2.30, 1.30], [2.35, 0.50],
    [1.7, 0.34], [-1.7, 0.34],
  ], W);
  parts.push({ g: body, c: [1, 1, 1] });
  const glass = profileGeo([
    [-0.80, 1.16], [-0.50, 1.42], [1.30, 1.46], [1.74, 1.34], [1.74, 1.16],
  ], W + 0.03, 0.02);
  parts.push({ g: glass, c: GLASS });
  // roof rails
  for (const s of [-1, 1]) slab(parts, 0.09, 0.07, 2.0, s * 0.62, 1.61, 0.35, TRIM);
  slab(parts, W + 0.05, 0.2, 3.0, 0, 0.40, 0.05, TRIM);
  slab(parts, W - 0.04, 0.3, 0.24, 0, 0.62, -2.33, TRIM);
  slab(parts, W - 0.04, 0.3, 0.24, 0, 0.62, 2.33, TRIM);
  for (const s of [-1, 1]) {
    slab(parts, 0.44, 0.2, 0.12, s * 0.62, 0.94, -2.40, LAMP);
    slab(parts, 0.2, 0.5, 0.12, s * 0.76, 1.25, 2.39, TAIL);
    slab(parts, 0.17, 0.1, 0.17, s * (W / 2 + 0.06), 1.26, -0.62, TRIM);
  }
  for (const [x, z] of [[-0.86, -1.5], [0.86, -1.5], [-0.86, 1.5], [0.86, 1.5]]) {
    wheelParts(parts, 0.40, 0.29, x, 0.40, z);
  }
  return parts;
}

function carPickup() {
  const parts = [];
  const W = 1.94;
  // cab + bed as one profile: bed floor drops behind the cab
  const body = profileGeo([
    [-2.6, 0.46], [-2.56, 0.92], [-2.1, 1.06], [-1.3, 1.12], [-1.0, 1.16],
    [-0.6, 1.62], [0.5, 1.66], [0.62, 1.20], [2.5, 1.22], [2.6, 0.52],
    [1.9, 0.36], [-1.9, 0.36],
  ], W);
  parts.push({ g: body, c: [1, 1, 1] });
  const glass = profileGeo([
    [-0.94, 1.22], [-0.66, 1.52], [0.44, 1.55], [0.44, 1.22],
  ], W + 0.03, 0.02);
  parts.push({ g: glass, c: GLASS });
  // bed walls + tailgate + floor
  for (const s of [-1, 1]) slab(parts, 0.1, 0.42, 1.9, s * (W / 2 - 0.05), 1.42, 1.55, [1, 1, 1]);
  slab(parts, W - 0.06, 0.42, 0.1, 0, 1.42, 2.5, [1, 1, 1]);
  slab(parts, W - 0.2, 0.06, 1.9, 0, 1.24, 1.55, [0.3, 0.3, 0.31]);
  slab(parts, W + 0.05, 0.2, 3.4, 0, 0.42, 0.05, TRIM);
  slab(parts, W - 0.04, 0.32, 0.26, 0, 0.66, -2.58, TRIM);
  slab(parts, W - 0.04, 0.28, 0.24, 0, 0.66, 2.58, TRIM);
  for (const s of [-1, 1]) {
    slab(parts, 0.46, 0.2, 0.12, s * 0.62, 1.00, -2.65, LAMP);
    slab(parts, 0.2, 0.44, 0.12, s * 0.78, 1.42, 2.64, TAIL);
    slab(parts, 0.18, 0.11, 0.18, s * (W / 2 + 0.07), 1.34, -0.78, TRIM);
  }
  for (const [x, z] of [[-0.86, -1.72], [0.86, -1.72], [-0.86, 1.62], [0.86, 1.62]]) {
    wheelParts(parts, 0.42, 0.30, x, 0.42, z);
  }
  return parts;
}

function bakeParts(parts) {
  const geos = [];
  for (const p of parts) {
    // extruded bodies are non-indexed while box/cylinder parts are indexed —
    // mergeGeometries needs one or the other, so flatten everything
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = p.c[0]; colors[i * 3 + 1] = p.c[1]; colors[i * 3 + 2] = p.c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.clearGroups();
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

export const TYPES = [
  { name: 'sedan', build: carSedan, n: 34, len: 4.5, vmax: [14, 19] },
  { name: 'suv', build: carSUV, n: 20, len: 4.7, vmax: [13, 18] },
  { name: 'pickup', build: carPickup, n: 14, len: 5.2, vmax: [13, 18] },
  { name: 'bus', n: 4, len: 12.6, width: 2.55, vmax: [10, 13] },
  { name: 'cybertruck', n: 2, len: 5.7, width: 2.1, vmax: [13, 18] },
  { name: 'rcmp', n: 2, len: 5.15, width: 2.05, vmax: [13, 18] },
];

// Contact positions are taken from the actual tyre locations, in model metres.
export const TRAFFIC_CONTACTS = {
  sedan: { halfTrack: .8, front: -1.42, rear: 1.44 },
  suv: { halfTrack: .86, front: -1.5, rear: 1.5 },
  pickup: { halfTrack: .86, front: -1.72, rear: 1.62 },
  bus: { halfTrack: 1.12, front: -3.65, rear: 3.65 },
  cybertruck: { halfTrack: 1, front: -1.81, rear: 1.72 },
  rcmp: { halfTrack: .91, front: -1.62, rear: 1.54 },
};

export function trafficSurfaceHeight(terrain, x, z) {
  if (terrain.renderedGroundHeight) return terrain.renderedGroundHeight(x, z);
  const deck = terrain.roadDeck(x, z);
  const ground = terrain.meshHeight(x, z) ?? terrain.surfaceHeight(x, z);
  return deck && deck.d <= deck.hw ? Math.max(deck.y, ground) : ground;
}

// Fit a rigid chassis to the four wheel contacts. Use the heading of the drawn
// vehicle, not a six-metre centreline lookahead (which also wrapped at lane ends).
// Yaw precedes pitch/roll: XYZ Euler pitch tilted eastbound cars sideways.
export function solveTrafficGrounding(terrain, x, z, heading, contact) {
  const { halfTrack, front, rear, y: localY = 0 } = contact;
  const points = [[-halfTrack, front], [halfTrack, front], [-halfTrack, rear], [halfTrack, rear]];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  const right = new THREE.Vector3(), back = new THREE.Vector3(), up = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let transformed;
  for (let iteration = 0; iteration < 4; iteration++) {
    transformed = points.map(([px, pz]) => new THREE.Vector3(px, localY, pz).applyQuaternion(q));
    const h = transformed.map(p => trafficSurfaceHeight(terrain, x + p.x, z + p.z));
    const ax = (transformed[1].x + transformed[3].x - transformed[0].x - transformed[2].x) / 2;
    const az = (transformed[1].z + transformed[3].z - transformed[0].z - transformed[2].z) / 2;
    const bx = (transformed[2].x + transformed[3].x - transformed[0].x - transformed[1].x) / 2;
    const bz = (transformed[2].z + transformed[3].z - transformed[0].z - transformed[1].z) / 2;
    const ah = (h[1] + h[3] - h[0] - h[2]) / 2;
    const bh = (h[2] + h[3] - h[0] - h[1]) / 2;
    const determinant = ax * bz - az * bx;
    const gx = (ah * bz - az * bh) / determinant;
    const gz = (ax * bh - ah * bx) / determinant;
    right.set(Math.cos(heading), gx * Math.cos(heading) - gz * Math.sin(heading), -Math.sin(heading)).normalize();
    up.set(-gx, 1, -gz).normalize();
    back.crossVectors(right, up).normalize();
    q.setFromRotationMatrix(matrix.makeBasis(right, up, back));
  }
  transformed = points.map(([px, pz]) => new THREE.Vector3(px, localY, pz).applyQuaternion(q));
  const heights = transformed.map(p => trafficSurfaceHeight(terrain, x + p.x, z + p.z));
  // Keep every tyre above the rendered triangles over crests and curb transitions.
  // On non-planar ground the remaining clearance is suspension travel, not height lag.
  const y = Math.max(...heights.map((h, i) => h - transformed[i].y));
  return { y, quaternion: q, contacts: transformed.map((p, i) => ({
    x: x + p.x, z: z + p.z, y: y + p.y, surface: heights[i], clearance: y + p.y - heights[i],
  })) };
}

function modelContacts(geometry, fallback) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox, a = geometry.attributes.position;
  const buckets = [[], [], [], []];
  for (let i = 0; i < a.count; i++) {
    if (a.getY(i) > b.min.y + .035) continue;
    const x = a.getX(i), z = a.getZ(i);
    if (Math.abs(x) < (b.max.x - b.min.x) * .22) continue;
    buckets[(z >= 0 ? 2 : 0) + (x >= 0 ? 1 : 0)].push([x, z]);
  }
  if (buckets.some(v => !v.length)) return fallback;
  const means = buckets.map(v => v.reduce((a, p) => [a[0] + p[0] / v.length, a[1] + p[1] / v.length], [0, 0]));
  return { halfTrack: means.reduce((sum, p) => sum + Math.abs(p[0]) / 4, 0),
    front: (means[0][1] + means[1][1]) / 2, rear: (means[2][1] + means[3][1]) / 2, y: b.min.y };
}

export class Traffic {
  constructor(scene, map, terrain, carModels = null) {
    this.terrain = terrain;
    this.map = map;
    this.buildLanePaths(map);
    this.cars = [];
    this.matrices = { dummy: new THREE.Object3D() };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35, envMapIntensity: 1.0 });
    // Authored CC0 cars when the kit is available, the built-in shapes otherwise.
    // Special reference vehicles always use their own models and collision sizes.
    this.usingModels = !!(carModels && carModels.length >= 3);
    // Generic kit fallback is reserved for ordinary passenger traffic.
    const order = ['sedan', 'suv', 'pickup', 'bus'];
    const pick = (name) => {
      if (!this.usingModels || REFERENCE_VEHICLES[name]) return null;
      const named = { sedan: ['NormalCar1', 'sedan', 'car-4'], suv: ['SUV', 'suv', 'car-6'],
        pickup: ['NormalCar2', 'truck', 'car-5'] }[name] || [];
      for (const w of named) {
        const hit = carModels.find(m => m.url.toLowerCase().includes(w.toLowerCase()));
        if (hit) return hit;
      }
      return carModels[order.indexOf(name) % carModels.length] || carModels[0];
    };
    this.meshes = {};
    for (const t of TYPES) {
      const model = pick(t.name);
      const contacts = model?.contacts || (model ? modelContacts(model.geometry, TRAFFIC_CONTACTS[t.name]) : TRAFFIC_CONTACTS[t.name]);
      const parts = buildReferenceVehicle(t.name) || model?.renderParts || [{ geometry: model ? model.geometry : bakeParts(t.build()), material: model ? model.material : mat }];
      const instances = parts.map(part => {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, t.n);
        inst.name = part.name || `Traffic ${t.name}`;
        inst.userData.tintable = part.tintable !== false;
        inst.castShadow = true; inst.receiveShadow = true;
        inst.frustumCulled = false;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(inst);
        return inst;
      });
      this.meshes[t.name] = { inst: instances[0], instances, total: t.n };
      // Each car owns one instance slot for the whole session. Packing active cars
      // into the front of the buffer meant a car's slot — and therefore its baked
      // colour — changed whenever another car spawned, which read as flashing.
      this.cars.push(...Array.from({ length: t.n }, (_, slot) => ({
        type: t.name, active: false, contacts, len: model?.size?.z || t.len, width: model?.size?.x || t.width || 1.95, maxSpeed: t.vmax[1], slot,
      })));
    }
    this.col = new THREE.Color();
    // colour belongs to the car, and its slot never moves, so it stays put
    for (const car of this.cars) {
      if (REFERENCE_VEHICLES[car.type]) this.col.set(0xffffff);
      else if (this.usingModels) this.col.set(choice(CAR_COLORS));
      else this.col.set(choice(CAR_COLORS));
      for (const inst of this.meshes[car.type].instances) inst.setColorAt(car.slot, inst.userData.tintable ? this.col : new THREE.Color(0xffffff));
    }
    for (const t of TYPES) for (const inst of this.meshes[t.name].instances) inst.instanceColor.needsUpdate = true;
    this.nearMissEvents = [];
  }

  buildLanePaths(map) {
    // drivable roads → directed lane paths with right-side offsets
    this.paths = [];
    const drivable = map.roads.filter(r =>
      (r.w >= 6 || ['trunk', 'primary', 'secondary', 'tertiary'].includes(r.c)) &&
      r.p.length >= 2 &&
      (r.cum[r.cum.length - 1] || 0) > 35
    );
    for (const r of drivable) {
      const lanes = r.w > 10.5 ? [r.w * 0.22, r.w * 0.42] : [r.w * 0.25];
      for (const dir of [1, -1]) {
        const pts = dir === 1 ? r.p : [...r.p].reverse();
        const es = dir === 1 ? r.e : [...r.e].reverse();
        for (const off of lanes) {
          const path = { pts: [], cum: [0], total: 0, vmax: (r.c === 'trunk' || r.c === 'primary') ? rand(19, 24) : rand(11, 16), name: r.n, laneOffset: off, halfWidth: r.w / 2 };
          for (let i = 0; i < pts.length; i++) {
            const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
            let dx = next[0] - prev[0], dz = next[1] - prev[1];
            const len = Math.hypot(dx, dz) || 1;
            dx /= len; dz /= len;
            const rx = -dz, rz = dx; // right of travel
            const px = pts[i][0] + rx * off, pz = pts[i][1] + rz * off;
            const py = (es[i] ?? 0) + 0.02;
            path.pts.push(px, py, pz);
            if (i > 0) path.cum.push(path.cum[path.cum.length - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
          }
          path.total = path.cum[path.cum.length - 1];
          if (path.total > 35) this.paths.push(path);
        }
      }
    }
    // route-road path indices (prefer traffic on Departure Bay Rd)
    this.routePaths = this.paths.map((p, i) => ({ p, i })).filter(x => x.p.name === 'Departure Bay Road').map(x => x.i);
    this.routePref = 0.2;
    this.crashRel = 8.5;
  }

  sample(path, s) {
    s = clamp(s, 0, path.total);
    // binary search cum
    let lo = 0, hi = path.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (path.cum[mid] <= s) lo = mid; else hi = mid;
    }
    const t = (s - path.cum[lo]) / Math.max(1e-6, path.cum[lo + 1] - path.cum[lo]);
    const i0 = lo * 3, i1 = (lo + 1) * 3;
    const x = lerp(path.pts[i0], path.pts[i1], t);
    const y = lerp(path.pts[i0 + 1], path.pts[i1 + 1], t);
    const z = lerp(path.pts[i0 + 2], path.pts[i1 + 2], t);
    const dx = path.pts[i1] - path.pts[i0], dz = path.pts[i1 + 2] - path.pts[i0 + 2];
    return { x, y, z, dx, dz };
  }

  spawnNear(car, playerPos, radius) {
    // pick a path point within ring radius± around player, prefer route road
    const preferRoute = Math.random() < this.routePref && this.routePaths.length;
    for (let tries = 0; tries < 24; tries++) {
      const path = preferRoute ? this.paths[choice(this.routePaths)] : choice(this.paths);
      // skip the stub lanes, and never start a car in the last stretch of one: it would
      // reach the end and retire within a second, which is what made traffic churn
      if (path.total < 90 && !preferRoute) continue;
      const s = rand(0, Math.max(1, path.total - 55));
      const sm = this.sample(path, s);
      const d = Math.hypot(sm.x - playerPos.x, sm.z - playerPos.z);
      if (d > 330 && d < 780) {   // far enough out that nobody sees them appear
        car.path = path;
        car.s = s;
        car.v = Math.min(path.vmax, car.maxSpeed) * rand(0.75, 1);
        car.active = true;
        car.justSpawned = true;
        car.policeStopped = false;
        car.gen = (car.gen || 0) + 1;      // bumped each spawn, so tools can tell lives apart
        car.crashed = false; car.swerveT = 0; car.latOffset = 0; car.yaw = 0; car.tilt = 0;
        // Place it on the road right now. Leaving x/z at last life's values for a frame
        // made the very next update look like a 600 m teleport, which tripped the
        // anti-teleport guard and retired the car — traffic blinking in and out.
        car.x = sm.x; car.y = sm.y; car.z = sm.z;
        car.dx = sm.dx; car.dz = sm.dz;
        car.heading = Math.atan2(-sm.dx, -sm.dz);
        car.headingSmooth = car.heading;
        car.ySmooth = car.y;
        car.drawX = undefined; car.drawZ = undefined;
        if (!this.groundCar(car)) continue;
        car.hideFrames = 0;
        return true;
      }
    }
    return false;
  }

  // find a lane whose start sits where this one ended, pointing roughly the same way
  continueOnNextPath(car) {
    const end = this.sample(car.path, car.path.total);
    const dl = Math.hypot(end.dx, end.dz) || 1;
    const ex = end.dx / dl, ez = end.dz / dl;
    let best = null, bestScore = -Infinity;
    for (const p of this.paths) {
      if (p === car.path) continue;
      const st = this.sample(p, 0);
      const d = Math.hypot(st.x - end.x, st.z - end.z);
      if (d > 38) continue;
      if (Math.abs(st.y - end.y) > 0.9) continue;          // never jump between stacked grades
      const sl = Math.hypot(st.dx, st.dz) || 1;
      const align = (st.dx / sl) * ex + (st.dz / sl) * ez;
      if (align < 0.3) continue;                   // no U-turns at a lane join
      const score = align * 10 - d;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return false;
    car.handoffFrame = this.frameNo || 0;
    this.handoffs = (this.handoffs || 0) + 1;
    car.path = best;
    car.s = 0;
    car.v = Math.min(car.v, best.vmax);
    const st = this.sample(best, 0);
    car.x = st.x; car.y = st.y; car.z = st.z;
    car.ySmooth = st.y;
    car.justSpawned = true;
    this.groundCar(car);
    return true;
  }

  update(dt, player, playerActive) {
    this.frameNo = (this.frameNo || 0) + 1;
    const pos = player.pos;
    for (const car of this.cars) {
      if (!car.active) {
        if (Math.random() < 0.13) this.spawnNear(car, pos, 400);
        continue;
      }
      if (car.policeStopped) { car.v = 0; this.groundCar(car); continue; }
      if (car.crashed) {
        // off the road and done: sit tilted, smoke now and then, fade out of scope
        car.v = Math.max(0, car.v - 9 * dt);
        car.s += car.v * dt;
        car.tilt = Math.min(0.13, (car.tilt || 0) + 0.1 * dt);
        if (car.s >= car.path.total) {
          this.retire = this.retire || {}; this.retire.wreckEnd = (this.retire.wreckEnd || 0) + 1;
          car.active = false; car.crashed = false; continue;
        }
        if (this.onCarCrash && Math.random() < 1.6 * dt) {
          this.onCarCrash(car);
        }
      } else {
        const path = car.path;
        // ahead car check (same path only)
        let vmaxNow = Math.min(path.vmax, car.maxSpeed);
        for (const o of this.cars) {
          if (o === car || !o.active || o.path !== path || o.crashed) continue;
          let ds = o.s - car.s;
          if (ds < 0) ds += path.total;
          const gap = ds - (car.len + o.len) / 2;
          if (ds > 0 && gap < 13) vmaxNow = Math.min(vmaxNow, Math.max(0, o.v * (gap - 2) / 10));
        }
        // brake for player ahead in lane
        const sm = this.sample(path, car.s);
        const pdx = pos.x - sm.x, pdz = pos.z - sm.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd < 26 && playerActive) {
          const ahead = (pdx * sm.dx + pdz * sm.dz) / (Math.hypot(sm.dx, sm.dz) || 1);
          if (ahead > 2 && ahead < 18) vmaxNow = Math.min(vmaxNow, Math.max(0, (ahead - 6) * 0.9));
        }
        // Nanaimo-bar panic: swerve off the line, then lose it completely
        if (car.swerveT > 0) {
          car.swerveT -= dt;
          car.latOffset = (car.latOffset || 0) + car.swerveDir * 10 * dt;
          car.v = Math.max(0, car.v - 7 * dt);
          car.yaw = clamp((car.yaw || 0) + car.swerveDir * 1.9 * dt, -0.9, 0.9);
          if (car.swerveT <= 0) {
            car.crashed = true;
            if (this.onCarCrash) this.onCarCrash(car, true);
          }
        } else {
          car.latOffset = (car.latOffset || 0) * Math.exp(-1.4 * dt);
          car.yaw = (car.yaw || 0) * Math.exp(-2.2 * dt);
        }
        car.v += clamp(vmaxNow - car.v, -7 * dt, 4.5 * dt);
        car.v = Math.max(0, car.v);
        car.s += car.v * dt;
        if (car.s >= path.total) {
          // Lane paths are short — some are only 40 m — so retiring at the end made
          // every car blink out and pop back a few seconds later. Hand the car over to
          // a lane that starts where this one finished and it just drives on.
          if (!this.continueOnNextPath(car)) {
            this.retire = this.retire || {}; this.retire.pathEnd = (this.retire.pathEnd || 0) + 1;
            car.active = false;
            car.crashed = false;
            car.swerveT = 0; car.latOffset = 0; car.yaw = 0; car.tilt = 0;
          }
          continue;
        }
      }
      // respawn if far from player
      const sm2 = this.sample(car.path, car.s);
      const dl = Math.hypot(sm2.dx, sm2.dz) || 1;
      const rx = -sm2.dz / dl, rz = sm2.dx / dl;
      car.x = sm2.x + rx * (car.latOffset || 0);
      car.z = sm2.z + rz * (car.latOffset || 0);
      // Outer lanes must leave enough room for bus tyres on the asphalt.
      const laneLimit = Math.max(0, car.path.halfWidth - car.width / 2 - .12);
      if (!car.crashed && !(car.swerveT > 0) && car.path.laneOffset > laneLimit) {
        const inward = car.path.laneOffset - laneLimit;
        car.x -= rx * inward; car.z -= rz * inward;
      }
      car.dx = sm2.dx; car.dz = sm2.dz;
      car.heading = Math.atan2(-sm2.dx, -sm2.dz) - (car.yaw || 0);
      // ease the drawn heading and height so lane samples don't step
      if (car.headingSmooth === undefined || car.justSpawned) {
        car.headingSmooth = car.heading;
        car.ySmooth = car.y;
        car.justSpawned = false;
      } else {
        let diff = car.heading - car.headingSmooth;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.headingSmooth += diff * Math.min(1, 12 * dt);
        // Ground vehicles follow the deck exactly. Height easing made them visibly
        // hover after lane handoffs and over sharp cross-slopes.
        car.ySmooth = car.y;
      }
      this.groundCar(car);
      if (Math.hypot(car.x - pos.x, car.z - pos.z) > 950) {
        this.retire = this.retire || {}; this.retire.farAway = (this.retire.farAway || 0) + 1;
        car.active = false;
        car.crashed = false;
        car.swerveT = 0; car.latOffset = 0; car.yaw = 0; car.tilt = 0;
        continue;
      }
    }
    this.writeMatrices();
    this.checkPlayer(player, playerActive);
  }

  groundCar(car) {
    const pose = solveTrafficGrounding(this.terrain, car.x, car.z,
      car.headingSmooth ?? car.heading, car.contacts || TRAFFIC_CONTACTS[car.type]);
    car.y = car.ySmooth = pose.y;
    car.groundQuaternion = pose.quaternion;
    car.wheelContacts = pose.contacts;
    const euler = new THREE.Euler().setFromQuaternion(pose.quaternion, 'YXZ');
    car.pitch = euler.x; car.roll = euler.z;
    // Some peripheral mapped lanes cross discontinuous terrain/retaining walls.
    // Do not render a rigid car balancing a metre above the visible road.
    if(pose.contacts.some(p=>p.clearance > .32) || Math.abs(euler.x) > .55 || Math.abs(euler.z) > .4){
      car.active=false;car.drawX=undefined;car.drawZ=undefined;
      this.retire ||= {};this.retire.unsupportedSurface=(this.retire.unsupportedSurface||0)+1;
      return false;
    }
    return true;
  }

  // a bar splattered across the windshield: driver bolts off the road
  nanaimoHit(car, side) {
    if (car.crashed) return false;
    car.swerveT = 1.45;
    car.swerveDir = side || (Math.random() < 0.5 ? -1 : 1);
    return true;
  }

  writeMatrices() {
    const d = this.matrices.dummy;
    for (const car of this.cars) {
      const m = this.meshes[car.type];
      // Never draw a frame in which a car moved further than it could have driven —
      // respawns and lane changes are hidden rather than smeared across the screen.
      if (car.active && car.drawX !== undefined) {
        const moved = Math.hypot(car.x - car.drawX, car.z - car.drawZ);
        if (moved > Math.max(6, car.v * 0.4)) {
          // A car that moved further than it could have driven is not the same journey
          // any more. Blinking it out for two frames read as flicker, so retire it and
          // let the spawner bring one back in from outside the view.
          car.headingSmooth = car.heading;
          car.ySmooth = car.y;
          if (moved > 40) {
            this.retire = this.retire || {}; this.retire.teleport = (this.retire.teleport || 0) + 1;
            car.active = false; car.drawX = undefined;
          }
        }
      }
      if (car.active) { car.drawX = car.x; car.drawZ = car.z; }
      else { car.drawX = undefined; }
      if (car.hideFrames > 0) {
        car.hideFrames--;
        d.position.set(0, -500, 0);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        for (const inst of m.instances) inst.setMatrixAt(car.slot, d.matrix);
        continue;
      }
      if (car.active) {
        d.position.set(car.x, car.ySmooth ?? car.y, car.z);
        if (car.groundQuaternion) d.quaternion.copy(car.groundQuaternion);
        else d.rotation.set(0, car.headingSmooth ?? car.heading, 0);
      } else {
        d.position.set(0, -500, 0);
        d.rotation.set(0, 0, 0);
      }
      d.updateMatrix();
      for (const inst of m.instances) inst.setMatrixAt(car.slot, d.matrix);
    }
    for (const mesh of Object.values(this.meshes)) for (const inst of mesh.instances) inst.instanceMatrix.needsUpdate = true;
  }

  // player collision + near-miss; returns {type:'crash'|'scrape', relSpeed} | null
  checkPlayer(player, playerActive) {
    if (!playerActive) { this.nearMissEvents.length = 0; return null; }
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
    let result = null;
    for (const car of this.cars) {
      if (!car.active) continue;
      const dx = px - car.x, dz = pz - car.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 900) { car.nearMissed = false; continue; }
      if (Math.abs(py - car.y) > 3) continue;
      const dl = Math.hypot(car.dx, car.dz) || 1;
      const fx = car.dx / dl, fz = car.dz / dl;
      const along = dx * fx + dz * fz; // player pos along car axis
      const ac = clamp(along, -car.len / 2 - 0.2, car.len / 2 + 0.2);
      const cx = car.x + fx * ac, cz = car.z + fz * ac;
      const d = Math.hypot(px - cx, pz - cz);
      if (d < car.width / 2 + 0.5) {
        // true closing speed: |v_player_vec - v_car_vec|. The old sign trick turned
        // every same-direction rear-end into a head-on and made traffic unsurvivable.
        const pvx = -Math.sin(player.heading) * player.v, pvz = -Math.cos(player.heading) * player.v;
        const cvx = fx * car.v, cvz = fz * car.v;
        const rel = Math.hypot(pvx - cvx, pvz - cvz);
        const side = (dx * -fz + dz * fx);
        if (rel > this.crashRel) {
          result = { type: 'crash', relSpeed: rel, car, nx: (px - cx) / (d || 1), nz: (pz - cz) / (d || 1) };
          break;
        } else {
          // scrape: push aside, slow down
          player.pos.x = cx + (px - cx) / (d || 1) * (car.width / 2 + 0.55);
          player.pos.z = cz + (pz - cz) / (d || 1) * (car.width / 2 + 0.55);
          player.v *= 0.78;
          player.shake = Math.max(player.shake, 0.4);
          if (!car._scrapeT || performance.now() - car._scrapeT > 800) {
            car._scrapeT = performance.now();
            result = { type: 'scrape', relSpeed: rel, car };
          }
        }
      } else if (d < 3.4 && player.v > 15 && !car.nearMissed) {
        car.nearMissed = true;
        this.nearMissEvents.push({ car, side: Math.sign((dx * -fz + dz * fx)) || 1 });
      } else if (d > 7) {
        car.nearMissed = false;
      }
    }
    return result;
  }
}
