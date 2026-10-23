import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const sim = createRequire(import.meta.url)('../../../cartridges/skrumpey-slide/sim.js');

test('nearby buddy is rescued even when its template emits distant hazards first', () => {
  const regressionSim = createRequire(import.meta.url)('../../../cartridges/skrumpey-slide/releases/1.0.0/sim.js');
  const s = regressionSim.create(1);
  s.W.ensure(1500);
  const buddy = s.W.ents.find((e: { type: string; x: number }) => e.type === 'buddy' && e.x === 253);
  assert.ok(buddy, 'seeded plateau has a buddy before its spikes');
  s.x = buddy.x; s.y = s.W.h(s.x); s.phase = 'run'; s.vx = 13; s.vy = 0; s.ground = true;
  regressionSim.step(s, 1);
  assert.equal(buddy.dead, true);
  assert.equal(s.rescued, 1);
  assert.deepEqual(s.train, [buddy.bi]);
});

test('entity spawn order stays spatially sorted as later chunks are generated', () => {
  for (const seed of [1, 2, 42, 12345]) {
    const world = sim.makeWorld(seed);
    for (const distance of [800, 1600, 3200, 6400]) {
      world.ensure(distance);
      const entities = world.ents;
      for (let i = 1; i < entities.length; i++) assert.ok(entities[i - 1].x0 <= entities[i].x0);
    }
  }
});
