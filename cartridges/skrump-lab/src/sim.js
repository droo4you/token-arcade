/* Skrump Lab: Weapons Test — deterministic 2D sim (no DOM).
 * 120 Hz fixed step, seeded mulberry32, circles vs circles / static boxes.
 * Only + - * / and Math.sqrt / Math.abs / Math.min / Math.max / Math.round / Math.floor are used, all exact in IEEE-754,
 * so a run replays bit-identically in any engine from (seed, inputs). No clock, no Math.random.
 * Weapons (what fires, how) come from weapons.js; this file owns the locked rules: physics, displacement, shot economy, scoring.
 * Input record: array of actions, ['F', qx, qy] = fire with integer pull vector (|q| <= 100), ['E'] = conclude the FIG early.
 */
(function (root) {
  'use strict';
  const WP = (typeof module !== 'undefined' && module.exports) ? require('./weapons.js') : root.SkrumpWeapons;
  const SIM_VERSION = 5, HZ = 120, DT = 1 / HZ, G = 18, ITER = 4, MAX_SHOT_TICKS = HZ * 9;
  const SUBJ_R = 0.5, DISPLACE_D = 1.0, OUT = { x0: -12, x1: 90, y0: -10 };
  const PTS = { perSubject: 100, clear: 500, unusedShell: 250, overkill: 300, wasted: 100 };
  // A FIG = one weapon from the registry, flattened for the sim. Legacy fields (id, shots, vk) kept for the scorer and tests.
  function figOf(w) { return { ...w, key: w.id, id: w.fig, shots: w.shells, vk: w.fire.vk, g: G * w.fire.gScale }; }
  function lineup(v) { const L = WP.LINEUPS[v]; if (!L) throw new Error('unknown sim version ' + v); return L.map(k => figOf(WP.WEAPONS[k])); }
  const FIGS = lineup(SIM_VERSION);
  const S3 = 1.7320508075688772;

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashSeed(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  /* ---------- pile layouts (seeded) ---------- */
  function pyramid(out, x0, yBase, rows, look) { const r = SUBJ_R; for (let row = 0; row < rows; row++) for (let i = 0; i < rows - row; i++) out.push({ x: x0 + r + row * r + i * 2 * r, y: yBase + r + row * r * S3, look }); }
  function tower(out, x, yBase, n, look) { for (let i = 0; i < n; i++) out.push({ x, y: yBase + SUBJ_R + i * 2 * SUBJ_R, look }); }
  function layout(figIdx, seed, figs) {
    const R = rng((seed ^ Math.imul(figIdx + 1, 0x9E3779B1)) >>> 0), boxes = [{ x0: -6, y0: -1, x1: 64, y1: 0, kind: 'floor' }], subs = [];
    const look = () => Math.floor(R() * 3), kind = (figs || FIGS)[figIdx].layout;
    if (kind === 'conga') { // FIG.3 v3: three low pyramids strung along the floor for a chain to chew through
      let x = 22 + Math.floor(R() * 4);
      for (let k = 0; k < 3; k++) { const h = k === 1 ? Math.floor(R() * 3) : 0; if (h) boxes.push({ x0: x - 0.5, y0: 0, x1: x + 4.5, y1: h, kind: 'plinth' }); pyramid(subs, x, h, 4, look()); x += 7 + Math.floor(R() * 4); }
    } else if (kind === 'dais') { // FIG.5 finale: one big pyramid on a raised dais
      const x = 34 + Math.floor(R() * 5), h = 1 + Math.floor(R() * 2); boxes.push({ x0: x - 0.8, y0: 0, x1: x + 10.8, y1: h, kind: 'plinth' }); pyramid(subs, x, h, 10, look());
    } else if (kind === 'gallery') { // FIG.3: low pyramid, two towers, a raised pyramid on a stand
      const px = 22 + Math.floor(R() * 5); pyramid(subs, px, 0, 5, look());
      let x = px + 7;
      for (let k = 0; k < 2; k++) { x += 2 + Math.floor(R() * 3); const h = Math.floor(R() * 3); if (h) boxes.push({ x0: x - 0.9, y0: 0, x1: x + 0.9, y1: h, kind: 'plinth' }); tower(subs, x, h, 7, look()); }
      const sx = x + 3 + Math.floor(R() * 3), sh = 3 + Math.floor(R() * 3); boxes.push({ x0: sx - 0.5, y0: 0, x1: sx + 4.5, y1: sh, kind: 'plinth' }); pyramid(subs, sx, sh, 4, look());
    } else if (kind === 'range') {
      const t = Math.floor(R() * 3);
      if (t === 0) { const x = 30 + Math.floor(R() * 9); pyramid(subs, x, 0, 8, look()); }
      else if (t === 1) { const x = 28 + Math.floor(R() * 5), h = 1 + Math.floor(R() * 3); boxes.push({ x0: x - 0.5, y0: 0, x1: x + 6.5, y1: h, kind: 'plinth' }); pyramid(subs, x, h, 6, look()); pyramid(subs, x + 9 + Math.floor(R() * 4), 0, 5, look()); }
      else { const x = 29 + Math.floor(R() * 6); pyramid(subs, x, 0, 7, look()); const tx = x + 9 + Math.floor(R() * 3), h = 2 + Math.floor(R() * 2); boxes.push({ x0: tx - 0.8, y0: 0, x1: tx + 0.8, y1: h, kind: 'plinth' }); tower(subs, tx, h, 8, look()); }
    } else {
      const px = 26 + Math.floor(R() * 6); pyramid(subs, px, 0, 6, look());
      let x = px + 8;
      const heights = [8, 8, 7];
      for (let k = 0; k < 3; k++) { x += 2 + Math.floor(R() * 4); const h = 1 + Math.floor(R() * 4); boxes.push({ x0: x - 0.9, y0: 0, x1: x + 0.9, y1: h, kind: 'plinth' }); tower(subs, x, h, heights[k], look()); }
      if (R() < 0.5) boxes.push({ x0: px - 3, y0: 3 + Math.floor(R() * 3), x1: px - 1, y1: 3.6 + Math.floor(R() * 3), kind: 'shelf' });
    }
    return { boxes, subs };
  }

  /* ---------- run ---------- */
  function newRun(seed, opts) {
    const v = (opts && opts.simVersion) || SIM_VERSION;
    const run = { v, seed: seed >>> 0, fig: -1, tick: 0, inputs: [], figs: [], over: false, lineup: v === SIM_VERSION ? FIGS : lineup(v) };
    startFig(run, 0); return run;
  }
  function startFig(run, i) {
    const F = run.lineup[i], L = layout(i, run.seed, run.lineup);
    run.fig = i; run.phase = 'aim'; run.shot = null; run.boxes = L.boxes;
    run.bodies = L.subs.map((s, k) => ({ id: k, kind: 'subj', look: s.look, x: s.x, y: s.y, vx: 0, vy: 0, g: G, r: SUBJ_R, inv: 1, sleep: true, still: 0, x0: s.x, y0: s.y, disp: false, out: false }));
    run.figs[i] = { id: F.id, N: run.bodies.length, shotsFired: 0, shots: [], displaced: 0, cleared: false, concluded: false, overkill: 0, wasted: 0, range: 0, ceasefire: F.rules.ceasefire ? 'none' : null };
  }
  function cur(run) { return run.figs[run.fig]; }
  function canFire(run) { return !run.over && run.phase === 'aim' && cur(run).shotsFired < run.lineup[run.fig].shots; }
  function clampQ(qx, qy) { qx = Math.round(qx) | 0; qy = Math.round(qy) | 0; const l2 = qx * qx + qy * qy; if (l2 > 10000) { const l = Math.sqrt(l2); qx = Math.round(qx * 100 / l); qy = Math.round(qy * 100 / l); } return [qx, qy]; }
  function fire(run, qx, qy) {
    if (!canFire(run)) return false;
    [qx, qy] = clampQ(qx, qy);
    const F = run.lineup[run.fig], f = cur(run);
    run.inputs.push(['F', qx, qy]);
    const overkill = f.cleared;
    f.shotsFired++;
    if (F.rules.ceasefire) f.ceasefire = f.shotsFired === 1 ? 'none' : 'denied';
    run.shot = { t: 0, proj: null, projs: [], q: [qx, qy], round: 0, before: f.displaced, overkill, maxX: F.launcher.x, events: [] };
    spawnDue(run);
    run.phase = 'flight';
    return true;
  }
  function spawnDue(run) { // pattern weapons spawn every round whose tick has come; others spawn one round now
    const F = run.lineup[run.fig], P = F.fire.pattern, sh = run.shot;
    if (!P) { spawnRound(run); return; }
    while (sh.round < P.length && P[sh.round].t <= sh.t) spawnRound(run, P[sh.round]);
  }
  function spawnRound(run, pt) { // one round of the current shell; burst weapons call this every fire.gap ticks
    const F = run.lineup[run.fig], P = F.proj, sh = run.shot, [qx, qy] = sh.q, k = F.fire.spread[sh.round % F.fire.spread.length];
    let vx = qx * F.vk, vy = qy * F.vk; if (pt) { vx *= pt.p; vy *= pt.p; if (pt.k) { const ox = -vy * pt.k, oy = vx * pt.k; vx += ox; vy += oy; } } else if (k) { const ox = -vy * k, oy = vx * k; vx += ox; vy += oy; }
    const L = sh.round === 0 && F.fire.lead, r = L ? L.r : P.r, m = L ? L.m : P.m;
    const b = { id: run.bodies.length, kind: 'proj', x: F.launcher.x + (F.fire.advance ? F.fire.advance * (cur(run).shotsFired - 1) : 0) + (pt ? pt.dx : 0), y: F.launcher.y + (pt ? pt.dy : 0), vx, vy, g: F.g, r, inv: 1 / m, sleep: false, still: 0, out: false, round: sh.round };
    run.bodies.push(b); sh.projs.push(b); if (!sh.proj) sh.proj = b; sh.round++;
  }
  function conclude(run) {
    if (run.over || run.phase !== 'aim') return false;
    const f = cur(run); if (!f.cleared) return false; // only after a full clear: "ceasefire: requested"
    run.inputs.push(['E']); f.concluded = true; run.phase = 'figdone'; return true;
  }
  function next(run) { // after 'figdone': deterministic advance, no input
    if (run.phase !== 'figdone') return;
    if (run.fig + 1 < run.lineup.length) startFig(run, run.fig + 1); else { run.phase = 'over'; run.over = true; }
  }

  function wake(b, run) { // wakes b and, transitively, every sleeper resting on it
    const q = [b]; b.sleep = false; b.still = 0;
    while (q.length) { const c = q.pop();
      for (const o of run.bodies) { if (!o.sleep || o.out || o.y <= c.y + 0.2) continue; const dx = o.x - c.x, dy = o.y - c.y, rr = o.r + c.r + 0.05; if (dx * dx + dy * dy < rr * rr) { o.sleep = false; o.still = 0; q.push(o); } } }
  }
  function collideCircles(a, b, run) {
    const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return;
    if (a.sleep && b.sleep) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    let rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    // a sleeping subject is rigid unless struck hard enough
    if (a.sleep && -rvn > 1.2) wake(a, run); if (b.sleep && -rvn > 1.2) wake(b, run);
    const ia = a.sleep ? 0 : a.inv, ib = b.sleep ? 0 : b.inv, is = ia + ib; if (is === 0) return;
    const pen = rr - d, corr = pen * 0.8 / is;
    a.x -= nx * corr * ia; a.y -= ny * corr * ia; b.x += nx * corr * ib; b.y += ny * corr * ib;
    if (rvn < 0) {
      const jn = -(1.25) * rvn / is;
      a.vx -= nx * jn * ia; a.vy -= ny * jn * ia; b.vx += nx * jn * ib; b.vy += ny * jn * ib;
      const tx = -ny, ty = nx, rvt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
      let jt = -rvt / is; const lim = 0.4 * jn; if (jt > lim) jt = lim; if (jt < -lim) jt = -lim;
      a.vx -= tx * jt * ia; a.vy -= ty * jt * ia; b.vx += tx * jt * ib; b.vy += ty * jt * ib;
      if (-rvn > 4 && run.shot && run.shot.events.length < 64) run.shot.events.push({ t: run.shot.t, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, s: -rvn });
    }
  }
  function collideBox(b, k) {
    const cx = b.x < k.x0 ? k.x0 : b.x > k.x1 ? k.x1 : b.x, cy = b.y < k.y0 ? k.y0 : b.y > k.y1 ? k.y1 : b.y;
    let dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy, nx, ny, pen;
    if (d2 === 0) { // centre inside: push out of the nearest face
      const l = b.x - k.x0, r = k.x1 - b.x, u = k.y1 - b.y, dn = b.y - k.y0, m = Math.min(l, r, u, dn);
      if (m === u) { nx = 0; ny = 1; pen = u + b.r; } else if (m === l) { nx = -1; ny = 0; pen = l + b.r; } else if (m === r) { nx = 1; ny = 0; pen = r + b.r; } else { nx = 0; ny = -1; pen = dn + b.r; }
    } else { if (d2 >= b.r * b.r) return; const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = b.r - d; }
    b.x += nx * pen; b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= 1.2 * vn * nx; b.vy -= 1.2 * vn * ny;
      const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty; let dv = -vt, lim = 0.5 * -vn; if (dv > lim) dv = lim; if (dv < -lim) dv = -lim;
      b.vx += tx * dv; b.vy += ty * dv;
    }
  }
  function step(run) {
    if (run.phase !== 'flight') return;
    const sh = run.shot, F = run.lineup[run.fig]; sh.t++; run.tick++;
    if (F.fire.pattern) spawnDue(run); else if (sh.round < F.fire.burst && sh.t % F.fire.gap === 0) spawnRound(run);
    const B = run.bodies, n = B.length;
    for (let i = 0; i < n; i++) { const b = B[i]; if (b.sleep || b.out) continue; b.vy -= b.g * DT; b.vx *= 0.9995; b.vy *= 0.9995; b.x += b.vx * DT; b.y += b.vy * DT; }
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) { const a = B[i]; if (a.out) continue;
        for (let j = i + 1; j < n; j++) { const b = B[j]; if (b.out) continue; const dx = b.x - a.x; if (dx > 3.2 || dx < -3.2) continue; collideCircles(a, b, run); }
        if (!a.sleep) for (let k = 0; k < run.boxes.length; k++) collideBox(a, run.boxes[k]);
      }
    }
      let awake = 0;
    for (let i = 0; i < n; i++) { const b = B[i]; if (b.out) continue;
      if (b.x < OUT.x0 || b.x > OUT.x1 || b.y < OUT.y0) { b.out = true; b.sleep = true; continue; }
      if (b.sleep) continue;
      awake++;
      const s2 = b.vx * b.vx + b.vy * b.vy;
      if (s2 < 0.09) { if (++b.still > 30) { b.sleep = true; b.vx = 0; b.vy = 0; if (b.kind === 'proj' && F.fire.despawn) { b.out = true; b.gone = true; } } } else b.still = 0;
    }
    for (const p of sh.projs) if (p.x > sh.maxX) sh.maxX = p.x;
    tally(run);
    if ((awake === 0 && sh.round >= F.fire.burst) || sh.t >= MAX_SHOT_TICKS) endShot(run);
  }
  function tally(run) {
    const f = cur(run); let d = 0;
    for (const b of run.bodies) if (b.kind === 'subj') { if (!b.disp) { const dx = b.x - b.x0, dy = b.y - b.y0; if (b.out || dx * dx + dy * dy > DISPLACE_D * DISPLACE_D) b.disp = true; } if (b.disp) d++; }
    f.displaced = d; if (d === f.N) f.cleared = true;
  }
  function endShot(run) {
    const f = cur(run), sh = run.shot, F = run.lineup[run.fig];
    for (const b of run.bodies) { b.sleep = true; b.vx = 0; b.vy = 0; }
    tally(run);
    const gained = f.displaced - sh.before;
    const rec = { n: f.shotsFired, displaced: gained, overkill: sh.overkill, wasted: !sh.overkill && gained === 0, range: Math.max(0, Math.round((sh.maxX - F.launcher.x) * 10)) / 10, ticks: sh.t };
    f.shots.push(rec); if (rec.overkill) f.overkill++; if (rec.wasted) f.wasted++; if (rec.range > f.range) f.range = rec.range;
    for (const p of sh.projs) p.spent = true;
    run.lastShot = rec; run.shot = null;
    run.phase = f.shotsFired >= F.shots ? 'figdone' : 'aim';
    if (F.rules.ceasefire && f.shotsFired === 1) f.ceasefire = 'requested';
  }

  /* ---------- scoring (documented in README) ---------- */
  function figScore(f, F) {
    let s = 0; for (const r of f.shots) s += PTS.perSubject * r.displaced;
    const clearBonus = f.cleared ? PTS.clear + PTS.unusedShell * (F.shots - f.shotsFired) : 0;
    const penalty = PTS.overkill * f.overkill + PTS.wasted * f.wasted;
    return { displacedPts: s, clearBonus, penalty, total: Math.max(0, s + clearBonus - penalty) };
  }
  function score(run) {
    let total = 0, displaced = 0, N = 0, shots = 0, overkill = 0, wasted = 0, clears = 0; const figs = [];
    run.figs.forEach((f, i) => { if (!f) return; const fs = figScore(f, run.lineup[i]); figs.push({ ...fs, id: f.id, weapon: run.lineup[i].key, displaced: f.displaced, N: f.N, shots: f.shotsFired, cleared: f.cleared, overkill: f.overkill, wasted: f.wasted, range: f.range });
      total += fs.total; displaced += f.displaced; N += f.N; shots += f.shotsFired; overkill += f.overkill; wasted += f.wasted; clears += f.cleared ? 1 : 0; });
    const perShotX100 = shots ? Math.round(displaced * 100 / shots) : 0;
    return { total, displaced, N, shots, overkill, wasted, clears, perShotX100, figs, ticks: run.tick, seed: run.seed, simVersion: run.v };
  }
  function settle(run) { while (run.phase === 'flight') step(run); }
  /** Server/test replay: seed + actions -> identical result. */
  function replay(seed, inputs, opts) { // opts.simVersion 1 = the original FIG.1+2 lineup (old records replay bit-identically)
    let run; try { run = newRun(seed, opts); } catch (e) { return { error: e.message }; }
    for (const a of inputs) {
      if (run.phase === 'figdone') next(run);
      if (run.over) return { error: 'input after run ended' };
      if (a[0] === 'F') { if (!fire(run, a[1], a[2])) return { error: 'illegal fire' }; settle(run); }
      else if (a[0] === 'E') { if (!conclude(run)) return { error: 'illegal conclude' }; }
      else return { error: 'bad action' };
    }
    if (run.phase === 'figdone') next(run);
    return { run, result: score(run), finished: run.over };
  }
  function stateHash(run) { let h = 2166136261 >>> 0; const mix = v => { const s = String(Math.round(v * 1e6)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    for (const b of run.bodies) { mix(b.x); mix(b.y); mix(b.disp ? 1 : 0); } mix(run.tick); return h >>> 0; }
  /** Pure ballistic preview (no collisions) for the aim guide. */
  /** Launcher x for the next shot (tanks with fire.advance roll forward each shell). */
  function muzzleX(run) { const F = run.lineup[run.fig]; return F.launcher.x + (F.fire.advance ? F.fire.advance * cur(run).shotsFired : 0); }
  function preview(figIdx, qx, qy, n, dt, figs) { [qx, qy] = clampQ(qx, qy); const F = (figs || FIGS)[figIdx]; let x = F.launcher.x, y = F.launcher.y, vx = qx * F.vk, vy = qy * F.vk; const pts = []; for (let i = 0; i < n; i++) { x += vx * dt; vy -= F.g * dt; y += vy * dt; pts.push([x, y]); if (y < 0) break; } return pts; }

  const api = { muzzleX, SIM_VERSION, HZ, DT, FIGS, WEAPONS: WP.WEAPONS, LINEUPS: WP.LINEUPS, lineup, PTS, DISPLACE_D, rng, hashSeed, layout, newRun, fire, conclude, next, step, settle, canFire, score, figScore, replay, stateHash, preview, clampQ, cur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SkrumpSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
