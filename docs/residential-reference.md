# Residential corridor reference pass

## Evidence and limits

Reviewed supplied drive frames at 00:35, 00:45, 00:55, 01:05, 01:15,
01:25, 01:35, 01:45, 01:55, 02:05, 02:20 and 02:35. Enlarged
01:05, 01:35 and 02:35 to inspect the roadside construction vocabulary.
The useful observations are low residential buildings, pale grey/tan/sage siding,
white window frames and gutters, broad horizontal windows, dark glass, narrow
white corner boards, concrete thresholds, evergreen hedge screening and cedar
boundaries. The 02:35 view clearly shows pale horizontal siding, white eaves,
white-framed windows and low pitched roofs on the left.

Frame time is not route distance. Individual doors/windows have not been matched
to street addresses. A specific house identity, fence material, wall height or
entrance position cannot be claimed from these time samples alone. This pass
therefore adds **reference-informed construction detail**, not a surveyed replica
of every residential facade. No footage pixels are used as production textures.

## Implementation

`src/reference-residential.js` exports
`buildReferenceResidential(map, corridor, terrain, keepClear=[])`.
Call after building the terrain mesh, with the already merged city/OSM map.
`keepClear` accepts `{x,z,r}` landmark exclusion circles.

- Select actual unnamed residential footprints at route stations 400–1600 m,
  13–46 m from the centreline, 55–340 m² and 3–8 m reported building height.
- Match the existing building generator's ground anchor and rectangular-roof
  allowance. Preserve its polygon, roof, collisions, position and height.
- Add thin pale cladding to road-facing edges. This masks the low-resolution
  window atlas locally, avoiding double windows on the detailed faces.
- Add horizontal siding courses, corner boards, eaves, gutters/downpipes,
  recessed glazing, separate frames/mullions/sills, doors and small thresholds.
- Details are merged into six material batches. The complete unexcluded dataset
  produces 76 houses, 181 faces, 306 windows and 161,208 vertices. Exclusions can
  reduce these totals.
- Window and door layouts, colour choice and exact trim dimensions are inferred.
  Roof shape remains the existing geographic approximation.
- No new roadside fence, retaining wall, hedge or driveway is introduced. This
  avoids inventing parcel boundaries or closing existing drive openings. The
  existing streetscape's boundaries remain inferred and need address-level
  matching in later passes.

## Validation

`node --check src/reference-residential.js` passes. A Node geometry smoke check
using the actual merged city/OSM dataset verifies finite position/normal arrays,
six merged meshes, and selection of the expected corridor homes. Visual browser
review is still required after integration.
