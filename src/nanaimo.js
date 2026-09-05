// nanaimo.js — throw Nanaimo bars at traffic: splat, swerve, crash
import * as THREE from 'three';
import { TEX } from './textures.js';
import { createNanaimoBar } from './pickup-models.js';
import { clamp, rand, choice } from './util.js';

export class BarThrower {
  constructor(scene, opts) {
    this.scene = scene;
    this.traffic = opts.traffic;
    this.effects = opts.effects;
    this.audio = opts.audio;
    this.onHit = opts.onHit || (() => {});
    this.peds = opts.peds || null;
    this.police = opts.police || null;
    this.onOfficerHit = opts.onOfficerHit || (() => {});
    this.previousBarPosition = new THREE.Vector3();
    this.onPedHit = opts.onPedHit || (() => {});
    this.cool = 0;
    this.thrown = 0;
    this.hits = 0;

    // bar pool
    this.bars = [];
    for (let i = 0; i < 14; i++) {
      const g = createNanaimoBar();
      g.visible = false;
      scene.add(g);
      this.bars.push({ mesh: g, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }

    // splat decals that ride the struck cars' windshields
    this.splats = [];
    const splatMat = new THREE.MeshBasicMaterial({ map: TEX.splat, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), splatMat.clone());
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.splats.push({ mesh: m, car: null, off: new THREE.Vector3(), rotZ: 0 });
    }
  }

  get ready() { return this.cool <= 0; }

  throw(player, cooldown = 0.85) {
    if (this.cool > 0 || player.state !== 'riding') return false;
    this.cool = cooldown;
    this.thrown++;
    const bar = this.bars.find(b => !b.active);
    if (!bar) return false;
    const facing = new THREE.Vector3(-Math.sin(player.heading), 0, -Math.cos(player.heading));
    let f = facing.clone();
    const G = 11.5;
    const vh = Math.max(26, player.v + 22);          // horizontal throw speed

    // Pick a car in the forward cone and solve the throw for it: lead the car by its
    // own speed, then set the vertical launch so the bar arrives at windscreen height
    // rather than face-planting short of it.
    let best = null, bestD = Infinity;
    const consider = (t, vx, vz, y) => {
      const dx = t.x - player.pos.x, dz = t.z - player.pos.z;
      const ahead = dx * facing.x + dz * facing.z;
      if (ahead < 4 || ahead > 55) return;
      const lat = Math.abs(dx * facing.z - dz * facing.x);
      if (lat > ahead * 0.45) return;                // roughly a 24-degree cone
      const dist = Math.hypot(dx, dz);
      if (dist < bestD) { bestD = dist; best = { x: t.x, z: t.z, y, vx, vz }; }
    };
    for (const car of this.traffic.cars) {
      if (!car.active || car.crashed) continue;
      const dl = Math.hypot(car.dx, car.dz) || 1;
      consider(car, (car.dx / dl) * car.v, (car.dz / dl) * car.v, car.y);
      if (best && best.x === car.x && best.z === car.z) best.car = car;
    }
    // people on the sidewalk are fair game too
    if (this.peds) {
      for (const list of [this.peds.people, this.peds.kids, this.peds.party, this.peds.specials]) {
        for (const ped of list) {
          if (!ped.active || ped.splat > 0 || ped.y === undefined) continue;
          consider(ped, 0, 0, ped.y);
        }
      }
    }

    for (const encounter of this.police?.encounters || []) {
      if (encounter.state === 'defeated') continue;
      const p = encounter.officer.position;
      consider(p, 0, 0, p.y);
    }

    const startY = player.pos.y + 1.25;
    let vy = 3.1;
    if (best) {
      const cvx = best.vx || 0, cvz = best.vz || 0;
      let t = bestD / vh;
      for (let k = 0; k < 4; k++) {                  // converge on the intercept
        const tx = best.x + cvx * t - player.pos.x;
        const tz = best.z + cvz * t - player.pos.z;
        t = Math.hypot(tx, tz) / vh;
      }
      const tx = best.x + cvx * t - player.pos.x;
      const tz = best.z + cvz * t - player.pos.z;
      const aim = new THREE.Vector3(tx, 0, tz).normalize();
      // keep it in front of the rider — no throwing over your shoulder
      if (aim.dot(facing) > 0.55) {
        f = aim;
        const targetY = (best.y || player.pos.y) + 1.4;
        vy = (targetY - startY + 0.5 * G * t * t) / Math.max(0.12, t);
        vy = clamp(vy, -2, 9);
      }
    }

    bar.active = true;
    bar.life = 3.2;
    bar.pos.copy(player.pos).addScaledVector(f, 0.9).add(new THREE.Vector3(0, 1.25, 0));
    bar.vel.copy(f).multiplyScalar(vh).add(new THREE.Vector3(0, vy, 0));
    bar.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
    bar.mesh.visible = true;
    bar.mesh.position.copy(bar.pos);
    this.audio.throwWhoosh && this.audio.throwWhoosh();
    return true;
  }

  update(dt, player) {
    this.cool = Math.max(0, this.cool - dt);
    for (const bar of this.bars) {
      if (!bar.active) continue;
      this.previousBarPosition.copy(bar.pos);
      bar.life -= dt;
      bar.vel.y -= 11.5 * dt;
      bar.pos.addScaledVector(bar.vel, dt);
      bar.mesh.position.copy(bar.pos);
      bar.mesh.rotation.x += bar.spin.x * dt;
      bar.mesh.rotation.y += bar.spin.y * dt;
      bar.mesh.rotation.z += bar.spin.z * dt;

      // Swept officer contact catches fast throws between frames.
      const officer = this.police?.hitSegment(this.previousBarPosition, bar.pos);
      if (officer) {
        bar.active = false;
        bar.mesh.visible = false;
        this.hits++;
        this.onOfficerHit(officer);
        this.audio.splat?.();
        continue;
      }

      // ---- hit a car? ----
      let hitCar = null, hx = 0, hz = 0;
      for (const car of this.traffic.cars) {
        if (!car.active || car.crashed) continue;
        const dx = bar.pos.x - car.x, dz = bar.pos.z - car.z;
        if (dx * dx + dz * dz > 64) continue;
        const dl = Math.hypot(car.dx, car.dz) || 1;
        const fx = car.dx / dl, fz = car.dz / dl;
        const along = dx * fx + dz * fz;
        const ac = clamp(along, -car.len / 2, car.len / 2);
        const cx = car.x + fx * ac, cz = car.z + fz * ac;
        if (Math.hypot(bar.pos.x - cx, bar.pos.z - cz) < 1.7 && bar.pos.y < car.y + 3.2) {
          hitCar = car; hx = bar.pos.x; hz = bar.pos.z;
          break;
        }
      }
      if (hitCar) {
        this.splatBar(bar, hitCar, hx, hz);
        continue;
      }

      // ...or somebody on the sidewalk
      if (this.peds) {
        const ped = this.peds.hitTest(bar.pos.x, bar.pos.y, bar.pos.z);
        if (ped) {
          // hand the bar's flight direction over so they go down the way it was going
          this.peds.splat(ped, bar.vel.x, bar.vel.z);
          this.onPedHit(ped);
          this.hits++;
          bar.active = false;
          bar.mesh.visible = false;
          this.audio.splat && this.audio.splat();
          continue;
        }
      }

      // ground / expiry
      const g = this.traffic.terrain.surfaceHeight(bar.pos.x, bar.pos.z);
      if (bar.pos.y <= g + 0.1 || bar.life <= 0) {
        // pavement splat: crumbs, no car
        for (let i = 0; i < 7; i++) {
          this.effects.smoke.emit(bar.pos.x, g + 0.1, bar.pos.z, rand(-1.5, 1.5), rand(0.4, 1.6), rand(-1.5, 1.5), rand(0.4, 0.8), rand(0.25, 0.5), 0.32, 0.2, 0.08, 8, 0.96);
        }
        bar.active = false;
        bar.mesh.visible = false;
      }
    }

    // splat decals follow their cars
    for (const s of this.splats) {
      if (!s.car) continue;
      const car = s.car;
      const dl = Math.hypot(car.dx, car.dz) || 1;
      const fx = car.dx / dl, fz = car.dz / dl;
      const wx = car.x - fx * (car.len * 0.28) + s.off.x;
      const wz = car.z - fz * (car.len * 0.28) + s.off.z;
      s.mesh.position.set(wx, car.y + 1.15, wz);
      s.mesh.rotation.y = Math.atan2(-fx, -fz) + Math.PI / 2;
      s.mesh.rotation.z = s.rotZ;
    }
  }

  splatBar(bar, car, hx, hz) {
    bar.active = false;
    bar.mesh.visible = false;
    this.hits++;
    // chocolate + custard burst
    for (let i = 0; i < 20; i++) {
      this.effects.smoke.emit(hx, bar.pos.y, hz, rand(-4, 4), rand(1, 6), rand(-4, 4), rand(0.4, 1.0), rand(0.3, 0.9),
        i % 3 ? 0.28 : 0.85, i % 3 ? 0.16 : 0.75, 0.1, 11, 0.96);
    }
    // decal on the windshield
    const s = this.splats.find(sp => !sp.car) || this.splats[0];
    s.car = car;
    s.off.set(rand(-0.5, 0.5), 0, rand(-0.3, 0.3));
    s.rotZ = rand(0, Math.PI * 2);
    s.mesh.visible = true;
    s.mesh.material.opacity = 1;
    s.mesh.scale.setScalar(rand(0.85, 1.25));
    // the driver loses it
    const dl = Math.hypot(car.dx, car.dz) || 1;
    const fx = car.dx / dl, fz = car.dz / dl;
    const side = (bar.vel.x * -fz + bar.vel.z * fx) >= 0 ? 1 : -1;
    this.traffic.nanaimoHit(car, side);
    this.onHit(car);
    this.audio.splat && this.audio.splat();
  }

  reset() {
    for (const bar of this.bars) { bar.active = false; bar.mesh.visible = false; }
    for (const s of this.splats) { s.car = null; s.mesh.visible = false; }
    this.cool = 0;
  }
}
