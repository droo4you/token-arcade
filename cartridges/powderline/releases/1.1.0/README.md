# Powderline 1.1.0

Ruleset `powderline-v2`. The 1.0.0 sim in `releases/1.0.0/` is unchanged. Play this build at `/powderline/v/1.1.0/index.html`.

## Score

Score = whole meters down the fall line + trick points. Trick points are integers: clean trick landings, OK landings at half, threaded gates, a finished log slide, and one near-miss bonus each time the avalanche closes inside 4 m.

Combo is an integer from 1 to 8. A clean landing multiplies the trick's base points by the current combo, then the combo grows by 1. An OK landing pays half (integer divide) and the combo stays. A sketchy landing, a bail, or a crash sets the combo back to 1.

## Landing quality

The board's yaw is a fraction of a turn. Frontside and backside spins advance it across the trick. On the snow it recenters. At touchdown the wrapped distance to a full turn, plus sideways speed, picks the grade:

- Clean: within 0.08 of a turn, and sideways speed at most 4.5.
- OK: within 0.20 of a turn, and sideways speed at most 8.
- Sketchy: anything looser. The combo drops. No trick points.

Bailing before 85% of the trick, or hitting a tree or rock, is still a miss.

## Boost and the avalanche

The meter does not refill on its own. It comes back from a clean trick, a smaller OK landing, a threaded gate (+6), a log slide (+10), and a near-miss inside 4 m (+14). Spending it still adds speed and opens the gap.

Avalanche speed is `20.4 + distance * 0.0135`, plus extra when the gap is already large. Gap at or under 0.45 m ends the run.

## Steering

Input codes are unchanged: steer 0, 1, or 2 inside the 60 Hz character. The sim stores `steerHold`. The sideways target starts at 35% and reaches full after 0.35 s of the same direction. Full speed is 9 m/s and `STEER_A` is 4, so a release eases back to zero instead of snapping. A one-frame tap moves the rider less than 0.3 m. Holding across one lane (4.15 m) takes 0.8 s. The snow arc and the edge chevrons follow `steerMag`. A 7.5 m/s cap with this same ramp takes 0.9 s, which is outside the lane window, so the cap is 9.

## Kickers

A kicker is `ramp.w` wide and 6.2 m long, with the lip at `ramp.z`. The mesh uses `kickerBox` and `kickerSurface`, so the draw and the hitbox are the same rectangle. Crossing that rectangle rides you up the face and launches at the lip, including during the crash iframe.

## Line

Slalom pairs sit on every chunk whose index is at least 3 and `index % 3 === 1`, 18 m into the chunk. Passing between the poles on the snow pays `8 * combo`. A fallen log on chunks `index % 5 === 2` (from chunk 5) pays 16 points once you have stayed on it for 0.45 s.

## Passport tie-break

Same order as 1.0.0, scored by replaying this sim on the issued seed: higher score, then longer distance, then fewer crashes, then earlier acceptance time, then run id. A 1.1.0 proof is `{ v: 1, rules: "1.1.0", ruleset: "powderline-v2", seed, input }` with one character per 60 Hz tick. The live API referee is still `powderline-v1` on `releases/1.0.0/` until that adapter is switched.
