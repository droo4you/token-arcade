# Source gap report: Buy Bounce -> eMONAD Cabinet

> **ALIGNMENT NOTICE (v0.3):** This is a first-pass Implementation/Research Note, not a Source of Truth. Re-audit the actual supplied repository before coding. Any older replay-only, L2/L3, community-role, or public-branding language below is subordinate to the v0.3 Cartridge Spec/Checklist and the current Product/Economy Sources of Truth.


*v0.3 alignment. This report audits the Buy Bounce **source repo/Skeleton**. The public Token Arcade deployment is a separately branded eMONAD Cabinet; "Buy Bounce" does not need to be player-facing. Revalidate all technical findings against the supplied repo before coding.*

| | |
|---|---|
| URL | https://buy-bounce.vercel.app |
| Observed | 8 Oct 2026 ~5:30 PM PT. Public build `index.html` + `src/game.js` (1,875 lines, record format v2). Public `CLAUDE.md`, `tools/verify.js`, `tools/harness.js`, `lib/eth.js` are served from the same deployment. GET `/api/board` and `/api/window/state` (both 200). Read-only: no POSTs, no wallet. |
| Role in current sources | Source/Skeleton for a **new eMONAD-branded Cabinet**. Community Asset reference supplied by founder: `0x81a224f8a62f52bde942dbf23a56df77a10b7777` (verify before economic use). Required: Cartridge + Free Play + Ranked-ready + reskin/theme proof. Public Cabinet gets its own `gameId` and leaderboard. |
| Skeleton | `timing_intercept` (drag-position intercept, one miss ends the run, speed ramp) × `ratchet_climber` camera. *Inferred from mechanics. The Handoff labels the genre "endless jumper".* |
| Current level | **L0 not met** (own leaderboard, wallet sign-in, and chain copy are visible; no bridge). Competitive internals are already **near L2**. Reskin: **R not met** (all art, audio, and copy hardcoded; good seams exist). |
| **Metropolis target** | **L1 + R required.** L2 Raid-ready is a stretch if the existing replay verifier makes it cheap; replay is not required merely to prove Cartridge integration. |
| Conflicts | ~~C-4~~ resolved by D-1. None open. |

## Evidence

**Confirmed (code / HTTP):**
- Seeded all-integer PRNG `mulberry32` with separate sim and visual streams (`src/game.js:35–60`). `Math.random` is used only for the seed roll (`newSeed`, :83) and audio noise buffers (:258, :404).
- Engine-independent math: `dsin()` replaces `Math.sin` in the sim, and `Math.pow(b,5)` became multiplication (:61–82; `CLAUDE.md` "Engine-independent math"). `Math.cos/sin` remain in `burst()`, documented as visual-only, but `burst()` draws from the **sim** rng stream (`CLAUDE.md`).
- Fixed timestep `STEP=1/120`, `MAX_FRAME=0.25`, `MAX_STEPS=16`. The loop breaks when the run ends so the end tick is cadence-independent (:1140–1176).
- Replay record `{v:2, seed, w, h, step, steps, tuned, track, claim:{ath,cap,climb,buys,best,t,tickets}}` (:1296–1305). Paddle x is integer per tick (`S.track.push(S.pad.x)`, :752). The server re-simulates via `tools/verify.js` ("A run that does not re-simulate to its claimed score is rejected").
- **Sim playfield = window size**: `W=innerWidth; H=innerHeight` (:10). `w,h` are part of the record ("a replay at a different window size is a different run", :1291).
- Server seam `API='/api'` (:1215): `POST /daily/start` (spends an attempt, returns seed + attemptId), `POST /window/start`, `POST /run/submit`, `GET /board`, `POST /auth` (:1233–1396). `GET /api/board` returned live all-time rows keyed `anon-<uuid>` (200).
- Modes: DAILY (3 attempts/UTC day, per-attempt-index seeds), FREE (local seed), WINDOW (wallet-gated, tickets bank per wallet, "draw weight in the season one spec") (`CLAUDE.md` "The window mode"; :1216). **WINDOW is removed by decision D-1 (8 Oct).**
- Wallet: `window.ethereum` → `eth_requestAccounts` → `personal_sign` nonce → `bb_sess` cookie (:1384–1440).
- Menu copy "Robinhood Chain · 4663" (`index.html`). `CLAUDE.md`: "Arcade game for the $BUY / hoodbuybutton.com community". Roadmap: weekly Merkle root on Robinhood Chain, Desk contract. **Per D-1 this was theme only and was never deployed on Robinhood Chain. The theme, chain copy, and Desk/draw roadmap are scrapped.**
- Tuning panel changes sim keys (`g, bounce, vx, padW, ramp, late, padMin`). Tuned runs are client-gated and server-rejected (:31–32; `CLAUDE.md` "Tuned runs never rank").
- Start gate `S.ready` freezes the sim until first touch (`CLAUDE.md`).
- `visibilitychange` only stops music (:538–546). There is **no pause control**. A hidden tab freezes RAF, and on return one clamped 0.25 s frame is simulated.
- Inputs: pointer drag anywhere (:1187–1190) and ←/→ keys in 34 px steps (:1191–1195). Touch works through pointer events.
- No `X-Frame-Options` or CSP `frame-ancestors` headers.

- **Hardcoded skinnable surfaces** (reskin inventory):
  - `HEADS` roster at :115–121: Cursor, Artificial Inu, Cashcat, Ponshouse, Tendies, Robbie. 160 px sources drawn at 30 px. `update()` never reads them, so they're cosmetic today.
  - Button art `ART` housing/cap/lip at :97–101. `USE_BRAND` toggle at :93, with a procedural fallback (`bail()`, :177).
  - `ASSETS` SFX at :88–92 (tap, woo, milestone).
  - Procedural music `TRACKS` Breakout / Melt-Up / Accumulate at :343+.
  - Pickup defs with labels and chip widths: `rbid` BID w30, `lev` 2X w34, `bid` WHALE w52, `dump` DUMP w44, `hold` HOLD w44, `tick` TICKET w98 h34.
  - Palette accent `#CCFF00`, base `#070707`.
- **Tickets are in the sim**:
  - `TICKET_AT=[4,10,17,…,94]` (:654) releases 10 `tick` pickups per run.
  - Catching one boosts `h.vy` (:870).
  - `tickets` is in the replay `claim` (:1303).
  - So removing them changes trajectories and would need a `simVersion` bump.

**Inferred (not observed):**
- The verifier runs the client file via `fs.readFileSync` + harness (`CLAUDE.md` "Backend layout"), so a Token Arcade verifier can call it as-is in Node. Not executed here.
- Leaderboard data lives in Supabase in a `buybounce` schema hosted inside the Coindle project (`CLAUDE.md` "Deploying"). That is shared infra risk with Coindle.
- Cross-engine replay has not been tested by me. The `burst()` holdout looks safe because the fingerprint uses `S.parts.length`, not particle values (`CLAUDE.md`).

## Mode mapping

**Cabinet identity note:** host/Registry must scope scores to the new eMONAD Cabinet `gameId`. Do not carry the standalone Buy Bounce board into the public Cabinet.


| Token Arcade | Buy Bounce today | Change |
|---|---|---|
| Free Play | FREE (local seed, unlimited). Tuning panel allowed. | Keep. Hide the all-time board in arcade mode. Ignore any external seed (no raid-seed practice). |
| Ranked Run | DAILY (server seed per attempt, 3/day, server replay) | Seed and attempts come from **Token Arcade's** verification service via `ta:mount`. Identity = Privy via host, not the `bb_pid` cookie. |
| Community Raid (stretch L2) | — | New: N attempts, each with its own seed per (raid, player, attempt), revealed at attempt start. The raid score is the aggregate of attempts (default best N−1 sum, spec §10.8). |
| ~~WINDOW (ticket prize draw)~~ | wallet-gated, tickets → draw | **REMOVED (D-1, 8 Oct).** It is not ported in any mode, and the standalone site's window flow is out of scope. |

`tick` pickups stay as a **plain collectible**. They're needed because they're in the sim (see Evidence). In the arcade they're shown as a secondary stat (`tickets` → display key `collectibles`) with no prize, draw, or banking meaning. A skin may rename them (`strings.pickup.tick`, e.g. "TEAR"). Fully removing them would mean `bb-sim-3` and is not recommended for Metropolis.

Objectives (PROPOSED): `TOTAL_SCORE` → primary `ath_usd` (integer dollars), secondaries `buys`, `bestStreak`. `SURVIVAL_TIME` → primary `ticks_alive` @120 Hz. `CLAUDE.md` notes the exponential score "separates the top of the board hard" and suggests time alive for a flatter board. Tie-break: secondaries → fewer ticks → earliest `verifiedAt`. Note: the metric is named `ath_usd` for continuity, and a skin can relabel it in display (`strings.hud.primary`).

## Gap table

| Action | Item | Why | Effort | Level |
|---|---|---|---|---|
| Add | SDK adapter: `hello/mount/ready`, map `start(seed)`/`newGame` to `mount+start`, emit `RunResult` from `runRecord()` | Spec §4–§7 | S | L0 |
| Add | Pause: on blur/hidden + `ta:pause`, plus resume on touch | Spec §5 | S | L0 |
| Remove (arcade mode) | Leaderboard UI + `/api/board`, `/api/run/submit`, `/api/daily/start` calls | Spec §11; [H §8, §12] | S | L0 |
| Remove | Wallet sign-in (`window.ethereum`, `personal_sign`, `/api/auth`) | [H §6] | S | L0 |
| **Remove (D-1)** | WINDOW mode, ticket banking, draw copy, `/api/window/*` | Scrapped. Also a chance element [E §18 Q3] | S | L0 |
| **Remove (D-1)** | "Robinhood Chain · 4663" eyebrow, $BUY/hoodbuybutton copy, Desk/Merkle roadmap text | Scrapped theme; [H §25] | S | L0 |
| Keep | Free Play tuning panel (Free Play only) | Free Play only | — | L0 |
| Alter | Ranked seed: take `MountConfig.seed`. Skip `startDaily()` in arcade mode. `again` → `ta:request_run` | Spec §9 | S | L1 |
| Add | `RunResult.replay` = existing record (`v, seed, step, steps, track`) wrapped as `ReplayLog`. Integer metrics | Spec §7 | S | L1 |
| Add | Port `tools/verify.js` into the Token Arcade verification service (pinned `simVersion: bb-sim-2`, `simHash`) | [H §12]; [E §10] | M | L1 |
| **Add** | **Skin loader**: read `MountConfig.skin`, fetch `skin.json` + assets from `skinAssetOrigins`, verify sha256, per-slot fallback to the current look (= `defaultSkin`) | `RESKIN_SPEC.md` §7; checklist R-01..R-04, R-08 | M | R |
| **Alter** | Lift hardcoded surfaces into slots: `HEADS` → `roster`, `ART` → `button` (layers housing/cap/lip), pickup labels/art → `pickups`, accent/base → `palette`, `TRACKS` → `musicPack` (synth preset or files), `ASSETS` → `sfxPack`, title/labels/win/fail → `strings` | RS §3–§4 | M | R |
| **Alter** | Pickup chip **hitboxes stay code constants** (w30/34/52/44/44/98, h34). Skin art is drawn inside them. Button width stays `padW` | RS §2 invariant; R-06/R-07 | S | R |
| Add | R-05 CI: replay the same record under the default skin and the example skin → identical hash | Checklist R-05 | S | R |
| Alter | **Logical playfield**: fixed sim width/height (e.g. 390×844 logical), scaled to the viewport for render only. Bump record to v3 | Spec §10.3.5. Fairness across devices | M | L2 |
| Alter | Move `burst()` rng draws to the visual stream, or prove they're inert | Spec §10.3.2 | S | L2 |
| Add | Cross-engine CI (record in WebKit, verify in Node) | L2-07 | S | L2 |
| Alter | Raid seeds come only from the host, per (raid, player, attempt). Drop the daily per-index-shared scheme for raids | Spec §10.4.2 (D-2) | S | L2 |
| Keep | Seed-never-before-spend rule, advisory-lock attempt counting | Matches spec §10.4. Reuse [H §0] | — | L1/L2 |

## Top 5 changes

1. **Arcade-mode switch**: hide the board and wallet. Remove WINDOW/tickets-draw and all Robinhood/$BUY copy. Stop all `/api/*` calls when framed.
2. **SDK adapter**: mount/start/pause/destroy, pause-on-blur, `RunResult` built from `runRecord()`, host-issued seed and attempts.
3. **Skin loader + slots** (the reskin proof of concept): roster, button, pickups, palette, music, SFX, strings, communityDisplay. The current look becomes `buy-bounce.default`.
4. **Reuse `tools/verify.js`** as the replay verifier, plus an R-05 skin-invariance test in CI.
5. **Fixed logical playfield** (record v3), so raids are fair across phone and desktop. This is the main L2 blocker.

## Reskin plan (port + reskin proof of concept)

The goal is a **new eMONAD-branded Cabinet** built from the Buy Bounce Skeleton. The source repo name is internal provenance, not required public branding. The Cabinet gets its own `gameId` and leaderboard. The eMONAD Cabinet is intended to be compatible with its own MiniCoin later, but this Cartridge pass does not implement protocol economics.

| Slot (`skinSlots`) | Kind | Today (source) | Skinnable | Locked |
|---|---|---|---|---|
| `roster` | roster | `HEADS` six heads (:115–121) | Names, idle art (64–512 px, ≤8 frames), up to 8 characters (e.g. Skrumpeys, wassies, nads, with rights) | Head draw size in the sim (30 px), stats. All characters are identical (`rosterAffectsSim: "never"`) |
| `button` | sprite (layers housing/cap/lip, nine-slice) | `ART` (:97–101) | Art and cap label (`strings.button_label` ≤ 6 chars) | `padW`, `padMin`, ramp, hitbox |
| `pickups` | spriteSet keys `rbid lev bid dump hold tick` | Chip defs (labels BID/2X/WHALE/DUMP/HOLD/TICKET) | Chip art and labels | Chip widths/heights, effects, weights, `TICKET_AT` schedule |
| `palette` | palette `accent`, `base`, `good`, `bad` | `#CCFF00` / `#070707` | Colors (contrast ≥ 4.5:1 checked in review) | — |
| `musicPack` | musicPack (`allowSynthPreset`) | Procedural `TRACKS` (:343+) | Track files or synth preset (tempo, scale, voice) | Music never syncs to the sim |
| `sfxPack` | sfxPack keys `tap woo milestone` | `ASSETS` (:88–92) | Sounds ≤ 100 kB | — |
| `strings` | strings | Title, tagline, labels, end lines | `title` ≤ 24, `subtitle`, `tagline`, `button_label` ≤ 6, `pickup.<id>`, `hud.primary`/`hud.best`, `end.lead`, `win.newBest` (WIN LINE), `fail.default` (FAIL LINE) | Metric semantics |
| `communityDisplay` | communityDisplay | — (new) | Name, logo, ticker, display-only contract, required disclaimer | Never used for eligibility or transactions |

**Porting steps:**
1. Extract today's look into `skins/buy-bounce.default/skin.json` (R-02).
2. Replace direct references to `HEADS`/`ART`/`ASSETS`/`TRACKS`/palette/strings with `skin.get(slot)`, keeping a fallback to the default.
3. Keep `USE_BRAND`'s procedural fallback as the per-slot fallback renderer.
4. Add the R-05 replay test.
5. Publish the emonad example only as a test fixture (`review.status: "example"`), not as a public listing.

## Draft `cartridge.json`

```json
{
  "id": "emonad-cabinet", "name": "<eMONAD game title TBD>",
  "description": "The chart falls. Slide the button under it. Every bounce prints a higher low.",
  "version": "2.1.0", "artwork": { "icon": "https://buy-bounce.vercel.app/public/assets/buy-cap.png" },
  "developer": { "name": "droober" },
  "supportedModes": ["free_play", "ranked_run"], "supportedObjectives": ["TOTAL_SCORE", "SURVIVAL_TIME"],
  "communityOptional": true, "minicoinOptional": true,
  "integrationLevel": "L1", "skeleton": "timing_intercept",
  "entry": { "url": "https://buy-bounce.vercel.app/?ta=1", "origin": "https://buy-bounce.vercel.app", "kind": "iframe" },
  "inputs": ["pointer_drag", "touch_drag", "keyboard"], "orientation": "portrait", "mobile": "full",
  "runLength": { "typicalSec": [40, 240], "maxSec": 900 },
  "scoring": {
    "TOTAL_SCORE": { "primary": "ath_usd", "order": "desc", "secondary": ["buys", "bestStreak"], "tieBreak": ["buys:desc", "ticks:asc", "verifiedAt:asc"], "raidAggregation": ["best_n_sum", "sum", "best"] },
    "SURVIVAL_TIME": { "primary": "ticks_alive", "unit": "ticks@120", "order": "desc", "tieBreak": ["ath_usd:desc", "verifiedAt:asc"], "raidAggregation": ["best_n_sum", "sum", "best"] }
  },
  "determinism": "replayable-portable", "simVersion": "bb-sim-2", "simHash": "sha256:<scored-path hash>", "tickHz": 120, "seedPolicy": "per_attempt",
  "cosmeticSlots": [{ "id": "button_head", "kind": "sprite" }, { "id": "palette", "kind": "palette" }],
  "skinSlotsVersion": "bb-slots-1",
  "skinAssetOrigins": ["https://skins.example-arcade-cdn.invalid"],
  "skinSlots": [
    { "id": "roster", "kind": "roster", "constraints": { "maxCharacters": 8, "rosterAffectsSim": "never" } },
    { "id": "button", "kind": "sprite", "constraints": { "layers": ["housing", "cap", "lip"], "stretch": "nine_slice" } },
    { "id": "pickups", "kind": "spriteSet", "constraints": { "keys": ["rbid", "lev", "bid", "dump", "hold", "tick"] } },
    { "id": "palette", "kind": "palette", "constraints": { "keys": ["accent", "base", "good", "bad"] } },
    { "id": "musicPack", "kind": "musicPack", "constraints": { "allowSynthPreset": true, "maxTracks": 4 } },
    { "id": "sfxPack", "kind": "sfxPack", "constraints": { "keys": ["tap", "woo", "milestone"] } },
    { "id": "strings", "kind": "strings", "constraints": { "keys": ["title", "subtitle", "tagline", "button_label", "pickup.rbid", "pickup.lev", "pickup.bid", "pickup.dump", "pickup.hold", "pickup.tick", "hud.primary", "hud.best", "end.lead", "win.newBest", "fail.default"], "maxLen": { "title": 24, "button_label": 6 } } },
    { "id": "communityDisplay", "kind": "communityDisplay" }
  ],
  "defaultSkin": { "skinId": "buy-bounce.default", "version": "1.0.0", "manifestUrl": "https://skins.example-arcade-cdn.invalid/buy-bounce/default/1.0.0/skin.json", "sha256": "<pin>" },
  "minicoin": { "eligible": true, "reason": "Planned optional eMONAD Cabinet economy; protocol deployment occurs outside the Cartridge" },
  "verifier": { "kind": "replay", "entry": "tools/verify.js", "runtime": "node20" },
  "removedInArcade": ["leaderboard", "wallet sign-in", "window mode + ticket draw (scrapped, D-1)", "chain/$BUY copy (scrapped, D-1)", "sim tuning in ranked"]
}
```
`orientation: "portrait"` is inferred from the phone-first layout. Verify it on device. The skin CDN origin is a placeholder (RESKIN_SPEC Q-R4).

## Risks / questions

- The default icon/cap art (`buy-cap.png`) still carries "BUY" branding. Either ship a neutral default skin or keep "BUY" as a generic verb with no token reference (founder call; cosmetic only).
- Public `CLAUDE.md` and `tools/` reveal anti-cheat internals. That's acceptable (replay is open by design). The window secret scheme becomes moot with WINDOW removed.
- Supabase shared with Coindle: one outage takes down both boards (moot once the arcade owns boards).
- Reskin IP: community characters (Skrumpeys, wassies, nads, emonad art) need rights entries per RESKIN_SPEC §5.1. Don't claim a community partnership unless permission evidence exists and an admin sets `official`.
- Per-player raid seeds increase course variance. Buy Bounce's spawn table is seed-driven, so log per-seed score spread (spec Q-12).
