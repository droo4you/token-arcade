// GET /api/board?day=YYYY-MM-DD&limit=25 -> { day, daily:[...], allTime:[...],
//                                            window: null | { id, name, open, closes, rows:[...] } }
//
// daily   best run per player on that day's shared seed
// allTime best runs ever, from any mode: a great daily or window run deserves to
//         stand in the all-time list too
// window  the current or most recent window, one row per wallet, ranked by tickets
const store = require('../lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '')
      ? url.searchParams.get('day')
      : store.utcDay();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 25));

    const board = await store.board(day, limit);
    let window = null;
    try {
      const w = await store.currentWindow();
      if (w) window = { id: w.id, name: w.name, open: w.open, closes: w.closes, rows: await store.windowBoard(w.id, limit) };
    } catch (e) { /* the window tab is a nicety; the daily board must not fail with it */ }

    // No caching. The moment people care most about this endpoint is right after
    // finishing a run, and an edge cache served a stale empty board for up to 40
    // seconds after a score was accepted, which reads as the submission having
    // failed. The query is two indexed selects, so freshness is worth more than the
    // cache here.
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json(Object.assign({ day, window }, board));
  } catch (e) {
    return res.status(500).json({ error: 'could not load the board', detail: String(e.message || e) });
  }
};
