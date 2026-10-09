# Launch game integration queue

The game source remains in each game's own workspace until its owner is ready to hand it off. A manifest or draft listing does not mean the game is live. Publishing requires an installed cartridge adapter and a Free Play smoke test; Ranked Run and Community Raid also require a server verifier.

| Game | Expected metric | Source status in this workspace | Next integration work |
| --- | --- | --- | --- |
| Buy Bounce | score; height/distance | External | Import cartridge, map result, test Free Play/mobile, add competitive proof |
| Two Places | completion validity, stars, then time | External | Import cartridge, supply deterministic selected levels, map result and verifier |
| Coindle | solved, guesses, time, streak | External | Import daily/archive rules, map result and verifier |
| Skrumpey Slide | total score, distance, destruction | Standalone sibling prototype only | Import reviewed source, wrap lifecycle, add server-verifiable replay/input proof, connect Skrumpeys metadata |

The sibling `C:/Users/andre/Projects/Token-Arcade/Skrumpey-Slide` prototype exposes `createSkrumpeySlide(container, config)`, deterministic seeds, Free/Ranked/Raid modes, mobile controls, and a completion callback. It has no wallet, backend, or server-verifiable input proof. Its current result alone is insufficient for a trusted Ranked or Raid leaderboard. No source has been copied into this platform.

## Required handoff from each game

1. Repository URL/ref or local source path, plus permission to bring the code into this platform.
2. Build/run instructions and asset license or attribution notes.
3. Exact native result schema, game version, and objective rules.
4. Whether a seeded replay/input trace can be verified independently of the browser.
5. Mobile and lifecycle smoke test: mount, start, pause, resume, restart, destroy, then remount without residual listeners.

The host's game contract is in `packages/sdk/src/index.ts`. The warmup cartridge is a local integration fixture only and must not be presented as one of these launch games.
