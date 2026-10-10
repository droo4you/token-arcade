// Shared headless harness: loads src/game.js into an isolated vm context with a
// stubbed DOM so the real game code can be driven from Node.
// Used by tools/determinism.js and tools/verify.js.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'game.js');

function makeTrial(W, H, opts) {
  W = W || 1280;
  H = H || 720;
  opts = opts || {};

  const rafQueue = [];
  let nowMs = 0;
  let audioMade = 0;
  let audioSeq = 0;
  const audioAll = [];   // every Audio element the game creates, for audio tests

  const ctxProxy = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      return () => ({ addColorStop() {} });
    },
    set(t, k, v) { t[k] = v; return true; }
  });

  const elCache = new Map();
  function el(id) {
    if (elCache.has(id)) return elCache.get(id);
    const handlers = {};
    const e = {
      id, textContent: '', innerHTML: '', value: '50', checked: false, width: 0, height: 0,
      // real elements expose data-* through dataset; tests populate it per element
      dataset: {},
      // real CSSStyleDeclaration: the palette pickers drive CSS custom properties
      style: (() => {
        const props = {};
        return { setProperty(k, v) { props[k] = v; }, getPropertyValue(k) { return props[k] || ''; } };
      })(),
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
      removeEventListener() {},
      getContext() { return ctxProxy; },
      getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H }; },
      append() {}, appendChild() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
      fire(type, ev) {
        (handlers[type] || []).forEach(fn => fn(ev));
        const on = e['on' + type];
        if (typeof on === 'function') on(ev);
      }
    };
    elCache.set(id, e);
    return e;
  }

  const winHandlers = {};
  const sandbox = {
    window: {
      innerWidth: W, innerHeight: H, devicePixelRatio: 1,
      addEventListener(type, fn) { (winHandlers[type] = winHandlers[type] || []).push(fn); },
      removeEventListener() {},
      AudioContext: undefined, webkitAudioContext: undefined
    },
    document: {
      getElementById: el,
      querySelectorAll: () => [],
      documentElement: el('html'),
      createElement: tag => el('created:' + tag + ':' + Math.random())
    },
    getComputedStyle: () => ({ getPropertyValue: () => '#ccff00' }),
    requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    performance: { now: () => nowMs },
    setTimeout: () => 0,
    clearTimeout: () => {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    // the shared-setup link reads the hash and the copy button writes the clipboard
    location: { hash: opts.hash || '', origin: 'https://buy-bounce.test', pathname: '/', search: '' },
    history: { replaceState() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    URL, URLSearchParams,
    Image: function Image() { this.src = ''; this.onload = null; this.onerror = null; },
    // Models enough of HTMLMediaElement for the pool's readiness and idle checks.
    // opts.audioReady controls how many voices per pool report as loaded, so tests
    // can reproduce the half-loaded state that made bounces fall silent.
    Audio: function Audio() {
      const self = this;
      self.src = ''; self.volume = 1; self.currentTime = 0; self.preload = '';
      self.paused = true; self.ended = false;
      self.readyState = opts.audioReady == null ? 4 : (audioMade++ < opts.audioReady ? 4 : 0);
      self.plays = 0;
      self.addEventListener = () => {};
      self.play = () => {
        if (self.readyState < 2) return Promise.reject(new Error('not ready'));
        // opts.audioAbortRate models the AbortError a browser raises when a mid-play
        // element is seeked, which is the failure a synchronous return cannot see
        if (opts.audioAbortRate && audioSeq++ % Math.round(1 / opts.audioAbortRate) === 0) {
          return Promise.reject(new Error('AbortError'));
        }
        self.plays++; self.paused = false;
        return Promise.resolve();
      };
      self.pause = () => { self.paused = true; };
      audioAll.push(self);
    },
    console
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  if (opts.beforeLoad) opts.beforeLoad(sandbox, context, { el, rafQueue });
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), context, { filename: 'game.js' });

  const BB = sandbox.window.BB;

  return {
    W, H, sandbox, BB, el, audioAll,
    frame(dtMs, inputX) {
      nowMs += dtMs;
      if (inputX != null) el('c').fire('pointermove', { clientX: inputX });
      const queue = rafQueue.splice(0, rafQueue.length);
      for (const callback of queue) callback(nowMs);
      return BB.state;
    },
    get now() { return nowMs; },

    // Drive the real RAF loop with an exact timestamp sequence. inputFn(frameIndex,
    // state) returns the paddle x for that frame.
    run(seed, frames, dtMs, inputFn) {
      nowMs = 0;
      BB.replay(seed);
      const cv = el('c');
      cv.fire('pointerdown', { clientX: W / 2 });
      for (let i = 0; i < frames; i++) {
        nowMs += dtMs;
        cv.fire('pointermove', { clientX: inputFn(i, BB.state) });
        const q = rafQueue.splice(0, rafQueue.length);
        if (!q.length) break;
        for (const cb of q) cb(nowMs);
      }
      return BB.state;
    },

    // Drive to a total elapsed time at a given frame cadence, paddle placed once and
    // then held still. Isolates frame timing as the only variable.
    runAtCadence(seed, totalMs, frameMs, padX) {
      nowMs = 0;
      BB.replay(seed);
      el('c').fire('pointerdown', { clientX: padX });
      while (nowMs < totalMs) {
        nowMs = Math.min(totalMs, nowMs + frameMs);
        const q = rafQueue.splice(0, rafQueue.length);
        if (!q.length) break;
        for (const cb of q) cb(nowMs);
      }
      return BB.state;
    },

    // Drive frames with no input at all. The run must stay frozen.
    runIdle(seed, frames, dtMs) {
      nowMs = 0;
      BB.replay(seed);
      for (let i = 0; i < frames; i++) {
        nowMs += dtMs;
        const q = rafQueue.splice(0, rafQueue.length);
        if (!q.length) break;
        for (const cb of q) cb(nowMs);
      }
      return BB.state;
    }
  };
}

// Mirror of encodeTrack in src/game.js: base64 -> varint -> zigzag -> delta.
function decodeTrack(b64) {
  const bin = Buffer.from(b64, 'base64');
  const out = [];
  let prev = 0, i = 0;
  while (i < bin.length) {
    let z = 0, shift = 0, b;
    do {
      b = bin[i++];
      z |= (b & 127) << shift;
      shift += 7;
    } while (b & 128);
    const d = (z & 1) ? -((z + 1) / 2) : z / 2;
    prev += d;
    out.push(prev);
  }
  return out;
}

module.exports = { makeTrial, decodeTrack, SRC };
