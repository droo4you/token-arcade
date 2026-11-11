# Powderline

A 3D downhill cartridge. Carve a procedurally generated mountain while an avalanche closes from behind. Ramps throw you; swipes in the air are tricks; tricks charge Boost; Boost is the only thing that pulls the slide back.

Version 1.0.0 is frozen at `releases/1.0.0/` and served at `/powderline/v/1.0.0/`. The API replays that same `src/sim.js`. A rules change needs a new version directory and a new manifest version. Do not edit the frozen sim in place after runs have been issued.

## Play

From the repo root: `npm run dev:cartridges`, then open `http://127.0.0.1:8788/powderline/v/1.0.0/index.html`.

- Carve: hold either side of the screen, or A / D (arrow left / right).
- Tricks, only in the air: swipe up Method, down Mute, left Frontside, right Backside. A tap is a Method. Keys are I / K / J / L (arrows up and down, Q and E also work).
- Boost: hold the Boost button, Shift, or Space. It spends the meter to gain speed and open the gap.
- The run ends when the avalanche reaches you.

`?preview=1&seed=4&shot=trick` and `&shot=slide` are local camera holds for screenshots. They are not Free Play and they are ignored inside the arcade host.

## Score

`score = floor(distance meters) + trick points`. A clean trick landing adds `base × combo` (combo 1 through 8) and then raises the combo. Bailing or hitting a tree or rock costs speed, shrinks the gap, and resets the combo to 1. There is no random payout.

Passport Play tie-break: higher score, then longer distance, then fewer crashes, then acceptance time, then run id.

Free Play ignores host seeds and URL seeds. Ranked and raid runs use only the issued seed, hashed with FNV-1a into the sim. The proof is `{ v, rules: "1.0.0", ruleset: "powderline-v1", seed, input }` with one character per 60 Hz tick.

## Host

`arcade.html` loads `/sdk/hosts.js` and `/sdk/bridge.js`. Register the `powderline` adapter (already in `apps/api/src/verifiers.ts`) before publishing. Local publish, after a demo-mode API is up:

`API=http://127.0.0.1:8787 CART=http://127.0.0.1:8788 bash cartridges/powderline/publish-local.sh`

This does not publish production. Droober deploys from the creator flow after review.
