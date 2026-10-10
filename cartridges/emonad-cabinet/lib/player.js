// Who is playing.
//
// A player is one of two things:
//
//   - a wallet, proven by a personal_sign over a server-issued nonce and carried in
//     the bb_sess cookie. The door to the window mode, where an attempt limit has to
//     mean something: three more attempts cost a second funded wallet.
//   - an anonymous bb_pid cookie. Ranked on the daily and all-time boards, which
//     carry nothing of value, so a cleared cookie buying three more attempts is a
//     cost worth the boards actually filling up. Decided 2026-09-11: wallets are
//     the door to the window mode only, and play for fun stays wallet-free.
//
// Sessions are stateless. The cookie is address.expiry.hmac, signed with
// SESSION_SECRET, so no table is read on any request and no logout list exists:
// signing out is deleting the cookie. Rotating SESSION_SECRET signs everyone out.
//
// The nonce is stateless too, for the same reason: it is a timestamp plus an HMAC
// over (address, timestamp), valid for ten minutes. A replayed nonce inside that
// window only signs the same wallet in again, which is not an attack.
const crypto = require('crypto');
const eth = require('./eth');

const COOKIE = 'bb_pid';
const SESSION = 'bb_sess';
const LIVE = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const NONCE_TTL = 10 * 60;             // seconds
const SESSION_DAYS = 30;

// Without a configured secret, every serverless instance would mint its own and a
// session issued by one would fail on the next. Local dev is one process, so a
// per-process secret is fine there; production must set it, and auth reports that
// plainly instead of issuing cookies that do not survive a cold start.
const SECRET = String(process.env.SESSION_SECRET || '').trim() ||
               (LIVE ? null : crypto.randomBytes(32).toString('hex'));
const configured = () => Boolean(SECRET);

const hmac = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function parseCookies(req) {
  const out = {};
  const raw = req.headers && req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* ---------- sign-in challenge ---------- */

// The server writes the whole message so it can rebuild it byte for byte at verify
// time. The wallet shows this text to the player, so it says what signing does.
function message(address, nonce) {
  return 'Buy Bounce wants you to sign in with this wallet.\n\n' +
         'Signing is free. It sends no transaction and grants no permissions.\n\n' +
         'Wallet: ' + eth.checksum(address) + '\n' +
         'Nonce: ' + nonce;
}

function challenge(address) {
  const ts = Math.floor(Date.now() / 1000).toString(36);
  const nonce = ts + '.' + hmac('nonce|' + address + '|' + ts).slice(0, 24);
  return { nonce, message: message(address, nonce) };
}

function checkNonce(address, nonce) {
  if (typeof nonce !== 'string') return false;
  const [ts, mac] = nonce.split('.');
  if (!ts || !mac) return false;
  const age = Math.floor(Date.now() / 1000) - parseInt(ts, 36);
  if (!(age >= -60 && age <= NONCE_TTL)) return false;
  return safeEq(mac, hmac('nonce|' + address + '|' + ts).slice(0, 24));
}

// Verify a signed challenge. Returns the lowercase address or null.
function verifySignIn(address, nonce, signature) {
  if (!eth.isAddress(address)) return null;
  address = address.toLowerCase();
  if (!checkNonce(address, nonce)) return null;
  const signer = eth.recoverAddress(message(address, nonce), signature);
  return signer === address ? address : null;
}

/* ---------- session cookie ---------- */

function issueSession(address, days) {
  const exp = Math.floor(Date.now() / 1000) + (days == null ? SESSION_DAYS : days) * 86400;
  const body = address + '.' + exp.toString(36);
  return body + '.' + hmac('sess|' + body);
}

function readSession(value) {
  if (typeof value !== 'string') return null;
  const [address, exp, mac] = value.split('.');
  if (!eth.isAddress(address || '') || !exp || !mac) return null;
  if (parseInt(exp, 36) < Math.floor(Date.now() / 1000)) return null;
  const body = address + '.' + exp;
  return safeEq(mac, hmac('sess|' + body)) ? address.toLowerCase() : null;
}

/* ---------- request side ---------- */

function playerFrom(req) {
  const c = parseCookies(req);
  const address = configured() ? readSession(c[SESSION]) : null;
  if (address) return { id: address, address, anonymous: false, ranked: true };
  const id = c[COOKIE] || ('anon-' + crypto.randomUUID());
  return { id, anonymous: true, ranked: true };
}

const attrs = maxAge => '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax; HttpOnly' + (LIVE ? '; Secure' : '');

// The anon cookie is only refreshed for anonymous players. Writing it for a signed-in
// wallet would be harmless and pointless.
function setPlayerCookie(res, player) {
  if (!player.anonymous) return;
  res.setHeader('set-cookie', COOKIE + '=' + encodeURIComponent(player.id) + attrs(31536000));
}
function setSessionCookie(res, address) {
  res.setHeader('set-cookie', SESSION + '=' + issueSession(address) + attrs(SESSION_DAYS * 86400));
}
function clearSessionCookie(res) {
  res.setHeader('set-cookie', SESSION + '=' + attrs(0));
}

module.exports = {
  playerFrom, setPlayerCookie, setSessionCookie, clearSessionCookie,
  challenge, checkNonce, verifySignIn, issueSession, readSession, configured,
  COOKIE, SESSION
};
