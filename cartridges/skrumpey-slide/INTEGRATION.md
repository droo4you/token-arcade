# Skrumpey Slide cartridge preparation

Implementation note, 2026-10-13. Product owner: Token Arcade v0 Metropolis Handoff. Target: reviewed Free Play submission through the real creator lifecycle. Economy configuration is separate.

## Source

Founder supplied `skrumpey-slide-v3.zip`, SHA256 `D64761EF80C6ED5EBD6F6B97B8F99B87C37F11AE75167313E9FC1C913D15C8C7`.
Standalone `index.html`, `sim.js`, assets and vendored libraries are preserved. Generated `arcade.html` adds the host adapter; rebuild with `node cartridges/skrumpey-slide/build-arcade.mjs` from the repository root.

DN images are present in the game ZIP as `assets/nuts/site-nuts.png` and `assets/nuts/site-nuts-plain.png`. The separate `Skrumpey-assets.zip` inspected on this date contains 78 entries and no DN image. Its manifest is retained as ASSET_PROVENANCE.md; its collection claims are not independently verified by this import.

## Prepared submission values

- Cabinet: Skrumpey Slide
- Game ID / Skeleton ID / Adapter ID: `skrumpey-slide`
- Cartridge version: `1.0.0` (source game calls itself v3)
- Description: Slide through four worlds, rescue Skrumpeys, and grow your train before nightfall.
- Modes: Free Play only
- Objective: score
- Genre: momentum runner
- Touch: supported by source; physical phone testing remains outstanding
- Orientation: any
- Community: Skrumpeys, concept pending asset verification
- Economy: pending protocol review
- Intended live local artifact: `http://127.0.0.1:8788/skrumpey-slide/v/1.0.0/`

Developer display name must be supplied by the submitting creator. This file does not submit, approve, or publish the game. The production artifact must use the final approved separate origin.

## Implementation and remaining checks

The wrapper uses the existing Token Arcade protocol for mount, start, pause, resume, restart, audio and destruction. It reports native score and integer secondary metrics at nightfall. Hosted mode suppresses the standalone daily board and its submit stub, URL debug controls, and mutable GAME debug handle. Gameplay physics and scoring are unchanged.

The original seeded bot runs reproduce scores and end ticks across four seeds. Browser observation confirms the host handshake, loaded models, character menu, host-driven start, pause/resume acknowledgments, a full Free Play run (score 1753, distance 1319 m, 4290 ticks / 71500 ms), and clean ta:destroyed acknowledgment. A 390 px portrait review shows the result screen fitting the game width. GLB and WASM MIME support is added to the cartridge server for Three.js/Draco assets. The serving test covers both DN images, a model and the decoder.

Before approval: finish founder controls/feel review and phone gameplay checks, then activate the artifact in the live preview. The existing rehearsal server needs the new cartridge-server MIME map; do not stop its parent runner casually because its local token chain is temporary. Ranked/Raid remain disabled until a bounded native replay verifier and adversarial session tests are installed. Native replay exists in the game, but is not yet an installed API verifier.


## Updated ZIP verification

The founder supplied an updated ZIP before submission. It adds pixel fonts, UI icons and How to Play/scoring calculator screens. The scoring formulas were extracted into helpers. A comparison of eight seeds with idle, held and native bot inputs (24 full runs) matched both versions at every tick for score, position and termination, and matched every final result field. Updated source and assets were imported and the cartridge regenerated. The version remains 1.0.0 because no artifact has been submitted or published yet. Founder feel approval covered the earlier revision; the updated menu and host handshake are checked separately.

