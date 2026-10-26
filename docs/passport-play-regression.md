# Passport Play follow-up

Reported during cross-device review: Skip progression synced, but Passport loadouts were unclear; Two Places always issued level 1, New attempt left the page unresponsive, and Free Play had no unlocked-level menu.

## Findings and changes

The hosted API still returned Skip and Two Places 1.0.0 manifests, so the newer selectors and rules were never enabled there. Startup now upgrades only canonical, untouched platform legacy imports to their reviewed 1.1.0 releases, preserving the cartridge origin, status, economy, Passport data and historical results. Active/unexpired sessions, sessions without a valid deadline, and any unfinished raid defer migration (finalized free raids are complete; funded raids must settle or cancel) until a later restart. Edited cabinets are not overwritten. Historical results remain stored and separate from current boards.

Passport Play now has an explicit setup screen: Two Places offers all 20 speedruns; Skip explains Open (saved loadout and rocks), Zero (0), Mid (3) and Max (5), with rocks disabled on fixed boards. Free Play unlocks do not restrict speedrun selection.

New attempt creates a new Player route/lifecycle while retaining the selected mode, level, board and raid. Mount/start/completion callbacks ignore disposed views. Issuing a run has a request timeout and a retry action. The original freeze was not reproduced conclusively; the repaired repeat-attempt flow was verified locally.

Two Places Free Play opens Continue / Choose level, exposes a MENU control during play, and disables locked levels. Opening this menu ends the current unsaved level attempt; Continue starts the highest unlocked level. Earlier unlocked levels can be replayed. The legacy bridge saves a clear before emitting its completion.

## Validation

- 152 automated tests pass, including native bridge replay, unlock persistence, locked-level rejection, replay of earlier levels, route preservation, guarded startup migration and retained history.
- Local browser: replayed real level-1 inputs through the native cartridge twice, received verified receipts, clicked New attempt between them, selected/issued level 7, and navigated away without refreshing. A local-only fixture replayed the input trace and adjusted its issued start time to permit immediate verification; no fixture code is shipped.
- Free Play menu rendered in the local embedded cartridge. Cross-device/browser playtesting remains the user's review pass.

## Deployment check

Deploy cartridge assets before the API/web release. Confirm `/api/games` exposes `skip-to-10k-v2` and `two-places-v2`, both version `1.1.0`, before calling the mode rollout live. If guarded migration defers, finish/expire old sessions and finalize/cancel old raids through the normal flow, then restart the API. Never delete history or force a version switch around those guards.
