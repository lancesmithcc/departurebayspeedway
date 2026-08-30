// peds.js — people on the sidewalks, kids crossing at the school zone, and the
// congregation running around the Baptist church lawn.
// They walk beside the corridor, they get out of the way, a Nanaimo bar puts them
// face down in the chocolate, and a dirtbike to the hip sends them over the bars.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { recolorFlattened } from './models.js';
import { clamp, rand, choice } from './util.js';

const WALK_SPEED = [1.0, 1.7];
const KID_SPEED = [1.6, 2.4];
const PARTY_SPEED = [2.6, 4.4];
// Nobody gets up again: a body is a body for the rest of the run.

// one low-poly person, built once and instanced
function personGeometry(scale = 1, palette = null) {
  const parts = [];
  const P = palette || { legs: [0.16, 0.18, 0.24], skin: [0.82, 0.66, 0.55] };
  const push = (g, r, gr, b) => {
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = gr; col[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g.toNonIndexed ? g.toNonIndexed() : g);
  };
  const legs = new THREE.CylinderGeometry(0.13, 0.15, 0.82, 6);
  legs.translate(0, 0.41 * scale, 0);
  legs.scale(scale, scale, scale);
  push(legs, P.legs[0], P.legs[1], P.legs[2]);        // jeans (or Sunday whites)
  const torso = new THREE.CapsuleGeometry(0.19, 0.42, 3, 8);
  torso.translate(0, 1.06 * scale, 0);
  torso.scale(scale, scale, scale);
  push(torso, 1, 1, 1);                               // tinted per instance
  const head = new THREE.SphereGeometry(0.13, 10, 8);
  head.translate(0, 1.48 * scale, 0);
  head.scale(scale, scale, scale);
  push(head, P.skin[0], P.skin[1], P.skin[2]);
  for (const s of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.06, 0.36, 2, 6);
    arm.translate(s * 0.24 * scale, 1.02 * scale, 0);
    arm.scale(scale, scale, scale);
    push(arm, 1, 1, 1);
  }
  return mergeGeometries(parts, false);
}

export class Peds {
  constructor(scene, corridor, terrain, opts = {}) {
    this.corridor = corridor;
    this.terrain = terrain;
    this.audio = opts.audio || null;
    this.effects = opts.effects || null;
    this.onSplat = opts.onSplat || (() => {});
    this.onBump = opts.onBump || (() => {});
    this.crossings = opts.crossings || [];      // world points where kids cross
    this.partySpot = opts.partySpot || null;    // { x, z, r } church lawn
    // Solid things to walk round rather than through: the OSM building footprints via
    // the same grid the bike uses, plus authored boxes (church, bouncy castles) that
    // never made it into that grid because they are props, not map buildings.
    this.buildingGrid = opts.buildingGrid || null;
    this.buildingCollide = opts.buildingCollide || null;
    this.blockers = opts.blockers || [];
    // Flat decks drawn over sloping ground — the church lawn disc. Standing at terrain
    // height inside one puts a person under the surface everyone can see.
    this.platforms = opts.platforms || [];

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    // Bodies never get cleared away, so the walker pool has to be deep enough to keep
    // spawning a live crowd on top of everybody already lying in the road.
    this.MAX = 76;
    this.KIDS = 16;
    // named characters with their own models rather than an instanced slot
    this.specials = [];
    // Authored people if the CC0 character kit loaded, the built-in stand-ins if not.
    // Each variant gets its own instanced mesh; a walker keeps one (variant, slot) for
    // the session so nothing swaps bodies mid-stride.
    this.variants = (opts.models && opts.models.length) ? opts.models : null;
    this.meshes = [];
    this.kidMeshes = [];
    // Kept so the whole crowd can be re-dressed mid-run when the lawn turns: the kit
    // geometry to recolour from, and the everyday one to put back.
    this.crowdSrc = [];
    this.crowdNormalGeos = [];
    if (this.variants) {
      // Each character is baked at several points of its walk cycle. A walker keeps its
      // character and its slot, and steps between the frame meshes as its phase
      // advances — animated legs without skinning every instance each frame.
      const per = Math.ceil((this.MAX + this.KIDS) / this.variants.length) + 2;
      this.frameCount = Math.max(1, (this.variants[0].frames || [null]).length);
      this.variants.forEach((v) => {
        const src = (v.frames && v.frames.length ? v.frames : [v.geometry]);
        const frames = src.map((geo) => {
          const m = new THREE.InstancedMesh(geo, v.material, per);
          m.castShadow = true; m.receiveShadow = true;
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          m.frustumCulled = false;
          scene.add(m);
          return m;
        });
        this.meshes.push(frames);
        // what to recolour from, and what to put back
        this.crowdSrc.push({ parts: v.parts, geos: src });
        this.crowdNormalGeos.push(src.slice());
      });
      this.kidMeshes = this.meshes;      // kids ride the same meshes, scaled per instance
    } else {
      this.standInGeo = personGeometry(1);
      const m = new THREE.InstancedMesh(this.standInGeo, mat, this.MAX + this.KIDS);
      m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push([m]);
      this.kidMeshes = this.meshes;
      this.frameCount = 1;
    }
    this.mesh = this.meshes[0][0];
    this.kidMesh = this.mesh;

    this.shirts = ['#c8452f', '#2f5fa8', '#e0a52c', '#3f8f57', '#8a4fa8', '#d8d4c8', '#26303a'];
    // Every walker keeps one instance slot for good. Compacting the live ones into
    // the front of the buffer meant a slot's colour and position jumped to a
    // different person whenever somebody spawned — that is what flickered.
    const nv = this.meshes.length;
    this.people = [];
    for (let i = 0; i < this.MAX; i++) {
      this.people.push({ active: false, kid: false, splat: 0, variant: i % nv, slot: Math.floor(i / nv) });
    }
    this.kids = [];
    const kidBase = Math.ceil(this.MAX / nv);
    for (let i = 0; i < this.KIDS; i++) {
      this.kids.push({ active: false, kid: true, splat: 0, variant: i % nv, slot: kidBase + Math.floor(i / nv) });
    }

    // ---- the congregation on the church lawn ----
    // They are the same authored people as the street crowd — same bodies, same baked
    // walk frames — recoloured into Sunday whites off the kit's own material names, so
    // the lawn party is as detailed as the sidewalk instead of a set of dowels. Faces,
    // hair and shoes are left alone; everything they are wearing goes to linen.
    this.PARTY = 26;
    this.party = [];
    this.partyMeshes = [];
    // kept so the congregation can be re-dressed mid-run: the untouched kit geometry
    // to recolour from, and the Sunday whites to put back on a restart
    this.partySrc = [];
    this.partyWhiteGeos = [];
    this.damned = false;
    if (this.partySpot) {
      const linen = new THREE.Color(0xf4f1e6);
      const whites = (name, col) => (
        /skin|eye|brow|hair|shoe|sock/i.test(name) ? null : col.clone().lerp(linen, 0.92)
      );
      if (this.variants && this.variants[0] && this.variants[0].parts) {
        // Half the kit is plenty for 26 people on one lawn, and every extra variant
        // costs another six instanced meshes for its six walk frames.
        const cast = this.variants.slice(0, 4);
        const perP = Math.ceil(this.PARTY / cast.length) + 2;
        cast.forEach((v) => {
          const src = (v.frames && v.frames.length ? v.frames : [v.geometry]);
          const frames = src.map((geo) => {
            const m = new THREE.InstancedMesh(recolorFlattened(geo, v.parts, whites), v.material, perP);
            m.castShadow = true; m.receiveShadow = true;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;
            scene.add(m);
            return m;
          });
          this.partyMeshes.push(frames);
          this.partySrc.push({ parts: v.parts, geos: src });
          this.partyWhiteGeos.push(frames.map(m => m.geometry));
        });
      } else {
        // no kit: the procedural stand-ins, dressed the same way
        const whiteGeo = personGeometry(1, { legs: [0.94, 0.94, 0.92], skin: [0.86, 0.7, 0.58] });
        this.partyWhiteGeo = whiteGeo;
        const m = new THREE.InstancedMesh(whiteGeo,
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), this.PARTY);
        m.castShadow = true; m.receiveShadow = true;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        scene.add(m);
        this.partyMeshes.push([m]);
      }
      const nvp = this.partyMeshes.length;
      for (let i = 0; i < this.PARTY; i++) {
        this.party.push({
          active: true, party: true, kid: i % 4 === 0, splat: 0,
          variant: i % nvp, slot: Math.floor(i / nvp),
        });
      }
      this.seedParty();
    }

    // ---- chocolate on the pavement: a flat decal per victim ----
    this.decals = [];
    if (opts.splatTexture) {
      for (let i = 0; i < 24; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({
          map: opts.splatTexture, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
        }));
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 4;
        scene.add(m);
        this.decals.push({ mesh: m, t: 0 });
      }
    }
    this.decalCursor = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    // Kids are the same models at 3/4 size. The scale has to ride in each instance
    // matrix — scaling the InstancedMesh itself scales the instances' world positions
    // too, which dragged every child underground and toward the origin.
    this._sKid = new THREE.Vector3(0.74, 0.74, 0.74);
    this._c = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
    this.voiceCool = 0;
    this.seedKids();
  }

  // ---- the surface a person actually stands on ----
  // Three things can be the top at any given point and only the highest of them is
  // what you see: the analytic surface, the terrain triangles as drawn (the grid is
  // ~15 m, so between samples the drawn ground sits above the maths), and any flat
  // deck laid over sloping ground. Take the lowest of the three and people sink.
  stand(x, z) {
    let y = this.terrain.surfaceHeight(x, z);
    const drawn = this.terrain.meshHeight ? this.terrain.meshHeight(x, z) : null;
    if (drawn !== null && drawn !== undefined && drawn > y) y = drawn;
    for (const p of this.platforms) {
      if (Math.hypot(x - p.x, z - p.z) > p.r) continue;
      if (p.y > y) y = p.y;
    }
    return y;
  }

  // Is this point inside something solid? Blockers are boxes with their own rotation
  // (the church, the bouncy castles); the building grid carries the OSM footprints.
  blocked(x, z, pad = 0.5) {
    for (const b of this.blockers) {
      const dx = x - b.x, dz = z - b.z;
      const c = Math.cos(-(b.rot || 0)), sn = Math.sin(-(b.rot || 0));
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true;
    }
    if (this.buildingGrid && this.buildingCollide) {
      if (this.buildingCollide(this.buildingGrid, x, z)) return true;
    }
    return false;
  }

  // ---- and the things they cannot walk into ----
  // Ejects a body to just outside whatever it has stepped into. Run every frame, so it
  // is only ever a few centimetres of correction; the big push only happens if
  // something spawned inside a wall.
  pushOut(ped) {
    for (const b of this.blockers) {
      // into the box's own frame, so a rotated building is still one comparison
      const dx = ped.x - b.x, dz = ped.z - b.z;
      const c = Math.cos(-b.rot || 0), sn = Math.sin(-b.rot || 0);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const ox = b.hw + 0.5 - Math.abs(lx), oz = b.hd + 0.5 - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      // out through the nearest face
      let nlx = lx, nlz = lz;
      if (ox < oz) nlx = Math.sign(lx || 1) * (b.hw + 0.5);
      else nlz = Math.sign(lz || 1) * (b.hd + 0.5);
      const cb = Math.cos(b.rot || 0), sb = Math.sin(b.rot || 0);
      ped.x = b.x + nlx * cb - nlz * sb;
      ped.z = b.z + nlx * sb + nlz * cb;
    }
    if (this.buildingGrid && this.buildingCollide) {
      const hit = this.buildingCollide(this.buildingGrid, ped.x, ped.z);
      if (hit) {
        // buildingCollide hands back the vector from the nearest wall to the point,
        // which points *inwards*; step back to that wall and out past it
        const l = Math.hypot(hit.nx, hit.nz) || 1;
        ped.x = ped.x - hit.nx - (hit.nx / l) * 0.5;
        ped.z = ped.z - hit.nz - (hit.nz / l) * 0.5;
      }
    }
  }

  // The sidewalk slab in props.js sits 0.28 m proud of the carved ground, and the road
  // deck 0.47 m proud of it. Standing anybody at terrain.groundHeight() drops them
  // through both — which is exactly what the buried pedestrians were.
  standHeight(x, z, i, side) {
    const ground = this.stand(x, z);
    if (i === undefined || !side) return ground;
    const e = this.corridor.edgePoint(Math.round(clamp(i, 0, this.corridor.pts.length - 1)), side);
    const walkTop = this.terrain.groundHeight(e[0], e[1]) + 0.28;
    // whichever surface is actually on top: the slab where it stands proud of the
    // verge, the verge where the slab is cut into a bank
    return Math.max(ground, walkTop);
  }

  // A named character with its own model instead of an instanced slot. It carries the
  // same record fields as everybody else on the pavement, so bars, the front wheel and
  // the ragdoll all work on it without knowing it is special.
  addSpecial(object, x, z, opts = {}) {
    const rec = {
      active: true, special: true, object, x, z,
      y: undefined,
      heading: opts.heading || 0,
      splat: 0, dead: false, choc: 0, tumble: 0, phase: 0,
      kid: false,
      hitRadius: opts.hitRadius ?? 1.2,
      fallLength: opts.fallLength ?? 0.85,
      // seconds face down before they get back up; 0/absent means they stay down.
      // The spec is kept separately because standing up clears the live one.
      riseDelay: opts.riseDelay || 0,
      riseDelaySpec: opts.riseDelay || 0,
      riseT: 0,
      onDeath: opts.onDeath || null,
      onRise: opts.onRise || null,
      onRevive: opts.onRevive || null,
      home: { x, z, heading: opts.heading || 0 },
      name: opts.name || 'special',
    };
    this.specials.push(rec);
    return rec;
  }

  // the Baptist church party: everyone in white, tearing around the bouncy castles
  seedParty() {
    const c = this.partySpot;
    for (const p of this.party) {
      p.orbit = rand(0, Math.PI * 2);
      p.radius = rand(4, c.r);
      p.speed = rand(PARTY_SPEED[0], PARTY_SPEED[1]) * (p.kid ? 1.15 : 1);
      p.spin = (Math.random() < 0.5 ? -1 : 1) * rand(0.25, 0.7);
      p.wobble = rand(0, 6.28);
      p.phase = rand(0, 6.28);
      p.splat = 0;
      p.shirt = '#ffffff';
      p.x = c.x + Math.cos(p.orbit) * p.radius;
      p.z = c.z + Math.sin(p.orbit) * p.radius;
      p.y = undefined;
      p.heading = undefined;
    }
  }

  // kids shuttle back and forth over the marked crossings by the school
  seedKids() {
    let k = 0;
    for (const cross of this.crossings) {
      const pr = this.corridor.projectExact(cross[0], cross[1]);
      const [nx, nz] = this.corridor.normalAt(pr.i);
      const hw = pr.hw;
      for (let n = 0; n < 4 && k < this.kids.length; n++, k++) {
        const kid = this.kids[k];
        kid.active = true;
        kid.splat = 0;
        kid.dir = n % 2 ? 1 : -1;
        kid.t = rand(0, 1);
        kid.speed = rand(KID_SPEED[0], KID_SPEED[1]);
        kid.a = [cross[0] - nx * (hw + 2.5), cross[1] - nz * (hw + 2.5)];
        kid.b = [cross[0] + nx * (hw + 2.5), cross[1] + nz * (hw + 2.5)];
        kid.lane = rand(-1.2, 1.2);          // spread along the crossing
        kid.tan = this.corridor.tan[pr.i];
        kid.shirt = choice(this.shirts);
        kid.wait = rand(0, 3);
      }
    }
    this.kidCount = k;
  }

  spawnWalker(ped, playerPos) {
    const pr = this.corridor.project(playerPos.x, playerPos.z);
    // well past the horizon of interest, so nobody watches a person appear
    const ahead = pr.i + Math.floor(rand(22, 48));
    const i = clamp(ahead, 2, this.corridor.pts.length - 3);
    const [nx, nz] = this.corridor.normalAt(i);
    const side = Math.random() < 0.5 ? -1 : 1;
    const walkOff = rand(0.5, 1.6);                        // on the sidewalk slab itself
    ped.active = true;
    ped.splat = 0;
    ped.i = i;
    ped.side = side;
    ped.walkOff = walkOff;
    ped.shy = 0;
    ped.dir = Math.random() < 0.5 ? 1 : -1;
    ped.speed = rand(WALK_SPEED[0], WALK_SPEED[1]);
    ped.phase = rand(0, 6.28);
    ped.shirt = choice(this.shirts);
    ped.x = this.corridor.pts[i][0] + nx * side * (this.corridor.hw[i] + walkOff);
    ped.z = this.corridor.pts[i][1] + nz * side * (this.corridor.hw[i] + walkOff);
    ped.y = undefined;                                     // snap to the walk on frame one
    ped.vx = 0; ped.vy = 0; ped.vz = 0;
    ped.tumble = 0;
    ped.heading = undefined;
    return true;
  }

  update(dt, playerPos, playerV) {
    this.voiceCool = Math.max(0, this.voiceCool - dt);
    const cp = this.corridor.pts;

    // keep a crowd near the rider, recycle the ones left behind
    let live = 0;
    for (const ped of this.people) {
      if (!ped.active) continue;
      // The dead hold their slot for the rest of the run: ride back up the road and
      // everybody you put down is still lying where you left them.
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
      if (d > 340) { ped.active = false; continue; }
      live++;
    }
    for (const ped of this.people) {
      if (live >= 26) break;
      if (ped.active || ped.dead) continue;
      if (this.spawnWalker(ped, playerPos)) live++;
    }

    // walkers stroll along the sidewalk, and flinch when the bike is close
    for (const ped of this.people) {
      if (!ped.active) continue;
      if (ped.splat > 0) { this.downed(ped, dt); continue; }
      // Walk along the centreline in continuous parameter space and interpolate
      // between samples — rounding to the nearest point teleported them ~8 m at a time.
      const step = this.corridor.cum[3] - this.corridor.cum[2] || 8;
      ped.i = clamp(ped.i + ped.dir * (ped.speed * dt) / step, 2, cp.length - 3.001);
      const i0 = Math.floor(ped.i), i1 = Math.min(cp.length - 1, i0 + 1);
      const f = ped.i - i0;
      const n0 = this.corridor.normalAt(i0), n1 = this.corridor.normalAt(i1);
      const nx = n0[0] + (n1[0] - n0[0]) * f, nz = n0[1] + (n1[1] - n0[1]) * f;
      const cx = cp[i0][0] + (cp[i1][0] - cp[i0][0]) * f;
      const cz = cp[i0][1] + (cp[i1][1] - cp[i0][1]) * f;
      const hw = this.corridor.hw[i0] + (this.corridor.hw[i1] - this.corridor.hw[i0]) * f;

      // ease sideways when the bike comes past instead of snapping out of the way
      const near = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
      const wantShy = (near < 10 && playerV > 8) ? (10 - near) * 0.3 : 0;
      ped.shy = (ped.shy || 0) + (wantShy - (ped.shy || 0)) * Math.min(1, 4 * dt);
      const off = hw + ped.walkOff + ped.shy;

      ped.x = cx + nx * ped.side * off;
      ped.z = cz + nz * ped.side * off;
      // Their position is rebuilt off the centreline every frame, so shoving the body
      // out of a wall would be undone on the next one. The dodge has to happen in the
      // terms the walk is written in: step in toward the kerb, and if the pavement is
      // still blocked at that point, turn round and walk back the way they came.
      if (this.blocked(ped.x, ped.z)) {
        ped.walkOff = Math.max(0.15, ped.walkOff - 4 * dt);
        const rx = cx + nx * ped.side * (hw + ped.walkOff + ped.shy);
        const rz = cz + nz * ped.side * (hw + ped.walkOff + ped.shy);
        if (this.blocked(rx, rz)) ped.dir = -ped.dir;
        else { ped.x = rx; ped.z = rz; }
      }
      this.pushOut(ped);
      const gy = this.standHeight(ped.x, ped.z, ped.i, ped.side);
      ped.y = ped.y === undefined ? gy : ped.y + (gy - ped.y) * Math.min(1, 9 * dt);
      const t0 = this.corridor.tan[i0], t1 = this.corridor.tan[i1];
      const tx = t0[0] + (t1[0] - t0[0]) * f, tz = t0[1] + (t1[1] - t0[1]) * f;
      const want = Math.atan2(tx * ped.dir, tz * ped.dir);
      let dh = want - (ped.heading ?? want);
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      ped.heading = (ped.heading ?? want) + dh * Math.min(1, 8 * dt);
      ped.phase += dt * ped.speed * 4.2;
    }

    // kids on the crossing
    for (let k = 0; k < this.kidCount; k++) {
      const kid = this.kids[k];
      if (!kid.active) continue;
      if (kid.splat > 0) { this.downed(kid, dt); continue; }
      if (kid.wait > 0) { kid.wait -= dt; continue; }
      const span = Math.hypot(kid.b[0] - kid.a[0], kid.b[1] - kid.a[1]) || 1;
      kid.t += kid.dir * (kid.speed / span) * dt;
      if (kid.t > 1) { kid.t = 1; kid.dir = -1; kid.wait = rand(1.5, 4); }
      if (kid.t < 0) { kid.t = 0; kid.dir = 1; kid.wait = rand(1.5, 4); }
      kid.x = kid.a[0] + (kid.b[0] - kid.a[0]) * kid.t + kid.tan[0] * kid.lane;
      kid.z = kid.a[1] + (kid.b[1] - kid.a[1]) * kid.t + kid.tan[1] * kid.lane;
      const kgy = this.stand(kid.x, kid.z);
      kid.y = kid.y === undefined ? kgy : kid.y + (kgy - kid.y) * Math.min(1, 9 * dt);
      const kwant = Math.atan2((kid.b[0] - kid.a[0]) * kid.dir, (kid.b[1] - kid.a[1]) * kid.dir);
      let kdh = kwant - (kid.heading ?? kwant);
      while (kdh > Math.PI) kdh -= Math.PI * 2;
      while (kdh < -Math.PI) kdh += Math.PI * 2;
      kid.heading = (kid.heading ?? kwant) + kdh * Math.min(1, 7 * dt);
      kid.phase = (kid.phase || 0) + dt * 8;
    }

    // the church lawn: everyone in white, running rings around the bouncy castles
    if (this.partySpot) {
      const c = this.partySpot;
      for (const p of this.party) {
        if (p.splat > 0) { this.downed(p, dt); continue; }
        p.wobble += dt * 1.7;
        p.orbit += (p.spin * p.speed / Math.max(2, p.radius)) * dt;
        // ceiling is the lawn ring plus enough room to clear the widest castle, so a
        // radius the dodge below pushed out does not get clamped straight back in
        p.radius = clamp(p.radius + Math.sin(p.wobble) * 2.2 * dt, 3, c.r + 6);
        let px = c.x + Math.cos(p.orbit) * p.radius;
        let pz = c.z + Math.sin(p.orbit) * p.radius;
        // A runner on a fixed ring jogs straight through a bouncy castle. When the next
        // step lands inside one, walk the radius off the ring — out first, then in —
        // until it clears: they swing round the outside and pick the line back up on
        // the far side. Keeping it as a change of *radius* means it survives the next
        // frame, which a push on x/z would not.
        if (this.blocked(px, pz)) {
          for (let k = 1; k <= 9; k++) {
            const tries = [p.radius + k * 1.5, p.radius - k * 1.5];
            let done = false;
            for (const r of tries) {
              if (r < 2.5 || r > c.r + 6) continue;
              const qx = c.x + Math.cos(p.orbit) * r, qz = c.z + Math.sin(p.orbit) * r;
              if (this.blocked(qx, qz)) continue;
              p.radius = r; px = qx; pz = qz; done = true; break;
            }
            if (done) break;
          }
        }
        const want = Math.atan2(px - p.x, pz - p.z);
        p.x = px; p.z = pz;
        this.pushOut(p);
        const gy = this.stand(p.x, p.z);
        p.y = p.y === undefined ? gy : p.y + (gy - p.y) * Math.min(1, 9 * dt);
        let dh = want - (p.heading ?? want);
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        p.heading = (p.heading ?? want) + dh * Math.min(1, 9 * dt);
        p.phase += dt * p.speed * 5.2;                    // a run, not a stroll
      }
    }

    // named characters: the pedestrian system owns where they stand and how they fall,
    // their own module owns what they look like doing it
    for (const sp of this.specials) {
      if (!sp.active) continue;
      if (sp.splat > 0) { this.downed(sp, dt); continue; }
      const gy = this.stand(sp.x, sp.z);
      sp.y = sp.y === undefined ? gy : sp.y + (gy - sp.y) * Math.min(1, 9 * dt);
    }

    // chocolate rides the body while they are down, then stays on the pavement
    for (const d of this.decals) {
      if (!d.mesh.visible) continue;
      d.t -= dt;
      if (d.follow) {
        if (d.follow.splat > 0) {
          d.mesh.position.set(d.follow.x, d.follow.y + 0.34, d.follow.z);
        } else {
          d.follow = null;                                  // they got up; it stays behind
        }
      }
      d.mesh.material.opacity = clamp(d.t / 3, 0, 1);
      if (d.t <= 0) { d.mesh.visible = false; d.follow = null; }
    }

    this.writeMatrices();
  }

  // ---- knocked flat: one shared ragdoll for bars and bikes ----
  // A hit launches the body; it arcs, lands, and stays down face-first. The tumble
  // spin keeps running while airborne so it reads as a person going over the bars
  // rather than a statue being slid along the ground.
  downed(ped, dt) {
    // Nobody gets back up. The launch arcs, the body lands, and it stays there for the
    // rest of the run — the road behind you is the scoreboard.
    const gy = this.stand(ped.x, ped.z);
    if (ped.vy !== undefined) {
      ped.vy -= 16 * dt;
      ped.x += (ped.vx || 0) * dt;
      ped.z += (ped.vz || 0) * dt;
      ped.y = (ped.y ?? gy) + ped.vy * dt;
      if (ped.y <= gy) {
        ped.y = gy;
        if (ped.vy < -3) { ped.vy = -ped.vy * 0.22; }      // one flop, then it stays down
        else { ped.vy = 0; ped.vx = 0; ped.vz = 0; ped.grounded = true; }
        ped.vx *= 0.4; ped.vz *= 0.4;
      }
    }
    // fall flat: 0 upright, 1 fully prone. Airborne bodies keep tumbling.
    const rate = ped.grounded ? 7 : 2.6;
    ped.tumble = (ped.tumble ?? 0) + (1 - (ped.tumble ?? 0)) * Math.min(1, rate * dt);
    if (!ped.grounded) ped.tumble += dt * 1.6;
    // ...unless they are not staying down. Only named characters get a rise delay, and
    // the clock does not start until the body has actually landed.
    if (ped.riseDelay && ped.grounded && !ped.risen) {
      ped.riseT = (ped.riseT || 0) + dt;
      if (ped.riseT >= ped.riseDelay) this.standUp(ped);
    }
  }

  // ---- back on their feet ----
  // The ragdoll lets go and the body comes upright again. Whatever they look like
  // doing it is the caller's business: this only undoes the fall.
  standUp(ped) {
    ped.splat = 0;
    ped.dead = false;
    ped.choc = 0;
    ped.tumble = 0;
    ped.twist = 0;
    ped.grounded = false;
    ped.vx = 0; ped.vz = 0; ped.vy = undefined;
    ped.risen = true;
    // Once only. They can be put down again — that is the whole point of what gets up
    // — but the second hit is the last one, so there is no loop to farm.
    ped.riseDelay = 0;
    ped.riseT = 0;
    ped.y = this.stand(ped.x, ped.z);
    if (this.effects) {
      this.effects.dust(ped.x, ped.y + 0.2, ped.z, 14);
      for (let i = 0; i < 40; i++) {
        this.effects.smoke.emit(
          ped.x + rand(-0.6, 0.6), ped.y + rand(0, 2.0), ped.z + rand(-0.6, 0.6),
          rand(-2.2, 2.2), rand(2.5, 8), rand(-2.2, 2.2),
          rand(0.7, 1.6), rand(0.5, 1.1),
          0.95, 0.32, 0.06, 13, 0.95,
        );
      }
    }
    if (ped.onRise) ped.onRise(ped);
  }

  writeMatrices() {
    const parkAll = (frames, slot, except) => {
      for (let f = 0; f < frames.length; f++) {
        if (f === except) continue;
        this._p.set(0, -500, 0);
        this._q.identity();
        this._m.compose(this._p, this._q, this._s);
        frames[f].setMatrixAt(slot, this._m);
      }
    };
    const write = (meshes, list) => {
      for (const ped of list) {
        const frames = meshes[ped.variant] || meshes[0];
        // step through the baked walk frames with the stride phase
        const fi = frames.length > 1 && ped.splat <= 0
          ? Math.floor(((ped.phase || 0) / (Math.PI * 2)) * frames.length) % frames.length
          : 0;
        const mesh = frames[(fi + frames.length) % frames.length];
        parkAll(frames, ped.slot, (fi + frames.length) % frames.length);
        if (!ped.active || ped.y === undefined) {
          ped.drawX = undefined;
          this._p.set(0, -500, 0);
          this._q.identity();
          this._m.compose(this._p, this._q, this._s);
          mesh.setMatrixAt(ped.slot, this._m);
          continue;
        }
        // same guard as the traffic: if somebody moved further than they could have
        // walked, hide them for a frame instead of showing the jump
        if (ped.drawX !== undefined) {
          const moved = Math.hypot(ped.x - ped.drawX, ped.z - ped.drawZ);
          if (moved > 1.2) ped.hideFrames = 2;
        }
        ped.drawX = ped.x; ped.drawZ = ped.z;
        if (ped.hideFrames > 0) {
          ped.hideFrames--;
          this._p.set(0, -500, 0);
          this._q.identity();
          this._m.compose(this._p, this._q, this._s);
          mesh.setMatrixAt(ped.slot, this._m);
          continue;
        }
        // walk cycle: a small vertical bob with a matching side-to-side roll, which
        // reads as steps without needing a skeleton
        const ph = ped.phase || 0;
        const bob = ped.splat > 0 ? 0 : Math.abs(Math.sin(ph)) * 0.055;
        const sway = ped.splat > 0 ? 0 : Math.sin(ph * 0.5) * 0.05;
        this._p.set(ped.x, ped.y + bob, ped.z);
        if (ped.splat > 0) {
          // Flat out. The body pivots about the feet, so as it goes past horizontal the
          // torso has to be walked forward by half a body length or it lies buried in
          // the pavement it was standing on.
          const fall = clamp(ped.tumble ?? 1, 0, 1.6);
          const pitch = (Math.PI / 2) * fall;
          const tip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
          const spin = new THREE.Quaternion().setFromAxisAngle(this._up, (ped.heading || 0) + (ped.twist || 0));
          this._q.copy(spin).multiply(tip);
          const lay = Math.sin(Math.min(pitch, Math.PI / 2));
          const h = ped.kid ? 0.62 : 0.85;
          this._p.set(
            ped.x - Math.sin(ped.heading || 0) * h * lay,
            ped.y + 0.16 * lay,
            ped.z - Math.cos(ped.heading || 0) * h * lay,
          );
        } else {
          const spin = new THREE.Quaternion().setFromAxisAngle(this._up, ped.heading || 0);
          const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway);
          this._q.copy(spin).multiply(roll);
        }
        this._m.compose(this._p, this._q, ped.kid ? this._sKid : this._s);
        mesh.setMatrixAt(ped.slot, this._m);
        // the authored people carry their own textures; only tint the stand-ins
        const want = ped.choc > 0 ? '#4a2c14' : (ped.shirt || '#c8452f');
        if (mesh.instanceColor !== undefined && !this.variants && ped.colourSet !== want) {
          this._c.set(want);
          mesh.setColorAt(ped.slot, this._c);
          ped.colourSet = want;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
      for (const frames of meshes) for (const m of frames) m.instanceMatrix.needsUpdate = true;
    };
    write(this.meshes, this.people);
    write(this.kidMeshes, this.kids);
    if (this.partyMeshes.length) write(this.partyMeshes, this.party);

    // named characters get the same pose written onto their own object
    for (const sp of this.specials) {
      if (!sp.object || sp.y === undefined) continue;
      if (sp.splat > 0) {
        const fall = clamp(sp.tumble ?? 1, 0, 1.6);
        const pitch = (Math.PI / 2) * fall;
        const tip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
        const spin = new THREE.Quaternion().setFromAxisAngle(this._up, (sp.heading || 0) + (sp.twist || 0));
        sp.object.quaternion.copy(spin).multiply(tip);
        const lay = Math.sin(Math.min(pitch, Math.PI / 2));
        sp.object.position.set(
          sp.x - Math.sin(sp.heading || 0) * sp.fallLength * lay,
          sp.y + 0.16 * lay,
          sp.z - Math.cos(sp.heading || 0) * sp.fallLength * lay,
        );
      } else {
        sp.object.position.set(sp.x, sp.y, sp.z);
        sp.object.quaternion.setFromAxisAngle(this._up, sp.heading || 0);
      }
    }
  }

  // a bar landed: find whoever wears it
  hitTest(x, y, z, radius = 1.5) {
    for (const list of [this.people, this.kids, this.party, this.specials]) {
      for (const ped of list) {
        if (!ped.active || ped.splat > 0 || ped.y === undefined || ped.immortal) continue;
        if (Math.abs(y - ped.y) > 2.4) continue;
        if (Math.hypot(x - ped.x, z - ped.z) < Math.max(radius, ped.hitRadius || 0)) return ped;
      }
    }
    return null;
  }

  // whoever the bike is about to run into, if anyone
  bumpTest(x, y, z, radius = 1.2) {
    for (const list of [this.people, this.kids, this.party, this.specials]) {
      for (const ped of list) {
        if (!ped.active || ped.splat > 0 || ped.y === undefined || ped.immortal) continue;
        if (y - ped.y > 2.0 || ped.y - y > 1.4) continue;
        if (Math.hypot(x - ped.x, z - ped.z) < Math.max(radius, ped.hitRadius || 0)) return ped;
      }
    }
    return null;
  }

  // drop a chocolate pool where somebody landed
  dropDecal(x, y, z, scale = 1, follow = null) {
    if (!this.decals.length) return;
    const d = this.decals[this.decalCursor % this.decals.length];
    this.decalCursor++;
    d.mesh.position.set(x, y + 0.05, z);
    d.mesh.rotation.z = rand(0, Math.PI * 2);
    d.mesh.scale.setScalar(scale);
    d.mesh.material.opacity = 1;
    d.mesh.visible = true;
    d.follow = follow;
    // Bodies stay where they fall, so the chocolate on them and the pool beside them
    // stay too — a fade-out would tidy the evidence away.
    d.t = Infinity;
  }

  // ---- a Nanaimo bar to the back of the head ----
  // Not a sit-down any more: the bar puts them flat, face first, wearing the whole
  // bar. Chocolate goes everywhere — on them, on the pavement, and in the air.
  splat(ped, dirX = 0, dirZ = 0) {
    ped.splat = 1;                 // no longer a countdown: down is down
    ped.choc = 1;
    ped.dead = true;
    ped.grounded = false;
    ped.tumble = 0;
    ped.twist = rand(-0.4, 0.4);
    const dl = Math.hypot(dirX, dirZ);
    const fx = dl > 0.01 ? dirX / dl : -Math.sin(ped.heading || 0);
    const fz = dl > 0.01 ? dirZ / dl : -Math.cos(ped.heading || 0);
    ped.vx = fx * 3.4; ped.vz = fz * 3.4; ped.vy = 2.6;
    if (this.effects) {
      // chocolate, custard and coconut base, thrown wide
      for (let i = 0; i < 34; i++) {
        const choc = i % 3 !== 0;
        this.effects.smoke.emit(
          ped.x, ped.y + 1.35, ped.z,
          rand(-5, 5), rand(1.5, 7), rand(-5, 5),
          rand(0.5, 1.3), rand(0.3, 0.85),
          choc ? 0.26 : 0.92, choc ? 0.14 : 0.80, choc ? 0.07 : 0.30, 11, 0.955,
        );
      }
    }
    // one pool on the pavement, one worn by the victim until they get up
    this.dropDecal(ped.x + fx * 1.4, ped.y, ped.z + fz * 1.4, rand(0.9, 1.35));
    this.dropDecal(ped.x, ped.y, ped.z, rand(0.7, 0.95), ped);
    if (this.audio && this.voiceCool <= 0) {
      this.voiceCool = 1.6;
      this.audio.voice(`ped${1 + Math.floor(Math.random() * 6)}`, 0.9, 0.55, 1);
    }
    if (ped.onDeath) ped.onDeath(ped);
    this.onSplat(ped);
  }

  // ---- run down by the bike ----
  // Momentum transfer, not teleportation: the launch velocity comes from the bike's
  // own speed and heading, so a 20 km/h nudge trips them over and a 100 km/h hit puts
  // them over the handlebars. Returns the speed the rider should lose.
  bump(ped, player) {
    const speed = Math.abs(player.v);
    ped.splat = 1;
    ped.dead = true;
    ped.grounded = false;
    ped.tumble = 0;
    ped.twist = rand(-1.1, 1.1);
    const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);
    // a glancing hit throws them sideways; a square one sends them straight up the road
    const lat = (ped.x - player.pos.x) * Math.cos(player.heading) + (ped.z - player.pos.z) * -Math.sin(player.heading);
    const sx = Math.cos(player.heading), sz = -Math.sin(player.heading);
    const push = clamp(speed * 0.55, 2.5, 16);
    const spill = clamp(lat, -1, 1) * push * 0.45;
    ped.vx = fx * push + sx * spill;
    ped.vz = fz * push + sz * spill;
    ped.vy = 1.6 + Math.min(5.5, speed * 0.16);
    ped.heading = Math.atan2(fx, fz);
    if (this.effects) {
      this.effects.dust(ped.x, ped.y + 0.2, ped.z, 6);
      this.effects.sparks(ped.x, ped.y + 0.8, ped.z, 4);
    }
    if (this.audio) {
      this.audio.splat && this.audio.splat();
      if (this.voiceCool <= 0) {
        this.voiceCool = 1.4;
        this.audio.voice(`ped${1 + Math.floor(Math.random() * 6)}`, 0.95, 0.55, 1);
      }
    }
    if (ped.onDeath) ped.onDeath(ped);
    this.onBump(ped, speed);
    // the bike loses more to a stationary body the faster it was going
    return clamp(speed * 0.18, 0.8, 6);
  }

  // ---- everybody follows him down ----
  // Their shepherd came back wrong, and it does not stop at the churchyard: the whole
  // town goes over with him. Same kit geometry, recoloured off the same part names,
  // red where the cloth was — faces, hair and eyes left alone, because a crowd of
  // solid red silhouettes reads as a rendering fault rather than a costume. Built on
  // the first call rather than at boot (most runs never need it) and swapped straight
  // onto the instanced meshes, so the ones already lying in the road turn too.
  redFor(blood) {
    const b = new THREE.Color(blood);
    return (name, col) => (
      /skin|eye|brow|hair/i.test(name) ? null : col.clone().lerp(b, 0.9)
    );
  }

  swapCrowd(meshes, geoSets) {
    geoSets.forEach((frames, vi) => {
      frames.forEach((geo, k) => { if (meshes[vi] && meshes[vi][k]) meshes[vi][k].geometry = geo; });
    });
  }

  damnEveryone() {
    if (this.damned) return;
    this.damned = true;
    // the street: walkers and the schoolkids share these meshes
    if (this.crowdSrc.length) {
      if (!this.crowdRedGeos) {
        const reds = this.redFor(0xb01018);
        this.crowdRedGeos = this.crowdSrc.map(v => v.geos.map(geo => recolorFlattened(geo, v.parts, reds)));
      }
      this.swapCrowd(this.meshes, this.crowdRedGeos);
    }
    // the lawn: a deeper red, because they started in white and would otherwise come
    // out pinker than the street
    if (this.partySrc.length) {
      if (!this.partyRedGeos) {
        const reds = this.redFor(0x9b1220);
        this.partyRedGeos = this.partySrc.map(v => v.geos.map(geo => recolorFlattened(geo, v.parts, reds)));
      }
      this.swapCrowd(this.partyMeshes, this.partyRedGeos);
    }
    // the procedural stand-ins carry no kit, so they are tinted per instance instead
    if (!this.variants) {
      if (!this.standInRedGeo) {
        this.standInRedGeo = personGeometry(1, { legs: [0.55, 0.07, 0.1], skin: [0.86, 0.7, 0.58] });
      }
      for (const frames of [...this.meshes, ...this.partyMeshes]) {
        for (const m of frames) m.geometry = this.standInRedGeo;
      }
      for (const list of [this.people, this.kids, this.party]) {
        for (const p of list) { p.shirt = '#a41220'; p.colourSet = null; }
      }
    }
  }

  redeemEveryone() {
    if (!this.damned) return;
    this.damned = false;
    if (this.crowdNormalGeos.length) this.swapCrowd(this.meshes, this.crowdNormalGeos);
    if (this.partyWhiteGeos.length) this.swapCrowd(this.partyMeshes, this.partyWhiteGeos);
    if (!this.variants) {
      if (this.standInGeo) {
        for (const frames of this.meshes) for (const m of frames) m.geometry = this.standInGeo;
      }
      if (this.partyWhiteGeo) {
        for (const frames of this.partyMeshes) for (const m of frames) m.geometry = this.partyWhiteGeo;
      }
      for (const ped of [...this.people, ...this.kids]) { ped.shirt = choice(this.shirts); ped.colourSet = null; }
      for (const p of this.party) { p.shirt = '#ffffff'; p.colourSet = null; }
    }
  }

  reset() {
    for (const ped of this.people) {
      ped.active = false; ped.dead = false; ped.splat = 0; ped.choc = 0;
      ped.tumble = 0; ped.grounded = false; ped.vy = undefined;
    }
    for (const kid of this.kids) {
      kid.splat = 0; kid.choc = 0; kid.dead = false; kid.tumble = 0;
      kid.grounded = false; kid.wait = rand(0, 2); kid.vy = undefined;
    }
    for (const p of this.party) {
      p.splat = 0; p.choc = 0; p.dead = false; p.tumble = 0;
      p.grounded = false; p.vy = undefined;
    }
    for (const sp of this.specials) {
      sp.splat = 0; sp.choc = 0; sp.dead = false; sp.tumble = 0;
      sp.grounded = false; sp.vy = undefined; sp.twist = 0;
      sp.risen = false; sp.immortal = false; sp.riseT = 0;
      sp.riseDelay = sp.riseDelaySpec || 0;
      if (sp.home) { sp.x = sp.home.x; sp.z = sp.home.z; sp.heading = sp.home.heading; }
      sp.y = undefined;
      if (sp.onRevive) sp.onRevive(sp);
    }
    this.redeemEveryone();
    if (this.partySpot) this.seedParty();
    for (const d of this.decals) { d.mesh.visible = false; d.t = 0; d.follow = null; }
  }
}
