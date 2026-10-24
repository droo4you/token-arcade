# Mood Swings

Keep Emonad's mood up.

Mood Swings is a portrait arcade cabinet in Token Arcade. A chart falls. Slide the button along the bottom and catch it. Every catch sends the chart back up, the support line climbs, and the score is the peak value reached. Miss once and the run ends.

The cabinet id is `emonad-cabinet`. The paired community is eMONAD. Token Arcade hosts the game, issues scored sessions, and keeps the leaderboards.

## How it runs in Token Arcade

The cartridge server serves `arcade.html` at `/emonad-cabinet/v/1.0.0/`. The arcade loads that page in an iframe and talks to it through the shared bridge (`packages/sdk/browser/bridge.js`).

- **Free Play** starts in the browser with a local seed. The arcade does not record it.
- **Passport Play** and **Community Raids** use a server-issued seed and a fixed 390×844 playfield. The run starts when the player takes hold of the button.
- `src/arcade-seed.js` turns the opaque session seed into the simulation's uint32 seed. The browser and the server load that same file.
- The proof is the seed, the playfield size, and the paddle position on each 120 Hz tick.
- `apps/api/src/gameVerification.ts` replays that proof with `tools/verify.js` and accepts the score when the replay matches.

`skin.json` is the hosted display theme (palette and labels). Scored runs use that theme and the reviewed default tuning.

## Files

```
arcade.html          hosted Token Arcade entry
index.html           standalone page
src/game.js          simulation and rendering
src/arcade-seed.js   session seed to uint32, shared with the server
src/style.css
skin.json            hosted theme
tools/verify.js      replay check used by the API
tools/harness.js     headless DOM for local checks
tools/serve.js       static local server
```

## Run locally

Arcade, from the repo root:

```bash
npm ci
npm run dev
```

Open the arcade and play Mood Swings. The API listens on 8787 and the cartridge server on 8788.

Standalone page, with no arcade host:

```bash
node tools/serve.js
# http://localhost:8000
```

Headless checks:

```bash
node tools/arcade-bridge.test.js
node tools/determinism.js
node tools/verify.js --self-test
```

## Credits

Head skins under `public/assets/heads/` are fan art of community mascots, offered as cosmetics. They imply no affiliation with or endorsement by the projects they reference.
