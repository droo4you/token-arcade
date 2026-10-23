# Skrump Lab: Weapons Test

Unlisted Token Arcade cartridge (Free Play only, **not on the shelf**: awaiting SkrumpFilms/Melo sign-off on the film's look and voice).
Inspired by SkrumpFilms' "weapons test" clip. No footage or audio from the film is used; everything is drawn in code, the narrator is the browser's own SpeechSynthesis, SFX are WebAudio synth.

Lineup (sim v6) = the clip's full 5-test lab: FIG. 1 Catapult, FIG. 2 Tank, FIG. 3 Rapid Fire (Skrumpey trail), FIG. 4 DN Consensus Mechanism, FIG. 5 A Bigger Tank. Sims v5 (single heavy Bigger Tank, no trail), v4 (2-shell 96-round blast, no FIG.5), v3 (trail/consensus), v2 (FIG.3 = the old burst gun, `rapid`) and v1 (FIG.1+2) still replay via `opts.simVersion`; registry entries for older lineups are frozen.

**Weapon system (Launcher skeleton).** Each Skrumpey brings its own weapon; the weapon is the content slot. `src/weapons.js` is the registry: id, FIG number, name, owner Skrumpey, shell count, fire params (`arc` ballistic/direct + `gScale`, `vk` power, `burst`/`gap` rate, `spread`), projectile physics (radius, mass, sprites), pile layout, rules flags (e.g. the ceasefire gag) and narrator lines. `src/sim.js` owns everything scored (physics, displacement, shot economy, overkill/wasted) and does not change per weapon. To add a FIG: add a registry entry, add it to `LINEUPS` under a new sim version, add a determinism + scoring test. `replay(seed, inputs, { simVersion: 1 })` replays pre-registry FIG.1+2 records bit-identically (golden fixture in `tests/fixtures/`).

- **FIG. 1 — CATAPULT**: one large Skrumpey, 36 subjects. Drag back to aim/set power, release to fire (mouse or touch; keyboard: arrows aim, Space fires).
- **FIG. 3 — RAPID FIRE** (Skrumpey #2912, test 03 · skrumpey trail): two shells; each launches a lead Skrumpey and 9 trailing ones with drop-off: launch gaps grow (5, 7, 9, 12, 15, 19, 23, 28, 33 ticks) and power falls 3.5% per link (100% → 68%), so the tail lags, spreads out and the last links fall short. 30 subjects in three low pyramids.
- **FIG. 4 — DN CONSENSUS MECHANISM** (Skrumpey #2067, test 04 · everything at once): HUD counts VOTES IN to 3,333 → UNANIMOUS; ONE shell: a blast of 44 small Skrumpeys fired at once in a wide fan. A great aim takes ~70–85% of the 39-subject gallery; it never clears automatically. Settled rounds despawn.
- **FIG. 5 — A BIGGER TANK** (Skrumpey #690, test 05 · approach speed): a ~1.8× tank with a long fat barrel; four shells, each a heavy lead Skrumpey (r 0.95, mass 14) with an 8-Skrumpey drop-off trail behind it (gaps grow 6→29 ticks, power falls 100%→68%, so the tail lags and falls short). No brakes: the tank rolls 3 m forward after every shell (SPEED climbs to 93,600 KM/H; BRAKES: NOT INSTALLED after shell 4). Target: a 55-Skrumpey pyramid on a dais.
- **FIG. 2 — TANK**: three shells, 44 subjects. HUD `CEASEFIRE` goes `—` → `REQUESTED` (after shell 1) → `DENIED` (when shell 2 fires, with alarm). After a full clear you may `CONCLUDE TEST` or keep firing (overkill).
- Clinical HUD per FIG (payload/ammo, range, shots, SUBJECTS DISPLACED n/N, ACCURACY: IRRELEVANT, CEASEFIRE, OVERKILL), timecode, LAB-07 cam tag; 3 judges in the glass VIP box marked **S** hold up 0–10 cards after each shot; deadpan narrator captions (+ optional low/flat speech, SOUND/MUTED toggle).

## Sim (`src/sim.js`)
Pure, DOM-free, 120 Hz fixed step, mulberry32 seeded piles. Circles (subjects, projectiles) vs circles and static boxes (floor, plinths); sleeping piles are rigid until struck (> 1.2 m/s) and wake transitively upward. Only `+ - * /`, `Math.sqrt/abs/min/max/round/floor` and `Math.imul` (all exact) are used: no clock, no `Math.random`, no trig. A shot resolves when every body sleeps (or 9 s cap).
Input record = actions `['F', qx, qy]` (integer pull vector, |q| ≤ 100) and `['E']` (conclude after full clear). `SkrumpSim.replay(seed, actions)` reproduces the run exactly; the server could replay-verify from `{seed, actions}` like Skrumpey Slide (verifier not installed: Free Play only).
**Displaced** = subject moved more than 1.0 m (2 radii) from its start, or knocked out of the lab (off the floor/out of bounds).

## Score (Passport metric, computed but Free Play only)
Per FIG:
```
shot points   = 100 × subjects newly displaced by that shot
full clear    = +500 + 250 × shells left unfired      (only if all N displaced)
overkill      = −300 per shot fired after the FIG was already fully cleared
wasted        = −100 per shot that displaced 0 on a not-yet-cleared FIG
FIG score     = max(0, shot points + full clear − overkill − wasted)
Total         = sum over FIGs (1–5)
```
Secondaries: `displaced`, `subjects`, `shots`, `perShotX100` (subjects displaced per shot ×100), `clears`, `overkill`, `wasted`, `fig1Displaced`, `fig2Displaced`, `fig3Displaced`, `fig4Displaced`, `fig5Displaced`, `ticks`. Tie-break: fewer shots, then fewer ticks.

## Run / test
`npm run dev:cartridges` then `http://127.0.0.1:8788/skrump-lab/v/1.0.0/index.html` (standalone) — `?autopilot=1&seed=7` plays itself; `?seed=N` fixes the piles. Render DPR is capped at 1.5, no post-processing.
Tests: `tests/sim.mjs` (determinism live ×2 and via replay, divergence, no-clock/no-random audit, pile seeds, untouched pile stays put, scoring formula, illegal records) and `tests/arcade-bridge.mjs` (Free Play run through the real bridge; ranked/raid mounts refused). Both run in `npm test`.

## Assets
`assets/sprites/*.png`: renders of the public SKRUMP collection GLB models (via `cartridges/skrumpey-slide/assets/models`), subjects hue-shifted pink. Skrumpey art use is permitted by droober; see `../skrumpey-slide/ASSET_PROVENANCE.md`.
