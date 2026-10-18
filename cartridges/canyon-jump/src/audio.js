/* Canyon Jump synth audio. Everything is generated with WebAudio: no sample files, no licenses. */
(function (root) {
  'use strict';
  const A = { ctx: null, muted: false, master: null, engine: null, wind: null, music: null, timer: 0, beat: 0 };
  function noiseBuffer(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  A.init = function () {
    if (A.ctx || typeof AudioContext === 'undefined') { A.ctx?.resume?.(); return; }
    const ctx = A.ctx = new AudioContext();
    A.master = ctx.createGain(); A.master.gain.value = A.muted ? 0 : 0.6;
    const comp = ctx.createDynamicsCompressor(); A.master.connect(comp); comp.connect(ctx.destination);
    A.noise = noiseBuffer(ctx);
    // Electric drivetrain: a motor whine (sine + 2nd harmonic) over a sub, plus a filtered saw growl. Pitch follows speed.
    const eg = ctx.createGain(); eg.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 4;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), o4 = ctx.createOscillator();
    o1.type = 'sine'; o2.type = 'triangle'; o3.type = 'sine'; o4.type = 'sawtooth';
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(), g4 = ctx.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.18; g3.gain.value = 0.6; g4.gain.value = 0.22;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); o4.connect(g4); [g1, g2, g3, g4].forEach(g => g.connect(lp));
    lp.connect(eg); eg.connect(A.master); [o1, o2, o3, o4].forEach(o => o.start());
    A.engine = { gain: eg, lp, o1, o2, o3, o4 };
    // Wind: looping noise through a bandpass that opens with altitude and speed.
    const ws = ctx.createBufferSource(); ws.buffer = A.noise; ws.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0; ws.connect(bp); bp.connect(wg); wg.connect(A.master); ws.start();
    A.wind = { gain: wg, bp };
    // Music: a road section and a sky section on separate buses that crossfade on launch.
    A.music = ctx.createGain(); A.music.gain.value = 0.17; A.music.connect(A.master);
    A.busRoad = ctx.createGain(); A.busSky = ctx.createGain(); A.busRoad.gain.value = 1; A.busSky.gain.value = 0;
    A.busRoad.connect(A.music); A.busSky.connect(A.music);
    A.timer = setInterval(scheduleMusic, 50);
    A.nextBeat = ctx.currentTime + 0.1;
  };
  // Sunset synthwave in A minor. Road: four-on-the-floor, octave bass, 16th arp. Sky: half-time pads and a high sparkle arp.
  const BASS = [45, 41, 43, 40], ARP = [0, 7, 12, 15, 12, 7, 3, 7], CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  function scheduleMusic() {
    const ctx = A.ctx; if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / 116 / 4; // 16th notes
    while (A.nextBeat < ctx.currentTime + 0.2) {
      const b = A.beat++, step = b % 16, bar = Math.floor(b / 16) % 4, root = BASS[bar], at = A.nextBeat;
      // road bus
      if (step % 4 === 0) kick(at, A.busRoad);
      if (step % 2 === 0) tone(mtof(root - 12 + (step % 4 === 2 ? 12 : 0)), 'sawtooth', at, spb * 1.8, 0.2, A.busRoad, 520);
      if (step % 4 === 2) hit(at, 0.04, 7000, 0.1, A.busRoad);
      if (step === 4 || step === 12) hit(at, 0.12, 1800, 0.16, A.busRoad, 900);
      tone(mtof(root + 24 + ARP[step % 8]), 'square', at, spb * 0.8, 0.05, A.busRoad, 2600);
      // sky bus
      if (step === 0) CHORDS[bar].forEach(n => tone(mtof(n), 'sawtooth', at, spb * 16, 0.05, A.busSky, 1400));
      if (step === 0 || step === 10) tone(mtof(root - 12), 'sine', at, spb * 6, 0.22, A.busSky);
      if (step % 2 === 0) tone(mtof(CHORDS[bar][(step / 2) % 3] + 24), 'triangle', at, spb * 2.5, 0.06, A.busSky, 6000);
      if (step === 8) hit(at, 0.3, 4000, 0.05, A.busSky, 9000);
      A.nextBeat += spb;
    }
  }
  function kick(at, dest) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g); g.connect(dest); o.start(at); o.stop(at + 0.25);
  }
  A.setPhase = function (phase) {
    const ctx = A.ctx; if (!ctx || A.phase === phase) return; A.phase = phase; const t = ctx.currentTime;
    const sky = phase === 'sky';
    A.busRoad.gain.setTargetAtTime(sky ? 0 : 1, t, 0.35); A.busSky.gain.setTargetAtTime(sky ? 1 : 0, t, 0.35);
  };
  function tone(freq, type, at, dur, vol, dest, cutoff, slideTo) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); node = f; }
    node.connect(g); g.connect(dest || A.master); o.start(at); o.stop(at + dur + 0.05);
  }
  function hit(at, dur, freq, vol, dest, sweepTo) {
    const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = A.noise; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, at); f.Q.value = 1.2;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(dest || A.master); s.start(at, Math.random()); s.stop(at + dur + 0.05);
  }
  A.sfx = function (name, arg) {
    const ctx = A.ctx; if (!ctx || A.muted) return; const t = ctx.currentTime;
    switch (name) {
      case 'orb': tone(1320 + (arg || 0) * 60, 'square', t, 0.09, 0.12, null, 4000); tone(1980, 'sine', t + 0.04, 0.12, 0.08); break;
      case 'air': tone(520, 'triangle', t, 0.25, 0.25, null, 0, 1560); hit(t, 0.2, 2500, 0.15, null, 6000); break;
      case 'pad': tone(220, 'sawtooth', t, 0.35, 0.22, null, 2400, 880); hit(t, 0.4, 900, 0.25, null, 5000); break;
      case 'lane': hit(t, 0.08, 1800, 0.06); break;
      case 'near': tone(1760, 'sine', t, 0.08, 0.07); break;
      case 'boost': { // punchy: transient click, sub drop, rising saw, long whoosh
        hit(t, 0.03, 5000, 0.5); const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
        g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.45);
        tone(140, 'sawtooth', t, 0.5, 0.22, null, 2200, 560); hit(t + 0.02, 0.8, 500, 0.5, null, 6000); break; }
      case 'mach': // sonic boom: the classic double "ba-boom" N-wave, a noise crack, and a bright rising sting
        [0, 0.13].forEach((d, i) => { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(110 - i * 20, t + d); o.frequency.exponentialRampToValueAtTime(28, t + d + 0.5);
          g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.95, t + d + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6); o.connect(g); g.connect(A.master); o.start(t + d); o.stop(t + d + 0.65);
          hit(t + d, 0.35, 1400, 0.6, null, 160); });
        [0, 7, 12, 19].forEach((n, i) => tone(mtof(64 + n), 'sawtooth', t + 0.3 + i * 0.06, 0.5, 0.08, null, 4000)); break;
      case 'whoosh': { // filtered noise sweep with a doppler-ish pitch drop
        const dur = arg ? 0.45 : 0.35; hit(t, dur, arg ? 2600 : 1600, arg ? 0.55 : 0.4, null, 300); tone(arg ? 520 : 380, 'sine', t, dur * 0.8, 0.06, null, 0, 180); break; }
      case 'flip': hit(t, 0.5, 700, 0.4, null, 4200); hit(t + 0.18, 0.35, 4200, 0.18, null, 900); break;
      case 'ring': { const n = (arg || 0) % 6; [0, 7, 12].forEach((k, i) => tone(mtof(74 + n + k), 'triangle', t + i * 0.035, 0.22, 0.12, null, 6000)); hit(t, 0.3, 3500, 0.3, null, 900); break; }
      case 'splash': hit(t, 1.2, 900, 0.9, null, 200); hit(t + 0.05, 0.6, 3000, 0.4, null, 600); tone(60, 'sine', t, 0.6, 0.5, null, 0, 30); break;
      case 'cash': [0, 4, 7, 12, 16, 19].slice(0, 3 + Math.min(3, arg || 0)).forEach((n, i) => tone(mtof(72 + n), 'square', t + 0.25 + i * 0.07, 0.2, 0.09, null, 5000)); tone(mtof(96), 'sine', t + 0.7, 0.6, 0.08); break;
      case 'beep': tone(arg ? 1250 : 900, 'square', t, 0.06, 0.08, null, 3000); break;
      case 'stab': { // cold-gas thrusters: a few sharp valve pops, then a high hiss (longer on the slow no-AIR burn)
        const dur = arg ? 0.9 : 0.42; [0, 0.05, 0.11].forEach((d, i) => hit(t + d, 0.05, 6500 - i * 900, 0.32));
        const ss = A.ctx.createBufferSource(), hp = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); ss.buffer = A.noise; hp.type = 'highpass'; hp.frequency.setValueAtTime(3200, t); hp.frequency.exponentialRampToValueAtTime(7000, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42, t + 0.03); g.gain.setValueAtTime(0.42, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        ss.connect(hp); hp.connect(g); g.connect(A.master); ss.start(t, Math.random()); ss.stop(t + dur + 0.05);
        tone(240, 'sine', t, 0.18, 0.12, null, 0, 120); break; }
      case 'empty': tone(160, 'square', t, 0.12, 0.12, null, 800); break;
      case 'trick': hit(t, 0.35, 3000, 0.12, null, 800); break;
      case 'landed_trick': [0, 4, 7, 12].forEach((n, i) => tone(mtof(76 + n + Math.min(arg || 0, 4) * 2), 'square', t + i * 0.05, 0.14, 0.09, null, 5000)); break;
      case 'launch': tone(90, 'sawtooth', t, 1.2, 0.35, null, 2000, 520); hit(t, 1.2, 300, 0.4, null, 3000); [0, 7, 12].forEach((n, i) => tone(mtof(69 + n), 'triangle', t + 0.15 + i * 0.08, 0.4, 0.12)); break;
      case 'short': tone(440, 'triangle', t, 1.6, 0.25, null, 0, 70); break;
      case 'crash': hit(t, 0.03, 4000, 0.8); hit(t, 0.9, 600, 0.9, null, 90); tone(70, 'square', t, 0.5, 0.4, null, 400, 30); tone(120, 'sine', t, 0.35, 0.6, null, 0, 35); break;
      case 'land': hit(t, 0.03, 3000, 0.6); tone(90, 'sine', t, 0.35, 0.7, null, 0, 32); hit(t, 0.4, 300, 0.6, null, 120); [0, 4, 7, 11, 14].forEach((n, i) => tone(mtof(72 + n), 'triangle', t + 0.2 + i * 0.07, 0.5, 0.13)); break;
      case 'go': tone(880, 'square', t, 0.25, 0.12, null, 3000); break;
      case 'tick': tone(440, 'square', t, 0.1, 0.1, null, 2000); break;
      case 'ui': tone(660, 'triangle', t, 0.08, 0.1); break;
    }
  };
  // Continuous layers, called each frame.
  // Continuous layers, called each frame.
  A.drive = function (phase, speed, momentum, active, alt, dive) {
    const ctx = A.ctx; if (!ctx) return; const t = ctx.currentTime;
    const road = active && phase === 'road', sky = active && (phase === 'sky' || phase === 'fall');
    A.setPhase(sky || (phase === 'sky') ? 'sky' : 'road');
    A.engine.gain.gain.setTargetAtTime(road ? 0.09 : sky ? 0.025 : 0, t, 0.08);
    const f = 55 + (sky ? momentum * 1.6 : speed * 3.2); // whine climbs with speed
    A.engine.o1.frequency.setTargetAtTime(f * 2, t, 0.05); A.engine.o2.frequency.setTargetAtTime(f * 4.02, t, 0.05);
    A.engine.o3.frequency.setTargetAtTime(f * 0.5, t, 0.05); A.engine.o4.frequency.setTargetAtTime(f, t, 0.05);
    A.engine.lp.frequency.setTargetAtTime(400 + speed * 22, t, 0.05);
    const a = Math.min(1, (alt || 0) / 150);
    // Wind roars with airspeed and screams in a dive.
    const d = Math.min(1, (dive || 0) * 2.5);
    A.wind.gain.gain.setTargetAtTime(sky ? 0.05 + a * 0.06 + Math.min(momentum, 180) / 900 + d * 0.12 : road ? speed / 2400 : 0, t, 0.12);
    A.wind.bp.frequency.setTargetAtTime(sky ? 420 + a * 900 + momentum * 7 + d * 900 : 400 + speed * 10, t, 0.15);
  };
  A.setMuted = function (m) { A.muted = !!m; if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.6, A.ctx.currentTime, 0.02); };
  A.suspend = function () { A.ctx?.suspend?.(); };
  A.resume = function () { A.ctx?.resume?.(); };
  A.destroy = function () { clearInterval(A.timer); A.ctx?.close?.(); A.ctx = null; };
  root.CJAudio = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
