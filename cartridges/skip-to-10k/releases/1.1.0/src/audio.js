// Synthesized chiptune SFX and one breezy looping tune. No audio files.
const Audio8 = {
  ctx: null, master: null, musicGain: null, muted: false, musicOn: true, step: 0, nextT: 0, timer: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? 0.2 : 0;
    this.musicGain.connect(this.master);
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  },
  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.05);
  },
  tone(type, f0, f1, dur, vol = 0.3, when = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, hp = 800, when = 0, lp = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = buf; f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  },
  sfx(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    const T = this.tone.bind(this);
    switch (name) {
      case 'throw': this.noise(0.12, 0.14, 1200); T('square', 300, 700, 0.12, 0.12); break;
      case 'skip': { const f = 520 + Math.min(12, arg) * 45; T('sine', f, f * 1.5, 0.07, 0.22); this.noise(0.05, 0.08, 2500); break; }
      case 'perfect': { const f = 700 + Math.min(14, arg) * 60; T('square', f, f, 0.05, 0.12); T('square', f * 1.5, f * 1.5, 0.08, 0.12, 0.05); break; }
      case 'splash': this.noise(0.25, 0.22, 0, 0, 1400); T('sine', 300, 120, 0.2, 0.15); break;
      case 'sink': [392, 370, 349, 311].forEach((f, i) => T('triangle', f, f * 0.97, 0.22, 0.18, i * 0.2)); this.noise(0.5, 0.15, 0, 0.1, 700); break;
      case 'fart': this.noise(0.3, 0.25, 0, 0, 380); T('sawtooth', 90, 60, 0.3, 0.12); break;
      case 'pump': T('square', 200, 1200, 0.3, 0.14); T('triangle', 400, 1600, 0.3, 0.12, 0.05); break;
      case 'whale': T('sine', 160, 90, 0.5, 0.25); this.noise(0.4, 0.1, 1500, 0.1); T('square', 600, 1200, 0.2, 0.08, 0.15); break;
      case 'dump': T('square', 600, 80, 0.4, 0.16); this.noise(0.2, 0.15, 0, 0, 600); break;
      case 'gem': T('square', 1320 + Math.random() * 80, 1320, 0.05, 0.08); T('square', 1980, 1980, 0.06, 0.07, 0.04); break;
      case 'bounce': T('sine', 180, 720, 0.18, 0.28); T('square', 360, 900, 0.08, 0.07, 0.05); break;
      case 'ball': [660, 880, 990].forEach((f, i) => T('triangle', f, f, 0.06, 0.13, i * 0.05)); break;
      case 'rc': T('sine', 400, 1100, 0.25, 0.22); T('sine', 600, 1400, 0.2, 0.1, 0.08); break;
      case 'bonk': T('square', 180, 110, 0.12, 0.18); this.noise(0.06, 0.12, 400); break;
      case 'kevin': [523, 659, 784, 659, 1047].forEach((f, i) => T('square', f, f, 0.07, 0.11, i * 0.06)); break;
      case 'suit': [880, 1109, 1319].forEach((f, i) => T('triangle', f, f, 0.1, 0.12, i * 0.04)); this.noise(0.08, 0.08, 4000, 0.12); break;
      case 'yacht': T('sine', 330, 660, 0.12, 0.2); T('square', 990, 990, 0.08, 0.08, 0.1); break;
      case 'skrump': T('triangle', 500, 900, 0.08, 0.16); T('triangle', 700, 1200, 0.08, 0.14, 0.07); break;
      case 'fork': T('square', 440, 440, 0.06, 0.12); T('square', 466, 466, 0.06, 0.12, 0.06); T('square', 880, 1760, 0.2, 0.1, 0.12); break;
      case 'bat': T('sine', 3000, 1800, 0.15, 0.08); T('sine', 3400, 2000, 0.15, 0.06, 0.08); break;
      case 'ice': this.noise(0.4, 0.06, 5000); break;
      case 'rejected': [466, 440, 415, 392].forEach((f, i) => T('sawtooth', f, i === 3 ? f * 0.9 : f, i === 3 ? 0.5 : 0.18, 0.1, i * 0.2)); break;
      case 'breakout': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => T('square', f, f, 0.14, 0.13, i * 0.07)); this.noise(0.4, 0.1, 3000, 0.4); break;
      case 'era': [784, 988, 1175].forEach((f, i) => T('triangle', f, f, 0.18, 0.12, i * 0.09)); break;
      case 'today': [523, 784, 1047, 784, 1047, 1568].forEach((f, i) => T('square', f, f, 0.12, 0.12, i * 0.1)); break;
      case 'charge': T('triangle', 200 + arg * 600, 200 + arg * 600, 0.03, 0.05); break;
      case 'menu': T('triangle', 600, 600, 0.04, 0.12); break;
      case 'buy': [660, 990, 1320].forEach((f, i) => T('square', f, f, 0.06, 0.12, i * 0.05)); break;
      case 'step': this.noise(0.03, 0.08, 0, 0, 900 + Math.random() * 300); T('square', 140 + arg * 300, 120 + arg * 300, 0.03, 0.06); break;
      case 'windup': T('triangle', 300 + arg * 8, 300 + arg * 8, 0.03, 0.05); break;
      case 'line': [988, 1319].forEach((f, i) => T('square', f, f, 0.07, 0.12, i * 0.06)); break;
      case 'fall': T('square', 700, 150, 0.45, 0.14); this.noise(0.5, 0.2, 0, 0.4, 900); break;
      case 'news': [1200, 0, 1200, 1200].forEach((f, i) => f && T('square', f, f, 0.03, 0.06, i * 0.05)); break;
      case 'mission': [784, 988, 1175, 1568].forEach((f, i) => T('square', f, f, 0.1, 0.12, i * 0.08)); break;
      case 'airdrop': T('triangle', 900, 1400, 0.15, 0.14); T('triangle', 1200, 1800, 0.12, 0.1, 0.1); break;
      case 'scam': T('sawtooth', 300, 150, 0.3, 0.1); break;
      case 'nope': T('square', 150, 150, 0.06, 0.1); T('square', 120, 120, 0.08, 0.1, 0.07); break;
    }
  },
  // ---------- music: "Sideways" ----------
  // A lazy lakeside loop. The melody keeps reaching for the high note and settling back down.
  spb: 60 / 104 / 2, len: 32,
  lead: [74, 0, 78, 81, 0, 78, 76, 0, 74, 0, 76, 78, 0, 81, 83, 0, 81, 0, 78, 76, 0, 74, 76, 0, 78, 0, 76, 0, 74, 0, 0, 0],
  bass: [50, 50, 57, 50, 47, 47, 54, 47, 43, 43, 50, 43, 45, 45, 52, 49],
  schedule() {
    if (!this.ctx) return;
    const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
    while (this.nextT < this.ctx.currentTime + 0.25) {
      const at = this.nextT - this.ctx.currentTime, s = this.step % this.len;
      const n = this.lead[s];
      if (n && this.musicOn) {
        this.tone('triangle', mtof(n), mtof(n), this.spb * 1.4, 0.16, at, this.musicGain);
        this.tone('square', mtof(n + 12), mtof(n + 12), this.spb * 0.4, 0.025, at, this.musicGain);
      }
      if (s % 2 === 0 && this.musicOn) { const b = this.bass[(s / 2) % 16]; this.tone('triangle', mtof(b), mtof(b), this.spb * 1.8, 0.3, at, this.musicGain); }
      if (s % 4 === 2 && this.musicOn) this.noise(0.04, 0.03, 6000, at);
      this.step++;
      this.nextT += this.spb * (s % 2 === 0 ? 1.15 : 0.85); // a little swing
    }
  },
};
