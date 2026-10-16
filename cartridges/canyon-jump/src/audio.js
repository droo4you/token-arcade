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
    // Engine: two detuned saws through a lowpass whose cutoff follows speed.
    const eg = ctx.createGain(); eg.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 6;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200 + 8;
    o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(A.master); o1.start(); o2.start();
    A.engine = { gain: eg, lp, o1, o2 };
    // Wind: looping noise through a bandpass.
    const ws = ctx.createBufferSource(); ws.buffer = A.noise; ws.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0; ws.connect(bp); bp.connect(wg); wg.connect(A.master); ws.start();
    A.wind = { gain: wg, bp };
    A.music = ctx.createGain(); A.music.gain.value = 0.16; A.music.connect(A.master);
    A.timer = setInterval(scheduleMusic, 60);
    A.nextBeat = ctx.currentTime + 0.1;
  };
  // A small sunset synthwave loop: bass on the beat, a pentatonic arp in eighths.
  const BASS = [45, 45, 43, 41], ARP = [0, 7, 12, 15, 12, 7, 3, 7];
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  function scheduleMusic() {
    const ctx = A.ctx; if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / 112 / 2;
    while (A.nextBeat < ctx.currentTime + 0.25) {
      const b = A.beat++, bar = Math.floor(b / 16) % 4, root = BASS[bar];
      if (b % 2 === 0) tone(mtof(root - 12 + (b % 8 === 4 ? 12 : 0)), 'sawtooth', A.nextBeat, spb * 1.6, 0.22, A.music, 500);
      tone(mtof(root + 24 + ARP[b % 8]), 'triangle', A.nextBeat, spb * 0.9, 0.12, A.music, 3000);
      if (b % 4 === 2) hit(A.nextBeat, 0.05, 6000, 0.12, A.music);
      A.nextBeat += spb;
    }
  }
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
      case 'boost': hit(t, 0.6, 400, 0.45, null, 4000); tone(110, 'sawtooth', t, 0.6, 0.25, null, 1200, 330); break;
      case 'empty': tone(160, 'square', t, 0.12, 0.12, null, 800); break;
      case 'trick': hit(t, 0.35, 3000, 0.12, null, 800); break;
      case 'landed_trick': [0, 4, 7, 12].forEach((n, i) => tone(mtof(76 + n + Math.min(arg || 0, 4) * 2), 'square', t + i * 0.05, 0.14, 0.09, null, 5000)); break;
      case 'launch': tone(90, 'sawtooth', t, 1.2, 0.35, null, 2000, 520); hit(t, 1.2, 300, 0.4, null, 3000); [0, 7, 12].forEach((n, i) => tone(mtof(69 + n), 'triangle', t + 0.15 + i * 0.08, 0.4, 0.12)); break;
      case 'short': tone(440, 'triangle', t, 1.6, 0.25, null, 0, 70); break;
      case 'crash': hit(t, 0.9, 600, 0.9, null, 90); tone(70, 'square', t, 0.5, 0.4, null, 400, 30); break;
      case 'land': hit(t, 0.4, 300, 0.6, null, 120); [0, 4, 7, 11, 14].forEach((n, i) => tone(mtof(72 + n), 'triangle', t + 0.2 + i * 0.07, 0.5, 0.13)); break;
      case 'go': tone(880, 'square', t, 0.25, 0.12, null, 3000); break;
      case 'tick': tone(440, 'square', t, 0.1, 0.1, null, 2000); break;
      case 'ui': tone(660, 'triangle', t, 0.08, 0.1); break;
    }
  };
  // Continuous layers, called each frame.
  A.drive = function (phase, speed, momentum, active) {
    const ctx = A.ctx; if (!ctx) return; const t = ctx.currentTime;
    const road = active && phase === 'road', sky = active && (phase === 'sky' || phase === 'fall');
    A.engine.gain.gain.setTargetAtTime(road ? 0.07 : sky ? 0.02 : 0, t, 0.08);
    const f = 40 + speed * 1.6;
    A.engine.o1.frequency.setTargetAtTime(f, t, 0.05); A.engine.o2.frequency.setTargetAtTime(f * 1.002, t, 0.05);
    A.engine.lp.frequency.setTargetAtTime(300 + speed * 18, t, 0.05);
    A.wind.gain.gain.setTargetAtTime(sky ? 0.05 + Math.min(momentum, 120) / 900 : road ? speed / 2200 : 0, t, 0.2);
    A.wind.bp.frequency.setTargetAtTime(400 + (sky ? momentum : speed) * 12, t, 0.2);
  };
  A.setMuted = function (m) { A.muted = !!m; if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.6, A.ctx.currentTime, 0.02); };
  A.suspend = function () { A.ctx?.suspend?.(); };
  A.resume = function () { A.ctx?.resume?.(); };
  A.destroy = function () { clearInterval(A.timer); A.ctx?.close?.(); A.ctx = null; };
  root.CJAudio = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
