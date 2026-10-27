/* Canyon Jump replays: seed + level + per-tick sim inputs, run-length encoded. Pure, no DOM (browser + node).
   A replay re-simulates exactly because the sim is deterministic and analog inputs are quantized to 1/100 *before*
   they reach the sim (quant()), so what is recorded is bit-for-bit what was simulated.
   Code format: "CJR1." + base64url(JSON { v, level, seed, build, simHash, ticks, rle: [[count, token], ...], result }).
   Share format: "CJZ1.<level>." + base64url(deflate-raw(JSON)), ~5x smaller, used in links (index.html#replay=CJZ1.…).
   The level id rides in clear text so level-select can pick the sim synchronously; decoding the body is async in the
   browser (DecompressionStream) and sync in node (zlib). Both formats are accepted everywhere. */
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
  const NODE_ZLIB = (() => { try { return typeof process !== 'undefined' && process.versions?.node ? require('zlib') : null; } catch (e) { return null; } })();
  const bytesToB64u = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64uToBytes = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function streamThrough(u8, stream) { const out = new Response(new Blob([u8]).stream().pipeThrough(stream)); return new Uint8Array(await out.arrayBuffer()); }
  const lvTag = data => String(data.level || '').replace(/[^a-z0-9-]/gi, '');
  /* Compressed share code. Sync in node; returns a Promise in the browser. Falls back to CJR1 when there is no CompressionStream. */
  function encodeZSync(data) { return 'CJZ1.' + lvTag(data) + '.' + NODE_ZLIB.deflateRawSync(Buffer.from(JSON.stringify(data), 'utf8'), { level: 9 }).toString('base64url'); }
  async function encodeZ(data) {
    if (NODE_ZLIB) return encodeZSync(data);
    if (typeof CompressionStream === 'undefined') return encode(data);
    try { return 'CJZ1.' + lvTag(data) + '.' + bytesToB64u(await streamThrough(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('deflate-raw'))); } catch (e) { return encode(data); }
  }
  /* Pull a replay code out of anything: a CJR1/CJZ1 code, a full share URL (…#replay=…), or text containing either. */
  function extract(s) { s = String(s).trim(); try { s = decodeURIComponent(s); } catch (e) { /* keep */ } const m = /(CJ[RZ]1\.[A-Za-z0-9_.\-]+)/.exec(s); if (!m) throw new Error('not a Canyon Jump replay (expected CJR1.… / CJZ1.… or a #replay= link)'); return m[1]; }
  function levelOf(s) { const c = extract(s); if (c.startsWith('CJZ1.')) return c.split('.')[1] || null; return decode(c).level || null; }
  function decodeZBody(c) { return c.slice(5).split('.').slice(1).join(''); }
  /* Decode either format. Sync for CJR1 (and CJZ1 in node). */
  function decodeSync(s) { const c = extract(s); if (c.startsWith('CJR1.')) return decode(c); if (!NODE_ZLIB) throw new Error('CJZ1 needs decodeAny() in the browser'); return JSON.parse(NODE_ZLIB.inflateRawSync(Buffer.from(decodeZBody(c), 'base64url')).toString('utf8')); }
  async function decodeAny(s) {
    const c = extract(s); if (c.startsWith('CJR1.') || NODE_ZLIB) return decodeSync(c);
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot open compressed replays');
    return JSON.parse(new TextDecoder().decode(await streamThrough(b64uToBytes(decodeZBody(c)), new DecompressionStream('deflate-raw'))));
  }
  /* FNV-1a 32-bit hash of text (sim.js source + level JSON): identifies the physics a replay was recorded on. */
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  const api = { BITS, quant, token, untoken, recorder, inputs, encode, decode, hash, encodeZ, encodeZSync, decodeAny, decodeSync, extract, levelOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
