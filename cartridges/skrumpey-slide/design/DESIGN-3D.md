# Skrumpey Slide — 3D Upscale Design

**Branch:** `grok/skrumpey-slide-3d-design`  
**Status:** Phase 0 — design + light scaffold only. **Not** for merging into live raids.  
**Live cartridge:** rules versions already shipped (`1.0.0` / `1.1.0` / current `1.2.0` on main) stay untouched. Any feel change that shifts scores ships as a **new** rules version on its own preview branch.

Inspired by the [Kid Goku three.js runner](https://x.com/threejs/status/2113470434356371947) and the Canyon Jump sauce (camera drama, set-piece mode changes, fog/FOV pulls) — **not a clone**. Steal the *drama*, keep Slide's identity.

---

## Identity

Skrumpey Slide is already a **Tiny Wings + Subway Surfers hybrid** on **three.js r170** (vendored). The upscale is not a port; it is turning the existing hills and lane sprints up to that sauce.

| Plot | Verb | Role |
|------|------|------|
| **A-plot** | Tiny Wings dive / fly | Hold = dive, release = fly. Perfect downslope landings (+speed, combo, daylight). Launch kicks off upslopes. Daylight timer ends the run. **This is the identity.** |
| **B-plot** | Multi-stage 3-lane sprints | Intercalated Subway Surfers sections. Rules **1.1.0** already lengthened them (3 stages, rising speed/density, new patterns). Playtesters loved competing on this. |

**Players like swapping between both.** Design around that rhythm — do not pick a winner. Lanes are the competitive score check; dive/fly is the feel and the spectacle. An infinite / survival mode comes later (Phase 3), not now.

---

## Rhythm (the thing to protect)

A good run should feel like:

```
Slingshot launch
  → Meadow hills (dive/fly)
  → Lane sprint (competitive check)
  → Dunes hills
  → Lane sprint
  → Crystal Night hills (longer air)
  → Lane sprint
  → Cloud Isles (short true-flight / dive-bomb beat)
  → … cycle or nightfall
```

Hills teach timing and sell the world. Lanes reset the brain to readable left/right skill and are where people race each other. Neither should eat the other.

---

## Upscale pillars

### 1. Real 3D hill ribbon (not a flat side-profile extrusion)

Today the terrain reads as a side profile extruded sideways. Target: a **ribbon with width** so diving commits into a *bowl*, not sliding on a line.

- Camera sits **behind-and-above** (Canyon Jump / Goku family), still readable for dive timing.
- Player stays in the lower third of the frame on hills.
- Ribbon width is cosmetic + camera framing first; scored collision stays the existing 2D heightfield / lane math until a rules bump is intentional.

### 2. Dive FOV punch + release float

- **Hold dive:** camera tucks in, FOV widens (weight / speed read).
- **Release:** camera floats back.
- **Perfect landing:** dust puff + brief speed-line flash that sells the existing +12% (visual only; scored mechanic locked).

Same "weight" trick Canyon Jump used for boosts. Pure presentation until a rules version opts into camera-affecting gameplay.

### 3. Gorge launch set pieces

Upslope launch kicks already exist. Author some as **Goku-pole-vault scale**:

- Camera yanks back across a canyon.
- Player sails.
- Stick the next downslope (perfect window still the live one).

This is Tiny Wings' money moment in 3D. Chunk-authored, seeded, deterministic.

### 4. Biome verbs (not just palette swaps)

Biomes already cycle every ~430 m: Mellow Meadow → Sunbake Dunes → Crystal Night → Cloud Isles. Upscale gives each a **verb**:

| Biome | Verb |
|-------|------|
| **Mellow Meadow** | Classic dive / fly. Teaching ground. |
| **Sunbake Dunes** | Soft sand: bad landings punish harder (feel; score change = new rules version). |
| **Crystal Night** | Low gravity / longer air. Big arcs, slower daylight drain optional. |
| **Cloud Isles** | **Nimbus beat:** short true-flight segment where dive becomes a dive-bomb. The Canyon Jump moment for this cartridge. |

Palette, fog, and lighting already exist in CONFIG; they should **paint the whole 3D scene** (sunset on hills, fog depth), not only a 2D backdrop.

### 5. Lane sprints stay the competitive check

- Keep **3-lane readability** (left / center / right).
- Sprints still **interrupt between biomes**.
- Rules **1.1.0** lengthening (3 stages, hurdles / corridors / slaloms / splits) is the baseline — do not shrink them for the 3D pass.
- Camera can pull tighter and flatter during lanes so lane reads stay Subway-Surfers-clear, then breathe out again on hills.

### 6. Skrumpey Train in 3D space

- Rescued buddies already follow `hist` (position history) from the sim.
- Upscale: trail the **real 3D path** with lag (ribbon space), not a flat follow.
- Hits still knock the **last** buddy; tumble them **downhill** in 3D (spectacle). Determinism from hist + seed stays.

### 7. Look & world construction

- **Toon / flat** materials, sharp shadows, dust puffs, speed lines on hops — Skrumpey look, not photoreal.
- Fog + sunset painting the 3D scene.
- **Chunk set pieces on a curve:** author modular chunks (bridge, gorge, cliff edge, water skim) and stitch them on a winding path. Left/right still map to 3 lanes on the path tangent during sprints.
- Obstacles stay seeded/deterministic; scenery carries the hype.

**Pushback (locked):** do not 3D-port the whole game as a straight lane clone. Canyon Jump worked because flight was a *different verb*. Slide's upscale is the same move: dive/fly is A-plot, lanes are B-plot, swap rhythm is the product.

---

## Phasing

### Phase 0 — this branch (design only)

- This doc: `cartridges/skrumpey-slide/design/DESIGN-3D.md`
- Spike stub: `cartridges/skrumpey-slide/design/v3d/README.md` (next steps only; no live code change)
- Pointer from cartridge `README.md`
- **No** sim / scoring / arcade.html changes. **No** merge into raid-facing main until a later preview branch + new rules version if scores move.

### Phase 1 — feel pass (separate preview branch)

- Hill ribbon with width + behind-above camera.
- Dive FOV punch / release float.
- Perfect-landing dust / speed-lines (presentation).
- Keep scored mechanics locked; if anything drifts, bump rules version and freeze the old sim like 1.0.0 → 1.1.0.

### Phase 2 — verbs + set pieces

- Biome verbs (Meadow / Dunes / Crystal Night / Cloud Isles Nimbus beat).
- Gorge launch set pieces with camera yank.
- Train trails real 3D path; downhill tumble on hit.
- Chunks on a curve; fog/sunset painting the scene.

### Phase 3 — infinite / survival mode (later)

- Separate mode, **separate rules version / leaderboard**.
- Die a certain way ends the run (spec below); score = distance and/or time survived.
- Still uses the swap rhythm (hills ↔ lanes) so it does not become a pure endless lane clone.
- **Do not build in Phase 0–2.** Spec only:

**Survival death (draft, unlocked later):**

1. Nightfall still ends a *standard* run; survival ignores the daylight soft-cap or replaces it with a rising hazard.
2. Candidate fail conditions (pick one primary before build): empty train + hit, fall off ribbon / miss gorge landing, or stall below min speed for N ticks.
3. Board objective distinct from Free Play score (e.g. `distance` or `survivedMs`) so Cabinets do not mix boards.
4. Raid validity: survival is its own gameVersion; never verify with the 1.x Free Play sim.

---

## Constraints (hard)

- **Deterministic 60 Hz sim**, replay-proof, Cabinets own leaderboards, **no admin score delete**.
- Live rules (`1.1.0` longer runner, current main, and any frozen legacy under `apps/api/src/legacy/`) **stay untouched**.
- Feel / world / score shifts → **new rules version** + frozen prior sim (same pattern as 1.0.0 → 1.1.0).
- Reskinning visuals must **keep scored mechanics locked** unless the version bump is explicit.
- Host adapter (`arcade.html` / `build-arcade.mjs`), Passport, and raid session verification stay compatible; preview branches get their own artifact path when ready.
- Community Skrumpeys remain the runner / train skins.

---

## Non-goals (this design branch)

- Full rewrite of `sim.js` / `index.html`.
- Shipping to live Free Play / Raid.
- Replacing lanes with pure 3D flight.
- Photoreal materials or physics that break phone perf targets.
- Building Phase 3 survival now.

---

## Reference touchstones

- In-house: Canyon Jump 3D camera / boost weight (preview branch family).
- External: three.js post — Kid Goku: Beyond the Clouds fan runner (set-piece mode changes, FOV/fog drama).
- Live Slide: Tiny Wings dive/fly + 1.1.0 multi-stage lane sprints + Skrumpey Train hist follow.

---

## Open questions (for droober / Codex before Phase 1 code)

1. Cloud Isles Nimbus beat: timed auto-segment vs player-triggered gate?
2. Dunes "punish harder": presentation-only first, or intentional rules bump?
3. Survival primary fail condition (train wipe vs gorge miss vs stall)?
4. Preview hosting: reuse slide preview service or new Render service name?

---

*Phase 0 deliverable. Next concrete step after approval: Phase 1 preview branch off main, no raid merge until feel + bot seed parity are green.*
