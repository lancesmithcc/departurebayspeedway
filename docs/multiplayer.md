# Seven-player ride sessions

Local implementation; not deployed.

The development and production Node servers each own one shared room. Joining occurs on Enter/tap to ride, not on page load. Exactly seven active sessions are admitted; further clients wait FIFO with their queue position and the requested waiting message. A vacant seat promotes the next waiter. Heartbeats expire after15 seconds; finishing/leaving/pagehide releases a seat. Cancelling or losing connection freezes the local race until admission again. Sessions reset on server restart.

Admitted clients publish transforms at10Hz and render up to six other riders, using independent deformation buffers on the original rider GLB, interpolated movement, head motion, lean/crash pose and anonymous colored rider badges. Waiting clients poll at1Hz. Root-relative endpoints continue to work under the production versioned asset URLs.

This is shared live rider presence, not a fully authoritative multiplayer physics simulation. NPC traffic, pedestrians, collectibles, damage and scores remain local. Other players do not cause PvP collisions or share projectile hits. Admission is server-authoritative; movement is a bounded client-reported relay and not cheat-proof.

HTTP POST API: /api/multiplayer/join, /state, /leave. Cryptographically random bearer tokens stay private; peer snapshots expose only opaque player IDs, optional anonymous names and validated state. Same-origin browser requests,4KB payload bound, finite/map bounds,20Hz maximum updates,64 waiting sessions. Single process only: horizontal replicas would need a shared room store.

Validation:
- Nine simultaneous synthetic joins: exactly7 active,2 queued; FIFO promotion, expiry, reconnect, malformed/oversized input, rate limit and token privacy passed.
- Real browser as eighth client stayed stationary at queue position1, then automatically entered and received six independent GLB rider instances after one fixture left.
- Two actual browser clients joined, exchanged positions, and visibly rendered the other rider and badge.
- Local production-server smoke test: join201/capacity7, versioned multiplayer module200, regenerated voice WAV byte-range206.
- check:multiplayer and check:voices passed.157 spoken WAVs regenerated; source text and hashes recorded in audio/voices/generated-lines.json.

Use the same server URL for all participants. Public testing requires deploying this version and restarting the Node service; refreshing an old static-only server is insufficient.
