/* Powderline shell: input, HUD, fixed-step loop, and the Token Arcade bridge.
   Free Play ignores host and URL seeds. Ranked and raid use only the issued seed.
   ?preview=1&seed=&shot=trick|slide is a local camera tool. It is ignored when embedded. */
import { createView } from './render3d.js';

const SIM = globalThis.PLSim;
const TA = globalThis.TokenArcade;
const DT = SIM.C.DT;
const ALPHA = SIM.ALPHA;
const TRICK = { up: 1, tap: 1, down: 2, left: 3, right: 4 };
const KEY_TRICK = {
  ArrowUp: 1, KeyW: 1, KeyI: 1,
  ArrowDown: 2, KeyS: 2, KeyK: 2,
  KeyJ: 3, KeyQ: 3,
  KeyL: 4, KeyE: 4,
};

const app = document.querySelector('#app');
const canvas = document.querySelector('#gl');
const gate = document.querySelector('#gate');
const endScreen = document.querySelector('#end');
const drop = document.querySelector('#drop');
const again = document.querySelector('#again');
const boostBtn = document.querySelector('#boost');
const distEl = document.querySelector('#dist');
const scoreEl = document.querySelector('#score');
const slideEl = document.querySelector('#slide');
const callEl = document.querySelector('#call');
const comboEl = document.querySelector('#combo');
const fillEl = document.querySelector('#fill');
const endCopy = document.querySelector('#end-copy');
const previewEl = document.querySelector('#preview');
const veil = document.querySelector('#veil');
const hudEl = document.querySelector('#hud');

const params = new URLSearchParams(location.search);
const embedded = !!(TA && TA.embedded);
const preview = !embedded && params.get('preview') === '1';
const shot = preview ? params.get('shot') : null;
const low = params.get('q') === '0' || (params.get('q') !== '1' && (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 820));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const gestures = globalThis.PLInput.create();
const audio = globalThis.PLAudio.create();
const keys = new Set();
let view;
let config = null;
let state = null;
let phase = 'boot';
let paused = false;
let destroyed = false;
let heldBoost = false;
let queuedTrick = 0;
let log = '';
let acc = 0;
let last = 0;
let seenLand = 0;
let callUntil = 0;
let raf = 0;

function previewSeed() {
  if (!preview || !params.has('seed')) return null;
  const raw = params.get('seed');
  const n = Number(raw);
  if (Number.isSafeInteger(n) && n >= 0) return n >>> 0;
  return SIM.issuedSeed(raw);
}

function arm() {
  const entropy = crypto.getRandomValues(new Uint32Array(1))[0];
  const mode = config?.mode || 'free';
  const seeded = mode === 'ranked' || mode === 'raid';
  const resolved = seeded
    ? SIM.resolveRunSeed(mode, config.seed, 0)
    : SIM.resolveRunSeed('free', config?.seed, previewSeed() ?? entropy);
  if (resolved.error) throw new Error('This run has no seed.');
  state = SIM.create(resolved.seed);
  log = '';
  acc = 0;
  seenLand = 0;
  queuedTrick = 0;
  phase = 'gate';
  endScreen.hidden = true;
  gate.hidden = !!shot;
  hudEl.hidden = true;
  boostBtn.hidden = true;
  again.hidden = seeded;
  previewEl.hidden = !preview;
  return resolved;
}

function readCode() {
  let steer = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) steer = 1;
  else if (keys.has('ArrowRight') || keys.has('KeyD')) steer = 2;
  else {
    const touch = gestures.steer();
    if (touch < 0) steer = 1;
    else if (touch > 0) steer = 2;
  }
  const boost = (heldBoost || keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 1 : 0;
  const trick = queuedTrick;
  queuedTrick = 0;
  return steer + boost * 3 + trick * 6;
}

function queueTrick(nameOrCode) {
  if (!state || state.y < SIM.C.TRICK_MIN_Y) return;
  const code = typeof nameOrCode === 'number' ? nameOrCode : TRICK[nameOrCode];
  if (code) queuedTrick = code;
}

function showEnd(result) {
  phase = 'end';
  document.querySelector('#end-title').textContent = result.cause === 'avalanche' ? 'The slide caught you' : 'Whiteout';
  document.querySelector('#end-score').textContent = fmt(result.score);
  document.querySelector('#end-distance').textContent = `${fmt(result.distance)} m`;
  document.querySelector('#end-tricks').textContent = fmt(result.trickPoints);
  document.querySelector('#end-combo').textContent = `x${result.bestCombo}`;
  document.querySelector('#end-crashes').textContent = String(result.crashes);
  endCopy.textContent = embedded && config && config.mode !== 'free' ? 'Run sent.' : '';
  again.hidden = !!(config && config.mode !== 'free');
  endScreen.hidden = false;
}

function finish() {
  const result = SIM.result(state);
  audio.land(result.cause === 'avalanche' ? 'crash' : 'plain');
  showEnd(result);
  if (!embedded || !TA?.active || preview) return;
  if (config.mode === 'free') saveProgress(result);
  TA.complete({
    result: 'completed',
    primaryMetric: result.score,
    secondaryMetrics: {
      distance: result.distance,
      trickPoints: result.trickPoints,
      bestCombo: result.bestCombo,
      crashes: result.crashes,
      boosts: result.boosts,
      ticks: result.ticks,
    },
    proof: { v: 1, rules: SIM.RULES_VERSION, ruleset: SIM.RULESET, seed: state.seed, input: log },
  });
}

function saveProgress(result) {
  const key = 'ta.powderline.progress.v1';
  let prev = {};
  try { prev = JSON.parse(localStorage.getItem(key) || '{}'); } catch { prev = {}; }
  const next = {
    bestScore: Math.max(0, prev.bestScore | 0, result.score),
    bestDistance: Math.max(0, prev.bestDistance | 0, result.distance),
    runs: (prev.runs | 0) + 1,
  };
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
}

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

function hud(now) {
  if (!state) return;
  const result = SIM.result(state);
  distEl.textContent = `${fmt(result.distance)} m`;
  scoreEl.textContent = fmt(result.score);
  const showSlide = state.gap < 18;
  slideEl.hidden = !showSlide;
  if (showSlide) {
    slideEl.textContent = `Slide ${Math.max(0, Math.ceil(state.gap))} m`;
    slideEl.style.fontSize = state.gap < 8 ? '22px' : '15px';
  }
  comboEl.hidden = state.combo < 2;
  comboEl.textContent = state.combo > 1 ? `x${state.combo}` : '';
  fillEl.style.height = `${Math.round(state.boost)}%`;
  boostBtn.classList.toggle('on', state.boosting);
  boostBtn.classList.toggle('low', state.boost < SIM.C.BOOST_MIN && !state.boosting);
  if (state.landId !== seenLand) {
    seenLand = state.landId;
    audio.land(state.landKind);
    if (state.landKind === 'clean') {
      callEl.textContent = `${state.landName} +${state.landPoints}`;
      callUntil = now + 900;
    } else if (state.landKind === 'bail') {
      callEl.textContent = 'Bailed';
      callUntil = now + 700;
    } else if (state.landKind === 'crash') {
      callEl.textContent = 'Hit';
      callUntil = now + 600;
    }
  }
    if (state.trick) {
      callEl.textContent = state.trick.name;
      callUntil = now + 200;
    }
  callEl.hidden = now > callUntil;
}

function frame(now) {
  if (destroyed) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
  last = now;
  const hostPaused = !!(TA && TA.paused);
  if (phase === 'run' && !paused && !hostPaused && state && !state.over) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 5 && !state.over) {
      const code = readCode();
      log += ALPHA[code];
      if (code >= 6 && !state.trick) audio.trick();
      SIM.step(state, code);
      acc -= DT;
      steps += 1;
    }
    if (state.over) finish();
  }
  if (view && state) {
    const near = view.sync(state, phase === 'run' ? dt : 0, now / 1000);
    veil.style.opacity = String(near * near * 0.22);
    audio.feel(state);
    hud(now);
    if (shot && phase !== 'run') document.documentElement.dataset.shot = 'ready';
    else if (preview && !shot && phase === 'gate') document.documentElement.dataset.shot = 'ready';
  }
}

function dropIn() {
  if (phase === 'run' || destroyed) return;
  if (embedded && !TA.beginRun()) return;
  audio.resume();
  if (phase === 'end' || !state) arm();
  phase = 'run';
  gate.hidden = true;
  endScreen.hidden = true;
  hudEl.hidden = false;
  boostBtn.hidden = false;
  canvas.focus();
}

function onKeyDown(event) {
  if (event.repeat) return;
  keys.add(event.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (phase === 'gate' && (event.code === 'Enter' || event.code === 'Space')) dropIn();
  if (KEY_TRICK[event.code]) queueTrick(KEY_TRICK[event.code]);
}
function onKeyUp(event) { keys.delete(event.code); }

function pointerDown(event) {
  if (event.target === boostBtn || event.target === drop || event.target === again) return;
  app.setPointerCapture?.(event.pointerId);
  gestures.down(event.pointerId, event.clientX, event.clientY);
}
function pointerMove(event) {
  const trick = gestures.move(event.pointerId, event.clientX, event.clientY, !!(state && state.y > SIM.C.TRICK_MIN_Y));
  if (trick) queueTrick(trick);
}
function pointerUp(event) {
  const trick = gestures.up(event.pointerId, !!(state && state.y > SIM.C.TRICK_MIN_Y));
  if (trick) queueTrick(trick);
}

function bind() {
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  app.addEventListener('pointerdown', pointerDown);
  app.addEventListener('pointermove', pointerMove);
  app.addEventListener('pointerup', pointerUp);
  app.addEventListener('pointercancel', (event) => gestures.cancel(event.pointerId));
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  const press = (button, action) => {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener('pointerup', (event) => { event.preventDefault(); event.stopPropagation(); action(); });
  };
  press(drop, dropIn);
  press(again, () => { arm(); dropIn(); });
  const hold = (event) => { event.preventDefault(); event.stopPropagation(); heldBoost = true; boostBtn.setPointerCapture?.(event.pointerId); };
  const release = () => { heldBoost = false; };
  boostBtn.addEventListener('pointerdown', hold);
  boostBtn.addEventListener('pointerup', release);
  boostBtn.addEventListener('pointercancel', release);
  boostBtn.addEventListener('lostpointercapture', release);
  addEventListener('resize', () => view?.resize());
  addEventListener('blur', () => { keys.clear(); heldBoost = false; gestures.clear(); });
}

function destroy() {
  destroyed = true;
  cancelAnimationFrame(raf);
  audio.close();
  view?.dispose();
  removeEventListener('keydown', onKeyDown);
  removeEventListener('keyup', onKeyUp);
}

function seekShot() {
  let guard = 0;
  while (state && !state.over && guard < SIM.C.MAX_TICKS) {
    guard += 1;
    SIM.step(state, SIM.botInput(state));
    if (shot === 'carve' && state.y < 0.08 && state.z > 160 && Math.abs(state.vx) > 2.5 && state.gap > 8) break;
    if (shot === 'trick' && state.trick && state.trick.id === 'method' && state.y > 2.6 && state.trick.t > 0.24 && state.trick.t < 0.4) break;
    if (shot === 'slide' && state.gap < 7.2 && state.z > 200 && state.y < 0.35) break;
  }
  phase = 'shot';
  hudEl.hidden = false;
  boostBtn.hidden = false;
}

function startShell() {
  try {
    view = createView(canvas, { low, reduced });
  } catch (error) {
    const note = document.createElement('p');
    note.className = 'fail';
    note.textContent = 'This browser could not start the 3D view.';
    app.append(note);
    if (embedded) TA.error(error.message || 'WebGL failed');
    return;
  }
  bind();
  if (!embedded) {
    arm();
    if (shot) seekShot();
  }
  if (low || matchMedia('(max-width: 700px)').matches) document.documentElement.classList.add('compact');
  raf = requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (embedded) TA.error('Graphics context lost');
  });
}

const adapter = {
  version: '1.0.0',
  capabilities: { touch: true },
  mount(next) {
    if (!next || !['free', 'ranked', 'raid'].includes(next.mode) || next.gameVersion !== '1.0.0') throw new Error('Unsupported Powderline session.');
    config = next;
    arm();
  },
  start() { gate.hidden = false; },
  pause() { paused = true; heldBoost = false; keys.clear(); gestures.clear(); audio.suspend(); },
  resume() { paused = false; acc = 0; last = performance.now(); audio.resume(); },
  restart() {
    if (config?.mode !== 'free') return;
    arm();
    dropIn();
  },
  destroy,
};

if (embedded) TA.register(adapter);
startShell();
