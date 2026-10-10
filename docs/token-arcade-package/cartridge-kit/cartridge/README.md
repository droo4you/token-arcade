# Token Arcade Cartridge Kit - v0.3

**Label:** Implementation Note  
**Aligned:** 8 Oct 2026  
**Purpose:** Standardize how independent browser games become Token Arcade Cartridges without allowing this package to redefine product or protocol behavior.

## Governing Sources of Truth

Read first:

1. `Token_Arcade_v0_Metropolis_Handoff.pdf` - Product / Application Source of Truth
2. `minicoin-economy-v0.2.2-codex-ready.pdf` - Protocol / Economy Source of Truth

This kit is subordinate to both.

## Current alignment rules

- **Gameplay Skeleton** = reusable mechanics/rules/simulation.
- **Cartridge** = executable game build implementing the Token Arcade host interface.
- **Cabinet / Deployment** = public game instance with its own `gameId`, leaderboard, Raid history, Community Asset association, and optional economy.
- Reusing the same Skeleton for another community creates a **different Cabinet and leaderboard by default**.
- **Score Verifier is a separate capability axis.** Raid-ready does not universally mean deterministic replay.
- Verifier types: `session_checks`, `server_authoritative`, `replay`.
- **Reskin is optional and orthogonal.** Community association does not automatically mean the game must be reskinned.
- Games never contain Privy, wallet, Uniswap, MiniCoin, PrizeVault, or RaidManager logic.

## Current Metropolis game mapping

| Source repo | Public Cabinet / role | Community concept | Theme requirement | Target |
|---|---|---|---|---|
| Buy Bounce | **New eMONAD-branded Cabinet**; Buy Bounce remains source/Skeleton metadata | eMONAD (`0x81a224f8a62f52bde942dbf23a56df77a10b7777`, verify before economic use) | **Reskin required** | Arcade + Ranked; Raid/economy capable later |
| Two Places at Once | Two Places at Once | Skrumpeys | **No broad reskin**; additive Skrumpey content later is allowed | Arcade + Ranked; Raid-ready architecture |
| Coindle | Coindle | COIN / RWA concept | No reskin | Game-first; Economy Coming Soon |
| Skip to 10K | Skip to 10K | ETH / WETH concept | No reskin | Cartridge now; economy only after WETH path verified |
| Skrumpey Slide | **Not part of initial import** | Skrumpeys | native Skrumpey game | Later proves Submit -> Admin Approve -> Developer Deploy -> Published |

## Files

| File | What it is |
|---|---|
| `CARTRIDGE_SPEC.md` | Host/game contract, Cabinet identity, lifecycle, modes, Score Verifier model, integration levels |
| `INTEGRATION_CHECKLIST.md` | Pass/fail checklist for Arcade / Ranked / Raid / Economy compatibility plus verifier-specific checks |
| `cartridge.schema.json` | Machine-readable Cartridge manifest schema |
| `RESKIN_SPEC.md` | SKINNABLE vs LOCKED theme layer, asset rules, rights/moderation, safe reskin workflow |
| `reskin.schema.json` | Skin manifest schema |
| `SKILL_DRAFT.md` | Agent procedure: audit -> gap report -> integration -> verifier -> optional reskin |
| `gap-reports/*.md` | First-pass research/implementation notes. **Revalidate against the actual repo before coding.** |

## Integration levels

- **L0 Arcade-ready** - Guest Free Play works inside Token Arcade.
- **L1 Ranked-ready** - normalized competitive result + declared Score Verifier.
- **L2 Raid-ready** - host-owned Raid attempts/rules + verifier accepts Raid results.
- **L3 Economy-compatible** - stable Cabinet identity and clean protocol boundary. Automatic Raid-funding economy additionally requires L2.
- **R Reskinnable** - orthogonal capability; skin/theme changes do not silently alter scored gameplay.

## Golden rule

> **The game supplies gameplay. Token Arcade supplies the arcade.**

A game returns results. Token Arcade owns identity, leaderboards, Community Asset checks, cosmetics entitlement, MiniCoins, Strategies, Raids, wallets, and settlement.
