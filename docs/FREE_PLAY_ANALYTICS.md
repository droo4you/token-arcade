# Free Play analytics

Admin location: `/admin-tools#free-play-analytics`.
API: `GET /api/admin/free-play/report?days=7` (1, 7 or 30 days; curator authentication required).

Existing capture already accepts both guest and signed-in Free Play results. The host submits finished results, strips replay proofs, and retries transient delivery once. The API derives account identity from authentication, limits fields/rate, and deduplicates run IDs. These reports do not award competitive scores or Passport progression.

The report groups by game, version and objective. It includes guest/account run counts, reported completed/failed outcomes, min/median/90th percentile/max, duration and every available numeric game metric. Missing metrics are excluded rather than treated as zero. Up to 25 recent runs per group expose their individual metric details. Download report exports the displayed aggregates and recent samples as JSON; it is not a complete raw export of every run.

The time filter uses server receipt time. At most the newest 10,000 summaries are analyzed, with the total and truncation disclosed. Account IDs and guest identifiers are omitted from this report. Counts describe runs, not unique people.

## Interpretation limits and next instrumentation

- Reports are unverified client data. Use them to explore game balance, not to award prizes.
- A game's “completed” outcome may mean a run ended, including a loss; it is not a universal win or completion rate.
- There are no start/abandon events in this dataset. It cannot measure quits, conversion, all play sessions, or dropped uploads.
- Duration comes from client timestamps and can include pauses. The game may separately report elapsedMs or ticks.
- Free Play loadouts and levels can vary. Skip already reports upgrades, earnings and peak price. Two Places reports deaths/apples/completed levels but does not consistently identify the selected Free Play level. Do not combine different conditions into a competitive leaderboard.
- Standalone cartridge previews outside the arcade host are not captured by this path.
- Next: start/end/abandon coverage, consistent level IDs and start-of-run loadout snapshots in reviewed future cartridge versions. Preserve frozen competitive releases when adding instrumentation.

Verification: API guest/account capture and deduplication, curator-only report access, allowed time windows, grouping, percentiles, missing metrics, receipt-time filtering and identity omission are tested. Browser checks use an isolated in-memory fixture, never production player data.
