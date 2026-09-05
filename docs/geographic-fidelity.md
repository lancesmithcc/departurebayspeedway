# Geographic fidelity — LiDAR and city-footprint pass

## Data and extent

The road centreline remains the original 363-point OSM route. The new ground field
covers local x −3600…−350 m, z −1950…−450 m: approximately 3.25 × 1.5 km around the
Country Club-to-beach run. It contains 1,221,126 valid elevation samples.

Source: [NRCan CanElevation HRDEM Mosaic](https://nrcan.github.io/CanElevation/stac-dem-mosaics/),
1 m DTM tile `1_3-mosaic-1m`, window-read from the public cloud-optimized GeoTIFF.
The native horizontal CRS is EPSG:3979 and elevations are CGVD2013 orthometric
metres. The game's existing affine latitude/longitude conversion is retained.
Bilinear resampling produces a regular 2 m game grid; this is **not a claim of 2 m
survey accuracy**. Metadata and original URLs are in `data/terrain-dtm.json`.

The previous road samples agree with the new raster within 0.055 m. Unlike the
previous 20 m cross-section spacing and nearest-route-row lookup, a regular field
preserves terrain between cross-sections. It also supplies real nearby hillside
shape outside the former narrow strip.

## Rendered terrain

The road corridor renders with ~3.85 m terrain cells instead of ~15.4 m cells.
Coarse triangles underneath are removed; perimeter vertices match the surrounding
coarse mesh, with a 12 m transition. Objects use the same fine triangles for
terrain contact. Road grading remains intentional for playable asphalt contact,
but its outer apron is reduced from 15 m to 7 m where LiDAR is available. Authored
landmark pads and coastline/ocean treatment remain game approximations.

## Buildings

[City of Nanaimo Building Footprint layer](https://nanmap.nanaimo.ca/arcgis/rest/services/NanMap/Polygons/MapServer/6)
was queried with pagination (2,837 records), then filtered to nearby valid polygons.
367 city footprints replace 358 unnamed OSM footprints and fill missing structures.
Named landmarks are preserved. Polygons with holes, ambiguous overlaps, or road
conflicts are excluded rather than guessed.

18 imported buildings have usable measured heights. 12 use city floor counts with
an estimated storey/roof height; remaining buildings retain OSM or typical heights.
Every imported record stores its height basis. Footprints, heights, facades and
roof shapes therefore have different confidence levels: **city geometry does not
make the generated facade a reconstruction of the property**.

## Canopy and graphics

A matching DSM window minus the DTM supplies canopy-height estimates. A 7×7 local
maximum filter, building mask, road clearance and nonmaximum suppression yield
805 nearby candidate canopy peaks. Placement also respects gameplay clearances
and authored landmark lots. These replace arbitrary roadside tree scatter in the
covered corridor. Height selects an artistic crown form, not an asserted species.
The source acquisition may predate current vegetation.

New foliage uses layered alpha-tested leaf sprays and slender branching trunks.
Hedges share the textured treatment. Atmospheric haze adds depth along the descent.
Original biker GLB remains the default, with mesh-based body/head/landing animation;
independent stunt limbs still require a full rig of the original asset.

## Rebuild and verify

Use an isolated Python environment with `numpy rasterio pyproj shapely`:

1. `python tools/extract-terrain.py`
2. `python tools/import-city-buildings.py`
3. `python tools/extract-canopy.py`
4. `npm run check:geography`
5. `npm run check:scene`
6. `npm run check:rider`

Geographic checks cover source-map fingerprint, valid samples, road-elevation
agreement, preserved named landmarks, canopy dimensions, finite geometry, and
coarse/detail seams. Initial result: 487,204 terrain vertices, 934,720 triangles,
and maximum seam discrepancy below 0.000008 m.

Data attribution and licence links are in `assets/CREDITS.md` and linked from the
title screen. Google Street View and supplied drive frames are inspection sources,
not shipped textures. This pass is local; no production deployment is included.

## Runtime validation

- Browser ride reached all 8 gates and finished (153.8 s of simulated game time;
  final portion advanced with fixed-step updates). Demo traffic caused recoverable
  crashes; no route blockage prevented completion.
- Contact audit: 59 pedestrians, none below ground; 71 cars, none flying or buried.
- No browser warnings/errors during the ride. A 90-frame live sample reported
  60 FPS, median 16.7 ms and 95th percentile 17.5 ms; this is a local browser
  observation, not a guarantee for every device.
- Original GLB remains visible and the procedural rider stays hidden by default.
- Facade UVs now end on whole window rows. Rectangularity determines gable eligibility,
  so extra collinear city-footprint vertices no longer force a flat roof. Colours
  and facade details remain artistic approximations guided by the drive frames.
