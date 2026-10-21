/* Skrump Lab: Weapons Test — renderer (canvas 2D, pseudo-3D lab), input, HUD, narrator, Token Arcade bridge (Free Play only). */
(function () {
  'use strict';
  const S = window.SkrumpSim, A = window.SLAudio, TA = window.TokenArcade;
  const params = new URLSearchParams(TA && TA.embedded ? '' : location.search);
  const AUTOPILOT = params.get('autopilot') === '1';
  const cv = document.getElementById('game'), cx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const G = { screen: 'title', t: 0, run: null, acc: 0, paused: false, destroyed: false, raf: 0, caption: '', capT: -9, aim: null, parts: [], cards: null, cardsT: -9,
    introT: -9, waitUntil: 0, pending: null, result: null, arcadeRunOpen: false, shake: 0, spin: new Map(), runT: 0, flash: 0, auto: null };
  const BEST_KEY = 'skrump-lab-best'; let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* none */ }

  /* ---------- sprites ---------- */
  const IMG = {}; const LOOKS = ['10-pink', '314-pink', '20-pink'];
  ['3', '690', '2912', '2067', '1764', '38', '210', ...LOOKS].forEach(id => { const im = new Image(); im.src = 'assets/sprites/' + id + '.png'; IMG[id] = im; });
  const WF = () => S.FIGS[G.run.fig]; // current weapon (registry entry, see weapons.js)
  const say = (tpl, v) => window.SkrumpWeapons.fill(tpl, v || {});
  const JUDGES = ['1764', '38', '210'];

  /* ---------- layout ---------- */
  let sc = 20, ox = 0, fy = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    sc = Math.min(W / 57, H / 27); ox = (W - 54 * sc) / 2 + 2 * sc; fy = H - Math.max(H * 0.13, 3.2 * sc);
  }
  const X = x => ox + x * sc, Y = y => fy - y * sc;
  addEventListener('resize', resize); resize();

  /* render-only randomness (never touches the sim) */
  let rs = 987654321; const rr = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const CUBES = Array.from({ length: 22 }, () => ({ x: rr(), y: rr() * 0.75, z: 0.3 + rr() * 0.9, s: 0.5 + rr(), r: rr() * 6.28, vr: (rr() - 0.5) * 0.6, ph: rr() * 6.28, c: ['#ff5fa8', '#ff8fc4', '#7a5cff', '#5b6dff', '#ffffff', '#c86bff'][Math.floor(rr() * 6)] }));

  /* ---------- narrator ---------- */
  function narrate(text, speak = true) { G.caption = text; G.capT = G.t; if (speak) A.say(text); }

  /* ---------- run lifecycle ---------- */
  function startRun() {
    if (TA && TA.active && !TA.beginRun()) return;
    G.arcadeRunOpen = !!(TA && TA.active);
    A.init();
    const seed = params.has('seed') ? (+params.get('seed') >>> 0) : (Math.random() * 4294967296) >>> 0;
    G.run = S.newRun(seed); G.result = null; G.parts.length = 0; G.spin.clear(); G.runT = 0; G.cards = null;
    G.screen = 'intro'; G.introT = G.t; G.aim = null; G.pending = null;
    narrate(say(WF().lines.intro));
  }
  function figIntro() { G.cards = null; G.tankX = null; G.screen = 'intro'; G.introT = G.t; narrate(say(WF().lines.intro)); }
  function fire(qx, qy) {
    const r = G.run; if (!S.canFire(r)) return;
    const f = S.cur(r), wasClear = f.cleared;
    if (!S.fire(r, qx, qy)) return;
    const F = WF(); G.aim = null; G.screen = 'flight'; G.shake = F.shake;
    A.sfx(F.sfx);
    if (F.rules.ceasefire && f.shotsFired === 2) { narrate(say(F.lines.secondFire)); A.sfx('alarm'); G.flash = G.t; }
    else if (wasClear) narrate('Overkill: yes.');
  }
  function conclude() { if (S.conclude(G.run)) afterFig(); }
  function onShotEnd() {
    const r = G.run, f = r.figs[r.fig], s = r.lastShot, F = S.FIGS[r.fig];
    const ratio = f.N ? s.displaced / f.N : 0;
    G.cards = JUDGES.map((_, k) => Math.max(0, Math.min(10, Math.round(ratio * 10 + (k - 1) * (s.overkill ? -2 : 0.6)))));
    G.cardsT = G.t; A.sfx('card');
    let line;
    const v = { range: Math.round(s.range * 10) / 10, displaced: f.displaced, N: f.N, gained: s.displaced };
    if (F.lines.shot) line = say(F.lines.shot, v);
    else if (s.overkill) line = 'Overkill: yes. Noted.';
    else if (s.wasted) line = 'No subjects displaced. Noted.';
    else line = say(f.shotsFired === 1 ? F.lines.first : F.lines.more, v);
    if (f.cleared && !s.overkill) line += ' All subjects displaced.';
    if (F.lines.last && f.shotsFired === F.shots) line += ' ' + F.lines.last;
    narrate(line);
    G.screen = 'verdict-shot'; G.waitUntil = G.t + (AUTOPILOT ? 2.6 : 3.2);
    G.pending = r.phase === 'figdone' ? 'fig' : 'aim';
  }
  function afterFig() {
    const r = G.run; S.next(r);
    if (r.over) finish(); else figIntro();
  }
  function finish() {
    const r = S.score(G.run); G.result = r; G.screen = 'end'; G.endT = G.t;
    if (r.total > best) { best = r.total; r.newBest = true; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ } }
    narrate(`Testing is complete. Subjects displaced: ${r.displaced} of ${r.N}. Overkill: ${r.overkill ? 'yes' : 'no'}. Score: ${r.total}.`);
    A.sfx('stamp');
    if (G.arcadeRunOpen && TA && TA.active) {
      G.arcadeRunOpen = false;
      const [f1, f2, f3, f4, f5] = r.figs;
      TA.complete({ result: 'completed', primaryMetric: r.total, durationMs: Math.round(G.runT * 1000),
        secondaryMetrics: { displaced: r.displaced, subjects: r.N, shots: r.shots, perShotX100: r.perShotX100, clears: r.clears, overkill: r.overkill, wasted: r.wasted,
          fig1Displaced: f1 ? f1.displaced : 0, fig2Displaced: f2 ? f2.displaced : 0, fig3Displaced: f3 ? f3.displaced : 0, fig4Displaced: f4 ? f4.displaced : 0, fig5Displaced: f5 ? f5.displaced : 0, ticks: r.ticks } });
    }
  }

  /* ---------- autopilot (testing / previews) ---------- */
  function autoPick() {
    const r = G.run, f = S.cur(r);
    if (f.cleared) return null; // conclude
    const cands = S.FIGS[r.fig].auto;
    let best = null;
    for (const [qx, qy] of cands) { const rep = S.replay(r.seed, [...r.inputs, ['F', qx, qy]]); const d = rep.run ? rep.run.figs[r.fig].displaced : -1; if (!best || d > best[0]) best = [d, qx, qy]; }
    return [best[1], best[2]];
  }

  /* ---------- update ---------- */
  function update(dt) {
    G.t += dt;
    if (G.paused || !G.run) { updateParts(dt); return; }
    const r = G.run;
    if (G.screen !== 'end') G.runT += dt;
    if (G.screen === 'intro' && G.t - G.introT > (AUTOPILOT ? 1.6 : 2.2)) G.screen = 'aim';
    if (G.screen === 'aim' && AUTOPILOT) {
      if (!G.auto) { const p = autoPick(); G.auto = { p, t0: G.t }; }
      const k = Math.min(1, (G.t - G.auto.t0) / 1.1);
      if (!G.auto.p) { if (k >= 1) { G.auto = null; conclude(); } }
      else { G.aim = { qx: Math.round(G.auto.p[0] * k), qy: Math.round(G.auto.p[1] * k), auto: true }; if (G.t - G.auto.t0 > 1.6) { const [qx, qy] = G.auto.p; G.auto = null; fire(qx, qy); } }
    }
    if (G.screen === 'flight') {
      G.acc += Math.min(dt, 0.1);
      let n = 0; const seen = r.shot ? r.shot.events.length : 0;
      while (G.acc >= S.DT && n < 40 && r.phase === 'flight') { S.step(r); G.acc -= S.DT; n++; }
      for (const b of r.bodies) if (!b.sleep && !b.out) G.spin.set(b.id, (G.spin.get(b.id) || 0) - b.vx * dt / b.r * 0.6);
      const ev = r.shot ? r.shot.events : null;
      if (ev) for (let i = seen; i < ev.length; i++) { impact(ev[i]); }
      if (r.phase !== 'flight') { G.acc = 0; onShotEnd(); }
    }
    if (G.screen === 'verdict-shot' && G.t > G.waitUntil) {
      if (G.pending === 'fig') afterFig(); else G.screen = 'aim';
    }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
    updateParts(dt);
  }
  function impact(e) {
    A.sfx('impact', e.s);
    if (e.s > 9) G.shake = Math.max(G.shake, G.run && WF().frame === 'bigtank' ? 0.55 : 0.18);
    const n = Math.min(10, 2 + Math.floor(e.s / 3));
    for (let i = 0; i < n; i++) G.parts.push({ x: e.x, y: e.y, vx: (rr() - 0.5) * 10, vy: rr() * 9, life: 0.7 + rr() * 0.8, t: 0, s: 0.18 + rr() * 0.3, c: CUBES[i % CUBES.length].c, rot: rr() * 6 });
    if (G.parts.length > 220) G.parts.splice(0, G.parts.length - 220);
  }
  function updateParts(dt) { for (const p of G.parts) { p.t += dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.3; p.vx *= 0.7; } p.rot += dt * 3; } G.parts = G.parts.filter(p => p.t < p.life); }

  /* ---------- drawing ---------- */
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const PINK = '#ff5fa8';
  function cube(x, y, s, rot, c, a) {
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.globalAlpha = a;
    cx.fillStyle = c; cx.fillRect(-s / 2, -s / 2, s, s);
    cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.beginPath(); cx.moveTo(-s / 2, -s / 2); cx.lineTo(-s / 4, -s * 0.75); cx.lineTo(s * 0.75, -s * 0.75); cx.lineTo(s / 2, -s / 2); cx.fill();
    cx.fillStyle = 'rgba(0,0,0,0.3)'; cx.beginPath(); cx.moveTo(s / 2, -s / 2); cx.lineTo(s * 0.75, -s * 0.75); cx.lineTo(s * 0.75, s / 4); cx.lineTo(s / 2, s / 2); cx.fill();
    cx.restore();
  }
  function drawLab() {
    const g = cx.createRadialGradient(W * 0.55, H * 0.2, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#2a2438'); g.addColorStop(0.5, '#15121e'); g.addColorStop(1, '#07060a');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    // wall panels
    cx.strokeStyle = 'rgba(255,255,255,0.04)'; cx.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const x = (i / 14) * W; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, fy); cx.stroke(); }
    cx.beginPath(); cx.moveTo(0, fy - 9 * sc); cx.lineTo(W, fy - 9 * sc); cx.stroke();
    // spotlight cones
    for (const [x0, x1] of [[0.32, 0.5], [0.66, 0.78]]) { const lg = cx.createLinearGradient(0, 0, 0, fy); lg.addColorStop(0, 'rgba(190,180,255,0.16)'); lg.addColorStop(1, 'rgba(190,180,255,0)'); cx.fillStyle = lg; cx.beginPath(); cx.moveTo(W * x0, 0); cx.lineTo(W * (x0 + 0.05), 0); cx.lineTo(W * x1 + 6 * sc, fy); cx.lineTo(W * x1 - 6 * sc, fy); cx.fill(); }
    // far cubes
    for (const c of CUBES) if (c.z < 0.8) cube(c.x * W, c.y * fy * 0.9 + Math.sin(G.t * 0.6 + c.ph) * 6, c.s * sc * c.z * 0.8, c.r + G.t * c.vr, c.c, 0.25 + c.z * 0.35);
    // floor
    const fg = cx.createLinearGradient(0, fy, 0, H); fg.addColorStop(0, '#1d1a26'); fg.addColorStop(1, '#0b0a10');
    cx.fillStyle = fg; cx.fillRect(0, fy, W, H - fy);
    cx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = -12; i <= 12; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * W * 0.06, fy); cx.lineTo(W / 2 + i * W * 0.2, H); cx.stroke(); }
    for (let k = 1; k < 5; k++) { const y = fy + (H - fy) * (k * k) / 25; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    // neon tracks
    cx.save(); cx.strokeStyle = PINK;
    for (const t of [0.22, 0.62]) { const y = fy + (H - fy) * t; for (const [lw, a] of [[sc * 0.7, 0.12], [sc * 0.35, 0.25], [Math.max(2, sc * 0.14), 1]]) { cx.globalAlpha = a; cx.lineWidth = lw; cx.beginPath(); cx.moveTo(-10, y); cx.lineTo(W + 10, y + (H - fy) * 0.08); cx.stroke(); } }
    cx.globalAlpha = 1;
    cx.beginPath(); cx.moveTo(X(-6), fy); cx.lineTo(X(64), fy); cx.lineWidth = Math.max(1.5, sc * 0.1); cx.stroke();
    cx.restore();
  }
  function drawBooth() {
    const bw = Math.min(W * 0.3, 22 * sc), bh = bw * 0.36, bx = W - bw - W * 0.04, by = Math.max(H * 0.06, 14);
    cx.save();
    cx.fillStyle = 'rgba(160,170,220,0.10)'; cx.strokeStyle = 'rgba(220,225,255,0.35)'; cx.lineWidth = 1.5;
    cx.fillRect(bx, by, bw, bh); cx.strokeRect(bx, by, bw, bh);
    cx.fillStyle = 'rgba(255,255,255,0.06)'; cx.beginPath(); cx.moveTo(bx + bw * 0.1, by); cx.lineTo(bx + bw * 0.28, by); cx.lineTo(bx + bw * 0.12, by + bh); cx.lineTo(bx - bw * 0.06 + bw * 0.06, by + bh); cx.fill();
    const desk = by + bh * 0.68;
    for (let k = 0; k < 3; k++) {
      const jx = bx + bw * (0.2 + k * 0.3), im = IMG[JUDGES[k]], s = bh * 0.55, bob = Math.sin(G.t * 2 + k) * 1.5;
      if (im.complete && im.naturalWidth) cx.drawImage(im, jx - s / 2, desk - s * 0.9 + bob, s, s * im.naturalHeight / im.naturalWidth);
      cx.fillStyle = '#2b2838'; cx.fillRect(jx - bw * 0.13, desk, bw * 0.26, bh * 0.22);
      cx.fillStyle = PINK; cx.fillRect(jx - bw * 0.13, desk, bw * 0.26, 2);
      if (G.cards && G.t - G.cardsT < 3.4) { // hold up score cards
        const up = Math.min(1, (G.t - G.cardsT - k * 0.15) * 5); if (up > 0) {
          const cw = bh * 0.34, ch = bh * 0.26, cxp = jx + bw * 0.06, cyp = desk - ch - bh * 0.25 * up;
          cx.fillStyle = '#f4f2ff'; cx.fillRect(cxp - cw / 2, cyp, cw, ch); cx.fillStyle = '#1b1726'; cx.font = `bold ${Math.round(ch * 0.7)}px ${MONO}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(G.cards[k]), cxp, cyp + ch / 2 + 1);
          cx.fillStyle = '#9993aa'; cx.fillRect(cxp - 1, cyp + ch, 2, bh * 0.2); } }
    }
    cx.font = `900 ${Math.round(bh * 0.5)}px system-ui, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.fillStyle = '#c99ad8';
    cx.fillText('S', bx + bw / 2, by + bh + 4);
    cx.font = `${Math.max(9, Math.round(bh * 0.085))}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.45)'; cx.textAlign = 'left'; cx.fillText('VIP BOX · JUDGES', bx + 4, by + 4);
    cx.restore();
  }
  function drawBoxes(r) {
    for (const k of r.boxes) { if (k.kind === 'floor') continue;
      cx.fillStyle = '#2e2b3a'; cx.fillRect(X(k.x0), Y(k.y1), (k.x1 - k.x0) * sc, (k.y1 - k.y0) * sc);
      cx.fillStyle = '#3b3749'; cx.fillRect(X(k.x0) + sc * 0.25, Y(k.y1) - sc * 0.25, (k.x1 - k.x0) * sc, sc * 0.25);
      cx.fillStyle = PINK; cx.fillRect(X(k.x0), Y(k.y1), (k.x1 - k.x0) * sc, Math.max(1.5, sc * 0.08)); }
  }
  function aimAngle(r) { const a = G.aim; if (a && (a.qx || a.qy)) return Math.atan2(a.qy, a.qx); return S.FIGS[r.fig].aimDefault; }
  function drawLauncher(r) {
    const F = S.FIGS[r.fig], ang = aimAngle(r);
    // tanks that roll forward each shell glide to the next firing spot (render only; the sim uses S.muzzleX)
    const adv = F.fire.advance || 0, tgt = F.launcher.x + adv * (S.cur(r).shotsFired - (r.phase === 'flight' ? 1 : 0));
    G.tankX = G.tankX == null ? tgt : G.tankX + (tgt - G.tankX) * 0.08; const LX = adv ? G.tankX : F.launcher.x;
    const lx = X(LX), ly = Y(F.launcher.y);
    cx.save();
    if (F.frame === 'catapult') { // catapult frame
      cx.strokeStyle = '#4a4458'; cx.lineWidth = sc * 0.35; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(lx - 1.8 * sc, fy); cx.lineTo(lx - 0.2 * sc, ly + 0.6 * sc); cx.lineTo(lx + 1.6 * sc, fy); cx.stroke();
      cx.fillStyle = '#3a3546'; cx.fillRect(lx - 2.6 * sc, fy - 0.7 * sc, 5.2 * sc, 0.7 * sc);
      cx.fillStyle = '#111'; for (const w of [-1.9, 1.9]) { cx.beginPath(); cx.arc(lx + w * sc, fy - 0.1 * sc, 0.55 * sc, 0, 6.29); cx.fill(); }
      cx.strokeStyle = '#6a627c'; cx.lineWidth = sc * 0.25; cx.beginPath(); cx.moveTo(lx - 0.2 * sc, ly + 0.6 * sc); cx.lineTo(lx - Math.cos(ang) * 1.3 * sc * (G.aim ? 1.6 : 1), ly + Math.sin(ang) * 1.3 * sc * (G.aim ? 1.6 : 1)); cx.stroke();
    } else if (F.frame === 'bigtank') { // A BIGGER TANK: ~1.8x chassis, long fat barrel, glowing muzzle ring
      const k = 1.8; cx.fillStyle = '#121117'; cx.fillRect(lx - 2.9 * k * sc, fy - 1.0 * k * sc, 5.8 * k * sc, 1.0 * k * sc);
      cx.fillStyle = '#2f2e26'; cx.fillRect(lx - 2.4 * k * sc, fy - 2.0 * k * sc, 4.6 * k * sc, 1.05 * k * sc); cx.fillRect(lx - 1.2 * k * sc, fy - 2.7 * k * sc, 2.3 * k * sc, 0.8 * k * sc);
      cx.fillStyle = '#4b4a43'; for (let i = 0; i < 8; i++) { cx.beginPath(); cx.arc(lx + (-2.5 + i * 0.72) * k * sc, fy - 0.5 * k * sc, 0.3 * k * sc, 0, 6.29); cx.fill(); }
      cx.fillStyle = PINK; cx.fillRect(lx - 2.9 * k * sc, fy - 1.05 * k * sc, 5.8 * k * sc, Math.max(2, 0.08 * sc));
      cx.translate(lx, ly); cx.rotate(-ang); cx.fillStyle = '#3d3c31'; cx.fillRect(0, -0.55 * sc, 6.2 * sc, 1.1 * sc); cx.fillStyle = '#2a2922'; cx.fillRect(5.6 * sc, -0.75 * sc, 1.1 * sc, 1.5 * sc);
      cx.fillStyle = 'rgba(255,209,102,0.35)'; cx.beginPath(); cx.arc(6.8 * sc, 0, 0.9 * sc, 0, 6.29); cx.fill();
    } else if (F.frame === 'barrel') { // DN consensus: one fat black barrel on a cradle
      cx.fillStyle = '#2c2a36'; cx.fillRect(lx - 2.4 * sc, fy - 0.8 * sc, 4.8 * sc, 0.8 * sc);
      cx.fillStyle = '#111'; for (const w of [-1.6, 1.6]) { cx.beginPath(); cx.arc(lx + w * sc, fy - 0.1 * sc, 0.6 * sc, 0, 6.29); cx.fill(); }
      cx.translate(lx, ly); cx.rotate(-ang); const g = cx.createLinearGradient(0, -1.1 * sc, 0, 1.1 * sc); g.addColorStop(0, '#3a3846'); g.addColorStop(0.5, '#0d0c12'); g.addColorStop(1, '#2a2833');
      cx.fillStyle = g; cx.fillRect(-1.2 * sc, -1.0 * sc, 4.6 * sc, 2.0 * sc); cx.fillStyle = '#1a1922'; cx.fillRect(3.2 * sc, -1.25 * sc, 0.6 * sc, 2.5 * sc);
      cx.strokeStyle = 'rgba(255,255,255,0.25)'; cx.lineWidth = 1.5; for (const o of [0.6, 1.8]) { cx.beginPath(); cx.moveTo(o * sc, -1.0 * sc); cx.lineTo(o * sc, 1.0 * sc); cx.stroke(); }
    } else if (F.frame === 'gun') { // rapid-fire turret: tripod + drum + long thin barrel
      cx.strokeStyle = '#4a4458'; cx.lineWidth = sc * 0.22; cx.lineCap = 'round';
      for (const w of [-1.4, 0, 1.4]) { cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(lx + w * sc, fy); cx.stroke(); }
      cx.translate(lx, ly); cx.rotate(-ang); cx.fillStyle = '#2c2a36'; cx.fillRect(-0.9 * sc, -0.5 * sc, 1.8 * sc, 1.0 * sc);
      cx.fillStyle = '#4a4938'; for (const o of [-0.18, 0.18]) cx.fillRect(0.6 * sc, (o - 0.09) * sc, 3.4 * sc, 0.18 * sc);
      cx.fillStyle = PINK; cx.fillRect(3.9 * sc, -0.32 * sc, 0.22 * sc, 0.64 * sc);
      cx.fillStyle = '#ffd166'; cx.beginPath(); cx.arc(-0.2 * sc, 0.75 * sc, 0.5 * sc, 0, 6.29); cx.fill();
    } else { // tank
      cx.fillStyle = '#1a1820'; cx.fillRect(lx - 2.6 * sc, fy - 0.9 * sc, 5.2 * sc, 0.9 * sc);
      cx.fillStyle = '#3b3a2f'; cx.fillRect(lx - 2.2 * sc, fy - 1.9 * sc, 4.2 * sc, 1.0 * sc); cx.fillRect(lx - 1.1 * sc, fy - 2.6 * sc, 2 * sc, 0.8 * sc);
      cx.fillStyle = '#555'; for (let i = 0; i < 6; i++) { cx.beginPath(); cx.arc(lx + (-2.1 + i * 0.85) * sc, fy - 0.45 * sc, 0.32 * sc, 0, 6.29); cx.fill(); }
      cx.translate(lx, ly); cx.rotate(-ang); cx.fillStyle = '#4a4938'; cx.fillRect(0, -0.28 * sc, 3.2 * sc, 0.56 * sc); cx.fillStyle = PINK; cx.fillRect(3.0 * sc, -0.3 * sc, 0.25 * sc, 0.6 * sc);
    }
    cx.restore();
    // loaded projectile
    if (G.screen === 'aim' || G.screen === 'intro') { const f = S.cur(r); if (f.shotsFired < F.shots) {
      const PS = F.proj.sprites, id = PS[f.shotsFired % PS.length], pull = G.aim ? Math.hypot(G.aim.qx, G.aim.qy) / 100 : 0;
      const px = LX - Math.cos(ang) * pull * 1.6, py = F.launcher.y - Math.sin(ang) * pull * 1.6;
      if (F.frame === 'catapult') sprite(id, px, py, F.proj.r, 0); } }
    // owner badge: the Skrumpey that brought this weapon
    sprite(F.owner.token, LX - (F.frame === 'bigtank' ? 6 : 2.2), 0.7, 0.7, 0);
  }
  function sprite(id, x, y, rad, rot) {
    const im = IMG[id]; const s = rad * 2.25 * sc;
    if (!im || !im.complete || !im.naturalWidth) { cx.fillStyle = PINK; cx.beginPath(); cx.arc(X(x), Y(y), rad * sc, 0, 6.29); cx.fill(); return; }
    cx.save(); cx.translate(X(x), Y(y)); cx.rotate(rot); cx.drawImage(im, -s / 2, -s / 2, s, s * im.naturalHeight / im.naturalWidth); cx.restore();
  }
  function drawBodies(r) {
    const F = S.FIGS[r.fig], PS = F.proj.sprites; let pi = 0;
    for (const b of r.bodies) { if (b.out) continue;
      const rot = G.spin.get(b.id) || 0;
      if (b.kind === 'subj') sprite(LOOKS[b.look], b.x, b.y, b.r, rot);
      else { const id = PS[pi % PS.length]; pi++; if (!b.spent || F.frame === 'catapult') { if (!b.sleep && b.r > 0.2) { cx.save(); cx.globalAlpha = 0.35; cx.fillStyle = PINK; cx.beginPath(); cx.arc(X(b.x - b.vx * 0.03), Y(b.y - b.vy * 0.03), b.r * sc * 0.9, 0, 6.29); cx.fill(); cx.restore(); } sprite(id, b.x, b.y, b.r, rot); } else sprite(id, b.x, b.y, b.r, rot); }
    }
  }
  function drawAim(r) {
    if (!G.aim || G.screen !== 'aim') return; const { qx, qy } = G.aim;
    const off = S.muzzleX(r) - S.FIGS[r.fig].launcher.x, pts = S.preview(r.fig, qx, qy, 60, 1 / 24).map(p => [p[0] + off, p[1]]);
    cx.fillStyle = 'rgba(255,255,255,0.85)';
    pts.forEach((p, i) => { if (i % 2) return; cx.globalAlpha = 1 - i / pts.length; cx.beginPath(); cx.arc(X(p[0]), Y(p[1]), Math.max(1.5, sc * 0.14), 0, 6.29); cx.fill(); });
    cx.globalAlpha = 1;
    const F = S.FIGS[r.fig], pw = Math.round(Math.min(100, Math.hypot(qx, qy)));
    cx.font = `${Math.max(11, Math.round(sc * 0.75))}px ${MONO}`; cx.fillStyle = PINK; cx.textAlign = 'left';
    cx.fillText(`POWER ${pw}%`, X(S.muzzleX(r)) + 2 * sc, Y(F.launcher.y) - 3 * sc);
  }
  function drawParts() { for (const p of G.parts) cube(X(p.x), Y(p.y), p.s * sc, p.rot, p.c, Math.max(0, 1 - p.t / p.life)); }
  function nearCubes() { for (const c of CUBES) if (c.z >= 0.8) cube(c.x * W, c.y * fy * 0.7 + Math.sin(G.t * 0.5 + c.ph) * 10, c.s * sc * c.z, c.r + G.t * c.vr, c.c, 0.75); }

  function hudRows(r) {
    const f = S.cur(r), F = S.FIGS[r.fig];
    if (F.hud === 'range') return [['PAYLOAD', F.proj.label], ['RANGE', f.shotsFired ? (r.phase === 'flight' && r.shot ? ((r.shot.maxX - F.launcher.x) / 1000).toFixed(3) : (f.range / 1000).toFixed(3)) + ' KM' : '—'],
      ['SUBJECTS DISPLACED', `${f.displaced} / ${f.N}`, PINK], ['ACCURACY', 'IRRELEVANT', PINK]];
    if (F.hud === 'bigtank') { const n = f.shotsFired, speed = n * 23400;
      return [['SPEED', `${speed.toLocaleString('en-US')} KM/H`], ['SHELLS FIRED', `${n} / ${F.shots}`], ['SUBJECTS IN PILE', `${f.N - f.displaced} / ${f.N}`, PINK],
        ['BRAKES', n >= F.shots ? 'NOT INSTALLED' : '—', n >= F.shots ? '#ff3b5c' : null], ['OVERKILL', f.overkill ? 'YES' : 'NO', f.overkill ? PINK : null]]; }
    if (F.hud === 'stream') { const fired = r.bodies.filter(b => b.kind === 'proj').length;
      return [['RATE', '600 SKRUMPEYS / S'], ['FIRED', `${fired}`], ['SHOTS', `${f.shotsFired} / ${F.shots}`], ['SUBJECTS STANDING', `${f.N - f.displaced} / ${f.N}`, PINK], ['OVERKILL', f.overkill ? 'YES' : '—', f.overkill ? PINK : null]]; }
    if (F.hud === 'consensus') { // render-only vote count-up, like the clip: COUNTING… → UNANIMOUS
      const k = G.screen === 'intro' ? Math.min(1, (G.t - G.introT) / 1.8) : 1, votes = Math.round(3333 * k);
      return [['VOTES IN', `${votes.toLocaleString('en-US')} / 3,333`], ['RESULT', k < 1 ? 'COUNTING…' : 'UNANIMOUS', k < 1 ? '#ffd166' : '#5ef2a0'],
        ['PAYLOAD', k < 1 ? '—' : F.proj.label], ['SHOTS', `${f.shotsFired} / ${F.shots}`], ['TARGET', f.cleared ? 'GONE' : 'THE PILE', PINK], ['SUBJECTS DISPLACED', `${f.displaced} / ${f.N}`]]; }
    const cf = f.ceasefire === 'requested' ? 'REQUESTED' : f.ceasefire === 'denied' ? 'DENIED' : '—';
    const rows = [['AMMUNITION', F.proj.label], ['SHOTS', `${f.shotsFired} / ${F.shots}`], ['SUBJECTS DISPLACED', `${f.displaced} / ${f.N}`, PINK]];
    if (F.rules.ceasefire) rows.push(['CEASEFIRE', cf, cf === 'DENIED' ? '#ff3b5c' : cf === 'REQUESTED' ? '#ffd166' : null]);
    else rows.push(['OPERATOR', F.owner.name.toUpperCase()]);
    rows.push(['OVERKILL', f.overkill ? 'YES' : 'NO', f.overkill ? PINK : null]); return rows;
  }
  function drawHUD(r) {
    const F = S.FIGS[r.fig], fs = Math.max(10, Math.min(15, Math.round(Math.min(W, H) * 0.024))), pad = Math.max(10, W * 0.018);
    const rows = hudRows(r), pw = Math.min(W * 0.42, fs * 30), lh = fs * 1.45, ph = lh * rows.length + fs * 0.8;
    cx.save(); cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(255,255,255,0.55)'; cx.font = `bold ${fs + 1}px ${MONO}`; cx.textAlign = 'left';
    cx.fillText(`FIG. ${F.id} — ${F.name}`, pad, pad + fs);
    cx.font = `${fs - 2}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.fillText(F.sub, pad, pad + fs * 2.1);
    const py = pad + fs * 2.8;
    cx.fillStyle = 'rgba(10,9,14,0.72)'; cx.fillRect(pad, py, pw, ph); cx.strokeStyle = 'rgba(255,255,255,0.12)'; cx.strokeRect(pad, py, pw, ph);
    cx.font = `${fs}px ${MONO}`;
    rows.forEach(([k, v, col], i) => { const y = py + fs * 0.4 + lh * (i + 0.8); cx.fillStyle = 'rgba(255,255,255,0.6)'; cx.fillText(k, pad + fs * 0.7, y);
      const flashOn = k === 'CEASEFIRE' && v === 'DENIED' && G.t - G.flash < 1.5 && Math.floor(G.t * 8) % 2;
      cx.fillStyle = flashOn ? '#fff' : (col || '#fff'); cx.font = `bold ${fs}px ${MONO}`; cx.fillText(v, pad + pw * 0.52, y); cx.font = `${fs}px ${MONO}`; });
    // timecode + cam
    cx.font = `${fs - 1}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.55)';
    const ms = Math.floor(G.runT * 1000), tc = `T+${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
    cx.fillText(tc, pad, H - pad); cx.textAlign = 'right'; cx.fillText(`LAB-07 · CAM ${r.fig + 2}`, W - pad, H - pad);
    cx.fillStyle = '#ff3b5c'; cx.beginPath(); cx.arc(W - pad - cx.measureText(`LAB-07 · CAM ${r.fig + 2}`).width - fs * 0.7, H - pad - fs * 0.33, fs * 0.28, 0, 6.29); cx.fill();
    // score
    const sc_ = S.score(r); cx.textAlign = 'center'; cx.fillStyle = 'rgba(255,255,255,0.8)'; cx.font = `bold ${fs + 2}px ${MONO}`;
    cx.fillText(`SCORE ${sc_.total}`, W * 0.52, pad + fs * 1.2);
    cx.restore();
    // conclude button
    G.btnConclude = null;
    if (G.screen === 'aim' && S.cur(r).cleared && S.canFire(r)) {
      const bw = fs * 15, bh = fs * 2.6, bx = W / 2 - bw / 2, by = H * 0.2; G.btnConclude = [bx, by, bw, bh];
      cx.fillStyle = 'rgba(255,95,168,0.9)'; cx.fillRect(bx, by, bw, bh); cx.fillStyle = '#12101a'; cx.font = `bold ${fs + 1}px ${MONO}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('CONCLUDE TEST', W / 2, by + bh * 0.38); cx.font = `${fs - 3}px ${MONO}`; cx.fillText('or keep firing (overkill −300)', W / 2, by + bh * 0.72);
    }
    if (G.screen === 'aim' && !G.aim && !AUTOPILOT) { cx.fillStyle = 'rgba(255,255,255,0.55)'; cx.font = `${fs}px ${MONO}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('DRAG BACK TO AIM · RELEASE TO FIRE', W / 2, fy + (H - fy) * 0.42); }
  }
  function corners() { const p = Math.max(8, W * 0.012), l = Math.min(W, H) * 0.05; cx.strokeStyle = 'rgba(255,255,255,0.4)'; cx.lineWidth = 1.5;
    for (const [x, y, sx, sy] of [[p, p, 1, 1], [W - p, p, -1, 1], [p, H - p, 1, -1], [W - p, H - p, -1, -1]]) { cx.beginPath(); cx.moveTo(x, y + sy * l); cx.lineTo(x, y); cx.lineTo(x + sx * l, y); cx.stroke(); } }
  function drawCaption() {
    if (!G.caption || G.t - G.capT > 5.5 || G.screen === 'end') return; const fs = Math.max(14, Math.min(26, Math.round(Math.min(W, H) * 0.042)));
    cx.save(); cx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const words = G.caption.split(' '), lines = []; let line = '';
    const maxW = W < 900 ? W * 0.88 : W * 0.7;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (cx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } lines.push(line);
    const lh = fs * 1.2, blockH = lines.length * lh, floorH = H - fy - (G.screen === 'aim' ? fs * 1.6 : 0);
    let y0;
    if (blockH <= floorH * 0.9) y0 = fy + (floorH - blockH) / 2 + lh / 2;
    else { // phone: the floor strip can't hold it without covering the launcher/tracks, so caption sits in the open air above the piles
      y0 = Math.max(H * 0.2, Math.min(W, H) * 0.024 * 6.5) + lh / 2;
      let mw = 0; for (const l of lines) mw = Math.max(mw, cx.measureText(l).width);
      cx.fillStyle = 'rgba(8,7,12,0.6)'; cx.fillRect(W / 2 - mw / 2 - fs * 0.5, y0 - lh / 2 - fs * 0.2, mw + fs, blockH + fs * 0.4);
    }
    cx.lineJoin = 'round'; cx.lineWidth = Math.max(3, fs * 0.22); cx.strokeStyle = 'rgba(0,0,0,0.85)'; cx.fillStyle = '#f2f0f7';
    lines.forEach((l, i) => { cx.strokeText(l, W / 2, y0 + i * fs * 1.2); cx.fillText(l, W / 2, y0 + i * fs * 1.2); }); cx.restore();
  }
  function drawMute() { const s = Math.max(30, Math.min(44, H * 0.07)), x = W - s - Math.max(10, W * 0.018), y = Math.max(10, W * 0.018); G.btnMute = [x, y, s, s];
    cx.save(); cx.strokeStyle = 'rgba(255,255,255,0.6)'; cx.lineWidth = 1.5; cx.strokeRect(x, y, s, s); cx.fillStyle = 'rgba(255,255,255,0.8)'; cx.font = `${Math.round(s * 0.32)}px ${MONO}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(A.muted ? 'MUTED' : 'SOUND', x + s / 2, y + s / 2); cx.restore(); }
  function drawTitle() {
    drawLab(); drawBooth(); nearCubes(); corners();
    const fs = Math.min(W * 0.075, H * 0.14);
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `${Math.round(fs * 0.22)}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.5)'; cx.fillText('LAB-07 · SKRUMPFILMS UNIVERSE · WEAPONS DIVISION', W / 2, H * 0.3);
    cx.font = `900 ${Math.round(fs)}px system-ui, sans-serif`; cx.fillStyle = '#f2f0f7'; cx.shadowColor = PINK; cx.shadowBlur = 24; cx.fillText('SKRUMP LAB', W / 2, H * 0.42);
    cx.shadowBlur = 0; cx.font = `bold ${Math.round(fs * 0.38)}px ${MONO}`; cx.fillStyle = PINK; cx.fillText('WEAPONS TEST', W / 2, H * 0.54);
    cx.font = `${Math.round(fs * 0.2)}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.7)';
    cx.fillText(S.FIGS.map(F => `FIG. ${F.id} ${F.name}`).join('  ·  '), W / 2, H * 0.62);
    if (Math.floor(G.t * 2) % 2 === 0) { cx.fillStyle = '#fff'; cx.font = `bold ${Math.round(fs * 0.24)}px ${MONO}`; cx.fillText(AUTOPILOT ? 'AUTOPILOT' : 'TAP TO BEGIN TESTING', W / 2, H * 0.74); }
    cx.font = `${Math.round(fs * 0.17)}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.4)'; cx.fillText('drag back to aim · release to fire · best ' + best, W / 2, H * 0.82);
    for (let k = 0; k < 5; k++) sprite(LOOKS[k % 3], -1 + k * 1.1 + 52, 0.5, 0.5, 0);
    cx.restore(); drawMute();
  }
  function drawEnd() {
    const r = G.result, fs = Math.max(11, Math.min(18, Math.round(Math.min(W, H) * 0.03)));
    cx.save(); cx.fillStyle = 'rgba(8,7,12,0.82)'; cx.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.62, fs * 34), px = W / 2 - pw / 2, py = H * 0.1, lh = fs * 1.55;
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic'; cx.font = `bold ${fs + 2}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.6)';
    cx.fillText('TEST REPORT — LAB-07', px, py); cx.font = `${fs - 2}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.fillText(`seed ${r.seed} · sim v${r.simVersion}`, px, py + fs * 1.2);
    const rows = [];
    r.figs.forEach((f, i) => { rows.push([`FIG. ${f.id} — ${S.FIGS[i].name}`, `${f.total}`, '#fff']);
      rows.push([`  ${f.displaced}/${f.N} displaced · ${f.shots} shot${f.shots === 1 ? '' : 's'}`, `+${f.displacedPts}${f.clearBonus ? ' +' + f.clearBonus : ''}${f.penalty ? ' −' + f.penalty : ''}`, f.penalty ? '#ff3b5c' : PINK]); });
    rows.push(['ACCURACY', 'IRRELEVANT', PINK]); rows.push(['OVERKILL', r.overkill ? 'YES' : 'NO', r.overkill ? PINK : null]); rows.push(['SUBJECTS / SHOT', (r.perShotX100 / 100).toFixed(2)]);
    cx.fillStyle = 'rgba(20,18,28,0.9)'; cx.fillRect(px, py + fs * 1.8, pw, lh * rows.length + fs); cx.strokeStyle = 'rgba(255,255,255,0.15)'; cx.strokeRect(px, py + fs * 1.8, pw, lh * rows.length + fs);
    rows.forEach(([k, v, c], i) => { const y = py + fs * 2.4 + lh * (i + 0.8); cx.font = `${fs}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.65)'; cx.fillText(k, px + fs, y); cx.font = `bold ${fs}px ${MONO}`; cx.fillStyle = c || '#fff'; cx.textAlign = 'right'; cx.fillText(v, px + pw - fs, y); cx.textAlign = 'left'; });
    const yb = py + fs * 2.4 + lh * rows.length + fs * 2.2;
    cx.textAlign = 'center'; cx.font = `900 ${fs * 2.2}px system-ui, sans-serif`; cx.fillStyle = '#fff'; cx.fillText(`SCORE ${r.total}`, W / 2, Math.min(yb, H - fs * 5));
    cx.font = `${fs}px ${MONO}`; cx.fillStyle = r.newBest ? PINK : 'rgba(255,255,255,0.5)'; cx.fillText(r.newBest ? 'NEW LAB RECORD' : `best ${best}`, W / 2, Math.min(yb, H - fs * 5) + fs * 1.6);
    if (G.t - G.endT > 1.2) { cx.fillStyle = '#fff'; cx.font = `bold ${fs}px ${MONO}`; cx.fillText('TAP TO RETEST', W / 2, H - fs * 1.6); }
    cx.font = `900 ${fs * 4}px system-ui, sans-serif`; cx.fillStyle = 'rgba(201,154,216,0.25)'; cx.textAlign = 'right'; cx.fillText('S', W - fs, H - fs);
    cx.restore();
  }
  function drawIntroCard(r) {
    if (G.screen !== 'intro') return; const k = Math.min(1, (G.t - G.introT) * 3), F = S.FIGS[r.fig], fs = Math.min(W * 0.06, H * 0.1);
    cx.save(); cx.globalAlpha = k * (1 - Math.max(0, (G.t - G.introT - 1.6) * 2)); cx.fillStyle = 'rgba(8,7,12,0.6)'; cx.fillRect(0, H * 0.36, W, H * 0.24);
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#fff'; cx.font = `900 ${Math.round(fs)}px system-ui, sans-serif`; cx.fillText(`FIG. ${F.id} — ${F.name}`, W / 2, H * 0.45);
    cx.font = `${Math.round(fs * 0.3)}px ${MONO}`; cx.fillStyle = PINK; cx.fillText(`${F.sub} · ${F.shots} ${F.shots > 1 ? 'SHELLS' : 'SHOT'} · ${F.N} SUBJECTS`, W / 2, H * 0.54); cx.restore();
  }
  function draw() {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (G.screen === 'title' || !G.run) { drawTitle(); drawRotate(); return; }
    const r = G.run;
    cx.save(); if (G.shake > 0) cx.translate((rr() - 0.5) * G.shake * 30, (rr() - 0.5) * G.shake * 30);
    drawLab(); drawBooth(); drawBoxes(r); drawLauncher(r); drawBodies(r); drawParts(); drawAim(r); nearCubes();
    cx.restore();
    corners(); drawHUD(r); drawIntroCard(r); drawCaption(); drawMute();
    if (G.screen === 'end') drawEnd();
    drawPull(); drawRotate();
  }
  /* slingshot rubber band from the touch point to the finger (screen space) */
  function drawPull() {
    if (!drag || !drag.live || G.screen !== 'aim') return;
    cx.save(); cx.strokeStyle = 'rgba(255,95,168,0.85)'; cx.lineWidth = 3; cx.setLineDash([8, 6]);
    cx.beginPath(); cx.moveTo(drag.x, drag.y); cx.lineTo(drag.cx, drag.cy); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = 'rgba(255,255,255,0.25)'; cx.beginPath(); cx.arc(drag.x, drag.y, 14, 0, 6.29); cx.fill();
    cx.fillStyle = PINK; cx.beginPath(); cx.arc(drag.cx, drag.cy, 10, 0, 6.29); cx.fill(); cx.restore();
  }
  /* landscape-first: phones in portrait get a full-screen rotate card */
  const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 600;
  let rotateDismissed = false;
  const needRotate = () => PHONE && !rotateDismissed && H > W;
  function drawRotate() {
    G.btnPlayPortrait = null; if (!needRotate()) return;
    cx.save(); drawLab(); corners();
    const fs = Math.max(14, Math.min(22, W * 0.05)); cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `${Math.round(fs * 0.7)}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.5)'; cx.fillText('LAB-07 · WEAPONS DIVISION', W / 2, H * 0.2);
    cx.font = `900 ${Math.round(fs * 2)}px system-ui, sans-serif`; cx.fillStyle = '#f2f0f7'; cx.shadowColor = PINK; cx.shadowBlur = 20; cx.fillText('SKRUMP LAB', W / 2, H * 0.28); cx.shadowBlur = 0;
    // phone glyph rotating
    const a = Math.min(1, (G.t % 2.4) / 1.2) * 1.5708, pw = W * 0.18, ph = pw * 1.9;
    cx.save(); cx.translate(W / 2, H * 0.47); cx.rotate(-a); cx.strokeStyle = PINK; cx.lineWidth = 4; cx.strokeRect(-pw / 2, -ph / 2, pw, ph);
    cx.fillStyle = 'rgba(255,95,168,0.25)'; cx.fillRect(-pw / 2 + 6, -ph / 2 + 10, pw - 12, ph - 20); cx.restore();
    sprite('3', 0, 0, 0, 0); // warm the cache
    const im = IMG['3']; if (im && im.naturalWidth) { const s = W * 0.16; cx.drawImage(im, W / 2 - s / 2, H * 0.62, s, s * im.naturalHeight / im.naturalWidth); }
    cx.font = `bold ${Math.round(fs * 1.1)}px ${MONO}`; cx.fillStyle = '#fff'; cx.fillText('ROTATE YOUR PHONE', W / 2, H * 0.76);
    cx.font = `${Math.round(fs * 0.75)}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.55)'; cx.fillText('the lab is landscape only', W / 2, H * 0.8);
    const bw = W * 0.5, bh = fs * 2.2, bx = W / 2 - bw / 2, by = H * 0.87; G.btnPlayPortrait = [bx, by, bw, bh];
    cx.strokeStyle = 'rgba(255,255,255,0.4)'; cx.lineWidth = 1.5; cx.strokeRect(bx, by, bw, bh); cx.font = `${Math.round(fs * 0.75)}px ${MONO}`; cx.fillStyle = 'rgba(255,255,255,0.7)'; cx.fillText('play in portrait anyway', W / 2, by + bh / 2);
    cx.restore();
  }
  function tryLandscape() { // needs a user gesture; Android wants fullscreen first; iOS has no lock: fail silently
    try { const el = document.documentElement, lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* no */ } };
      if (!(TA && TA.embedded) && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, lock); else lock(); } catch (e) { /* no */ }
  }

  /* ---------- input ---------- */
  const inBtn = (b, x, y) => b && x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3];
  let drag = null;
  function maxDrag() { return Math.max(90, Math.min(W, H) * 0.32); }
  const DEAD = 18; // px of pull before an aim registers
  function pos(e) { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * W / (b.width || W), (e.clientY - b.top) * H / (b.height || H)]; }
  function aimFrom(cxp, cyp) { const dx = drag.x - cxp, dy = cyp - drag.y; drag.cx = cxp; drag.cy = cyp;
    if (!drag.live && dx * dx + dy * dy < DEAD * DEAD) return; drag.live = true; const m = maxDrag(); const [qx, qy] = S.clampQ(dx / m * 100, dy / m * 100); G.aim = { qx, qy }; }
  function press(id, x, y) {
    if (needRotate()) { if (inBtn(G.btnPlayPortrait, x, y)) rotateDismissed = true; else tryLandscape(); return; }
    if (inBtn(G.btnMute, x, y)) { A.setMuted(!A.muted); if (!A.muted) A.init(); return; }
    if (G.paused) return;
    if (G.screen === 'title') { if (!(TA && TA.embedded) || TA.active) startRun(); return; }
    if (G.screen === 'end') { if (G.t - G.endT > 1.2) startRun(); return; }
    if (G.screen === 'aim' && inBtn(G.btnConclude, x, y)) { conclude(); return; }
    // slingshot from wherever the finger lands; also arm during the intro card so an early grab isn't dead
    if ((G.screen === 'aim' || G.screen === 'intro') && !AUTOPILOT) { drag = { id, x, y, cx: x, cy: y, live: false }; G.aim = null; return true; }
  }
  function move(id, x, y) { if (!drag || id !== drag.id) return; if (G.screen !== 'aim') { drag.cx = x; drag.cy = y; return; } aimFrom(x, y); }
  function release(id) { if (!drag || id !== drag.id) return; const d = drag; drag = null; const a = G.aim;
    if (G.screen === 'aim' && d.live && a && Math.hypot(a.qx, a.qy) >= 12) fire(a.qx, a.qy); else G.aim = null; }
  // Pointer Events with capture; move/up also on window so a lost capture can't strand the pull.
  // Touch Events path (passive:false + preventDefault) for browsers that scroll/zoom or cancel pointers in portrait.
  let usingTouch = false;
  cv.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && usingTouch) return; e.preventDefault(); cv.focus(); const [x, y] = pos(e);
    if (press(e.pointerId, x, y)) try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } });
  addEventListener('pointermove', e => { if (e.pointerType === 'touch' && usingTouch) return; const [x, y] = pos(e); move(e.pointerId, x, y); });
  addEventListener('pointerup', e => { if (e.pointerType === 'touch' && usingTouch) return; release(e.pointerId); });
  addEventListener('pointercancel', e => { if (e.pointerType === 'touch' && usingTouch) return; if (drag && drag.id === e.pointerId) { drag = null; G.aim = null; } });
  const tid = t => 't' + t.identifier;
  cv.addEventListener('touchstart', e => { usingTouch = true; e.preventDefault(); const t = e.changedTouches[0]; const [x, y] = pos(t); press(tid(t), x, y); }, { passive: false });
  addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) { const [x, y] = pos(t); move(tid(t), x, y); } }, { passive: false });
  addEventListener('touchend', e => { for (const t of e.changedTouches) release(tid(t)); }, { passive: false });
  addEventListener('touchcancel', e => { for (const t of e.changedTouches) if (drag && drag.id === tid(t)) release(tid(t)); }, { passive: false });
  addEventListener('gesturestart', e => e.preventDefault()); // iOS pinch
  const kd = e => {
    if (G.paused) return;
    if (G.screen === 'title' || (G.screen === 'end' && G.t - G.endT > 1.2)) { if (e.key === 'Enter' || e.key === ' ') { if (!(TA && TA.embedded) || TA.active) startRun(); } return; }
    if (G.screen !== 'aim' || AUTOPILOT) return;
    if (!G.aim) G.aim = { qx: 60, qy: 45 };
    const d = e.shiftKey ? 1 : 4; let { qx, qy } = G.aim;
    if (e.key === 'ArrowUp') qy += d; else if (e.key === 'ArrowDown') qy -= d; else if (e.key === 'ArrowRight') qx += d; else if (e.key === 'ArrowLeft') qx -= d;
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire(qx, qy); return; } else if (e.key === 'c' || e.key === 'C') { conclude(); return; } else return;
    e.preventDefault(); [qx, qy] = S.clampQ(qx, qy); G.aim = { qx, qy };
  };
  addEventListener('keydown', kd);

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now) {
    if (G.destroyed) return; G.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!G.paused && !needRotate()) update(dt); else if (needRotate()) G.t += dt; draw();
  }
  G.raf = requestAnimationFrame(t => { last = t; frame(t); });
  if (AUTOPILOT && !(TA && TA.embedded)) setTimeout(() => { if (G.screen === 'title') startRun(); }, 1200);

  /* ---------- Token Arcade bridge (Free Play only) ---------- */
  if (TA) TA.register({
    version: '1.0.0',
    capabilities: { pause: true, touch: true, keyboard: true, orientation: 'landscape' },
    mount(config) { if (config.mode !== 'free') throw new Error('Skrump Lab supports Free Play only.'); A.setMuted(config.muted === undefined ? true : !!config.muted); },
    start() { startRun(); },
    pause() { G.paused = true; drag = null; G.aim = null; A.suspend(); },
    resume() { G.paused = false; last = performance.now(); A.resume(); },
    restart() { startRun(); },
    audio(muted) { A.setMuted(muted); if (!muted) A.init(); },
    destroy() { G.destroyed = true; cancelAnimationFrame(G.raf); A.destroy(); removeEventListener('keydown', kd); removeEventListener('resize', resize); },
  });
  window.__sl = { G, S, startRun, update, fire, conclude, get run() { return G.run; } };
})();
