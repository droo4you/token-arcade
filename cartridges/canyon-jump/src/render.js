/* Canyon Jump renderer: pseudo-3D chase cam on a 2D canvas. Render-only randomness is hashed from world
   positions so scenery is stable frame to frame and never touches the simulation. */
(function (root) {
  'use strict';
  const S = root.CJSim, C = S.C;
  const SEG = 6, DRAW_DIST = 720, ROAD_HALF = C.LANE_W * 1.5 + 1.3, CANYON_DEPTH = 170;
  const PAL = {
    skyTop: '#1b0f3b', skyMid: '#5b1f6e', skyLow: '#e0475f', skyHorizon: '#ffa24a', sun1: '#fff1a8', sun2: '#ff5a78',
    mesaFar: '#8a3a6e', mesaMid: '#6a2a5c', mesaNear: '#47204a',
    sandA: '#e3925a', sandB: '#d98450', road: '#3a2a3f', roadB: '#35263a', lane: '#ffe9c4', rumbleA: '#ff3b5c', rumbleB: '#fff4e0',
    canyon: ['#b2463a', '#8f3330', '#c4593f', '#7a2a2c', '#5d2028', '#3f1520'], river: '#2fc4c9',
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
      W, H, F, hy, x: cam.x, y: cam.y, z: cam.z, roll: cam.roll || 0,
      p(x, y, z) {
        const dz = z - cam.z; if (dz < 0.6) return null;
        const k = F / dz; return { x: W / 2 + (x - cam.x) * k, y: hy + (cam.y - y) * k, k, dz };
      },
    };
  }

  function sky(ctx, W, H, hy, alt, t) {
    const night = Math.min(1, Math.max(0, (alt - 60) / 200));
    const g = ctx.createLinearGradient(0, 0, 0, hy + 4);
    g.addColorStop(0, night > 0 ? mix(PAL.skyTop, '#07051a', night) : PAL.skyTop);
    g.addColorStop(0.45, mix(PAL.skyMid, '#24104a', night));
    g.addColorStop(0.8, mix(PAL.skyLow, '#7a2b6a', night * 0.6));
    g.addColorStop(1, PAL.skyHorizon);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy + 4);
    if (night > 0.05) { // stars fade in as you climb
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 90; i++) {
        const sx = hash(i * 3) * W, sy = hash(i * 5 + 1) * hy * 0.8, tw = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.globalAlpha = night * tw * 0.8; ctx.fillRect(sx, sy, 1.6, 1.6);
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
    const r = H * 0.2, cx = W * 0.5 - camX * 1.5, cy = hy - r * 0.35;
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
      const pts = MESAS[L], step = W / 22 * (1 + L * 0.35), hgt = H * (0.07 + L * 0.045);
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
          quad(ctx, a, b, c, d, idx % 2 ? '#4a1a24' : '#52202a');
          const ra = cam.p(-14 + Math.sin(za * 0.02) * 8, -CANYON_DEPTH, Math.max(za, cam.z + 0.7)), rb = cam.p(14 + Math.sin(za * 0.02) * 8, -CANYON_DEPTH, Math.max(za, cam.z + 0.7));
          const rc = cam.p(14 + Math.sin(zb * 0.02) * 8, -CANYON_DEPTH, zb), rd = cam.p(-14 + Math.sin(zb * 0.02) * 8, -CANYON_DEPTH, zb);
          if (ra && rc) quad(ctx, ra, rb, rc, rd, idx % 3 ? PAL.river : '#7fe8e4');
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
  function canyonWall(ctx, cam, far) {
    // Far wall face, layered sandstone strata, seen from the near rim or from the air.
    const n = PAL.canyon.length, BIG = 3000;
    for (let i = 0; i < n; i++) {
      const y0 = -i * CANYON_DEPTH / n, y1 = -(i + 1) * CANYON_DEPTH / n;
      const a = cam.p(-BIG, y0, far), b = cam.p(BIG, y0, far), c = cam.p(BIG, y1, far), d = cam.p(-BIG, y1, far);
      if (a) quad(ctx, a, b, c, d, PAL.canyon[i]);
    }
    // eroded streaks for texture
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) {
      const x = (hash(i * 17) - 0.5) * 900, w = 2 + hash(i * 3) * 10, depth = 30 + hash(i * 5) * 120;
      const a = cam.p(x, 0, far), c = cam.p(x + w, -depth, far);
      if (a && c) { ctx.fillStyle = i % 2 ? '#3f1520' : '#e0784e'; ctx.fillRect(a.x, a.y, Math.max(1, c.x - a.x), c.y - a.y); }
    }
    ctx.globalAlpha = 1;
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
    const z1 = C.ROAD_LEN, z0 = z1 - 26, h = ROAD_HALF + 0.7;
    const a = cam.p(-h, 0, z0), b = cam.p(h, 0, z0), c = cam.p(h, 2.4, z1), d = cam.p(-h, 2.4, z1);
    if (!a || !c) return;
    // sides
    const bl = cam.p(-h, 0, z1), br = cam.p(h, 0, z1);
    quad(ctx, a, d, bl, a, '#5a2a2a'); quad(ctx, b, c, br, b, '#5a2a2a');
    quad(ctx, a, b, c, d, '#ffd23f');
    for (let i = 0; i < 7; i++) {
      const x0 = -h + i * (2 * h / 7), x1 = x0 + h / 7;
      const p = cam.p(x0, 0, z0), q = cam.p(x1, 0, z0), r = cam.p(x1 + 0.5, 2.4, z1), s = cam.p(x0 + 0.5, 2.4, z1);
      if (p && r) quad(ctx, p, q, r, s, '#2b1b2b');
    }
    if (d && c) { ctx.fillStyle = '#fff4e0'; ctx.fillRect(d.x, d.y - 3, c.x - d.x, 3); }
  }
  function sign(ctx, x, y, k, text, color) {
    const w = 4.2 * k, h = 1.5 * k, top = y - 4.2 * k;
    ctx.fillStyle = '#3a2433'; ctx.fillRect(x - k * 0.08, top + h, k * 0.16, 4.2 * k - h);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = '#1a0f1f'; ctx.fillRect(x - w / 2 + k * 0.1, top + k * 0.1, w - k * 0.2, h - k * 0.2);
    if (k > 3) { ctx.fillStyle = color; ctx.font = `900 ${Math.round(h * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, top + h / 2 + 1); }
  }
  function bird(ctx, x, y, k, t, ph) {
    const s = 1.3 * k, f = Math.sin(t * 12 + ph);
    ctx.strokeStyle = '#2a1430'; ctx.lineWidth = Math.max(1.5, k * 0.22); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s, y - f * s * 0.5); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.2, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.2, x + s, y - f * s * 0.5); ctx.stroke();
    ctx.fillStyle = '#2a1430'; ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, 7); ctx.fill();
  }
  function plane(ctx, x, y, k, dir) {
    const L = 8 * k, H = 1.2 * k;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = '#c9b8d8'; ctx.beginPath(); ctx.moveTo(-L * 0.1, 0); ctx.lineTo(-L * 0.35, H * 1.9); ctx.lineTo(-L * 0.2, H * 1.9); ctx.lineTo(L * 0.12, 0); ctx.fill();
    const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a99cc4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, L / 2, H / 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.moveTo(-L * 0.38, -H * 0.2); ctx.lineTo(-L * 0.5, -H * 1.6); ctx.lineTo(-L * 0.42, -H * 1.6); ctx.lineTo(-L * 0.26, -H * 0.3); ctx.fill();
    ctx.fillStyle = '#3d2a5c'; for (let i = 0; i < 7; i++) ctx.fillRect(-L * 0.22 + i * L * 0.07, -H * 0.18, L * 0.025, H * 0.2);
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(L * 0.47, -H * 0.05, k * 0.25, 0, 7); ctx.fill();
    ctx.restore();
  }
  function satellite(ctx, x, y, k, t, ph) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.6 + ph) * 0.4);
    const p = 2.6 * k, b = 0.9 * k;
    ctx.fillStyle = '#9aa2c8'; ctx.fillRect(-p - b / 2, -k * 0.06, p * 2 + b, k * 0.12);
    for (const s of [-1, 1]) {
      const px = s < 0 ? -p - b / 2 : b / 2 + k * 0.1;
      ctx.fillStyle = '#1e3a8a'; ctx.fillRect(px, -b * 0.6, p - k * 0.1, b * 1.2);
      ctx.strokeStyle = '#6aa0ff'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + i * (p / 4), -b * 0.6); ctx.lineTo(px + i * (p / 4), b * 0.6); ctx.stroke(); }
    }
    const g = ctx.createLinearGradient(-b / 2, 0, b / 2, 0); g.addColorStop(0, '#b8862a'); g.addColorStop(0.5, '#ffe08a'); g.addColorStop(1, '#a06d1a');
    ctx.fillStyle = g; ctx.fillRect(-b / 2, -b / 2, b, b);
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, -b / 2); ctx.lineTo(0, -b * 1.4); ctx.stroke();
    ctx.fillStyle = (Math.floor(t * 2) % 2) ? '#ff3b5c' : '#5a1020'; ctx.beginPath(); ctx.arc(0, -b * 1.45, k * 0.12 + 1, 0, 7); ctx.fill();
    ctx.restore();
  }
  function cloud(ctx, x, y, k, a) {
    ctx.globalAlpha = a; ctx.fillStyle = '#ffd9e6';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + (i - 2) * k * 3, y + Math.abs(i - 2) * k * 0.6, k * (3.6 - Math.abs(i - 2) * 0.6), k * (1.8 - Math.abs(i - 2) * 0.2), 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#c86a9a'; ctx.beginPath(); ctx.ellipse(x, y + k * 1.2, k * 9, k * 0.8, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* The roadster: an original low wedge EV seen from behind. No marques, no badges. */
  function car(ctx, x, y, k, roll, glow, boostT) {
    const w = 2.0 * k, h = 0.95 * k;
    ctx.save(); ctx.translate(x, y - h * 0.5); ctx.rotate(roll);
    if (boostT > 0) { // thruster plume
      const L = k * (1.4 + boostT * 2.2);
      for (const sx of [-0.45, 0.45]) {
        const g = ctx.createLinearGradient(0, 0, 0, L); g.addColorStop(0, 'rgba(220,255,255,0.95)'); g.addColorStop(0.3, 'rgba(80,220,255,0.7)'); g.addColorStop(1, 'rgba(120,80,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx * w - k * 0.22, h * 0.3); ctx.lineTo(sx * w + k * 0.22, h * 0.3); ctx.lineTo(sx * w, h * 0.3 + L); ctx.closePath(); ctx.fill();
      }
    }
    // tires
    ctx.fillStyle = '#140c16';
    ctx.beginPath(); ctx.roundRect(-w * 0.52, h * 0.05, w * 0.2, h * 0.5, k * 0.08); ctx.fill();
    ctx.beginPath(); ctx.roundRect(w * 0.32, h * 0.05, w * 0.2, h * 0.5, k * 0.08); ctx.fill();
    // body
    const g = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.45);
    g.addColorStop(0, '#ff5a63'); g.addColorStop(0.35, '#e8102c'); g.addColorStop(1, '#7a0618');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.4); ctx.lineTo(-w * 0.5, -h * 0.02); ctx.quadraticCurveTo(-w * 0.48, -h * 0.22, -w * 0.36, -h * 0.26);
    ctx.lineTo(w * 0.36, -h * 0.26); ctx.quadraticCurveTo(w * 0.48, -h * 0.22, w * 0.5, -h * 0.02); ctx.lineTo(w * 0.5, h * 0.4); ctx.closePath(); ctx.fill();
    // cabin glass reflecting the sunset
    const gl = ctx.createLinearGradient(0, -h * 0.75, 0, -h * 0.25); gl.addColorStop(0, '#2a1440'); gl.addColorStop(0.6, '#a03c6e'); gl.addColorStop(1, '#ffb35a');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.26); ctx.quadraticCurveTo(-w * 0.24, -h * 0.72, 0, -h * 0.74); ctx.quadraticCurveTo(w * 0.24, -h * 0.72, w * 0.3, -h * 0.26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-w * 0.18, -h * 0.32); ctx.lineTo(-w * 0.08, -h * 0.66); ctx.lineTo(-w * 0.02, -h * 0.66); ctx.lineTo(-w * 0.1, -h * 0.32); ctx.fill();
    // highlight crease
    ctx.fillStyle = 'rgba(255,220,220,0.45)'; ctx.fillRect(-w * 0.46, -h * 0.2, w * 0.92, Math.max(1, h * 0.04));
    // full-width light bar
    ctx.save(); ctx.shadowColor = '#ff2a4a'; ctx.shadowBlur = k * 0.6 * glow;
    ctx.fillStyle = '#ff4d6a'; ctx.fillRect(-w * 0.47, -h * 0.08, w * 0.94, h * 0.1);
    ctx.fillStyle = '#ffd0d8'; ctx.fillRect(-w * 0.47, -h * 0.06, w * 0.12, h * 0.05); ctx.fillRect(w * 0.35, -h * 0.06, w * 0.12, h * 0.05);
    ctx.restore();
    // diffuser
    ctx.fillStyle = '#2a0a14'; ctx.beginPath(); ctx.roundRect(-w * 0.34, h * 0.2, w * 0.68, h * 0.2, k * 0.05); ctx.fill();
    ctx.fillStyle = '#4a1424'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * w * 0.1 - 1, h * 0.22, 2, h * 0.16);
    ctx.restore();
  }

  function drawWorld(ctx, W, H, s, view) {
    const cam = makeCam(W, H, view.cam);
    const t = view.t, alt = Math.max(0, cam.y - 3);
    sky(ctx, W, H, cam.hy, alt, t);
    sun(ctx, W, cam.hy, cam.x, H);
    mesas(ctx, W, cam.hy, H, cam.x, cam.z, alt);
    ground(ctx, cam);
    // Collect billboards
    const items = [];
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
    if (C.ROAD_LEN > zMin - 30 && C.ROAD_LEN - 26 < zMax) items.push({ z: C.ROAD_LEN, f: () => ramp(ctx, cam) });
    // Roadside scenery and signs (cosmetic only).
    const sStart = Math.floor(zMin / 23), sEnd = Math.floor(zMax / 23);
    for (let i = sStart; i <= sEnd; i++) {
      const z = i * 23 + hash(i) * 10; if (z > C.ROAD_LEN - 30 && z < C.ROAD_LEN + C.CANYON_W + 10) continue;
      const side = hash(i * 3) < 0.5 ? -1 : 1, x = side * (ROAD_HALF + 4 + hash(i * 7) * 40), kind = hash(i * 11);
      items.push({ z, f: () => { const p = cam.p(x, 0, z); if (!p) return; kind < 0.55 ? cactus(ctx, p.x, p.y, p.k * (0.8 + kind * 0.6), kind) : rock(ctx, p.x, p.y, p.k * (1 + kind)); } });
    }
    for (let d = 500; d < C.ROAD_LEN; d += 500) { const z = C.ROAD_LEN - d; if (z > zMin && z < zMax) items.push({ z, f: () => { const p = cam.p(ROAD_HALF + 2.5, 0, z); if (p) sign(ctx, p.x, p.y, p.k, `CANYON ${d}m`, '#ffd23f'); } }); }
    for (let d = 100; d < 4000; d += 100) { const z = C.ROAD_LEN + C.CANYON_W + d; if (z > zMin && z < zMax) items.push({ z, f: () => { const p = cam.p(-ROAD_HALF - 2.5, 0, z); if (p) sign(ctx, p.x, p.y, p.k, `+${d}m`, '#5af0ff'); } }); }
    { const z = C.ROAD_LEN + C.CANYON_W + 2; if (z > zMin && z < zMax) items.push({ z, f: () => { const p = cam.p(ROAD_HALF + 2.5, 0, z); if (p) sign(ctx, p.x, p.y, p.k, 'FAR RIM', '#5af0ff'); } }); }
    // Clouds in the sky lanes
    if (s.phase !== 'road' || cam.z > C.ROAD_LEN - 700) {
      const c0 = Math.floor(zMin / 90), c1 = Math.floor(zMax / 90);
      for (let i = c0; i <= c1; i++) {
        if (i * 90 < C.ROAD_LEN - 200) continue;
        for (let j = 0; j < 2; j++) {
          const z = i * 90 + hash(i * 13 + j) * 80, x = (hash(i * 5 + j * 3) - 0.5) * 160, y = 25 + hash(i * 7 + j) * 230;
          items.push({ z, f: () => { const p = cam.p(x, y, z); if (p) cloud(ctx, p.x, p.y, p.k, Math.min(0.75, (p.dz - 4) / 40) * Math.min(1, (DRAW_DIST - p.dz) / 200)); } });
        }
      }
    }
    for (const o of s.sky) if (!o.hit && o.z > zMin && o.z < zMax) items.push({ z: o.z, f: () => {
      const q = S.skyObjPos(o, s.t), p = cam.p(q.x, q.y, o.z); if (!p) return;
      if (o.type === 'bird') bird(ctx, p.x, p.y, p.k, s.t, o.phase); else if (o.type === 'plane') plane(ctx, p.x, p.y, p.k, o.vx > 0 ? 1 : -1); else satellite(ctx, p.x, p.y, p.k, s.t, o.phase);
    } });
    for (const pk of s.skyPickups) if (!pk.taken && pk.z > zMin && pk.z < zMax) items.push({ z: pk.z, f: () => {
      const p = cam.p(pk.x, pk.y, pk.z); if (!p) return; pk.type === 'air' ? airCan(ctx, p.x, p.y + p.k, p.k, t) : orb(ctx, p.x, p.y + p.k, p.k, t);
    } });
    // The car (drawn in depth order so a passing plane can cover it)
    const carZ = view.carZ;
    items.push({ z: carZ, car: true, f: () => {
      const p = cam.p(view.carX, view.carY, carZ); if (!p) return;
      if (view.carY < 40 && s.phase !== 'fall') {
        const g = cam.p(view.carX, view.groundY, carZ);
        if (g && view.groundY === 0) shadow(ctx, g.x, g.y, p.k * 1.2 * Math.max(0.3, 1 - view.carY / 40), 0.45 * Math.max(0.2, 1 - view.carY / 40));
      }
      car(ctx, p.x, p.y, p.k, view.roll, 1, view.boostT);
      view.carScreen = { x: p.x, y: p.y, k: p.k };
    } });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.f();
    return cam;
  }

  function speedLines(ctx, W, H, hy, amount, t) {
    if (amount <= 0) return;
    ctx.strokeStyle = 'rgba(255,240,220,0.5)'; ctx.lineWidth = 1.5;
    const n = Math.floor(amount * 40);
    for (let i = 0; i < n; i++) {
      const a = hash(i * 7 + Math.floor(t * 30) * 131) * Math.PI * 2, r0 = (0.35 + hash(i * 3 + Math.floor(t * 30)) * 0.4) * W * 0.6;
      const len = 30 + amount * 120 * hash(i * 13);
      const cx = W / 2, cy = hy + H * 0.12, dx = Math.cos(a), dy = Math.sin(a) * 0.7;
      ctx.globalAlpha = 0.25 + amount * 0.5;
      ctx.beginPath(); ctx.moveTo(cx + dx * r0, cy + dy * r0); ctx.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  root.CJRender = { drawWorld, speedLines, car, airCan, PAL, hash, ROAD_HALF };
})(typeof globalThis !== 'undefined' ? globalThis : this);
