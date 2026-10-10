# TOKEN ARCADE - CODEX GAME INTEGRATION ATTACK

**Label:** Implementation Note  
**Run:** Post-frontend Cartridge integration  
**Goal:** Convert the four existing game repos into real Token Arcade Cabinets/Cartridges without redesigning the product or economy.

---

## 0. READ ORDER / AUTHORITY

You are receiving:

1. `Token_Arcade_Documentation_Index.pdf`
2. `Token_Arcade_v0_Metropolis_Handoff.pdf`
3. `minicoin-economy-v0.2.2-codex-ready.pdf`
4. `cartridge-kit-v0.3.zip`
5. Four game repositories listed below

Read in that order.

### Source of Truth - Product / Application

`Token_Arcade_v0_Metropolis_Handoff.pdf`

### Source of Truth - Protocol / Economy

`minicoin-economy-v0.2.2-codex-ready.pdf`

### Implementation Note

`cartridge-kit-v0.3.zip` and this prompt.

If an Implementation Note conflicts with a Source of Truth, the Source of Truth wins.

If the two Sources of Truth conflict with each other, stop the conflicting work, quote the exact conflict, and ask for founder resolution. Do not invent a bridge.

Do not use old chats/prompts, stale repo copy, or historical gap-report assumptions as authority.

---

# 1. GAME REPOSITORIES

I will provide:

- Buy Bounce: `<BUY_BOUNCE_REPO>`
- Two Places at Once: `<TWO_PLACES_REPO>`
- Coindle: `<COINDLE_REPO>`
- Skip to 10K: `<SKIP_TO_10K_REPO>`

**Skrumpey Slide is intentionally NOT provided in this run.**

Do not search for it, fabricate it, or seed it as a published Cabinet.

It will later prove the real Creator Portal lifecycle:

```text
SUBMIT
  ->
ADMIN APPROVE
  ->
DEVELOPER DEPLOY
  ->
PUBLISHED
```

The platform built now must be ready to receive it later without a homepage/platform rewrite.

---

# 2. THE MODEL YOU ARE IMPLEMENTING

Do not conflate these objects.

## Gameplay Skeleton

Reusable mechanics/simulation/rules.

## Cartridge

Executable game build implementing the Token Arcade host interface.

## Cabinet / Deployment

Public game instance in Token Arcade.

Every Cabinet gets its own:

- `gameId`
- public name/branding
- leaderboard namespace
- Raid history
- Community Asset association
- optional MiniCoin/economy
- Registry/publication state

## Critical leaderboard rule

**Leaderboards belong to Cabinet deployments, not Skeletons.**

If another community later deploys a new game using the same Skeleton, that new Cabinet starts with its own leaderboard/history.

The Player Passport may aggregate the player's history across Cabinets, but public competitive boards do not merge automatically.

---

# 3. CURRENT FOUR-CABINET MAP

## A. BUY BOUNCE REPO -> NEW eMONAD CABINET

Buy Bounce is the **source implementation / Gameplay Skeleton**.

The public Token Arcade Cabinet is an **eMONAD-branded game**.

Do not assume the user-facing game should be called "Buy Bounce".

Public title/ticker can remain configurable/TBD until founder naming is finalized.

Community Asset reference supplied by founder:

`eMONAD: 0x81a224f8a62f52bde942dbf23a56df77a10b7777`

Treat that as product metadata for this run. Do not begin economic deployment without re-verifying chain/address/liquidity during the Protocol attack.

### Required work

- audit source repo
- Cartridge integration
- Free Play
- Ranked-ready result output
- choose strongest practical Score Verifier
- extract safe reskin/theme surfaces
- convert presentation to eMONAD community identity/memetics
- preserve the scored gameplay path unless a mechanical change is explicitly versioned as a new gameplay version
- create a **new Cabinet `gameId` / leaderboard**, not the old standalone Buy Bounce board
- leave clean host-facing compatibility for this Cabinet's planned game-specific MiniCoin/economy; do not implement that protocol inside the game

### Reskin rule

Theme can change:

- characters
- art
- backgrounds
- UI presentation
- music/SFX
- copy
- community memetics

Competitive mechanics should not silently change as part of the reskin:

- physics
- collision/hitbox rules
- scoring
- timing
- spawn mechanics
- difficulty rules
- competitive RNG behavior

If a scored mechanic is intentionally changed, treat that as a new Cartridge/game version, not merely a skin.

---

## B. TWO PLACES AT ONCE -> SKRUMPEYS ASSOCIATION

Preserve Two Places as Two Places.

Do **not** broadly reskin it.

Community Asset:

**Skrumpeys ERC-721 collection**

Association does not mean a fungible pool pair.

### Required work

- Cartridge integration
- Free Play
- Ranked-ready result output
- completion time
- stars/collectibles
- strongest practical Score Verifier
- Raid-compatible architecture where practical
- Community Asset metadata
- leave optional MiniCoin/Community Strategy compatibility at the host boundary; no economic code in the game

Future Skrumpey content may be additive, for example:

- selected enemies represented by particular Skrumpeys
- trait-aware level progression/content
- themed collectibles/levels
- owned Skrumpey avatars/cosmetics

Do not perform those content expansions unless they are already trivial/currently present. They are not required for this attack.

---

## C. COINDLE -> GAME FIRST / ECONOMY LATER

Preserve Coindle.

No reskin.

Community concept:

**COIN / RWA**

Do not invent a synthetic COIN token, fake Monad RWA, or unsupported Community Asset.

Coindle should demonstrate:

> **Game first. Economy later.**

### Required work

- Cartridge integration
- Free Play
- normalized deduction result
- preserve solved/guesses/time/streak model
- choose strongest practical Score Verifier if Ranked is enabled
- keep stable `gameId`
- show economy state such as **MiniCoin Economy - Coming Soon / Unavailable**

Later, if an approved supported asset path exists, the existing Cabinet can enable its economy without a new `gameId` or resetting leaderboard/history.

---

## D. SKIP TO 10K -> ETH / WETH CONCEPT

Preserve Skip to 10K.

No reskin.

Community concept:

**ETH / WETH**

### Required work

- Cartridge integration
- Free Play
- normalized result
- preserve useful existing deterministic/seeded infrastructure
- declare strongest practical Score Verifier
- keep economy-compatible metadata/interface

Do not hardcode or deploy against an unverified bridged WETH address/path.

Skip to 10K is a **stretch second MiniCoin deployment later**, only after:

1. the Skrumpey Slide end-to-end economic loop is stable, and
2. exact ETH/WETH infrastructure is verified.

Do not let that stretch economy goal delay this Cartridge run.

---

# 4. CARTRIDGE/HOST BOUNDARY

The game supplies gameplay.

Token Arcade supplies the arcade.

Conceptually every Cartridge exposes the existing Token Arcade SDK/lifecycle, equivalent to:

```text
mount(config)
start()
pause()
resume()
restart()
destroy()
onRunComplete(result)
```

Use the actual interface already present in the Token Arcade repo if naming differs.

**Do not create a competing SDK just because this prompt uses conceptual names.**

## Cartridge owns

- gameplay
- controls
- simulation
- scoring
- game-local rendering/presentation
- local game state
- run result creation
- seed/level handling when relevant to that game

## Token Arcade host owns

- Guest / Player identity
- Privy
- Passport
- linked ownership wallets
- Community Asset eligibility
- Ranked/Raid session lifecycle
- Cabinet leaderboards
- cosmetics entitlement
- MiniCoins
- Strategies
- wallet/chain interaction
- RaidManager / PrizeVault / settlement
- public publication state

No game should contain duplicated Token Arcade economy/wallet infrastructure.

---

# 5. SCORE VERIFIER - DO NOT FORCE REPLAY

The current Sources of Truth use a game-specific Score Verifier boundary.

Allowed verifier approaches:

- `session_checks`
- `server_authoritative`
- `replay`

Choose the strongest practical mechanism supported by each actual game.

**Do not rewrite a working engine solely to achieve deterministic replay for Metropolis.**

For replay-capable games, reuse good existing deterministic/verifier infrastructure.

For secret-answer games, prefer server authority.

For games where replay is disproportionate, use authenticated session/telemetry/plausibility validation and document the limitation.

The browser result is always a claim until accepted by the configured verifier.

---

# 6. REGISTRY / PUBLICATION REQUIREMENT

Do **not** hardcode the four initial games as static homepage cards.

The public Arcade must render from the same Registry/publication layer future submissions use.

Conceptually seed these as already deployed legacy Cabinets:

```text
Registry

<eMONAD Cabinet>       deployed/published
Two Places at Once     deployed/published
Coindle                deployed/published
Skip to 10K            deployed/published

Skrumpey Slide          NOT PRESENT YET
```

A future submitted game follows:

```text
submitted
-> approved
-> developer deploys
-> deployed/published
```

Only deployed/published entries appear publicly.

Approval and deployment are separate actions.

For Metropolis the founder may control both creator and admin identities, but the system should preserve the state distinction.

---

# 7. PHASE 1 - AUDIT ALL FOUR REPOS

Before broad modifications, inspect:

- current Token Arcade repo
- all four game repos
- Cartridge Kit
- current Registry/SDK/host implementation

For each game report:

- framework/runtime
- build process
- mounting/lifecycle model
- score/result source
- randomness/seed behavior
- timing/simulation model
- mobile support
- existing backend/API dependencies
- existing wallet/Web3 code
- existing leaderboard/score submission code
- asset/theme structure
- SKINNABLE surfaces
- LOCKED/scored surfaces
- best Score Verifier and why
- Cartridge integration gaps
- code that must be disabled/removed in Token Arcade mode
- target Cabinet `gameId`/identity
- Community Asset metadata state

Produce one integration matrix.

Do not stop at the matrix unless a genuine Source-of-Truth conflict or destructive blocker exists.

---

# 8. PHASE 2 - ONE REFERENCE CARTRIDGE FIRST

Choose the simplest/cleanest actual game after the audit.

Do not assume which one in advance.

Integrate one game first and prove:

```text
Registry
-> Cabinet record / manifest
-> Host mounts Cartridge
-> Game ready
-> Game starts
-> Game completes
-> normalized RunResult
-> host receives result
-> clean destroy/unmount
```

Freeze that adapter pattern before parallelizing.

Do not let four agents invent four incompatible game/host interfaces.

---

# 9. PHASE 3 - CONVERT THE FOUR GAMES

After the reference pattern works, parallelize carefully.

Required:

- eMONAD Cabinet from Buy Bounce source
- Two Places at Once
- Coindle
- Skip to 10K

Prefer adapters over rewrites.

Preserve working gameplay.

Keep standalone builds working where practical.

Neutralize game-specific platform/wallet/leaderboard infrastructure only in Token Arcade/arcade mode.

---

# 10. PHASE 4 - CREATOR PIPELINE READINESS

Confirm the frontend/backend/Registry is prepared for:

## Submitted

- visible to creator/admin
- validation can run
- not public

## Approved

- admin has approved
- developer sees Deploy
- still not public

## Deployed / Published

- deployment succeeds
- Registry becomes public
- Arcade renders Cabinet automatically

Do not overbuild:

- organization/RBAC systems
- permissionless creator launch
- AI generation
- automated full security approval

The immediate test is that Skrumpey Slide can later enter this exact generic path.

---

# 11. PHASE 5 - PLATFORM QA

Test the system as an arcade, not as four isolated repos.

Required checks:

- Arcade reads Cabinets from Registry
- Guest can Free Play without wallet friction
- each game mounts through the common host boundary
- focus/pause/resume works
- structured result returns
- destroy/unmount cleans event listeners/audio/loops
- reopening the same Cabinet works
- moving between Cabinets works
- mobile behavior remains usable/accurately declared
- game-local wallet/platform UX does not leak into Arcade mode
- Ranked-capable results reach their configured Score Verifier
- leaderboards are namespaced by Cabinet `gameId`
- two Cabinets using the same Skeleton would not share a leaderboard by default
- Coindle economy-unavailable state does not block gameplay
- Community Asset metadata displays without implying a partnership
- eMONAD reskin/theme does not silently alter scored mechanics

---

# 12. ECONOMY BOUNDARY - DO NOT START THE SOLIDITY ATTACK HERE

Read the MiniCoin Economy Source of Truth so interfaces remain compatible.

Do **not** use this run to independently implement or redesign:

- MiniCoinFactory
- Uniswap v4 Hook
- FeeAccumulator
- EconomyManager
- PrizeVault
- LP Lock
- liquidity bootstrapping
- automated Community Asset acquisition

unless the existing app already has an interface/stub that needs a minimal connection.

The next dedicated Protocol attack will make the economic arrows move real value.

Games only return gameplay results/config capabilities.

---

# 13. DEFINITION OF DONE

This run is complete when:

- all four supplied repos are represented by Token Arcade Registry/Cabinet state
- public Arcade is not hardcoded to those games
- all four use one common Cartridge host boundary
- required Guest Free Play works
- Ranked-capable games produce normalized results through a declared Score Verifier
- Cabinet leaderboard namespaces are independent from reusable Skeleton identity
- eMONAD Cabinet is a separate public deployment built from Buy Bounce mechanics
- Two Places is associated with Skrumpeys without an unnecessary broad reskin
- Coindle demonstrates Game First / Economy Later
- Skip to 10K remains economy-compatible without invented WETH infrastructure
- no game duplicates Token Arcade wallet/economic logic
- Creator Portal / Registry can later accept Skrumpey Slide as a new submission
- a future approved Skrumpey Slide can be developer-deployed and appear publicly without a homepage rewrite
- no Source of Truth has been silently contradicted

---

# 14. FINAL REPORT

Return a concise implementation report containing:

1. audit/integration matrix
2. reference Cartridge selected and why
3. final host/Cartridge interface used
4. files changed in Token Arcade
5. files changed in each game repo
6. public Cabinet `gameId` / identity for each integration
7. integration level achieved per Cabinet
8. Score Verifier selected per Cabinet and why
9. Community Asset metadata/state per Cabinet
10. eMONAD theme/reskin work completed
11. remaining blockers
12. tests run and results
13. any Source-of-Truth conflict discovered
14. explicit answer to:

> Can Token Arcade now receive Skrumpey Slide as a valid new submission, have Admin approve it, have the Developer deploy it, and have it appear as a new Cabinet with its own leaderboard without redesigning the platform?

The answer must be **yes** for the architecture to pass this attack.

If there is no Source-of-Truth conflict:

**audit, integrate, test, and finish the run. Do not return with only a plan.**

---

# NORTH STAR

**The game supplies gameplay. Token Arcade supplies the arcade.**

Preserve the games.

Standardize the Cartridges.

Separate Skeleton from Cabinet.

Keep leaderboards deployment-scoped.

Prepare the portal.

Ship the arcade.
