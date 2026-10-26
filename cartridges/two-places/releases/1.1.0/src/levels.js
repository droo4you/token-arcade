// World 1 level definitions (World 2 lives in levels2.js). Each level is built with a tiny tile-coordinate builder so the
// geometry reads as intent ("a 5-tile wall here") instead of hand-counted ASCII.
//
// Reach facts (measured by tests/physics.mjs, in tiles):
//   single jump: 2.6 high, 3.4 across walking, 5.25 running
//   double jump: 4.6 high, 8.9 across running
//   RC glide:    16+ across
// So: 3+ tile ledges need the double jump, 5+ need a crate/block, 11+ tile gaps need RC.

function buildLevel(name, w, h, opts, fn) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const objs = [];
  const b = {
    w, h,
    fill(x0, y0, x1, y1, ch = '#') { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch; },
    clear(x0, y0, x1, y1) { this.fill(x0, y0, x1, y1, '.'); },
    set(x, y, ch) { g[y][x] = ch; },
    frame(floorY) {
      this.fill(0, 0, w - 1, 0); this.fill(0, 0, 0, h - 1); this.fill(w - 1, 0, w - 1, h - 1);
      this.fill(0, floorY, w - 1, h - 1);
    },
    spikes(x0, x1, y) { this.fill(x0, y, x1, y, '^'); },
    D(x, y) { g[y][x] = 'D'; }, R(x, y) { g[y][x] = 'R'; },
    exit(x, y) { g[y][x] = 'E'; }, apple(x, y) { g[y][x] = 'a'; },
    crate(x, y) { g[y][x] = 'c'; }, block(x, y) { g[y][x] = 'B'; },
    plate(x, y, ch, heavy) { objs.push({ t: 'plate', x, y, ch, heavy }); },
    button(x, y, ch, time) { objs.push({ t: 'button', x, y, ch, time }); },
    lever(x, y, ch, on) { objs.push({ t: 'lever', x, y, ch, on }); },
    crank(x, y, ch) { objs.push({ t: 'crank', x, y, ch }); },
    door(x, y, hh, ch, o = {}) { objs.push({ t: 'door', x, y, h: hh, ch, ...o }); },
    mover(x, y, o) { objs.push({ t: 'mover', x, y, ...o }); },
    zap(x, y, o) { objs.push({ t: 'zap', x, y, ...o }); },
    sign(x, y, text) { objs.push({ t: 'sign', x, y, text }); },
    fan(x, y, o) { objs.push({ t: 'fan', x, y, ...o }); },
    shadow(x, y, o = {}) { objs.push({ t: 'shadow', x, y, ...o }); },
    portal(x, y, o) { objs.push({ t: 'portal', x, y, ...o }); },
    juicebox(x, y, id) { objs.push({ t: 'juicebox', x, y, id }); },
    straw(x, y) { objs.push({ t: 'straw', x, y }); },
    puddle(x, y, amount) { objs.push({ t: 'puddle', x, y, amount }); },
  };
  fn(b);
  return { name, ...opts, grid: g.map(r => r.join('')), objs };
}

const LEVELS = [

  buildLevel('JUICE RUN', 48, 14, { rcRiding: true, blurb: 'Stretch those clogs.' }, b => {
    b.frame(12);
    b.D(2, 11);
    b.sign(5, 11, 'WALK WITH A/D OR ARROWS. HOLD SHIFT TO RUN.');
    b.sign(9, 11, 'SPACE TO JUMP.');
    b.fill(11, 10, 15, 11);                       // 2-tile step
    b.sign(14, 9, 'TOO TALL? PRESS JUMP AGAIN IN THE AIR TO DOUBLE JUMP.');
    b.fill(16, 7, 24, 11);                        // 3 more up: double jump
    b.apple(13, 7); b.apple(20, 3);
    b.sign(23, 6, 'SPIKES AHEAD. RUN, JUMP, DOUBLE JUMP.');
    b.spikes(28, 33, 12); b.fill(28, 13, 33, 13);
    b.apple(31, 8);
    b.sign(35, 11, 'LOW CEILING. HOLD S OR DOWN TO CROUCH.');
    b.fill(37, 1, 41, 9);                         // 2-tile crawlspace
    b.apple(39, 11);
    b.exit(44, 11);
  }),

  buildLevel('GOO BUDDY', 36, 14, { blurb: 'Meet RC. He is mostly goo.' }, b => {
    b.frame(12);
    b.D(2, 11); b.R(5, 11);
    b.sign(7, 11, "THAT'S RC! PRESS Q OR TAB TO SWAP BETWEEN YOU TWO.");
    b.sign(10, 11, 'RC FLIES WITH WASD. GOO SLIPS THROUGH GRATES.');
    b.fill(12, 1, 12, 8); b.set(12, 4, '%'); b.set(12, 5, '%');
    b.door(12, 9, 3, 'A');
    b.button(15, 9, 'A');
    b.sign(14, 11, 'PRESS E TO PUSH BUTTONS.');
    b.fill(19, 1, 23, 5); b.clear(20, 2, 22, 4); b.set(21, 5, '%');   // goo-only pocket
    b.apple(21, 3);
    b.fill(26, 8, 27, 11); b.apple(27, 6);
    b.sign(21, 11, 'AS DROOBER, PRESS F TO CALL RC. UP CLOSE HE HOPS ON YOUR HEAD.');
    b.sign(30, 11, 'BOTH OF YOU HAVE TO REACH THE EXIT.');
    b.apple(5, 3);
    b.exit(32, 11);
  }),

  buildLevel('HOLD THE DOOR', 40, 14, { blurb: 'Plates only work while something sits on them.' }, b => {
    b.frame(12);
    b.D(2, 11); b.R(4, 11);
    b.plate(7, 11, 'A');
    b.sign(9, 11, 'AS RC, HOLD S TO SETTLE ON THE PLATE. IT HOLDS THE DOOR.');
    b.fill(12, 1, 12, 8); b.door(12, 9, 3, 'A');
    b.plate(15, 11, 'A');
    b.sign(17, 11, 'STAND HERE SO RC CAN COME THROUGH.');
    b.fill(19, 5, 23, 5); b.plate(21, 4, 'B');          // shelf only RC can reach
    b.sign(24, 11, 'ONE MORE DOOR. RC KNOWS A SHORTCUT.');
    b.fill(26, 1, 26, 8); b.set(26, 2, '%'); b.door(26, 9, 3, 'B');
    b.fill(30, 9, 32, 9, '='); b.apple(31, 7);
    b.apple(8, 4); b.apple(22, 2);
    b.exit(35, 11);
  }),

  buildLevel('HEAVY LIFTING', 42, 14, { blurb: 'Crates: lift, chuck, stack.' }, b => {
    b.frame(12);
    b.D(2, 11); b.R(3, 9);
    b.crate(6, 11);
    b.sign(8, 11, 'E PICKS UP A CRATE. E AGAIN THROWS IT. HOLD S + E TO SET IT DOWN.');
    b.plate(13, 11, 'A', true);
    b.sign(11, 11, 'BIG PLATES NEED REAL WEIGHT. RC IS TOO LIGHT.');
    b.fill(16, 1, 16, 8); b.door(16, 9, 3, 'A');
    b.crate(19, 11);
    b.sign(21, 11, 'CARRYING? ONLY ONE JUMP. SET IT DOWN AND CLIMB ON IT.');
    b.fill(26, 7, 27, 11);                         // 5 tiles: needs the crate
    b.apple(9, 5); b.apple(21, 4); b.apple(39, 8);
    b.exit(37, 11);
  }),

  buildLevel('GOO GLIDER', 56, 14, { blurb: 'RC makes a fine umbrella.' }, b => {
    b.frame(12);
    b.D(2, 11); b.R(6, 11);
    b.sign(4, 11, 'PRESS F NEAR RC TO PUT HIM ON YOUR HEAD.');
    b.sign(9, 11, 'WITH RC ABOARD: DOUBLE JUMP, THEN HOLD JUMP TO GLIDE.');
    b.spikes(13, 24, 12); b.fill(13, 13, 24, 13);
    b.apple(18, 6);
    b.apple(30, 8);
    b.spikes(35, 47, 12); b.fill(35, 13, 47, 13);
    b.apple(41, 6);
    b.exit(51, 11);
  }),

  buildLevel('STAND-IN', 50, 14, { blurb: 'You need RC in two places. Find a stand-in.' }, b => {
    b.frame(12);
    b.fill(1, 2, 6, 6); b.clear(2, 3, 5, 5); b.set(6, 4, '%');      // goo-only button pocket
    b.button(3, 4, 'B'); b.apple(4, 3);
    b.fill(1, 7, 7, 7); b.door(7, 8, 4, 'B'); b.crate(4, 11);       // crate closet (tall enough to lift in)
    b.D(10, 11); b.R(12, 11);
    b.plate(14, 11, 'A');
    b.sign(9, 11, 'THE FAR DOOR NEEDS WEIGHT ON THIS PLATE. BUT THE GAP NEEDS RC...');
    b.spikes(17, 28, 12); b.fill(17, 13, 28, 13);
    b.apple(22, 5);
    b.fill(34, 1, 34, 8); b.door(34, 9, 3, 'A');
    b.apple(41, 4);
    b.exit(44, 11);
  }),

  buildLevel('BLOCK PARTY', 48, 14, { blurb: 'Only Droober can shove the heavy stuff.' }, b => {
    b.frame(12);
    b.D(2, 11); b.R(2, 8);
    b.block(5, 11);
    b.sign(9, 11, 'WALK INTO HEAVY BLOCKS TO SHOVE THEM. RC CAN ONLY WATCH.');
    b.plate(15, 11, 'A', true); b.fill(16, 11, 16, 11);             // bump stops the block on the plate
    b.fill(18, 1, 18, 8); b.door(18, 9, 3, 'A');
    b.block(22, 11);
    b.sign(25, 11, 'THAT LEDGE IS SIX TILES UP. STAND ON A BLOCK.');
    b.fill(30, 6, 46, 11);
    b.lever(20, 1, 'C');
    b.sign(31, 5, 'THAT LEVER UP THERE IS A JOB FOR GOO.');
    b.fill(36, 1, 36, 2); b.door(36, 3, 3, 'C');
    b.apple(11, 5); b.apple(26, 6); b.apple(44, 3);
    b.exit(42, 5);
  }),

  buildLevel('CRANK SHAFT', 52, 18, { blurb: 'Cranks need muscle, not goo.' }, b => {
    b.frame(16);
    b.D(2, 15); b.R(4, 15);
    b.crank(7, 15, 'k1');
    b.sign(9, 15, 'HOLD E AT A CRANK TO TURN IT. RC IS TOO SQUISHY TO CRANK.');
    b.mover(12, 15, { w: 3, dy: -3, crank: 'k1', speed: 0.7 });       // lift: rises 3 tiles
    b.fill(15, 8, 22, 15);                                           // upper ledge, 8 tiles up
    b.apple(9, 9);
    b.plate(18, 7, 'Z');
    b.sign(16, 7, 'THE ZAP STOPS WHILE THIS PLATE IS HELD.');
    b.crank(21, 7, 'k2');
    b.mover(23, 8, { w: 3, dx: 11, crank: 'k2', speed: 0.7 });        // bridge over the pit
    b.spikes(23, 36, 16);
    b.apple(29, 4);
    b.fill(37, 8, 50, 15);
    b.clear(37, 10, 41, 10); b.clear(41, 8, 41, 9); b.set(37, 10, '%'); b.set(41, 8, '%');   // goo tunnel
    b.zap(39, 1, { dir: 'v', len: 7, ch: 'Z' });
    b.apple(45, 3);
    b.exit(47, 7);
  }),

  buildLevel('TICK TOCK', 56, 14, { blurb: 'Timed buttons do not wait for clogs.' }, b => {
    b.frame(12);
    b.D(2, 11); b.R(4, 9);
    b.button(4, 3, 'T', 600);
    b.sign(6, 11, 'RC HITS THE TIMER, HOPS ON (F), THEN DROOBER HUSTLES.');
    b.spikes(13, 17, 12); b.fill(13, 13, 17, 13);
    b.apple(15, 7);
    b.zap(25, 9, { dir: 'v', len: 3, blink: 100 });
    b.sign(22, 11, 'THAT ZAP BLINKS. WAIT FOR IT.');
    b.fill(30, 1, 32, 9);
    b.fill(40, 1, 40, 8); b.door(40, 9, 3, 'T');
    b.apple(36, 9); b.apple(46, 4);
    b.exit(51, 11);
  }),

  buildLevel('TWO PLACES AT ONCE', 64, 18, { blurb: 'Everything you know, all at once.' }, b => {
    b.frame(16);
    b.D(2, 15); b.R(3, 12);
    b.block(4, 15); b.plate(9, 15, 'A', true); b.fill(11, 15, 11, 15);   // bump parks the block on the big plate
    b.crate(13, 15); b.plate(15, 15, 'A');
    b.sign(7, 12, 'THIS DOOR WANTS BOTH PLATES HELD. RC HAS SOMEWHERE BETTER TO BE.');
    b.fill(18, 1, 18, 12); b.door(18, 13, 3, 'A', { need: 2 });
    b.spikes(22, 33, 16);
    b.apple(27, 9);
    b.plate(37, 15, 'C');
    b.sign(35, 15, 'RC ON THE PLATE RUNS THE LIFT. RIDE IT UP.');
    b.mover(41, 15, { w: 2, dy: -7, ch: 'C', loop: true, speed: 0.9 });
    b.fill(43, 8, 62, 15);
    b.zap(50, 4, { dir: 'v', len: 4, blink: 110 });
    b.apple(55, 3); b.apple(10, 9);
    b.exit(59, 7);
  }),
];
