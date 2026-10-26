/* Score of record. The deterministic sim's score at the tick the run ends is the single source of truth for the
   results screen, local bests, replays and arcade submission. The post-landing roll-out in main.js is visual only
   (it slides the car on after touchdown) and must never change the score. Pure, no DOM (browser + node). */
(function (root) {
  'use strict';
  /* Call after every sim step: freezes S.score(s) on the tick the run ends. */
  function capture(st, S, s) { if (s.over && !st.simScore) st.simScore = S.score(s); return st.simScore; }
  /* The score to show / save / submit: the frozen sim score once the run is over, live score before that. */
  function final(st, S, s) { return s.over ? (st.simScore || (st.simScore = S.score(s))) : S.score(s); }
  /* Arcade completion payload, built only from the score of record. */
  function submission(r, run) {
    return { result: r.reason === 'landed' ? 'completed' : 'failed', primaryMetric: r.total,
      secondaryMetrics: { distance: r.distance, pastRim: r.pastRim, pickups: r.pickups, tricks: r.tricks, trickCount: r.counts.tricks, rings: r.counts.rings, bestMult: r.counts.bestMult,
        landing: r.landing, mach05: r.mach05, topKmh: r.topKmh, launchSpeed: r.launchV, landed: r.reason === 'landed' ? 1 : 0, elapsedMs: Math.round(run.t * 1000) } };
  }
  /* Visual roll-out after a clean landing (main.js runs this each frame). Moves the drawn car only. */
  function rollOut(st, s, dt) { st.landingRoll = Math.max(0, (st.landingRoll || 0) - 18 * dt); s.z += st.landingRoll * dt; s.x *= 0.98; }
  const api = { capture, final, submission, rollOut };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJResult = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
