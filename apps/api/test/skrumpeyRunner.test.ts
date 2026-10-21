import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSkrumpeySim } from "../src/skrumpeyVerification.ts";

type Lane = { x0: number; x1: number; stages: { x0: number; x1: number; speed: number; density: number }[] };
type Ent = { type: string; x: number; lane?: number; stage?: number; dead: boolean };
type S = { over: boolean; tick: number; x: number; vx: number; vy: number; inLane: Lane | null; laneStage: number; laneStagesBest: number; daylight: number;
  W: { lanes: Lane[]; ents: Ent[]; ensure(x: number): void } };
type Sim = { create(seed: number): S; step(s: S, b: number): void; botInput(s: S): number; dailySeed(v: string): number; result(s: S, m: string): Record<string, number | string>;
  RULES_VERSION: string; P: Record<string, unknown> };
const sim = () => loadSkrumpeySim("1.1.0") as unknown as Sim;

function botRun(simv: Sim, seed: number) {
  const s = simv.create(seed); let laneTicks = 0; const speeds: number[][] = [[], [], []];
  while (!s.over && s.tick < 36_000) { simv.step(s, simv.botInput(s)); if (s.inLane) { laneTicks++; speeds[s.laneStage].push(Math.hypot(s.vx, s.vy)); } }
  return { s, laneTicks, speeds, r: simv.result(s, "t") };
}

test("Skrumpey Slide 1.1.0 stamps its rules version", () => {
  assert.equal(sim().RULES_VERSION, "1.1.0");
  assert.equal((loadSkrumpeySim("1.0.0") as unknown as Sim).RULES_VERSION, undefined);
});

test("lane sprints are three stages, longer than 1.0.0, with rising speed and density", () => {
  const s = sim().create(sim().dailySeed("runner-shape")); s.W.ensure(4000);
  const old = (loadSkrumpeySim("1.0.0") as unknown as Sim).create(sim().dailySeed("runner-shape")); old.W.ensure(4000);
  assert.ok(s.W.lanes.length >= 2);
  for (const l of s.W.lanes) {
    assert.equal(l.stages.length, 3);
    assert.ok(l.x1 - l.x0 > 2 * (old.W.lanes[0].x1 - old.W.lanes[0].x0), "sprint is more than twice as long");
    for (let i = 1; i < 3; i++) { assert.ok(l.stages[i].speed > l.stages[i - 1].speed); assert.ok(l.stages[i].density > l.stages[i - 1].density); }
    const gates = s.W.ents.filter((e) => e.type === "gate" && e.x >= l.x0 - 10 && e.x <= l.x1 + 10);
    assert.equal(JSON.stringify(gates.map((g) => g.stage)), "[1,2]");
  }
});

test("new patterns appear: full-width hurdles, corridors, slaloms and splits", () => {
  let hurdle = 0, split = 0, corridor = 0;
  for (let k = 0; k < 12; k++) {
    const s = sim().create(sim().dailySeed("pat-" + k)); s.W.ensure(4000);
    const rows = new Map<number, Set<number>>();
    for (const e of s.W.ents) if (e.type === "barrier") { const key = Math.round(e.x * 100); (rows.get(key) ?? rows.set(key, new Set()).get(key)!).add(e.lane!); }
    for (const set of rows.values()) if (set.size === 3) hurdle++;
    const mids = [...rows.entries()].filter(([, v]) => v.size === 1 && v.has(0)).map(([x]) => x).sort((a, b) => a - b);
    for (let i = 2; i < mids.length; i++) if (Math.abs(mids[i] - mids[i - 2] - 2400) <= 2) split++;
    const twos = [...rows.entries()].filter(([, v]) => v.size === 2).map(([x]) => x).sort((a, b) => a - b);
    for (let i = 2; i < twos.length; i++) if (Math.abs(twos[i] - twos[i - 2] - 2400) <= 2) corridor++;
  }
  assert.ok(hurdle > 0 && split > 0 && corridor > 0, JSON.stringify({ hurdle, split, corridor }));
});

test("bot clears the sprint at each stage's target speed and the run stays a reasonable length", () => {
  const simv = sim(); let totalTicks = 0, lane = 0;
  for (let k = 0; k < 10; k++) {
    const { s, laneTicks, speeds } = botRun(simv, simv.dailySeed("len-" + k));
    totalTicks += s.tick; lane += laneTicks;
    if (s.laneStagesBest === 3) {
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
      assert.ok(med(speeds[0]) < med(speeds[1]) && med(speeds[1]) < med(speeds[2]), JSON.stringify(speeds.map(med)));
    }
  }
  const runSec = totalTicks / 10 / 60, laneSec = lane / 10 / 60;
  assert.ok(runSec > 55 && runSec < 100, `run ${runSec}s`);
  assert.ok(laneSec > 18, `lane ${laneSec}s`);
});

test("1.1.0 runs are deterministic: the same inputs replay to the same result", () => {
  const simv = sim(); const { s, r } = botRun(simv, 12345);
  const input = (s as unknown as { inputs: number[] }).inputs;
  const sv = sim();
  const t = sv.create(12345); for (const b of input) sv.step(t, b);
  assert.equal(JSON.stringify(sv.result(t, "t")), JSON.stringify(r));
});
