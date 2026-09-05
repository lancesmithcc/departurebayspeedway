# Reference traffic and expanded voices

Local refinement; not deployed.

The fleet has 34 sedans, 20 SUVs, 14 pickups, 4 BC Transit buses, 2 Cybertrucks and 2 RCMP SUVs. Counts are pooled capacity, not a promise that every vehicle is visible at once. Dedicated reference vehicles are used even when the authored generic car pack loads; the previous bus-to-taxi fallback is removed. Shared material batches cost six draw calls for buses, four for Cybertrucks and six for RCMP vehicles. Stable instance slots and white instance tint preserve liveries. Collision width/length, speed limits and following distance account for the larger bus.

BC Transit and RCMP bodywork/liveries follow the supplied images. The bus destination is adapted to DEPARTURE BAY instead of copying the non-local Vedder destination. Textures and simplified RCMP crest are authored game graphics; this is a stylized reconstruction, not an exact fleet model or official crest reproduction. Cybertruck has angular metal panels, black wheel-arch cladding and front/rear light bars. Police lights are modeled, not an emergency response system.

100 new local Kokoro WAV files provide 216.5 seconds of recorded dialogue. Bike and Nanaimo-bar events have separate pools for street adults, children, congregation, hell congregation and drivers. Jesus and Satan have their own hit, greeting and rise lines. Cast metadata follows original GLB filenames, so a missing asset does not shift male/female casting. Voices have a stable per-character pitch offset and subtle per-take variation; no immediate repeat in the same event/gender pool. Named hits bypass pedestrian cooldown with priority 3. Satan's rise uses priority 4; church arrival uses priority 2.

Audio gain envelopes, arbitration duration and music ducking use actual pitched playback duration. Failed requests have a short retry cooldown; asset paths resolve relative to the audio module so review pages work too. Legacy announcer/pickup recordings remain available.

Review locally:
- `/tools/vehicle-preview.html`: rotate/zoom all three vehicles.
- `/tools/voice-preview.html`: actual in-game performance and all recorded lines.
- `/tools/cast-preview.html`: original character assets used for casting.

Validation:
- `npm run check:traffic`: grounded wheels, finite geometry, draw budget, fleet counts, untinted liveries, bus nose/flank collision and shared transforms.
- `npm run check:voices`: event/gender pools, repeat prevention, timing, failure/retry, actual bike/bar dispatch, missing-model casting, named hit priority and driver score path.
- Existing scene, rider and character lifecycle checks pass.
- Browser decoded all 100 new WAVs (1.00–3.63 seconds each). Signal checks found no silent or clipped renders. The voice studio played a Jesus dessert reaction through AudioSys with measured pitch and duration.
- Integrated demo reached all 8 gates and finished, exercising crash recovery (12 crashes in this random traffic run); no browser console errors. This is not a performance benchmark or a crash-free autopilot claim.
