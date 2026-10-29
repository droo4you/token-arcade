import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticDevice, runDiagnostics } from "./runDiagnostics.ts";
import type { GameRunConfig } from "../../../packages/sdk/src/index.ts";

test("diagnostic delivery is capped, contains no raw user agent, and tolerates offline failures", async t => {
  const config: GameRunConfig = { runId: "run", gameId: "game", gameVersion: "1", mode: "raid", objective: "score", seed: "seed", startedAt: new Date().toISOString() };
  const event = { event: "timeout" as const, mountId: "11111111-1111-1111-1111-111111111111", sequence: 0, elapsedMs: 15000, hidden: true, stage: "idle" };
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { requests.push(init); throw new Error("offline"); });
  const report = runDiagnostics(config, async () => "private-auth-token");
  for (let i = 0; i < 100; i++) report(event);
  runDiagnostics({ ...config, mode: "free" }, async () => "private-auth-token")(event);
  runDiagnostics(config, async () => { throw new Error("auth unavailable"); })(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 80);
  const body = JSON.parse(String(requests[0].body));
  assert.equal(body.event, "timeout");
  assert.ok(!String(requests[0].body).includes("private-auth-token"));
  assert.equal(body.userAgent, undefined);
  assert.equal(requests[0].keepalive, true);
  assert.deepEqual(diagnosticDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Safari/605.1.15"), { browser: "Safari", platform: "macOS" });
  assert.deepEqual(diagnosticDevice("Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36"), { browser: "Chrome", platform: "macOS" });
});
