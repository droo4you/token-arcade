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
  const handler = createCoindleHandler({ apiKey: "" });
  assert.equal((await handler(get, url("prices")))?.status, 503);
  assert.equal((await handler({ method: "POST" }, url("live")))?.status, 405);
  assert.equal(await handler(get, url("leaderboard")), null);
});

test("Coindle allows only known feeds and bounded historical requests", async () => {
  let calls = 0;
  const handler = createCoindleHandler({ apiKey: "test-only", now, fetch: (async () => { calls++; throw new Error("must not fetch"); }) as typeof fetch });
  for (const query of ["ids[]=https://attacker.invalid", `ids[]=${btc.pythFeedId}&at=9999999999`, `ids[]=${btc.pythFeedId}&at=1`, `ids[]=${btc.pythFeedId}&at=1e9`, ""]) {
    assert.equal((await handler(get, url(`live?${query}`)))?.status, 400);
  }
  assert.equal((await handler(get, url("history?ticker=UNKNOWN")))?.status, 400);
  assert.equal(calls, 0);
});

test("Coindle snapshots use native price tiers, cache the daily snapshot and retain credentials on the server", async () => {
  let calls = 0;
  const handler = createCoindleHandler({ apiKey: "test-only", now, fetch: (async (input, init) => {
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
  const handler = createCoindleHandler({ apiKey: "test-only", now, fetch: (async () => { calls++; return Response.json({ parsed: [sample] }); }) as typeof fetch });
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
  const handler = createCoindleHandler({ apiKey: "test-only", fetch: (async () => { throw new Error("sensitive upstream detail"); }) as typeof fetch });
  assert.deepEqual(await handler(get, url("prices")), { status: 502, body: { error: "Pyth data is temporarily unavailable" } });
});
