// terrain.js — heightfield shaped by the real coastline + road flattening
import * as THREE from 'three';
import { Grid, clamp, lerp, smoothstep, fbm, CFG, distPointToSeg } from './util.js';
import { TEX } from './textures.js';

const W = CFG.world;

export class Terrain {
  constructor(map) {
    this.map = map;
    this.elevationGrid = map.elevationGrid || null;
    this.routeElevation = Array.isArray(map.routeElevation) && map.routeElevation.length === map.route.length
      ? map.routeElevation : null;
    this.routeElevationOffsets = Array.isArray(map.routeElevationOffsets) ? map.routeElevationOffsets : null;
    this.routeElevationCross = Array.isArray(map.routeElevationCross) && map.routeElevationCross.length === map.route.length
      ? map.routeElevationCross : null;
    this.routeElevationGrid = new Grid(40);
    if (this.routeElevation) {
      map.route.forEach((p, i) => this.routeElevationGrid.insert(p[0], p[1], {
        x: p[0], z: p[1], e: this.routeElevation[i], i,
      }));
    }
    this.buildCoastGrid(map.coast);
    this.buildGreenGrid(map.green, map.water);
    this.computeRoadProfiles(map.roads);
    this.enforceRouteDescent(map);
    this.buildRoadGrid(map.roads);
    // Graded building pads: a real church, school or forecourt is levelled before it
    // is built on, and the ground is battered back out to the natural slope around it.
    // Registered before buildMesh() so the drawn triangles carry the grading too —
    // otherwise a flat lawn disc floats over a 6 m hillside and the congregation
    // stands in mid-air on one side of it and up to its knees on the other.
    this.pads = [];
  }

  // { x, z, r, feather, y } — level inside r, feathered out to the natural surface
  // over the next `feather` metres. Must be added before buildMesh().
  addPad(pad) {
    this.pads.push(pad);
    return pad;
  }

  // buildMesh() runs this ~200k times and several systems call it every frame, so the
  // reject is a squared comparison and the square root only happens for a sample that
  // is actually inside a pad.
  applyPads(x, z, h) {
    for (const p of this.pads) {
      const dx = x - p.x, dz = z - p.z;
      const reach = p.r + p.feather;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach) continue;
      h = lerp(h, p.y, 1 - smoothstep(p.r, reach, Math.sqrt(d2)));
    }
    return h;
  }

  // ---- coastline: precomputed signed distance field (chamfer transform) ----
  // this OSM extract: land on the RIGHT of directed coastline ways
  buildCoastGrid(coast) {
    const cs = 15;
    this.fieldCS = cs;
    const W = CFG.world;
    this.fx0 = W.terrainMinX - 300; this.fz0 = W.terrainMinZ - 300;
    const fx1 = W.terrainMaxX + 300, fz1 = W.terrainMaxZ + 300;
    const fnx = Math.ceil((fx1 - this.fx0) / cs) + 1;
    const fnz = Math.ceil((fz1 - this.fz0) / cs) + 1;
    this.fnx = fnx; this.fnz = fnz;
    const field = new Float32Array(fnx * fnz).fill(1e9);

    const cellIdx = (x, z) => {
      const i = Math.floor((x - this.fx0) / cs), j = Math.floor((z - this.fz0) / cs);
      if (i < 0 || j < 0 || i >= fnx || j >= fnz) return -1;
      return j * fnx + i;
    };

    // seed cells near each segment with exact signed distance
    const segs = [];
    for (const way of coast) {
      for (let i = 0; i < way.length - 1; i++) {
        const ax = way[i][0], az = way[i][1], bx = way[i + 1][0], bz = way[i + 1][1];
        if (!isFinite(ax) || !isFinite(az)) continue;
        const s = [ax, az, bx, bz];
        segs.push(s);
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(len / 6));
        for (let t = 0; t <= steps; t++) {
          const px = ax + (bx - ax) * t / steps, pz = az + (bz - az) * t / steps;
          const ci = Math.floor((px - this.fx0) / cs), cj = Math.floor((pz - this.fz0) / cs);
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj;
            if (i < 0 || j < 0 || i >= fnx || j >= fnz) continue;
            const cx = this.fx0 + (i + 0.5) * cs, cz = this.fz0 + (j + 0.5) * cs;
            const { d } = distPointToSeg(cx, cz, ax, az, bx, bz);
            const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
            const sd = (cross > 0 ? -1 : 1) * d;
            const idx = j * fnx + i;
            if (Math.abs(sd) < Math.abs(field[idx])) field[idx] = sd;
          }
        }
      }
    }

    // chamfer propagation (signed): forward + backward passes
    const W1 = cs, W2 = cs * Math.SQRT2;
    const better = (cur, cand) => Math.abs(cand) < Math.abs(cur) ? cand : cur;
    for (let j = 0; j < fnz; j++) for (let i = 0; i < fnx; i++) {
      const idx = j * fnx + i;
      let v = field[idx];
      if (i > 0) v = better(v, field[idx - 1] + Math.sign(field[idx - 1] || 1) * W1);
      if (j > 0) v = better(v, field[idx - fnx] + Math.sign(field[idx - fnx] || 1) * W1);
      if (i > 0 && j > 0) v = better(v, field[idx - fnx - 1] + Math.sign(field[idx - fnx - 1] || 1) * W2);
      if (i < fnx - 1 && j > 0) v = better(v, field[idx - fnx + 1] + Math.sign(field[idx - fnx + 1] || 1) * W2);
      field[idx] = v;
    }
    for (let j = fnz - 1; j >= 0; j--) for (let i = fnx - 1; i >= 0; i--) {
      const idx = j * fnx + i;
      let v = field[idx];
      if (i < fnx - 1) v = better(v, field[idx + 1] + Math.sign(field[idx + 1] || 1) * W1);
      if (j < fnz - 1) v = better(v, field[idx + fnx] + Math.sign(field[idx + fnx] || 1) * W1);
      if (i < fnx - 1 && j < fnz - 1) v = better(v, field[idx + fnx + 1] + Math.sign(field[idx + fnx + 1] || 1) * W2);
      if (i > 0 && j < fnz - 1) v = better(v, field[idx + fnx - 1] + Math.sign(field[idx + fnx - 1] || 1) * W2);
      field[idx] = v;
    }
    this.field = field;
    this.coastSegs = segs;
  }

  seaSignedDist(x, z) {
    // bilinear sample of the signed distance field
    const gx = (x - this.fx0) / this.fieldCS - 0.5;
    const gz = (z - this.fz0) / this.fieldCS - 0.5;
    const i0 = Math.floor(gx), j0 = Math.floor(gz);
    const tx = clamp(gx - i0, 0, 1), tz = clamp(gz - j0, 0, 1);
    const get = (i, j) => {
      i = clamp(i, 0, this.fnx - 1); j = clamp(j, 0, this.fnz - 1);
      return this.field[j * this.fnx + i];
    };
    const a = get(i0, j0), b = get(i0 + 1, j0), c = get(i0, j0 + 1), d = get(i0 + 1, j0 + 1);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  buildGreenGrid(green, water) {
    this.greenGrid = new Grid(60);
    for (const poly of green) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of poly.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      this.greenGrid.insertAABB(x0, z0, x1, z1, { poly: poly.p, k: poly.k, x0, x1, z0, z1 });
    }
    this.waterPolys = water;
  }

  greenAt(x, z) {
    for (const g of this.greenGrid.query(x, z, 60)) {
      if (x < g.x0 || x > g.x1 || z < g.z0 || z > g.z1) continue;
      let inside = false;
      const pts = g.poly;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
        if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
      }
      if (inside) return g.k;
    }
    return null;
  }

  surveyedElevationNear(x, z) {
    if (!this.routeElevation) return null;
    let best = null, bestD = Infinity;
    for (let radius = 40; radius <= 280; radius += 40) {
      for (const p of this.routeElevationGrid.query(x, z, radius)) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD < radius - 40) break;
    }
    if (!best) return null;
    const route = this.map.route;
    const a = route[Math.max(0, best.i - 1)], b = route[Math.min(route.length - 1, best.i + 1)];
    const tx0 = b[0] - a[0], tz0 = b[1] - a[1], len = Math.hypot(tx0, tz0) || 1;
    const nx = -tz0 / len, nz = tx0 / len;
    const lat = (x - best.x) * nx + (z - best.z) * nz;
    let elevation = best.e;
    const offsets = this.routeElevationOffsets;
    const row = this.routeElevationCross?.[best.i];
    if (offsets && row && offsets.length === row.length && offsets.length > 1) {
      if (lat <= offsets[0]) elevation = row[0];
      else if (lat >= offsets[offsets.length - 1]) elevation = row[row.length - 1];
      else {
        let lo = 0;
        while (lo < offsets.length - 2 && offsets[lo + 1] < lat) lo++;
        const f = (lat - offsets[lo]) / Math.max(0.001, offsets[lo + 1] - offsets[lo]);
        elevation = lerp(row[lo], row[lo + 1], f);
      }
    }
    return { e: elevation, roadE: best.e, d: Math.abs(lat), lat, i: best.i };
  }

  applyRouteSurvey(x, z, h) {
    const elevation = this.elevationGrid?.sample(x, z);
    if (elevation != null) {
      const edge = this.elevationGrid.edgeDistance(x, z);
      if (edge >= 45) return elevation;
      const survey = this.surveyedElevationNear(x, z);
      const fallback = survey && survey.d < 220 ? lerp(survey.e, h, smoothstep(180, 220, survey.d)) : h;
      return lerp(fallback, elevation, smoothstep(0, 45, edge));
    }
    const survey = this.surveyedElevationNear(x, z);
    if (!survey || survey.d >= 220) return h;
    // The 1 m HRDEM cross-sections cover the entire visible street corridor. Keep the
    // surveyed surface intact through the lots, then feather only its outermost 40 m
    // into the procedural world beyond the captured strip.
    return lerp(survey.e, h, smoothstep(180, 220, survey.d));
  }

  // Adjacent carriageway elevation, used by real sites that are level with the road.
  // This deliberately returns the centreline value, not the terrain under the lot.
  routeLevelNear(x, z) {
    const survey = this.surveyedElevationNear(x, z);
    return survey ? survey.roadE + 0.07 : null;
  }

  // ---- base height (without roads) ----
  baseHeight(x, z) {
    const d = this.seaSignedDist(x, z);
    if (d < 0) { // offshore shelf
      return -1.4 - Math.min(22, -d * 0.035) - fbm(x * 0.004, z * 0.004, 3) * 3;
    }
    if (d < 26) { // beach
      // The ocean plane sits at y=0.42, so the foreshore has to climb above it within
      // a few metres — otherwise whole blocks of real houses render half-submerged.
      // let the waterline itself sit just under the ocean plane so the sea laps over
      // wet sand; the climb inland is what keeps buildings out of the water
      const h = 0.05 + d * 0.115 + fbm(x * 0.02, z * 0.02, 3) * 0.7 * smoothstep(6, 26, d);
      return this.applyRouteSurvey(x, z, h);
    }
    const inland = d - 26;
    let h = 2.2 + inland * 0.0265;
    const macro = fbm(x * 0.0016 + 13.7, z * 0.0016 + 7.3, 4); // rolling hills
    h += (macro - 0.42) * 46;
    const bump = (fbm(x * 0.012, z * 0.012, 3) - 0.5) * 5.5 * smoothstep(20, 90, d);
    h += bump;
    h = Math.max(0.85, h);            // never let inland ground fall under the sea plane
    return this.applyRouteSurvey(x, z, Math.min(h, 150));
  }

  // ---- road elevation profiles: sample base terrain, smooth longitudinally ----
  computeRoadProfiles(roads) {
    for (const r of roads) {
      const pts = r.p, n = pts.length;
      const e = new Array(n);
      for (let i = 0; i < n; i++) e[i] = this.baseHeight(pts[i][0], pts[i][1]);
      // iterative smoothing + grade clamp
      for (let pass = 0; pass < 3; pass++) {
        const s = e.slice();
        for (let i = 1; i < n - 1; i++) {
          e[i] = s[i - 1] * 0.25 + s[i] * 0.5 + s[i + 1] * 0.25;
        }
      }
      // clamp max grade to 9%
      for (let i = 1; i < n; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const maxD = seg * 0.09 + 0.05;
        const d = e[i] - e[i - 1];
        if (d > maxD) e[i] = e[i - 1] + maxD;
        else if (d < -maxD) e[i] = e[i - 1] - maxD;
      }
      for (let i = n - 2; i >= 0; i--) {
        const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const maxD = seg * 0.09 + 0.05;
        const d = e[i] - e[i + 1];
        if (d > maxD) e[i] = e[i + 1] + maxD;
      }
      if (r.br && r.l) {
        const lift = Math.abs(r.l) * 5.5;
        for (let i = 0; i < n; i++) e[i] += lift;
      }
      r.e = e;
      // cumulative length
      r.cum = [0];
      for (let i = 1; i < n; i++) r.cum.push(r.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
  }

  // Use a sampled geographic elevation profile for the entire race line. The road
  // falls strongly overall, but Street View and the DEM both show short level/rising
  // blocks; forcing a mathematically monotonic descent erased those real grades.
  enforceRouteDescent(map) {
    const route = map.route;
    if (!route || route.length < 2) return;
    const target = this.routeElevation
      ? this.routeElevation.slice()
      : route.map(p => this.baseHeight(p[0], p[1]));
    // DEM samples are stepped at their native cell boundaries. Smooth those steps,
    // retaining the surveyed local rises while keeping motorcycle physics continuous.
    for (let pass = 0; pass < 2; pass++) {
      const cp = target.slice();
      for (let i = 1; i < target.length - 1; i++) target[i] = cp[i - 1] * 0.2 + cp[i] * 0.6 + cp[i + 1] * 0.2;
    }
    // Clamp only impossible spikes; do not force the sign of the grade.
    for (let i = 1; i < route.length; i++) {
      const seg = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
      const maxD = seg * 0.12 + 0.05;
      target[i] = clamp(target[i], target[i - 1] - maxD, target[i - 1] + maxD);
    }
    // The bay sits at y = 0.42. Forcing a pure descent walked the last kilometre of
    // road under the water plane and the sea drew straight over the asphalt by the
    // 7-Eleven, so hold the carriageway above sea level and let it simply level out.
    const SEA_ROAD_MIN = 1.35;
    for (let i = 0; i < target.length; i++) target[i] = Math.max(target[i], SEA_ROAD_MIN);
    for (let i = 0; i < target.length; i++) target[i] = Math.max(target[i], SEA_ROAD_MIN);
    this.routeDescent = { pts: route, e: target };

    // pull every road point that sits on the race line onto that profile
    const near = (x, z) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < route.length; i++) {
        const d = (route[i][0] - x) ** 2 + (route[i][1] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return { i: best, d: Math.sqrt(bd) };
    };
    for (const r of map.roads) {
      if (!r.e) continue;
      let touched = false;
      for (let i = 0; i < r.p.length; i++) {
        const { i: ri, d } = near(r.p[i][0], r.p[i][1]);
        if (d > 18) continue;
        const w = smoothstep(18, 4, d);
        r.e[i] = lerp(r.e[i], target[ri], w);
        touched = true;
      }
      if (touched) {
        for (let pass = 0; pass < 2; pass++) {
          const cp = r.e.slice();
          for (let i = 1; i < r.e.length - 1; i++) r.e[i] = cp[i - 1] * 0.25 + cp[i] * 0.5 + cp[i + 1] * 0.25;
        }
      }
    }
  }

  buildRoadGrid(roads) {
    this.roadGrid = new Grid(24);
    for (const r of roads) {
      const pts = r.p;
      for (let i = 0; i < pts.length - 1; i++) {
        const s = {
          ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1],
          ea: r.e[i], eb: r.e[i + 1], hw: r.w / 2, layer: r.l || 0, name: r.n, class: r.c,
        };
        this.roadGrid.insertAABB(Math.min(s.ax, s.bx) - 1, Math.min(s.az, s.bz) - 1, Math.max(s.ax, s.bx) + 1, Math.max(s.az, s.bz) + 1, s);
      }
    }
  }

  // nearest road segment info
  nearestRoad(x, z) {
    let best = null, bestD = Infinity;
    for (let r = 1; r <= 4; r++) {
      const cand = this.roadGrid.query(x, z, r * 24);
      for (const s of cand) {
        const { d } = distPointToSeg(x, z, s.ax, s.az, s.bx, s.bz);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best && bestD < (r - 1) * 24) break;
    }
    return best ? { seg: best, d: bestD } : null;
  }

  // ---- final ground height: base terrain conformed to roads ----
  groundHeight(x, z) {
    let h = this.baseHeight(x, z);
    // grading first, roads second: where a pad reaches the carriageway the deck still
    // wins, so levelling a lawn can never lift grass over the asphalt beside it
    if (this.pads && this.pads.length) h = this.applyPads(x, z, h);
    const nr = this.nearestRoad(x, z);
    const apron = this.elevationGrid?.sample(x,z) != null ? 7 : 15;
    if (nr && nr.d < nr.seg.hw + apron) {
      // Carve the ground below the deck, not level with it. The terrain grid is ~15 m
      // per cell, so a surface that only just touches the road interpolates *above* it
      // between samples and grass ends up covering the asphalt.
      const t = smoothstep(nr.seg.hw + apron, nr.seg.hw + 1.5, nr.d);
      const { t: st } = distPointToSeg(x, z, nr.seg.ax, nr.seg.az, nr.seg.bx, nr.seg.bz);
      let roadE = lerp(nr.seg.ea, nr.seg.eb, st);
      // Where roads meet, the nearest one is not always the lowest: an adjacent deck
      // can hold the ground above its neighbour and grass creeps over the asphalt.
      // Take the lowest deck that actually covers this point.
      for (const sg of this.roadGrid.query(x, z, 26)) {
        if (sg === nr.seg) continue;
        const q = distPointToSeg(x, z, sg.ax, sg.az, sg.bx, sg.bz);
        if (q.d > sg.hw + 3) continue;
        const e = lerp(sg.ea, sg.eb, q.t);
        if (e < roadE) roadE = e;
      }
      h = lerp(h, roadE - 0.4, t);
    }
    return h;
  }

  // ---- the visible top surface, which is not groundHeight() ----
  // groundHeight() deliberately carves the terrain 0.4 m *below* the road deck so grass
  // can never interpolate up over the asphalt. Anything that stands on, walks on or is
  // painted onto the surface has to use the deck itself, or it sinks out of sight —
  // that is what buried the school crosswalk and put pedestrians under the road.
  roadDeck(x, z) {
    const nr = this.nearestRoad(x, z);
    if (!nr) return null;
    const { t } = distPointToSeg(x, z, nr.seg.ax, nr.seg.az, nr.seg.bx, nr.seg.bz);
    return { y: lerp(nr.seg.ea, nr.seg.eb, t) + 0.07, d: nr.d, hw: nr.seg.hw };  // +0.07 = roads.js deck offset
  }

  // Physical support uses the same triangles as the road/curb/sidewalk meshes.
  registerGroundGeometry(geometry) {
    this.contactGrid ||= new Grid(12);
    const a=geometry.attributes.position,index=geometry.index;
    const count=index?index.count:a.count;
    for(let i=0;i<count;i+=3){
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
      const v=ids.map(j=>[a.getX(j),a.getY(j),a.getZ(j)]);
      const den=(v[1][2]-v[2][2])*(v[0][0]-v[2][0])+(v[2][0]-v[1][0])*(v[0][2]-v[2][2]);
      if(Math.abs(den)<1e-9)continue;
      this.contactGrid.insertAABB(Math.min(...v.map(p=>p[0])),Math.min(...v.map(p=>p[2])),Math.max(...v.map(p=>p[0])),Math.max(...v.map(p=>p[2])),{v,den});
    }
  }

  renderedGroundHeight(x,z) {
    let y=this.meshHeight(x,z) ?? this.groundHeight(x,z);
    if(this.contactGrid){
      for(const {v,den} of this.contactGrid.query(x,z,.01)){
        const u=((v[1][2]-v[2][2])*(x-v[2][0])+(v[2][0]-v[1][0])*(z-v[2][2]))/den;
        const w=((v[2][2]-v[0][2])*(x-v[2][0])+(v[0][0]-v[2][0])*(z-v[2][2]))/den;
        if(u>=-1e-7&&w>=-1e-7&&u+w<=1+1e-7)y=Math.max(y,u*v[0][1]+w*v[1][1]+(1-u-w)*v[2][1]);
      }
    }else{
      const rd=this.roadDeck(x,z);if(rd&&rd.d<=rd.hw)y=Math.max(y,rd.y);
    }
    return y;
  }

  surfaceHeight(x, z) {
    const rd = this.roadDeck(x, z);
    if (rd && rd.d < rd.hw + 0.7) return rd.y;
    return this.groundHeight(x, z);
  }

  // ---- the height the terrain is actually *drawn* at ----
  // buildMesh() samples groundHeight() onto a ~15 m grid and lets the triangles
  // interpolate in between. Near a road groundHeight() dives 0.4 m under the deck, so
  // between two samples the drawn surface sits well above the analytic value — stand a
  // pedestrian at groundHeight() there and they are buried to the shins in a hillside
  // that is not really where the maths says it is. This reads the same triangles the
  // eye sees, out of the cache buildMesh() leaves behind.
  meshHeight(x, z) {
    const fine = this.detailGrid;
    const useFine = fine && x >= fine.x0 && x <= fine.x1 && z >= fine.z0 && z <= fine.z1;
    return this.gridHeight(x,z,useFine ? fine : this.meshGrid,useFine ? this.detailHeights : this.meshHeights);
  }

  gridHeight(x,z,grid,h) {
    if (!h || !grid) return null;
    const { sx, sz, x0, z0, dx, dz, nx } = grid;
    const fi = clamp((x - x0) / dx, 0, sx), fj = clamp((z - z0) / dz, 0, sz);
    const i = Math.min(sx - 1, Math.floor(fi)), j = Math.min(sz - 1, Math.floor(fj));
    const tx = fi - i, tz = fj - j;
    const a = h[j * nx + i], b = h[j * nx + i + 1];
    const c = h[(j + 1) * nx + i], d = h[(j + 1) * nx + i + 1];
    // buildMesh indexes each cell as (a,c,b) and (b,c,d): the split runs b-c
    return tx + tz <= 1
      ? a + tx * (b - a) + tz * (c - a)
      : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
  }

  // terrain-only height (for placing objects that must not ride road flattening)
  groundNormalY(x, z) {
    const e = 1.4;
    const hx = this.groundHeight(x + e, z) - this.groundHeight(x - e, z);
    const hz = this.groundHeight(x, z + e) - this.groundHeight(x, z - e);
    const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize();
    return n;
  }

  buildMesh() {
    const dx=(W.terrainMaxX-W.terrainMinX)/W.segX, dz=(W.terrainMaxZ-W.terrainMinZ)/W.segZ;
    // The rectangle snaps to coarse cell edges; detail vertices on the perimeter
    // interpolate those same coarse triangles, avoiding gaps/T-junction cracks.
    let detail=null;
    if(this.elevationGrid) {
      const e=this.elevationGrid;
      const i0=Math.ceil((e.x0+65-W.terrainMinX)/dx), i1=Math.floor((e.x1-65-W.terrainMinX)/dx);
      const j0=Math.ceil((e.z0+65-W.terrainMinZ)/dz), j1=Math.floor((e.z1-65-W.terrainMinZ)/dz);
      detail={i0,i1,j0,j1,x0:W.terrainMinX+i0*dx,x1:W.terrainMinX+i1*dx,z0:W.terrainMinZ+j0*dz,z1:W.terrainMinZ+j1*dz,sx:(i1-i0)*4,sz:(j1-j0)*4};
    }
    this.detailBounds=detail;
    const coarse=this.buildGridMesh({sx:W.segX,sz:W.segZ,x0:W.terrainMinX,x1:W.terrainMaxX,z0:W.terrainMinZ,z1:W.terrainMaxZ},false);
    if(!detail)return coarse;
    const fine=this.buildGridMesh(detail,true);
    const group=new THREE.Group();group.name='LiDAR terrain with detailed road corridor';group.add(coarse,fine);return group;
  }

  buildGridMesh(bounds,isDetail) {
    const {sx,sz,x0,x1,z0,z1}=bounds;
    const nx = sx + 1, nz = sz + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const dx = (x1 - x0) / sx, dz = (z1 - z0) / sz;
    const cSand = new THREE.Color('#c9b586'), cGrass1 = new THREE.Color('#5d7c40'), cGrass2 = new THREE.Color('#6f8f4a');
    const cForest = new THREE.Color('#41602f'), cRock = new THREE.Color('#8a8276'), cSea = new THREE.Color('#53705e');
    const cWet = new THREE.Color('#8a7a5c');
    const tmp = new THREE.Color();
    const heights = new Float32Array(nx * nz);
    const sds = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * dx, z = z0 + j * dz;
        const idx = j * nx + i;
        let h=this.groundHeight(x,z);
        if(isDetail) {
          const edge=Math.min(x-x0,x1-x,z-z0,z1-z);
          if(edge<12)h=lerp(this.gridHeight(x,z,this.meshGrid,this.meshHeights),h,smoothstep(0,12,edge));
        }
        heights[idx] = h;
        sds[idx] = this.seaSignedDist(x, z);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * dx, z = z0 + j * dz;
        const idx = j * nx + i;
        const h = heights[idx];
        pos[idx * 3] = x; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = z;
        uv[idx * 2] = i * dx / 7; uv[idx * 2 + 1] = j * dz / 7;
        const d = sds[idx];
        const n1 = fbm(x * 0.01 + 3, z * 0.01, 3);
        // slope from grid neighbors
        const hR = heights[j * nx + Math.min(nx - 1, i + 2)];
        const hU = heights[Math.min(nz - 1, j + 2) * nx + i];
        const slope = Math.max(Math.abs(hR - h), Math.abs(hU - h)) / (2 * dx);
        if (h < -0.4) {
          tmp.copy(cSea).multiplyScalar(0.55 + n1 * 0.2);
        } else if (d < 26 + n1 * 10) {
          // wet sand at the water line drying out up the beach, with a ragged
          // noise-driven edge instead of one hard polygon diagonal
          tmp.copy(cSand).multiplyScalar(0.85 + n1 * 0.3);
          const wet = 1 - smoothstep(0, 9 + n1 * 6, d);
          tmp.lerp(cWet, wet * 0.85);
          const grass = smoothstep(16, 30 + n1 * 12, d);
          tmp.lerp(cGrass1, grass * 0.55);
        } else {
          tmp.copy(cGrass1).lerp(cGrass2, n1);
          const g = this.greenAt(x, z);
          if (g === 'forest' || (x > 800 && d > 40)) tmp.lerp(cForest, 0.55 + n1 * 0.25);
          if (slope > 0.5) tmp.lerp(cRock, smoothstep(0.5, 0.9, slope));
        }
        col[idx * 3] = tmp.r; col[idx * 3 + 1] = tmp.g; col[idx * 3 + 2] = tmp.b;
      }
    }
    // keep the sampled grid: meshHeight() reads it so anything that walks on the
    // terrain stands on the triangles that are drawn rather than the analytic surface
    const grid={sx,sz,x0,x1,z0,z1,dx,dz,nx};
    if(isDetail){this.detailHeights=heights;this.detailGrid=grid;}
    else {this.meshHeights=heights;this.meshGrid=grid;}
    const idxArr = [];
    for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) {
      const hole=this.detailBounds;
      if(!isDetail && hole && i>=hole.i0 && i<hole.i1 && j>=hole.j0 && j<hole.j1)continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d2 = c + 1;
      idxArr.push(a, c, b, b, c, d2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: TEX.groundDetail, vertexColors: true, roughness: 1.0, metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
