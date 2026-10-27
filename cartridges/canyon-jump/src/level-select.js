/* Free Play level select. Loaded after src/levels.js on index.html only (the arcade page stays on the default level, so
   Passport Play / raids keep one verified sim). ?level=<id> picks the canyon; this swaps window.CJSim for a sim bound to
   that level's geometry + air (CJSim.forLevel) before main.js and the renderers read it. Unknown ids fall back to Snake River. */
(function (root) {
  'use strict';
  const LV = root.CJLevels; let id = new URLSearchParams(root.location.search).get('level');
  // A replay link (#replay=CJZ1.<level>.… or CJR1.…) carries its own level.
  try { const m = /replay=([^&]+)/.exec(root.location.hash + '&' + root.location.search); if (m && root.CJReplay) id = root.CJReplay.levelOf(m[1]) || id; } catch (e) { /* bad code: ignore */ }
  const level = LV.get(id || LV.DEFAULT);
  root.CJLevel = level;
  if (level.id !== LV.DEFAULT) root.CJSim = root.CJSim.forLevel(level);
  root.CJLevelSelect = {
    level, list: LV.LEVELS,
    go(next) { const u = new URL(root.location.href); if (next === LV.DEFAULT) u.searchParams.delete('level'); else u.searchParams.set('level', next); root.location.href = u.toString(); },
    cycle(d) { const L = LV.LEVELS, i = L.findIndex(l => l.id === level.id); this.go(L[(i + d + L.length) % L.length].id); },
  };
})(globalThis);
