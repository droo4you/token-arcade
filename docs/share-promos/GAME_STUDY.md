# Share-promo game study

Studied 24 Oct 2026 from the current cartridge source, local play sessions, and the live hosts.

Live checks:

- `https://token-arcade.onrender.com/` returns **Token Arcade — The Internet Is Fun**.
- `https://token-arcade-cartridges.onrender.com/emonad-cabinet/v/1.0.0/arcade.html` title and `og:title` are **Uppers**. `skin.json` on that host matches this repo (`button: GO`, pickups LIFT / 2X / SURGE / DROP / GUARD / ORB).
- The same host's `index.html` was still titled **BUY BOUNCE**. That page is the old standalone entry, not the cabinet the arcade iframes. Its title, menu, and share tags are updated in this change. Internal skeleton id `buy-bounce` stays.
- Skip, Two Places, Skrumpey Slide, and Coindle cartridge titles match the names below.

Local sessions are in `/opt/cursor/artifacts/game-study/`. Uppers was booted the way the arcade boots it: `TokenArcade.embedded`, skin mounted, then `start()`. Skip used the game's own `?demo=` scenes. Two Places was played from the title with the keyboard. Skrumpey Slide was played from the character select into a bot run with the slingshot launch.

## Uppers (`emonad-cabinet`)

- **Name.** Public cabinet name is **Uppers**. Document title and arcade page heading are Uppers. Paired community is eMONAD. The old menu heading "eMONAD Cabinet" and the Buy Bounce page are not the playfield players get after the host calls `start()`.
- **Palette and type.** Playfield `#100b20`, grid `#281d42`, accent `#ae8cff`, accent shadow `#6747a8`, muted `#a59abd`. HUD is monospace. Button label is heavy sans, black on the accent pill. Not the lime `#CCFF00` Buy Bounce stack.
- **Objects.** A purple signal line with a square chart cursor (arcade forces head 0 and hides the mascot picker). A rounded **GO** button. Chips: **LIFT** `#6fe37a`, **2X** accent, **SURGE** `#00c805`, **DROP** `#ff3b30`, **GUARD** `#7fe6ff`, **ORB** `#ffc93c`. Mascot PNGs (Artificial Inu, Cashcat, Ponshouse, Tendies, Robbie) exist under `public/assets/heads/` and are disabled in the arcade build.
- **Loop.** Slide the GO button under the falling signal; every catch throws it higher; one miss ends the run.
- **Hook.** The chart is always falling and the button is the only floor.
- **Moments.** The grab prompt ("GRAB THE BUTTON TO START"). A catch that pops **BOUNCE** and an edge multiplier. A **SURGE** that hangs the line off the top of the screen. The miss: the line turns red and the card says **PAPER HANDS** / "You climbed to" with Signal, Peak, ORBS, and Buys.
- **UI players know.** Signal and Peak, ORBS n/10, STREAK, the GO button, the purple grid.
- **Never show.** Buy Bounce, the lime BUY cap/housing/lip, a candle-as-hero, "Market cap" / "ATH" (those are the standalone HUD words; arcade says Signal / Peak), BID / WHALE / DUMP / HOLD / TICKETS / DIAMOND HANDS. Those strings were the pre-skin copy. A green whale labeled BUY belongs to Skip to 10K, not Uppers.

### Storyboard, 5s

0.0 The purple grid is already moving. The signal is falling. "GRAB THE BUTTON TO START" fades as the GO button slides under it.
0.8 First catch. **BOUNCE**. Signal and Peak tick up. ORBS 0/10 sits in the corner.
2.0 **LIFT**, then **2X**, then **SURGE**. The square cursor climbs and the button compresses on each hit.
3.6 An **ORB** chip turns the pill gold.
4.2 Title slam **UPPERS**, line "Catch the signal. Keep climbing." The GO button is still in frame.

## Coindle

Local play note: the other five games were driven in headless Chrome (shots under `/opt/cursor/artifacts/game-study/`). Coindle's playable board is the Next app, and this environment does not have its arcade bundle (`arcade-dist`) or a running dev server, so Coindle below is from the current source (`Header`, `GameBoard`, `CategoryCell`, `RevealCard`, `RapidFire`) plus the live cartridge title. The promo uses that light-mode board, not a dark-mode guess.

- **Name.** Wordmark is **Coin** in `#2D8C56` plus **dle** in `#2C2C2C`. Subtitle: "Guess the mystery crypto — powered by Pyth". Default theme is light beige `#F5F0E8` (dark mode is a toggle, not the first paint).
- **Objects.** No original characters. Each guess is a real coin: round logo, ticker, name, live price, green Pyth dot. Six flip cells: **Type, Color, Year, Ticker, Price, FDV**. Result fills are green `#2D8C56`, yellow `#C89B2A`, red `#C45042`, hint purple `#8B5CF6`, white type on the fill. Numeric cells show ↑ or ↓.
- **Loop.** Name the mystery coin in six guesses. Each guess flips the six clues.
- **Hook.** A wrong coin still teaches you the answer.
- **Moments.** The staggered flip. A full green row. The win line **We Love Green Candles**, or the loss line **Dev Rugged**. Ranked play is a different screen: **Rapid Fire**, three minutes, solved / guesses / skip.
- **UI.** Daily and Free Play pills, Easy / Hard, "n guesses remaining", the search field "Search coin name or ticker...".
- **Never show.** A fake mascot, a chart-as-the-whole-game, or Buy Bounce. Easy mode's sparkline is a hint, not the sport.

### Storyboard, 5s

0.0 Beige board, Coin/dle wordmark, Pyth line, Daily pill lit. The first cell is already flipping.
0.6 SOL row lands: L1 green, Purple green, 2020 yellow with ↑, ticker green, price yellow with ↓.
2.2 ETH row flips all green. Guess counter goes to 2/6.
3.6 **We Love Green Candles** in the win green.
The cells use the real category names and the real light-mode result colors. Logos are the coin images the guess row loads.

## Skip to 10K

- **Name.** Pixel title **SKIP TO 10K** in `#ffe066` on `#22163a`. Subtitle "A DROOBER AND RC ROCK SKIPPING SAGA". By droober.
- **Palette.** Night purple `#22163a`, gold `#ffe066`, water blue, candle green `#7be08a` and red `#ff6b6b`, resistance `#ff5a6a`. Font is the game's 5×7 pixel font.
- **Characters.** **Droober** (clogged pixel guy) throws. **RC** (small cyan goo) rides along. The ball is an **Ether Rock** (`ROCK_ROWS`, rock 0 is grey `#9a96a6`). Also gems, crabs, frogs, and a green whale.
- **Loop.** Drag back and throw the rock across the lake. Time the skip. Altitude is ETH price and distance is years. Sink or freeze and the run ends. Break the `$10,000` line.
- **Hook.** Eleven years of crypto as one lake, and the rock is trying to skip over 10K.
- **Moments.** The green **SKIP ZONE** and the power drag. A **PERFECT** skip and an `nX STREAK`. The green whale: the game draws it as pixels and labels the spout **BUY** (sim text is `WHALE BUY`). That label is Skip's, and it is not the Uppers button. The results card: ROCK #n SANK or FROZE, DAYS, PEAK, a candle chart, ATH.
- **UI.** Date and DAY, the big ETH price, GAS, SKIP ZONE, HOW TO PLAY, the shop (GWEI, missions, Ether Rocks).
- **Never show.** A lime BUY button, Uppers, or a rock replaced by a candle.

### Storyboard, 5s

0.0 Droober is already releasing the grey rock off the dock. RC bobs beside him. Water is moving.
0.6 The rock skips. Splashes. **PERFECT** in gold.
2.0 HUD rolls JUL 2015 toward YOU ARE HERE. ETH price climbs. The dashed line is `$10,000 RESISTANCE` in red.
3.2 The in-game green whale spouts. Its own label is BUY. The line flips to `$10,000 SUPPORT` in green.
4.2 Title slam **SKIP TO 10K**.

## Skrumpey Slide

- **Name.** **Skrumpey Slide**. Tagline "Four worlds. One sunset. Lots of DN." Game over title **Nightfall**. Fonts are Pixelify Sans and Silkscreen. Ink `#1a1038`, sun `#ffd84a`, sky button `#8fd3ff`.
- **Characters.** The select grid is the real roster: Big Eyes (plain), Dork, Solveil Star, Aether Star, Spectra Star, Star Skrump, Ice Beam, Amber Beam, Red Beam, Tux, Leafy Tux, Pyjamas. Default is Big Eyes, id 10. Rescued buddies are the other Skrumpey models in a train.
- **Objects.** DN nuts (`site-nuts-plain.png`, rare `site-nuts.png`). A wooden slingshot with pink caps `#ff4f8f`. Biomes: Mellow Meadow, Sunbake Dunes, Crystal Night, Cloud Isles.
- **Loop.** Hold to dive the downhill, release to fly the uphill, grab DN, rescue Skrumpeys, and beat the sunset. Only nightfall ends the run.
- **Hook.** The sun is a timer you can buy back with perfect landings, and the train multiplies everything.
- **Moments.** The slingshot meter and **PERFECT LAUNCH**. A **PERFECT** landing plus the sun bar. The train growing behind you. **Nightfall** and the SKRUMPEY SQUAD card.
- **UI.** Score, combo, meters, jump pips, nut count, sun bar, DIVE / JUMP.
- **Never show.** A generic green blob in place of the Skrumpey renders, or Uppers.

### Storyboard, 5s

0.0 Mellow Meadow hills are already scrolling. The slingshot is pulled. **PERFECT LAUNCH**.
0.8 The selected Skrumpey is in the air over `#79d26a` hills. DN nuts arc past. The sun bar is draining.
2.2 **PERFECT** in Silkscreen gold. Four buddies hop in a train behind.
4.0 The sun bar is nearly gone. Title slam **SKRUMPEY SLIDE** in Pixelify, tagline "Four worlds. One sunset. Lots of DN."

## Two Places at Once

- **Name.** Title screen is three lines: **DROOBER** in `#b096e8`, **& RC** in `#1cd2f0`, **TWO PLACES AT ONCE** in cream. Menu on a yellow panel: PLAY, LEVELS, CONTROLS, SOUND. It is one screen, not a split view.
- **Palette.** Purple dusk sky, ink `#22163a`, lime ground stripe `#b6d846`, stone `#4b3a7a`, pink Droober highlight `#f39cc0`, cyan RC `#1cd2f0`, apples pink. World 2 is Shroomwood. Same pixel font and the same Droober/RC sheet as Skip.
- **Characters.** **Droober** walks, runs, jumps, lifts crates. **RC** is the goo that flies, slips through grates, and glides Droober when riding his head. Apples are the three collectibles.
- **Loop.** Swap who you control so Droober and RC can be in two places at once, and reach the exit with the apples.
- **Hook.** The gap that needs RC on Droober's head is the same moment a plate needs RC somewhere else.
- **Moments.** The title pair waving. The swap (pink active vs cyan active). RC glide across a gap. **LEVEL CLEAR!** with the apple count.
- **UI.** PLAY / CONTINUE, world names Purple Dusk and Shroomwood, apple `n/3`, LEVEL CLEAR, PAUSED.
- **Never show.** A vertical split-screen, a second invented hero, or Buy Bounce.

### Storyboard, 5s

0.0 Purple dusk, lime ground line, Droober already running. RC is on him. Stars drift.
1.4 Swap. RC peels off and flies. The corner label flips from DROOBER to RC. Apples tick.
3.4 **LEVEL CLEAR!** in gold.
4.2 Title slam **TWO PLACES AT ONCE**, "Droober and RC."

## Arcade sizzle

- **Name.** **Token Arcade**. Line: **The Internet Is Fun.** Ticket cream `#fff7ed`, ink `#1a0e20`, lime `#aecf3e`, pink `#ff74dd`, cyan `#00d1d8`. Wordmark is Space Grotesk. Mark is `T✦`.
- **Loop.** The sizzle is the shelf: one ticket, then each cabinet's real moment, then the wordmark.
- **Never show.** Buy Bounce, the lime BUY button, or a shot that is not one of the five games above.

### Storyboard, 5s

Cuts, in order, using each game's scene with its own title hidden: Skrumpey launch, Coindle flip, Uppers catch, Skip perfect, Two Places swap. Last card is the cream ticket: T✦, TOKEN ARCADE, The Internet Is Fun.

## What the promos had wrong

Uppers was a lime candle chart bouncing on the Buy Bounce button art. Skip's whale was drawn as a big invented fish whose only job was the word BUY. Two Places was a split screen the game does not have. Coindle was the dark theme with no win line. Those are replaced by the boards above.
