import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { Server } from "node:http";

test("Skrumpey version URLs serve matching frozen rules and reject unsupported game versions", async () => {
  const modulePath = "../../../scripts/cartridges.mjs";
  const { createCartridgeServer } = await import(modulePath) as { createCartridgeServer: () => Server };
  const server = createCartridgeServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const oldSim = await (await fetch(`${origin}/skrumpey-slide/v/1.0.0/sim.js`)).text();
    assert.equal(oldSim.replaceAll("\r\n", "\n"), (await readFile(new URL("../src/legacy/skrumpey-sim-1.0.0.js", import.meta.url), "utf8")).replaceAll("\r\n", "\n"));
    const oldPage = await (await fetch(`${origin}/skrumpey-slide/v/1.0.0/`)).text();
    assert.ok(oldPage.includes("TA.register({version:'1.0.0'"));
    assert.ok(!oldPage.includes("rules:SIM.RULES_VERSION"));
    const newSim = await (await fetch(`${origin}/skrumpey-slide/v/1.1.0/sim.js`)).text();
    assert.ok(newSim.includes("RULES_VERSION='1.1.0'"));
    assert.notEqual(newSim, oldSim);
    const newPage = await (await fetch(`${origin}/skrumpey-slide/v/1.1.0/`)).text();
    assert.ok(newPage.includes("TA.register({version:SIM.RULES_VERSION"));
    assert.ok(newPage.includes("rules:SIM.RULES_VERSION"));
    assert.equal((await fetch(`${origin}/skip-to-10k/v/1.1.0/`)).status, 404);
    assert.equal((await fetch(`${origin}/two-places/v/1.1.0/`)).status, 200);
    assert.match(await (await fetch(`${origin}/two-places/v/1.1.0/src/main.js`)).text(), /version: '1.1.0'/);
    assert.match(await (await fetch(`${origin}/two-places/v/1.0.0/src/main.js`)).text(), /version: '1.0.0'/);
    assert.equal((await fetch(`${origin}/two-places/v/1.2.0/`)).status, 404);
    const latestSim = await (await fetch(`${origin}/skrumpey-slide/v/1.2.0/sim.js`)).text();
    assert.ok(latestSim.includes("RULES_VERSION='1.2.0'"));
    assert.equal((await fetch(`${origin}/skrumpey-slide/v/1.2.0/`)).status, 200);
    assert.equal((await fetch(`${origin}/skrumpey-slide/v/1.3.0/`)).status, 404);
    assert.equal((await fetch(`${origin}/skrumpey-slide/v/1.0.0/build-arcade.mjs`)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
