// Ability rules: who can do what. Each check builds a tiny room and asserts.
import { loadGame, makeInput } from './harness.mjs';
const { World } = loadGame(['src/world.js']);

function room(rows, objs = [], extra = {}) {
  return new World({ name: 'test', grid: rows, objs, ...extra });
}
const base = (mid) => ['############', ...mid, '############'];
let fails = 0;
function check(name, ok) { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fails++; }
function run(w, keys, n) { const inp = makeInput(); for (let i = 0; i < n; i++) w.update(inp(typeof keys === 'function' ? keys(i) : keys)); }

// RC is too light for a heavy plate, fine on a normal one
{
  const w = room(base(['#..........#', '#..........#', '#.D......R.#']), [{ t: 'plate', x: 9, y: 3, ch: 'A', heavy: true }]);
  run(w, [], 120);
  check('RC alone does not press a heavy plate', !w.plates[0].on);
  const w2 = room(base(['#..........#', '#..........#', '#.D......R.#']), [{ t: 'plate', x: 9, y: 3, ch: 'A' }]);
  run(w2, [], 120);
  check('RC settles onto a normal plate and presses it', w2.plates[0].on);
}
// RC cannot push crates or blocks
{
  const w = room(base(['#..........#', '#..........#', '#.D..Rc....#']));
  w.active = 'rc';
  const cx = w.crates[0].x;
  run(w, i => i < 5 ? ['down'] : ['right'], 120);
  check('RC cannot push a crate', w.crates[0].x === cx);
  const t = w.toasts.length;
  run(w, i => i === 0 ? ['act'] : [], 2);
  check('RC trying to lift says so', w.toasts.some(x => /LIFT/.test(x.text)));
}
// Droober pushes crates and blocks
{
  const w = room(base(['#..........#', '#..........#', '#.D.c...B..#']));
  const cx = w.crates[0].x;
  run(w, ['right'], 60);
  check('Droober pushes a crate', w.crates[0].x > cx);
  const w2 = room(base(['#..........#', '#..........#', '#.D..B.....#']));
  const bx = w2.blocks[0].x;
  run(w2, ['right'], 90);
  check('Droober shoves a heavy block', w2.blocks[0].x > bx);
}
// grates: goo passes, Droober and crates do not
{
  const w = room(base(['#....%.....#', '#....%.....#', '#.D.R%.....#']));
  run(w, ['right'], 120);
  check('Droober is stopped by a grate', w.droober.x + w.droober.w <= 5 * 16);
  w.active = 'rc';
  run(w, ['right'], 120);
  check('RC oozes through a grate', w.rc.x > 6 * 16);
}
// cranks: RC refuses, Droober turns
{
  const rows = base(['#..........#', '#..........#', '#.D.R......#']);
  const w = room(rows, [{ t: 'crank', x: 4, y: 3, ch: 'k' }, { t: 'mover', x: 7, y: 2, w: 2, dx: 2, crank: 'k' }]);
  w.active = 'rc';
  run(w, i => i === 30 ? ['act'] : [], 60);
  check('RC cannot crank', w.movers[0].t === 0 && w.toasts.some(x => /CRANK/.test(x.text)));
  w.active = 'droober';
  run(w, ['right'], 25);
  run(w, ['act'], 60);
  check('Droober cranks the platform', w.movers[0].t > 0);
}
// glide needs RC aboard
{
  const tall = ['############', ...Array(8).fill('#..........#'), '#.D........#', '############'];
  const airtime = riding => {
    const w = room(tall, [], { rcRiding: riding }), inp = makeInput();
    let f = 0, left = false;
    for (; f < 300; f++) { w.update(inp(f < 18 ? ['jump'] : f < 20 ? [] : ['jump'])); if (!w.grounded(w.droober)) left = true; else if (left) break; }
    return f;
  };
  const solo = airtime(false), duo = airtime(true);
  check(`no glide without RC (airtime ${solo}f)`, solo < 70);
  check(`glide with RC aboard (airtime ${duo}f)`, duo > solo + 40);
}
// carrying limits Droober to one jump
{
  const w = room(base(['#..........#', '#..........#', '#..........#', '#..........#', '#.Dc.......#']));
  run(w, i => i === 0 ? ['act'] : [], 4);
  const y0 = w.droober.y;
  let peak = 0;
  const inp = makeInput();
  for (let i = 0; i < 60; i++) { w.update(inp(i < 18 ? ['jump'] : i < 20 ? [] : ['jump'])); peak = Math.max(peak, y0 - w.droober.y); }
  check('carrying: no double jump', w.droober.carry && peak < 46);
}
// doors block both; RC cannot slip a closed door
{
  const w = room(base(['#....#.....#', '#....#.....#', '#.D.R|.....#']).map(r => r.replace('|', '.')), [{ t: 'door', x: 5, y: 1, h: 3, ch: 'Z' }]);
  w.active = 'rc';
  run(w, ['right'], 120);
  check('RC is stopped by a closed door', w.rc.x < 5 * 16);
}
process.exit(fails ? 1 : 0);
