/* Canyon Jump: app shell, input, camera, HUD, screens and Token Arcade bridge hooks. */
(function () {
  'use strict';
  const S = window.CJSim, C = S.C, R = window.CJRender, A = window.CJAudio;
  const params = new URLSearchParams(location.search);
  const TA = window.TokenArcade;
  const AUTOPILOT = params.get('autopilot') === '1' && !TA?.embedded; // standalone preview / capture only
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 960, H = 540, dpr = 1;
  const BEST_KEY = TA?.embedded ? 'ta.canyon-jump.best' : 'canyon-jump.best';
  let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* storage blocked */ }

  const G = {
    screen: 'title', run: null, acc: 0, t: 0, paused: false, destroyed: false, raf: 0,
    shake: 0, flash: 0, flashColor: '#fff', boostT: 0, endAt: 0, result: null, countdown: 0,
    cam: { x: 0, y: 2.6, z: -8, f: 600, hy: 240, roll: 0 }, carVis: { x: 0, y: 0, z: 0, roll: 0 }, roll: 0,
    particles: [], popups: [], banner: null, touch: false, landingRoll: 0, landZ: 0, arcadeRunOpen: false,
  };
  const attract = S.newRun(7);

  function resize() {
    const cw = innerWidth, ch = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
    H = 540; W = Math.round(Math.max(405, Math.min(1200, H * cw / ch)));
    const scale = Math.min(cw / W, ch / H);
    canvas.style.width = Math.round(W * scale) + 'px'; canvas.style.height = Math.round(H * scale) + 'px';
    canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
    G.pxScale = scale * dpr;
  }
  addEventListener('resize', resize); resize();

  /* ---------------- input ---------------- */
  const held = new Set(); const edges = { left: false, right: false, boost: false, trick: false };
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'boost', KeyX: 'trick', KeyK: 'trick', ShiftLeft: 'trick', ShiftRight: 'trick', KeyJ: 'boost' };
  function onKey(e, down) {
    const a = KEYMAP[e.code];
    if (down) A.init();
    if (down && (e.code === 'KeyM')) { A.setMuted(!A.muted); return; }
    if (down && (e.code === 'KeyP' || e.code === 'Escape') && G.screen === 'play') { togglePause(); return; }
    if (down && (e.code === 'Enter' || e.code === 'Space') && (G.screen === 'title' || (G.screen === 'end' && G.t - G.endAt > 0.8))) { e.preventDefault(); startRun(); return; }
    if (!a) return; e.preventDefault();
    if (down && !held.has(a)) { if (a in edges) edges[a] = true; }
    down ? held.add(a) : held.delete(a);
  }
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  // Touch: swipe for lanes on the road; in the sky, drag the left side to steer, buttons on the right.
  const touches = new Map(); let stick = null;
  const BTN = () => ({ boost: { x: W - 92, y: H - 120, r: 52 }, trick: { x: W - 200, y: H - 70, r: 42 } });
  function toLogical(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function onDown(e) {
    A.init(); canvas.focus?.();
    if (e.pointerType === 'touch') G.touch = true;
    const p = toLogical(e);
    if (G.screen !== 'play') { if (G.screen === 'title' || G.t - G.endAt > 0.8) startRun(); return; }
    if (inPauseButton(p)) { togglePause(); return; }
    const run = G.run, b = BTN();
    if (run.phase === 'sky' && G.touch) {
      for (const k of ['boost', 'trick']) if (Math.hypot(p.x - b[k].x, p.y - b[k].y) < b[k].r * 1.25) { edges[k] = true; touches.set(e.pointerId, { btn: k }); return; }
    }
    touches.set(e.pointerId, { x0: p.x, y0: p.y, x: p.x, y: p.y, t0: G.t, used: false });
    if (run.phase === 'sky' && p.x < W * 0.6) stick = e.pointerId;
  }
  function onMove(e) {
    const tch = touches.get(e.pointerId); if (!tch || tch.btn) return;
    const p = toLogical(e); tch.x = p.x; tch.y = p.y;
    const run = G.run; if (!run || G.screen !== 'play') return;
    if (run.phase === 'road' && !tch.used && Math.abs(p.x - tch.x0) > 28) {
      edges[p.x > tch.x0 ? 'right' : 'left'] = true; tch.used = true; tch.x0 = p.x; tch.used = false; tch.x0 = p.x;
    }
    if (run.phase === 'sky' && stick !== e.pointerId && !tch.used && tch.y0 - p.y > 50) { edges.trick = true; tch.used = true; }
  }
  function onUp(e) {
    const tch = touches.get(e.pointerId); touches.delete(e.pointerId); if (stick === e.pointerId) stick = null;
    if (!tch || tch.btn || !G.run || G.screen !== 'play') return;
    const moved = Math.hypot(tch.x - tch.x0, tch.y - tch.y0);
    if (G.run.phase === 'road' && moved < 12 && G.t - tch.t0 < 0.3) edges[tch.x0 < W / 2 ? 'left' : 'right'] = true;
    if (G.run.phase === 'sky' && moved < 12 && G.t - tch.t0 < 0.25 && tch.x0 >= W * 0.6) edges.boost = true;
  }
  canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  const inPauseButton = p => p.x > W - 60 && p.y < 56;

  function readInput() {
    const i = { leftEdge: edges.left, rightEdge: edges.right, boostEdge: edges.boost, trickEdge: edges.trick,
      left: held.has('left'), right: held.has('right'), up: held.has('up'), down: held.has('down') };
    if (stick !== null && touches.has(stick)) {
      const t = touches.get(stick), dx = t.x - t.x0, dy = t.y - t.y0;
      if (dx < -14) i.left = true; if (dx > 14) i.right = true; if (dy < -14) i.up = true; if (dy > 14) i.down = true;
    }
    if (AUTOPILOT && G.run) Object.assign(i, autopilot(G.run));
    edges.left = edges.right = edges.boost = edges.trick = false;
    return i;
  }
  // A simple bot for the standalone ?autopilot=1 preview (used for capture); never active in the arcade.
  function autopilot(s) {
    const i = {};
    if (s.phase === 'road') {
      const ahead = s.obstacles.filter(o => o.z > s.z - 2 && o.z < s.z + s.v * 0.75), bad = l => ahead.some(o => o.lane === l);
      const padAhead = s.pickups.find(p => !p.taken && p.type === 'pad' && p.z > s.z && p.z < s.z + 80);
      let want = s.lane;
      if (bad(s.lane)) want = [-1, 0, 1].filter(l => !bad(l)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0] ?? s.lane;
      else if (padAhead && !bad(padAhead.lane)) want = padAhead.lane;
      if (s.tick % 6 === 0) { if (want < s.lane) i.leftEdge = true; if (want > s.lane) i.rightEdge = true; }
    } else if (s.phase === 'sky') {
      if (s.m < 62 && s.air > 0 && s.tick % 60 === 0) i.boostEdge = true;
      if (s.y > 30 && s.trick <= 0 && s.tick % 200 === 0) i.trickEdge = true;
      i.up = s.vy < -3 && s.y < 40;
    }
    return i;
  }

  /* ---------------- run lifecycle ---------------- */
  function startRun() {
    if (TA?.active && !TA.beginRun()) return;
    G.arcadeRunOpen = !!TA?.active;
    A.init(); A.sfx('go');
    const seed = params.has('seed') && !TA?.embedded ? +params.get('seed') : (Math.random() * 2 ** 31) >>> 0;
    G.run = S.newRun(seed); G.screen = 'play'; G.acc = 0; G.result = null; G.paused = false;
    G.particles.length = 0; G.popups.length = 0; G.banner = { text: 'BEAT THE CLEAR LINE', sub: 'grab speed pads, dodge everything', t: G.t, dur: 2.2, color: '#ffd23f' };
    G.cam = { x: 0, y: 2.6, z: -8, f: 600, hy: H * 0.44, roll: 0 }; G.roll = 0; G.landingRoll = 0;
  }
  function finish() {
    const r = S.score(G.run); G.result = r; G.endAt = G.t; G.screen = 'end';
    if (r.total > best) { best = r.total; r.newBest = true; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ } }
    if (G.arcadeRunOpen && TA?.active) {
      G.arcadeRunOpen = false;
      TA.complete({ result: r.reason === 'landed' ? 'completed' : 'failed', primaryMetric: r.total,
        secondaryMetrics: { distance: r.distance, pastRim: r.pastRim, pickups: r.pickups, tricks: r.tricks, trickCount: r.counts.tricks,
          landing: r.landing, launchSpeed: r.launchV, landed: r.reason === 'landed' ? 1 : 0, elapsedMs: Math.round(G.run.t * 1000) } });
    }
  }
  function togglePause() { G.paused = !G.paused; G.paused ? A.suspend() : A.resume(); }

  /* ---------------- events → juice ---------------- */
  const KMH = v => Math.round(v * 3.6);
  function burst(x, y, n, colors, speed, life, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, c: colors[i % colors.length], s: 2 + Math.random() * 3, g: grav ?? 300 });
    }
  }
  function popup(text, color, big) { const cs = G.carScreenLast || { x: W / 2, y: H * 0.7 }; G.popups.push({ text, color, x: cs.x + (Math.random() - 0.5) * 60, y: cs.y - 60, t: G.t, big }); }
  function handleEvents(s) {
    const cs = G.carScreenLast || { x: W / 2, y: H * 0.72 };
    for (const ev of s.events) {
      switch (ev.e) {
        case 'orb': A.sfx('orb', s.counts.orbs % 8); burst(cs.x, cs.y - 30, 8, ['#ffd34d', '#fff6c0'], 160, 0.5); popup('+50', '#ffd34d'); break;
        case 'air': A.sfx('air'); burst(cs.x, cs.y - 30, 14, ['#5af0ff', '#ffffff'], 220, 0.6); popup(s.air >= C.AIR_MAX ? 'AIR FULL' : '+1 AIR', '#5af0ff'); break;
        case 'pad': A.sfx('pad'); G.shake = Math.max(G.shake, 6); G.flash = 0.25; G.flashColor = '#ff4fd8'; G.boostT = 0.6; popup('SPEED PAD', '#ff4fd8', true); break;
        case 'lane': A.sfx('lane'); break;
        case 'near': A.sfx('near'); popup('NEAR MISS', '#fff4e0'); break;
        case 'launch': A.sfx('launch'); G.slowT = 0.9; G.shake = 14; G.flash = 0.5; G.flashColor = '#fff1a8'; G.boostT = 1;
          G.banner = { text: 'SEND IT!', sub: `${KMH(ev.v)} km/h off the ramp`, t: G.t, dur: 2.2, color: '#5af0ff' };
          burst(cs.x, cs.y, 40, ['#ffd23f', '#ff7a1a', '#fff'], 360, 0.9); break;
        case 'short': A.sfx('short'); G.shake = 8; G.banner = { text: s.launchV && s.launchV < C.CLEAR_V ? 'TOO SLOW' : 'FELL SHORT', sub: 'the canyon wins this one', t: G.t, dur: 2.5, color: '#ff5a78' }; break;
        case 'rim': A.sfx('landed_trick', 2); G.flash = 0.3; G.flashColor = '#5af0ff'; G.banner = { text: 'CLEARED THE CANYON', sub: 'now ride the momentum', t: G.t, dur: 2.4, color: '#5af0ff' }; break;
        case 'splash': A.sfx('crash'); G.shake = 16; burst(cs.x, cs.y, 40, ['#2fc4c9', '#7fe8e4', '#fff'], 300, 1); break;
        case 'boost': A.sfx('boost'); G.shake = Math.max(G.shake, 7); G.boostT = 0.8; burst(cs.x, cs.y + 20, 22, ['#5af0ff', '#b9fbff', '#7b55ff'], 260, 0.6, -40); popup('AIR BOOST', '#5af0ff'); break;
        case 'empty': A.sfx('empty'); popup('NO AIR', '#ff5a78'); break;
        case 'trick': A.sfx('trick'); break;
        case 'landed_trick': A.sfx('landed_trick', ev.combo); G.shake = Math.max(G.shake, 4);
          popup(`${ev.combo ? 'COMBO x' + (ev.combo + 1) + ' ' : ''}KICKFLIP +${ev.pts}`, '#ffd23f', true); burst(cs.x, cs.y - 20, 18, ['#ffd23f', '#ff4fd8', '#5af0ff'], 240, 0.7); break;
        case 'crash': A.sfx('crash'); G.shake = 22; G.flash = 0.6; G.flashColor = '#ff3b5c';
          burst(cs.x, cs.y - 10, 50, ['#f4f1ee', '#a9b3cc', '#ffd23f', '#3a2a3f'], 420, 1.1);
          G.banner = { text: ev.what === 'botched' ? 'BOTCHED LANDING' : 'WIPEOUT', sub: ev.what === 'botched' ? 'finish the flip before you touch down' : `hit a ${ev.what}`, t: G.t, dur: 3, color: '#ff3b5c' }; break;
        case 'land': A.sfx('land'); G.shake = 10; burst(cs.x, cs.y, 40, ['#e3925a', '#ffd9a8', '#fff'], 300, 1); G.landZ = s.z; G.landingRoll = Math.max(10, s.m * 0.6);
          G.banner = { text: 'STUCK THE LANDING', sub: `+${C.LANDING_BONUS} landing bonus`, t: G.t, dur: 3, color: '#5af0ff' }; break;
        case 'end': setTimeout(() => { if (G.run === s && !G.destroyed) finish(); }, ev.reason === 'landed' ? 1600 : 1300); break;
      }
    }
    s.events.length = 0;
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    G.t += dt;
    const s = G.screen === 'title' ? attract : G.run;
    if (G.screen === 'title') {
      // attract mode: cruise the highway forever
      attract.z = (attract.z + 45 * dt) % (C.ROAD_LEN - 300); attract.t += dt; attract.x = Math.sin(G.t * 0.5) * 2; attract.v = 45;
    } else if (G.screen === 'play' && !G.paused) {
      G.slowT = Math.max(0, (G.slowT || 0) - dt);
      G.acc += G.slowT > 0 ? dt * 0.3 : dt;
      while (G.acc >= C.DT) { G.acc -= C.DT; if (!s.over) S.step(s, readInput()); }
      handleEvents(s);
    }
    if (s.over && s.reason === 'landed') { G.landingRoll = Math.max(0, G.landingRoll - 18 * dt); s.z += G.landingRoll * dt; s.x *= 0.98; }
    // camera
    const k = 1 - Math.exp(-dt * 8), kz = 1 - Math.exp(-dt * 14);
    const target = { x: s.x * 0.65, y: 2.7, z: s.z - 7.5, f: H * 1.1 / (1 + Math.max(0, (s.phase === 'road' ? s.v : s.m) - 40) / 260) };
    let hyT = H * 0.44;
    if (s.phase === 'road') {
      // Run-up: rise and pull back so the kicker reads head-on from above.
      const a = Math.max(0, Math.min(1, (s.z - (C.ROAD_LEN - 160)) / 120));
      target.y = 2.7 + s.y * 0.6 + a * 4.5; target.z = s.z - 7.5 - a * 5; hyT = H * (0.44 - a * 0.08);
    }
    if (s.phase === 'sky' || (s.over && s.reason !== 'road')) { target.y = s.y + 3.3; target.z = s.z - 9.5; target.x = s.x * 0.75; }
    // Over the gorge: pull the camera back and up and look down so the drop, river and far rim are on screen.
    const overGap = s.z > C.ROAD_LEN - 10 && s.z < C.ROAD_LEN + C.CANYON_W + 30 && (s.phase === 'sky' || s.phase === 'fall' || (s.over && s.reason !== 'road'));
    if (overGap) {
      // Launch cam: hang back at the near lip while the car arcs out, then trail it across.
      target.z = Math.max(s.z - 20, Math.min(s.z - 14, C.ROAD_LEN - 30));
      target.y = s.y + 8; target.x = s.x * 0.7 + 2; hyT = H * 0.2;
    }
    if (s.phase === 'fall') { target.y = Math.max(s.y + 20, -C.CANYON_DEPTH + 20); target.z = s.z - 30; }
    if (s.over && (s.reason === 'road' || s.reason === 'air' || s.reason === 'botched')) target.z = G.cam.z; // freeze on impact
    G.cam.x += (target.x - G.cam.x) * k; G.cam.y += (target.y - G.cam.y) * k * 0.8; G.cam.z += (target.z - G.cam.z) * kz;
    if (Math.abs(target.z - G.cam.z) > 60) G.cam.z = target.z;
    G.cam.f += (target.f - G.cam.f) * k;
    const pitch = s.phase === 'sky' ? Math.max(-30, Math.min(30, -s.vy * 1.6)) : 0;
    G.cam.hy += (hyT + (overGap ? 0 : pitch) - G.cam.hy) * k * 0.7;
    G.roll += ((s.rot || 0) - G.roll) * 0.6; if (!s.trick) G.roll = (s.rot || 0);
    G.shake *= Math.exp(-dt * 7); G.flash = Math.max(0, G.flash - dt * 2); G.boostT = Math.max(0, G.boostT - dt);
    for (const p of G.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.98; }
    G.particles = G.particles.filter(p => p.life > 0);
    if (s.phase === 'road' && G.screen === 'play' && !s.over && G.carScreenLast && Math.random() < s.v / 90) {
      const cs = G.carScreenLast; G.particles.push({ x: cs.x + (Math.random() - 0.5) * cs.k * 2, y: cs.y + cs.k * 0.3, vx: (Math.random() - 0.5) * 60, vy: 20 + Math.random() * 40, life: 0.5, max: 0.5, c: '#f4b07a', s: 3 + Math.random() * 4, g: -60 });
    }
    G.popups = G.popups.filter(p => G.t - p.t < 1.1);
    A.drive(s.phase, s.v, s.m, G.screen === 'play' && !s.over && !G.paused);
  }
  const CANYON_SAFE = 120;

  /* ---------------- drawing ---------------- */
  function font(px, w = 900) { return `${w} ${px}px "Trebuchet MS", system-ui, sans-serif`; }
  function text(str, x, y, px, color, align = 'center', shadow = true, w) {
    ctx.font = font(px, w); ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (shadow) { ctx.fillStyle = 'rgba(26,8,30,0.75)'; ctx.fillText(str, x + 2, y + 3); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function panel(x, y, w, h, r = 14, fill = 'rgba(27,12,40,0.72)') { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

  function draw() {
    const s = G.screen === 'title' ? attract : G.run;
    ctx.setTransform(G.pxScale, 0, 0, G.pxScale, 0, 0);
    const sh = G.shake, ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    ctx.save(); ctx.translate(ox, oy);
    const roll = (s.bank || 0) * 0.12;
    const view = { cam: G.cam, t: G.t, carX: s.x, carY: s.y, carZ: s.z, groundY: s.z > C.ROAD_LEN && s.z < C.ROAD_LEN + C.CANYON_W ? -C.CANYON_DEPTH : 0,
      roll: G.roll + roll, boostT: G.boostT };
    R.drawWorld(ctx, W, H, s, view);
    if (view.carScreen) G.carScreenLast = view.carScreen;
    const spd = s.phase === 'road' ? s.v : s.m;
    if (!s.over) R.speedLines(ctx, W, H, G.cam.hy, Math.max(0, (spd - 55) / 60) + G.boostT * 0.6, G.t);
    // particles
    for (const p of G.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // vignette + flash
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(20,0,30,0)'); vg.addColorStop(1, 'rgba(20,0,30,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.6; ctx.fillStyle = G.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (G.screen === 'title') drawTitle();
    else { drawHud(s); if (G.screen === 'end') drawEnd(); }
    if (G.paused) { panel(W / 2 - 140, H / 2 - 50, 280, 100); text('PAUSED', W / 2, H / 2 - 12, 34, '#fff'); text('P to resume', W / 2, H / 2 + 24, 16, '#ffd9e6', 'center', false, 700); }
  }

  function meter(x, y, w, h, value, max, mark, colorLow, colorHigh, label, sub) {
    panel(x - 12, y - 34, w + 24, h + 50, 12);
    const f = Math.max(0, Math.min(1, value / max)), m = mark / max, ok = value >= mark;
    ctx.fillStyle = '#20112a'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, ok ? '#38e8c8' : '#ff3b5c'); g.addColorStop(1, ok ? colorHigh : colorLow);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * f), h, h / 2); ctx.fill();
    if (mark) { // the clear line
      const mx = x + w * m; ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1.5, y - 8, 3, h + 16);
      ctx.beginPath(); ctx.moveTo(mx - 7, y - 14); ctx.lineTo(mx + 7, y - 14); ctx.lineTo(mx, y - 6); ctx.fill();
    }
    text(label, x, y - 18, 15, '#fff', 'left', true, 800);
    if (sub) text(sub.text, x + w, y - 18, 13, sub.color, 'right', true, 800);
  }
  function drawHud(s) {
    const r = S.score(s);
    panel(14, 12, 210, 58);
    text('SCORE', 28, 28, 12, '#ffb3c6', 'left', false, 800); text(r.total.toLocaleString('en-US'), 28, 52, 26, '#fff', 'left');
    // AIR canisters
    panel(W - 74 - C.AIR_MAX * 30, 12, 60 + C.AIR_MAX * 30 - 54, 58);
    text('AIR', W - 66 - C.AIR_MAX * 30, 28, 12, '#5af0ff', 'left', false, 800);
    for (let i = 0; i < C.AIR_MAX; i++) {
      const x = W - 64 - C.AIR_MAX * 30 + i * 30 + 6, y = 38;
      ctx.fillStyle = i < s.air ? '#5af0ff' : 'rgba(90,240,255,0.15)'; ctx.beginPath(); ctx.roundRect(x, y, 18, 24, 6); ctx.fill();
      if (i < s.air) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y - 3, 6, 4); }
    }
    // pause button
    ctx.fillStyle = 'rgba(27,12,40,0.72)'; ctx.beginPath(); ctx.roundRect(W - 52, 12, 40, 40, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(W - 40, 22, 5, 20); ctx.fillRect(W - 29, 22, 5, 20);
    const mw = Math.min(460, W * 0.6), mx = W / 2 - mw / 2, my = H - 46;
    if (G.screen === 'end') return;
    if (s.phase === 'road') {
      const left = Math.max(0, Math.ceil(C.ROAD_LEN - s.z));
      // progress strip to the canyon
      const pw = Math.min(360, W * 0.5), px = W / 2 - pw / 2;
      panel(px - 12, 12, pw + 24, 48);
      text(`CANYON IN ${left.toLocaleString('en-US')} m`, W / 2, 27, 15, left < 300 ? '#ffd23f' : '#fff', 'center', true, 800);
      ctx.fillStyle = '#20112a'; ctx.fillRect(px, 42, pw, 8); ctx.fillStyle = '#ffd23f'; ctx.fillRect(px, 42, pw * Math.min(1, s.z / C.ROAD_LEN), 8);
      ctx.fillStyle = '#1e1530'; ctx.fillRect(px + pw * Math.min(1, s.z / C.ROAD_LEN) - 5, 38, 10, 16); ctx.fillStyle = '#f4f1ee'; ctx.fillRect(px + pw * Math.min(1, s.z / C.ROAD_LEN) - 4, 39, 8, 14);
      const ok = s.v >= C.CLEAR_V, pulse = left < 400 ? 0.6 + 0.4 * Math.sin(G.t * 12) : 1;
      meter(mx, my, mw, 14, s.v, C.V_MAX, C.CLEAR_V, '#ff7a1a', '#5af0ff', `${KMH(s.v)} km/h`,
        { text: ok ? 'WILL CLEAR ✓' : `CLEAR LINE ${KMH(C.CLEAR_V)} km/h`, color: ok ? `rgba(90,240,200,${pulse})` : `rgba(255,210,63,${pulse})` });
    } else if (s.phase === 'sky' || (s.over && s.phase !== 'fall')) {
      const farRim = C.ROAD_LEN + C.CANYON_W, toRim = Math.ceil(farRim - s.z);
      const pw = 300; panel(W / 2 - pw / 2 - 12, 12, pw + 24, 48);
      text(toRim > 0 ? `FAR RIM IN ${toRim} m` : `+${Math.floor(s.z - farRim)} m PAST THE RIM`, W / 2, 28, 15, toRim > 0 ? '#ffd23f' : '#5af0ff', 'center', true, 800);
      text(`ALT ${Math.round(s.y)} m`, W / 2, 48, 13, '#ffd9e6', 'center', false, 700);
      const low = s.m < 30 && !s.over, blink = low && Math.floor(G.t * 6) % 2;
      meter(mx, my, mw, 14, s.m, C.M_MAX, 0, '#ff7a1a', '#5af0ff', `MOMENTUM ${Math.round(s.m)}`,
        { text: low ? (blink ? 'LOW: BOOST!' : '') : s.trick > 0 ? 'FLIPPING…' : 'decaying', color: low ? '#ff5a78' : '#ffd9e6' });
      if (G.touch && !s.over) { const b = BTN(); btn(b.boost, 'BOOST', '#5af0ff', s.air > 0); btn(b.trick, 'FLIP', '#ffd23f', s.trick <= 0); }
    } else if (s.phase === 'fall') {
      text('↓', W / 2, H - 60, 40, '#ff5a78');
    }
    if (G.touch && s.phase === 'road' && G.run && G.run.t < 4) text('swipe or tap left / right to switch lanes', W / 2, H - 92, 15, '#fff', 'center', true, 700);
    // popups
    for (const p of G.popups) { const a = (G.t - p.t) / 1.1; ctx.globalAlpha = 1 - a * a; text(p.text, p.x, p.y - a * 50, p.big ? 22 : 16, p.color); }
    ctx.globalAlpha = 1;
    if (G.banner && G.t - G.banner.t < G.banner.dur && G.screen === 'play') {
      const a = (G.t - G.banner.t) / G.banner.dur, sc = a < 0.1 ? 0.6 + a * 4 : 1;
      ctx.globalAlpha = a > 0.8 ? (1 - a) * 5 : 1; ctx.save(); ctx.translate(W / 2, H * 0.17); ctx.scale(sc, sc);
      text(G.banner.text, 0, 0, 44, G.banner.color); text(G.banner.sub, 0, 38, 17, '#fff4e0', 'center', true, 700); ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  function btn(b, label, color, on) {
    ctx.globalAlpha = on ? 0.9 : 0.35; ctx.fillStyle = 'rgba(27,12,40,0.7)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke(); text(label, b.x, b.y, 16, color, 'center', false); ctx.globalAlpha = 1;
  }
  function logo(y, size) {
    ctx.save(); ctx.font = font(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#ffb35a'); g.addColorStop(0.52, '#ff4f6a'); g.addColorStop(1, '#a3205e');
    ctx.fillStyle = '#1b0f3b'; ctx.fillText('CANYON JUMP', W / 2 + 4, y + 5);
    ctx.lineWidth = 6; ctx.strokeStyle = '#2a0f3a'; ctx.strokeText('CANYON JUMP', W / 2, y);
    ctx.fillStyle = g; ctx.fillText('CANYON JUMP', W / 2, y); ctx.restore();
  }
  function drawTitle() {
    const narrow = W < 700;
    logo(H * 0.16, narrow ? 54 : 78);
    text('floor it. send it. stick it.', W / 2, H * 0.16 + (narrow ? 40 : 52), 17, '#fff4e0', 'center', true, 700);
    const steps = [
      ['1  STRAIGHTAWAY', G.touch ? 'Swipe or tap left/right to switch lanes.' : '←/→ or A/D to switch lanes.', 'Dodge cacti, rocks, cones, tumbleweeds. Grab AIR cans + speed pads.', '#ffd23f'],
      ['2  LAUNCH', `Hit the ramp above the CLEAR line (${KMH(C.CLEAR_V)} km/h)`, 'on the speed meter, or you drop into the canyon.', '#ff4fd8'],
      ['3  SKY', G.touch ? 'Drag left side to steer. BOOST spends AIR. FLIP = kickflip.' : 'Arrows/WASD steer. SPACE spends AIR. X = kickflip.', 'Flips cost momentum. Land upright past the far rim.', '#5af0ff'],
    ];
    const cw = narrow ? W - 40 : Math.min(860, W - 60), ch = narrow ? 230 : 180, cx = W / 2 - cw / 2, cy = H * 0.34;
    panel(cx, cy, cw, ch, 18, 'rgba(27,12,40,0.82)');
    if (narrow) steps.forEach((st, i) => { const y = cy + 26 + i * 70; text(st[0], cx + 18, y, 15, st[3], 'left', false); text(st[1], cx + 18, y + 22, 12, '#fff', 'left', false, 600); text(st[2], cx + 18, y + 40, 12, '#ffd9e6', 'left', false, 600); });
    else steps.forEach((st, i) => {
      const colW = cw / 3, x = cx + colW * i + 18; text(st[0], x, cy + 30, 18, st[3], 'left', false);
      wrap(st[1] + ' ' + st[2], x, cy + 62, colW - 32, 15, '#fff4e0');
    });
    text('Score = distance + pickups + tricks (+500 for a clean landing)', W / 2, cy + ch + 24, 14, '#ffd9e6', 'center', true, 700);
    const pulse = 0.6 + 0.4 * Math.sin(G.t * 5); ctx.globalAlpha = pulse;
    text(G.touch ? 'TAP TO START' : 'PRESS SPACE / TAP TO START', W / 2, H - 52, 24, '#fff'); ctx.globalAlpha = 1;
    if (best) text(`BEST ${best.toLocaleString('en-US')}`, W / 2, H - 22, 14, '#ffd23f', 'center', true, 800);
  }
  function wrap(str, x, y, maxW, px, color) {
    ctx.font = font(px, 600); const words = str.split(' '); let line = '', yy = y;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { text(line, x, yy, px, color, 'left', false, 600); line = w; yy += px * 1.35; } else line = t; }
    if (line) text(line, x, yy, px, color, 'left', false, 600);
  }
  function drawEnd() {
    const r = G.result; if (!r) return;
    const a = Math.min(1, (G.t - G.endAt) / 0.35);
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(20,6,30,0.55)'; ctx.fillRect(0, 0, W, H);
    const titles = { landed: ['CLEAN LANDING', '#5af0ff'], road: ['WIPED OUT ON THE HIGHWAY', '#ff3b5c'], air: ['MIDAIR COLLISION', '#ff3b5c'], botched: ['BOTCHED LANDING', '#ff7a1a'], short: ['SHORT OF THE CANYON', '#ff5a78'] };
    const [title, col] = titles[r.reason] || ['RUN OVER', '#fff'];
    const pw = Math.min(460, W - 40), ph = 330, px = W / 2 - pw / 2, py = H / 2 - ph / 2 + (1 - a) * 30;
    panel(px, py, pw, ph, 20, 'rgba(27,12,40,0.92)');
    text(title, W / 2, py + 36, W < 500 ? 22 : 28, col);
    const rows = [
      ['Distance', `${r.distance.toLocaleString('en-US')} m`, r.distance],
      ['Pickups & near misses', `${r.counts.orbs} coins · ${r.counts.air} AIR`, r.pickups],
      ['Tricks', `${r.counts.tricks} kickflip${r.counts.tricks === 1 ? '' : 's'}`, r.tricks],
      ['Landing bonus', r.landing ? 'stuck it' : '—', r.landing],
    ];
    rows.forEach((row, i) => {
      const y = py + 82 + i * 36; text(row[0], px + 24, y, 16, '#ffd9e6', 'left', false, 700);
      text(row[1], px + pw * 0.58, y, 13, '#b9a6ee', 'center', false, 600); text('+' + row[2].toLocaleString('en-US'), px + pw - 24, y, 18, '#fff', 'right', false);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px + 20, py + 222, pw - 40, 2);
    text('TOTAL', px + 24, py + 248, 20, '#ffd23f', 'left', false); text(r.total.toLocaleString('en-US'), px + pw - 24, py + 248, 30, '#ffd23f', 'right');
    const launch = r.launchV ? `launch ${KMH(r.launchV)} km/h (clear ${KMH(C.CLEAR_V)})  ·  peak alt ${r.maxAlt} m` : `crashed before the canyon (clear line ${KMH(C.CLEAR_V)} km/h)`;
    text(launch, W / 2, py + 282, 12, '#ffd9e6', 'center', false, 600);
    text(r.newBest ? 'NEW BEST!' : `best ${best.toLocaleString('en-US')}`, W / 2, py + 306, 14, r.newBest ? '#5af0ff' : '#b9a6ee', 'center', false, 800);
    if (G.t - G.endAt > 0.8) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 5); text(G.touch ? 'TAP TO RIDE AGAIN' : 'SPACE / TAP TO RIDE AGAIN', W / 2, Math.min(H - 24, py + ph + 28), 20, '#fff'); }
    ctx.globalAlpha = 1;
  }

  /* ---------------- loop ---------------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!G.paused && !TA?.paused) update(dt);
    draw();
    if (!G.destroyed) G.raf = requestAnimationFrame(loop);
  }
  G.raf = requestAnimationFrame(loop);
  if (AUTOPILOT) setTimeout(startRun, 400);

  TA?.register({
    capabilities: { pause: true, touch: true, keyboard: true, orientation: 'landscape' },
    mount(config) { if (config.mode !== 'free') throw new Error('Canyon Jump supports Free Play only.'); },
    start() { startRun(); },
    pause() { G.paused = true; held.clear(); touches.clear(); stick = null; A.suspend(); },
    resume() { G.paused = false; last = performance.now(); A.resume(); },
    restart() { startRun(); },
    audio(muted) { A.setMuted(muted); },
    destroy() { G.destroyed = true; cancelAnimationFrame(G.raf); A.destroy(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('resize', resize); },
  });
  window.__cj = { G, S, startRun, update, get run() { return G.run; } };
})();
