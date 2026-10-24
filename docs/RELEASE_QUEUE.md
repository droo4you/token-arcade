# Token Arcade release queue

Updated 2026-10-23. This is the current handoff for both Codex and Grok. It supersedes branch/deployment instructions in the older RESUME and RELEASE_TASKS notes; those remain historical evidence.

## Where work belongs

- `main` is the production source for the API/web app and cartridge service. A local preview or a feature branch is not a production release.
- Codex is reconciling the release queue in `codex/reconcile-release-queue`. Grok's original branches remain intact; their reviewed commits are merged into this integration branch.
- Start new work from current `origin/main`. Keep each gameplay change in its own PR. Check this queue before starting overlapping work.
- Merge only after review and relevant checks. Confirm the API release SHA and served cartridge assets before calling a change live.
- Score-changing game updates require a versioned cartridge and matching verifier. Preserve old competitive runs and the hackathon snapshot (`metropolis-submission`).
- Render's existing paid plans, disks and authentication settings are authoritative. Do not reapply the old example `render.yaml`.

## Release map

| Work | Source / author | Status and next action |
| --- | --- | --- |
| Coindle price hints and consistent cabinet labels | Codex follow-up to PR #11 | Prepared for release: server-selected normalized 90-day chart, stale-puzzle protection, legacy no-hint rules preserved and separate ranked standings. Cabinet mode labels restored to Free Play / Passport Play / Community Raid. Generalized creator challenge metadata remains a follow-up in PASSPORT_PLAY_RULES.md. |
| Skrumpey Slide 1.2 momentum and controls | Codex, PR #16 | Live. Preserve this reviewed release when reviewing other branches. |
| Free Play summaries and lifecycle analytics | Codex, PRs #18–19 | Live at `c170ce8`. Guests/accounts, start/exit/result coverage, Skip starting upgrades, Two Places level context. |
| Automatic testnet payouts | Codex, PR #17 | Enabled in Render on Oct 22 after explicit approval; live health confirms `automaticPayouts: true` on chain 10143. A real player raid with automatic delivery is still the next acceptance test. See AUTOMATIC_PAYOUTS.md. |
| Skip Free Play glide/support and rock prices | Codex, PR #6 | Included in this release. User approved 11.5% growth per rock on Oct 22, replacing the branch's 6.7%. Competitive standard-v1 physics remain unchanged. |
| Coindle history cache | Grok, PR #10 | Included in this release; persistence, background refresh and request deduplication tests pass. |
| Coindle Rapid Fire + community totals | Grok, PR #11; Codex integration | Included in this release. Conflicts resolved against main with cache, analytics and payouts preserved. Server enforces 180 seconds / 6 guesses, rejects expired starts and forged scores, ends on pool exhaustion without repeats, and exposes the guessed coin's price tier. Raid lobby shows every verified run's community contribution. Daily Free Play stays available. |
| Dark mode v2 | Grok, PR #20, `grok/dark-mode-v2` | Reviewed for release against current main: build, header toggle, saved preference after reload and cabinet/roadmap contrast checked. Fixed inherited text colors on nested dark surfaces. PR #20 is the release source. |
| Two Places QC / level selection | Grok, PR #4 | Not live. Changes levels and collision behavior; needs a versioned game/verifier release before competitive rollout. Its Skrumpey sentry art is inside Two Places, not Skrumpey Slide. Preserve the new start-context tracking when integrating main.js. |
| Legacy raid readiness CLI | Codex, PR #3 | Not live. Inspects the original fee-funded vault, not the new automatic payout vault. Low priority; retain as a legacy diagnostic or explicitly replace it. Never use it to claim automatic payout readiness. |
| Canyon Jump 3D | Grok, `grok/canyon-jump-3d` (`8c6d8ea` at review) | Separate Render preview (`canyon-jump-3d-preview`), not a published arcade cabinet. Needs gameplay approval, cartridge integration and verifier review. |
| Skrump Lab | Grok, `grok/skrump-lab` (`a5b3d26` at review) | Separate Render preview (`skrump-lab-preview`), not a published arcade cabinet. Active simulation/weapon tuning; needs gameplay approval and cartridge integration. |
| Canyon Jump original | Grok, `grok/canyon-jump` | Separate older preview (`canyon-jump-preview`). Do not silently merge it alongside the 3D experiment. |
| Mainnet MiniCoins / community assets | Protocol follow-up | Not live. Payout proof, asset-specific reward handling, fee-routing migration and a reviewed funded deployment plan remain required. No mainnet transactions are authorized by this release. |

## Immediate order

1. Automatic payout activation is verified. Deploy and verify the tested Skip/cache integration.
2. Run the next real funded testnet raid; verify the fixed winner receives the reward without a claim signature or gas balance. Verify the new vault's Envio coverage separately.
3. Coindle Rapid Fire is integrated; next publish Two Places through a versioned release and review dark mode PR #20.
4. Review Grok's preview games separately. Keep mainnet planning separate from testnet evidence.

## Checks for this integration

- Application suite: 110 tests pass.
- Skip: finite gas, deliberate support timing, anti-mash behavior and legacy competitive replay parity pass.
- Skip metadata/mission checks pass with the approved 11.5% price growth.
- Production build passes.
- Testnet secret is stored only through Render's environment UI; no key belongs in Git, chat, PRs or these documents.

Update this file in each release PR with what moved, what remains and the verification evidence. Do not label planned changes as live based only on a PR merge.

## Coindle integration checks (Oct 23)

- 115 application tests pass, including server timing, rule limits, expired starts, no-repeat exhaustion, forged-score rejection, board tie ordering and cumulative community totals.
- Production build passes.
- Isolated browser check: local player started a timed round, guessed BTC, skipped with answer reveal, finished early and received a verified score and rank. No synthetic results were submitted to production.
- The original PR #11 is updated directly so the conflict badge and release state remain attached to the same work item.
