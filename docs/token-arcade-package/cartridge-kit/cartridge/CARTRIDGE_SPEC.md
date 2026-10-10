# Token Arcade Cartridge Spec (v0.3, implementation note)

*Aligned 8 Oct 2026 (PT) after the Product Handoff / MiniCoin Economy alignment pass.*

**Label:** Implementation Note. This file does not define product or protocol behavior. It explains how a browser game plugs into the two Sources of Truth.

**Owning sources:**

- Product/Application: `Token_Arcade_v0_Metropolis_Handoff.pdf`
- Protocol/Economy: `minicoin-economy-v0.2.2-codex-ready.pdf`

If this spec conflicts with either Source of Truth, the Source of Truth wins.

**Current alignment decisions:**

- Gameplay **Skeleton** = reusable mechanics/simulation.
- **Cabinet/Deployment** = public game instance with its own `gameId`, leaderboard namespace, Raid history, Community Asset association, and optional economy.
- Reusing a Skeleton for a new community creates a **new Cabinet**, not a shared leaderboard.
- Buy Bounce is the source/Skeleton for an eMONAD-branded Cabinet. "Buy Bounce" does not need to remain public branding.
- Two Places is associated with Skrumpeys without a broad reskin.
- Coindle stays game-first with economy Coming Soon.
- Skip to 10K stays unreskinned with ETH/WETH concept; do not invent unverified WETH infrastructure.
- Skrumpey Slide is withheld from the initial legacy import so it can prove `Submit -> Admin Approve -> Developer Deploy -> Published`.
- Verification is a **separate capability axis**. Deterministic replay is one Score Verifier type, not a universal requirement for every Raid-ready game.

**Acceptance test:** an existing browser game can be wrapped, published as a Cabinet from Registry state, run as Free Play, return normalized results, support Ranked/Raid according to its declared capabilities and Score Verifier, and contain no Privy/wallet/chain/MiniCoin logic of its own.

**Out of scope:** economics, Hook/LP implementation, treasury behavior, and product policy. Those are owned by the Sources of Truth.

**Keywords:** MUST, SHOULD, MAY are normative inside this Implementation Note. Anything not decided by a Source of Truth is marked **PROPOSED**.

## 1. Terms

| Term | Meaning |
|---|---|
| **Gameplay Skeleton** | Reusable mechanics/simulation/rules that can power multiple deployments. A Skeleton has no shared leaderboard by default. |
| **Cartridge** | Executable game build + manifest/adapter implementing the Token Arcade host boundary. |
| **Cabinet / Deployment** | Public Registry game instance. Own `gameId`, branding, leaderboard, Raid history, Community Asset association, optional MiniCoin/economy. |
| **Host** | Token Arcade frontend/runtime embedding the Cartridge and owning identity, modes, leaderboards, community/economy UI. |
| **Score Verifier** | Platform-side game-specific result verifier: `session_checks`, `server_authoritative`, or `replay`. |
| **MiniCoin** | Optional game economy owned by the Protocol Source of Truth. No MiniCoin logic lives in Cartridge code. |
| **Community Raid** | Funded or Economy Raid. The Cartridge only receives run configuration and returns results. |
| **Skin pack** | Data-only visual/audio/copy pack filling declared skin slots; contains no executable gameplay code. |
| **Cabinet skin/theme** | Presentation layer used by one Cabinet. A new skin/community deployment may have a different public name and game ID while reusing the same Skeleton. |

**Leaderboard rule:** boards are keyed to `gameId` / Cabinet deployment. Two Cabinets using the same Skeleton do not share scores unless a future explicit comparison feature is created outside the default leaderboard.

## 2. Principles (inherited, not new)

1. **The arcade hosts the game. The game returns the result. The platform decides what happens next** [H §6].
2. **A game contains no Privy logic, Monad logic, Minicoin contracts, raid contracts, wallet logic, or NFT ownership logic** [H §6]. Everything identity- or money-related comes in as plain data from the host.
3. **The client is untrusted.** A score from the browser is a claim. The host accepts competitive results only through the Cabinet's declared Score Verifier.
4. **Free Play is instant, needs no wallet, allows unlimited retries, and costs nothing** [H §4A, §8]. Guests reach a playable game with as little friction as possible [H §15 Rule 1].
5. **Do not rebuild games unnecessarily** [H §18 `feat/v0-games-existing`]. **Preserve working code** [H §0]. Arcade behaviour switches on in *arcade mode* (§3.4). The standalone site keeps working.
6. **Credible verification boundary, not perfect anti-cheat.** Verification method is separate from integration level: session checks, server authority, or deterministic replay as appropriate.
7. **Don't couple to Monad** [H §0 header, §25]. Chain ids, addresses, and token names never appear in cartridge code.

## 3. Packaging and hosting

### 3.1 Default: sandboxed iframe (MUST for existing games)

The host embeds each cartridge from its **own origin**. Every existing game is already on its own Vercel or custom domain.

```html
<iframe
  src="https://<cartridge-origin>/<versioned-path>/?ta=1&ta_host=https%3A%2F%2Farcade.example"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
  allow="autoplay; fullscreen; gamepad"
  referrerpolicy="strict-origin"
  title="<game name>"></iframe>
```

- `allow-same-origin` is safe here **only because** the cartridge origin is different from the arcade origin. The games need it for `localStorage`, which Free Play saves use. Never serve a cartridge from the arcade's own origin with this flag.
- Do not grant `allow-top-navigation`, `allow-popups`, `allow-forms` (where it is not needed), `allow-modals`, or payment / `publickey-credentials-*`. If a game wants a share sheet, it sends `ta:share` (§4.3) to the host.
- Why iframe: it gives error isolation and clean `destroy` [H §18 `feat/v0-game-sdk` "error isolation", "mounting/unmounting"; H §9 Step 3 "destroys cleanly", "no obvious malicious behavior"]. The existing games use classic global scripts (Skip to 10K, Buy Bounce, Two Places) or are a full Next.js app (Coindle), so module embedding would collide with the host.

### 3.2 Optional: ES module (MAY, for new skeleton-built games such as Skrumpey Slide). **PROPOSED**

A module cartridge exports `createCartridge(): TokenArcadeGame` (§5) and is mounted into a host-provided element. The interface and messages are identical. The SDK swaps the `postMessage` transport for direct calls. Only curated, reviewed code may use module mode, because it runs in the arcade's origin.

### 3.3 Origin allowlist (both directions, MUST)

- **Host → cartridge.** The host only `postMessage`s to the cartridge origin listed in the Game Registry (manifest `entry.origin`). It drops any message where `event.origin !== entry.origin` **or** `event.source !== iframe.contentWindow`.
- **Cartridge → host.** The cartridge accepts messages only from origins in its baked-in `hostOrigins` allowlist (manifest field; e.g. prod, preview, and localhost arcade origins), **and** only from `window.parent`. It never posts with `targetOrigin "*"`. It posts to the origin that completed the handshake.
- **Framing policy (SHOULD).** In production the cartridge sends `Content-Security-Policy: frame-ancestors <hostOrigins>`. *Observed 8 Oct 2026:* none of the four live games sends `X-Frame-Options` or a CSP `frame-ancestors` header. They are embeddable today, but by anyone.

### 3.4 Arcade mode detection

The cartridge enters **arcade mode** when it is framed (`window.parent !== window`) **and** it receives a valid `ta:mount` from an allowlisted origin within 3 s of `ta:hello`. `?ta=1` is a hint only. It is never trusted on its own. Outside arcade mode the game behaves exactly as its standalone site does today.

### 3.5 Versioned, immutable builds (MUST for L1+)

Every `gameVersion` is served from an immutable URL, e.g. `/v/1.4.2/`, or pinned by the Registry to a deployment URL. Ranked and raid results are verified against the **exact** simulation that produced them. Buy Bounce's own notes record that record v1 runs cannot replay on the v2 build (`CLAUDE.md`, "Engine-independent math"). The verifier loads the same `simVersion` (§8).

## 4. Bridge protocol (postMessage)

### 4.1 Envelope

```ts
type TAMessage<T extends string, P> = {
  ta: 1;            // protocol major version
  type: T;          // e.g. "ta:mount"
  id?: string;      // request id when a reply is expected
  re?: string;      // id being replied to
  payload: P;
};
```

### 4.2 Lifecycle sequence

```
cartridge                         host
   |--- ta:hello {sdk, gameId, gameVersion} ---->|
   |<-- ta:mount {MountConfig} ------------------|   (mode, rules, seed?, player, cosmetics, audio)
   |  load assets, apply config                  |
   |--- ta:ready {capabilities} ---------------->|   host reveals Play button
   |<-- ta:start --------------------------------|   (Ranked/Raid: only after the server issues a run session)
   |--- ta:run_started {runId, tick:0} --------->|
   |      ... ta:pause / ta:resume either way ...|
   |--- ta:progress {primaryMetric} (optional) ->|
   |--- ta:run_complete {RunResult} ------------>|   == onRunComplete [H §6]
   |<-- ta:restart | ta:start (new session) | ta:destroy
   |--- ta:destroyed --------------------------->|
```

### 4.3 Message catalog

**Host → cartridge**

| type | payload | meaning |
|---|---|---|
| `ta:mount` | `MountConfig` (§6) | Configure the cartridge. Equivalent to `mount(config)` [H §6]. Re-sent before every ranked or raid run, with a fresh seed and session. |
| `ta:start` | `{ runId?: string }` | Begin the run. Free Play may start locally without this. |
| `ta:pause` / `ta:resume` | `{ reason?: "host_overlay" \| "blur" \| "user" }` | [H §6] |
| `ta:restart` | `{}` | Free Play only: restart locally. In Ranked or Raid the host instead sends a new `ta:mount` and `ta:start` after spending an attempt. |
| `ta:destroy` | `{}` | Stop loops, audio, and listeners, then reply `ta:destroyed`. [H §6, §9 Step 3] |
| `ta:audio` | `{ muted: boolean, volume: number /*0..1*/ }` | The host is the master mute. |
| `ta:viewport` | `{ width, height, dpr, safeArea:{t,r,b,l}, orientation }` | Sent on resize, rotation, or fullscreen. The iframe also receives native `resize`. |
| `ta:move_result` | `{ re, result }` | Only for server-authoritative cartridges (§10.6). |

**Cartridge → host**

| type | payload | meaning |
|---|---|---|
| `ta:hello` | `{ sdk:"0.1", gameId, gameVersion, simVersion? }` | Sent on load when framed. |
| `ta:ready` | `{ capabilities: { pause:boolean, mute:boolean, touch:boolean, keyboard:boolean, gamepad:boolean, orientation:"any"\|"landscape"\|"portrait" } }` | Assets loaded and config applied. |
| `ta:run_started` | `{ runId?, mode }` | First simulation tick. |
| `ta:paused` / `ta:resumed` | `{ reason: "blur" \| "hidden" \| "user" \| "orientation" \| "host" }` | The game self-pauses on blur or hidden (§5) and must report it. |
| `ta:progress` | `{ primaryMetric: number, secondary?: Record<string,number> }` | Optional, at most 4 Hz. Live HUD for the host. Never trusted. |
| `ta:run_complete` | `RunResult` (§7) | [H §6] `onRunComplete` |
| `ta:request_run` | `{ mode }` | The player pressed "again" or "play" inside the game. In Ranked or Raid **the host decides** whether an attempt is available. The game never starts a scored run on its own. |
| `ta:move` | `{ id, runId, move }` | Server-authoritative cartridges only (§10.6). |
| `ta:share` | `{ text, imageDataUrl? }` | The host shows the share UI. |
| `ta:audio_changed` | `{ muted }` | The player toggled mute in-game (e.g. `M` key). The host mirrors it. |
| `ta:exit` | `{}` | The player chose "Home" in the game. The host navigates. |
| `ta:error` | `{ code, message, fatal }` | The host shows an error state [H §15 Rule 7]. |
| `ta:destroyed` | `{}` | Teardown done. |

Timeouts (PROPOSED). `ta:ready` must arrive within 15 s of `ta:mount`, or the host shows a "couldn't load" state. `ta:destroyed` within 2 s, or the host removes the iframe anyway.

## 5. Cartridge SDK (minimal)

A tiny client library (`@token-arcade/cartridge-sdk`, **PROPOSED** name, < 5 kB, zero deps). It implements §4 and gives the game this surface. It keeps the Handoff's conceptual interface verbatim and adds only what the bridge needs.

```ts
// ---- Handoff §6 conceptual interface, implemented by the game adapter ----
export interface TokenArcadeGame {
  mount(config: MountConfig): void | Promise<void>;
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
  onRunComplete(callback: (result: RunResult) => void): void;
}

// ---- SDK surface the game calls ----
export interface CartridgeSDK {
  /** Resolves with MountConfig in arcade mode; resolves null standalone (game runs as today). */
  connect(game: TokenArcadeGame, opts: { gameId: string; gameVersion: string; simVersion?: string;
                                        hostOrigins: string[] }): Promise<MountConfig | null>;
  ready(capabilities: Capabilities): void;
  runStarted(info: { runId?: string; mode: ModeId }): void;
  paused(reason: PauseReason): void;
  resumed(reason: PauseReason): void;
  progress(p: { primaryMetric: number; secondary?: Record<string, number> }): void;
  complete(result: RunResult): void;            // emits ta:run_complete
  requestRun(mode: ModeId): void;               // "play again" inside the game
  move?(runId: string, move: unknown): Promise<unknown>; // server-authoritative games only
  share(p: { text: string; imageDataUrl?: string }): void;
  audioChanged(muted: boolean): void;
  exit(): void;
  error(e: { code: string; message: string; fatal: boolean }): void;
  readonly inArcade: boolean;
}

export type ModeId = "free_play" | "ranked_run" | "community_raid";   // PROPOSED wire ids
export type PauseReason = "blur" | "hidden" | "user" | "orientation" | "host";
export interface Capabilities { pause: boolean; mute: boolean; touch: boolean; keyboard: boolean;
  gamepad: boolean; orientation: "any" | "landscape" | "portrait"; }
```

**Behaviour the SDK enforces, or the game MUST implement:**

- **Pause on blur.** On `blur` or `visibilitychange: hidden`, pause the simulation (ticks stop), clear held inputs, and send `ta:paused`. Resume only on explicit player input or `ta:resume`. Do not auto-resume a scored run.
- **Audio.** No sound before a user gesture inside the frame. `ta:audio` overrides in-game volume. The in-game mute key still works and reports `ta:audio_changed`.
- **Resize and mobile.** Fit the canvas to the iframe viewport and respect `safeArea`. If the game needs landscape, show its own rotate prompt *and* set `capabilities.orientation`. If the game has no touch controls, declare `touch:false`; on coarse-pointer devices the host then shows "best on keyboard" before Play [H §15 Rule 6].
- **Teardown.** `destroy()` cancels RAF, timers, audio nodes, and global listeners. The host may mount the same cartridge again later.

## 6. MountConfig (host → game)

```ts
export interface MountConfig {
  mode: ModeId;
  gameId: string; gameVersion: string;
  objective: string;                 // one of manifest.supportedObjectives, e.g. "TOTAL_SCORE" [H §3 Community Raid]
  rules: RulesConfig;                // fixed competitive conditions [H §8 Ranked: "defined competitive rules"]
  seed?: string;                     // decimal uint32 or hex; server-issued for ranked/raid
  levelSet?: string[];               // authored-level games, e.g. Two Places raid = three levels [H §7]
  session?: { runId: string; expiresAt: string };   // opaque to the game; the host holds the run token
  raid?: { raidId: string; attempt: number; maxAttempts: number; endsAt: string };  // display only
  player: PlayerContext;
  cosmetics: Record<string /*slotId*/, CosmeticAsset | null>;
  skin?: SkinRef;                    // listing's skin pack (RESKIN_SPEC §7); never affects the sim
  audio: { muted: boolean; volume: number };
  locale?: string;
  viewport: { width: number; height: number; dpr: number; safeArea: { t: number; r: number; b: number; l: number } };
}

export interface RulesConfig {
  rulesVersion: string;              // pins scoring/sim rules; part of rulesHash (§10.5)
  loadout?: Record<string, number>;  // e.g. Skip to 10K upgrade levels FIXED for the run (never the player's local save)
  difficulty?: string;               // e.g. Coindle "hard"
  timeLimitTicks?: number;
  hintsAllowed?: boolean;
  [k: string]: unknown;              // game-specific, declared in manifest.rulesSchema
}

export interface PlayerContext {
  kind: "guest" | "player";          // [H §4]
  displayName?: string;              // [H §14]
  avatarUrl?: string;                // selected avatar/PFP, resolved by host [H §14]
  // NO wallet address, Privy id, chain id, balances, or NFT ownership. [H §6]
}

export interface SkinRef {
  skinId: string; version: string;
  manifestUrl: string;               // skin.json on an origin in manifest.skinAssetOrigins
  sha256: string;                    // pin for skin.json
}

export interface CosmeticAsset { kind: "sprite" | "palette" | "image" | "audio"; url: string;
  frames?: number; w?: number; h?: number; palette?: string[]; }
```

- In Free Play, `seed` is absent and the game rolls its own. Ranked and Raid always carry a server seed (or `levelSet`) and a fixed `rules`. The game MUST ignore local saves, upgrades, and tuning sliders that would change the simulation.
- **Skins never change the simulation either.** `skin` swaps roster art, primary-object art, palette, music, SFX, and copy only. Every roster character shares identical hitboxes and stats in Ranked and Raid. Skins contain no code and are excluded from `simVersion`, `simHash`, and `rulesHash` (`RESKIN_SPEC.md` §2).
- **Cosmetics never change the simulation.** A slot only swaps visuals or audio. Eligibility (e.g. a Skrumpeys holder skin) is resolved by the host through `isEligible(player, community)` [H §5]. The cartridge only ever sees an asset URL.

## 7. RunResult (game → host)

The Handoff fields [H §6] are kept as-is. Fields marked **+** are PROPOSED extensions.

```ts
export interface RunResult {
  gameId: string; gameVersion: string; runId: string;
  mode: ModeId; raidId?: string; seed?: string;
  objective: string;
  primaryMetric: number;                       // integer, objective-specific (see manifest.scoring)
  secondaryMetrics?: Record<string, number>;   // integers
  result: "completed" | "failed" | "abandoned" | "timeout";
  startedAt: string; finishedAt: string;       // ISO; informational, server timestamps are authoritative
  /* + */ simVersion?: string;
  /* + */ ticks?: number;                      // simulated ticks at end
  /* + */ replay?: ReplayLog;                  // required only when verifier.kind == "replay"; otherwise optional telemetry/artifact
  /* + */ claimHash?: string;                  // sha256 of canonical {primary, secondary, ticks}
  /* + */ client?: { ua: string; pauses: number; tickHz: number };
  /* + */ skin?: { skinId: string; version: string };   // display only; ignored by the verifier
  /* + */ attemptIndex?: number;                         // raids: 0-based attempt this run used
}

export interface ReplayLog {
  format: "ta-inputlog/1";
  tickHz: number;                              // e.g. 60 or 120
  // Delta-encoded: [tickIndex, input] only when input changes. Inputs are integers
  // (bitmask for buttons, quantized ints for analog/pointer). Opaque per game but
  // decodable by that game's headless sim.
  events: Array<[number, number | number[]]>;
  endTick: number;
  playfield?: { w: number; h: number };        // logical, NOT window size (§10.3)
}
```

- `primaryMetric` and `secondaryMetrics` MUST be integers (e.g. ms or ticks, whole dollars, counts), so ranking and tie-breaks don't depend on float formatting.
- Size cap (PROPOSED): 512 kB serialized. The host gzips it before upload.

## 8. Manifest: `cartridge.json`

The Handoff's manifest fields [H §9 Step 2] are mandatory and keep their names: `id`, `name`, `description`, `version`, `artwork`, `developer`, `supportedModes`, `supportedObjectives`, `communityOptional`, `minicoinOptional`. Everything else is a **PROPOSED** extension that the Game Registry and Admin Launch Console can read [H §9 Steps 3–4, §18 `feat/v0-game-registry`]. (The brief asked for `title`. The Handoff field is `name`, so `name` is used.) A machine-readable JSON Schema is in `cartridge.schema.json` next to this file.

```jsonc
{
  "id": "buy-bounce",                       // stable forever; leaderboard history survives a later MiniCoin [E §3 "Game first, coin later"]
  "name": "Buy Bounce",
  "description": "Slide the BUY button under the falling chart.",
  "version": "2.0.0",                       // == gameVersion
  "artwork": { "card": "https://…/card.png", "hero": "https://…/hero.png", "icon": "https://…/icon.png" },
  "developer": { "name": "droober", "contact": "…" },
  "supportedModes": ["free_play", "ranked_run", "community_raid"],
  "supportedObjectives": ["TOTAL_SCORE", "SURVIVAL_TIME"],
  "communityOptional": true,
  "minicoinOptional": true,

  // ---- PROPOSED extensions ----
  "integrationLevel": "L2",                 // L0..L3, §12; validated by checklist
  "skeleton": "timing_intercept",           // id from /workspace/launchpad/skeletons.json, or "daily_deduction" (§13)
  "entry": { "url": "https://buy-bounce.vercel.app/v/2.0.0/", "origin": "https://buy-bounce.vercel.app", "kind": "iframe" },
  "hostOrigins": ["https://<arcade-prod>", "https://<arcade-preview>", "http://localhost:3000"],
  "inputs": ["pointer_drag", "touch_drag", "keyboard"],          // pointer_* | touch_* | keyboard | gamepad | tilt
  "orientation": "any",
  "mobile": "full",                         // full | landscape_only | keyboard_required
  "runLength": { "typicalSec": [45, 240], "maxSec": 900 },
  "scoring": {
    "TOTAL_SCORE": { "primary": "ath_usd", "unit": "usd", "order": "desc",
                     "secondary": ["buys", "bestStreak"],
                     "tieBreak": ["secondary:buys:desc", "ticks:asc", "verifiedAt:asc"] },
    "SURVIVAL_TIME": { "primary": "ticks_alive", "unit": "ticks@120", "order": "desc",
                       "tieBreak": ["ath_usd:desc", "verifiedAt:asc"] }
  },
  "determinism": "replayable-portable",     // §10.2 enum
  "simVersion": "bb-sim-2",
  "tickHz": 120,
  "seedPolicy": "per_attempt",              // none | per_run | per_attempt | fixed_level_set | server_secret_answer
  "rulesSchema": { "type": "object", "properties": { "rulesVersion": { "type": "string" } } },
  "plausibility": { "maxPrimary": 1e15, "maxPrimaryPerSec": 5e12, "minTicks": 120, "maxTicks": 108000,
                    "maxInputEventsPerSec": 240 },
  "attemptsDefault": 3,                     // default only; raid config decides [H §13]
  "cosmeticSlots": [
    { "id": "button_head", "kind": "sprite", "w": 32, "h": 32, "desc": "BUY button head skin" },
    { "id": "palette", "kind": "palette", "colors": 2 }
  ],
  "simHash": "sha256:<hash of the scored-path source files>",   // reskins never change this
  "skinSlotsVersion": "bb-slots-1",
  "skinAssetOrigins": ["https://skins.<arcade-cdn>"],
  "skinSlots": [                            // RESKIN_SPEC §4; what a skin pack may fill
    { "id": "roster", "kind": "roster", "required": false, "constraints": { "maxCharacters": 8, "animations": { "idle": { "w": [64, 512], "h": [64, 512], "frames": [1, 8] } }, "rosterAffectsSim": "never" } },
    { "id": "button", "kind": "sprite", "constraints": { "stretch": "nine_slice", "layers": ["housing", "cap", "lip"] } },
    { "id": "pickups", "kind": "spriteSet", "constraints": { "keys": ["rbid", "lev", "bid", "dump", "hold", "tick"] } },
    { "id": "palette", "kind": "palette", "constraints": { "keys": ["accent", "base", "good", "bad"] } },
    { "id": "musicPack", "kind": "musicPack", "constraints": { "allowSynthPreset": true, "maxTracks": 4 } },
    { "id": "sfxPack", "kind": "sfxPack", "constraints": { "keys": ["tap", "woo", "milestone"] } },
    { "id": "strings", "kind": "strings", "constraints": { "maxLen": { "title": 24, "button_label": 6 } } },
    { "id": "communityDisplay", "kind": "communityDisplay" }
  ],
  "defaultSkin": { "skinId": "buy-bounce.default", "version": "1.0.0", "manifestUrl": "https://skins.<arcade-cdn>/buy-bounce/default/1.0.0/skin.json", "sha256": "<pin>" },
  "minicoin": { "eligible": true, "reason": "" },   // eligibility to *offer* the Factory switch; deploy is admin + Economy Spec [E §11]
  "verifier": { "kind": "replay", "entry": "tools/verify.js", "runtime": "node20" },  // replay | server_authoritative | session_checks
  "removedInArcade": ["own leaderboard", "wallet sign-in", "window mode", "tuning panel (sim keys)"]
}
```

`cosmeticSlots` are per-player Passport entitlements. `skinSlots` are per-listing skin-pack slots. Precedence is player cosmetic > skin > default (`RESKIN_SPEC.md` §1).

Validation rules: the Admin/Creator Portal rejects a manifest whose declared modes exceed the Cartridge integration capabilities. `ranked_run` requires L1. `community_raid` requires L2 plus a supported Score Verifier. `minicoin.eligible` does **not** imply deterministic replay: if the configured economy includes Raid funding, the Cabinet must also be Raid-ready; a standalone/non-Raid economy may be eligible without replay.

## 9. Mode requirements

| | Free Play | Ranked Run | Community Raid |
|---|---|---|---|
| Account | Guest allowed | Player Passport required | Player Passport required; eligibility may add Community Asset checks |
| Host config | local/random rules allowed | fixed/declared rules; host run session | fixed Raid rules; attempts/config from host |
| Result | local result may be enough | normalized `RunResult` -> Score Verifier | normalized `RunResult` -> Score Verifier -> Raid settlement layer |
| Leaderboard | optional/local | Cabinet leaderboard | Cabinet/Raid leaderboard |
| Economy | none required | none required | Funded Raid needs no MiniCoin; Economy Raid uses protocol layer |

The Cartridge never determines payment, prize custody, token routing, or winner payout.

A game may ignore an external seed in Free Play. Ranked/Raid configuration should be reproducible/fair to the extent required by the chosen game and verifier, but not every game needs a procedural seed.

---

## 10. Score verification and Raid validity

### 10.1 Trust model

The browser client is never the final authority. Every Ranked/Raid-capable Cabinet declares a `verifier.kind`.

Supported v0 kinds:

| kind | Use when | Game-side requirement |
|---|---|---|
| `session_checks` | full deterministic replay is impractical; the game can provide authenticated run metadata/telemetry and strong plausibility checks | versioned build, run/session binding, integer/normalized metrics, game-specific telemetry where useful |
| `server_authoritative` | hidden/authoritative state must not be trusted to the client (daily deduction, multiplayer authority later) | move/event protocol compatible with server judge; client never receives secret state early |
| `replay` | simulation can be deterministically recomputed from seed/version/input log | fixed/reproducible sim, replay artifact, deterministic verifier/tests |

The strongest practical verifier should be selected **without rewriting a working game solely to satisfy deterministic replay for Metropolis**.

### 10.2 Verification metadata

Every competitive result must bind at least:

- `gameId` / Cabinet ID
- game version / simulation version as applicable
- mode / Raid ID
- objective and rules hash/version
- run/session ID
- player identity key
- accepted primary/secondary metrics

Replay/session reuse and tampered metrics must be rejected.

### 10.3 Replay-capable cartridges

For `verifier.kind = replay`, keep the existing deterministic guidance:

- fixed or otherwise reproducible simulation step
- seeded sim randomness separated from visual randomness
- no wall-clock dependence in scored path
- logical playfield independent of viewport where required
- input quantization/logging
- exact simulation/version pinning
- headless verifier using the same scored-path logic
- determinism/tamper CI

Portable cross-engine determinism is ideal. If a verifier is explicitly same-engine/server-authoritative, document that limitation rather than pretending portability exists.

### 10.4 Session-check cartridges

For `session_checks`, define game-specific protections such as:

- server-issued single-use run token
- start/end timestamps and wall-clock floor
- version/rules binding
- plausible metric bounds
- attempt/rate limits
- event/telemetry summaries sufficient to reject obvious fabricated scores
- optional signed checkpoints

Document what this verifier does **not** prove.

### 10.5 Server-authoritative cartridges

For secret-answer or authoritative-state games, the server owns the answer/state and validates player moves/events. Coindle is the canonical likely example.

### 10.6 Raid attempts / aggregation

Attempt count, per-attempt configuration, and Raid aggregation belong to the host/server, not the Cartridge. A Cartridge returns one run at a time.

Games may use:

- per-attempt seeds
- a fixed authored level set
- server-held hidden state
- other fair/declared configuration

Do not force one seed model onto every genre.

### 10.7 Tie-breaks

Tie-break rules must be deterministic and declared in Raid configuration. No chance-based tie-break.

### 10.8 Published verification artifacts

Where practical, retain/publish enough run artifacts after a Raid to permit later review. This may be a full replay log, authoritative server transcript, or session telemetry depending on verifier kind.

### 10.9 Documented limitations

The Arcade rules/UI should state the relevant trust boundary honestly. v0 may use centralized verification/settlement; stronger challenge/TEE/zk paths are later protocol work.

## 11. What a game must REMOVE or neutralize (in arcade mode)

| Remove / neutralize | Why | Applies |
|---|---|---|
| Its own leaderboard reads/writes, score POSTs, anonymous-uid boards | The arcade owns leaderboards, history, and Passport [H §8]. Client-trusted submission violates [H §12]. | L0 (hide UI, stop POSTs), L1 (must) |
| Wallet connect, `window.ethereum`, `personal_sign`, SIWE, its own sessions/cookies for identity | No wallet logic in games [H §6]. Identity = Privy via host [H §4B]. | L0 |
| Chain-specific copy and logic (e.g. "Robinhood Chain · 4663"), its own token, desk, or prize-draw flows | No Monad/chain coupling in game code [H §6, §25]. The economy belongs to the Economy Spec [INDEX §1B]. | L0 |
| Lotteries, draws, ticket-weighted prizes, any chance-based reward or tie-break | No chance element in tie-breaks [E §18 Q3]. No wagering [E §2, §16; INDEX §7]. | L0 (hide), L1 (must) |
| In-game shops or upgrades that change the sim in scored modes | Ranked needs "defined competitive rules" [H §8]. Keep them in Free Play; use fixed `rules.loadout` in Ranked/Raid. | L1 |
| Tuning panels or URL params that change the sim (gravity, speed, widths) | Same. Already gated in Buy Bounce. | L1 |
| Non-reproducible RNG/clock/viewport dependencies in a **replay-verified** scored path | Replay verifier requirements (§10.3) | verifier-specific |
| Client-side answer derivation (e.g. date-hash → today's answer) | Answer secrecy (§10.6) | L1 (ranked) / L2 |
| Accepting scored-Raid secrets/seeds through untrusted debug URLs or console paths | Prevents bypassing host/Raid configuration | Raid/verifier-specific |
| Client-side attempt counters treated as authority | Attempts are server-side (§10.4.6) | L1 |
| Ads, analytics beacons to third parties, external links that navigate the top frame | Malicious/unexpected behaviour check [H §9 Step 3]; sandbox | L0 |
| "Earn", "yield", or price-promise copy | [E §17 "Wagering and regulation"; R §5, §10 "Words to use"] | L0 |

## 12. Integration levels (ship incrementally)

Integration level and verification kind are separate axes.

| Level | Name | Unlocks | Minimum game-side work |
|---|---|---|---|
| **L0** | **Arcade-ready** | Free Play for Guests | Host handshake/mount, pause/resume/destroy, lifecycle cleanup, host audio/resize handling, valid manifest; own wallet/board/chain UX neutralized in Arcade mode. |
| **L1** | **Ranked-ready** | Ranked Run | L0 + fixed/declared scored rules, normalized `RunResult`, host-issued run lifecycle, objective/tie-break metadata, declared Score Verifier accepted by platform. |
| **L2** | **Raid-ready** | Funded Community Raids | L1 + host-driven Raid rules/attempts, Raid-compatible result semantics, verifier capable of accepting Raid results, version/rules binding, tamper/replay protection appropriate to verifier kind. **Deterministic replay is not mandatory.** |
| **L3** | **Economy-compatible** | Optional MiniCoin / Economy integration | L0+ stable Cabinet identity and zero economic code in Cartridge. If the configured economy enables Raid funding/automatic Economy Raids, L2 is also required. Other future economy configurations may not require Raid capability. |

### Verification axis

A manifest separately declares:

- `session_checks`
- `server_authoritative`
- `replay`

These are implementation methods, not a simple quality ladder. Choose the method that matches the game.

**Reskin (R) is orthogonal** to L0-L3 and to verifier kind.

### Cabinet identity

A Skeleton can back multiple Cabinet deployments. Each deployment gets a separate `gameId` and leaderboard namespace. A new skin/community deployment is not automatically a continuation of the source game's public board.

Upgrade path: a Cabinet can publish at L0, gain Ranked/Raid capabilities later, and add an economy later without changing its own stable `gameId`. A separate community deployment from the same Skeleton is a different `gameId`.

## 13. Per-skeleton integration notes (`/workspace/launchpad/skeletons.md`)

| Skeleton | Determinism difficulty | Notes for Ranked/Raid |
|---|---|---|
| 1 `forced_forward_dodger` | Medium | Procedural spawner must be seeded per chunk (seed + chunkIndex) so spawns don't depend on frame timing. Speed ramp by tick, not time. |
| 2 `ratchet_climber` | Medium | Camera ratchet must be part of the sim if it decides death ("below camera"). Logical playfield width is critical. |
| 3 `momentum_pump` | Hard | Continuous curve physics uses trig heavily → needs portable math. Generated terrain must be seeded. Hold-duration inputs log well. |
| 4 `commit_and_simulate` | **Easy** | Few inputs (aim, power, then light nudges) → tiny logs. Upgrades live outside the run, so Ranked must fix `rules.loadout`. Trajectory previews are fine if they're deterministic. |
| 5 `timing_intercept` | Medium | The intercept window must be evaluated on ticks. Drag-position games must quantize the position per tick. |
| 6 `arena_survival` | Hard (multiplayer: out of scope) | Single-player bots: seeded AI. Live .io multiplayer is not v0 [INDEX §7]. |
| 7 `course_navigator` | Easy–Medium | Authored levels need no seed. "Seed" = `levelSet`. Rehearsal is inherent (speedrun-style). Primary = completion ticks. Deaths/restarts inside an attempt count toward time. |
| 8 `grid_logic` | **Easy** | Move list is the log. Random piece feeds must be seeded. If the board is a secret puzzle, go server-authoritative. |
| 9 `build_and_resolve` | Easy (single-player) | Build is the input; resolve is pure sim. Async PvP needs server-held opponent builds. |
| — `daily_deduction` (**PROPOSED** extension; Coindle; not in skeletons.md) | Easy logic, **secrecy hard** | The answer must stay on the server (§10.6). Oracle-derived clues (prices) must be frozen per puzzle. Metrics: solved, guesses, elapsed ms, hints used. |
| Skrumpey Slide (planned) | Hybrid 4×3 | Withheld from the initial legacy import. When supplied, build/convert it Cartridge-native, declare the strongest practical Score Verifier, and onboard it through Submit -> Approve -> Developer Deploy. Do not require replay unless its actual implementation supports it cleanly. |

## 14. Alignment notes and open implementation questions

The previous v0.2 conflicts around Economy document versioning, Ranked payment, initial game lineup, and replay-only Raid admission are superseded by the aligned Sources of Truth.

Current implementation facts:

- Metropolis Ranked entry is free unless the Protocol Source of Truth is explicitly revised.
- Initial legacy Cabinets are eMONAD-from-Buy-Bounce, Two Places, Coindle, and Skip to 10K.
- Skrumpey Slide is intentionally withheld for the real creator portal flow.
- Raid-ready does not imply replay-only verification.
- Leaderboards are per Cabinet/deployment, not per Skeleton.

Open Implementation Note questions (do not redefine product/protocol):

1. Exact wire mode/message names (`free_play`, `ranked_run`, `community_raid`, `ta:*`).
2. Which manifest fields live onchain vs offchain Registry.
3. Exact verifier chosen for each of the four imported games after repo audit.
4. Pause policy for scored runs.
5. Result signing format and service boundary.
6. Mobile policy for any game whose current controls do not fully support touch.
7. Exact Raid attempt aggregation per Cabinet, owned by Raid config rather than Skeleton defaults.
8. Whether existing games are iframe-hosted or selectively converted to trusted module cartridges after review.

If a new implementation question affects product behavior or economics, stop and escalate it to the owning Source of Truth rather than deciding it here.
