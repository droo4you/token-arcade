/* Quiet bed: wind, a low slide rumble when the avalanche is close, and short landing hits.
   Nothing here is scored. The context starts on the first gesture. */
(function (root) {
  'use strict';
  function create() {
    let ctx, master, windGain, rumbleGain;
    function context() {
      if (ctx) return ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      const frames = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let n = 0;
      for (let i = 0; i < frames; i++) {
        n = (n + 0x6D2B79F5) >>> 0;
        data[i] = ((((n ^ (n >>> 15)) * (1 | n)) >>> 0) / 4294967296) * 2 - 1;
      }
      const wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 480;
      band.Q.value = 0.55;
      windGain = ctx.createGain();
      windGain.gain.value = 0.035;
      wind.connect(band);
      band.connect(windGain);
      windGain.connect(master);
      wind.start();
      const rumble = ctx.createBufferSource();
      rumble.buffer = buffer;
      rumble.loop = true;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 120;
      rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0;
      rumble.connect(low);
      low.connect(rumbleGain);
      rumbleGain.connect(master);
      rumble.start();
      return ctx;
    }
    function burst(freq, dur, gain, type) {
      const c = context();
      if (!c) return;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), c.currentTime + dur);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(c.currentTime + dur + 0.02);
    }
    return {
      resume() {
        const c = context();
        if (c && c.state === 'suspended') c.resume();
      },
      suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
      close() {
        if (ctx) ctx.close();
        ctx = null;
      },
      feel(state) {
        if (!windGain) return;
        const carve = Math.min(1, Math.abs(state.vx) / 12);
        windGain.gain.value = 0.03 + Math.min(0.07, state.vz / 420) + carve * 0.03;
        const near = Math.max(0, Math.min(1, (15 - state.gap) / 15));
        rumbleGain.gain.value = near * near * 0.2;
      },
      land(kind) {
        if (kind === 'clean') burst(180, 0.16, 0.18, 'triangle');
        else if (kind === 'bail' || kind === 'crash') burst(90, 0.22, 0.16, 'sine');
        else burst(140, 0.08, 0.06, 'triangle');
      },
      trick() { burst(520, 0.12, 0.05, 'sine'); },
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
