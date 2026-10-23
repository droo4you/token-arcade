import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicClient } from "viem";
import { testnetTransport } from "../src/testnetRpc.ts";

test("RPC rejection falls back with the identical signed transaction", async t => {
  const seen: { url: string; body: { id: number; method: string; params: string[] } }[] = [];
  t.mock.method(globalThis, "fetch", async (request: string | Request, init?: RequestInit) => {
    const body = request instanceof Request ? await request.json() : JSON.parse(String(init?.body));
    seen.push({ url: request instanceof Request ? request.url : String(request), body });
    return new Response(JSON.stringify(seen.length === 1
      ? { jsonrpc: "2.0", id: body.id, error: { code: -32003, message: "Signer had insufficient balance" } }
      : { jsonrpc: "2.0", id: body.id, result: `0x${"ab".repeat(32)}` }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createPublicClient({ transport: testnetTransport("https://testnet-rpc.monad.xyz") });
  await client.sendRawTransaction({ serializedTransaction: "0x1234" });
  assert.equal(seen.length, 2);
  assert.equal(new URL(seen[1].url).hostname, "rpc-testnet.monadinfra.com");
  assert.deepEqual(seen.map(r => r.body.params), [["0x1234"], ["0x1234"]]);
});
