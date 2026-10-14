import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { create } = createRequire(import.meta.url)('../../../cartridges/skrumpey-slide/touch-input.js');

function setup() {
  class Surface extends EventTarget { setPointerCapture() {} }
  const canvas = new Surface(), dive = new Surface(), jump = new Surface(), eventTarget = new Surface();
  let lane = false, jumps = 0;
  const lanes: number[] = [];
  const input = create({ canvas, dive, jump, eventTarget, isPlaying: () => true, isLane: () => lane,
    onJump: () => jumps++, onLane: (bits: number) => lanes.push(bits), onActivate() {} });
  function send(target: EventTarget, type: string, id: number, x = 100, y = 100) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
    target.dispatchEvent(event);
  }
  return { canvas, dive, jump, eventTarget, input, send, lanes, get jumps() { return jumps; }, set lane(v: boolean) { lane = v; } };
}

test('runner swipe changes lane without sending dive or jump; tap hops on release', () => {
  const s = setup(); s.lane = true;
  s.send(s.canvas, 'pointerdown', 1);
  assert.equal(s.input.isHeld(), false); assert.equal(s.jumps, 0);
  s.send(s.eventTarget, 'pointermove', 1, 160);
  s.send(s.eventTarget, 'pointerup', 1, 180);
  assert.deepEqual(s.lanes, [8]); assert.equal(s.jumps, 0);
  s.send(s.canvas, 'pointerdown', 2);
  s.send(s.eventTarget, 'pointerup', 2);
  assert.equal(s.jumps, 1);
});

test('jump uses its own pointer and cannot cancel another finger holding dive', () => {
  const s = setup();
  s.send(s.dive, 'pointerdown', 1);
  s.send(s.jump, 'pointerdown', 2);
  s.send(s.eventTarget, 'pointermove', 2, 200);
  s.send(s.eventTarget, 'pointerup', 2, 200);
  assert.equal(s.jumps, 1); assert.equal(s.input.isHeld(), true); assert.deepEqual(s.lanes, []);
  s.send(s.eventTarget, 'pointercancel', 1);
  assert.equal(s.input.isHeld(), false);
});

test('unrelated fingers cannot swipe and cancelled runner touches never hop', () => {
  const s = setup(); s.lane = true;
  s.send(s.canvas, 'pointerdown', 1);
  s.send(s.eventTarget, 'pointermove', 2, 200);
  s.send(s.eventTarget, 'pointercancel', 1);
  assert.deepEqual(s.lanes, []); assert.equal(s.jumps, 0);
  s.lane = false; s.send(s.canvas, 'pointerdown', 3);
  assert.equal(s.input.isHeld(), true);
  s.input.reset(); assert.equal(s.input.isHeld(), false);
});
