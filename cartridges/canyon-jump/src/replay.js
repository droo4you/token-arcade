/* Canyon Jump replays: seed + level + per-tick sim inputs, run-length encoded. Pure, no DOM (browser + node).
   A replay re-simulates exactly because the sim is deterministic and analog inputs are quantized to 1/100 *before*
   they reach the sim (quant()), so what is recorded is bit-for-bit what was simulated.
   Code format: "CJR1." + base64url(JSON { v, level, seed, build, simHash, ticks, rle: [[count, token], ...], result }). */
(function (root) {
  'use strict';
  const BITS = ['leftEdge', 'rightEdge', 'boostEdge', 'stabEdge', 'rollLeftEdge', 'rollRightEdge', 'flipFrontEdge', 'flipBackEdge', 'left', 'right', 'up', 'down', 'trickEdge', 'rollEdge'];
  const q100 = v => Math.round(Math.max(-1, Math.min(1, v)) * 100);
  /* Quantize an input object in place (analog stick to 1/100). Call before S.step so recorded == simulated. */
  function quant(i) { if (i.pitch != null) i.pitch = q100(i.pitch) / 100; if (i.steer != null) i.steer = q100(i.steer) / 100; return i; }
  function token(i) {
    let b = 0; BITS.forEach((k, n) => { if (i[k]) b |= 1 << n; });
    let t = String(b);
    if (i.pitch != null) t += 'p' + q100(i.pitch); if (i.steer != null) t += 's' + q100(i.steer);
    if (i.rollDir) t += 'r' + i.rollDir; if (i.flipDir) t += 'f' + i.flipDir;
    return t;
  }
  function untoken(t) {
    const m = /^(\d+)(?:p(-?\d+))?(?:s(-?\d+))?(?:r(-?\d+))?(?:f(-?\d+))?$/.exec(t), i = {}, b = +m[1];
    BITS.forEach((k, n) => { if (b & (1 << n)) i[k] = true; });
    if (m[2] != null) i.pitch = +m[2] / 100; if (m[3] != null) i.steer = +m[3] / 100; if (m[4] != null) i.rollDir = +m[4]; if (m[5] != null) i.flipDir = +m[5];
    return i;
  }
  function recorder(meta) {
    const rle = []; let ticks = 0;
    return {
      push(i) { const t = token(i); ticks++; const last = rle[rle.length - 1]; if (last && last[1] === t) last[0]++; else rle.push([1, t]); },
      data(result) { return Object.assign({ v: 1 }, meta, { ticks, rle, result }); },
    };
  }
  function inputs(data) { const out = []; for (const [n, t] of data.rle) { for (let k = 0; k < n; k++) out.push(untoken(t)); } return out; }
  const b64e = s => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s))); };
  function encode(data) { return 'CJR1.' + b64e(JSON.stringify(data)); }
  function decode(code) { code = String(code).trim(); const k = code.indexOf('CJR1.'); if (k < 0) throw new Error('not a Canyon Jump replay (expected CJR1.…)'); return JSON.parse(b64d(code.slice(k + 5).split(/\s/)[0])); }
  /* FNV-1a 32-bit hash of text (sim.js source + level JSON): identifies the physics a replay was recorded on. */
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  const api = { BITS, quant, token, untoken, recorder, inputs, encode, decode, hash };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
