# Token Arcade reskin/theme layer (v0.2 implementation note)

*Aligned 8 Oct 2026 (PT). Label: **Implementation Note**. Companion to `CARTRIDGE_SPEC.md`; subordinate to the Product Handoff and MiniCoin Economy Sources of Truth.*

**Purpose:** allow a Cartridge/Skeleton to expose data-only theme surfaces without silently changing scored gameplay.

**Current Metropolis decision:** only the Buy Bounce source is required to prove the broad reskin/rebrand path, producing a new eMONAD-branded Cabinet. Two Places, Coindle, and Skip to 10K do **not** require broad reskins simply because they have Community Asset concepts.

**Public identity rule:** a reskinned/rebranded deployment may be a **new Cabinet with a new public name and `gameId`** while recording the original source/Skeleton internally. The source repo name does not need to appear to players.

**Leaderboard rule:** leaderboards belong to Cabinet deployments. Two Cabinets built from the same Skeleton do not share a board by default, even when their scored mechanics are identical.

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Gameplay Skeleton** | Reusable scored mechanics/simulation/rules. May underpin many separately deployed Cabinets. |
| **Cartridge** | Executable build implementing the Token Arcade host boundary and declaring theme slots. |
| **Skin/theme pack** | Data only: `skin.json` + asset files. No executable gameplay code. |
| **Cabinet / deployment** | Public Registry game instance: `{gameId, cartridgeVersion, skin/theme, communityId?, economy?}`. Own leaderboard/history. |
| **Player cosmetic** | Per-player Passport entitlement passed by the host. Independent from the Cabinet's base skin/theme. |
| **Precedence** | player cosmetic (if slot allows) > Cabinet skin/theme > Cartridge default. All remain non-authoritative presentation inputs. |

A public Cabinet may be fully rebranded. For example, an eMONAD game can use Buy Bounce mechanics internally without presenting itself to users as "Buy Bounce".

## 2. The invariant: a reskin never touches the scored path

- A skin pack MUST NOT change `simVersion`, `simHash`, `rulesHash`, or replay output. The verifier never loads skins. `RunResult.skin` (CARTRIDGE_SPEC §7) is display metadata only.
- **Skins carry no executable content.** No JS, WASM, HTML, CSS, or SVG (SVG can script). So a skin cannot alter the simulation even if the cartridge has bugs.
- **The cartridge must not derive simulation values from asset properties.** Image width, sprite frame count, audio length, or string length must never feed physics, hitboxes, timing, or scoring. The art is scaled to the hitbox, not the other way round.
- **Characters are cosmetic.** In Ranked and Raid every roster entry shares identical hitboxes, stats, and abilities. Character choice is not a sim input and is not logged in `ReplayLog`. (A cartridge MAY offer character-specific mechanics in Free Play only, declared with `rosterAffectsSim: "free_play_only"`. The default and recommendation is `"never"`.)
- Verification invariants may stay valid across skins, but **public leaderboard scope is per Cabinet/deployment by default**. Shared Skeleton-wide boards are a future explicit product feature, not an automatic consequence of identical mechanics.

## 3. SKINNABLE vs LOCKED

| SKINNABLE (data in `skin.json`) | LOCKED (cartridge code, scored/replayed path) |
|---|---|
| **Roster**: playable characters, each with sprites/animations (idle, move, jump, hit, win, fail…), name, flavour line | Physics constants (gravity, bounce, speeds, ramps) |
| **Primary object**: paddle, ball, rock, vehicle (art scaled to the locked hitbox) | Hitboxes and collision sizes for every entity, including all roster entries |
| **Obstacles / hazards art** | Timing: tick rate, windows, durations, difficulty ramp |
| **Collectibles / pickups art**, their labels and colours (mechanics fixed) | Spawn tables, weights, placement, level layouts |
| **Backgrounds**: parallax layers, tiles, palette | Scoring formula, metrics, tie-breaks, objectives |
| **UI theme**: colours, fonts, button styles, HUD frame | RNG algorithm, seed use, stream separation |
| **Music pack**: tracks or synth presets | Input mapping and quantization |
| **SFX pack**: one sound per declared event | Anything whose change would alter `stateHash` |
| **Copy / strings**: game title, tagline, tutorial, HUD labels, pickup names, win/fail lines, share text | Attempt rules, modes, and plausibility bounds (set by the host / raid config) |
| **Community pairing display**: name, logo, link, colours, disclaimer | Eligibility and holder checks (host `isEligible` [H §5]; never from a skin) |

Gray zone rule: if you're unsure whether a value is visual-only, run the R-05 test (same replay, two skins). If `stateHash` changes, the value is LOCKED.

## 4. Slot kinds (declared by the cartridge in `cartridge.json → skinSlots`)

| kind | Value in `skin.json` | Cartridge declares |
|---|---|---|
| `roster` | `characters: [{ id, name, blurb?, animations: { <anim>: SpriteSheet } }]` | `minCharacters`, `maxCharacters`, required `animations` with `w,h,frames,fps` ranges, `anchor`, `hitbox` (display only, so artists can align to it), `maxOverdrawPct` |
| `sprite` | `SpriteSheet { src, w, h, frames, fps, anchor:[x,y], layers? }` | size, frames, `stretch` (`none` / `nine_slice` / `fit_hitbox`) |
| `spriteSet` | `{ <key>: SpriteSheet }` (e.g. one per pickup kind) | required keys |
| `image` | `{ src, w, h }` (backgrounds, logos) | size bounds, `parallaxLayers` |
| `palette` | `{ <name>: "#RRGGBB" }` | required names, `maxColors`, contrast requirements |
| `font` | `{ family, src, license }` or `bitmap: SpriteSheet + glyphs` | charset |
| `musicPack` | `tracks: [{ id, name, src: [m4a, ogg?], loopStartMs?, loopEndMs?, bpm? }]` **or** `synthPreset: {…}` matching the cartridge's preset schema | min/max tracks, `allowSynthPreset` |
| `sfxPack` | `{ <event>: { src:[…], gain? } }` | required events |
| `strings` | `{ <key>: string }` | keys, `maxLen` per key, `charset`, required keys |
| `communityDisplay` | `{ name, ticker?, logo?, url?, colors?, disclaimer }` | (standard slot, all cartridges) |

## 5. Asset constraints (PROPOSED defaults; a cartridge MAY tighten per slot)

| Constraint | Rule |
|---|---|
| Image formats | PNG or WebP (lossless for pixel art). No SVG, GIF, or AVIF in v0. Max 2048 px per side. Sprite sheets are horizontal strips or grids with frame size declared. Transparent background for characters and objects. |
| Pixel-art cartridges | Integer frame sizes as declared. Optional `maxColors` palette check (e.g. Skip to 10K / Two Places pixel style). No anti-aliased scaling (cartridge renders `image-rendering: pixelated`). |
| Frame counts | As the slot declares, e.g. idle 1–8, move 2–12. fps 4–24. |
| Audio | **M4A/AAC or MP3 required** (Safari), OGG optional. ≤ 2 MB per music track, ≤ 100 kB per SFX. Loudness target about −16 LUFS for music and peak ≤ −1 dBFS. Loop points in ms. |
| Fonts | WOFF2 only, subset to the declared charset, licence must permit web embedding. Bitmap-font cartridges (e.g. Two Places, uppercase A–Z 0–9) take strings validated against `charset`. |
| Strings | UTF-8. `maxLen` per key. No URLs except in `communityDisplay.url`. No wallet addresses in strings, except `communityDisplay.contract`, which is display only. |
| Budget | ≤ 8 MB total per pack, ≤ 2 MB "critical" (first playable frame). ≤ 512 kB per image. Every asset listed in `assets[]` with `sha256` and `bytes`. |
| Integrity | `skin.json` pinned by sha256 in the listing. Each asset is checked against its `sha256` after fetch. A version is immutable once published. |
| Hosting | Only on an allowlisted skin CDN origin (§7). No hotlinking from third-party sites. |

### 5.1 Licensing / IP attestation (required)

`skin.json → rights` MUST include: the creator or attestor identity (Passport player id, kept server-side), a statement that they own or are licensed to use every asset, a per-asset `license` (`owned`, `CC0`, `CC-BY-4.0` with attribution, `community-license` with URL, `licensed` with grant reference), `sources` URLs, and the date.

- **Community IP** (mascots, NFT art, logos, names). NFT holder licences vary by collection. An NFT image is not usable just because someone holds it. Default posture: a **fan skin** with original art "inspired by" the community, plus the standard disclaimer. Using official logos or collection art needs the rights holder's permission, which must be recorded in `rights.permissions[]` and verified by the admin.
- **No partnership claims.** `communityDisplay.disclaimer` is mandatory, default: "Fan-made skin. Not affiliated with or endorsed by <community>." Only an admin may set `communityDisplay.official: true`, with evidence on file [E §17 "Community relations"].
- Third-party characters (e.g. Skrumpeys, wassies, nads in someone else's skin) are separate IP. Each one needs its own rights entry.

### 5.2 Content moderation (v0: curated)

Automated checks first, then admin approval before publish [H §9 "no obvious malicious behavior"; v0 curated, H §2]:

- **Schema and constraints**: sizes, formats, budgets, hashes, charset.
- **Image moderation**: sexual content, gore, hate symbols. **OCR scan** of the art for URLs, wallet addresses, QR codes, and "claim/airdrop" bait.
- **String lint**: profanity/hate list, impersonation ("official", "endorsed"), financial-promise wording ("guaranteed", "yield", "profit", "returns", "airdrop") [E §17; R §10 "Words to use and words to drop"].
- **Human review** of the rendered listing in all modes. Takedown: unpublish the skin version without touching the cartridge. Listings fall back to the default skin.

## 6. `skin.json` format (`format: "ta-skin/1"`)

```jsonc
{
  "format": "ta-skin/1",
  "skinId": "emonad-cabinet.v1",          // <cartridgeId>.<slug>
  "version": "0.1.0",                          // immutable once published
  "name": "Buy Bounce: emonad fan skin",
  "cartridge": { "id": "buy-bounce", "versions": ">=2.0.0 <3.0.0", "skinSlotsVersion": "bb-slots-1" },
  "assetBase": "https://skins.<arcade-cdn>/buy-bounce/emonad-fan/0.1.0/",
  "slots": { "<slotId>": { /* value per slot kind, §4 */ } },
  "assets": [ { "path": "roster/emo-sad.png", "sha256": "…", "bytes": 41234, "mime": "image/png", "critical": true } ],
  "rights": { "attestedBy": "<passport id, server-side>", "attestedAt": "2026-10-08", "statement": "…",
              "assets": [ { "path": "roster/emo-sad.png", "license": "owned", "source": "original art" } ],
              "permissions": [] },
  "generatedBy": { "kind": "human" },          // or "ai_assisted" + madlib answers (§9)
  "review": { "status": "pending" }            // set by admin tooling, never by the creator
}
```

Validation: `reskin.schema.json` (structure) **plus** the slot-specific constraints from the target cartridge's `skinSlots` (sizes, keys, `maxLen`). Every `slots` key must be a declared slot. Unknown keys are rejected.

## 7. How a cartridge loads a skin

1. The Registry listing pins `{skinId, version, manifestUrl, sha256}`. The host passes it in `MountConfig.skin` (CARTRIDGE_SPEC §6).
2. The cartridge fetches `skin.json` from `manifestUrl`, but only if its origin is in the cartridge's `skinAssetOrigins` allowlist (manifest field). It verifies sha256, checks `cartridge.id`, version range, and `skinSlotsVersion`, then fetches the `critical` assets (verifying each `sha256`) before sending `ta:ready`. Non-critical assets (extra music tracks) load lazily.
3. **CSP** on the cartridge: `img-src`, `media-src`, `font-src`, and `connect-src` limited to its own origin plus `skinAssetOrigins`. The skin CDN serves `Access-Control-Allow-Origin` for cartridge origins and `X-Content-Type-Options: nosniff`.
4. **Per-slot fallback.** Any missing, invalid, or hash-mismatched asset falls back to the cartridge default for that slot and is reported via `ta:error{fatal:false, code:"skin_asset"}`. Buy Bounce already falls back to the square cursor when a head PNG fails.
5. The skin is applied **before** the first tick and never changes during a run. `RunResult.skin = {skinId, version}` for display.
6. Standalone/dev: `?skin=<manifestUrl>` is allowed only for allowlisted origins.

## 8. Effect on verification, boards, and the economy

- The verifier ignores `skin`. `rulesHash` (CARTRIDGE_SPEC §10.5) excludes skin fields. A raid may be *displayed* in a skin, and it settles identically.
- **Board scope:** each Cabinet/deployment has its own board. A future optional Skeleton comparison board may exist, but it is not the default competitive history.
- Associating a Cabinet with a community is host/Registry metadata. MiniCoin/Strategy behavior follows the Protocol Source of Truth. A skin pack never contains authoritative token/economy logic; display-only community metadata may be passed in from the host.

## 9. "Mad lib" AI flow → skin pack (interface only for Metropolis)

Matches Handoff Phase 3: "Mad Libs + game creator + token/community configuration" and "AI generates against audited game skeletons" [H §21]. The generator can only fill **SKINNABLE** slots. Locked fields don't exist in the skin schema, so a prompt can't change gameplay.

**Template (per cartridge, generated from `skinSlots`):**

```
I'm a fan of [COMMUNITY]. Port [CARTRIDGE] for us.
Playable characters: [CHARACTERS] (1–N, short description each).
The thing you control / hit is a [PRIMARY OBJECT].
Pickups feel like: [PICKUP THEMES]   Hazards look like: [OBSTACLES]
Setting: [BACKDROP]   Colours: [PALETTE]   Vibe / music: [VIBE/MUSIC]
Title: [TITLE]   Win line: [WIN LINE]   Fail line: [FAIL LINE]
```

| Mad-lib field | Slot(s) | Generator output | Validation |
|---|---|---|---|
| `[COMMUNITY]` | `communityDisplay` | name, ticker, url, colours, auto-disclaimer | Must match a Community Asset in the Registry, or be labelled "fan, unlisted". Never sets `official`. |
| `[CHARACTERS]` | `roster` | one sprite set per character at the declared sizes and animations | Frame/size checks. Hitbox overlay preview. IP check (§5.1). |
| `[PRIMARY OBJECT]` | primary sprite slot (e.g. `button`) + label string | layered sprite + label | `stretch` rule, `maxLen`. |
| `[PICKUP THEMES]` / `[OBSTACLES]` | `spriteSet` + `strings.pickup.*` | art and names per locked pickup kind | One-to-one with the cartridge's kinds. Mechanic text stays generated from locked data. |
| `[BACKDROP]`, `[PALETTE]` | `image`, `palette` | layers, colours | Contrast check (HUD legible). |
| `[VIBE/MUSIC]` | `musicPack`, `sfxPack` | synth preset or licensed/generated tracks | Loudness, length, licence. |
| `[TITLE]`, `[WIN LINE]`, `[FAIL LINE]` | `strings.title`, `strings.win.*`, `strings.fail.*` | copy | String lint (§5.2), charset, length. |

Pipeline: answers → draft `skin.json` + per-slot asset prompts → generated or uploaded assets → automatic validation (§5, §6) → creator rights attestation (§5.1) → admin review (§5.2) → publish listing. The answers are stored in `generatedBy.madlib` for audit.

## 10. Worked example: eMONAD Cabinet from the Buy Bounce Skeleton (ILLUSTRATIVE)

> **Example only.** Buy Bounce is the source/Skeleton, while the public Cabinet is an eMONAD-branded game whose final public title can be chosen separately. Asset paths are placeholders. No partnership is claimed or implied. A real pack needs rights/permission as applicable plus the v0 submit/review/approve/deploy flow.

**Buy Bounce slot map (from the public build, `src/game.js` and `CLAUDE.md`, 8 Oct 2026):**

| Slot (`bb-slots-1`) | Today in code | Locked counterpart that stays fixed |
|---|---|---|
| `roster` (chart-cursor character) | `HEADS` list: Cursor, Artificial Inu, Cashcat, Ponshouse, Tendies, Robbie. 160 px PNGs drawn at 30 px. "`update()` never reads it" | Chart collision geometry |
| `button` (primary object, 3 layers) | `ART` housing/cap/lip PNGs | `padW`, `padMin`, travel (sim keys) |
| `strings.button_label` | "BUY" on the cap | — |
| `pickups` spriteSet + `strings.pickup.*` | chips keyed by internal id: `rbid` "BID", `lev` "2X", `bid` "WHALE", `dump` "DUMP", `hold` "HOLD", `tick` "TICKET" (`src/game.js:626–634`) | pickup effects, spawn weights, **chip sizes `w`/`h`** (collision), ticket schedule `TICKET_AT` |
| `palette` | accent `#CCFF00`, base `#070707` | — |
| `musicPack` | procedural `TRACKS`: Breakout, Melt-Up, Accumulate (synth presets) | — |
| `sfxPack` | `tap`, `woo`, `milestone` WAVs | — |
| `strings.*` | title, tagline, menu legend, HUD "Market cap" / "ATH", end screen "You took $BUY to", foot lines | metric values (`ath`, `buys`, `climb`) |
| `communityDisplay` | — (new) | — |

**Example `skin.json` (abridged):**

```json
{
  "format": "ta-skin/1",
  "skinId": "emonad-cabinet.v1",
  "version": "0.1.0",
  "name": "eMONAD Cabinet Theme (EXAMPLE)",
  "cartridge": { "id": "buy-bounce", "versions": ">=2.0.0 <3.0.0", "skinSlotsVersion": "bb-slots-1" },
  "assetBase": "https://skins.example-arcade-cdn.invalid/emonad-cabinet/0.1.0/",
  "slots": {
    "communityDisplay": {
      "name": "emonad", "ticker": "$EMO", "url": "https://emonad.lol/",
      "contract": { "chainId": 143, "address": "0x81a224f8a62f52bde942dbf23a56df77a10b7777" },
      "disclaimer": "Fan-made skin. Not affiliated with or endorsed by emonad.", "official": false
    },
    "roster": { "characters": [
      { "id": "emo-sad",  "name": "Sad Nad",   "animations": { "idle": { "src": "roster/emo-sad.png",  "w": 160, "h": 160, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] } } },
      { "id": "emo-hype", "name": "Hype Nad",  "animations": { "idle": { "src": "roster/emo-hype.png", "w": 160, "h": 160, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] } } },
      { "id": "emo-goth", "name": "Goth Nad",  "animations": { "idle": { "src": "roster/emo-goth.png", "w": 160, "h": 160, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] } } }
    ] },
    "button": { "src": "button/housing.png", "w": 384, "h": 128, "frames": 1, "fps": 1, "anchor": [0.5, 1],
                "layers": { "housing": "button/housing.png", "cap": "button/cap.png", "lip": "button/lip.png" }, "stretch": "nine_slice" },
    "pickups": {
      "rbid": { "src": "pickups/hopium.png",    "w": 64, "h": 32, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] },
      "lev":  { "src": "pickups/moodswing.png", "w": 64, "h": 32, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] },
      "bid":  { "src": "pickups/bigfeels.png",  "w": 64, "h": 32, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] },
      "dump": { "src": "pickups/meltdown.png",  "w": 64, "h": 32, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] },
      "hold": { "src": "pickups/numb.png",      "w": 64, "h": 32, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] },
      "tick": { "src": "pickups/tear.png",      "w": 96, "h": 32, "frames": 1, "fps": 1, "anchor": [0.5, 0.5] }
    },
    "palette": { "accent": "#B48CFF", "base": "#120A1F", "good": "#7FE6B0", "bad": "#FF5C8A" },
    "musicPack": { "tracks": [
      { "id": "mood-ring", "name": "Mood Ring", "src": ["music/mood-ring.m4a", "music/mood-ring.ogg"], "loopStartMs": 0, "bpm": 132 },
      { "id": "its-not-a-phase", "name": "It's Not A Phase", "src": ["music/not-a-phase.m4a"], "bpm": 150 }
    ] },
    "sfxPack": { "tap": { "src": ["sfx/tap.m4a"] }, "woo": { "src": ["sfx/sigh-woo.m4a"] }, "milestone": { "src": ["sfx/milestone.m4a"] } },
    "strings": {
      "title": "Mood Bounce", "subtitle": "an eMONAD arcade game",
      "tagline": "The vibes fall. Catch them. Every bounce, a slightly less sad low.",
      "button_label": "COPE",
      "pickup.rbid": "HOPIUM", "pickup.lev": "MOOD SWING", "pickup.bid": "BIG FEELS", "pickup.dump": "MELTDOWN", "pickup.hold": "NUMB", "pickup.tick": "TEAR",
      "hud.primary": "Mood cap", "hud.best": "Peak feels",
      "end.lead": "You took the mood to",
      "win.newBest": "FEELINGS: BULLISH", "fail.default": "IT'S NOT A PHASE"
    }
  },
  "assets": [
    { "path": "roster/emo-sad.png", "sha256": "<placeholder>", "bytes": 0, "mime": "image/png", "critical": true }
  ],
  "rights": { "attestedBy": "<passport-id>", "attestedAt": "2026-10-08",
              "statement": "EXAMPLE ONLY. A real pack must attest original or licensed art.",
              "assets": [ { "path": "roster/emo-sad.png", "license": "owned", "source": "original art (placeholder)" } ],
              "permissions": [] },
  "generatedBy": { "kind": "ai_assisted", "madlib": {
      "COMMUNITY": "emonad", "CHARACTERS": "three moody nads: sad, hype, goth", "PRIMARY OBJECT": "a COPE button",
      "VIBE/MUSIC": "midwest-emo chiptune", "WIN LINE": "FEELINGS: BULLISH", "FAIL LINE": "IT'S NOT A PHASE" } },
  "review": { "status": "example" }
}
```

The pickup art is drawn **inside the locked chip box** (`w`/`h` from code). The art size above is source resolution, scaled to the box. Labels are fitted to the box (shrink or ellipsis) and never resize it. The `tick` collectible is kept as a plain in-run collectible counted as a secondary metric. It has no prize, draw, or ticket meaning (the window/draw mode is removed, see `gap-reports/buy-bounce.md`).

What stays identical: gravity, bounce, chart speed, button width (`padW`) and ramp, pickup effects and weights, scoring (`climb` → `ath`), RNG, the 120 Hz step, and the replay record. A run recorded under the emonad skin replays to the same score under the default skin (R-05). Cross-community characters (e.g. Skrumpeys, wassies, nads from other communities) are allowed in a roster only with their own rights entries (§5.1).

## 11. Open questions

- **Q-R1**: Do listings (cartridge + skin + community) live in the Game Registry as first-class entries, each with its own card, artwork, and boards?
- **Q-R2**: Board scope: per listing only, or also a cross-skin board per cartridge?
- **Q-R3**: Who may submit skin packs in v0: admin only (recommended) or players with review?
- **Q-R4**: Skin CDN: which origin, and is it under the arcade domain or separate?
- **Q-R5**: Do player cosmetics (Passport) override skin roster entries in community listings, or are listings "locked look"?
- **Q-R6**: Music: are synth presets enough for v0, or are licensed audio files needed? Who clears music rights?
