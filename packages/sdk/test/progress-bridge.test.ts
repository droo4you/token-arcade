import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const source = readFileSync(new URL("../browser/bridge.js", import.meta.url), "utf8");
const key = "ta.skip-to-10k.skip10k.v1", scope = "account-alice", prefix = `ta.account.${scope}:`;
let sequence = 0;
const locks = new WeakMap<Map<string, string>, Set<string>>();
function bridge(backing: Map<string, string>) {
  if (!locks.has(backing)) locks.set(backing, new Set());
  const listeners = new Map<string, Function>(), messages: any[] = [], timers = new Map<number, Function>();
  class Storage {
    getItem(k: string) { return backing.get(k) ?? null; }
    setItem(k: string, v: string) { backing.set(k, String(v)); }
    removeItem(k: string) { backing.delete(k); }
  }
  const storage = new Storage(), parent = { postMessage(data: any) { messages.push(JSON.parse(JSON.stringify(data))); } };
  const sandbox: any = { URLSearchParams, console, crypto: { randomUUID: () => `operation-${++sequence}` }, localStorage: storage,
    navigator: { locks: { async request(name: string, _options: unknown, callback: Function) {
      const held = locks.get(backing)!;
      if (held.has(name)) return callback(null);
      held.add(name); try { return await callback({}); } finally { held.delete(name); }
    } } },
    parent, location: { search: "?ta=1&ta_host=https%3A%2F%2Fhost.example&ta_channel=test" }, TA_HOST_ORIGINS: ["https://host.example"],
    addEventListener: (name: string, fn: Function) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name),
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: (fn: Function) => { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout: (id: number) => timers.delete(id),
  };
  sandbox.window = sandbox;
  const ctx = createContext(sandbox); runInContext(source, ctx);
  let mounted: unknown;
  sandbox.TokenArcade.register({ mount() { mounted = storage.getItem(key); } });
  const send = async (type: string, payload: unknown = {}, origin = "https://host.example") => listeners.get("message")?.({ origin, source: parent, data: { ta: 1, channel: "test", type, payload } });
  const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); };
  return { send, messages, storage, flush, mounted: () => mounted, api: sandbox.TokenArcade };
}

test("account bridge hydrates before mount, leaves guest keys intact, and retains an idempotent outbox across reloads", async () => {
  const backing = new Map([[key, JSON.stringify({ gwei: 100 })]]);
  let b = bridge(backing);
  const read = { keys: [key], scope, gameId: "skip-to-10k" };
  await b.send("ta:progress_read", read, "https://wrong.example");
  assert.equal(b.messages.length, 1);
  await b.send("ta:progress_read", read);
  assert.equal(b.messages.at(-1).payload.guest[key].gwei, 100);
  await b.send("ta:progress_apply", { [key]: { gwei: 80 } });
  await b.send("ta:mount", { mode: "free", gameId: "skip-to-10k", gameVersion: "1.0.0", runId: "run" });
  assert.equal(JSON.parse(String(b.mounted())).gwei, 80);
  const secondTab = bridge(backing);
  await secondTab.send("ta:progress_read", read);
  assert.equal(secondTab.messages.at(-1).type, "ta:progress_unavailable", "only one tab writes an account outbox");
  assert.equal(JSON.parse(secondTab.storage.getItem(key)!).gwei, 100);
  await secondTab.send("ta:destroy");
  b.storage.setItem(key, JSON.stringify({ gwei: 60 })); b.flush();
  const pending = b.messages.at(-1).payload;
  assert.equal(b.messages.at(-1).type, "ta:progress_save");
  assert.equal(pending.base[key].gwei, 80);
  assert.equal(pending.state[key].gwei, 60);
  b.storage.setItem(key, JSON.stringify({ gwei: 70 }));
  assert.equal(JSON.parse(backing.get(key)!).gwei, 100, "guest progress is not overwritten");
  assert.equal(JSON.parse(backing.get(prefix + key)!).gwei, 70);
  // A reload before the ack must carry both the old operation and the newer local delta.
  await b.send("ta:destroy"); b = bridge(backing);
  await b.send("ta:progress_read", read);
  const recovered = b.messages.at(-1).payload;
  assert.deepEqual(recovered.pending, pending);
  assert.equal(recovered.local.base[key].gwei, 60);
  assert.equal(recovered.local.state[key].gwei, 70);
  assert.notEqual(recovered.local.id, pending.id);
  await b.send("ta:progress_apply", { [key]: { gwei: 70 } });
  b.storage.setItem(key, JSON.stringify({ gwei: 75 })); b.flush();
  const next = b.messages.at(-1).payload;
  await b.send("ta:progress_ack", { id: next.id });
  b.flush();
  assert.equal(JSON.parse(backing.get(prefix + "skip-to-10k:sync")!).pending, null);
  await b.send("ta:destroy"); b = bridge(backing);
  assert.equal(JSON.parse(b.storage.getItem(key)!).gwei, 100, "signed-out play resumes guest save");
  await b.send("ta:progress_read", { ...read, scope: "account-bob" });
  await b.send("ta:progress_apply", {});
  assert.equal(b.storage.getItem(key), null, "another account does not inherit Alice's cache");
  await b.send("ta:destroy");
});
