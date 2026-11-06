// Procedural furniture models for Wall Sketch.
// Every model is built in a local frame: x = width (centered), z = depth (back at -z, front at +z),
// y = up from the floor. They are rebuilt from (w, d, h) so they resize cleanly.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const WOOD_DARK = 0x4a3222;
const METAL = 0x9aa0a6;
const HANDLE = 0x2f3236;
const LINEN = 0xf3efe7;
const QUARTZ = 0xe9e7e2;

// preset name -> [model kind, options]
export const MODEL_FOR = {
  'Sofa': ['sofa', { seats: 3 }],
  'Loveseat': ['sofa', { seats: 2 }],
  'Armchair': ['sofa', { seats: 1 }],
  'Coffee table': ['table', { shelf: true }],
  'End table': ['table', { shelf: true }],
  'Dining table': ['table', {}],
  'Dining chair': ['chair', {}],
  'TV stand': ['cabinet', { rows: 1, cols: 3, doors: true }],
  'Dresser': ['cabinet', { rows: 3, cols: 2 }],
  'Nightstand': ['cabinet', { rows: 2, cols: 1 }],
  'Bookcase': ['bookcase', {}],
  'Rug 8×5': ['rug', {}],
  'Kitchen island': ['island', {}],
  'Fridge': ['fridge', {}],
  'Queen bed': ['bed', {}],
  'King bed': ['bed', {}],
  'Twin bed': ['bed', {}],
  'Desk': ['desk', {}],
};

const clampPos = (v) => Math.max(v, 0.004);

function rbox(w, h, d, r = 0.03) {
  w = clampPos(w); h = clampPos(h); d = clampPos(d);
  const rad = Math.max(0.001, Math.min(r, Math.min(w, h, d) * 0.45));
  return new RoundedBoxGeometry(w, h, d, 3, rad);
}
const box = (w, h, d) => new THREE.BoxGeometry(clampPos(w), clampPos(h), clampPos(d));
const cyl = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, clampPos(h), 14);

// small deterministic random so bookshelves look the same every rebuild
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildModel(kind, opts, w, d, h, color) {
  const g = new THREE.Group();
  const mats = [];
  const M = (c, rough = 0.85, metal = 0) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
    mats.push(m);
    return m;
  };
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);

  switch (kind) {
    case 'sofa': {
      const fabric = M(color, 0.95), fabricDark = M(shade(color, 0.82), 0.95), wood = M(WOOD_DARK, 0.5);
      const legH = 0.07, arm = Math.min(0.2, w * 0.14), back = Math.min(0.2, d * 0.24);
      const baseH = Math.max(0.1, Math.min(0.22, h * 0.28));
      const seatTop = Math.min(h * 0.58, 0.5);
      const cushH = Math.max(0.06, seatTop - legH - baseH);
      const armH = Math.max(0.15, Math.min(h, seatTop + 0.2) - legH);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cyl(0.022, 0.016, legH), wood, sx * (w / 2 - 0.07), legH / 2, sz * (d / 2 - 0.07));
      add(rbox(w, baseH, d, 0.03), fabricDark, 0, legH + baseH / 2, 0);
      for (const sx of [-1, 1]) add(rbox(arm, armH, d, 0.06), fabric, sx * (w / 2 - arm / 2), legH + armH / 2, 0);
      const backH = Math.max(0.1, h - legH - baseH);
      add(rbox(w - 2 * arm + 0.02, backH, back, 0.05), fabricDark, 0, legH + baseH + backH / 2, -d / 2 + back / 2);
      const inner = Math.max(0.2, w - 2 * arm);
      const n = opts.seats || Math.max(1, Math.round(inner / 0.65));
      const cw = inner / n;
      const bcH = Math.max(0.1, (h - seatTop) * 0.78), bcD = Math.min(0.16, (d - back) * 0.3);
      const seatD = Math.max(0.1, d - back - bcD);
      for (let i = 0; i < n; i++) {
        const x = -inner / 2 + cw * (i + 0.5);
        add(rbox(cw - 0.014, cushH, seatD, 0.05), fabric, x, legH + baseH + cushH / 2, d / 2 - seatD / 2);
        add(rbox(cw - 0.02, bcH, bcD, 0.06), fabric, x, legH + baseH + cushH + bcH / 2 - 0.01, -d / 2 + back + bcD / 2);
      }
      break;
    }
    case 'bed': {
      const fabric = M(color, 0.95), head = M(shade(color, 0.8), 0.95), wood = M(WOOD_DARK, 0.55), linen = M(LINEN, 0.95);
      const legH = 0.08, frameH = Math.max(0.08, h * 0.3), mattH = Math.max(0.1, h - legH - frameH);
      const top = legH + frameH + mattH;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.06, legH, 0.06), wood, sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05));
      add(rbox(w, frameH, d, 0.02), wood, 0, legH + frameH / 2, 0);
      add(rbox(w - 0.04, mattH, d - 0.08, 0.06), linen, 0, legH + frameH + mattH / 2, 0.02);
      // duvet over the front two-thirds, with a folded edge
      const duvD = (d - 0.08) * 0.66;
      add(rbox(w - 0.01, 0.05, duvD, 0.025), fabric, 0, top + 0.015, d / 2 - 0.04 - duvD / 2 + 0.02);
      add(rbox(w - 0.01, 0.06, 0.14, 0.03), fabric, 0, top + 0.03, d / 2 - 0.04 - duvD + 0.08);
      // pillows
      const np = w > 1.7 ? 3 : w > 1.2 ? 2 : 1;
      const pw = Math.min(0.68, (w - 0.12) / np - 0.03);
      for (let i = 0; i < np; i++) {
        const x = -((np - 1) * (pw + 0.03)) / 2 + i * (pw + 0.03);
        add(rbox(pw, 0.12, 0.38, 0.06), linen, x, top + 0.06, -d / 2 + 0.1 + 0.19);
      }
      // headboard rises above the mattress
      const hbH = h + 0.55;
      add(rbox(w + 0.04, hbH, 0.07, 0.03), head, 0, hbH / 2, -d / 2 + 0.035);
      break;
    }
    case 'table': {
      const top = M(color, 0.55), legM = M(shade(color, 0.7), 0.6);
      const topT = Math.min(0.04, h * 0.15), leg = Math.max(0.03, Math.min(0.06, Math.min(w, d) * 0.12)), inset = leg * 0.6;
      add(rbox(w, topT, d, 0.008), top, 0, h - topT / 2, 0);
      const lx = w / 2 - inset - leg / 2, lz = d / 2 - inset - leg / 2, legH = h - topT;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(leg, legH, leg), legM, sx * lx, legH / 2, sz * lz);
      if (h > 0.5) {   // apron under the top
        add(box(2 * lx, 0.07, 0.02), legM, 0, h - topT - 0.035, lz);
        add(box(2 * lx, 0.07, 0.02), legM, 0, h - topT - 0.035, -lz);
        add(box(0.02, 0.07, 2 * lz), legM, lx, h - topT - 0.035, 0);
        add(box(0.02, 0.07, 2 * lz), legM, -lx, h - topT - 0.035, 0);
      }
      if (opts.shelf) add(box(2 * lx, 0.02, 2 * lz), top, 0, Math.max(0.06, h * 0.22), 0);
      break;
    }
    case 'chair': {
      const wood = M(color, 0.55), seatM = M(shade(color, 0.85), 0.9);
      const seatH = Math.min(0.46, h * 0.5), leg = 0.035;
      const lx = w / 2 - leg / 2 - 0.01, lz = d / 2 - leg / 2 - 0.01;
      for (const sx of [-1, 1]) add(box(leg, seatH, leg), wood, sx * lx, seatH / 2, lz);           // front legs
      for (const sx of [-1, 1]) add(box(leg, h, leg), wood, sx * lx, h / 2, -lz);                   // back legs go up as posts
      add(rbox(w, 0.05, d, 0.015), seatM, 0, seatH, 0);
      const backH = Math.max(0.08, (h - seatH) * 0.4);
      add(rbox(w - 0.02, backH, 0.025, 0.01), wood, 0, h - backH / 2 - 0.02, -lz);
      add(box(w - 0.06, 0.03, 0.02), wood, 0, seatH + (h - seatH) * 0.35, -lz);
      break;
    }
    case 'cabinet': {
      const body = M(color, 0.6), front = M(shade(color, 1.06), 0.55), metal = M(METAL, 0.35, 0.7), wood = M(WOOD_DARK, 0.5);
      const legH = 0.06, bodyH = Math.max(0.05, h - legH);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.04, legH, 0.04), wood, sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05));
      add(rbox(w, bodyH, d, 0.01), body, 0, legH + bodyH / 2, 0);
      const rows = opts.rows || 2, cols = opts.cols || 1, gap = 0.012;
      const fw = (w - 0.04) / cols, fh = (bodyH - 0.04) / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 0.02 + fw * (c + 0.5), y = legH + 0.02 + fh * (r + 0.5);
        add(box(fw - gap, fh - gap, 0.018), front, x, y, d / 2 + 0.008);
        if (opts.doors) add(box(0.015, Math.min(0.12, fh * 0.4), 0.02), metal, x + (c % 2 ? -1 : 1) * (fw / 2 - 0.04), y, d / 2 + 0.025);
        else add(box(Math.min(0.14, fw * 0.32), 0.016, 0.02), metal, x, y + fh * 0.18, d / 2 + 0.025);
      }
      break;
    }
    case 'bookcase': {
      const wood = M(color, 0.6), back = M(shade(color, 0.8), 0.7);
      const t = 0.02;
      add(box(t, h, d), wood, -w / 2 + t / 2, h / 2, 0);
      add(box(t, h, d), wood, w / 2 - t / 2, h / 2, 0);
      add(box(w, t, d), wood, 0, h - t / 2, 0);
      add(box(w, 0.06, d), wood, 0, 0.03, 0);
      add(box(w - 2 * t, h - 0.08, 0.008), back, 0, h / 2, -d / 2 + 0.004);
      const n = Math.max(2, Math.round(h / 0.34));
      const gapH = (h - 0.06 - t) / n;
      const rand = rng(Math.round(w * 1000 + h * 7));
      const bookColors = [0x7a2e2e, 0x2e4a7a, 0x3e6b4a, 0xc9a36b, 0x5b4a7a, 0xd8d0c0, 0x2f2f2f, 0xa05a2c];
      const bookMats = bookColors.map(c => M(c, 0.8));
      for (let i = 0; i < n; i++) {
        const y0 = 0.06 + gapH * i;
        if (i > 0) add(box(w - 2 * t, t, d - 0.01), wood, 0, y0, 0.005);
        // a row of books on most shelves
        if (rand() < 0.8) {
          let x = -w / 2 + t + 0.01 + rand() * 0.08;
          const end = w / 2 - t - 0.02 - rand() * 0.15;
          while (x < end) {
            const bw = 0.018 + rand() * 0.03, bh = Math.min(gapH - 0.04, 0.16 + rand() * 0.12);
            if (bh < 0.05) break;
            add(box(bw, bh, Math.min(d - 0.04, 0.16 + rand() * 0.05)), bookMats[Math.floor(rand() * bookMats.length)], x + bw / 2, y0 + t / 2 + bh / 2, 0.01);
            x += bw + 0.002;
          }
        }
      }
      break;
    }
    case 'rug': {
      const inner = M(color, 1), border = M(shade(color, 0.6), 1);
      const t = Math.max(0.008, h);
      add(box(w, t, d), border, 0, t / 2, 0);
      add(box(Math.max(0.05, w - 0.16), t + 0.002, Math.max(0.05, d - 0.16)), inner, 0, t / 2 + 0.001, 0);
      break;
    }
    case 'fridge': {
      const body = M(color, 0.3, 0.55), door = M(shade(color, 1.04), 0.28, 0.55), handle = M(HANDLE, 0.4, 0.6);
      add(rbox(w, h, d - 0.04, 0.02), body, 0, h / 2, -0.02);
      const split = h * 0.32;
      const dw = (w - 0.02) / 2 - 0.004;
      for (const sx of [-1, 1]) {
        add(rbox(dw, h - split - 0.02, 0.04, 0.01), door, sx * (dw / 2 + 0.004), split + (h - split) / 2, d / 2 - 0.02);
        add(cyl(0.012, 0.012, Math.min(0.6, (h - split) * 0.5)), handle, sx * 0.04, split + (h - split) * 0.55, d / 2 + 0.03);
      }
      add(rbox(w - 0.02, split - 0.03, 0.04, 0.01), door, 0, split / 2, d / 2 - 0.02);
      const bar = add(cyl(0.012, 0.012, Math.min(0.6, w * 0.6)), handle, 0, split - 0.08, d / 2 + 0.03);
      bar.rotation.z = Math.PI / 2;
      break;
    }
    case 'island': {
      const base = M(color, 0.6), front = M(shade(color, 1.05), 0.55), top = M(QUARTZ, 0.3), toe = M(0x222222, 0.9), metal = M(METAL, 0.35, 0.7);
      const topT = 0.04, toeH = 0.1, overhang = Math.min(0.28, d * 0.28);
      const bd = Math.max(0.2, d - overhang), bh = Math.max(0.1, h - topT - toeH);
      add(box(w - 0.06, toeH, bd - 0.08), toe, 0, toeH / 2, -d / 2 + bd / 2);
      add(box(w - 0.02, bh, bd), base, 0, toeH + bh / 2, -d / 2 + bd / 2);
      add(rbox(w, topT, d, 0.006), top, 0, h - topT / 2, 0);
      const cols = Math.max(2, Math.round(w / 0.55));
      const fw = (w - 0.04) / cols;
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 0.02 + fw * (c + 0.5);
        add(box(fw - 0.012, bh - 0.03, 0.018), front, x, toeH + bh / 2, -d / 2 - 0.006);
        add(box(Math.min(0.14, fw * 0.3), 0.016, 0.02), metal, x, toeH + bh - 0.08, -d / 2 - 0.02);
      }
      break;
    }
    case 'desk': {
      const top = M(color, 0.55), body = M(shade(color, 0.88), 0.6), metal = M(METAL, 0.35, 0.7);
      const topT = 0.035, legH = h - topT;
      add(rbox(w, topT, d, 0.006), top, 0, h - topT / 2, 0);
      const pedW = Math.min(0.42, w * 0.35);
      add(box(pedW, legH, d - 0.04), body, -w / 2 + pedW / 2 + 0.01, legH / 2, 0);
      const dh = (legH - 0.04) / 3;
      for (let r = 0; r < 3; r++) {
        const y = 0.02 + dh * (r + 0.5);
        add(box(pedW - 0.03, dh - 0.012, 0.018), top, -w / 2 + pedW / 2 + 0.01, y, d / 2 - 0.01);
        add(box(Math.min(0.12, pedW * 0.3), 0.014, 0.02), metal, -w / 2 + pedW / 2 + 0.01, y + dh * 0.2, d / 2 + 0.005);
      }
      for (const sz of [-1, 1]) add(box(0.05, legH, 0.05), body, w / 2 - 0.05, legH / 2, sz * (d / 2 - 0.05));
      add(box(w - pedW - 0.1, 0.05, 0.02), body, pedW / 2 - 0.02, h - topT - 0.025, -d / 2 + 0.04);
      break;
    }
    default: {
      add(box(w, h, d), M(color), 0, h / 2, 0);
    }
  }
  return { group: g, mats };
}
