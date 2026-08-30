// effects.js — stunt ramp, rings of fire, checkpoint gates, particles
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';
import { clamp, lerp, rand, damp, smoothstep } from './util.js';

// ---------- particle pool ----------
class ParticlePool {
  constructor(scene, count, texture, additive) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.baseSize = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex;
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexColors: true,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, drag = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size; this.size[i] = size;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = clamp(this.life[i] / this.maxLife[i], 0, 1);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const dr = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.baseSize[i] * (0.4 + t * 0.8);
      const fade = t < 0.3 ? t / 0.3 : 1;
      this.col[i * 3] *= (0.9 + fade * 0.1);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, terrain, map) {
    this.scene = scene;
    this.terrain = terrain;
    this.smoke = new ParticlePool(scene, 700, TEX.dot, false);
    this.fire = new ParticlePool(scene, 700, TEX.fireDot, true);
    this.time = 0;
    this.buildRampAndRings(map);
    this.ringsHit = 0;
    this.ringBurst = [0, 0, 0];
  }

  // ---------------- ramp + rings ----------------
  buildRampAndRings(map) {
    // find beach point: route point at ~78% with max water proximity on the east
    const route = map.route;
    let total = 0;
    const cums = [0];
    for (let i = 1; i < route.length; i++) {
      total += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
      cums.push(total);
    }
    const at = (frac) => {
      const target = frac * total;
      let i = 1;
      while (i < cums.length - 1 && cums[i] < target) i++;
      return route[i];
    };
    // Ramp: launch straight off the end of the race line. The deck is aimed between
    // the rider's arrival heading and open water, and the base is pushed as far down
    // that line as the real beach allows, so the run-in is a straight shot.
    const rp = route[route.length - 1];
    const prev = route[Math.max(0, route.length - 6)];
    const tanX = rp[0] - prev[0], tanZ = rp[1] - prev[1];
    const tanLen = Math.hypot(tanX, tanZ) || 1;
    const arrive = new THREE.Vector2(tanX / tanLen, tanZ / tanLen);

    let bestAng = 0, bestSea = Infinity;
    for (let k = 0; k < 48; k++) {
      const ang = (k / 48) * Math.PI * 2;
      const sea = this.terrain.seaSignedDist(rp[0] + Math.sin(ang) * 60, rp[1] + Math.cos(ang) * 60);
      if (sea < bestSea) { bestSea = sea; bestAng = ang; }
    }
    const water = new THREE.Vector2(Math.sin(bestAng), Math.cos(bestAng));
    const dir = new THREE.Vector2(water.x + arrive.x * 0.8, water.y + arrive.y * 0.8).normalize();

    // The beach here is only ~18 m deep, so the kicker is built out over the water on
    // pilings (the deck builder already drops posts to the sea bed). Keep the base on
    // sand where possible, but never further out than the run-in needs.
    let dist = 12;
    for (let d = 12; d <= 40; d += 2) {
      if (this.terrain.seaSignedDist(rp[0] + dir.x * d, rp[1] + dir.y * d) < 2) break;
      dist = d;
    }
    dist = clamp(dist, 12, 26);
    const base = new THREE.Vector2(rp[0] + dir.x * dist, rp[1] + dir.y * dist);
    this.ramp = {
      base,
      dir,
      right: new THREE.Vector2(-dir.y, dir.x),
      len: 34, width: 11, hMax: 8.6,
    };
    this.ramp.baseY = this.terrain.groundHeight(this.ramp.base.x, this.ramp.base.y);

    // ---- trajectory from lip ----
    const { dir: rd, len, hMax } = this.ramp;
    const lipY = this.ramp.baseY + hMax + 0.12;
    const lip = new THREE.Vector2(this.ramp.base.x + rd.x * len, this.ramp.base.y + rd.y * len);
    const slope = 1.12 * hMax / len;
    const angle = Math.atan(slope);
    const v0 = 33;   // rings sit on the arc a rider actually arrives with (~120 km/h)
    const G = 15.5;
    this.traj = { lipX: lip.x, lipZ: lip.y, lipY, vH: v0 * Math.cos(angle), vY: v0 * Math.sin(angle), G };
    this.designV0 = v0;

    // ---- ramp mesh ----
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.9 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.7 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xb3241c, roughness: 0.6 });
    const deckPos = [], deckNorm = [], deckUV = [], deckIdx = [];
    const SEG = 16;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const h = hMax * Math.pow(u, 1.12);
      const cx = this.ramp.base.x + rd.x * u * len, cz = this.ramp.base.y + rd.y * u * len;
      const y = this.ramp.baseY + h + 0.12;
      const rx = this.ramp.right.x * this.ramp.width / 2, rz = this.ramp.right.y * this.ramp.width / 2;
      deckPos.push(cx + rx, y, cz + rz, cx - rx, y, cz - rz);
      deckNorm.push(0, 1, 0, 0, 1, 0);
      deckUV.push(0, u * 3, this.ramp.width / 3, u * 3);
      if (i < SEG) {
        const a = i * 2;
        deckIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
    deckGeo.setAttribute('normal', new THREE.Float32BufferAttribute(deckNorm, 3));
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(deckUV, 2));
    deckGeo.setIndex(deckIdx);
    const deck = new THREE.Mesh(deckGeo, woodMat);
    deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck);

    // side trusses + supports
    const struts = [];
    for (let i = 1; i < SEG; i += 2) {
      const u = i / SEG;
      const h = hMax * Math.pow(u, 1.12);
      const cx = this.ramp.base.x + rd.x * u * len, cz = this.ramp.base.y + rd.y * u * len;
      const gy = this.terrain.groundHeight(cx, cz);
      for (const s of [-1, 1]) {
        const px = cx + this.ramp.right.x * s * this.ramp.width / 2;
        const pz = cz + this.ramp.right.y * s * this.ramp.width / 2;
        const post = new THREE.BoxGeometry(0.28, Math.max(0.4, this.ramp.baseY + h - gy), 0.28);
        post.translate(px, gy + (this.ramp.baseY + h - gy) / 2, pz);
        struts.push(post);
      }
      const beam = new THREE.BoxGeometry(this.ramp.width, 0.22, 0.22);
      beam.rotateY(-Math.atan2(rd.y, rd.x));
      beam.translate(cx, this.ramp.baseY + h - 0.05, cz);
      struts.push(beam);
    }
    const strutMesh = new THREE.Mesh(mergeGeometries(struts, false), steelMat);
    strutMesh.castShadow = true;
    g.add(strutMesh);

    // chevron lip stripe
    const chevMat = new THREE.MeshStandardMaterial({ map: TEX.chevron, roughness: 0.7 });
    const chevGeo = new THREE.PlaneGeometry(this.ramp.width, 3.4);
    chevGeo.rotateX(-Math.PI / 2);
    chevGeo.rotateY(-Math.atan2(rd.y, rd.x));
    const chevY = this.ramp.baseY + hMax * Math.pow((SEG - 1.6) / SEG, 1.12) + 0.16;
    chevGeo.translate(this.ramp.base.x + rd.x * len * (SEG - 1.6) / SEG, chevY, this.ramp.base.y + rd.y * len * (SEG - 1.6) / SEG);
    const chev = new THREE.Mesh(chevGeo, chevMat);
    g.add(chev);

    // scaffold towers + banner at the ramp entrance
    const towerGeo = [];
    for (const s of [-1, 1]) {
      const px = this.ramp.base.x + this.ramp.right.x * s * (this.ramp.width / 2 + 1.2);
      const pz = this.ramp.base.y + this.ramp.right.y * s * (this.ramp.width / 2 + 1.2);
      const gy = this.terrain.groundHeight(px, pz);
      const t = new THREE.BoxGeometry(1.0, 10.5, 1.0);
      t.translate(px, gy + 5.25, pz);
      towerGeo.push(t);
    }
    const towers = new THREE.Mesh(mergeGeometries(towerGeo, false), steelMat);
    towers.castShadow = true;
    g.add(towers);
    // single-sided faces back to back: a DoubleSide plane reads mirrored from behind
    const bannerMat = new THREE.MeshStandardMaterial({ map: TEX.banner, roughness: 0.8 });
    const bxp = this.ramp.base.x - rd.x * 1.5, bzp = this.ramp.base.y - rd.y * 1.5;
    const bannerY = this.terrain.groundHeight(bxp, bzp) + 8.6;
    const bannerAng = -Math.atan2(rd.y, rd.x) + Math.PI / 2;
    for (const flip of [0, Math.PI]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(this.ramp.width + 3.4, 3.2), bannerMat);
      banner.position.set(bxp, bannerY, bzp);
      banner.rotation.y = bannerAng + flip;
      g.add(banner);
    }
    this.scene.add(g);

    // ---- rings of fire along trajectory ----
    this.rings = [];
    const ringDefs = [18, 34, 47]; // horizontal distance from lip
    const fireMat = new THREE.MeshStandardMaterial({
      map: TEX.fireRing, color: 0xff8830, emissive: 0xff5a10, emissiveIntensity: 2.4,
      roughness: 0.6, side: THREE.DoubleSide,
    });
    const steelRingMat = new THREE.MeshStandardMaterial({ color: 0x35393e, roughness: 0.5, metalness: 0.8 });
    for (const dist of ringDefs) {
      const t = dist / this.traj.vH;
      const cx = this.traj.lipX + rd.x * this.traj.vH * t;
      const cz = this.traj.lipZ + rd.y * this.traj.vH * t;
      const cy = this.traj.lipY + this.traj.vY * t - 0.5 * G * t * t;
      // ring normal = trajectory tangent at t
      const vy = this.traj.vY - G * t;
      const n = new THREE.Vector3(rd.x * this.traj.vH, vy, rd.y * this.traj.vH).normalize();
      const ring = new THREE.Group();
      const fire = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.5, 10, 40), fireMat.clone());
      const frame = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.22, 8, 40), steelRingMat);
      ring.add(fire, frame);
      ring.position.set(cx, cy, cz);
      ring.lookAt(cx + n.x, cy + n.y, cz + n.z);
      this.scene.add(ring);
      const light = new THREE.PointLight(0xff6a20, 260, 60, 2);
      light.position.set(cx, cy, cz);
      this.scene.add(light);
      this.rings.push({ group: ring, fire, light, center: new THREE.Vector3(cx, cy, cz), normal: n, radius: 4.6, hit: false, lastSide: 0, dist });
    }
  }

  rampHeightAt(x, z) {
    const r = this.ramp;
    const lx = x - r.base.x, lz = z - r.base.y;
    const u = lx * r.dir.x + lz * r.dir.y;
    const v = lx * r.right.x + lz * r.right.y;
    if (u >= -1 && u <= r.len && Math.abs(v) <= r.width / 2 + 0.6) {
      return r.baseY + r.hMax * Math.pow(clamp(u / r.len, 0, 1), 1.12) + 0.12;
    }
    return -Infinity;
  }

  // check ring passes; returns number newly hit this frame
  checkRings(player) {
    let hits = 0;
    for (let ri = 0; ri < this.rings.length; ri++) {
      const ring = this.rings[ri];
      const rel = new THREE.Vector3().subVectors(player.pos, ring.center);
      const side = rel.dot(ring.normal);
      if (ring.lastSide !== 0 && Math.sign(side) !== Math.sign(ring.lastSide) && Math.abs(side) < 6) {
        const radial = Math.hypot(rel.x - ring.normal.x * side, rel.z - ring.normal.z * side);
        const radial3 = rel.clone().addScaledVector(ring.normal, -side).length();
        if (radial3 < ring.radius - 0.4 && !ring.hit) {
          ring.hit = true;
          this.ringsHit++;
          this.ringBurst[ri] = 1;
          hits++;
          ring.fire.material.emissiveIntensity = 5;
          ring.fire.material.color.set(0xffd24a);
        }
      }
      ring.lastSide = side;
    }
    return hits;
  }

  splash(x, y, z, big = true) {
    const n = big ? 220 : 60;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.5, 4);
      this.smoke.emit(
        x + Math.cos(a) * r * 0.4, y, z + Math.sin(a) * r * 0.4,
        Math.cos(a) * rand(1, 7), rand(4, big ? 15 : 8), Math.sin(a) * rand(1, 7),
        rand(0.8, 2.0), rand(1.6, big ? 4.5 : 2.5),
        0.75, 0.86, 0.92, 10, 0.985,
      );
      if (i % 3 === 0) {
        this.smoke.emit(x, y + 0.2, z, rand(-2, 2), rand(2, 6), rand(-2, 2), rand(1, 2.4), rand(2, 5), 0.6, 0.75, 0.82, 9, 0.99);
      }
    }
  }

  dust(x, y, z, amount) {
    for (let i = 0; i < amount; i++) {
      this.smoke.emit(
        x + rand(-0.3, 0.3), y + 0.15, z + rand(-0.3, 0.3),
        rand(-1.2, 1.2), rand(0.6, 2.4), rand(-1.2, 1.2),
        rand(0.5, 1.1), rand(0.8, 2.0),
        0.62, 0.55, 0.44, -0.4, 0.96,
      );
    }
  }

  sparks(x, y, z, n = 14) {
    for (let i = 0; i < n; i++) {
      this.fire.emit(x, y + 0.3, z, rand(-4, 4), rand(1, 5), rand(-4, 4), rand(0.2, 0.6), rand(0.25, 0.6), 1.0, 0.75, 0.25, 12, 0.97);
    }
  }

  update(dt) {
    this.time += dt;
    this.smoke.update(dt);
    this.fire.update(dt);
    // fire ring ambience
    for (let ri = 0; ri < this.rings.length; ri++) {
      const ring = this.rings[ri];
      const flick = 0.8 + Math.sin(this.time * 9 + ri * 2.4) * 0.12 + Math.sin(this.time * 23 + ri) * 0.08;
      ring.light.intensity = (ring.hit ? 380 : 260) * flick;
      ring.fire.material.emissiveIntensity = damp(ring.fire.material.emissiveIntensity, ring.hit ? 4.2 : 2.4, 4, dt) * flick;
      // embers
      if (Math.random() < 0.7) {
        const a = rand(0, Math.PI * 2);
        const rx = Math.cos(a) * ring.radius, ry = Math.sin(a) * ring.radius;
        // ring local axes: use group quaternion
        const q = ring.group.quaternion;
        const local = new THREE.Vector3(rx, ry, 0).applyQuaternion(q);
        this.fire.emit(
          ring.center.x + local.x, ring.center.y + local.y, ring.center.z + local.z,
          rand(-0.4, 0.4), rand(1.2, 3.2), rand(-0.4, 0.4),
          rand(0.4, 0.9), rand(0.5, 1.2),
          1.0, rand(0.35, 0.6), 0.12, -1.5, 0.94,
        );
      }
      if (this.ringBurst[ri] > 0) {
        this.ringBurst[ri] -= dt * 1.4;
        const burst = Math.ceil(this.ringBurst[ri] * 30);
        for (let i = 0; i < burst; i++) {
          const a = rand(0, Math.PI * 2), rr = rand(0, ring.radius);
          const q = ring.group.quaternion;
          const local = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, rand(-1, 1)).applyQuaternion(q);
          this.fire.emit(
            ring.center.x + local.x, ring.center.y + local.y, ring.center.z + local.z,
            local.x * 2.5, rand(2, 6), local.z * 2.5,
            rand(0.3, 0.8), rand(1, 2.4), 1.0, rand(0.5, 0.8), 0.15, 2, 0.93,
          );
        }
      }
    }
  }
}

// ---------- checkpoint gates ----------
export function buildGates(scene, positions, terrain) {
  const gates = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd96a1e, roughness: 0.6 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.7, side: THREE.DoubleSide });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
  for (const p of positions) {
    const g = new THREE.Group();
    const y = terrain.groundHeight(p[0], p[1]);
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 8), poleMat);
      pole.position.set(p[0] + s * 6.5, y + 3, p[1]);
      pole.castShadow = true;
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), flagMat);
      flag.position.set(p[0] + s * 6.5, y + 5.4, p[1]);
      flag.rotation.y = Math.PI / 4;
      g.add(flag);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 6.8, 12, 20, 1, true), beamMat);
    beam.position.set(p[0], y + 6, p[1]);
    g.add(beam);
    scene.add(g);
    gates.push({ group: g, beam, pos: new THREE.Vector3(p[0], y, p[1]), passed: false });
  }
  return gates;
}
