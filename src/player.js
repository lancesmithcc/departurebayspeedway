// player.js — dirtbike + rider + arcade physics + cameras
import * as THREE from 'three';
import { CFG, clamp, lerp, damp, rand, distPointToSeg } from './util.js';

const forwardOf = (θ) => new THREE.Vector3(-Math.sin(θ), 0, -Math.cos(θ));
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

export class Player {
  constructor(scene, terrain, ctx) {
    this.scene = scene;
    this.terrain = terrain;
    this.ctx = ctx; // { effects, buildingGrid, treeGrid, callbacks }
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.v = 0; this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.lean = 0; this.wheelie = 0; this.steerVis = 0;
    this.state = 'riding'; // riding | crashed
    this.crashT = 0;
    this.cameraMode = 0;
    this.shake = 0;
    this.topSpeed = 0;
    this.wheelSpin = 0;
    this.offroad = false;
    this.onRamp = false;
    // trick state
    this.trickYaw = 0;        // whip: bike yawed out of line with travel
    this.trickPitch = 0;      // flip rotation accumulated this air
    this.pose = 0;            // 0 none, 1 superman, 2 no-hander
    this.poseAmt = 0;
    this.airScore = 0;
    this.trickScore = 0;
    this.flips = 0;
    this.jumpCool = 0;
    this.lastTrick = null;
    this.railScrape = 0;
    this.wheelieTrick = null; // grounded wheelie (double-tap W)
    // powerup modifiers, refreshed by the game each frame
    this.mods = { vmax: 1, accel: 1, steerMul: 1, steerLag: 7, wobble: 0, invuln: false };
    this.wobblePhase = 0;
    this.onCastle = false;
    this.pedCool = 0;
    this.buildBike();
    this.reset(this.ctx.startPos, this.ctx.startHeading);
  }

  buildBike() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.7 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.95 });
    const plastic = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc21f2c, roughness: 0.35, metalness: 0.25 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.2, metalness: 1 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xb6bcc2, roughness: 0.3, metalness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a13a, roughness: 0.3, metalness: 0.9 });
    const jersey = new THREE.MeshStandardMaterial({ color: 0x1d5c4f, roughness: 0.8 });
    const helmetM = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.25, metalness: 0.15 });
    const visorM = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.15, metalness: 0.6 });
    const lensM = new THREE.MeshStandardMaterial({ color: 0xffeec2, roughness: 0.1, metalness: 0.2, emissive: 0xffd27a, emissiveIntensity: 0.18 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x232528, roughness: 0.85 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.85 });

    const B = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      return m;
    };
    const C = (r, len, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      return m;
    };
    // tapered tube between two points — used for frame rails and rider limbs
    const tube = (from, to, r0, r1, mat, seg = 8) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), mat);
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      m.castShadow = true;
      return m;
    };
    const limb = (from, to, r, mat) => tube(from, to, r, r * 0.86, mat, 9);
    const capsule = (from, to, r, mat) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = Math.max(0.02, dir.length() - r * 2);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      m.castShadow = true;
      return m;
    };

    // ---- wheel factory: tire + knobs + rim + spokes + disc, spun about local z ----
    const makeWheel = (R = 0.30, tube_r = 0.075, knobs = 18, discR = 0.13) => {
      const outer = new THREE.Group();   // orients the wheel across the bike
      outer.rotation.y = Math.PI / 2;
      const spin = new THREE.Group();    // rotate this for wheel spin
      outer.add(spin);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(R - tube_r, tube_r, 10, 30), rubber);
      tire.castShadow = true;
      spin.add(tire);
      // knobby tread blocks
      const knobGeo = new THREE.BoxGeometry(0.035, 0.022, tube_r * 1.9);
      for (let i = 0; i < knobs; i++) {
        const a = (i / knobs) * Math.PI * 2;
        const k = new THREE.Mesh(knobGeo, rubber);
        k.position.set(Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), (i % 2 ? 1 : -1) * tube_r * 0.38);
        k.rotation.z = a;
        spin.add(k);
      }
      // rim + hub + spokes
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R - tube_r * 2.05, 0.018, 6, 26), alu);
      spin.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), alu);
      hub.rotation.x = Math.PI / 2;
      spin.add(hub);
      const spokeGeo = new THREE.CylinderGeometry(0.007, 0.007, R - tube_r * 2, 4);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sp = new THREE.Mesh(spokeGeo, chrome);
        sp.position.set(Math.cos(a) * (R - tube_r * 2) / 2, Math.sin(a) * (R - tube_r * 2) / 2, (i % 2 ? 1 : -1) * 0.028);
        sp.rotation.z = a - Math.PI / 2;
        spin.add(sp);
      }
      // brake disc (drilled look via a darker inner ring)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(discR, discR, 0.012, 18), chrome);
      disc.rotation.x = Math.PI / 2; disc.position.z = 0.075;
      spin.add(disc);
      const discIn = new THREE.Mesh(new THREE.CylinderGeometry(discR * 0.55, discR * 0.55, 0.016, 14), darkMetal);
      discIn.rotation.x = Math.PI / 2; discIn.position.z = 0.075;
      spin.add(discIn);
      return { outer, spin };
    };

    // ---- hierarchy: root > leanG > pitchG (pivot at rear axle) > bike content ----
    const root = new THREE.Group();
    const leanG = new THREE.Group();
    const pitchG = new THREE.Group();
    pitchG.position.set(0, 0, 0.73);
    const bike = new THREE.Group();
    bike.position.set(0, 0, -0.73);
    pitchG.add(bike);
    leanG.add(pitchG);
    root.add(leanG);

    // ---- frame: twin perimeter rails + downtube + subframe ----
    const head = new THREE.Vector3(0, 1.02, -0.60);
    for (const s of [-1, 1]) {
      bike.add(tube(head, new THREE.Vector3(s * 0.055, 0.86, -0.02), 0.026, 0.03, alu));       // top rail
      bike.add(tube(new THREE.Vector3(s * 0.055, 0.86, -0.02), new THREE.Vector3(s * 0.075, 0.5, 0.2), 0.03, 0.028, alu));
      bike.add(tube(new THREE.Vector3(0, 0.94, -0.58), new THREE.Vector3(s * 0.06, 0.42, -0.18), 0.024, 0.024, alu)); // downtube
      bike.add(tube(new THREE.Vector3(s * 0.07, 0.82, 0.06), new THREE.Vector3(s * 0.09, 0.88, 0.6), 0.02, 0.018, darkMetal)); // subframe
    }
    bike.add(C(0.045, 0.16, alu, 0, 1.02, -0.60, Math.PI / 2 - 0.42));                         // headstock
    // ---- engine: cases, cylinder, head, kickstarter ----
    bike.add(B(0.28, 0.3, 0.42, darkMetal, 0, 0.48, 0.06));
    const cases = C(0.16, 0.3, darkMetal, 0, 0.44, 0.1, 0, 0, Math.PI / 2, 14);
    bike.add(cases);
    bike.add(B(0.2, 0.26, 0.22, metal, 0, 0.68, -0.06, 0.25));                                 // cylinder
    bike.add(B(0.22, 0.1, 0.24, alu, 0, 0.81, -0.09, 0.25));                                   // head
    for (let i = 0; i < 5; i++) bike.add(B(0.235, 0.014, 0.245, alu, 0, 0.63 + i * 0.035, -0.055 - i * 0.009, 0.25)); // fins
    // ---- exhaust: header sweeping up to a muffler ----
    bike.add(tube(new THREE.Vector3(0.02, 0.78, -0.16), new THREE.Vector3(0.12, 0.62, 0.06), 0.028, 0.03, chrome));
    bike.add(tube(new THREE.Vector3(0.12, 0.62, 0.06), new THREE.Vector3(0.15, 0.72, 0.5), 0.03, 0.045, chrome));
    const muffler = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.5, 12), alu);
    muffler.position.set(0.16, 0.78, 0.72); muffler.rotation.set(1.42, 0, 0.06);
    muffler.castShadow = true;
    bike.add(muffler);
    bike.add(B(0.1, 0.02, 0.3, darkMetal, 0.16, 0.83, 0.72, 0.15));                            // heat shield
    // ---- tank, shrouds, seat, plastics ----
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), red);
    tank.scale.set(1, 0.78, 1.7); tank.position.set(0, 0.86, -0.2); tank.castShadow = true;
    bike.add(tank);
    const cap = C(0.045, 0.03, alu, 0, 1.0, -0.26, 0, 0, 0, 10);
    bike.add(cap);
    for (const s of [-1, 1]) {
      const shroud = B(0.05, 0.28, 0.4, red, s * 0.15, 0.74, -0.3, 0, 0, s * 0.22);
      bike.add(shroud);
      bike.add(B(0.02, 0.16, 0.26, plastic, s * 0.185, 0.62, -0.28, 0, 0, s * 0.3));           // radiator
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.66), plastic);
    seat.position.set(0, 0.93, 0.3); seat.rotation.x = -0.06; seat.castShadow = true;
    bike.add(seat);
    bike.add(B(0.26, 0.06, 0.34, red, 0, 0.96, 0.62, 0.12));                                   // tail plastic
    bike.add(B(0.2, 0.14, 0.02, plastic, 0, 0.99, 0.79, 0.2));                                 // rear plate
    // fenders: short slabs laid tangent to the wheel arc (y-z plane), so they curve
    const fenderArc = (parent, cy, cz, r, a0, a1, segs, w, dirZ) => {
      const step = (a1 - a0) / segs;
      for (let i = 0; i < segs; i++) {
        const a = a0 + step * (i + 0.5);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, r * step * 1.25), red);
        seg.position.set(0, cy + Math.cos(a) * r, cz + dirZ * Math.sin(a) * r);
        seg.rotation.x = dirZ * a;
        seg.castShadow = true;
        parent.add(seg);
      }
    };
    // ---- swingarm, linkage, shock, chain ----
    for (const s of [-1, 1]) {
      bike.add(tube(new THREE.Vector3(s * 0.08, 0.44, 0.16), new THREE.Vector3(s * 0.1, 0.33, 0.73), 0.035, 0.026, alu));
    }
    const shock = C(0.032, 0.34, red, 0, 0.62, 0.3, 0.42, 0, 0, 10);
    bike.add(shock);
    for (let i = 0; i < 6; i++) {                                                              // spring coils
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.011, 5, 12), chrome);
      coil.position.set(0, 0.53 + i * 0.043, 0.34 - i * 0.019);
      coil.rotation.set(Math.PI / 2 - 0.42, 0, 0);
      bike.add(coil);
    }
    const sprocket = C(0.09, 0.016, gold, 0, 0.33, 0.73, Math.PI / 2, 0, 0, 16);
    sprocket.position.x = -0.09;
    sprocket.rotation.set(0, 0, Math.PI / 2);
    bike.add(sprocket);
    bike.add(B(0.016, 0.012, 0.62, darkMetal, -0.09, 0.41, 0.45));                             // chain top run
    bike.add(B(0.016, 0.012, 0.6, darkMetal, -0.09, 0.26, 0.45));                              // chain bottom run
    // footpegs + kickstand
    for (const s of [-1, 1]) bike.add(B(0.11, 0.02, 0.05, alu, s * 0.17, 0.42, 0.2, 0, 0, s * 0.1));
    bike.add(tube(new THREE.Vector3(-0.13, 0.4, 0.2), new THREE.Vector3(-0.2, 0.16, 0.34), 0.014, 0.012, darkMetal));

    // ---- steering: triple clamps, forks with sliders, bars, controls ----
    const steerG = new THREE.Group();
    steerG.position.set(0, 1.02, -0.60);
    const rake = 0.42;
    steerG.add(B(0.2, 0.035, 0.07, alu, 0, 0.12, 0.0));                                        // top clamp
    steerG.add(B(0.2, 0.035, 0.07, alu, 0, -0.06, -0.02));                                     // lower clamp
    for (const s of [-1, 1]) {
      steerG.add(C(0.026, 0.42, chrome, s * 0.095, -0.16, -0.06, rake * 0.4, 0, 0, 10));       // stanchion
      steerG.add(C(0.033, 0.4, darkMetal, s * 0.095, -0.5, -0.2, rake * 0.4, 0, 0, 10));       // slider
      steerG.add(B(0.055, 0.2, 0.05, red, s * 0.115, -0.42, -0.18, rake * 0.4));               // fork guard
    }
    const bars = C(0.02, 0.66, alu, 0, 0.19, 0.02, 0, 0, Math.PI / 2, 10);
    steerG.add(bars);
    steerG.add(B(0.16, 0.05, 0.05, red, 0, 0.23, 0.02));                                       // bar pad
    for (const s of [-1, 1]) {
      steerG.add(C(0.03, 0.13, plastic, s * 0.28, 0.19, 0.02, 0, 0, Math.PI / 2, 10));         // grips
      steerG.add(B(0.11, 0.012, 0.03, alu, s * 0.2, 0.17, -0.03, 0, s * 0.25, 0));             // levers
    }
    // headlight shroud + number plate up front
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), lensM);
    light.scale.set(1, 0.85, 0.5); light.position.set(0, 0.02, -0.14);
    steerG.add(light);
    steerG.add(B(0.22, 0.2, 0.03, red, 0, 0.02, -0.1, 0.12));
    // front brake caliper rides with the fork
    steerG.add(B(0.045, 0.1, 0.07, alu, 0.1, -0.62, -0.12));
    bike.add(steerG);

    // ---- wheels ----
    const fw = makeWheel(0.31, 0.072, 20, 0.125);
    this.frontWheel = fw.spin;
    fw.outer.position.set(0, -0.72, -0.16);
    steerG.add(fw.outer);
    const rw = makeWheel(0.3, 0.085, 18, 0.11);
    this.rearWheel = rw.spin;
    rw.outer.position.set(0, 0.33, 0.73);
    bike.add(rw.outer);
    fenderArc(steerG, -0.72, -0.16, 0.42, -0.30, 1.15, 6, 0.24, 1);   // front beak
    fenderArc(bike, 0.33, 0.73, 0.44, -0.55, 0.62, 6, 0.28, 1);       // rear fender

    // ---- rider ----
    const rider = new THREE.Group();
    const hips = new THREE.Vector3(0, 1.0, 0.14);
    const chest = new THREE.Vector3(0, 1.32, -0.14);
    const neck = new THREE.Vector3(0, 1.43, -0.22);
    rider.add(capsule(hips, chest, 0.135, jersey));                                            // torso
    rider.add(B(0.28, 0.22, 0.13, new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.5 }), 0, 1.28, -0.22, 0.5)); // chest protector
    rider.add(capsule(chest, neck, 0.075, jersey));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), helmetM);
    helmet.position.set(0, 1.55, -0.28); helmet.scale.set(1, 1.02, 1.06); helmet.castShadow = true;
    rider.add(helmet);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.16), helmetM);             // chin bar
    chin.position.set(0, 1.48, -0.38); chin.rotation.x = 0.2;
    rider.add(chin);
    rider.add(B(0.21, 0.075, 0.1, visorM, 0, 1.56, -0.38, 0.1));                               // goggles
    rider.add(B(0.24, 0.03, 0.03, red, 0, 1.56, -0.28));                                       // goggle strap
    rider.add(B(0.2, 0.045, 0.19, helmetM, 0, 1.64, -0.38, -0.22));                            // peak
    rider.add(B(0.24, 0.05, 0.2, red, 0, 1.63, -0.26));                                        // helmet stripe
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Vector3(s * 0.21, 1.36, -0.2);
      const elbow = new THREE.Vector3(s * 0.34, 1.26, -0.37);
      const hand = new THREE.Vector3(s * 0.28, 1.21, -0.57);
      rider.add(capsule(shoulder, elbow, 0.055, jersey));
      rider.add(capsule(elbow, hand, 0.048, jersey));
      rider.add(B(0.09, 0.08, 0.11, glove, hand.x, hand.y, hand.z));                           // glove
      const knee = new THREE.Vector3(s * 0.23, 0.7, -0.1);
      const foot = new THREE.Vector3(s * 0.21, 0.46, 0.2);
      rider.add(capsule(new THREE.Vector3(s * 0.15, 1.0, 0.16), knee, 0.075, pants));
      rider.add(capsule(knee, foot, 0.06, pants));
      rider.add(B(0.1, 0.1, 0.16, boot, foot.x, foot.y + 0.04, foot.z - 0.02));                // boot
      rider.add(B(0.1, 0.05, 0.24, boot, foot.x, foot.y - 0.03, foot.z + 0.02));               // sole
      rider.add(B(0.11, 0.09, 0.11, new THREE.MeshStandardMaterial({ color: 0xdad6cc, roughness: 0.5 }), knee.x + s * 0.01, knee.y, knee.z - 0.06)); // knee brace
    }
    bike.add(rider);
    this.rider = rider;

    this.root = root; this.leanG = leanG; this.pitchG = pitchG; this.steerG = steerG;
    this.bikeGroup = bike;
    this.procParts = [...bike.children];   // kept so the authored model can replace them
    this.scene.add(root);
  }

  // Swap in the authored rider-on-bike GLB. It rides under the same lean/pitch groups,
  // so leaning, wheelies, whips and flips still drive it; the procedural rig stays in
  // the file as the fallback when the model can't be fetched.
  useModel(object) {
    if (!object || !this.bikeGroup) return false;
    for (const part of this.procParts) part.visible = false;
    this.rider = null;                     // pose animation belongs to the proc rig
    this.frontWheel = null;
    this.rearWheel = null;
    // keep the ground-alignment offset fitModel computed — zeroing it here buried the
    // bike up to the seat in the asphalt
    this.modelRoot = object;
    this.bikeGroup.add(object);
    return true;
  }

  reset(pos, heading) {
    this.pos.set(pos[0], this.terrain.groundHeight(pos[0], pos[1]) + 0.02, pos[1]);
    this.heading = heading;
    this.v = 0; this.vy = 0;
    this.grounded = true;
    this.state = 'riding';
    this.crashT = 0;
    this.trickYaw = 0; this.trickPitch = 0; this.pose = 0; this.poseAmt = 0;
    this.airScore = 0; this.flips = 0; this.jumpCool = 0;
    this.wheelieTrick = null;
    this.onCastle = false;
    this.pedCool = 0;
    this.wobblePhase = 0;
    this.steerSm = 0;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.leanG.rotation.set(0, 0, 0);
    this.pitchG.rotation.set(0, 0, 0);
    this.updateVisual(0);
  }

  get kmh() { return Math.abs(this.v) * 3.6; }

  groundAt(x, z) {
    let g = this.terrain.groundHeight(x, z);
    const rh = this.ctx.effects ? this.ctx.effects.rampHeightAt(x, z) : -Infinity;
    this.onRamp = rh > g;
    if (this.onRamp) g = rh;
    // the church bouncy castles are solid ground with a very generous restitution
    this.onCastle = false;
    for (const c of this.ctx.castles || []) {
      if (Math.abs(x - c.x) <= c.w && Math.abs(z - c.z) <= c.d && c.y > g) {
        g = c.y; this.onCastle = true;
      }
    }
    return g;
  }

  crash(reason) {
    if (this.state !== 'riding') return;
    if (this.mods.invuln) {                 // blessed: it bounces off you
      this.shake = Math.max(this.shake, 0.7);
      this.v *= 0.86;
      return;
    }
    this.endWheelie(false);
    this.state = 'crashed';
    this.crashT = 0;
    // Lowside: the bike drops onto the side it was leaning, then slides along the
    // road on its panels. No cartwheeling — it skids and scrubs off speed.
    this.crashSide = (this.lean || rand(-1, 1)) >= 0 ? 1 : -1;
    this.crashRoll = 0;
    this.crashYaw = rand(0.5, 1.5) * -this.crashSide;   // it swaps ends slowly
    this.crashPitch = rand(-0.12, 0.12);
    this.crashDir = forwardOf(this.heading);            // it keeps going where it was pointed
    this.ctx.callbacks.onCrash(reason);
  }

  update(dt, input) {
    const P = CFG.player;
    if (this.state === 'crashed') {
      this.crashT += dt;
      const dir = this.crashDir || forwardOf(this.heading);
      // sliding friction on asphalt, plus air drag — it scrubs down and stops
      const mu = this.offroad ? 8.5 : 5.6;
      this.v = Math.max(0, this.v - mu * dt);
      this.vy -= P.gravity * dt;
      this.pos.addScaledVector(dir, this.v * dt);
      this.pos.y += this.vy * dt;
      const g = this.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y <= g) {
        this.pos.y = g;
        this.vy = this.vy < -4 ? -this.vy * 0.18 : 0;   // one small bounce, then it stays down
      }
      // fall onto the side it was leaning and stay there
      this.crashRoll = damp(this.crashRoll, (Math.PI / 2) * this.crashSide, 7, dt);
      this.heading += this.crashYaw * dt;
      this.crashYaw *= Math.exp(-2.2 * dt);
      const skid = Math.min(1, this.v / 8);
      this.root.rotation.set(this.crashPitch * skid, this.heading, this.crashRoll);
      this.root.position.copy(this.pos);
      // the bike is on its side, so its centre rides lower than the wheels did
      this.root.position.y += 0.18 * Math.sin(Math.abs(this.crashRoll));
      // dust and sparks while it is still scrubbing
      if (this.v > 3 && this.ctx.effects) {
        this.ctx.effects.sparks(this.pos.x, this.pos.y + 0.25, this.pos.z, 2);
      }
      return;
    }

    const f = forwardOf(this.heading);
    const gHere = this.groundAt(this.pos.x, this.pos.z);

    if (this.grounded) {
      // surface limits
      const nr = this.terrain.nearestRoad(this.pos.x, this.pos.z);
      this.offroad = !this.onRamp && (!nr || nr.d > nr.seg.hw + 2.4);
      const M = this.mods;
      const vmax = (this.onRamp ? 58 : this.offroad ? P.vmaxOffroad : P.vmax) * M.vmax;

      let a = input.throttle * P.accel * M.accel * Math.max(0, 1 - this.v / vmax);
      a -= input.brake * P.brake;
      if (input.throttle < 0.05) a -= this.v * 0.28;             // engine braking
      if (this.offroad) a -= this.v * 0.12;
      // slope along forward
      const ahead = 2.6;
      const hA = this.groundAt(this.pos.x + f.x * ahead, this.pos.z + f.z * ahead);
      a -= 9.81 * (hA - this.pos.y) / ahead * 0.85;
      this.v = clamp(this.v + a * dt, 0, vmax);
      if (input.brake > 0.5 && this.v < 0.4) this.v = 0;

      // Steering (smoothed input avoids twitch). A case of Lucky drops the response
      // rate as well as the authority, so the bars answer late and then too much,
      // and adds a slow weave you have to ride out.
      this.steerSm = damp(this.steerSm ?? 0, input.steer, M.steerLag, dt);
      const speedFac = clamp(this.v / 5, 0, 1) / (1 + this.v * 0.03);
      this.heading += this.steerSm * P.steer * M.steerMul * speedFac * dt * (this.offroad ? 1.15 : 1);
      if (M.wobble > 0) {
        this.wobblePhase += dt * 3.1;
        this.heading += (Math.sin(this.wobblePhase) + Math.sin(this.wobblePhase * 2.37) * 0.5)
          * M.wobble * speedFac * dt;
      }

      // Space pops a real jump — height scales with speed, so a fast run sends it
      this.jumpCool = Math.max(0, this.jumpCool - dt);
      if (input.jump && this.jumpCool <= 0) {
        this.grounded = false;
        this.airTime = 0;
        this.vy = 6.2 + clamp(this.v * 0.2, 0, 5.0) + (this.onRamp ? 2.0 : 0);
        this.jumpCool = 0.3;
        this.airScore = 0; this.flips = 0;
        this._poseHold = 0;
        this.latchAirControls(input);
        this.ctx.callbacks.onJump && this.ctx.callbacks.onJump();
      }

      // move
      const lastY = this.pos.y;
      this.pos.addScaledVector(f, this.v * dt);
      const gNew = this.groundAt(this.pos.x, this.pos.z);
      const dy = gNew - lastY;
      if (dy < -0.9 && this.v > 9 && !this.onRamp) {
        // launched off a crest / ramp lip — a wheelie carried into the air just ends
        this.endWheelie(false);
        this.grounded = false;
        this.vy = clamp((this._lastDy ?? 0) / Math.max(dt, 1e-3), -1, 11);
        if (this.onRamp) this.vy += 1.5;
        this.airScore = 0; this.flips = 0;
        this._poseHold = 0;
        this.latchAirControls(input);
      } else {
        this._lastDy = dy;
        this.pos.y = gNew;
      }
      this.airTime = 0;
    } else {
      this.airTime += dt;
      this.vy -= P.gravity * dt;
      this.heading += input.steer * P.steer * 0.12 * dt;      // barely any steering in the air
      const f2 = forwardOf(this.heading);
      this.pos.addScaledVector(f2, this.v * dt);
      this.pos.y += this.vy * dt;
      this.airTricks(dt, input);
      const g = this.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y <= g) {
        const impact = -this.vy;
        this.pos.y = g;
        this.grounded = true;
        this.vy = 0;
        if (this.onCastle) {
          // inflatable: bank the trick, then send it straight back up
          this.landTrick(0);
          this.grounded = false;
          this.vy = Math.max(9.5, impact * 0.92);
          this.airTime = 0;
          this.airScore = 0; this.flips = 0;
          this._poseHold = 0;
          this.latchAirControls(input);
          this.ctx.callbacks.onBounce && this.ctx.callbacks.onBounce(this.pos.x, g, this.pos.z);
        } else {
          this.landTrick(impact);
          if (this.state !== 'crashed') {
            if (impact > 21) { this.crash('hardlanding'); }
            else if (impact > 9) { this.shake = Math.max(this.shake, 0.5); this.v *= 0.88; }
          }
        }
      }
      // ramp launch: at lip, rampHeightAt drops to -Inf -> natural launch via crest rule
    }

    this.topSpeed = Math.max(this.topSpeed, this.kmh);

    // guardrail: the ribbon of real road is the only place to ride
    this.railScrape = Math.max(0, this.railScrape - dt);
    const cor = this.ctx.corridor;
    if (cor && this.state === 'riding') {
      const hit = cor.contain(this.pos.x, this.pos.z);
      if (hit) {
        this.pos.x = hit.x; this.pos.z = hit.z;
        // slide along the rail rather than stopping dead
        const f3 = forwardOf(this.heading);
        const into = -(f3.x * hit.nx + f3.z * hit.nz);          // >0 when driving into it
        if (into > 0) {
          const turn = Math.atan2(-hit.nx, -hit.nz);
          let diff = turn - this.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.heading += clamp(diff, -1.6 * dt, 1.6 * dt) * 0;  // keep heading, just bleed speed
          this.v *= clamp(1 - into * 0.55 * dt * 6, 0.72, 0.995);
          this.shake = Math.max(this.shake, Math.min(0.45, into * 0.5));
          if (this.railScrape <= 0) {
            this.railScrape = 0.12;
            this.ctx.callbacks.onRail && this.ctx.callbacks.onRail(this.pos.x, this.pos.y + 0.5, this.pos.z, into);
          }
        }
      }
    }

    // ---- collisions ----
    // Inside the guardrails the road is the track: OSM footprints that clip the
    // corridor (seafront apartments, mall pads) must not be able to end a run.
    const cor0 = this.ctx.corridor;
    const inCorridor = cor0 ? (() => {
      const pr = cor0.project(this.pos.x, this.pos.z);
      return Math.abs(pr.lat) <= pr.hw + 0.6;
    })() : false;
    if (!inCorridor && (this.grounded || this.pos.y < (this.terrain.groundHeight(this.pos.x, this.pos.z) + 2))) {
      const bc = this.ctx.buildingGrid && this.ctx.buildingCollide(this.ctx.buildingGrid, this.pos.x, this.pos.z);
      if (bc) {
        const len = Math.hypot(bc.nx, bc.nz) || 1;
        this.pos.x += (bc.nx / len) * 1.2;
        this.pos.z += (bc.nz / len) * 1.2;
        if (this.v > 7) this.crash('building');
        else this.v *= 0.4;
      }
      // trees
      if (this.ctx.treeGrid) {
        for (const t of this.ctx.treeGrid.query(this.pos.x, this.pos.z, 8)) {
          const d = Math.hypot(this.pos.x - t.x, this.pos.z - t.z);
          if (d < t.r + P.radius) {
            const nx = (this.pos.x - t.x) / (d || 1), nz = (this.pos.z - t.z) / (d || 1);
            this.pos.x = t.x + nx * (t.r + P.radius);
            this.pos.z = t.z + nz * (t.r + P.radius);
            if (this.v > 7) { this.crash('tree'); break; }
            this.v *= 0.5;
          }
        }
      }
    }

    // ---- bumping into people ----
    // A body is not a wall: it takes momentum off the bike and goes flying, and the
    // bike keeps going. Only a genuinely fast hit unsettles the rider.
    this.pedCool = Math.max(0, this.pedCool - dt);
    if (this.state === 'riding' && this.ctx.peds && this.pedCool <= 0) {
      const reach = 0.9 + Math.min(1.6, this.v * 0.05);   // sweep further at speed
      const f4 = forwardOf(this.heading);
      const px = this.pos.x + f4.x * reach * 0.5, pz = this.pos.z + f4.z * reach * 0.5;
      const ped = this.ctx.peds.bumpTest(px, this.pos.y, pz, P.radius + 0.55 + reach * 0.35);
      if (ped) {
        const lost = this.ctx.peds.bump(ped, this);
        this.v = Math.max(0, this.v - lost);
        this.pedCool = 0.22;
        this.shake = Math.max(this.shake, Math.min(0.8, 0.25 + this.v * 0.012));
        this.lean += (Math.random() - 0.5) * 0.25;
        if (this.ctx.effects) this.ctx.effects.dust(this.pos.x, this.pos.y + 0.2, this.pos.z, 3);
      }
    }

    // water contact → game decides (finish after ramp / respawn before)
    if (this.pos.y < 0.5 && this.terrain.seaSignedDist(this.pos.x, this.pos.z) < -1.2) {
      this.ctx.callbacks.onWater();
    }

    // visuals
    // grounded wheelie trick (double-tap W): hold it on the back wheel for points
    if (this.wheelieTrick) {
      const wt = this.wheelieTrick;
      wt.t += dt; wt.dist += this.v * dt;
      if (input.throttle < 0.4 || this.v < 3 || input.brake > 0.4) this.endWheelie(true);
    }
    const wheelieTarget = this.wheelieTrick
      ? 0.55 + Math.sin((this.wheelieTrick.t || 0) * 6.5) * 0.06   // balance wobble
      : (this.grounded && input.throttle > 0.6 && this.v > 2 && this.v < 14 ? 0.42 : (input.brake > 0.6 && this.v > 5 ? -0.12 : 0));
    this.wheelie = damp(this.wheelie, wheelieTarget, this.wheelieTrick ? 5 : 4, dt);
    this.lean = damp(this.lean, input.steer * clamp(this.v / 22, 0, 1) * 0.55, 7, dt);
    this.steerVis = damp(this.steerVis, input.steer, 9, dt);
    this.wheelSpin += this.v * dt / 0.33;
    this.updateVisual(dt);
  }

  startWheelie() {
    if (this.state !== 'riding' || this.wheelieTrick || !this.grounded || this.v < 4) return;
    this.wheelieTrick = { t: 0, dist: 0 };
  }

  endWheelie(scored) {
    const wt = this.wheelieTrick;
    this.wheelieTrick = null;
    if (!wt || !scored) return;
    const pts = Math.round(wt.dist * 9 + Math.min(300, wt.t * 24));
    if (pts > 45) {
      this.trickScore += pts;
      const name = wt.dist > 220 ? 'EPIC WHEELIE' : 'WHEELIE';
      this.lastTrick = { name, score: pts };
      this.ctx.callbacks.onTrick && this.ctx.callbacks.onTrick(name, pts, this.trickScore);
    }
  }

  // ---------- tricks ----------
  // Throttle (and often Space) are already held when the wheels leave the ground, so
  // each air control has to be released and pressed again before it counts as a trick.
  latchAirControls(input) {
    this._thrLatch = input.throttle > 0.5;
    this._brkLatch = input.brake > 0.5;
    this._hopLatch = true;              // the jump press itself never counts
  }

  airTricks(dt, input) {
    if (input.throttle < 0.3) this._thrLatch = false;
    if (input.brake < 0.3) this._brkLatch = false;
    if (!input.hop) this._hopLatch = false;
    const thr = input.throttle > 0.5 && !this._thrLatch;
    const brk = input.brake > 0.5 && !this._brkLatch;
    const hop = input.hop && !this._hopLatch;

    // whip: lean/steer throws the back end out
    const whipTarget = clamp(input.steer, -1, 1) * 1.15;
    this.trickYaw = damp(this.trickYaw, whipTarget, 5.5, dt);
    // flips: brake spins it backwards, a fresh throttle stab spins it forwards
    if (brk) this.trickPitch += 4.2 * dt;
    else if (thr && this.airTime > 0.12) this.trickPitch -= 3.6 * dt;
    else {
      // time until touchdown, so the bike auto-levels for the landing
      const g = this.groundAt(this.pos.x, this.pos.z);
      const drop = Math.max(0, this.pos.y - g);
      const tGround = this.vy < 0 ? drop / Math.max(0.5, -this.vy) : 99;
      const lambda = tGround < 0.55 ? 14 : 5;
      const target = Math.round(this.trickPitch / (Math.PI * 2)) * Math.PI * 2;
      this.trickPitch = damp(this.trickPitch, target, lambda, dt);
      // only pull the whip back in once the rider lets go of the bars
      if (Math.abs(input.steer) < 0.2 || tGround < 0.3) {
        this.trickYaw = damp(this.trickYaw, 0, tGround < 0.4 ? 12 : 6, dt);
      }
    }
    // poses: a fresh Space tap = no-hander, hands-off coasting = superman
    const handsOff = Math.abs(input.steer) < 0.2 && !thr && !brk;
    this._poseHold = handsOff ? (this._poseHold || 0) + dt : 0;
    // superman only counts if the rider actually stretches out for a beat
    const wantPose = hop ? 2 : (this._poseHold > 0.5 && this.airTime > 0.45 ? 1 : 0);
    this.pose = wantPose;
    this.poseAmt = damp(this.poseAmt, wantPose ? 1 : 0, 8, dt);

    const flips = Math.abs(this.trickPitch) / (Math.PI * 2);
    this.flips = Math.floor(flips + 0.02);
    this.airScore += dt * (26 + Math.abs(this.trickYaw) * 90 + this.poseAmt * 70 + Math.abs(this.trickPitch) * 30);
  }

  landTrick(impact) {
    const full = Math.PI * 2;
    const off = Math.abs(this.trickPitch - Math.round(this.trickPitch / full) * full);
    const whipOff = Math.abs(this.trickYaw);
    const clean = off < 1.15 && whipOff < 0.95;
    const names = [];
    if (this.flips >= 1) names.push(this.trickPitch > 0 ? (this.flips > 1 ? `${this.flips}x BACKFLIP` : 'BACKFLIP') : 'FRONTFLIP');
    if (whipOff > 0.55 || this._whipPeak > 0.55) names.push('WHIP');
    if (this._posePeak >= 2) names.push('NO-HANDER');
    else if (this._posePeak >= 1) names.push('SUPERMAN');
    const score = Math.round(this.airScore + this.flips * 600 + (this._whipPeak || 0) * 260);

    this.trickPitch = 0; this.trickYaw = 0; this.poseAmt = 0; this.pose = 0;
    this._whipPeak = 0; this._posePeak = 0;
    const banked = this.airScore;
    this.airScore = 0; this.flips = 0;

    if (!clean && banked > 40) {
      if (off > 1.9 || impact > 14) { this.crash('badlanding'); return; }
      // sketchy but survivable: it costs speed instead of the run
      this.v *= 0.55;
      this.shake = Math.max(this.shake, 0.7);
      return;
    }
    if (names.length && banked > 45) {
      this.trickScore += score;
      this.lastTrick = { name: names.join(' + '), score };
      this.ctx.callbacks.onTrick && this.ctx.callbacks.onTrick(this.lastTrick.name, score, this.trickScore);
    } else if (banked > 120) {
      const airPts = Math.round(banked);
      this.trickScore += airPts;
      this.lastTrick = { name: 'BIG AIR', score: airPts };
      this.ctx.callbacks.onTrick && this.ctx.callbacks.onTrick('BIG AIR', airPts, this.trickScore);
    }
  }

  updateVisual(dt) {
    // Hard floor: physics can put the contact point a hair under the surface on a
    // crest, and a crash tumble rotates the whole rig about its axle — either way the
    // rider must never end up under the road.
    const floor = this.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < floor) this.pos.y = floor;
    this.root.position.copy(this.pos);
    // when the bike is pitched or rolled hard, lift it enough that the model's low
    // corner still clears the ground
    const tilt = Math.abs(this.leanG ? this.leanG.rotation.z : 0)
      + Math.abs(this.pitchG ? this.pitchG.rotation.x : 0);
    if (tilt > 0.15) this.root.position.y += Math.min(0.75, (tilt - 0.15) * 0.55);
    this.root.rotation.y = this.heading;
    if (this.state === 'riding') {
      this._whipPeak = Math.max(this._whipPeak || 0, Math.abs(this.trickYaw));
      this._posePeak = Math.max(this._posePeak || 0, this.pose);
      this.leanG.rotation.z = this.lean - this.trickYaw * 0.35;
      this.leanG.rotation.y = this.trickYaw;                     // tail kicked out
      this.pitchG.rotation.x = this.wheelie + this.trickPitch
        + (this.grounded ? 0 : clamp(this.vy * 0.02, -0.25, 0.3));
      if (this.steerG) this.steerG.rotation.y = this.steerVis * 0.38;
      if (this.frontWheel) this.frontWheel.rotation.z = -this.wheelSpin;
      if (this.rearWheel) this.rearWheel.rotation.z = -this.wheelSpin;
      // rider animation: stand on gas, sit under braking, extend for tricks,
      // lean back with arms straight when clamping a wheelie
      const crouch = (this._lastBrake || 0) - (this._lastThrottle || 0);
      const superman = this.pose === 1 ? this.poseAmt : 0;
      const nohander = this.pose === 2 ? this.poseAmt : 0;
      const whee = this.wheelieTrick ? 1 : 0;
      if (this.rider) {
        this.rider.position.y = crouch * 0.05 + superman * 0.12 + nohander * 0.07 - whee * 0.06;
        this.rider.position.z = crouch * 0.08 + superman * 0.34 - nohander * 0.1 - whee * 0.12;
        this.rider.rotation.x = -superman * 0.6 + nohander * 0.15 - whee * 0.22;
      } else if (this.modelRoot) {
        // the authored model is one piece: sell the same moves by shifting the whole
        // bike a little in the saddle
        this.modelRoot.position.z = superman * 0.22 - nohander * 0.06 + crouch * 0.05;
        this.modelRoot.rotation.x = -superman * 0.18 - whee * 0.05;
      }
    }
  }

  setLastInput(input) {
    this._lastThrottle = input.throttle;
    this._lastBrake = input.brake;
  }

  // ---------- cameras ----------
  updateCamera(camera, dt, time) {
    const f = forwardOf(this.heading);
    const speedT = clamp(Math.abs(this.v) / CFG.player.vmax, 0, 1);
    if (this.cameraMode === 3) { // title orbit
      const r = this._orbitR || 26;
      const a = time * 0.12;
      const cx = this.pos.x + Math.cos(a) * r;
      const cz = this.pos.z + Math.sin(a) * r;
      camera.position.lerp(new THREE.Vector3(cx, this.pos.y + (this._orbitH || 9), cz), 1 - Math.exp(-2 * dt));
      camera.lookAt(this.pos.x, this.pos.y + 2, this.pos.z);
      camera.fov = damp(camera.fov, 58, 3, dt);
      camera.updateProjectionMatrix();
      return;
    }
    if (this.cameraMode === 2) { // fpv
      const up = new THREE.Vector3(0, 1, 0);
      camera.position.copy(this.pos).addScaledVector(f, 0.15).add(new THREE.Vector3(0, 1.58, 0));
      const look = this.pos.clone().addScaledVector(f, 24).add(new THREE.Vector3(0, 1.2, 0));
      camera.up.copy(up);
      camera.lookAt(look);
      camera.fov = damp(camera.fov, 74 + speedT * 10, 6, dt);
      camera.updateProjectionMatrix();
      return;
    }
    const near = this.cameraMode === 1;
    const dist = (near ? 4.6 : CFG.camera.dist) * (1 + speedT * 0.25);
    const height = (near ? 1.9 : CFG.camera.height) + speedT * 0.6;
    const desired = this.pos.clone().addScaledVector(f, -dist).add(new THREE.Vector3(0, height, 0));
    // keep camera above ground
    desired.y = Math.max(desired.y, this.terrain.groundHeight(desired.x, desired.z) + 1.2);
    camera.position.lerp(desired, 1 - Math.exp(-(near ? 9 : 6.5) * dt));
    const look = this.pos.clone().addScaledVector(f, 7).add(new THREE.Vector3(0, 1.4, 0));
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    // shake
    this.shake = Math.max(this.shake * Math.exp(-3 * dt), speedT * 0.06 + (this.offroad ? 0.05 : 0));
    if (this.shake > 0.005) {
      camera.position.x += rand(-1, 1) * this.shake * 0.25;
      camera.position.y += rand(-1, 1) * this.shake * 0.2;
    }
    camera.fov = damp(camera.fov, CFG.camera.fovBase + speedT * CFG.camera.fovBoost, 4, dt);
    camera.updateProjectionMatrix();
  }
}

