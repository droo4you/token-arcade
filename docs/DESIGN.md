# Arcade visual direction

Token Arcade feels like an internet arcade desk: a paper ticket, printed game stickers, chunky tactile buttons, and an inviting game screen. The hero is the playable area and game selection, not finance information. Its palette follows Droober's character design board and the exact character swatches in the separate `droober-builder/src/config.js` project.

## Tokens

- Ink `#1A0E20`: Droober's facial and outline color, used for text and structural edges.
- Ticket `#FFF7ED`: warm cream canvas, drawn from the design board's paper backdrop.
- Cyan `#00D1D8`: Droober's hair; the hero and key interactive accents.
- Pink `#FF74DD`: Droober's skin; headline emphasis, raid surfaces, and one game card.
- Lime `#AECF3E`: Droober's shirt; play buttons, badges, and the warmup panel.
- Orange `#E8845A`: Droober's shorts; small play controls and cabinet details.
- Violet `#A63FB0`: Droober's shoes; a game card. Deep violet `#4A1D55` supports readable white text on the cabinet, passport, and closing band.

The character swatches are documented source colors. The choice of where to use them in this interface is an arcade design decision. Yellow from Droober's juice box is reserved for small details instead of large UI surfaces.

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
