import test from "node:test";
import assert from "node:assert/strict";
import { createCoindleHandler } from "../src/coindle.ts";
import { COINS } from "../../../cartridges/coindle/src/lib/coins.ts";

const btc = COINS.find((coin) => coin.ticker === "BTC")!;
const url = (path: string) => new URL(`http://localhost/api/coindle/${path}`);
const get = { method: "GET" };
const now = () => Date.parse("2026-10-09T12:00:00Z");
const sample = { id: btc.pythFeedId.slice(2), price: { price: "6200000000000", expo: -8 } };

test("Coindle missing price configuration is explicit and the handler is read-only", async () => {
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "" });
  assert.equal((await handler(get, url("prices")))?.status, 503);
  assert.equal((await handler({ method: "POST" }, url("live")))?.status, 405);
  assert.equal(await handler(get, url("leaderboard")), null);
});

test("Coindle allows only known feeds and bounded historical requests", async () => {
  let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now, fetch: (async () => { calls++; throw new Error("must not fetch"); }) as typeof fetch });
  for (const query of ["ids[]=https://attacker.invalid", `ids[]=${btc.pythFeedId}&at=9999999999`, `ids[]=${btc.pythFeedId}&at=1`, `ids[]=${btc.pythFeedId}&at=1e9`, ""]) {
    assert.equal((await handler(get, url(`live?${query}`)))?.status, 400);
  }
  assert.equal((await handler(get, url("history?ticker=UNKNOWN")))?.status, 400);
  assert.equal(calls, 0);
});

test("Coindle snapshots use native price tiers, cache the daily snapshot and retain credentials on the server", async () => {
  let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now, fetch: (async (input, init) => {
    calls++;
    assert.equal(new URL(String(input)).origin, "https://hermes.pyth.network");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-only");
    return Response.json({ parsed: [sample, { ...sample, id: "unknown" }, { ...sample, price: { price: "NaN", expo: 0 } }] });
  }) as typeof fetch });
  const first = await handler(get, url("prices"));
  assert.deepEqual(first, { status: 200, body: { BTC: { price: 62000, tier: 9 } } });
  assert.deepEqual(await handler(get, url("prices")), first);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(first).includes("test-only"), false);
});

test("Coindle live and 90-day data return native schemas with cached requests", async () => {
  let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now, fetch: (async () => { calls++; return Response.json({ parsed: [sample] }); }) as typeof fetch });
  const live = await handler(get, url(`live?ids[]=${btc.pythFeedId}`));
  assert.deepEqual(live, { status: 200, body: { parsed: [sample] } });
  await handler(get, url(`live?ids[]=${btc.pythFeedId}`));
  assert.equal(calls, 1);
  const history = await handler(get, url("history?ticker=BTC"));
  assert.equal(history?.status, 200);
  const body = history?.body as { ticker: string; points: { timestamp: number; price: number }[] };
  assert.equal(body.ticker, "BTC");
  assert.equal(body.points.length, 31);
  assert.equal(body.points[30].timestamp - body.points[0].timestamp, 90 * 86400);
  assert.equal(body.points[0].price, 62000);
  await handler(get, url("history?ticker=BTC"));
  assert.equal(calls, 32);
});

test("Coindle does not return fabricated data or upstream secrets on errors", async () => {
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", fetch: (async () => { throw new Error("sensitive upstream detail"); }) as typeof fetch });
  assert.deepEqual(await handler(get, url("prices")), { status: 502, body: { error: "Pyth data is temporarily unavailable" } });
});

const quiet = { sleep: async () => {}, log: () => {}, random: () => 0 };
const tsOf = (input: unknown) => Number(new URL(String(input)).pathname.split("/").pop());

test("Coindle history skips failed points, retries 429s and caches a partial series briefly", async () => {
  let clock = now();
  const seen = new Map<number, number>();
  const sleeps: number[] = [];
  let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now: () => clock, ...quiet, sleep: async (ms) => { sleeps.push(ms); },
    fetch: (async (input) => {
      calls++;
      const ts = tsOf(input);
      const n = (seen.get(ts) ?? 0) + 1; seen.set(ts, n);
      const index = (ts - (Date.parse("2026-10-09T00:00:00Z") / 1000 - 90 * 86400)) / (3 * 86400);
      if (index === 0) return new Response("unauthorized", { status: 403 }); // permanent failure: skipped
      if (index === 1 && n === 1) return new Response("slow down", { status: 429, headers: { "Retry-After": "1" } }); // retried
      if (index === 2) return new Response("busy", { status: 429 }); // always 429: skipped after retries
      return Response.json({ parsed: [sample] });
    }) as typeof fetch });
  const history = await handler(get, url("history?ticker=BTC"));
  assert.equal(history?.status, 200);
  const points = (history?.body as { points: unknown[] }).points;
  assert.equal(points.length, 29);
  assert.ok(sleeps.includes(1000), "honours Retry-After");
  assert.equal(seen.get(Date.parse("2026-10-09T00:00:00Z") / 1000 - 84 * 86400), 3, "429 retried up to the cap");
  const before = calls;
  clock += 5 * 60_000;
  await handler(get, url("history?ticker=BTC"));
  assert.equal(calls, before, "partial series cached for a few minutes");
  clock += 6 * 60_000;
  const stale = await handler(get, url("history?ticker=BTC"));
  assert.equal((stale?.body as { points: unknown[] }).points.length, 29, "stale partial served immediately");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(calls > before, "partial series refreshes in the background after ~10 min");
});

test("Coindle history returns 502 only when every point fails, and does not cache it", async () => {
  let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now, ...quiet, fetch: (async () => { calls++; return new Response("x", { status: 500 }); }) as typeof fetch });
  assert.deepEqual(await handler(get, url("history?ticker=BTC")), { status: 502, body: { error: "Pyth data is temporarily unavailable" } });
  const first = calls;
  await handler(get, url("history?ticker=BTC"));
  assert.equal(calls, first * 2);
});

test("Coindle history nudges to a nearby timestamp on 404, dedupes in-flight requests and logs without secrets", async () => {
  const logs: string[] = [];
  let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now, ...quiet, log: (m) => logs.push(m), fetch: (async (input) => {
    calls++;
    return tsOf(input) % 86400 === 0 ? new Response("not found", { status: 404 }) : Response.json({ parsed: [sample] });
  }) as typeof fetch });
  const [a, b] = await Promise.all([handler(get, url("history?ticker=BTC")), handler(get, url("history?ticker=BTC"))]);
  assert.equal((a?.body as { points: unknown[] }).points.length, 31);
  assert.deepEqual(a, b);
  assert.equal(calls, 62);
  assert.ok(logs.some((m) => m.includes("status=404") && m.includes("/v2/updates/price/")));
  assert.equal(logs.join("\n").includes("test-only"), false);
});

import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Coindle history persists to disk, survives restart, and serves stale while refreshing next day", async () => {
  const dir = mkdtempSync(join(tmpdir(), "coindle-"));
  let clock = now(); let calls = 0; const releases: (() => void)[] = []; let gate = false;
  const fetcher = (async () => {
    calls++;
    if (gate) await new Promise<void>((resolve) => { releases.push(resolve); });
    return Response.json({ parsed: [sample] });
  }) as typeof fetch;
  const first = createCoindleHandler({ cacheDir: dir, apiKey: "test-only", now: () => clock, ...quiet, fetch: fetcher });
  await first(get, url("history?ticker=BTC"));
  assert.equal(calls, 31);
  assert.ok(existsSync(join(dir, "coindle-history.json")));
  assert.equal(readFileSync(join(dir, "coindle-history.json"), "utf8").includes("test-only"), false);
  // Restart: warm from disk with zero upstream calls.
  const second = createCoindleHandler({ cacheDir: dir, apiKey: "test-only", now: () => clock, ...quiet, fetch: fetcher });
  const warm = await second(get, url("history?ticker=BTC"));
  assert.equal(calls, 31);
  assert.equal((warm?.body as { points: unknown[] }).points.length, 31);
  // Next day: stale served instantly, one deduped background build.
  clock += 86_400_000; gate = true;
  const [a, b] = await Promise.all([second(get, url("history?ticker=BTC")), second(get, url("history?ticker=BTC"))]);
  assert.equal((a?.body as { points: { timestamp: number }[] }).points[30].timestamp, Date.parse("2026-10-09T00:00:00Z") / 1000);
  assert.deepEqual(a, b);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 37, "one deduped build in flight: 6 workers, not 12");
  gate = false; releases.forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 50));
  const fresh = await second(get, url("history?ticker=BTC"));
  assert.equal((fresh?.body as { points: { timestamp: number }[] }).points[30].timestamp, Date.parse("2026-10-10T00:00:00Z") / 1000);
});

test("Coindle history builds in parallel up to the concurrency limit and prewarm fills the cache", async () => {
  let active = 0; let peak = 0; let calls = 0;
  const handler = createCoindleHandler({ cacheDir: null, apiKey: "test-only", now, ...quiet, fetch: (async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--; return Response.json({ parsed: [sample] });
  }) as typeof fetch });
  await handler.prewarm(["BTC"]);
  assert.equal(calls, 31);
  assert.equal(peak, 6);
  await handler(get, url("history?ticker=BTC"));
  assert.equal(calls, 31, "prewarmed request is served from cache");
});
