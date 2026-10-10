# Buy Bounce, Season One Technical Specification

Version 1.2. Prepared by droober for the $BUY team.
Target chain: Robinhood Chain (id 4663), Arbitrum Orbit L2.

Changed in 1.1: the economics move from a per-window rake to a persistent pool.
Changed in 1.2: the window's payout is drawn in two tiers, a head prize and a
consolation tier (§8). The payout fraction is untouched, so §2.1 still holds.

Sections 1, 4.1 to 4.3 and 9 are substantially unchanged from 1.0.

---

## 1. Objective

Ship a paid-entry arcade event for the $BUY community that is verifiable end to end, settles in a tokenized equity, and returns a stated fraction of entries to players.

The design goal that governs every decision below: **a player must be able to prove their own result without the operator's cooperation.** Buy Bounce is a skill game, which means the outcome originates on our server rather than on a public beacon. Everything in section 4 exists to close that gap.

---

## 2. Parameters

| Parameter | Value | Changeable |
| --- | --- | --- |
| Door | $1.00 USDG, fee-inclusive | Fixed for the season |
| Fee | 5% of the door, to operations | Immutable, asserted at deploy |
| Pool contribution | 95% of the door | Immutable, asserted at deploy |
| Attempts | 3 per wallet per window | Fixed for the season |
| Holding gate | Minimum $BUY balance, checked at entry | Operator-set, published before open |
| Attempt consumption | On run start, not on submission | Fixed |
| Tickets per run | 10, a fixed set released on a seeded schedule | Fixed |
| Tickets per window | 30 maximum, three attempts at 10 | Fixed |
| Ticket accumulation | Across all three attempts | Fixed |
| Payout fraction | 50% of the pool, per window | Immutable, asserted at deploy |
| Head prize | 60% of the window's payout, one wallet | Immutable, asserted at deploy |
| Consolation tier | 40% of the window's payout, split equally (see §8) | Immutable, asserted at deploy |
| Pool persistence | The other 50% carries into the next window | Fixed |
| Pool seed | One-way, sized at one window's expected entries | Per season |
| Prize asset | HOOD if tokenized on Robinhood Chain, otherwise SPY | Per season, published before open |
| Settlement | Weighted lottery, tickets are weights | Fixed |
| Randomness | drand quicknet, round committed before window open | Fixed |
| Dispute window | 24 hours after window close | Fixed |
| Claim | Merkle root, batch claim, no expiry | Fixed |

**Nothing is raked out of the pool. 95 cents of every dollar joins a pool that persists across windows, and each window pays out half of what that pool holds.** The 5 cent fee is the entire operator take and it never touches the pool.

### 2.1 Why half the pool is ninety-five percent of entries

The payout fraction and the return rate are different numbers, and the difference is the whole design. Paying out half the pool sounds like a fifty percent rake. It is not one, because the half that stays is still player money and it is still on the table next window.

Write `P` for the pool carried into a window, `N` for that window's entries in dollars, `c = 0.95` for the contribution fraction and `p = 0.50` for the payout fraction.

```
pool at draw     =  P + cN
prize            =  p(P + cN)
pool carried out =  (1 - p)(P + cN)
```

The pool has a fixed point where it carries out exactly what it carried in:

```
P* = (1 - p)(P* + cN)
P* = (1 - p)cN / p
```

At `p = 0.5` that is `P* = cN = 0.95N`, and the prize at that point is `p(0.95N + 0.95N) = 0.95N`.

**Steady-state return is 95% of entries**, which is the same band as the rest of the arcade this game sits beside. The error term shrinks by `(1 - p)` each window, so a pool seeded away from `P*` halves its distance to it every window.

Two consequences the operator has to understand.

**Seed the pool at one window's expected entries, not at a round number.** A seed of `0.95N` starts at steady state and pays 95% from window one. A seed below it pays less than 95% until it converges.

| Window | Seed $500, N=1000 | Seed $950, N=1000 |
| --- | --- | --- |
| 1 | $725.00 (72.5%) | $950.00 (95.0%) |
| 2 | $837.50 (83.8%) | $950.00 (95.0%) |
| 3 | $893.75 (89.4%) | $950.00 (95.0%) |
| 4 | $921.88 (92.2%) | $950.00 (95.0%) |
| 5 | $935.94 (93.6%) | $950.00 (95.0%) |

**The pool is a buffer and it self-corrects.** If entries grow, the pool sits below its new fixed point and the return dips under 95% while it catches up. If entries shrink, the pool sits above it and pays out more than 95% of that window's entries until it settles. A game in decline returns its pool to the players who are still there rather than stranding it.

### 2.2 The final window

A season that ends leaves roughly `0.95N` sitting in the pool with no window to carry it into. One rule closes that hole:

**A window declared final before it opens pays out 100% of the pool instead of 50%.**

The declaration is on chain and it happens before the first entry of that window, which means it can never be used to drain a pool mid-season. There is no other path out.

---

## 3. Run lifecycle

1. **Entry.** Wallet approves and pays $1.00 USDG. Contract verifies the $BUY holding gate, verifies attempts remaining, increments the attempt counter, splits 95 cents to the pool and 5 cents to operations, and emits a run authorization carrying a run id and the run seed (see 4.1).
2. **Play.** Client runs the deterministic engine. The run carries two objectives that compete for the same input: chase market cap for the score board, or take tickets for the draw. Exactly 10 tickets exist per run, released one at a time as the clock passes fixed marks, and the last three sit inside the late difficulty ramp.
3. **Death or completion.** Client submits the run: final ticket count, plus the full input log and engine version hash. The contract records the hash of that submission.
4. **Banking.** Tickets are credited to the wallet's window total. A run that never submits banks at its last verified checkpoint.
5. **Close.** Window closes. No further entries. Ticket totals freeze. The window's accumulated USDG converts to the prize asset in one swap (see section 6).
6. **Dispute.** 24 hours. Any player may submit a replay challenge (4.3).
7. **Draw.** Ticket root finalizes. The pre-committed drand round is verified on chain. The head winner and the `K` consolation winners are all derived from that one signature, ticket-weighted and without replacement (see §8.2).
8. **Settle.** The window's payout is 50% of the pool, or 100% if the window was declared final. It splits 60% to the head winner and 40% equally across the consolation tier. Anything the dust or short-window branches leave undistributed stays in the pool. The remainder is the next window's opening balance and no operator action moves it.
9. **Claim.** Merkle root published, one leaf per winner across both tiers. Winners claim at will. Unclaimed balances never expire.

**Attempt consumed on run start.** A player who dislikes their first three seconds has already spent the attempt. This removes reroll farming and it is stated on the rules page rather than discovered.

**Disconnect equals death.** The run banks at the last verified checkpoint. This is stated up front. The alternative, treating a disconnect as a void, hands players a free option on bad runs.

---

## 4. Verifiability

This is the section that makes the product defensible. Read it before writing any engine code.

### 4.1 Deterministic engine

The engine must be a pure function of `(seed, input log)`. No wall-clock reads, no `Math.random`, no floating-point drift, no frame-rate dependence.

Requirements:

- **Fixed timestep.** Physics advances on a fixed integer tick. Rendering interpolates and never feeds back into simulation.
- **Integer or fixed-point math throughout.** Floating point is not reproducible across devices. Use fixed-point for position, velocity, and collision. ECMA-262 does not specify precision for `Math.sin`, `Math.cos`, `Math.pow`, `Math.exp` or `Math.log`, so any of them inside the simulation makes a replay engine-dependent and breaks 4.3 for a player verifying in a browser we did not choose.
- **Seeded PRNG.** All procedural generation (platform layout, pickup placement, power-up rolls) derives from the run seed. One PRNG, one stream, seeded once.
- **Input log.** Every input recorded as `(tick, event)`. The log plus the seed reproduces the run exactly, including the ticket count.
- **Engine version hash.** Every submission carries the hash of the engine build. A replay is only valid against the same build.

**Acceptance test: replay 10,000 recorded runs on a machine that did not produce them and get byte-identical ticket counts.** If that test does not pass, the season does not ship.

### 4.2 Run seed commitment

The run seed prevents the operator from choosing a player's level layout and prevents the player from grinding for a favorable one.

```
at entry
  serverSecret  = 32 random bytes, per window
  serverCommit  = keccak256(serverSecret)          published before window opens
  round         = drand quicknet round, committed before window opens
  runSeed       = keccak256(sig || serverSecret || wallet || runIndex)
at window close
  serverSecret is revealed; anyone can re-derive every run seed in the window
```

The drand round is named before the window opens and cannot exist at commitment time, so the server cannot grind its secret against a known signature. The wallet and run index salt each run, so two players in the same window get independent layouts.

Verify the BLS signature on chain against drand's group public key using the chain's BLS12-381 precompiles. `DrandSigRegistry` at `0xd4D34ecfbc9c0000a7915A5F48bb0dEf484ff802` already does this on 4663 and is the reuse candidate. It is deployed but unverified on Blockscout, so read its interface off `CoinFlipDesk` or `JackpotPool`, both of which call it and both of which are verified.

### 4.3 Dispute window

For 24 hours after close, the ticket root is provisional. Any player may submit a challenge naming a run id. The operator publishes that run's seed, input log, and replayed ticket count. Anyone can re-run it against the published engine build.

A challenge that proves a mismatch invalidates the posted root and forces republication.

The submission hash recorded in step 3 of the lifecycle is what makes this binding. The operator publishes a log that must hash to a value committed before the draw, so a log cannot be revised after the winner is known.

### 4.4 What we can and cannot claim

**Can claim:** run layouts are committed before they are dealt and verifiable afterward; the draw is a public beacon verified on chain; every ticket count is reproducible from published data; the operator cannot select a winner; the contribution and payout fractions are immutable and asserted at deploy, so the pool cannot be quietly made worse than advertised.

**Cannot claim:** that the game is even-money. It is not. The fee is 5% of every entry and it does not come back. Say the number and never soften it into a fairness claim.

Do not describe 95% as what a player gets back, either. It is what the pool returns in aggregate at steady state. Roughly one wallet in twenty is paid anything at all (§8.1), and the rules page has to say that in those words rather than leaning on the consolation tier to make the odds sound friendly.

---

## 5. Contracts

Four pieces. Keep them small.

**BuyBounceDesk**
- `enter()` takes $1.00 USDG, checks the $BUY gate and attempt counter, emits run authorization
- Splits 95% to the pool and 5% to the ops address, in the entry transaction, with both fractions immutable
- The constructor asserts both fractions against a published band and reverts outside it, so the split is fixed at deploy and readable on chain
- No owner function on the draw, the pool, or the split
- Halt switch stops `enter()` only; settlement and claims can never be halted

**PrizePool**
- Holds the prize asset (HOOD or SPY) continuously, across windows
- Every destination is the winner or the next window. There is no owner withdrawal, no sweep, no upgrade, and no token rescue
- The seed deposit is one-way and permanent
- `declareFinal()` is callable only before a window's first entry and only sets that window's payout fraction to 100%

**DrandSigRegistry**
- Permissionless relay of a drand round signature, BLS-verified on chain
- Reuse the deployed registry on 4663 rather than rewriting it

**Claims**
- Merkle root published after the dispute window, carrying one leaf per winner across both tiers
- `claim(proof)` callable by anyone for their own leaf
- A leaf is a leaf. The contract does not distinguish the head winner from a consolation winner, so the tiers cost nothing extra at claim time and the root is one transaction regardless of `K`
- Balances never expire

### Invariants

At the end of every transaction:

- Desk USDG balance covers unswept entries plus the ops accrual
- Pool balance is at least the sum of unclaimed winnings
- Cumulative pool credits equal 95% of cumulative entries, plus the seed
- Cumulative ops credits equal 5% of cumulative entries
- The head credit plus every consolation credit equals the window's payout, minus anything the dust or short-window branches left undistributed
- Undistributed payout is credited back to the pool in the settlement transaction and to nowhere else
- No wallet appears twice in a window's winner set
- No path moves a unit out of the pool except a winning claim or the declared final payout
- The operator key can route value only to the winner, the immutable pool, or the immutable ops address. It can never name a destination

---

## 6. Prize asset and market hours

The pool holds the prize asset continuously. Entries arrive in USDG and accumulate through the window, then convert in **one swap at window close**.

One swap per window at a scheduled time is the point: a single known execution during market hours, rather than a stream of conversions at whatever price each entry happened to land on.

Robinhood's stock tokens trade 24/5, Sunday 8 PM ET through Friday 8 PM ET. Consequences:

- **Schedule window close during market hours.** The conversion has to execute, so a close outside the trading week strands that window's entries in USDG until the reopen.
- **Winners hold the stock token.** Cash-out to USDG is the winner's own swap and waits for the reopen on a weekend.
- **The prize is denominated in the token, not in dollars.** The pool owes what it holds, so a price move cannot leave it short. Say this on the rules page.
- **The pool's dollar value moves between windows.** A player entering window five is joining a pool whose size was partly set by window one's purchase price. This is new with a persistent pool and it belongs on the rules page as a disclosed risk.

**Check the catalog on the official Blockscout explorer at `robinhoodchain.blockscout.com` before committing to HOOD.** If it is not tokenized, use SPY for season one. A first event should not have prize values swinging while people wait to claim.

---

## 7. Anti-abuse

| Vector | Mitigation |
| --- | --- |
| Sybil wallets | $BUY holding gate raises the cost per seat above the ticket EV |
| Reroll farming | Attempt consumed on run start |
| Ticket inflation | Only 10 tickets exist per run and they are released on a seeded schedule, so the ceiling is set by the run rather than by how long a player will sit there. Re-checked on replay |
| Endurance farming | The difficulty ramp no longer saturates, so runs terminate. Surviving longer stops paying once the tenth ticket is released |
| Client tampering | Replay verification on submission; engine version hash bound to every run |
| Disconnect abuse | Banks at last verified checkpoint |
| Late-entry advantage | None exists; the draw is weighted and the pool is fixed at close |

The gate is the primary Sybil defense and its level is an economic decision, not a security one. Set it so a marginal wallet costs more to fund than the expected tickets it can farm.

A persistent pool adds one vector the per-window model did not have. A pool that has grown well above its fixed point is a standing target, because the return that window is above 95% and a Sybil operator can compute exactly how far above. The gate is what prices that out, so its level should be reviewed against the pool balance before each window rather than set once for the season.

---

## 8. Prize distribution

A single winner per window is honest in aggregate and brutal in experience. The median player enters three times and never sees anything come back, and a 95% return that no individual player ever feels is a weaker retention story than a smaller number they can touch.

So the window's payout is drawn in two tiers off the same beacon.

| Parameter | Value | Changeable |
| --- | --- | --- |
| Head prize | 60% of the window's payout | Immutable, asserted at deploy |
| Consolation pot | 40% of the window's payout | Immutable, asserted at deploy |
| Consolation winners | `K = max(5, uniqueWallets / 20)` | Derived on chain, no operator input |
| Consolation share | The pot divided equally among the `K` winners | Fixed |
| Minimum consolation | Published per season, suggested $5 | Fixed for the season |

The arcade's own draw controller carries `ConsolationGranted` and `ConsolationSkipped`, so a tiered draw is an established pattern on this chain rather than an invention.

### 8.1 What the two tiers are for

The tiers are sized so they do different jobs as the game grows.

| Unique wallets | Head prize | `K` | Each consolation | Wallets paid |
| --- | --- | --- | --- | --- |
| 50 | $86 | 5 | $11.40 | 6 (12.0%) |
| 100 | $171 | 5 | $22.80 | 6 (6.0%) |
| 333 | $569 | 16 | $23.73 | 17 (5.1%) |
| 1,000 | $1,710 | 50 | $22.80 | 51 (5.1%) |
| 5,000 | $8,550 | 250 | $22.80 | 251 (5.0%) |

Steady state, every wallet using all three attempts.

**The consolation share is scale-invariant at about $22.80.** Both the pot and `K` grow linearly with wallets, so they cancel. A wallet that used all three attempts spent $3, which makes a consolation roughly **7.6 times its spend**, at every size of the game.

That is the whole point of the split. The head prize scales with the crowd and stays the headline. The consolation stays a fixed, legible multiple of what a player actually put in, and roughly one wallet in twenty touches one. Against a single-winner draw at 333 wallets, that moves the chance of getting paid from 0.3% to 5.1%.

The floor of 5 covers the opposite end. A 50-wallet window would otherwise draw two consolation winners, and a game that small needs its winners visible more than it needs them large.

### 8.2 Drawing the tiers

All of it comes off the one committed drand round, in the derivation style the arcade already uses:

```
sig            = the verified beacon signature for the window's round
headSeed       = keccak256(sig || 0)
consolSeed_i   = keccak256(sig || i)        for i in 1..K
```

The head winner is drawn first, ticket-weighted over the full ticket tree. Each consolation winner is then drawn ticket-weighted **without replacement**, so no wallet appears twice and the head winner is excluded from the consolation tier.

Consolation stays ticket-weighted rather than flat across entrants. Flat selection would pay Sybil wallets the same as players and would cut the link between playing well and being paid, which is the premise of the game.

### 8.3 Dust and short windows

Two cases where `K` cannot be honored as derived:

**The share would be dust.** If `consolationPot / K` falls below the published minimum, reduce `K` until each share clears it. If the pot cannot cover even one minimum share, skip the consolation tier for that window.

**Not enough wallets.** If the window has fewer than `K + 1` wallets with at least one ticket, pay every eligible wallet and stop.

In both cases the undistributed remainder **stays in the pool** and becomes part of the next window's opening balance. There is no path where it goes anywhere else, which means these branches can only ever make the pool larger.

### 8.4 Effect on the pool arithmetic

None. The payout fraction is still 50% of the pool and only its distribution changed, so the fixed point in 2.1 is unchanged and the steady-state return is still 95% of entries.

The one asymmetry is 8.3: the dust and short-window branches return value to the pool and never take from it, so realized return can land slightly under the model in a window that trips them, with the difference carried forward rather than lost.

---

## 9. Out of scope for season one

- On-chain adjudication of a disputed run. Writing the engine a second time in Solidity is the largest audit surface in the product and buys down a bounded risk. Deferred and disclosed.
- Leaderboard payouts. Season one is a weighted lottery. Skill-weighted payout is the season two question, once retention data exists.
- Free-play tier. None planned.
- Pyth price feed ghost line. Chain 4663 is not in Pyth's deployment list. The chart line stays cosmetic and locally generated for season one.
