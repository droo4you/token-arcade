/* Canyon Jump: app shell, input, camera, HUD, screens and Token Arcade bridge hooks. */
(function () {
  'use strict';
  const S = window.CJSim, C = S.C, R = window.CJRender, A = window.CJAudio;
  const params = new URLSearchParams(location.search);
  const TA = window.TokenArcade;
  const AUTOPILOT = params.get('autopilot') === '1' && !TA?.embedded; // standalone preview / capture only
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // 3D world (src/render3d.js, ES module) draws into #gl under this HUD canvas; ?r=2d forces the legacy 2D renderer.
  const glCanvas = params.get('r') !== '2d' && document.getElementById('gl');
  const R3 = () => { const r = glCanvas && window.CJRender3D; return r && r.ready ? r : null; };
  const waiting3D = () => glCanvas && !window.CJRender3D?.failed && !R3() && G.t < 4;
  let W = 960, H = 540, dpr = 1;
  const BEST_KEY = TA?.embedded ? 'ta.canyon-jump.best' : 'canyon-jump.best';
  let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* storage blocked */ }

  const G = {
    screen: 'title', run: null, acc: 0, t: 0, paused: false, destroyed: false, raf: 0,
    shake: 0, flash: 0, flashColor: '#fff', boostT: 0, endAt: 0, result: null, countdown: 0,
    cam: { x: 0, y: 2.6, z: -8, f: 600, hy: 240, roll: 0 }, carVis: { x: 0, y: 0, z: 0, roll: 0 }, roll: 0,
    particles: [], popups: [], banner: null, fovKick: 0, camDip: 0, hitStop: 0, safe: { t: 0, r: 0, b: 0, l: 0 }, touch: false, landingRoll: 0, landZ: 0, arcadeRunOpen: false,
  };
  const attract = S.newRun(7);
  const MUTE_KEY = 'canyon-jump.muted';
  try { if (localStorage.getItem(MUTE_KEY) === '1') A.setMuted(true); } catch (e) { /* ignore */ }
  function toggleMute() { A.setMuted(!A.muted); try { localStorage.setItem(MUTE_KEY, A.muted ? '1' : '0'); } catch (e) { /* ignore */ } A.sfx('ui'); }
  const FORCE_Q = params.has('q'); G.q = FORCE_Q ? (+params.get('q') ? 1 : 0) : 1; // 1 = full detail, 0 = mid-phone fallback

  const safeProbe = document.createElement('div');
  if (safeProbe.style) safeProbe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body?.appendChild?.(safeProbe);
  function resize() {
    const cw = innerWidth, ch = innerHeight; dpr = Math.min(G.q || glCanvas ? 2 : 1.25, devicePixelRatio || 1);
    G.portrait = ch > cw * 1.05;
    // Portrait fills the screen with a taller logical canvas instead of letterboxing a landscape one.
    if (G.portrait) { W = 432; H = Math.round(Math.min(1000, W * ch / cw)); }
    else { H = 540; W = Math.round(Math.max(540, Math.min(1200, H * cw / ch))); }
    const scale = Math.min(cw / W, ch / H);
    canvas.style.width = Math.round(W * scale) + 'px'; canvas.style.height = Math.round(H * scale) + 'px';
    if (glCanvas && glCanvas.style) { glCanvas.style.width = canvas.style.width; glCanvas.style.height = canvas.style.height; }
    // HUD backing store is capped at ~3.7 MP (2560x1440): a 4K / Retina window would otherwise clear and redraw 8+ MP of 2D canvas every frame.
    dpr = Math.min(dpr, Math.sqrt(3.7e6 / Math.max(1, W * scale * H * scale)));
    canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
    G.pxScale = scale * dpr;
    G.vh = Math.min(H, W * (G.portrait ? 0.85 : 0.62)); G.fb = G.vh * 1.1; // view band + focal base: keeps framing sane in portrait
    const cs = typeof getComputedStyle === 'function' && safeProbe.isConnected ? getComputedStyle(safeProbe) : {}, px = v => (parseFloat(v) || 0) / scale;
    G.safe = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  }
  const HY = frac => H * 0.5 + (frac - 0.5) * G.vh;
  addEventListener('resize', resize); resize();

  /* ---------------- input ---------------- */
  const held = new Set(); const edges = { left: false, right: false, boost: false, trick: false, roll: false, stab: false };
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    // Space / Shift = STABILIZE (thrusters). Boost is Z (next to X/C) or J (next to K/L).
    Space: 'stab', ShiftLeft: 'stab', ShiftRight: 'stab', KeyZ: 'boost', KeyJ: 'boost', KeyX: 'trick', KeyK: 'trick', KeyC: 'roll', KeyL: 'roll' };
  function onKey(e, down) {
    const a = KEYMAP[e.code];
    if (down) A.init();
    if (down && (e.code === 'KeyM')) { toggleMute(); return; }
    if (down && e.code === 'KeyR' && G.paused && canRestart()) { G.paused = false; A.resume(); startRun(); return; }
    if (down && (e.code === 'KeyP' || e.code === 'Escape') && G.screen === 'play') { togglePause(); return; }
    if (down && (e.code === 'Enter' || e.code === 'Space') && (G.screen === 'title' || (G.screen === 'end' && G.t - G.endAt > 0.8))) { e.preventDefault(); startRun(); return; }
    if (!a) return; e.preventDefault();
    if (down && !held.has(a)) { if (a in edges) edges[a] = true; }
    down ? held.add(a) : held.delete(a);
  }
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  // Touch: swipe for lanes on the road; in the sky, the left side is an analog stick (up/down = pitch, sideways = steer),
  // the right side has BOOST / FLIP / ROLL (tap the right side = boost, swipe up = kickflip, swipe sideways = barrel roll).
  const touches = new Map(); let stick = null; const lanes = window.CJInput.create();
  // STABILIZE is a wide thumb pill above the boost/flip/roll cluster, on the right, well clear of the left stick.
  const BTN = () => { const r = 12 + (G.safe?.r || 0), b = 12 + (G.safe?.b || 0); return { boost: { x: W - r - 62, y: H - b - 112, r: 52 }, trick: { x: W - r - 170, y: H - b - 52, r: 40 }, roll: { x: W - r - 168, y: H - b - 152, r: 38 },
    stab: { x: W - r - 104, y: H - b - 238, w: 188, h: 62, pill: true } }; };
  const inBtn = (p, k, B) => B.pill ? Math.abs(p.x - B.x) < B.w / 2 + 10 && Math.abs(p.y - B.y) < B.h / 2 + 10 : Math.hypot(p.x - B.x, p.y - B.y) < B.r * 1.25;
  const STICK_R = 46;
  function toLogical(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function onDown(e) {
    A.init(); canvas.focus?.();
    if (e.pointerType === 'touch') G.touch = true;
    const p = toLogical(e);
    if (G.screen === 'play' && hitBtn(p, 'mute')) { toggleMute(); return; }
    if (G.paused) { pauseMenuTap(p); return; }
    if (G.screen !== 'play') { if (G.screen === 'title' || G.t - G.endAt > 0.8) startRun(); return; }
    if (hitBtn(p, 'pause')) { togglePause(); return; }
    const run = G.run, b = BTN();
    if (run.phase === 'sky' && G.touch) {
      for (const k of ['stab', 'boost', 'trick', 'roll']) if (inBtn(p, k, b[k])) { edges[k] = true; G.btnFlash = { k, t: G.t }; touches.set(e.pointerId, { btn: k }); return; }
    }
    // Road: lane gestures go through CJInput (one gesture = at most one lane change).
    touches.set(e.pointerId, { x0: p.x, y0: p.y, x: p.x, y: p.y, t0: G.t, used: false });
    if (run.phase === 'road') lanes.down(e.pointerId, p.x, p.y, G.t, W / 2);
    if (run.phase === 'sky' && p.x < W * 0.6) stick = e.pointerId;
  }
  function onMove(e) {
    const tch = touches.get(e.pointerId); if (!tch || tch.btn) return;
    const p = toLogical(e); tch.x = p.x; tch.y = p.y;
    const run = G.run; if (!run || G.screen !== 'play') return;
    if (run.phase === 'road') { const d = lanes.move(e.pointerId, p.x, p.y); if (d) edges[d] = true; }
    if (run.phase === 'sky' && stick !== e.pointerId && !tch.used) {
      const dx = p.x - tch.x0, dy = tch.y0 - p.y;
      if (dy > 45 && dy > Math.abs(dx)) { edges.trick = true; tch.used = true; }
      else if (Math.abs(dx) > 45 && Math.abs(dx) > dy) { edges.roll = true; G.rollDir = dx > 0 ? 1 : -1; tch.used = true; }
    }
  }
  function onUp(e) {
    const tch = touches.get(e.pointerId); touches.delete(e.pointerId); if (stick === e.pointerId) stick = null;
    const tapDir = lanes.up(e.pointerId);
    if (!tch || tch.btn || !G.run || G.screen !== 'play') return;
    if (tapDir && G.run.phase === 'road') edges[tapDir] = true;
    const moved = Math.hypot(tch.x - tch.x0, tch.y - tch.y0);
    if (G.run.phase === 'sky' && moved < 12 && G.t - tch.t0 < 0.25 && tch.x0 >= W * 0.6) edges.boost = true;
  }
  canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', e => { lanes.cancel(e.pointerId); onUp(e); });
  // HUD buttons (logical px), safe-area aware.
  function hudBtns() { const m = 12 + (G.safe?.r || 0), t = 12 + (G.safe?.t || 0); return { pause: { x: W - m - 40, y: t, w: 40, h: 40 }, mute: { x: W - m - 88, y: t, w: 40, h: 40 } }; }
  const hitBtn = (p, k) => { const b = hudBtns()[k]; return p.x > b.x - 6 && p.x < b.x + b.w + 6 && p.y > b.y - 6 && p.y < b.y + b.h + 6; };
  const canRestart = () => !TA?.active;
  function pauseItems() {
    const items = [['resume', 'RESUME'], ...(canRestart() ? [['restart', 'RESTART']] : []), ['mute', A.muted ? 'SOUND: OFF' : 'SOUND: ON']];
    const w = Math.min(300, W - 60), h = 52, gap = 12, total = items.length * (h + gap) - gap, y0 = H / 2 - total / 2 + 24;
    return items.map(([id, label], i) => ({ id, label, x: W / 2 - w / 2, y: y0 + i * (h + gap), w, h }));
  }
  function pauseMenuTap(p) {
    const it = pauseItems().find(b => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h); if (!it) return;
    if (it.id === 'resume') togglePause(); else if (it.id === 'mute') toggleMute(); else if (it.id === 'restart') { G.paused = false; A.resume(); startRun(); }
  }

  function readInput() {
    const i = { leftEdge: edges.left, rightEdge: edges.right, boostEdge: edges.boost, trickEdge: edges.trick, rollEdge: edges.roll, stabEdge: edges.stab,
      left: held.has('left'), right: held.has('right'), up: held.has('up'), down: held.has('down') };
    if (edges.roll) i.rollDir = held.has('left') ? -1 : held.has('right') ? 1 : (G.rollDir || 1);
    for (const d of lanes.tick(G.t)) if (G.run?.phase === 'road') i[d === 'left' ? 'leftEdge' : 'rightEdge'] = true;
    if (stick !== null && touches.has(stick)) {
      // Analog stick with a small dead zone: full deflection at STICK_R px. Drag up = nose up.
      const t = touches.get(stick), dx = t.x - t.x0, dy = t.y - t.y0, dz = v => Math.abs(v) < 7 ? 0 : (v - Math.sign(v) * 7) / (STICK_R - 7);
      i.steer = Math.max(-1, Math.min(1, dz(dx))); i.pitch = Math.max(-1, Math.min(1, -dz(dy)));
      G.stickVis = { x0: t.x0, y0: t.y0, dx: i.steer, dy: -i.pitch };
    }
    if (AUTOPILOT && G.run) Object.assign(i, autopilot(G.run));
    if (stick === null) G.stickVis = null;
    edges.left = edges.right = edges.boost = edges.trick = edges.roll = edges.stab = false;
    return i;
  }
  // The sim's reference pilot (CJSim.bot) flies the standalone ?autopilot=1 preview (used for capture); never active in the arcade.
  function autopilot(s) { return S.bot(s); }

  /* ---------------- run lifecycle ---------------- */
  function startRun() {
    if (TA?.active && !TA.beginRun()) return;
    G.arcadeRunOpen = !!TA?.active;
    A.init(); A.sfx('go');
    const seed = params.has('seed') && !TA?.embedded ? +params.get('seed') : (Math.random() * 2 ** 31) >>> 0;
    G.run = S.newRun(seed); G.screen = 'play'; G.acc = 0; G.result = null; G.paused = false;
    G.particles.length = 0; G.popups.length = 0; R3()?.reset(); G.banner = { text: 'BEAT THE CLEAR LINE', sub: 'grab speed pads, dodge everything', t: G.t, dur: 2.2, color: '#ffd23f' };
    G.cam = { x: 0, y: 2.6, z: -8, f: 600, hy: HY(0.44), roll: 0 }; G.roll = 0; G.hitStop = 0; G.camDip = 0; G.fovKick = 0; G.machT = 0; G.newBestShown = false; G.landingRoll = 0;
  }
  function finish() {
    const r = S.score(G.run); G.result = r; G.endAt = G.t; G.screen = 'end';
    if (r.total > best) { best = r.total; r.newBest = true; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ } }
    if (G.arcadeRunOpen && TA?.active) {
      G.arcadeRunOpen = false;
      TA.complete({ result: r.reason === 'landed' ? 'completed' : 'failed', primaryMetric: r.total,
        secondaryMetrics: { distance: r.distance, pastRim: r.pastRim, pickups: r.pickups, tricks: r.tricks, trickCount: r.counts.tricks, rings: r.counts.rings, bestMult: r.counts.bestMult,
          landing: r.landing, mach05: r.mach05, topKmh: r.topKmh, launchSpeed: r.launchV, landed: r.reason === 'landed' ? 1 : 0, elapsedMs: Math.round(G.run.t * 1000) } });
    }
  }
  function togglePause() { G.paused = !G.paused; G.paused ? A.suspend() : A.resume(); }

  /* ---------------- events → juice ---------------- */
  const KMH = v => Math.round(v * 3.6);
  const fmtMult = m => (Math.round(m * 100) / 100).toString();
  const fmtPts = v => Math.round(v).toLocaleString('en-US');
  // One speed scale (m/s shown as km/h) for the road meter and the sky meter, with Mach 0.5 marked on both.
  const SPEED_MAX = C.M_MAX, MACH_NEAR = 50 / 3.6, MACH_MARK = { at: C.MACH05, label: 'MACH 0.5', near: MACH_NEAR };
  function burst(x, y, n, colors, speed, life, grav, glow) {
    if (!G.q) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: life * (0.7 + Math.random() * 0.5), max: life, c: colors[i % colors.length], s: 2 + Math.random() * 3.5, g: grav ?? 300, glow });
    }
  }
  function popup(text, color, big, sub, key) { const cs = G.carScreenLast || { x: W / 2, y: H * 0.7 }; if (key) G.popups = G.popups.filter(p => p.key !== key); G.popups.push({ key, text, color, x: Math.max(80, Math.min(W - 80, cs.x + (Math.random() - 0.5) * 60)), y: cs.y - 60, t: G.t, big, sub }); }
  function sparks(x, y, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 250 + Math.random() * 450; G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.5, max: 0.5, c: i % 2 ? '#ffd23f' : '#fff4c0', s: 2, g: 600, streak: true, glow: true }); } }
  function dustRing(x, y, k) { for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2, v = 160 + Math.random() * 120; G.particles.push({ x: x + Math.cos(a) * k * 0.6, y: y + 4, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v * 0.25 - 20, life: 0.9, max: 0.9, c: i % 3 ? '#e8b087' : '#fff0dc', s: 5 + Math.random() * 6, g: -30, soft: true }); } }
  function handleEvents(s) {
    const cs = G.carScreenLast || { x: W / 2, y: H * 0.72 }, r3 = R3();
    for (const ev of s.events) {
      if (r3) r3.event(ev, s);
      switch (ev.e) {
        case 'orb': A.sfx('orb', s.counts.orbs % 8); burst(cs.x, cs.y - 30, 8, ['#ffd34d', '#fff6c0'], 160, 0.5); popup('+50', '#ffd34d'); break;
        case 'air': A.sfx('air'); burst(cs.x, cs.y - 30, 14, ['#5af0ff', '#ffffff'], 220, 0.6); G.airPulse = 1; popup('+1 AIR', '#5af0ff', false, s.air > 1 ? `${s.air} cans` : null, 'air'); break;
        case 'pad': A.sfx('pad'); G.fovKick = 0.8; burst(cs.x, cs.y, 16, ['#ff4fd8', '#ffd0f4', '#fff'], 260, 0.5, 200, true); G.shake = Math.max(G.shake, 6); G.flash = 0.25; G.flashColor = '#ff4fd8'; G.boostT = 0.6; popup('SPEED PAD', '#ff4fd8', true); break;
        case 'lane': A.sfx('lane'); break;
        case 'near': if (s.phase === 'sky') { A.sfx('whoosh', 1); G.shake = Math.max(G.shake, 5); popup('NEAR MISS', '#fff4e0', false, `×${fmtMult(ev.mult)}`); G.comboPulse = 1; } else { A.sfx('near'); popup('NEAR MISS', '#fff4e0', false, `+${C.NEAR_ROAD_PTS}`); } break;
        case 'ring': A.sfx('ring', s.counts.rings); G.fovKick = Math.max(G.fovKick, 0.7); G.flash = Math.max(G.flash, 0.18); G.flashColor = '#ffd23f'; G.boostT = Math.max(G.boostT, 0.45); G.shake = Math.max(G.shake, 6); G.comboPulse = 1;
          popup(ev.risky ? 'RISKY RING' : 'BOOST RING', '#ffd23f', ev.risky, `×${fmtMult(ev.mult)}`); burst(cs.x, cs.y - 10, 18, ['#ffd23f', '#fff6c0', '#ff9f1a'], 300, 0.5, 0, true); break;
        case 'launch': A.sfx('launch'); G.slowT = 0.9; G.shake = 14; G.flash = 0.5; G.flashColor = '#fff1a8'; G.boostT = 1;
          G.banner = { text: 'SEND IT!', sub: `${KMH(ev.v)} km/h off the ramp`, t: G.t, dur: 2.2, color: '#5af0ff' };
          burst(cs.x, cs.y, 40, ['#ffd23f', '#ff7a1a', '#fff'], 360, 0.9); break;
        case 'short': A.sfx('short'); G.shake = 8; G.banner = { text: s.launchV && s.launchV < C.CLEAR_V ? 'TOO SLOW' : 'FELL SHORT', sub: 'the canyon wins this one', t: G.t, dur: 2.5, color: '#ff5a78' }; break;
        case 'trick': A.sfx('flip', ev.kind === 'roll' ? 1 : 0); G.trickKick = 1; break;
        case 'rim': A.sfx('landed_trick', 2); G.flash = 0.3; G.flashColor = '#5af0ff'; G.banner = { text: 'CLEARED THE CANYON', sub: 'now ride the momentum', t: G.t, dur: 2.4, color: '#5af0ff' }; break;
        case 'splash': A.sfx('splash'); G.shake = 18; G.hitStop = 0.1; burst(cs.x, cs.y, 40, ['#2fc4c9', '#7fe8e4', '#fff'], 300, 1);
          if (s.phase === 'sky') G.banner = { text: 'INTO THE RIVER', sub: s.cmb.pot ? `combo lost (${fmtPts(s.cmb.pot * s.cmb.mult)})` : 'pull up sooner', t: G.t, dur: 2.8, color: '#ff5a78' }; break;
        case 'boost': A.sfx('boost'); G.shake = Math.max(G.shake, 11); G.hitStop = Math.max(G.hitStop, 0.045); G.slowT = Math.max(G.slowT || 0, 0.08); G.camKick = 1; G.flash = Math.max(G.flash, 0.22); G.flashColor = '#5af0ff'; G.boostT = 0.9; G.fovKick = 1; burst(cs.x, cs.y + 20, 22, ['#5af0ff', '#b9fbff', '#7b55ff'], 300, 0.6, -40, true); popup(ev.dive ? 'DIVE BOOST' : 'AIR BOOST', '#5af0ff', ev.dive || ev.chain > 0, ev.chain > 0 ? `CHAIN ×${ev.chain + 1}` : null, 'boost'); G.airPulse = 0.6; break;
        case 'mach': A.sfx('mach'); G.machT = 1; G.flash = 0.9; G.flashColor = '#ffffff'; G.shake = 26; G.fovKick = 1; G.hitStop = 0.08;
          G.banner = { text: 'MACH 0.5!', sub: `${KMH(ev.v)} km/h  ·  +${C.MACH_BONUS}`, t: G.t, dur: 2.6, color: '#ffffff' };
          burst(cs.x, cs.y - 10, 40, ['#ffffff', '#cfefff', '#9fd8ff'], 520, 0.7, 0, true); break;
        case 'empty': A.sfx('empty'); popup('NO AIR', '#ff5a78'); break;
        case 'stab': A.sfx('stab', ev.free ? 1 : 0); G.stabFx = 1; G.shake = 0; G.camKick = 0; G.trickKick = 0; G.flash = Math.max(G.flash, 0.12); G.flashColor = '#e8f6ff';
          popup('STABILIZED', '#e8f6ff', true, ev.outcome === 'credited' ? `${ev.kind === 'roll' ? 'ROLL' : 'FLIP'} SAVED` : ev.outcome === 'cancelled' ? 'trick cancelled' : ev.free ? 'no AIR: slow burn' : '−1 AIR');
          burst(cs.x, cs.y - 6, 22, ['#ffffff', '#e8f6ff', '#c9e6ff'], 260, 0.55, -20); break;
        case 'landed_trick': A.sfx('landed_trick', ev.n - 1); G.shake = Math.max(G.shake, 9); G.hitStop = Math.max(G.hitStop, 0.06); G.slowT = Math.max(G.slowT || 0, 0.14); G.comboPulse = 1; G.fovKick = Math.max(G.fovKick, 0.5);
          if (ev.via === 'auto') break; // touchdown auto-finish: the landing banner tells it
          popup(`${ev.kind === 'roll' ? 'BARREL ROLL' : 'KICKFLIP'} +${ev.pts}${ev.varied ? ' MIX' : ''}`, ev.kind === 'roll' ? '#ff4fd8' : '#ffd23f', true, ev.n > 1 ? `COMBO ×${fmtMult(ev.mult)}` : null);
          burst(cs.x, cs.y - 20, 26, ['#ffd23f', '#ff4fd8', '#5af0ff', '#fff'], 300, 0.7, 0, true); break;
        case 'crash': A.sfx('crash'); G.shake = 24; G.flash = 0.7; G.flashColor = '#ff3b5c'; G.hitStop = 0.16; G.slowT = 0.6;
          burst(cs.x, cs.y - 10, 36, ['#f4f1ee', '#a9b3cc', '#3a2a3f'], 420, 1.1);
          sparks(cs.x, cs.y - 10, 28);
          { const lost = ev.lost ? `  ·  combo lost (${fmtPts(ev.lost)})` : '';
            const B = { botched: ['BOTCHED LANDING', 'finish the trick before you touch down' + lost], nosedive: ['NOSE-DIVED', 'level out before you land' + lost], wall: ['HIT THE WALL', 'climb above the far rim'] }[ev.what] || ['WIPEOUT', `hit a ${ev.what === 'satellite' ? 'satellite' : ev.what}`];
            G.banner = { text: B[0], sub: B[1], t: G.t, dur: 3, color: '#ff3b5c' }; } break;
        case 'land': A.sfx('land'); G.shake = 14; G.camDip = 1; G.hitStop = 0.06; dustRing(cs.x, cs.y, cs.k || 30); burst(cs.x, cs.y, 24, ['#e3925a', '#ffd9a8', '#fff'], 300, 1); G.landZ = s.z; G.landingRoll = Math.max(10, s.m * 0.6);
          G.banner = { text: ev.combo ? `COMBO +${fmtPts(ev.combo)}` : 'STUCK THE LANDING', sub: `${ev.combo ? `×${fmtMult(ev.mult)} cashed  ·  ` : ''}+${C.LANDING_BONUS} landing${ev.onRoad ? `  ·  +${C.ROAD_BONUS} on the road` : ''}${s.counts.autoFinish ? '  ·  trick auto-finished' : ''}`, t: G.t, dur: 3, color: ev.combo ? '#ffd23f' : '#5af0ff' };
          if (ev.combo) A.sfx('cash', Math.min(6, Math.round(ev.mult))); break;
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
      if (G.hitStop > 0) G.hitStop -= dt; // freeze-frame on impact (presentation only; sim just pauses)
      else G.acc += G.slowT > 0 ? dt * 0.3 : dt;
      while (G.acc >= C.DT) { G.acc -= C.DT; if (!s.over) S.step(s, readInput()); }
      handleEvents(s);
    }
    if (s.over && s.reason === 'landed') { G.landingRoll = Math.max(0, G.landingRoll - 18 * dt); s.z += G.landingRoll * dt; s.x *= 0.98; }
    // camera
    const k = 1 - Math.exp(-dt * 8), kz = 1 - Math.exp(-dt * 14);
    const target = { x: s.x * 0.65, y: 2.7, z: s.z - 7.5, f: G.fb / (1 + Math.max(0, (s.phase === 'road' ? s.v : s.m) - 40) / 260) * (1 - 0.12 * G.fovKick) };
    let hyT = HY(0.44);
    if (s.phase === 'road') {
      // Run-up: rise and pull back so the kicker reads head-on from above.
      const a = Math.max(0, Math.min(1, (s.z - (C.ROAD_LEN - 160)) / 120));
      target.y = 2.7 + s.y * 0.6 + a * 4.5; target.z = s.z - 7.5 - a * 5; hyT = HY(0.44 - a * 0.08);
    }
    if (s.phase === 'sky' || (s.over && s.reason !== 'road')) {
      // Fixed framing in the sky so the car stays a readable size; boosts punch the FOV briefly.
      target.y = s.y + 3.0; target.z = s.z - 8.5; target.x = s.x * 0.8; target.f = G.fb * (1 - 0.12 * G.fovKick);
    }
    // Over the gorge: pull the camera back and up and look down so the drop, river and far rim are on screen.
    const overGap = s.z > C.ROAD_LEN - 10 && s.z < C.ROAD_LEN + C.CANYON_W + 30 && (s.phase === 'sky' || s.phase === 'fall' || (s.over && s.reason !== 'road'));
    if (overGap) {
      // Launch cam: hang back at the near lip while the car arcs out, then trail it across.
      // Then ease in to a closer trail after ~0.6 s so the car doesn't shrink to a dot.
      const ease = s.phase === 'sky' ? Math.max(0, Math.min(1, (s.t - (s.launchT || 0) - 0.6) / 1.4)) : 0;
      target.z = Math.max(s.z - 20 + ease * 8, Math.min(s.z - 14 + ease * 3, C.ROAD_LEN - 30 + ease * 1e4));
      target.y = s.y + 8 - ease * 3; target.x = s.x * 0.7 + 2; hyT = HY(0.2 + ease * 0.1);
    }
    if (s.phase === 'fall') { target.y = Math.max(s.y + 20, -C.CANYON_DEPTH + 20); target.z = s.z - 30; }
    if (s.over && (s.reason === 'road' || s.reason === 'air' || s.reason === 'botched')) target.z = G.cam.z; // freeze on impact
    G.camDip = Math.max(0, G.camDip - dt * 3); target.y -= G.camDip * 1.4;
    G.cam.x += (target.x - G.cam.x) * k; G.cam.y += (target.y - G.cam.y) * k * 0.8; G.cam.z += (target.z - G.cam.z) * kz;
    if (Math.abs(target.z - G.cam.z) > 60) G.cam.z = target.z;
    G.cam.f += (target.f - G.cam.f) * k;
    const pitch = s.phase === 'sky' ? Math.max(-30, Math.min(30, -s.vy * 1.6)) : 0;
    G.cam.hy += (hyT + (overGap ? 0 : pitch) - G.cam.hy) * k * 0.7;
    G.roll += ((s.rot || 0) - G.roll) * 0.6; if (!s.trick) G.roll = (s.rot || 0);
    // Wheel spin, suspension bob and the auto quality fallback (visual only; never touches the sim).
    const wheelV = s.phase === 'road' ? s.v : (G.wheelV || 0) * Math.exp(-dt * 0.8); G.wheelV = wheelV; G.spin = (G.spin || 0) + wheelV * dt * 1.6;
    G.bob = s.phase === 'road' ? Math.sin(G.t * 17) * 0.018 * Math.min(1, s.v / 60) + (Math.random() - 0.5) * 0.012 * Math.min(1, s.v / 80) : s.phase === 'sky' ? Math.sin(G.t * 2.2) * 0.04 : 0;
    if (G.screen === 'play' && !G.paused && !FORCE_Q && !R3()) { // 2D renderer only: the 3D one has its own governor G.fpsAcc = (G.fpsAcc || 0) + dt; G.fpsN = (G.fpsN || 0) + 1;
      if (G.fpsAcc > 2.5) { const avg = G.fpsAcc / G.fpsN; if (G.q && avg > 1 / 48) { G.q = 0; resize(); } G.fpsAcc = 0; G.fpsN = 0; } }
    G.airPulse = Math.max(0, (G.airPulse || 0) - dt * 3); G.stabFx = Math.max(0, (G.stabFx || 0) - dt * 2.5); G.comboPulse = Math.max(0, (G.comboPulse || 0) - dt * 3); G.camKick = Math.max(0, (G.camKick || 0) - dt * 4); G.trickKick = Math.max(0, (G.trickKick || 0) - dt * 3);
    G.machT = Math.max(0, (G.machT || 0) - dt * 0.9); G.shake *= Math.exp(-dt * 7); G.fovKick = Math.max(0, G.fovKick - dt * 2.2); G.flash = Math.max(0, G.flash - dt * 2); G.boostT = Math.max(0, G.boostT - dt);
    for (const p of G.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.98; }
    G.particles = G.particles.filter(p => p.life > 0);
    if (!R3() && s.phase === 'road' && G.screen === 'play' && !s.over && G.carScreenLast && Math.random() < s.v / 90) {
      const cs = G.carScreenLast; G.particles.push({ x: cs.x + (Math.random() - 0.5) * cs.k * 2, y: cs.y + cs.k * 0.3, vx: (Math.random() - 0.5) * 60, vy: 20 + Math.random() * 40, life: 0.5, max: 0.5, c: '#f4b07a', s: 3 + Math.random() * 4, g: -60 });
    }
    G.popups = G.popups.filter(p => G.t - p.t < 1.1);
    A.drive(s.phase, s.v, s.m, G.screen === 'play' && !s.over && !G.paused, s.y || 0, s.phase === 'sky' ? Math.max(0, -Math.sin(s.gam || 0)) : 0);
    // Ground-proximity tone: beeps faster as impact nears while diving steeply (or with a trick still spinning).
    if (G.screen === 'play' && s.phase === 'sky' && !s.over && !G.paused) { const w = landWarn(s); if (w && G.t - (G.beepT || 0) > (w === 'pull' ? 0.16 : 0.3)) { G.beepT = G.t; A.sfx('beep', w === 'pull' ? 1 : 0); } }
  }
  const CANYON_SAFE = 120;
  /* Landing warning: 'pull' = diving too steeply to land and impact is close; 'level' = a trick is still spinning near the ground. */
  function landWarn(s) {
    if (s.phase !== 'sky' || s.vy >= 0) return null;
    const far = C.ROAD_LEN + C.CANYON_W, fwd = Math.max(10, s.m * Math.cos(s.gam));
    if (s.z < far) { // over the gorge: will we pass under the far rim, or hit the river first?
      const tRim = (far - s.z) / fwd, yAtRim = s.y + s.vy * tRim;
      if (yAtRim < 2 && tRim < 2.2) return 'pull';
      if (S.agl(s) / -s.vy < 1.6) return 'pull';
      return null;
    }
    const tImpact = S.agl(s) / -s.vy;
    if (s.gam < -C.LAND_MAX_DIVE * 0.85 && tImpact < 2.4) return 'pull';
    if (s.trick > 0 && tImpact < 1.4) return 'level';
    return null;
  }
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
    const r3 = R3();
    if (r3 || waiting3D()) ctx.clearRect(0, 0, W, H);
    const sh = G.shake, ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    ctx.save(); ctx.translate(ox, oy);
    const roll = (s.bank || 0) * 0.14;
    G.cam.q = G.q;
    const view = { cam: G.cam, t: G.t, carX: s.x, carY: s.y, carZ: s.z, bob: G.bob || 0, spin: G.spin || 0, bank: s.bank || 0, groundY: s.z > C.ROAD_LEN && s.z < C.ROAD_LEN + C.CANYON_W ? -C.CANYON_DEPTH : 0,
      roll: G.roll + roll, boostT: G.boostT };
    const camP = r3 ? r3.render(s, view, G, W, H) : waiting3D() ? null : R.drawWorld(ctx, W, H, s, view);
    if (view.carScreen) G.carScreenLast = view.carScreen;
    if (camP && camP.hy != null && r3) G.cam.hy = camP.hy; // speed lines radiate from the real 3D horizon
    const spd = s.phase === 'road' ? s.v : s.m;
    if (!s.over && !(r3 && s.phase === 'sky')) R.speedLines(ctx, W, H, G.cam.hy, Math.max(0, (spd - 55) / 60) + G.boostT * 0.6, G.t, G.boostT > 0.1, !G.q);
    if (G.machT > 0 && G.carScreenLast) vaporCone(G.carScreenLast, 1 - G.machT);
    if (G.screen !== 'end') drawParticles();
    if (G.screen === 'play' && !s.over) drawWarnings(camP, s);
    ctx.restore();
    // vignette + flash
    const vr = Math.max(W, H);
    if (!(r3 && r3.post)) { // the 3D post chain has its own vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, vr * 0.3, W / 2, H / 2, vr * 0.75);
    vg.addColorStop(0, 'rgba(20,0,30,0)'); vg.addColorStop(1, 'rgba(20,0,30,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); }
    if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.6; ctx.fillStyle = G.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (G.screen === 'title') drawTitle();
    else { drawHud(s); if (G.screen === 'end') drawEnd(); }
    if (G.paused) drawPause();
    if (DEBUG) drawDebug(r3);
  }
  /* ?debug=1: FPS / quality-level overlay (bottom left). */
  const DEBUG = params.get('debug') === '1';
  function drawDebug(r3) {
    const st = r3 && r3.stats, now = performance.now();
    G.dbgN = (G.dbgN || 0) + 1; if (!G.dbgT) G.dbgT = now; if (now - G.dbgT > 500) { G.dbgFps = G.dbgN * 1000 / (now - G.dbgT); G.dbgN = 0; G.dbgT = now; }
    const lines = st ? [
      `${(G.dbgFps || 0).toFixed(0)} fps  ${st.frameMs.toFixed(1)} ms  ${st.fixed ? '(pinned)' : 'auto'}`,
      `${st.level}  ${st.buf} = ${st.mpx.toFixed(2)} MP  pr ${st.pr.toFixed(2)}  post ${r3.post ? 'on' : 'off'}`,
      `${st.calls} calls  ${(st.tris / 1000).toFixed(0)}k tris  ${st.particles || 0} particles`,
      `start ${st.start.why}: ${String(st.start.gpu).slice(0, 48)}`,
      ...st.log.slice(-3),
    ] : [`${(G.dbgFps || 0).toFixed(0)} fps  2D renderer${window.CJRender3D && window.CJRender3D.why ? ': ' + window.CJRender3D.why : ''}`, `HUD ${canvas.width}x${canvas.height}`];
    const w = 360, h = 12 + lines.length * 15, x = 12 + G.safe.l, y = 72 + G.safe.t; // under the score chip
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, w, h);
    lines.forEach((ln, i) => text(ln, x + 8, y + 13 + i * 15, 11, i ? '#cfe' : '#7f7', 'left', false, 700));
  }
  // Sonic-boom vapor cone: a bright condensation disc that blooms around the car, then expanding shock rings.
  function vaporCone(cs, a) {
    const k = cs.k || 30, cx = cs.x, cy = cs.y - k * 0.4;
    ctx.save();
    const disc = Math.min(1, a * 4), fade = Math.max(0, 1 - a * 1.4);
    if (fade > 0) {
      const R = k * (1.6 + disc * 2.2), g = ctx.createRadialGradient(cx, cy, R * 0.35, cx, cy, R);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, `rgba(235,248,255,${0.75 * fade})`); g.addColorStop(0.8, `rgba(200,230,255,${0.45 * fade})`); g.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.62, 0, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 3; i++) { const t = a - i * 0.12; if (t <= 0 || t > 0.9) continue;
      const R = k * (2 + t * 14); ctx.globalAlpha = (1 - t / 0.9) * 0.8; ctx.strokeStyle = i ? '#cfefff' : '#ffffff'; ctx.lineWidth = Math.max(2, k * 0.18 * (1 - t));
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.6, 0, 0, 7); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawParticles() {
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max); ctx.globalAlpha = p.soft ? a * 0.55 : a;
      if (p.glow && G.q) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
      if (p.streak) { ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); }
      else { const r = (p.soft ? p.s * (1.6 - a * 0.6) : p.s) / 2; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.8, r), 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- HUD ---------------- */
  // One type scale for the whole HUD: label 11 / body 14 / value 24 / title 30+.
  const T = { label: 11, body: 14, value: 24 };
  function mg() { return { l: 12 + G.safe.l, r: 12 + G.safe.r, t: 12 + G.safe.t, b: 12 + G.safe.b }; }
  function chip(x, y, w, h, r = 12) { panel(x, y, w, h, r, 'rgba(22,10,36,0.74)'); ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); ctx.stroke(); }
  function meter(x, y, w, h, value, max, mark, colorLow, colorHigh, label, sub, extra) {
    chip(x - 12, y - 32, w + 24, h + 44, 12);
    const f = Math.max(0, Math.min(1, value / max)), m = mark / max, ok = value >= mark;
    ctx.fillStyle = '#1a0d26'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, ok ? '#38e8c8' : '#ff3b5c'); g.addColorStop(1, ok ? colorHigh : colorLow);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * f), h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.roundRect(x + 3, y + 2, Math.max(0, w * f - 6), h * 0.3, h * 0.15); ctx.fill();
    if (mark) { const mx = x + w * m; ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1.5, y - 6, 3, h + 12); ctx.beginPath(); ctx.moveTo(mx - 6, y - 11); ctx.lineTo(mx + 6, y - 11); ctx.lineTo(mx, y - 5); ctx.fill(); }
    if (extra) { const ex = x + w * Math.min(1, extra.at / max), hit = value >= extra.at || extra.done;
      // Closing in (within MACH_NEAR): the bar glows white and pulses faster the closer you get, and the mark reads the gap.
      const near = !hit && extra.near && value >= extra.at - extra.near, k = near ? 1 - (extra.at - value) / extra.near : 0;
      if (near) { const pulse = 0.55 + 0.45 * Math.sin(G.t * (10 + k * 18)); ctx.save(); ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8 + k * 18 * pulse;
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.6 * k * pulse})`; ctx.lineWidth = 2 + k * 2; ctx.beginPath(); ctx.roundRect(x - 3, y - 3, w + 6, h + 6, (h + 6) / 2); ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = hit || near ? '#ffffff' : 'rgba(255,255,255,0.55)'; ctx.fillRect(ex - (near ? 1.5 : 1), y - (near ? 7 : 4), near ? 3 : 2, h + (near ? 14 : 8));
      text(near ? `${extra.label}  −${Math.max(1, Math.ceil((extra.at - value) * 3.6))} km/h` : extra.label, ex, y + h + 9, near ? 10 : 9, hit || near ? '#ffffff' : 'rgba(255,233,240,0.75)', 'center', false, 800); }
    text(label, x, y - 16, T.body, '#fff', 'left', true, 800);
    if (sub && sub.text) text(sub.text, x + w, y - 16, w < 300 ? 10 : 12, sub.color, 'right', true, 800);
  }
  function iconBtn(b, kind) {
    chip(b.x, b.y, b.w, b.h, 10); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (kind === 'pause') { ctx.fillRect(cx - 8, cy - 10, 5, 20); ctx.fillRect(cx + 3, cy - 10, 5, 20); return; }
    ctx.beginPath(); ctx.moveTo(cx - 11, cy - 4); ctx.lineTo(cx - 6, cy - 4); ctx.lineTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx - 6, cy + 4); ctx.lineTo(cx - 11, cy + 4); ctx.closePath(); ctx.fill();
    if (A.muted) { ctx.strokeStyle = '#ff5a78'; ctx.beginPath(); ctx.moveTo(cx + 4, cy - 6); ctx.lineTo(cx + 12, cy + 6); ctx.moveTo(cx + 12, cy - 6); ctx.lineTo(cx + 4, cy + 6); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(cx + 2, cy, 6, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 2, cy, 11, -0.9, 0.9); ctx.stroke(); }
  }
  function drawHud(s) {
    const r = S.score(s), M = mg(), narrow = W < 760, hb = hudBtns();
    // score (left)
    const sw = narrow ? 128 : 170; chip(M.l, M.t, sw, 52);
    text('SCORE', M.l + 12, M.t + 15, T.label, '#ffb3c6', 'left', false, 800);
    text(r.total.toLocaleString('en-US'), M.l + 12, M.t + 36, narrow ? 20 : T.value, '#fff', 'left');
    // buttons (right)
    iconBtn(hb.pause, 'pause'); iconBtn(hb.mute, 'mute');
    // AIR cans (no cap): the first few as icons, then a ×N count, in a fixed-width chip so it never jumps around.
    // Right of score on wide screens, under the buttons on narrow ones.
    const K = narrow ? 3 : 5, cw = narrow ? 18 : 22, more = s.air > K, aw = 40 + K * cw + (narrow ? 34 : 44), ah = narrow ? 38 : 52;
    const ax = narrow ? W - M.r - aw : hb.mute.x - aw - 10, ay = narrow ? M.t + 50 : M.t, ap = G.airPulse || 0;
    chip(ax, ay, aw, ah);
    if (ap > 0) { ctx.save(); ctx.globalAlpha = ap * 0.8; ctx.strokeStyle = '#5af0ff'; ctx.lineWidth = 2 + ap * 3; ctx.beginPath(); ctx.roundRect(ax + 1, ay + 1, aw - 2, ah - 2, 12); ctx.stroke(); ctx.restore(); }
    text('AIR', ax + 10, ay + ah / 2, T.label, '#5af0ff', 'left', false, 800);
    const iw = narrow ? 13 : 15, ih = narrow ? 19 : 22;
    for (let i = 0; i < K; i++) {
      const x = ax + 36 + i * cw, y = ay + (ah - ih) / 2 + 2, on = i < s.air;
      if (!on && s.air > 0) break; // only the empty slot outline shows when you're out of cans
      ctx.fillStyle = on ? '#5af0ff' : 'rgba(90,240,255,0.14)'; ctx.beginPath(); ctx.roundRect(x, y, iw, ih, 5); ctx.fill();
      if (on) { ctx.fillStyle = '#fff'; ctx.fillRect(x + iw / 2 - 2.5, y - 3, 5, 4); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 3, y + 4, 3, ih - 10); }
      if (!on) break;
    }
    // Count: always shown once you have more than the icons can show, or none at all (×0, dimmed).
    if (more || s.air === 0) { const sc = 1 + ap * 0.25, cx = ax + aw - 12; ctx.save(); ctx.translate(cx, ay + ah / 2 + 1); ctx.scale(sc, sc);
      text(`×${s.air > 999 ? '999+' : s.air}`, 0, 0, narrow ? 17 : 20, s.air ? '#ffffff' : 'rgba(255,255,255,0.4)', 'right', true, 900); ctx.restore(); }
    if (G.screen === 'end') return;
    // centre strip: progress / altitude
    const pw = narrow ? W - M.l - M.r : Math.min(340, W * 0.34), px = W / 2 - pw / 2, py = narrow ? M.t + (G.portrait ? 96 : 60) : M.t;
    const mw = Math.min(460, W - M.l - M.r - 24), mx = W / 2 - mw / 2;
    const touchSky = G.touch && s.phase === 'sky';
    const my = touchSky && (narrow || G.portrait) ? py + 86 : H - M.b - 22;
    if (s.phase === 'road') {
      const left = Math.max(0, Math.ceil(C.ROAD_LEN - s.z));
      chip(px, py, pw, 44);
      text(`CANYON IN ${left.toLocaleString('en-US')} m`, W / 2, py + 15, T.body, left < 300 ? '#ffd23f' : '#fff', 'center', true, 800);
      const bx = px + 14, bw = pw - 28, f = Math.min(1, s.z / C.ROAD_LEN);
      ctx.fillStyle = '#1a0d26'; ctx.fillRect(bx, py + 29, bw, 6); ctx.fillStyle = '#ffd23f'; ctx.fillRect(bx, py + 29, bw * f, 6);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx + bw * f, py + 32, 5, 0, 7); ctx.fill();
      const ok = s.v >= C.CLEAR_V, pulse = left < 400 ? 0.6 + 0.4 * Math.sin(G.t * 12) : 1;
      meter(mx, my, mw, 14, s.v, SPEED_MAX, C.CLEAR_V, '#ff7a1a', '#5af0ff', `${KMH(s.v)} km/h`,
        { text: ok ? 'WILL CLEAR ✓' : `CLEAR ${KMH(C.CLEAR_V)} km/h`, color: ok ? `rgba(90,240,200,${pulse})` : `rgba(255,210,63,${pulse})` }, MACH_MARK);
    } else if (s.phase === 'sky' || (s.over && s.phase !== 'fall')) {
      const farRim = C.ROAD_LEN + C.CANYON_W, toRim = Math.ceil(farRim - s.z);
      chip(px, py, pw, 44);
      text(toRim > 0 ? `FAR RIM IN ${toRim} m` : `+${Math.floor(s.z - farRim).toLocaleString('en-US')} m PAST THE RIM`, W / 2, py + 15, T.body, toRim > 0 ? '#ffd23f' : '#5af0ff', 'center', true, 800);
      const band = s.y < 0 ? 'IN THE GORGE' : s.y < C.BAND_PLANE ? 'BIRDS' : s.y < C.BAND_SAT ? 'PLANES' : 'SATELLITES';
      const deg = Math.round((s.gam || 0) * 57.3);
      text(`ALT ${Math.round(s.y)} m  ·  ${deg > 0 ? '▲' : deg < 0 ? '▼' : '■'} ${Math.abs(deg)}°  ·  ${band}`, W / 2, py + 32, T.label, s.y < 0 ? '#ff9fb0' : '#ffd9e6', 'center', false, 700);
      // Combo pot: unbanked until a clean landing.
      if (s.cmb && s.cmb.pot > 0 && !(s.over && s.reason === 'landed')) {
        const cp = G.comboPulse || 0, cy = py + 64 + (narrow ? 4 : 0), lost = s.over;
        ctx.save(); ctx.translate(W / 2, cy); ctx.scale(1 + cp * 0.18, 1 + cp * 0.18);
        chip(-96, -17, 192, 34, 17);
        text(`COMBO ${fmtPts(s.cmb.pot)} × ${fmtMult(s.cmb.mult)}`, 0, 1, 17, lost ? '#8a7a96' : '#ffd23f', 'center', true, 900);
        ctx.restore();
        if (lost) { ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 90, cy); ctx.lineTo(W / 2 + 90, cy); ctx.stroke(); }
      }
      const stall = s.m < C.V_STALL + 6 && !s.over, blink = Math.floor(G.t * 6) % 2;
      const warn = !s.over && landWarn(s);
      const status = s.stabT > 0 ? 'STABILIZING…' : s.trick > 0 ? (s.trickKind === 'roll' ? 'BARREL ROLL…' : 'KICKFLIP…') : stall ? (blink ? 'STALL: DIVE!' : '') : s.gam > 0.05 ? '▲ CLIMBING' : s.gam < -0.05 ? '▼ DIVING' : 'LEVEL';
      meter(mx, my, mw, 14, s.m, SPEED_MAX, C.V_STALL, '#ff7a1a', '#5af0ff', `${KMH(s.m)} km/h${s.counts.mach ? '  ·  MACH 0.5 ✓' : ''}`,
        { text: status, color: s.stabT > 0 ? '#e8f6ff' : stall ? '#ff5a78' : s.gam < -0.05 ? '#5af0ff' : '#ffd23f' }, s.counts.mach ? { ...MACH_MARK, done: true } : MACH_MARK);
      if (warn && s.stabT <= 0) { const big = warn === 'pull', wy = H * (G.portrait ? 0.42 : 0.4); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.t * 20);
        text(big ? 'PULL UP!' : 'LEVEL OUT!', W / 2, wy, big ? 34 : 28, big ? '#ff3b5c' : '#ffd23f'); ctx.globalAlpha = 1;
        // hint the thrusters (they're the fix for both warnings)
        const ready = s.stabCd <= 0, key = G.touch ? 'tap STABILIZE ▶' : 'SPACE / SHIFT = STABILIZE';
        text(ready ? key : `stabilize in ${s.stabCd.toFixed(1)} s`, W / 2, wy + (big ? 30 : 26), T.body + 1, ready ? '#e8f6ff' : 'rgba(232,246,255,0.6)', 'center', true, 800); }
      if (!s.over) attitude(s);
      const flipReady = s.trick <= 0 && s.t - s.lastTrickEnd >= C.TRICK_CD && S.agl(s) > C.TRICK_MIN_AGL;
      if (G.touch && !s.over) {
        const b = BTN(); btn(b.boost, s.gam <= C.DIVE_BOOST_GAM && s.air > 0 ? 'DIVE' : 'BOOST', '#5af0ff', s.air > 0 && s.boostCd <= 0, s.air > 99 ? '99+' : `${s.air}`); btn(b.trick, 'FLIP', '#ffd23f', flipReady && s.stabT <= 0); btn(b.roll, 'ROLL', '#ff4fd8', flipReady && s.stabT <= 0); stabBtn(b.stab, s);
        if (G.stickVis) { const v = G.stickVis; ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(v.x0, v.y0, STICK_R, 0, 7); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(v.x0 + v.dx * STICK_R, v.y0 + v.dy * STICK_R, 16, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        else if (s.t - s.launchT < 3) text('drag left side: ▲▼ pitch  ◀▶ steer', W * 0.25, H - mg().b - 70, T.body, '#fff', 'center', true, 700);
      }
    } else if (s.phase === 'fall') {
      text('↓', W / 2, H - 60, 40, '#ff5a78');
    }
    if (G.touch && s.phase === 'road' && G.run && G.run.t < 4) text('tap or swipe left / right', W / 2, my - 52, T.body, '#fff', 'center', true, 700);
    // popups: pop in, float, fade
    for (const p of G.popups) {
      const a = (G.t - p.t) / 1.1, sc = a < 0.12 ? 0.5 + a / 0.12 * 0.7 : a < 0.22 ? 1.2 - (a - 0.12) * 2 : 1;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - a * a); ctx.translate(p.x, p.y - a * 46); ctx.scale(sc, sc);
      text(p.text, 0, 0, p.big ? 22 : 15, p.color);
      if (p.sub) text(p.sub, 0, 22, 14, '#ff4fd8', 'center', true, 900);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (G.banner && G.t - G.banner.t < G.banner.dur && G.screen === 'play') {
      const a = (G.t - G.banner.t) / G.banner.dur, sc = a < 0.1 ? 0.6 + a * 4 : 1, bs = Math.min(44, W / 11);
      ctx.globalAlpha = a > 0.8 ? (1 - a) * 5 : 1; ctx.save(); ctx.translate(W / 2, G.portrait ? H * 0.3 : H * 0.24); ctx.scale(sc, sc);
      text(G.banner.text, 0, 0, bs, G.banner.color); text(G.banner.sub, 0, bs * 0.85, T.body + 2, '#fff4e0', 'center', true, 700); ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  /* Telegraph: anything you'll reach within ~1.6 s near your line gets a pulsing marker; off-screen ones pin to the edge. */
  function drawWarnings(cam, s) {
    if (!cam || s.phase !== 'sky') return;
    for (const th of S.threats(s)) {
      const p = cam.p(th.x, th.y, th.o.z), urgent = th.tt < 0.8, pulse = 0.55 + 0.45 * Math.sin(G.t * (urgent ? 22 : 12));
      let x = p ? p.x : W / 2, y = p ? p.y : H / 2;
      const off = !p || x < 30 || x > W - 30 || y < 70 || y > H - 70;
      x = Math.max(30, Math.min(W - 30, x)); y = Math.max(70, Math.min(H - 70, y));
      const r = off ? 18 : Math.max(18, Math.min(60, (p ? p.k : 10) * th.o.r * 1.2));
      ctx.globalAlpha = pulse; ctx.lineWidth = urgent ? 4 : 3; ctx.strokeStyle = urgent ? '#ff3b5c' : '#ffd23f';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      text('!', x, y, off ? 20 : 18, urgent ? '#ff3b5c' : '#ffd23f', 'center', true);
      ctx.globalAlpha = 1;
    }
  }
  /* STABILIZE pill: cost shown on the right (1 AIR, or "slow" when out of cans), cooldown sweeps across it. */
  function stabBtn(b, s) {
    const cd = s.stabCd, maxCd = s.stabDur === C.STAB_T_FREE ? C.STAB_CD_FREE : C.STAB_CD, ready = cd <= 0, firing = s.stabT > 0;
    const warn = landWarn(s), x = b.x - b.w / 2, y = b.y - b.h / 2, col = '#e8f6ff';
    const pulse = ready && warn ? 0.5 + 0.5 * Math.sin(G.t * 14) : 0;
    ctx.globalAlpha = ready || firing ? 0.95 : 0.55;
    ctx.fillStyle = firing ? 'rgba(232,246,255,0.9)' : 'rgba(22,10,36,0.78)'; ctx.beginPath(); ctx.roundRect(x, y, b.w, b.h, b.h / 2); ctx.fill();
    if (!ready && !firing) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, b.w, b.h, b.h / 2); ctx.clip(); ctx.fillStyle = 'rgba(232,246,255,0.22)'; ctx.fillRect(x, y, b.w * (1 - cd / maxCd), b.h); ctx.restore(); }
    ctx.lineWidth = 4 + pulse * 3; ctx.strokeStyle = pulse ? `rgba(255,255,255,${0.7 + pulse * 0.3})` : col; ctx.beginPath(); ctx.roundRect(x, y, b.w, b.h, b.h / 2); ctx.stroke();
    text('STABILIZE', b.x - 16, b.y - 1, 17, firing ? '#1a0d26' : col, 'center', false, 900);
    const free = s.air <= 0; ctx.fillStyle = free ? '#ffb35a' : '#5af0ff'; ctx.beginPath(); ctx.arc(x + b.w - 30, b.y, 17, 0, 7); ctx.fill();
    text(free ? 'SLOW' : '−1', x + b.w - 30, b.y + 1, free ? 9 : 13, '#1a0d26', 'center', false, 900);
    ctx.globalAlpha = 1;
  }
  /* Landing-attitude tick near touchdown: the car's nose angle against level, green inside the clean window. */
  function attitude(s) {
    if (s.phase !== 'sky' || s.z < C.ROAD_LEN + C.CANYON_W - 40 || s.vy >= 0 || !G.carScreenLast) return;
    const h = S.agl(s), tImp = h / -s.vy; if (h > 45 && tImp > 3) return;
    const trickOk = s.trick <= 0 || S.trickProgress(s) >= C.TRICK_AUTO, ok = s.gam >= -C.LAND_MAX_DIVE && trickOk;
    const cs = G.carScreenLast, cx = Math.max(90, Math.min(W - 90, cs.x + 120)), cy = Math.max(90, Math.min(H - 120, cs.y - 20)), R = 34;
    const col = ok ? '#38e8a0' : '#ff3b5c', a = clampA(s.gam);
    ctx.globalAlpha = 0.9; chip(cx - R - 12, cy - R - 10, 2 * R + 24, 2 * R + 28, 12);
    ctx.strokeStyle = 'rgba(56,232,160,0.35)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(cx, cy, R - 4, -0.05, C.LAND_MAX_DIVE); ctx.stroke(); // clean window (0..32° down)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); ctx.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R); ctx.stroke(); ctx.lineCap = 'butt';
    text(ok ? 'LAND OK' : s.trick > 0 && !trickOk ? 'TRICK!' : 'TOO STEEP', cx, cy + R + 4, 11, col, 'center', false, 900);
    ctx.globalAlpha = 1;
  }
  const clampA = g => Math.max(-1.2, Math.min(0.9, g));
  function btn(b, label, color, on, badge) {
    const pressed = G.btnFlash && G.btnFlash.k === label.toLowerCase().replace('flip', 'trick').replace('dive', 'boost') && G.t - G.btnFlash.t < 0.12;
    ctx.globalAlpha = on ? 0.95 : 0.35; ctx.fillStyle = pressed ? color : 'rgba(22,10,36,0.72)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (pressed ? 0.94 : 1), 0, 7); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke(); text(label, b.x, b.y, 15, pressed ? '#1a0d26' : color, 'center', false);
    if (badge) { const br = badge.length > 2 ? 15 : badge.length > 1 ? 13 : 11; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(b.x + b.r * 0.7, b.y - b.r * 0.7, br, 0, 7); ctx.fill(); text(badge, b.x + b.r * 0.7, b.y - b.r * 0.7, 12, '#1a0d26', 'center', false); }
    ctx.globalAlpha = 1;
  }
  function logo(y, size) {
    ctx.save(); ctx.font = font(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#ffb35a'); g.addColorStop(0.52, '#ff4f6a'); g.addColorStop(1, '#a3205e');
    ctx.fillStyle = '#1b0f3b'; ctx.fillText('CANYON JUMP', W / 2 + 4, y + 5);
    ctx.lineWidth = Math.max(4, size / 13); ctx.strokeStyle = '#2a0f3a'; ctx.strokeText('CANYON JUMP', W / 2, y);
    ctx.fillStyle = g; ctx.fillText('CANYON JUMP', W / 2, y);
    const sx = ((G.t * 0.35) % 1.6 - 0.3) * W; // shine sweep, clipped to the letters by re-filling the text
    const sg = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.6)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillText('CANYON JUMP', W / 2, y); ctx.restore();
  }
  function drawTitle() {
    const M = mg(), narrow = W < 700, size = Math.min(78, (W - 40) / 7.2), ly = M.t + (G.portrait ? H * 0.1 : H * 0.15);
    logo(ly, size);
    text('floor it.  send it.  stick it.', W / 2, ly + size * 0.68, T.body + 2, '#fff4e0', 'center', true, 700);
    const steps = [
      ['STRAIGHTAWAY', G.touch ? 'Tap or swipe left / right to change lanes. Dodge everything, grab AIR cans and speed pads.' : '← / → or A / D to change lanes. Dodge everything, grab AIR cans and speed pads.', '#ffd23f'],
      ['LAUNCH', `Hit the ramp above the CLEAR line (${KMH(C.CLEAR_V)} km/h) or you drop into the canyon.`, '#ff4fd8'],
      ['SKY', G.touch ? 'Left side = stick: up/down pitch (dive for speed, climb for height). BOOST spends an AIR can (chain 3 fast for MACH 0.5; boosting in a dive hits harder). FLIP, ROLL build a combo. STABILIZE fires thrusters to level out: land past the far rim to cash it.' : '↑/↓ pitch: dive for speed, climb for height. ←/→ steer. Z boost (chain 3 fast for MACH 0.5), X kickflip, C barrel roll. SPACE / SHIFT stabilize to level out, then land past the far rim to cash the combo.', '#5af0ff'],
    ];
    const cw = Math.min(880, W - M.l - M.r - 8), cx = W / 2 - cw / 2, cy = ly + size * 0.68 + 30, stack = cw < 640;
    ctx.font = font(13, 600);
    const lines = str => { const out = []; let line = ''; const maxW = stack ? cw - 36 : cw / 3 - 34; for (const w of str.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
    const blocks = steps.map(st => lines(st[1]));
    const ch = stack ? 18 + blocks.reduce((a, b) => a + 30 + b.length * 18, 0) : 52 + Math.max(...blocks.map(b => b.length)) * 18 + 10;
    chip(cx, cy, cw, ch, 16);
    let yy = cy + 22;
    steps.forEach((st, i) => {
      const x = stack ? cx + 18 : cx + (cw / 3) * i + 18, y0 = stack ? yy : cy + 26;
      ctx.fillStyle = st[2]; ctx.beginPath(); ctx.arc(x + 9, y0, 10, 0, 7); ctx.fill(); text(String(i + 1), x + 9, y0 + 1, 12, '#1a0d26', 'center', false);
      text(st[0], x + 26, y0, 15, st[2], 'left', false);
      blocks[i].forEach((ln, k) => text(ln, x, y0 + 24 + k * 18, 13, '#fff4e0', 'left', false, 600));
      yy += 30 + blocks[i].length * 18;
    });
    text('Score = distance + pickups + combo × multiplier  (+500 clean landing)', W / 2, cy + ch + 20, 12, '#ffd9e6', 'center', true, 700);
    const by = G.portrait ? Math.min(H - M.b - 60, cy + ch + 74) : H - M.b - (best ? 58 : 36), pulse = 0.75 + 0.25 * Math.sin(G.t * 5), bw = Math.min(300, W - 60);
    ctx.globalAlpha = pulse; panel(W / 2 - bw / 2, by - 24, bw, 48, 24, '#ffd23f'); ctx.globalAlpha = 1;
    text(G.touch ? 'TAP TO RIDE' : 'SPACE / CLICK TO RIDE', W / 2, by, 18, '#1a0d26', 'center', false);
    if (best) text(`BEST ${best.toLocaleString('en-US')}`, W / 2, by + 42, 14, '#ffd23f', 'center', true, 800);
    if (G.portrait) text('↻  rotate for the widest view', W / 2, H - M.b - 10, 12, 'rgba(255,233,240,0.75)', 'center', false, 700);
  }
  function wrap(str, x, y, maxW, px, color) {
    ctx.font = font(px, 600); const words = str.split(' '); let line = '', yy = y;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { text(line, x, yy, px, color, 'left', false, 600); line = w; yy += px * 1.35; } else line = t; }
    if (line) text(line, x, yy, px, color, 'left', false, 600);
  }
  function drawEnd() {
    const r = G.result; if (!r) return;
    const a = Math.min(1, (G.t - G.endAt) / 0.35);
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(20,6,30,0.6)'; ctx.fillRect(0, 0, W, H);
    const titles = { landed: ['CLEAN LANDING', '#5af0ff'], road: ['WIPED OUT', '#ff3b5c'], air: ['MIDAIR COLLISION', '#ff3b5c'], botched: ['BOTCHED LANDING', '#ff7a1a'], short: ['DIDN\'T CLEAR THE CANYON', '#ff5a78'] };
    const [title, col] = titles[r.reason] || ['RUN OVER', '#fff'];
    const pw = Math.min(460, W - 32), ph = r.newBest ? 404 : 372, px = W / 2 - pw / 2, py = H / 2 - ph / 2 + (1 - a) * 30;
    chip(px, py, pw, ph, 20);
    ctx.fillStyle = col; ctx.fillRect(px + 20, py + 1, pw - 40, 4);
    text(title, W / 2, py + 36, W < 500 ? 22 : 28, col);
    const rows = [
      ['Distance', `${r.pastRim ? '+' + r.pastRim + ' m past rim' : r.distance + ' m'}`, r.distance],
      ['Pickups', `${r.counts.orbs} coins · ${r.counts.air} AIR · ${r.counts.rings} rings`, r.pickups],
      ['Combo', r.counts.tricks || r.counts.nearMiss ? `${r.counts.flips} flip · ${r.counts.rolls} roll · ${r.counts.nearMiss} near · ×${fmtMult(r.combo.mult)}${r.reason !== 'landed' && r.combo.pot ? ' lost' : ''}` : '—', r.tricks],
      ['Landing', r.landing ? (r.onRoad ? 'stuck it, on the road' : 'stuck it') : '—', r.landing],
      ['Mach 0.5', r.mach05 ? `617+ · top ${r.topKmh} km/h` : `top ${r.topKmh} km/h`, r.mach, r.mach05 ? '#ffffff' : null],
    ];
    // rows count up one after another
    const el = G.t - G.endAt;
    rows.forEach((row, i) => {
      const y = py + 80 + i * 36, ra = Math.max(0, Math.min(1, (el - 0.25 - i * 0.15) / 0.3)); if (!ra) return;
      ctx.globalAlpha = a * ra;
      text(row[0] + (i === 4 && r.mach05 ? ' ✓' : ''), px + 22, y, 16, row[3] || '#ffd9e6', 'left', false, 700);
      if (pw > 380) text(row[1], px + pw * 0.56, y, 12, '#b9a6ee', 'center', false, 600);
      text('+' + Math.round(row[2] * ra).toLocaleString('en-US'), px + pw - 22, y, 18, '#fff', 'right', false);
    });
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px + 20, py + 258, pw - 40, 2);
    const tv = Math.round(r.total * Math.max(0, Math.min(1, (el - 1.05) / 0.5)));
    text('TOTAL', px + 22, py + 286, 20, '#ffd23f', 'left', false); text(tv.toLocaleString('en-US'), px + pw - 22, py + 286, 32, '#ffd23f', 'right');
    const launch = r.launchV ? `launch ${KMH(r.launchV)} km/h  ·  peak alt ${r.maxAlt} m` : `crashed before the canyon (clear line ${KMH(C.CLEAR_V)} km/h)`;
    text(launch, W / 2, py + 318, 12, '#ffd9e6', 'center', false, 600);
    if (r.newBest && el > 1.4) {
      if (!G.newBestShown) { G.newBestShown = true; A.sfx('land'); for (let i = 0; i < (G.q ? 90 : 40); i++) G.particles.push({ x: W / 2 + (Math.random() - 0.5) * pw, y: py - 10, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 250, life: 2, max: 2, c: ['#ffd23f', '#ff4fd8', '#5af0ff', '#fff'][i % 4], s: 4 + Math.random() * 4, g: 380 }); }
      const pulse = 1 + 0.06 * Math.sin(G.t * 8); ctx.save(); ctx.translate(W / 2, py + 354); ctx.scale(pulse, pulse);
      panel(-110, -18, 220, 36, 18, '#ffd23f'); text('★ NEW BEST ★', 0, 1, 18, '#1a0d26', 'center', false); ctx.restore();
    } else if (!r.newBest) text(`best ${best.toLocaleString('en-US')}`, W / 2, py + 346, 14, '#b9a6ee', 'center', false, 800);
    if (el > 0.8) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 5); text(G.touch ? 'TAP TO RIDE AGAIN' : 'SPACE / TAP TO RIDE AGAIN', W / 2, Math.min(H - mg().b - 14, py + ph + 28), 20, '#fff'); }
    ctx.globalAlpha = 1;
    if (G.screen === 'end') drawParticles();
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(14,4,24,0.66)'; ctx.fillRect(0, 0, W, H);
    const items = pauseItems();
    text('PAUSED', W / 2, items[0].y - 36, 34, '#fff');
    for (const it of items) { chip(it.x, it.y, it.w, it.h, 14); text(it.label, W / 2, it.y + it.h / 2, 17, it.id === 'resume' ? '#ffd23f' : '#fff', 'center', false); }
    text(G.touch ? '' : `P / Esc resume${canRestart() ? '  ·  R restart' : ''}  ·  M sound`, W / 2, items[items.length - 1].y + 80, 12, '#ffd9e6', 'center', false, 700);
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
    pause() { G.paused = true; held.clear(); touches.clear(); lanes.clear(); stick = null; A.suspend(); },
    resume() { G.paused = false; last = performance.now(); A.resume(); },
    restart() { startRun(); },
    audio(muted) { A.setMuted(muted); },
    destroy() { G.destroyed = true; cancelAnimationFrame(G.raf); A.destroy(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('resize', resize); },
  });
  window.__cj = { G, S, startRun, update, get run() { return G.run; } };
})();
