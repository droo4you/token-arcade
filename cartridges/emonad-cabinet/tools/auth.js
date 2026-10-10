// Checks for lib/eth.js and the wallet session in lib/player.js.
//   node tools/auth.js
//
// keccak is checked against published vectors. Recovery is checked by round trip:
// Node generates a secp256k1 key and signs, and we must recover that key from the
// signature alone. Node can sign and verify but cannot recover, which is why the
// recovery code exists at all, so this is the one real test of it.
const crypto = require('crypto');
const assert = require('assert');
const eth = require('../lib/eth');

let pass = 0;
const ok = (cond, label) => { assert(cond, label); pass++; console.log('  ' + label + ': PASS'); };

console.log('keccak-256:');
ok(eth.keccak256('').toString('hex') === 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', 'empty string');
ok(eth.keccak256('abc').toString('hex') === '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45', '"abc"');
// two full blocks plus padding, so the absorb loop runs more than once
ok(eth.keccak256('a'.repeat(300)).toString('hex') === eth.keccak256(Buffer.from('a'.repeat(300))).toString('hex'), 'string and buffer agree');
ok(eth.keccak256(Buffer.alloc(136)).toString('hex') !== eth.keccak256(Buffer.alloc(135)).toString('hex'), 'block boundary distinguishes lengths');
// EIP-55 vector from the EIP
ok(eth.checksum('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed') === '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'EIP-55 checksum');

console.log('secp256k1 recovery:');
// DER -> r, s
function derToRS(der) {
  let i = 2;
  assert(der[0] === 0x30 && der[i] === 0x02);
  const rl = der[i + 1]; const r = BigInt('0x' + der.subarray(i + 2, i + 2 + rl).toString('hex')); i += 2 + rl;
  assert(der[i] === 0x02);
  const sl = der[i + 1]; const s = BigInt('0x' + der.subarray(i + 2, i + 2 + sl).toString('hex'));
  return { r, s };
}
function toSig(r, s, v) {
  return '0x' + r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0') + (27 + v).toString(16).padStart(2, '0');
}
function keyToAddress(pub) {
  const jwk = pub.export({ format: 'jwk' });
  return eth.pubkeyToAddress([BigInt('0x' + Buffer.from(jwk.x, 'base64').toString('hex')),
                              BigInt('0x' + Buffer.from(jwk.y, 'base64').toString('hex'))]);
}

// Node cannot sign a raw digest with an EC key (a null algorithm still sha256s the
// input), so the curve is checked with a sha256 digest and the EIP-191 path with
// our own signer. The two together cover what a wallet signature exercises.
const { ptMul, G, N, modInv, mod } = eth._internals;
function signPersonal(message, d) {
  const e = BigInt('0x' + eth.hashPersonal(message).toString('hex'));
  for (;;) {
    const k = BigInt('0x' + eth.randomHex(32)) % N;
    if (k === 0n) continue;
    const R = ptMul(G, k);
    const r = mod(R[0], N);
    if (r === 0n) continue;
    const s = mod(modInv(k, N) * (e + r * d), N);
    if (s === 0n) continue;
    return toSig(r, s, Number(R[1] & 1n));
  }
}
const message = 'Buy Bounce wants you to sign in.\n\nNonce: ' + eth.randomHex(8);
for (let trial = 0; trial < 5; trial++) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const address = keyToAddress(publicKey);
  const d = BigInt('0x' + Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64').toString('hex'));

  // curve arithmetic against OpenSSL's signature over a sha256 digest
  const digest = crypto.createHash('sha256').update(message).digest();
  const { r, s } = derToRS(crypto.sign('sha256', message, { key: privateKey, dsaEncoding: 'der' }));
  const v = [0, 1].find(v => {
    const Q = eth.recoverPubkey(digest, r, s, v);
    return Q && eth.pubkeyToAddress(Q) === address;
  });
  ok(v !== undefined, 'trial ' + trial + ': OpenSSL signature recovers ' + address.slice(0, 10) + ' with v=' + v);

  // full personal_sign path, key from Node, signature from our own arithmetic
  const sig = signPersonal(message, d);
  ok(eth.recoverAddress(message, sig) === address, 'trial ' + trial + ': recoverAddress matches');
  ok(eth.recoverAddress(message + ' ', sig) !== address, 'trial ' + trial + ': altered message recovers a different key');
  const flipped = sig.slice(0, -2) + (parseInt(sig.slice(-2), 16) ^ 1).toString(16).padStart(2, '0');
  ok(eth.recoverAddress(message, flipped) !== address, 'trial ' + trial + ': wrong parity recovers a different key');
  // 0/1 form of v, as some hardware wallets emit
  const short = sig.slice(0, -2) + (parseInt(sig.slice(-2), 16) - 27).toString(16).padStart(2, '0');
  ok(eth.recoverAddress(message, short) === address, 'trial ' + trial + ': v as 0/1 accepted');
}
ok(eth.recoverAddress(message, '0x' + 'ff'.repeat(65)) === null, 'r out of range is rejected without throwing');
ok(eth.recoverAddress(message, 'nonsense') === null, 'garbage signature is null');

const t0 = Date.now();
for (let i = 0; i < 10; i++) eth.recoverAddress(message, toSig(1n, 1n, 0));
console.log('  10 recoveries in ' + (Date.now() - t0) + 'ms');

console.log('session:');
process.env.SESSION_SECRET = 'test-secret';
const player = require('../lib/player');
const addr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const ch = player.challenge(addr);
ok(typeof ch.nonce === 'string' && ch.message.includes(ch.nonce), 'challenge carries its nonce');
ok(player.checkNonce(addr, ch.nonce), 'fresh nonce verifies');
ok(!player.checkNonce('0x' + '1'.repeat(40), ch.nonce), 'nonce is bound to the address');
ok(!player.checkNonce(addr, ch.nonce.slice(0, -1) + 'x'), 'tampered nonce fails');
const cookie = player.issueSession(addr);
ok(player.readSession(cookie) === addr, 'session round trips');
ok(player.readSession(cookie.replace(/.$/, c => c === 'a' ? 'b' : 'a')) === null, 'tampered session fails');
const stale = player.issueSession(addr, -10);
ok(player.readSession(stale) === null, 'expired session fails');
const req = { headers: { cookie: 'bb_pid=anon-x; bb_sess=' + cookie } };
const p = player.playerFrom(req);
ok(p.id === addr && p.ranked === true && p.anonymous === false, 'playerFrom prefers the wallet session');
ok(player.playerFrom({ headers: { cookie: 'bb_pid=anon-x' } }).id === 'anon-x', 'playerFrom falls back to the anon cookie');

console.log('\n' + pass + ' checks passed');
