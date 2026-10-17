import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create, CFG } = require('../src/input.js');

// Replays a touch sequence; returns every lane change it produced, in order.
function play(seq) {
  const g = create(), out = [];
  for (const [ev, id, x, y, t] of seq) {
    if (ev === 'down') g.down(id, x, y, t, 400);
    else if (ev === 'move') { const d = g.move(id, x, y); if (d) out.push(d); out.push(...g.tick(t)); }
    else if (ev === 'tick') out.push(...g.tick(t));
    else if (ev === 'up') { out.push(...g.tick(t)); const d = g.up(id); if (d) out.push(d); }
  }
  return out;
}
const drag = (id, x0, x1, t0, dur, steps = 20, y = 300) => {
  const s = [['down', id, x0, y, t0]];
  for (let i = 1; i <= steps; i++) s.push(['move', id, x0 + (x1 - x0) * i / steps, y, t0 + dur * i / steps]);
  s.push(['up', id, x1, y, t0 + dur + 0.01]); return s;
};

test('a long drag across the whole screen changes lanes once', () => {
  assert.deepEqual(play(drag(1, 100, 700, 0, 0.4, 40)), ['right']);
});
test('a slow drag (that held still first) still moves only once', () => {
  assert.deepEqual(play([['down', 1, 300, 300, 0], ['tick', 1, 0, 0, 0.2], ...drag(1, 300, 700, 0.2, 0.5).slice(1)]), ['left']);
});
test('swipe after a tap-down on the opposite half picks the swipe, not both', () => {
  assert.deepEqual(play(drag(1, 300, 520, 0, 0.08, 6)), ['right']); // starts on the left half, swipes right
});
test('a drag that wobbles back cannot fire a second change', () => {
  const s = [['down', 1, 400, 300, 0], ['move', 1, 440, 300, 0.03], ['move', 1, 360, 300, 0.06], ['move', 1, 300, 300, 0.09], ['up', 1, 300, 300, 0.1]];
  assert.deepEqual(play(s), ['right']);
});
test('a quick double swipe = two lanes only as two separate gestures', () => {
  assert.deepEqual(play([...drag(1, 300, 500, 0, 0.06, 4), ...drag(2, 300, 500, 0.1, 0.06, 4)]), ['right', 'right']);
});
test('taps: quick tap fires on release, a held press fires once, tiny wobbles are taps not swipes', () => {
  assert.deepEqual(play([['down', 1, 600, 300, 0], ['up', 1, 600, 300, 0.07]]), ['right']);
  assert.deepEqual(play([['down', 1, 100, 300, 0], ['tick', 1, 0, 0, 0.13], ['tick', 1, 0, 0, 0.5], ['up', 1, 100, 300, 0.6]]), ['left']);
  assert.deepEqual(play([['down', 1, 100, 300, 0], ['move', 1, 108, 304, 0.03], ['up', 1, 108, 304, 0.06]]), ['left']);
});
test('vertical or sub-threshold moves never change lanes', () => {
  assert.deepEqual(play([['down', 1, 100, 300, 0], ['move', 1, 110, 380, 0.05], ['up', 1, 110, 380, 0.08]]), []);
  assert.deepEqual(play([['down', 1, 100, 300, 0], ['move', 1, 100 + CFG.SWIPE_PX - 1, 300, 0.05], ['up', 1, 100 + CFG.SWIPE_PX - 1, 300, 0.08]]), []);
});
