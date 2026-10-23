# Canyon Jump

Original Token Arcade cartridge (Free Play). A generic pearl-white electric roadster in real 3D (three.js), chase cam from behind, three phases:

1. **Straightaway**: 3-lane desert highway, high chase cam (4.5 m up, 9.4 m back, looking 21 m ahead) so obstacle rows read early; road obstacles take less haze and carry a soft rim. ←/→ (A/D) or swipe/tap to switch lanes. Dodge cacti, rocks, cones and tumbleweeds; grab AIR cans, coins and speed pads (2.3 km runway, ~13 pads per run). Each coin is a tiny speed bump (+1.26 km/h; on the road it fades at 0.8 m/s², in the sky it sticks), so clean coin lines feed your launch. Natural top speed (259 km/h) is under the **clear line** (324 km/h) on the speed meter, so you need pads.
2. **Launch**: the kicker at the rim throws you up at ~15° with your current speed. The gorge is 520 m wide at the rim: a top-speed launch clears it hands-off, a minimum one needs a pull-up or a boost. The gorge is real: you can fly below the rim, but the walls (with ledges that jut into the gap) and the river (−110 m) end the run.
3. **Sky** (point-mass glider, `src/sim.js`): ↑/↓ (W/S, or drag the left-side stick) pitch the nose, ←/→ steer. Lift grows with speed², so **diving trades height for speed and climbing trades speed for height**; below 158 km/h (44 m/s) lift fades and you stall. Gravity 20 m/s², drag + induced drag on hard pulls, so energy only ever goes down except for Z (or J) / BOOST (one AIR can: +24 m/s, 0.3 s cooldown; a boost within 1.8 s of the last one is a **chain** link worth +10 m/s more, so a 3-chain is +24/+34/+44; a boost with the nose ≥17° down is a **DIVE BOOST**, 1.5× as strong). Holding the stick forward in a dive tucks the car (up to 50% less drag, never adds energy). Sky speed cap 702 km/h. X / FLIP / swipe up = kickflip (0.7 s), C / ROLL / sideways swipe = barrel roll (1.05 s); tricks are nearly pitch-neutral (a tiny lift dip mid-spin, at most 12%), need 8 m of air and a 0.2 s gap. Each trick, near miss and boost ring adds to the **combo pot × multiplier** (+0.5 per trick, 1.5× variety bonus for a new trick, max ×2.5; near misses count within 6 m of a sky hazard (+40 pot) and pay +50 on the road for a sub-1.3 m shave; distance stays the biggest share of a Mach run). The pot is only paid on a **clean landing** past the far rim: land mid-trick or nose-down steeper than 32° (PULL UP! / LEVEL OUT! warnings, which hint STABILIZE) and you crash and lose it. Forgiveness: a trick at least 85% round at touchdown is auto-finished and banked instead of botched. Boost rings and AIR cans sit on risky lines next to hazards and dive gates below the flight path.
   - **STABILIZE** (SPACE or SHIFT; on phones the wide STABILIZE pill above the BOOST/FLIP/ROLL cluster, sky only): cold-gas thrusters unwind any trick to upright along a smoothstep, pull the nose to about −3° and trim the sink rate by 30% while they burn. Costs one AIR can for a 0.4 s burn with a 1 s cooldown; with no cans it still fires, slower (0.9 s) with a 3 s cooldown, so there's always a lifeline. A trick it cancels is banked into the combo if at least half done, otherwise it's just dropped (no crash). The combo pot is kept. Near touchdown a nose-angle gauge shows LAND OK (green, inside the 0–32° window) or TOO STEEP / TRICK! (red).

**AIR cans** have no cap: every can you grab (road or sky) is kept. The HUD shows up to 5 can icons (3 on phones) and a ×N count past that; the phone BOOST button badge shows the count (99+ past 99) and reads DIVE when a boost would be a dive boost. Reference pilot average: ~3.8 cans collected per run, ~5 held at launch (most held in the 30-seed run: 9).

**Mach 0.5** (617 km/h, +1250 once per run): the road tops out at 396 km/h, so it's earned in the sky. A quick 3-boost chain off a good launch (about 335 km/h or more) gets there, even at human tap speed (0.55 s apart) off a top-speed launch; 2 level boosts, 3 spaced-out boosts, or 3 off a bare-minimum 324 km/h launch don't. The other route is 2 boosts in a committed dive from altitude. Within 50 km/h of the mark the speed bar glows and pulses and the Mach tick reads the gap; hitting it fires a MACH 0.5! banner, a sonic-boom vapor ring and the boom sound. Tests pin all of these. 30-seed balance: the reference pilot (frame-perfect, top-speed launch nearly every run) hits Mach in 26/27 flights; a "decent human" proxy (doesn't swerve for pads, boosts ≥0.55 s apart) hits it in 13/30 (43%). Phase 5 (2.3 km runway, 520 m gorge, more pads, coin bump), 200 seeds: reference pilot 96% Mach, decent proxy 56% Mach / 92% clear.

Touch lanes: one gesture = at most one lane change (`src/input.js`): a 26 px sideways swipe fires immediately, otherwise a tap fires on release (or after a 120 ms still hold); the gesture then locks until touchend.

Score = distance (m) + pickups/near misses + combo (pot × mult, landing only) + landing bonus (500, +150 on the road) + Mach bonus. Run ends on a highway crash, a midair/wall hit, a botched or nose-dive landing, not clearing the canyon (wall or river), or a landing after you run out of momentum.

- `src/sim.js`: pure deterministic sim (120 Hz fixed step, seeded RNG; no DOM). Exports via `module.exports` and `globalThis.CJSim`.
- `src/render3d.js` + `src/3d/`: **real 3D renderer** (three.js r170, WebGL2), a pure view of sim state. `world.js` builds the level (gradient sky + PMREM environment, sun with shadows, dune terrain, textured highway, mesas, roadside props, ramp, canyon), `car.js` the procedural roadster (lofted body, pearl clearcoat paint, dark glass, lathe tires, emissive full-width taillight), `props.js` obstacle/pickup/sky models (one instanced draw call per type), `fx.js` world-space particles. Post: MSAA + UnrealBloom + grade/vignette + ACES output.
  - Quality: an adaptive governor in `render3d.js` picks one of six levels (L0 min … L5 full). The drawing buffer is always capped (pixel ratio ≤ 1.5 and ≤ 2.1 MP at L5, 1.45 / 1.0 / 0.9 / 0.5 MP below), so Retina / 4K windows never render 6+ MP; the 2D HUD canvas is capped at ~3.7 MP. Step-down order: render scale → bloom → 1k shadows → shadows, MSAA and post off → fewer clouds/particles → shorter scenery draw distance. Start level comes from GPU hints (discrete L5, Apple L4, phones L3, Intel/integrated L2, software GL L0); after a 1.2 s settle it judges 1.5 s windows (trimmed mean): under 50 fps steps down (two under 32) and caps the ceiling there, 8 s at ≥ 58 fps steps up one. Two steps that buy nothing (30 Hz low-power cap, CPU-bound) are undone and it holds. Render-only: the sim never sees any of it. `?q=1` pins L5, `?q=0` pins L1 (old mid-phone look), `?ql=N` pins level N, `?qs=N` starts at N but stays governed, `?debug=1` shows FPS / level / buffer size / draw calls / triangles / governor log.
  - Roadside scatter is split into 240 m chunks (frustum- and shadow-culled, hidden beyond the level's draw distance); river boulders and scrub only draw near the gorge.
  - Falls back to the 2D renderer automatically if WebGL2 is missing or only a software rasterizer is available, on WebGL context loss, a shader compile/link error, a render exception, or if the lowest level still runs under 20 fps for two windows; `?r=2d` forces it. `?level=<id>` picks a level.
- `src/levels.js`: data-driven level definitions (see below). `src/render.js`: the original pseudo-3D canvas renderer (fallback). `src/audio.js`: WebAudio synth SFX + loop.
- `vendor/three/`: three.js r170 (MIT, `vendor/three/LICENSE`) and the addons used (EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass, BufferGeometryUtils), imports rewritten to relative paths. No CDN, no build step. All art is generated in code: no model or texture files, no trademarks.

### Levels (`src/levels.js`)

A level is one plain object; the 3D world is built entirely from it, so a new canyon (Grand Canyon, Snake River, ...) is a new entry, not new code:

| block | what it controls |
|---|---|
| `sim` | `ROAD_LEN`, `CANYON_W` (gap width), `CANYON_DEPTH`, `CLEAR_V` (clear speed), `RAMP_LEN/H`, `LANE_W` |
| `time` | sun elevation/azimuth/color/intensity/disk/glow, sky gradient (zenith/mid/horizon/below/haze/stars), hemisphere light, fog color/near/far, exposure, env intensity |
| `palette` | sand, asphalt, lane/edge lines, rumble, mesa strata, rock, cactus, scrub, poles, reflectors |
| `terrain` | ground size, flat shoulder width, dune amp/scale, mesa count/distance/height/radius/seed, roadside scatter counts, poles, reflectors, distance signs |
| `canyon` | wall strata colors, wall roughness, ledges, river color/width |
| `obstacles` / `skyObjects` | sim obstacle type -> model skin (`saguaro`, `sandstone`, `tumbleweed`, `cone`, `crow`, `jet`, `sat`) |
| `pickups`, `car` | glow colors for coins / AIR / pads, paint color |

`CJLevels.validate(level)` returns a list of problems; `tests/levels.mjs` validates every level. Level 1 is `snake-river` (Twin Falls / Evel Knievel gap). Grand Canyon is planned as level 2. The sim still runs on its frozen constants, so a level's `sim` block must equal `CJSim.C` (the test enforces it); phase 2 passes `level.sim` into `CJSim.newRun(seed, level)` so each canyon can have its own gap and clear speed.
- `src/main.js`: input, camera (2D path), HUD overlay canvas on top of the WebGL canvas, screens, Token Arcade bridge (Free Play only; Passport/Raid mounts are refused).

Run locally: `npm run dev:cartridges` from the repo root, then open `http://127.0.0.1:8788/canyon-jump/v/1.0.0/index.html` (standalone) — `?autopilot=1&seed=3` plays itself for previews. Tests: `cartridges/canyon-jump/tests/*.mjs`, part of `npm test` (includes a search over every lane choice with the real sim proving a passable path exists on 60 seeds, and a flight-balance check).


## Balance tooling

`node tools/human-proxy.cjs [sim.js]` flies a sloppy, mobile-ish human proxy (missed pads, human boost gaps, few rings) at two skill levels and prints Mach %, clear %, top-speed and past-rim distributions. Skill 1 is calibrated to a real phone run (396 km/h launch, ~536 km/h top). Past the far rim the ground runs `C.RUNWAY_PAST_RIM` (20 km) and the 3D road is a treadmill, so the runway never ends.

## Phase 7 (feel pass)

- Pitch: `PITCH_RESP` 7 → 16 (input smoothing time constant 0.14 s → 0.06 s), `G_LIMIT` 3.2 → 4.2 g so pull-ups bite at speed; touch stick full deflection at 38 px (was 46) with a 4 px dead zone (was 7). Stall (`V_STALL`, `CL_*`) and landing limits unchanged.
- Rewards: rings collect within `RING_PICK` 6 m (drawn 4.4 m), sky cans within `CAN_PICK` 4.5 m (was 2.6); safe (non-risky) rings and pickups within 10 m slide toward the car at 9 m/s but never toward a hazard. Lone sky AIR odds 25% → 30%. Ring speed kicks fade 0.8× per ring so ring chains can't fly forever; ring pot 50 → 25.
- Mach 0.5 bonus 250 → 1250.

## Phase 8 (level 1 = find the flow)

- Levels are split: one settings file per level in `src/levels/<id>.js` (level 1: `src/levels/snake-river.js`), collected by `src/levels.js`. Sky tuning lives in each level's `air` block and `CJSim.newRun(seed, level.air)` reads it (defaults to the default level).
- Snake River `air` (soft find-the-flow): ceiling 260 m (was a global 200), sparse traffic (1-2 hazards per 80 m chunk, was up to 3), birds below 30 m, **hot air balloons** 30-200 m (low-poly, 4 colorways, slow deterministic drift, hitbox 4.2 m inside a 6 m envelope, near-misses count), satellites only 215-252 m at 10% per chunk. No jets on level 1.
