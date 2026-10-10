# Skip to 10K

Droober & RC rock-skipping launcher. Inspired by Pebble Dash (timed skips) and Monkey Flight (limited boosts,
upgrade between runs, missions), themed on Ether Rock and crypto history. Sibling of
`../droober-two-places` (sprites + font copied from there). Vanilla canvas, zero deps, no build step.
Classic `<script>` tags share globals; load order in index.html matters. `node serve.mjs` serves port 5178.

## The bit
- x is time: 6 px per day since ETH genesis (2015-07-30). Eras in `SIM.ERAS` walk the history and end at
  YOU ARE HERE (day 4088 = 2026-10-08), then FOREVER mixes everything forever.
- altitude is price: `priceAt(alt) = 1000 + alt * 6.45`. A red resistance line at the $4,953 ATH (Aug 24 2025) rejects the rock
  unless it crosses fast enough (VOLUME upgrade). $10,000 is a second line. Broken resistance becomes support.
- The joke is sideways chop: most runs live between $1K and $3K. Keep it affectionate, no chain favoritism,
  no logos. Characters are original homages (Kevin, apes, Skrumpeys, suits, whales, fartcoin clouds).

## The throw (v0.3)
- v0.1 slingshot: throws under ~35% power sank on first contact, so players saw "a couple feet". v0.2 run-up
  (mash to sprint): the user hated mashing. v0.3 is pull-back again, tuned: drag back from ANYWHERE, 55 canvas px
  = full power, angle from the drag direction, green SKIP ZONE wedge (8-24 deg), live trajectory preview run through
  the real sim. Keyboard: UP/DOWN aim + hold SPACE (fills in 1.1s, holds at max). Throw power maps to 0.45..1 and
  `throwRock` floors at 0.45, so every throw skips.
- HOW TO PLAY (title "I" button or I key): a narrated bot run on TUT_SEED 30 with TUT_UP upgrades, bot input every
  sim step so it is deterministic. TUT_UP is about two upgrades each so the demo matches what players soon have. Cut at 70s. Never touches the save. Re-pick the seed offline if the sim changes.

## Files
- `src/sim.js` pure physics, entities, upgrades, eras. No DOM. Loaded by tests through vm/require.
- `src/art.js` procedural pixel art (bitmap strings), backdrops per era, Droober/RC sheet helpers.
- `src/meta.js` history headlines (real dates), 35 missions + 12 ranks, rock garden prices, RC banter. No DOM.
- `src/main.js` screens (title, runup, fly, results, shop with UPGRADES/ROCKS/MISSIONS tabs), input, camera, HUD, save (`localStorage` skip10k.v1).
- `src/audio.js` synthesized sfx + one loop. `src/font.js`, `src/sprites.js`, `assets/sprites.png` come from droober-two-places.

## Boosts
- The user never found C for RC. Desktop now shows big clickable X BOUNCE / C RC LIFT buttons that flash, plus a
  prompt over the rock, whenever the rock is slow and low. Results list boosts left unused. Start: 3 bounces, 2 RC.
- v0.5: the user asked to swap the fart boost for bounces (X = skip off thin air, beach-ball pickups).
  The fartcoin clouds on the lake (MINI PUMP) stayed: they were in the original brief.
- SPACE doubles as RC LIFT (user request) but only while the rock is in the air (`spaceCallsRc`): near the water
  it is a skip tap only, so skip timing never burns RC. harness.mjs asserts X, C and SPACE actually fire.

## Deploy + mobile
- Live at https://skip-to-10k.vercel.app (Vercel project droobers-projects/skip-to-10k). Deployed with `vercel --prod --yes`
  from this folder before the repo existed. Now github.com/droo4you/skip-to-10k (public, branch master) is connected:
  a push deploys. Keep personal paths out of tracked files (a local path with a real name was scrubbed from history). .vercelignore keeps tests/tools/docs off the site.
- GAME_SPEED 0.8 (user wanted time to enjoy the scenery). Phones: rotate screen in portrait (pauses a run), Android
  fullscreen + landscape lock on first touch. `node tests/mobile.mjs <outdir>` drives an emulated phone over CDP.

## Working rules
- After any sim change: `node tests/sim.mjs` (perfect-tap bot balance table) and `node tests/harness.mjs`
  (stubbed DOM, plays every screen). After copy or meta changes: `node tests/meta.mjs` (every string renders in the
  bitmap font, news in date order, missions complete). Balance targets (user, v0.4: "too slow and tedious" otherwise): a fresh save is already fun, close to the demo.
  `node tests/progress.mjs` plays a sloppy human from zero: first run ~day 1000, ATH by run 2-4, today by ~6,
  10K ~13, maxed ~15. FOREVER gets rougher past today (entropy + heavier hazards) so runs still end.
- Screenshots without the Chrome extension: headless Chrome with `?demo=<day>[&alt=<alt>]` or `&screen=shop|rocks|missions|runup|results`, `&touch`,
  `--virtual-time-budget=800`. Headless Chrome barely ticks rAF, so add `&ff=<seconds>` to fast-forward
  (e.g. `?demo=0&screen=tut&ff=30`). Demo mode is a bot that throws and plays from that day.
- In-game copy: uppercase bitmap font only (see `GLYPHS`). No em dashes, say crypto not Web3, never "rug".
  Signed droober only.
- Don't fade outlined text with globalAlpha: the stacked outline passes smear. Slide it instead.
