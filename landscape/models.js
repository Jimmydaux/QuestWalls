// Procedural landscape models for Yard Sketch.
// Everything is generated in code (no downloads) so it loads fast on the Quest and resizes cleanly.
// Item models are built in a local frame: x = width (centered), z = depth (centered), y = up from the ground.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const INCH = 0.0254;
const BARK = 0x5b4636, BIRCH = 0xe8e3d8, SOIL = 0x3a2b20, EMBER = 0x2a2522, LEAF = 0x4c7a32;

// ---------- small helpers ----------
export function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const clamp = THREE.MathUtils.clamp;
const pos0 = (v) => Math.max(v, 0.004);
const Y = new THREE.Vector3(0, 1, 0);

// smooth pseudo-noise on a sphere: a few random sine waves, roughly in [-1, 1]
function sphereNoise(seed) {
  const r = rng(seed * 7919 + 13), waves = [];
  for (let o = 0; o < 3; o++) for (let i = 0; i < 3; i++) {
    const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(1.6 * (o + 1) * (0.8 + r() * 0.6));
    waves.push({ v, p: r() * Math.PI * 2, a: 1 / (o + 1) });
  }
  const norm = waves.reduce((s, w) => s + w.a, 0) * 0.6;
  return (x, y, z) => { let s = 0; for (const w of waves) s += w.a * Math.sin(x * w.v.x + y * w.v.y + z * w.v.z + w.p); return clamp(s / norm, -1, 1); };
}

// a lumpy unit sphere (non-indexed, so it can be flat shaded and merged), with per-vertex shading in `color`
function blobGeo(seed, { rough = 0.25, detail = 1, flatBelow = -9, flatAbove = 9, colorVar = 0.15, under = 0.25 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  const n = sphereNoise(seed), n2 = sphereNoise(seed + 101);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const c = (1 + colorVar * n2(v.x * 2, v.y * 2, v.z * 2)) * (1 - under + under * (v.y + 1) / 2);
    v.multiplyScalar(1 + rough * n(v.x, v.y, v.z));
    v.y = clamp(v.y, flatBelow, flatAbove);
    pos.setXYZ(i, v.x, v.y, v.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// give a geometry plain white vertex colors so it can merge with shaded ones
function withColor(g, k = 1) {
  if (g.index) g = g.toNonIndexed();
  for (const a of ['uv', 'uv1', 'uv2']) if (g.attributes[a]) g.deleteAttribute(a);
  const c = new Float32Array(g.attributes.position.count * 3).fill(k);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function merge(geos) {
  const m = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return m;
}

// foliage: many small lumpy blobs filling an ellipsoid with radii (rx, ry, rz) around (cx, cy, cz)
function foliage(seed, rx, ry, rz, { cx = 0, cy = 0, cz = 0, count, blob = 0.36, rough = 0.3, detail = 1, low = -0.5 } = {}) {
  const rand = rng(seed), geos = [];
  const n = count ?? clamp(Math.round(10 + (rx + ry + rz) * 4), 10, 36);
  const put = (x, y, z, sx, sy, sz) => {
    const g = blobGeo(Math.floor(rand() * 1e6), { rough, detail, colorVar: 0.16 });
    const k = 0.82 + rand() * 0.3;   // each clump a little lighter or darker
    const c = g.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] *= k;
    g.scale(sx, sy, sz); g.rotateY(rand() * Math.PI * 2); g.translate(x, y, z);
    geos.push(g);
  };
  put(cx, cy, cz, rx * 0.72, ry * 0.72, rz * 0.72);
  for (let i = 0; i < n; i++) {
    const th = rand() * Math.PI * 2, dy = Math.min(1, low + rand() * (1 - low) * 1.1), rr = Math.sqrt(Math.max(0, 1 - dy * dy));
    const k = 0.55 + rand() * 0.15, s = blob * (0.75 + rand() * 0.5);
    put(cx + Math.cos(th) * rr * rx * k, cy + dy * ry * k, cz + Math.sin(th) * rr * rz * k, rx * s, ry * s, rz * s);
  }
  const g = merge(geos);
  shadeByHeight(g, 0.72);
  return g;
}

// darker low down, lighter on top: a cheap stand-in for self-shadowing
function shadeByHeight(g, low = 0.75) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, span = Math.max(1e-6, max.y - min.y);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = low + (1 - low) * (p.getY(i) - min.y) / span;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
}

// squeeze the top of a geometry inward (for cones of arborvitae, yews…)
function taperTop(g, amount, power = 1.6) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, span = Math.max(1e-6, max.y - min.y);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.pow((p.getY(i) - min.y) / span, power), k = 1 - amount * t;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
}

// a cylinder from point a to point b
function limb(a, b, r0, r1, segs = 7) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, pos0(len), segs, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return withColor(g);
}

// a thin strip that rises along +y and arcs toward +z (grass blades, palm fronds)
function strip(width, length, bend, taper = 0.9, segs = 5) {
  const g = new THREE.PlaneGeometry(width, length, 1, segs);
  g.translate(0, length / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / length;
    p.setX(i, p.getX(i) * (1 - taper * t));
    p.setZ(i, bend * t * t * length);
    p.setY(i, p.getY(i) * (1 - 0.35 * Math.abs(bend) * t * t));
  }
  g.computeVertexNormals();
  return withColor(g);
}

// scale + move a set of geometries together so their union fills exactly w × h × d, base on the ground
function fitAll(geos, w, h, d) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  for (const g of geos) { g.computeBoundingBox(); box.union(b.copy(g.boundingBox)); }
  const sx = w / Math.max(1e-6, box.max.x - box.min.x), sy = h / Math.max(1e-6, box.max.y - box.min.y), sz = d / Math.max(1e-6, box.max.z - box.min.z);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (const g of geos) { g.translate(-cx, -box.min.y, -cz); g.scale(sx, sy, sz); g.computeVertexNormals(); }
}

// ---------- shared textures ----------
const texCache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(n) { maxAniso = n; }
function keepTex(canvas, key) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.userData.keep = true;   // shared: never disposed with a shape
  texCache.set(key, t);
  return t;
}
// speckled grain for concrete block and stone faces
function grainTex() {
  if (texCache.has('grain')) return texCache.get('grain');
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), r = rng(77);
  ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = 170 + Math.floor(r() * 85);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 3);
  }
  return keepTex(c, 'grain');
}
// soft round shadow drawn under items
export function shadowTex() {
  if (texCache.has('shadow')) return texCache.get('shadow');
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = keepTex(c, 'shadow');
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- items ----------
export function buildModel(kind, opts, w, d, h, color, seed = 1) {
  const g = new THREE.Group();
  const mats = [];
  const rand = rng(seed * 31 + 7);
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, ...o }); mats.push(m); return m; };
  const leafM = (c) => M(c, { vertexColors: true, flatShading: true, roughness: 0.95 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const rbox = (bw, bh, bd, r = 0.01) => { bw = pos0(bw); bh = pos0(bh); bd = pos0(bd); return new RoundedBoxGeometry(bw, bh, bd, 2, Math.max(0.001, Math.min(r, Math.min(bw, bh, bd) * 0.45))); };
  const stoneM = (c) => M(c, { map: grainTex() });
  const parts = [];   // [geometry, material] for models fitted to exact w × h × d at the end
  const part = (geo, mat) => { parts.push([geo, mat]); return geo; };

  switch (kind) {
    // ---- rocks ----
    case 'boulder':
    case 'flatrock': {
      const flat = kind === 'flatrock';
      const geo = blobGeo(seed, { rough: flat ? 0.22 : 0.34, detail: 2, flatBelow: flat ? -0.3 : -0.42, flatAbove: flat ? 0.32 : 9, colorVar: 0.22, under: 0.3 });
      geo.scale(1 + rand() * 0.25, 1, 1 + rand() * 0.25);
      geo.rotateY(rand() * Math.PI * 2);
      part(geo, M(color, { vertexColors: true, flatShading: true, roughness: 0.97 }));
      break;
    }
    // ---- trees ----
    case 'shade': {
      const trunkH = h * 0.4, r = clamp(h * 0.022, 0.03, 0.4);
      const bark = M(BARK, { vertexColors: true });
      part(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, trunkH + h * 0.2, 0), r, r * 0.55), bark);
      for (let i = 0; i < 3; i++) {
        const a = rand() * Math.PI * 2, o = new THREE.Vector3(0, trunkH * 0.92, 0);
        part(limb(o, new THREE.Vector3(Math.cos(a) * w * 0.25, trunkH + h * 0.18, Math.sin(a) * d * 0.25), r * 0.5, r * 0.25, 5), bark);
      }
      const ch = (h - trunkH * 0.85) / 2;
      part(foliage(seed, w / 2, ch, d / 2, { cy: h - ch }), leafM(color));
      break;
    }
    case 'flower': {
      const trunkH = h * 0.32, r = clamp(h * 0.025, 0.03, 0.2), bark = M(BARK, { vertexColors: true });
      part(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, trunkH + h * 0.12, 0), r, r * 0.6), bark);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + rand();
        part(limb(new THREE.Vector3(0, trunkH * 0.9, 0), new THREE.Vector3(Math.cos(a) * w * 0.3, trunkH + h * 0.2, Math.sin(a) * d * 0.3), r * 0.5, r * 0.25, 5), bark);
      }
      const ch = (h - trunkH * 0.85) / 2;
      part(foliage(seed, w / 2, ch, d / 2, { cy: h - ch, rough: 0.35 }), leafM(color));
      part(foliage(seed + 5, w * 0.47, ch * 0.92, d * 0.47, { cy: h - ch, count: 10, blob: 0.3 }), leafM(LEAF));
      break;
    }
    case 'jmaple': {
      const bark = M(0x4a3a30, { vertexColors: true }), r = clamp(h * 0.02, 0.02, 0.12);
      const tiers = [[0.45, 1, 0.22], [0.68, 0.82, 0.2], [0.86, 0.55, 0.15]];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rand();
        part(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * w * 0.22, h * 0.55, Math.sin(a) * d * 0.22), r, r * 0.4, 6), bark);
      }
      const geos = tiers.map(([y, s, t], i) => foliage(seed + i * 17, w / 2 * s, h * t, d / 2 * s, { cy: h * y, cx: (rand() - 0.5) * w * 0.12, cz: (rand() - 0.5) * d * 0.12, rough: 0.35, blob: 0.34, count: 16, low: -0.2 }));
      part(merge(geos), leafM(color));
      break;
    }
    case 'birch': {
      const bark = M(BIRCH, { vertexColors: true, roughness: 0.7 }), r = clamp(h * 0.012, 0.025, 0.15);
      const tops = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rand() * 0.8, lean = w * (0.12 + rand() * 0.08);
        const top = new THREE.Vector3(Math.cos(a) * lean, h * (0.78 + rand() * 0.1), Math.sin(a) * lean);
        part(limb(new THREE.Vector3(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06), top, r, r * 0.4, 7), bark);
        tops.push(top);
      }
      const geos = tops.map((t, i) => foliage(seed + i * 13, w * 0.3, h * 0.24, d * 0.3, { cx: t.x, cz: t.z, cy: t.y - h * 0.05, rough: 0.4, blob: 0.3, count: 12 }));
      part(merge(geos), leafM(color));
      break;
    }
    case 'spruce': {
      const bark = M(BARK, { vertexColors: true });
      part(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.5, 0), clamp(h * 0.02, 0.02, 0.25), 0.01), bark);
      const n = clamp(Math.round(h / 0.55), 5, 14), y0 = h * 0.07, geos = [];
      for (let i = 0; i < n; i++) {
        const t = i / n, rr = (1 - t * 0.92) * (0.85 + rand() * 0.15), th = (h - y0) / n * 2.3;
        const cone = new THREE.ConeGeometry(rr, th, 11, 2).toNonIndexed();
        const p = cone.attributes.position, nz = sphereNoise(seed + i);
        for (let k = 0; k < p.count; k++) {   // ragged branch tips
          const x = p.getX(k), z = p.getZ(k), y = p.getY(k), q = Math.hypot(x, z);
          if (q > 1e-4) { const f = 1 + 0.12 * nz(x * 3, y, z * 3); p.setX(k, x * f); p.setZ(k, z * f); }
          if (y < 0 && q > rr * 0.6) p.setY(k, y - 0.08 * th * (0.5 + nz(z, x, y)));
        }
        cone.translate(0, y0 + t * (h - y0) * 0.93 + th / 2, 0);
        geos.push(withColor(cone, 0.8 + 0.25 * t + rand() * 0.08));
      }
      const fol = merge(geos); fol.computeVertexNormals();
      part(fol, leafM(color));
      break;
    }
    case 'column': {
      const fol = foliage(seed, w / 2, h / 2, d / 2, { cy: h / 2, rough: 0.2, blob: 0.34, count: 22, low: -0.9 });
      taperTop(fol, 0.7, 1.8);
      part(fol, leafM(color));
      part(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.2, 0), w * 0.08, w * 0.05), M(BARK, { vertexColors: true }));
      break;
    }
    case 'palm': {
      const bark = M(0x8a7558, { vertexColors: true }), lean = (rand() - 0.5) * h * 0.12;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.3, h * 0.35, 0), new THREE.Vector3(lean, h * 0.82, 0)]);
      part(withColor(new THREE.TubeGeometry(curve, 12, clamp(h * 0.025, 0.08, 0.25), 8, false)), bark);
      const top = new THREE.Vector3(lean, h * 0.82, 0), fronds = [], nf = 14;
      for (let i = 0; i < nf; i++) {
        const f = strip(w * 0.13, w * 0.52, -0.9 - rand() * 0.6, 0.85, 8);
        f.rotateX(-0.35 - rand() * 0.6);         // start up-and-out, then droop
        f.rotateY((i / nf) * Math.PI * 2 + rand() * 0.3);
        f.translate(top.x, top.y, top.z);
        fronds.push(f);
      }
      part(merge(fronds), M(color, { vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
      part(foliage(seed, h * 0.04, h * 0.04, h * 0.04, { cx: top.x, cy: top.y, count: 4 }), leafM(0x6b5a3a));
      break;
    }
    // ---- shrubs ----
    case 'fineline': {   // narrow, airy column of upright stems with fine, feathery foliage
      const stemM = M(0x5e5148, { vertexColors: true }), stems = [], fol = [], n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.5, r0 = w * 0.06 * rand(), r1 = w * (0.18 + rand() * 0.14);
        const top = new THREE.Vector3(Math.cos(a) * r1, h * (0.78 + rand() * 0.22), Math.sin(a) * r1 * d / w);
        stems.push(limb(new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a) * r0), top, 0.012, 0.005, 5));
        // foliage hugs the upper two-thirds of each stem in small, loose tufts
        for (let k = 0; k < 7; k++) {
          const t = 0.3 + k * 0.11 + rand() * 0.04;
          fol.push(foliage(Math.floor(rand() * 1e6), w * 0.13, h * 0.075, d * 0.13, {
            cx: top.x * t, cy: top.y * t, cz: top.z * t, count: 9, blob: 0.26, rough: 0.5, detail: 0, low: -0.9,
          }));
        }
      }
      part(merge(stems), stemM);
      part(merge(fol), leafM(color));
      break;
    }
    case 'globe':
      part(foliage(seed, w / 2, h / 2, d / 2, { cy: h / 2, rough: 0.16, blob: 0.4, count: 14, low: -0.6 }), leafM(color));
      break;
    case 'upright': {
      const fol = foliage(seed, w / 2, h / 2, d / 2, { cy: h / 2, rough: 0.25, blob: 0.36, count: 18, low: -0.8 });
      taperTop(fol, 0.45, 1.4);
      part(fol, leafM(color));
      break;
    }
    case 'juniper':
      part(foliage(seed, w / 2, h / 2, d / 2, { cy: h / 2, rough: 0.45, blob: 0.28, count: 26, low: -0.3 }), leafM(color));
      break;
    case 'hydrangea':
    case 'bloom': {
      const big = kind === 'hydrangea';
      part(foliage(seed, w / 2, h / 2, d / 2, { cy: h / 2, rough: 0.3, blob: 0.36, low: -0.5 }), leafM(opts.leaf || LEAF));
      const n = big ? 16 + Math.round(w * 4) : 40 + Math.round(w * 12), fr = Math.min(w, h) * (big ? 0.1 : 0.04), geos = [];
      for (let i = 0; i < n; i++) {
        const th = rand() * Math.PI * 2, dy = -0.15 + rand() * 1.1, rr = Math.sqrt(Math.max(0, 1 - Math.min(1, dy) ** 2));
        const s = blobGeo(Math.floor(rand() * 1e6), { rough: 0.25, detail: big ? 1 : 0, colorVar: 0.15, under: 0.15 });
        s.scale(fr, fr * 0.85, fr);
        s.translate(Math.cos(th) * rr * w / 2 * 0.9, h / 2 + Math.min(1, dy) * h / 2 * 0.9, Math.sin(th) * rr * d / 2 * 0.9);
        geos.push(s);
      }
      part(merge(geos), leafM(color));
      break;
    }
    case 'grass': {
      const n = 70, blades = [], plumes = [];
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, out = rand(), len = h * (0.65 + rand() * 0.4);
        const b = strip(0.02 + h * 0.012, len, 0.15 + out * 0.5, 0.95, 5);
        b.rotateX(out * 0.55);
        b.rotateY(a);
        b.translate(Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03);
        blades.push(b);
        if (opts.plume && i % 4 === 0 && out < 0.5) {
          const p = blobGeo(Math.floor(rand() * 1e6), { rough: 0.2, detail: 1, colorVar: 0.1 });
          const tip = new THREE.Vector3(0, len * 1.08, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), out * 0.4).applyAxisAngle(Y, a);
          p.scale(h * 0.025, h * 0.12, h * 0.025);
          p.translate(tip.x, tip.y, tip.z);
          plumes.push(p);
        }
      }
      part(merge(blades), M(color, { vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
      if (plumes.length) part(merge(plumes), leafM(0xd9c79a));
      break;
    }
    case 'spikes': {   // lavender, salvia
      part(foliage(seed, w / 2, h * 0.2, d / 2, { cy: h * 0.2, rough: 0.35, blob: 0.35 }), leafM(0x7d8f6a));
      const n = 30 + Math.round(w * 30), stems = [], heads = [];
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 0.42, x = Math.cos(a) * rr * w, z = Math.sin(a) * rr * d;
        const top = new THREE.Vector3(x * 1.25, h * (0.75 + rand() * 0.2), z * 1.25);
        stems.push(limb(new THREE.Vector3(x * 0.6, h * 0.2, z * 0.6), top, 0.004, 0.003, 3));
        const s = blobGeo(Math.floor(rand() * 1e6), { rough: 0.15, detail: 0, colorVar: 0.15, under: 0.1 });
        s.scale(h * 0.025, h * 0.1, h * 0.025);
        s.translate(top.x, top.y, top.z);
        heads.push(s);
      }
      part(merge(stems), M(0x6f8a52, { vertexColors: true }));
      part(merge(heads), leafM(color));
      break;
    }
    case 'hosta': {
      const leaves = [], n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.3, ring = i % 2;
        const l = withColor(new THREE.SphereGeometry(1, 10, 6), 0.85 + rand() * 0.25);
        l.scale(0.32, 0.05, 0.6);
        l.translate(0, 0, 0.55);
        l.rotateX(-(0.35 + ring * 0.45 + rand() * 0.2));
        l.rotateY(a);
        l.translate(0, 0.12 + ring * 0.05, 0);
        leaves.push(l);
      }
      const geo = merge(leaves); shadeByHeight(geo, 0.7);
      part(geo, M(color, { vertexColors: true, roughness: 0.7 }));
      break;
    }
    // ---- structures: w × d is the outside of the roof / top, h the very top ----
    case 'pergola': {
      const wood = M(color, { roughness: 0.82 }), geos = [];
      const bx = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(pos0(sx), pos0(sy), pos0(sz)); b.translate(x, y, z); geos.push(b); };
      const P = 0.14, beamH = 0.24, beamT = 0.045, rafH = 0.19, rafT = 0.045, slat = 0.045, oh = Math.min(0.45, Math.min(w, d) * 0.1);
      const px = w / 2 - oh - P / 2, pz = d / 2 - oh * 0.6 - P / 2, postH = Math.max(0.3, h - beamH - rafH - slat);
      const nx = Math.max(2, Math.ceil((2 * px) / 3.6) + 1);   // a post at least every 12'
      for (let i = 0; i < nx; i++) for (const sz of [-1, 1]) bx(P, postH, P, -px + (2 * px * i) / (nx - 1), postH / 2, sz * pz);
      for (const sz of [-1, 1]) for (const side of [-1, 1]) bx(w, beamH, beamT, 0, postH + beamH / 2, sz * pz + side * (P / 2 + beamT / 2));
      const nr = Math.max(3, Math.round(w / 0.4) + 1);
      for (let i = 0; i < nr; i++) bx(rafT, rafH, d, -w / 2 + 0.05 + ((w - 0.1) * i) / (nr - 1), postH + beamH + rafH / 2, 0);
      const ns = Math.max(3, Math.round(d / 0.3) + 1);
      for (let i = 0; i < ns; i++) bx(w * 0.97, slat, slat, 0, postH + beamH + rafH + slat / 2, -d / 2 + 0.1 + ((d - 0.2) * i) / (ns - 1));
      // knee braces at each post
      for (let i = 0; i < nx; i++) for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
        const x = -px + (2 * px * i) / (nx - 1);
        if ((i === 0 && sx < 0) || (i === nx - 1 && sx > 0)) continue;
        const b = new THREE.BoxGeometry(0.09, 0.6, 0.09);
        b.rotateZ(sx * Math.PI / 4); b.translate(x + sx * 0.25, postH - 0.22, sz * pz); geos.push(b);
      }
      add(merge(geos), wood);
      break;
    }
    case 'pavilion': {
      const wood = M(color, { roughness: 0.82 }), roofM = M(opts.roofColor ?? 0x4a4c50, { roughness: 0.92, side: THREE.DoubleSide, flatShading: true });
      const geos = [];
      const bx = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(pos0(sx), pos0(sy), pos0(sz)); b.translate(x, y, z); geos.push(b); };
      const oh = Math.min(0.5, Math.min(w, d) * 0.08), P = 0.18, beamH = 0.3;
      const rise = Math.min((Math.min(w, d) / 2) * (opts.pitch ?? 0.5), h * 0.45), eave = h - rise;
      const px = w / 2 - oh - P / 2, pz = d / 2 - oh - P / 2, postH = Math.max(0.3, eave - beamH);
      // posts around the edge, at least every 12'
      const nx = Math.max(2, Math.ceil((2 * px) / 3.6) + 1), nz = Math.max(2, Math.ceil((2 * pz) / 3.6) + 1);
      for (let i = 0; i < nx; i++) for (const sz of [-1, 1]) bx(P, postH, P, -px + (2 * px * i) / (nx - 1), postH / 2, sz * pz);
      for (let j = 1; j < nz - 1; j++) for (const sx of [-1, 1]) bx(P, postH, P, sx * px, postH / 2, -pz + (2 * pz * j) / (nz - 1));
      for (const sz of [-1, 1]) bx(2 * px + P, beamH, P * 0.9, 0, postH + beamH / 2, sz * pz);
      for (const sx of [-1, 1]) bx(P * 0.9, beamH, 2 * pz + P, sx * px, postH + beamH / 2, 0);
      // fascia along the eaves
      for (const sz of [-1, 1]) bx(w, 0.16, 0.04, 0, eave - 0.08, sz * (d / 2 - 0.02));
      for (const sx of [-1, 1]) bx(0.04, 0.16, d, sx * (w / 2 - 0.02), eave - 0.08, 0);
      // roof, built with its ridge along the long side
      const long = w >= d, L = Math.max(w, d), S = Math.min(w, d);
      const tris = [], tri = (a, b, c) => tris.push(...a, ...b, ...c), quad = (a, b, c, e) => { tri(a, b, c); tri(a, c, e); };
      const E1 = [-L / 2, eave, S / 2], E2 = [L / 2, eave, S / 2], E3 = [L / 2, eave, -S / 2], E4 = [-L / 2, eave, -S / 2];
      const gable = opts.roof === 'gable', rx = gable ? L / 2 : Math.max(0, L / 2 - S / 2);
      const R1 = [-rx, h, 0], R2 = [rx, h, 0];
      quad(E1, E2, R2, R1); quad(E3, E4, R1, R2);
      if (!gable) { tri(E2, E3, R2); tri(E4, E1, R1); }
      const roof = new THREE.BufferGeometry();
      roof.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
      roof.computeVertexNormals();
      if (gable) {   // triangular gable ends filled in with siding
        const gx = L / 2 - oh, gt = [];
        for (const sx of [-1, 1]) gt.push(sx * gx, eave, S / 2 - oh, sx * gx, eave, -(S / 2 - oh), sx * gx, h - rise * (oh / (L / 2)), 0);
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.Float32BufferAttribute(gt, 3));
        gg.computeVertexNormals();
        if (!long) gg.rotateY(Math.PI / 2);
        add(gg, M(color, { roughness: 0.85, side: THREE.DoubleSide }));
      }
      if (!long) roof.rotateY(Math.PI / 2);
      add(roof, roofM);
      add(merge(geos), wood);
      break;
    }
    // ---- hardscape ----
    case 'block': {
      add(rbox(w, h, d, opts.round ?? 0.008), stoneM(color), 0, h / 2, 0);
      break;
    }
    case 'paver': {
      add(rbox(w, h, d, 0.004), stoneM(color), 0, h / 2, 0);
      break;
    }
    case 'pillar': {
      const capH = 0.08, ch = 0.152, n = Math.max(1, Math.round((h - capH) / ch)), sh = (h - capH) / n;
      const mat = stoneM(color), capM = stoneM(new THREE.Color(color).multiplyScalar(0.92));
      for (let c = 0; c < n; c++) {
        const split = c % 2 === 0;
        for (const s of [-1, 1]) {
          const bw = split ? w / 2 - 0.003 : w, bd = split ? d : d / 2 - 0.003;
          add(rbox(bw, sh - 0.004, bd, 0.008), mat, split ? s * w / 4 : 0, c * sh + sh / 2, split ? 0 : s * d / 4);
        }
      }
      add(rbox(w + 0.06, capH, d + 0.06, 0.01), capM, 0, h - capH / 2, 0);
      break;
    }
    case 'seatwall': {
      const capH = 0.09, ch = 0.152, n = Math.max(1, Math.round((h - capH) / ch)), sh = (h - capH) / n, L = 0.457;
      const mat = stoneM(color), capM = stoneM(new THREE.Color(color).multiplyScalar(0.92));
      for (let c = 0; c < n; c++) {
        let u = -w / 2;
        const first = c % 2 ? L / 2 : L;
        let l = first;
        while (u < w / 2 - 0.02) {
          const e = Math.min(w / 2, u + l);
          add(rbox(e - u - 0.004, sh - 0.004, d, 0.008), mat, (u + e) / 2, c * sh + sh / 2, 0);
          u = e; l = L;
        }
      }
      add(rbox(w + 0.04, capH, d + 0.06, 0.01), capM, 0, h - capH / 2, 0);
      break;
    }
    case 'firepit': {
      const R = Math.min(w, d) / 2, bd = 0.25, capH = 0.08, ch = 0.152, n = Math.max(1, Math.round((h - capH) / ch)), sh = (h - capH) / n;
      const rm = R - bd / 2, cnt = Math.max(6, Math.round((2 * Math.PI * rm) / 0.3));
      const mat = stoneM(color), capM = stoneM(new THREE.Color(color).multiplyScalar(0.9));
      const ring = (y, hh, depth, rad, k, off, m) => {
        for (let i = 0; i < k; i++) {
          const a = ((i + off) / k) * Math.PI * 2, arc = (2 * Math.PI * (rad + depth / 2)) / k;
          const b = add(rbox(arc - 0.006, hh, depth, 0.008), m, Math.cos(a) * rad, y, Math.sin(a) * rad);
          b.rotation.y = -a + Math.PI / 2;
        }
      };
      for (let c = 0; c < n; c++) ring(c * sh + sh / 2, sh - 0.005, bd, rm, cnt, c % 2 ? 0.5 : 0, mat);
      ring(h - capH / 2, capH, bd + 0.05, rm, cnt, 0.25, capM);
      add(new THREE.CylinderGeometry(R - bd, R - bd, 0.02, 24), M(EMBER), 0, 0.06, 0);
      const wood = M(0x6b4b33);
      for (let i = 0; i < 3; i++) {
        const log = add(new THREE.CylinderGeometry(0.045, 0.05, (R - bd) * 1.2, 8), wood, 0, 0.11, 0);
        log.rotation.z = Math.PI / 2 - 0.25; log.rotation.y = (i / 3) * Math.PI;
      }
      break;
    }
    case 'stepstone': {
      const geo = new THREE.CylinderGeometry(w / 2, w / 2, pos0(h), 28);
      geo.scale(1, 1, d / Math.max(0.01, w));
      add(geo, stoneM(color), 0, h / 2, 0);
      break;
    }
    case 'flagstone': {
      const sh = new THREE.Shape(), k = 9, rot = rand() * 6;
      for (let i = 0; i < k; i++) {
        const a = rot + (i / k) * Math.PI * 2 + (rand() - 0.5) * 0.4, r = 0.8 + rand() * 0.2;
        const x = Math.cos(a) * r * w / 2, y = Math.sin(a) * r * d / 2;
        i ? sh.lineTo(x, y) : sh.moveTo(x, y);
      }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: pos0(h - 0.01), bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.008, bevelSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.005, 0);
      add(geo, M(color, { roughness: 0.95 }));
      break;
    }
    default:
      add(new THREE.BoxGeometry(pos0(w), pos0(h), pos0(d)), M(color), 0, h / 2, 0);
  }

  if (parts.length) {
    fitAll(parts.map(p => p[0]), pos0(w), pos0(h), pos0(d));
    for (const [geo, mat] of parts) add(geo, mat);
  }
  return { group: g, mats };
}

// ---------- retaining walls ----------
// sizes in inches: face length L × course height H × depth D; capH = cap course height (0 = no cap)
export const WALL_STYLES = [
  { id: 'std',     name: 'Wall block 18×6×12"',    L: 18, H: 6, D: 12, capH: 4,   round: 0.03, color: 'Gray' },
  { id: 'large',   name: 'Large wall block 18×8×12"', L: 18, H: 8, D: 12, capH: 4, round: 0.03, color: 'Tan blend' },
  { id: 'garden',  name: 'Garden wall block 12×4×7"', L: 12, H: 4, D: 7, capH: 2.5, round: 0.04, color: 'Red blend' },
  { id: 'tumbled', name: 'Tumbled block 16×6×10"',  L: 16, H: 6, D: 10, capH: 3.5, round: 0.14, color: 'Buff' },
  { id: 'stone',   name: 'Natural stacked stone',   L: 16, H: 6, D: 12, capH: 2.5, round: 0.12, natural: true, color: 'Sandstone' },
  { id: 'boulder', name: 'Boulder wall (2–3\' rocks)', L: 30, H: 22, D: 28, capH: 0, boulder: true, color: 'Granite' },
];
export const WALL_STYLE = Object.fromEntries(WALL_STYLES.map(s => [s.id, s]));

export function wallCourses(style, height) {
  const H = style.H * INCH, capH = style.capH * INCH;
  const n = Math.max(1, Math.round((height - capH) / (style.boulder ? H * 0.9 : H)));
  return { n, total: style.boulder ? n * H * 0.9 + H * 0.1 : n * H + capH };
}

// ---------- paths: straight runs and splines ----------
// Points flagged smooth[i] are curve points: a centripetal Catmull-Rom spline passes through them.
// Other points are corners. The ends of an open run are always corners.
function makePath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const len = cum[cum.length - 1];
  // position and direction at distance u along the path (extrapolated past the ends)
  const at = (u) => {
    let i = 0;
    if (u >= len) i = pts.length - 2;
    else if (u > 0) { let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; } i = lo; }
    while (i > 0 && cum[i + 1] - cum[i] < 1e-6) i--;
    const a = pts[i], b = pts[i + 1], sl = Math.max(1e-6, cum[i + 1] - cum[i]);
    const dx = (b.x - a.x) / sl, dz = (b.z - a.z) / sl, t = u - cum[i];
    return { x: a.x + dx * t, z: a.z + dz * t, dx, dz };
  };
  return { pts, len, at };
}
function sampleCurve(pts, loop) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z)), loop, 'centripetal');
  const m = Math.max(8, Math.ceil(curve.getLength() / 0.08));
  return curve.getSpacedPoints(m).map(v => ({ x: v.x, z: v.z }));
}
export function wallPaths(points, closed, smooth = []) {
  const n = points.length;
  closed = closed && n >= 3;
  if (n < 2) return { paths: [], loop: false };
  const sharp = (i) => !smooth[i] || (!closed && (i === 0 || i === n - 1));
  const idx = [...Array(n).keys()], sharpIdx = idx.filter(sharp);
  if (closed && !sharpIdx.length) return { paths: [makePath(sampleCurve(points, true))], loop: true };
  const start = closed ? sharpIdx[0] : 0;
  const order = closed ? [...idx.slice(start), ...idx.slice(0, start), start] : idx;
  const paths = [];
  let run = [order[0]];
  for (let k = 1; k < order.length; k++) {
    run.push(order[k]);
    if (sharp(order[k])) {
      const pts = run.map(i => points[i]);
      paths.push(makePath(pts.length > 2 ? sampleCurve(pts, false) : pts.map(p => ({ x: p.x, z: p.z }))));
      run = [order[k]];
    }
  }
  return { paths, loop: false };
}
// outline of a closed area, with curves sampled into short straight pieces
export function pathPolygon(points, smooth = []) {
  const { paths, loop } = wallPaths(points, true, smooth);
  const out = [];
  for (const p of paths) out.push(...p.pts.slice(0, -1));
  return out.length >= 3 ? out : points.map(p => ({ x: p.x, z: p.z }));
}

// lay out every block of a wall; returns pieces in layout coordinates
export function planWall(points, closed, height, style, seed = 1, smooth = []) {
  const L = style.L * INCH, H = style.H * INCH, D = style.D * INCH, capH = style.capH * INCH;
  const rand = rng(seed * 13 + 5);
  const { n } = wallCourses(style, height);
  const { paths, loop } = wallPaths(points, closed, smooth);
  const blocks = [], caps = [];
  paths.forEach((P, k) => {
    const len = P.len;
    if (len < 0.01) return;
    const hasStart = !loop && (closed || k > 0), hasEnd = !loop && (closed || k < paths.length - 1);
    const put = (list, uc, y, rotJitter, sl, sh, sd, full) => {
      const q = P.at(uc);
      list.push({ x: q.x, z: q.z, y, rot: -Math.atan2(q.dz, q.dx) + rotJitter, sl, sh, sd, full });
    };
    const course = (c, list, ch, depth, y0, natural, isCap) => {
      // corners interlock: on alternating courses one wall runs through the corner, the other butts into it
      const own = c % 2 === 0;
      const u0 = hasStart ? (own ? D / 2 : -D / 2) : 0;
      const u1 = hasEnd ? (own ? len + D / 2 : len - D / 2) : len;
      let u = u0, first = true;
      while (u < u1 - 0.02) {
        let l = natural ? L * (0.55 + rand() * 0.9) : L;
        if (first && c % 2 && !isCap) l = L / 2;
        let e = Math.min(u1, u + l);
        if (u1 - e < 0.06) e = u1;   // no slivers at the end
        const sl = e - u - 0.005, uc = (u + e) / 2;
        const sh = natural ? ch * (0.82 + rand() * 0.16) : ch - 0.004, sd = natural ? depth * (0.85 + rand() * 0.15) : depth;
        put(list, uc, y0 + sh / 2, natural ? (rand() - 0.5) * 0.06 : 0, sl, sh, sd, sl > L * 0.75);
        u = e; first = false;
      }
    };
    if (style.boulder) {
      for (let c = 0; c < n; c++) {
        let u = (c % 2) * L * 0.4;
        while (u < len) {
          const l = L * (0.75 + rand() * 0.45), uc = Math.min(len, u + l / 2);
          const s = 0.85 + rand() * 0.3;
          put(blocks, uc, c * H * 0.88 + H * s / 2, rand() * Math.PI * 2, l * 1.05, H * s, D * (0.8 + rand() * 0.3), true);
          u += l * 0.92;
        }
      }
    } else {
      for (let c = 0; c < n; c++) course(c, blocks, H, D, c * H, !!style.natural, false);
      if (capH > 0) course(n, caps, capH, D + 2 * INCH, n * H, !!style.natural, true);
    }
  });
  return { blocks, caps, courses: n };
}

export function buildWall(points, closed, height, style, color, seed = 1, smooth = []) {
  const plan = planWall(points, closed, height, style, seed, smooth);
  const group = new THREE.Group(), mats = [], pickables = [];
  const rand = rng(seed * 3 + 1);
  const base = new THREE.Color(color), tmp = new THREE.Color();
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const mk = (list, geo, mat, vary) => {
    if (!list.length) { geo.dispose(); return; }
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => {
      q.setFromAxisAngle(Y, b.rot);
      m.compose(p.set(b.x, b.y, b.z), q, s.set(b.sl, b.sh, b.sd));
      im.setMatrixAt(i, m);
      const k = 1 + (rand() - 0.5) * vary;
      tmp.copy(base).multiplyScalar(k);
      tmp.offsetHSL((rand() - 0.5) * (style.natural || style.boulder ? 0.04 : 0.015), 0, 0);
      im.setColorAt(i, tmp);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im); pickables.push(im); mats.push(mat);
  };
  if (style.boulder) {
    const geo = blobGeo(seed % 7 + 3, { rough: 0.3, detail: 2, flatBelow: -0.55, colorVar: 0.2 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(0, -(bb.min.y + bb.max.y) / 2, 0);
    geo.scale(1 / (bb.max.x - bb.min.x), 1 / (bb.max.y - bb.min.y), 1 / (bb.max.z - bb.min.z));
    mk(plan.blocks, geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, flatShading: true, vertexColors: true }), 0.35);
  } else {
    const r = style.round;
    mk(plan.blocks, new RoundedBoxGeometry(1, 1, 1, 2, r * 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, map: grainTex() }), style.natural ? 0.35 : 0.16);
    mk(plan.caps, new RoundedBoxGeometry(1, 1, 1, 2, r * 0.5), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.85, map: grainTex() }), style.natural ? 0.3 : 0.1);
  }
  return { group, mats, pickables, plan };
}

// ---------- ground surfaces: pavers, stone, gravel, mulch, lawn ----------
// S = inches covered by one texture tile; t = default thickness (in); unit = single paver size (in) for counts; loose = sold by volume
export const SURFACES = [
  { id: 'runbond', name: 'Pavers 4×8 running bond', S: 32, t: 2.4, color: 'Red blend', unit: [4, 8] },
  { id: 'herring', name: 'Pavers 4×8 herringbone',  S: 32, t: 2.4, color: 'Tan blend', unit: [4, 8] },
  { id: 'basket',  name: 'Pavers 4×8 basketweave',  S: 32, t: 2.4, color: 'Red blend', unit: [4, 8] },
  { id: 'sq12',    name: 'Pavers 12×12',            S: 48, t: 2.4, color: 'Gray', unit: [12, 12] },
  { id: 'slab24',  name: 'Patio slabs 24×24',       S: 48, t: 2, color: 'Buff', unit: [24, 24] },
  { id: 'ashlar',  name: 'Pavers random ashlar',    S: 48, t: 2.4, color: 'Tan blend', unit: null },
  { id: 'flag',    name: 'Flagstone',               S: 60, t: 2, color: 'Bluestone', unit: null },
  { id: 'concrete', name: 'Concrete',               S: 48, t: 4, color: 'Light gray', unit: null, pour: true },
  { id: 'gravel',  name: 'Gravel (3/4")',           S: 24, t: 2, color: 'Gray', loose: 3 },
  { id: 'river',   name: 'River rock',              S: 24, t: 2, color: 'Granite', loose: 3 },
  { id: 'dg',      name: 'Decomposed granite',      S: 24, t: 1.5, color: 'Buff', loose: 3 },
  { id: 'mulch',   name: 'Mulch bed',               S: 24, t: 2, color: 'Brown mulch', loose: 3 },
  { id: 'lawn',    name: 'Lawn (sod)',              S: 24, t: 1, color: 'Lawn', sod: true },
];
export const SURFACE = Object.fromEntries(SURFACES.map(s => [s.id, s]));

function surfaceTex(surf, color) {
  const key = `surf|${surf.id}|${color}`;
  if (texCache.has(key)) return texCache.get(key);
  const P = 512, S = surf.S, px = P / S;
  const c = document.createElement('canvas'); c.width = c.height = P;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(color);
  const css = (k, hue = 0) => { const t = base.clone().multiplyScalar(k); if (hue) t.offsetHSL(hue, 0, 0); return '#' + t.getHexString(); };
  const hash = (x, y) => { let h = Math.imul(Math.round(((x % S) + S) % S * 8) + 31, 73856093) ^ Math.imul(Math.round(((y % S) + S) % S * 8) + 17, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // a rectangular unit (inches) drawn with joints, wrapped so the tile repeats seamlessly
  const unitRect = (x, y, w, h, joint = 0.2) => {
    const r = hash(x, y);
    ctx.fillStyle = css(0.82 + r * 0.3, (r - 0.5) * 0.04);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const X = (x + ox + joint / 2) * px, Yp = (y + oy + joint / 2) * px, W = (w - joint) * px, H = (h - joint) * px;
      if (X > P || Yp > P || X + W < 0 || Yp + H < 0) continue;
      ctx.fillRect(X, Yp, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X, Yp, W, Math.max(1, H * 0.08));   // light bevel
      ctx.fillStyle = css(0.82 + r * 0.3, (r - 0.5) * 0.04);
    }
  };
  const scatter = (count, fn) => { const r = rng(surf.id.length * 97 + 3); for (let i = 0; i < count; i++) { const x = r() * S, y = r() * S; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(x + ox, y + oy, r, i); } };
  const sandJoint = () => { ctx.fillStyle = '#8f8574'; ctx.fillRect(0, 0, P, P); };

  switch (surf.id) {
    case 'runbond':
      sandJoint();
      for (let r = 0; r < S / 4; r++) for (let x = -(r % 2) * 4; x < S; x += 8) unitRect(x, r * 4, 8, 4);
      break;
    case 'herring': {
      sandJoint();
      const W = 4;
      for (let i = -24; i < 24; i++) for (let j = -12; j < 12; j++) {
        const ox = i * W + j * 2 * W, oy = i * W - j * 2 * W;
        if (ox < -2 * S || ox > 2 * S || oy < -2 * S || oy > 2 * S) continue;
        unitRect(ox, oy, 2 * W, W);
        unitRect(ox, oy + W, W, 2 * W);
      }
      break;
    }
    case 'basket':
      sandJoint();
      for (let i = 0; i < S / 8; i++) for (let j = 0; j < S / 8; j++) {
        if ((i + j) % 2) { unitRect(i * 8, j * 8, 8, 4); unitRect(i * 8, j * 8 + 4, 8, 4); }
        else { unitRect(i * 8, j * 8, 4, 8); unitRect(i * 8 + 4, j * 8, 4, 8); }
      }
      break;
    case 'sq12':
      sandJoint();
      for (let i = 0; i < S / 12; i++) for (let j = 0; j < S / 12; j++) unitRect(i * 12, j * 12, 12, 12, 0.25);
      break;
    case 'slab24':
      sandJoint();
      for (let i = 0; i < S / 24; i++) for (let j = 0; j < S / 24; j++) unitRect(i * 24, j * 24, 24, 24, 0.3);
      break;
    case 'ashlar': {
      sandJoint();
      const r = rng(11);
      let y = 0;
      for (const rh of [24, 12, 12]) {
        let x = 0;
        while (x < S) { let l = [12, 24, 24, 12, 36][Math.floor(r() * 5)]; l = Math.min(l, S - x); unitRect(x, y, l, rh, 0.3); x += l; }
        y += rh;
      }
      break;
    }
    case 'flag': {
      // Voronoi stones with mortar joints
      const r = rng(5), pts = [];
      for (let i = 0; i < 16; i++) pts.push([r() * S, r() * S, r()]);
      const all = [];
      for (const [x, y, k] of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) all.push([x + ox, y + oy, k]);
      const Q = 256, img = ctx.createImageData(Q, Q), mortar = new THREE.Color(0x8c8577);
      for (let j = 0; j < Q; j++) for (let i = 0; i < Q; i++) {
        const x = (i + 0.5) / Q * S, y = (j + 0.5) / Q * S;
        let d1 = 1e9, d2 = 1e9, kk = 0;
        for (const p of all) { const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (dd < d1) { d2 = d1; d1 = dd; kk = p[2]; } else if (dd < d2) d2 = dd; }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const col = edge < 0.7 ? mortar : base.clone().multiplyScalar(0.8 + kk * 0.35).offsetHSL((kk - 0.5) * 0.05, 0, 0);
        const o = (j * Q + i) * 4, k2 = 0.95 + Math.random() * 0.1;
        img.data[o] = Math.min(255, col.r * 255 * k2); img.data[o + 1] = Math.min(255, col.g * 255 * k2); img.data[o + 2] = Math.min(255, col.b * 255 * k2); img.data[o + 3] = 255;
      }
      const tmpC = document.createElement('canvas'); tmpC.width = tmpC.height = Q;
      tmpC.getContext('2d').putImageData(img, 0, 0);
      ctx.drawImage(tmpC, 0, 0, P, P);
      break;
    }
    case 'concrete':
      ctx.fillStyle = css(1); ctx.fillRect(0, 0, P, P);
      scatter(2500, (x, y, r) => { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(x * px, y * px, 2, 2); });
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, P, 3); ctx.fillRect(0, 0, 3, P);   // control joints
      break;
    case 'gravel':
    case 'dg':
      ctx.fillStyle = css(0.6); ctx.fillRect(0, 0, P, P);
      scatter(surf.id === 'dg' ? 9000 : 2600, (x, y, r) => {
        const s = surf.id === 'dg' ? 0.08 + r() * 0.1 : 0.18 + r() * 0.22;
        ctx.fillStyle = css(0.7 + r() * 0.55, (r() - 0.5) * 0.05);
        ctx.beginPath(); ctx.ellipse(x * px, y * px, s * px, s * px * (0.6 + r() * 0.4), r() * 3, 0, 7); ctx.fill();
      });
      break;
    case 'river':
      ctx.fillStyle = css(0.35); ctx.fillRect(0, 0, P, P);
      scatter(420, (x, y, r) => {
        const s = 0.5 + r() * 0.8, k = 0.7 + r() * 0.6, a = r() * 3;
        ctx.fillStyle = css(k, (r() - 0.5) * 0.08);
        ctx.beginPath(); ctx.ellipse(x * px, y * px, s * px, s * px * (0.55 + r() * 0.35), a, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.ellipse((x - s * 0.25) * px, (y - s * 0.2) * px, s * px * 0.4, s * px * 0.25, a, 0, 7); ctx.fill();
      });
      break;
    case 'mulch':
      ctx.fillStyle = css(0.55); ctx.fillRect(0, 0, P, P);
      scatter(3200, (x, y, r) => {
        ctx.strokeStyle = css(0.6 + r() * 0.7); ctx.lineWidth = (0.12 + r() * 0.15) * px;
        const a = r() * Math.PI, l = (0.3 + r() * 0.9) * px;
        ctx.beginPath(); ctx.moveTo(x * px, y * px); ctx.lineTo(x * px + Math.cos(a) * l, y * px + Math.sin(a) * l); ctx.stroke();
      });
      break;
    case 'lawn':
      ctx.fillStyle = css(0.75); ctx.fillRect(0, 0, P, P);
      scatter(7000, (x, y, r) => {
        ctx.strokeStyle = css(0.65 + r() * 0.65, (r() - 0.5) * 0.04); ctx.lineWidth = 1.2;
        const a = -Math.PI / 2 + (r() - 0.5) * 1.2, l = (0.25 + r() * 0.4) * px;
        ctx.beginPath(); ctx.moveTo(x * px, y * px); ctx.lineTo(x * px + Math.cos(a) * l, y * px + Math.sin(a) * l); ctx.stroke();
      });
      break;
  }
  const t = keepTex(c, key);
  t.repeat.set(1 / (S * INCH), 1 / (S * INCH));
  return t;
}

// pts: [[x, z], …] in the area's own frame (x along its first edge). Top of the surface is at y = thickness.
export function buildSurface(pts, thickness, surf, color) {
  const group = new THREE.Group();
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: pos0(thickness), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const top = new THREE.MeshStandardMaterial({ map: surfaceTex(surf, color), roughness: surf.id === 'concrete' ? 0.8 : 0.95 });
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(surf.loose || surf.sod ? 0.45 : 0.75), roughness: 0.95, map: surf.loose || surf.sod ? null : grainTex() });
  const mesh = new THREE.Mesh(geo, [top, side]);
  group.add(mesh);
  return { group, mats: [top, side], pickables: [mesh] };
}

// soil inside a raised bed
export function soilMat() { return new THREE.MeshStandardMaterial({ color: SOIL, roughness: 1 }); }
