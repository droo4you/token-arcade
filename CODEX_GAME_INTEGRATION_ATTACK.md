# Token Arcade — Game Integration Attack

You are working in the existing Token Arcade repository after the initial Metropolis frontend and application shell build. This run integrates four existing games as Token Arcade cartridges and makes the arcade ready for a later game submission. Inspect the actual code and documents before choosing the integration design.

The package accompanying this prompt contains:

1. `Token_Arcade_Documentation_Index.pdf`
2. `Token_Arcade_v0_Metropolis_Handoff.pdf`
3. `minicoin-economy-v0.2.1-codex-ready.pdf`
4. `cartridge-kit.zip`

The four game repositories are supplied separately by the user, alongside this package or in the working folder. Their URLs or local paths are not specified in this prompt. Use the exact repositories supplied; if one is missing, identify that blocker instead of guessing a repository or substituting a different game:

| Source repository | Intended Token Arcade deployment |
| --- | --- |
| Buy Bounce | New, publicly eMONAD-branded cabinet; Buy Bounce is the internal gameplay source/skeleton |
| Two Places at Once | Existing game associated with Skrumpeys |
| Coindle | Existing game, COIN/RWA concept, game live before its economy |
| Skip to 10K | Existing game, ETH/WETH concept |

**These are the only four initial game repositories. Skrumpey Slide is deliberately withheld.**

## Document authority and change control

Read the Documentation Index first. The **Metropolis Handoff** is the source of truth for product and application behavior, including account flows, game modes, the Registry, and creator/admin UX. **MiniCoin Economy v0.2.1** is the source of truth for protocol and economic behavior. The **Cartridge Kit** is an implementation note and conversion aid subordinate to both. Read its specifications, schemas, checklist, and game gap reports, but treat its examples as examples.

The current founder decisions in this prompt supersede older lineup, branding, and verifier assumptions in the handoff or kit. In particular, an old kit example with a public `buy-bounce`/“Buy Bounce” listing does **not** define the public eMONAD cabinet, and an old requirement that every raid or MiniCoin game use deterministic replay does **not** define the current Score Verifier policy. If a substantive conflict between the two sources of truth remains, report it with citations to the relevant sections instead of silently making a new product or protocol decision.

Do not attach or use the older `minicoin-economy-v0.2` as authority. Do not treat brainstorms, chat exports, individual game code, or the Cartridge Kit as another source of truth.

## Current founder decisions

### One skeleton can support multiple independent cabinets

A skeleton is reusable gameplay logic; a cartridge is a game that conforms to the host interface; a cabinet is a published deployment that players see. A community association and an optional MiniCoin/economy configuration are separate concerns. Reusing the same skeleton for a second community creates a **new cabinet/deployment with its own game ID, scores, leaderboard, raids, Community Asset association, and optional MiniCoin**. Do not combine scores across deployments merely because their mechanics came from the same repository. A Player Passport may summarize a player's history across cabinets; that does not make a shared competitive leaderboard. Do not create a skeleton-wide leaderboard by default.

Keep deployment identity distinct from source repository identity. The eMONAD cabinet's public name and MiniCoin ticker have not been finalized; use the product's established naming/configuration path and label it as an eMONAD cabinet without inventing a final brand or ticker. Keep “Buy Bounce” only as an internal source/reference where useful. Preserve the scored path through a presentation-only reskin. Changes to physics, collisions, timing, spawn rules, RNG, hitboxes, scoring, difficulty, or other competitive rules must be treated as an intentional new gameplay version, with score comparability and verification handled explicitly.

### Four game treatments

**eMONAD cabinet, sourced from Buy Bounce:** Convert the existing Buy Bounce implementation to the common cartridge contract and reskin its presentation for eMONAD. The player should encounter an eMONAD game, not a “Buy Bounce” cabinet or an “eMONAD reskin of Buy Bounce” listing. Preserve working movement, jump physics, collision rules, scoring, run completion, and other scored mechanics during the reskin. Target Free Play, Ranked integration, a structured result, and an appropriate game-specific verifier. Store eMONAD as the Community Asset association; do not put MiniCoin or wallet logic in the game.

**Two Places at Once:** Convert it to a cartridge and associate its cabinet with **Skrumpeys**, an ERC-721 collection. Preserve its current identity, art direction, and gameplay. Do not perform a broad Skrumpeys reskin. Skrumpey enemies, traits, collectibles, or level progression can be added later as deliberate, additive content. Target Free Play and Ranked integration, structured completion-time and collectible/star results where the existing game supports them, and a practical path to selected-level Community Raids. “Associated with Skrumpeys” does not imply a fungible liquidity pair.

**Coindle:** Convert and preserve Coindle as a playable game. Its **COIN/RWA** association is a concept, not permission to invent a COIN token, Monad contract, or substitute asset. Show a clear **MiniCoin Economy — Coming Soon** or equivalent disabled state while the Community Asset path is unavailable or unverified. Free Play must work without an economy. Normalize the game's actual guess, attempt, time, and streak result data as applicable; assess Ranked against a credible verifier. The developer must be able to enable/deploy an economy later for this same cabinet/game ID when its asset path becomes supported; do not relaunch it as a different game just to add a MiniCoin.

**Skip to 10K:** Convert and preserve its existing presentation and gameplay. Its association is the **ETH/WETH concept**. Provide Free Play and normalized results, and retain useful existing seeded or deterministic infrastructure. It is a stretch candidate for a later second MiniCoin demonstration, after core game integration and the primary economic path work. Do not invent or hardcode an unverified bridged WETH address, liquidity route, or economy deployment. Mark economic enablement pending until the relevant infrastructure is verified.

Cartridge conversion applies to **all four**. Reskinning applies only to the eMONAD cabinet in this run. Preserve the other three games' working presentation and mechanics.

### Skrumpey Slide and creator lifecycle

Do not search for, import, fabricate, seed as published, or substitute Skrumpey Slide in this run. It will be supplied later to demonstrate the real v0 creator flow:

```text
Developer submits cartridge and launch details
    -> Token Arcade admin reviews and approves
    -> submitting developer clicks Deploy
    -> Registry marks the cabinet deployed/published
    -> public Arcade displays it
```

Approval and deployment are separate actions. Submitted and approved games remain nonpublic. The initial four cabinets may be migrated/seeded as already approved and deployed legacy games, but they must appear through the **same Registry/publication model** a later Skrumpey Slide deployment will use. Do not hardcode four homepage cards or simulate deployment by manually editing the homepage. Build only the v0 flow needed for this later proof; permissionless direct deployment and automated approval are future work.

The initial public Registry rows are conceptually **eMONAD cabinet (final public game name TBD)**, **Two Places at Once**, **Coindle**, and **Skip to 10K**. The eMONAD row has its own deployment/game ID and may reference Buy Bounce in internal source metadata; it must not expose “Buy Bounce” as the public cabinet name or use the source repository ID as a shared cross-deployment leaderboard key. Skrumpey Slide has no Registry row until its later submission.

## Cartridge and host boundary

Use the existing Token Arcade SDK or host contract if it is already present; adapt names rather than creating a second competing interface. Each game must provide a manifest, a predictable mount/start/pause/resume/restart/destroy lifecycle where supported, mode and objective declarations, and a structured run result or completion event. The host must be able to mount, finish, unmount, reopen, and switch between games cleanly.

The cartridge owns gameplay, controls, local rendering, local state, scoring, and the game result. Token Arcade owns Guest/Player identity, Privy, Passport, ownership checks, Registry/publication state, game mode selection, run sessions, verification, leaderboards, raid orchestration, Community Asset and MiniCoin configuration, wallets, contracts, settlement, and rewards. Isolate or disable each standalone game's duplicate login, wallet, leaderboard, score submission, or platform UX while hosted by Token Arcade. Never trust a client-supplied score as a verified Ranked or Raid result.

The current model uses a **game-specific Score Verifier**. Candidate methods include an authenticated session with telemetry/sanity checks, a server-authoritative judge, and deterministic replay. Choose and justify a practical method for each game under the two sources of truth. Verification strength is separate from cartridge integration level. Do not rewrite a working engine solely to obtain replay because the older kit associates raids or MiniCoins with its L2 replay level. Where a requested competitive mode cannot yet be verified credibly, keep the playable mode working and report the exact blocker rather than claiming false readiness.

## Scope of this run

This is the **game and platform integration run**, not the Solidity/protocol implementation run. Use MiniCoin Economy v0.2.1 to keep interfaces and state compatible with the future economy. Do not independently implement a MiniCoinFactory, Uniswap hook, FeeAccumulator, EconomyManager, PrizeVault, LP lock, liquidity bootstrapping, automatic Community Asset acquisition, or RaidManager inside game repositories. Wire to existing application interfaces only where needed for this integration. Do not deploy assets or use real funds.

## Execution order

1. **Audit the actual code.** Inspect the Token Arcade repository, existing Registry and host/SDK code, all four game repositories, and the Cartridge Kit. For each game record runtime/build, mount approach, lifecycle, score and completion sources, random or seed behavior, mobile behavior, backend dependencies, existing platform/wallet/leaderboard code, presentation surfaces, locked competitive surfaces, verifier choice, cartridge gaps, and mode readiness. Produce a concise matrix. Continue into implementation unless a genuine source-of-truth conflict or blocking missing repository prevents it.
2. **Establish one reference adapter.** Choose the simplest game based on the audit, not its name. Prove Registry -> manifest -> host mount -> start -> completion -> structured result -> host receipt -> clean destroy. Use that contract as the common pattern for the remaining games. Avoid four incompatible adapters.
3. **Integrate all four.** Prefer adapters over gameplay rewrites. Implement the eMONAD presentation from Buy Bounce without changing scored behavior. Preserve Two Places, Coindle, and Skip to 10K as described above. Keep independent cabinet/game IDs and result namespaces.
4. **Check publication flow.** Ensure the public Arcade queries deployed/published Registry entries. Ensure submitted and approved entries are visible only to the appropriate developer/admin and that developer Deploy, not approval alone, makes a cabinet public. Seed/migrate only the four initial cabinets as published. Leave the generic path ready to receive Skrumpey Slide later without a platform rewrite.
5. **Verify the platform path.** Test Guest Free Play without wallet friction, manifest/Registry loading, mount and cleanup, repeated launch, switching between games, pause/focus behavior, mobile usability, normalized results, relevant Ranked entry and verifier paths, cabinet-specific leaderboards, Community Asset display, Coindle's disabled economy state, and the eMONAD presentation with unchanged scored mechanics. Test that two cabinets built from one skeleton would have separate game IDs and score/leaderboard namespaces. Use meaningful checks against the actual code rather than tests that simply mirror an adapter.

## Completion criteria and report

The run is complete when all four initial games are cartridge-integrated through one host pattern and the Registry; each required Free Play path works; results are normalized; applicable Ranked/Raid integration is real or its exact blocker is identified; the eMONAD cabinet has public eMONAD identity without changing the Buy Bounce scored path; the other three games retain their intended identity; Coindle remains live without an economy and can add one later under the same game ID; Skip to 10K contains no invented WETH infrastructure; leaderboards are per cabinet/deployment; and the generic Submit -> Approve -> Developer Deploy flow can receive the later Skrumpey Slide cartridge without a homepage or platform rewrite.

Report: the audit matrix, reference cartridge and reason for choosing it, final host/cartridge contract, files changed in Token Arcade and each game, per-game mode and verifier status, Community Asset and economy state, eMONAD reskin evidence, tests and results, remaining blockers, any source-of-truth conflicts, and whether the system is ready to receive Skrumpey Slide through the creator flow. Make unresolved requirements explicit rather than marking them complete by assumption.
