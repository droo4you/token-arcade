// Structural checks + ASCII dump of every level.
import { loadGame } from './harness.mjs';
const { World, LEVELS } = loadGame();
let bad = 0;
const from = Number(process.argv.find(a => /^d+$/.test(a)) || 1) - 1;
LEVELS.forEach((def, i) => {
  if (i < from) return;
  try {
    const w = new World(def);
    const widths = new Set(def.grid.map(r => r.length));
    if (widths.size !== 1) throw new Error('ragged rows');
    if (!w.exit) throw new Error('no exit');
    const chans = new Set([...w.plates, ...w.buttons, ...w.levers].map(o => o.ch));
    for (const o of [...w.doors, ...w.zaps.filter(z => z.ch != null)]) if (!chans.has(o.ch)) throw new Error('nothing drives channel ' + o.ch);
    for (const m of w.movers) if (m.crank != null ? !w.cranks.some(k => k.ch === m.crank) : (m.ch != null && !chans.has(m.ch))) throw new Error('orphan mover');
    for (const f of w.fans) if (w.tile(f.x / 16, f.y / 16) !== 1) throw new Error('fan not set into a solid tile at ' + f.x / 16 + ',' + f.y / 16);
    for (const p of w.portals) if (w.portals.filter(q => q.pair === p.pair).length !== 2) throw new Error('portal pair ' + p.pair + ' incomplete');
    for (const p of w.portals) if (p.box != null && !w.boxes.some(b => b.id === p.box)) throw new Error('portal needs missing box ' + p.box);
    if (w.boxes.length > w.straws.length) throw new Error('more juice boxes than straws');
    if (w.collide(w.droober, w.droober.x, w.droober.y, 0)) throw new Error('Droober spawns inside something');
    if (!def.rcRiding && w.collide(w.rc, w.rc.x, w.rc.y, 0)) throw new Error('RC spawns inside something');
    console.log(`#${i + 1} ${def.name}  ${w.W}x${w.H}  apples ${w.appleTotal}`);
    if (process.argv.includes('--dump')) {
      const g = def.grid.map(r => [...r]);
      for (const o of def.objs) if (o.t !== 'sign') g[o.y][o.x] = { plate: o.heavy ? 'H' : 'p', button: 'b', lever: 'l', crank: 'k', door: '|', mover: 'm', zap: 'z', fan: 'f', shadow: 'S', portal: 'O', juicebox: 'J', straw: 's', puddle: 'u' }[o.t];
      console.log(g.map(r => r.join('')).join('\n'));
    }
  } catch (e) { bad++; console.log(`#${i + 1} ${def.name}  FAIL: ${e.message}`); }
});
process.exit(bad ? 1 : 0);
