// GET /api/window/state -> { window: null | { id, name, opens, closes, attempts, open,
//                                        secret? }, mine: null | { attemptsLeft,
//                                        tickets, ath, runs } }
//
// The window the menu should show: the one open now, or the most recently closed
// one so its board and reveal stay reachable. `secret` is present only after close;
// with it anyone can recompute every seed in the window (see supabase/window.sql).
// `mine` is present only for a signed-in wallet.
const store = require('../../lib/store');
const { playerFrom } = require('../../lib/player');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.setHeader('cache-control', 'no-store');
  try {
    const w = await store.currentWindow();
    let mine = null;
    if (w) {
      const player = playerFrom(req);
      if (!player.anonymous) mine = await store.windowStanding(w.id, player.id);
    }
    return res.status(200).json({ window: w, mine, now: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'could not load the window', detail: String(e.message || e) });
  }
};
