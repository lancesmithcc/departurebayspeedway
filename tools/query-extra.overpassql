// Second Overpass pass: street furniture that the main query does not carry.
// Fetch into data/osm_extra.json, then `npm run bake`:
//   curl -s -X POST -d @tools/query-extra.overpassql \
//     https://overpass-api.de/api/interpreter -o data/osm_extra.json
[out:json][timeout:60];
(
  node["highway"="traffic_signals"](49.178,-124.015,49.215,-123.905);
  node["highway"="stop"](49.178,-124.015,49.215,-123.905);
  node["highway"="crossing"](49.178,-124.015,49.215,-123.905);
  node["highway"="street_lamp"](49.178,-124.015,49.215,-123.905);
  node["natural"="tree"](49.178,-124.015,49.215,-123.905);
);
out body qt;
