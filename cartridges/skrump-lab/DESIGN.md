# Skrump Lab — design notes

## What ships now

**Lab (Free Play)** = the interactive tutorial. The five FIGs from the SkrumpFilms weapons-test clip, in order:

1. Catapult (range)
2. Tank (armour / ceasefire gag)
3. Rapid Fire — Skrumpey trail with drop-off
4. DN Consensus Mechanism — everything-at-once blast
5. A Bigger Tank — heavy lead + drop-off trail, approach speed, no brakes

The Lab teaches every weapon, the locked scoring (displacement + shot economy), and the gags. It is **not** the long game.

## What comes next (not built yet)

### Levels = longer cabinet runs

Cabinet levels are the real runs: roughly Two Places length (a few minutes, several piles / stages), not five short FIGs. Leaderboards stay on Cabinets, one per lineup + sim version.

### Arsenal budget (the soft meta)

Before a level you get a **Skrumpey budget** — a number of Skrumpeys to spend. Each weapon in the registry has a cost in Skrumpeys. You pick an arsenal that fits the budget.

- Example costs (placeholders): Catapult 8 · Tank 12 · Rapid Fire trail 14 · DN Consensus 18 · Bigger Tank 22.
- A tight budget forces a mix; a fat budget still doesn't let you take everything.

### Soft counters (so "always take the biggest" loses)

Piles are authored to favor certain weapons. The budget decision is "which tools for *this* pile," not "biggest gun."

| Pile shape | Favors | Punishes |
|---|---|---|
| Tall towers / shelves | Catapult (heavy lob, range) | Flat sprays that clip the base |
| Dense low pyramids / galleries | DN Consensus blast | Single heavy shells that punch a hole and leave the rest |
| Strung-out low piles (conga) | Rapid Fire trail | One-shot weapons that can't chew the length |
| Big raised dais / finale pyramid | Bigger Tank (lead + trail) | Light sprays that bounce off the lead subjects |
| Mixed / multi-plinth armour | Tank (multi-shell, aim adjust) | Single-shell weapons with no second try |

Counters are soft: a mismatched weapon can still score, just worse. Scoring stays locked — the counter is the pile layout, not a formula change.

### Unlock gate

Not every weapon is available every level.

- Early levels unlock Catapult + Tank (what the Lab taught first).
- Mid levels unlock the trail and the blast after their Lab FIGs (or after clearing a prior level that featured them).
- Bigger Tank is the late unlock / finale tool.
- Exact gate table TBD when levels are authored; the rule is: **Lab teaches it → then a level can offer it in the arsenal shop.**

### Locked (do not reopen)

- Displacement scoring and shot economy (per-target / full-clear / unused-shell / overkill / wasted).
- Deterministic `replay(seed, actions)`.
- Weapon = the content/reskin slot; sim owns the rules.

## Out of scope for this note

Level authoring, the arsenal UI, economy numbers, and any onchain / MiniCoin wiring. Capture the intent here so the next build starts from agreement, not from scratch.
