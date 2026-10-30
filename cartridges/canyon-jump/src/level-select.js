/* Free Play level select. Loaded after src/levels.js on index.html only (the arcade page stays on the default level, so
   Passport Play / raids keep one verified sim). ?level=<id> picks the canyon; this swaps window.CJSim for a sim bound to
   that level's geometry + air (CJSim.forLevel) before main.js and the renderers read it. Unknown ids fall back to Snake River.
   The start screen shows level cards; picking one remembers it (localStorage canyon-jump.level) and reloads into that canyon. */
(function (root) {
  'use strict';
  const LV = root.CJLevels, KEY = 'canyon-jump.level'; let id = new URLSearchParams(root.location.search).get('level');
  // No ?level= → the last level picked on the start screen (remembered per device).
  if (!id) { try { const m = localStorage.getItem(KEY); if (m && LV.LEVELS.some(l => l.id === m)) id = m; } catch (e) { /* storage blocked */ } }
  // A replay link (#replay=CJZ1.<level>.… or CJR1.…) carries its own level.
  try { const m = /replay=([^&]+)/.exec(root.location.hash + '&' + root.location.search); if (m && root.CJReplay) id = root.CJReplay.levelOf(m[1]) || id; } catch (e) { /* bad code: ignore */ }
  const level = LV.get(id || LV.DEFAULT);
  root.CJLevel = level;
  if (level.id !== LV.DEFAULT) root.CJSim = root.CJSim.forLevel(level);
  root.CJLevelSelect = {
    level, list: LV.LEVELS,
    go(next) { try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ } const u = new URL(root.location.href); u.hash = ''; if (next === LV.DEFAULT) u.searchParams.delete('level'); else u.searchParams.set('level', next); root.location.href = u.toString(); },
    cycle(d) { const L = LV.LEVELS, i = L.findIndex(l => l.id === level.id); this.go(L[(i + d + L.length) % L.length].id); },
  };
})(globalThis);
