// Phantom Phase shell. Fixed-step sim, quantized input, host lifecycle.
// performance.now is only the frame clock and the touch timer.
(function () {
  const STEP = 1 / 60;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const SIM = window.PHANTOM;
  const INPUT = window.PHANTOM_INPUT;
  const SFX = window.PHANTOM_AUDIO;
  const DRAW = window.PHANTOM_DRAW;

  let mode = 'title';
  let sim = null;
  let events = [];
  let pending = 0;
  let reported = false;
  let best = 0;
  let mounted = null;
  let acc = 0;
  let last = performance.now();
  let titleTime = 0;
  let crashFrames = 0;
  let hidden = false;
  let destroyed = false;
  let rafId = 0;
  let ptr = null;
  let touchPtr = null;
  let gp = INPUT.freshPad();
  let lastCmd = 0;
  let lastAt = 0;
  let cssW = 1;
  let cssH = 1;
  const coarse = matchMedia('(pointer: coarse)').matches;

  function saveKey() {
    const id = window.TokenArcade && window.TokenArcade.config && window.TokenArcade.config.gameId;
    return id ? 'ta.' + id + '.phantom-phase' : 'phantom-phase';
  }

  function loadBest() {
    try {
      const n = Number(localStorage.getItem(saveKey() + '.best'));
      return Number.isSafeInteger(n) && n > 0 ? n : 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest() {
    try { localStorage.setItem(saveKey() + '.best', String(best)); } catch (err) { /* private mode */ }
  }

  function pickSeed() {
    const embedded = window.TokenArcade && window.TokenArcade.embedded;
    const config = embedded ? window.TokenArcade.config : mounted;
    if (config && config.mode && config.mode !== 'free') return SIM.issuedSeed(String(config.seed));
    if (config && config.seed != null && config.seed !== '') return SIM.issuedSeed(String(config.seed));
    try {
      const key = saveKey() + '.n';
      let n = Number(localStorage.getItem(key) || '1');
      if (!Number.isInteger(n) || n < 1) n = 1;
      localStorage.setItem(key, String(n >= 0x7ffffffe ? 1 : n + 1));
      return (Math.imul(n, 0x9E3779B1) >>> 0) || 1;
    } catch (err) {
      return 1;
    }
  }

  function bootRun() {
    sim = SIM.create(pickSeed());
    events = [];
    reported = false;
    crashFrames = 0;
    acc = 0;
    mode = 'run';
    DRAW.reset();
    SFX.resetBeats();
  }

  function armRun() {
    if (window.TokenArcade && window.TokenArcade.embedded) {
      if (!window.TokenArcade.active || !window.TokenArcade.beginRun()) {
        pending = 0;
        return false;
      }
    }
    bootRun();
    return true;
  }

  function canChain() {
    if (!(window.TokenArcade && window.TokenArcade.embedded)) return true;
    const name = window.TokenArcade.config && window.TokenArcade.config.mode;
    return !name || name === 'free';
  }

  function snapshotProof() {
    return {
      format: SIM.PROOF_FORMAT,
      tickHz: SIM.TICK_HZ,
      simVersion: SIM.SIM_VERSION,
      rulesVersion: SIM.RULES_VERSION,
      seed: sim.seed,
      events: events.slice(),
      endTick: sim.tick,
      score: sim.score,
      hash: SIM.hashState(sim),
    };
  }

  function finishRun() {
    mode = 'crash';
    crashFrames = 0;
    if (sim.score > best) {
      best = sim.score;
      saveBest();
    }
    if (reported) return;
    reported = true;
    if (window.TokenArcade && window.TokenArcade.embedded) {
      const proof = snapshotProof();
      window.TokenArcade.complete({
        result: 'completed',
        primaryMetric: sim.score,
        secondaryMetrics: {
          distance: Math.floor(sim.distance / 1000),
          clears: sim.clears,
          streak: sim.streak,
          multiplier: sim.multiplier,
          ticks: sim.tick,
          elapsedMs: Math.floor(sim.tick * 1000 / 60),
        },
        proof: proof,
      });
    }
  }

  function stepOnce() {
    const cmd = pending;
    pending = 0;
    if (cmd) events.push([sim.tick, cmd]);
    const before = { slot: sim.slot, clears: sim.clears, mult: sim.multiplier, alive: sim.alive };
    SIM.step(sim, cmd || 0);
    SFX.onTick(sim.tick, SIM.beatAt(Math.max(0, sim.tick - 1)));
    if (sim.slot !== before.slot) SFX.phase();
    if (sim.clears > before.clears) SFX.clear();
    if (sim.multiplier > before.mult) SFX.streak();
    if (before.alive && !sim.alive) {
      SFX.crash();
      finishRun();
    }
  }

  function emit(cmd) {
    if (!cmd || destroyed) return;
    const now = performance.now();
    if (cmd === lastCmd && now - lastAt < 45) return;
    lastCmd = cmd;
    lastAt = now;
    SFX.unlock();
    if (hidden) return;
    if (window.TokenArcade && window.TokenArcade.paused) return;
    pending = cmd;
    if (mode === 'title') armRun();
  }

  function onKey(e) {
    if (e.repeat || destroyed) return;
    if (e.code === 'KeyM') {
      SFX.unlock();
      SFX.toggleMute();
      e.preventDefault();
      return;
    }
    const cmd = INPUT.commandFromKey(e.code);
    if (!cmd) return;
    e.preventDefault();
    emit(cmd);
  }

  function onPointerDown(e) {
    canvas.focus();
    ptr = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  }

  function onPointerUp(e) {
    if (!ptr || ptr.id !== e.pointerId) return;
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - ptr.t;
    ptr = null;
    emit(INPUT.commandFromSwipe(dx, dy, dist, elapsed));
  }

  function onTouchStart(e) {
    if (!e.changedTouches || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    touchPtr = { x: t.clientX, y: t.clientY, t: performance.now(), id: t.identifier };
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (!touchPtr || !e.changedTouches || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchPtr.x;
    const dy = t.clientY - touchPtr.y;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - touchPtr.t;
    touchPtr = null;
    emit(INPUT.commandFromSwipe(dx, dy, dist, elapsed));
    e.preventDefault();
  }

  function pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!pads) return;
    for (let i = 0; i < pads.length; i++) {
      if (!pads[i]) continue;
      const polled = INPUT.pollGamepad(gp, pads[i]);
      gp = polled.state;
      if (polled.command) emit(polled.command);
    }
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function viewModel() {
    const running = sim && (mode === 'run' || mode === 'crash');
    return {
      mode: mode,
      slot: running ? sim.slot : 0,
      score: running ? sim.score : 0,
      streak: running ? sim.streak : 0,
      multiplier: running ? sim.multiplier : 1,
      best: best,
      tick: running ? sim.tick : 0,
      speed: running ? SIM.speedAt(Math.max(0, sim.tick - 1)) : 170,
      gates: running ? sim.gates : [],
      crashAge: mode === 'crash' ? crashFrames : 0,
      muted: SFX.isMuted(),
      scroll: running ? sim.distance / 900 : titleTime * 0.42,
      coarse: coarse,
    };
  }

  function syncDom() {
    const running = sim && (mode === 'run' || mode === 'crash');
    const rootEl = document.documentElement;
    rootEl.dataset.mode = mode;
    rootEl.dataset.slot = String(running ? sim.slot : 0);
    rootEl.dataset.score = String(running ? sim.score : 0);
    rootEl.dataset.tick = String(running ? sim.tick : 0);
  }

  function paint() {
    resize();
    DRAW.frame(ctx, cssW, cssH, viewModel());
    syncDom();
  }

  function loop(now) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const paused = hidden || !!(window.TokenArcade && window.TokenArcade.paused);
    if (!paused && mode === 'run' && sim) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 3) {
        acc -= STEP;
        stepOnce();
        steps += 1;
        if (mode !== 'run') break;
      }
      if (acc > STEP) acc = 0;
    } else if (!paused && mode === 'crash') {
      crashFrames += 1;
      if (crashFrames > 14 && canChain()) armRun();
    }
    if (mode === 'title') titleTime += 1;
    if (!paused) pollPads();
    paint();
    rafId = requestAnimationFrame(loop);
  }

  best = loadBest();
  canvas.tabIndex = 0;
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', function () { ptr = null; });
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('visibilitychange', function () {
    if (window.TokenArcade && window.TokenArcade.embedded) return;
    hidden = document.hidden;
    if (!hidden) {
      last = performance.now();
      acc = 0;
    }
  });
  window.addEventListener('resize', resize);
  canvas.focus();

  window.PHANTOM_VIEW = {
    mode: function () { return mode; },
    slot: function () { return sim ? sim.slot : 0; },
    score: function () { return sim ? sim.score : 0; },
    tick: function () { return sim ? sim.tick : 0; },
    proof: function () { return sim ? snapshotProof() : null; },
  };

  paint();
  rafId = requestAnimationFrame(loop);

  if (!window.TokenArcade) return;
  window.TokenArcade.register({
    version: '1.0.0',
    capabilities: { pause: true, mute: true, touch: true, keyboard: true, gamepad: true, orientation: 'any' },
    mount: function (config) {
      if (config.mode !== 'free' && !config.seed) throw new Error('Passport Play needs a server-issued seed.');
      mounted = config;
      best = loadBest();
      if (config.audio && typeof config.audio.muted === 'boolean') SFX.setHostMuted(config.audio.muted);
    },
    start: function () {
      mode = 'title';
      sim = null;
      pending = 0;
      canvas.focus();
    },
    pause: function () {
      pending = 0;
      ptr = null;
      touchPtr = null;
      gp = INPUT.freshPad();
      SFX.suspend();
    },
    resume: function () {
      last = performance.now();
      acc = 0;
      SFX.resume();
    },
    restart: function () {
      mode = 'title';
      sim = null;
      pending = 0;
      reported = false;
      acc = 0;
      last = performance.now();
      DRAW.reset();
      SFX.resetBeats();
    },
    audio: function (muted) { SFX.setHostMuted(!!muted); },
    destroy: function () {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      SFX.close();
    },
  });
})();
