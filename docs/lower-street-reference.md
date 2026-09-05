# Lower Departure Bay Road: reference fidelity pass

## Evidence reviewed

The supplied stills were reviewed every ten seconds from 01:40 through 05:00,
then inspected individually at 02:10, 02:40, 03:50, 04:45, 04:50 and 04:55.
Frame times are observations, not linear distance estimates. Named junctions and
existing mapped footprints anchor each change.

| Feature | Source stills | Reproduced detail |
| --- | --- | --- |
| Legasea corner at the beach | `t04m45.0s_02851.jpg`, `t04m50.0s_02901.jpg`, `t04m55.0s_02951.jpg` | Existing named polygon and 11.1 m height retained. Dark grey stacked-stone lower wall, red/brown upper cladding, projecting white frames, individual window mullions, concrete balcony plates, transparent glass balustrades with black posts, roof terraces and projecting white canopies. Corner cafe fascia reads `drip`, as plainly visible in 04:50/04:55. Horizontal wall louvre and paved front apron included. |
| Seaside Place beyond the corner | `t04m45.0s_02851.jpg`, `t04m55.0s_02951.jpg` | Existing named footprint and 11.1 m height retained. Long pale elevation, three repeated balcony levels, individual white railing bars, deep window/door recesses, horizontal siding joints and dark eaves. |
| Raised inland bank near Alan A Dale | `t03m50.0s_02301.jpg` | Short grey vertical-panel boundary behind the left footpath; retaining plinth, posts, caps and joints. Road stations 2285–2330, with entrance gap; every panel follows actual rendered terrain height. |

The visible facades are interpreted from the stills. Balcony counts, window
sizes, cladding courses, roof overhangs, apron edge and boundary station limits
are visual estimates. Occluded return elevations are simplified continuations
of observed materials. No claim of measured facade geometry or photogrammetry
is made. No new business identity was inferred; the only cafe label is visible
in the supplied frame. Procedural stone texture is original and does not embed
video or Google imagery.

## Integration

`src/reference-lower-street.js` exports:

- `REFERENCE_LOWER_NAMES`: `Legasea`, `Seaside Place`.
- `buildReferenceLowerBuilding(b, terrain, corridor)`: replacement visual group,
  or null for unhandled names. Retain the existing building polygon in the
  collision/building grid, but omit its generic visual extrusion.
- `buildReferenceLowerStreet(map, corridor, terrain)`: roadside panels only;
  never adds duplicate building masses.

Architectural geometry is merged by material per building. The glass balcony
infill uses one transparent material per building, rather than one draw per
baluster. All dimensions and positions remain in the game's metre coordinate
system. Ground is sampled from the rendered LiDAR terrain.

## Verification

Syntax check passed. In-browser render at station 2820 was inspected with the
generic building group temporarily hidden and new facades added. This exposed
an inward placement problem on Legasea's recessed south polygon edge; the
facade plane was corrected outward so its cladding is visible. Temporary scene
changes were removed by closing the inspection tab. Full integration and route
checks are the parent task's responsibility.

Live construction checks: Seaside 58,144 vertices / 6 meshes; Legasea 11,600
vertices / 9 meshes; short bank boundary 8,640 vertices / 3 meshes. Every
position value was finite, and the inspection tab reported no warnings/errors.
