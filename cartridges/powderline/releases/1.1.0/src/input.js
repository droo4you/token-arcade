/* Pointer gestures for Powderline. One finger, one result.
   In the air, the first 28px of travel with a clear axis is a trick and the gesture locks.
   On the snow, a sideways drag carves until release. A short tap in the air is a Method.
   Coordinates are CSS pixels, y grows downward. No DOM, so the rules can be tested. */
(function (root) {
  'use strict';
  const CFG = Object.freeze({ SWIPE_PX: 28, TAP_PX: 16, STEER_PX: 18, AXIS: 1.05 });
  function create(cfg) {
    const c = Object.assign({}, CFG, cfg || {});
    const ptrs = new Map();
    return {
      cfg: c,
      down(id, x, y, width) {
        const hold = width > 0 ? (x < width * 0.5 ? -1 : 1) : 0;
        ptrs.set(id, { x0: x, y0: y, x, y, locked: false, steer: 0, hold });
      },
      move(id, x, y, airborne) {
        const p = ptrs.get(id);
        if (!p || p.locked) return null;
        p.x = x;
        p.y = y;
        const dx = x - p.x0;
        const dy = y - p.y0;
        if (airborne && Math.hypot(dx, dy) >= c.SWIPE_PX) {
          p.locked = true;
          p.steer = 0;
          if (Math.abs(dx) > Math.abs(dy) * c.AXIS) return dx > 0 ? 'right' : 'left';
          return dy > 0 ? 'down' : 'up';
        }
        if (!airborne && Math.abs(dx) >= c.STEER_PX && Math.abs(dx) > Math.abs(dy) * c.AXIS) p.steer = dx > 0 ? 1 : -1;
        else if (!airborne && Math.abs(dx) < 10) p.steer = 0;
        return null;
      },
      up(id, airborne) {
        const p = ptrs.get(id);
        ptrs.delete(id);
        if (!p || p.locked) return null;
        if (airborne && Math.hypot(p.x - p.x0, p.y - p.y0) < c.TAP_PX) return 'tap';
        return null;
      },
      cancel(id) { ptrs.delete(id); },
      steer() {
        let s = 0;
        for (const p of ptrs.values()) if (!p.locked && p.steer) s = p.steer;
        return s;
      },
      hold() {
        let h = 0;
        for (const p of ptrs.values()) if (!p.locked && p.hold) h = p.hold;
        return h;
      },
      sides() {
        let left = false;
        let right = false;
        for (const p of ptrs.values()) {
          if (p.locked || !p.hold) continue;
          if (p.hold < 0) left = true;
          if (p.hold > 0) right = true;
        }
        return { left, right };
      },
      clear() { ptrs.clear(); },
      size() { return ptrs.size; },
    };
  }
  /* Screen-left is -1. The chase cam looks down +z, so screen-left is +slope x,
     which the frozen sim produces with steer code 2 (steerDir +1). */
  function steerCode(screenDir) {
    if (screenDir < 0) return 2;
    if (screenDir > 0) return 1;
    return 0;
  }
  const api = { create, CFG, steerCode };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLInput = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
