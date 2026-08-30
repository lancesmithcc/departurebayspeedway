// corridor.js — the drivable ribbon along the real Departure Bay Road centreline.
// Everything the rider does happens between these two edges: side roads, driveways
// and fields are outside it, so the race stays on the actual road.
import { clamp } from './util.js';

export class Corridor {
  constructor(route, terrain, { openTailLength = 90 } = {}) {
    this.pts = route;
    this.terrain = terrain;
    this.cum = [0];
    for (let i = 1; i < route.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
    }
    this.total = this.cum[this.cum.length - 1];
    // the beach run-out is left open so the finish ramp is reachable
    this.openFrom = this.total - openTailLength;

    // per-point half width: the real road's half width plus a shoulder
    this.hw = route.map(([x, z]) => {
      const nr = terrain.nearestRoad(x, z);
      const base = nr ? nr.seg.hw : 5;
      // road half width plus a shoulder wide enough to swerve around oncoming traffic
      return clamp(base + 3.6, 7, 14);
    });
    // smooth the width so the rail doesn't step at every OSM width change
    for (let pass = 0; pass < 3; pass++) {
      const next = this.hw.slice();
      for (let i = 1; i < this.hw.length - 1; i++) next[i] = (this.hw[i - 1] + this.hw[i] * 2 + this.hw[i + 1]) / 4;
      this.hw = next;
    }
    // unit tangents / normals per point
    this.tan = route.map((p, i) => {
      const a = route[Math.max(0, i - 1)], b = route[Math.min(route.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      return [dx / len, dz / len];
    });
    this._last = 0;
    // Places the guardrail deliberately lets go of — the church lawn, where the whole
    // point is to leave the road and hit a bouncy castle.
    this.openZones = [];
  }

  addOpenZone(x, z, r) {
    this.openZones.push({ x, z, r });
  }

  inOpenZone(x, z) {
    for (const o of this.openZones) {
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return true;
    }
    return false;
  }

  normalAt(i) {
    const [tx, tz] = this.tan[i];
    return [-tz, tx];
  }

  // the racing line: right-hand lane, the way the road is actually driven here
  laneCenter(i) {
    const [nx, nz] = this.normalAt(i);
    const off = Math.min(3.4, this.hw[i] * 0.42);
    return [this.pts[i][0] + nx * off, this.pts[i][1] + nz * off];
  }

  edgePoint(i, side) {
    const [nx, nz] = this.normalAt(i);
    return [this.pts[i][0] + nx * side * this.hw[i], this.pts[i][1] + nz * side * this.hw[i]];
  }

  // nearest centreline sample, searched around the last hit so it stays O(1) in play
  project(x, z) {
    const n = this.pts.length;
    let best = this._last, bestD = Infinity;
    const scan = (from, to) => {
      for (let i = Math.max(0, from); i < Math.min(n, to); i++) {
        const d = (this.pts[i][0] - x) ** 2 + (this.pts[i][1] - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    scan(this._last - 40, this._last + 40);
    if (bestD > 90 * 90) { bestD = Infinity; scan(0, n); }   // lost: full search
    this._last = best;
    const [nx, nz] = this.normalAt(best);
    const lat = (x - this.pts[best][0]) * nx + (z - this.pts[best][1]) * nz;
    return { i: best, lat, hw: this.hw[best], s: this.cum[best], dist: Math.sqrt(bestD) };
  }

  // Full scan, no cached window. project() is tuned for the player walking along the
  // ribbon; bulk build-time queries arrive in arbitrary order and the cache guesses
  // wrong, which is how a roof ended up left hanging over the start line.
  projectExact(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.pts.length; i++) {
      const d = (this.pts[i][0] - x) ** 2 + (this.pts[i][1] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const [nx, nz] = this.normalAt(best);
    const lat = (x - this.pts[best][0]) * nx + (z - this.pts[best][1]) * nz;
    return { i: best, lat, hw: this.hw[best], s: this.cum[best], dist: Math.sqrt(bestD) };
  }

  // push a point back inside the ribbon; returns the corrected position + how hard it hit
  contain(x, z) {
    if (this.inOpenZone(x, z)) return null;             // church lawn: help yourself
    const pr = this.project(x, z);
    if (pr.s > this.openFrom) return null;              // beach run-out: no rail
    const limit = pr.hw;
    if (Math.abs(pr.lat) <= limit) return null;
    const [nx, nz] = this.normalAt(pr.i);
    const side = Math.sign(pr.lat);
    const over = Math.abs(pr.lat) - limit;
    return {
      x: x - nx * side * over,
      z: z - nz * side * over,
      nx: -nx * side, nz: -nz * side,
      over, i: pr.i,
    };
  }
}
