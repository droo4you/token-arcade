// Bot routes for World 2 (Shroomwood). Imported by solve.mjs.
const X = tx => tx * 16 + 8;
const Y = ty => ty * 16 + 8;

// RC: press against a wall/ceiling and paint along it
function paint(b, keys, cond, label) { b.active('rc'); b.hold([...keys, 'ability'], cond, 900, label); }
// Droober: jump (double if asked) into a gooey ceiling and stick
function jumpToHang(b, dir, double) {
  b.active('droober');
  const base = dir ? [dir > 0 ? 'right' : 'left'] : [];
  for (let i = 0; i < 16 && !b.D().hang; i++) b.step([...base, 'jump']);
  if (double && !b.D().hang) { b.step(base); b.step(base); }
  b.hold([...base, 'jump'], () => b.D().hang, 60, 'stick to ceiling');
}
function mountRC(b) {
  b.active('droober');
  if (b.RC().mode !== 'ride') b.tap('call');
  b.until(() => b.RC().mode === 'ride', [], 900, 'RC rides');
}

export const SOLUTIONS_W2 = [
  // 11 GOO GROTTO
  b => {
    b.flyTo(X(12), Y(13));
    b.active('rc'); b.hold(['right'], () => b.RC().x + b.RC().w >= 14 * 16, 120, 'touch cliff');
    paint(b, ['up', 'right'], () => b.RC().y < 7 * 16 - 4, 'paint cliff');
    b.walkTo(X(12));
    b.hold(['right', 'up'], () => b.D().y + b.D().h <= 7 * 16 && b.world.grounded(b.D()), 400, 'climb');
    mountRC(b);
    b.walkTo(31 * 16);
    b.finish();
  },
  // 12 HANG IN THERE
  b => {
    b.flyTo(X(8), Y(10));
    paint(b, ['up', 'right'], () => b.RC().x > 31 * 16, 'paint ceiling');
    b.walkTo(X(8));
    jumpToHang(b, 1, false);
    b.hold(['right'], () => !b.D().hang && b.world.grounded(b.D()), 600, 'shimmy across');
    mountRC(b);
    b.walkTo(36 * 16);
    b.finish();
  },
  // 13 BREEZY
  b => {
    b.walkTo(X(6));
    if (!b.world.plates[0].on) throw new Error('fan plate not held');
    b.flyTo(X(9), Y(12));
    b.flyTo(X(10), Y(12));
    b.active('rc'); b.hold(['up'], () => b.RC().y < 40, 200, 'updraft');
    b.flyTo(X(12), Y(2));
    b.act();
    b.flyTo(X(14), Y(12));
    b.flyTo(X(20), Y(12));
    b.walkTo(X(21));
    mountRC(b);
    b.walkTo(X(24));
    b.leap(1, { double: true });
    b.walkTo(35 * 16);
    b.finish();
  },
  // 14 BLOW BY BLOW
  b => {
    const zap = b.world.zaps.find(z => z.blink);
    const waitZapOff = () => { b.until(() => zap.on, [], 200, 'zap on'); b.until(() => !zap.on, [], 200, 'zap off'); };
    const A = 180, B = 117, Cc = 53, Dd = 22;
    b.flyTo(48, Y(16));
    b.flyTo(48, A);
    b.flyTo(X(17), A);
    b.flyTo(X(17), B);
    b.flyTo(X(2), B);
    b.flyTo(X(2), Cc);
    b.flyTo(X(7), Cc);
    waitZapOff(); b.flyTo(X(17), Cc);
    b.flyTo(X(17), Dd);
    b.flyTo(X(3), Dd);
    b.act();
    const t0 = b.frames;
    b.flyTo(X(17), Dd);
    b.flyTo(X(17), Cc);
    b.flyTo(X(11), Cc);
    waitZapOff(); b.flyTo(X(2), Cc);
    b.flyTo(X(2), B);
    b.flyTo(X(17), B);
    b.flyTo(X(17), A);
    b.flyTo(48, A);
    b.flyTo(48, Y(16));
    b.tap('call');
    if (b.RC().mode !== 'ride') throw new Error('RC not aboard');
    b.hold(['right', 'run'], () => b.D().x > 21 * 16, 400, 'through the timed door');
    console.log('    timer margin', b.world.buttons[0].time - (b.frames - t0), 'frames');
    b.walkTo(40 * 16);
    b.finish();
  },
  // 15 SHADOW WOODS
  b => {
    const [s1, guard] = b.world.shadows;
    b.flyTo(X(4), Y(3));
    b.flyTo(X(33), Y(3));
    b.flyTo(X(33), Y(5));
    b.act();
    b.active('droober');
    b.until(() => s1.facing === 1 && s1.alert === 0 && s1.x > X(14) && s1.x < X(18), [], 1200, 's1 walking away');
    b.hold(['right'], () => b.D().x + b.D().w >= s1.x - 22, 400, 'creep behind s1');
    b.leap(1, { run: true });
    b.tap('ability');                     // smoke screen in front of s1
    b.walkTo(X(26), true);
    b.until(() => b.D().smokeCD === 0 && guard.facing === 1, [], 900, 'smoke ready + guard turned away');
    b.hold(['right', 'run'], () => b.D().x + b.D().w >= guard.x - 26, 200, 'run at guard');
    b.leap(1, { run: true });
    b.tap('ability');
    b.hold(['right', 'run'], () => b.D().x > 44 * 16 + 4, 300, 'through door, out of view');
    b.flyTo(X(36), Y(8));
    b.flyTo(X(38), Y(12));
    b.flyTo(X(43), Y(12));
    mountRC(b);
    b.walkTo(46 * 16);
    b.finish();
  },
  // 16 JUICED UP
  b => {
    b.walkTo(X(4));
    b.leap(1, { double: true });
    if (b.D().straws !== 1) throw new Error('no straw');
    b.walkTo(X(13));
    if (b.D().facing < 0) { b.step(['right']); b.step([]); }
    b.act();
    if (!b.world.boxes[0].powered) throw new Error('box not powered');
    mountRC(b);
    b.hold(['right'], () => b.D().x > 25 * 16, 200, 'through portal');
    b.walkTo(X(26));
    b.leap(1, { double: true });
    b.walkTo(35 * 16);
    b.finish();
  },
  // 17 THICK AND THIN
  b => {
    b.flyTo(X(6), Y(13));
    if (b.RC().thick !== 8) throw new Error('no thick goo: ' + b.RC().thick);
    b.flyTo(X(11), Y(10));
    paint(b, ['up', 'right'], () => b.RC().x > 35 * 16, 'paint ceiling');
    b.walkTo(X(10));
    jumpToHang(b, 1, false);
    b.hold(['right'], () => !b.D().hang && b.world.grounded(b.D()), 700, 'shimmy out');
    b.walkTo(X(38));
    if (b.D().straws !== 1) throw new Error('no straw');
    b.flyTo(X(34), Y(10));
    paint(b, ['up', 'left'], () => b.RC().x < 19 * 16, 'repaint the regular stretch');
    b.walkTo(X(35));
    jumpToHang(b, -1, false);
    b.hold(['left'], () => !b.D().hang && b.world.grounded(b.D()), 700, 'shimmy back');
    b.walkTo(X(7));
    if (b.D().facing < 0) { b.step(['right']); b.step([]); }
    b.act();
    if (!b.world.boxes[0].powered) throw new Error('box not powered');
    b.flyTo(X(7), Y(10));
    mountRC(b);
    b.hold(['right'], () => b.D().x > 47 * 16, 200, 'through portal');
    b.walkTo(50 * 16);
    b.finish();
  },
  // 18 OVER THEIR HEADS
  b => {
    const s2 = b.world.shadows[1];
    b.flyTo(X(7), Y(8));
    paint(b, ['up', 'right'], () => b.RC().x > 41 * 16, 'paint ceiling');
    b.walkTo(X(7));
    jumpToHang(b, 1, true);
    b.hold(['right'], () => b.D().x > 37 * 16, 700, 'shimmy over the shadows');
    b.until(() => s2.facing === -1 && s2.x < X(31), [], 900, 's2 walks away');
    b.hold(['right'], () => !b.D().hang && b.world.grounded(b.D()), 200, 'drop');
    mountRC(b);
    b.walkTo(48 * 16, true);
    b.finish();
  },
  // 19 PORTAL PUMP
  b => {
    const crate = b.world.crates[0];
    b.flyTo(X(17), Y(12));
    b.flyTo(X(18), Y(12));
    b.active('rc'); b.hold(['up'], () => b.RC().y < 30, 200, 'updraft');
    b.act();
    if (!b.world.portals[0].active) throw new Error('portal asleep');
    b.flyTo(X(20), Y(2));
    b.flyTo(X(20), Y(12));
    b.walkTo(crate.x - 9);
    b.act();
    if (!b.D().carry) throw new Error('no crate');
    b.walkTo(146);
    b.act();                              // toss it into the portal
    b.until(() => b.world.plates[0].on, [], 200, 'crate lands on the heavy plate');
    mountRC(b);
    b.hold(['right'], () => b.D().x > 39 * 16 && b.world.grounded(b.D()), 900, 'through the portal room and out');
    b.walkTo(41 * 16);
    b.finish();
  },
  // 20 SHROOM BOOM
  b => {
    const s = b.world.shadows[0];
    b.flyTo(X(6), Y(15));
    b.flyTo(X(11), Y(15));
    b.active('rc'); b.hold(['right'], () => b.RC().x + b.RC().w >= 12 * 16, 120, 'touch cliff');
    paint(b, ['up', 'right'], () => b.RC().y < 9 * 16 - 4, 'paint cliff');
    b.walkTo(X(11));
    b.hold(['right', 'up'], () => b.D().y + b.D().h <= 9 * 16 && b.world.grounded(b.D()), 400, 'climb');
    b.walkTo(X(16));
    b.flyTo(X(8), Y(12));
    b.active('rc'); b.hold(['right'], () => b.RC().x + 6 >= 146, 60, 'into updraft');
    b.hold(['up'], () => b.RC().y < 30, 300, 'updraft');
    b.until(() => s.facing === 1 && s.wait === 0 && s.x < X(23), [], 1200, 'shadow starts walking away');
    b.act();                              // timer on: door opens
    b.flyTo(X(11), Y(2));
    b.flyTo(X(15), Y(7));
    b.flyTo(X(19), Y(7));                 // RC slips through too
    b.active('droober');
    b.hold(['right', 'run'], () => b.D().x + b.D().w >= s.x - 22, 300, 'chase');
    b.leap(1, { run: true });
    b.tap('ability');
    b.walkTo(X(39), true);
    if (b.D().straws !== 1) throw new Error('no straw');
    b.act();
    if (!b.world.boxes[0].powered) throw new Error('box not powered');
    mountRC(b);
    b.hold(['right'], () => b.D().x > 52 * 16, 200, 'portal');
    b.walkTo(59 * 16);
    b.finish();
  },
];
