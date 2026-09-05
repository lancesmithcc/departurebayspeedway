# Apartment frontage and pickups — local refinement

Reference: supplied `video-frames/t00m05.0s_00051.jpg`,
`t00m08.0s_00081.jpg`, `t00m10.0s_00101.jpg`, and the first 15 seconds
of the drive. Checked the wider opening two minutes at five-second intervals.

Street View cross-check: [4286 Departure Bay Road, April 2026](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.2069453,-124.0017708&heading=330).
The grey boundary is vertical boarding above a stained concrete retaining plinth;
a sidewalk and row of purple-leaf ornamental trees sit in front, with a clipped
hedge behind. Google imagery is reference only, not a shipped texture.

The apartment uses City of Nanaimo footprint 7037 and its 10.76 m recorded height.
The footprint was previously suppressed by the nearby gas-station clearance rule.
It now has pale plaster, grey-green vertical window bays, framed glazing, recessed-
looking balcony bays with rails, a dark roof edge, and the long boundary treatment.
Its original city polygon remains registered for building collision.

Facade bay rhythm, four visible window levels, balcony distribution, fence heights,
landscape spacing and wall endpoints are visual estimates. The wall follows route
stations 65–145 m on the left, at 10.5 m offset; exact property boundaries have not
been surveyed. No claim of photogrammetric or survey-accurate facade reconstruction.
Unseen sides use the same architectural vocabulary rather than invented evidence.

The detail module is runtime Three.js geometry, batched by material. Blender is
available but was not needed for this footprint-based construction. The supplied
stills remain local and are not included in a release.

Review: `http://localhost:8044/?inspect=route&station=68`.
Regression check: `node tools/check-reference-apartment.mjs` checks the gas-station
exclusion fix, immutable surveyed footprint/height, collision registration and finite
geometry. Existing geography, rider and character checks remain available.

Pickup review: `http://localhost:8044/tools/pickup-preview.html`. Packaging graphics
are original canvas artwork; pickup effects and projectile pooling are preserved.

This refinement is local. Public release remains 5e9d398 until another deployment.
