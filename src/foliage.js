// GLM 5.3 draft, reviewed/corrected for triangle indexing, normals and opaque cores.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function hedgeGeometry() {
  // deterministic PRNG
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rr = (a, b) => a + rnd() * (b - a);

  const geos = [];
  const V3 = THREE.Vector3;
  const C = THREE.Color;

  function leaf(x, y, z, size, rotX, rotY, rotZ, shade) {
    const g = new THREE.BufferGeometry();
    const h = size * 0.5;
    const corners = [[0,h,0],[h*0.8,0,0],[0,-h,0],[-h*0.8,0,0]];
    const rotation = new THREE.Euler(rotX,rotY,rotZ);
    const points = corners.map(p => new V3(...p).applyEuler(rotation).add(new V3(x,y,z)));
    const verts = [0,1,2,0,2,3].flatMap(i => points[i].toArray());
    const col = new C().setHSL(0.28 + shade * 0.05, 0.55, 0.22 + shade * 0.3);
    const cols = [];
    for (let i = 0; i < 6; i++) cols.push(col.r, col.g, col.b);
    const uvs = [0.5, 1, 1, 0.5, 0.5, 0, 0.5, 1, 0.5, 0, 0, 0.5];

    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }

  function twig(x0, y0, z0, dir, len) {
    const g = new THREE.BufferGeometry();
    const x1 = x0 + dir.x * len, y1 = y0 + dir.y * len, z1 = z0 + dir.z * len;
    const px = 0.012;
    const verts = [
      x0 - px, y0, z0 - px, x0 + px, y0, z0 - px, x1, y1, z1,
      x0 + px, y0, z0 - px, x0 + px, y0, z0 + px, x1, y1, z1
    ];
    const br = new C().setHSL(0.08, 0.4, 0.18);
    const cols = [];
    const nrm = [];
    const uvs = [];
    for (let i = 0; i < 6; i++) {
      cols.push(br.r, br.g, br.b);
      nrm.push(dir.x, dir.y, dir.z);
      uvs.push(0, 0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }

  // cluster centers: irregular blob distribution inside radius ~1
  const centers = [];
  const NC = 12;
  for (let i = 0; i < NC; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(rr(-1, 1));
    const r = rr(0.25, 0.95);
    centers.push(new V3(
      r * Math.sin(ph) * Math.cos(th) * 1.1,
      r * Math.cos(ph) * 0.8,
      r * Math.sin(ph) * Math.sin(th) * 1.1
    ));
  }

  // A dark, irregular leaf mass prevents see-through bald centres at distance.
  for (const c of centers) {
    const core = new THREE.IcosahedronGeometry(0.32,0);
    core.scale(1,0.75,1); core.translate(c.x,c.y,c.z);
    const colors = [];
    const shade = new C().setHSL(0.29,0.36,0.21);
    for(let k=0;k<core.attributes.position.count;k++)colors.push(shade.r,shade.g,shade.b);
    core.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geos.push(core);
  }
  let count = NC * 20;
  const MAXTRI = 580;
  // twigs first (2 tris each)
  for (let i = 0; i < centers.length && count + 2 <= MAXTRI; i++) {
    const c = centers[i];
    const d = new V3(c.x * 0.8, c.y * 0.8 + 0.2, c.z * 0.8).normalize();
    geos.push(twig(c.x * 0.4, c.y * 0.4, c.z * 0.4, d, c.length()));
    count += 2;
  }
  // leaves on cluster shells
  outer:
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const nLeaf = 10;
    for (let j = 0; j < nLeaf; j++) {
      if (count + 2 > MAXTRI) break outer;
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(rr(-1, 1));
      const rad = rr(0.08, 0.22);
      const lx = c.x + rad * Math.sin(ph) * Math.cos(th);
      const ly = c.y + rad * Math.cos(ph) * 0.8;
      const lz = c.z + rad * Math.sin(ph) * Math.sin(th);
      const dist = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (dist > 1.0) continue; // keep silhouette near radius 1
      // shade: darker inside, lighter top/outside
      const shade = Math.min(1, Math.max(0, (dist - 0.3) * 0.7 + (ly + 1) * 0.15));
      geos.push(leaf(
        lx, ly, lz,
        rr(0.23, 0.38),
        rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI,
        shade * rr(0.7, 1)
      ));
      count += 2;
    }
  }

  const merged = mergeGeometries(geos, false);
  merged.computeVertexNormals();
  geos.forEach(g=>g.dispose());
  return merged;
}
