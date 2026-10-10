# BUY BOUNCE

The chart falls. Slide the BUY button under it. Every bounce prints a higher low.

Arcade game for the $BUY community on Robinhood Chain. Vanilla canvas, zero
dependencies, no build step.

## Run locally

```bash
node tools/serve.js
# open http://localhost:8000
```

Pass a port to use a different one: `node tools/serve.js 8123`.

Any static server works and there is nothing to compile. `python3 -m http.server 8000`
is equivalent where a real Python is installed, which is not the case on the Windows
dev box (the `python` there is the Microsoft Store stub and exits without serving).

Open the file directly with `file://` at your own risk. Some browsers block the module
and asset loads.

## Structure

```
index.html                    markup, HUD, menus
src/game.js                   the whole game, one IIFE
src/style.css                 all styling, CSS variables for theming
public/assets/*.png           button layers: housing, cap, lip
public/sounds/*.wav           optional, synth fallback if absent
CLAUDE.md                     architecture and design decisions, read this first
```

## Adding the real sounds

Drop these into `public/sounds/` and they take over automatically:

- `button-tap.wav` — every catch, keep it under 80ms
- `button-woo.wav` — whale buy
- `button-milestone.wav` — market cap milestones

MP3 or OGG preferred over WAV for payload size. Update the paths in the `ASSETS`
object at the top of `src/game.js` if you change the format.

## Tuning

Gear icon, bottom left. Sliders for gravity, bounce, chart speed, button width,
difficulty ramp, and chart noise, plus palette presets. Nothing persists.

To change how big the scores get, edit one line in `src/game.js`:

```js
S.cap = 812400 * Math.pow(1 + S.climb/73, 5);
//                                    ^^    ^  scale, steepness
```

## Git

```bash
git init
git add -A
git commit -m "BUY BOUNCE: playable v1"
git branch -M main
git remote add origin git@github.com:USER/buy-bounce.git
git push -u origin main
```

## Deploy

Static site, no config needed.

**Vercel** (matches the main site's hosting):

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # live
```

Or connect the GitHub repo at vercel.com and it deploys on every push.

**GitHub Pages**: Settings, Pages, deploy from `main` at root.

**Cloudflare Pages**: connect the repo, leave build command empty, output directory
`/`.

## License and attribution

$BUY is a meme token and is not affiliated with Robinhood, Lighter, GameStop,
Reddit, or any named company.

Head skins under `public/assets/heads/` are fan art of community mascots, offered
as cosmetics. They imply no affiliation with or endorsement by the projects they
reference.

Button artwork derives from the official transparent capsule PNG in the
[Buy Button brand kit](https://www.hoodbuybutton.com/brand/). Confirm usage before
public launch.
