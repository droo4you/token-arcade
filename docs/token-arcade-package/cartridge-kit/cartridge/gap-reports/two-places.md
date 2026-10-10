# Gap report: Droober & RC: Two Places at Once

> **ALIGNMENT NOTICE (v0.3):** This is a first-pass Implementation/Research Note, not a Source of Truth. Re-audit the actual supplied repository before coding. Any older replay-only, L2/L3, community-role, or public-branding language below is subordinate to the v0.3 Cartridge Spec/Checklist and the current Product/Economy Sources of Truth.


| | |
|---|---|
| URL | https://droober-two-places.vercel.app |
| Observed | 8 Oct 2026 ~5:30 PM PT. Public build: `index.html` + `src/{audio,font,input,levels,levels2,main,render,render2,sprites,touch,world}.js` (2,844 lines). Public `CLAUDE.md` (served by the deployment). No `/api` (404). |
| Role in current sources | Existing Cabinet associated with **Skrumpeys ERC-721**. Preserve the game; no broad reskin. Required: Cartridge + Free Play + Ranked-ready; Raid-compatible 3-level structure where practical. Additive Skrumpey enemies/traits/content are later content work, not a Cartridge requirement. |
| Skeleton | `course_navigator` (authored levels, full body control, reach the exit). It's Fireboy-and-Watergirl-like: two characters with split abilities. *Confirmed by `CLAUDE.md` "Ability split" and the level data.* |
| Current level | **L0 not met** (no bridge). The sim is deterministic in structure (`replayable-v8`, inferred). |
| **Metropolis target** | **L1 required.** Structure for L2 Raid-ready where practical using the strongest verifier justified by the repo; deterministic replay is optional rather than mandatory. |

## Evidence

**Confirmed:**
- Fixed 60 Hz step: `while (acc >= 1000/60 && steps < 5) { update(); … }`, with the frame delta clamped to 100 ms (`main.js:308–314`). `update()` takes no `dt`.
- Level time is an **integer tick counter**: `game.levelTime++` while `w.state === 'play'` (`main.js:91`). Displayed as m:ss from frames/60 (`render.js:480`). Restarts and deaths keep the time running (`startLevel(i, keepTime=true)`, `main.js:26–31, 88, 92`). Deaths are counted ("OOPS").
- Best per level is stored locally `{time, apples, total}` (`main.js:124–127`) in `localStorage['droober-two-places-v1']`, with sequential unlocks (`save.unlocked`).
- Collectible = **apples** (`w.applesGot()`, `appleTotal`). `CLAUDE.md`: "Apples are the collectible everywhere."
- 20 authored levels: World 1 (JUICE RUN … TWO PLACES AT ONCE), World 2 (GOO GROTTO … SHROOM BOOM) (`levels.js`, `levels2.js`). No procedural generation, so no seed is needed.
- Input is polled once per update into `held`/`pressed` over 14 abstract actions. Sub-frame taps are kept via `downs` (`input.js`). Keyboard, **gamepad** (`navigator.getGamepads`), and a **touch layer** `TouchPad` all feed the same actions (`input.js:31`, `touch.js`). Touch auto-enables on `(pointer: coarse)` or the first `touchstart` (`touch.js:58–60`).
- `Math.random` is used only in fx/particles and audio: `world.js:711` (confetti), `:884–885` (wind fx), `:893–896` (dust), `render.js:181`, `audio.js`.
- Implementation-approximated math in sim code: `Math.hypot` (`world.js:276, 504, 510, 629`), and `Math.cos/sin` in dust fx (:896).
- No `Date`/`performance.now` in sim. `performance.now` is used only in the loop driver.
- Pause menu on Esc/P (`main.js:87, 101–108`). `blur` only clears keys (`input.js:27`), with no auto-pause. While paused, `levelTime` does not advance.
- Mute `M`. Fixed logical view `384×216` (`render.js:2`), scaled to fit. On touch devices a handheld shell is shown (portrait = Game Boy, landscape = wide).
- `CLAUDE.md`: "run `node tests/solve.mjs`… bot routes… are the proof each level is solvable"; `tests/physics.mjs`.
- No network calls, wallet, or leaderboard. No `X-Frame-Options`/CSP.

**Inferred / to verify:**
- `world.js` probably runs headless in Node already, since `tests/solve.mjs` drives bots through levels. The tests folder isn't public, so I haven't seen it.
- fx arrays look visual-only (`this.fx.push`). Confirm they never feed collisions.
- **Discrepancy with the play-test note "keyboard-only, no touch"**: the deployed build contains a full touch layer (`touch.js`, `CLAUDE.md` "Mobile"). Either the note predates it or touch failed on the tested device. Re-test on iOS Safari and Android.
- `Math.hypot` results can differ across engines in the last bit. Raids need it replaced with `Math.sqrt(dx*dx+dy*dy)` (or proof that the branch outcomes are insensitive).

## Mode mapping

**Community note:** Skrumpeys is a Community Asset association, not a fungible pair. Do not broadly reskin Two Places.


| Token Arcade | Today | Change |
|---|---|---|
| Free Play | Level select with sequential unlocks, local bests | Keep. |
| Ranked Run | — | Host `levelSet: [levelId]` (or a daily level), unlock gate bypassed. Result = completion ticks, apples, deaths. |
| Community Raid | — | Host `levelSet` of **three levels** [H §7], played back-to-back as one attempt. The same `levelSet` is used on every attempt (authored levels, `fixed_level_set`). Per-attempt seeds don't apply, and rehearsal is inherent and stated in the rules (spec §10.4.2). Per attempt: completed all 3 → apples total (desc) → total ticks (asc) → `verifiedAt` [H §7 ranking + spec §10.7]. **Raid aggregate (PROPOSED, §10.8):** `best` (single best attempt) suits a time/completion game better than a sum. With `best_n_sum`, use the asc-metric rule (only completed attempts count). |

Objectives (PROPOSED ids): `COMPLETION_TIME` (primary `ticks` asc, valid only if completed), `STARS` (apples desc, then ticks asc).

## Gap table

| Action | Item | Why | Effort | Level |
|---|---|---|---|---|
| Add | SDK adapter: mount → `startLevel(levelSet[0])`; level complete → next in set or `RunResult` | Spec §4–§7 | S | L0 |
| Add | Pause on blur/hidden (reuse the pause screen) + `ta:pause/resume`. Host mute | Spec §5 | S | L0 |
| Alter | Declare mobile honestly: `touch:true` if re-test passes, otherwise `keyboard_required` and the host warns on coarse pointers [H §15 Rule 6] | Spec §5 | S | L0 |
| Add | Ranked/Raid: `levelSet` from host, skip unlock gate, don't overwrite local bests (or write to a separate key) | Spec §9 | S | L1 |
| Add | `RunResult`: `primaryMetric = total ticks@60`, `secondaryMetrics = {apples, appleTotal, deaths, levelsCompleted}`, `result: completed/failed/abandoned` | [H §7]; spec §7 | S | L1 |
| Alter | Scored-run pause policy: keep the level hidden behind the pause overlay (or keep the timer running) so pausing can't be used as free planning time | Q-8 | S | L1 |
| Add | Input log: per-tick 14-bit action bitmask, delta-encoded at `Input.poll()` | Spec §10.3.6 | S | L1 |
| Add | Headless `verify.js` reusing `world.js` + `levels*.js` (as `tests/solve.mjs` does), replaying the bitmask log | Spec §10.3.7 | M | L2 |
| Alter | `Math.hypot` → `Math.sqrt(x*x+y*y)` in sim. Bump `simVersion`. Cross-engine test | Spec §10.2 | S | L2 |
| Keep | Authored levels, integer frame timer, bot-route tests | Already ideal for replay | — | — |
| Add | Optional cosmetic slots `droober_skin`, `rc_skin` (sprite sheet swap) | Spec §6 | M | L3 |

## Top 5 changes

1. SDK adapter + pause-on-blur + host mute (L0).
2. Host-driven `levelSet` (single level for Ranked, three levels for Raid) bypassing unlocks.
3. `RunResult` with integer ticks, apples, deaths, and completion validity [H §7].
4. Per-tick action-bitmask input log, then a Node verifier reusing `world.js` (L2).
5. Re-test and declare touch support. Replace `Math.hypot` in the sim.

## Draft `cartridge.json`

```json
{
  "id": "two-places", "name": "Droober & RC: Two Places at Once",
  "description": "Puzzle-platformer: Droober walks, RC flies. Get both through.",
  "version": "1.0.0", "artwork": {}, "developer": { "name": "droober" },
  "supportedModes": ["free_play", "ranked_run"], "supportedObjectives": ["COMPLETION_TIME", "STARS"],
  "communityOptional": true, "minicoinOptional": true,
  "integrationLevel": "L1", "skeleton": "course_navigator",
  "entry": { "url": "https://droober-two-places.vercel.app/?ta=1", "origin": "https://droober-two-places.vercel.app", "kind": "iframe" },
  "inputs": ["keyboard", "gamepad", "touch_tap"], "orientation": "any", "mobile": "full",
  "runLength": { "typicalSec": [30, 300], "maxSec": 1800 },
  "scoring": {
    "COMPLETION_TIME": { "primary": "ticks", "unit": "ticks@60", "order": "asc", "secondary": ["apples"], "tieBreak": ["apples:desc", "deaths:asc", "verifiedAt:asc"] },
    "STARS": { "primary": "apples", "order": "desc", "tieBreak": ["ticks:asc", "verifiedAt:asc"] }
  },
  "determinism": "replayable-v8", "simVersion": "tp-sim-1", "tickHz": 60, "seedPolicy": "fixed_level_set",
  "cosmeticSlots": [],
  "minicoin": { "eligible": true, "reason": "Optional later MiniCoin/Community Strategy; not deployed by the Cartridge integration" }
}
```
`mobile: "full"` is pending the touch re-test. `typicalSec` is inferred.

## Risks / conflicts / questions

- Handoff gives Two Places a Community Raid [H §7]. The Economy demo plan lists only Free Play and Ranked [E §14]. Not a conflict (the demo plan is a subset), but decide whether a Two Places raid is in the demo.
- Rehearsal is inherent to authored levels. That's fine for a speedrun-style raid, but say so in the raid rules.
- Which three levels? A product/admin choice. Recommend levels the bot routes prove solvable, and avoid the tutorial levels.
