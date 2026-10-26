// All drawing. Pixel-art at 384x216, scaled up by the page.
const VIEW_W = 384, VIEW_H = 216;
const C = {
  ink: '#22163a', pink: '#f39cc0', pinkD: '#d8749e', cyan: '#1cd2f0', cyanD: '#0e9cc4', cyanL: '#8cf0ff',
  cream: '#f4ecd4', creamD: '#c9b896', lime: '#b6d846', limeD: '#86a82c', orange: '#f27e22', orangeD: '#c05514',
  purple: '#824cc8', purpleD: '#5a3096', yellow: '#f6c02c', red: '#e02c2c', white: '#ffffff', lav: '#b096e8',
  stone: '#4b3a7a', stoneL: '#5e4a94', stoneD: '#3a2c63', paper: '#fdfbf0',
};
// channel colors: devices that share a channel share a color
const CH_COLORS = [C.pink, C.cyan, C.lime, C.orange, C.yellow, C.lav, C.white];
function chColor(world, ch) {
  if (!world._chMap) world._chMap = new Map();
  if (!world._chMap.has(ch)) world._chMap.set(ch, CH_COLORS[world._chMap.size % CH_COLORS.length]);
  return world._chMap.get(ch);
}

let SPRITES = null; // HTMLImageElement
function px(ctx, color, x, y, w = 1, h = 1) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

// ---------- sprites ----------
function drawFrame(ctx, name, x, y, flip = false, w = null, h = null) {
  const r = SPRITE_RECTS[name];
  if (!r || !SPRITES) return;
  const dw = w || r[2], dh = h || r[3];
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x) + dw, Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], 0, 0, dw, dh);
    ctx.restore();
  } else ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), dw, dh);
}
// draw a frame so its bottom-center sits at (cx, by), facing `facing`
function drawFrameAt(ctx, name, cx, by, facing, scale = 1) {
  const r = SPRITE_RECTS[name], nat = SPRITE_FACING[name];
  const flip = nat !== 0 && facing !== 0 && nat !== facing;
  drawFrame(ctx, name, cx - r[2] * scale / 2, by - r[3] * scale, flip, r[2] * scale, r[3] * scale);
}

// ---------- level prerender ----------
function prerenderLevel(world) {
  if (world.def.world === 2) return prerenderShroom(world);
  const cv = document.createElement('canvas');
  cv.width = world.W * TILE; cv.height = world.H * TILE;
  const g = cv.getContext('2d');
  const t = (x, y) => world.tile(x, y);
  const solidish = c => c === T_SOLID;
  for (let ty = 0; ty < world.H; ty++) for (let tx = 0; tx < world.W; tx++) {
    const c = t(tx, ty), X = tx * TILE, Y = ty * TILE;
    if (c === T_SOLID) {
      const up = solidish(t(tx, ty - 1)) || ty === 0, dn = solidish(t(tx, ty + 1)) || ty >= world.H - 1;
      const lf = solidish(t(tx - 1, ty)), rt = solidish(t(tx + 1, ty));
      px(g, C.stone, X, Y, 16, 16);
      // bricks
      const off = (ty % 2) * 8;
      for (let i = 0; i < 2; i++) {
        px(g, C.stoneD, X, Y + i * 8 + 7, 16, 1);
        px(g, C.stoneD, X + ((off + i * 8) % 16), Y + i * 8, 1, 8);
      }
      if (hash(tx, ty) > 0.7) px(g, C.stoneL, X + 3 + Math.floor(hash(ty, tx) * 9), Y + 2 + Math.floor(hash(tx + 7, ty) * 4), 2, 1);
      // light rim on exposed faces
      if (!lf) { px(g, C.ink, X, Y, 1, 16); px(g, C.stoneL, X + 1, Y, 1, 16); }
      if (!rt) { px(g, C.ink, X + 15, Y, 1, 16); px(g, C.stoneD, X + 14, Y, 1, 16); }
      if (!dn) { px(g, C.ink, X, Y + 15, 16, 1); px(g, C.stoneD, X, Y + 14, 16, 1); }
      if (!up) {
        // grass cap
        px(g, C.ink, X, Y, 16, 1);
        px(g, C.lime, X, Y + 1, 16, 3);
        px(g, '#d6f07a', X, Y + 1, 16, 1);
        for (let i = 0; i < 16; i++) {
          const h = hash(tx * 16 + i, ty);
          if (h > 0.55) px(g, C.limeD, X + i, Y + 4, 1, 1);
          if (h > 0.85) px(g, C.limeD, X + i, Y + 5, 1, 1);
        }
        if (!lf) px(g, C.ink, X, Y, 1, 5);
        if (!rt) px(g, C.ink, X + 15, Y, 1, 5);
      }
    } else if (c === T_ONEWAY) {
      px(g, C.ink, X, Y, 16, 6);
      px(g, C.orange, X, Y + 1, 16, 4);
      px(g, '#f8a860', X, Y + 1, 16, 1);
      px(g, C.orangeD, X + 7, Y + 1, 1, 4);
      px(g, C.ink, X + 3, Y + 6, 2, 3); px(g, C.ink, X + 11, Y + 6, 2, 3);
    } else if (c === T_GRATE) {
      px(g, 'rgba(34,22,58,0.35)', X, Y, 16, 16);
      for (let i = 1; i < 16; i += 4) { px(g, C.ink, X + i, Y, 2, 16); px(g, C.stoneL, X + i, Y, 1, 16); }
      px(g, C.ink, X, Y, 16, 2); px(g, C.ink, X, Y + 14, 16, 2);
      px(g, C.cyan, X + 5, Y + 2, 1, 2 + Math.floor(hash(tx, ty) * 4));
    } else if (c === T_SPIKE) {
      for (let s = 0; s < 2; s++) {
        const bx = X + s * 8;
        for (let r = 0; r < 8; r++) {
          const half = Math.floor(r / 2);
          px(g, C.ink, bx + 3 - half, Y + 8 + r, 2 + half * 2, 1);
          if (r > 0 && half > 0) px(g, r < 3 ? C.white : C.cream, bx + 4 - half, Y + 8 + r, half * 2, 1);
        }
      }
      px(g, C.ink, X, Y + 15, 16, 1);
    }
  }
  return cv;
}

// ---------- background ----------
let BG_CACHE = null;
function buildBackground() {
  const cv = document.createElement('canvas');
  cv.width = VIEW_W; cv.height = VIEW_H;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, VIEW_H);
  grd.addColorStop(0, '#4b3c9a'); grd.addColorStop(0.6, '#8c78d8'); grd.addColorStop(1, '#c4b2f2');
  g.fillStyle = grd; g.fillRect(0, 0, VIEW_W, VIEW_H);
  // dithered band to keep it pixel-y
  for (let y = 0; y < VIEW_H; y += 2) for (let x = (y / 2) % 2; x < VIEW_W; x += 2) if (hash(x, y) > 0.92) px(g, 'rgba(255,255,255,0.08)', x, y);
  for (let i = 0; i < 40; i++) { const x = Math.floor(hash(i, 1) * VIEW_W), y = Math.floor(hash(i, 2) * 90); px(g, hash(i, 3) > 0.7 ? C.cyanL : C.cream, x, y); }
  return cv;
}
// puffy "hair cloud" hills, drawn per frame with parallax
function drawPuffs(ctx, camX, camY, factor, baseY, color, seed, size) {
  const ox = -camX * factor, oy = -camY * factor * 0.3;
  ctx.fillStyle = color;
  const span = 64;
  const start = Math.floor(-ox / span) - 1;
  for (let i = start; i < start + VIEW_W / span + 3; i++) {
    const h = hash(i, seed);
    const x = Math.round(ox + i * span), r = size + Math.floor(h * size * 0.7);
    const y = Math.round(baseY + oy - h * 18);
    circle(ctx, x, y, r);
    circle(ctx, x + Math.floor(span / 2), y + 6, Math.floor(r * 0.8));
  }
  ctx.fillRect(0, Math.round(baseY + oy), VIEW_W, VIEW_H);
}
function circle(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - w, cy + y, w * 2, 1);
  }
}
function drawBackground(ctx, camX, camY, frame, theme = 1) {
  if (theme === 2) return drawShroomBackground(ctx, camX, camY, frame);
  if (!BG_CACHE) BG_CACHE = buildBackground();
  ctx.drawImage(BG_CACHE, 0, 0);
  // drifting cream clouds
  ctx.fillStyle = 'rgba(253,251,240,0.55)';
  for (let i = 0; i < 5; i++) {
    const x = ((hash(i, 9) * 600 + frame * (0.05 + i * 0.02) - camX * 0.05) % 520 + 520) % 520 - 70;
    const y = 18 + hash(i, 10) * 60;
    circle(ctx, Math.round(x), Math.round(y), 7); circle(ctx, Math.round(x + 9), Math.round(y - 3), 9); circle(ctx, Math.round(x + 19), Math.round(y), 7);
    ctx.fillRect(Math.round(x), Math.round(y), 20, 6);
  }
  drawPuffs(ctx, camX, camY, 0.15, 150, '#7a64c8', 3, 22);
  drawPuffs(ctx, camX, camY, 0.3, 172, '#6551b4', 5, 18);
  drawPuffs(ctx, camX, camY, 0.5, 196, '#55439e', 8, 14);
}

// ---------- world ----------
function drawWorld(ctx, w, levelCanvas) {
  const cx = Math.round(w.camX), cy = Math.round(w.camY);
  drawBackground(ctx, cx, cy, w.frame, w.def.world || 1);
  ctx.save();
  ctx.translate(-cx, -cy);
  drawWires(ctx, w);
  for (const s of w.signs) drawSign(ctx, s);
  if (w.exit) drawExit(ctx, w);
  for (const m of w.movers) drawMoverTrack(ctx, m);
  ctx.drawImage(levelCanvas, 0, 0);
  drawGoo(ctx, w);
  drawWorld2Layer(ctx, w);
  for (const p of w.plates) drawPlate(ctx, w, p);
  for (const b of w.buttons) drawButton(ctx, w, b);
  for (const l of w.levers) drawLever(ctx, w, l);
  for (const k of w.cranks) drawCrank(ctx, w, k);
  for (const d of w.doors) drawDoor(ctx, w, d);
  for (const m of w.movers) drawMover(ctx, w, m);
  for (const j of w.apples) if (!j.got) drawApple(ctx, j, w.frame);
  for (const b of w.blocks) drawBlock(ctx, b);
  for (const c of w.crates) if (!c.held) drawCrate(ctx, c);
  for (const z of w.zaps) drawZap(ctx, w, z);
  for (const s of w.shadows) drawShadow(ctx, w, s);
  drawDroober(ctx, w);
  drawRC(ctx, w);
  if (w.rc.painting && w.rc.mode !== 'ride') { const r = w.rc; for (let i = 0; i < 2; i++) w.fx.push({ kind: 'drip', x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h, vx: 0, vy: 0.3, life: 12, color: r.thick > 0 ? S2.thick : S2.goo }); }
  if (w.droober.carry) drawCrate(ctx, w.droober.carry);
  if (w.rc.mode === 'ride' && !w.droober.gliding) drawRC(ctx, w, true);
  drawSmoke(ctx, w);
  drawFx(ctx, w);
  drawActiveMarker(ctx, w);
  ctx.restore();
}

function centerOf(o) { return { x: o.x + o.w / 2, y: o.y + o.h / 2 }; }
function drawWires(ctx, w) {
  const sources = [...w.plates, ...w.buttons, ...w.levers];
  const sinks = [...w.doors, ...w.zaps.filter(z => z.ch != null), ...w.movers.filter(m => m.ch != null)];
  for (const s of sources) for (const k of sinks) {
    if (k.ch !== s.ch) continue;
    const a = centerOf(s), b = k.kind === 'door' ? { x: k.x + k.w / 2, y: k.y + 2 } : k.kind === 'mover' ? { x: k.ax + k.w / 2, y: k.ay + 4 } : { x: k.ex + 8, y: k.ey + 8 };
    const on = w.count(s.ch) > 0;
    ctx.globalAlpha = on ? 0.55 : 0.22;
    ctx.fillStyle = chColor(w, s.ch);
    // dotted L-shaped wire
    const midY = Math.min(a.y, b.y) - 6;
    dotLine(ctx, a.x, a.y, a.x, midY, w.frame, on);
    dotLine(ctx, a.x, midY, b.x, midY, w.frame, on);
    dotLine(ctx, b.x, midY, b.x, b.y, w.frame, on);
  }
  ctx.globalAlpha = 1;
}
function dotLine(ctx, x0, y0, x1, y1, frame, on) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 4);
  const shift = on ? (frame >> 2) % 4 : 0;
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    if ((i + shift) % 2) continue;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
  }
}
function drawSign(ctx, s) {
  const x = s.x, y = s.y;
  px(ctx, C.ink, x + 7, y + 8, 2, 8);
  px(ctx, C.ink, x + 1, y + 1, 14, 9);
  px(ctx, C.cream, x + 2, y + 2, 12, 7);
  px(ctx, C.creamD, x + 4, y + 4, 8, 1); px(ctx, C.creamD, x + 4, y + 6, 6, 1);
}
function drawExit(ctx, w) {
  const e = w.exit, x = e.x, y = e.y;
  px(ctx, C.ink, x + 1, y + 4, 30, 44);
  px(ctx, C.purple, x + 2, y + 5, 28, 43);
  px(ctx, C.ink, x + 6, y + 10, 20, 38);
  // inner glow halves: left Droober, right RC
  const glow = (on, color, gx) => { px(ctx, on ? color : '#2e2050', gx, y + 11, 9, 37); };
  glow(w.exitD, C.pink, x + 7); glow(w.exitR, C.cyan, x + 16);
  px(ctx, C.ink, x + 4, y, 24, 9);
  px(ctx, C.yellow, x + 5, y + 1, 22, 7);
  drawText(ctx, 'EXIT', x + 5, y + 1, C.ink);
  // little star twinkles
  if ((w.frame >> 4) % 2) px(ctx, C.white, x + 9 + ((w.frame >> 5) % 14), y + 20, 1, 1);
}
function drawPlate(ctx, w, p) {
  const col = chColor(w, p.ch), lift = p.on ? 1 : 3;
  const x = p.x, by = p.floor;
  if (p.heavy) {
    px(ctx, C.ink, x, by - lift - 3, 16, lift + 3);
    px(ctx, C.creamD, x + 1, by - lift - 2, 14, lift + 1);
    px(ctx, col, x + 2, by - lift - 2, 12, 1);
    px(ctx, C.ink, x + 4, by - lift, 1, 1); px(ctx, C.ink, x + 11, by - lift, 1, 1);
    px(ctx, C.ink, x + 6, by - lift - 1, 1, 1); px(ctx, C.ink, x + 9, by - lift - 1, 1, 1);
  } else {
    px(ctx, C.ink, x + 1, by - lift - 2, 14, lift + 2);
    px(ctx, col, x + 2, by - lift - 1, 12, lift);
    px(ctx, C.white, x + 3, by - lift - 1, 4, 1);
  }
}
function drawButton(ctx, w, b) {
  const col = chColor(w, b.ch), x = b.x + 3, y = b.y + 2;
  px(ctx, C.ink, x, y, 10, 12);
  px(ctx, C.stoneL, x + 1, y + 1, 8, 10);
  const pressed = b.on || b.flash > 0;
  px(ctx, C.ink, x + 2, y + 3, 6, 6);
  px(ctx, pressed ? C.ink : col, x + 3, y + 4, 4, 4);
  if (!pressed) px(ctx, C.white, x + 3, y + 4, 1, 1);
  if (b.time) {
    // clock face ticks
    const frac = b.timer / b.time;
    px(ctx, C.ink, x - 1, y + 13, 12, 3);
    px(ctx, frac > 0.3 ? C.lime : C.red, x, y + 14, Math.round(10 * frac), 1);
  } else if (b.latched) px(ctx, C.lime, x + 4, y + 9, 2, 1);
}
function drawLever(ctx, w, l) {
  const col = chColor(w, l.ch), x = l.x, y = l.y;
  px(ctx, C.ink, x + 3, y + 11, 10, 5);
  px(ctx, C.stoneL, x + 4, y + 12, 8, 3);
  const dir = l.on ? 1 : -1;
  for (let i = 0; i < 8; i++) px(ctx, C.ink, x + 8 + Math.round(dir * i * 0.6) - 1, y + 11 - i, 2, 1);
  px(ctx, C.ink, x + 8 + dir * 5 - 2, y + 1, 5, 5);
  px(ctx, col, x + 8 + dir * 5 - 1, y + 2, 3, 3);
}
function drawCrank(ctx, w, k) {
  const cx = k.x + 8, cy = k.y + 8;
  px(ctx, C.ink, cx - 2, cy, 4, 8);
  px(ctx, C.ink, k.x + 2, k.y + 14, 12, 2);
  ctx.fillStyle = C.ink; circle(ctx, cx, cy, 6);
  ctx.fillStyle = C.yellow; circle(ctx, cx, cy, 5);
  ctx.fillStyle = C.orangeD; circle(ctx, cx, cy, 2);
  for (let i = 0; i < 3; i++) {
    const a = k.angle + i * Math.PI * 2 / 3;
    for (let r = 2; r < 6; r++) px(ctx, C.ink, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r));
  }
  const a = k.angle;
  px(ctx, C.ink, Math.round(cx + Math.cos(a) * 6) - 1, Math.round(cy + Math.sin(a) * 6) - 1, 3, 3);
}
function drawDoor(ctx, w, d) {
  const col = chColor(w, d.ch);
  // housing at top
  px(ctx, C.ink, d.x - 2, d.y, d.w + 4, 4);
  px(ctx, C.stoneL, d.x - 1, d.y + 1, d.w + 2, 2);
  if (d.h <= 0) return;
  px(ctx, C.ink, d.x, d.y, d.w, d.h);
  px(ctx, C.purpleD, d.x + 1, d.y, d.w - 2, d.h - 1);
  for (let yy = d.y + 4; yy < d.y + d.h - 2; yy += 8) px(ctx, C.purple, d.x + 2, yy, d.w - 4, 3);
  // channel light strip (shows how many plates are held for need>1)
  const lit = Math.min(d.need, w.count(d.ch));
  for (let i = 0; i < d.need; i++) px(ctx, i < lit ? col : C.ink, d.x + 3 + i * 4, d.y + d.h - 6, 3, 3);
  if (d.need === 1) px(ctx, col, d.x + 3, d.y + d.h - 6, d.w - 6, 2);
}
function drawMoverTrack(ctx, m) {
  ctx.fillStyle = 'rgba(34,22,58,0.35)';
  dotLine(ctx, m.ax + m.w / 2, m.ay + 4, m.bx + m.w / 2, m.by + 4, 0, false);
}
function drawMover(ctx, w, m) {
  px(ctx, C.ink, m.x, m.y, m.w, m.h);
  px(ctx, m.crank != null ? C.yellow : C.lav, m.x + 1, m.y + 1, m.w - 2, m.h - 3);
  px(ctx, C.white, m.x + 1, m.y + 1, m.w - 2, 1);
  if (m.crank != null) for (let i = 2; i < m.w - 2; i += 6) px(ctx, C.ink, m.x + i, m.y + 2, 3, m.h - 4);
  else {
    for (let i = 4; i < m.w - 2; i += 8) px(ctx, C.purpleD, m.x + i, m.y + 3, 2, 2);
    px(ctx, m.ch != null && w.count(m.ch) > 0 ? chColor(w, m.ch) : C.purpleD, m.x + m.w / 2 - 2, m.y + 3, 4, 2);
  }
}
function drawJuice(ctx, j, frame) {
  const x = j.x, y = j.y + Math.round(Math.sin(frame * 0.08 + j.x) * 1.5);
  px(ctx, C.ink, x + 6, y - 2, 1, 4); px(ctx, C.white, x + 7, y - 3, 2, 1); px(ctx, C.ink, x + 7, y - 2, 1, 1);
  px(ctx, C.ink, x, y + 1, 10, 11);
  px(ctx, C.yellow, x + 1, y + 2, 8, 9);
  px(ctx, C.orange, x + 1, y + 2, 8, 1);
  px(ctx, C.red, x + 3, y + 5, 4, 4); px(ctx, C.limeD, x + 5, y + 4, 1, 1);
  px(ctx, C.white, x + 2, y + 3, 1, 2);
}
function drawCrate(ctx, c) {
  const x = Math.round(c.x), y = Math.round(c.y);
  px(ctx, C.ink, x, y, 14, 14);
  px(ctx, C.orange, x + 1, y + 1, 12, 12);
  px(ctx, '#f8a860', x + 1, y + 1, 12, 1);
  px(ctx, C.orangeD, x + 1, y + 12, 12, 1);
  px(ctx, C.ink, x + 1, y + 3, 12, 1); px(ctx, C.ink, x + 1, y + 10, 12, 1);
  for (let i = 0; i < 6; i++) px(ctx, C.orangeD, x + 3 + i, y + 4 + i, 2, 1);
}
function drawBlock(ctx, b) {
  const x = Math.round(b.x), y = Math.round(b.y);
  px(ctx, C.ink, x, y, 32, 32);
  px(ctx, '#6e6a8a', x + 1, y + 1, 30, 30);
  px(ctx, '#9d98b8', x + 1, y + 1, 30, 2); px(ctx, '#9d98b8', x + 1, y + 1, 2, 30);
  px(ctx, '#4a4664', x + 1, y + 29, 30, 2); px(ctx, '#4a4664', x + 29, y + 1, 2, 30);
  for (const [rx, ry] of [[5, 5], [25, 5], [5, 25], [25, 25]]) { px(ctx, C.ink, x + rx, y + ry, 2, 2); }
  drawText(ctx, '1T', x + 10, y + 12, C.ink);
}
function drawZap(ctx, w, z) {
  // emitters
  const e1 = z.v ? { x: z.ex + 4, y: z.ey } : { x: z.ex, y: z.ey + 4 };
  const e2 = z.v ? { x: z.ex + 4, y: z.y + z.h - 6 } : { x: z.x + z.w - 6, y: z.ey + 4 };
  for (const e of [e1, e2]) { px(ctx, C.ink, e.x, e.y, z.v ? 8 : 6, z.v ? 6 : 8); px(ctx, z.on ? C.cyanL : C.stoneL, e.x + 1, e.y + 1, z.v ? 6 : 4, z.v ? 4 : 6); }
  if (!z.on) return;
  const n = Math.floor((z.v ? z.h : z.w) / 2);
  for (let i = 0; i < n; i++) {
    const j = Math.round((hash(i, w.frame >> 1) - 0.5) * 4);
    if (z.v) { px(ctx, C.cyan, z.x + 1 + j, z.y + i * 2, 2, 2); px(ctx, C.white, z.x + 1 + (j >> 1), z.y + i * 2, 1, 2); }
    else { px(ctx, C.cyan, z.x + i * 2, z.y + 1 + j, 2, 2); px(ctx, C.white, z.x + i * 2, z.y + 1 + (j >> 1), 2, 1); }
  }
}

function drawDroober(ctx, w) {
  const d = w.droober;
  if (d.dead) return;
  let frame = 'three', bob = 0;
  const moving = Math.abs(d.vx) > 0.25;
  if (w.state === 'clear') frame = 'wave';
  else if (d.hang) frame = Math.floor(d.anim) % 2 ? 'jump' : 'wave';
  else if (d.cling) { frame = Math.floor(d.anim) % 2 ? 'side' : 'three'; }
  else if (d.crouch) frame = 'crouch';
  else if (!w.grounded(d)) frame = 'jump';
  else if (d.cranking) { frame = (w.frame >> 3) % 2 ? 'side' : 'three'; }
  else if (moving) { frame = Math.floor(d.anim) % 2 ? 'run' : 'side'; bob = Math.floor(d.anim) % 2 ? 0 : 1; }
  else if (w.frame % 400 > 330 && w.active !== 'droober') frame = 'front';
  else bob = (w.frame >> 5) % 2;
  const by = d.y + d.h + 1 + (d.landT > 0 ? 1 : 0) - (d.hang ? 9 : 0);   // hanging: raised so the hand meets the goo
  drawFrameAt(ctx, frame, d.x + d.w / 2, by + bob - (bob ? 1 : 0), d.facing);
}
function drawRC(ctx, w, onTop = false) {
  const rc = w.rc, d = w.droober;
  if (rc.dead) return;
  if (rc.mode === 'ride') {
    if (!onTop && !d.gliding) return;
    if (d.gliding) {
      // stretched into a goo umbrella over Droober's hair
      const r = SPRITE_RECTS.rcFront, wob = Math.round(Math.sin(w.frame * 0.4) * 1);
      const topY = d.y - 14;
      drawFrame(ctx, 'rcFront', d.x + d.w / 2 - 14 - wob, topY, false, 28 + wob * 2, 12);
      px(ctx, C.cyanD, d.x + d.w / 2 - 12, topY + 11, 2, 4); px(ctx, C.cyanD, d.x + d.w / 2 + 10, topY + 11, 2, 4);
      return;
    }
    const hop = rc.mountT > 0 ? Math.round(Math.sin(rc.mountT / 12 * Math.PI) * 6) : 0;
    drawFrameAt(ctx, 'rcFront', rc.x + rc.w / 2, rc.y + rc.h + 2 - hop, 0);
    return;
  }
  const moving = Math.abs(rc.vx) > 0.3;
  const bob = Math.round(Math.sin(rc.anim * 1.6) * (rc.onGround ? 0 : 1));
  const frame = moving ? 'rcSide' : 'rcFront';
  const r = SPRITE_RECTS[frame];
  // squash & stretch from vertical speed
  const st = Math.max(-2, Math.min(2, Math.round(rc.vy)));
  const dw = r[2] - st, dh = r[3] + st;
  const flip = frame === 'rcSide' && rc.facing < 0;
  drawFrame(ctx, frame, rc.x + rc.w / 2 - dw / 2, rc.y + rc.h - dh + bob + (rc.onGround ? 0 : 2), flip, dw, dh);
}
function drawFx(ctx, w) {
  for (const p of w.fx) {
    ctx.fillStyle = p.color;
    const s = p.kind === 'confetti' ? 2 : p.life > 15 ? 2 : 1;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
}
function drawActiveMarker(ctx, w) {
  if (w.state !== 'play') return;
  const f = w.focus();
  let x = f.x + f.w / 2, y = f.y - 8;
  if (f === w.droober) y = f.y - (w.rc.mode === 'ride' ? 22 : 10) - (f.carry ? 14 : 0);
  y += Math.round(Math.sin(w.frame * 0.12) * 1.5);
  const col = w.active === 'droober' ? C.pink : C.cyan;
  px(ctx, C.ink, x - 3, y - 4, 7, 2); px(ctx, C.ink, x - 2, y - 2, 5, 1); px(ctx, C.ink, x - 1, y - 1, 3, 1);
  px(ctx, col, x - 2, y - 4, 5, 1); px(ctx, col, x - 1, y - 3, 3, 1);
}

// ---------- HUD ----------
function panel(ctx, x, y, w, h, fill = C.paper) {
  px(ctx, C.ink, x + 1, y, w - 2, h); px(ctx, C.ink, x, y + 1, w, h - 2);
  px(ctx, fill, x + 1, y + 1, w - 2, h - 2);
}
function drawHUD(ctx, w, game) {
  // character tabs
  const tab = (x, name, active, draw) => {
    panel(ctx, x, 3, 22, 20, active ? C.yellow : C.paper);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 1, 4, 20, 18); ctx.clip(); draw(); ctx.restore();
  };
  tab(3, 'D', w.active === 'droober', () => drawFrame(ctx, 'front', -4, -8, false, 37, 42));
  tab(27, 'R', w.active === 'rc', () => drawFrame(ctx, 'rcFront', 31, 6, false));
  if (w.rc.mode === 'ride') { px(ctx, C.ink, 26, 11, 2, 2); }
  if (!Input.usingTouch) drawText(ctx, game.padHint ? 'LB' : 'Q', 51, 10, C.cream, 1, C.ink);
  // apples
  panel(ctx, VIEW_W - 82, 3, 38, 14);
  drawApple(ctx, { x: VIEW_W - 79, y: 4 }, 0);
  drawText(ctx, `${w.applesGot()}/${w.appleTotal}`, VIEW_W - 67, 7, C.ink);
  // time
  panel(ctx, VIEW_W - 42, 3, 39, 14);
  drawText(ctx, fmtTime(game.levelTime), VIEW_W - 39, 7, C.ink);
  // level name intro
  if (game.levelTime < 200 && w.state === 'play') {
    const a = Math.min(1, (200 - game.levelTime) / 30);
    ctx.globalAlpha = a;
    const title = `${game.levelIndex + 1}. ${w.name}`;
    drawTextC(ctx, title, VIEW_W / 2, 30, C.cream, 2, C.ink);
    if (w.def.blurb) drawTextC(ctx, w.def.blurb, VIEW_W / 2, 50, C.cream, 1, C.ink);
    ctx.globalAlpha = 1;
  }
  // active timers
  const timed = w.buttons.filter(b => b.time && b.timer > 0);
  timed.forEach((b, i) => {
    const frac = b.timer / b.time;
    panel(ctx, VIEW_W / 2 - 52, 4 + i * 10, 104, 8);
    px(ctx, frac > 0.3 ? C.lime : ((w.frame >> 3) % 2 ? C.red : C.orange), VIEW_W / 2 - 50, 6 + i * 10, Math.round(100 * frac), 4);
  });
  // toast
  for (const t of w.toasts) {
    const a = Math.min(1, t.t / 20);
    ctx.globalAlpha = a;
    const tw = textWidth(t.text) + 10;
    panel(ctx, VIEW_W / 2 - tw / 2, 60, tw, 13, C.yellow);
    drawTextC(ctx, t.text, VIEW_W / 2, 63, C.ink);
    ctx.globalAlpha = 1;
  }
  drawWorld2HUD(ctx, w);
  // signs near the active character
  const f = w.focus();
  const sign = w.signs.find(s => Math.abs(s.x + 8 - (f.x + f.w / 2)) < 30 && Math.abs(s.y + 8 - (f.y + f.h / 2)) < 40);
  if (sign && w.state === 'play') {
    const lines = wrapText(Input.usingTouch ? touchify(sign.text) : sign.text, 300);
    const h = lines.length * 9 + 8;
    panel(ctx, VIEW_W / 2 - 160, VIEW_H - h - 6, 320, h);
    lines.forEach((l, i) => drawTextC(ctx, l, VIEW_W / 2, VIEW_H - h - 2 + i * 9, C.ink));
  }
}
function fmtTime(frames) {
  const s = Math.floor(frames / 60), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
