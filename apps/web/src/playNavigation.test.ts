import assert from "node:assert/strict";
import { test } from "node:test";
import { nextAttemptHref } from "./playNavigation.ts";

test("retry changes the route key while keeping the chosen board, level and raid", () => {
  const first = nextAttemptHref("/play/two-places", "?mode=ranked&level=6", "first");
  const second = nextAttemptHref("/play/two-places", first.slice(first.indexOf("?")), "second");
  assert.notEqual(first, second);
  assert.equal(second, "/play/two-places?mode=ranked&level=6&attempt=second");
  assert.equal(nextAttemptHref("/play/skip-to-10k", "?mode=raid&board=mid&raidId=a%2Fb", "new"), "/play/skip-to-10k?mode=raid&board=mid&raidId=a%2Fb&attempt=new");
});
