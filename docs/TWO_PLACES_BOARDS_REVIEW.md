# Two Places 1.1: level boards and shuffled raids

## Implemented

All 20 authored levels have their own Passport speedrun board. A server-issued level is bound to its input replay; fastest active time wins and more apples breaks a tie. Every active frame counts, including restart inputs and death animations. The game mechanics and authored levels are unchanged.

Raids share one shuffled order of all 20 levels, derived from the raid seed. Players can finish early using the cartridge's Finish raid run button. The verifier accepts a completed prefix and an optional unfinished final level; rank is levels beaten, then apples from cleared levels, then active time. Every accepted attempt contributes its completed levels to the display-only community goal. The best attempt ranks individually.

Free Play still starts at level 1 with browser saves and full progression. The embedded level-clear path now records its unlock before sending the result to the host, and continues to the next level normally. Account saving and browser merge are the shared sprint item.

## Version and review boundaries

The 1.1.0 cartridge has frozen source, assets and a dedicated verifier. Existing published 1.0.0 records, score rules and URLs remain intact; new installations offer 1.1.0. Upgrading an existing published record remains an explicit review/rollout step. No existing ledger is rewritten.

The handoff did not prescribe a raid run length. This draft retains the existing verifier's 30,000-frame budget (8m 20s active play) inside the existing ten-minute issued session. Runs also end shortly before the session/raid deadline. Early finish, counting only cleared-level apples, and the active-play cap are visible tuning choices for the queued human review. A hidden or suspended browser can miss the closing deadline, as with other competitive cartridges.

Human playtesting and raid demos are parked per the user's instruction to move on with the sprint. No production deploy or live raid was performed.

## Automated validation

- 125 tests pass, including real replay verification and signed-auth HTTP acceptance, all 20 board histories, time/apples ties, per-level Passport records, shared raid order, partial raids, goal totals, malformed inputs, frame limits, and legacy persistence.
- Native cartridge bridge checks cover 1.0 ranked plus 1.1 ranked, raid and Free Play. Free Play verifies the saved unlock and continuation into level 2.
- Root TypeScript and the production build pass. Physics/levels were copied unchanged; no new level-solvability claim is made.

The compact replay codec keeps a maximum input trace below the dedicated 128 KiB authenticated submission limit. Free Play progress remains client-controlled and is not accepted as competitive proof.
