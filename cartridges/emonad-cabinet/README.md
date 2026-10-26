# Mood Swings

Keep Emonad's mood up.

Slide the paddle beneath Emonad, catch the bounce, and collect Good Vibes. Mood changes the weather from drizzle to an aurora above the clouds. Version **2.0.0** uses the `mood-swings` adapter and a fresh leaderboard.

The cabinet id is `emonad-cabinet`. The paired community is eMONAD. Token Arcade hosts the game, issues scored sessions, and keeps the leaderboards.

## How it runs in Token Arcade

The cartridge server serves `releases/2.0.0/arcade.html` at `/emonad-cabinet/v/2.0.0/`. The arcade loads that page in an iframe through the shared bridge (`packages/sdk/browser/bridge.js`).

- **Free Play:** unlimited local seeds; browser-saved best Mood, Good Vibes and cosmetics. Account saving and browser-to-Passport merge remain the shared progress follow-up.
- **Passport Play:** a server-issued seed and fixed 390×844 simulation. Peak Mood wins, then most Good Vibes, then acceptance time and run ID.
- **Community Raid:** three issued attempts, including abandoned runs, with one shared seed. Best run counts. Total verified Good Vibes from all attempts is a separate display-only goal.
- **MiniCoin:** coming soon. No paid-entry or ticket mechanics in version 2.
- `releases/2.0.0/sim.js` is the pure simulation loaded by both browser and API. Cosmetics and rendering never consume its random stream.
- `apps/api/src/moodVerification.ts` replays the entire paddle track at 120 Hz, verifies peak Mood and Good Vibes, and rejects forged metrics, invalid inputs, partial/extended runs and implausible timing.
- Each paddle sample takes nine bits. Even five minutes of input fit inside the API request limit.

The run waits for the first drag or arrow-key input. Pausing freezes gameplay; server session and raid deadlines still apply. Runs end at five minutes at the latest. All modes use the same physics and Euphoria rules.

## Files

```
releases/2.0.0/arcade.html    hosted or standalone entry
releases/2.0.0/sim.js         shared fixed-step simulation and track codec
releases/2.0.0/game.js        renderer, input and arcade bridge
releases/2.0.0/progress.js    cosmetic catalogue and browser progression
releases/2.0.0/style.css     responsive presentation
```

## Run locally

Arcade, from the repo root:

```bash
npm ci
npm run dev
```

Open the arcade and play Mood Swings. The API listens on 8787 and the cartridge server on 8788.

Standalone Free Play, with the cartridge server running:

```bash
http://127.0.0.1:8788/emonad-cabinet/v/2.0.0/
```

Headless checks:

```bash
npm test
npm run build
```

## Credits

Version 2 avatars are original stylized canvas drawings of Emonad, Skrumpey and Molandak, not official art or endorsements. No real person's face is included. Archived version 1 art and executable files remain intact for compatibility.

## Initial version 2 tuning

These values fill in tuning left unspecified in the handoff and need human playtesting before release.

| Feature | Rule |
| --- | --- |
| Mood | Rounded `100 + climb × 100 + altitude above paddle × 0.2`, minimum zero; score is the peak |
| Tiers | Numb 0; Meh 1,000; Okay 3,000; Hyped 7,000; Euphoric 12,000 |
| Good Vibes | A reachable collectible released about every three seconds, without a per-run currency cap |
| Euphoria | Five Good Vibes fill the meter. Six seconds of 20% stronger paddle bounces and +2 climb per second. Excess meter carries forward; another activation refreshes the duration |
| Hype | Double Good Vibes for eight seconds; no gravity or score multiplier |
| Pep Talk / Main Character Moment | Original small lift / big surge |
| Hoodie Up | Protects one missed catch |
| Sad Song | Downward pull, loss of four climb, synthesized thunder and rain burst |

Emonad and Weather Report start unlocked. Skrumpey costs 15 Good Vibes, Molandak 30, Afterglow 10, and Moonrise 20. Purchases never affect the simulation. The original paddle width, narrowing curve, gravity, horizontal speed ramp, edge-bounce behavior and camera-follow arithmetic are retained. Version 2 has its own pickup stream and score model.

## Upgrade behavior

Version 1 entry points and its verifier remain intact. Version 2 never replaces executable files under the version 1 URL. On startup, only untouched platform imports upgrade automatically. The migration preserves the configured cartridge origin, paused/published state, identity and historical results. It defers while an unexpired, unconsumed run or nonfinal raid is present. Restart the API after those finish to retry. Operator-reviewed cabinets need their normal review/version-update workflow.

New boards filter version 2 results. New Passport best scores use `emonad-cabinet@2.0.0:score`; old best scores remain historical. Shared account-saved casual progression is a separate follow-up.
