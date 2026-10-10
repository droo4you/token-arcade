// Storage for attempts, runs and boards.
//
// Talks to Supabase over its REST API with plain fetch. No client library, so the
// project keeps its zero-dependency, no-build-step shape.
//
// With SUPABASE_URL and SUPABASE_SERVICE_KEY unset it falls back to an in-memory
// store so the endpoints run locally through tools/serve.js. The memory store is for
// development only: it forgets everything on restart and does not survive more than
// one serverless instance.
// Trim everything read from the environment. A value pasted into a dashboard field
// picks up trailing whitespace or a newline easily, and the failure is opaque: Node's
// fetch rejects the assembled URL with "Failed to parse URL" rather than pointing at
// the variable. Also strip a trailing slash so both forms of the project URL work.
const crypto = require('crypto');
const env = k => String(process.env[k] || '').trim();

const URL_ = env('SUPABASE_URL').replace(/\/+$/, '');
const KEY = env('SUPABASE_SERVICE_KEY');
const MAX_ATTEMPTS = Number(env('DAILY_ATTEMPTS') || 3);

// Buy Bounce is a guest in an existing Supabase project, in its own schema, because
// the free tier allows two active projects and both are already spoken for. The
// schema must also be listed under Settings -> API -> Exposed schemas, or PostgREST
// refuses to route to it with PGRST106.
const SCHEMA = env('SUPABASE_SCHEMA') || 'buybounce';

const live = Boolean(URL_ && KEY);

// Fail loudly and precisely at load rather than as an opaque fetch error per request.
// Falling back to the memory store in production would be worse than erroring: runs
// would appear to save and then vanish.
let configError = null;
if (live) {
  try {
    const u = new URL(URL_);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') {
      configError = 'SUPABASE_URL must be https (got ' + u.protocol + ')';
    }
  } catch (e) {
    configError = 'SUPABASE_URL is not a valid URL. Check for a stray newline or ' +
                  'quote in the environment variable. Length seen: ' + URL_.length;
  }
}

function utcDay(d) {
  d = d || new Date();
  return d.toISOString().slice(0, 10);
}

async function rest(path, init) {
  if (configError) throw new Error('supabase misconfigured: ' + configError);
  init = init || {};
  const r = await fetch(URL_.replace(/\/$/, '') + '/rest/v1' + path, Object.assign({}, init, {
    headers: Object.assign({
      apikey: KEY,
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json',
      // PostgREST picks the schema per request: Accept-Profile for reads,
      // Content-Profile for writes and RPC. Sending both keeps every call on the
      // Buy Bounce schema regardless of method.
      'accept-profile': SCHEMA,
      'content-profile': SCHEMA,
      prefer: 'return=representation'
    }, init.headers)
  }));
  const text = await r.text();
  if (!r.ok) throw new Error('supabase ' + r.status + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

// Count rows without fetching them. PostgREST returns the total in the Content-Range
// header when asked for an exact count, so ranking against 500 better runs costs one
// row rather than 500.
async function restCount(path) {
  if (configError) throw new Error('supabase misconfigured: ' + configError);
  const r = await fetch(URL_ + '/rest/v1' + path, {
    method: 'GET',
    headers: {
      apikey: KEY,
      authorization: 'Bearer ' + KEY,
      'accept-profile': SCHEMA,
      prefer: 'count=exact',
      range: '0-0'
    }
  });
  if (!r.ok && r.status !== 206) throw new Error('supabase ' + r.status);
  const cr = r.headers.get('content-range') || '';
  const total = Number(cr.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

/* ---------- memory fallback ---------- */
const mem = { seeds: new Map(), attempts: [], runs: [], windowAttempts: [] };

// Local dev always has one open window, so the mode can be exercised without a
// database. The secret is per process, like the session secret.
mem.window = {
  id: 'mem-window', name: 'Dev window',
  opens: new Date(Date.now() - 3600e3).toISOString(),
  closes: new Date(Date.now() + 86400e3).toISOString(),
  attempts: MAX_ATTEMPTS,
  secret: crypto.randomBytes(32).toString('hex')
};

// Mirror of the seed derivation in claim_window_attempt: first four bytes of
// sha256(secret | wallet | idx), big-endian. Exported so a reveal can be checked
// with the same code the server used.
function windowSeed(secret, player, idx) {
  return crypto.createHash('sha256').update(secret + '|' + player + '|' + idx).digest().readUInt32BE(0);
}
const isOpen = w => w && Date.now() >= Date.parse(w.opens) && Date.now() < Date.parse(w.closes);

// Mirror of the daily_board / alltime_board views: one row per player, their best run.
function bestPerPlayer(rows) {
  const by = new Map();
  for (const r of rows) {
    const cur = by.get(r.player);
    if (!cur || r.ath > cur.ath) by.set(r.player, r);
  }
  return [...by.values()];
}

function memClaim(player, day, max) {
  const used = mem.attempts.filter(a => a.player === player && a.day === day).length;
  // no seed once the attempts are gone: see claim_attempt in supabase/schema.sql
  if (used >= max) return { attemptId: null, seed: null, attemptsLeft: 0 };
  const key = day + '#' + used;
  if (!mem.seeds.has(key)) mem.seeds.set(key, (Math.random() * 4294967295) >>> 0);
  const seed = mem.seeds.get(key);
  const attemptId = 'mem-' + (mem.attempts.length + 1);
  mem.attempts.push({ id: attemptId, player, day, idx: used, seed });
  return { attemptId, seed, attemptsLeft: max - used - 1 };
}

/* ---------- api ---------- */
const store = {
  live,
  configError,
  maxAttempts: MAX_ATTEMPTS,
  utcDay,

  // Spend one attempt and return the day's seed. Atomic: see claim_attempt in
  // supabase/schema.sql for why a plain count-then-insert is not good enough.
  async claimAttempt(player, day) {
    if (!live) return memClaim(player, day, MAX_ATTEMPTS);
    const rows = await rest('/rpc/claim_attempt', {
      method: 'POST',
      body: JSON.stringify({ p_player: player, p_day: day, p_max: MAX_ATTEMPTS })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      attemptId: row.attempt_id,
      seed: Number(row.seed) >>> 0,
      attemptsLeft: row.attempts_left
    };
  },

  // The attempt a daily submission claims to belong to, or null.
  async getAttempt(attemptId) {
    if (!live) return mem.attempts.find(a => a.id === attemptId) || null;
    const rows = await rest('/attempt?id=eq.' + encodeURIComponent(attemptId) + '&select=*');
    return rows && rows[0] ? rows[0] : null;
  },

  // Returns false when this attempt already has a run, which is how one issued seed
  // is stopped from being submitted twice.
  async saveRun(row) {
    if (!live) {
      if (row.attempt_id && mem.runs.some(r => r.attempt_id === row.attempt_id)) return false;
      if (row.window_attempt_id && mem.runs.some(r => r.window_attempt_id === row.window_attempt_id)) return false;
      mem.runs.push(row);
      return true;
    }
    try {
      await rest('/run', { method: 'POST', body: JSON.stringify(row) });
      return true;
    } catch (e) {
      if (/duplicate key|23505/.test(String(e.message))) return false;
      throw e;
    }
  },

  // Where the player stands, called after the run is saved.
  //
  // Rank is the position of the player's BEST run, never of the run just played.
  // Ranking the individual run put a player behind their own earlier score, which
  // produced "#2 of 1": the board holds one row per player, so a player cannot be
  // two places on it. `isBest` tells the caller whether this run is the one counting.
  async standing(player, day, mode, ath) {
    if (!live) {
      const pool = bestPerPlayer(mode === 'daily'
        ? mem.runs.filter(r => r.mode === 'daily' && r.day === day)
        : mem.runs);
      const mine = pool.find(r => r.player === player);
      const myBest = mine ? mine.ath : ath;
      return {
        // same self-exclusion as the live path, so both agree
        rank: pool.filter(r => r.player !== player && r.ath > myBest).length + 1,
        outOf: pool.length,
        bestToday: mode === 'daily' ? myBest : null,
        isBest: ath >= myBest
      };
    }
    // Rank against the boards, which are one row per player, so a rival's three runs
    // count once rather than three times.
    const view = mode === 'daily' ? '/daily_board?day=eq.' + day + '&' : '/alltime_board?';
    const me = encodeURIComponent(player);
    const mineRows = await rest(view + 'select=ath&player=eq.' + me + '&limit=1');
    const myBest = mineRows && mineRows[0] ? mineRows[0].ath : ath;

    // Exclude yourself from the "better than me" count rather than relying on
    // ath > myBest to do it. PostgREST serialises double precision with fewer digits
    // than Postgres stores, so a score read back is a hair BELOW its stored value
    // (233853662.561094 vs 233853662.56109408) and the player's own row satisfies
    // ath > myBest. Every player ranked one place too low, which printed "#5 of 4".
    const [better, total] = await Promise.all([
      restCount(view + 'select=player&ath=gt.' + myBest + '&player=neq.' + me),
      restCount(view + 'select=player')
    ]);
    return {
      rank: better + 1,
      outOf: total,
      bestToday: mode === 'daily' ? myBest : null,
      isBest: ath >= myBest
    };
  },

  async board(day, limit) {
    limit = limit || 25;
    if (!live) {
      const by = (rows) => bestPerPlayer(rows).sort((a, b) => b.ath - a.ath).slice(0, limit)
        .map(r => ({ player: r.player, ath: r.ath, buys: r.buys, secs: r.secs }));
      return {
        daily: by(mem.runs.filter(r => r.mode === 'daily' && r.day === day)),
        allTime: by(mem.runs)
      };
    }
    const cols = 'player,ath,buys,secs';
    const [daily, allTime] = await Promise.all([
      rest('/daily_board?select=' + cols + '&day=eq.' + day + '&order=ath.desc&limit=' + limit),
      rest('/alltime_board?select=' + cols + '&order=ath.desc&limit=' + limit)
    ]);
    return { daily: daily || [], allTime: allTime || [] };
  },

  /* ---------- window mode ---------- */

  windowSeed,
  isOpen,

  // The window a player sees: the one open now, else the most recently closed one
  // (so the board and the reveal stay reachable after close), else null. The secret
  // is stripped unless the window has closed, and it never leaves this module for
  // an open window under any code path.
  async currentWindow() {
    let w;
    if (!live) w = mem.window;
    else {
      const rows = await rest('/window?select=id,name,opens,closes,attempts,secret&order=opens.desc&limit=5');
      const now = Date.now();
      w = (rows || []).find(isOpen) || (rows || []).find(r => Date.parse(r.closes) <= now) || null;
    }
    if (!w) return null;
    const out = { id: w.id, name: w.name, opens: w.opens, closes: w.closes, attempts: w.attempts, open: isOpen(w) };
    if (!out.open && Date.now() >= Date.parse(w.closes)) out.secret = w.secret;
    return out;
  },

  // { state: 'ok'|'closed'|'exhausted', attemptId, seed, attemptsLeft }
  async claimWindowAttempt(windowId, player) {
    if (!live) {
      const w = mem.window;
      if (windowId !== w.id || !isOpen(w)) return { state: 'closed', attemptId: null, seed: null, attemptsLeft: 0 };
      const used = mem.windowAttempts.filter(a => a.window_id === w.id && a.player === player).length;
      if (used >= w.attempts) return { state: 'exhausted', attemptId: null, seed: null, attemptsLeft: 0 };
      const seed = windowSeed(w.secret, player, used);
      const id = 'memw-' + (mem.windowAttempts.length + 1);
      mem.windowAttempts.push({ id, window_id: w.id, player, idx: used, seed });
      return { state: 'ok', attemptId: id, seed, attemptsLeft: w.attempts - used - 1 };
    }
    const rows = await rest('/rpc/claim_window_attempt', {
      method: 'POST',
      body: JSON.stringify({ p_window: windowId, p_player: player })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      state: row.state,
      attemptId: row.attempt_id,
      seed: row.seed == null ? null : Number(row.seed) >>> 0,
      attemptsLeft: row.attempts_left
    };
  },

  async getWindowAttempt(attemptId) {
    if (!live) return mem.windowAttempts.find(a => a.id === attemptId) || null;
    const rows = await rest('/window_attempt?id=eq.' + encodeURIComponent(attemptId) + '&select=*');
    return rows && rows[0] ? rows[0] : null;
  },

  // A wallet's standing in a window: attempts spent, tickets banked, best score.
  async windowStanding(windowId, player) {
    if (!live) {
      const w = mem.window;
      const spent = mem.windowAttempts.filter(a => a.window_id === windowId && a.player === player).length;
      const runs = mem.runs.filter(r => r.mode === 'window' && r.player === player &&
        mem.windowAttempts.some(a => a.id === r.window_attempt_id && a.window_id === windowId));
      return {
        attemptsLeft: Math.max(0, w.attempts - spent),
        tickets: runs.reduce((n, r) => n + (r.tickets || 0), 0),
        ath: runs.reduce((m, r) => Math.max(m, r.ath), 0),
        runs: runs.length
      };
    }
    const me = encodeURIComponent(player);
    const [spent, rows, w] = await Promise.all([
      restCount('/window_attempt?select=id&window_id=eq.' + windowId + '&player=eq.' + me),
      rest('/window_board?select=tickets,ath,runs&window_id=eq.' + windowId + '&player=eq.' + me + '&limit=1'),
      rest('/window?select=attempts&id=eq.' + windowId + '&limit=1')
    ]);
    const row = rows && rows[0];
    const max = w && w[0] ? w[0].attempts : MAX_ATTEMPTS;
    return {
      attemptsLeft: Math.max(0, max - spent),
      tickets: row ? row.tickets : 0,
      ath: row ? row.ath : 0,
      runs: row ? row.runs : 0
    };
  },

  // Ranked by tickets, which is the draw weight; score breaks ties.
  async windowBoard(windowId, limit) {
    limit = limit || 50;
    if (!live) {
      const by = new Map();
      for (const r of mem.runs) {
        if (r.mode !== 'window') continue;
        const a = mem.windowAttempts.find(a => a.id === r.window_attempt_id);
        if (!a || a.window_id !== windowId) continue;
        const cur = by.get(r.player) || { player: r.player, tickets: 0, ath: 0, runs: 0 };
        cur.tickets += r.tickets || 0; cur.ath = Math.max(cur.ath, r.ath); cur.runs++;
        by.set(r.player, cur);
      }
      return [...by.values()].sort((a, b) => b.tickets - a.tickets || b.ath - a.ath).slice(0, limit);
    }
    const rows = await rest('/window_board?select=player,tickets,ath,runs&window_id=eq.' + windowId +
                            '&order=tickets.desc,ath.desc&limit=' + limit);
    return rows || [];
  }
};

module.exports = store;
