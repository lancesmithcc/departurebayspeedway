[out:json][timeout:90];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|residential|unclassified|service)$"](49.178,-124.015,49.215,-123.905);
  way["building"](49.178,-124.015,49.215,-123.905);
  way["natural"="coastline"](49.178,-124.015,49.215,-123.905);
  way["man_made"="pier"](49.178,-124.015,49.215,-123.905);
  way["leisure"~"^(park|pitch|golf_course)$"](49.178,-124.015,49.215,-123.905);
  way["landuse"~"^(forest|grass|farmland|commercial|retail|industrial)$"](49.178,-124.015,49.215,-123.905);
  way["natural"="water"](49.178,-124.015,49.215,-123.905);
  node["amenity"="fuel"](49.178,-124.015,49.215,-123.905);
  node["shop"](49.178,-124.015,49.215,-123.905);
  node["amenity"="ferry_terminal"](49.178,-124.015,49.215,-123.905);
);
out geom qt;
