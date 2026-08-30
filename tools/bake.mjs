// bake.mjs — convert Overpass JSON into game-ready map.json
// Coordinate system: meters, origin at ORIGIN lat/lon.
//   x = east, z = -north  (so north is -z, standard three.js ground plane)
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = { lat: 49.1965, lon: -123.9600 };
const M_PER_DEG_LAT = 110946.0;
const M_PER_DEG_LON = 111319.5 * Math.cos(ORIGIN.lat * Math.PI / 180);

const raw = JSON.parse(readFileSync(new URL('../data/osm_raw.json', import.meta.url), 'utf8'));

function toLocal(lat, lon) {
  return [
    +( (lon - ORIGIN.lon) * M_PER_DEG_LON ).toFixed(2),
    +( -(lat - ORIGIN.lat) * M_PER_DEG_LAT ).toFixed(2),
  ];
}

// ---------- helpers ----------
function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]);
  }
  return Math.abs(a / 2);
}
function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}
// Douglas-Peucker simplification on 2D points
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], az = pts[a][1];
    const bx = pts[b][0], bz = pts[b][1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      let d2;
      if (len2 === 0) {
        d2 = (pts[i][0] - ax) ** 2 + (pts[i][1] - az) ** 2;
      } else {
        let t = ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        d2 = (pts[i][0] - ax - t * dx) ** 2 + (pts[i][1] - az - t * dz) ** 2;
      }
      if (d2 > maxD) { maxD = d2; maxI = i; }
    }
    if (maxD > eps * eps) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function dedupe(pts, minD = 1.2) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], q = out[out.length - 1];
    if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > minD * minD) out.push(p);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const ROAD_W = {
  motorway: 15, motorway_link: 8, trunk: 14.5, trunk_link: 8.5,
  primary: 11, primary_link: 7, secondary: 9.5, secondary_link: 6.5,
  tertiary: 8.5, residential: 7, unclassified: 6.5, service: 4.2, footway: 1.8,
};

const roads = [], buildings = [], coast = [], piers = [], green = [], water = [], pois = [];
const namedBuildings = [];

for (const el of raw.elements) {
  if (el.type !== 'way' || !el.geometry) continue;
  const t = el.tags || {};
  let pts = el.geometry.filter(g => g).map(g => toLocal(g.lat, g.lon));
  if (pts.length < 2) continue;
  const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.5;
  if (closed) pts = [...pts, pts[0]];

  if (t.highway) {
    const w = ROAD_W[t.highway] || 6;
    const lanes = parseInt(t.lanes || '0', 10);
    const width = t.width ? Math.max(3, Math.min(20, parseFloat(t.width))) : (lanes > 1 ? lanes * 3.4 + 1 : w);
    roads.push({
      n: t.name || null, c: t.highway, w: +width.toFixed(1),
      o: t.oneway === 'yes' ? 1 : 0,
      l: parseInt(t.layer || '0', 10) || 0,
      br: t.bridge === 'yes' ? 1 : 0,
      p: simplify(dedupe(pts, 2), 0.6),
    });
  } else if (t.building !== undefined) {
    if (!closed) continue;
    const poly = pts.slice(0, -1);
    if (polyArea(poly) < 8) continue;
    let h = parseFloat(t.height || '0') || 0;
    if (!h) {
      const lv = parseFloat(t['building:levels'] || '0') || 0;
      if (lv) h = lv * 3.3 + 1.2;
    }
    const type = t.building;
    if (!h) h = { house: 4.6, detached: 4.6, semidetached_house: 4.6, residential: 5.5, apartments: 11, commercial: 6.5, retail: 6, mall: 9, hotel: 14, church: 11, school: 7.5, hospital: 14, industrial: 7, warehouse: 8, barn: 5.5, garage: 3, roof: 3, yes: 5 }[type] || 5;
    h = Math.min(60, h);
    buildings.push({ p: simplify(poly, 0.45), h: +h.toFixed(1), t: type, n: t.name || null });
    if (t.name) namedBuildings.push(`${t.name} [${type}] h=${h.toFixed(1)}`);
  } else if (t.natural === 'coastline') {
    coast.push(pts);
  } else if (t.man_made === 'pier') {
    piers.push({ w: parseFloat(t.width || '4') || 4, p: pts });
  } else if (t.leisure || t.landuse) {
    if (!closed) continue;
    green.push({ k: t.leisure || t.landuse, p: pts.slice(0, -1) });
  } else if (t.natural === 'water') {
    if (!closed) continue;
    water.push(pts.slice(0, -1));
  }
}

for (const el of raw.elements) {
  if (el.type !== 'node') continue;
  const t = el.tags || {};
  if (t.amenity === 'fuel' || t.amenity === 'ferry_terminal' || t.shop || t.tourism) {
    pois.push({ k: t.amenity || t.shop || t.tourism, n: t.name || t.brand || null, p: toLocal(el.lat, el.lon) });
  }
}

// ---------- Departure Bay Road: exact centreline from the OSM node graph ----------
// Walk the way graph by shared node ids (not by nearest endpoints) so the racing
// line follows the real road, in order, with no jumps between carriageways.
const DBR_NAME = 'Departure Bay Road';
const dbrWays = raw.elements.filter(el =>
  el.type === 'way' && el.geometry && el.nodes && el.tags && el.tags.name === DBR_NAME);

const adj = new Map();          // node id -> way indices that start/end there
dbrWays.forEach((w, i) => {
  for (const n of [w.nodes[0], w.nodes.at(-1)]) {
    if (!adj.has(n)) adj.set(n, []);
    adj.get(n).push(i);
  }
});
// the single free end is the Norwell Drive / Island Highway junction by Country Club Centre
const endpointNodes = [...adj.entries()].filter(([, list]) => list.length === 1).map(([n]) => n);
const startNode = endpointNodes[0];

const walkNodes = [startNode];   // node ids in travel order
const walkPts = [];              // matching local-metre points
{
  const firstWay = dbrWays[adj.get(startNode)[0]];
  const fi = firstWay.nodes[0] === startNode ? 0 : firstWay.nodes.length - 1;
  walkPts.push(toLocal(firstWay.geometry[fi].lat, firstWay.geometry[fi].lon));
}
const usedWays = new Set();
let cursor = startNode;
while (true) {
  const opts = (adj.get(cursor) || []).filter(i => !usedWays.has(i));
  if (!opts.length) break;
  // prefer the two-way carriageway; the one-way couplet at the far end is a loop
  opts.sort((x, y) => (dbrWays[x].tags.oneway === 'yes' ? 1 : 0) - (dbrWays[y].tags.oneway === 'yes' ? 1 : 0));
  const wi = opts[0];
  usedWays.add(wi);
  const w = dbrWays[wi];
  const forward = w.nodes[0] === cursor;
  const nodes = forward ? w.nodes : [...w.nodes].reverse();
  const geom = forward ? w.geometry : [...w.geometry].reverse();
  for (let i = 1; i < nodes.length; i++) {
    walkNodes.push(nodes[i]);
    walkPts.push(toLocal(geom[i].lat, geom[i].lon));
  }
  cursor = nodes.at(-1);
}

// junctions: every walk node another road also touches (used for side-road barriers)
const junctions = [];
{
  const byNode = new Map();
  for (const el of raw.elements) {
    if (el.type !== 'way' || !el.nodes || !el.tags || !el.tags.highway) continue;
    if (el.tags.name === DBR_NAME) continue;
    if (el.tags.highway === 'footway' || el.tags.highway === 'path' || el.tags.highway === 'steps') continue;
    for (const n of el.nodes) {
      if (!byNode.has(n)) byNode.set(n, []);
      // name only — falling back to the highway class produced signs reading
      // "SERVICE" / "SECONDARY_LINK" at real intersections
      byNode.get(n).push(el.tags.name || null);
    }
  }
  walkNodes.forEach((n, i) => {
    const names = byNode.get(n);
    if (!names || !walkPts[i]) return;
    const named = [...new Set(names.filter(Boolean))];
    junctions.push({ p: walkPts[i], i, n: named[0] || null });
  });
}

// resample the centreline to a fixed step so physics/AI sampling is uniform
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg < 1e-6) continue;
    let t = (step - carry) / seg;
    while (t <= 1) {
      out.push([+(ax + (bx - ax) * t).toFixed(2), +(az + (bz - az) * t).toFixed(2)]);
      t += step / seg;
      carry = 0;
    }
    carry += seg - Math.max(0, (Math.floor((seg + carry) / step) * step) - carry);
    carry = (carry % step + step) % step;
  }
  const last = pts.at(-1);
  if (Math.hypot(out.at(-1)[0] - last[0], out.at(-1)[1] - last[1]) > 1) out.push(last);
  return out;
}
const roadLine = resample(walkPts, 8);

// race section: Country Club Centre -> Departure Bay Beach (the parks on the water
// side at Bay Street). Beyond that the road keeps going and stays drivable, but the
// checkered flag is at the beach, matching the real "country club to the beach" run.
const beachAnchor = (() => {
  const parks = raw.elements.filter(el => el.type === 'way' && el.geometry && el.tags &&
    /Kinsmen Park|Departure Bay Centennial Park/i.test(el.tags.name || ''));
  if (!parks.length) return null;
  let sx = 0, sz = 0, n = 0;
  for (const pk of parks) for (const g of pk.geometry) { const q = toLocal(g.lat, g.lon); sx += q[0]; sz += q[1]; n++; }
  return [sx / n, sz / n];
})();
let raceEnd = roadLine.length - 1;
if (beachAnchor) {
  let bestD = Infinity;
  roadLine.forEach((p, i) => {
    const d = Math.hypot(p[0] - beachAnchor[0], p[1] - beachAnchor[1]);
    if (d < bestD) { bestD = d; raceEnd = i; }
  });
}
const route = roadLine.slice(0, raceEnd + 1);

// ---------- real street furniture (second Overpass pass: data/osm_extra.json) ----------
// Signals, stop signs, crosswalks and street lamps as actually mapped, kept only
// where they matter: within 40 m of the road centreline.
let signals = [], stops = [], crossings = [], lamps = [], osmTrees = [];
try {
  const extra = JSON.parse(readFileSync(new URL('../data/osm_extra.json', import.meta.url), 'utf8'));
  const nearLine = (p, maxD = 40) => {
    let best = Infinity;
    for (const q of roadLine) {
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best) <= maxD;
  };
  for (const el of extra.elements) {
    if (el.type !== 'node') continue;
    const t = el.tags || {};
    const p = toLocal(el.lat, el.lon);
    if (t.highway === 'traffic_signals' && nearLine(p, 45)) signals.push(p);
    else if (t.highway === 'stop' && nearLine(p, 45)) stops.push(p);
    else if (t.highway === 'crossing' && nearLine(p, 30)) crossings.push(p);
    else if (t.highway === 'street_lamp' && nearLine(p, 45)) lamps.push(p);
    else if (t.natural === 'tree' && nearLine(p, 60)) osmTrees.push(p);
  }
} catch {
  // optional dataset — the world still builds without it
}

// named landmarks we build by hand in the world
function wayCentroid(el) {
  let sx = 0, sz = 0;
  for (const g of el.geometry) { const q = toLocal(g.lat, g.lon); sx += q[0]; sz += q[1]; }
  return [+(sx / el.geometry.length).toFixed(2), +(sz / el.geometry.length).toFixed(2)];
}
const findNamed = (re, pred = () => true) => {
  const el = raw.elements.find(e => e.geometry && e.tags &&
    re.test((e.tags.name || e.tags.brand || '')) && pred(e));
  if (!el) return null;
  return { p: wayCentroid(el), poly: el.geometry.map(g => toLocal(g.lat, g.lon)) };
};
// the real Departure Bay branch sits on the water side of the road at Bay Street
const sevenEleven = findNamed(/^7-Eleven$/i, e => (e.tags.branch === 'Departure Bay') ||
  Math.hypot(wayCentroid(e)[0] + 765, wayCentroid(e)[1] + 1052) < 120);

// key POIs
// The forecourt at the top of Departure Bay Road is a Petro-Canada fuel island with
// a Circle K convenience store on the same lot: two separate OSM objects ~12 m apart.
const anchor = toLocal(49.2068, -124.0023);
const nearAnchor = (p, r = 60) => Math.hypot(p.p[0] - anchor[0], p.p[1] - anchor[1]) < r;
const circleKPoi = pois.find(p => /Circle ?K/i.test(p.n || '') && nearAnchor(p));
const fuelPoi = pois.find(p => /Petro-Canada/i.test(p.n || '') && nearAnchor(p))
  || pois.find(p => p.n === 'Petro-Canada' && p.p[1] < -900);
const circleK = circleKPoi || fuelPoi;
const fuelBrand = fuelPoi ? fuelPoi.n : null;
const berths = pois.filter(p => p.k === 'ferry_terminal' && /Berth/.test(p.n || ''));

const map = {
  origin: [ORIGIN.lat, ORIGIN.lon],
  circleK: circleK ? circleK.p : null,
  fuelStation: fuelPoi ? { p: fuelPoi.p, brand: fuelBrand } : null,
  berth: berths.length ? berths.map(b => b.p) : null,
  route,                       // race line: Country Club Centre -> Departure Bay Beach
  roadLine,                    // the whole real Departure Bay Road centreline
  junctions,                   // side roads meeting the centreline
  sevenEleven,                 // real 7-Eleven footprint at the beach
  signals, stops, crossings, lamps, osmTrees,
  beach: beachAnchor,
  roads, buildings, coast, piers, green, water, pois,
};

writeFileSync(new URL('../data/map.json', import.meta.url), JSON.stringify(map));
console.log(`roads: ${roads.length}, buildings: ${buildings.length}, coast: ${coast.length} ways, piers: ${piers.length}, green: ${green.length}, pois: ${pois.length}`);
const lineLen = (p) => p.reduce((a, q, i) => i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);
console.log(`road centreline: ${roadLine.length} pts, ${lineLen(roadLine).toFixed(0)} m`);
console.log(`race route: ${route.length} pts, ${lineLen(route).toFixed(0)} m, start ${route[0]} finish ${route.at(-1)}`);
console.log(`junctions on centreline: ${junctions.length}`);
console.log('7-Eleven:', sevenEleven && sevenEleven.p, ' beach anchor:', beachAnchor);
console.log('start forecourt: Circle K at', circleK && circleK.p, '| fuel brand', fuelBrand, fuelPoi && fuelPoi.p);
console.log(`street furniture: ${signals.length} signals, ${stops.length} stop signs, ${crossings.length} crossings, ${lamps.length} lamps, ${osmTrees.length} trees`);
console.log('named junctions:', junctions.filter(j => j.n).length, 'of', junctions.length);
console.log('berths:', berths.map(b => b.p));
console.log('named buildings sample:', namedBuildings.slice(0, 25));
