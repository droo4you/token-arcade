import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { GameRecord, GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";
import { createPowderlineVerifier, loadPowderlineSim, POWDERLINE_RULESET, powderlineSeed } from "../src/powderlineVerification.ts";
import { AdapterRegistry } from "../src/verifiers.ts";

const sim = loadPowderlineSim();
const issued = "powderline-passport-seed";
const played = (() => {
  const state = sim.create(powderlineSeed(issued));
  let input = "";
  while (!state.over) {
    const code = (sim as unknown as { botInput(s: unknown): number }).botInput(state);
    input += sim.ALPHA[code];
    sim.step(state, code);
  }
  return { input, result: sim.result(state), seed: powderlineSeed(issued) };
})();

const startedAt = new Date(Date.now() - played.input.length * (1000 / 60) - 5_000).toISOString();
const config = {
  runId: "powder-1", gameId: "powderline", gameVersion: "1.0.0", mode: "ranked", objective: "score",
  seed: issued, rules: { ruleset: POWDERLINE_RULESET }, startedAt,
} as GameRunConfig;

function result(over: Partial<GameRunResult> = {}, proof?: unknown): GameRunResult {
  const r = played.result;
  return {
    runId: "powder-1", gameId: "powderline", gameVersion: "1.0.0", mode: "ranked", objective: "score",
    seed: issued, result: "completed", primaryMetric: r.score, startedAt, finishedAt: new Date().toISOString(),
    secondaryMetrics: {
      distance: r.distance, trickPoints: r.trickPoints, bestCombo: r.bestCombo,
      crashes: r.crashes, boosts: r.boosts, ticks: r.ticks,
    },
    proof: proof === undefined ? { v: 1, rules: "1.0.0", ruleset: POWDERLINE_RULESET, seed: played.seed, input: played.input } : proof,
    ...over,
  } as GameRunResult;
}

const verifier = createPowderlineVerifier();

test("Powderline: the same seed and input reproduces one score", async () => {
  const again = sim.create(played.seed);
  for (const ch of played.input) sim.step(again, sim.ALPHA.indexOf(ch));
  assert.deepEqual(sim.result(again), played.result);
  assert.ok(played.result.score > 1000);
  assert.deepEqual(await verifier.verify(config, result()), { valid: true });
});

test("Powderline: forged score, details, seed, padding and a short log are rejected", async () => {
  assert.equal((await verifier.verify(config, result({ primaryMetric: played.result.score + 1 }))).valid, false);
  const forged = result();
  forged.secondaryMetrics = { ...forged.secondaryMetrics, crashes: 40 };
  assert.match((await verifier.verify(config, forged)).reason ?? "", /crashes/);
  assert.match((await verifier.verify(config, result({}, { v: 1, rules: "1.0.0", ruleset: POWDERLINE_RULESET, seed: played.seed ^ 1, input: played.input }))).reason ?? "", /issued seed/);
  assert.match((await verifier.verify({ ...config, seed: "other-session" } as GameRunConfig, result())).reason ?? "", /issued seed/);
  assert.match((await verifier.verify(config, result({}, { v: 1, rules: "1.0.0", ruleset: POWDERLINE_RULESET, seed: played.seed, input: played.input + "0" }))).reason ?? "", /after the run ended/);
  assert.match((await verifier.verify(config, result({}, { v: 1, rules: "1.0.0", ruleset: POWDERLINE_RULESET, seed: played.seed, input: played.input.slice(0, -40) }))).reason ?? "", /before the run was over/);
  assert.equal((await verifier.verify(config, result({}, { v: 1, rules: "9.9.9", ruleset: POWDERLINE_RULESET, seed: played.seed, input: played.input }))).valid, false);
  assert.equal((await verifier.verify({ ...config, rules: { ruleset: "nope" } } as GameRunConfig, result())).valid, false);
});

test("Powderline adapter is registered for Passport Play", () => {
  const ready = new AdapterRegistry().get("powderline");
  assert.equal(ready?.rankedRules?.ruleset, POWDERLINE_RULESET);
  assert.ok(ready?.verifier);
});

test("Powderline Passport Play: issued seed is replayed, and ties break on distance then crashes", async () => {
  const store = new ArcadeStore(":memory:", false);
  const now = new Date().toISOString();
  store.saveGame({
    manifest: {
      id: "powderline", name: "Powderline", description: "Ride the fall line.", version: "1.0.0", developer: "droo4you",
      adapterId: "powderline", skeletonId: "powderline", supportedModes: ["free", "ranked"], supportedObjectives: ["score"],
      communityOptional: true, minicoinOptional: true,
      verifier: { kind: "replay", description: "Server replays the issued seed and 60 Hz input log." },
      playGuide: {
        free: "Local runs. The host seed is ignored.",
        ranked: "One issued seed. Highest score wins.",
        scoring: "Distance in meters plus trick points times the combo.",
        tieBreak: "Longer distance, then fewer crashes, then acceptance time and run id.",
      },
    },
    status: "published", createdAt: now, publishedAt: now,
  } as GameRecord);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (auth: string, path: string, body?: unknown) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer local-demo:${auth}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  try {
    const issuedRun = await request("powder-player", "/api/runs", { gameId: "powderline", mode: "ranked" });
    assert.equal(issuedRun.status, 201, JSON.stringify(issuedRun.body));
    const session = (issuedRun.body as { run: GameRunConfig }).run;
    assert.equal(session.rules?.ruleset, POWDERLINE_RULESET);
    assert.notEqual(powderlineSeed(session.seed!), played.seed);
    const live = sim.create(powderlineSeed(session.seed!));
    let input = "";
    while (!live.over) {
      const code = (sim as unknown as { botInput(s: unknown): number }).botInput(live);
      input += sim.ALPHA[code];
      sim.step(live, code);
    }
    const outcome = sim.result(live);
    session.startedAt = new Date(Date.now() - Math.ceil(input.length * 1000 / 60) - 3_000).toISOString();
    store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(session), session.runId);
    const proof = { v: 1, rules: "1.0.0", ruleset: POWDERLINE_RULESET, seed: powderlineSeed(session.seed!), input };
    const body = {
      gameId: session.gameId, gameVersion: session.gameVersion, runId: session.runId, mode: session.mode,
      objective: session.objective, seed: session.seed, primaryMetric: outcome.score,
      secondaryMetrics: {
        distance: outcome.distance, trickPoints: outcome.trickPoints, bestCombo: outcome.bestCombo,
        crashes: outcome.crashes, boosts: outcome.boosts, ticks: outcome.ticks,
      },
      proof, result: "completed", startedAt: session.startedAt, finishedAt: new Date().toISOString(),
    };
    const forged = await request("powder-player", `/api/runs/${session.runId}/complete`, { ...body, primaryMetric: outcome.score + 50 });
    assert.equal(forged.status, 400);
    assert.equal((forged.body as { error: { code: string } }).error.code, "UNVERIFIED_RESULT");
    const accepted = await request("powder-player", `/api/runs/${session.runId}/complete`, body);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal((accepted.body as { verified: boolean }).verified, true);

    const rules = { ruleset: POWDERLINE_RULESET };
    const insert = (runId: string, playerId: string, score: number, distance: number, crashes: number, acceptedAt: string) => {
      const row = {
        gameId: "powderline", gameVersion: "1.0.0", runId, mode: "ranked", objective: "score", seed: "tie",
        primaryMetric: score, secondaryMetrics: { distance, trickPoints: score - distance, bestCombo: 1, crashes, boosts: 0, ticks: 10 },
        result: "completed", startedAt: acceptedAt, finishedAt: acceptedAt, rules,
      };
      store.db.prepare("INSERT INTO accepted_results (run_id,player_id,game_id,mode,raid_id,metric,accepted_at,json) VALUES (?,?,?,?,?,?,?,?)")
        .run(runId, playerId, "powderline", "ranked", null, score, acceptedAt, JSON.stringify(row));
    };
    insert("tie-long", "player-long", 1000, 900, 4, "2026-11-01T00:00:02.000Z");
    insert("tie-clean", "player-clean", 1000, 900, 1, "2026-11-01T00:00:03.000Z");
    insert("tie-short", "player-short", 1000, 700, 0, "2026-11-01T00:00:01.000Z");
    insert("tie-higher", "player-higher", 1200, 100, 9, "2026-11-01T00:00:04.000Z");
    const board = await request("powder-player", "/api/leaderboards/powderline");
    const ids = ((board.body as { entries: { playerId: string; primaryMetric: number }[] }).entries).map((entry) => entry.playerId);
    const higher = ids.indexOf("player-higher");
    const clean = ids.indexOf("player-clean");
    const long = ids.indexOf("player-long");
    const short = ids.indexOf("player-short");
    assert.ok(higher >= 0 && higher < clean && clean < long && long < short);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
