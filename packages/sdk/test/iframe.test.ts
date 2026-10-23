import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { IframeCartridge } from "../src/iframe.ts";
import type { FreePlayLifecycleEvent, GameManifest, GameRunConfig, GameRunResult } from "../src/index.ts";

const hostOrigin = "https://arcade.example";
const cartridgeOrigin = "https://cartridges.example";
const manifest: GameManifest = {
  id: "transport-cabinet", name: "Transport cabinet", description: "Test reviewed Cartridge",
  version: "1.0.0", developer: "Test", adapterId: "transport-skeleton", skeletonId: "transport-skeleton",
  supportedModes: ["free", "ranked"], supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true,
  entry: { kind: "iframe", origin: cartridgeOrigin, url: `${cartridgeOrigin}/transport/v/1.0.0/` },
  controls: { touch: true, orientation: "portrait" },
};
const config: GameRunConfig = {
  runId: "transport-run", gameId: manifest.id, gameVersion: "1.0.0", mode: "free", objective: "score",
  seed: "test-seed", startedAt: "2026-10-10T12:00:00.000Z",
};
const result: GameRunResult = {
  ...config, primaryMetric: 42, secondaryMetrics: { apples: 3 }, result: "completed", finishedAt: "2026-10-10T12:00:01.000Z",
};

type TransportMessage = { ta: number; channel: string; type: string; payload: unknown };
type Listener = (event: { origin?: string; source?: unknown; data?: unknown; persisted?: boolean }) => void;

class MockTokenList extends Set<string> {
  add(...tokens: string[]) { for (const token of tokens) super.add(token); return this; }
}

class MockElement {
  readonly tag: string;
  readonly style: Record<string, string> = {};
  readonly children: MockElement[] = [];
  readonly sandbox = new MockTokenList();
  readonly posts: { message: TransportMessage; origin: string }[] = [];
  readonly contentWindow = { postMessage: (message: TransportMessage, origin: string) => this.posts.push({ message, origin }) };
  parent: MockElement | null = null;
  clientWidth = 780;
  removed = false;
  focused = 0;
  title = "";
  className = "";
  allow = "";
  referrerPolicy = "";
  src = "";
  constructor(tag: string) { this.tag = tag; }
  append(child: MockElement) { this.children.push(child); child.parent = this; }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null; this.removed = true;
  }
  focus() { this.focused++; }
}

function environment(t: TestContext) {
  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
  const frames: MockElement[] = [];
  const observers: MockResizeObserver[] = [];
  const add = (listeners: Map<string, Set<Listener>>, name: string, callback: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(callback);
  };
  class MockResizeObserver {
    readonly callback: () => void;
    observed: MockElement | null = null;
    disconnected = false;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(element: MockElement) { this.observed = element; }
    disconnect() { this.disconnected = true; }
  }
  const fakeDocument = {
    hidden: false,
    createElement(tag: string) { const element = new MockElement(tag); if (tag === "iframe") frames.push(element); return element; },
    addEventListener: (name: string, callback: Listener) => add(documentListeners, name, callback),
    removeEventListener: (name: string, callback: Listener) => documentListeners.get(name)?.delete(callback),
  };
  const globals: Record<string, unknown> = {
    window: {
      location: { origin: hostOrigin }, setTimeout: globalThis.setTimeout,
      addEventListener: (name: string, callback: Listener) => add(windowListeners, name, callback),
      removeEventListener: (name: string, callback: Listener) => windowListeners.get(name)?.delete(callback),
    },
    document: fakeDocument,
    ResizeObserver: MockResizeObserver,
  };
  const disposals: (() => void)[] = [];
  const restorations: (() => void)[] = [];
  for (const [key, value] of Object.entries(globals)) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restorations.push(() => { if (prior) Object.defineProperty(globalThis, key, prior); else Reflect.deleteProperty(globalThis, key); });
  }
  t.after(() => { try { disposals.forEach((dispose) => dispose()); } finally { restorations.forEach((restore) => restore()); } });
  const container = new MockElement("main");
  const element = container as unknown as HTMLElement;
  const send = (frame: MockElement, type: string, payload: unknown = {}, overrides: { origin?: string; source?: unknown; channel?: string } = {}) => {
    const channel = new URL(frame.src).searchParams.get("ta_channel");
    const event = { origin: overrides.origin ?? cartridgeOrigin, source: overrides.source ?? frame.contentWindow,
      data: { ta: 1, channel: overrides.channel ?? channel, type, payload } };
    for (const callback of [...windowListeners.get("message") ?? []]) callback(event);
  };
  return { frames, observers, windowListeners, documentListeners, document: fakeDocument, container, element, send, cleanup: (dispose: () => void) => disposals.push(dispose) };
}

test("iframe transport accepts only the reviewed origin, source and channel, and completes once", async (t) => {
  const env = environment(t);
  const states: string[] = [];
  const cartridge = new IframeCartridge(manifest, (state) => states.push(state));
  env.cleanup(() => cartridge.destroy());
  let mounted = false;
  const mounting = cartridge.mount(env.element, config).then(() => { mounted = true; });
  const frame = env.frames[0];
  const entry = new URL(frame.src);
  assert.equal(entry.origin, cartridgeOrigin);
  assert.equal(entry.searchParams.get("ta_host"), hostOrigin);
  assert.equal(entry.searchParams.get("ta"), "1");
  assert.ok(entry.searchParams.get("ta_channel"));
  assert.equal(frame.sandbox.has("allow-scripts"), true);
  assert.equal(frame.sandbox.has("allow-same-origin"), true);
  assert.equal(frame.sandbox.has("allow-top-navigation"), false);
  for (const invalid of [{ origin: "https://untrusted.example" }, { source: {} }, { channel: "different-channel" }]) {
    env.send(frame, "ta:hello", {}, invalid);
    env.send(frame, "ta:ready", {}, invalid);
  }
  await Promise.resolve();
  assert.equal(mounted, false);
  assert.equal(frame.posts.length, 0);
  env.send(frame, "ta:hello");
  assert.equal(frame.posts[0].origin, cartridgeOrigin);
  assert.equal(frame.posts[0].message.type, "ta:mount");
  assert.deepEqual(frame.posts[0].message.payload, config);
  env.send(frame, "ta:ready");
  await mounting;
  assert.equal(mounted, true);
  cartridge.start();
  assert.equal(frame.posts.at(-1)?.message.type, "ta:start");
  assert.equal(frame.focused, 1);
  const results: GameRunResult[] = [];
  const unsubscribe = cartridge.onRunComplete((value) => results.push(value));
  env.send(frame, "ta:run_complete", result, { origin: "https://untrusted.example" });
  env.send(frame, "ta:run_complete", result, { source: {} });
  env.send(frame, "ta:run_complete", result, { channel: "different-channel" });
  assert.equal(results.length, 0);
  env.send(frame, "ta:run_complete", result);
  env.send(frame, "ta:run_complete", result);
  assert.deepEqual(results, [result]);
  env.send(frame, "ta:paused", { reason: "blur" });
  env.send(frame, "ta:resumed");
  assert.deepEqual(states, ["paused", "running"]);
  env.document.hidden = true;
  for (const callback of env.documentListeners.get("visibilitychange") ?? []) callback({});
  assert.equal(frame.posts.at(-1)?.message.type, "ta:pause");
  unsubscribe();
});

test("a post-ready fatal iframe error removes the runtime and cannot accept a later result", async (t) => {
  const env = environment(t);
  const errors: string[] = [];
  const results: GameRunResult[] = [];
  const cartridge = new IframeCartridge(manifest, undefined, (message) => errors.push(message));
  env.cleanup(() => cartridge.destroy());
  const mounting = cartridge.mount(env.element, config);
  const frame = env.frames[0];
  env.send(frame, "ta:hello"); env.send(frame, "ta:ready"); await mounting;
  cartridge.onRunComplete((value) => results.push(value));
  env.send(frame, "ta:error", { fatal: true, message: "Native runtime failed" });
  assert.deepEqual(errors, ["Native runtime failed"]);
  assert.equal(frame.removed, true);
  assert.equal(env.container.children.length, 0);
  assert.equal(env.windowListeners.get("message")?.size, 0);
  assert.equal(env.documentListeners.get("visibilitychange")?.size, 0);
  assert.equal(frame.posts.at(-1)?.message.type, "ta:destroy");
  env.send(frame, "ta:run_complete", result);
  assert.equal(results.length, 0);
});

test("destroy cancels a pending iframe handshake and removes its listeners", async (t) => {
  const env = environment(t);
  const cartridge = new IframeCartridge(manifest);
  env.cleanup(() => cartridge.destroy());
  const mounting = cartridge.mount(env.element, config);
  const rejection = assert.rejects(mounting, /Cartridge mount cancelled/);
  const frame = env.frames[0];
  cartridge.destroy();
  await rejection;
  assert.equal(frame.removed, true);
  assert.equal(env.container.children.length, 0);
  assert.equal(env.windowListeners.get("message")?.size, 0);
  assert.equal(env.documentListeners.get("visibilitychange")?.size, 0);
});

test("competitive play retains the issued 390 by 844 viewport and only scales its display", async (t) => {
  const env = environment(t);
  env.container.clientWidth = 195;
  const cartridge = new IframeCartridge(manifest);
  env.cleanup(() => cartridge.destroy());
  const mounting = cartridge.mount(env.element, { ...config, mode: "ranked", rules: { viewportWidth: 390, viewportHeight: 844 } });
  const frame = env.frames[0];
  const wrapper = env.container.children[0];
  assert.equal(wrapper.tag, "div");
  assert.equal(wrapper.children[0], frame);
  assert.equal(frame.style.width, "390px");
  assert.equal(frame.style.height, "844px");
  assert.equal(frame.style.transform, "scale(0.5)");
  assert.equal(wrapper.style.width, "195px");
  assert.equal(wrapper.style.height, "422px");
  assert.equal(env.observers[0].observed, env.container);
  env.container.clientWidth = 780;
  env.observers[0].callback();
  assert.equal(frame.style.width, "390px");
  assert.equal(frame.style.height, "844px");
  assert.equal(frame.style.transform, "scale(1)");
  env.send(frame, "ta:ready"); await mounting;
  cartridge.destroy();
  assert.equal(wrapper.removed, true);
  assert.equal(frame.removed, true);
  assert.equal(env.observers[0].disconnected, true);
});

test("the iframe host rejects same-origin or mismatched-origin entries before creating a runtime", async (t) => {
  const env = environment(t);
  for (const entry of [
    { kind: "iframe" as const, origin: hostOrigin, url: `${hostOrigin}/v/1.0.0/` },
    { kind: "iframe" as const, origin: cartridgeOrigin, url: "https://different.example/v/1.0.0/" },
  ]) {
    const cartridge = new IframeCartridge({ ...manifest, entry });
    await assert.rejects(cartridge.mount(env.element, config), /reviewed, separate origin/);
  }
  assert.equal(env.frames.length, 0);
});

test("Free Play observations distinguish starts, restarts, completed runs and navigation", async t => {
  const env = environment(t);
  const events: FreePlayLifecycleEvent[] = [];
  const cartridge = new IframeCartridge(manifest, undefined, undefined, e => events.push(e));
  env.cleanup(() => cartridge.destroy());
  const mounting = cartridge.mount(env.element, config);
  const frame = env.frames[0];
  env.send(frame, "ta:ready"); await mounting;
  assert.equal(events.length, 0, "loading a menu is not a start");
  const start = { runId: config.runId, startedAt: config.startedAt, context: { levelIndex: 2, upgrade_arm: 5, privateText: "ignored" } };
  env.send(frame, "ta:run_started", start, { origin: "https://other.example" });
  assert.equal(events.length, 0);
  env.send(frame, "ta:run_started", start);
  env.send(frame, "ta:run_started", start);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].context, { levelIndex: 2, upgrade_arm: 5 });
  env.send(frame, "ta:paused");
  assert.equal(events.length, 1, "pause is not abandonment");
  env.send(frame, "ta:run_started", { ...start, runId: "second" });
  assert.deepEqual(events.map(e => [e.type, e.reason]), [["started", undefined], ["exited", "restart"], ["started", undefined]]);
  env.send(frame, "ta:run_complete", { ...result, runId: "second" });
  cartridge.destroy();
  assert.equal(events.length, 3, "finished runs do not gain an exit on navigation");
});

test("navigation emits one exit for an active run and ranked play emits none", async t => {
  const env = environment(t);
  const events: FreePlayLifecycleEvent[] = [];
  const cartridge = new IframeCartridge(manifest, undefined, undefined, e => events.push(e));
  env.cleanup(() => cartridge.destroy());
  let mounting = cartridge.mount(env.element, config);
  env.send(env.frames[0], "ta:ready"); await mounting;
  env.send(env.frames[0], "ta:run_started", config);
  cartridge.destroy(); cartridge.destroy();
  assert.deepEqual(events.map(e => e.type), ["started", "exited"]);
  mounting = cartridge.mount(env.element, { ...config, mode: "ranked" });
  env.send(env.frames[1], "ta:ready"); await mounting;
  env.send(env.frames[1], "ta:run_started", config); cartridge.destroy();
  assert.equal(events.length, 2);
});

test("pagehide records departure once but preserves a run cached for back navigation", async t => {
  const env = environment(t);
  const events: FreePlayLifecycleEvent[] = [];
  const cartridge = new IframeCartridge(manifest, undefined, undefined, e => events.push(e));
  env.cleanup(() => cartridge.destroy());
  const mounting = cartridge.mount(env.element, config);
  env.send(env.frames[0], "ta:ready"); await mounting;
  env.send(env.frames[0], "ta:run_started", config);
  for (const callback of env.windowListeners.get("pagehide") ?? []) callback({ persisted: true });
  assert.equal(events.length, 1);
  for (const callback of env.windowListeners.get("pagehide") ?? []) callback({ persisted: false });
  cartridge.destroy();
  assert.deepEqual(events.map(e => [e.type, e.reason]), [["started", undefined], ["exited", "pagehide"]]);
  assert.equal(env.windowListeners.get("pagehide")?.size, 0);
});
