import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRecord } from "../../../packages/sdk/src/index.ts";
import { getCatalog, getGame } from "../src/catalog.ts";

const newGame: GameRecord = {
  manifest: {
    id: "new-game", name: "New Game", description: "A newly approved cartridge.", version: "1.0.0",
    developer: "Independent maker", adapterId: "reviewed-server-only", supportedModes: ["free"],
    supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true,
  },
  status: "published",
  createdAt: "2026-10-08T00:00:00.000Z",
  publishedAt: "2026-10-08T00:00:00.000Z",
};

test("a newly published registry game appears on the arcade shelf", () => {
  const catalog = getCatalog([newGame]);
  assert.equal(catalog.find((game) => game.id === "new-game")?.name, "New Game");
  assert.equal(getGame("new-game", [newGame])?.record?.status, "published");
});

test("a published game without an installed browser cartridge remains nonplayable", () => {
  assert.equal(getGame("new-game", [newGame])?.playable, false);
  assert.equal(getGame("arcade-warmup", []), undefined);
  const fixture = { ...newGame, manifest: { ...newGame.manifest, id: "arcade-warmup", adapterId: "arcade-warmup" } };
  assert.equal(getGame("arcade-warmup", [fixture])?.playable, true);
});
