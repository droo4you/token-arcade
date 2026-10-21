import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import type { GameRunConfig } from "../../../packages/sdk/src/index.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";
import { createCoindleRapid, RAPID_RULES } from "../src/coindleRapid.ts";
import { COINS } from "../../../cartridges/coindle/src/lib/coins.ts";

const live = COINS.filter((coin) => !coin.retired);
const runId = "11111111-2222-3333-4444-555555555555";
const config = (rules = RAPID_RULES): GameRunConfig => ({ runId, gameId: "coindle", gameVersion: "1.0.0", mode: "ranked", objective: "coins_solved", rules,
  startedAt: new Date(0).toISOString(), expiresAt: new Date(600_000).toISOString() });

function unit(rules = RAPID_RULES) {
  let clock = 0;
  const db = new DatabaseSync(":memory:");
  const rapid = createCoindleRapid({ db, getSession: () => ({ playerId: "p", config: config(rules) }), prices: async () => ({}), now: () => clock, pick: () => 0 });
  const answer = () => (JSON.parse((db.prepare("SELECT json FROM coindle_rapid").get() as { json: string }).json) as { current: { answer: string } }).current.answer;
  return { rapid, answer, tick: (ms: number) => { clock += ms; } };
}

test("Rapid Fire: server picks, judges and times; answers never leak before a solve or miss", async () => {
  const { rapid, answer, tick } = unit();
  await assert.rejects(rapid.guess(runId, "BTC"), /Start the Rapid Fire clock/);
  const started = rapid.start(runId);
  assert.equal(started.remainingMs, 180_000);
  assert.deepEqual(rapid.start(runId).endsAt, started.endsAt, "start is idempotent: no clock reset");
  const first = answer();
  const wrong = live.find((coin) => coin.ticker !== first)!.ticker;
  const miss = await rapid.guess(runId, wrong);
  assert.equal(miss.correct, false);
  assert.equal("revealed" in miss, false);
  assert.equal(JSON.stringify(miss).includes(`"${first}"`), false, "answer not in a wrong-guess reply");
  await assert.rejects(rapid.guess(runId, wrong), /Already guessed/);
  await assert.rejects(rapid.guess(runId, "NOTACOIN"), /known, active coin/);
  const hit = await rapid.guess(runId, first);
  assert.equal(hit.correct, true); assert.equal(hit.revealed, first); assert.equal(hit.solved, 1); assert.equal(hit.totalGuesses, 2);
  assert.notEqual(answer(), first, "no repeats within a run");
  // Out of guesses: reveals and moves on, counts as unsolved.
  const second = answer();
  const others = live.filter((coin) => coin.ticker !== second).slice(0, 6);
  let last: Awaited<ReturnType<typeof rapid.guess>> | undefined;
  for (const coin of others) last = await rapid.guess(runId, coin.ticker);
  assert.equal(last!.revealed, second); assert.equal(last!.solved, 1); assert.equal(last!.totalGuesses, 8);
  const skipped = rapid.skip(runId);
  assert.equal(skipped.puzzle, 4);
  tick(180_000);
  await assert.rejects(rapid.guess(runId, answer()), /window has ended/);
  assert.throws(() => rapid.skip(runId), /window has ended/);
});

test("Rapid Fire verifier only accepts the server ledger after the window closes", async () => {
  const { rapid, answer, tick } = unit();
  rapid.start(runId);
  await rapid.guess(runId, answer());
  const result = (solved: number, guesses: number) => ({ ...config(), seed: undefined, primaryMetric: solved, secondaryMetrics: { guesses }, result: "completed" as const,
    startedAt: new Date(0).toISOString(), finishedAt: new Date(1000).toISOString(), rules: RAPID_RULES });
  assert.equal((await rapid.verifier.verify(config(), result(1, 1))).valid, false, "window still open");
  tick(179_999);
  assert.equal((await rapid.verifier.verify(config(), result(1, 1))).valid, false);
  tick(1);
  assert.equal((await rapid.verifier.verify(config(), result(2, 1))).valid, false, "inflated solves rejected");
  assert.equal((await rapid.verifier.verify(config(), result(1, 0))).valid, false, "understated guesses rejected");
  assert.equal((await rapid.verifier.verify(config(), { ...result(1, 1), objective: "guesses" })).valid, false);
  assert.deepEqual(await rapid.verifier.verify(config(), result(1, 1)), { valid: true });
  const other = unit({ format: "daily" });
  assert.throws(() => other.rapid.start(runId), /Rapid Fire rules/);
});

// ── HTTP: Passport Play board and Community Raid total ──
const store = new ArcadeStore(":memory:", true);
const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
let base = "";
before(async () => { await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); store.close(); });
async function api(path: string, options: { method?: string; auth?: string; body?: unknown } = {}) {
  const response = await fetch(base + path, { method: options.method ?? "GET",
    headers: { ...(options.auth ? { authorization: `Bearer local-demo:${options.auth}` } : {}), ...(options.body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
  return { status: response.status, body: await response.json() as any };
}
const answerOf = (id: string) => (JSON.parse((store.db.prepare("SELECT json FROM coindle_rapid WHERE run_id = ?").get(id) as { json: string }).json)).current.answer as string;

async function play(player: string, solves: number, wrongFirst: number, raidId?: string) {
  const issued = await api("/api/runs", { method: "POST", auth: player, body: { gameId: "coindle", mode: raidId ? "raid" : "ranked", ...(raidId ? { raidId } : {}) } });
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  const run = issued.body.run as GameRunConfig;
  assert.equal(run.objective, "coins_solved");
  assert.equal(run.rules?.format, "rapid-fire-v1");
  assert.equal((await api(`/api/coindle/rapid/${run.runId}/start`, { method: "POST" })).status, 200);
  for (let i = 0; i < solves; i++) {
    if (i === 0) for (const coin of live.filter((c) => c.ticker !== answerOf(run.runId)).slice(0, wrongFirst)) await api(`/api/coindle/rapid/${run.runId}/guess`, { method: "POST", body: { ticker: coin.ticker } });
    const reply = await api(`/api/coindle/rapid/${run.runId}/guess`, { method: "POST", body: { ticker: answerOf(run.runId) } });
    assert.equal(reply.body.correct, true);
  }
  const early = { gameId: run.gameId, gameVersion: run.gameVersion, runId: run.runId, mode: run.mode, raidId: run.raidId, seed: run.seed, objective: run.objective,
    primaryMetric: solves, secondaryMetrics: { guesses: solves + wrongFirst }, result: "completed", startedAt: run.startedAt, finishedAt: new Date().toISOString() };
  assert.equal((await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: player, body: early })).body.error.code, "UNVERIFIED_RESULT", "window still open");
  const state = (await api(`/api/coindle/rapid/${run.runId}/finish`, { method: "POST" })).body;
  assert.equal(state.ended, true);
  const forged = await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: player, body: { ...early, primaryMetric: solves + 5 } });
  assert.equal(forged.status, 400);
  const accepted = await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: player, body: early });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal((await api(`/api/coindle/rapid/${run.runId}/guess`, { method: "POST", body: { ticker: "BTC" } })).body.error.code, "RUN_CONSUMED");
  return run;
}

test("Coindle Passport Play ranks coins solved, then fewer guesses", async () => {
  await play("rf-alice", 3, 2);
  await play("rf-bob", 3, 0);
  await play("rf-carol", 2, 0);
  const board = await api("/api/leaderboards/coindle");
  assert.equal(board.body.objective, "coins_solved");
  assert.deepEqual(board.body.entries.map((e: any) => [e.primaryMetric, e.secondaryMetrics.guesses]), [[3, 3], [3, 5], [2, 2]]);
  assert.equal((await api("/api/coindle/rapid/00000000-0000-0000-0000-000000000000/start", { method: "POST" })).status, 404);
});

test("Coindle Community Raid totals coins solved by every run in the window and requires Rapid Fire rules", async () => {
  const now = Date.now();
  const input = { name: "Coin rush", gameId: "coindle", communityId: "coin-rwa", objective: "coins_solved",
    startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 3_600_000).toISOString(), maxAttempts: 3,
    reward: { type: "none" }, feeSplitBps: { prize: 0, community: 0, treasury: 10_000 } };
  const bare = await api("/api/admin/raids", { method: "POST", auth: "admin", body: input });
  assert.equal(bare.body.raid.rules.format, "rapid-fire-v1", "Coindle raids default to the reviewed Rapid Fire rules");
  const wrong = await api("/api/admin/raids", { method: "POST", auth: "admin", body: { ...input, rules: { format: "daily" } } });
  assert.ok(wrong.body.raid.readiness.blockers.some((b: string) => b.includes("Rapid Fire")));
  const created = await api("/api/admin/raids", { method: "POST", auth: "admin", body: { ...input, rules: RAPID_RULES } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const raidId = created.body.raid.id;
  if (created.body.raid.status !== "open") assert.equal((await api(`/api/admin/raids/${raidId}/open`, { method: "POST", auth: "admin" })).status, 200);
  await play("raid-a", 2, 0, raidId);
  await play("raid-a", 1, 0, raidId);
  await play("raid-b", 4, 1, raidId);
  const raid = await api(`/api/raids/${raidId}`);
  assert.deepEqual(raid.body.communityTotal, { coinsSolved: 7, runs: 3, participants: 2 });
  assert.equal(raid.body.leaderboard[0].primaryMetric, 4);
});
