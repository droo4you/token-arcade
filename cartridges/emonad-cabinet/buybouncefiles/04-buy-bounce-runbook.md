# Buy Bounce, Event Runbook

For the operator. One page per event. Print it, work it top to bottom.

---

## T-7 days

- [ ] Confirm prize asset is tokenized and liquid on Robinhood Chain, on the official explorer at `robinhoodchain.blockscout.com`. HOOD preferred, SPY fallback
- [ ] Read the current pool balance and compare it to `0.95 x expected entries`. If the pool is well above that, the return this window is above 95% and the holding gate needs raising before open (spec §7)
- [ ] Set the $BUY holding gate level and publish it
- [ ] Confirm window close is scheduled inside market hours, Sunday 8 PM ET to Friday 8 PM ET, so the close-of-window conversion can execute
- [ ] Contracts deployed and addresses published on one canonical page and nowhere else
- [ ] Engine build hash published
- [ ] Rules page live
- [ ] Testnet dry run complete, including a full close, draw, and claim

## T-24 hours

- [ ] Generate the server secret, publish `keccak256(secret)` on chain
- [ ] Name the drand round for the draw, publish it on chain
- [ ] Verify the named round has not published
- [ ] Announce window open time in ET, with the market-hours note

## Season zero, once only

The pool is seeded one time, at the start of the season, and never topped up again. It carries itself from there.

- [ ] Size the seed at `0.95 x expected entries per window`, not at a round number. A seed below that pays under 95% until it converges, roughly halving the gap each window (spec §2.1)
- [ ] Buy the prize asset with the seed amount, during market hours
- [ ] Confirm the seed landed in the pool and that the deposit is one-way
- [ ] Confirm on chain that no function moves value out of the pool except a winning claim and `declareFinal()`

## T-1 hour

- [ ] Confirm pool balance on chain matches the published carry-over from last window's settlement
- [ ] Confirm the published payout fraction for this window is 50%, or 100% if this window was declared final before it opened
- [ ] Confirm halt switch works and only stops entries

## Window open

Monitor continuously:

| Metric | Watch for | Action |
| --- | --- | --- |
| Entries per hour | Sudden spike from few wallets | Check gate is enforcing |
| Unique wallets vs entries | Ratio near 3:1 is healthy | Ratio near 1:1 suggests Sybil |
| Ticket distribution | A wallet at the cap on every run | Pull that run's replay |
| Failed submissions | Any sustained rate above noise | Client or verifier problem, consider halt |
| Replay mismatches | **Any** | Halt entries immediately |
| Pool balance | Should only grow | Any decrease is a live incident |
| Gas sponsorship | Rate-limit hits | Adjust limits, do not disable |

## Window close

- [ ] Halt entries
- [ ] Execute the window's single USDG to prize-asset conversion. One swap, during market hours
- [ ] Confirm the converted amount equals 95% of this window's entries and that the 5% fee went to the ops address and nowhere near the pool
- [ ] Freeze ticket totals, publish provisional totals
- [ ] **Publish the server secret**
- [ ] Confirm anyone can re-derive run seeds from the published data
- [ ] Open the 24-hour dispute window publicly

## Dispute window, 24 hours

- [ ] Respond to every challenge with seed, input log, and replayed count
- [ ] Log every challenge and its resolution publicly
- [ ] If any challenge proves a mismatch: do not draw. Fix, republish totals, restart the 24 hours

## Draw

- [ ] Relay the drand round signature, verify on chain
- [ ] Confirm the round published after the commitment
- [ ] Confirm `K` as derived on chain from unique wallets, and whether the dust or short-window branch reduced it
- [ ] Execute the weighted draw: head winner first, then `K` runners-up without replacement
- [ ] Confirm no wallet appears twice in the winner set
- [ ] Confirm head plus consolation credits equal the window's payout, and that any undistributed remainder went back to the pool
- [ ] Publish the round number, the signature, and the full derivation for every winner in both tiers, so each seat can be re-derived independently

## Claim

- [ ] Publish the merkle root, one leaf per winner across both tiers
- [ ] Confirm a head winner and a consolation winner can each claim without operator involvement
- [ ] Announce that unclaimed balances never expire

## Post-event, within 48 hours

- [ ] Publish the event report: entries, unique wallets, pool at draw, head prize, `K`, consolation share, total paid, carry into next window, fee collected
- [ ] Publish the realized return for the window as `total paid / entries`, and say how far it sits from 95% and why
- [ ] Publish the share of wallets paid. If it lands far off one in twenty, say which branch of §8.3 fired
- [ ] Retention read: how many wallets used all three attempts, how many returned from the prior window

---

## Failure procedures

**Replay mismatch found.**
Halt entries. Do not draw. Publish what happened, in full, the same day. Fix the build, republish totals, restart the dispute window. A silent correction is worse than the bug.

**drand round never publishes.**
Do not substitute another source of randomness. Announce the delay, name a replacement round, and restart the beacon commitment publicly. The season's credibility rests on the beacon being the only draw input.

**Server secret leaks before close.**
The window is compromised. Refund every entry, void the window, restart with a fresh commitment. A leaked secret means players could have read layouts ahead.

**Prize asset delists or halts.**
Winners still hold the token; that is between them and the issuer. Announce it, and do not attempt to convert on anyone's behalf.

**Client goes down mid-window.**
Extend the window by the outage length and announce the new close time before it arrives. Do not extend after the fact.

**Pool balance decreases unexpectedly.**
Halt everything. This is the one incident where you stop before you understand it.

---

## The two numbers that decide season two

1. **Return rate.** Percentage of wallets from window N that enter window N+1.
2. **Attempt completion.** Percentage of entering wallets that use all three attempts.

Everything else is vanity. If return rate is flat, the prize is not the problem and the game is. If completion is low, the run is too hard or too long.
