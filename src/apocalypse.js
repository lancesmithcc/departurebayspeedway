// apocalypse.js — what happens to the world when the thing on the church lawn gets
// back up. The sky goes over to red, the light goes with it, and fire starts falling
// out of it. Put the risen one back down and the whole thing runs in reverse.
//
// Everything here is a ramp, not a switch: `t` runs 0 -> 1 on the way in and back to 0
// on the way out, and every colour, light and fog value is a lerp along it. A hard cut
// reads as a bug; a two-second bleed reads as the sky turning.
import * as THREE from 'three';
import { clamp, rand } from './util.js';

// where the sky ends up
// The sun has to go a long way over, not just down: the terrain and the houses carry
// baked greens and whites, and the only thing that can put red on them is the light.
// A dimmed daylight sun leaves a green lawn under a red sky, which reads as a broken
// skybox rather than as the end of the world.
const HELL = {
  skyTint: 0xd1341c,          // multiplies the daylight gradient, so it keeps its shape
  cloudTint: 0x6e1408,
  sunSprite: 0xff3a10,
  sunColor: 0xff2f0a,
  sunIntensity: 2.9,
  hemiSky: 0xcc2408,
  hemiGround: 0x330804,
  hemiIntensity: 1.1,
  fog: 0x5e1408,
  fogNear: 380,
  fogFar: 2600,
  envIntensity: 0.16,
  waterColor: 0x3d0a0a,
  waterSun: 0xff6a2a,
};

export class Apocalypse {
  constructor(scene, terrain, skyWater, effects) {
    this.scene = scene;
    this.terrain = terrain;
    this.sky = skyWater;
    this.effects = effects;
    this.on = false;
    this.t = 0;                 // 0 = daylight, 1 = full furnace
    this.meteors = [];
    this.spawnAcc = 0;
    this.n = skyWater.normal;
    // scratch colours, so the per-frame lerp allocates nothing
    this._a = new THREE.Color();
    this._b = new THREE.Color();
    // A light that rides with the camera: with the sun dimmed and the fog closed in,
    // the ground would read as flat mud without something warm overhead.
    this.emberLight = new THREE.PointLight(0xff4a14, 0, 260, 1.6);
    scene.add(this.emberLight);
  }

  begin() { this.on = true; }
  end() { this.on = false; }

  // ---- the sky, in one lerp ----
  // Every value moves together off the same `t`, so the world is never caught half in
  // one palette and half in the other.
  applyPalette() {
    const t = this.t, n = this.n, h = HELL;
    const sky = this.sky;
    const mix = (from, to, out) => out.set(from).lerp(this._b.set(to), t);
    mix(n.skyTint, h.skyTint, this._a);
    sky.skyMat.color.copy(this._a);
    mix(n.cloudTint, h.cloudTint, this._a);
    sky.cloudMat.color.copy(this._a);
    mix(n.sunSprite, h.sunSprite, this._a);
    sky.sunSprite.material.color.copy(this._a);
    mix(n.sunColor, h.sunColor, this._a);
    sky.sun.color.copy(this._a);
    sky.sun.intensity = n.sunIntensity + (h.sunIntensity - n.sunIntensity) * t;
    mix(n.hemiSky, h.hemiSky, this._a);
    sky.hemi.color.copy(this._a);
    mix(n.hemiGround, h.hemiGround, this._a);
    sky.hemi.groundColor.copy(this._a);
    sky.hemi.intensity = n.hemiIntensity + (h.hemiIntensity - n.hemiIntensity) * t;
    if (this.scene.fog) {
      mix(n.fog, h.fog, this._a);
      this.scene.fog.color.copy(this._a);
      this.scene.fog.near = n.fogNear + (h.fogNear - n.fogNear) * t;
      this.scene.fog.far = n.fogFar + (h.fogFar - n.fogFar) * t;
    }
    this.scene.environmentIntensity = n.envIntensity + (h.envIntensity - n.envIntensity) * t;
    const wu = sky.water.material.uniforms;
    if (wu.waterColor) { mix(n.waterColor, h.waterColor, this._a); wu.waterColor.value.copy(this._a); }
    if (wu.sunColor) { mix(n.waterSun, h.waterSun, this._a); wu.sunColor.value.copy(this._a); }
  }

  // ---- fire out of the sky ----
  // Each meteor is a real falling body, not a particle: it is tracked here so it can
  // lay a trail on the way down and burst when it reaches the ground under it. The
  // trail and the burst go into the shared additive pool; only the bookkeeping lives
  // in this list, which is why it can stay small and still read as a downpour.
  spawnMeteor(camPos) {
    const a = rand(0, Math.PI * 2);
    // Weighted toward the near ground rather than spread evenly over a big disc: an
    // even spread puts most of the rain out past the fog, where it is a few specks.
    const r = 12 + Math.pow(Math.random(), 1.7) * 150;
    const x = camPos.x + Math.cos(a) * r;
    const z = camPos.z + Math.sin(a) * r;
    const ground = this.terrain.surfaceHeight(x, z);
    this.meteors.push({
      x, z,
      // low enough to be in frame from the moment it lights up
      y: ground + rand(55, 130),
      // a steep slant rather than straight down: vertical rain has no direction to read
      vx: rand(-11, 11), vz: rand(-11, 11), vy: -rand(30, 52),
      ground,
      size: rand(3.5, 8),
      trail: 0,
    });
  }

  updateMeteors(dt, camPos) {
    const rain = this.effects && this.effects.rain;
    const smoke = this.effects && this.effects.smoke;
    if (!rain) return;
    // Rate follows the ramp, so the first drops arrive as the sky is still turning.
    this.spawnAcc += dt * 34 * this.t;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.meteors.length < 110) this.spawnMeteor(camPos);
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.vy -= 9 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      // The trail is what you actually see — the head is one point. Laid down every
      // 12 ms and left to burn for most of a second, the gaps close up and the drop
      // reads as a streak rather than a dotted line.
      m.trail += dt;
      while (m.trail > 0.012) {
        m.trail -= 0.012;
        // back along the path, so the streak starts behind the head rather than on it
        const back = m.trail / 0.012;
        rain.emit(
          m.x - m.vx * 0.012 * back, m.y - m.vy * 0.012 * back, m.z - m.vz * 0.012 * back,
          m.vx * 0.1, m.vy * 0.06, m.vz * 0.1,
          rand(0.5, 0.95), m.size * rand(0.55, 1),
          1.0, rand(0.4, 0.7), 0.12, -1, 0.9,
        );
      }
      if (m.y > m.ground) continue;
      // touchdown: a flat splash of embers, a puff of smoke, and it is gone
      this.meteors.splice(i, 1);
      const near = Math.hypot(m.x - camPos.x, m.z - camPos.z) < 150;
      const n = near ? 26 : 8;
      for (let k = 0; k < n; k++) {
        rain.emit(
          m.x, m.ground + 0.3, m.z,
          rand(-9, 9), rand(3, 12), rand(-9, 9),
          rand(0.35, 0.95), rand(1.4, 3.4),
          1.0, rand(0.4, 0.78), 0.12, 13, 0.93,
        );
      }
      if (near && smoke) {
        for (let k = 0; k < 7; k++) {
          smoke.emit(
            m.x, m.ground + 0.4, m.z,
            rand(-2.4, 2.4), rand(1.2, 4), rand(-2.4, 2.4),
            rand(1.0, 2.0), rand(1.6, 3.4),
            0.14, 0.09, 0.08, -0.6, 0.965,
          );
        }
      }
    }
  }

  update(dt, camPos) {
    const want = this.on ? 1 : 0;
    if (this.t !== want) {
      // in over ~1.6 s, out over ~2.5 s: the world burns faster than it heals
      const rate = this.on ? 0.62 : 0.4;
      this.t = clamp(this.t + Math.sign(want - this.t) * rate * dt, 0, 1);
      this.applyPalette();
    }
    if (this.t <= 0) {
      if (this.meteors.length) this.meteors.length = 0;
      this.emberLight.intensity = 0;
      return;
    }
    if (camPos) {
      this.emberLight.position.set(camPos.x, this.terrain.surfaceHeight(camPos.x, camPos.z) + 40, camPos.z);
      this.emberLight.intensity = 900 * this.t;
      this.updateMeteors(dt, camPos);
    }
  }
}
