# Gap report: Skip to 10K

> **ALIGNMENT NOTICE (v0.3):** This is a first-pass Implementation/Research Note, not a Source of Truth. Re-audit the actual supplied repository before coding. Any older replay-only, L2/L3, community-role, or public-branding language below is subordinate to the v0.3 Cartridge Spec/Checklist and the current Product/Economy Sources of Truth.


| | |
|---|---|
| URL | https://skip-to-10k.vercel.app |
| Observed | 8 Oct 2026 ~5:30 PM PT. Public build: `index.html` + `src/{font,sprites,sim,meta,art,audio,main}.js` (2,357 lines total). No `/api` (404), no public docs. |
| Role in current sources | Existing Cabinet with **ETH/WETH community concept**. No reskin. Required: Cartridge/Free Play now; keep economy-compatible metadata, but do not hardcode or deploy against an unverified bridged WETH path. Stretch second MiniCoin only after the primary Skrumpey loop is stable and asset infrastructure is verified. |
| Skeleton | `commit_and_simulate`. Pebble Dash is a listed member: "angle → power meter, water-skip bounces, nudge props". Light Momentum-Pump flavour (tilt, bounces, RC lift). Progress lives outside the run in the GWEI upgrade shop, the skeleton's defining trait. *Confirmed by code structure.* |
| Current level | **L0 not met** (no bridge). Simulation is **already close to L2** (`replayable-v8`). |
| **Metropolis target** | **L0 required.** L1/L2 if cheap from existing deterministic architecture. L3/economy is stretch and gated on verified ETH/WETH infrastructure. |

## Evidence

**Confirmed:**
- `src/sim.js` is a **pure simulation with no DOM** ("Loaded as a classic script in the browser and through vm in tests", line 1) and exports `module.exports = SIM`. It also has a `botInput()` test bot.
- Fixed step `DT = 1/120` (sim.js:4). The client loop accumulates scaled frame time and calls `SIM.step(run, input)` per `DT` (main.js:425–437). The frame delta is clamped to 0.05 s (main.js:1059–1063).
- Seeded integer PRNG (mulberry32 variant, sim.js:96–104). World chunks are seeded per chunk, `rng(run.seed * 31 + i * 7919)` (sim.js:126), so spawns don't depend on frame timing.
- **Seed is rolled with `Math.random`** in `toAim()` → `SIM.newRun(save.up, (Math.random()*2**31)>>>0)` (main.js:303).
- **Run stats depend on the local upgrade save**: `SIM.newRun(save.up, …)`. `UPGRADES` arm/rock/hands/aero/bounces/rc/volume up to level 5, bought with GWEI earned per run plus missions (sim.js `UPGRADES`, `stats(up)`; main.js:319–324).
- Implementation-approximated math inside the sim: `Math.cos/sin` (`throwRock`, sim.js:187), `Math.atan2` (:197), `Math.hypot` (:192), `Math.sin` in hit boxes (:293, :295). → `replayable-v8`, not portable.
- `new Date` in the sim only formats the HUD date label (`dateAt`, sim.js:17). It's not scored, and it's UTC-fixed.
- Time cap: the run ends at `run.t > 900` sim seconds (sim.js, end of `step`).
- `results()` returns `days, peak (rounded $), vwap, skips, perfects, bestStreak, gems, earned, broke5k, broke10k, era, reason`.
- Inputs: aim by pointer drag (angle/power floats) or keys. In flight: skip (edge), bounce (edge), rc (edge), tilt −1/0/+1 from ↑/↓ or on-screen buttons (main.js:143–150). Edges are applied on the first sub-step of a frame.
- Client-side time effects: `GAME_SPEED = 0.8`, slow-mo `G8.slow` (×0.35), tutorial ×1.3 (main.js:26, :426–429). They change wall-time per tick, not tick semantics.
- Pause: Esc/P and an on-screen button. Auto-pause when a phone is held upright (main.js:64, :118, :1045). `blur` only clears keys and the aim drag (main.js:50). There's no pause on blur or hidden.
- Mute `M`, persisted (main.js:53). Save in `localStorage['skip10k.v1']` (gwei, upgrades, missions, rocks, best).
- Fixed logical canvas `W=480, H=270` (art.js:2), integer-scaled. Phones get a "turn your phone sideways" overlay (`index.html`).
- **No network calls, no wallet, no leaderboard** (no `fetch`/XHR/`ethereum` in any file). No `X-Frame-Options`/CSP.
- Rock collection (`save.rocks`, `buyRock` with `Math.random`) is cosmetic only (`drawRock(save.rock…)`).
- News content includes "SKRUMPEYS SKRUMP ONTO MONAD" and a `skrump` entity. That's a ready-made community hook.

**Inferred:**
- Replay should be bit-exact on V8 (Chrome/Node), given fixed DT, seeded RNG, and per-tick inputs. Not executed here.
- Safari/Firefox could diverge because of `sin/cos/atan2/hypot` in `step`. Needs testing, or a portable-math port.
- The aim angle/power floats need quantizing (e.g. 0.1°, 1/1000 power) before logging.

## Mode mapping

| Token Arcade | Today | Change |
|---|---|---|
| Free Play | The whole game: shop, missions, rocks, tutorial | Keep as is. GWEI stays a local soft currency. **It is not a MiniCoin** and must never be presented as one. |
| Ranked Run | — | Host seed + **fixed `rules.loadout`** (e.g. all upgrades at level 2, admin-set). Ignore `save.up`. No GWEI or mission payout from ranked runs (or pay out locally, cosmetic only). |
| Community Raid | — | Same as Ranked plus a fresh seed per (raid, player, attempt) revealed at attempt start, replay verification, and an aggregate raid score (default best N−1 sum of `meters`, spec §10.4.2/§10.8). Per-chunk seeding (`run.seed*31+i*7919`) works unchanged with per-attempt seeds. Candidate Economy Raid game for the stretch MiniCoin [E §14]. |

Objectives (PROPOSED): `PEAK_PRICE` (primary `peak` $, desc), `DISTANCE` (primary `days`, desc). Secondaries: `perfects`, `bestStreak`, `gems`. Tie-break: secondaries → fewer ticks → `verifiedAt`.

## Gap table

| Action | Item | Why | Effort | Level |
|---|---|---|---|---|
| Add | SDK adapter (mount → `toAim` with seed, run end → `RunResult` from `SIM.results`) | Spec §4–§7 | S | L0 |
| Add | Pause on blur/hidden + `ta:pause/resume` (reuse `G8.paused`). Host mute → `Audio8.setMuted` | Spec §5 | S | L0 |
| Keep | Landscape-only on phones. Declare `orientation:"landscape"` | Spec §5 | — | L0 |
| Keep | Shop, missions, rocks, and tutorial in Free Play | [H §0] preserve working code | — | L0 |
| Alter | Ranked/Raid: seed from `MountConfig.seed`. Stats from `rules.loadout`, never `save.up`. Disable the tutorial bot | Spec §9, §11 | S | L1 |
| Add | Input log hook at the `SIM.step` call site: `[tick, {skip,bounce,rc edge bits, tilt}]` + quantized throw `{angle, power}` | Spec §7, §10.3.6 | S | L1 |
| Add | Headless `verify.js`: vm-load `sim.js`, replay the log, compare `results()` | Spec §10.3.7. `sim.js` is already DOM-free | S–M | L2 |
| Alter | Portable math in `sim.js` (`sin/cos/atan2/hypot` → deterministic versions, cf. Buy Bounce `dsin`). Bump `simVersion` | Spec §10.2 | M | L2 |
| Add | Determinism CI (same seed+log → same hash, 30–240 Hz) | L2-01/09 | S | L2 |
| Add | `cosmeticSlots`: `rock_skin` (maps to the existing rock garden), `thrower_skin`. A Skrumpeys holder rock is a natural L3 cosmetic | Spec §6 | S | L3 |
| Remove | Nothing economic to remove (no wallet/board). Keep "earn GWEI" copy clearly in-game only | [E §17] | — | — |

## Top 5 changes

1. SDK adapter + pause-on-blur + host mute (L0).
2. Ranked rules: server seed and a **fixed loadout** that replaces the local upgrade save.
3. Per-tick input log captured at the `SIM.step` boundary, with quantized throw parameters.
4. Node `verify.js` reusing the DOM-free `sim.js` (L2 skeleton is mostly there).
5. Portable math port of `sim.js` so Safari runs replay identically (required for raids).

## Draft `cartridge.json`

```json
{
  "id": "skip-to-10k", "name": "Skip to 10K",
  "description": "Skip an Ether Rock across eleven years of crypto history and try to break 10K.",
  "version": "1.0.0", "artwork": {}, "developer": { "name": "droober" },
  "supportedModes": ["free_play"], "supportedObjectives": ["PEAK_PRICE", "DISTANCE"],
  "communityOptional": true, "minicoinOptional": true,
  "integrationLevel": "L0", "skeleton": "commit_and_simulate",
  "entry": { "url": "https://skip-to-10k.vercel.app/?ta=1", "origin": "https://skip-to-10k.vercel.app", "kind": "iframe" },
  "inputs": ["pointer_drag", "touch_drag", "keyboard"], "orientation": "landscape", "mobile": "landscape_only",
  "runLength": { "typicalSec": [30, 180], "maxSec": 900 },
  "scoring": { "PEAK_PRICE": { "primary": "peak", "unit": "usd", "order": "desc", "secondary": ["days", "perfects"], "tieBreak": ["days:desc", "ticks:asc", "verifiedAt:asc"] },
               "DISTANCE": { "primary": "days", "order": "desc", "tieBreak": ["peak:desc", "ticks:asc", "verifiedAt:asc"] } },
  "determinism": "replayable-v8", "simVersion": "s10k-sim-1", "tickHz": 120, "seedPolicy": "per_attempt",
  "cosmeticSlots": [{ "id": "rock_skin", "kind": "sprite" }],
  "minicoin": { "eligible": false, "reason": "Stretch only (E §14); requires L2 first" },
  "removedInArcade": ["local upgrades in ranked/raid"]
}
```
`typicalSec` is inferred (not play-tested here).

## Risks / conflicts / questions

- ~~C-3~~ **Resolved (D-3, 8 Oct):** a stretch MiniCoin game. The Handoff lineup omission is timing only. Suggest adding it to the Handoff lineup as "stretch" under change control [INDEX §9].
- Upgrade-dependent balance: choosing the ranked loadout is a product decision (admin config). Level 0 is described as "already a fun rock" (sim.js `stats` comment).
- Run length up to 15 min makes raid sessions and token expiry longer. Set `expiresAt` ≥ 20 min.
- Research's "paired with ETH" caution applies if it ever gets a MiniCoin: pair with WMON [R §7; E §6].
