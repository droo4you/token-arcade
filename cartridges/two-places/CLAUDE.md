# Droober & RC: Two Places at Once

Vanilla canvas puzzle-platformer, zero deps, no build step. Classic `<script>` tags share globals
(load order in index.html matters). Serve with `node serve.mjs` (port 5177).

## Ability split (the user's spec; do not drift from it)
- Droober: walk, run, jump, double jump, crouch, grab/carry/throw crates, push heavy blocks, turn cranks.
- RC: flies freely like Morph, presses buttons/levers, weighs normal plates. Cannot lift or push anything.
- Team move: RC glide. RC riding + double jump + hold jump = hover. Gaps of 11+ tiles need it.
- World 2 (user-approved spec): RC paints goo (hold C); regular goo dries in 10s, thick goo from puddles is
  permanent with a meter. Droober climbs goo walls, shimmies goo ceilings, puffs smoke (C, cooldown).
  Shadow figures only catch Droober, only in front. Fans push RC and crates, never Droober. Portals are powered
  by juice boxes (Droober uses a straw) or by buttons/plates. Apples are the collectible everywhere.
- Shroomwood look (user's brief): light blue sky, tree-sized mushrooms (red/white spots, blue/green spots),
  berry bushes, trees with weird branches and layered canopies. Forms and the chest void are planned later, not now.

## Mobile
- `src/touch.js` (TouchPad) feeds the same actions as the keyboard. On touch the page becomes a handheld shell
  (#shell/#bezel in index.html, portrait = Game Boy, landscape = wide handheld); desktop hides the shell via display: contents.
- Sign text is rewritten for touch by `touchify()`. New signs that name keys need a matching rule there.
- To preview phone layouts in Chrome, load the game in phone-sized iframes and call `TouchPad.enable()` via frame eval.

## Working rules
- After touching `src/world.js` or `src/levels.js`, run `node tests/solve.mjs`. The bot routes in
  `tests/solve.mjs` + `tests/solve2.mjs` are the proof each level is solvable; update the route when you change a level.
- Reach numbers (from `tests/physics.mjs`) are in the header of `src/levels.js`. Design against them.
- Sprites come from `assets/sheet-source.png` via `node tools/extract-sprites.mjs`. Don't hand-edit `src/sprites.js`.
- The Chrome automation tab is usually "hidden", so requestAnimationFrame stalls. Drive frames manually
  from devtools (`update(); draw();` are globals, `window.__game` is the state) instead of assuming a bug.
- In-game copy: uppercase bitmap font only has A-Z 0-9 and basic punctuation (see `GLYPHS`). No em dashes.
- Fans must be set into a solid tile (tests/levels.mjs enforces it). Updrafts pin RC to the ceiling, so put
  buttons at the top of an updraft, not partway up.
- Known gotcha for players: setting a crate down in front and then walking forward shoves it off a plate. Hop it.
