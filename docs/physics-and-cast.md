# Ground contact and character pass

Local implementation; not deployed.

- Terrain support queries the rendered terrain and registered asphalt, shoulders, curbs and sidewalk triangles. Pedestrians follow current surface height without downhill interpolation lag or added vertical bob.
- Vehicle support uses four tyre points and a world-space chassis rotation. Representative actual-route checks cover 318 poses; maximum wheel gap is 9.3 cm over uneven surfaces. This is a rigid support approximation, not a full suspension simulator.
- Swept building-edge/corner contact prevents the rider and wipeout movement from skipping thin facades. Wall-normal momentum stops while reduced tangential motion permits a slide. Camera paths stop before mapped buildings.
- Title rider position stays fixed, and the title camera installs its view immediately. Starting a race resets the camera before smoothing resumes.
- Six adult street variants use eight articulated poses each. Authored child/congregation models and the original Jesus and player GLBs remain. The hoodie dancer stays in place and cycles waving poses. Cast includes a bald moustached sleeveless man, fuller shirtless denim men with chains and backward caps, and fuller bright leopard-print women.
- Original player GLB has independent roadside head glances, steering look-ahead, head nods and shoulder breathing. Existing hand/foot constraints remain.
- Fallen crowd bodies receive geometry-based ground support. Named fallen characters receive bounds-based support.

Validation: check:physics, check:cast, check:rider, check:scene, check:characters, check:hazards, check:voices, check:geography. Game initialized with six adult-only variants and eight separate child variants, without runtime errors. Character workshop visually inspected. Full route playthrough remains a useful next acceptance pass; no claim of perfect physical simulation.
