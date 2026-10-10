// POST /api/window/start  { windowId } -> { seed, attemptId, attemptsLeft, window }
//
// Spends one of the wallet's attempts in the open window and hands back that
// attempt's seed. Wallet session required: 401 without one. Same rule as the daily:
// asking for the seed IS spending the attempt, and an exhausted or closed window
// returns no seed at all.
//
// When the entry contract exists, this is where its run authorization gets checked
// before the attempt is claimed. Nothing downstream needs to change for that.
const store = require('../../lib/store');
const { playerFrom } = require('../../lib/player');

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 4096) throw new Error('body too large'); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.setHeader('cache-control', 'no-store');

  const player = playerFrom(req);
  if (player.anonymous) return res.status(401).json({ error: 'sign in with a wallet to enter the window' });

  try {
    const body = await readBody(req);
    const w = await store.currentWindow();
    if (!w || !w.open) return res.status(409).json({ error: 'no window is open', state: 'closed' });
    if (body.windowId && body.windowId !== w.id) {
      return res.status(409).json({ error: 'that window is not the open one', state: 'closed' });
    }

    const r = await store.claimWindowAttempt(w.id, player.id);
    if (r.state !== 'ok') {
      return res.status(429).json({
        error: r.state === 'exhausted' ? 'no attempts left in this window' : 'the window is closed',
        state: r.state, attemptsLeft: 0
      });
    }
    return res.status(200).json({
      seed: r.seed, attemptId: r.attemptId, attemptsLeft: r.attemptsLeft,
      window: { id: w.id, name: w.name, closes: w.closes }
    });
  } catch (e) {
    return res.status(500).json({ error: 'could not start a window run', detail: String(e.message || e) });
  }
};
