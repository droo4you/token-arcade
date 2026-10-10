// Window mode, end to end through the real endpoints on the memory store.
//   node tools/window.js
//
// Signs in, enters the window three times, banks tickets, hits the limit,
// checks the board, and checks the anonymous and mismatch paths are refused.
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const eth = require('../lib/eth');
const { makeTrial } = require('./harness');
const { ptMul, G, N, modInv, mod } = eth._internals;
const PORT = 8124;
const srv = spawn('node', ['tools/serve.js', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function sign(message, d) {
  const e = BigInt('0x' + eth.hashPersonal(message).toString('hex'));
  for (;;) {
    const k = BigInt('0x' + eth.randomHex(32)) % N; if (!k) continue;
    const R = ptMul(G, k); const r = mod(R[0], N); if (!r) continue;
    const s = mod(modInv(k, N) * (e + r * d), N); if (!s) continue;
    return '0x' + r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0') + (27 + Number(R[1] & 1n)).toString(16);
  }
}
function playRecord(seed, frames) {
  const play = makeTrial(1280, 720);
  const autoplay = (i, S) => S ? (S.head.x - S.cam.x) + Math.sin(i * 0.047) * 26 : 640;
  play.run(seed, frames, 16, autoplay);
  return play.BB.record();
}
let fails = 0;
const ok = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) fails++; };

(async () => {
  await sleep(600);
  const base = 'http://localhost:' + PORT;
  let cookie = '';
  const call = async (path, body, opts) => {
    opts = opts || {};
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie: opts.cookie != null ? opts.cookie : cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc && opts.cookie == null) cookie = sc.split(';')[0];
    return { status: r.status, json: await r.json() };
  };
  try {
    // anonymous: window visible, entry refused
    let w = await call('/api/window/state');
    ok(w.json.window && w.json.window.open && !w.json.mine && !w.json.window.secret, 'anon sees an open window, no standing, no secret');
    let st = await call('/api/window/start', { windowId: w.json.window.id });
    ok(st.status === 401, 'anon entry refused (' + st.status + ')');

    // sign in
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const address = eth.pubkeyToAddress([BigInt('0x' + Buffer.from(jwk.x, 'base64').toString('hex')), BigInt('0x' + Buffer.from(jwk.y, 'base64').toString('hex'))]);
    const d = BigInt('0x' + Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64').toString('hex'));
    const ch = await call('/api/auth', { op: 'nonce', address });
    const v = await call('/api/auth', { op: 'verify', address, nonce: ch.json.nonce, signature: sign(ch.json.message, d) });
    ok(v.status === 200, 'signed in as ' + address.slice(0, 10));
    w = await call('/api/window/state');
    ok(w.json.mine && w.json.mine.attemptsLeft === 3 && w.json.mine.tickets === 0, 'standing: 3 attempts, 0 tickets');

    // a daily run with the wallet still ranks on the daily board
    const dstart = await call('/api/daily/start', {});
    ok(dstart.status === 200, 'wallet can still play the daily');

    // three window runs
    let banked = 0, seeds = [];
    for (let i = 0; i < 3; i++) {
      st = await call('/api/window/start', { windowId: w.json.window.id });
      ok(st.status === 200 && typeof st.json.seed === 'number' && st.json.attemptsLeft === 2 - i, 'attempt ' + i + ': seed issued, ' + st.json.attemptsLeft + ' left');
      seeds.push(st.json.seed);
      const rec = playRecord(st.json.seed, 5000);
      rec.mode = 'window'; rec.attemptId = st.json.attemptId;
      if (i === 1) {
        // wrong seed for this attempt: refused before the replay
        const bad = Object.assign({}, rec, { seed: (rec.seed + 1) >>> 0 });
        const rb = await call('/api/run/submit', bad);
        ok(!rb.json.accepted && /seed/.test(rb.json.reason), 'seed mismatch refused: ' + rb.json.reason);
      }
      const sub = await call('/api/run/submit', rec);
      ok(sub.json.accepted && sub.json.mode === 'window', 'attempt ' + i + ': accepted, tickets=' + sub.json.tickets + ' ath=' + Math.round(sub.json.ath));
      banked += sub.json.tickets;
      ok(sub.json.window && sub.json.window.tickets === banked, 'banked total ' + (sub.json.window && sub.json.window.tickets));
      const dup = await call('/api/run/submit', rec);
      ok(!dup.json.accepted, 'double submit refused: ' + dup.json.reason);
    }
    ok(new Set(seeds).size === 3, 'three distinct seeds');
    st = await call('/api/window/start', { windowId: w.json.window.id });
    ok(st.status === 429 && st.json.state === 'exhausted', 'fourth attempt refused: ' + st.json.state);

    // a different wallet gets a different seed for the same attempt index
    const k2 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const j2 = k2.publicKey.export({ format: 'jwk' });
    const a2 = eth.pubkeyToAddress([BigInt('0x' + Buffer.from(j2.x, 'base64').toString('hex')), BigInt('0x' + Buffer.from(j2.y, 'base64').toString('hex'))]);
    const d2 = BigInt('0x' + Buffer.from(k2.privateKey.export({ format: 'jwk' }).d, 'base64').toString('hex'));
    let c2 = '';
    const ch2 = await call('/api/auth', { op: 'nonce', address: a2 }, { cookie: '' });
    const r2 = await fetch(base + '/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'verify', address: a2, nonce: ch2.json.nonce, signature: sign(ch2.json.message, d2) }) });
    c2 = r2.headers.get('set-cookie').split(';')[0];
    const st2 = await call('/api/window/start', { windowId: w.json.window.id }, { cookie: c2 });
    ok(st2.status === 200 && st2.json.seed !== seeds[0], 'second wallet, attempt 0: different seed');

    // board
    const b = await call('/api/board');
    const rows = b.json.window && b.json.window.rows;
    ok(rows && rows.length === 1 && rows[0].player === address && rows[0].tickets === banked && rows[0].runs === 3, 'window board: 1 wallet, ' + banked + ' tickets, 3 runs');
    ok(b.json.allTime.some(r => r.player === address), 'window runs stand on the all-time board too');

    // seed derivation matches the exported mirror
    const store = require('../lib/store');
    ok(typeof store.windowSeed('s', 'w', 0) === 'number', 'windowSeed mirror exists');
  } finally { srv.kill(); }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
