/* WebAudio synth SFX + deadpan narrator (SpeechSynthesis). No audio files. */
(function () {
  'use strict';
  let ctx = null, master = null, muted = false, drone = null, voice = null, lastImpact = 0;
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  function pickVoice() {
    if (!synth) return; const vs = synth.getVoices(); if (!vs.length) return;
    const pref = ['Daniel', 'Fred', 'Google UK English Male', 'Microsoft David', 'Alex', 'Aaron', 'Arthur'];
    voice = pref.map(n => vs.find(v => v.name.includes(n))).find(Boolean) || vs.find(v => /^en/i.test(v.lang)) || vs[0];
  }
  if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { /* old Safari */ } }
  function init() {
    if (ctx || muted) { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    // lab hum
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; const g = ctx.createGain(); g.gain.value = 0.05; f.connect(g); g.connect(master);
    drone = [55, 55.4, 82.5].map(hz => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(); return o; });
  }
  function noise(dur) { const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate), d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * (1 - i / d.length); } const n = ctx.createBufferSource(); n.buffer = b; return n; }
  function env(node, t, a, peak, dec) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); node.connect(g); g.connect(master); return g; }
  function tone(type, f0, f1, dur, vol) { const t = ctx.currentTime, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); env(o, t, 0.005, vol, dur); o.start(t); o.stop(t + dur + 0.05); }
  function sfx(name, power) {
    if (!ctx || muted) return; const t = ctx.currentTime;
    if (name === 'launch') { tone('sine', 160, 38, 0.35, 0.7); const n = noise(0.25), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; n.connect(f); env(f, t, 0.004, 0.5, 0.22); n.start(t); }
    else if (name === 'cannon') { tone('square', 90, 30, 0.4, 0.5); const n = noise(0.5), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; n.connect(f); env(f, t, 0.002, 0.9, 0.45); n.start(t); }
    else if (name === 'impact') { if (t - lastImpact < 0.045) return; lastImpact = t; const v = Math.min(0.6, 0.08 + (power || 4) * 0.025); const n = noise(0.12), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 500; n.connect(f); env(f, t, 0.002, v, 0.1); n.start(t); tone('sine', 220 + Math.random() * 120, 90, 0.09, v * 0.4); }
    else if (name === 'alarm') { [0, 0.22, 0.44].forEach(d => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 660; const g = env(o, t + d, 0.005, 0.18, 0.15); o.start(t + d); o.stop(t + d + 0.2); }); }
    else if (name === 'stamp') { tone('triangle', 120, 60, 0.18, 0.6); }
    else if (name === 'blip') { tone('sine', 1320, 1320, 0.06, 0.15); }
    else if (name === 'card') { tone('triangle', 520, 780, 0.08, 0.2); }
  }
  function say(text) {
    if (!synth || muted) return;
    try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.pitch = 0.15; u.rate = 0.88; u.volume = 0.9; synth.speak(u); } catch (e) { /* speech unavailable */ }
  }
  function setMuted(m) { muted = !!m; if (muted) { if (synth) synth.cancel(); if (ctx) ctx.suspend(); } else { if (ctx) ctx.resume(); } }
  function suspend() { if (ctx) ctx.suspend(); if (synth) synth.cancel(); }
  function resume() { if (ctx && !muted) ctx.resume(); }
  function destroy() { if (synth) synth.cancel(); if (ctx) ctx.close(); ctx = null; }
  window.SLAudio = { init, sfx, say, setMuted, suspend, resume, destroy, get muted() { return muted; } };
})();
