# Mood Swings

Engineering notes for the Mood Swings cartridge (`emonad-cabinet`) in Token Arcade.
Zero dependencies, vanilla canvas, one HTML file plus one CSS and one JS.

## The game in one paragraph

A price chart falls. You slide the BUY button along the bottom to catch it, Pong
style. Every catch launches it again and prints a higher low, so the support line
climbs and the camera pans up and to the right. Miss once and the run ends. Your
score is the ATH market cap you reached. The trail the chart leaves is a real,
legible price chart, which is the share artifact.

**One input.** Drag to move the button. That is the entire control scheme. There is
no tap, no second button. Do not add one.

## Style rules (these are the user's standing preferences)

- Never use "not X, but Y" or "not X, it's Y" constructions anywhere, including code
  comments. Lead with the actual statement.
- No em dashes anywhere.
- Use "crypto" over "Web3".
- Direct and structured. "Here's the move" over "here are some options."
- **Anything crypto-facing is signed droober, never a real name.** That covers in-game
  copy, README text, commit trailers, and anything a player or reader can see. The git
  identity on this repo is already `droo4you`; the leak to watch for is prose, and it
  has happened once, in tuning-panel copy telling players who to send feedback to.

## Brand rules (from hoodbuybutton.com/brand)

- Acid `#ccff00`, ink `#110e08`, paper `#f7f7f5`, halt red `#C92E29`, olive `#586D00`
- BUY stays black, the face stays fluorescent acid, the capsule silhouette stays
  obviously pressable
- The polished capsule is the canonical artifact. The square machine enclosure is
  installation context and must never be used as a logo
- Disclaimer where relevant: $BUY is a meme token and is not affiliated with
  Robinhood, Lighter, GameStop, Reddit, or any named company
- **Never use the word "rug" or any variant anywhere in the game, copy, or code.**
  This was an explicit product decision. Verdict tiers are Paper hands, Respectable,
  Solid bags, Legendary run. A miss is "the run is over."

## Architecture

Single IIFE in `src/game.js`. No build step, no framework, no bundler.

### The start gate (`S.ready`)

A run is frozen until the player takes hold of the button. Until then `update()`
returns early: no run clock, no gravity, no camera motion, no trail. `setPad()` sets
`S.ready = true` on first contact, so the release is the existing drag input and no
second control is introduced.

This exists because starting the drop the instant the menu closed gave about 0.4s of
reaction time. On a rematch, where the player is already mid-adrenaline and clicking
`again`, that read as the game starting without them.

`S.idleT` advances while frozen and drives the prompt pulse, since `S.t` is
deliberately stopped. Anything that needs a clock before the run begins must use
`idleT`. `tools/determinism.js` asserts the gate holds across 600 idle frames.

### Coordinate system

World space has y increasing upward. Screen space has y increasing downward.

```
sx(x) = x - cam.x
sy(y) = cam.y - y
```

`cam.y` is set so the support line always sits at a fixed screen height near the
bottom (`PAD_Y()`). `cam.x` advances at a smoothed speed with a soft correction that
keeps the chart between 18% and 80% of screen width.

### The support line (`S.base`)

The rising line the button sits on. Each catch raises `S.baseT` (the target) and
`S.base` lerps toward it. This is what makes the camera climb and what draws the
dashed rising trendline. It is the spine of the whole game.

### Miss detection: `S.armed` (do not refactor casually)

The original implementation checked for a *crossing*, meaning above the line last
frame and below it this frame. This caused a shipped bug: after a diamond hands save
the chart relaunched from below the line, so no crossing ever occurred again, the
miss could never fire, and the chart fell forever while the score froze. On a
leaderboard that is a farmable exploit.

Current logic:

1. `S.armed = true` once the chart is 12px above the line
2. While armed, any descent through the line resolves as a catch or a miss
3. Hard failsafe: 70px below the line without resolving ends the run regardless

Anything that repositions the chart (shield save, whale sell) must leave it in a
valid state. Whale sell scales its downward impulse by available room so it cannot
punch through the line.

### Scoring: climb, then one power law

**This was rebuilt three times. Read this before changing it.**

Earlier versions compounded per pixel of travel: `(1+g)^n`. Doubling your time
*squared* the score, and power-ups modified `g` inside the exponent, so a 2x leverage
squared the covered portion of the run. Since leverage was live roughly 75% of a
typical run, 48 seconds produced $99B. Every tuning estimate was off by 10x to 1000x.

Current model. One additive quantity, one transform:

```js
S.climb += (1 + 0.8*edge) * S.mult   // per catch
S.climb += 0.5 * min(5, chain) * S.mult   // retail bid
S.climb += 8                          // whale buy
S.climb -= 4                          // whale sell

S.cap = 812400 * Math.pow(1 + S.climb/73, 5)
```

Two constants, two independent jobs:

- **73** is scale. Raise it and everything shrinks proportionally.
- **5** is steepness. Raise it and long runs pull further ahead of short ones.

Displayed market cap rides the committed `cap` by ±18% with chart height, so the
number feels alive and a whale apex visibly spikes a new ATH. ATH is the high water
mark of the displayed value.

Measured curve: 53s ≈ $280M, 2min ≈ $6B, 3min ≈ $34B, 4min ≈ $123B.

Real human runs, 2026-08-26, for comparison against those synthetic figures:

| time | ATH | buys | climb |
|------|-----|------|-------|
| 54s | $988M | 71 | 225 |
| 165s | $8.66B | 185 | 387 |

Both land exactly on `812400 * (1 + climb/73)^5` plus the ±18% display ride, so the
formula is confirmed against real play. Note the shape though: a skilled player beats
the synthetic 53s figure by 3.5x, then falls well short of the interpolated 165s
figure. Climb accrues fast early and slows late, because the button narrows with
difficulty exactly when edge bonuses are worth most. If the late game needs to pay
better, widen the floor in the `S.pad.w` difficulty ramp before touching the exponent.

The player also reports real skill expression: declining a pickup on purpose, and
setting up early for a whale or a double-whale combo. That emergent depth comes from
the pickup mix, so keep the mix varied when tuning spawn weights.

**Never put a power-up inside an exponent.** Everything contributes to `climb`.

### Variance (do not remove)

A dead-center hit once produced exactly the camera's speed, so the chart returned to
the identical screen position every bounce. Players found a sweet spot and stopped
moving. Three layers now prevent any stable equilibrium:

1. Per-bounce volatility, ±26% horizontal and ±12% height
2. Big moves, 16% chance at ±52%, labeled BREAKOUT or CHOP
3. Two slow sines on camera scroll speed, ±15%

If it ever feels random rather than readable, trim the big-move *rate* first. The
base volatility is what keeps the player engaged.

### Chart rendering

The trail is sampled at fixed intervals with a stable per-point noise offset baked in
at push time, mitered joins, butt caps, and wicks on roughly one tick in nine. The
glow is a separate wide low-alpha underlay because a shadowed stroke rounds the
shape and makes it read as a bouncing ball instead of price action.

### Head skins (built 2026-09-13)

`HEADS` in `src/game.js` lists the chart cursor options. 0 is the 8px square, the
rest are PNGs in `public/assets/heads/`, real transparency, facing right, any size
(shipped at 160px, drawn at 30px with an accent glow and a tilt from `S.head.vy`).
A file that fails to load falls back to the square. `T.head` is player-facing, rides
in Copy setup links, and is not in `SIM_KEYS`; `update()` never reads it.

The picker is a swatch row under Palette, the art itself as the button, selected one
ringed in accent. A hidden range input `shd` under it is still the value carrier:
a swatch click writes the range and fires its `oninput`, so Copy setup, applySetup
and the label keep going through the one input path the rest of the panel uses.

Adding one is a line in `HEADS` plus the file; the slider max follows the list.
Mascot JPGs with a fake checkerboard need keying first. The scratchpad script
`key-head.js` (jpeg-js plus pngjs, outside the project) flood-fills the board from
the border, so white areas inside the black outline survive, then trims and
box-downscales. Photos with pale fur and no outline need `thr=242` (pure white
only), a `crop` to the head, `mask=4` (soft rounded square) and a `fade` at the
neck; cashcat was `crop=415,70,955,600 thr=242 fade=0.15 mask=4`. Ponshouse was the plain
recipe with `crop=290,70,1140,712`, the bottom edge set just above the collar. Tendies
(2026-09-14) was a plain white background and needed no flags at all. Robbie came as
a real transparent PNG and only needed a trim and square (`trim-head.js`, same folder). Cosmetics are the season one unlock lane: heads gated by daily
rank or window tickets is the planned hook, nothing gates them yet.

### The button (three layers)

`buy-housing.png`, `buy-cap.png`, `buy-lip.png` were derived programmatically from
the official transparent capsule PNG: the lime cap was segmented by color, its
lettering hole-filled so it travels with the cap, and a dark gradient well painted
where the cap sat.

Draw order matters: **housing, then cap offset downward, then front lip.** The lip is
what makes the cap slide *behind* the casing. Without it the cap visibly overhangs
the housing when pressed.

Travel is 5.5% of button height, releasing over about 220ms.

## Audio

`src/game.js` tries the WAVs in `public/sounds/` first and falls back to WebAudio
synthesis if they are missing or blocked.

- **Catch**: bandpassed noise transient plus a pitched thunk, 340Hz to 115Hz in 55ms
- **Whale buy**: sawtooth sweep 200Hz to 1250Hz plus a sine shimmer
- **Milestone**: four-note major arpeggio

The real files are in `public/sounds/` as of 2026-08-27 and take over automatically.
All three are mono 44.1kHz 16-bit, 94KB total.

| file | plays on | length | peak |
|------|----------|--------|------|
| `button-tap.wav` | every catch | 130 ms | -1.3 dBFS |
| `button-woo.wav` | whale buy (the WHALE pickup) | 380 ms | -5.3 dBFS |
| `button-milestone.wav` | market cap milestone | 580 ms | -7.9 dBFS |

The 130ms tap exceeds the 80ms guideline below and is fine anyway. Measured over a
192s run of 227 catches, the median gap between catches is 792ms and only 1 of 226
falls under 130ms. The tap pool holds 5 voices, so that one overlap round-robins
instead of cutting itself off.

Watch the tap level. At -1.3 dBFS it is roughly 4dB hotter than woo and 6dB hotter
than milestone, and it is the one that repeats all run. If it fatigues, lower the play
volume at the call site rather than re-mastering the file.

Two constraints for whoever supplies them:

- The tap fires roughly once per second for minutes. Anything with a tail turns to
  mush. Target under 80ms.
- Prefer MP3 or OGG. WAV is uncompressed and bloats the payload about 10x.

iOS blocks audio until a user gesture, so the start tap calls `ac()` and
`SFX.*.unlock()`. Keep that. `startMode()` also calls both before its seed fetch,
because daily and window reach `start()` after an await, outside the tap; that
silenced music in Chrome on iPhone while free play was fine. `ac()` warms the context
once with a one-sample source and sets `navigator.audioSession.type` to playback:
WebAudio is muted by the ringer switch on iOS by default while the `<audio>` SFX
are not, which reads as taps without music.
Chrome on iPhone is a WKWebView without that API and stayed silent with the context
running and the sequencer playing; a silent media loop did not flip the session either.
There (`IOS_WEBVIEW`: iOS UA and no `navigator.audioSession`) the music leaves
WebAudio through a MediaStreamDestination and an `<audio>` element plays the stream,
the path the WAVs take. `musicOut()` picks the terminal node, `keepSession()` plays
and pauses the element with the sequencer, and the first play happens in the gesture
in `ac()`. It puts the page in Now Playing during a run; that is the cost.

### Music (built 2026-09-13)

`MUSIC` in `src/game.js` is a WebAudio step sequencer, no files. Three tracks in
the Geometry Dash pocket, picked from the tuning panel and carried in Copy setup
links: **Breakout** (140bpm, A minor, the default), **Melt-Up** (165bpm, E minor,
16th-note lead), **Accumulate** (128bpm, C major, plucky and sparse). Each is a data
block: 16-step drum and bass rows, a four-bar lead in scale degrees, a four-chord
progression the bass and arp follow.

Signal chain: drums straight to master; bass, lead and arp through a `duck` gain
that every kick dips (the sidechain pump), lead and arp also through a lowpass whose
cutoff `tick()` drives from `S.t`. Closed on the start gate, so a run opens with a
muffled intro and brightens as the ramp bites. Then a compressor, then out.

Lifecycle: `start()` plays `T.music`, `die()` fades over 1.1s, `show()` stops,
a hidden tab stops and a visible one resumes. Panel changes go through `sync()`:
a new track restarts, Sound off kills it, volume follows live.

**It is render-side only.** It reads `S.ready`, `S.t`, `S.over` and writes nothing
the simulation reads. `music` and `musicVol` are not in `SIM_KEYS`. The harness
has no `AudioContext`, so every entry point is wrapped and the module is inert
there; a smoke test with a fake context lives in the session scratchpad rather
than `tools/` for now. Never call `rng()` from it, for the same reason as
`noiseBuf`.

Volume sits at `musicVol/100 * 0.55` so the tap SFX still reads over it. If the
lead fatigues, lower the `0.11` per-oscillator gain in `lead()` rather than the
master. If a produced track replaces this later, it slots in as a fourth option
on the same slider; Newgrounds licenses are per track, OpenGameArt CC0 and Pixabay
Music are safe for a paid event.

## Tuning panel

Gear icon, bottom left. Palette presets, live accent and background pickers, and
sliders for gravity, bounce, chart speed, button width, difficulty ramp, chart noise,
brand assets on/off, sound, music track, and music volume.

**Two kinds of control live in one panel (decided 2026-09-13).** Palette, accent, base,
music track and music volume are player-facing and stay in the final product. The feel
sliders (gravity, bounce, chart speed, button width, ramp, noise) are dev tuning still
being felt out and are not committed to shipping. When the panel is split, the first
group becomes Settings and the second stays behind a dev flag. Nothing persists, by design. There is no
localStorage anywhere and artifacts do not support it.

Current defaults: gravity 2650, bounce 980, speed 210, button width 96 (108 until
2026-09-13; the ramp numbers below were measured at 108). `T_DEFAULT`
snapshots these before anything can touch `T`, so Reset restores the shipped values
rather than whatever the panel happened to open on.

**Copy setup** puts the whole configuration in the URL hash and on the clipboard, so a
tester can paste a link that opens the game on their exact feel. The hash IS the
parameter string. Nesting it as `#tune=<querystring>` looked tidier and broke: the
payload contains `&` separators, so parsing stopped at the first one and a shared link
applied gravity alone while silently dropping everything else.

Applying a setup always goes through the slider input and its `oninput` handler rather
than writing `T` directly. Writing `T` and leaving the inputs behind means the next
drag of any slider snaps the others back to stale positions.

Invalid values in a link are skipped individually, so a mangled paste applies the parts
that survive instead of failing whole.

## Roadmap, in dependency order

### 1. Deterministic simulation (blocks everything else)

Nothing token-adjacent can ship without this. A client-side JS game gets farmed the
day score maps to value.

- [x] Seed the RNG, replace every `Math.random()` with a seeded PRNG
- [x] Fixed timestep physics, `update()` only ever receives `STEP` (1/120s)
- [x] Record paddle position per tick, ~1 byte/tick packed
- [x] Re-simulate server side and verify the score matches
- [x] Remove engine-dependent math from the simulation path (see below)

Cheating then requires actually playing well. This also makes tuning reproducible.

**Step 1 is complete.** What remains before a leaderboard can carry value is
plumbing, covered in steps 2 to 4 below, rather than simulation integrity.

#### Recording and verification (done)

`S.track` collects `S.pad.x` at the top of every tick, before physics reads it, so
`track[i]` is exactly the input tick `i` saw. Paddle x is the whole control scheme, so
seed plus track is a complete description of a run.

`clampPad()` rounds paddle x to a whole pixel. That rounding is what makes a run
recordable at all: the simulation only ever sees integers, so the track is an exact
record rather than a lossy approximation, and a verifier lands on the identical score.
Sub-pixel paddle precision is imperceptible and not worth giving that up.

`BB.record()` returns the submittable object:

```
{ v, seed, w, h, step, steps, track, claim:{ ath, cap, climb, buys, best, t } }
```

`w` and `h` are part of the input, not metadata. The play area bounds the paddle and
the camera correction reads screen width, so a replay at a different window size is a
different run. Everything under `claim` is recomputed by the verifier and compared.

Track codec: delta, zigzag, varint, base64. Measured at **1.00 bytes/tick packed**,
50% of a raw Int16 dump. A 144s run is 17280 ticks and 17KB packed, 23KB as base64.
The earlier 3.6KB estimate for two minutes assumed 60Hz ticks; at 120Hz the real
figure is about 14KB. Still small enough to post in a request body.

#### `tools/`

- `harness.js` loads `src/game.js` into a vm context with a stubbed DOM. Both tools
  below share it so their stubs cannot drift apart. Also holds `decodeTrack`, the
  mirror of `encodeTrack` in the game.
- `serve.js` is a zero-dependency static server: `node tools/serve.js [port]`,
  default 8000.
- `determinism.js` asserts same-seed reproducibility (including a hash of the whole
  trail), that a different seed diverges, that the start gate holds, and that 240Hz,
  60Hz and 30Hz produce byte-identical state.
- `verify.js` is the server-side check. `node tools/verify.js run.json` validates a
  record; `--self-test [frames]` plays a run, records it, and verifies it from seed
  and track alone. It also asserts that a forged claim, a claim paired with a
  different track, and a truncated track are all rejected.

A single edited tick usually changes nothing, and that is correct rather than a hole:
at 120Hz the paddle position on one tick out of thousands only matters if the chart is
meeting it right then. The property enforced is that the claim matches the track.

#### Engine-independent math (done, record version 2)

Seeding the RNG is not enough on its own. ECMA-262 specifies `+`, `-`, `*`, `/`
and `Math.floor` exactly, but it does **not** specify the precision of
`Math.sin`, `Math.cos`, `Math.pow`, `Math.exp` or `Math.log`. Two engines may
legally disagree on those. Runs stayed reproducible only because the game and
`tools/verify.js` both run on V8, which is precisely the case that does not
matter: the point of publishing a replay is that a player checks it in a browser
we did not choose.

Two call sites were reachable from `update()` and both are gone:

- `S.cap` scored through `Math.pow(b,5)`. The exponent is a literal 5, so it is
  now `b2*b2*b`. Max relative difference from the old formula is 4.4e-16, which
  is float noise on a number that renders rounded.
- The camera `wander` used two `Math.sin` calls. Now `dsin()`, defined next to
  `mulberry32`: range-reduce to turns, fold into `[-HALF_PI, HALF_PI]`, then an
  odd Taylor series to x^11. Max absolute error against `Math.sin` is 5.6e-8
  over x in [-200,200], and the wander coefficients scale that to 6.2e-9.

`Math.cos` and `Math.sin` still appear in `burst()` and are a deliberate
holdout, documented in place. Particles are visual only, and the determinism
fingerprint takes `S.parts.length`, which the `rng()` draws set rather than
these values. The `rng()` calls in `burst()` are on the simulation stream and
must not be moved.

**Record version is now 2.** v1 runs scored fractionally differently and
`tools/verify.js` rejects them. Any v1 rows on the board cannot be replayed
against this build.

#### Seeded RNG (done)

`mulberry32`, all-integer so the sequence is identical in every JS engine. That
property is what server-side replay verification rests on. One seed per run lives at
`S.seed` and drives two independent streams:

- `rng()` is the simulation stream. Everything that can change the outcome of a run
  goes through it: pickup kind and placement, bounce volatility, trail shape,
  particle bursts. Called only from `update()` and what `update()` calls.
- `vrng()` is the visual stream, render path only, currently just camera shake.

The split exists for the fixed-timestep step below. That loop will run `update()` a
variable number of times per drawn frame, so any RNG draw in the render path would
shift the simulation stream and break replay. **Never call `rng()` from `draw()` or
`hud()`, and never call `vrng()` from `update()`.**

One deliberate holdout stays on `Math.random`: the WebAudio noise buffer in
`clickSound`. It is built lazily on the first sound, so pulling 2048 values from the
seeded stream there would desync it based on whether and when audio initialized. It
cannot affect gameplay, so it stays off the stream.

`window.BB` is the console handle. `BB.seed` reads the current run's seed, `BB.state`
exposes `S`, and `BB.replay(seed)` reruns a seed. `start()` takes an optional seed and
guards its argument with a `typeof` check, since it is wired straight to `onclick` and
would otherwise receive a MouseEvent.

#### tools/

`node tools/serve.js [port]` is a zero-dependency static server for local play,
defaulting to port 8000. The README previously pointed at `python3 -m http.server`,
which does nothing on the Windows dev box.

#### `tools/determinism.js`

Headless check. Loads `src/game.js` into a vm context with a stubbed DOM, drives the
real RAF loop with an exact timestamp sequence and an autoplayer that tracks the
chart, then fingerprints final state including a hash of the whole trail.

```bash
node tools/determinism.js 12000     # frame count, 16ms each
```

Asserts that the same seed reproduces exactly and that a different seed diverges.
Verified clean at 12000 frames, roughly 192 seconds of play and 236 bounces. This
harness is the starting point for the server-side verifier in step 5: replace the
autoplayer with a recorded paddle track and compare the resulting score.

### 2. Daily seed

Everyone gets the same pickup sequence each day, so scores are comparable and it
becomes a Wordle-shaped ritual.

#### Two modes (decided 2026-08-26)

- **DAILY** plays today's seed. Three attempts, best score counts. Feeds the daily
  board. This is the front door.
- **FREE PLAY** rolls a random seed every run, unlimited. Feeds an all-time board
  only. This is where practice, tuning and messing around live.

Daily and all-time then mean different things: one rewards reading a shared sequence
well, the other rewards volume.

#### The seed is delivered by the server at run start

**The client cannot be given the seed before a ranked run begins.** Anything the game
needs in order to run the daily is readable out of the page, so a public seed means a
player can rehearse the exact whale and dump placements as many times as they like and
submit only their best. The top of the board becomes whoever ground it hardest.

So: `POST /api/daily/start` returns the seed and an attempt token, and it only does so
when an attempt is actually being spent. Three per player per UTC day, counted server
side. Client-side attempt limits are worthless, since the counter is in the page.

**This is a deliberate trade against commit-reveal.** Commit-reveal is trustless and it
works, but it publishes the day's seed at day start, which is precisely what makes
rehearsal possible. Trustlessness and unpracticeability pull in opposite directions
here, so pick by what is at stake. Season one is cosmetics only (see step 4), the trust
surface is near zero, and the better ritual is worth more than verifiability of a
button skin.

**Revisit this the moment prizes carry real value.** At that point commit-reveal, or
the Base/Monad Entropy relay below, becomes the right answer and rehearsal becomes a
cost worth paying. Do not let season one's choice harden into the permanent one.

Pyth Entropy is the right onchain source but is **not deployed on Robinhood Chain
(4663)**. Verify before planning around it. Two options: request on Base or Monad and
relay, or run commit-reveal natively (publish `keccak(tomorrow's seed)` today, reveal
tomorrow).

Entropy cannot drive per-bounce randomness. It is a request/callback with a reveal
delay and gas per request. One seed per day, expanded by a PRNG.

#### Server contract (built 2026-08-27)

```
POST /api/daily/start   -> { seed, attemptId, attemptsLeft, day }
                           spends one of the day's three attempts
POST /api/run/submit    -> { accepted, rank, best }
                           body is BB.record() plus attemptId
                           server runs tools/verify.js and rejects a mismatch
GET  /api/board?day=    -> { daily:[...], allTime:[...] }
```

`attemptId` binds a record to the attempt that issued its seed, so one issued seed
cannot be submitted twice and a record cannot be replayed against another attempt.
Free play submissions carry no `attemptId` and are eligible for the all-time board
only. The server never trusts `claim`: it re-simulates from `seed` plus `track` with
the same verifier and compares.

#### One seed per attempt index, not per day

**This looks like a detail and is actually the whole anti-rehearsal property.**

The first build gave every attempt in a day the same seed. Spending attempt 1 then
revealed the chart that attempts 2 and 3 would also use, so a player could rehearse it
locally as many times as they liked and submit only their best. The seed check in
`submit` was vacuous, because every attempt matched every seed. A submitted run was
accepted against an attempt it had nothing to do with, confirmed in testing.

Seeds are keyed by `(day, idx)` instead. Everyone's first run is the same chart,
everyone's second run is the same chart, so the day stays comparable, and the seeds
you have not spent yet are unknowable. The seed check in `submit` then does real work.

Two related rules that fall out of the same reasoning:

- When attempts are exhausted, `claim_attempt` returns **no seed at all**. Handing one
  back leaks the chart to someone who can no longer play it, which is free rehearsal
  material for anyone willing to burn a throwaway identity.
- Never add a "peek at today's chart" endpoint, and never cache a seed response.

#### Identity: wallet sign-in (built 2026-09-11)

**Wallets are the door to the window mode only** (decided 2026-09-11). Daily and
free play are for fun, never ask for a wallet, and rank the anonymous `bb_pid`
cookie. Clearing that cookie buys three more daily attempts, and with nothing at
stake on those boards that is a cost worth the boards actually filling up. The
Connect button exists on the menu and end screen but stays hidden until a window
is open.

A **wallet**, proven by one `personal_sign` over a server-issued nonce and carried
in the `bb_sess` cookie, is what a window entry is keyed to: three attempts cost a
second funded wallet rather than a cleared cookie, and tickets bank to an address
that can claim.

```
POST /api/auth  { op:'me' }                          -> { address|null, ranked }
POST /api/auth  { op:'nonce', address }              -> { nonce, message }
POST /api/auth  { op:'verify', address, nonce, signature } -> { address }, sets bb_sess
POST /api/auth  { op:'logout' }                      -> clears bb_sess
```

The server writes the whole sign-in message so it can rebuild it byte for byte at
verify time; the client hex-encodes it and passes it to `personal_sign` untouched.
The message says what signing does (free, no transaction, no permissions), because
the wallet shows it to the player.

**Zero dependencies still holds.** The standalone wallet recovery library was removed
with the old sign-in API. Nothing in that path was reachable from the simulation.

**Sessions and nonces are stateless.** The cookie is `address.expiry.hmac` under
`SESSION_SECRET`, 30 days, HttpOnly. The nonce is `timestamp.hmac(address,
timestamp)`, valid ten minutes. No table is read on any request, there is no logout
list, and rotating the secret signs everyone out. A nonce replayed inside its window
only signs the same wallet in again, which is not an attack.

**`SESSION_SECRET` must be set in production.** Without it every serverless
instance would mint its own secret and a session issued by one would fail on the
next cold start, so `lib/player.js` refuses to issue sessions at all and `/api/auth`
answers 503 for `nonce` and `verify`. Local dev is one process and uses a
per-process secret, so a restart signs you out there. Set the variable **before**
pushing a build that depends on it.

Signing in or out resets the client's idea of today's attempt count, since attempts
are counted per identity: an anonymous attempt already spent does not follow the
wallet, and a wallet's attempts do not leak back to the cookie.

Known limits, on purpose for now:

- No `$BUY` holding gate. The season one spec puts it in the entry contract. Until
  then anyone with a wallet can enter a window, and a Sybil costs a funded wallet.
- Injected providers only (`window.ethereum`: MetaMask, Rabby, in-wallet mobile
  browsers). WalletConnect needs a dependency, so a plain mobile Safari has no
  sign-in path. The button says "No wallet found" and free play still works.
- Switching accounts inside the wallet does not switch the session. Sign out and
  sign in again. Listening for `accountsChanged` is a small follow-up.

#### The window mode (built 2026-09-11)

The third mode, and the only one that touches a wallet. A **window** is a bounded
event: wallet-gated entry, N attempts per wallet (default 3), and the 10 tickets per
run **bank per wallet across those attempts**. That total is the draw weight in the
season one spec. Daily and free play are untouched by any of it.

**The server decides open or closed, and toggling is a row, not a deploy.**

```sql
insert into buybounce.window (name, opens, closes)
values ('Window 1', now(), now() + interval '3 days');
-- close early:
update buybounce.window set closes = now() where name = 'Window 1';
```

While no window is open the menu shows no trace of the mode: no gold button, no
wallet button. `GET /api/window/state` returns the open window, or the most recently
closed one so its board and reveal stay reachable, or null.

```
GET  /api/window/state          -> { window, mine, now }
                                   mine only for a signed-in wallet
POST /api/window/start          -> { seed, attemptId, attemptsLeft, window }
                                   401 without a wallet session; spends an attempt
POST /api/run/submit            -> mode:'window' plus attemptId; returns
                                   { tickets, window:{ tickets, attemptsLeft, ... } }
GET  /api/board                 -> gains window:{ id, name, open, closes, rows }
                                   rows are one per wallet, ranked by tickets
```

**Seeds are per wallet and unknowable before the attempt is spent.** Each window
has a secret generated in Postgres at insert and never returned while the window is
open. `claim_window_attempt` derives `seed = first four bytes of sha256(secret | wallet
| idx)`, big-endian. After close, `/api/window/state` includes the secret, so anyone
can recompute every seed in the window and replay every run against the published
track. That is spec section 4.2 without the drand round, which is only needed for the
draw and comes with the contracts. `store.windowSeed()` is the Node mirror of the SQL
derivation.

A window run is verified exactly like a daily run: attempt must be this wallet's,
seed must match, the replay must reproduce the claim, one submission per attempt.
Two extra checks: the attempt's window must be the current one, and submission must
land within ten minutes of `closes`, since a run started before close can end after.

The client treats the window as the front door when it is open: a gold CTA above the
daily, with its own line for attempts left, tickets banked and time to close. With no
wallet the CTA reads "Connect wallet to enter" and runs the sign-in first, then the
same tap enters. The board gets a Window tab ranked by tickets, and a window run's
end screen shows the banked total rather than a rank.

The standalone wallet, board, and database (`api/`, `lib/`, `supabase/`, and the
`tools/window.js` / `tools/auth.js` checks) are no longer in this cartridge. Token
Arcade issues scored seeds, replays the run, and stores the boards. `tools/serve.js`
only serves the static page.

#### Tuned runs never rank

`SIM_KEYS` lists the tuning values that change the simulation: gravity, bounce, chart
speed, button width, ramp. `noise` is read only inside `draw()`, and sound, palette and
brand assets never touch `update()`, so those stay free to change without affecting a
run's standing.

When any of those five differ from `T_DEFAULT`, the daily is disabled with a note and
the run is not submitted. Free play stays open at any tuning, which is the point of the
panel: testers are meant to explore feel and send the link back.

**That gate is a courtesy, not the defence.** The server re-simulates every run at
default tuning, so a modified run fails verification whatever the client claims. A run
with button width maxed to 200 claimed 573.7M and recomputed to 1.2M, and was rejected.
The client-side gate exists so a tester who moved a slider is told plainly, before
spending a daily attempt, rather than being handed a "replay mismatch" that reads as an
accusation of cheating.

`submit` also turns away a self-declared tuned run before running the expensive replay.

#### Deploying

Mood Swings ships inside Token Arcade. The cartridge server serves `arcade.html`. The
API verifier replays `tools/verify.js` against the issued seed. This folder no
longer has its own database or wallet API.

### 3. Leaderboard

Daily, weekly, all time. Score reads as a token ranking, which is thematically free.
Wallet connect optional to play, required to rank, matching the existing
hold-at-least-1-$BUY gate on Treasury Signal. Wallet sign-in is built (see Identity
above); the holding gate is not.

Note: exponential-ish scoring separates the top of the board hard. If it needs a
flatter competitive distribution, rank by time alive and keep market cap as the
screenshot number.

### 4. Onchain settlement

Store runs off chain. Post a weekly merkle root of the final board to Robinhood
Chain and let winners claim against it. One tx per week instead of one per run.

For prizes, the highest-leverage version is a Treasury Signal ballot line routing a
share of weekly fees to the pot, which makes the game part of the existing
governance rhythm.

**Ship season one with cosmetics only.** Button skins, rank badge, Telegram role.
Zero legal surface, and it tells you whether the loop retains before money is
attached. Free to enter with prizes is a very different regulatory posture from pay
to enter. Keep it free and have someone look at it properly before real value is
involved.

## Tickets and the late ramp (built 2026-09-07)

Two objectives per run, competing for the same input. **Market cap** is the score
board and pays nothing. **Tickets** are draw weight for the onchain season.

**Exactly 10 tickets per run**, released as `S.t` passes each mark in `TICKET_AT`
(`[4,10,17,25,34,44,55,67,80,94]`, a mark every 10s). They do not come out of the
random pickup weighting, so the ceiling is fixed by run design rather than by how
long someone will sit there. `S.ticketsOut` counts released, `S.tickets` counts
collected, and `tickets` rides in the claim so the verifier recomputes it from
the track.

### A mark is permission to release, not an obligation

A WHALE BUY sets `h.vy = max(h.vy,0)+T.bounce*1.78` and throws the ball ~700px
above its normal band. A ticket dealt during that flight scrolls past underneath
while the player can do nothing about it. That is not a missed ticket, it is an
impossible one, and on a paid draw the difference matters.

Release therefore waits for `h.y-S.base<300` and at least 3s since the last one.
The mark stays due until it is dealt, so nothing is ever skipped. Missing a
ticket you were in position for still costs you, which is the part worth keeping.

Measured over 50 releases: median deferral 0.02s, p90 0.78s, max 1.16s, and only
2 of 50 held longer than a second. The gate almost never fires, which is what a
fix for an edge case should look like.

This was the alternative to looping tickets until collected. Looping would have
made the count a survival measure again rather than a precision one, undoing the
spread. If the whale case still bites in play, looping is a small change on top.

All ten are out by **94s**, which splits a run into two phases on purpose. Up to
94s both objectives are live and compete for the same input. After it the tickets
are settled and the only thing left is score, under a button that is still
closing. Draw weight stays reachable for a mid-length run while the leaderboard
keeps rewarding endurance. The schedule has been compressed twice: the tenth mark
was at 168s, then 124s, and both were past where a real run ends.

The end screen shows `TICKETS n/10` on its own line under the score, gold, going
solid at 1 and green at 10, with a note when the run ended before all ten were
released. Tickets are the draw currency, so they do not belong in the stat grid
next to buys and best streak.

### Vertical layout, and the bug that hid in it

Screen-space measurement is the tool here. `sy(y) = cam.y - y`, the button sits at
`PAD_Y()` which is screen y 605 at H=720, and the ball's own band is screen 426 to
527. Everything has to live inside or just above that.

The first ticket placement was `S.base+28..82`, which measured at **screen 590 to
690, at or below the button line and sometimes past the bottom edge**. The ball
bounces off the button and never goes below it, so those tickets were not hard,
they were unreachable. Playtest caught it before the sampler did, because the bot
scored them as "missed" rather than "impossible".

Current layout, all measured rather than assumed:

| | screen p25 | p50 | p75 |
| --- | --- | --- | --- |
| ball | 426 | 480 | 527 |
| money pickups (`S.base+150..380`) | 380 | 446 | 505 |
| tickets (`S.base+95..150`) | 497 | 507 | 545 |

Tickets own the low third of the ball's arc, money pickups take the top of it and
a stretch above. That is the trade: climb comes from the high pickups, so dipping
for a ticket costs the altitude the score is made of.

Ticket catch box is **58x36** against 26x26 for everything else, and tickets draw
at 98x34 against 30 to 52 wide for the rest (`p.k.h` overrides the default 19px
pickup height). The art and the box move together on purpose: a target that grabs
from further than it looks reads as the game being loose with its own rules.

The box has been both too big and too small. The button has to stay under the ball, so you steer by
bounce angle over several bounces and cannot chase a point 500px ahead: a seeker
bot that moved the button toward a ticket died in 9 seconds every time. But once
tickets moved onto the ball's real path, 92x44 made them free and one bot took
10/10 without trying. 46x30 asks for precision without asking for the impossible.

On-screen pickup density was capped at 2, which is where the empty field came
from. Now 4.

### The late ramp

`diff` used to saturate at `t/110` and `S.pad.w` floored at 52, so **the game
stopped getting harder forever**. Measured before the fix: 24 of 30 headless runs
survived 320s. A steady hand ran until bored rather than until it died, which
made any survival-based ticket source farmable.

Phase one now saturates at **80s**, not 110s, taking 108px down to 71.3px. It was
110s, but measured runs end around 112s, so the late ramp was vestigial and
nobody ever felt the squeeze. Phase two takes `T.late` (0.65) px/s off with no
plateau down to `T.padMin` (24), so width hits the floor around 153s.

Width is the right knob because the player can see it: the button visibly closes,
so the squeeze telegraphs itself instead of reading as the game turning on them.

**A near-perfect tracker still survives any width**, because the button only has
to be under the ball and a bot with no reaction delay always is. At the 24px
floor the elite bot ran to the frame cap. Real play dies well before that. If
runs ever need a hard ceiling, the lever is horizontal speed in the late phase,
which compresses reaction time and cannot be tracked around. That changes physics
mid-run, so it needs telegraphing and has not been done.

`late` and `padMin` are in `SIM_KEYS`, so touching them marks a run tuned and
keeps it off the board.

### Measured, with the caveat that matters

`node tools/sample.js [runs] [frames]` drives headless runs at a spread of
simulated skill. Correlated hand tremor, not a sinusoid: a sinusoid either stays
inside the button or does not, so it produces a cliff instead of a gradient.

Current spread, 25 runs across five skill levels:

```
tickets  0:###  1:##  4:###  5:##  6:##  7:###  8:###  9:#######
         p10=0  p50=7  p90=9  max=9
         window total for 3 attempts: p50=21, p90=27 of 30
```

Nobody hit 10, which is the intent. Loose play medians 0, weak 6, average 7,
strong and elite 9. Differentiation now sits at the low end of the skill range
and saturates at the top, which suits a lottery: weight is bounded, so no whale
can own a window.

**The bot cannot measure the score-versus-tickets trade-off.** Aggressive play and
sloppy play are the same thing to it, so the high-bounce bot both climbs more and
misses more, and the comparison is confounded. Whether the tension actually bites
needs human playtesting. Do not read the sampler as player data, and trust a
playtest over it every time: the unreachable-ticket bug above was invisible to
the sampler and obvious in thirty seconds of play.

## Ideas discussed, not yet built

- **Bid wall**: horizontal row of retail bids, skim across for escalating boost,
  rewards flat arcs
- **Bid ladder**: vertical stack, rewards steep center bounces
- **Paired greed**: a 2X placed directly beside a DUMP, a real decision
- **Pyth price feed ghost line**: real $HOOD price action as a faint background
  layer, purely cosmetic, no fairness impact, tight thematic fit
- **Market phases**: the chart moves in cycles, so every so often the run enters a
  stretch where gravity or bounce goes wonky. Fits the theme exactly, since real
  charts have regimes. Two cautions. It must be *telegraphed*, because the variance
  rules above work by staying readable, and an unannounced physics change reads as the
  game cheating. And it has to ride on `S.t` or a value derived from the seed, never
  on wall clock or `Math.random`, or replay verification breaks.
- **Paddle size power-up**: a pickup that widens the button for a few seconds. Reads
  as instant relief, and it is the natural counterweight to the difficulty ramp that
  narrows `S.pad.w`. Anything reading button width must read `S.pad.w`, never
  `T.padW`, and the widened value has to be restored through the same ramp so the two
  systems cannot fight. Worth checking it does not flatten the late game, which is
  currently where the challenge lives.

## Gotchas

- No localStorage. Artifacts do not support it and the tuning panel is intentionally
  session only.
- Data URIs on lines longer than ~10k characters can break some renderers. If
  re-embedding assets for a single-file build, wrap base64 into short chunks joined
  with `.join('')`.
- Canvas is never read back with `getImageData`, so cross-origin images are safe to
  draw and taint.
- `S.pad.w` shrinks with difficulty. Anything reading button width must read
  `S.pad.w`, never `T.padW`.
