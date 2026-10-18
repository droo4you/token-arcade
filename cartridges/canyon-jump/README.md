# Canyon Jump

Original Token Arcade cartridge (Free Play). A generic pearl-white electric roadster in real 3D (three.js), chase cam from behind, three phases:

1. **Straightaway**: 3-lane desert highway. ←/→ (A/D) or swipe/tap to switch lanes. Dodge cacti, rocks, cones and tumbleweeds; grab AIR cans, coins and speed pads. Natural top speed (259 km/h) is under the **clear line** (324 km/h) on the speed meter, so you need pads.
2. **Launch**: the ramp at the rim launches you with your current speed. Under the line you drop into the canyon.
3. **Sky**: arrows/WASD (or drag the left side) to steer; SPACE / BOOST spends an AIR can for momentum; X / FLIP / swipe up kickflips (costs momentum, 0.5 s cooldown, needs 8 m of altitude, must finish before touchdown). Momentum decays; above the LIFT line on the meter you climb, below it you sink. Birds fly under 35 m, planes 35–80 m, satellites above 80 m; anything you'll reach within 1.6 s near your line gets a ! warning. Land past the far rim for +500.

**Mach 0.5** (617 km/h, +250 once per run): the road tops out at 396 km/h, so it's earned in the sky: launch at top speed and chain four AIR boosts back to back (or five from a slower launch). Both speed meters share one km/h scale with Mach 0.5 marked.

Touch lanes: one gesture = at most one lane change (`src/input.js`): a 26 px sideways swipe fires immediately, otherwise a tap fires on release (or after a 120 ms still hold); the gesture then locks until touchend.

Score = distance (m) + pickups/near misses + tricks + landing bonus + Mach bonus. Run ends on a highway crash, a midair hit, a botched landing, falling short, or a landing.

- `src/sim.js`: pure deterministic sim (120 Hz fixed step, seeded RNG; no DOM). Exports via `module.exports` and `globalThis.CJSim`.
- `src/render3d.js` + `src/3d/`: **real 3D renderer** (three.js r170, WebGL2), a pure view of sim state. `world.js` builds the level (gradient sky + PMREM environment, sun with shadows, dune terrain, textured highway, mesas, roadside props, ramp, canyon), `car.js` the procedural roadster (lofted body, pearl clearcoat paint, dark glass, lathe tires, emissive full-width taillight), `props.js` obstacle/pickup/sky models (one instanced draw call per type), `fx.js` world-space particles. Post: MSAA + UnrealBloom + grade/vignette + ACES output.
  - Quality tiers follow `G.q` (auto-drops after 2.5 s under 48 fps; `?q=1` / `?q=0` forces): **q=1** pixel ratio ≤ 1.75, 2k PCF soft shadows, bloom; **q=0** pixel ratio ≤ 1, no shadow map (blob contact shadow only), no post.
  - Falls back to the 2D renderer automatically if WebGL2 is missing; `?r=2d` forces it. `?level=<id>` picks a level.
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

`CJLevels.validate(level)` returns a list of problems; `tests/levels.mjs` validates every level. Phase 1 ships one level (`red-rock`). The sim still runs on its frozen constants, so a level's `sim` block must equal `CJSim.C` (the test enforces it); phase 2 passes `level.sim` into `CJSim.newRun(seed, level)` so each canyon can have its own gap and clear speed.
- `src/main.js`: input, camera (2D path), HUD overlay canvas on top of the WebGL canvas, screens, Token Arcade bridge (Free Play only; Passport/Raid mounts are refused).

Run locally: `npm run dev:cartridges` from the repo root, then open `http://127.0.0.1:8788/canyon-jump/v/1.0.0/index.html` (standalone) — `?autopilot=1&seed=3` plays itself for previews. Tests: `cartridges/canyon-jump/tests/*.mjs`, part of `npm test` (includes a search over every lane choice with the real sim proving a passable path exists on 60 seeds, and a flight-balance check).
