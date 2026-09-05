// Reference-led corridor profile. Distances are metres from Norwell Drive.
// See docs/street-reference.md for observations and approximation boundaries.
export function routeStation(route, point) {
  let station = 0, best = Infinity, result = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (len * len || 1)));
    const d = Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
    if (d < best) { best = d; result = station + t * len; }
    station += len;
  }
  return result;
}
export function streetProfile(s) {
  return {
    center: s < 506 ? 'turn-lane' : s < 1450 ? 'single' : 'double',
    // White edge lines belong to the narrower residential/downhill run.
    edgeLines: s >= 506,
    sidewalkLeft: s < 506 || s >= 1450,
    sidewalkRight: s < 180 || (s >= 750 && s < 1450) || s >= 2580,
    utilitySide: 1,
    pedestrianRail: s >= 1159 && s <= 1240,
  };
}
export function applyStreetProfile(map) {
  for (const road of map.roads) {
    if (road.n !== 'Departure Bay Road') continue;
    road.stations = road.p.map(p => routeStation(map.route, p));
    // The upper residential road has a central two-way turning lane. The OSM
    // fallback classified this entire piece as the same 7.8 m two-lane road.
    if (Math.max(...road.stations) <= 507) road.w = 11.2;
  }
}
