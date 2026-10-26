/* Canyon Jump renderer: pseudo-3D chase cam on a 2D canvas. Render-only randomness is hashed from world
   positions so scenery is stable frame to frame and never touches the simulation. */
(function (root) {
  'use strict';
  const S = root.CJSim, C = S.C;
  const SEG = 6, DRAW_DIST = 720, ROAD_HALF = C.LANE_W * 1.5 + 1.3, CANYON_DEPTH = C.CANYON_DEPTH;
  // 2D fallback palette matches level 1 (Snake River / Twin Falls): cool daylight, basalt walls, sage flats.
  const PAL = {
    skyTop: '#1a3a6e', skyMid: '#5a8ab8', skyLow: '#a8c0d8', skyHorizon: '#c8d8e8', sun1: '#fff6d8', sun2: '#ffd59a',
    mesaFar: '#4a5058', mesaMid: '#3a3e46', mesaNear: '#2e3238',
    sandA: '#8e9270', sandB: '#6e7260', road: '#26282c', roadB: '#202226', lane: '#e4e0d0', rumbleA: '#ff3b5c', rumbleB: '#fff4e0',
    canyon: ['#7a8088', '#5a6068', '#3a3e46', '#4a5058', '#2e3238', '#161a20'], river: '#146878',
  };
  const hash = (n) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const lerp = (a, b, t) => a + (b - a) * t;

  // Mesa silhouettes: precomputed so they are stable; three parallax layers.
  const MESAS = [0, 1, 2].map(L => {
    const pts = []; let h = 0.4;
    for (let i = 0; i < 96; i++) {
      const r = hash(i * 131 + L * 977);
      if (r < 0.18) h = 0.15 + hash(i * 7 + L) * 0.25; else if (r < 0.36) h = 0.55 + hash(i * 11 + L) * 0.45;
      pts.push(h);
    }
    return pts;
  });

  function makeCam(W, H, cam) {
    const F = cam.f, hy = cam.hy;
    return {
      W, H, F, hy, x: cam.x, y: cam.y, z: cam.z, roll: cam.roll || 0, q: cam.q !== 0,
      p(x, y, z) {
        const dz = z - cam.z; if (dz < 0.6) return null;
        const k = F / dz; return { x: W / 2 + (x - cam.x) * k, y: hy + (cam.y - y) * k, k, dz };
      },
    };
  }

  function sky(ctx, W, H, hy, alt, t) {
    const night = Math.min(1, Math.max(0, (alt - 35) / 120));
    const g = ctx.createLinearGradient(0, 0, 0, hy + 4);
    g.addColorStop(0, night > 0 ? mix(PAL.skyTop, '#07051a', night) : PAL.skyTop);
    g.addColorStop(0.45, mix(PAL.skyMid, '#24104a', night));
    g.addColorStop(0.8, mix(PAL.skyLow, '#7a2b6a', night * 0.6));
    g.addColorStop(1, PAL.skyHorizon);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy + 4);
    if (night > 0.05) { // stars fade in as you climb
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 170; i++) {
        const sx = hash(i * 3) * W, sy = hash(i * 5 + 1) * hy * 0.85, tw = 0.55 + 0.45 * Math.sin(t * (2 + hash(i) * 3) + i), sz = hash(i * 9) < 0.08 ? 2.4 : 1.4;
        ctx.globalAlpha = night * tw * (1 - sy / hy * 0.6) * 0.9; ctx.fillRect(sx, sy, sz, sz);
      }
      ctx.globalAlpha = 1;
    }
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(pa >> 16, pb >> 16, t)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t)), bl = Math.round(lerp(pa & 255, pb & 255, t));
    return `rgb(${r},${g},${bl})`;
  }
  function sun(ctx, W, hy, camX, H) {
    const r = Math.min(H, W * 0.62) * 0.2, cx = W * 0.5 - camX * 1.5, cy = hy - r * 0.35;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.6);
    glow.addColorStop(0, 'rgba(255,190,120,0.55)'); glow.addColorStop(1, 'rgba(255,120,120,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 3 + (hy - cy) + 4);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, PAL.sun1); g.addColorStop(0.55, '#ffb35a'); g.addColorStop(1, PAL.sun2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) { const y = cy + r * (0.1 + i * 0.16), h = 1.5 + i * 1.3; ctx.fillRect(cx - r, y, r * 2, h); }
    ctx.restore();
  }
  function mesas(ctx, W, hy, H, camX, camZ, alt) {
    const cols = [PAL.mesaFar, PAL.mesaMid, PAL.mesaNear];
    const drop = Math.min(H * 0.08, alt * 0.12); // mesas sink a touch as you climb
    for (let L = 0; L < 3; L++) {
      const pts = MESAS[L], step = W / 22 * (1 + L * 0.35), hgt = Math.min(H, W * 0.62) * (0.07 + L * 0.045);
      const off = (camX * (2 + L * 4) + camZ * (0.02 + L * 0.03));
      const base = hy + 1 + drop * (1 - L * 0.2);
      ctx.fillStyle = cols[L]; ctx.beginPath(); ctx.moveTo(0, base);
      const start = Math.floor(off / step);
      for (let i = -1; i < W / step + 2; i++) {
        const idx = ((start + i) % 96 + 96) % 96, x = (start + i) * step - off;
        const h = pts[idx] * hgt;
        ctx.lineTo(x, base - h); ctx.lineTo(x + step * 0.85, base - h);
      }
      ctx.lineTo(W, base); ctx.closePath(); ctx.fill();
    }
    // horizon haze
    const hz = ctx.createLinearGradient(0, hy - H * 0.05, 0, hy + 2);
    hz.addColorStop(0, 'rgba(255,170,110,0)'); hz.addColorStop(1, 'rgba(255,170,110,0.45)');
    ctx.fillStyle = hz; ctx.fillRect(0, hy - H * 0.05, W, H * 0.05 + 2);
  }

  function quad(ctx, a, b, c, d, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
  }

  function ground(ctx, cam) {
    const { W, H } = cam;
    const rim = C.ROAD_LEN, far = C.ROAD_LEN + C.CANYON_W;
    const z0 = Math.floor(cam.z / SEG) * SEG;
    const BIG = 3000;
    // Base fill under the horizon so gaps never show the clear color.
    const hzY = cam.hy;
    if (cam.y > -5) { ctx.fillStyle = PAL.sandB; ctx.fillRect(0, hzY, W, H - hzY); }
    else { ctx.fillStyle = PAL.canyon[5]; ctx.fillRect(0, 0, W, H); }
    const segs = [];
    for (let z = z0 + DRAW_DIST; z >= z0; z -= SEG) segs.push(z);
    let wallDrawn = false;
    for (const z of segs) {
      const za = z, zb = z + SEG, idx = Math.round(z / SEG);
      const inCanyon = zb > rim && za < far;
      if (inCanyon) {
        if (!wallDrawn) { wallDrawn = true; canyonWall(ctx, cam, far); }
        // canyon floor with a river
        const a = cam.p(-BIG, -CANYON_DEPTH, Math.max(za, cam.z + 0.7)), b = cam.p(BIG, -CANYON_DEPTH, Math.max(za, cam.z + 0.7));
        const c = cam.p(BIG, -CANYON_DEPTH, zb), d = cam.p(-BIG, -CANYON_DEPTH, zb);
        if (a && c) {
          quad(ctx, a, b, c, d, idx % 2 ? '#2e1230' : '#341534');
          const ra = cam.p(-22 + Math.sin(za * 0.02) * 8, -CANYON_DEPTH, Math.max(za, cam.z + 0.7)), rb = cam.p(22 + Math.sin(za * 0.02) * 8, -CANYON_DEPTH, Math.max(za, cam.z + 0.7));
          const rc = cam.p(22 + Math.sin(zb * 0.02) * 8, -CANYON_DEPTH, zb), rd = cam.p(-22 + Math.sin(zb * 0.02) * 8, -CANYON_DEPTH, zb);
          if (ra && rc) quad(ctx, ra, rb, rc, rd, idx % 3 ? PAL.river : '#7fe8e4');
          // depth haze so the drop reads as deep
          ctx.globalAlpha = Math.min(0.75, 0.2 + (zb - cam.z) / DRAW_DIST * 0.9); quad(ctx, a, b, c, d, '#4a1e4f'); ctx.globalAlpha = 1;
        }
        continue;
      }
      if (za < cam.z + 0.7 && zb < cam.z + 0.7) continue;
      const zn = Math.max(za, cam.z + 0.7);
      const gL = cam.p(-BIG, 0, zn), gR = cam.p(BIG, 0, zn), fR = cam.p(BIG, 0, zb), fL = cam.p(-BIG, 0, zb);
      if (!gL || !fR) continue;
      quad(ctx, gL, gR, fR, fL, idx % 2 ? PAL.sandA : PAL.sandB);
      const h = ROAD_HALF;
      const rL = cam.p(-h, 0, zn), rR = cam.p(h, 0, zn), rfR = cam.p(h, 0, zb), rfL = cam.p(-h, 0, zb);
      quad(ctx, rL, rR, rfR, rfL, idx % 2 ? PAL.road : PAL.roadB);
      if (cam.q && zb - cam.z < 160) roadDetail(ctx, cam, zn, zb, idx);
      const rw = 0.7, rum = (idx % 2) ? PAL.rumbleA : PAL.rumbleB;
      quad(ctx, cam.p(-h - rw, 0, zn), rL, rfL, cam.p(-h - rw, 0, zb), rum);
      quad(ctx, rR, cam.p(h + rw, 0, zn), cam.p(h + rw, 0, zb), rfR, rum);
      if (idx % 3 === 0) for (const lx of [-C.LANE_W / 2, C.LANE_W / 2]) {
        quad(ctx, cam.p(lx - 0.13, 0, zn), cam.p(lx + 0.13, 0, zn), cam.p(lx + 0.13, 0, zb), cam.p(lx - 0.13, 0, zb), PAL.lane);
      }
      // the rim edge: a lip of rock on the near and far side of the gorge
      if (zb > rim - SEG && za <= rim) quad(ctx, cam.p(-BIG, 0, Math.max(rim - 1.5, cam.z + 0.7)), cam.p(BIG, 0, Math.max(rim - 1.5, cam.z + 0.7)), cam.p(BIG, 0, rim), cam.p(-BIG, 0, rim), '#b5523d');
    }
  }
  // Asphalt grain, worn tyre tracks and the odd tar seam. Hashed by segment index so it is stable.
  function roadDetail(ctx, cam, zn, zb, idx) {
    for (const lx of [-C.LANE_W, 0, C.LANE_W]) for (const off of [-0.75, 0.75]) {
      const a = cam.p(lx + off - 0.28, 0, zn), b = cam.p(lx + off + 0.28, 0, zn), c = cam.p(lx + off + 0.28, 0, zb), d = cam.p(lx + off - 0.28, 0, zb);
      if (a && c) { ctx.globalAlpha = 0.16; quad(ctx, a, b, c, d, '#1e1424'); }
    }
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#5a4560';
    for (let i = 0; i < 6; i++) {
      const hx = (hash(idx * 31 + i) - 0.5) * ROAD_HALF * 2, hz = zn + hash(idx * 17 + i * 5) * (zb - zn), p = cam.p(hx, 0, hz);
      if (p) ctx.fillRect(p.x, p.y, Math.max(1, p.k * 0.12), Math.max(1, p.k * 0.05));
    }
    if (hash(idx * 7) < 0.12) { const x1 = (hash(idx * 3) - 0.8) * ROAD_HALF, a = cam.p(x1, 0, zn + 1), b = cam.p(x1 + 1.5 + hash(idx * 11) * 3, 0, zn + 1.3); if (a && b) { ctx.globalAlpha = 0.4; ctx.strokeStyle = '#1a1020'; ctx.lineWidth = Math.max(1, a.k * 0.05); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    ctx.globalAlpha = 1;
  }
  // Heat shimmer: wavy light bands hugging the horizon over the road.
  function shimmer(ctx, cam, t) {
    const y0 = cam.hy + 2;
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffd9b0';
    for (let i = 0; i < 5; i++) {
      const y = y0 + i * 3 + Math.sin(t * 6 + i) * 1.2, wv = cam.W * (0.18 + 0.05 * Math.sin(t * 2 + i * 1.7));
      ctx.fillRect(cam.W / 2 - wv + Math.sin(t * 4 + i * 2) * 8, y, wv * 2, 1.2);
    }
    ctx.globalAlpha = 1;
  }
  function canyonWall(ctx, cam, far) {
    // Far wall face, layered sandstone strata, seen from the near rim or from the air.
    const BIG = 3000, STRATA = ['#c4593f', '#b2463a', '#d8754a', '#8f3330', '#a8483a', '#7a2a2c', '#6a2430', '#5d2028', '#4a1a26', '#3f1520'];
    const n = STRATA.length;
    for (let i = 0; i < n; i++) {
      const y0 = -i * CANYON_DEPTH / n - (i ? 0 : 0), y1 = -(i + 1) * CANYON_DEPTH / n;
      const a = cam.p(-BIG, y0, far), b = cam.p(BIG, y0, far), c = cam.p(BIG, y1, far), d = cam.p(-BIG, y1, far);
      if (a) quad(ctx, a, b, c, d, STRATA[i]);
    }
    // wavy ledges between strata: a lit lip over a shadowed undercut, so the layers read as rock, not paint
    if (cam.q) for (let i = 1; i < n; i++) {
      const yb = -i * CANYON_DEPTH / n; ctx.beginPath(); let ok = false;
      for (let j = -30; j <= 30; j++) { const x = j * 20, p = cam.p(x, yb + (hash(i * 97 + j) - 0.5) * 3.5, far); if (!p) continue; ok ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); ok = true; }
      if (!ok) continue;
      const k0 = cam.p(0, yb, far).k; ctx.lineWidth = Math.max(1, k0 * 1.4); ctx.strokeStyle = 'rgba(30,8,28,0.45)'; ctx.stroke();
      ctx.save(); ctx.translate(0, -Math.max(1, k0 * 0.9)); ctx.lineWidth = Math.max(1, k0 * 0.5); ctx.strokeStyle = 'rgba(255,190,130,0.35)'; ctx.stroke(); ctx.restore();
    }
    // vertical light falloff: sunlit top, shadowed foot
    { const top = cam.p(0, 0, far), bot = cam.p(0, -CANYON_DEPTH, far);
      if (top && bot && bot.y > top.y) { const g = ctx.createLinearGradient(0, top.y, 0, bot.y); g.addColorStop(0, 'rgba(255,200,140,0.18)'); g.addColorStop(0.5, 'rgba(40,10,50,0.05)'); g.addColorStop(1, 'rgba(20,6,30,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, top.y, cam.W, bot.y - top.y); } }
    // jagged eroded rim silhouette standing above the wall
    if (cam.q) { ctx.fillStyle = '#c4593f'; ctx.beginPath(); let started = false;
      for (let i = -40; i <= 40; i++) { const x = i * 12, hh = 1 + hash(i * 13 + 5) * 5 * (hash(i * 3) < 0.3 ? 2.5 : 1), p = cam.p(x, hh, far); if (!p) continue; if (!started) { const p0 = cam.p(x, 0, far); ctx.moveTo(p0.x, p0.y); started = true; } ctx.lineTo(p.x, p.y); const p2 = cam.p(x + 9, hh, far); if (p2) ctx.lineTo(p2.x, p2.y); }
      const pe = cam.p(492, 0, far); if (started && pe) { ctx.lineTo(pe.x, pe.y); ctx.closePath(); ctx.fill(); } }
    canyonNearCliff(ctx, cam);
    // erosion streaks for texture
    // shadowed foot of the wall and a sunlit rim line so the drop reads instantly
    { const a = cam.p(-BIG, -CANYON_DEPTH * 0.7, far), b = cam.p(BIG, -CANYON_DEPTH * 0.7, far), c = cam.p(BIG, -CANYON_DEPTH, far), d = cam.p(-BIG, -CANYON_DEPTH, far);
      if (a) { ctx.globalAlpha = 0.45; quad(ctx, a, b, c, d, '#1b0f3b'); ctx.globalAlpha = 1; } }
    { const a = cam.p(-BIG, 0, far), b = cam.p(BIG, 0, far), c = cam.p(BIG, -2.5, far), d = cam.p(-BIG, -2.5, far); if (a) quad(ctx, a, b, c, d, '#ffcf8a'); }
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 70; i++) {
      const x = (hash(i * 17) - 0.5) * 900, w = 2 + hash(i * 3) * 10, depth = 30 + hash(i * 5) * 120;
      const a = cam.p(x, 0, far), c = cam.p(x + w, -depth, far);
      if (a && c) { ctx.fillStyle = i % 2 ? '#3f1520' : '#e0784e'; ctx.fillRect(a.x, a.y, Math.max(1, c.x - a.x), c.y - a.y); }
    }
    ctx.globalAlpha = 1;
  }

  // Near cliff face (visible from the lip cam and when falling): the drop below the ramp.
  function canyonNearCliff(ctx, cam) {
    if (cam.z < C.ROAD_LEN - 2) return;
    const n = PAL.canyon.length, BIG = 3000, z = C.ROAD_LEN;
    for (let i = 0; i < n; i++) {
      const a = cam.p(-BIG, -i * CANYON_DEPTH / n, z + 0.01), b = cam.p(BIG, -i * CANYON_DEPTH / n, z + 0.01);
      const c = cam.p(BIG, -(i + 1) * CANYON_DEPTH / n, z + 0.01), d = cam.p(-BIG, -(i + 1) * CANYON_DEPTH / n, z + 0.01);
      if (a) quad(ctx, a, b, c, d, PAL.canyon[n - 1 - i]);
    }
  }
  /* ---------- billboards ---------- */
  function shadow(ctx, cx, cy, w, alpha) { ctx.fillStyle = `rgba(40,10,40,${alpha})`; ctx.beginPath(); ctx.ellipse(cx, cy, w, w * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
  function cactus(ctx, x, y, k, seed) {
    const h = 3.2 * k, w = 0.55 * k; shadow(ctx, x, y, w * 1.6, 0.35);
    ctx.fillStyle = '#2f7a46'; ctx.strokeStyle = '#1d4d33'; ctx.lineWidth = Math.max(1, k * 0.08);
    const arm = (dir, at, up) => {
      ctx.beginPath(); ctx.roundRect(x + dir * w * 0.5, y - h * at, dir * w * 1.3, w * 0.7, w * 0.3); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x + dir * w * 1.45 - w * 0.35, y - h * at - h * up, w * 0.7, h * up + w * 0.6, w * 0.35); ctx.fill(); ctx.stroke();
    };
    arm(-1, 0.55, 0.25 + seed * 0.1); arm(1, 0.4 + seed * 0.15, 0.22);
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, w / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,150,0.25)'; ctx.fillRect(x - w * 0.15, y - h * 0.95, w * 0.18, h * 0.9);
  }
  function rock(ctx, x, y, k) {
    const w = 1.6 * k, h = 1.4 * k; shadow(ctx, x, y, w * 0.9, 0.4);
    ctx.fillStyle = '#9b4a3a'; ctx.beginPath();
    ctx.moveTo(x - w * 0.8, y); ctx.lineTo(x - w * 0.7, y - h * 0.6); ctx.lineTo(x - w * 0.25, y - h); ctx.lineTo(x + w * 0.4, y - h * 0.9); ctx.lineTo(x + w * 0.8, y - h * 0.35); ctx.lineTo(x + w * 0.75, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d0704f'; ctx.beginPath(); ctx.moveTo(x - w * 0.7, y - h * 0.6); ctx.lineTo(x - w * 0.25, y - h); ctx.lineTo(x + w * 0.4, y - h * 0.9); ctx.lineTo(x + w * 0.1, y - h * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b2c2c'; ctx.beginPath(); ctx.moveTo(x + w * 0.1, y - h * 0.55); ctx.lineTo(x + w * 0.4, y - h * 0.9); ctx.lineTo(x + w * 0.8, y - h * 0.35); ctx.lineTo(x + w * 0.75, y); ctx.lineTo(x + w * 0.05, y); ctx.closePath(); ctx.fill();
  }
  function tumbleweed(ctx, x, y, k, t) {
    const r = 0.75 * k, cy = y - r - Math.abs(Math.sin(t * 5)) * r * 0.4; shadow(ctx, x, y, r, 0.3);
    ctx.save(); ctx.translate(x, cy); ctx.rotate(t * 4); ctx.strokeStyle = '#c99a5b'; ctx.lineWidth = Math.max(1, k * 0.07);
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(0, 0, r, r * (0.3 + (i % 3) * 0.25), i * 0.7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = '#8a6236'; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, 5); ctx.stroke(); ctx.restore();
  }
  function cone(ctx, x, y, k) {
    const h = 1.0 * k, w = 0.55 * k; shadow(ctx, x, y, w, 0.3);
    ctx.fillStyle = '#2b1b2b'; ctx.fillRect(x - w * 0.75, y - h * 0.08, w * 1.5, h * 0.08);
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x - w / 2, y - h * 0.08); ctx.lineTo(x - w * 0.1, y - h); ctx.lineTo(x + w * 0.1, y - h); ctx.lineTo(x + w / 2, y - h * 0.08); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4e0'; ctx.fillRect(x - w * 0.32, y - h * 0.55, w * 0.64, h * 0.15);
  }
  function airCan(ctx, x, y, k, t) {
    const h = 1.3 * k, w = 0.6 * k, cy = y - h * 0.9 - Math.sin(t * 3 + x) * k * 0.15;
    const glow = ctx.createRadialGradient(x, cy, 0, x, cy, h * 1.2); glow.addColorStop(0, 'rgba(90,240,255,0.55)'); glow.addColorStop(1, 'rgba(90,240,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - h * 1.2, cy - h * 1.2, h * 2.4, h * 2.4);
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, '#1a8fb0'); g.addColorStop(0.4, '#b9fbff'); g.addColorStop(1, '#1576a0');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - w / 2, cy - h / 2, w, h, w * 0.35); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - w * 0.18, cy - h * 0.62, w * 0.36, h * 0.14);
    if (k > 14) { ctx.fillStyle = '#063345'; ctx.font = `900 ${Math.round(w * 0.42)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AIR', x, cy + h * 0.05); }
  }
  function orb(ctx, x, y, k, t) {
    const r = 0.5 * k, cy = y - k * 1.1 - Math.sin(t * 4 + x * 0.1) * k * 0.12, sq = Math.abs(Math.cos(t * 3 + x));
    ctx.fillStyle = 'rgba(255,220,90,0.25)'; ctx.beginPath(); ctx.arc(x, cy, r * 1.7, 0, 7); ctx.fill();
    ctx.fillStyle = '#b5761b'; ctx.beginPath(); ctx.ellipse(x, cy, r * Math.max(0.15, sq), r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(x - r * 0.08 * sq, cy, r * Math.max(0.1, sq) * 0.82, r * 0.82, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6c0'; ctx.fillRect(x - r * 0.25 * sq, cy - r * 0.5, r * 0.18 * sq + 1, r * 0.6);
  }
  function pad(ctx, cam, lane, z, t) {
    const x = S.laneX(lane), w = 1.3, len = 6;
    const a = cam.p(x - w, 0.02, z), b = cam.p(x + w, 0.02, z), c = cam.p(x + w, 0.02, z + len), d = cam.p(x - w, 0.02, z + len);
    if (!a || !c) return;
    quad(ctx, a, b, c, d, '#2a0f3a');
    for (let i = 0; i < 3; i++) {
      const z0 = z + 0.6 + i * 1.8, on = (Math.floor(t * 8) + i) % 3 === 0;
      const p1 = cam.p(x - w * 0.8, 0.03, z0), p2 = cam.p(x, 0.03, z0 + 1.2), p3 = cam.p(x + w * 0.8, 0.03, z0), p4 = cam.p(x, 0.03, z0 + 0.5);
      if (p1 && p2) { ctx.fillStyle = on ? '#ffffff' : '#ff4fd8'; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath(); ctx.fill(); }
    }
  }
  function ramp(ctx, cam) {
    // A big yellow kicker at the lip: curved deck in slices, solid side walls, chevrons, lip lights.
    const z1 = C.ROAD_LEN, z0 = z1 - C.RAMP_LEN, h = ROAD_HALF + 0.9, N = 12;
    for (let i = 0; i < N; i++) {
      const za = z0 + (i / N) * C.RAMP_LEN, zb = z0 + ((i + 1) / N) * C.RAMP_LEN, ya = S.rampY(za + 0.01), yb = S.rampY(zb);
      for (const sd of [-1, 1]) { // side wall slice
        const a = cam.p(sd * h, 0, za), b = cam.p(sd * h, ya, za), c = cam.p(sd * h, yb, zb), d = cam.p(sd * h, 0, zb);
        if (a && c) quad(ctx, a, b, c, d, i % 2 ? '#6b2f2a' : '#7a3830');
      }
      const a = cam.p(-h, ya, za), b = cam.p(h, ya, za), c = cam.p(h, yb, zb), d = cam.p(-h, yb, zb);
      if (!a || !c) continue;
      quad(ctx, a, b, c, d, i % 2 ? '#ffd23f' : '#ffc21a');
      if (i % 3 === 1) { // chevron pointing up the ramp
        const zm = (za + zb) / 2, ym = S.rampY(zm);
        const p1 = cam.p(-h * 0.7, ya + 0.02, za), p2 = cam.p(0, yb + 0.02, zb), p3 = cam.p(h * 0.7, ya + 0.02, za), p4 = cam.p(0, ym + 0.02, zm);
        if (p1 && p2) { ctx.fillStyle = '#2b1b2b'; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath(); ctx.fill(); }
      }
    }
    // front face of the lip (thickness) and blinking lights
    const L = cam.p(-h, C.RAMP_H, z1), Rr = cam.p(h, C.RAMP_H, z1), Lb = cam.p(-h, C.RAMP_H - 0.8, z1), Rb = cam.p(h, C.RAMP_H - 0.8, z1);
    if (L && Rr) {
      quad(ctx, L, Rr, Rb, Lb, '#fff4e0');
      const on = Math.floor(performance.now() / 160) % 2;
      for (let i = 0; i <= 8; i++) { const p = cam.p(-h + i * (2 * h / 8), C.RAMP_H + 0.15, z1); if (p) { ctx.fillStyle = (i + on) % 2 ? '#ff3b5c' : '#fff1a8'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, p.k * 0.25), 0, 7); ctx.fill(); } }
      const top = cam.p(0, C.RAMP_H + 4.5, z1);
      if (top && top.k > 2) { ctx.font = `900 ${Math.round(top.k * 1.6)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1a0f1f'; ctx.fillText('JUMP', top.x + 2, top.y + 2); ctx.fillStyle = '#ffd23f'; ctx.fillText('JUMP', top.x, top.y); }
    }
  }
  function sign(ctx, x, y, k, text, color) {
    const w = 4.2 * k, h = 1.5 * k, top = y - 4.2 * k;
    ctx.fillStyle = '#3a2433'; ctx.fillRect(x - k * 0.08, top + h, k * 0.16, 4.2 * k - h);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = '#1a0f1f'; ctx.fillRect(x - w / 2 + k * 0.1, top + k * 0.1, w - k * 0.2, h - k * 0.2);
    if (k > 3) { ctx.fillStyle = color; ctx.font = `900 ${Math.round(h * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, top + h / 2 + 1); }
  }
  function bird(ctx, x, y, k, t, ph) {
    const s = 1.5 * k, f = Math.sin(t * 11 + ph), lw = Math.max(1.5, k * 0.22);
    ctx.fillStyle = '#2a1430';
    for (const sd of [-1, 1]) { // wings: filled tapered shapes with a lit leading edge
      ctx.beginPath(); ctx.moveTo(0, -s * 0.05);
      ctx.quadraticCurveTo(sd * s * 0.45, -s * (0.25 + f * 0.35), sd * s, -f * s * 0.55);
      ctx.quadraticCurveTo(sd * s * 0.5, s * 0.05 - f * s * 0.1, 0, s * 0.12); ctx.closePath();
      ctx.save(); ctx.translate(x, y); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,170,120,0.7)'; ctx.lineWidth = Math.max(1, lw * 0.35);
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -s * 0.05); ctx.quadraticCurveTo(sd * s * 0.45, -s * (0.25 + f * 0.35), sd * s, -f * s * 0.55); ctx.stroke(); }
    ctx.fillStyle = '#2a1430'; ctx.beginPath(); ctx.ellipse(0, s * 0.02, s * 0.14, s * 0.24, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function plane(ctx, x, y, k, dir, q) {
    const L = 8 * k, H = 1.25 * k;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    if (q && k > 1.2) { // contrails
      const cg = ctx.createLinearGradient(-L * 0.4, 0, -L * 2.4, 0); cg.addColorStop(0, 'rgba(255,240,250,0.55)'); cg.addColorStop(1, 'rgba(255,240,250,0)');
      ctx.fillStyle = cg; ctx.fillRect(-L * 2.4, H * 0.5, L * 2.1, Math.max(1, H * 0.22)); ctx.fillRect(-L * 2.4, H * 1.2, L * 2.1, Math.max(1, H * 0.22));
    }
    ctx.fillStyle = '#a99ac2'; ctx.beginPath(); ctx.moveTo(-L * 0.05, 0); ctx.lineTo(-L * 0.32, H * 1.9); ctx.lineTo(-L * 0.18, H * 1.9); ctx.lineTo(L * 0.14, 0); ctx.fill(); // far wing
    const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e7e0f2'); g.addColorStop(1, '#8f83ad');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.bezierCurveTo(L * 0.5, -H * 0.55, L * 0.35, -H * 0.5, L * 0.2, -H * 0.5);
    ctx.lineTo(-L * 0.38, -H * 0.42); ctx.lineTo(-L * 0.5, -H * 0.1); ctx.lineTo(-L * 0.42, H * 0.4); ctx.lineTo(L * 0.3, H * 0.5); ctx.bezierCurveTo(L * 0.45, H * 0.45, L * 0.5, H * 0.25, L * 0.5, 0); ctx.fill();
    ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.moveTo(-L * 0.34, -H * 0.4); ctx.lineTo(-L * 0.48, -H * 1.7); ctx.lineTo(-L * 0.4, -H * 1.7); ctx.lineTo(-L * 0.22, -H * 0.42); ctx.fill(); // tail
    ctx.fillStyle = '#5b2a6e'; ctx.fillRect(-L * 0.42, H * 0.05, L * 0.9, H * 0.1); // cheatline
    ctx.fillStyle = '#3d2a5c'; for (let i = 0; i < 9; i++) ctx.fillRect(-L * 0.25 + i * L * 0.055, -H * 0.2, L * 0.022, H * 0.16);
    ctx.fillStyle = '#d8d0e8'; ctx.beginPath(); ctx.moveTo(L * 0.08, H * 0.3); ctx.lineTo(-L * 0.12, H * 1.4); ctx.lineTo(-L * 0.02, H * 1.4); ctx.lineTo(L * 0.2, H * 0.35); ctx.fill(); // near wing
    ctx.fillStyle = '#6e6390'; ctx.beginPath(); ctx.roundRect(-L * 0.02, H * 0.75, L * 0.13, H * 0.4, H * 0.18); ctx.fill(); // engine
    ctx.fillStyle = '#2a1440'; ctx.beginPath(); ctx.ellipse(L * 0.42, -H * 0.2, L * 0.05, H * 0.12, 0, 0, 7); ctx.fill(); // cockpit
    ctx.fillStyle = (Math.floor(performance.now() / 400) % 2) ? '#ff3b5c' : '#ffe9a8'; ctx.beginPath(); ctx.arc(-L * 0.12, H * 1.4, Math.max(1, k * 0.18), 0, 7); ctx.fill();
    ctx.restore();
  }
  const BALLOON_COLS = [['#ff3b5c', '#ffd23f'], ['#2fc4c9', '#fff4e0'], ['#7a3cff', '#ff8c3a'], ['#3ecf6a', '#ff4fd8']];
  function balloon(ctx, x, y, k, hue, R) {
    const [c1, c2] = BALLOON_COLS[(hue || 0) % 4], r = R * k;
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? c1 : c2; ctx.beginPath(); ctx.ellipse(0, 0, r * (1 - i * 0.2), r * 1.1, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(40,20,20,0.7)'; ctx.lineWidth = Math.max(1, k * 0.03);
    ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 1.0); ctx.lineTo(-r * 0.15, r * 1.6); ctx.moveTo(r * 0.35, r * 1.0); ctx.lineTo(r * 0.15, r * 1.6); ctx.stroke();
    ctx.fillStyle = '#9a6a3a'; ctx.fillRect(-r * 0.17, r * 1.6, r * 0.34, r * 0.26);
    ctx.restore();
  }
  function satellite(ctx, x, y, k, t, ph) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.6 + ph) * 0.4);
    const p = 2.6 * k, b = 0.95 * k;
    ctx.fillStyle = '#9aa2c8'; ctx.fillRect(-p - b / 2, -k * 0.07, p * 2 + b, k * 0.14);
    for (const sd of [-1, 1]) {
      const px = sd < 0 ? -p - b / 2 : b / 2 + k * 0.1, pw = p - k * 0.1;
      const pg = ctx.createLinearGradient(px, -b * 0.6, px + pw, b * 0.6); pg.addColorStop(0, '#2b4fb8'); pg.addColorStop(0.5, '#6d9cff'); pg.addColorStop(0.55, '#1e3a8a'); pg.addColorStop(1, '#13286a');
      ctx.fillStyle = pg; ctx.fillRect(px, -b * 0.6, pw, b * 1.2);
      ctx.strokeStyle = 'rgba(190,215,255,0.6)'; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(px + i * (pw / 5), -b * 0.6); ctx.lineTo(px + i * (pw / 5), b * 0.6); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px + pw, 0); ctx.stroke();
    }
    const g = ctx.createLinearGradient(-b / 2, -b / 2, b / 2, b / 2); g.addColorStop(0, '#fff0b0'); g.addColorStop(0.35, '#e0a93a'); g.addColorStop(0.7, '#a06d1a'); g.addColorStop(1, '#ffd36a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-b / 2, -b / 2, b, b * 1.1, b * 0.12); ctx.fill(); // gold foil bus
    ctx.strokeStyle = 'rgba(90,50,10,0.5)'; ctx.beginPath(); ctx.moveTo(-b / 2, 0); ctx.lineTo(b / 2, b * 0.1); ctx.moveTo(-b * 0.1, -b / 2); ctx.lineTo(b * 0.05, b * 0.6); ctx.stroke();
    ctx.fillStyle = '#e8e8f0'; ctx.beginPath(); ctx.ellipse(0, b * 0.85, b * 0.45, b * 0.18, 0, 0, Math.PI); ctx.fill(); // dish
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, -b / 2); ctx.lineTo(0, -b * 1.4); ctx.stroke();
    ctx.fillStyle = (Math.floor(t * 2) % 2) ? '#ff3b5c' : '#5a1020'; ctx.beginPath(); ctx.arc(0, -b * 1.45, k * 0.12 + 1, 0, 7); ctx.fill();
    ctx.restore();
  }
  function cloud(ctx, x, y, k, a, lit) {
    if (a <= 0.01) return;
    ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#b5609a'; // shaded underside
    ctx.beginPath(); ctx.ellipse(x, y + k * 1.3, k * 9.5, k * 1.1, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = lit || '#ffd9e6';
    for (let i = 0; i < 6; i++) { const d = Math.abs(i - 2.5); ctx.beginPath(); ctx.ellipse(x + (i - 2.5) * k * 2.7, y + d * k * 0.5, k * (3.5 - d * 0.5), k * (1.9 - d * 0.25), 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#fff4ea'; // sun-side highlight
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + (i - 2.5) * k * 2.6, y - k * 0.7, k * 1.8, k * 0.7, 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  /* The roadster: an original pearl-white low wedge EV seen from behind (no marques, no badges).
     o = { t, spin, bank, q } — spin drives the tread scroll, bank reveals the flank for a 3/4 read. */
  function car(ctx, x, y, k, roll, glow, boostT, o) {
    o = o || {}; const q = o.q !== 0, bank = o.bank || 0, spin = o.spin || 0;
    const w = 2.0 * k, h = 0.95 * k;
    ctx.save(); ctx.translate(x, y - h * 0.5); ctx.rotate(roll);
    if (boostT > 0) { // twin thruster plumes with a hot core
      const L = k * (1.6 + boostT * 2.6), fl = 0.85 + 0.15 * Math.sin((o.t || 0) * 60);
      for (const sx of [-0.3, 0.3]) {
        const g = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.3 + L * fl); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(110,235,255,0.8)'); g.addColorStop(1, 'rgba(120,80,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx * w - k * 0.26, h * 0.32); ctx.quadraticCurveTo(sx * w, h * 0.3 + L * fl * 1.1, sx * w + k * 0.26, h * 0.32); ctx.closePath(); ctx.fill();
      }
    }
    // Flank sliver on the side we're turning away from: this is what sells the 3/4 view.
    if (Math.abs(bank) > 0.05) {
      const sd = bank > 0 ? -1 : 1, sw = w * 0.16 * Math.min(1, Math.abs(bank) * 1.4);
      const fx = sd * w * 0.5;
      const sg = ctx.createLinearGradient(0, -h * 0.25, 0, h * 0.4); sg.addColorStop(0, '#d9dbe6'); sg.addColorStop(0.5, '#9aa3bd'); sg.addColorStop(1, '#4b5370');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(fx, -h * 0.1); ctx.lineTo(fx + sd * sw, -h * 0.02); ctx.lineTo(fx + sd * sw, h * 0.34); ctx.lineTo(fx, h * 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#140c16'; ctx.beginPath(); ctx.ellipse(fx + sd * sw * 0.6, h * 0.36, sw * 0.42, h * 0.2, 0, 0, 7); ctx.fill();
    }
    // Rear tyres with scrolling tread (wheel spin) and a rim glint.
    for (const sx of [-1, 1]) {
      const tx = sx > 0 ? w * 0.3 : -w * 0.52, tw = w * 0.22, ty = h * 0.04, th = h * 0.54;
      ctx.fillStyle = '#120a14'; ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, k * 0.1); ctx.fill();
      if (q && k > 6) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, k * 0.1); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.09)'; const gap = th / 4, off = ((spin * k) % gap + gap) % gap;
        for (let yy = ty - gap + off; yy < ty + th; yy += gap) ctx.fillRect(tx, yy, tw, Math.max(1, gap * 0.35));
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(200,210,235,0.35)'; ctx.fillRect(tx + (sx > 0 ? tw * 0.72 : tw * 0.08), ty + th * 0.15, tw * 0.2, th * 0.6);
    }
    // Body: wide rear haunches, tucked waist, ducktail.
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-w * 0.46, h * 0.42);
      ctx.bezierCurveTo(-w * 0.53, h * 0.3, -w * 0.54, h * 0.0, -w * 0.5, -h * 0.08);
      ctx.bezierCurveTo(-w * 0.47, -h * 0.22, -w * 0.4, -h * 0.3, -w * 0.3, -h * 0.31);
      ctx.lineTo(w * 0.3, -h * 0.31);
      ctx.bezierCurveTo(w * 0.4, -h * 0.3, w * 0.47, -h * 0.22, w * 0.5, -h * 0.08);
      ctx.bezierCurveTo(w * 0.54, h * 0.0, w * 0.53, h * 0.3, w * 0.46, h * 0.42);
      ctx.closePath();
    };
    // environment reflection: sky above the horizon crease, warm sand below
    const g = ctx.createLinearGradient(0, -h * 0.32, 0, h * 0.42);
    g.addColorStop(0, '#ffd7c0'); g.addColorStop(0.12, '#fffaf6'); g.addColorStop(0.36, '#eef0f7'); g.addColorStop(0.47, '#c9cfe2');
    g.addColorStop(0.5, '#f6d2b8'); g.addColorStop(0.75, '#b9a9b8'); g.addColorStop(1, '#5d5470');
    ctx.fillStyle = g; ctx.strokeStyle = '#1e1530'; ctx.lineWidth = Math.max(1.5, k * 0.07); ctx.lineJoin = 'round';
    body(); ctx.fill(); ctx.stroke();
    // haunch shading: curvature reads as volume
    const hs = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
    hs.addColorStop(0, 'rgba(60,50,90,0.35)'); hs.addColorStop(0.18, 'rgba(60,50,90,0)'); hs.addColorStop(0.82, 'rgba(60,50,90,0)'); hs.addColorStop(1, 'rgba(60,50,90,0.35)');
    ctx.fillStyle = hs; body(); ctx.fill();
    // sunset rim light on the shoulders, travelling with the bank
    ctx.fillStyle = 'rgba(255,170,100,0.6)'; ctx.beginPath(); ctx.ellipse(-bank * w * 0.12, -h * 0.29, w * 0.36, Math.max(1, h * 0.035), 0, 0, 7); ctx.fill();
    // cabin glass reflecting the sky, with a moving streak
    const gl = ctx.createLinearGradient(0, -h * 0.78, 0, -h * 0.3); gl.addColorStop(0, '#1f1038'); gl.addColorStop(0.55, '#8e3466'); gl.addColorStop(1, '#ffb35a');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(-w * 0.29, -h * 0.3); ctx.bezierCurveTo(-w * 0.26, -h * 0.66, -w * 0.12, -h * 0.79, 0, -h * 0.79);
    ctx.bezierCurveTo(w * 0.12, -h * 0.79, w * 0.26, -h * 0.66, w * 0.29, -h * 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,21,48,0.9)'; ctx.lineWidth = Math.max(1, k * 0.05); ctx.stroke();
    const sx0 = -w * 0.2 + ((((o.t || 0) * 0.15 + bank * 0.2) % 1 + 1) % 1) * w * 0.32;
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.moveTo(sx0, -h * 0.34); ctx.lineTo(sx0 + w * 0.08, -h * 0.72); ctx.lineTo(sx0 + w * 0.13, -h * 0.72); ctx.lineTo(sx0 + w * 0.05, -h * 0.34); ctx.fill();
    // ducktail lip + specular crease
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-w * 0.4, -h * 0.25, w * 0.8, Math.max(1, h * 0.035));
    ctx.fillStyle = 'rgba(30,21,48,0.25)'; ctx.fillRect(-w * 0.4, -h * 0.21, w * 0.8, Math.max(1, h * 0.02));
    // full-width taillight bar
    ctx.save(); if (q) { ctx.shadowColor = '#ff2a4a'; ctx.shadowBlur = k * 0.7 * glow; }
    ctx.fillStyle = '#7a0a22'; ctx.beginPath(); ctx.roundRect(-w * 0.48, -h * 0.11, w * 0.96, h * 0.13, h * 0.05); ctx.fill();
    ctx.fillStyle = '#ff4d6a'; ctx.fillRect(-w * 0.46, -h * 0.085, w * 0.92, h * 0.07);
    ctx.fillStyle = '#ffd0d8'; ctx.fillRect(-w * 0.46, -h * 0.07, w * 0.1, h * 0.04); ctx.fillRect(w * 0.36, -h * 0.07, w * 0.1, h * 0.04);
    ctx.restore();
    // blank plate recess, diffuser fins
    ctx.fillStyle = 'rgba(30,21,48,0.18)'; ctx.beginPath(); ctx.roundRect(-w * 0.13, h * 0.05, w * 0.26, h * 0.12, k * 0.03); ctx.fill();
    ctx.fillStyle = '#1e0a16'; ctx.beginPath(); ctx.roundRect(-w * 0.36, h * 0.24, w * 0.72, h * 0.18, k * 0.05); ctx.fill();
    ctx.fillStyle = '#3e1a2c'; for (let i = -3; i <= 3; i++) ctx.fillRect(i * w * 0.09 - 1, h * 0.26, 2, h * 0.14);
    ctx.restore();
  }

  function pole(ctx, cam, x, z, zNext) {
    const b = cam.p(x, 0, z), t = cam.p(x, 9, z); if (!b || !t) return;
    ctx.strokeStyle = '#3a2433'; ctx.lineWidth = Math.max(1, b.k * 0.22); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.lineWidth = Math.max(1, b.k * 0.15); ctx.beginPath(); ctx.moveTo(t.x - b.k * 1.1, t.y + b.k * 0.6); ctx.lineTo(t.x + b.k * 1.1, t.y + b.k * 0.6); ctx.stroke();
    const n = cam.p(x, 9, zNext); if (!n) return;
    ctx.strokeStyle = 'rgba(40,20,40,0.55)'; ctx.lineWidth = 1;
    for (const o of [-1, 1]) { const ax = t.x + o * b.k * 0.9, ay = t.y + b.k * 0.6, bx = n.x + o * n.k * 0.9, by = n.y + n.k * 0.6; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + b.k * 0.8, bx, by); ctx.stroke(); }
  }
  function tuft(ctx, x, y, k, i) {
    if (k < 1.5) return;
    ctx.strokeStyle = i % 3 ? '#9b7a3a' : '#6d7a3a'; ctx.lineWidth = Math.max(1, k * 0.06);
    ctx.beginPath(); for (let j = -2; j <= 2; j++) { ctx.moveTo(x + j * k * 0.08, y); ctx.lineTo(x + j * k * 0.22, y - k * (0.35 + (j & 1) * 0.15)); } ctx.stroke();
  }
  function hoodoo(ctx, cam, x, z, hh, wd, i) {
    const b = cam.p(x, -CANYON_DEPTH, z), t = cam.p(x, -CANYON_DEPTH + hh, z); if (!b || !t) return;
    // From the road the near rim hides the gorge: clip hoodoos to above the rim line until we're over the gap.
    const rimP = cam.z < C.ROAD_LEN ? cam.p(0, S.rampY(C.ROAD_LEN) * 0, C.ROAD_LEN) : null;
    if (rimP) { if (t.y >= rimP.y) return; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cam.W, rimP.y); ctx.clip(); }
    try { hoodooBody(ctx, cam, x, z, hh, wd, i, b, t); } finally { if (rimP) ctx.restore(); }
  }
  function hoodooBody(ctx, cam, x, z, hh, wd, i, b, t) {
    const w = wd * b.k, cols = ['#c4593f', '#9e3d34', '#d8754a', '#7a2a2c', '#b2463a'], bands = 6;
    for (let j = 0; j < bands; j++) {
      const y0 = lerp(b.y, t.y, j / bands), y1 = lerp(b.y, t.y, (j + 1) / bands), ww = w * (1 - j * 0.07) * (0.85 + hash(i * 7 + j) * 0.3);
      ctx.fillStyle = cols[(j + i) % cols.length]; ctx.fillRect(b.x - ww / 2, y1, ww, y0 - y1 + 1);
    }
    ctx.fillStyle = '#e88a5a'; ctx.fillRect(t.x - w * 0.55, t.y - Math.max(2, w * 0.12), w * 1.1, Math.max(2, w * 0.18)); // caprock
    ctx.fillStyle = 'rgba(30,8,30,0.35)'; ctx.fillRect(b.x, t.y, w * 0.45, b.y - t.y); // shadow side (sun ahead-left)
    ctx.globalAlpha = Math.min(0.7, (z - cam.z) / DRAW_DIST * 0.8); ctx.fillStyle = '#6a2d62'; ctx.fillRect(b.x - w * 0.6, t.y - w * 0.15, w * 1.2, b.y - t.y + w * 0.15); ctx.globalAlpha = 1;
  }

  function drawWorld(ctx, W, H, s, view) {
    const cam = makeCam(W, H, view.cam);
    const t = view.t, alt = Math.max(0, cam.y - 3);
    sky(ctx, W, H, cam.hy, alt, t);
    sun(ctx, W, cam.hy, cam.x, H);
    mesas(ctx, W, cam.hy, H, cam.x, cam.z, alt);
    ground(ctx, cam);
    if (cam.q && s.phase === 'road') shimmer(ctx, cam, t);
    // Collect billboards
    const items = []; let fog = 0;
    const zMin = cam.z + 0.8, zMax = cam.z + DRAW_DIST;
    for (const o of s.obstacles) if (o.z > zMin && o.z < zMax) items.push({ z: o.z, f: () => {
      const p = cam.p(S.obstacleX(o, s.t), 0, o.z); if (!p) return;
      if (o.type === 'cactus') cactus(ctx, p.x, p.y, p.k, hash(o.z | 0)); else if (o.type === 'rock') rock(ctx, p.x, p.y, p.k);
      else if (o.type === 'tumbleweed') tumbleweed(ctx, p.x, p.y, p.k, s.t + o.phase); else cone(ctx, p.x, p.y, p.k);
    } });
    for (const pk of s.pickups) if (!pk.taken && pk.z > zMin && pk.z < zMax) items.push({ z: pk.z + (pk.type === 'pad' ? 6 : 0), f: () => {
      if (pk.type === 'pad') return pad(ctx, cam, pk.lane, pk.z, t);
      const p = cam.p(S.laneX(pk.lane), 0, pk.z); if (!p) return;
      pk.type === 'air' ? airCan(ctx, p.x, p.y, p.k, t) : orb(ctx, p.x, p.y, p.k, t);
    } });
    if (C.ROAD_LEN > zMin - 30 && C.ROAD_LEN - C.RAMP_LEN < zMax) items.push({ z: C.ROAD_LEN, f: () => ramp(ctx, cam) });
    // Roadside scenery and signs (cosmetic only).
    const sStart = Math.floor(zMin / 23), sEnd = Math.floor(zMax / 23);
    for (let i = sStart; i <= sEnd; i++) {
      const z = i * 23 + hash(i) * 10; if (z > C.ROAD_LEN - 30 && z < C.ROAD_LEN + C.CANYON_W + 10) continue;
      const side = hash(i * 3) < 0.5 ? -1 : 1, x = side * (ROAD_HALF + 4 + hash(i * 7) * 40), kind = hash(i * 11);
      items.push({ z, f: () => { const p = cam.p(x, 0, z); if (!p) return; kind < 0.55 ? cactus(ctx, p.x, p.y, p.k * (0.8 + kind * 0.6), kind) : rock(ctx, p.x, p.y, p.k * (1 + kind)); } });
    }
    // Telephone poles with sagging wires along the right shoulder, plus scrub tufts on both verges.
    if (cam.z < C.ROAD_LEN + 10) {
      const P = 38, p0 = Math.max(0, Math.floor(zMin / P)), p1 = Math.min(Math.floor((C.ROAD_LEN - 40) / P), Math.floor(zMax / P));
      for (let i = p0; i <= p1; i++) { const z = i * P; items.push({ z, f: () => pole(ctx, cam, ROAD_HALF + 6, z, z + P) }); }
      if (cam.q) { const T = 5, t0 = Math.floor(zMin / T), t1 = Math.min(Math.floor(zMin + 160) / T | 0, Math.floor((C.ROAD_LEN - 20) / T));
        for (let i = t0; i <= t1; i++) { const side = hash(i * 19) < 0.5 ? -1 : 1, x = side * (ROAD_HALF + 1.4 + hash(i * 23) * 5), z = i * T + hash(i * 29) * T;
          items.push({ z, f: () => { const p = cam.p(x, 0, z); if (p) tuft(ctx, p.x, p.y, p.k, i); } }); } }
    }
    // Hoodoos rising from the canyon floor: layered sandstone columns that give the gorge scale.
    if (cam.z > C.ROAD_LEN - 900 && cam.z < C.ROAD_LEN + C.CANYON_W) for (let i = 0; i < 26; i++) {
      const z = C.ROAD_LEN + 110 + hash(i * 41) * (C.CANYON_W - 125), side = hash(i * 7 + 3) < 0.5 ? -1 : 1;
      const x = side * (16 + hash(i * 43) * 220), hh = 35 + hash(i * 47) * 75, wd = 5 + hash(i * 53) * 10;
      if (z > zMin && z < zMax) items.push({ z, f: () => hoodoo(ctx, cam, x, z, hh, wd, i) });
    }
    for (let d = 500; d < C.ROAD_LEN; d += 500) { const z = C.ROAD_LEN - d; if (z > zMin && z < zMax) items.push({ z, f: () => { const p = cam.p(ROAD_HALF + 2.5, 0, z); if (p) sign(ctx, p.x, p.y, p.k, `CANYON ${d}m`, '#ffd23f'); } }); }
    for (let d = Math.max(100, Math.ceil((zMin - C.ROAD_LEN - C.CANYON_W) / 100) * 100); d < Math.max(100, zMax - C.ROAD_LEN - C.CANYON_W) + 1; d += 100) { const z = C.ROAD_LEN + C.CANYON_W + d; if (z > zMin && z < zMax) items.push({ z, f: () => { const p = cam.p(-ROAD_HALF - 2.5, 0, z); if (p) sign(ctx, p.x, p.y, p.k, `+${d}m`, '#5af0ff'); } }); }
    { const z = C.ROAD_LEN + C.CANYON_W + 2; if (z > zMin && z < zMax) items.push({ z, f: () => { const p = cam.p(ROAD_HALF + 2.5, 0, z); if (p) sign(ctx, p.x, p.y, p.k, 'FAR RIM', '#5af0ff'); } }); }
    // Clouds in the sky lanes
    if (s.phase !== 'road' || cam.z > C.ROAD_LEN - 700) {
      const c0 = Math.floor(zMin / 90), c1 = Math.floor(zMax / 90);
      for (let i = c0; i <= c1; i++) {
        if (i * 90 < C.ROAD_LEN - 200) continue;
        for (let j = 0; j < 2; j++) {
          const z = i * 90 + hash(i * 13 + j) * 80, x = (hash(i * 5 + j * 3) - 0.5) * 160, y = 25 + hash(i * 7 + j) * 230;
          const dzc = z - cam.z;
          if (dzc > -6 && dzc < 16 && Math.abs(y - cam.y) < 9 && Math.abs(x - cam.x) < 30) fog = Math.max(fog, (1 - Math.abs(y - cam.y) / 9) * (1 - Math.abs(dzc - 5) / 11));
          items.push({ z, f: () => { const p = cam.p(x, y, z); if (p) cloud(ctx, p.x, p.y, p.k, Math.min(0.8, (p.dz - 3) / 30) * Math.min(1, (DRAW_DIST - p.dz) / 200), y > 120 ? '#e8dcff' : null); } });
        }
      }
    }
    for (const o of s.sky) if (!o.hit && o.z > zMin && o.z < zMax) items.push({ z: o.z, f: () => {
      const q = S.skyObjPos(o, s.t), p = cam.p(q.x, q.y, o.z); if (!p) return;
      if (o.type === 'balloon') balloon(ctx, p.x, p.y, p.k, o.hue, (s.cfg.balloon && s.cfg.balloon.drawR) || 6); else if (o.type === 'bird' || o.type === 'condor') bird(ctx, p.x, p.y, p.k, s.t, o.phase); else if (o.type === 'plane' || o.type === 'heli') plane(ctx, p.x, p.y, p.k, Math.sin(o.phase * 3) > 0 ? 1 : -1, cam.q); else satellite(ctx, p.x, p.y, p.k, s.t, o.phase);
    } });
    for (const pk of s.skyPickups) if (!pk.taken && pk.z > zMin && pk.z < zMax) items.push({ z: pk.z, f: () => {
      const p = cam.p(pk.x, pk.y, pk.z); if (!p) return; pk.type === 'air' ? airCan(ctx, p.x, p.y + p.k, p.k, t) : orb(ctx, p.x, p.y + p.k, p.k, t);
    } });
    // The car (drawn in depth order so a passing plane can cover it)
    const carZ = view.carZ;
    items.push({ z: carZ, car: true, f: () => {
      const p = cam.p(view.carX, view.carY, carZ); if (!p) return;
      const hgt = view.carY - view.groundY;
      if (hgt < 160) { // ground shadow, also cast onto the canyon floor so the drop reads
        const g = cam.p(view.carX, view.groundY, carZ), f = Math.max(0.25, 1 - hgt / 160);
        if (g) shadow(ctx, g.x, g.y, g.k * 1.3 * f + 2, 0.5 * f);
      }
      car(ctx, p.x, p.y + (view.bob || 0) * p.k, p.k, view.roll, 1, view.boostT, { t, spin: view.spin, bank: view.bank, q: cam.q ? 1 : 0 });
      view.carScreen = { x: p.x, y: p.y, k: p.k };
    } });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.f();
    // Flying through a cloud: a soft whiteout with drifting wisps.
    if (fog > 0.02) {
      ctx.globalAlpha = Math.min(0.7, fog * 0.75); ctx.fillStyle = '#ffe6f0'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(0.5, fog * 0.6); ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) { const yy = (hash(i * 5) * H + t * 140 * (1 + i * 0.2)) % H; ctx.beginPath(); ctx.ellipse(W * hash(i * 9), yy, W * 0.4, H * 0.05, 0, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    cam.fog = fog;
    return cam;
  }

  // Tapered streaks radiating from the vanishing point; tinted cyan while boosting.
  function speedLines(ctx, W, H, hy, amount, t, tint, lowQ) {
    if (amount <= 0) return;
    const n = Math.min(46, Math.floor(amount * 42)), cx = W / 2, cy = hy + H * 0.1, R = Math.hypot(W, H) * 0.5;
    const col = tint ? '150,240,255' : '255,240,220';
    for (let i = 0; i < n; i++) {
      const seed = i * 7 + Math.floor(t * 24) * 131, a = hash(seed) * Math.PI * 2, r0 = (0.42 + hash(seed + 3) * 0.35) * R;
      const len = (0.12 + amount * 0.35 * hash(i * 13)) * R, dx = Math.cos(a), dy = Math.sin(a) * 0.75, wdt = 1 + hash(i * 5) * 2.5 * Math.min(1, amount);
      const x0 = cx + dx * r0, y0 = cy + dy * r0, x1 = cx + dx * (r0 + len), y1 = cy + dy * (r0 + len);
      const al = Math.min(0.75, 0.25 + amount * 0.45);
      if (lowQ) ctx.strokeStyle = `rgba(${col},${al * 0.6})`; else { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${al})`); ctx.strokeStyle = g; } ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }

  root.CJRender = { drawWorld, speedLines, car, airCan, PAL, hash, ROAD_HALF };
})(typeof globalThis !== 'undefined' ? globalThis : this);
