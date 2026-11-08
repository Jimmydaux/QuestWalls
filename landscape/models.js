// Procedural landscape models for Yard Sketch.
// Everything is generated in code (no downloads) so it loads fast on the Quest and resizes cleanly.
// Item models are built in a local frame: x = width (centered), z = depth (centered), y = up from the ground.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPlant, PLANT_KINDS, setPlantAnisotropy } from './plants.js';
export { PLANT_KINDS };

export const INCH = 0.0254;
const SOIL = 0x3a2b20, EMBER = 0x2a2522;

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

function merge(geos) {
  const m = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return m;
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
export function setMaxAnisotropy(n) { maxAniso = n; setPlantAnisotropy(n); }
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
// wood grain for stained structures: long streaky grain along u, a few knots; tinted by the stain color
function woodTex() {
  if (texCache.has('wood')) return texCache.get('wood');
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d'), r = rng(911);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 70; i++) {
    let y = r() * 256; const v = 150 + r() * 90, wv = 1 + r() * 3.5;
    ctx.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.35 + r() * 0.5})`; ctx.lineWidth = wv;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 32) { y += (r() - 0.5) * 3; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = r() * 1024, y = r() * 256;
    for (let i = 7; i > 0; i--) { ctx.strokeStyle = `rgba(90,90,90,${0.12 * i})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, i * 7, i * 3, 0, 0, 7); ctx.stroke(); }
  }
  for (let i = 0; i < 1600; i++) { ctx.fillStyle = `rgba(0,0,0,${r() * 0.07})`; ctx.fillRect(r() * 1024, r() * 256, 6 + r() * 30, 1); }
  return keepTex(c, 'wood');
}
// give a box's faces UVs in meters with the grain (u) running along the board's longest side
function boardUV(geo, sx, sy, sz, off) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, ext = [sx, sy, sz];
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const axis = nx > ny && nx > nz ? 0 : ny > nz ? 1 : 2, inPlane = [0, 1, 2].filter(a => a !== axis);
    const [ua, va] = ext[inPlane[0]] >= ext[inPlane[1]] ? inPlane : [inPlane[1], inPlane[0]];
    const co = [p.getX(i), p.getY(i), p.getZ(i)];
    uv.setXY(i, co[ua] / 1.6 + off, co[va] / 0.4 + off * 3);
  }
}

// lap siding: horizontal boards with a shadow line under each, tinted by the paint color (1.2 m of texture = 6 laps)
function sidingTex() {
  if (texCache.has('siding')) return texCache.get('siding');
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'), r = rng(515);
  ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6; i++) {
    const y = i * (256 / 6);
    const grd = ctx.createLinearGradient(0, y, 0, y + 256 / 6);
    grd.addColorStop(0, 'rgba(0,0,0,0.28)'); grd.addColorStop(0.12, 'rgba(0,0,0,0.05)'); grd.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = grd; ctx.fillRect(0, y, 256, 256 / 6);
  }
  for (let i = 0; i < 500; i++) { ctx.fillStyle = `rgba(0,0,0,${r() * 0.04})`; ctx.fillRect(r() * 256, r() * 256, 10 + r() * 40, 1); }
  return keepTex(c, 'siding');
}
// box UVs in meters: walls get horizontal siding (v = height), tops/bottoms a plain plan mapping
function sidingUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.5) uv.setXY(i, p.getX(i) / 1.2, p.getZ(i) / 1.2);
    else uv.setXY(i, (nx > 0.5 ? p.getZ(i) : p.getX(i)) / 1.2, p.getY(i) / 1.2);
  }
}
function boardUVq() {}

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
// ---------- outdoor furniture ----------
// Built in a local frame: x = width (centered), z = depth (front toward +z), y = up. One color = the frame or wood
// (teak and the other stains get grain); cushions are a soft canvas color.
export const FURNITURE_KINDS = new Set(['pdtable', 'pchair', 'adirondack', 'chaise', 'osofa', 'ctable', 'firetable', 'bench', 'umbrella', 'grill', 'planter']);
const CUSHION = 0xd9d0bf;
function buildFurniture(kind, opts, w, d, h, color, seed) {
  const group = new THREE.Group(), mats = [], rand = rng(seed * 7 + 11);
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o }); mats.push(m); return m; };
  const frame = opts.wood ? M(new THREE.Color(color).multiplyScalar(1.15), { map: woodTex(), roughness: 0.72 }) : M(color, { roughness: 0.45, metalness: 0.35 });
  const cushion = M(opts.cushion ?? CUSHION, { roughness: 0.97 });
  const geos = new Map();   // material → geometries, merged at the end (few draw calls)
  const put = (mat, g) => { if (!geos.has(mat)) geos.set(mat, []); geos.get(mat).push(g); return g; };
  // a board / bar: size, position, rotation (x, y, z)
  const box = (mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(pos0(sx), pos0(sy), pos0(sz));
    if (mat === frame && opts.wood) boardUV(g, sx, sy, sz, rand());
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
    return put(mat, g);
  };
  const pad = (sx, sy, sz, x, y, z, rx = 0) => { const g = new RoundedBoxGeometry(pos0(sx), pos0(sy), pos0(sz), 3, Math.min(0.035, Math.min(sx, sy, sz) * 0.4)); g.rotateX(rx); g.translate(x, y, z); return put(cushion, g); };
  const cyl = (mat, r0, r1, len, x, y, z, segs = 16) => { const g = new THREE.CylinderGeometry(r1, r0, pos0(len), segs); g.translate(x, y + len / 2, z); return put(mat, g); };
  const legs = (lx, lz, lh, t = 0.045) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(frame, t, lh, t, sx * lx, lh / 2, sz * lz); };
  const slatTop = (tw, td, y, t = 0.025, gap = 0.012, along = 'x') => {
    // a top made of boards with small gaps (solid when painted / metal)
    if (!opts.wood) { box(frame, tw, t, td, 0, y - t / 2, 0); return; }
    const across = along === 'x' ? td : tw, n = Math.max(3, Math.round(across / 0.1)), bw = (across - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) { const o = -across / 2 + bw / 2 + i * (bw + gap); along === 'x' ? box(frame, tw, t, bw, 0, y - t / 2, o) : box(frame, bw, t, td, o, y - t / 2, 0); }
  };
  switch (kind) {
    case 'pdtable': {
      if (opts.round) {
        const r = Math.min(w, d) / 2;
        const top = new THREE.CylinderGeometry(r, r, 0.035, 32); top.translate(0, h - 0.018, 0); put(frame, top);
        cyl(frame, 0.035, 0.035, h - 0.04, 0, 0, 0, 12);
        cyl(frame, r * 0.55, r * 0.5, 0.03, 0, 0, 0, 24);
      } else {
        slatTop(w, d, h, 0.03);
        legs(w / 2 - 0.08, d / 2 - 0.08, h - 0.03, 0.06);
        for (const sz of [-1, 1]) box(frame, w - 0.16, 0.07, 0.03, 0, h - 0.07, sz * (d / 2 - 0.08));
        for (const sx of [-1, 1]) box(frame, 0.03, 0.07, d - 0.16, sx * (w / 2 - 0.08), h - 0.07, 0);
      }
      break;
    }
    case 'pchair': {
      const seatH = 0.44, t = 0.035;
      for (const sx of [-1, 1]) {
        box(frame, t, seatH, t, sx * (w / 2 - t / 2), seatH / 2, d / 2 - t / 2);                       // front legs
        box(frame, t, h, t, sx * (w / 2 - t / 2), h / 2, -d / 2 + t / 2, -0.08);                      // back legs, raked
        box(frame, t, t, d, sx * (w / 2 - t / 2), seatH + 0.22, 0);                                    // arms
        box(frame, t, 0.22, t, sx * (w / 2 - t / 2), seatH + 0.11, d / 2 - t / 2);                     // arm posts
      }
      slatTop(w - 0.02, d - 0.02, seatH, 0.025, 0.01, 'x');
      for (let i = 0; i < 3; i++) box(frame, w - 0.06, 0.06, 0.02, 0, seatH + 0.15 + i * 0.13, -d / 2 + 0.02 + i * 0.012, -0.12);
      pad(w - 0.08, 0.06, d - 0.08, 0, seatH + 0.03, 0.01);
      break;
    }
    case 'adirondack': {
      const armH = h * 0.62, seatF = h * 0.4, seatB = h * 0.3, t = 0.022;
      for (const sx of [-1, 1]) {
        box(frame, 0.05, armH, 0.08, sx * (w / 2 - 0.08), armH / 2, d / 2 - 0.12);                     // front legs
        box(frame, 0.15, t, d * 0.95, sx * (w / 2 - 0.07), armH, 0.02);                                 // wide flat arms
        box(frame, 0.05, 0.08, d * 0.85, sx * (w / 2 - 0.13), (seatF + seatB) / 2 - 0.05, 0, Math.atan2(seatF - seatB, d * 0.85));  // seat rails
      }
      const n = 6;
      for (let i = 0; i < n; i++) { const f = i / (n - 1), z = d / 2 - 0.12 - f * (d * 0.6), y = seatF - f * (seatF - seatB); box(frame, w - 0.24, t, 0.075, 0, y, z); }
      // the fan back, leaning back
      const backN = 7, lean = 0.35, len = h - seatB + 0.05;
      for (let i = 0; i < backN; i++) {
        const f = i / (backN - 1) - 0.5, slatW = (w - 0.3) / backN - 0.012;
        box(frame, slatW, len, t, f * (w - 0.3) * 1.05, seatB + len / 2 * Math.cos(lean) - 0.03, -d / 2 + 0.2 - len / 2 * Math.sin(lean), -lean, 0, -f * 0.25);
      }
      break;
    }
    case 'chaise': {
      const bedH = 0.32, backLen = Math.min(0.8, d * 0.38), flat = d - backLen * 0.75;
      legs(w / 2 - 0.05, d / 2 - 0.08, bedH - 0.04, 0.05);
      for (const sx of [-1, 1]) box(frame, 0.04, 0.08, d - 0.05, sx * (w / 2 - 0.02), bedH - 0.04, 0);
      slatTop(w - 0.04, flat, bedH, 0.025, 0.012, 'x');
      pad(w - 0.06, 0.08, flat - 0.04, 0, bedH + 0.04, d / 2 - flat / 2);
      // backrest raised toward the head
      const a = Math.atan2(h - bedH, backLen) , zc = -d / 2 + backLen / 2, yc = bedH + (h - bedH) / 2;
      box(frame, w - 0.04, 0.03, Math.hypot(backLen, h - bedH), 0, yc, zc, a);
      pad(w - 0.06, 0.08, Math.hypot(backLen, h - bedH) - 0.04, 0, yc + 0.04 * Math.cos(a), zc + 0.04 * Math.sin(a), a);
      break;
    }
    case 'osofa': {
      const seats = opts.seats || Math.max(1, Math.round((w - 0.3) / 0.65)), arm = 0.14, baseH = 0.3, back = 0.14;
      box(frame, w, baseH, d, 0, baseH / 2, 0);
      for (const sx of [-1, 1]) box(frame, arm, h * 0.75, d, sx * (w / 2 - arm / 2), h * 0.375, 0);
      box(frame, w - 2 * arm, h, back, 0, h / 2, -d / 2 + back / 2);
      const inner = w - 2 * arm, cw = inner / seats;
      for (let i = 0; i < seats; i++) {
        const x = -inner / 2 + cw * (i + 0.5);
        pad(cw - 0.015, 0.14, d - back - 0.02, x, baseH + 0.07, back / 2);
        pad(cw - 0.03, h - baseH - 0.12, 0.15, x, baseH + 0.14 + (h - baseH - 0.12) / 2, -d / 2 + back + 0.08, -0.12);
      }
      break;
    }
    case 'ctable': {
      slatTop(w, d, h, 0.03);
      legs(w / 2 - 0.05, d / 2 - 0.05, h - 0.03, 0.05);
      if (h > 0.3 && w > 0.6) slatTop(w - 0.14, d - 0.14, 0.12, 0.02);   // lower shelf
      break;
    }
    case 'firetable': {
      const stone = M(color, { map: grainTex(), roughness: 0.9 });
      const g = new RoundedBoxGeometry(pos0(w), pos0(h), pos0(d), 2, 0.02); g.translate(0, h / 2, 0); put(stone, g);
      const tray = M(0x24262a, { roughness: 0.5 }), glass = M(0x2c4a63, { roughness: 0.15, metalness: 0.2 });
      box(tray, w * 0.55, 0.02, d * 0.4, 0, h + 0.005, 0);
      for (let i = 0; i < 60; i++) box(glass, 0.025, 0.02, 0.025, (rand() - 0.5) * w * 0.5, h + 0.02, (rand() - 0.5) * d * 0.35, 0, rand() * 3);
      const flame = M(0xff8a2a, { emissive: 0xff6a10, emissiveIntensity: 1.4, transparent: true, opacity: 0.85, roughness: 1 });
      for (let i = 0; i < 9; i++) { const c = new THREE.ConeGeometry(0.035 + rand() * 0.02, 0.12 + rand() * 0.1, 7); c.translate((i / 8 - 0.5) * w * 0.45, h + 0.09, (rand() - 0.5) * d * 0.15); put(flame, c); }
      break;
    }
    case 'bench': {
      const seatH = Math.min(0.46, h * 0.55);
      slatTop(w, d * (opts.back ? 0.75 : 1), seatH, 0.03, 0.012, 'x');
      for (const sx of [-1, 1]) {
        box(frame, 0.05, seatH, 0.05, sx * (w / 2 - 0.08), seatH / 2, d * (opts.back ? 0.3 : 0.5) - 0.05);
        box(frame, 0.05, opts.back ? h : seatH, 0.05, sx * (w / 2 - 0.08), (opts.back ? h : seatH) / 2, -d / 2 + 0.04, opts.back ? -0.1 : 0);
        box(frame, 0.04, 0.05, d * 0.7, sx * (w / 2 - 0.08), seatH - 0.08, -d * 0.06);
      }
      if (opts.back) for (let i = 0; i < 3; i++) box(frame, w - 0.06, 0.07, 0.02, 0, seatH + 0.14 + i * 0.12, -d / 2 + 0.035 + i * 0.012, -0.1);
      break;
    }
    case 'umbrella': {
      const pole = M(opts.pole ?? 0x6b5a46, { roughness: 0.5, metalness: 0.3 }), fabric = M(color, { roughness: 0.95, side: THREE.DoubleSide });
      cyl(M(0x2b2b2d, { roughness: 0.6 }), Math.min(0.28, w * 0.12), Math.min(0.24, w * 0.1), 0.06, 0, 0, 0, 20);   // base
      cyl(pole, 0.022, 0.022, h - 0.05, 0, 0, 0, 10);
      const R = Math.min(w, d) / 2, rise = Math.min(0.5, R * 0.35);
      const canopy = new THREE.ConeGeometry(R, rise, 8, 1, true); canopy.translate(0, h - rise / 2 - 0.1, 0); put(fabric, canopy);
      const vent = new THREE.ConeGeometry(0.16, 0.1, 8, 1, true); vent.translate(0, h - 0.02, 0); put(fabric, vent);
      for (let i = 0; i < 8; i++) {   // ribs along the underside of the canopy, from the hub out to the rim
        const a = (i / 8) * Math.PI * 2, top = new THREE.Vector3(0, h - 0.1 - 0.03, 0), rim = new THREE.Vector3(Math.cos(a) * R * 0.97, h - 0.1 - rise - 0.02, Math.sin(a) * R * 0.97);
        const dir = rim.clone().sub(top), len = dir.length(), g = new THREE.BoxGeometry(0.012, len, 0.012);
        g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())); g.translate(top.x, top.y, top.z);
        put(pole, g);
      }
      break;
    }
    case 'grill': {
      const body = M(color, { roughness: 0.35, metalness: 0.6 }), dark = M(0x1e1f22, { roughness: 0.6, metalness: 0.3 }), bw = w * 0.55;
      box(body, bw, 0.32, d, 0, h * 0.62, 0);                                                         // firebox
      const lid = new THREE.CylinderGeometry(d / 2, d / 2, bw, 20, 1, false, 0, Math.PI); lid.rotateZ(Math.PI / 2); lid.rotateX(Math.PI / 2); lid.translate(0, h * 0.62 + 0.16, 0); put(body, lid);
      box(dark, bw * 0.8, 0.025, 0.025, 0, h * 0.62 + 0.16 + d * 0.3, d / 2 + 0.05);                     // handle
      for (const sx of [-1, 1]) box(dark, (w - bw) / 2 - 0.02, 0.025, d * 0.9, sx * (bw / 2 + (w - bw) / 4), h * 0.62 + 0.14, 0);   // side shelves
      box(body, bw, h * 0.62 - 0.16 - 0.08, d * 0.9, 0, (h * 0.62 - 0.16) / 2 + 0.04, 0);                // cabinet
      for (let i = 0; i < 4; i++) box(dark, 0.04, 0.04, 0.03, -bw / 2 + 0.1 + i * (bw - 0.2) / 3, h * 0.62 - 0.05, d / 2 + 0.015);   // knobs
      legs(bw / 2 - 0.04, d / 2 - 0.05, 0.08, 0.05);
      break;
    }
    case 'planter': {
      const potH = opts.plant ? h * 0.45 : h, R = Math.min(w, d) / 2;
      const pot = M(color, { roughness: 0.85 }), soil = M(0x3a2b20, { roughness: 1 });
      if (opts.square) { box(pot, w, potH, d, 0, potH / 2, 0); box(soil, w * 0.9, 0.01, d * 0.9, 0, potH - 0.03, 0); }
      else {
        const g = new THREE.CylinderGeometry(R, R * 0.78, pos0(potH), 28); g.translate(0, potH / 2, 0); put(pot, g);
        const rim = new THREE.TorusGeometry(R * 0.98, 0.022, 8, 28); rim.rotateX(Math.PI / 2); rim.translate(0, potH, 0); put(pot, rim);
        const so = new THREE.CylinderGeometry(R * 0.93, R * 0.93, 0.01, 24); so.translate(0, potH - 0.03, 0); put(soil, so);
      }
      if (opts.plant) {
        const p = buildPlant('globe', {}, w * 0.95, d * 0.95, h - potH + 0.05, 0x2f5a30, seed);
        p.group.position.y = potH - 0.05; group.add(p.group); mats.push(...p.mats);
      }
      break;
    }
  }
  for (const [mat, list] of geos) { const m = new THREE.Mesh(merge(list), mat); group.add(m); }
  return { group, mats };
}

export function buildModel(kind, opts, w, d, h, color, seed = 1) {
  if (PLANT_KINDS.has(kind)) return buildPlant(kind, opts, w, d, h, color, seed);
  if (FURNITURE_KINDS.has(kind)) return buildFurniture(kind, opts, w, d, h, color, seed);
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
    // ---- structures: w × d is the outside of the roof / top, h the very top ----
    case 'pergola': {
      const wood = opts.wood ? M(new THREE.Color(color).multiplyScalar(1.15), { roughness: 0.78, map: woodTex() }) : M(color, { roughness: 0.55 }), geos = [];
      const bx = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(pos0(sx), pos0(sy), pos0(sz)); boardUV(b, sx, sy, sz, rand()); b.translate(x, y, z); geos.push(b); };
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
        // from the post's face, about 18" below the beam, up and out to the underside of the beam
        const drop = Math.min(0.45, postH * 0.3), reach = drop * 0.95;
        const x0 = x + sx * (P / 2), y0 = postH - drop, x1 = x0 + sx * reach, y1 = postH;
        const len = Math.hypot(x1 - x0, y1 - y0) + 0.08;   // a little extra so the ends tuck into the post and beam
        const b = new THREE.BoxGeometry(0.09, len, 0.09);
        boardUV(b, 0.09, len, 0.09, rand());
        b.rotateZ(-Math.atan2(x1 - x0, y1 - y0));        // tilt the board's length onto the post→beam line
        b.translate((x0 + x1) / 2, (y0 + y1) / 2, sz * pz); geos.push(b);
      }
      add(merge(geos), wood);
      break;
    }
    case 'pavilion': {
      const wood = opts.wood ? M(new THREE.Color(color).multiplyScalar(1.15), { roughness: 0.78, map: woodTex() }) : M(color, { roughness: 0.55 });
      const roofM = M(opts.roofColor ?? 0x4a4c50, { roughness: 0.92, side: THREE.DoubleSide, flatShading: true });
      const geos = [];
      const bx = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(pos0(sx), pos0(sy), pos0(sz)); boardUV(b, sx, sy, sz, rand()); b.translate(x, y, z); geos.push(b); };
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
    // ---- shed & garage: w × d is the roof's outside, h the ridge. Ridge along the long side, gable ends on the narrow
    // sides; a shed has double doors on one gable end, a garage an (open) roll-up door there ----
    case 'shed':
    case 'garage': {
      const garage = kind === 'garage', L = Math.max(w, d), S = Math.min(w, d);
      const oh = Math.min(0.3, S * 0.06), t = 0.12;                    // roof overhang, wall thickness
      const Lw = L - 2 * oh, Sw = S - 2 * oh;                          // walls' outside
      const pitch = garage ? 5 / 12 : 6 / 12;
      const rise = Math.min((S / 2) * pitch, h * 0.45), run = S / 2, th = 0.07, k = rise / run;
      const eave = Math.max(1.8, h - th - k * (Sw / 2));                // walls reach up to the underside of the roof
      const floorY = garage ? 0.08 : 0.18;                             // slab, or a raised shed floor
      const light = new THREE.Color(color).getHSL({}).l > 0.75;
      const sidingM = M(opts.wood ? new THREE.Color(color).multiplyScalar(1.1) : color, { roughness: 0.8, map: opts.wood ? woodTex() : sidingTex() });
      const trimM = M(light ? 0x5a5f66 : 0xf2f1ec, { roughness: 0.6 });
      const roofM = M(opts.roofColor ?? 0x3c3e42, { roughness: 0.95, map: grainTex() });
      const glassM = M(0x2a3a48, { roughness: 0.15, metalness: 0.4 });
      const darkM = M(0x1d1f22, { roughness: 1 });
      const doorM = M(garage ? 0xe9e7e1 : new THREE.Color(color).multiplyScalar(0.85), { roughness: 0.7, map: opts.wood ? woodTex() : null });
      const concreteM = M(0x9c9a94, { roughness: 1, map: grainTex() });
      const sidingG = [], trimG = [], roofG = [];
      const box = (list, sx, sy, sz, x, y, z, uv = sidingUV) => { const b = new THREE.BoxGeometry(pos0(sx), pos0(sy), pos0(sz)); b.translate(x, y, z); uv(b); list.push(b); return b; };
      const hx = Lw / 2, hz = Sw / 2;
      // floor
      add(new THREE.BoxGeometry(Lw, floorY, Sw).translate(0, floorY / 2, 0), concreteM);
      // long walls, with a window (shed) or a window and a side door (garage)
      const wallH = eave - floorY, wy = floorY + wallH / 2;
      const opening = (zSide, list, cuts) => {
        // a wall along x at z = zSide with rectangular cut-outs [{x, w, y0, y1}], built from pieces around them
        let x0 = -hx;
        const cs = cuts.slice().sort((a, b) => a.x - b.x);
        for (const c of cs) {
          const a = c.x - c.w / 2, b = c.x + c.w / 2;
          if (a > x0) box(list, a - x0, wallH, t, (x0 + a) / 2, wy, zSide);
          if (c.y0 > floorY) box(list, c.w, c.y0 - floorY, t, c.x, (floorY + c.y0) / 2, zSide);
          if (c.y1 < eave) box(list, c.w, eave - c.y1, t, c.x, (c.y1 + eave) / 2, zSide);
          // trim around the opening
          box(trimG, c.w + 0.12, 0.07, t + 0.03, c.x, c.y1 + 0.035, zSide, boardUVq);
          if (c.y0 > floorY + 0.05) box(trimG, c.w + 0.12, 0.05, t + 0.06, c.x, c.y0 - 0.025, zSide, boardUVq);
          for (const sx of [-1, 1]) box(trimG, 0.06, c.y1 - c.y0, t + 0.03, c.x + sx * (c.w / 2 + 0.03), (c.y0 + c.y1) / 2, zSide, boardUVq);
          x0 = b;
        }
        if (hx > x0) box(list, hx - x0, wallH, t, (x0 + hx) / 2, wy, zSide);
      };
      const winW = 0.9, winY0 = floorY + 1.0, winY1 = Math.min(eave - 0.25, floorY + 2.0);
      const cutsFront = [{ x: -Lw * 0.18, w: winW, y0: winY0, y1: winY1 }];
      if (garage) cutsFront.push({ x: Lw * 0.22, w: 0.9, y0: floorY, y1: Math.min(eave - 0.2, floorY + 2.03), door: true });
      const cutsBack = garage && Lw > 7 ? [{ x: 0, w: winW, y0: winY0, y1: winY1 }] : [];
      for (const [zs, cuts] of [[hz - t / 2, cutsFront], [-(hz - t / 2), cutsBack]]) {
        opening(zs, sidingG, cuts);
        for (const c of cuts) {
          if (c.door) add(new THREE.BoxGeometry(c.w - 0.02, c.y1 - c.y0 - 0.02, 0.05).translate(c.x, (c.y0 + c.y1) / 2, zs), doorM);
          else {
            add(new THREE.BoxGeometry(c.w, c.y1 - c.y0, 0.02).translate(c.x, (c.y0 + c.y1) / 2, zs), glassM);
            box(trimG, 0.04, c.y1 - c.y0, 0.05, c.x, (c.y0 + c.y1) / 2, zs, boardUVq);   // mullion
          }
        }
      }
      // gable ends: the back one solid, the front one with the doors
      const endW = Sw - 2 * t;
      const gableTri = (xSide) => {
        const g = new THREE.BufferGeometry(), yt = h - th;
        const v = [xSide, eave, -hz, xSide, eave, hz, xSide, Math.min(h - 0.05, yt), 0];
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([-hz / 1.2, eave / 1.2, hz / 1.2, eave / 1.2, 0, yt / 1.2], 2));
        g.computeVertexNormals();
        return g;
      };
      for (const sx of [-1, 1]) { const g = gableTri(sx * hx); add(g, M(opts.wood ? new THREE.Color(color).multiplyScalar(1.1) : color, { roughness: 0.8, side: THREE.DoubleSide, map: opts.wood ? woodTex() : sidingTex() })); }
      box(sidingG, t, wallH, endW, -(hx - t / 2), wy, 0);   // back wall
      const fx = hx - t / 2;
      let doorW, doorH;
      if (garage) { doorW = Math.min(endW - 0.7, endW > 6.2 ? 4.88 : 2.74); doorH = Math.min(2.13, eave - floorY - 0.35); }
      else { doorW = Math.min(endW - 0.5, 1.5); doorH = Math.min(1.95, eave - floorY - 0.2); }
      const sidePier = (endW - doorW) / 2;
      for (const sz of [-1, 1]) box(sidingG, t, wallH, sidePier, fx, wy, sz * (doorW / 2 + sidePier / 2));
      box(sidingG, t, eave - floorY - doorH, doorW, fx, floorY + doorH + (eave - floorY - doorH) / 2, 0);
      // door trim
      box(trimG, t + 0.04, 0.09, doorW + 0.18, fx, floorY + doorH + 0.045, 0, boardUVq);
      for (const sz of [-1, 1]) box(trimG, t + 0.04, doorH, 0.09, fx, floorY + doorH / 2, sz * (doorW / 2 + 0.045), boardUVq);
      if (garage) {
        // open roll-up door: the curtain is wound onto a drum in a housing just inside, above the opening
        const r = 0.2, cy = floorY + doorH + r + 0.04, cx = fx - t / 2 - r - 0.06;
        add(new THREE.CylinderGeometry(r, r, doorW + 0.1, 20).rotateX(Math.PI / 2).translate(cx, cy, 0), doorM);
        add(new THREE.BoxGeometry(2 * r + 0.1, 0.04, doorW + 0.2).translate(cx, cy + r + 0.05, 0), trimM);   // hood
        // a hand's width of curtain still hanging out of the coil, and the bottom bar
        add(new THREE.BoxGeometry(0.03, 0.14, doorW).translate(fx - t / 2 - 0.03, floorY + doorH - 0.07, 0), doorM);
        add(new THREE.BoxGeometry(0.06, 0.04, doorW).translate(fx - t / 2 - 0.03, floorY + doorH - 0.15, 0), M(0x777b80, { metalness: 0.5, roughness: 0.4 }));
        // guide rails each side of the opening
        for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.06, doorH, 0.08).translate(fx - t / 2 - 0.03, floorY + doorH / 2, sz * (doorW / 2 + 0.04)), M(0x777b80, { metalness: 0.5, roughness: 0.4 }));
        // the inside reads as a garage: darker back wall and an apron in front of the door
        add(new THREE.BoxGeometry(0.02, wallH * 0.98, endW * 0.98).translate(-(hx - t - 0.011), wy, 0), darkM);
        add(new THREE.BoxGeometry(0.9, 0.06, doorW + 0.6).translate(hx + 0.45, 0.03, 0), concreteM);
      } else {
        // closed double doors with trim and handles
        for (const sz of [-1, 1]) {
          add(new THREE.BoxGeometry(0.05, doorH - 0.02, doorW / 2 - 0.02).translate(fx + 0.01, floorY + doorH / 2, sz * doorW / 4), doorM);
          // a diagonal brace across each leaf, and rails top and bottom
          const len = Math.hypot(doorH - 0.3, doorW / 2 - 0.16), brace = new THREE.BoxGeometry(0.03, len, 0.09);
          brace.rotateX(sz * Math.atan2(doorW / 2 - 0.16, doorH - 0.3)).translate(fx + 0.05, floorY + doorH / 2, sz * doorW / 4);
          trimG.push(brace);
          for (const yy of [0.15, doorH - 0.15]) trimG.push(new THREE.BoxGeometry(0.03, 0.1, doorW / 2 - 0.06).translate(fx + 0.05, floorY + yy, sz * doorW / 4));
          add(new THREE.BoxGeometry(0.04, 0.16, 0.03).translate(fx + 0.06, floorY + doorH * 0.5, sz * 0.06), M(0x222222, { metalness: 0.6, roughness: 0.4 }));
        }
        box(trimG, 0.12, 0.08, endW + 0.06, fx + 0.03, floorY + 0.04, 0, boardUVq);   // threshold
        // a ramp up to the raised floor
        add(new THREE.BoxGeometry(0.5, 0.05, doorW).rotateZ(-0.33).translate(hx + 0.24, floorY / 2, 0), concreteM);
      }
      // corner boards and fascia
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(trimG, 0.1, wallH, 0.1, sx * (hx - 0.03), wy, sz * (hz - 0.03), boardUVq);
      // roof: two slopes from the eaves (with overhang) up to the ridge, plus a ridge cap
      const slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
      for (const sz of [-1, 1]) {
        const b = new THREE.BoxGeometry(L, th, slope + 0.04);
        const uvs = b.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * L / 1.5, uvs.getY(i) * slope / 1.5);
        b.rotateX(sz * ang).translate(0, h - rise / 2 - th / 2, sz * run / 2);
        roofG.push(b);
      }
      add(merge(roofG), roofM);
      add(new THREE.BoxGeometry(L, 0.06, 0.2).translate(0, h - 0.01, 0), roofM);
      for (const sz of [-1, 1]) box(trimG, L, 0.16, 0.04, 0, h - rise - 0.08 - th, sz * (S / 2 - 0.02), boardUVq);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // rake boards along the gable edges
        const b = new THREE.BoxGeometry(0.04, 0.16, slope);
        b.rotateX(sz * ang).translate(sx * (L / 2 - 0.02), h - rise / 2 - th - 0.06, sz * run / 2);
        trimG.push(b);
      }
      add(merge(sidingG.filter(g => g.attributes.position.count)), sidingM);
      add(merge(trimG), trimM);
      if (w < d) g.children.forEach(c => { c.geometry.rotateY(Math.PI / 2); });
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
  // water: t = height of the coping / edge above ground, depth = inches below ground
  { id: 'pool',    name: 'Swimming pool',           S: 24, t: 2, color: 'Light gray', water: 'pool', depth: 60 },
  { id: 'pond',    name: 'Pond',                    S: 24, t: 2, color: 'Granite', water: 'pond', depth: 24 },
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
// holes: other outlines ([[x, z], …] in the same frame) cut out of this surface, e.g. a pool inside a lawn
export function buildSurface(pts, thickness, surf, color, holes = [], seed = 1) {
  if (surf.water) return buildWater(pts, thickness, surf, color, seed);
  const group = new THREE.Group();
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: pos0(thickness), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const top = new THREE.MeshStandardMaterial({ map: surfaceTex(surf, color), roughness: surf.id === 'concrete' ? 0.8 : 0.95 });
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(surf.loose || surf.sod ? 0.45 : 0.75), roughness: 0.95, map: surf.loose || surf.sod ? null : grainTex() });
  const mesh = new THREE.Mesh(geo, [top, side]);
  group.add(mesh);
  return { group, mats: [top, side], pickables: [mesh] };
}

// ---------- pools and ponds ----------
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
// push an outline outward (+w) or inward (−w) by w meters, mitering the corners
function offsetOutline(p, w) {
  const s = signedArea(p) > 0 ? 1 : -1, n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = p[(i - 1 + n) % n], [bx, bz] = p[i], [cx, cz] = p[(i + 1) % n];
    const e1 = [bx - ax, bz - az], e2 = [cx - bx, cz - bz], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1 * s, e1[0] / l1 * s], n2 = [-e2[1] / l2 * s, e2[0] / l2 * s];
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = w / Math.max(0.35, mx * n1[0] + mz * n1[1]);
    out.push([bx - mx * k, bz - mz * k]);
  }
  return out;
}
function waterMat(pond) {
  return new THREE.MeshStandardMaterial({ color: pond ? 0x2f5a52 : 0x3aa6d8, transparent: true, opacity: pond ? 0.78 : 0.5,
    roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
}
// pts: the water's edge ([x, z] in the area's frame). Pools: stone coping and clear water (the height control sets the coping thickness).
// Ponds: a sloping natural dish, dark water, a ring of half-buried boulders and a few lily pads.
function buildWater(pts, thickness, surf, color, seed) {
  const group = new THREE.Group(), mats = [], pickables = [];
  const depth = surf.depth * INCH, pond = surf.water === 'pond', rand = rng(seed * 17 + 3);
  const shape = (p, y) => { const g = new THREE.ShapeGeometry(new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)))); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };
  const add = (geo, mat, pick = false) => { const m = new THREE.Mesh(geo, mat); group.add(m); if (!mats.includes(mat)) mats.push(mat); if (pick) pickables.push(m); return m; };
  if (!pond) {
    // coping: a stone band around the edge
    const cs = new THREE.Shape(offsetOutline(pts, 0.3).map(([x, z]) => new THREE.Vector2(x, -z)));
    cs.holes.push(new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
    const cg = new THREE.ExtrudeGeometry(cs, { depth: pos0(thickness), bevelEnabled: false }); cg.rotateX(-Math.PI / 2);
    add(cg, new THREE.MeshStandardMaterial({ color, map: grainTex(), roughness: 0.85 }), true);
    // no walls or floor below ground: just the coping and the water, which sits a little under the coping top
    add(shape(pts, Math.max(-0.03, thickness - 0.05)), waterMat(false), true);
  } else {
    // dish: rings shrinking toward the middle, getting deeper with a soft curve
    let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
    const rings = 5, P = [];
    const ring = (k) => pts.map(([x, z]) => { const f = 1 - k / rings; return [cx + (x - cx) * f, -0.03 - depth * Math.sin((k / rings) * Math.PI / 2), cz + (z - cz) * f]; });
    for (let k = 0; k < rings; k++) {
      const a = ring(k), b = ring(k + 1);
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        P.push(...a[i], ...b[i], ...b[j], ...a[i], ...b[j], ...a[j]);
      }
    }
    const dish = new THREE.BufferGeometry(); dish.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); dish.computeVertexNormals();
    add(dish, new THREE.MeshStandardMaterial({ color: 0x3b3326, roughness: 1, side: THREE.DoubleSide }));
    add(shape(pts, -0.05), waterMat(true), true);
    // edge boulders, half buried, all the way around
    const rock = blobGeo(seed % 11 + 2, { rough: 0.3, detail: 2, flatBelow: -0.5, colorVar: 0.22 });
    rock.computeBoundingBox(); const bb = rock.boundingBox;
    rock.translate(0, -(bb.min.y + bb.max.y) / 2, 0); rock.scale(1 / (bb.max.x - bb.min.x), 1 / (bb.max.y - bb.min.y), 1 / (bb.max.z - bb.min.z));
    const spots = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
      for (let u = rand() * 0.2; u < len; u += 0.32 + rand() * 0.22) spots.push([ax + (bx - ax) * u / len, az + (bz - az) * u / len]);
    }
    const im = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, flatShading: true, vertexColors: true }), Math.max(1, spots.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), base = new THREE.Color(color), tc = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const s = 0.28 + rand() * 0.3;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      m4.compose(new THREE.Vector3(x, s * 0.18, z), q, new THREE.Vector3(s * (1 + rand() * 0.5), s * 0.75, s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, tc.copy(base).multiplyScalar(0.8 + rand() * 0.35));
    });
    im.count = spots.length;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im); mats.push(im.material); pickables.push(im);
    // a few lily pads
    const area = Math.abs(signedArea(pts)), padM = new THREE.MeshStandardMaterial({ color: 0x4f7d35, roughness: 0.6, side: THREE.DoubleSide });
    const padGeo = new THREE.CircleGeometry(1, 16, 0.3, Math.PI * 2 - 0.3); padGeo.rotateX(-Math.PI / 2);
    for (let i = 0, n = Math.min(14, Math.round(area * 0.8)); i < n; i++) {
      const k = 0.15 + rand() * 0.55, [px, pz] = pts[Math.floor(rand() * pts.length)];
      const pad = add(padGeo, padM);
      pad.position.set(cx + (px - cx) * k, -0.045, cz + (pz - cz) * k); pad.scale.setScalar(0.1 + rand() * 0.08); pad.rotation.y = rand() * 6;
    }
  }
  return { group, mats, pickables };
}

// soil inside a raised bed
export function soilMat() { return new THREE.MeshStandardMaterial({ color: SOIL, roughness: 1 }); }
