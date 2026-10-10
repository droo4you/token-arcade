// Cuts the character turnaround sheet (assets/sheet-source.png) into game-sized
// pixel sprites: assets/sprites.png + src/sprites.js (frame rects).
// Run: node tools/extract-sprites.mjs
import fs from 'node:fs';
import { decodePNG, encodePNG } from './png.mjs';

const src = decodePNG(fs.readFileSync('assets/sheet-source.png'));
const { width: W, height: H, data: D } = src;

// Search windows on the sheet (generous; the real bbox is found inside).
const CELLS = {
  front:  [60, 130, 360, 455],  side:   [740, 130, 1020, 455],
  three:  [400, 130, 700, 455], back:   [1080, 130, 1380, 455],
  wave:   [50, 500, 370, 805],   run:    [380, 500, 720, 805],
  crouch: [760, 540, 1040, 805], jump:   [1100, 500, 1390, 805],
  rcFront: [440, 870, 600, 1000], rcSide: [670, 870, 830, 1000], rcBack: [890, 870, 1060, 1000],
};
const SCALE = 7.2; // sheet pixels per game pixel
// Native facing of each frame on the sheet: -1 looks left, 1 looks right, 0 front/back.
const FACING = { front: 0, side: -1, three: -1, back: 0, wave: 0, run: 1, crouch: -1, jump: -1, rcFront: 0, rcSide: 1, rcBack: 0 };

const at = (x, y) => (y * W + x) * 4;
function isBg(x, y) {
  const i = at(x, y), r = D[i], g = D[i + 1], b = D[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx > 200 && mx - mn < 40) return true;          // cream page / pale panel / grey ground shadow
  if (b > 220 && r > 160 && g > 160 && b - r < 80 && mx - mn < 80 && r > 170) return true; // lavender RC panel
  return false;
}

// Palette quantization: a fixed palette sampled to the sheet's art.
const PAL = [
  [0x22, 0x16, 0x3a], // outline
  [0xf3, 0x9c, 0xc0], [0xd8, 0x74, 0x9e], // pink skin, pink shade
  [0x1c, 0xd2, 0xf0], [0x0e, 0x9c, 0xc4], [0x8c, 0xf0, 0xff], // hair cyan, shade, highlight
  [0xf4, 0xec, 0xd4], [0xc9, 0xb8, 0x96], // horn cream, horn shade
  [0xb6, 0xd8, 0x46], [0x86, 0xa8, 0x2c], // shirt, shirt shade
  [0xf2, 0x7e, 0x22], [0xc0, 0x55, 0x14], // shorts orange, shade
  [0x82, 0x4c, 0xc8], [0x5a, 0x30, 0x96], // shoes purple, shade
  [0xf6, 0xc0, 0x2c], [0xe0, 0x2c, 0x2c], // juice box yellow, apple red
  [0xff, 0xff, 0xff], [0x4a, 0x3c, 0x60], // eye white, grey-dark
  [0xb0, 0x96, 0xe8], // lavender lid
];
function quant(r, g, b) {
  let best = 0, bd = 1e9;
  PAL.forEach((p, k) => { const d = (r - p[0]) ** 2 * 0.3 + (g - p[1]) ** 2 * 0.59 + (b - p[2]) ** 2 * 0.11; if (d < bd) { bd = d; best = k; } });
  return best;
}

let BG = null; // per-cell flood mask
function floodBg([x0, y0, x1, y1]) {
  BG = new Uint8Array(W * H);
  const st = [];
  for (let x = x0; x < x1; x++) st.push(x, y0, x, y1 - 1);
  for (let y = y0; y < y1; y++) st.push(x0, y, x1 - 1, y);
  while (st.length) {
    const y = st.pop(), x = st.pop();
    if (x < x0 || y < y0 || x >= x1 || y >= y1 || BG[y * W + x] || !isBg(x, y)) continue;
    BG[y * W + x] = 1;
    st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x < x0 + 0 || !(y >= y0)) BG[y * W + x] = 1;
}
const bgAt = (x, y) => BG[y * W + x] === 1 || BG[y * W + x] === undefined;
function bbox([x0, y0, x1, y1]) {
  let a = 1e9, b = 1e9, c = -1, d = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!bgAt(x, y)) {
    if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y;
  }
  return [a, b, c + 1, d + 1];
}

function downsample([x0, y0, x1, y1]) {
  const w = Math.ceil((x1 - x0) / SCALE), h = Math.ceil((y1 - y0) / SCALE);
  const px = new Int16Array(w * h).fill(-1);
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
    const counts = new Map(); let fg = 0, tot = 0;
    const sx0 = Math.floor(x0 + gx * SCALE), sx1 = Math.min(x1, Math.floor(x0 + (gx + 1) * SCALE));
    const sy0 = Math.floor(y0 + gy * SCALE), sy1 = Math.min(y1, Math.floor(y0 + (gy + 1) * SCALE));
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      tot++;
      if (bgAt(x, y)) continue;
      fg++;
      const i = at(x, y), q = quant(D[i], D[i + 1], D[i + 2]);
      counts.set(q, (counts.get(q) || 0) + 1);
    }
    if (fg / tot < 0.45) continue;
    // outline wins ties-ish: thin dark lines must survive downscaling
    let best = -1, bc = -1;
    for (const [q, c] of counts) { const wgt = q === 0 ? c * 1.6 : c; if (wgt > bc) { bc = wgt; best = q; } }
    px[gy * w + gx] = best;
  }
  const comp = new Int32Array(w * h).fill(-1); let bestId = -1, bestN = 0;
  for (let i = 0; i < w * h; i++) {
    if (px[i] < 0 || comp[i] >= 0) continue;
    const st = [i]; comp[i] = i; let n = 0;
    while (st.length) {
      const j = st.pop(); n++; const jx = j % w, jy = (j / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (px[k] >= 0 && comp[k] < 0) { comp[k] = i; st.push(k); }
      }
    }
    if (n > bestN) { bestN = n; bestId = i; }
  }
  for (let i = 0; i < w * h; i++) if (comp[i] !== bestId) px[i] = -1;
  // drop ground-shadow remnants (tan / lavender) hugging the bottom rows
  let lastRow = 0; for (let i = 0; i < w * h; i++) if (px[i] >= 0) lastRow = (i / w) | 0;
  for (let y = Math.max(0, lastRow - 2); y <= lastRow; y++) for (let x = 0; x < w; x++) { const q = px[y * w + x]; if (q === 7 || q === 18 || q === 17) px[y * w + x] = -1; }
  // trim empty rows/cols
  let a = w, b = h, c = -1, d = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * w + x] >= 0) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
  const nw = c - a + 1, nh = d - b + 1, np = new Int16Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) np[y * nw + x] = px[(y + b) * w + x + a];
  return { w: nw, h: nh, px: np };
}

const frames = {};
for (const [name, cell] of Object.entries(CELLS)) {
  floodBg(cell);
  const bb = bbox(cell);
  frames[name] = downsample(bb);
  console.log(name.padEnd(8), 'bbox', bb.join(','), '->', frames[name].w + 'x' + frames[name].h);
}

// pack into one row-strip atlas
const PAD = 1;
const AW = Object.values(frames).reduce((s, f) => s + f.w + PAD, PAD);
const AH = Math.max(...Object.values(frames).map(f => f.h)) + PAD * 2;
const out = Buffer.alloc(AW * AH * 4);
const rects = {};
let cx = PAD;
for (const [name, f] of Object.entries(frames)) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const q = f.px[y * f.w + x]; if (q < 0) continue;
    const o = ((y + PAD) * AW + cx + x) * 4;
    out[o] = PAL[q][0]; out[o + 1] = PAL[q][1]; out[o + 2] = PAL[q][2]; out[o + 3] = 255;
  }
  rects[name] = [cx, PAD, f.w, f.h];
  cx += f.w + PAD;
}
fs.writeFileSync('assets/sprites.png', encodePNG({ width: AW, height: AH, data: out }));
fs.writeFileSync('src/sprites.js', '// Generated by tools/extract-sprites.mjs. Do not edit.\nconst SPRITE_RECTS = ' + JSON.stringify(rects) + ';\nconst SPRITE_FACING = ' + JSON.stringify(FACING) + ';\n');

// 6x preview for eyeballing
const S = 6, pv = Buffer.alloc(AW * S * AH * S * 4);
for (let y = 0; y < AH * S; y++) for (let x = 0; x < AW * S; x++) {
  const i = (Math.floor(y / S) * AW + Math.floor(x / S)) * 4, o = (y * AW * S + x) * 4;
  const a = out[i + 3];
  pv[o] = a ? out[i] : 250; pv[o + 1] = a ? out[i + 1] : 246; pv[o + 2] = a ? out[i + 2] : 236; pv[o + 3] = 255;
}
fs.writeFileSync('tools/preview.png', encodePNG({ width: AW * S, height: AH * S, data: pv }));
console.log('atlas', AW + 'x' + AH);
