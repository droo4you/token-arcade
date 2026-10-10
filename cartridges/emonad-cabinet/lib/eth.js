// Ethereum primitives, hand-rolled.
//
// Node has sha3-256 but not keccak-256 (they differ by one padding byte), and it can
// verify a secp256k1 signature against a known key but cannot recover the key from
// the signature, which is the whole of wallet sign-in: all we hold is an address.
// Both are short enough to write here and keep the project free of a package.json.
//
// Everything is BigInt and exact. Nothing in here touches the simulation.
const crypto = require('crypto');

/* ---------- keccak-256 ---------- */

// The rotation offsets and round constants are generated from their definitions
// rather than typed in, and tools/auth.js checks the result against published
// vectors. A mistyped table would fail there, not in production.
const ROT = (() => {
  const r = Array.from({ length: 5 }, () => new Array(5).fill(0));
  let x = 1, y = 0;
  for (let t = 0; t < 24; t++) {
    r[x][y] = ((t + 1) * (t + 2) / 2) % 64;
    [x, y] = [y, (2 * x + 3 * y) % 5];
  }
  return r;
})();
const RC = (() => {
  const out = [];
  let R = 1;
  const bit = () => {            // 8-bit LFSR, x^8 + x^6 + x^5 + x^4 + 1
    const b = R & 1;
    R <<= 1;
    if (R & 0x100) R ^= 0x171;
    return b;
  };
  for (let i = 0; i < 24; i++) {
    let rc = 0n;
    for (let j = 0; j < 7; j++) if (bit()) rc |= 1n << BigInt((1 << j) - 1);
    out.push(rc);
  }
  return out;
})();
const M64 = (1n << 64n) - 1n;
const rotl = (v, n) => n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & M64;

function keccakF(A) {
  const C = new Array(5), D = new Array(5), B = new Array(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
    for (let i = 0; i < 25; i++) A[i] ^= D[i % 5];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x][y]);
    }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      A[x + 5 * y] = B[x + 5 * y] ^ (~B[(x + 1) % 5 + 5 * y] & B[(x + 2) % 5 + 5 * y]);
    }
    A[0] ^= RC[round];
  }
}

function keccak256(input) {
  const msg = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  const RATE = 136;
  // keccak pads with 0x01 ... 0x80; sha3 pads with 0x06, which is the whole difference
  const padLen = RATE - (msg.length % RATE);
  const padded = Buffer.alloc(msg.length + padLen);
  msg.copy(padded);
  padded[msg.length] |= 0x01;
  padded[padded.length - 1] |= 0x80;

  const A = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) A[i] ^= padded.readBigUInt64LE(off + i * 8);
    keccakF(A);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(A[i], i * 8);
  return out;
}

/* ---------- secp256k1 ---------- */

const P = (1n << 256n) - (1n << 32n) - 977n;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = [
  0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n
];

const mod = (a, m) => { const r = a % m; return r < 0n ? r + m : r; };
function modInv(a, m) {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1n) throw new Error('not invertible');
  return mod(old_s, m);
}
function modPow(b, e, m) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

// Affine arithmetic. An inversion per operation is slow by library standards and
// still only a few milliseconds per recovery, which an auth endpoint can afford.
// Fewer moving parts beats Jacobian coordinates here.
function ptAdd(a, b) {
  if (!a) return b;
  if (!b) return a;
  const [x1, y1] = a, [x2, y2] = b;
  let m;
  if (x1 === x2) {
    if (mod(y1 + y2, P) === 0n) return null;      // a + (-a)
    m = (3n * x1 * x1) * modInv(2n * y1, P);      // tangent
  } else {
    m = (y2 - y1) * modInv(x2 - x1, P);
  }
  m = mod(m, P);
  const x3 = mod(m * m - x1 - x2, P);
  const y3 = mod(m * (x1 - x3) - y1, P);
  return [x3, y3];
}
function ptMul(pt, k) {
  let r = null, a = pt;
  while (k > 0n) {
    if (k & 1n) r = ptAdd(r, a);
    a = ptAdd(a, a);
    k >>= 1n;
  }
  return r;
}
function onCurve(pt) {
  if (!pt) return false;
  const [x, y] = pt;
  return mod(y * y - (x * x * x + 7n), P) === 0n;
}

// Recover the public key from a signature over a 32-byte hash. recid bit 0 is the
// parity of R.y, bit 1 says R.x overflowed n, which wallets never actually produce
// but costs nothing to honour. Returns [x, y] or null.
function recoverPubkey(hash32, r, s, recid) {
  if (r <= 0n || r >= N || s <= 0n || s >= N) return null;
  const x = r + (recid & 2 ? N : 0n);
  if (x >= P) return null;
  // p = 3 mod 4, so a square root is a^((p+1)/4)
  let y = modPow(x * x * x + 7n, (P + 1n) / 4n, P);
  if (mod(y * y - (x * x * x + 7n), P) !== 0n) return null;   // x is not on the curve
  if ((y & 1n) !== BigInt(recid & 1)) y = P - y;
  const R = [x, y];
  const e = BigInt('0x' + Buffer.from(hash32).toString('hex'));
  // Q = r^-1 (sR - eG)
  const rInv = modInv(r, N);
  const sR = ptMul(R, mod(s * rInv, N));
  const eG = ptMul(G, mod(-e * rInv, N));
  const Q = ptAdd(sR, eG);
  return onCurve(Q) ? Q : null;
}

function pubkeyToAddress(pt) {
  const buf = Buffer.alloc(64);
  Buffer.from(pt[0].toString(16).padStart(64, '0'), 'hex').copy(buf, 0);
  Buffer.from(pt[1].toString(16).padStart(64, '0'), 'hex').copy(buf, 32);
  return '0x' + keccak256(buf).subarray(12).toString('hex');
}

/* ---------- signatures as wallets produce them ---------- */

// EIP-191 personal_sign: the prefix stops a signed login message from doubling as a
// signed transaction. Length is in bytes of the UTF-8 message.
function hashPersonal(message) {
  const body = Buffer.from(message, 'utf8');
  return keccak256(Buffer.concat([Buffer.from('\x19Ethereum Signed Message:\n' + body.length, 'utf8'), body]));
}

// 65-byte r||s||v hex. v is 27/28 from most wallets and 0/1 from some hardware
// wallets, so both are accepted.
function parseSignature(sig) {
  if (typeof sig !== 'string') return null;
  const hex = sig.replace(/^0x/i, '');
  if (!/^[0-9a-f]{130}$/i.test(hex)) return null;
  let v = parseInt(hex.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  if (v > 3) return null;
  return { r: BigInt('0x' + hex.slice(0, 64)), s: BigInt('0x' + hex.slice(64, 128)), v };
}

// The address that signed `message` with personal_sign, lowercase, or null.
function recoverAddress(message, sig) {
  const p = parseSignature(sig);
  if (!p) return null;
  const Q = recoverPubkey(hashPersonal(message), p.r, p.s, p.v);
  return Q ? pubkeyToAddress(Q) : null;
}

const isAddress = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

// EIP-55 mixed-case checksum, for display only. Storage and comparison stay lowercase.
function checksum(address) {
  const a = address.toLowerCase().replace(/^0x/, '');
  const h = keccak256(a).toString('hex');
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}

module.exports = {
  keccak256, hashPersonal, parseSignature, recoverPubkey, recoverAddress,
  pubkeyToAddress, checksum, isAddress,
  randomHex: n => crypto.randomBytes(n).toString('hex'),
  // for tools/auth.js, which signs with this arithmetic to exercise the EIP-191 path
  _internals: { ptMul, G, N, P, modInv, mod }
};
