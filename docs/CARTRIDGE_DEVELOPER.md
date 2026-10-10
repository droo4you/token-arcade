# Build another Token Arcade Cartridge

**Label: Implementation Note.** Product Handoff and Economy v0.2.2 remain authoritative. `cartridges/skip-to-10k` is the reference static integration; its real simulation and gameplay are preserved behind the existing lifecycle.

## Required artifact

1. Keep gameplay/rendering inside the build. Suppress standalone account, wallet, payment, leaderboard-write and analytics integrations in the hosted path. Preserve provenance and licenses.
2. Load `/sdk/hosts.js` and `/sdk/bridge.js` before the hosted entry. For an external game origin, serve those reviewed files with your deployment's allowed Token Arcade host origins. Do not reflect arbitrary query origins into the allowlist.
3. Register the lifecycle below. Use issued seeds/rules for competitive modes. Reject unsupported modes/versions. The host supplies identity fields.

```javascript
TokenArcade.register({
  version: '1.0.0',
  mount(config) { /* initialize; namespace local saves by config.gameId */ },
  start() { if (TokenArcade.beginRun()) startNativeGame(); },
  pause() { /* stop simulation, clear held input, suspend audio */ },
  resume() { /* reset clock accumulator, restore audio/input */ },
  restart() { if (TokenArcade.beginRun()) restartNativeGame(); },
  destroy() { /* cancel frames/timers, unmount UI, remove listeners, close audio */ },
});

// Only when the native run actually ends:
TokenArcade.complete({
  result: 'completed', // or failed
  primaryMetric: nativeScore,
  secondaryMetrics: { elapsedMs: activeMilliseconds },
  // proof: gameSpecificProof, if a reviewed competitive verifier uses it
});
```

Call `beginRun()` for each new native Free Play run. Competitive runs get one start/result per server session. Intermediate level transitions belong to the same run. `TokenArcade.paused` must stop native updates; the overlay alone is insufficient.

Use SDK result types in `packages/sdk/src/index.ts`. Completion time is milliseconds. Include meaningful native secondary metrics. Do not claim game-local scores are verified.

## Manifest and admission

Submit through `/launch` or authenticated `POST /api/creator/games`:

```json
{
  "manifest": {
    "id": "my-new-cabinet",
    "name": "My Cabinet",
    "description": "A short gameplay description.",
    "developer": "Your studio",
    "version": "1.0.0",
    "adapterId": "my-skeleton",
    "skeletonId": "my-skeleton",
    "supportedModes": ["free"],
    "supportedObjectives": ["score"],
    "communityOptional": true,
    "minicoinOptional": true,
    "entry": {
      "kind": "iframe",
      "url": "https://games.example/my-game/v/1.0.0/",
      "origin": "https://games.example"
    },
    "presentation": { "genre": "Arcade", "palette": "cyan", "glyph": "✦" },
    "controls": { "touch": true, "orientation": "any" }
  },
  "economy": { "status": "coming_soon", "reason": "Optional economy awaits review." }
}
```

The operator explicitly configures `ALLOWED_CARTRIDGE_ORIGINS`. HTTPS is required except loopback. URL must include the manifest's `/v/<version>/`; deploy that artifact immutably. Bundled sources are mutable local development builds. `CARTRIDGE_ORIGIN` points initial imports at the artifact server. `ARCADE_HOST_ORIGINS` controls which hosts may embed them.

Admin validation records `builds`, `mounts`, `destroys`, `resultSchema`, `mobile`, `sourceReviewed`, plus notes. Approval checks all requirements; it never publishes. The submitting creator then chooses Deploy. Revision requires another review. A published new cabinet appears automatically on the shelf.

## Competitive enablement

A server verifier is an intentional installation step. Register by reusable adapter ID in `apps/api/src/verifiers.ts`, with server-owned rules/timeouts. Verify exact version, complete native run, seed/level selection, metrics and bounded proof. API session binding owns cabinet identity; reusable verifiers must not force deployments onto one ID. Test duplicate Skeleton deployments with independent histories, changed rules/versions, forged metrics, partial runs, replayed sessions, raid attempts and paused cabinets.

Do not promote client scores using only range checks. If authoritative judging is unavailable, ship Free Play and document the gap. A game does not need a MiniCoin to publish.

## Local checks

```powershell
npm test
npm run build
npm run dev
```

Play native controls at desktop/phone sizes; check touch/orientation, end screen/result, pause/resume, leave/remount, restarts and audio cleanup. SDK reference tests run a full Skip simulation through the real bridge. API tests exercise generic submission → approval → owner deployment without a homepage change. Source-specific harnesses remain with each game.

### Native start gates

The short example above starts a simulation immediately. For a game with a native start gesture, call `beginRun()` at that gesture instead. eMONAD calls it on the first paddle grip, matching its original simulation start; opening its screen alone is not gameplay. Two Places calls it when its selected level begins. Coindle calls it on a new native puzzle run; Skip calls it at its native aim/run transition.

Actual bridge smoke commands:

```powershell
node cartridges/emonad-cabinet/tools/arcade-bridge.test.js
node cartridges/two-places/tests/arcade-bridge.mjs
npm --prefix cartridges/coindle run test:arcade
npm test
```
