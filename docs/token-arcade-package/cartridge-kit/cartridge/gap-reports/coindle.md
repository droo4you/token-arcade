# Gap report: Coindle

> **ALIGNMENT NOTICE (v0.3):** This is a first-pass Implementation/Research Note, not a Source of Truth. Re-audit the actual supplied repository before coding. Any older replay-only, L2/L3, community-role, or public-branding language below is subordinate to the v0.3 Cartridge Spec/Checklist and the current Product/Economy Sources of Truth.


| | |
|---|---|
| URL | https://coindle.xyz (redirects to https://www.coindle.xyz) |
| Observed | 8 Oct 2026 ~5:30 PM PT. Next.js 16 (Turbopack) bundle, 9 chunks; game logic in `/_next/static/chunks/042vnqw1e3cys.js`. Public repo `github.com/droo4you/coindle` (last push 27 Aug 2026 UTC); read `README.md` and `src/app/api/{leaderboard,live,prices,cron/daily}/route.ts`. GET `/api/leaderboard` 200, `/api/prices` 200, `/api/live?ids[]=<ETH>` 200, `/api/live` with no ids 400, `/api/history?ticker=ETH` 200 (3.0 s). |
| Role in current sources | **Game First / Economy Later** Cabinet. COIN/RWA is the community concept, but no supported Monad economy is assumed. No reskin. Public product should show economy unavailable/Coming Soon rather than inventing a token. |
| Skeleton | **None of the 9 fits.** Nearest is `grid_logic` (discrete moves, no physics, no time pressure). Proposed extension: `daily_deduction` (spec §13, Q-10). |
| Current level | **L0 not met** (own leaderboard and analytics POSTs, no bridge). |
| **Metropolis target** | **L0 required; L1 if practical.** Cartridge compliance, Free Play, normalized deduction result, no MiniCoin/economy deployment. Preserve the same `gameId` so economy can be enabled later without resetting history. |

## Evidence

**Confirmed:**
- **Today's answer is computed in the client.** `q(date)` hashes the UTC date string (FNV-1a + murmur finalizer) mod the bundled coin list `U`, then skips coins used in the previous 60 days and retired coins. Epoch is `2026-03-24` (bundle, `let V=new Map;function q(e)…`). The date comes from the **device clock**: `G()` = `new Date().toISOString()`. Anyone can compute today's or any future answer from the console.
- Free (random) mode: `J()` picks with `Math.random` (bundle). The README calls this "Free Play Mode: random coins, unlimited rounds".
- 6 guesses, 6 clue categories (type, color, launch year, ticker length, price range, FDV range) (README). Easy mode adds a 90-day Pyth sparkline. **Hint system** reveals categories, picked with `Math.random` from the unrevealed ones (bundle).
- Price-range clues use **tiers from `/api/prices`**, which the README describes as cached Pyth snapshots refreshed by a midnight-UTC Vercel cron (`api/cron/daily`). Live prices (`/api/live`, polled ~30 s) are display-only.
- `/api/live` is a server proxy to Pyth Hermes with a secret `PYTH_API_KEY`. It returns **502** when Hermes answers non-OK or the fetch throws (`route.ts` lines ~60–86), and 400 for no known ids. This explains the reported 502s. Not reproduced at 5:30 PM PT (200 OK).
- Leaderboard: the client POSTs `{userId, username, puzzleNumber, guesses, won}` and the server upserts it to Supabase with **no verification** (`api/leaderboard/route.ts` POST). `userId` = `crypto.randomUUID()` in `localStorage['coindle-uid']`. Daily board ranked by guesses, then `created_at`.
- Analytics: the client POSTs `{mode, difficulty, result, guesses, answer, userId}` to `/api/analytics` (bundle). Also `/api/reports` for clue reports.
- Local state: `coindle-stats` (played, won, streak, maxStreak, distribution), `coindle-daily` (guessed tickers, gameOver, won), `coindle-username`.
- **No completion timer** in code (no timer/elapsed state). The countdown is only "time until the next puzzle" (README).
- No wallet code. The `ethereum` hits are coin-list entries. Has `fc:miniapp` meta (Farcaster mini-app embed). No `X-Frame-Options`/CSP. Mobile-first responsive layout.

**Inferred:**
- An iframe embed should work as-is (already a Farcaster mini-app). Not tested in a frame.
- The 502s are upstream Hermes issues (auth, rate, or metered key) or cold starts. They only affect live display, not puzzle correctness, because clues use cached tiers.
- Supabase free-tier pausing has taken the boards down before (`cron/daily` comment, April 2026). Buy Bounce's tables live in the same project.

## Mode mapping

| Token Arcade | Coindle today | Change |
|---|---|---|
| Free Play | Daily (local) + Free Play (random), easy/hard, hints | Keep both as Free Play. In arcade mode hide the own leaderboard and username prompt. Emit `RunResult` (solved, guesses, hints, elapsed ms) for host display or "sign in to keep your streak". |
| Ranked Run | — (the daily board is client-trusted) | Needs `server_authoritative`: the verification service picks the puzzle, keeps the answer, judges each guess (`ta:move`), freezes the price-tier snapshot per puzzle, and times the run server-side. |
| Community Raid | — | Same judge, a fixed puzzle set per raid, answers hidden until `endsAt`. Probably not needed for Metropolis. |

Objectives (PROPOSED): `SOLVE` → primary `solved` (1/0), then `guesses` asc, `hintsUsed` asc, `elapsedMs` asc, `verifiedAt` asc. Streak is a Passport stat owned by the arcade, not a cartridge metric.

## Gap table

| Action | Item | Why | Effort | Level |
|---|---|---|---|---|
| Add | SDK adapter in the Next.js app (client component). Arcade mode via `?ta=1` + handshake | Spec §3.4, §4 | S | L0 |
| Remove (arcade mode) | Leaderboard button + `/api/leaderboard` GET/POST, username prompt | Spec §11; [H §12] | S | L0 |
| Alter (arcade mode) | Analytics POST: drop it, or strip `answer` and route stats to the host | Spec §11 (beacons) | S | L0 |
| Add | Completion timer (ms from first guess or puzzle open) + `hintsUsed` counter | [H §7, §18 "timer"] | S | L0/L1 |
| Add | `RunResult` on game over: `primaryMetric = solved`, `secondary = {guesses, hintsUsed, elapsedMs, difficulty}` | Spec §7 | S | L0 |
| Add | Pause semantics: no sim, but stop the timer on blur/hidden in Free Play. Host mute → `et()` sounds | Spec §5 | S | L0 |
| Keep | Pyth sourcing + feed-transparency card. Add graceful "prices unavailable" state on `/api/live` 502 | [H §15 Rule 7] | S | L0 |
| Alter | Hide or disable "deploy MiniCoin" with the reason line (host-side Admin UI, not the game) | [E §3, §14; R §7] | — | — |
| Add | **Server judge** (verification-service module): `startPuzzle(runId)` → `{puzzleId, coinListVersion, tierSnapshotId}`, `guess(runId, ticker)` → clue row. Answer never sent until the run ends | Spec §10.6 | M–L | L1 |
| Remove (ranked) | Client-side `q(date)` answer derivation and coin-attribute table usage for the answer. Hints chosen server-side (no `Math.random`) | Spec §11 | M | L1 |
| Alter | Freeze price/FDV tiers per puzzle number server-side (cron snapshot keyed by puzzle), so clues don't drift with live prices | Determinism | S | L1 |

## Top 5 changes

1. SDK adapter + arcade-mode gating (hide leaderboard and username, stop leaderboard/analytics POSTs).
2. Add a completion timer and hints counter. Emit `RunResult` (solved/guesses/hints/ms).
3. Graceful degraded state when `/api/live` fails (502), since live prices are cosmetic.
4. (For Ranked) server-authoritative judge with the answer and tier snapshot held server-side, client relays guesses via `ta:move`.
5. Remove the client-side daily answer derivation from any ranked path. Keep it for Free Play only.

## Draft `cartridge.json`

```json
{
  "id": "coindle", "name": "Coindle",
  "description": "Guess the mystery crypto in six tries. Powered by Pyth price feeds.",
  "version": "1.0.0", "artwork": { "card": "https://coindle.xyz/og-image.png" }, "developer": { "name": "droober" },
  "supportedModes": ["free_play"], "supportedObjectives": ["SOLVE"],
  "communityOptional": true, "minicoinOptional": true,
  "integrationLevel": "L0", "skeleton": "daily_deduction",
  "entry": { "url": "https://www.coindle.xyz/?ta=1", "origin": "https://www.coindle.xyz", "kind": "iframe" },
  "inputs": ["pointer_tap", "touch_tap", "keyboard", "text"], "orientation": "any", "mobile": "full",
  "runLength": { "typicalSec": [60, 300], "maxSec": 3600 },
  "scoring": { "SOLVE": { "primary": "solved", "order": "desc", "secondary": ["guesses", "hintsUsed", "elapsedMs"], "tieBreak": ["guesses:asc", "hintsUsed:asc", "elapsedMs:asc", "verifiedAt:asc"] } },
  "determinism": "server_authoritative", "seedPolicy": "server_secret_answer",
  "cosmeticSlots": [],
  "minicoin": { "eligible": false, "reason": "COIN/RWA economy path is unavailable/unverified; keep Economy Coming Soon per current Source of Truth" },
  "verifier": { "kind": "server_authoritative" },
  "removedInArcade": ["leaderboard", "username prompt", "analytics answer beacon"]
}
```
`determinism` describes the **Ranked target**. The Free Play build stays client-side. `minicoinOptional: true` uses the Handoff's meaning: the game doesn't require a coin [H §7]. `minicoin.eligible: false` is what keeps the Admin Console's deploy switch disabled [E §3, §14].

## Risks / conflicts / questions

- The Handoff wants "Free Play/daily/archive logic" [H §18]. No archive mode exists in the build. Add one (client-side is fine for Free Play: past puzzle numbers), or drop it.
- Answer secrecy vs "same coin for everyone" daily: a server judge is the only credible Ranked path. If there isn't time, ship Coindle as Free Play only, which matches the Economy plan.
- Pyth key and metering: if arcade traffic spikes, `/api/live` 502s will rise. Raise the CDN cache or degrade gracefully.
- Positioning: keep the deploy switch disabled with a reason [R §7]. Never mock a COIN pool.
