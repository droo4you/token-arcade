// POST /api/run/submit -> { accepted, reason?, ath?, rank? }
//
// Body is BB.record() plus mode, and attemptId for daily and window runs.
//
// The server never trusts `claim`. It re-simulates the run from seed plus track with
// the same verifier the repo ships, and compares. A forged score therefore requires a
// paddle track that actually plays that well, which is playing well.
const store = require('../../lib/store');
const { playerFrom, setPlayerCookie } = require('../../lib/player');
const { verify } = require('../../tools/verify');

const MAX_BODY = 512 * 1024;   // a 10 minute run is well under this

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.setHeader('cache-control', 'no-store');

  let rec;
  try {
    rec = await readBody(req);
  } catch (e) {
    return res.status(400).json({ accepted: false, reason: 'bad body: ' + e.message });
  }

  const player = playerFrom(req);
  setPlayerCookie(res, player);

  const mode = rec.mode === 'daily' ? 'daily' : rec.mode === 'window' ? 'window' : 'free';
  const day = store.utcDay();

  // A run that started before the window closed may end after it. Ten minutes is
  // longer than any run and short enough that a "closed" window is closed.
  const CLOSE_GRACE = 10 * 60e3;

  try {
    // A daily submission has to name the attempt that issued its seed, and that
    // attempt has to belong to this player, on this day, with this seed. Without all
    // four, a player could take one issued seed and submit against it repeatedly, or
    // submit somebody else's better run.
    let attempt = null;
    if (mode === 'daily') {
      if (!rec.attemptId) return res.status(400).json({ accepted: false, reason: 'daily run has no attemptId' });
      attempt = await store.getAttempt(rec.attemptId);
      if (!attempt) return res.status(400).json({ accepted: false, reason: 'unknown attempt' });
      if (attempt.player !== player.id) return res.status(403).json({ accepted: false, reason: 'attempt belongs to another player' });
      if (String(attempt.day) !== day) return res.status(400).json({ accepted: false, reason: 'attempt is not from today' });
      if ((Number(attempt.seed) >>> 0) !== (rec.seed >>> 0)) {
        return res.status(400).json({ accepted: false, reason: 'seed does not match the issued attempt' });
      }
    }

    // A window run is the same shape with a wallet behind it. The attempt has to be
    // this wallet's, in the current window, with this seed, and the window has to
    // be open or only just closed.
    let windowRow = null;
    if (mode === 'window') {
      if (player.anonymous) return res.status(401).json({ accepted: false, reason: 'window runs need a wallet session' });
      if (!rec.attemptId) return res.status(400).json({ accepted: false, reason: 'window run has no attemptId' });
      attempt = await store.getWindowAttempt(rec.attemptId);
      if (!attempt) return res.status(400).json({ accepted: false, reason: 'unknown attempt' });
      if (attempt.player !== player.id) return res.status(403).json({ accepted: false, reason: 'attempt belongs to another wallet' });
      if ((Number(attempt.seed) >>> 0) !== (rec.seed >>> 0)) {
        return res.status(400).json({ accepted: false, reason: 'seed does not match the issued attempt' });
      }
      windowRow = await store.currentWindow();
      if (!windowRow || windowRow.id !== attempt.window_id) {
        return res.status(409).json({ accepted: false, reason: 'that window is over' });
      }
      if (Date.now() > Date.parse(windowRow.closes) + CLOSE_GRACE) {
        return res.status(409).json({ accepted: false, reason: 'the window closed before this run was submitted' });
      }
    }

    // A self-declared tuned run is turned away before the expensive replay. This is a
    // courtesy to honest clients: the replay below rejects a modified run regardless,
    // since it re-simulates at default tuning, but "replay mismatch" reads as an
    // accusation at somebody who only moved a slider.
    if (rec.tuned) {
      return res.status(200).json({ accepted: false, reason: 'custom tuning, not ranked' });
    }

    // The expensive part, and the only part that matters.
    const result = verify(rec);
    if (!result.ok) {
      return res.status(400).json({ accepted: false, reason: 'replay mismatch', problems: result.problems });
    }

    if (!player.ranked) {
      return res.status(200).json({ accepted: false, reason: 'unranked: connect a wallet to appear on the board', ath: result.recomputed.ath });
    }

    const S = result.recomputed;
    const saved = await store.saveRun({
      attempt_id: mode === 'daily' ? rec.attemptId : null,
      window_attempt_id: mode === 'window' ? rec.attemptId : null,
      player: player.id,
      day: mode === 'daily' ? day : null,
      mode,
      seed: rec.seed >>> 0,
      ath: S.ath, climb: S.climb, buys: S.buys, best: S.best,
      secs: S.t, steps: S.steps,
      tickets: S.tickets || 0,
      track: rec.track
    });

    if (!saved) return res.status(409).json({ accepted: false, reason: 'this attempt was already submitted' });

    // Window runs bank tickets rather than compete on score, so their standing is
    // the wallet's window total.
    if (mode === 'window') {
      let mine = null;
      try { mine = await store.windowStanding(windowRow.id, player.id); } catch (e) {}
      return res.status(200).json({
        accepted: true, mode,
        ath: S.ath, buys: S.buys, secs: S.t, tickets: S.tickets || 0,
        window: mine
      });
    }

    // Standing is a nicety, so a failure here must not turn an accepted run into an
    // error the player reads as a lost score.
    let standing = null;
    try { standing = await store.standing(player.id, day, mode, S.ath); } catch (e) {}

    return res.status(200).json({
      accepted: true, mode,
      ath: S.ath, buys: S.buys, secs: S.t,
      rank: standing && standing.rank,
      outOf: standing && standing.outOf,
      bestToday: standing && standing.bestToday,
      isBest: standing ? standing.isBest : true
    });
  } catch (e) {
    return res.status(500).json({ accepted: false, reason: 'submit failed', detail: String(e.message || e) });
  }
};
