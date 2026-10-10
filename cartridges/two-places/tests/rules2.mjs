// World 2 mechanics: goo, thick goo, climbing, ceiling shimmy, fans, shadows + smoke, portals.
import { loadGame, makeInput } from './harness.mjs';
const { World, TILE } = loadGame(['src/world.js']);

const room = (rows, objs = [], extra = {}) => new World({ name: 't', world: 2, grid: rows, objs, ...extra });
let fails = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fails++; };
const runner = w => { const inp = makeInput(); return (keys, n = 1) => { for (let i = 0; i < n; i++) w.update(inp(typeof keys === 'function' ? keys(i) : keys)); }; };
const gooCount = w => [...w.goo.values()].filter(g => g.until > w.frame).length;

// --- goo painting, drying, thick goo
{
  const rows = ['##############', '#............#', '#............#', '#............#', '#...........##', '#.D.R.......##', '##############'];
  const w = room(rows, [{ t: 'puddle', x: 6, y: 5, amount: 2 }]); const run = runner(w);
  w.active = 'rc';
  run(['up'], 30);                                  // to the ceiling
  run(['up', 'right', 'ability'], 60);              // drag along it
  const n = gooCount(w);
  check(`RC paints the ceiling (${n} tiles)`, n >= 3);
  check('no goo on the floor', ![...w.goo.keys()].some(k => Math.floor(k / w.W) === 6));
  run([], 700);
  check('regular goo dries', gooCount(w) === 0);
  const w2 = room(rows, [{ t: 'puddle', x: 6, y: 5, amount: 2 }]); const run2 = runner(w2);
  w2.active = 'rc';
  run2(['right'], 60);                              // through the puddle
  check('puddle gives thick goo', w2.rc.thick === 2);
  run2(['up'], 40); run2(['up', 'right', 'ability'], 80);
  run2([], 700);
  check(`thick goo stays (${gooCount(w2)} tiles) and the meter empties`, gooCount(w2) === 2 && w2.rc.thick === 0);
}
// --- Droober climbs a gooey wall and shimmies a gooey ceiling
{
  const rows = ['##############', '#............#', '#............#', '#.......######', '#............#', '#............#', '#............#', '#.D..........#', '##############'];
  const w = room(rows); const run = runner(w);
  for (let ty = 1; ty <= 7; ty++) w.goo.set(ty * w.W + 13, { until: Infinity, thick: true });
  w.droober.x = 13 * 16 - 14; w.snapCamera();
  run(['right', 'jump'], 2); run(['right'], 10);
  check('Droober grabs a gooey wall', w.droober.cling === 1);
  const y0 = w.droober.y; run(['up'], 30);
  check('and climbs it', w.droober.y < y0 - 20);
  const w2 = room(rows); const run2 = runner(w2);
  for (let tx = 8; tx <= 12; tx++) w2.goo.set(3 * w2.W + tx, { until: Infinity, thick: true });
  w2.droober.x = 8 * 16 + 1;
  run2(['jump'], 25);
  check('Droober sticks to a gooey ceiling', w2.droober.hang);
  const x0 = w2.droober.x; run2(['right'], 40);
  check('and shimmies along it', w2.droober.hang && w2.droober.x > x0 + 30);
  run2(['left'], 120);
  check('drops when the goo runs out', !w2.droober.hang);
  const w3 = room(rows); const run3 = runner(w3);
  w3.droober.x = 8 * 16 + 1; run3(['jump'], 25);
  check('plain ceiling: just a bonk', !w3.droober.hang);
}
// --- fans
{
  const rows = ['##############', '#............#', '#............#', '#............#', '#............#', '#.D..R.......#', '##############'];
  const w = room(rows, [{ t: 'fan', x: 5, y: 6, dir: 'u', len: 5 }]);
  // fan housing sits on the floor tile at row 5; blows up through rows 0..4
  const run = runner(w);
  const ry = w.rc.y; run([], 60);
  check('fan lifts RC', w.rc.y < ry - 16);
  w.droober.x = 5 * 16 + 1; const dy = w.droober.y; run([], 30);
  check('fan does not lift Droober', Math.abs(w.droober.y - dy) <= 16);
}
// --- shadows and smoke
{
  const rows = ['################', '#..............#', '#..............#', '#..............#', '#.D.........S..#', '################'].map(r => r.replace('S', '.'));
  const objs = [{ t: 'shadow', x: 12, y: 4, facing: -1, range: 12 }];
  const w = room(rows, objs); const run = runner(w);
  run([], 40);
  check('shadow spots Droober', w.state === 'dead' && w.droober.deathWhy === 'shadow');
  const w2 = room(rows, objs); const run2 = runner(w2);
  run2(['ability'], 1); run2([], 100);
  check('smoke hides him', w2.state === 'play');
  run2([], 220);
  check('until it clears', w2.state === 'dead');
  const w3 = room(rows, objs); const run3 = runner(w3);
  w3.droober.x = 14 * 16 + 1; // behind the shadow, out of its view
  w3.active = 'rc'; w3.rc.x = 9 * 16; w3.rc.y = 4 * 16 + 4;
  run3([], 60);
  check('shadows ignore RC', w3.state === 'play');
}
// --- portals, juice boxes, straws
{
  const rows = ['##################', '#................#', '#................#', '#................#', '#.D..............#', '##################'];
  const objs = [{ t: 'juicebox', x: 4, y: 4, id: 'b' }, { t: 'portal', x: 7, y: 4, pair: 'p', box: 'b' }, { t: 'portal', x: 14, y: 4, pair: 'p' }, { t: 'straw', x: 3, y: 4 }];
  const w = room(rows, objs); const run = runner(w);
  w.active = 'rc'; w.rc.x = 4 * 16 + 2; w.rc.y = 4 * 16 + 4;
  run(['act'], 1); run([], 1);
  check("RC can't power a juice box", !w.boxes[0].powered);
  w.active = 'droober';
  run(['right'], 14); run([], 10);
  check('Droober picks up a straw', w.droober.straws === 1);
  run(['act'], 1); run([], 2);
  check('straw powers the box and wakes the portals', w.boxes[0].powered && w.portals.every(p => p.active));
  run(['right'], 60);
  check('Droober goes through the portal', w.droober.x > 13 * 16);
  const w2 = room(rows, objs); const run2 = runner(w2);
  run2(['right'], 80);
  check('dormant portal does nothing', w2.droober.x < 13 * 16);
}
process.exit(fails ? 1 : 0);
