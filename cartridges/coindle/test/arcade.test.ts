import test from "node:test";
import assert from "node:assert/strict";
import { beginArcadeRound, finishArcadeRound, resetArcadeRound, setArcadePaused, arcadeStorageKey, gameApiUrl } from "../src/lib/arcade";
import { compareGuess } from "../src/lib/compare";
import { COINS } from "../src/lib/coins";
import { getDailyCoinIndex } from "../src/lib/daily";

test("native Coindle clues never fabricate a green price clue when Pyth is absent", () => {
  const result = compareGuess(COINS[0], COINS[0], {});
  assert.equal(result.type, "green");
  assert.equal(result.color, "green");
  assert.equal(result.priceRange, "unavailable");
  assert.equal(result.priceRangeDirection, "match");
  assert.equal(compareGuess(COINS[0], COINS[0], { [COINS[0].ticker]: { price: 62000, tier: 9 } }).priceRange, "green");
});

test("native daily puzzle selection is stable and excludes retired coins", () => {
  const first = getDailyCoinIndex("2026-10-09");
  assert.equal(first, getDailyCoinIndex("2026-10-09"));
  assert.equal(!!COINS[first].retired, false);
});

test("Coindle adapter emits one native result, tracks active time and isolates cabinet history", (t) => {
  const completed: unknown[] = [];
  let clock = 1000;
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    __COINDLE_HOSTED_ARCADE__: true,
    TokenArcade: { active: true, config: { gameId: "coindle-copy" }, beginRun: () => true, complete: (result: unknown) => completed.push(result) },
  } });
  t.mock.method(Date, "now", () => clock);
  t.after(() => { resetArcadeRound(); setArcadePaused(false); if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window"); });
  assert.equal(arcadeStorageKey("coindle-daily"), "ta.coindle-copy.coindle-daily");
  assert.equal(gameApiUrl("/api/prices"), "/api/coindle/prices");
  beginArcadeRound();
  clock = 2000;
  setArcadePaused(true);
  clock = 7000;
  setArcadePaused(false);
  clock = 9000;
  finishArcadeRound(true, 3, 2, true, false, 4);
  finishArcadeRound(true, 3, 2, true, false, 4);
  assert.deepEqual(completed, [{ primaryMetric: 3, result: "completed", secondaryMetrics: { solved: 1, hintsUsed: 2, elapsedMs: 3000, daily: 1, hard: 0, streak: 4 } }]);
  resetArcadeRound();
  beginArcadeRound();
  finishArcadeRound(false, 6, 0, false, true);
  assert.equal((completed[1] as { result: string }).result, "failed");
});
