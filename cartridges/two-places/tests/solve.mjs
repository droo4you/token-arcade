// Plays every level start to finish with scripted inputs through the real World
// simulation. If a level change breaks solvability, this fails.
// Run: node tests/solve.mjs [levelNumber]
import { loadGame, makeInput } from './harness.mjs';
import { SOLUTIONS_W2 } from './solve2.mjs';
const { World, LEVELS } = loadGame();

const X = tx => tx * 16 + 8;          // tile center, px
const Y = ty => ty * 16 + 8;

function makeBot(world) {
  const inp = makeInput();
  let frames = 0;
  const D = () => world.droober, RC = () => world.rc;
  const dcx = () => D().x + D().w / 2;
  const bot = {
    world, D, RC,
    get frames() { return frames; },
    step(keys) {
      world.update(inp(keys));
      frames++;
      if (world.state === 'dead') throw new Error(`${world.rc.dead ? 'RC popped' : 'Droober died (' + world.droober.deathWhy + ')'} at frame ${frames}, droober (${D().x},${D().y}) rc (${RC().x},${RC().y})`);
    },
    wait(n, keys = []) { for (let i = 0; i < n; i++) bot.step(keys); },
    until(cond, keys, max = 900, label = '') {
      let i = 0;
      while (!cond()) {
        if (world.state === 'clear') return;
        if (i++ > max) throw new Error(`timeout: ${label} | droober (${D().x},${D().y}) rc (${RC().x},${RC().y}) frame ${frames}`);
        bot.step(typeof keys === 'function' ? keys() : keys);
      }
    },
    tap(...k) { bot.step(k); bot.step([]); },
    active(who) { if (world.active !== who) bot.tap('swap'); },
    walkTo(x, run = false) {
      bot.active('droober');
      bot.until(() => Math.abs(x - dcx()) < 2 && Math.abs(D().vx) < 0.05 && world.grounded(D()), () => {
        const dx = x - dcx();
        if (Math.abs(dx) < 2) return [];
        if (Math.abs(dx) < 6 && Math.abs(D().vx) > 0.6) return [];
        return [dx > 0 ? 'right' : 'left', ...(run && Math.abs(dx) > 30 ? ['run'] : [])];
      }, 1500, 'walkTo ' + x);
    },
    // hold a direction (and maybe crouch/run) until a condition
    hold(keys, cond, max = 900, label = 'hold') { bot.until(cond, keys, max, label); },
    leap(dir, { run = false, double = false, glide = false } = {}) {
      bot.active('droober');
      const base = [dir > 0 ? 'right' : 'left', ...(run ? ['run'] : [])];
      for (let i = 0; i < 16; i++) bot.step([...base, 'jump']);
      if (double) {
        bot.step(base); bot.step(base);
        if (glide) bot.until(() => world.grounded(D()) || world.state !== 'play', [...base, 'jump'], 400, 'glide');
        else for (let i = 0; i < 14; i++) bot.step([...base, 'jump']);
      }
      bot.until(() => world.grounded(D()) || world.state !== 'play', base, 400, 'land');
    },
    runLeap(dir, takeoffX, opts = {}) {
      bot.active('droober');
      const base = [dir > 0 ? 'right' : 'left', 'run'];
      bot.until(() => (dir > 0 ? dcx() >= takeoffX : dcx() <= takeoffX), base, 600, 'runup to ' + takeoffX);
      bot.leap(dir, { run: true, ...opts });
    },
    flyTo(x, y, tol = 3) {
      bot.active('rc');
      const c = () => ({ x: RC().x + RC().w / 2, y: RC().y + RC().h / 2 });
      bot.until(() => Math.abs(c().x - x) <= tol && Math.abs(c().y - y) <= tol, () => {
        const k = [], p = c();
        if (p.x < x - tol) k.push('right'); else if (p.x > x + tol) k.push('left');
        if (p.y < y - tol) k.push('down'); else if (p.y > y + tol) k.push('up');
        if (Math.hypot(p.x - x, p.y - y) > 20) k.push('run');
        return k;
      }, 1200, `flyTo ${x},${y}`);
    },
    settle() { bot.active('rc'); bot.until(() => RC().onGround, ['down'], 300, 'settle'); bot.wait(4); },
    act(down = false) { bot.tap(...(down ? ['down', 'act'] : ['act'])); },
    crank(cond, label) { bot.active('droober'); bot.until(cond, ['act'], 800, 'crank ' + label); bot.step([]); },
    finish() { bot.until(() => world.state === 'clear', [], 120, 'exit'); },
  };
  return bot;
}

const SOLUTIONS = [
  // 1 JUICE RUN
  b => {
    b.walkTo(X(9) + 4);
    b.leap(1);                              // 2-tile step
    b.walkTo(X(14));
    b.leap(1, { double: true });            // 3 more up
    b.walkTo(X(26));
    b.runLeap(1, 27 * 16 + 4, { double: true });  // spike pit
    b.walkTo(X(35));
    b.hold(['down', 'right'], () => b.D().x > 42 * 16 + 2, 600, 'crawl');
    b.walkTo(45 * 16);
    b.finish();
  },
  // 2 GOO BUDDY
  b => {
    b.flyTo(X(9), 88);
    b.flyTo(X(14), 88);                     // through the grate
    b.flyTo(X(15), Y(9));
    b.act();
    b.active('droober');
    b.tap('call');                          // RC follows and hops on
    b.until(() => b.RC().mode === 'ride', [], 600, 'follow');
    b.walkTo(X(25));
    b.leap(1, { double: true });
    b.walkTo(33 * 16);
    b.finish();
  },
  // 3 HOLD THE DOOR
  b => {
    b.flyTo(X(7), Y(10));
    b.settle();
    if (!b.world.plates[0].on) throw new Error('RC did not press plate');
    b.walkTo(X(15));                        // through door A onto the inner plate
    b.flyTo(X(10), Y(10));
    b.flyTo(X(14), Y(10));
    b.flyTo(X(18), Y(7));
    b.flyTo(X(18), Y(3));
    b.flyTo(X(21), Y(3));
    b.settle();                             // RC holds door B from the shelf
    b.walkTo(X(29));
    b.flyTo(X(24), Y(2));
    b.flyTo(X(28), Y(2));                   // the grate shortcut
    b.flyTo(X(29), Y(8));
    b.tap('call');
    b.walkTo(36 * 16);
    b.finish();
  },
  // 4 HEAVY LIFTING
  b => {
    const c1 = b.world.crates[0], c2 = b.world.crates[1];
    b.walkTo(c1.x - 9);
    b.act();
    if (!b.D().carry) throw new Error(`no pickup: droober ${b.D().x},${b.D().y} f${b.D().facing} crates ${b.world.crates.map(c => c.x + ',' + c.y)} toast ${b.world.toasts.map(t => t.text)}`);
    b.walkTo(209 - 15 + 7);
    b.act(true);
    if (!b.world.plates[0].on) throw new Error('crate not on heavy plate');
    b.leap(1);
    b.walkTo(c2.x - 9);
    b.act();
    b.walkTo(402 - 15 + 7);
    b.act(true);
    b.walkTo(380);
    b.leap(1);                              // onto the crate
    b.leap(1, { double: true });            // over the 5-tile wall
    b.flyTo(X(10), Y(9));
    b.flyTo(X(18), Y(9));
    b.flyTo(X(30), Y(5));
    b.flyTo(X(31), Y(9));
    b.walkTo(X(31));
    b.tap('call');
    b.walkTo(38 * 16);
    b.finish();
  },
  // 5 GOO GLIDER
  b => {
    b.walkTo(96);
    b.tap('call');
    if (b.RC().mode !== 'ride') throw new Error('RC not aboard');
    b.walkTo(150);
    b.runLeap(1, 200, { double: true, glide: true });
    b.walkTo(X(31));
    b.runLeap(1, 552, { double: true, glide: true });
    b.walkTo(52 * 16);
    b.finish();
  },
  // 6 STAND-IN
  b => {
    b.flyTo(X(9), Y(4));
    b.flyTo(X(3), Y(4));                    // into the goo-only pocket
    b.act();
    b.flyTo(X(9), Y(4));
    b.flyTo(X(13), Y(10));
    const c = b.world.crates[0];
    b.walkTo(88);                           // closet door is open now
    b.act();
    if (!b.D().carry) throw new Error(`no pickup: droober ${b.D().x},${b.D().y} f${b.D().facing} crates ${b.world.crates.map(c => c.x + ',' + c.y)} toast ${b.world.toasts.map(t => t.text)}`);
    b.walkTo(248);
    b.step(['left']); b.step([]);           // face left
    b.act(true);
    if (!b.world.plates[0].on) throw new Error('crate not on plate: ' + c.x);
    b.tap('call');
    b.until(() => b.RC().mode === 'ride', [], 300, 'mount');
    b.runLeap(1, 262, { double: true, glide: true });
    b.walkTo(45 * 16);
    b.finish();
  },
  // 7 BLOCK PARTY
  b => {
    const [b1, b2] = b.world.blocks;
    b.hold(['right'], () => b1.x >= 224, 900, 'push block 1');
    b.wait(10);
    if (!b.world.plates[0].on) throw new Error('block not on plate');
    b.leap(1);
    b.walkTo(X(20));
    b.hold(['right'], () => b2.x >= 448, 900, 'push block 2');
    b.wait(10);
    b.leap(1);                              // onto block 2
    b.leap(1, { double: true });            // onto the 6-tile ledge
    b.flyTo(X(10), Y(8));
    b.flyTo(X(17), Y(8));
    b.flyTo(X(17), Y(10));
    b.flyTo(X(19), Y(10));
    b.flyTo(X(20), Y(1) + 2);
    b.act();
    b.flyTo(X(28), Y(4));
    b.flyTo(X(31), Y(4));
    b.walkTo(X(31));
    b.tap('call');
    b.walkTo(43 * 16);
    b.finish();
  },
  // 8 CRANK SHAFT
  b => {
    const [lift, bridge] = b.world.movers;
    b.walkTo(X(7));
    b.crank(() => lift.t >= 1, 'lift');
    b.walkTo(X(10));
    b.leap(1, { double: true });            // onto the raised lift
    b.leap(1, { double: true });            // onto the upper ledge
    b.walkTo(X(21));
    b.crank(() => bridge.t >= 0.5, 'bridge');
    b.flyTo(X(4), Y(6));
    b.flyTo(X(17), Y(6));
    b.flyTo(X(18), Y(6));
    b.settle();                             // zap off while RC holds the plate
    if (!b.world.plates[0].on) throw new Error('plate Z not held');
    b.walkTo(X(22) - 2);
    b.runLeap(1, 22 * 16 + 4, { double: true });
    b.walkTo(bridge.x + 8);
    b.runLeap(1, bridge.x + bridge.w - 9, { double: true });
    b.walkTo(X(44));
    b.flyTo(X(24), Y(10));
    b.flyTo(X(36), Y(10));
    b.flyTo(X(41), Y(10));                  // grate tunnel
    b.flyTo(X(41), Y(6));
    b.flyTo(X(43), Y(6));
    b.tap('call');
    b.walkTo(48 * 16);
    b.finish();
  },
  // 9 TICK TOCK
  b => {
    b.flyTo(X(4), Y(3));
    b.act();
    const t0 = b.frames;
    b.flyTo(X(2), Y(9));
    b.tap('call');
    if (b.RC().mode !== 'ride') throw new Error('no mount');
    b.runLeap(1, 12 * 16 + 4, { double: true });
    const zap = b.world.zaps[0];
    b.walkTo(X(22), true);
    b.until(() => zap.on, [], 200, 'zap on');
    b.until(() => !zap.on, [], 200, 'zap off');
    b.hold(['right', 'run'], () => b.D().x > 27 * 16, 200, 'past zap');
    b.hold(['right', 'run'], () => b.D().x > 29 * 16 - 4, 200, 'to crawl');
    b.hold(['down', 'right'], () => b.D().x > 33 * 16 + 2, 600, 'crawl');
    b.hold(['right', 'run'], () => b.D().x > 41 * 16, 300, 'door');
    console.log('    timer margin', b.world.buttons[0].time - (b.frames - t0), 'frames');
    b.walkTo(52 * 16);
    b.finish();
  },
  // 10 TWO PLACES AT ONCE
  b => {
    const blk = b.world.blocks[0], crate = b.world.crates[0], lift = b.world.movers[0];
    b.hold(['right'], () => blk.x >= 144, 900, 'push block');
    b.wait(10);
    b.leap(1);
    b.walkTo(178); b.walkTo(199); if (b.D().facing < 0) { b.step(['right']); b.step([]); }
    b.act();
    if (!b.D().carry) throw new Error(`no pickup: droober ${b.D().x},${b.D().y} f${b.D().facing} crates ${b.world.crates.map(c => c.x + ',' + c.y)} toast ${b.world.toasts.map(t => t.text)}`);
    b.walkTo(232);
    b.act(true);
    if (b.world.count('A') !== 2) throw new Error('door needs both plates, have ' + b.world.count('A'));
    b.tap('call');
    b.until(() => b.RC().mode === 'ride', [], 600, 'follow');
    b.leap(1);                              // hop the crate so it stays on the plate
    b.walkTo(280);
    b.runLeap(1, 340, { double: true, glide: true });
    b.walkTo(X(39));
    b.leap(1);                              // onto the lift at the bottom
    b.walkTo(lift.x + 16);
    b.flyTo(X(37), Y(14));
    b.settle();
    b.active('droober');
    b.until(() => lift.t >= 1, [], 400, 'lift up');
    b.hold(['right'], () => b.D().x > 44 * 16, 120, 'off lift');
    b.walkTo(X(46));
    b.flyTo(X(40), Y(6));
    b.flyTo(X(45), Y(6));
    b.tap('call');
    const zap = b.world.zaps[0];
    b.until(() => zap.on, [], 200, 'zap on');
    b.until(() => !zap.on, [], 200, 'zap off');
    b.walkTo(60 * 16, true);
    b.finish();
  },
];

SOLUTIONS.push(...SOLUTIONS_W2);

const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;
let fails = 0;
LEVELS.forEach((def, i) => {
  if (only !== null && i !== only) return;
  const w = new World(def);
  const bot = makeBot(w);
  try {
    SOLUTIONS[i](bot);
    console.log(`PASS #${i + 1} ${def.name}  (${bot.frames} frames, ${(bot.frames / 60).toFixed(1)}s, apples ${w.applesGot()}/${w.appleTotal})`);
  } catch (e) {
    fails++;
    console.log(`FAIL #${i + 1} ${def.name}: ${e.message}`);
  }
});
process.exit(fails ? 1 : 0);
