// Realistic procedural plants for Yard Sketch.
// Foliage is built the way real-time engines do it: many small "leaf cards" (quads carrying a painted
// cluster of leaves with transparent edges) layered through the canopy, over a real branch structure.
// Card normals point out from the canopy, so the whole plant lights like a soft rounded mass.
// Textures are painted once on a canvas in grayscale and tinted by the plant's color.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = THREE.MathUtils.clamp;
const LEAF = 0x4c7a32, BARK = 0x6a5646, BIRCH_BARK = 0xf2efe8, STEM = 0x6f7f52;
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export const PLANT_KINDS = new Set(['shade', 'flower', 'jmaple', 'birch', 'palm', 'spruce', 'column', 'upright', 'juniper',
  'globe', 'hydrangea', 'bloom', 'fineline', 'grass', 'spikes', 'hosta']);

// ---------- textures (painted once, shared, never disposed) ----------
const cache = new Map();
let aniso = 4;
export function setPlantAnisotropy(n) { aniso = n; }
function paint(key, w, h, draw, wrap = false) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  let seed = 7; for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  draw(ctx, w, h, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.keep = true;
  cache.set(key, t);
  return t;
}
const g = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

// one leaf pointing along +x from the origin
function leafShape(ctx, len, wid, tip = 0.35) {
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * tip, -wid, len, 0);
  ctx.quadraticCurveTo(len * tip, wid, 0, 0);
  ctx.closePath();
}
// a round cluster of leaves on a few twigs
function leafCluster(ctx, S, r, { count, len, wid, spread = 0.42, twig = 0.006, shape = leafShape, tip = 0.35 }) {
  ctx.strokeStyle = g(80); ctx.lineWidth = Math.max(1, S * twig); ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = S * spread * (0.6 + r() * 0.4);
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.quadraticCurveTo(S / 2 + Math.cos(a + 0.4) * d * 0.5, S / 2 + Math.sin(a + 0.4) * d * 0.5, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d); ctx.stroke();
  }
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread * S;
    const l = len * S * (0.7 + r() * 0.6), v = 140 + r() * 115;
    ctx.save(); ctx.translate(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d); ctx.rotate(a + (r() - 0.5) * 1.6);
    ctx.fillStyle = g(v); shape(ctx, l, l * wid, tip); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';   // one half in shade gives each leaf a fold
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(l * tip, l * wid, l, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = g(v * 0.7, 0.8); ctx.lineWidth = Math.max(1, l * 0.035);
    ctx.beginPath(); ctx.moveTo(l * 0.05, 0); ctx.lineTo(l * 0.85, 0); ctx.stroke();
    ctx.restore();
  }
}
function mapleShape(ctx, len, wid) {
  ctx.beginPath();
  const lobes = 5;
  for (let k = 0; k <= lobes * 2; k++) {
    const a = -Math.PI / 2 - 0.9 + (k / (lobes * 2)) * 1.8 * Math.PI / 1.2, rr = k % 2 ? len * 0.42 : len;
    const x = Math.cos(a + Math.PI / 2) * rr * 0.5 + len * 0.5, y = Math.sin(a + Math.PI / 2) * rr * 0.55;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
const TEX = {
  broad: () => paint('broad', 256, 256, (c, S, _, r) => leafCluster(c, S, r, { count: 95, len: 0.17, wid: 0.42, spread: 0.4 })),
  small: () => paint('small', 256, 256, (c, S, _, r) => leafCluster(c, S, r, { count: 420, len: 0.07, wid: 0.5, spread: 0.44, twig: 0.004 })),
  birch: () => paint('birch', 256, 256, (c, S, _, r) => leafCluster(c, S, r, { count: 150, len: 0.11, wid: 0.55, tip: 0.25, spread: 0.4 })),
  fern: () => paint('fern', 256, 256, (c, S, _, r) => leafCluster(c, S, r, { count: 200, len: 0.13, wid: 0.3, spread: 0.4 })),
  maple: () => paint('maple', 256, 256, (c, S, _, r) => leafCluster(c, S, r, { count: 75, len: 0.15, wid: 1, shape: mapleShape, spread: 0.4 })),
  // spruce branch: a stem along u with side shoots, all bristling with needles; tapers to the tip
  needle: () => paint('needle', 512, 256, (c, W, H, r) => {
    c.lineCap = 'round';
    const stem = (x0, y0, x1, y1, n, nl, w) => {
      c.strokeStyle = g(90); c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      for (let i = 0; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, side = i % 2 ? 1 : -1, l = nl * (1 - 0.5 * t) * (0.7 + r() * 0.5);
        const a = Math.atan2(y1 - y0, x1 - x0) + side * (0.7 + r() * 0.4);
        c.strokeStyle = g(150 + r() * 100); c.lineWidth = 4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      }
    };
    stem(4, H / 2, W - 6, H / 2 + 8, 320, H * 0.16, 6);
    for (let i = 0; i < 14; i++) {
      const t = 0.05 + i * 0.065, x = 4 + (W - 10) * t, side = i % 2 ? 1 : -1, l = (W * 0.34) * (1 - t * 0.75);
      stem(x, H / 2, x + l * 0.8, H / 2 + side * l * 0.6, 120, H * 0.11, 4);
    }
  }),
  // arborvitae: flat fan-shaped sprays of scale leaves
  scale: () => paint('scale', 256, 256, (c, S, _, r) => {
    c.lineCap = 'round';
    const spray = (x, y, a, len, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      c.strokeStyle = g(130 + r() * 110); c.lineWidth = Math.max(4, 14 - depth * 2.5);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      if (depth < 4) for (const s of [-1, 1]) spray(x + (x2 - x) * 0.5, y + (y2 - y) * 0.5, a + s * (0.5 + r() * 0.3), len * 0.62, depth + 1);
      if (depth < 4) spray(x2, y2, a + (r() - 0.5) * 0.3, len * 0.7, depth + 1);
    };
    for (let i = 0; i < 6; i++) spray(S / 2, S * 0.92, -Math.PI / 2 + (i - 2.5) * 0.32, S * 0.3, 0);
  }),
  // palm frond: rib along v (tip at the top), leaflets angled toward the tip
  palm: () => paint('palm', 128, 512, (c, W, H, r) => {
    c.lineCap = 'round';
    c.strokeStyle = g(150); c.lineWidth = 4; c.beginPath(); c.moveTo(W / 2, H); c.lineTo(W / 2, 4); c.stroke();
    for (let y = H - 30; y > 10; y -= 9) {
      const t = 1 - y / H, l = W * 0.48 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.1)) + 4;
      for (const s of [-1, 1]) {
        c.strokeStyle = g(150 + r() * 100); c.lineWidth = 5;
        c.beginPath(); c.moveTo(W / 2, y); c.lineTo(W / 2 + s * l, y - l * 0.7); c.stroke();
      }
    }
  }),
  // hydrangea: a round head of four-petal florets
  mophead: () => paint('mophead', 256, 256, (c, S, _, r) => {
    for (let i = 0; i < 220; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.4, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, p = S * (0.022 + r() * 0.012);
      c.fillStyle = g(180 + r() * 75);
      for (let k = 0; k < 4; k++) { const b = k * Math.PI / 2 + r(); c.beginPath(); c.ellipse(x + Math.cos(b) * p, y + Math.sin(b) * p, p, p * 0.75, b, 0, 7); c.fill(); }
      c.fillStyle = g(120); c.beginPath(); c.arc(x, y, p * 0.3, 0, 7); c.fill();
    }
  }),
  // scattered five-petal blossoms
  blossom: () => paint('blossom', 256, 256, (c, S, _, r) => {
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.42, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, p = S * (0.026 + r() * 0.016);
      c.fillStyle = g(195 + r() * 60);
      for (let k = 0; k < 5; k++) { const b = (k / 5) * Math.PI * 2 + a; c.beginPath(); c.ellipse(x + Math.cos(b) * p, y + Math.sin(b) * p, p, p * 0.7, b, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(70,60,20,1)'; c.beginPath(); c.arc(x, y, p * 0.35, 0, 7); c.fill();
    }
  }),
  // grass plume (tip at the top)
  plume: () => paint('plume', 64, 256, (c, W, H, r) => {
    c.lineCap = 'round';
    c.strokeStyle = g(170); c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2, H); c.lineTo(W / 2, 6); c.stroke();
    for (let i = 0; i < 160; i++) {
      const y = 10 + r() * (H * 0.75), t = y / H, l = W * 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.25));
      const s = r() < 0.5 ? -1 : 1;
      c.strokeStyle = g(185 + r() * 70, 0.9); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(W / 2, y); c.lineTo(W / 2 + s * l * r(), y - 6 - r() * 10); c.stroke();
    }
  }),
  // flower spike: florets stacked up a stem, tapering (tip at the top)
  spike: () => paint('spike', 64, 256, (c, W, H, r) => {
    for (let i = 0; i < 70; i++) {
      const t = r(), y = 8 + t * (H - 16), wv = (W * 0.38) * (0.35 + 0.65 * (y / H));
      c.fillStyle = g(170 + r() * 85);
      c.beginPath(); c.ellipse(W / 2 + (r() - 0.5) * wv, y, W * 0.09, W * 0.07, r() * 3, 0, 7); c.fill();
    }
  }),
  // a single hosta leaf: heart-shaped, ribbed, lighter edge (base at the bottom)
  hosta: () => paint('hosta', 128, 256, (c, W, H) => {
    const leaf = () => { c.beginPath(); c.moveTo(W / 2, H - 4); c.bezierCurveTo(-W * 0.15, H * 0.62, W * 0.05, H * 0.12, W / 2, 4); c.bezierCurveTo(W * 0.95, H * 0.12, W * 1.15, H * 0.62, W / 2, H - 4); c.closePath(); };
    leaf(); c.fillStyle = g(250); c.fill();
    c.save(); leaf(); c.clip();
    c.fillStyle = g(175); c.beginPath(); c.ellipse(W / 2, H * 0.5, W * 0.33, H * 0.44, 0, 0, 7); c.fill();
    c.strokeStyle = g(135); c.lineWidth = 2;
    for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(W / 2, H - 6); c.quadraticCurveTo(W / 2 + k * W * 0.16, H * 0.5, W / 2 + k * W * 0.04, 10); c.stroke(); }
    c.restore();
  }),
  bark: () => paint('bark', 128, 256, (c, W, H, r) => {
    c.fillStyle = g(150); c.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      let x = r() * W; c.strokeStyle = g(70 + r() * 50, 0.9); c.lineWidth = 2 + r() * 4;
      c.beginPath(); c.moveTo(x, 0);
      for (let y = 0; y <= H; y += 16) { x += (r() - 0.5) * 6; c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < 300; i++) { c.fillStyle = g(120 + r() * 100, 0.4); c.fillRect(r() * W, r() * H, 2, 3 + r() * 6); }
  }, true),
  birchBark: () => paint('birchBark', 128, 256, (c, W, H, r) => {
    c.fillStyle = g(240); c.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { c.fillStyle = g(40 + r() * 40, 0.85); const y = r() * H; c.fillRect(r() * W, y, 6 + r() * 26, 1.5 + r() * 2.5); }
    for (let i = 0; i < 8; i++) { c.fillStyle = g(30, 0.9); c.beginPath(); c.ellipse(r() * W, r() * H, 4 + r() * 8, 3 + r() * 6, 0, 0, 7); c.fill(); }
  }, true),
};

// ---------- geometry helpers ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
function randUnit(r, out) { const th = r() * Math.PI * 2, z = r() * 2 - 1, s = Math.sqrt(1 - z * z); return out.set(s * Math.cos(th), z, s * Math.sin(th)); }

// Collects two-sided quads. Normals are supplied (soft canopy lighting); colors darken the inside and underside.
class Cards {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; }
  // quad with corners c0..c3 (in order around), normal n, brightness k, uv corners (rotate by rot quarter-turns)
  quad(c0, c1, c2, c3, n, k, r, rot = 0, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const cs = [c0, c1, c2, c3], uv = uvs.map((_, i) => uvs[(i + rot) % 4]);
    const col = [k * (0.95 + r() * 0.1), k * (0.95 + r() * 0.1), k * (0.93 + r() * 0.1)];
    for (const [i, j, l] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) for (const m of [i, j, l]) {
      this.P.push(cs[m].x, cs[m].y, cs[m].z); this.N.push(n.x, n.y, n.z); this.U.push(uv[m][0], uv[m][1]); this.C.push(...col);
    }
  }
  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    return geo;
  }
  get count() { return this.P.length / 18; }
}

// Leaf cards scattered through ellipsoid clumps {x,y,z,rx,ry,rz,n}; center = the whole canopy's center
function canopyCards(r, clumps, { size, center, shell = 0.4, face = 0.55, vary = 0.4, dark = 0.5, up = 0 }) {
  const K = new Cards();
  for (const k of clumps) for (let i = 0; i < k.n; i++) {
    randUnit(r, _a); if (up) _a.y = clamp(_a.y + up * r(), -1, 1);
    _a.normalize();
    const rad = shell + (1 - shell) * Math.sqrt(r());
    const p = new THREE.Vector3(k.x + _a.x * k.rx * rad, k.y + _a.y * k.ry * rad, k.z + _a.z * k.rz * rad);
    _n.subVectors(p, center).normalize().multiplyScalar(0.6).addScaledVector(_a, 0.4).normalize();
    // mostly facing outward, tilted and spun at random
    _f.copy(_n).multiplyScalar(face).add(randUnit(r, _b).multiplyScalar(1 - face)).normalize();
    _u.crossVectors(_f, randUnit(r, _b)).normalize(); _v.crossVectors(_f, _u);
    const s = size * (1 - vary / 2 + r() * vary) / 2;
    const c = (su, sv) => p.clone().addScaledVector(_u, su * s).addScaledVector(_v, sv * s);
    const k2 = (1 - dark) + dark * rad * (0.7 + 0.3 * (_n.y + 1) / 2);
    K.quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1), _n, k2, r, Math.floor(r() * 4));
  }
  return K.geometry();
}

// a tapered branch from a to b with bark UVs in real-world scale
function limbGeo(a, b, r0, r1, segs = 8) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, Math.max(0.01, len), segs, Math.max(1, Math.round(len / 0.6)), true);
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  geo.translate(a.x, a.y, a.z);
  const uv = geo.attributes.uv, around = Math.max(1, Math.round((2 * Math.PI * r0) / 0.25));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * len / 0.6);
  return geo;
}
// a bent strip rising along +y and arcing toward +z (grass blades, palm fronds, hosta leaves); uv v runs base → tip
function stripGeo(width, length, bend, taper, segs = 6) {
  const geo = new THREE.PlaneGeometry(width, length, 1, segs);
  geo.translate(0, length / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / length;
    p.setX(i, p.getX(i) * (1 - taper * t));
    p.setZ(i, bend * t * t * length);
    p.setY(i, p.getY(i) * (1 - 0.35 * Math.abs(bend) * t * t));
  }
  geo.computeVertexNormals();
  return geo;
}
// a low-detail rounded core that stops dense shrubs and conifers looking hollow
function coreGeo(rx, ry, rz, cy, taper = 0) {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 1) / 2, k = 1 - taper * t * t;
    p.setXYZ(i, p.getX(i) * rx * k, p.getY(i) * ry + cy, p.getZ(i) * rz * k);
  }
  geo.computeVertexNormals();
  return geo;
}
function merge(geos) { const m = mergeGeometries(geos, false); for (const x of geos) x.dispose(); return m; }
// scale and move everything together so the plant fills exactly w × h × d, standing on the ground
function fitAll(geos, w, h, d) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  for (const geo of geos) { geo.computeBoundingBox(); box.union(b.copy(geo.boundingBox)); }
  const sx = w / Math.max(1e-6, box.max.x - box.min.x), sy = h / Math.max(1e-6, box.max.y - box.min.y), sz = d / Math.max(1e-6, box.max.z - box.min.z);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (const geo of geos) { geo.translate(-cx, -box.min.y, -cz); geo.scale(sx, sy, sz); geo.computeBoundingSphere(); }
}
const lobeN = (rx, ry, rz, size, density) => Math.round(clamp((4 * Math.PI * (rx * ry + ry * rz + rx * rz) / 3) / (size * size) * density, 6, 160));
// split a canopy ellipsoid into rounded lobes, so the outline is lumpy like a real crown
function lobes(r, c, rx, ry, rz, count, size, density, { spread = 0.5, lobe = 0.52, low = -0.35 } = {}) {
  const out = [{ x: c.x, y: c.y, z: c.z, rx: rx * 0.62, ry: ry * 0.62, rz: rz * 0.62 }];
  for (let i = 0; i < count; i++) {
    randUnit(r, _a); _a.y = clamp(_a.y, low, 1); _a.normalize();
    const k = lobe * (0.8 + r() * 0.35);
    out.push({ x: c.x + _a.x * rx * spread, y: c.y + _a.y * ry * spread, z: c.z + _a.z * rz * spread, rx: rx * k, ry: ry * k, rz: rz * k });
  }
  for (const l of out) l.n = lobeN(l.rx, l.ry, l.rz, size, density);
  return out;
}

// ---------- materials ----------
function leafMat(tex, color, side = THREE.FrontSide, vertexColors = true) {
  return new THREE.MeshStandardMaterial({ map: tex, color, vertexColors, alphaTest: 0.3, alphaToCoverage: true, roughness: 0.82, side });
}
const barkMat = (color = BARK, tex = TEX.bark()) => new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.95 });

// ---------- species ----------
export function buildPlant(kind, opts, w, d, h, color, seed = 1) {
  const r = rng(seed * 977 + 13);
  const group = new THREE.Group(), mats = [], parts = [];
  const part = (geo, mat) => { parts.push([geo, mat]); if (!mats.includes(mat)) mats.push(mat); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // a broadleaf tree: trunk, main limbs into each lobe, leaf cards around the lobes
  const broadleaf = ({ trunk = 0.4, crownLow = 0.3, tex, leafColor, extra, lobeCount = 8, density = 3, bark = BARK, barkTex, flat = 1 }) => {
    const R = clamp(h * 0.022, 0.035, 0.45), top = h * trunk;
    const ch = (h - h * crownLow) / 2 * flat, c = V(0, h - ch, 0), rx = w / 2, rz = d / 2;
    const size = clamp(Math.min(w, h) * 0.13, 0.25, 1.4);
    const L = lobes(r, c, rx, ch, rz, lobeCount, size, density);
    const limbs = [limbGeo(V(0, 0, 0), V((r() - 0.5) * R, top, (r() - 0.5) * R), R, R * 0.7)];
    for (const l of L.slice(1)) {
      const from = V(0, top * (0.8 + r() * 0.25), 0), to = V(l.x * 0.8, l.y - l.ry * 0.2, l.z * 0.8);
      limbs.push(limbGeo(from, to, R * 0.5, R * 0.12, 6));
      const mid = from.clone().lerp(to, 0.6);
      limbs.push(limbGeo(mid, V(to.x + (r() - 0.5) * l.rx, to.y + l.ry * 0.3, to.z + (r() - 0.5) * l.rz), R * 0.2, R * 0.05, 5));
    }
    part(merge(limbs), barkMat(bark, barkTex));
    part(canopyCards(r, L, { size, center: c }), leafMat(tex, leafColor));
    if (extra) extra(L, size, c);
  };

  switch (kind) {
    case 'shade':
      broadleaf({ tex: TEX.broad(), leafColor: color, lobeCount: 9 });
      break;
    case 'flower':
      broadleaf({ trunk: 0.3, crownLow: 0.25, tex: TEX.broad(), leafColor: LEAF, lobeCount: 8, density: 1.4,
        extra: (L, size, c) => part(canopyCards(r, L.map(l => ({ ...l, n: Math.round(l.n * 1.3) })), { size: size * 0.9, center: c, shell: 0.6 }), leafMat(TEX.blossom(), color)) });
      break;
    case 'jmaple': {
      // low multi-stem with layered, horizontal tiers of fine maple leaves
      const R = clamp(h * 0.025, 0.025, 0.14), size = clamp(Math.min(w, h) * 0.13, 0.2, 0.7), limbs = [], L = [];
      const tiers = [[0.42, 1, 0.16], [0.64, 0.82, 0.15], [0.84, 0.58, 0.13]];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + r();
        limbs.push(limbGeo(V(0, 0, 0), V(Math.cos(a) * w * 0.22, h * 0.6, Math.sin(a) * d * 0.22), R, R * 0.35, 6));
      }
      for (const [y, s, t] of tiers) {
        const cx = (r() - 0.5) * w * 0.1, cz = (r() - 0.5) * d * 0.1;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + r(), rr = 0.45 * s;
          L.push({ x: cx + Math.cos(a) * w / 2 * rr, y: h * y, z: cz + Math.sin(a) * d / 2 * rr, rx: w / 2 * s * 0.55, ry: h * t, rz: d / 2 * s * 0.55 });
          limbs.push(limbGeo(V(0, h * 0.3, 0), V(L[L.length - 1].x, h * y, L[L.length - 1].z), R * 0.4, R * 0.1, 5));
        }
      }
      for (const l of L) l.n = lobeN(l.rx, l.ry, l.rz, size, 2.8);
      part(merge(limbs), barkMat(0x4a3a30));
      part(canopyCards(r, L, { size, center: V(0, h * 0.62, 0), face: 0.75 }), leafMat(TEX.maple(), color));
      break;
    }
    case 'birch': {
      // three white stems, airy crowns of small leaves
      const R = clamp(h * 0.012, 0.025, 0.16), size = clamp(Math.min(w, h) * 0.1, 0.2, 0.8), limbs = [], L = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + r() * 0.8, lean = w * (0.12 + r() * 0.08);
        const top = V(Math.cos(a) * lean, h * (0.82 + r() * 0.1), Math.sin(a) * lean);
        limbs.push(limbGeo(V(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), top, R, R * 0.35, 8));
        for (let k = 0; k < 3; k++) {
          const t = 0.55 + k * 0.17;
          L.push({ x: top.x * t * 1.3, y: top.y * t, z: top.z * t * 1.3, rx: w * 0.26, ry: h * 0.16, rz: d * 0.26 });
        }
      }
      for (const l of L) l.n = lobeN(l.rx, l.ry, l.rz, size, 2.4);
      part(merge(limbs), barkMat(BIRCH_BARK, TEX.birchBark()));
      part(canopyCards(r, L, { size, center: V(0, h * 0.65, 0), shell: 0.45 }), leafMat(TEX.birch(), color));
      break;
    }
    case 'palm': {
      const lean = (r() - 0.5) * h * 0.12, rad = clamp(h * 0.025, 0.08, 0.25);
      const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(lean * 0.3, h * 0.35, 0), V(lean, h * 0.82, 0)]);
      const trunk = new THREE.TubeGeometry(curve, 16, rad, 10, false);
      const uv = trunk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * h * 1.5, uv.getY(i) * 2);
      part(trunk, barkMat(0x9a8566));
      const top = V(lean, h * 0.82, 0), fronds = [];
      for (let i = 0; i < 16; i++) {
        const f = stripGeo(w * 0.2, w * 0.55, -0.9 - r() * 0.6, 0.6, 10);
        f.rotateX(-0.3 - r() * 0.7); f.rotateY((i / 16) * Math.PI * 2 + r() * 0.3); f.translate(top.x, top.y, top.z);
        fronds.push(f);
      }
      part(merge(fronds), leafMat(TEX.palm(), color, THREE.DoubleSide, false));
      break;
    }
    case 'spruce': {
      // whorls of drooping needle branches around a straight trunk, over a dark core
      const K = new Cards(), R = clamp(h * 0.02, 0.025, 0.3);
      part(limbGeo(V(0, 0, 0), V(0, h, 0), R, 0.01), barkMat());
      part(coreGeo(w * 0.12, h * 0.42, d * 0.12, h * 0.5, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.3), roughness: 1 }));
      const tiers = clamp(Math.round(h / 0.18), 10, 60);
      for (let t = 0; t < tiers; t++) {
        const f = t / tiers, y = h * (0.05 + 0.93 * f), Rt = (w / 2) * Math.pow(1 - f, 0.95) * (0.88 + r() * 0.2) + 0.05;
        const m = clamp(Math.round((Rt * 2 * Math.PI) / 0.2), 6, 18);
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2 + r() * 0.5 + t * 0.7, droop = 0.15 + r() * 0.25 + f * 0.1;
          const dir = V(Math.cos(a), -droop, Math.sin(a)).normalize(), side = V(-Math.sin(a), 0, Math.cos(a));
          const wid = Math.max(0.16, Rt * 0.85) / 2, tip = V(0, y, 0).addScaledVector(dir, Rt * 1.05);
          const n = V(Math.cos(a), 0.6, Math.sin(a)).normalize(), k = 0.55 + 0.45 * (0.4 + 0.6 * f) * (0.85 + r() * 0.3);
          K.quad(V(0, y, 0).addScaledVector(side, -wid), tip.clone().addScaledVector(side, -wid), tip.clone().addScaledVector(side, wid), V(0, y, 0).addScaledVector(side, wid), n, k, r, 0, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
      }
      part(K.geometry(), leafMat(TEX.needle(), color));
      break;
    }
    case 'column':
    case 'upright': {
      // dense, tapered column of foliage sprays over a dark core
      const col = kind === 'column', size = clamp(w * (col ? 0.32 : 0.28), 0.14, 0.6), L = [];
      const n = col ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, taper = col ? 1 - 0.75 * Math.pow(t, 1.6) : 1 - 0.45 * Math.pow(t, 1.4);
        L.push({ x: (r() - 0.5) * w * 0.06, y: h * t, z: (r() - 0.5) * d * 0.06, rx: w / 2 * taper, ry: h / n * 0.9, rz: d / 2 * taper });
      }
      for (const l of L) l.n = lobeN(l.rx, l.ry, l.rz, size, 3.2);
      part(coreGeo(w * 0.28, h * 0.46, d * 0.28, h * 0.5, col ? 0.85 : 0.5), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.4), roughness: 1 }));
      part(canopyCards(r, L, { size, center: V(0, h * 0.45, 0), shell: 0.8, face: 0.85, up: 0.3, dark: 0.35 }), leafMat(col ? TEX.scale() : TEX.small(), color));
      break;
    }
    case 'juniper': {
      // low spreading sprays fanning out from the center
      const size = clamp(Math.min(w, d) * 0.16, 0.18, 0.6), L = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + r() * 0.4, rr = 0.3 + r() * 0.15;
        L.push({ x: Math.cos(a) * w * rr, y: h * (0.35 + r() * 0.2), z: Math.sin(a) * d * rr, rx: w * 0.24, ry: h * 0.4, rz: d * 0.24 });
      }
      for (const l of L) l.n = lobeN(l.rx, l.ry, l.rz, size, 3);
      part(coreGeo(w * 0.28, h * 0.3, d * 0.28, h * 0.3), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.4), roughness: 1 }));
      part(canopyCards(r, L, { size, center: V(0, 0, 0), shell: 0.6, face: 0.7, up: 0.4 }), leafMat(TEX.scale(), color));
      break;
    }
    case 'globe':
    case 'hydrangea':
    case 'bloom': {
      // dense rounded shrub: a core, then a skin of leaf cards; flowering kinds add flower cards on top
      const flowering = kind !== 'globe', size = clamp(Math.min(w, h) * (kind === 'globe' ? 0.24 : 0.28), 0.12, 0.6);
      const c = V(0, h / 2, 0), L = lobes(r, c, w / 2, h / 2, d / 2, 6, size, 3.4, { spread: 0.42, lobe: 0.6, low: -0.2 });
      const leafColor = flowering ? (opts.leaf ?? LEAF) : color;
      part(coreGeo(w * 0.3, h * 0.3, d * 0.3, h * 0.45), new THREE.MeshStandardMaterial({ color: new THREE.Color(leafColor).multiplyScalar(0.38), roughness: 1 }));
      part(canopyCards(r, L, { size, center: c, shell: 0.8, face: 0.85, dark: 0.4 }), leafMat(kind === 'hydrangea' ? TEX.broad() : TEX.small(), leafColor));
      if (flowering) {
        const big = kind === 'hydrangea', fs = big ? clamp(Math.min(w, h) * 0.2, 0.14, 0.3) : size;
        const F = L.map(l => ({ ...l, y: l.y + l.ry * 0.1, n: Math.round(l.n * (big ? 0.35 : 0.7)) }));
        part(canopyCards(r, F, { size: fs, center: c, shell: 0.92, face: 0.92, up: 0.5, dark: 0.25 }), leafMat(big ? TEX.mophead() : TEX.blossom(), color));
      }
      break;
    }
    case 'fineline': {
      // narrow, airy column: upright stems clothed in fine, feathery leaves
      const stems = [], K = [], n = 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, r0 = w * 0.05 * r(), r1 = w * (0.14 + r() * 0.14);
        const top = V(Math.cos(a) * r1, h * (0.8 + r() * 0.2), Math.sin(a) * r1 * d / w);
        stems.push(limbGeo(V(Math.cos(a) * r0, 0, Math.sin(a) * r0), top, 0.014, 0.005, 5));
        for (let k = 0; k < 6; k++) {
          const t = 0.3 + k * 0.13;
          K.push({ x: top.x * t, y: top.y * t, z: top.z * t, rx: w * 0.13, ry: h * 0.08, rz: d * 0.13 });
        }
      }
      const size = clamp(w * 0.34, 0.14, 0.4);
      for (const l of K) l.n = lobeN(l.rx, l.ry, l.rz, size, 3);
      part(merge(stems), barkMat(0x5e5148));
      part(canopyCards(r, K, { size, center: V(0, h * 0.6, 0), face: 0.6 }), leafMat(TEX.fern(), color));
      break;
    }
    case 'grass': {
      // a fountain of arching blades, darker at the base; feathery plumes on the tall kinds
      const blades = [], n = 130, K = new Cards();
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, out = r(), len = h * (0.6 + r() * 0.45);
        const b = stripGeo(0.012 + h * 0.01, len, 0.12 + out * 0.55, 0.92, 6);
        b.rotateX(out * 0.55); b.rotateY(a);
        b.translate(Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03);
        // soft normals (out and up) and a base-to-tip gradient
        const p = b.attributes.position, nrm = b.attributes.normal, col = new Float32Array(p.count * 3), o = V(Math.sin(a), 1.2, Math.cos(a)).normalize();
        for (let k = 0; k < p.count; k++) { nrm.setXYZ(k, o.x, o.y, o.z); const t = clamp(p.getY(k) / h, 0, 1), v = 0.45 + 0.65 * t; col[k * 3] = v; col[k * 3 + 1] = v; col[k * 3 + 2] = v * 0.95; }
        b.setAttribute('color', new THREE.BufferAttribute(col, 3));
        b.deleteAttribute('uv');
        blades.push(b);
        if (opts.plume && i % 4 === 0 && out < 0.5) {
          const tip = V(0, len * 1.02, 0).applyAxisAngle(V(1, 0, 0), out * 0.45).applyAxisAngle(V(0, 1, 0), a);
          const pw = h * 0.05, ph = h * 0.22, nn = V(Math.sin(a), 0.3, Math.cos(a)).normalize();
          for (const rot of [0, Math.PI / 2]) {
            const sx = Math.cos(a + rot) * pw, sz = -Math.sin(a + rot) * pw;
            K.quad(V(tip.x - sx, tip.y - ph * 0.15, tip.z - sz), V(tip.x + sx, tip.y - ph * 0.15, tip.z + sz), V(tip.x + sx, tip.y + ph * 0.85, tip.z + sz), V(tip.x - sx, tip.y + ph * 0.85, tip.z - sz), nn, 1, r);
          }
        }
      }
      part(merge(blades), new THREE.MeshStandardMaterial({ color, vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
      if (K.count) part(K.geometry(), leafMat(TEX.plume(), 0xd9c79a));
      break;
    }
    case 'spikes': {
      // a gray-green mound with flower spikes standing above it
      const size = clamp(w * 0.3, 0.1, 0.3), c = V(0, h * 0.2, 0);
      const L = lobes(r, c, w / 2, h * 0.2, d / 2, 5, size, 3.5, { spread: 0.45, lobe: 0.55, low: 0 });
      part(canopyCards(r, L, { size, center: c, shell: 0.5, face: 0.7, up: 0.5 }), leafMat(TEX.fern(), 0x7d8f6a));
      const stems = [], K = new Cards(), n = 24 + Math.round(w * 25);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.42, x = Math.cos(a) * rr * w, z = Math.sin(a) * rr * d;
        const top = V(x * 1.25, h * (0.78 + r() * 0.22), z * 1.25), base = V(x * 0.6, h * 0.2, z * 0.6);
        stems.push(limbGeo(base, top, 0.004, 0.003, 3));
        const sw = h * 0.035, sh = h * 0.28, nn = V(x, 0.5, z).normalize(), b = top.clone().addScaledVector(V(0, 1, 0), -sh * 0.8);
        for (const rot of [0, Math.PI / 2]) {
          const sx = Math.cos(a + rot) * sw, sz = Math.sin(a + rot) * sw;
          K.quad(V(b.x - sx, b.y, b.z - sz), V(b.x + sx, b.y, b.z + sz), V(top.x + sx, top.y, top.z + sz), V(top.x - sx, top.y, top.z - sz), nn, 0.9 + r() * 0.2, r);
        }
      }
      part(merge(stems), new THREE.MeshStandardMaterial({ color: STEM, roughness: 0.9 }));
      part(K.geometry(), leafMat(TEX.spike(), color));
      break;
    }
    case 'hosta': {
      // a rosette of big ribbed leaves arching outward
      const leaves = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + r() * 0.3, ring = i % 2;
        const l = stripGeo(0.36, 0.6, 0.9, 0.05, 6);
        l.rotateX(0.35 + ring * 0.35 + r() * 0.2);
        l.rotateY(a);
        l.translate(0, 0.03 + ring * 0.04, 0);
        leaves.push(l);
      }
      part(merge(leaves), leafMat(TEX.hosta(), color, THREE.DoubleSide, false));
      break;
    }
    default:
      return null;
  }

  fitAll(parts.map(p => p[0]), Math.max(0.004, w), Math.max(0.004, h), Math.max(0.004, d));
  for (const [geo, mat] of parts) group.add(new THREE.Mesh(geo, mat));
  return { group, mats };
}
