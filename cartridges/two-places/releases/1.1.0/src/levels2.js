// World 2: Shroomwood. Goo (regular dries in 10s, thick from puddles never dries),
// fans, shadow figures + smoke, straws -> juice boxes -> portals.

const LEVELS_W2 = [

  buildLevel('GOO GROTTO', 36, 16, { world: 2, blurb: 'Welcome to Shroomwood. RC brought goo.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.sign(6, 13, 'AS RC, HOLD C WHILE TOUCHING A WALL TO SMEAR GOO ON IT.');
    b.sign(10, 13, 'DROOBER: PRESS INTO GOO TO GRAB IT, HOLD W TO CLIMB. GOO DRIES IN 10 SECONDS!');
    b.fill(14, 7, 34, 13);                        // 7-tile cliff: no jump reaches it
    b.apple(8, 6); b.apple(17, 4); b.apple(26, 3);
    b.exit(30, 6);
  }),

  buildLevel('HANG IN THERE', 40, 16, { world: 2, blurb: 'Goo works upside down too.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.sign(3, 13, 'NO WAY ACROSS? GOO THE CEILING.');
    b.sign(6, 13, 'JUMP INTO A GOOEY CEILING TO HANG. A/D TO SHIMMY, S TO LET GO.');
    b.fill(9, 1, 30, 9);                          // low ceiling over the brambles
    b.spikes(9, 30, 14);
    b.apple(20, 11); b.apple(4, 4); b.apple(36, 6);
    b.exit(35, 13);
  }),

  buildLevel('BREEZY', 40, 16, { world: 2, blurb: 'Fans push light things. RC is very light.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.plate(6, 13, 'F');
    b.sign(8, 13, 'THAT FAN BLOWS RC AWAY FROM THE BUTTON. STAND ON THE PLATE TO SHUT IT OFF.');
    b.fan(10, 14, { dir: 'u', len: 11 });         // updraft: a goo elevator
    b.sign(11, 13, 'RIDE THE UPDRAFT, RC.');
    b.fill(17, 1, 17, 10); b.door(17, 11, 3, 'A');
    b.fan(17, 2, { dir: 'l', len: 9, w: 2, ch: 'F', inv: true });
    b.button(12, 2, 'A');
    b.apple(10, 4); b.apple(14, 1); b.apple(30, 8);
    b.fill(26, 10, 28, 13);
    b.exit(34, 13);
  }),

  buildLevel('BLOW BY BLOW', 44, 20, { world: 2, blurb: 'Hit the timer, thread the maze, ride home.' }, b => {
    b.frame(18);
    b.D(2, 17); b.R(4, 17);
    b.fill(1, 14, 19, 14); b.clear(2, 14, 3, 14);       // slab over the corridor, hole at cols 2-3
    b.fill(20, 1, 20, 14); b.door(20, 15, 3, 'T');
    // zig-zag maze: three-row bands, crosswinds blow RC down toward zaps (hold UP while crossing)
    b.fill(1, 10, 15, 10);                              // gap at 16-19
    b.fill(4, 6, 19, 6);                                // gap at 1-3
    b.fill(1, 2, 15, 2);                                // gap at 16-19
    b.button(3, 1, 'T', 1200);
    b.fan(8, 10, { dir: 'd', len: 3 }); b.zap(8, 13, { dir: 'h', len: 1 });
    b.fan(12, 6, { dir: 'd', len: 3 }); b.zap(12, 9, { dir: 'h', len: 1 });
    b.zap(9, 3, { dir: 'v', len: 3, blink: 90 });
    b.sign(5, 17, 'RC: UP THROUGH THE HOLE, HIT THE TIMER, COME BACK, HOP ON (F), GO! HOLD UP IN THE WIND.');
    b.apple(18, 1); b.apple(10, 16); b.apple(30, 14);
    b.exit(39, 17);
  }),

  buildLevel('SHADOW WOODS', 50, 16, { world: 2, blurb: 'Something fuzzy lives here.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.sign(5, 13, 'SHADOWS ONLY SEE DROOBER, ONLY IN FRONT. SNEAK BEHIND THEM.');
    b.shadow(14, 13, { x0: 13, x1: 24, facing: -1, range: 6 });
    b.sign(27, 13, 'THIS ONE STANDS GUARD. PRESS C TO PUFF SMOKE, THEN SLIP PAST.');
    b.shadow(35, 13, { facing: -1, range: 7, turn: 300 });
    b.fill(40, 1, 40, 10); b.door(40, 11, 3, 'L');
    b.lever(33, 5, 'L');
    b.fill(31, 6, 35, 6);
    b.apple(19, 9); b.apple(33, 3); b.apple(46, 8);
    b.exit(45, 13);
  }),

  buildLevel('JUICED UP', 40, 16, { world: 2, blurb: 'Straw + juice box = portal power.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.fill(6, 10, 9, 13); b.straw(7, 9);
    b.sign(11, 13, 'JUICE BOXES POWER PORTALS. GRAB A STRAW, PRESS E AT THE BOX.');
    b.juicebox(14, 13, 'J');
    b.portal(16, 13, { pair: 'p', box: 'J' });
    b.fill(20, 1, 21, 13);                               // sealed vault wall
    b.portal(24, 13, { pair: 'p' });
    b.fill(28, 11, 30, 13);
    b.apple(7, 6); b.apple(12, 3); b.apple(29, 8);
    b.exit(34, 13);
  }),

  buildLevel('THICK AND THIN', 54, 16, { world: 2, blurb: 'Some goo never dries.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.puddle(6, 13, 8);
    b.sign(5, 13, 'RC: SOAK UP A GOO PUDDLE AND YOUR GOO GOES THICK. IT NEVER DRIES. SPEND IT WISELY.');
    b.juicebox(8, 13, 'J'); b.portal(10, 13, { pair: 'p', box: 'J' });
    b.fill(11, 1, 34, 9); b.spikes(11, 34, 14);           // 24 tiles: too long a round trip for regular goo alone
    b.fill(41, 1, 41, 13);
    b.straw(38, 13);
    b.sign(36, 13, "GOT THE STRAW? NOW GET BACK ACROSS. HOW'S THAT GOO HOLDING UP?");
    b.portal(46, 13, { pair: 'p' });
    b.apple(22, 11); b.apple(37, 10); b.apple(4, 3);
    b.exit(49, 13);
  }),

  buildLevel('OVER THEIR HEADS', 52, 16, { world: 2, blurb: 'Shadows never look up.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.sign(5, 13, 'HANGING FROM THE CEILING, DROOBER IS ABOVE THEIR VIEW. DOUBLE JUMP TO REACH IT.');
    b.fill(8, 1, 40, 7);
    b.shadow(12, 13, { x0: 12, x1: 22, facing: 1, range: 6 });
    b.shadow(38, 13, { x0: 26, x1: 38, facing: -1, range: 6 });
    b.apple(25, 9); b.apple(6, 4); b.apple(49, 8);
    b.exit(47, 13);
  }),

  buildLevel('PORTAL PUMP', 44, 16, { world: 2, blurb: 'Crates travel too.' }, b => {
    b.frame(14);
    b.D(2, 13); b.R(4, 13);
    b.crate(7, 13);
    b.portal(12, 13, { pair: 'c', ch: 'P' });
    b.fan(18, 14, { dir: 'u', len: 11 });
    b.button(18, 1, 'P');
    b.sign(9, 13, 'RC: RIDE THE FAN UP AND WAKE THE PORTAL. DROOBER: TOSS THE CRATE IN.');
    b.fill(24, 1, 37, 4); b.fill(24, 9, 37, 9); b.fill(24, 5, 24, 8);   // upper room
    b.clear(35, 9, 36, 9);                                              // drop hole: the portal is a shortcut, not a trap
    b.portal(29, 5, { pair: 'c', face: 'down' });
    b.plate(30, 8, 'H', true);
    b.fill(38, 1, 38, 10); b.door(38, 11, 3, 'H');
    b.apple(18, 6); b.apple(33, 7); b.apple(3, 5);
    b.exit(40, 13);
  }),

  buildLevel('SHROOM BOOM', 64, 18, { world: 2, blurb: 'Everything Shroomwood taught you.' }, b => {
    b.frame(16);
    b.D(2, 15); b.R(4, 15);
    b.puddle(6, 15, 5);
    b.fan(9, 16, { dir: 'u', len: 14 });
    b.button(9, 1, 'T', 900);
    b.sign(5, 15, 'GOO THE CLIFF, RIDE THE FAN TO THE TIMER, THEN HUSTLE UP AND THROUGH.');
    b.fill(12, 9, 50, 15);
    b.fill(18, 1, 18, 5); b.door(18, 6, 3, 'T');
    b.shadow(24, 8, { x0: 22, x1: 32, facing: -1, range: 6 });
    b.straw(36, 8);
    b.juicebox(40, 8, 'J'); b.portal(43, 8, { pair: 'p', box: 'J' });
    b.fill(51, 1, 51, 15);
    b.portal(55, 15, { pair: 'p' });
    b.apple(9, 7); b.apple(27, 4); b.apple(60, 10);
    b.exit(58, 15);
  }),
];
LEVELS.push(...LEVELS_W2);
