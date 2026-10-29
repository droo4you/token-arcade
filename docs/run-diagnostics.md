# Investigating interrupted competitive runs

New Passport and raid runs record server issuance, submission receipt, acceptance and rejection codes. Each server request has an `X-Request-Id` also stored in its events. Diagnostics never award scores or alter attempts.

The browser reports mount/load/handshake stages, ready and start signals, tab visibility, focus, connectivity changes, pause/resume, completion, fatal errors, timeout and teardown. Each mount has a distinct ID, event sequence and elapsed milliseconds. Browser and OS are broad categories; no raw user agent, URL, token, message text, stack trace or replay is collected. `start` is the host's start command; `playing` is the cartridge's run-start notification. Neither should be inferred from `issued` alone.

Using an authenticated admin session, request either:

- `GET /api/admin/run-diagnostics?raidId=<website raid ID>`
- `GET /api/admin/run-diagnostics?runId=<issued run ID>`

Reports include the latest 1,000 events in receipt order and flag truncation; narrow a truncated raid report to a run. Use mount ID and sequence to order client observations because delivery can be delayed or reordered. Server events are authoritative; browser observations are unverified diagnostic evidence. Server events include the deployed release SHA.

For a blank game, check whether issuance was followed by `mount`, `hello`, progress synchronization, and `ready`. A `timeout` reports visibility and the last progress stage. A second mount ID on the same run indicates remounting; another `issued` event indicates another attempt. `rejected` with `ATTEMPT_LIMIT` explains a later lockout. Compare submission failures using request ID with the server rejection code.

Events expire from reports after 30 days and are deleted on startup and subsequent writes. Client events require ownership of an existing run, close 24 hours after its expiry, and are capped at 120 per player/minute and 200 per run. Each browser reporter sends at most 80 events. Diagnostic delivery is best effort, with no retries, and cannot interrupt gameplay. A killed browser, absent network or failed authentication may leave missing events; absence does not prove what happened. This instrumentation cannot reconstruct interruptions predating its deployment.
