// World 2 (Shroomwood) art plus drawing for the world-2 mechanics:
// apples, goo, fans, shadow figures, smoke, portals, juice boxes, straws, goo puddles.
const S2 = {
  skyTop: '#6ec8ff', skyBot: '#d8f6ff',
  soil: '#8a5a3c', soilD: '#6e4630', soilL: '#a8744e', pebble: '#c09070',
  grass: '#5ec44a', grassL: '#9be36a', grassD: '#3f9a3a',
  redCap: '#e5484d', redCapD: '#b8323a', blueCap: '#4a7fe0', blueCapD: '#3460b8', spotG: '#7ee05a',
  stem: '#f4ecd4', stemD: '#d6c8a4', trunk: '#8a5a3c', trunkD: '#6a4228',
  leaf1: '#8ed65a', leaf2: '#5fbf4a', leaf3: '#3f9a3a', berryR: '#e02c5c', berryP: '#8a3cc8', berryB: '#3c6ee0',
  goo: '#1cd2f0', gooL: '#8cf0ff', thick: '#0a86b0', thickL: '#5fd8ff',
};

// ---------- apples ----------
function drawApple(ctx, j, frame) {
  const x = j.x, y = j.y + Math.round(Math.sin(frame * 0.08 + j.x) * 1.5);
  px(ctx, C.ink, x + 4, y - 1, 2, 3);                       // stem
  px(ctx, S2.leaf2, x + 6, y - 1, 3, 2); px(ctx, C.ink, x + 6, y - 2, 3, 1);
  px(ctx, C.ink, x + 1, y + 2, 8, 9); px(ctx, C.ink, x, y + 3, 10, 7);
  px(ctx, C.red, x + 1, y + 3, 8, 7); px(ctx, C.red, x + 2, y + 2, 2, 1); px(ctx, C.red, x + 6, y + 2, 2, 1);
  px(ctx, '#b81e3c', x + 2, y + 9, 6, 1); px(ctx, '#b81e3c', x + 7, y + 4, 1, 5);
  px(ctx, C.white, x + 2, y + 4, 2, 2);
}

// ---------- Shroomwood background ----------
const BG2 = {};
function capShape(g, cx, top, r, h, cap, capD, spot, seed) {
  // dome cap: rows narrow at the top, widest at the rim
  for (let y = 0; y < h; y++) {
    const t = y / h, w = Math.round(r * Math.sqrt(1 - (1 - t) * (1 - t)) );
    g.fillStyle = y > h - 3 ? capD : cap; g.fillRect(cx - w, top + y, w * 2, 1);
  }
  g.fillStyle = spot;
  for (let i = 0; i < 6; i++) {
    const sx = cx + Math.round((hash(seed, i) - 0.5) * r * 1.4), sy = top + 2 + Math.round(hash(i, seed) * (h - 6));
    const rr = 1 + Math.round(hash(seed + i, 3) * r * 0.12);
    circle(g, sx, sy, rr);
  }
}
function bigMushroom(g, x, groundY, scale, blue, seed, fade) {
  const r = Math.round(26 * scale), h = Math.round(22 * scale), stemW = Math.round(8 * scale), stemH = Math.round(60 * scale);
  const top = groundY - stemH - h;
  g.globalAlpha = fade;
  g.fillStyle = S2.stemD; g.fillRect(x - stemW / 2 - 1, groundY - stemH, stemW + 2, stemH);
  g.fillStyle = S2.stem; g.fillRect(x - stemW / 2, groundY - stemH, stemW - 2, stemH);
  g.fillStyle = S2.stemD; g.fillRect(x - stemW, top + h, stemW * 2, 3);      // gills
  capShape(g, x, top, r, h, blue ? S2.blueCap : S2.redCap, blue ? S2.blueCapD : S2.redCapD, blue ? S2.spotG : '#ffffff', seed);
  g.globalAlpha = 1;
}
function weirdTree(g, x, groundY, scale, seed, fade) {
  g.globalAlpha = fade;
  const trunkH = Math.round(70 * scale), tw = Math.max(3, Math.round(7 * scale));
  g.fillStyle = S2.trunk; g.fillRect(x - tw / 2, groundY - trunkH, tw, trunkH);
  g.fillStyle = S2.trunkD; g.fillRect(x + tw / 2 - 2, groundY - trunkH, 2, trunkH);
  // curly branches: walk a little wobbling path from the trunk
  const tips = [];
  for (let b = 0; b < 4; b++) {
    let bx = x, by = groundY - trunkH * (0.45 + b * 0.15), dir = b % 2 ? 1 : -1;
    for (let i = 0; i < 22 * scale; i++) {
      bx += dir * 1; by -= 0.5 + Math.sin(i * 0.5 + seed + b) * 0.9;
      g.fillStyle = S2.trunk; g.fillRect(Math.round(bx), Math.round(by), 2, 2);
    }
    tips.push([bx, by]);
  }
  // layered canopy pads at the tips and top
  tips.push([x, groundY - trunkH - 4]);
  const layers = [S2.leaf3, S2.leaf2, S2.leaf1];
  tips.forEach(([tx, ty], k) => layers.forEach((col, li) => {
    g.fillStyle = col;
    const rr = Math.round((10 - li * 3) * scale * (k === tips.length - 1 ? 1.4 : 1));
    for (let y = -rr; y <= rr / 2; y++) { const w = Math.floor(Math.sqrt(rr * rr - y * y) * 1.6); g.fillRect(Math.round(tx - w), Math.round(ty + y - li * 3), w * 2, 1); }
  }));
  g.globalAlpha = 1;
}
function berryBush(g, x, groundY, seed) {
  const cols = [S2.leaf3, S2.leaf2];
  cols.forEach((c, i) => { g.fillStyle = c; circle(g, x - 6 + i * 2, groundY - 6 - i, 7 - i); circle(g, x + 5, groundY - 5 - i, 6 - i); });
  g.fillRect(x - 12, groundY - 4, 24, 4);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = [S2.berryR, S2.berryP, S2.berryB][Math.floor(hash(seed, i) * 3)];
    g.fillRect(x - 9 + Math.floor(hash(i, seed) * 18), groundY - 11 + Math.floor(hash(seed + 1, i) * 8), 2, 2);
  }
}
function buildShroomLayer(n) {
  const W = 768, cv = document.createElement('canvas');
  cv.width = W; cv.height = VIEW_H;
  const g = cv.getContext('2d');
  if (n === 0) {
    // far: pale hills with tiny mushroom silhouettes
    g.fillStyle = '#b6ead8';
    for (let i = 0; i < 8; i++) circle(g, i * 100 + 30, 190, 60 + Math.floor(hash(i, 1) * 20));
    g.fillRect(0, 170, W, 60);
    for (let i = 0; i < 10; i++) bigMushroom(g, 20 + i * 78, 172, 0.45, i % 3 === 1, i, 0.35);
  } else if (n === 1) {
    for (let i = 0; i < 7; i++) weirdTree(g, 50 + i * 110 + Math.floor(hash(i, 2) * 30), 205, 0.9 + hash(i, 4) * 0.4, i, 0.8);
    g.fillStyle = '#8fd890'; g.fillRect(0, 200, W, 20);
  } else {
    for (let i = 0; i < 5; i++) bigMushroom(g, 70 + i * 160 + Math.floor(hash(i, 7) * 40), 216, 1.1 + hash(i, 8) * 0.5, i % 2 === 1, i + 20, 1);
    for (let i = 0; i < 9; i++) berryBush(g, 30 + i * 88, 214, i);
  }
  return cv;
}
function drawShroomBackground(ctx, camX, camY, frame) {
  if (!BG2.sky) {
    const cv = document.createElement('canvas'); cv.width = VIEW_W; cv.height = VIEW_H;
    const g = cv.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, VIEW_H);
    grd.addColorStop(0, S2.skyTop); grd.addColorStop(1, S2.skyBot);
    g.fillStyle = grd; g.fillRect(0, 0, VIEW_W, VIEW_H);
    BG2.sky = cv; BG2.layers = [0, 1, 2].map(buildShroomLayer);
  }
  ctx.drawImage(BG2.sky, 0, 0);
  // fluffy white clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 5; i++) {
    const x = ((hash(i, 9) * 600 + frame * (0.06 + i * 0.02) - camX * 0.04) % 520 + 520) % 520 - 70;
    const y = 14 + hash(i, 10) * 50;
    circle(ctx, Math.round(x), Math.round(y), 8); circle(ctx, Math.round(x + 10), Math.round(y - 4), 10); circle(ctx, Math.round(x + 22), Math.round(y), 8);
    ctx.fillRect(Math.round(x), Math.round(y), 22, 7);
  }
  [0.12, 0.28, 0.5].forEach((f, i) => {
    const off = ((-camX * f) % 768 + 768) % 768, oy = Math.round(-camY * f * 0.25);
    ctx.drawImage(BG2.layers[i], Math.round(off) - 768, oy);
    ctx.drawImage(BG2.layers[i], Math.round(off), oy);
  });
  // floating spores
  for (let i = 0; i < 14; i++) {
    const x = ((hash(i, 30) * VIEW_W + frame * 0.2 * (hash(i, 31) + 0.3)) % VIEW_W);
    const y = (hash(i, 32) * 160 + Math.sin(frame * 0.02 + i) * 6);
    px(ctx, i % 2 ? '#fff6a0' : '#ffffff', Math.round(x), Math.round(y), 1, 1);
  }
}

// ---------- Shroomwood tiles ----------
function prerenderShroom(world) {
  const cv = document.createElement('canvas');
  cv.width = world.W * TILE; cv.height = world.H * TILE;
  const g = cv.getContext('2d');
  const t = (x, y) => world.tile(x, y);
  const solid = c => c === T_SOLID;
  const decor = [];
  for (let ty = 0; ty < world.H; ty++) for (let tx = 0; tx < world.W; tx++) {
    const c = t(tx, ty), X = tx * TILE, Y = ty * TILE;
    if (c === T_SOLID) {
      const up = solid(t(tx, ty - 1)) || ty === 0, dn = solid(t(tx, ty + 1)) || ty >= world.H - 1;
      const lf = solid(t(tx - 1, ty)), rt = solid(t(tx + 1, ty));
      px(g, S2.soil, X, Y, 16, 16);
      for (let i = 0; i < 5; i++) {
        const h = hash(tx * 7 + i, ty * 3);
        px(g, h > 0.5 ? S2.soilD : S2.soilL, X + Math.floor(hash(i, tx + ty) * 14), Y + Math.floor(hash(tx, i + ty) * 14), 2, h > 0.8 ? 2 : 1);
      }
      if (hash(tx, ty + 99) > 0.8) px(g, S2.pebble, X + 5, Y + 9, 3, 2);
      if (!lf) { px(g, C.ink, X, Y, 1, 16); px(g, S2.soilL, X + 1, Y, 1, 16); }
      if (!rt) { px(g, C.ink, X + 15, Y, 1, 16); px(g, S2.soilD, X + 14, Y, 1, 16); }
      if (!dn) {
        px(g, C.ink, X, Y + 15, 16, 1);
        if (hash(tx, ty + 5) > 0.6) { px(g, S2.grassD, X + 4, Y + 15, 1, 3); px(g, S2.grassD, X + 10, Y + 15, 1, 5); } // hanging roots
      }
      if (!up) {
        px(g, C.ink, X, Y, 16, 1);
        px(g, S2.grass, X, Y + 1, 16, 4);
        px(g, S2.grassL, X, Y + 1, 16, 1);
        for (let i = 0; i < 16; i++) {
          const h = hash(tx * 16 + i, ty);
          if (h > 0.5) px(g, S2.grassD, X + i, Y + 5, 1, 1);
          if (h > 0.8) px(g, S2.grass, X + i, Y + 6, 1, 1);
          if (h < 0.12) px(g, S2.grassL, X + i, Y - 1, 1, 1);   // tufts
        }
        if (!lf) px(g, C.ink, X, Y, 1, 6);
        if (!rt) px(g, C.ink, X + 15, Y, 1, 6);
        const h = hash(tx, ty + 40);
        if (t(tx, ty - 1) === T_EMPTY && t(tx, ty - 2) === T_EMPTY) decor.push([X, Y, h]);
      }
    } else if (c === T_ONEWAY) {
      // mushroom-cap platform
      px(g, C.ink, X, Y, 16, 7);
      px(g, S2.redCap, X, Y + 1, 16, 4); px(g, S2.redCapD, X, Y + 5, 16, 1);
      px(g, '#ffffff', X + 3 + (tx % 2) * 6, Y + 2, 2, 2);
      if (t(tx - 1, ty) !== T_ONEWAY || tx % 2 === 0) { px(g, S2.stemD, X + 6, Y + 7, 4, 4); px(g, S2.stem, X + 7, Y + 7, 2, 4); }
    } else if (c === T_GRATE) {
      // vine lattice: goo slips through, Droober doesn't
      px(g, 'rgba(60,40,20,0.25)', X, Y, 16, 16);
      for (let i = 1; i < 16; i += 5) { px(g, S2.trunkD, X + i, Y, 2, 16); px(g, S2.trunkD, X, Y + i, 16, 2); }
      px(g, S2.leaf2, X + 3, Y + 3, 3, 2); px(g, S2.leaf1, X + 11, Y + 9, 3, 2);
    } else if (c === T_SPIKE) {
      // bramble thorns
      for (let s = 0; s < 3; s++) {
        const bx = X + s * 5 + 1;
        for (let r = 0; r < 8; r++) {
          const half = Math.floor(r / 3);
          px(g, C.ink, bx + 2 - half, Y + 8 + r, 1 + half * 2, 1);
          if (r > 2) px(g, '#7a3c8a', bx + 2 - half + 1, Y + 8 + r, Math.max(0, half * 2 - 1), 1);
        }
      }
      px(g, S2.grassD, X, Y + 14, 16, 2);
    }
  }
  // little surface decor: flowers, tiny mushrooms, berry sprigs (never taller than 7px)
  for (const [X, Y, h] of decor) {
    if (h < 0.18) { px(g, S2.stem, X + 6, Y - 3, 2, 3); px(g, C.ink, X + 4, Y - 6, 6, 3); px(g, h < 0.09 ? S2.blueCap : S2.redCap, X + 5, Y - 5, 4, 2); px(g, '#ffffff', X + 6, Y - 5, 1, 1); }
    else if (h < 0.32) { px(g, S2.grassD, X + 10, Y - 4, 1, 4); px(g, [S2.berryR, '#fff6a0', S2.berryP][Math.floor(h * 30) % 3], X + 9, Y - 6, 3, 2); }
    else if (h < 0.4) { px(g, S2.leaf3, X + 2, Y - 4, 7, 4); px(g, S2.leaf2, X + 3, Y - 5, 5, 2); px(g, S2.berryR, X + 4, Y - 3, 1, 1); px(g, S2.berryB, X + 7, Y - 4, 1, 1); }
  }
  return cv;
}

// ---------- mechanics ----------
function drawGoo(ctx, w) {
  for (const [k, gd] of w.goo) {
    if (gd.until <= w.frame) continue;
    const left = gd.until - w.frame;
    if (!gd.thick && left < 120 && (w.frame >> 3) % 2) continue;    // about to dry: blink
    const tx = k % w.W, ty = Math.floor(k / w.W), X = tx * TILE, Y = ty * TILE;
    const col = gd.thick ? S2.thick : S2.goo, hi = gd.thick ? S2.thickL : S2.gooL;
    const open = (x, y) => w.tile(x, y) !== T_SOLID;
    if (open(tx, ty + 1)) { px(ctx, col, X, Y + 13, 16, 3); px(ctx, hi, X + 2, Y + 13, 5, 1); for (let i = 0; i < 3; i++) { const dx = Math.floor(hash(k, i) * 14); px(ctx, col, X + dx, Y + 16, 2, 1 + Math.floor(hash(i, k) * 4)); } }
    if (open(tx - 1, ty)) { px(ctx, col, X, Y, 3, 16); px(ctx, hi, X, Y + 3, 1, 5); }
    if (open(tx + 1, ty)) { px(ctx, col, X + 13, Y, 3, 16); px(ctx, hi, X + 15, Y + 3, 1, 5); }
    if (gd.thick && (w.frame >> 4) % 4 === 0) px(ctx, '#ffffff', X + 7, Y + 14, 1, 1);
  }
}
function drawFan(ctx, w, f) {
  const v = f.dir === 'u' || f.dir === 'd';
  px(ctx, C.ink, f.x, f.y, f.w, f.h);
  px(ctx, '#7a8aa8', f.x + 1, f.y + 1, f.w - 2, f.h - 2);
  const n = Math.max(1, Math.round((v ? f.w : f.h) / TILE));
  for (let i = 0; i < n; i++) {
    const cx = v ? f.x + i * TILE + 8 : f.x + 8, cy = v ? f.y + 8 : f.y + i * TILE + 8;
    ctx.fillStyle = C.ink; circle(ctx, cx, cy, 6);
    ctx.fillStyle = f.on ? '#c8d4ea' : '#8a94aa'; circle(ctx, cx, cy, 5);
    const a = f.spin;
    for (let b = 0; b < 3; b++) {
      const ang = a + b * Math.PI * 2 / 3;
      for (let r = 1; r < 5; r++) px(ctx, C.ink, Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 2, 1);
    }
  }
  // arrow toward the blow direction
  const ax = f.dir === 'l' ? f.x - 4 : f.dir === 'r' ? f.x + f.w + 1 : f.x + f.w / 2 - 1;
  const ay = f.dir === 'u' ? f.y - 4 : f.dir === 'd' ? f.y + f.h + 1 : f.y + f.h / 2 - 1;
  if (f.on) px(ctx, C.white, ax, ay, 3, 3);
}
function drawShadow(ctx, w, s) {
  // sight band (readable, faint)
  if (s.sight && s.sight.w > 0) {
    ctx.fillStyle = s.alert ? 'rgba(224,44,44,0.16)' : 'rgba(18,10,31,0.10)';
    ctx.fillRect(s.sight.x, s.sight.y, s.sight.w, s.sight.h);
    ctx.fillStyle = s.alert ? 'rgba(224,44,44,0.5)' : 'rgba(18,10,31,0.25)';
    for (let x = 0; x < s.sight.w; x += 4) ctx.fillRect(s.sight.x + x, s.sight.y, 2, 1);
  }
  const x = s.x, y = s.y;
  ctx.fillStyle = '#120a1f';
  for (let r = 0; r < s.h; r++) {
    const t = r / s.h, half = Math.round(7 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) + (t > 0.85 ? -1 : 0));
    const jit = Math.round((hash(r, w.frame >> 2) - 0.5) * 2);
    ctx.fillRect(x + 7 - half + jit, y + r, half * 2, 1);
  }
  // fuzz
  for (let i = 0; i < 8; i++) px(ctx, '#120a1f', x + Math.floor(hash(i, w.frame >> 2) * 18) - 2, y + Math.floor(hash(w.frame >> 2, i) * s.h), 1, 1);
  // wispy feet
  for (let i = 0; i < 3; i++) px(ctx, '#120a1f', x + 2 + i * 4 + Math.round(Math.sin(w.frame * 0.2 + i) * 1), y + s.h, 2, 2);
  const eye = s.alert ? C.red : '#f4ecd4', ex = s.facing > 0 ? x + 8 : x + 2;
  px(ctx, eye, ex, y + 7, 2, 2); px(ctx, eye, ex + 4, y + 7, 2, 2);
  if (s.alert) { drawText(ctx, '!', x + 5, y - 10, C.red); }
}
function drawSmoke(ctx, w) {
  for (const sm of w.smokes) {
    const a = Math.min(1, sm.life / 40) * 0.9;
    ctx.globalAlpha = a;
    const cx = sm.x + sm.w / 2, cy = sm.y + sm.h / 2;
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * Math.PI * 2 + sm.life * 0.01, rr = 18 + Math.sin(sm.life * 0.05 + i) * 3;
      ctx.fillStyle = i % 2 ? '#b8aed0' : '#d8d0e8';
      circle(ctx, Math.round(cx + Math.cos(ang) * rr), Math.round(cy + Math.sin(ang) * rr * 0.8), 12);
    }
    ctx.fillStyle = '#e8e2f2'; circle(ctx, Math.round(cx), Math.round(cy), 16);
    ctx.globalAlpha = 1;
  }
}
function drawPortal(ctx, w, p) {
  const on = p.active;
  const rim = on ? C.yellow : '#7a7a90', inner = on ? C.orange : 'rgba(40,30,60,0.35)';
  if (p.face === 'none') {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (let y = -16; y < 16; y++) {
      const half = Math.round(7 * Math.sqrt(1 - (y / 16) * (y / 16)));
      px(ctx, C.ink, cx - half - 1, cy + y, half * 2 + 2, 1);
      px(ctx, rim, cx - half, cy + y, half * 2, 1);
      if (half > 2) px(ctx, inner, cx - half + 2, cy + y, half * 2 - 4, 1);
    }
    if (on) for (let i = 0; i < 6; i++) {
      const a = p.spin + i, r = 3 + (i % 3) * 2;
      px(ctx, i % 2 ? C.pink : C.white, Math.round(cx + Math.cos(a) * r * 0.6), Math.round(cy + Math.sin(a) * r * 2), 1, 1);
    }
  } else {
    const y = p.face === 'up' ? p.y : p.y;
    px(ctx, C.ink, p.x, y - 1, p.w, 6);
    px(ctx, rim, p.x + 1, y, p.w - 2, 4);
    px(ctx, inner, p.x + 4, y + 1, p.w - 8, 2);
    if (on) for (let i = 0; i < 4; i++) px(ctx, C.white, p.x + 4 + ((w.frame + i * 7) % (p.w - 8)), y + 1, 1, 1);
  }
}
function drawJuiceBox(ctx, w, b) {
  const x = b.x + 2, y = b.y + 1;
  if (b.powered) { ctx.fillStyle = 'rgba(246,192,44,0.35)'; circle(ctx, x + 6, y + 8, 11 + ((w.frame >> 3) % 2)); }
  px(ctx, C.ink, x, y + 2, 12, 13);
  px(ctx, C.yellow, x + 1, y + 3, 10, 11);
  px(ctx, C.orange, x + 1, y + 3, 10, 2);
  px(ctx, C.red, x + 3, y + 7, 5, 5); px(ctx, S2.leaf2, x + 6, y + 6, 2, 1); px(ctx, C.white, x + 4, y + 8, 1, 1);
  if (b.powered) { px(ctx, C.ink, x + 8, y - 4, 2, 7); px(ctx, C.white, x + 8, y - 4, 1, 6); px(ctx, C.red, x + 8, y - 2, 1, 1); }
  else px(ctx, C.ink, x + 8, y + 2, 2, 1);
}
function drawStraw(ctx, s, frame) {
  const x = s.x, y = s.y + Math.round(Math.sin(frame * 0.1 + s.x) * 1.5);
  px(ctx, C.ink, x + 1, y, 4, 13); px(ctx, C.ink, x + 3, y - 2, 4, 3);
  for (let i = 0; i < 12; i++) px(ctx, (i >> 1) % 2 ? C.red : C.white, x + 2, y + 1 + i, 2, 1);
  px(ctx, C.white, x + 4, y - 1, 2, 1);
}
function drawPuddle(ctx, w, p) {
  if (p.used) return;
  px(ctx, C.ink, p.x + 1, p.y, 14, 4);
  px(ctx, S2.thick, p.x + 2, p.y + 1, 12, 2);
  px(ctx, S2.thickL, p.x + 3, p.y + 1, 3, 1);
  if ((w.frame >> 4) % 3 === 0) px(ctx, S2.thickL, p.x + 9, p.y - 2 - ((w.frame >> 2) % 3), 2, 2);
}
function drawBoxWires(ctx, w) {
  for (const b of w.boxes) for (const p of w.portals) {
    if (p.box !== b.id) continue;
    ctx.globalAlpha = b.powered ? 0.7 : 0.25;
    ctx.fillStyle = C.yellow;
    const ay = b.y + 4, midY = Math.min(ay, p.y) - 8;
    dotLine(ctx, b.x + 8, ay, b.x + 8, midY, w.frame, b.powered);
    dotLine(ctx, b.x + 8, midY, p.x + p.w / 2, midY, w.frame, b.powered);
    dotLine(ctx, p.x + p.w / 2, midY, p.x + p.w / 2, p.y, w.frame, b.powered);
  }
  ctx.globalAlpha = 1;
}
function drawWorld2Layer(ctx, w) {
  drawBoxWires(ctx, w);
  for (const p of w.portals) drawPortal(ctx, w, p);
  for (const b of w.boxes) drawJuiceBox(ctx, w, b);
  for (const p of w.puddles) drawPuddle(ctx, w, p);
  for (const s of w.straws) if (!s.got) drawStraw(ctx, s, w.frame);
  for (const f of w.fans) drawFan(ctx, w, f);
}
function drawWorld2HUD(ctx, w) {
  if (!w.powers) return;
  const d = w.droober, rc = w.rc;
  // smoke cooldown on Droober's tab
  if (d.smokeCD > 0) { px(ctx, C.ink, 4, 24, 20, 3); px(ctx, '#b8aed0', 5, 25, Math.round(18 * (1 - d.smokeCD / PHYS.smokeCD)), 1); }
  else { px(ctx, C.ink, 4, 24, 20, 3); px(ctx, '#e8e2f2', 5, 25, 18, 1); }
  // thick goo meter on RC's tab
  if (rc.thick > 0) {
    px(ctx, C.ink, 28, 24, 20, 3);
    for (let i = 0; i < Math.min(9, rc.thick); i++) px(ctx, S2.thick, 29 + i * 2, 25, 1, 1);
  }
  // straws
  if (w.straws.length) {
    panel(ctx, 66, 3, 30, 14);
    drawStraw(ctx, { x: 69, y: 5 }, 0);
    drawText(ctx, 'X' + d.straws, 79, 7, C.ink);
  }
}
