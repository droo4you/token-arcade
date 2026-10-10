// POST /api/daily/start -> { seed, attemptId, attemptsLeft, day }
//
// Spends one of the day's attempts and hands back the seed. Asking for the seed IS
// spending the attempt: there is no endpoint that reveals today's seed without
// costing something, because a readable seed lets a player rehearse the exact whale
// and dump placements and submit only their best run.
const store = require('../../lib/store');
const { playerFrom, setPlayerCookie } = require('../../lib/player');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const player = playerFrom(req);
    setPlayerCookie(res, player);

    const day = store.utcDay();
    const { attemptId, seed, attemptsLeft } = await store.claimAttempt(player.id, day);

    if (!attemptId) {
      return res.status(429).json({
        error: 'no attempts left today',
        attemptsLeft: 0,
        day,
        resetsAt: day + 'T24:00:00Z'
      });
    }

    // no caching anywhere on this response: every call must reach the counter
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ seed, attemptId, attemptsLeft, day, ranked: player.ranked });
  } catch (e) {
    return res.status(500).json({ error: 'could not start a run', detail: String(e.message || e) });
  }
};
