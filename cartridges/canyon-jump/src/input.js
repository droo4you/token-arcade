/* Canyon Jump lane gestures. One touch gesture = at most one lane change.
   A gesture becomes a SWIPE the moment it travels SWIPE_PX mostly sideways (fires immediately), or a TAP if it is
   released (or held still for HOLD_S) without moving past TAP_SLOP. Whichever fires first locks the gesture until
   touchend, so a long drag, a drag that wobbles back, or a tap that turns into a swipe can never move twice.
   Pure and DOM-free so it can be unit tested; coordinates are logical canvas px, time is seconds. */
(function (root) {
  'use strict';
  const CFG = Object.freeze({ SWIPE_PX: 26, TAP_SLOP: 12, HOLD_S: 0.12, AXIS: 1.2 });
  function create(cfg) {
    const c = Object.assign({}, CFG, cfg || {}), g = new Map();
    return {
      cfg: c,
      // midX: screen centre; taps pick the side of the screen they land on.
      down(id, x, y, t, midX) { g.set(id, { x0: x, y0: y, t0: t, side: x < midX ? 'left' : 'right', locked: false, moved: 0 }); },
      move(id, x, y) {
        const s = g.get(id); if (!s || s.locked) return null;
        const dx = x - s.x0, dy = y - s.y0; s.moved = Math.max(s.moved, Math.hypot(dx, dy));
        if (Math.abs(dx) >= c.SWIPE_PX && Math.abs(dx) > Math.abs(dy) * c.AXIS) { s.locked = true; return dx > 0 ? 'right' : 'left'; }
        return null;
      },
      // Called every frame: a press held still counts as a tap without waiting for release.
      tick(t) {
        const out = [];
        for (const s of g.values()) if (!s.locked && s.moved < c.TAP_SLOP && t - s.t0 >= c.HOLD_S) { s.locked = true; out.push(s.side); }
        return out;
      },
      up(id) {
        const s = g.get(id); g.delete(id); if (!s || s.locked) return null;
        return s.moved < c.TAP_SLOP ? s.side : null; // a short wobble that never became a swipe is ignored
      },
      cancel(id) { g.delete(id); },
      clear() { g.clear(); },
      size() { return g.size; },
    };
  }
  const api = { create, CFG };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJInput = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
