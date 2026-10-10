// Measures Droober's real jump reach so level gaps can be designed against facts.
import { loadGame, makeInput } from './harness.mjs';
const { World } = loadGame(['src/world.js']);
const W = 120, H = 30;
const grid = [];
for (let y = 0; y < H; y++) grid.push(y >= 26 ? '#'.repeat(W) : '.'.repeat(W));
grid[25] = '.D' + '.'.repeat(W - 2);
function trial(name, plan, riding) {
  const w = new World({ name, grid, rcRiding: riding });
  const inp = makeInput();
  const d = w.droober; const x0 = d.x, floor = d.y; let peak = 0, airborne = false, f = 0;
  // run-up on the ground
  for (let i = 0; i < 60; i++) w.update(inp(['right', 'run']));
  const startX = d.x;
  for (f = 0; f < 600; f++) {
    w.update(inp(plan(f, d)));
    peak = Math.max(peak, floor - d.y);
    if (!w.grounded(d)) airborne = true;
    else if (airborne) break;
  }
  console.log(name.padEnd(28), 'dx', ((d.x - startX) / 16).toFixed(2), 'tiles  peak', (peak / 16).toFixed(2), 'tiles  frames', f);
}
const runHold = ['right', 'run'];
trial('walk single jump', f => f < 20 ? ['right', 'jump'] : ['right']);
trial('run single jump', f => f < 20 ? [...runHold, 'jump'] : runHold);
trial('run double jump at apex', f => f < 18 ? [...runHold, 'jump'] : f < 20 ? runHold : f < 40 ? [...runHold, 'jump'] : runHold);
trial('run double, glide (no RC)', f => f < 18 ? [...runHold, 'jump'] : f < 20 ? runHold : [...runHold, 'jump']);
trial('run double + RC glide', f => f < 18 ? [...runHold, 'jump'] : f < 20 ? runHold : [...runHold, 'jump'], true);
trial('walk double + RC glide', f => f < 18 ? ['right', 'jump'] : f < 20 ? ['right'] : ['right', 'jump'], true);
// pure height: standing double jump
(() => {
  const w = new World({ name: 'h', grid }); const inp = makeInput(); const d = w.droober; const floor = d.y; let peak = 0;
  for (let f = 0; f < 120; f++) { w.update(inp(f < 18 ? ['jump'] : f < 20 ? [] : ['jump'])); peak = Math.max(peak, floor - d.y); }
  console.log('standing double jump height', (peak / 16).toFixed(2), 'tiles');
})();
