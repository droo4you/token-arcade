import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { GameRecord, GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";
import { loadSkrumpeySim, skrumpeySeed } from "../src/skrumpeyVerification.ts";

test("Skrumpey Slide Passport Play: issued seed -> server replay -> standings; forged and reused results rejected", async () => {
  const store = new ArcadeStore(":memory:", false);
  const now = new Date().toISOString();
  // Published the way the creator flow publishes it (see scripts/publish-skrumpey-local.sh).
  store.saveGame({ manifest: { id: "skrumpey-slide", name: "Skrumpey Slide", description: "test", version: "1.0.0", developer: "droo4you",
    adapterId: "skrumpey-slide", skeletonId: "skrumpey-slide", supportedModes: ["free", "ranked", "raid"], supportedObjectives: ["score"],
    communityOptional: true, minicoinOptional: true, verifier: { kind: "replay", description: "Server replays sim.js input log" } },
    status: "published", createdAt: now, publishedAt: now, creatorId: "local-demo:droober" } as GameRecord);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { authorization: "Bearer local-demo:slide-player", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const issued = await request("/api/runs", { gameId: "skrumpey-slide", mode: "ranked" });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    const config = issued.body.run as GameRunConfig;
    const sim = loadSkrumpeySim() as ReturnType<typeof loadSkrumpeySim> & { botInput(s: unknown): number };
    const s = sim.create(skrumpeySeed(config.seed!));
    let input = "";
    while (!s.over) { const b = sim.botInput(s) | 0; input += String.fromCharCode(48 + b); sim.step(s, b); }
    const r = sim.result(s, "bot") as Record<string, number>;
    config.startedAt = new Date(Date.now() - Math.ceil(input.length * 1000 / 60) - 3_000).toISOString();
    store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(config), config.runId);
    const secondaryMetrics = { distance: r.distance, bestCombo: r.bestCombo, perfects: r.perfects, collectibles: r.gems, kills: r.kills, hits: r.hits, falls: r.falls, rescued: r.rescued, trainBest: r.trainBest, ticks: r.endTick };
    const result = { gameId: config.gameId, gameVersion: config.gameVersion, runId: config.runId, mode: config.mode, objective: config.objective,
      seed: config.seed, primaryMetric: r.score, secondaryMetrics, proof: { v: 1, seed: skrumpeySeed(config.seed!), input },
      result: "completed", startedAt: config.startedAt, finishedAt: new Date().toISOString() } as GameRunResult;
    const forged = await request(`/api/runs/${config.runId}/complete`, { ...result, primaryMetric: r.score * 2 });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error.code, "UNVERIFIED_RESULT");
    const accepted = await request(`/api/runs/${config.runId}/complete`, result);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.verified, true);
    const standings = await request("/api/leaderboards/skrumpey-slide");
    assert.equal(standings.body.entries[0].primaryMetric, r.score);
    const reused = await request(`/api/runs/${config.runId}/complete`, result);
    assert.equal(reused.body.error.code, "RUN_CONSUMED");
    // The same proof cannot be replayed into a fresh session: that session has a different issued seed.
    const second = (await request("/api/runs", { gameId: "skrumpey-slide", mode: "ranked" })).body.run as GameRunConfig;
    second.startedAt = config.startedAt;
    store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(second), second.runId);
    const replayed = await request(`/api/runs/${second.runId}/complete`, { ...result, runId: second.runId, seed: second.seed });
    assert.equal(replayed.status, 400);
    assert.match(replayed.body.error.message, /issued seed/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
