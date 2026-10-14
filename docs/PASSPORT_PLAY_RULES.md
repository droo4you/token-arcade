# Passport Play rules

Approved by droober, 2026-10-13. Status markers: **LIVE** = enabled on `grok/final-stretch`,
**PLANNED** = agreed rule, not built yet.

## The two tracks (headline rule)

| Track | What feeds it | Where it shows | Status |
|---|---|---|---|
| **Records** | Verified **Passport Play** runs only | Leaderboards, raids, Passport best scores/wins | **LIVE** (Uppers, Two Places, Skrumpey Slide, Skip to 10K) |
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
| **Uppers** (paired community eMONAD; Buy Bounce skeleton) | Random seed, unlimited retries | Issued seed + 390×844 playfield; server replays the seeded input track | **LIVE** |
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

## Final mode naming (droober, Oct 13 2026)

| Mode | Who | Stakes | What it does |
|---|---|---|---|
| **Free Play** | Anyone, guest OK | None | Play instantly. Nothing is recorded. |
| **Passport Play** | Signed-in players | Free | Saves progress (Progress track, planned). Verified seeded records feed leaderboards (Records track). |
| **Community Raids** | Signed-in players | Free | Time-boxed windows on a cabinet with set, bigger rewards. Only verified Passport Play runs count. |
| **Power Play** | Signed-in players | Small MiniCoin entry | **POST-SUBMISSION spec. Not built.** See below. |

## Power Play (POST-SUBMISSION spec)

> **Status: spec only.** It supersedes the v0 cut "paid entry only after submission". Paid entry is still not live for the hackathon submission. Nothing here is deployed and no chain transaction is sent.

- **Entry:** pay a small MiniCoin entry fee, like dropping an arcade token. The player then gets one seeded run, verified the same way as Passport Play.
- **Payouts:** small payouts come from that cabinet's **Community Asset Vault**. Examples:
  - Pay in the Uppers token and win eMONAD.
  - Pay in the Skrumpey Slide coin and win WMON. That vault mostly saves toward a Skrumpey NFT raid, so payouts stay small.
- **Not purely skill: ticket orbs.** Buy Bounce-style ticket orbs are collected during the run. Each orb is one entry in a payout draw. Every paid run gets at least 1 entry and can reach roughly 11, so longer runs earn more chances. The orb count comes from the verified replay, not from what the client claims.
- **Records stay separate.** Power Play runs can also post verified records, but leaderboards never weight paid entries.

### Open questions
1. **Randomness source** for the draw: Chainlink-style VRF on Monad, a commit-reveal scheme (the server commits to a seed before the window, then reveals it), or another option. It must be auditable and resistant to server manipulation.
2. **Entry price** per cabinet and per token, and whether it is fixed in MiniCoin or pegged to a value.
3. **Payout caps per vault:** the maximum per draw and per day, and a reserve floor so savings goals (e.g. the Skrumpey NFT raid) are protected.
4. **Regulatory / gambling review:** paid entry plus a random prize may count as a lottery or gambling in many jurisdictions. This needs legal review, geo-gating and age gating, and possibly a free alternative way to enter, before launch.
5. **Draw cadence:** per run, per window, or per raid.
6. **Vault accounting and indexer coverage** (Envio) for entries and payouts.
