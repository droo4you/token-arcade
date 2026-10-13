# Passport Play rules

Approved by droober, 2026-10-13. Status markers: **LIVE** = enabled on `grok/final-stretch`,
**PLANNED** = agreed rule, not built yet.

## The two tracks (headline rule)

| Track | What feeds it | Where it shows | Status |
|---|---|---|---|
| **Records** | Verified **Passport Play** runs only | Leaderboards, raids, Passport best scores/wins | **LIVE** (eMONAD, Two Places, Skrumpey Slide, Skip to 10K) |
| **Progress** | Signed-in **Free Play** | Passport casual progress only: levels beaten, apples, best casual runs | **PLANNED** (post-hackathon) |

- Progress **never** touches leaderboards or raids, however good the run. It is casual, unverified, and
  labeled as such.
- Records are only written after the server has issued the seed/rules and re-verified the run.
- Free Play stays wallet-free and account-free. Anonymous Free Play keeps local scores only.

## What "Passport Play" means

A graded attempt:
1. The player (signed in with Privy) asks the API for a run. The server issues a one-shot session:
   run ID, **seed**, reviewed **rules**, start time, and expiry.
2. The cartridge plays exactly that seed/rules and returns a result plus a **proof** (input log).
3. The server **replays the proof with the game's own deterministic simulation**, recomputes the score
   and run details, checks timing against the session, and only then writes standings/raid entries.
4. A session can be completed once (`RUN_CONSUMED`). A proof from one session fails on another, because
   the seeds differ.

Reusable pattern: `apps/api/src/seededReplay.ts` (`createSeededReplayVerifier`). A game supplies its seed
mapping, its proof decoder and a `simulate(seed, inputs)`. The pattern enforces the issued seed, a complete run
(the sim reached its end state, with no padded input after it), the recomputed score and details, and wall-clock
plausibility.

## Per game

| Game | Free Play | Passport Play | Status |
|---|---|---|---|
| **eMONAD** (Buy Bounce) | Random seed, unlimited retries | Issued seed + 390×844 playfield; server replays the seeded input track | **LIVE** |
| **Two Places** | The full 20-level campaign, for fun | **Server-picked level time trial**: ranked uses the issued level, and raids use an issued 3-level set; server replays fixed-step inputs (apples rank before time) | **LIVE** (ranked level 0 by default; per-session random level PLANNED) |
| **Skip to 10K** | Players may max out upgrades | **Fixed standard loadout** (`standard-v1` = all upgrades at level 0) + issued seed → `SIM.issuedSeed`; the cartridge sends `{v:1, seed, loadout, angle, power, input}` (one char per 120 Hz tick: tilt, skip, bounce, rc); the server replays the throw and every tick with `sim.js` and recomputes days, peak, skips, perfects, streak, gems and time. Saved upgrades are ignored | **LIVE** on this branch |
| **Coindle** | Daily puzzle | **Streak mode** until the first miss; tie-break = fewest total guesses; **the server holds the answers and reveals the next coin only after a guess**. Alternative: a timed mode with 3 lives | **PLANNED**: server-authoritative, not replay-based |
| **Skrumpey Slide** | Random seed | Issued seed → `SIM.dailySeed(seed)`; the cartridge sends `{v:1, seed, input}` (one char per 60 Hz tick); the server replays `sim.js` in a VM and recomputes score, distance, combo, perfects, DN, kills, hits, falls, rescued, train and ticks | **LIVE** on this branch |

### Notes
- Skip to 10K: the reviewed ranked rules are `{ loadout: "standard-v1" }`. The verifier rejects sessions without that rule
  and proofs that claim any other loadout. Upgrades, missions and gwei stay Free Play/local only.
- Coindle: a server-authoritative game (`verifier.kind = "server_authoritative"`). The answers never reach
  the browser before a guess is made.
- Progress track (PLANNED): a new `/api/me/progress` endpoint keyed to the Privy user, written by signed-in Free Play
  `run_complete` events. It is stored apart from `accepted_results`, so leaderboards and raids can't read it.
