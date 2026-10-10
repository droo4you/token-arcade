# Token Arcade cartridge integration checklist (v0.3 implementation note)

Walk this top to bottom for one game. Every item is **PASS / FAIL / N/A**, and every FAIL needs a note. Section refs point to `CARTRIDGE_SPEC.md`; `RS` refs point to `RESKIN_SPEC.md`. This is an **Implementation Note**, subordinate to the current Product Handoff and MiniCoin Economy Source of Truth.

Integration level and Score Verifier are separate axes. R (Reskin) is optional and orthogonal. L3 Economy-compatible does not universally require deterministic replay; if the configured economy funds automatic Raids, the Cabinet must also pass L2 Raid-ready.

Test rig you need: a stub host page that frames the cartridge and logs `ta:*` messages (allowlisted origin), Chrome + iOS Safari (or a WebKit build) + one Android Chrome, Node 20 for headless checks, and `rg`.

---

## L0: Free Play embed

| # | Check | How to verify | Pass when |
|---|---|---|---|
| L0-01 | Valid manifest | Validate `cartridge.json` against `cartridge.schema.json` | All Handoff §9 fields are present. `supportedModes` ⊇ `free_play`. |
| L0-02 | Own origin, frameable by the arcade only | `curl -sI <entry.url>`, then load it in the stub host | Loads in the iframe with the §3.1 sandbox. CSP `frame-ancestors` lists `hostOrigins` (SHOULD; FAIL-soft for Metropolis). |
| L0-03 | Handshake | Stub host log | `ta:hello` arrives on load. After `ta:mount`, `ta:ready` arrives within 15 s. |
| L0-04 | Origin checks both ways | Post a fake `ta:mount` from a non-allowlisted origin (second stub) | Ignored. The cartridge never uses `postMessage(..., "*")` (`rg "postMessage\(" -n`). |
| L0-05 | Standalone unchanged | Open the URL directly (not framed) | The game behaves as before. No SDK errors in the console. |
| L0-06 | Guest-instant | Mount with `player.kind="guest"` | Playable in ≤ 2 taps after `ta:ready`. No login, wallet, or payment prompt [H §4A, §15 Rule 1]. |
| L0-07 | Pause / resume | Send `ta:pause`, wait 5 s, send `ta:resume` | The sim does not advance while paused (score/timer frozen). `ta:paused` and `ta:resumed` are echoed. |
| L0-08 | Pause on blur | Switch tabs, or click the host page outside the iframe | The game pauses itself and sends `ta:paused{reason}`. Held keys are cleared. It does not auto-resume a run. |
| L0-09 | Audio | Mount with `muted:true`, then `ta:audio{muted:false}`, then press the in-game mute key | Silent until unmuted. No audio before a gesture. The in-game toggle emits `ta:audio_changed`. |
| L0-10 | Resize / mobile | Resize the iframe from 320×568 to 1920×1080 and rotate on a phone | No overflow or cropping of play-critical UI. Declared `orientation`, `mobile`, and `capabilities.touch` match reality (keyboard-only games declare it). |
| L0-11 | Clean destroy | `ta:destroy`, then mount again 3 times | `ta:destroyed` within 2 s. No duplicate audio or loops. Memory stable (DevTools heap ±10%). |
| L0-12 | No wallet / identity code active in arcade mode | `rg -n "ethereum\|personal_sign\|eth_requestAccounts\|wagmi\|privy\|walletconnect"`, plus a runtime check that no prompt appears | Wallet code is unreachable in arcade mode [H §6]. |
| L0-13 | No external boards or score POSTs in arcade mode | DevTools Network during a full run | Zero requests to the game's own leaderboard/submit/analytics endpoints. Leaderboard UI hidden. |
| L0-14 | No chain, token, draw, or "earn" copy | Read every screen in arcade mode | No chain ids/names, no ticket draws, no yield or price-promise wording [E §17]. |
| L0-15 | Error surfacing | Block one asset URL | The game sends `ta:error{fatal}` instead of hanging on a black screen. |
| L0-16 | No third-party trackers, ads, or top navigation | Network plus `rg "window.top\|top.location\|open\("` | None, or justified and removed in arcade mode. |

## L1: Ranked-ready

| # | Check | How to verify | Pass when |
|---|---|---|---|
| L1-01 | Host seed honoured | Mount `ranked_run` with seed S twice and play identically (or use a bot) | Same course both times. A different seed gives a different course. Locally rolled seeds are never used in ranked. |
| L1-02 | Fixed rules | Max out local upgrades, tuning sliders, and URL params, then mount ranked | The sim uses only `rules` (e.g. fixed loadout). The local save is untouched by the ranked run. |
| L1-03 | `RunResult` schema | Validate the `ta:run_complete` payload against §7 | All Handoff §6 fields. Metrics are integers. `mode`, `seed`, and `objective` echo the mount. |
| L1-04 | Objectives mapped | Compare manifest `supportedObjectives`/`scoring` with what the game computes | Every objective has a primary, an order, and a no-chance `tieBreak` [E §18 Q3]. |
| L1-05 | Scored runs start only via host | Press in-game "again" in ranked | The game sends `ta:request_run` and waits. It never starts a scored run on its own. |
| L1-06 | Restart/abandon semantics | Quit mid-run | Emits `RunResult{result:"abandoned"}` (attempt policy is the host's, Q-5). |
| L1-07 | No client authority | `rg` for client-side attempt counters, score POSTs, answer derivation | None reachable in ranked. |
| L1-08 | Verification artifact captured | Inspect `RunResult` / verifier payload | Artifact matches declared verifier: replay log for `replay`, authoritative move/event transcript for `server_authoritative`, or session telemetry/checkpoints for `session_checks`. |
| L1-09 | Plausibility bounds declared | Manifest `plausibility` | Bounds set from real play data (top human run × 3 headroom). |
| L1-10 | Declared Score Verifier accepts/rejects correctly | End-to-end via host on staging | Valid run -> accepted and on the Cabinet board. Edited metrics, reused run token/session, or rules/version mismatch -> rejected. |
| L1-11 | Wall-clock floor | Submit a run whose ticks exceed elapsed server time | Rejected. |
| L1-12 | Guest gating handled by host | Press Ranked as a Guest | The host prompts for Player Account before `ta:mount` [H §17 Scene 2]. The cartridge never sees a wallet. |
| L1-13 | Versioned build | `entry.url` contains an immutable version, and the Registry pins it | Old version URLs keep serving. |

## L2: Raid-ready

| ID | Check | How | PASS |
|---|---|---|---|
| L2-01 | Host owns Raid attempt lifecycle | Run a test Raid | Cartridge receives host-issued attempt/run config and cannot create extra scored attempts itself. |
| L2-02 | Raid rules/version pinned | Change rules/game version after issuing a run | Old run is rejected or remains bound to the original immutable rules/version. |
| L2-03 | Raid-compatible `RunResult` | Complete/abandon multiple attempts | Each attempt returns normalized metrics/result plus attempt/session identity. Aggregation happens server-side, not in the Cartridge. |
| L2-04 | Score Verifier declared | Manifest + staging | `session_checks`, `server_authoritative`, or `replay`; platform supports the declared method. |
| L2-05 | Verifier tamper tests | Alter primary metric, rules/version, player, run id, or verifier artifact | Every invalid mutation is rejected. |
| L2-06 | Replay protection | Resubmit an accepted attempt/session | Rejected as already spent/used. |
| L2-07 | Fair run configuration | Audit game-specific rules | Any seeds, level sets, hidden answers, loadouts, or attempt parameters come from the host/server and follow declared Raid rules. No genre is forced into a seed model it does not use. |
| L2-08 | Free Play cannot bypass Raid rules | Try debug URL/console/config paths | Free Play/debug paths cannot manufacture a valid Raid attempt/result. |
| L2-09 | Verifier-specific test suite | CI/staging | Replay games test determinism; authoritative games test hidden state/move judging; session-check games test bounds/telemetry/run-token controls. |
| L2-10 | Trust limitations documented | Review Raid rules/help | UX accurately states the v0 verification/settlement trust boundary. |
| L2-11 | Eligibility belongs to host | Holder/community-gated test | Cartridge receives eligibility/config as plain data; it does not query wallets/chain itself. |
| L2-12 | Cabinet leaderboard scope | Compare another Cabinet using same Skeleton | Scores remain separate by `gameId`; no automatic Skeleton-wide board. |

### Extra checks when `verifier.kind = replay`

- fixed/reproducible sim step
- seeded sim randomness separated from visual randomness
- no wall-clock dependence in scored path
- logical playfield independence where required
- replay artifact + exact version binding
- headless verifier from scored-path logic
- determinism and tamper CI
- cross-engine portability documented/tested when claimed

### Extra checks when `verifier.kind = server_authoritative`

- secret/authoritative state never arrives early at the client
- move/event protocol is authenticated to the active run/session
- server result is bound to Cabinet/version/rules/player

### Extra checks when `verifier.kind = session_checks`

- single-use server-issued run/session token
- elapsed-time/plausibility checks
- game-specific telemetry or checkpoints where useful
- explicit documentation of what cannot be cryptographically proven

## L3: Economy-compatible

| ID | Check | How | PASS |
|---|---|---|---|
| L3-01 | Stable Cabinet identity | Enable/attach economy on an existing Cabinet | Same `gameId` and Cabinet leaderboard/history are preserved. |
| L3-02 | Zero economic code in Cartridge | `rg` for wallet/Uniswap/WMON/Factory/Vault code | None reachable in Cartridge. Host/protocol owns economy. |
| L3-03 | Community/economy metadata host-owned | Inspect manifest/Registry | Cartridge may expose display hooks, but authoritative Community Asset/MiniCoin/Strategy config lives in Token Arcade. |
| L3-04 | Economy UI host-owned | Open game with economy enabled | Token/treasury/Raid funding UI is outside the game runtime. |
| L3-05 | Raid strategy dependency respected | Enable RaidFunding/Economy Raid strategy | Cabinet also passes L2 Raid-ready. A non-Raid future economy configuration need not imply replay. |
| L3-06 | Cosmetic/entitlement inputs are plain data | Mount holder cosmetic/avatar | Game renders allowed assets without querying ownership itself. |
| L3-07 | Copy compliance | Read all Arcade-mode screens | No yield/revenue-share/price promises; economy copy follows Source-of-Truth language. |

## R: Reskin (optional; any level) [RS §2–§8]

| # | Check | How to verify | Pass when |
|---|---|---|---|
| R-01 | Slots declared | `cartridge.json` has `skinSlots`, `skinSlotsVersion`, `skinAssetOrigins`, `defaultSkin` | Valid against `cartridge.schema.json`. Every hardcoded character, primary object, palette, music, SFX, and copy surface is either a slot or deliberately left default (RS §3). |
| R-02 | Default skin = today's look | Mount with no `skin` | Identical to the un-skinned build (pixel diff of title and in-run screens within tolerance). |
| R-03 | Loads from mount config only | Mount with `skin` (SkinRef) | `skin.json` is fetched from `manifestUrl`, its sha256 matches, and assets come only from `skinAssetOrigins` (CSP `img-src`/`media-src`/`font-src` limited to them). URL params can't select a skin in arcade mode. |
| R-04 | Data only | Load a skin that contains `.js`, `.svg`, HTML in strings, or `javascript:` | Rejected by `reskin.schema.json` and the loader. Strings render as text, never `innerHTML`. |
| R-05 | **Sim invariance** | Replay the same `ReplayLog` under the default skin and two other skins (including one with a different roster size) | Identical `stateHash` and metrics. `simVersion`, `simHash`, and `rulesHash` are unchanged (RS §2, §8). |
| R-06 | Roster is cosmetic | Pick each roster character in `ranked_run` and replay a fixed log | Same hitbox, speed, and stats for every character. `rosterAffectsSim: "never"` (RS §2). |
| R-07 | No asset-derived sim values | `rg` the scored path for `naturalWidth`, `.width` of images, `duration` of audio, `measureText` | None feeds the sim. Hitboxes come from code constants, and art is drawn inside them (RS §2). |
| R-08 | Per-slot fallback | Point one asset at a 404 and one at a bad hash | That slot falls back to default, `ta:error {code:"skin_asset"}` fires, and the run continues (RS §7). |
| R-09 | Budget | Sum asset bytes | ≤ 8 MB total, ≤ 2 MB critical-path, images ≤ 2048 px and ≤ 512 kB, tracks ≤ 2 MB, SFX ≤ 100 kB (RS §5). |
| R-10 | Rights and disclaimer | Read `rights` and `communityDisplay` | Every asset has a license entry. The disclaimer "Fan-made skin. Not affiliated with or endorsed by …" shows on title and listing. `official` is false unless an admin set it with permission evidence (RS §5.1). |
| R-11 | Moderation | Run the review steps in RS §5.2 | Status `approved` before public listing. A kill switch (unpublish) reverts the listing to the default skin without a cartridge redeploy. |
| R-12 | Copy fits | Render the longest allowed strings at 320 px wide | No overflow. Win/fail lines are within `maxLen`. |
| R-13 | Display-only community data | Inspect `communityDisplay.contract` usage | Rendered as text or a link only. Never used for eligibility, wallet calls, or transactions in the cartridge [H §6]. |


---

**Result block (paste into the gap report):**

```
Game: <id>   Build: <url/commit>   Date: <PT>
L0: PASS/FAIL   L1: PASS/FAIL/N/A   L2: PASS/FAIL/N/A   L3: PASS/FAIL/N/A   Verifier: session_checks/server_authoritative/replay/N/A   R: PASS/FAIL/N/A
Achieved level: Lx   Target (Metropolis): Ly
```
