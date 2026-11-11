# Powderline cartridge

Implementation note. The game is an original downhill sim. It does not theme itself to the arcade host.

- Game id / adapter / skeleton: `powderline`
- Version: `1.0.0`
- Artifact: `/powderline/v/1.0.0/` served from `releases/1.0.0/`
- Modes: Free Play and Passport Play. Community Raid is not enabled.
- Objective: `score`
- Ruleset: `powderline-v1` (`rankedRules.ruleset`)
- Verifier: `apps/api/src/powderlineVerification.ts`, replaying `releases/1.0.0/src/sim.js` at 60 Hz
- Tie-break: score, then distance, then fewer crashes, then acceptance time and run id
- Free Play seed: local entropy only. `resolveRunSeed('free', issued, entropy)` drops `issued`.
- Passport seed: `issuedSeed(session.seed)`
- Proof: `{ v: 1, rules: "1.0.0", ruleset: "powderline-v1", seed, input }`
- Secondary metrics, all integers: `distance`, `trickPoints`, `bestCombo`, `crashes`, `boosts`, `ticks`
- Touch: pointer events, `touch-action: none`, non-passive `touchmove` preventDefault
- Quality: pixel ratio capped at 1.5 on coarse or narrow viewports and 2 otherwise, with a pixel budget. No shadow maps (painted and blob shadows only). No bloom.
- Account save key: `ta.powderline.progress.v1` (`bestScore`, `bestDistance`, `runs`). Casual only.
- Economy: none. No wallet, Privy, or chain code in the cartridge.

three.js r170 is vendored under `releases/1.0.0/vendor/` (MIT, `vendor/LICENSE`). Fraunces and Atkinson Hyperlegible are SIL Open Font License; see `assets/fonts/OFL-*.txt`. All other art is generated in code.
