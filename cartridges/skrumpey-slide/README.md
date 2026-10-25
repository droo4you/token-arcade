# Skrumpey Slide v2.1 (v2 backup in v2/, v1 in v1/) (Tiny Wings / Dune! style)

## Arcade rules 1.3.0 — DN Frenzy recovery

At 45 meter points (+1 per ordinary DN nut, +3 per rare nut), DN Frenzy adds a one-time +4 m/s kick along the current movement direction, capped at the existing 80 m/s speed limit. It keeps the five-second nut rain and magnet. The kick runs in the shared simulation in Free Play, Passport Play and raids; avatars do not affect it. It adds no slope speed pads or purchasable boosts.

Rules 1.3.0 has a new version URL and fresh boards. The server retains frozen 1.0.0, 1.1.0 and 1.2.0 simulations and assets for their existing runs. Publish the reviewed manifest with version `1.3.0` and entry `/skrumpey-slide/v/1.3.0/` after draining active sessions/raids; stored operator-managed cabinets are not silently changed. The local publishing helper targets 1.3.0.

The +4 m/s amount is an initial tuning choice. Human feel testing is queued separately; it does not block work on the next sprint item.

## Earlier visual iterations
Run: `cd /workspace/skrumpey-slide && python3 -m http.server 8765` -> http://localhost:8765/ (v1 backup: http://localhost:8765/v1/). Offline; three.js r170 vendored.
Controls: hold mouse/touch/Space = dive, release = fly. M = mute.
- Perfect landing on a downslope: +12% speed, combo +1, +0.5 s of daylight. A steep landing costs speed and resets the combo.
- Stomp critters from above or bash walkers at speed above 24. Getting hit costs 40% speed, your power-up and the combo.
- Powers: Star (6 s, invincible, +25% speed, glow, star-skrump constellation part) and Beam (9 s, auto-fires every 0.4 s at critters ahead, ice-beam gaze part).
- Run ends at nightfall.
World: authored chunk templates (start/rest/rollers/bigRamp/plateau/gap) seeded+stitched, biomes every 430 m: Mellow Meadow -> Sunbake Dunes -> Crystal Night -> Cloud Isles (cycle).
Files: index.html (render/audio/UI; CONFIG reskin block at top incl. biome palettes + powerParts), sim.js (deterministic sim), bot.js (node checks), tools/test.js (headless e2e + screenshots + video; needs playwright-core), shots/.
Test hooks: ?speed=N ?bot=1 ?seed=N ?mute=1, window.GAME.give('star'|'beam') (debug only; not in the replay).
v2.1 feel pass:
- Faster physics: start speed 22, min 13, max 80, drag 0.004, dive gravity 140 vs 24, extra dive acceleration on downslopes, and a launch kick off upslopes.
- Perfect window widened to 0.5 rad, and allowed up to +0.1 slope.
- Dynamic camera (altitude and speed zoom, look-ahead, player in the lower third).
- Bigger power pickups with a beacon and bob, also placed on ramp-launch arcs; HUD timer bar; announcement text.
- Star: rainbow halo, aura ring and trail. Beam: trait part tipped forward, chunky shots that follow the player.
- Cloud biome brightened.
- metrics.js gives before/after numbers (`node metrics.js ./v2/sim.js`).
- Test hook ?pauseOn=highAir,star,beam,beamKill,clouds.
v2.2 (v2.1 backup in v2.1/):
- Rendering: interpolates between fixed sim steps; adaptive pixel ratio and shadows (?quality=N pins the pixel ratio).
- Performance: 1024 shadow map, props don't cast shadows, collectibles drawn as one instanced batch, fewer per-frame allocations.
- Zoom: capped at CONFIG.maxZoom, and the character scales up when zoomed out.
- Jump: ArrowUp/W, or the JUMP button on touch screens. 3 charges at the start (max 5), +1 per new biome, +1 per x5 combo perfect. Jumps go into the replay as inputs 2/3.
- Collectible: CONFIG.collectible slot (sprite billboard or voxel), currently DN nuts (assets/nuts/). Every 4th arc's middle nut is a rare 5x nut; "DN!" popup on 3-nut streaks.
- Measure frame times with tools/perf.js.
v3 (in its own folder; the v2.2 submission build in /workspace/skrumpey-slide is untouched):
- Skrumpey Train: stranded Skrumpeys are the other 11 token models, ordered by CONFIG.buddies (one per chunk). Touch one to rescue it and it follows your path from the sim's position history.
- Multiplier: each train member adds +0.2x to bonus points, capped at 2.5x total.
- Hits: a hit knocks off the last Skrumpey, which tumbles away. The full penalty only applies when the train is empty.
- Trait synergy: a star-trait member makes Star last 1.5x and the train shimmers. A beam-trait member adds a rear shot during Beam.
- Display: up to 12 are visible; beyond that the HUD shows (+N). Game over shows a squad card with a copy-able share text.
- Slingshot launch: hold to pull (the meter oscillates over a 1.5 s period), release to fire. A meter of 0.9 or more is a PERFECT LAUNCH. It auto-fires after 10 s. Pull ticks are logged as inputs, so launches replay deterministically.
