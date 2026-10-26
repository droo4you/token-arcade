# Coindle 1.1.0 — raid pools and best of three

Each new raid draws a private 40-coin set from the common active coin catalog. The server persists it separately from public raid metadata. Every attempt randomly draws without replacement from that set; the public raid seed does not determine answers. Pools survive API restarts. Solving or skipping reveals only the current answer, never the remaining pool/order. The pool is intentionally shared within a raid, so observing enough completed puzzles can reveal membership; independent draws prevent replaying another account's order, not all possible information sharing.

Three attempts per player, including abandoned attempts. Rank the best verified attempt by coins solved, fewer total guesses, then fewer explicit skips. Exact ties retain stable acceptance-time/run-ID ordering. The community goal sums all accepted solves and has no effect on rankings or rewards. The 180-second server clock and six-guess limit remain unchanged. Exhausting guesses is not a skip; consuming all 40 coins ends the run.

## Version and rollout

- New cabinets use game version `1.1.0`, adapter/skeleton `coindle-v2`, and `/coindle/v/1.1.0/`.
- Passport rules use `rapid-fire-v2`; raids add `selection: hidden-pool-40-v1`. No pool members are placed in rules, run configs or API responses.
- Existing cabinets keep version 1.0.0 and adapter `coindle`. Drain sessions/raids, pause, update the manifest entry and adapter together, then follow normal review/deploy. Startup never silently changes an existing Coindle cabinet.
- Build produces separate 1.0.0 and 1.1.0 bundles. The old arcade entry and Rapid Fire UI are retained under `releases/1.0.0`; unchanged Daily/Practice components and art are shared. The v1 server verifier still accepts historical ledgers without a skip field. Old boards/raids retain their original tie-break.
- Art, Daily/Practice, streak cosmetics and account-saving work are outside this PR. MiniCoin stays coming soon.

## Review queue

Automated checks cover pool privacy/persistence, distinct raid pools and independent draw order, exhausted pools, skip verification, three-attempt limits, best-run standings, separate community totals, old server rules and retained cabinet configuration. Human gameplay, demos and raid rehearsal are queued per the sprint instruction; do not hold the next implementation task for them.
