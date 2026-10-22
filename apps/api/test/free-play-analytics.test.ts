import assert from "node:assert/strict";
import { test } from "node:test";
import { distribution, freePlayReport, summarizeFreePlay, type FreePlaySample } from "../src/freePlayAnalytics.ts";
import { ArcadeStore } from "../src/store.ts";

const sample: FreePlaySample = { runId: "one", gameId: "skip-to-10k", gameVersion: "1", objective: "distance", primaryMetric: 10, secondaryMetrics: { deaths: 0 }, result: "completed", startedAt: "2026-10-21T00:00:00Z", finishedAt: "2026-10-21T00:01:00Z", audience: "guest", receivedAt: "2026-10-21T00:01:00Z" };
test("analytics separates scoring versions and objectives and excludes missing metrics", () => {
  const groups = summarizeFreePlay([sample, { ...sample, runId: "two", audience: "account", primaryMetric: 30, secondaryMetrics: {}, result: "failed" }, { ...sample, gameVersion: "2", primaryMetric: 999 }, { ...sample, objective: "score" }]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].primary.median, 20);
  assert.equal(groups[0].primary.p90, 28);
  assert.equal(groups[0].metrics.deaths?.count, 1);
  assert.equal(groups[0].metrics.deaths?.median, 0);
  assert.equal(groups[0].guests, 1); assert.equal(groups[0].accounts, 1);
  assert.equal(groups[0].completed, 1); assert.equal(groups[0].failed, 1);
  assert.equal(groups[0].durationSeconds?.median, 60);
  assert.equal(distribution([]), null);
});
test("report uses receipt time, excludes old rows, and omits player identifiers", () => {
  const store = new ArcadeStore(":memory:", true);
  try {
    const insert = store.db.prepare("INSERT INTO free_play_summaries VALUES (?,?,?,?,?,?)");
    insert.run("one", sample.gameId, "private-player", "private-guest", new Date().toISOString(), JSON.stringify(sample));
    insert.run("old", sample.gameId, null, "private-guest", "2020-01-01T00:00:00Z", JSON.stringify({ ...sample, runId: "old" }));
    const report = freePlayReport(store, 7);
    assert.equal(report.total, 1); assert.equal(report.sampled, 1); assert.equal(report.truncated, false);
    assert.equal(report.groups[0].accounts, 1);
    assert.ok(!JSON.stringify(report).includes("private-player")); assert.ok(!JSON.stringify(report).includes("private-guest"));
  } finally { store.close(); }
});
