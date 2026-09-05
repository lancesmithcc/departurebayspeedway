// powerups.js — roadside pickups strung down Departure Bay Road.
//
// Each one is a timed modifier the player carries: a case of Lucky makes the bike
// quick and the steering awful, a double-double sharpens it up, a crate of bars turns
// the throw into a machine gun, and the church blessing means you cannot bin it.
// Only one is ever active — grabbing a second one replaces the first, so the HUD
// never has to explain a stack.
import * as THREE from 'three';
import { BlessingEffects } from './blessing-effects.js';
import { rand } from './util.js';
import { createLuckyCase, createCoffee, createBarCrate, createBlessing } from './pickup-models.js';

export const KINDS = {
  beer: {
    label: 'CASE OF LUCKY',
    caption: 'A CASE OF LUCKY — fast bike, terrible steering!',
    colour: 0xd6202c,
    time: 9,
    // fast, but the front wheel argues with you the whole way
    vmax: 1.34, accel: 1.5, steerMul: 0.55, steerLag: 2.6, wobble: 0.85,
  },
  coffee: {
    label: 'DOUBLE-DOUBLE',
    caption: 'DOUBLE-DOUBLE. Everything just got sharper.',
    colour: 0xb8322e,
    time: 10,
    vmax: 1.16, accel: 1.35, steerMul: 1.35, steerLag: 12, wobble: 0,
  },
  bars: {
    label: 'BAR CRATE',
    caption: 'A CRATE OF NANAIMO BARS — hold F and let them have it!',
    colour: 0x3a2412,
    time: 12,
    vmax: 1, accel: 1, steerMul: 1, steerLag: 7, wobble: 0, rapidBars: 0.16,
  },
  blessed: {
    label: 'BLESSED',
    caption: 'BLESSED BY THE CONGREGATION — you cannot bin it.',
    colour: 0xffd23f,
    time: 11,
    vmax: 1.1, accel: 1.15, steerMul: 1.1, steerLag: 8, wobble: 0, invuln: true,
  },
};

const ORDER = ['beer', 'coffee', 'beer', 'bars', 'beer', 'blessed', 'coffee', 'bars', 'beer', 'blessed'];

// ---------- the pickup models ----------
const BUILD = { beer: createLuckyCase, coffee: createCoffee, bars: createBarCrate, blessed: createBlessing };

export class Powerups {
  constructor(scene, corridor, terrain, opts = {}) {
    this.blessingEffects = new BlessingEffects(scene);
    this.corridor = corridor;
    this.terrain = terrain;
    this.effects = opts.effects || null;
    this.audio = opts.audio || null;
    this.onPickup = opts.onPickup || (() => {});
    this.active = null;          // { kind, def, t }
    this.t = 0;

    // Spread the pickups down the ribbon, skipping the first stretch so the run has
    // started before the first one shows up, and the beach chute at the end.
    this.items = [];
    const n = corridor.pts.length;
    const first = Math.floor(n * 0.06), last = Math.floor(n * 0.93);
    const count = ORDER.length;
    for (let k = 0; k < count; k++) {
      const i = Math.round(first + (last - first) * (k + 0.5) / count + rand(-6, 6));
      const kind = ORDER[k % ORDER.length];
      const def = KINDS[kind];
      const [nx, nz] = corridor.normalAt(i);
      const lateral = rand(-0.55, 0.55) * corridor.hw[i] * 0.75;
      const x = corridor.pts[i][0] + nx * lateral;
      const z = corridor.pts[i][1] + nz * lateral;
      const y = terrain.surfaceHeight(x, z);
      const group = new THREE.Group();
      group.add(BUILD[kind]());
      group.position.set(x, y + 1.05, z);
      group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      // a glow ring on the deck so it reads from a long way off at 100 km/h
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.25, 20),
        new THREE.MeshBasicMaterial({ color: def.colour, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.06, z);
      scene.add(group, ring);
      this.items.push({ kind, def, group, ring, x, y, z, taken: 0, phase: rand(0, 6.28) });
    }
  }

  reset() {
    this.active = null;
    this.blessingEffects.reset();
    for (const it of this.items) {
      it.taken = 0;
      it.group.visible = true;
      it.ring.visible = true;
    }
  }

  get invuln() { return !!(this.active && this.active.def.invuln); }
  get barCooldown() { return this.active && this.active.def.rapidBars ? this.active.def.rapidBars : null; }

  // what the bike is running under right now
  modifiers() {
    const d = this.active ? this.active.def : null;
    return {
      vmax: d ? d.vmax : 1,
      accel: d ? d.accel : 1,
      steerMul: d ? d.steerMul : 1,
      steerLag: d ? d.steerLag : 7,
      wobble: d ? d.wobble : 0,
      invuln: !!(d && d.invuln),
    };
  }

  update(dt, player, riding) {
    this.t += dt;
    if (this.active) {
      this.active.t -= dt;
      if (this.active.t <= 0) {
        const ended = this.active.kind;
        this.active = null;
        this.onPickup(null, ended);
      }
    }

    for (const it of this.items) {
      if (it.taken > 0) {
        // respawn a while after it was grabbed, so a lap back up the road is not empty
        it.taken -= dt;
        if (it.taken <= 0) { it.group.visible = true; it.ring.visible = true; }
        continue;
      }
      it.group.rotation.y = this.t * 1.4 + it.phase;
      it.group.position.y = it.y + 1.05 + Math.sin(this.t * 2.2 + it.phase) * 0.14;
      it.ring.material.opacity = 0.35 + Math.sin(this.t * 3.4 + it.phase) * 0.2;
      if (!riding) continue;
      const dx = player.pos.x - it.x, dz = player.pos.z - it.z;
      if (dx * dx + dz * dz < 3.6 * 3.6 && Math.abs(player.pos.y - it.y) < 3.5) this.take(it, player);
    }

    this.blessingEffects.updateRider(player, riding && this.active?.kind === 'blessed', dt);

    // a case of Lucky is not a subtle powerup: it fizzes off the back wheel
    if (this.active && this.effects && riding && Math.random() < 0.55) {
      const d = this.active.def;
      const c = new THREE.Color(d.colour);
      this.effects.fire.emit(
        player.pos.x + rand(-0.5, 0.5), player.pos.y + 0.4, player.pos.z + rand(-0.5, 0.5),
        rand(-1.4, 1.4), rand(0.6, 2.4), rand(-1.4, 1.4),
        rand(0.3, 0.7), rand(0.3, 0.7), c.r, c.g, c.b, -0.8, 0.94,
      );
    }
  }

  take(it, player) {
    it.taken = 26;
    it.group.visible = false;
    it.ring.visible = false;
    this.active = { kind: it.kind, def: it.def, t: it.def.time };
    if (this.effects) {
      const c = new THREE.Color(it.def.colour);
      for (let i = 0; i < 26; i++) {
        this.effects.fire.emit(it.x, it.y + 1, it.z, rand(-4, 4), rand(1, 6), rand(-4, 4),
          rand(0.3, 0.8), rand(0.4, 1.0), c.r, c.g, c.b, 3, 0.94);
      }
    }
    if (this.audio) {
      this.audio.ring && this.audio.ring();
      // the announcer outranks the street chatter, so grabbing a case mid-pileup is
      // still the thing you hear
      this.audio.powerupLine && this.audio.powerupLine(it.kind);
    }
    this.blessingEffects.updateRider(player, it.kind === 'blessed', 0);
    this.onPickup(it.kind, null);
  }
}
