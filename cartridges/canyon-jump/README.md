# Canyon Jump

Original Token Arcade cartridge (Free Play). A generic pearl-white electric roadster, chase cam from behind, three phases:

1. **Straightaway**: 3-lane desert highway. ←/→ (A/D) or swipe/tap to switch lanes. Dodge cacti, rocks, cones and tumbleweeds; grab AIR cans, coins and speed pads. Natural top speed (259 km/h) is under the **clear line** (324 km/h) on the speed meter, so you need pads.
2. **Launch**: the ramp at the rim launches you with your current speed. Under the line you drop into the canyon.
3. **Sky**: arrows/WASD (or drag the left side) to steer; SPACE / BOOST spends an AIR can for momentum; X / FLIP / swipe up kickflips (costs momentum, 0.5 s cooldown, needs 8 m of altitude, must finish before touchdown). Momentum decays; above the LIFT line on the meter you climb, below it you sink. Birds fly under 35 m, planes 35–80 m, satellites above 80 m; anything you'll reach within 1.6 s near your line gets a ! warning. Land past the far rim for +500.

**Mach 0.5** (617 km/h, +250 once per run): the road tops out at 396 km/h, so it's earned in the sky: launch at top speed and chain four AIR boosts back to back (or five from a slower launch). Both speed meters share one km/h scale with Mach 0.5 marked.

Touch lanes: one gesture = at most one lane change (`src/input.js`): a 26 px sideways swipe fires immediately, otherwise a tap fires on release (or after a 120 ms still hold); the gesture then locks until touchend.

Score = distance (m) + pickups/near misses + tricks + landing bonus + Mach bonus. Run ends on a highway crash, a midair hit, a botched landing, falling short, or a landing.

- `src/sim.js`: pure deterministic sim (120 Hz fixed step, seeded RNG; no DOM). Exports via `module.exports` and `globalThis.CJSim`.
- `src/render.js`: pseudo-3D canvas renderer, all art drawn in code. `src/audio.js`: WebAudio synth SFX + loop. No asset files, no third-party licenses, no trademarks.
- `src/main.js`: input, camera, HUD, screens, Token Arcade bridge (Free Play only; Passport/Raid mounts are refused).

Run locally: `npm run dev:cartridges` from the repo root, then open `http://127.0.0.1:8788/canyon-jump/v/1.0.0/index.html` (standalone) — `?autopilot=1&seed=3` plays itself for previews. Tests: `cartridges/canyon-jump/tests/*.mjs`, part of `npm test` (includes a search over every lane choice with the real sim proving a passable path exists on 60 seeds, and a flight-balance check).
