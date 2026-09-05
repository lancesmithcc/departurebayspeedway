// util.js — shared math, noise, spatial helpers + game tuning constants
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// deterministic hash noise
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4) {
  let f = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    f += amp * valueNoise(x, y);
    tot += amp; x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return f / tot; // 0..1
}

export function pointInPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

export function distPointToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const qx = ax + t * dx, qz = az + t * dz;
  return { d: Math.hypot(px - qx, pz - qz), t, qx, qz };
}

// uniform grid for point queries
export class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(cx, cz) { return cx * 100000 + cz; }
  insert(x, z, item) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    const k = this.key(cx, cz);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(item);
  }
  insertAABB(minX, minZ, maxX, maxZ, item) {
    const c0x = Math.floor(minX / this.cell), c1x = Math.floor(maxX / this.cell);
    const c0z = Math.floor(minZ / this.cell), c1z = Math.floor(maxZ / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const k = this.key(cx, cz);
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(item);
    }
  }
  query(x, z, r = 1) {
    const out = [];
    const c0x = Math.floor((x - r) / this.cell), c1x = Math.floor((x + r) / this.cell);
    const c0z = Math.floor((z - r) / this.cell), c1z = Math.floor((z + r) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const arr = this.map.get(this.key(cx, cz));
      if (arr) for (const it of arr) out.push(it);
    }
    return out;
  }
}

export const CFG = {
  player: {
    accel: 9.5, brake: 16, drag: 0.0007, vmax: 47, vmaxOffroad: 30,
    steer: 1.9, gravity: 15.5, hopV: 3.6, radius: 0.55,
  },
  world: {
    terrainMinX: -4150, terrainMaxX: 3850, terrainMinZ: -2850, terrainMaxZ: 3100,
    segX: 520, segZ: 386,
  },
  camera: { fovBase: 62, fovBoost: 16, dist: 6.8, height: 2.7 },
  sun: { elevation: 26, azimuth: 245 }, // warm late-afternoon light across the wooded descent
};
