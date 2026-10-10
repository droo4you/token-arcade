import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { buyBounceSeed } from "../src/gameVerification.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";

const { makeTrial } = createRequire(import.meta.url)("../../../cartridges/emonad-cabinet/tools/harness.js") as {
  makeTrial(width: number, height: number): {
    run(seed: number, frames: number, frameMs: number, input: () => number): void;
    BB: { record(): Record<string, unknown>; state: { ath: number; buys: number; best: number; tickets: number; steps: number; shown: boolean } };
  };
};

test("real cartridge replays pass issued HTTP sessions and update isolated Cabinet standings", async () => {
  const store = new ArcadeStore(":memory:", false);
  // Use the production default AdapterRegistry. No verifier is stubbed or replaced.
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: "Bearer local-demo:replay-player", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
  let acceptedRuns = 0;
  try {
    for (const gameId of ["emonad-cabinet", "two-places"]) {
      const issued = await request("/api/runs", { gameId, mode: "ranked" });
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      const config = issued.body.run as GameRunConfig;
      assert.equal(config.gameId, gameId);
      assert.equal(config.gameVersion, "1.0.0");
      assert.ok(config.seed, "the API issues the simulation seed");
      let proof: unknown;
      let primaryMetric: number;
      let secondaryMetrics: Record<string, number>;
      let durationMs: number;
      if (gameId === "emonad-cabinet") {
        assert.deepEqual(config.rules, { viewportHeight: 844, viewportWidth: 390 });
        const trial = makeTrial(390, 844);
        trial.run(buyBounceSeed(config.seed!), 6_000, 16, () => 195);
        const state = trial.BB.state;
        assert.equal(state.shown, true, "native gameplay reaches its terminal screen");
        proof = trial.BB.record();
        primaryMetric = Math.round(state.ath);
        secondaryMetrics = { buys: state.buys, bestStreak: state.best, collectibles: state.tickets, ticks: state.steps };
        durationMs = state.steps * 1_000 / 120;
      } else {
        assert.deepEqual(config.rules, { level: 0 });
        const recorded = JSON.parse(readFileSync(new URL("./fixtures/twoPlacesLevel1.json", import.meta.url), "utf8")) as { v: number; tracks: number[][] };
        const ticks = recorded.tracks[0].length - 1;
        proof = recorded;
        primaryMetric = Math.round(ticks * 1_000 / 60);
        secondaryMetrics = { ticks, apples: 2, deaths: 0, levelsCompleted: 1 };
        durationMs = ticks * 1_000 / 60;
      }
      // Advance only this isolated fixture's issued start time into the past.
      // The API-issued identity, seed, rules, version and expiry remain intact;
      // production replay and timing verification run unchanged without sleeps.
      config.startedAt = new Date(Date.now() - Math.ceil(durationMs) - 3_000).toISOString();
      store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(config), config.runId);
      const result: GameRunResult = {
        gameId: config.gameId, gameVersion: config.gameVersion, runId: config.runId,
        mode: config.mode, objective: config.objective, seed: config.seed,
        primaryMetric, secondaryMetrics, proof, result: "completed",
        startedAt: config.startedAt, finishedAt: new Date().toISOString(),
      };
      const forged = await request(`/api/runs/${config.runId}/complete`, { ...result, primaryMetric: primaryMetric + 1 });
      assert.equal(forged.status, 400);
      assert.equal(forged.body.error.code, "UNVERIFIED_RESULT");
      assert.equal(store.getSession(config.runId)?.consumedAt, undefined);

      const accepted = await request(`/api/runs/${config.runId}/complete`, result);
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      assert.equal(accepted.body.verified, true);
      assert.equal(accepted.body.passport.rankedRuns, ++acceptedRuns);
      assert.equal(accepted.body.passport.bestScores[`${gameId}:${config.objective}`], primaryMetric);
      assert.ok(store.getSession(config.runId)?.consumedAt);

      const standings = await request(`/api/leaderboards/${gameId}`);
      assert.equal(standings.status, 200);
      assert.equal(standings.body.entries.length, 1);
      assert.equal(standings.body.entries[0].primaryMetric, primaryMetric);
      assert.deepEqual(standings.body.entries[0].secondaryMetrics, secondaryMetrics);
      const repeated = await request(`/api/runs/${config.runId}/complete`, result);
      assert.equal(repeated.status, 409);
      assert.equal(repeated.body.error.code, "RUN_CONSUMED");
    }
    assert.equal(store.listAcceptedResults("emonad-cabinet", "ranked").length, 1);
    assert.equal(store.listAcceptedResults("two-places", "ranked").length, 1);
    const passport = (await request("/api/me")).body.passport;
    assert.equal(passport.gamesPlayed, 2);
    assert.equal(passport.rankedRuns, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
