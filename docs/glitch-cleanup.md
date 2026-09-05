# Junction and reset cleanup

The Nanaimo promotional pages were deployed separately as `5f08da0`. This follow-up fixes confirmed game defects, without changing the authored route or promotional content.

## Junction elevations
Independent per-road smoothing moved interior Departure Bay nodes away from connected side-road endpoints. Mexicana Road at route station about 354 m was 3.417 m above the arterial; Wassell, Keighley and Little John had smaller mismatches. Reconcile shared at-grade OSM nodes after smoothing, preserve the main road as authority and limit side-road transitions to 18 m. Bridges and separate road layers remain separate. Side-road asphalt, shoulders and markings are clipped against the retained arterial triangles, stitching the boundary to the shoulder. Physics support queries use those same retained triangles to avoid an invisible side-road bump.

The four junctions pass 2,491 full-lane raster samples with zero rendered height mismatch and negligible floating-point support error. All 45 shared at-grade nodes agree. Road triangle count increases by 977 (0.63%). Mexicana was also inspected in the running browser after reload.

## Run state
- Reset top speed on a new run, preserving it on checkpoint respawn.
- Clear held keys, jump edge and double-tap history when the window loses focus or the document hides.
- Clear rider lean, wheelie, air time and ramp/offroad flags on reset so a previous crash/jump does not carry into the next spawn.

Checks: `check:physics`, `check:geography`, `check:rider`, `check:scene`, `check:multiplayer`. Tests use the real map and rendered road geometry, plus delayed admission and fresh-run/respawn cases.
