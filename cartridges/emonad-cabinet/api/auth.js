// POST /api/auth  { op: 'me' | 'nonce' | 'verify' | 'logout' }
//
//   me       -> { address | null }           who the session cookie says you are
//   nonce    -> { nonce, message }           body { address }; sign `message` as is
//   verify   -> { address }                  body { address, nonce, signature }
//   logout   -> { address: null }            clears the cookie
//
// One function rather than four, since they share everything and cold starts are
// per function on Vercel. The signature is checked with lib/eth.js, no RPC and no
// chain: a personal_sign proves control of a key and that is all ranking needs.
//
// What is deliberately absent: a holding gate. Season one's spec puts the $BUY
// balance check in the entry contract, where it belongs. Until then anyone with a
// wallet can rank, and a Sybil costs a funded wallet rather than a cleared cookie.
const player = require('../lib/player');
const eth = require('../lib/eth');

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 4096) throw new Error('body too large');
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.setHeader('cache-control', 'no-store');

  let body;
  try { body = await readBody(req); }
  catch (e) { return res.status(400).json({ error: 'bad body: ' + e.message }); }

  const op = body.op;
  if (op === 'me') {
    const p = player.playerFrom(req);
    return res.status(200).json({ address: p.anonymous ? null : p.address, ranked: p.ranked });
  }

  if (op === 'logout') {
    player.clearSessionCookie(res);
    return res.status(200).json({ address: null });
  }

  if (!player.configured()) {
    return res.status(503).json({ error: 'wallet sign-in is not configured on this deployment (SESSION_SECRET)' });
  }

  const address = typeof body.address === 'string' ? body.address.toLowerCase() : '';
  if (!eth.isAddress(address)) return res.status(400).json({ error: 'address is not a wallet address' });

  if (op === 'nonce') {
    return res.status(200).json(player.challenge(address));
  }

  if (op === 'verify') {
    const signer = player.verifySignIn(address, body.nonce, body.signature);
    if (!signer) return res.status(401).json({ error: 'signature did not verify' });
    player.setSessionCookie(res, signer);
    return res.status(200).json({ address: signer });
  }

  return res.status(400).json({ error: 'unknown op' });
};
