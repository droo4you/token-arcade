# Skrumpey 1.4.0 raid review

## Behavior

Passport Play ranks by score, then rescued Skrumpeys, then acceptance time and run ID. Community Raids pin the cabinet version, share one seed and allow exactly three issued attempts, including abandoned attempts. Each player's best run is selected with the same ordering. Every accepted run contributes rescued Skrumpeys to a separate display-only community total.

Final standings select the winner used by the existing funded-raid settlement and automatic-payout path. Community totals never enter that selection. This change does not alter custody contracts or broadcast a transaction.

The new 1.4.0 release copies frozen 1.3.0 assets and physics, changing only the simulation version stamp. Its separate version prevents new rescue tie-breaks from reordering existing boards. Old releases remain available; old raids keep their original attempt policy and score-only ties. Casual browser/account progress uses the same save key.

## Validation

152 tests pass, TypeScript passes, and the production build passes. Coverage includes concurrent attempts, shared seeds, abandoned runs, invalid raid policies, real HTTP replays and forged rescue metrics, versioned Passport bests, per-player best-run selection, total rescues, immutable final standings, the settlement winner, and existing automatic-payout retry protections. HTTP asset checks serve the frozen release and dependencies. Source comparisons confirm unchanged physics and assets.

The funded settlement test uses local fixtures; it does not prove a real wallet received funds. Cross-browser/device playthroughs and the user's live automatic-payout raid remain queued.

## Rollout and review queue

The six preceding sprint PRs (#29–#34) were merged into main at `cf81be6`; that tree matches the validated sprint integration source. This follow-up targets Skrumpey 1.4.0.

Existing operator-managed cabinets do not silently change their version when code merges. Drain outstanding sessions and open/unsettled funded raids, then update and review the manifest with version `1.4.0`, adapter `skrumpey-slide`, objective `score`, and entry `/skrumpey-slide/v/1.4.0/`. The local publishing helper contains the updated manifest and mode guide. Do not use that local-demo helper against production. Create a new raid after the version is published; old raid records cannot issue 1.4.0 attempts.

For the user's full sprint review, confirm the deployed cabinet versions first: Mood Swings 2.0.0; Coindle, Skip and Two Places 1.1.0; Skrumpey 1.4.0 after this follow-up. A Git merge alone is not confirmation that Render deployed successfully or that each stored cabinet manifest was upgraded.

Exercise guest saves, sign-in merge, sign-out isolation and another device; then each ranked mode and the raid limits. For the payout review, use the configured automatic-payout vault and verify final standings, the recorded entry wallet, transaction confirmation and wallet receipt. Leave already funded legacy raids pinned to their committed rules.

Nuts-funded character unlocks, Coindle badges/share themes and additional art polish remain separate cosmetic work.
