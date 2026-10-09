# Arcade visual direction

Token Arcade feels like an internet arcade desk: a paper ticket, printed game stickers, chunky tactile buttons, and an inviting game screen. The hero is the playable area and game selection, not finance information.

## Tokens

- Ink `#24213B`: readable type and structural edges.
- Ticket `#FFF8E8`: main surface, like printed arcade stock.
- Marigold `#FFD45A`: primary play action.
- Coral `#F47660`: energetic accent and active states.
- Pool `#86D9D2`: secondary panels and calm states.
- Plum `#685494`: depth and game stage.

Use a playful, sturdy display face for the mark and game titles, and a highly legible sans face for navigation/body. A single oversized arcade ticket in the first viewport carries the brand. Subsequent sections use varied panel sizes so game art has room to breathe; avoid a grid of identical cards.

Desktop sketch:

```
brand / nav                                      passport
┌──────────────────────── hero ticket ───────────────────────┐
│ The internet is fun.          featured game / stage       │
│ browse games / play now       button                      │
└─────────────────────────────────────────────────────────────┘
  game shelf (varied cards)        live community raid
```

On mobile, stack the ticket's invitation above the featured stage; keep the Play control visible without a login prompt. Transitions respond to a click or state change. Reduced-motion preferences remove decorative movement. Every focusable element has a visible focus state. Financial details stay in an expandable area of a raid, game, or admin view.
