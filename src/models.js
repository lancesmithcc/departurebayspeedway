// models.js — load the authored GLB assets (rider-on-bike, western redcedar) and
// prepare them for the game: fitted to real-world size, base on the ground, and
// decimated when they need to be instanced thousands of times.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();

export function loadGLB(url) {
  return new Promise((resolve) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, (err) => {
      console.warn('model failed to load:', url, err && err.message);
      resolve(null);   // the game keeps its procedural stand-in
    });
  });
}

// same, but keeps the animation clips so a pose can be sampled off them
export function loadGLBFull(url) {
  return new Promise((resolve) => {
    loader.load(url, (gltf) => resolve(gltf), undefined, (err) => {
      console.warn('model failed to load:', url, err && err.message);
      resolve(null);
    });
  });
}

// Instancing cannot skin, so freeze the rig on one frame of an animation and bake the
// skinned vertices into static geometry. A walk clip sampled mid-stride gives a crowd
// that stands like people rather than mannequins.
export function bakeClipPose(gltf, { match = /walk|idle/i, time = 0.3 } = {}) {
  if (!gltf || !gltf.scene) return null;
  const scene = gltf.scene;
  const clips = gltf.animations || [];
  const clip = clips.find(c => match.test(c.name)) || clips[0];
  if (clip) {
    const mixer = new THREE.AnimationMixer(scene);
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(Math.min(time, Math.max(0.001, clip.duration - 0.001)));
  }
  scene.updateMatrixWorld(true);

  const out = new THREE.Group();
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry;
    const pos = geo.getAttribute('position');
    const baked = new THREE.BufferGeometry();
    const arr = new Float32Array(pos.count * 3);
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // applyBoneTransform lands in the mesh's own space; the node transform still
        // has to go on or every limb stays in its own tiny local frame
        o.applyBoneTransform(i, v).applyMatrix4(o.matrixWorld);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
    }
    baked.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    for (const key of ['uv', 'color']) {
      const a = geo.getAttribute(key);
      if (a) baked.setAttribute(key, a.clone());
    }
    if (geo.index) baked.setIndex(geo.index.clone());
    baked.computeVertexNormals();
    const mesh = new THREE.Mesh(baked, Array.isArray(o.material) ? o.material[0] : o.material);
    out.add(mesh);
  });
  return out.children.length ? out : null;
}

// Scale an authored model to a real height in metres and sit it on y = 0,
// centred on x/z. Returns { object, size } with size in metres after fitting.
export function fitModel(object, target, axis = 'y') {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  // some assets are authored in a dynamic pose, so the tallest axis is not the one to
  // measure — a bike is sized by its wheelbase, not by how far the rider leans
  const s = target / Math.max(1e-3, size[axis]);
  object.scale.setScalar(s);
  const fitted = new THREE.Box3().setFromObject(object);
  const c = new THREE.Vector3();
  fitted.getCenter(c);
  object.position.x -= c.x;
  object.position.z -= c.z;
  object.position.y -= fitted.min.y;
  const out = new THREE.Vector3();
  fitted.getSize(out).multiplyScalar(1);
  return { object, size: out };
}

// Flatten a loaded scene graph into one geometry (world space of the object) plus the
// first material found — what InstancedMesh needs.
export function flatten(object) {
  object.updateWorldMatrix(true, true);
  const geos = [];
  // Which stretch of the merged vertex buffer came from which material. The kits name
  // their parts (Shirt, Skin, Hair, Shoes), and keeping the ranges means a variant can
  // be retinted later — the church congregation is the street crowd in Sunday whites —
  // without paying to load and pose the whole kit a second time.
  const parts = [];
  let map = null, roughness = 0.8, metalness = 0.05, sawMaterial = false;
  const c = new THREE.Color();
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();

    // These kits paint parts with per-primitive materials — body, glass, tyres. Merging
    // keeps one material, so bake each part's colour down into vertex colours first,
    // otherwise every car and person comes out a white blank.
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    if (src) {
      if (!sawMaterial) {
        sawMaterial = true;
        map = src.map || null;
        roughness = src.roughness ?? 0.8;
        metalness = src.metalness ?? 0.05;
      }
      const n = g.getAttribute('position').count;
      const existing = g.getAttribute('color');
      const col = new Float32Array(n * 3);
      c.copy(src.color || new THREE.Color(0xffffff));
      for (let i = 0; i < n; i++) {
        const r = existing ? existing.getX(i) : 1;
        const gg = existing ? existing.getY(i) : 1;
        const bb = existing ? existing.getZ(i) : 1;
        col[i * 3] = c.r * r; col[i * 3 + 1] = c.g * gg; col[i * 3 + 2] = c.b * bb;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push({ name: src.name || '', count: n, color: [c.r, c.g, c.b] });
    } else {
      parts.push({ name: '', count: g.getAttribute('position').count, color: [1, 1, 1] });
    }
    g.clearGroups();
    geos.push(g);
  });
  if (!geos.length) return null;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map, roughness, metalness,
  });
  return { geometry: geos.length === 1 ? geos[0] : mergeGeometries(geos, false), material, parts };
}

// Retint a flattened kit geometry by material name. `fn(name, colour)` returns the
// replacement colour, or null to leave that part alone — so faces, hair and shoes can
// stay put while the clothes go white.
export function recolorFlattened(geometry, parts, fn) {
  const src = geometry.getAttribute('color');
  const g = geometry.clone();
  if (!src || !parts || !parts.length) return g;
  const arr = new Float32Array(src.array);
  const c = new THREE.Color();
  let at = 0;
  for (const p of parts) {
    c.setRGB(p.color[0], p.color[1], p.color[2]);
    const out = fn(p.name, c);
    if (out) {
      for (let i = at; i < at + p.count && i * 3 + 2 < arr.length; i++) {
        arr[i * 3] = out.r; arr[i * 3 + 1] = out.g; arr[i * 3 + 2] = out.b;
      }
    }
    at += p.count;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Vertex-cluster decimation: quantise positions onto a grid, weld, and drop the
// triangles that collapse. Crude, but a 21k-triangle cedar has to come down a lot
// before a few hundred of them can stand along the road.
export function decimate(geometry, cell) {
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const colour = geometry.getAttribute('color');   // the kits paint with vertex colours
  const n = pos.count;
  const key = new Map();
  const outPos = [], outUv = [], outCol = [];
  const remap = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
    let idx = key.get(k);
    if (idx === undefined) {
      idx = outPos.length / 3;
      key.set(k, idx);
      outPos.push(x, y, z);
      outUv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (colour) outCol.push(colour.getX(i), colour.getY(i), colour.getZ(i));
    }
    remap[i] = idx;
  }
  const idxOut = [];
  for (let t = 0; t < n; t += 3) {
    const a = remap[t], b = remap[t + 1], c = remap[t + 2];
    if (a === b || b === c || a === c) continue;   // collapsed to a sliver
    idxOut.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  if (colour) g.setAttribute('color', new THREE.Float32BufferAttribute(outCol, 3));
  g.setIndex(idxOut);
  g.computeVertexNormals();
  return g;
}

// Some assets are authored mid-stunt: the bike is tilted, the rider is thrown over,
// and the bounding box tells you nothing about which way is up or forward. Take the
// principal axes of the vertex cloud instead — for a bike the longest axis is the
// wheelbase — and rotate that onto the game's forward (-z) with y up.
export function levelModel(object) {
  object.updateWorldMatrix(true, true);
  const pts = [];
  const v = new THREE.Vector3();
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pos = o.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(v.x, v.y, v.z);
    }
  });
  const n = pts.length / 3;
  if (n < 32) return null;

  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pts[i * 3]; cy += pts[i * 3 + 1]; cz += pts[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;

  // covariance
  const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3] - cx, y = pts[i * 3 + 1] - cy, z = pts[i * 3 + 2] - cz;
    c[0] += x * x; c[1] += x * y; c[2] += x * z;
    c[4] += y * y; c[5] += y * z; c[8] += z * z;
  }
  c[3] = c[1]; c[6] = c[2]; c[7] = c[5];
  const mul = (m, a) => new THREE.Vector3(
    m[0] * a.x + m[1] * a.y + m[2] * a.z,
    m[3] * a.x + m[4] * a.y + m[5] * a.z,
    m[6] * a.x + m[7] * a.y + m[8] * a.z,
  );
  const power = (m, seed) => {
    let a = seed.clone().normalize();
    for (let k = 0; k < 48; k++) a = mul(m, a).normalize();
    return a;
  };
  const a1 = power(c, new THREE.Vector3(1, 0.3, 0.2));       // longest: the wheelbase
  // deflate and take the second axis
  const d = c.slice();
  const l1 = mul(c, a1).dot(a1);
  const comps = [a1.x, a1.y, a1.z];
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) d[r * 3 + q] -= l1 * comps[r] * comps[q];
  const a2 = power(d, new THREE.Vector3(0.2, 1, 0.3));       // next: roughly the height
  const a3 = new THREE.Vector3().crossVectors(a1, a2).normalize();
  a2.crossVectors(a3, a1).normalize();

  // Keep the axis that points most "up" in the authored frame as up.
  let fwd = a1.clone(), up = a2.clone();
  if (Math.abs(up.y) < Math.abs(fwd.y)) { const t = fwd; fwd = up; up = t; }
  if (up.y < 0) up.negate();
  fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize();   // forward ⟂ up
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();

  // rotate the authored frame onto (right, up, forward=-z)
  const m = new THREE.Matrix4().makeBasis(right, up, fwd.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(m).invert();
  const holder = new THREE.Group();
  holder.quaternion.copy(q);
  holder.add(object);
  return holder;
}

// These characters arrive rigged and in a T-pose, and instancing cannot skin them.
// Pose the skeleton once (arms down, a slight stride) and bake the skinned result into
// static geometry, so the crowd stands like people instead of scarecrows.
export function bakeStandingPose(scene, opts = {}) {
  const bones = {};
  let skinned = null;
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh && !skinned) skinned = o;
  });
  if (!skinned) return scene;

  // The arm bones swing about their local z, and the kit is authored z-up, so the
  // stride runs about x once the model is stood up below.
  const set = (name, x, y, z) => { const b = bones[name]; if (b) b.rotation.set(x, y, z); };
  const stride = opts.stride ?? 0;
  set('arm-left', 0, 0, -1.3 + (opts.armSwing ?? 0));       // drop the arms to the sides
  set('arm-right', 0, 0, 1.3 - (opts.armSwing ?? 0));
  set('leg-left', stride, 0, 0);
  set('leg-right', -stride, 0, 0);
  if (opts.lean) set('torso', opts.lean, 0, 0);

  scene.updateMatrixWorld(true);
  if (skinned.skeleton) skinned.skeleton.update();

  const geo = skinned.geometry;
  const pos = geo.getAttribute('position');
  const baked = new THREE.BufferGeometry();
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    skinned.applyBoneTransform(i, v);
    arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
  }
  baked.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  for (const key of ['uv', 'color']) {
    const a = geo.getAttribute(key);
    if (a) baked.setAttribute(key, a.clone());
  }
  if (geo.index) baked.setIndex(geo.index.clone());
  baked.computeVertexNormals();

  const holder = new THREE.Group();
  const mesh = new THREE.Mesh(baked, skinned.material);
  // The kit is already y-up: the wide axis in the bind pose is the T-pose arm span,
  // not the body. Dropping the arms is all the standing up it needs.
  if (opts.zUp) mesh.rotation.x = -Math.PI / 2;
  holder.add(mesh);
  return holder;
}

// Load a set of GLBs and return draw-ready { geometry, material } pairs, each sized
// to a real-world height and standing on y = 0. Used for the CC0 kits (people, cars,
// trees, houses) that fill the world out.
export async function loadKit(urls, targetSize, axis = 'y', opts = {}) {
  const out = [];
  for (const url of urls) {
    let scene;
    let extraFrames = null;
    if (opts.poseClip) {
      const gltf = await loadGLBFull(url);
      if (gltf) {
        const frames = opts.poseClip.frames || 1;
        const clip = (gltf.animations || []).find(c => (opts.poseClip.match || /walk/i).test(c.name));
        const dur = clip ? clip.duration : 1;
        scene = bakeClipPose(gltf, { ...opts.poseClip, time: opts.poseClip.time ?? dur * 0.1 });
        if (frames > 1) {
          extraFrames = [];
          for (let f = 1; f < frames; f++) {
            // sample the same walk cycle at even phases so instances can be stepped
            // through them: a walking crowd without per-vertex skinning at runtime
            const g2 = await loadGLBFull(url);
            const posed = g2 ? bakeClipPose(g2, { ...opts.poseClip, time: (dur * f) / frames }) : null;
            if (posed) extraFrames.push(posed);
          }
        }
      } else scene = null;
    } else {
      scene = await loadGLB(url);
    }
    if (!scene) continue;
    let prepared = scene;
    if (opts.pose) prepared = bakeStandingPose(scene, typeof opts.pose === 'object' ? opts.pose : {});
    if (opts.lengthAlongZ) {
      // vehicles are modelled nose-down whichever axis the artist preferred; put the
      // long side on z, which is the axis the game drives along
      const b = new THREE.Box3().setFromObject(prepared);
      const sz = new THREE.Vector3();
      b.getSize(sz);
      if (sz.x > sz.z) prepared.rotation.y = Math.PI / 2;
      if (opts.flip) prepared.rotation.y += Math.PI;
    }
    fitModel(prepared, targetSize, axis);
    const flat = flatten(prepared);
    if (!flat) continue;
    const box = new THREE.Box3().setFromBufferAttribute(flat.geometry.getAttribute('position'));
    const size = new THREE.Vector3();
    box.getSize(size);
    const entry = { geometry: flat.geometry, material: flat.material, parts: flat.parts, size, url };
    if (extraFrames && extraFrames.length) {
      // every frame is fitted the same way so the figure doesn't grow and shrink
      entry.frames = [flat.geometry];
      for (const f of extraFrames) {
        fitModel(f, targetSize, axis);
        const ff = flatten(f);
        if (ff) entry.frames.push(ff.geometry);
      }
    }
    out.push(entry);
  }
  return out;
}

export function triangleCount(geometry) {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}
