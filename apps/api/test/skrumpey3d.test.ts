import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { Server } from "node:http";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createSkrumpeyVerifier, loadSkrumpeySim, SKRUMPEY_CURRENT_VERSION, skrumpeySeed } from "../src/skrumpeyVerification.ts";

type Sim = ReturnType<typeof loadSkrumpeySim> & {
  botInput(s: SimState): number;
  BIOMES: string[];
  makeWorld(seed: number): World;
  P: { laneStages: { len: number }[]; duneBadKeep: number; badKeep: number };
};
type SimState = {
  over: boolean; tick: number; x: number; y: number; vx: number; vy: number; ground: boolean; air: number;
  phase: string; nimbus: boolean; inputs: number[]; W: World;
};
type World = {
  lanes: { stages: unknown[]; x0: number; x1: number }[];
  nimbus: { x0: number; x1: number }[];
  inGap(x: number): unknown;
  chunks: { biome: number; kind: string; x0: number; x1: number }[];
  ensure(x: number): void;
  h(x: number): number;
  biomeAt(x: number): number;
  nimbusAt(x: number): unknown;
};
const sim = () => loadSkrumpeySim("3d.1.0") as unknown as Sim;

test("3d preview is its own rules version and does not replace the live raid sim", () => {
  assert.equal(SKRUMPEY_CURRENT_VERSION, "1.2.0");
  assert.equal(sim().RULES_VERSION, "3d.1.0");
  assert.equal(loadSkrumpeySim("1.2.0").RULES_VERSION, "1.2.0");
  assert.equal(loadSkrumpeySim("1.1.0").RULES_VERSION, "1.1.0");
  assert.equal(sim().P.laneStages.length, 3);
  assert.ok(sim().P.duneBadKeep < sim().P.badKeep);
});

test("3d world keeps 3-stage sprints and a clouds nimbus gorge between hill beats", () => {
  const s = sim();
  const W = s.makeWorld(1); W.ensure(4000);
  assert.ok(W.lanes.length >= 4);
  for (const lane of W.lanes.slice(0, 4)) assert.equal(lane.stages.length, 3);
  assert.ok(W.nimbus.length >= 1);
  const order = W.chunks.slice(0, 9).map(c => `${s.BIOMES[c.biome]}:${c.kind}`);
  assert.equal(order[0], "meadow:start");
  assert.ok(order.includes("dunes:bigRamp"));
  assert.ok(order.includes("clouds:gap"));
  const n = W.nimbus[0];
  assert.equal(s.BIOMES[W.biomeAt((n.x0 + n.x1) / 2)], "clouds");
  assert.ok(W.inGap(n.x0 + 8), "nimbus starts over the gorge, not the approach hill");
});

test("biome verbs change flight and bad landings, and replays stay deterministic", () => {
  const s = sim();
  const W = s.makeWorld(1); W.ensure(4000);
  const at = (name: string, kind?: string) => {
    const c = W.chunks.find(ch => s.BIOMES[ch.biome] === name && (kind ? ch.kind === kind : ch.kind !== "lane"));
    if (!c) throw new Error(name);
    return (c.x0 + c.x1) / 2;
  };
  const drop = (x: number, press: number) => {
    const st = s.create(1) as SimState;
    st.phase = "run"; st.x = x; st.y = st.W.h(x) + 36; st.vx = 24; st.vy = 8; st.ground = false; st.air = 30;
    for (let i = 0; i < 50 && !st.ground; i++) s.step(st, press);
    return st.y;
  };
  assert.ok(drop(at("crystal"), 0) > drop(at("meadow"), 0) + 8, "crystal night hangs longer than the meadow");
  const nx = (W.nimbus[0].x0 + W.nimbus[0].x1) / 2;
  const overGorge = (x: number, press: number) => {
    const st = s.create(1) as SimState;
    const gap = st.W.inGap(x) as { x0: number } | null;
    const lip = gap ? st.W.h(gap.x0 - 1) : st.W.h(x);
    st.phase = "run"; st.x = x; st.y = lip + 22; st.vx = 24; st.vy = 6; st.ground = false; st.air = 30;
    for (let i = 0; i < 40 && !st.ground; i++) s.step(st, press);
    return st.y;
  };
  assert.ok(overGorge(nx, 0) > overGorge(nx, 1) + 10, "nimbus release floats and the hold dive-bombs");
  const slam = (x: number) => {
    const st = s.create(1) as SimState;
    st.phase = "run"; st.x = x; st.y = st.W.h(x) + 0.4; st.vx = 6; st.vy = -50; st.ground = false; st.air = 40;
    s.step(st, 1);
    return st;
  };
  const meadow = slam(at("meadow", "rollers"));
  const dunes = slam(at("dunes", "bigRamp"));
  assert.equal((meadow as unknown as { lastLanding: string }).lastLanding, "bad");
  assert.equal((dunes as unknown as { lastLanding: string }).lastLanding, "bad");
  assert.ok(dunes.vx < meadow.vx, "dunes keep less speed after a bad landing");
  const seeded = s.create(42) as SimState;
  let input = "";
  while (!seeded.over && input.length < 8000) {
    const b = s.botInput(seeded) | 0;
    input += String.fromCharCode(48 + (b & 15));
    s.step(seeded, b);
  }
  const again = s.create(42) as SimState;
  for (const c of input) s.step(again, c.charCodeAt(0) - 48);
  const replay = s.result(again, "replay") as { rules: string; score: number; distance: number; replay: string };
  const bot = s.result(seeded, "replay") as { rules: string; score: number; distance: number; replay: string };
  assert.equal(replay.score, bot.score);
  assert.equal(replay.distance, bot.distance);
  assert.equal(replay.replay, bot.replay);
  assert.equal(replay.rules, "3d.1.0");
});

test("a 3d.1.0 replay verifies on its own version and cannot score a live session", async () => {
  const s = sim();
  const issued = "skrumpey-3d-preview-seed";
  const seed = skrumpeySeed(issued);
  const st = s.create(seed) as SimState;
  let input = "";
  while (!st.over && input.length < 8000) { const b = s.botInput(st) | 0; input += String.fromCharCode(48 + (b & 15)); s.step(st, b); }
  const r = s.result(st, "bot") as Record<string, number>;
  const startedAt = new Date(Date.now() - input.length * (1000 / 60) - 5_000).toISOString();
  const cfg = { runId: "r3d", gameId: "skrumpey-slide", gameVersion: "3d.1.0", mode: "ranked", objective: "score", seed: issued, startedAt } as unknown as GameRunConfig;
  const res = { runId: "r3d", gameId: "skrumpey-slide", gameVersion: "3d.1.0", mode: "ranked", objective: "score", result: "completed",
    primaryMetric: r.score, startedAt, finishedAt: new Date().toISOString(),
    secondaryMetrics: { distance: r.distance, bestCombo: r.bestCombo, perfects: r.perfects, collectibles: r.gems, kills: r.kills, hits: r.hits, falls: r.falls, rescued: r.rescued, trainBest: r.trainBest, ticks: r.endTick },
    proof: { v: 1, rules: "3d.1.0", seed, input } } as unknown as GameRunResult;
  const v = createSkrumpeyVerifier();
  assert.deepEqual(await v.verify(cfg, res), { valid: true });
  assert.match((await v.verify({ ...cfg, gameVersion: "1.1.0" } as GameRunConfig, { ...res, gameVersion: "1.1.0" } as GameRunResult)).reason!, /rules 3d\.1\.0/);
  assert.match((await v.verify({ ...cfg, gameVersion: "1.2.0" } as GameRunConfig, { ...res, gameVersion: "1.2.0" } as GameRunResult)).reason!, /rules 3d\.1\.0/);
});

test("phone hold survives a dropped pointer capture and still hops in a lane", () => {
  const require = createRequire(import.meta.url);
  const { create } = require("../../../cartridges/skrumpey-slide/v3d/touch-input.js") as { create: Function };
  const el = () => {
    const ls = new Map<string, Function[]>();
    return { addEventListener(type: string, fn: Function) { const list = ls.get(type) || []; list.push(fn); ls.set(type, list); },
      emit(type: string, e: Record<string, unknown>) { for (const fn of ls.get(type) || []) fn({ preventDefault() {}, cancelable: true, pointerType: "touch", button: 0, currentTarget: this, ...e }); },
      setPointerCapture() { throw new Error("mouse only"); } };
  };
  const canvas = el(), dive = el(), jump = el(), target = el();
  let playing = true, lane = false; const jumps: string[] = []; const lanes: number[] = [];
  const input = create({ canvas, dive, jump, eventTarget: target, isPlaying: () => playing, isLane: () => lane, onJump: () => jumps.push("jump"), onLane: (b: number) => lanes.push(b), onActivate: () => {} });
  canvas.emit("pointerdown", { pointerId: 1, clientX: 40, clientY: 200 });
  assert.equal(input.isHeld(), true);
  target.emit("lostpointercapture", { pointerId: 1, clientX: 40, clientY: 200 });
  assert.equal(input.isHeld(), true, "iOS dropping capture must not cancel the dive hold");
  target.emit("pointerup", { pointerId: 1, clientX: 40, clientY: 200 });
  assert.equal(input.isHeld(), false);
  dive.emit("pointerdown", { pointerId: 2, clientX: 30, clientY: 700 });
  assert.equal(input.isHeld(), true, "the DIVE button holds too");
  target.emit("pointerup", { pointerId: 2, clientX: 30, clientY: 700 });
  lane = true;
  canvas.emit("pointerdown", { pointerId: 3, clientX: 180, clientY: 400 });
  target.emit("pointermove", { pointerId: 3, clientX: 80, clientY: 404 });
  assert.deepEqual(lanes, [4]);
  assert.equal(input.isHeld(), false);
  target.emit("pointerup", { pointerId: 3, clientX: 70, clientY: 404 });
  assert.deepEqual(jumps, []);
  canvas.emit("pointerdown", { pointerId: 4, clientX: 180, clientY: 400 });
  target.emit("pointerup", { pointerId: 4, clientX: 184, clientY: 406 });
  assert.deepEqual(jumps, ["jump"]);
  jump.emit("pointerdown", { pointerId: 5, clientX: 300, clientY: 700 });
  assert.deepEqual(jumps, ["jump", "jump"]);
  playing = false;
  assert.equal(input.isHeld(), false);
});

test("preview path is served beside the frozen raid cartridges", async () => {
  const { createCartridgeServer } = await import("../../../scripts/cartridges.mjs") as { createCartridgeServer: () => Server };
  const server = createCartridgeServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const preview = await fetch(`${origin}/skrumpey-slide/v3d/`);
    assert.equal(preview.status, 200);
    const previewHtml = await preview.text();
    assert.match(previewHtml, /Skrumpey Slide 3D/);
    assert.match(previewHtml, /src="touch-input\.js"/);
    assert.match(previewHtml, /low-power/);
    const touchJs = await (await fetch(`${origin}/skrumpey-slide/v3d/touch-input.js`)).text();
    assert.match(touchJs, /pointerType==='mouse'/);
    assert.doesNotMatch(touchJs, /lostpointercapture/);
    const livePage = await (await fetch(`${origin}/skrumpey-slide/v/1.1.0/`)).text();
    assert.match(livePage, /src="touch-input\.js"/);
    assert.doesNotMatch(livePage, /low-power/);
    const previewSim = await (await fetch(`${origin}/skrumpey-slide/v3d/sim.js`)).text();
    assert.match(previewSim, /RULES_VERSION='3d\.1\.0'/);
    const live = await (await fetch(`${origin}/skrumpey-slide/v/1.1.0/sim.js`)).text();
    assert.match(live, /RULES_VERSION='1\.1\.0'/);
    assert.equal((await fetch(`${origin}/skrumpey-slide/v/1.2.0/sim.js`)).status, 200);
    assert.equal((await fetch(`${origin}/skrumpey-slide/v/1.3.0/`)).status, 404);
    const disk = await readFile(new URL("../../../cartridges/skrumpey-slide/releases/1.1.0/sim.js", import.meta.url), "utf8");
    assert.equal(live.replaceAll("\r\n", "\n"), disk.replaceAll("\r\n", "\n"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
