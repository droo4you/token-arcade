# Buy Bounce, House Rules

Read this before you play. It is the whole game in plain English.

---

## What it costs

**One attempt costs $1.00 USDG.** That is the total. There is no separate fee line.

You get **three attempts** per wallet per window. You need a minimum $BUY balance in your wallet to enter; the amount is published before the window opens.

## Where your dollar goes

**95 cents of every dollar goes into the prize pool. The other 5 cents is our fee.**

That fee is the edge and it is the only one. There is no rake on a win, no fee on a claim, and no charge to play a run you already paid for.

The pool is not emptied each window. It carries. **Each window pays out half of whatever the pool holds, and the other half stays in for next time.** Nobody takes that half out. It is still prize money and it is still on the table.

Half the pool sounds like half your dollar. It is not, and here is the arithmetic. Because the pool keeps what it does not pay, it settles at a size where the prize each window is worth about 95% of what players put in that window. Pay out half of a pool that keeps refilling itself and you are paying out nearly everything, just spread over time instead of all at once.

**Where that leaves you: about 95 cents of every dollar entered comes back to players, and 5 cents does not.** Playing Buy Bounce is still not a way to make money, for the reason in the next section.

## How you win

A run gives you two things to chase and you cannot fully have both.

**Market cap** is the score. It is the leaderboard number and it pays nothing.

**Tickets** are your weight in the draw. **Exactly 10 exist per run.** They appear one at a time as the run goes on, they sit low near the support line where the money pickups do not, and the last few show up once the button has already started closing. Diving for one costs you the height that market cap is made of. Miss one and it is gone.

Ten per run, three attempts, so **30 tickets per window is the ceiling**. Tickets carry across all three of your attempts.

**The run gets harder the whole way and it does not stop.** The button narrows for as long as you survive. Every run ends.

When the window closes, the pool pays out half of what it holds, in two tiers.

**One head winner takes 60% of that payout.** Then **40% is split equally among a group of runners-up**, sized at one for every twenty wallets that entered, and never fewer than five.

**Tickets are your weight in both draws.** More tickets means better odds, and it never means a guaranteed win. A wallet with one ticket can win. A wallet with three hundred can lose. Nobody is drawn twice, so the head winner is out of the runner-up draw.

Everything not paid out stays in the pool for the next window.

**Read this part before your third attempt.** Roughly one wallet in twenty gets paid anything. Nineteen in twenty get nothing at all, and that is the normal outcome, not bad luck. The runner-up tier exists so that being paid is something that happens to people you know rather than to nobody you have ever met. It does not make this a good bet. The 95% in the section above is what comes back to players as a group over time, and it is not what you should expect to get back.

## Two things that will cost you if you don't know them

**Your attempt is spent the moment the run starts.** Not when you die, not when you submit. If you dislike your first three seconds, that attempt is gone. This exists so nobody can reroll for a good layout.

**If you disconnect, that is a death.** Your run banks whatever tickets you had at your last checkpoint. Play on a connection you trust.

## What you win

The pool is held in a tokenized stock, named before the window opens. **You win the stock, not dollars.**

The pool holds that stock the whole time, across windows, and your entry is converted into it when the window closes. So the pool you are joining was partly bought at earlier windows' prices. If the stock ran up since then, the pool is worth more than what went into it. If it fell, it is worth less. That works both ways and neither way is us.

The pool owes the same thing it holds, so a price move can never leave it short. What it does mean is that the dollar value of the prize moves with the stock, including while you are waiting to claim. Robinhood's stock tokens trade Sunday 8 PM ET through Friday 8 PM ET and are closed on weekends, so a cash-out to USDG over a weekend waits for the market to reopen and executes at the reopen price.

## How you know it's straight

**Your level was decided before you played, and you can check it.** Before the window opens we publish a commitment to a server secret and name a future round of drand, a public randomness beacon run by independent organizations. That round does not exist yet at the moment we commit, so we cannot pick a secret that produces a layout we like. Your run seed comes from the beacon signature, our secret, and your own wallet address together.

When the window closes we publish the secret. Anyone can re-derive every run seed in the window.

**Your ticket count is reproducible.** The game engine is deterministic: the same seed and the same inputs always produce the same result. We publish the engine build, your seed, and your input log. Anyone can replay your run and confirm your ticket count.

**There is a 24-hour dispute window.** After the window closes, the ticket totals are provisional for a day. If you think your count is wrong, challenge it, and we publish the replay. A proven mismatch invalidates the results and we republish.

**The draw is a public beacon.** The round is named before the window opens. Once it publishes, the signature is verified on chain. Nobody, including us, can influence it or run it again.

Provably fair here means the randomness is tamper-proof and the results are self-verifiable. **It does not mean the game is even-money.** It is not. See the section on where your dollar goes.

## Claiming

Winnings are credited, not pushed. After the dispute window we publish a merkle root and you claim whenever you like. **Unclaimed winnings never expire.**

## What we cannot do

- Take anything out of the prize pool for any reason other than paying a winner. There is no withdrawal, no sweep, and no rescue, and the contract has no function that would let us add one
- Change the 95/5 split or the payout fraction at all, ever. Both are fixed when the contract is deployed and the contract refuses to launch if they are outside the published range
- Change the ticket cap or the attempt count during a window
- Choose or influence the draw
- Stop you claiming; the halt switch stops new entries only
- Change your ticket count without it failing a public replay

## Risks

- **You will probably not win.** About one wallet in twenty is paid anything in a window. The other nineteen get nothing. This is the risk that matters and no amount of pool arithmetic or runner-up tiering softens it.
- **5 cents of every dollar leaves the pool** as our fee and is not recoverable by any player.
- **95% is an aggregate, not a promise to you.** It describes what the pool returns to players as a group over time. Your own expected return is far lower, because one wallet takes the prize.
- **The prize is a stock token** and its dollar value moves, including between the draw and your claim, and including before you ever entered.
- **Cashing out waits for market hours** on weekends and holidays.
- **This is a new contract** on a new chain, alongside the drand and swap infrastructure it composes with.
- **This is a game.** It is not an investment, not a security, and not a claim on the $BUY team or anything they hold.

18+. Not investment advice.
