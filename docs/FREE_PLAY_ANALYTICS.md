# Free Play analytics

Admin location: `/admin-tools#free-play-analytics`.
API: `GET /api/admin/free-play/report?days=7` (1, 7 or 30 days; curator authentication required).

Existing capture already accepts both guest and signed-in Free Play results. The host submits finished results, strips replay proofs, and retries transient delivery once. The API derives account identity from authentication, limits fields/rate, and deduplicates run IDs. These reports do not award competitive scores or Passport progression.

The report groups by game, version and objective. It includes guest/account run counts, reported completed/failed outcomes, min/median/90th percentile/max, duration and every available numeric game metric. Missing metrics are excluded rather than treated as zero. Up to 25 recent runs per group expose their individual metric details. Download report exports the displayed aggregates and recent samples as JSON; it is not a complete raw export of every run.

The time filter uses server receipt time. At most the newest 10,000 summaries are analyzed, with the total and truncation disclosed. Account IDs and guest identifiers are omitted from this report. Counts describe runs, not unique people.

## Starts, exits and starting conditions

The host sends bounded, unverified observations to `POST /api/free-play/events` when an embedded Free Play run starts or exits. The report groups starts by game/version/objective and distinguishes finished runs, observed exits without results, and unresolved runs. A later result supersedes an earlier exit. Duplicate observations retain the first start context.

This table uses starts received in the selected window; result statistics use results received in the window. They are different cohorts and their totals need not match. Each is independently capped at the newest 10,000 records with truncation disclosed. Historical starts cannot be backfilled.

Skip captures starting rocks owned, wallet gwei and upgrade levels. Two Places captures a zero-based levelIndex and levelCount. Starting conditions are shown beside recent results when available. These snapshots are sent only in Free Play and do not change competitive rules or scores.

## Interpretation limits

- Reports are unverified client data. Use them to explore game balance, not to award prizes.
- A game's “completed” outcome may mean a run ended, including a loss; it is not a universal win or completion rate.
- Exit capture is best effort: navigation, restart, fatal cartridge errors and page departure can be observed, but offline delivery or a killed browser can be missed. Unresolved means no result or exit was received, not a confirmed quit. Switching tabs pauses play and does not count as an exit; cached back-navigation pages also remain unresolved until another observation arrives.
- Duration comes from client timestamps and can include pauses. The game may separately report elapsedMs or ticks.
- Free Play loadouts and levels can vary. Older runs and games without start context show no snapshot. Do not combine different conditions into a competitive leaderboard.
- Standalone cartridge previews outside the arcade host are not captured by this path.

Verification: API guest/account capture and deduplication, curator-only report access, allowed time windows, grouping, percentiles, missing metrics, receipt-time filtering and identity omission are tested. Browser checks use an isolated in-memory fixture, never production player data.
