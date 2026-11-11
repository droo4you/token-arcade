# Powderline 1.1.0

Ruleset `powderline-v2`. The 1.0.0 sim in `releases/1.0.0/` is unchanged. Play this build at `/powderline/v/1.1.0/index.html`.

## Score

Score = whole meters down the fall line + trick points. Trick points are integers: clean trick landings, OK landings at half, threaded gates, a finished log slide, and one near-miss bonus each time the avalanche closes inside 4 m.

Combo is an integer from 1 to 8. A clean landing multiplies the trick's base points by the current combo, then the combo grows by 1. An OK landing pays half (integer divide) and the combo stays. A sketchy landing, a bail, or a crash sets the combo back to 1.

## Landing quality

The board's yaw is in turns. Spins write it from the trick clock: 360, 540, 720, and 1080 finish on a half turn, so a 540 lands switch. On the snow, yaw eases to the nearest half turn. At touchdown the distance to that half turn, plus sideways speed, picks the grade:

- Clean: within 0.08 of a half turn, and sideways speed at most 4.5.
- OK: within 0.20 of a half turn, and sideways speed at most 8.
- Sketchy: anything looser. The combo drops. A finished trick that touches down sketchy pays nothing.

A grab that is still running at touchdown pays half its points and drops the combo. An unfinished flip bails. Hitting a tree or a rock is still a crash.

## Boost and the avalanche

The meter does not refill on its own. It comes back from a clean trick, a smaller OK landing, a threaded gate (+6), a log slide (+10), and a near-miss inside 4 m (+14). Spending it still adds speed and opens the gap.

Avalanche speed is `20.4 + distance * 0.0135`, plus extra when the gap is already large. Gap at or under 0.45 m ends the run.

## Steering

Each 60 Hz character is an index into the 36-character alphabet: `steer + 3 * boost + 6 * trick`. Steer is 0, 1, or 2. Boost is 0 or 1. Trick is 0 through 5. The sim stores `steerHold`. The sideways target starts at 35% and reaches full after 0.35 s of the same direction. Full speed is 9 m/s and `STEER_A` is 4, so a release eases back to zero instead of snapping. A one-frame tap moves the rider less than 0.3 m. Holding across one lane (4.15 m) takes about 0.7 s. The snow arc and the edge chevrons follow `steerMag`.

## Tricks

A swipe in the air queues one trick, up to three deep. It scores only if the timer finishes before touchdown. The same trick id inside one combo pays 55% (floored) the next time.

- Tap, trick 5: Method, 0.3 s, 18 points.
- Up, trick 1: Indy, 0.35 s, 22 points.
- Left or right, tricks 3 and 4: 360, 0.55 s, 32 points. The same direction again stacks a 540, 720, or 1080, adding 0.25 s and 18 points each time.
- Down, trick 2: Backflip, 0.85 s, 48 points. Down and then a spin becomes a Rodeo, 1.1 s, 64 points.
- Up and then down: Double Grab, 0.7 s, 40 points.

Short grabs are there to build the combo. The long tricks need a large kicker.

## Kickers

Kickers come in three seeded sizes. Small is 4.4 m by 1.8 m, medium is 6.2 m by about 2.15 m, and large is 8.6 m by 2.6 m. The lip is `ramp.z`. The mesh uses `kickerBox` and `kickerSurface`, so the draw and the hitbox are the same rectangle. Crossing that rectangle rides you up the face and launches at the lip, including during the crash iframe.

Launch speed scales with the size, with how fast you are past 22 m/s, and with whether boost is held at the lip. From a cruise of about 24 m/s the hang is about 0.8 s on a small kicker, about 1.4 s on a medium one, and about 2.2 s on a large one or a boosted medium one.

## Line

Slalom pairs sit on every chunk whose index is at least 3 and `index % 3 === 1`, 18 m into the chunk. Passing between the poles on the snow pays `8 * combo`. A fallen log on chunks `index % 5 === 2` (from chunk 5) pays 16 points once you have stayed on it for 0.45 s.

## Passport tie-break

Same order as 1.0.0, scored by replaying this sim on the issued seed: higher score, then longer distance, then fewer crashes, then earlier acceptance time, then run id. A 1.1.0 proof is `{ v: 1, rules: "1.1.0", ruleset: "powderline-v2", seed, input }` with one character per 60 Hz tick. Decode a character with its alphabet index as `steer + 3 * boost + 6 * trick`. The live API referee is still `powderline-v1` on `releases/1.0.0/` until that adapter is switched.
