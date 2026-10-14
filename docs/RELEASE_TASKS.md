# Release handoff — 2026-10-13

Deadline supplied by droober: 8:59 PM Pacific. Focus on a demonstrable, accurate submission.

## Release policy

`main` should be the canonical production branch. Codex will push the same tested release to `main` and `grok/final-stretch` so the existing Render auto-deploy receives the fixes. Once both Render services show that revision healthy, switch their source branch to `main`. Preserve the current paid/always-on plans, persistent disks, origins and Privy settings. The checked-in `render.yaml` is an older free/ephemeral example: do not reapply it over the live service settings.

## Grok Bot — hosting and indexer

1. Fetch `main`; work on a new branch from it. Do not rewrite Codex's worktree, `.env.testnet`, or deployment record. Confirm both Render services deployed the merged release, then switch both services to `main` with auto-deploy retained. Report exact commit and health checks. Leave all demo login flags off in production.
2. Run `npm ci` in `indexer`, then `npm run addresses`, `npm run codegen` and `npm test`. Use `contracts/deployments/monad-testnet.json` as the address and starting-block source. No NFT vault was deployed in this loop: leave NFT indexing unconfigured rather than implying a live NFT contract.
3. Bring up Envio against 10143, verify the recorded RaidOpened/settled/claimed lifecycle and fee distribution against the transaction receipts. Report the query endpoint and one verified result. Do not call the indexer live until it has caught up. Any paid hosting choice needs droober's approval.

## QA agent — live game and identity checks

Use the live site with a normal player account. Test guest Free Play, Privy sign-in, Passport Play on Uppers/Skip/Skrumpey, seed replay rejection, persistence after refresh, avatar upload/removal, and mobile orientation. Record actual results and browser/device; avoid recording guessed passes. Do not mutate production leaderboards directly or enable demo authentication. Put fixes on a separate branch; leave economy contracts and deployment records to Codex.

## Presentation agent — submission evidence

Prepare a short demo script: guest play -> Passport Play -> leaderboard -> community raid concept -> verified testnet swap/fee/claim receipts. Distinguish what is live on the website from the testnet contract demonstration. Power Play, automated NFT purchases, production trading UI and a mainnet economy are not shipped. Use public explorer links from the deployment evidence. Deliver copy and screenshots for droober to review; do not submit the hackathon entry on their behalf.

## Droober

- Finish physical-device touch/orientation check for the published Skrumpey artifact and report any failure before approval.
- Review the live demo and submission recording; submit before the deadline.
- Keep the generated testnet-only wallet separate from future mainnet custody. Mainnet requires reviewed liquidity, spend limits and a concrete approved deployment plan.

## Codex / next economy integration

The creator UI now supports reviewed basic test-token deployment. The full v4 economy was deployed by the testnet script. Connecting that graph to the production token request, trade UI, indexed raids, verified winner settlement and claim UX remains work. The demo loop uses the operator as winner and a demo result hash; it is not evidence of automatic game-result settlement.
