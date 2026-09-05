# Schools: source-based replacement

`src/reference-schools.js` replaces the invented disconnected school blocks with the exact City of Nanaimo footprint rings already loaded into the runtime map. Seven merged material batches per campus retain the footprint, roof outline and world placement. NRCan HRDEM DSM roof samples resolve the different roof elevations; the City height is retained as source metadata, not applied uniformly. Foundations close gaps against the rendered terrain. Facade detailing includes recessed glazing, three-part mullions, top opening lights, projecting sills, panel joints, fascia edges and rainwater leaders.

| School | City footprint | City height | Route station nearest existing anchor | Evidence |
|---|---:|---:|---:|---|
| Wellington Secondary | 7100 | 9.61 m | ~327 m | 00:30–00:35: campus left behind frontage; white reader board with narrow grey posts, columnar trees and chain-link boundary |
| Rock City Elementary | 6905 | 8.80 m | ~876 m | 01:25–01:35: right-side grey/cream low frontage, broad pale fascia, mullioned glazing, parking access, timber fence and dense trees |
| Departure Bay Elementary | 7064 | 6.24 m | ~2399 m | 03:50–04:15: campus largely screened by mature vegetation; exact facade cannot be established from these ride-by frames |

The route starts at Circle K. Video times are source time, not simulated game time. Wellington comes after the commercial strip; Rock City is considerably farther along. Departure Bay school is near the final descent, **not** the church at 02:20.

## What is measured and what is interpreted

Measured: footprint, geographic placement and the City height field. A single City BLDGHEIGHT field is not a per-wing roof model. A fresh sample of the [NRCan HRDEM 1 m DSM](https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m/1_3-mosaic-1m-dsm.tif) at 2 m intervals inside each footprint resolves the roof levels. Roof samples are inset from the perimeter to reduce edge/vegetation mixing; the median in each mapped wing subregion sets its roof elevation. Subregion cuts are manually interpreted at polygon wing necks or visible DSM changes, are clipped to the City polygon, and preserve its union area. They are not new building rectangles.

| School | Roof heights relative to local DTM slab | Interior sample counts |
|---|---|---|
| Wellington | 8.88 / 4.51 / 7.23 / 6.04 m | 557 / 282 / 301 / 647 |
| Rock City | 5.17 / 6.50 / 7.77 m | 198 / 146 / 284 |
| Departure Bay | 9.09 / 4.04 m | 210 / 481 |

`SCHOOL_ROOF_PARTS` stores the clipped rings, median absolute elevations, relative slab heights and counts. Wellington's closer low wing therefore has a single row of windows, while high ranges retain two. Exterior fascia is split at roof boundaries, preventing floating trim. Internal roof steps remain solid.

The DTM datum uses the footprint vertex mean, matching the renderer floor anchor; medians suppress small roof plant and outliers. Acquisition dates can differ from the ride-by stills. These are robust roof-level estimates, not survey-accurate parapet or slope models. City heights and roof medians are distinct sources: notably Departure Bay's high northern roof differs from the City single-height field.

Observed: Wellington's restrained pale building palette and slim freestanding sign; Rock City's grey/cream facade, pale fascia, framed glazing and screened frontage. No red-brick Wellington monument or broad saturated green/blue elementary-school wraparound stripe is supported by these frames.

Interpreted: exact window counts, spacing, sill dimensions, drainage, unseen rear elevations and Departure Bay facade palette. Do not describe these schools as photogrammetrically reconstructed. Tree screening matters: retaining the previous 78–86 m campus tree-clearance disks makes these sites far more exposed than the stills. Reduce broad clearance to mapped building footprints plus specifically known paths; do not erase LiDAR canopy around them.

## Integration

```js
import {SCHOOL_IDS,buildReferenceSchool,buildReferenceSchoolBoard} from './reference-schools.js';
// Inside buildings loop, before skipNear suppression, while preserving grid/collision:
if(SCHOOL_IDS.includes(b.cityId)) {
  group.add(buildReferenceSchool(b,terrain));
  // Register the original polygon in buildingGrid using the existing conventions.
  continue;
}
```

In `buildElementarySchool`, suppress only synthetic blocks/windows/playground for surveyed schools. Keep the existing crossing calculation, paint, zone signs and return `{group,crossing,index,side}` so children and gameplay remain stable. Suppress the entire old Wellington campus routine; it contains a second giant roadside sign/parking pad with invented dimensions. Use the mapped school above plus `buildReferenceSchoolBoard(corridor,terrain,'wellington',TEX.wellington)`.

The board helper creates geometry only at the existing projected campus anchor. Wellington dimensions are visually estimated 3.2 m face width × 1.7 m height, face bottom 1.3 m, narrow grey posts, pale thin frame. Existing 9.6 m brick monument is unsupported. For elementary schools the helper uses a conservative 2.8 × 1.45 m panel; that size and design are **not verified** in the occluded frames. Keep them as estimated gameplay signage until a clear sign reference is available. The helper does not alter crossings.

Official school identification: [Rock City, 3741 Departure Bay Road](https://studentsuccess.gov.bc.ca/school/06868076), [Departure Bay, 3004 Departure Bay Road](https://departurebay.sd68.bc.ca/contact/). Footprint data: [City of Nanaimo Building Footprints](https://nanmap.nanaimo.ca/arcgis/rest/services/NanMap/Polygons/MapServer/6).

## Verification

`node --check src/reference-schools.js` passes. Standalone Node geometry check loads all three actual City records, checks finite positions/normals, preserves input JSON and measured heights, and limits each campus to seven merged meshes. Triangle counts after roof subdivision: Wellington 21,129; Rock City 12,541; Departure Bay 14,700. Roof-piece polygon areas sum to the original footprint area within 0.1 square metre. Browser integration/render check belongs to the caller after removing old duplicate schools.

## Reproduce the roof extraction

```sh
/tmp/departure-geo-venv/bin/python tools/extract-school-roofs.py --output /tmp/school-roof-parts.json
```

The script reads the official EPSG:3979 DSM with small range-request windows; game x/z convert through the map origin to EPSG:4326, then pyproj transforms to3979. Sampling uses2m game-coordinate spacing and1m footprint inset, then a0.8m inset from each candidate roof subregion. Finite/nodata checks precede the50th-percentile elevation. Relative heights subtract the nearest local2m DTM vertex at the same footprint mean used as the renderer's floor anchor. It does not modify gamefiles: inspect output, then replace exported `SCHOOL_ROOF_PARTS`.

Confidence: broad flat roofs show strong elevation plateaus in the samples, so medians suppress scattered roof plant or isolated tree returns. There is **no semantic tree classifier over roofs**; dense overhanging canopy could still bias a region median. Manual roof breaklines and source acquisition age also limit precision. Insets and median filtering reduce this risk, but do not justify claiming exact architectural survey accuracy.

The extraction repairs the tiny self-intersection in the City DepartureBay source polygon with `buffer(0)` before clipping. It preserves full intersection precision: rounding to3decimals created invalid hairpins at the RockCity roofcuts. Every exported part now passes `Polygon.is_valid`. Shapely union symmetric difference from the repaired City footprint:RockCity2.83e-13m²; Wellington0; DepartureBay0. Piece-overlap area is below5e-13m².
