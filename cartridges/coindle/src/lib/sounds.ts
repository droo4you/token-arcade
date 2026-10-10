/**
 * Minimal sound effects using Web Audio API — no audio files needed.
 * Each sound is a short synthesized tone.
 */

let ctx: AudioContext | null = null;
let arcadeMuted = false;
let arcadeAudioPaused = false;
let audioGeneration = 0;

export function setArcadeMuted(value: boolean): void { arcadeMuted = value; }
export function setArcadeAudioPaused(value: boolean): void {
  arcadeAudioPaused = value;
  if (ctx) void (value ? ctx.suspend() : ctx.resume()).catch(() => {});
}
export function destroyArcadeAudio(): void {
  audioGeneration++;
  if (ctx) void ctx.close().catch(() => {});
  ctx = null;
  arcadeAudioPaused = false;
}
export function scheduleGameSound(action: () => void, delay: number): void {
  const generation = audioGeneration;
  setTimeout(() => { if (generation === audioGeneration) action(); }, delay);
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  if (arcadeMuted || arcadeAudioPaused) return;
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  } catch {
    // Audio not supported — silent fail
  }
}

/** Card flip — subtle click */
export function playFlip() {
  playTone(800, 0.06, "square", 0.08);
}

/** Green match — pleasant ding */
export function playGreen() {
  playTone(880, 0.15, "sine", 0.12);
}

/** Win — ascending chord */
export function playWin() {
  playTone(523, 0.3, "sine", 0.12);
  scheduleGameSound(() => playTone(659, 0.3, "sine", 0.12), 100);
  scheduleGameSound(() => playTone(784, 0.3, "sine", 0.12), 200);
  scheduleGameSound(() => playTone(1047, 0.5, "sine", 0.15), 300);
}

/** Loss — descending tone */
export function playLoss() {
  playTone(400, 0.3, "triangle", 0.1);
  scheduleGameSound(() => playTone(300, 0.4, "triangle", 0.1), 150);
}

/** Hint used — soft blip */
export function playHint() {
  playTone(600, 0.1, "sine", 0.1);
  scheduleGameSound(() => playTone(900, 0.1, "sine", 0.1), 80);
}
