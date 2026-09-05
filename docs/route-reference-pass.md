# Whole-route reference pass

The local build now has custom reference landmarks at the start, commercial strip,
schools and beach, with three-dimensional residential frontage through the middle.
The game keeps its original road centreline, LiDAR terrain and geographic inputs.
School wings additionally use public DSM roof-height samples; see the school reference notes.

## Sequence and evidence

| Location | Main evidence | Applied changes |
|---|---|---|
| Opening apartment, left | 00:05–00:15 | City footprint 7037; existing detailed grey wall, concrete plinth, hedge, purple-leaf trees retained |
| Rosedale Manor, right | 00:08–00:15 | City footprint 5875; brown-grey walls, recessed-looking balcony bays, dark railing and tan roadside fence |
| St. Andrew's | 00:20 | Compact blue sign with visible United Church heading; game reader-board copy remains stylized |
| Subway / grocery | 00:25 | City footprint 1308; two storeys, grey upper cladding, framed windows, tan lower piers, green/yellow canopy, glazing and paved setback; tall conifers and red boundary opposite |
| Wellington Secondary | 00:30–00:35 | City footprint 7100 replaces invented campus blocks; small two-post reader board replaces oversized monument |
| Rock City Elementary | 01:25–01:35 | City footprint 6905, restrained facade palette, framed glazing, restored tree screening |
| Middle residential streets | 01:05–02:35 | 76 mapped homes receive siding, trim, eaves, recessed windows, doors and thresholds in six material batches |
| Wooded descent / raised bank | 03:50 | Short grey boundary on the inland bank, with entrance gap and terrain contact |
| Departure Bay Elementary | 03:50–04:15 | City footprint 7064; retain the heavy vegetation screen visible in the video |
| Legasea / Seaside Place | 04:45–04:55 | Stone cladding, observed drip cafe fascia, projecting white frames, glass balconies, railings and terrace canopies |

Subway identity and address were cross-checked against its [official restaurant page](https://restaurants.subway.com/canada/bc/nanaimo/4146-departure-bay-rd)
and [City business location](https://www.nanaimo.ca/business_report/bus_details.aspx?licence=132986).
Its facade was inspected in [April 2026 Street View](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.208266,-124.0001409&heading=305&fov=60).
Google imagery is not included in any game texture.

## Accuracy boundaries

Mapped outlines and recorded heights are stronger evidence than facade styling.
Visible materials, building sequence and recognizable frontage are taken from the
frames. Exact window counts, hidden elevations, balcony dimensions, sign sizes and
fence endpoints remain estimates. The 76 house overlays use observed local building
styles, not individually verified window layouts for every house. This is a substantial
route-wide fidelity pass, not a complete photogrammetric replica of every property.

See school-reference.md, residential-reference.md, lower-street-reference.md and
apartment-reference.md for feature-specific observations and limitations.

## Review and validation

Open `/tools/street-reference.html` locally for eight selectable still/game comparisons.
The clean game view hides HUD and rider only in `?inspect=route&clean=1`; normal play
is unchanged. Comparison viewpoints match locations, not video elapsed time.

`node tools/check-street-landmarks.mjs` checks all eight custom building replacements,
unchanged source polygons/heights, retained collision records, finite geometry, no
duplicate generic landmark meshes and residential coverage. Geography, scene, authored
rider and character lifecycle checks also pass. Browser route simulation completed
8/8 gates and reached the finish, with no console errors. Static detail is merged by
material; shared pickup geometry/pools remain intact.

Changes are local only. Public release remains 5e9d398.
