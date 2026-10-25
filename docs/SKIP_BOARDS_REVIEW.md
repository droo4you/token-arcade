# Skip to 10K four boards: review queue

Version 1.1.0 adds Open, Zero, Mid and Max Passport boards. A server-issued run binds its board, seed and rules; the verifier replays the frozen cartridge physics with the same balance as Free Play. Version 1.0.0 remains available with its existing verifier and distance boards. Existing installations keep their published version until an explicit reviewed upgrade; new installations offer 1.1.0.

## Rules implemented

- Open uses the player's browser upgrades, selected rock and collection/rank gwei bonuses. Zero, Mid and Max lock rocks and use all upgrades at 0, 3 and 5 respectively.
- Score is distance in days times the peak-price multiplier: 1x below $5K, 2x from $5K, 3x from $10K and 4x from $30K. More gwei breaks a tie. Mid level 3 and the multiplier values are initial tuning choices; the handoff specified the thresholds but not those values.
- Ranked boards and Passport bests are separated by board and version.
- A raid issues exactly three attempts in order: Zero, Mid, Max. Assignment occurs inside the session transaction. All players share one raid seed. Only a completed set of three verified runs gets a ranking; the score and gwei are summed.
- Starting a run spends that raid slot, including an abandoned run. Community distance counts every accepted run; the $10K goal counts distinct players. These goals do not determine prizes.
- The full Free Play game and browser progression remain available. Account saves/merge belong to the separate shared-progress sprint item.

## Limits and deferred review

The server verifies Open's bounded loadout and replay, but cannot prove browser upgrades or rocks were earned. Browser saves are client-controlled. Fixed boards do not trust those values. Authoritative progression is a later integration concern, not a claim made by this PR.

Human playtesting, a live raid rehearsal and tuning are queued per the user's instruction to move to the next sprint task. Art and skins are deferred. This draft is not a production rollout or approval to change an existing published cartridge record.

## Automated evidence

121 tests pass, including the cartridge bridge, multiplier boundaries, all four real replay paths, forged scores/loadouts, independent board histories, versioned Passport bests, concurrent raid issuance, partial/full raid sets, distance and unique-player goals, legacy upgrade retention, and cartridge version routing. A long replay submission reaches verification within the bounded body limit. Root TypeScript and the production build pass.
