// Dry Web Audio bed. Beat, phase, clear, streak, and crash.
// The host mute and the M key both gate the master gain. Nothing plays
// before the first gesture, and nothing here touches the simulation.
(function (root) {
  const SFX = {
    ctx: null,
    master: null,
    noise: null,
    hostMuted: false,
    userMuted: false,
    nextBeat: 0,
  };

  function audible() {
    return SFX.ctx && !SFX.hostMuted && !SFX.userMuted;
  }

  function noiseBuffer(ctx) {
    const length = 12000;
    const buffer = ctx.createBuffer(1, length, 22050);
    const data = buffer.getChannelData(0);
    let a = 0x6d2b79f5;
    for (let i = 0; i < length; i++) {
      a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
      data[i] = (a / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  function unlock() {
    if (SFX.ctx) {
      if (SFX.ctx.state === 'suspended') SFX.ctx.resume().catch(function () {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = (SFX.hostMuted || SFX.userMuted) ? 0 : 0.8;
      master.connect(ctx.destination);
      SFX.ctx = ctx;
      SFX.master = master;
      SFX.noise = noiseBuffer(ctx);
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    } catch (err) {
      SFX.ctx = null;
    }
  }

  function applyGain() {
    if (!SFX.master || !SFX.ctx) return;
    SFX.master.gain.value = (SFX.hostMuted || SFX.userMuted) ? 0 : 0.8;
  }

  function env(gain, peak, seconds) {
    const now = SFX.ctx.currentTime;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + seconds);
  }

  function tone(freq, seconds, type, peak) {
    if (!audible()) return;
    const osc = SFX.ctx.createOscillator();
    const gain = SFX.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env(gain, peak, seconds);
    osc.connect(gain);
    gain.connect(SFX.master);
    osc.start();
    osc.stop(SFX.ctx.currentTime + seconds + 0.02);
  }

  function burst(seconds, peak, freq) {
    if (!audible() || !SFX.noise) return;
    const src = SFX.ctx.createBufferSource();
    src.buffer = SFX.noise;
    const filter = SFX.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const gain = SFX.ctx.createGain();
    env(gain, peak, seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(SFX.master);
    src.start();
    src.stop(SFX.ctx.currentTime + seconds + 0.02);
  }

  function wood() {
    tone(196, 0.045, 'square', 0.045);
    burst(0.03, 0.05, 420);
  }

  SFX.unlock = unlock;
  SFX.isMuted = function () { return !!(SFX.hostMuted || SFX.userMuted); };
  SFX.setHostMuted = function (muted) {
    SFX.hostMuted = !!muted;
    applyGain();
  };
  SFX.toggleMute = function () {
    SFX.userMuted = !SFX.userMuted;
    applyGain();
    return SFX.userMuted;
  };
  SFX.suspend = function () {
    if (SFX.ctx && SFX.ctx.state === 'running') SFX.ctx.suspend().catch(function () {});
  };
  SFX.resume = function () {
    if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume().catch(function () {});
  };
  SFX.close = function () {
    if (SFX.ctx) SFX.ctx.close().catch(function () {});
    SFX.ctx = null;
  };
  SFX.resetBeats = function () { SFX.nextBeat = 0; };
  SFX.onTick = function (tick, beat) {
    if (tick < SFX.nextBeat) return;
    if (audible()) wood();
    SFX.nextBeat = tick + Math.max(1, beat | 0);
  };
  SFX.phase = function () { burst(0.05, 0.09, 1400); tone(310, 0.04, 'square', 0.03); };
  SFX.clear = function () { tone(523, 0.06, 'sine', 0.05); tone(784, 0.07, 'sine', 0.03); };
  SFX.streak = function () { tone(659, 0.07, 'square', 0.04); tone(880, 0.09, 'sine', 0.035); };
  SFX.crash = function () { tone(82, 0.16, 'square', 0.07); burst(0.14, 0.1, 180); };

  root.PHANTOM_AUDIO = SFX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
