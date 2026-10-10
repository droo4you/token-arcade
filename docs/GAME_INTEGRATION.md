# Cartridge integration audit — Metropolis

**Label: Implementation Note.** Integration run: October 2026. The supplied package remains unchanged under `docs/token-arcade-package`.

## Architecture and authority findings

Read order: Documentation Index → Product Handoff → Economy v0.2.2 → Cartridge Kit v0.3 → game sources. The Index names only the Product Handoff and Economy spec as Sources of Truth. Kit, attack prompt, gap reports and this report are Implementation Notes. No conflict between the two Sources of Truth was found.

The intended model is: reusable **Skeleton** → versioned **Cartridge** using the existing SDK → independently identified **Cabinet** → published Registry discovery. Token Arcade owns identity, Passport, sessions, per-cabinet standings/raids, publication and optional economy. The game owns its simulation, input, score and rendering. Optional economics do not block game publication or require a new game ID later.

### Exact stale implementation conflicts corrected

| Earlier implementation | Owning requirement | Resolution |
| --- | --- | --- |
| Static homepage list included Buy Bounce/Skrumpey Slide and excluded Skip | Product pp4,13–16: current cabinet map; Buy Bounce is eMONAD source, Skip is fourth; Slide deferred | Public shelf derives only from published Registry records; four legacy imports seeded |
| Admin `publish` immediately exposed a game | Product pp3,19–20 and Index p4: “Who sees Deploy after a game is approved?” → developer/creator | Owner submission/revision, admin technical review/approve/reject, owner deploy; retired endpoint rejects |
| Adapter/verifier readiness assumed a single game ID | Product p4: cabinet identity; Index p3: reusing a Skeleton does not reuse a leaderboard | Reusable adapter key separated from cabinet ID; saves, sessions, boards and raids remain scoped to cabinet |
| Old integration notes demanded deterministic replay for every competition | Product p22; Economy §10; Index p4: “Must every Raid-ready game support deterministic replay? No.” | Game-specific verifier boundary retained; actual replay reused only where supported |
| README/game queue described games as external and directed work toward Slide | New supplied attack and Product pp14–16 | Vendored the four supplied sources; no Slide import or public row |
| Loose root prompt referenced Economy v0.2.1 | New package Index p2 and packaged attack identify v0.2.2 | Used packaged v0.2.2 |
| Legacy token-only Minicoin factory action could look like a full economy deploy | Economy §11 defines the complete controlled deployment, pool/hook/LP policy | Pending launch economies are blocked from that legacy route; full protocol gap explicitly deferred |

An existing code/doc mismatch was corrected rather than treated as a new product decision. No contract deployment, fee routing, wallet transfer, asset purchase or external publication happened in this run.

## Source audit and provenance

These are pinned local adaptations, not remote GitHub forks. Each folder includes `UPSTREAM_COMMIT`; original standalone entry points and source test tooling remain.

| Cabinet / source | Pinned commit | Stack, loop, native metrics | Initial gaps |
| --- | --- | --- | --- |
| eMONAD / [Buy Bounce](https://github.com/droo4you/buy-bounce) | `ec57f1a19d665c695ad6087c694d466d2df99d99` | Static canvas/IIFE;120Hz seeded simulation; native replay v2; peak chart score, bounces, streak, collectibles; pointer/touch | Own wallet/window/leaderboard calls, viewport-sensitive scoring, upstream verifier accepts nonterminal traces |
| [Two Places at Once](https://github.com/droo4you/droober-two-places) | `17ba50fe90360427b7c37a4e9d0e0c705f92c57a` | Static canvas;60Hz pure World;20 authored levels; completion time, apples, deaths; keyboard/gamepad/touch | No host lifecycle or accepted score path; level selection/proof needed server binding |
| [Coindle](https://github.com/droo4you/coindle) | `1131534ace997fd83cb9c0721a7b7708b9de5b3a` | Next16/React19/TypeScript/Tailwind4; daily/random deduction; guesses, solved, hints, elapsed time, streak; responsive DOM | Client-computable answers and old client-trusted Supabase leaderboard; Pyth Pro credentials required for price clues |
| [Skip to 10K](https://github.com/droo4you/skip-to-10k) | `27d2494e1e143655b3faec743c306466c510591a` | Static canvas; seeded120Hz SIM; native days/distance, peak, skips, perfects, streak, gems; mouse/keyboard/touch landscape | No host lifecycle; upgrades/local progression need an explicit competitive loadout and replay contract |

Coindle's Apache-2.0 license is retained. The other supplied repositories had no license file; they were adapted as the founder-provided sources, without inventing a broader redistribution license. Existing art and credits remain. No new ownership/partnership claim was added.

## Implementation strategy and result

**Reference: Skip to 10K.** It has a small static build, clean simulation and no account/economy integration, making it a useful lifecycle reference. The full native flight runs through the shared bridge in an automated test. All other adapters use the same host transport and SDK result contract.

- Existing `CartridgeHost` now owns pending mounts immediately. `IframeCartridge` implements the existing lifecycle; `packages/sdk/browser/bridge.js` is its classic-script peer.
- Separate origin8788 isolates game dependencies, DOM and local storage from the arcade origin. Exact source/origin/channel checks protect the handshake. Hidden/blurred games pause; fatal errors destroy their runtime; leaving cancels frames/listeners/audio.
- `launch.ts` supplies initial import metadata only. Homepage/catalog uses Registry publication. Future iframe builds do not need frontend adapter-map edits.
- `/launch` implements the real creator/admin lifecycle. `/admin-tools` retains operations, cabinet configuration and free raid creation. Unchanged approved cabinets can resume after an admin pause; a changed build must pass review again.
- Community concepts are descriptive metadata, separate from executable assets. Coindle keeps `coindle` when an approved economy is attached later.
- Initial placeholder migration is narrow; the import correction preserves pause state, asset/economy associations and history, and never overwrites later configuration on repeated starts.

## Current game status

| Cabinet | Free Play | Ranked / Raid | Result and verifier | Economy |
| --- | --- | --- | --- | --- |
| `emonad-cabinet` | Integrated | Enabled | Native v2 replay on server; seed +390×844 issued playfield; terminal completion required; score/details recomputed | eMONAD reference only; pending protocol pass |
| `two-places` | Integrated | Enabled | Original World replay; Ranked level0; Raid3 explicit distinct levels; milliseconds +apples/deaths; apples before time | Skrumpeys ERC-721 association; pending verified collection/strategy |
| `coindle` | Integrated | Disabled | Native guesses/solved/hints/active time/streak normalized; strongest next verifier is server-hidden answer/session judge | MiniCoin Economy — Coming Soon |
| `skip-to-10k` | Integrated | Disabled | Native days/distance and secondary flight results normalized; strongest next verifier is native seeded replay with fixed loadout | ETH/WETH concept only |

### eMONAD

Hosted `arcade.html`, theme metadata and guarded lifecycle additions preserve scored physics, hitboxes, timing, RNG, spawn and score rules. Source-only wallet/window/leaderboard UI and calls are suppressed in hosted play. Tickets remain mechanically identical collectibles named orbs. Palette, button/pickup art and copy are theme surfaces; no ticker or final founder title is invented. Competitive iframe390×844 is visually scaled by the host; it does not resize the simulation to suit each player's screen. Free Play stays responsive.

### Two Places

Original sprites, characters, levels, World and controls are preserved. Proof records held and pressed actions at native fixed ticks, including legitimate subframe taps. Server selects Ranked level; Raid explicitly binds three level indices. Native local campaign remains Free Play; competition cannot select a different level or turn multiple restarts into extra server sessions. Completion time is milliseconds with exact ticks retained in secondary metrics.

### Coindle

Original React components are bundled as an independent Vite Cartridge; standalone Next entry remains. Hosted leaderboard/reporting/analytics calls are suppressed. A bounded server-only Pyth data handler supports price/live/history endpoints, with allowlisted native feed IDs and caches. Without `PYTH_API_KEY`, the price clue visibly says Unavailable; five other native clues remain playable. Client-known daily/random answers are insufficient for trusted Ranked; no fake verifier is installed.

### Skip

Original `sim.js`, progression, shop and presentation remain. Its GWEI/gems are local game progression, not a Token Arcade asset or economy. The adapter adds lifecycle, cabinet-scoped saves, actual native finish/result mapping and cleanup. Competitive enabling still needs fixed upgrades/loadout, input trace and server replay; ordinary local progression is preserved in Free Play.

## Verification record

- Root TypeScript and production build pass. Production bundles include the host and independent Coindle artifact. Build emits existing dependency `use client` / chunk-size warnings; these are not compile errors.
- SDK tests exercise real Skip simulation → bridge → structured result, pause/resume/restart/destroy, hostile sender rejection and pending navigation cleanup.
- Iframe transport tests cover exact origin/source/channel checks, one completion, post-ready fatal teardown, cancelled mount and fixed playfield scaling.
- API tests cover publication ownership, technical review gate, retired direct publish, artifact admission, per-cabinet separation, version/rule/session binding, forged metrics/reuse, raid attempts, paused-cabinet rejection/resume, concept/economy gates and migration preservation.
- Source replay tests verify complete eMONAD runs and original Two Places solver traces and reject forged/partial proofs.
- Original Buy verifier/determinism suites, all20 Two Places level solver checks and original Skip harness/sim/meta checks pass. Coindle's adapter/data checks pass.
- Browser inspection confirms all four games mount through the generic host. Coindle and Skip were also played by the founder, who reported that both feel unchanged. Desktop/phone layout checks and host pause/resume are included; these are browser checks, not a physical-device touch certification.

The final response records the final aggregated test count. Source test commands and evidence are retained with the game folders where applicable.

## Remaining release work

1. Production origins/immutable artifacts, durable database operations and live Privy credentials/admin IDs are deployment configuration, not completed public hosting.
2. Coindle needs Pyth credentials for live price clues and a server-secret puzzle judge before Ranked/Raid. No credentials were invented or exposed.
3. Skip needs fixed competitive rules and server replay before Ranked/Raid. Its seeded infrastructure is preserved for that work.
4. Full Economy v0.2.2 implementation/verification, exact assets/liquidity, controlled deployment, custody and settlement are a separate protocol attack. No launch economy is claimed live.
5. Founder can finalize the eMONAD public name/brand assets without changing the Skeleton. New scored mechanics require a new game version.
6. Skrumpey Slide remains deferred and can use the generic submission→approval→developer deployment pipeline later.

## Changed file map

Platform additions: `packages/sdk/src/iframe.ts`, `launch.ts`, `browser/bridge.js`; `apps/api/src/gameVerification.ts`, `coindle.ts`; `apps/web/src/CreatorPortal.tsx`; `scripts/cartridges.mjs`, `start.mjs`; SDK/API/catalog regression tests. Existing SDK types/host, API server/store/adapter registry, web catalog/Cartridge factory/App/guides/styles, run scripts, env example and documentation were updated.

| Imported source | Modified upstream files | New integration files |
| --- | --- | --- |
| eMONAD / Buy Bounce | `src/game.js`, `tools/harness.js` (test harness support) | `arcade.html`, `skin.json`, `src/arcade-seed.js`, CommonJS `package.json`, `tools/arcade-bridge.test.js`, `UPSTREAM_COMMIT` |
| Two Places | `src/main.js` | `arcade.html`, `tests/arcade-bridge.mjs`, `UPSTREAM_COMMIT` |
| Coindle | `package.json`; `src/app/globals.css`; components `AnswerRow`, `CategoryCell`, `GameBoard`, `GuessRow`, `Header`, `RevealCard`, `Sparkline`; hooks `useGame`, `useLivePrices`, `useLocalStorage`, `useTheme`; libraries `compare`, `sounds`, `types` | `arcade/index.html`, `arcade/main.tsx`, `arcade.vite.config.ts`, `src/lib/arcade.ts`, `tsconfig.arcade.json`, `test/arcade.test.ts`, `ARCADE_INTEGRATION.md`, `UPSTREAM_COMMIT` |
| Skip to10K | `src/main.js` | `arcade.html`, CommonJS `package.json`, `UPSTREAM_COMMIT` |

Original standalone entry files, simulations and source-specific credits remain. Coindle comparison changes render absent prices as unavailable; they do not fabricate a price or alter daily answer selection.

## Future submission acceptance

**Yes:** Token Arcade can receive Skrumpey Slide later as a valid new submission, let Admin approve its reviewed artifact, let its Developer deploy it, and publish a new Cabinet with its own leaderboard namespace without redesigning the platform. A competitive verifier remains the game-specific installation step when enabling Ranked/Raid. This run does not import or publish Slide.

### Final gate results

`npm test`: **48/48 passed**, including both native bridge tests and real eMONAD/Two Places replay acceptance through production API sessions into independent standings/Passport history. Forged metrics and reused sessions are rejected. `npm --prefix cartridges/coindle run test:arcade`: **3/3 passed**. Root and Coindle TypeScript checks pass. `npm run build` passes.

Original-source checks passed: Buy `tools/verify.js --self-test`, `tools/determinism.js`, syntax check; Two Places `tests/levels.mjs` (20 levels), `rules.mjs` (14 checks), `rules2.mjs` (20 checks), `client.mjs` (screens/levels/touch/pause/restart), `solve.mjs` (all20); Skip `tests/harness.mjs`, `sim.mjs`, `meta.mjs` (35 missions). The legacy Skip CDP mobile harness was not run; mobile layout was inspected using the supported browser controls.
