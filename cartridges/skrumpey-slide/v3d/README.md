# Skrumpey Slide 3D preview (rules 3d.1.0)

Playable three.js upscale of Skrumpey Slide. Live raid cartridges stay on their frozen paths:

- `/skrumpey-slide/v/1.0.0/`
- `/skrumpey-slide/v/1.1.0/`
- `/skrumpey-slide/v/1.2.0/` (the version new raids use)

This build is `cartridges/skrumpey-slide/v3d/`. Its sim stamps `rules: "3d.1.0"` on replays. A 3d replay will not verify against a 1.x session, and a 1.x replay will not verify here. Boards stay separated by `gameVersion`. Nothing in this preview deletes scores.

## Run

From the cartridge directory so the page can load `../vendor` and `../assets`:

```bash
cd cartridges/skrumpey-slide
python3 -m http.server 8765
```

Open http://localhost:8765/v3d/

The cartridge server also serves it at `/skrumpey-slide/v3d/` (and the shared `assets/` and `vendor/` next to it) without replacing the versioned raid URLs.

```bash
npm run dev:cartridges
```

Open http://127.0.0.1:8788/skrumpey-slide/v3d/

Hooks: `?seed=1&bot=1&auto=1&mute=1&speed=4`. Hold to dive, release to fly. On a phone, hold the screen or the DIVE button, and swipe or tap during a lane sprint. Phones start at pixel ratio 1, without antialiasing or shadow maps, so the menu and the first hill stay responsive. `?mobile=1` forces that path. `?mobile=0` keeps the desktop renderer.

`node cartridges/skrumpey-slide/v3d/build-arcade.mjs` writes `v3d/arcade.html` for a host embed. It stamps `proof.rules` from `SIM.RULES_VERSION` (`3d.1.0`). Do not point a live raid at this file.

## What you should feel

The run swaps, it does not pick a winner:

1. Meadow hills — classic dive / fly on a ribbon with width. Camera sits behind and above. Hold widens the FOV and tucks in; release floats back.
2. Three-stage, three-lane sprint (the 1.1.0 length: hurdles, corridors, slaloms, splits). Camera drops tighter so the lanes stay readable.
3. Dunes — a steep hill. A bad landing keeps 55% speed instead of 80%.
4. Lane sprint.
5. Crystal Night — lower gravity, longer air, slower daylight drain.
6. Lane sprint.
7. Cloud Isles — a short nimbus gorge. Release floats; hold is a dive-bomb. The camera yanks back while you sail the gap.
8. Lane sprint, then the cycle repeats until nightfall.

Perfect landings throw dust and a speed-line flash. That bonus is still the existing +14% / combo / daylight. The train follows the 3D samples in `hist`. A hit tumbles the last buddy back down the hill. Gorges, arches, and shoulder props are chunk pieces bent onto the seeded curve. Lighting and fog use the biome palette, and the sun drops warmer as daylight runs out.

Scored collision is still the deterministic 60 Hz heightfield and lane math. The ribbon width, camera, and particles are presentation.

## Phase 3 — infinite / survival (not in this build)

Spec only. Do not implement on this rules version.

- Separate mode, separate rules version, separate leaderboard. Cabinets own the boards. No admin score delete.
- A standard run still ends at nightfall. Survival ignores that soft cap or replaces it with a rising hazard, and it still swaps hills and lanes.
- Pick one primary fail before building: empty train + hit, miss the gorge / leave the ribbon, or stall under a minimum speed for N ticks.
- Board objective is its own metric (`distance` or `survivedMs`), not Free Play `score`.
- Raid checks for survival use that gameVersion only. Never verify a survival replay with the 1.x or 3d.1.0 Free Play sim.
