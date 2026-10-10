# Droober & RC: Two Places at Once

Two worlds, 20 levels: **Purple Dusk** (the basics) and **Shroomwood** (goo, wind, shadows, portals).

A 2D pixel puzzle-platformer. Droober does the heavy lifting; RC, his goo companion, roams free.
You swap between them to be in two places at once.

## Play

```
node serve.mjs        # http://localhost:5177/
```

Opening `index.html` directly also works (classic scripts, no modules, no build step).

On phones it turns into a Droober handheld: Game Boy style in portrait (screen on top, cross d-pad, JUMP/USE,
SKILL/CALL, SWAP/PAUSE pills), wide-handheld style in landscape. Push the d-pad to its rim to run.

## Who can do what

| | Droober | RC |
|---|---|---|
| Move | walk, run, jump, double jump, crouch | flies freely (like Morph), settles when left alone |
| Crates | pick up, carry (one jump only), throw, set down | can't lift or push |
| Heavy blocks / cranks / platforms | shoves blocks, turns cranks | too squishy |
| Buttons, levers | yes | yes |
| Pressure plates | yes | normal plates only; big plates need real weight |
| Grates | blocked | oozes through |
| Spikes | ouch | immune |
| Zaps | ouch | pops |
| Shadow figures (W2) | caught if seen; puffs smoke (C) to hide | ignored, scouts freely |
| Goo (W2) | climbs gooey walls, hangs + shimmies on gooey ceilings | paints walls/ceilings (hold C) |
| Fans (W2) | too heavy to blow around | pushed around (so are crates) |
| Straws + juice boxes (W2) | carries straws, sips a box to power its portals | can't hold a straw |

**Goo:** regular goo dries in 10 seconds (timing). Soak up a goo puddle and RC's next strokes are
**thick goo**, which never dries (planning). The meter under RC's tab shows how much thick goo is left.

**Apples** are the 3-per-level collectible. Juice boxes are portal power.

**Team move: RC glide.** With RC riding on his head, Droober double jumps and holds jump: RC
grabs on and holds him up for about 70 frames. That roughly doubles his reach (8.9 tiles to 16+), so wide gaps
need RC with him, while plates often need RC somewhere else. That tension is the game.

## Controls

| Action | Keys | Gamepad |
|---|---|---|
| Move / fly | A D (W S for RC) or arrows | stick / d-pad |
| Jump (twice for double) | Space | A |
| Run | Shift | RT |
| Crouch | S / Down | down |
| Grab, throw, use | E (S+E sets a crate down) | X |
| Swap Droober and RC | Q / Tab | LB / RB |
| Call RC / drop RC | F | B |
| Smoke (Droober) / paint goo (RC), World 2 | C | Y |
| Restart, pause, mute | R, Esc, M | Back, Start |

## Levels

**World 1, Purple Dusk:**

1. Juice Run (movement) · 2. Goo Buddy (swap, grates, buttons, call) · 3. Hold the Door (plates)
4. Heavy Lifting (crates) · 5. Goo Glider (glide) · 6. Stand-In (crate holds a plate so RC can glide)
7. Block Party (heavy blocks + RC lever) · 8. Crank Shaft (cranks, zap plate, goo tunnel)
9. Tick Tock (timed button race) · 10. Two Places at Once (everything)

**World 2, Shroomwood:**
11. Goo Grotto (goo walls) · 12. Hang In There (goo ceilings) · 13. Breezy (fans) · 14. Blow by Blow (timed fan maze)
15. Shadow Woods (shadows + smoke) · 16. Juiced Up (straws, juice boxes, portals) · 17. Thick and Thin (thick goo round trip)
18. Over Their Heads (shimmy above shadows) · 19. Portal Pump (crates through portals) · 20. Shroom Boom (everything)

## Layout

- `src/world.js`: simulation, pure logic, no canvas. Fixed 60 Hz step, Celeste-style integer movement.
- `src/levels.js` (World 1) and `src/levels2.js` (World 2): levels built with a tile-coordinate builder. Reach numbers are at the top of levels.js.
- `src/render.js`, `src/render2.js` (Shroomwood art + World 2 mechanics), `src/font.js`: all drawing, procedural, 5x7 bitmap font.
- `src/main.js`: menus, save data (localStorage), loop. `src/audio.js`: synthesized SFX and one soundtrack per world.
- `assets/sheet-source.png` is the original turnaround sheet; `tools/extract-sprites.mjs` cuts it into
  `assets/sprites.png` + `src/sprites.js` with a zero-dep PNG codec (`tools/png.mjs`).

## Tests

```
node tests/levels.mjs    # structure + wiring of every level (--dump prints ASCII maps)
node tests/rules.mjs     # ability rules (RC can't push, grates, heavy plates, glide needs RC...)
node tests/rules2.mjs    # World 2 rules (goo dries / thick stays, climbing, fans, shadows + smoke, portals)
node tests/solve.mjs     # a bot plays all 20 levels start to finish (routes: solve.mjs + solve2.mjs)
node tests/client.mjs    # boots the browser scripts on a stub canvas, drives menus + every level
node tests/physics.mjs   # prints measured jump reach
```

Change a level or a physics constant, run `solve.mjs`. If a level becomes unsolvable, it fails.
