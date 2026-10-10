import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";

test("separate Cartridge origin serves reviewed assets and excludes server/source tooling", async () => {
  const modulePath = "../../../scripts/cartridges.mjs";
  const { createCartridgeServer } = await import(modulePath) as { createCartridgeServer: () => Server };
  const server = createCartridgeServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  try {
    const entry = await fetch(`${origin}/skip-to-10k/v/1.0.0/`);
    assert.equal(entry.status, 200);
    assert.match(entry.headers.get("content-security-policy") ?? "", /frame-ancestors http:\/\/127\.0\.0\.1:/);
    assert.match(await entry.text(), /\/sdk\/bridge\.js/);
    const hosts = await fetch(`${origin}/sdk/hosts.js`);
    assert.match(await hosts.text(), /window.TA_HOST_ORIGINS=/);
    for (const path of ["/skip-to-10k/v/1.0.0/.env", "/emonad-cabinet/v/1.0.0/tools/verify.js", "/emonad-cabinet/v/1.0.0/TOOLS/verify.js", "/emonad-cabinet/v/1.0.0/tools%5cverify.js", "/skip-to-10k/v/9.0.0/", "/skip-to-10k/v/1.0.0/%2e%2e%2f%2e%2e%2fpackage.json"]) {
      assert.equal((await fetch(origin + path)).status, 404, path);
    }
    assert.equal((await fetch(`${origin}/sdk/bridge.js`, { method: "POST", body: "x" })).status, 405);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
