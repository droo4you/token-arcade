# Coindle Cartridge

Upstream: `https://github.com/droo4you/coindle`, pinned in `UPSTREAM_COMMIT` at `1131534ace997fd83cb9c0721a7b7708b9de5b3a`.

The hosted entry is `arcade/main.tsx`, built into `arcade-dist` and served at `/coindle/v/1.0.0/` on the separate Cartridge origin. It renders the original React `GameProvider`, `Header`, `GameBoard`, clues, daily/random selection, native results, hints and local stats. The original Next app and routes remain available for its standalone deployment. Its Apache 2.0 license is retained.

## Lifecycle and identity

- The shared Token Arcade bridge validates host origin/channel and supplies the deployed cabinet's `gameId`. The adapter accepts Free Play and does not require that ID to equal `coindle`, allowing separately published cabinets to share this Skeleton.
- Start mounts React. Native guess completion emits a single normalized result: guesses as the primary metric, solved/hints/active elapsed time/daily mode/hard mode/streak as secondary metrics.
- Pause blocks input via the bridge overlay, excludes paused time and suspends audio. Resume restores it. Destroy unmounts React, aborts outstanding client price requests, clears polling, closes audio and invalidates queued sounds; the host removes the frame. Restart remounts the native daily screen, whose saved daily state persists; Random Free Play starts another puzzle.
- Local daily history, stats and theme use `ta.<gameId>.<native-key>`. No wallet or economy exists inside the Cartridge.
- Hosted play disables the upstream public leaderboard, username registration, report submission and analytics calls. Token Arcade owns publication, sessions and any future competitive leaderboard.

## Price data and Free Play

`gameApiUrl()` directs the hosted game's read-only data to `/api/coindle/{prices,live,history}`. The Cartridge server proxies these GET routes to the platform API. `createCoindleHandler()` permits only known active Pyth feeds, validates historical timestamps, caches data, and keeps `PYTH_API_KEY` on the server.

If that key is absent or Pyth is unavailable, the game remains playable with its five static clues. The price clue and chart explicitly display unavailable. Missing data never becomes a fabricated tier or a false green match.

The daily answer remains derived in the client as in the original game. Therefore this version advertises **Free Play only**. Ranked or raid play needs a server-authoritative puzzle/answer protocol before publication. The existing normalized Free Play result is not competitive evidence.

The COIN/RWA association is descriptive Registry metadata. MiniCoin Economy remains Coming Soon under the same deployed `gameId`; this import creates no token, pool, strategy or contract address.

## Checks

From the repository root:

```powershell
npm --prefix cartridges/coindle ci
npm --prefix cartridges/coindle run build:arcade
npm --prefix cartridges/coindle run test:arcade
node node_modules/typescript/bin/tsc --noEmit -p cartridges/coindle/tsconfig.arcade.json
node --experimental-strip-types apps/api/test/coindle.test.ts
```

The three Cartridge tests cover native missing-price clues, stable daily selection and normalized completion/pause/storage behavior. The five API tests cover explicit missing configuration, method/feed/timestamp restrictions, native data schemas, daily/live/history caching and safe upstream failure. The production Cartridge build and isolated TypeScript check pass. The root task also performs the browser smoke check.
