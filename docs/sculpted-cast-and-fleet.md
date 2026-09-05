# Crowd and traffic sculpt pass

Local changes, not deployed.

Six adult crowd variants now use continuous lofted torso/head/limb surfaces instead of stacked ellipsoids. Integrated cheeks/jaw/nose, shaped muscle and cloth profiles, creased denim, fitted hair, rounded sneakers and accessories retain the existing eight pose cycles. Approximately 24.5–27.9k triangles per pose. Still stylized; no claim of scan-level texture fidelity.

Ordinary traffic now uses a new sedan/SUV/pickup kit rather than the seven simple imported cars. Continuous panels, real wheel openings, curved glazing/roof seams, door trim, lamps, detailed alloy wheels and pickup-bed ribs. Each model is roughly 25–26k triangles, with five instanced material batches. Paint alone receives vehicle colour tint. Glass, tyres, lamps and chrome keep their materials. Explicit tyre contacts and model dimensions drive placement and collisions.

BC Transit/RCMP/Cybertruck tyres have rounded shoulders, rim lips, bolts and tread. Bus and RCMP body profiles now leave wheel openings. Reference paint uses clearcoat.

Sculpted adult pose batches compact only visible actors each frame, avoiding rendering every high-detail pose at every pooled slot below the ground. Existing child and congregation slot layout is preserved. Live check matched 26 drawn adults to 26 visible adults. Runtime scene loaded all six traffic types with no error overlay; one sampled 76-car population had maximum tyre clearance 2.4 cm. This is a sample, not an exhaustive route guarantee. Peripheral lane placements over discontinuous terrain exceeding the support allowance are retired rather than drawn hovering.

Checks: check-character-cast, check-body-support, check-authored-rider, check-reference-vehicles, check-sculpted-vehicles, check-traffic-grounding, check-dialogue-events. Browser previews inspected and windshield/roof gaps corrected.

Previews: /tools/character-preview.html and /tools/sculpted-vehicles-preview.html.
