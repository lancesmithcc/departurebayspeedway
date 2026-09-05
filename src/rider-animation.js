// Articulated rider. All joint endpoints live in bike space, so hands remain on
// the steering grips and boots on the pegs while the torso absorbs movement.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const sphere = new THREE.SphereGeometry(1, 16, 12);
const limbGeo = new THREE.CylinderGeometry(1, 0.86, 1, 12);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function mesh(parent, geometry, material, scale, position) {
  const m = new THREE.Mesh(geometry, material);
  m.scale.set(...scale);
  if (position) m.position.set(...position);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Two-bone IK with a pole direction: elbows stay out, knees stay forward.
// The endpoints are chosen inside the limb reach for all authored poses.
function joint(a, b, l1, l2, pole, out) {
  const axis = v(0, 0, 0).subVectors(b, a);
  const d = clamp(axis.length(), 0.001, l1 + l2 - 0.001);
  axis.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  return out.copy(a).addScaledVector(axis, along).addScaledVector(bend, height);
}

export class RiderAnimation {
  constructor(materials) {
    this.root = new THREE.Group();
    this.root.name = 'articulated-motocross-rider';
    this.time = 0;
    this.brake = 0; this.throttle = 0; this.superman = 0; this.nohander = 0;
    this.compression = 0; this.springVelocity = 0; this.previousGrounded = true;
    this.torso = mesh(this.root, sphere, materials.jersey, [0.16, 0.245, 0.115]);
    this.hips = mesh(this.root, sphere, materials.pants, [0.16, 0.11, 0.125]);
    this.neck = mesh(this.root, sphere, materials.jersey, [0.073, 0.08, 0.07]);
    this.protector = mesh(this.root, boxGeo, materials.plastic, [0.25, 0.23, 0.055]);
    this.backPlate = mesh(this.root, boxGeo, materials.plastic, [0.19, 0.24, 0.035]);
    this.head = new THREE.Group(); this.root.add(this.head);
    mesh(this.head, sphere, materials.helmetM, [0.145, 0.148, 0.153]);
    mesh(this.head, boxGeo, materials.helmetM, [0.195, 0.10, 0.16], [0, -0.07, -0.11]);
    mesh(this.head, boxGeo, materials.visorM, [0.215, 0.072, 0.09], [0, 0.01, -0.132]);
    mesh(this.head, boxGeo, materials.red, [0.285, 0.035, 0.05], [0, 0.02, -0.025]);
    const peak = mesh(this.head, boxGeo, materials.helmetM, [0.23, 0.024, 0.21], [0, 0.115, -0.1]);
    peak.rotation.x = -0.15;
    mesh(this.head, boxGeo, materials.red, [0.045, 0.023, 0.24], [0, 0.145, 0]);
    // Goggle frame and reflective blue lens read clearly from side/front cameras.
    mesh(this.head, boxGeo, new THREE.MeshStandardMaterial({ color: 0x71bfc9, metalness: 0.78, roughness: 0.16 }), [0.177, 0.042, 0.008], [0, 0.013, -0.18]);
    this.sides = [-1, 1].map(sign => {
      const r = { sign };
      r.upperArm = mesh(this.root, limbGeo, materials.jersey, [1, 1, 1]);
      r.forearm = mesh(this.root, limbGeo, materials.jersey, [1, 1, 1]);
      r.elbowPad = mesh(this.root, sphere, materials.plastic, [0.065, 0.07, 0.065]);
      r.glove = mesh(this.root, boxGeo, materials.glove, [0.095, 0.078, 0.11]);
      r.thigh = mesh(this.root, limbGeo, materials.pants, [1, 1, 1]);
      r.shin = mesh(this.root, limbGeo, materials.pants, [1, 1, 1]);
      r.kneePad = mesh(this.root, sphere, materials.helmetM, [0.079, 0.084, 0.059]);
      r.boot = new THREE.Group(); this.root.add(r.boot);
      mesh(r.boot, boxGeo, materials.boot, [0.11, 0.19, 0.13], [0, 0.065, 0.02]);
      mesh(r.boot, boxGeo, materials.boot, [0.11, 0.07, 0.24], [0, -0.03, -0.035]);
      for (let i = 0; i < 3; i++) mesh(r.boot, boxGeo, materials.helmetM, [0.114, 0.014, 0.018], [0, 0.02 + i * 0.045, -0.051]);
      r.shoulder = v(0, 0, 0); r.elbow = v(0, 0, 0); r.hand = v(0, 0, 0);
      r.hip = v(0, 0, 0); r.knee = v(0, 0, 0); r.foot = v(0, 0, 0);
      return r;
    });
  }

  segment(mesh, a, b, radius) {
    const dir = v(0, 0, 0).subVectors(b, a);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.scale.set(radius, Math.max(0.001, dir.length()), radius);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  }

  reset() {
    this.compression = this.springVelocity = this.time = 0;
    this.brake = this.throttle = this.superman = this.nohander = 0;
    this.previousGrounded = true;
  }

  update(dt, player) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.brake = damp(this.brake, player._lastBrake || 0, 9, dt);
    this.throttle = damp(this.throttle, player._lastThrottle || 0, 6, dt);
    // Separate envelopes avoid abruptly swapping body poses when a trick changes.
    this.superman = damp(this.superman, player.pose === 1 ? player.poseAmt : 0, 9, dt);
    this.nohander = damp(this.nohander, player.pose === 2 ? player.poseAmt : 0, 9, dt);
    if (player._landingImpact > 0) {
      this.springVelocity += Math.min(player._landingImpact * 0.055, 0.8);
      player._landingImpact = 0;
    }
    // Damped spring, substepped so low frame rates cannot explode a landing.
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.springVelocity += (-95 * this.compression - 12 * this.springVelocity) * h;
      this.compression += this.springVelocity * h;
    }
    const land = clamp(this.compression, -0.025, 0.15);
    const speed = clamp(player.v / 22, 0, 1);
    const rough = player.grounded ? (player.offroad ? 0.018 : 0.005) * speed : 0;
    const bounce = Math.sin(this.time * (player.offroad ? 22 : 15)) * rough;
    const breath = Math.sin(this.time * 2.7) * 0.004;
    const sm = this.superman, nh = this.nohander;
    const whee = clamp(player.wheelie || 0, 0, 1);
    const side = -(player.lean || 0) * 0.09;
    const rise = this.throttle * 0.055 + (player.offroad ? 0.035 : 0);
    const hip = v(side, 1.015 + rise - land + bounce, 0.15 + this.throttle * 0.035 - this.brake * 0.045 + whee * 0.06);
    hip.lerp(v(side, 1.29, 0.40), sm);
    const chest = v(side * 1.25, 1.34 + rise * 0.5 - land * 0.7 + bounce + breath, -0.15 - this.throttle * 0.045 + this.brake * 0.07 + whee * 0.09);
    chest.lerp(v(side, 1.35, -0.06), sm);
    chest.y += nh * 0.1; chest.z += nh * 0.04;
    const bodyAxis = chest.clone().sub(hip).normalize();
    const bodyQ = new THREE.Quaternion().setFromUnitVectors(UP, bodyAxis);
    this.hips.position.copy(hip);
    this.torso.position.copy(hip).lerp(chest, 0.5);
    this.torso.quaternion.copy(bodyQ);
    this.protector.position.copy(chest).add(v(0, -0.075, -0.09).applyQuaternion(bodyQ));
    this.protector.quaternion.copy(bodyQ);
    this.backPlate.position.copy(chest).add(v(0, -0.065, 0.1).applyQuaternion(bodyQ));
    this.backPlate.quaternion.copy(bodyQ);
    this.neck.position.copy(chest).addScaledVector(bodyAxis, 0.085);
    this.head.position.copy(chest).addScaledVector(bodyAxis, 0.19).add(v(0, 0.015, -0.035));
    this.head.rotation.set(-this.throttle * 0.07 + this.brake * 0.06 - sm * 0.16 - land * 0.8,
      (player.steerVis || 0) * 0.24 + Math.sin(this.time * 1.7) * (1 - speed) * 0.035,
      -(player.lean || 0) * 0.25);
    for (const r of this.sides) {
      const s = r.sign;
      r.shoulder.copy(chest).add(v(s * 0.185, 0.015, 0));
      // Exact local grip position transformed by the visible steering assembly.
      r.hand.set(s * 0.28, 0.19, 0.02).applyEuler(player.steerG.rotation).add(player.steerG.position);
      r.hand.lerp(v(s * 0.64 + side, 1.67 + Math.sin(this.time * 5 + s) * 0.025, -0.13), nh);
      joint(r.shoulder, r.hand, 0.275, 0.285, v(s, -0.15, 0.25), r.elbow);
      this.segment(r.upperArm, r.shoulder, r.elbow, 0.059);
      this.segment(r.forearm, r.elbow, r.hand, 0.049);
      r.elbowPad.position.copy(r.elbow);
      r.glove.position.copy(r.hand);
      r.glove.rotation.set(nh * -0.4, player.steerG.rotation.y, s * nh * 0.35);
      r.hip.copy(hip).add(v(s * 0.135, 0, 0));
      r.foot.set(s * 0.205, 0.465, 0.2).lerp(v(s * 0.19, 1.24, 1.08), sm);
      joint(r.hip, r.foot, 0.35, 0.36, v(s * 0.45, -0.1, -1), r.knee);
      this.segment(r.thigh, r.hip, r.knee, 0.078);
      this.segment(r.shin, r.knee, r.foot, 0.06);
      r.kneePad.position.copy(r.knee).add(v(0, 0, -0.045));
      r.boot.position.copy(r.foot);
      r.boot.rotation.set(-sm * 1.2 + this.brake * 0.06, 0, -s * sm * 0.06);
    }
    this.previousGrounded = player.grounded;
  }
}
