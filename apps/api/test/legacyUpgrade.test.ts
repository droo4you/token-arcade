import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArcadeStore } from "../src/store.ts";

test("existing Skip to 10K legacy import gains the four Passport boards on restart, keeping its stored entry origin", () => {
  const dir = mkdtempSync(join(tmpdir(), "ta-legacy-"));
  const path = join(dir, "a.sqlite");
  try {
    let store = new ArcadeStore(path, false);
    const prior = store.getGame("skip-to-10k")!;
    // Simulate the record a pre-upgrade deploy wrote (Free Play only, revision 2, a hosted origin).
    const { verifier: _v, ...manifest } = prior.manifest;
    store.saveGame({ ...prior, manifest: { ...manifest, version: "1.0.0", adapterId: "skip-to-10k", skeletonId: "skip-to-10k", supportedModes: ["free"], entry: { kind: "iframe", origin: "https://cart.example", url: "https://cart.example/skip-to-10k/v/1.0.0/" } }, legacyImportRevision: 2 });
    store.close();
    store = new ArcadeStore(path, false);
    const upgraded = store.getGame("skip-to-10k")!;
    assert.deepEqual(upgraded.manifest.supportedModes, ["free", "ranked", "raid"]);
    assert.equal(upgraded.manifest.verifier?.kind, "replay");
    assert.equal(upgraded.manifest.entry?.origin, "https://cart.example");
    assert.equal(upgraded.manifest.version, "1.1.0");
    assert.equal(upgraded.manifest.adapterId, "skip-to-10k-v2");
    assert.equal(upgraded.manifest.entry?.url, "https://cart.example/skip-to-10k/v/1.1.0/");
    // Coindle gains Rapid Fire Passport Play + Raid through the same reviewed upgrade (revision 3).
    assert.deepEqual(store.getGame("coindle")!.manifest.supportedModes, ["free", "ranked", "raid"]);
    assert.deepEqual(store.getGame("coindle")!.manifest.supportedObjectives, ["coins_solved", "guesses"]);
    assert.equal(store.getGame("coindle")!.manifest.verifier?.kind, "server_authoritative");
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("untouched emonad-cabinet legacy import is renamed to Mood Swings, id unchanged", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "mood-swings-")), "a.sqlite");
  let store = new ArcadeStore(file, false);
  const prior = store.getGame("emonad-cabinet")!;
  store.saveGame({ ...prior, manifest: { ...prior.manifest, name: "Uppers", description: "Catch the falling chart and keep the bounce alive. Paired community: eMONAD." }, legacyImportRevision: 3 });
  store.close(); store = new ArcadeStore(file, false);
  const g = store.getGame("emonad-cabinet")!;
  assert.equal(g.manifest.id, "emonad-cabinet");
  assert.equal(g.manifest.name, "Mood Swings");
  assert.equal(g.manifest.description, "Keep Emonad's mood up. Paired community: eMONAD.");
  assert.equal(g.legacyImportRevision, 5);
  store.close();
});

test("Coindle upgrades an untouched v1 import while preserving its hosted origin and metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "coindle-version-"));
  const file = join(dir, "a.sqlite");
  let store = new ArcadeStore(file, false);
  const fresh = store.getGame("coindle")!;
  assert.equal(fresh.manifest.version, "1.1.0");
  const legacy = { ...fresh, legacyImportRevision: 3, manifest: { ...fresh.manifest,
    version: "1.0.0", adapterId: "coindle", skeletonId: "coindle",
    entry: { kind: "iframe" as const, origin: "https://cart.example", url: "https://cart.example/coindle/v/1.0.0/" } } };
  store.saveGame(legacy);
  store.close(); store = new ArcadeStore(file, false);
  const upgraded = store.getGame("coindle")!;
  assert.equal(upgraded.manifest.version, "1.1.0");
  assert.equal(upgraded.manifest.adapterId, "coindle-v2");
  assert.equal(upgraded.manifest.skeletonId, "coindle-v2");
  assert.equal(upgraded.manifest.entry?.url, "https://cart.example/coindle/v/1.1.0/");
  assert.equal(upgraded.manifest.entry?.origin, "https://cart.example");
  assert.equal(upgraded.legacyImportRevision, 4);
  assert.deepEqual(upgraded.review, legacy.review);
  assert.deepEqual(upgraded.economy, legacy.economy);
  assert.equal(upgraded.publishedAt, legacy.publishedAt);
  store.close();
  rmSync(file); rmdirSync(dir);
});

test("Two Places reviewed guide adopts campaign unlocks without changing rules or version", () => {
  const dir = mkdtempSync(join(tmpdir(), "two-unlock-guide-")), file = join(dir, "a.sqlite");
  let store = new ArcadeStore(file, false);
  try {
    const prior = store.getGame("two-places")!;
    store.saveGame({ ...prior, legacyImportRevision: 2, manifest: { ...prior.manifest, playGuide: { ...prior.manifest.playGuide!, ranked: "Choose any of the 20 levels." } } });
    store.close(); store = new ArcadeStore(file, false);
    const upgraded = store.getGame("two-places")!;
    assert.match(upgraded.manifest.playGuide?.ranked ?? "", /unlocked levels/);
    assert.equal(upgraded.manifest.version, prior.manifest.version);
    assert.deepEqual(upgraded.manifest.entry, prior.manifest.entry);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
