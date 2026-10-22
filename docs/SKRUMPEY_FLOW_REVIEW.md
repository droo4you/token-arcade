# Skrumpey raid flow review — 2026-10-21

## Latest preview validation (supersedes initial preview figures below)

User approved the feel of the deeper opening valley. Current preview also includes S/Down/Space dive bindings, contextual controls, shorter jumps, a one-time runner-exit boost, and no meadow/dunes plateau spikes. Published builds remain frozen.

24 seeds (`flow-check-0` through `flow-check-23`, converted with dailySeed) completed bot runs with finite physics and matching replay scores. Score range: 6,367–28,936; distance: 2,336–3,173 m; duration: 64.7–71 seconds; runner time: 15–23%; exit boosts: 1–2; falls: 0–2. These are bot outcomes, not player targets or a guarantee of fun. Course invariants previously checked across 100 seeds still pass.

All three skrumpeyTouch tests pass: swipe/tap separation, independent Jump/Dive pointers, and cancelled/unrelated pointer handling. Physical-phone layout, rotation, audio and gameplay feel still require a human test.

Phone preview served on this machine's Ethernet LAN address: http://192.168.86.250:8798/preview/?seed=1800810676 (same Wi-Fi required; host firewall/VPN may affect reachability). HTTP checks for the page, sim and touch script returned 200 from this machine; phone reachability is not yet confirmed. Alternate tested seeds: 2703856213, 2687078594, 2670300975. Start LAN server with PREVIEW_HOST and PREVIEW_PORT environment variables using scripts/preview-skrumpey-flow.mjs. No production deployment performed.

## Reproduction

Funded raid c96bcb61-bf72-4f7c-ac4e-c71a02defb60 used rules 1.1.0 and issued seed c2c6fae7c6873d48f3cbfb57e0b94e28 (simulation seed 1800810676).

Regenerating that course reveals zero rollers or bigRamp chunks before 4,000 m. From 939 m onward it alternates lane/rest chunks. Lane bodies increased from 230 m to 510 m while biomes remain 640 m long; crossing biome boundaries schedules rest then lane again. Boundary checks also precede pending-lane checks, which can produce consecutive rests. This crowds out momentum terrain independently of player input.

First 4,000 m, measured by chunk length (lane includes entry/exit transitions):

| Build, same seed | Lane chunks | Rest chunks | Rollers + big ramps |
|---|---:|---:|---:|
| Frozen 1.0.0 | 1,553 m | 1,058 m | 481 m |
| Raid 1.1.0 | 2,233 m | 1,035 m | 0 m |
| Local preview | 1,180 m | 621 m | 1,466 m |

This comparison uses this raid's seed in both engines; it does not recreate the first raid's different seed.

## Player evidence

These are the final board's best accepted runs, not all attempts:

| Player | Score | Distance | Perfect landings | Hits | Falls |
|---|---:|---:|---:|---:|---:|
| Guy | 58,331 | 3,702 m | 16 | 4 | 0 |
| droober | 53,327 | 3,529 m | 12 | 3 | 0 |
| beezwax | 45,917 | 3,526 m | 12 | 2 | 0 |
| playhouse | 37,669 | 3,705 m | 15 | 7 | 0 |
| willllliam | 7,142 | 1,478 m | 3 | 0 | 0 |

Playhouse reached slightly farther than Guy but had more hits and fewer collectibles (183 vs 237). William's best run had no hits or falls, so obstacle collisions alone do not explain his shorter run. Input-by-input analysis is still needed; perfect-landing totals include flat-runner jumps and do not establish good hill flow.

Accepted raid results are stored with their result JSON, including replay proofs, in accepted_results. The public leaderboard exposes only summary metrics; production input proofs have not been retrieved for this review. Guest Free Play stores bounded summaries, not full replays. Do not describe the deterministic bot runs as player recordings.

## Local preview

- Two stages, 150 + 170 m, keeping speeds 36 and 42.
- Every lane chunk is followed by rollers then a big ramp before biome transitions can interrupt.
- Dive physics, landing thresholds and score formula retained for an initial course-only comparison.
- Draft rules version 1.2.0-preview; frozen 1.0.0/1.1.0 builds and API verifier remain unchanged.
- Start with `node scripts/preview-skrumpey-flow.mjs`; open http://127.0.0.1:8797/preview/?seed=1800810676. The local page links to the frozen raid build on the same seed. No server score submissions.

Checked 100 generated seeds through 12 km for two-stage runners and mandatory roller/ramp recovery. Repeated bot runs on the raid seed were deterministic and completed. Preview bot score is lower (8,216 vs 24,326 on 1.1.0); this is not evidence of worse play, but confirms scores are incompatible. Human playtesting of momentum, first-minute accessibility and phone controls is required before publishing any new version.

Next analysis: export this raid's accepted results and run-session configs from the production database; replay each using frozen 1.1.0; measure lane/hill time, speed, held-dive duration, launch quality, collisions and daylight loss. Compare each player's attempts without importing their old score into a new rules version.
