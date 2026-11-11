import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const gestures = createRequire(import.meta.url)('../releases/1.0.0/src/input.js').create();

test('an airborne swipe fires one trick and then locks', () => {
  gestures.clear();
  gestures.down(1, 100, 200);
  assert.equal(gestures.move(1, 112, 188, true), null);
  assert.equal(gestures.move(1, 140, 190, true), 'right');
  assert.equal(gestures.move(1, 180, 160, true), null);
  assert.equal(gestures.up(1, true), null);
});

test('swipe direction follows the dominant axis', () => {
  gestures.clear();
  gestures.down(1, 80, 200);
  assert.equal(gestures.move(1, 70, 150, true), 'up');
  gestures.clear();
  gestures.down(2, 80, 100);
  assert.equal(gestures.move(2, 90, 150, true), 'down');
  gestures.clear();
  gestures.down(3, 80, 100);
  assert.equal(gestures.move(3, 40, 110, true), 'left');
});

test('a short airborne tap is a Method and a ground drag carves', () => {
  gestures.clear();
  gestures.down(1, 40, 40);
  assert.equal(gestures.up(1, true), 'tap');
  gestures.down(1, 200, 300);
  assert.equal(gestures.move(1, 230, 304, false), null);
  assert.equal(gestures.steer(), 1);
  gestures.down(2, 20, 300);
  gestures.move(2, 0, 300, false);
  assert.equal(gestures.up(1, false), null);
  assert.equal(gestures.steer(), -1);
  gestures.cancel(2);
  assert.equal(gestures.steer(), 0);
});

test('a ground tap does not invent a trick', () => {
  gestures.clear();
  gestures.down(7, 10, 10);
  assert.equal(gestures.up(7, false), null);
});
