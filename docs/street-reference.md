# Street fidelity pass — September 4, 2026

## Evidence

Reviewed 21 evenly spaced reference images from the 3,010 supplied frames in
`video-frames/`, spanning 00:00–05:00. Frames show the entire drive from the
Circle K/Norwell start to the beach. Frame time is not treated as distance:
traffic stops make that conversion unreliable.

Live Google Maps Street View checked:

- Upper residential road, 4069 Departure Bay Road (April 2026):
  https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.2086491,-123.9990167&heading=65
  Central turning lane, left sidewalk, right utility poles, wood fences and hedges.
- Middle residential road, 3550 Departure Bay Road (April 2026):
  https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.2101116,-123.9879167&heading=90
  Single yellow centreline, narrow shoulders, right sidewalk/white pedestrian
  railing, mature evergreen hedges, sagging overhead conductors.
- Wooded descent, 3244 Departure Bay Road (April 2026):
  https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.209312,-123.9791535&heading=115
  Double yellow, left sidewalk, right wooded bank and utility poles.
- Initial lookup landed on 3010 Rock City Road, September 2021. This was recognised
  as a side road and not used to set Departure Bay Road geometry.

## Implementation

`street-profile.js` stores section treatments in metres from Norwell Drive.
The original OSM centreline, footprint data, and NRCan elevations remain the
geographic foundation. The upper turning-lane width is an approximately 11.2 m
cross-section; section boundaries are approximate, not surveyed measurements.

Roadside containment now follows the asphalt with a 0.65 m shoulder allowance,
instead of adding 3.6 m to each side. Narrow paint replaces oversized stripes.
Single/double/turning-lane markings vary along the road. Sidewalks follow reference
sides; slab geometry follows slope. Automatic highway guardrails are removed;
a short white pedestrian railing remains in the observed middle-road area.

Pole spacing is representative (~43 m), with three sagging conductors, and the
main line follows the right verge. Landscaping and driveways use mapped house
frontages, with deterministic inferred hedges/fences, entrance gaps, and denser
understorey on the descent. They are approximations, not verified individual
property features. Google imagery is used for inspection only, not shipped as
textures. Supplied frames remain local reference material.

## Characters

The supplied biker GLB is the default again. Its original mesh and textures are
preserved; weighted mesh deformation adds breathing, acceleration/braking posture,
steering counter-lean, head movement and landing absorption. Frame, wheels and grip
region are pinned. This is not a complete skeletal rig: independent no-hander and
superman limb poses remain available only in the procedural diagnostic fallback
(`?rider=articulated`). The original GLB file is unchanged.

`tools/rider-preview.html` provides close-up idle/ride/brake/landing controls.
`node tools/check-authored-rider.mjs` tests the real GLB under a rotated/translated
parent, immutable source geometry, unchanged UVs, fixed bike vertices, animated
rider vertices, spring recovery, rest restoration and disposal.

Jesus/Satan use the original pedestrian asset's live skeletal animation clips,
with blended idle/walk/run/greeting/attack motion, layered head/arm movement,
articulated sash and Satan tail. Existing death, transformation, resurrection,
second defeat, and restart logic are preserved. Baked body remains load fallback.

## Preview

`npm start` opens an available port beginning at 8043.
`?demo&audit` runs the route; `?inspect=route&station=1207` supplies a repeatable
road view. `?inspect=baptist` supplies the existing church view.

Lighting is deliberately cinematic late afternoon rather than matching the
reference video's overcast weather. This is a closer game representation, not a
photogrammetric reconstruction. Landmark facades, every driveway, and precise
utility/sidewalk measurements remain approximate.

## Validation

- `npm run check:scene`: route preservation, marking/sidewalk profiles,
  482-triangle foliage attribute/triangle integrity, rider poses and landing recovery.
- Isolated real-GLB character test: 1,320 ticks across holy, fallen, risen,
  defeated, and revived states; finite transforms and one visible body.
- Browser: completed eight of eight gates and reached the finish on the first
  implementation run; close-up Jesus/Satan previews render without console errors.
- Final build: eight of eight gates and finish verified again using fixed-step
  browser simulation; no console errors.
- Final street contact check uses the rendered ground, matching pedestrian placement
  instead of comparing against a different analytic height field.

No production deployment is included in this pass.
