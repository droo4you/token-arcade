// Loads the real browser scripts into a vm with a stubbed DOM and plays through every screen.
// Catches runtime errors in drawing and screen flow. node tests/harness.mjs
import fs from 'node:fs';
import vm from 'node:vm';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 1 }) : noop)), set: (t, k, v) => (t[k] = v, true) });
const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: noop, setPointerCapture: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }) });
const listeners = {};
const store = {};
const sandbox = {
  console, Math, Date, JSON, Number, String, Array, Object, Map, Set, Proxy, Error, parseInt, Symbol,
  document: { getElementById: () => gameCanvas, createElement: canvas, body: { classList: { toggle: noop } }, documentElement: {} },
  addEventListener: (k, f) => (listeners[k] = f), innerWidth: 960, innerHeight: 540, screen: {},
  matchMedia: () => ({ matches: false }), localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
  performance: { now: () => 0 }, requestAnimationFrame: noop, setInterval: noop, setTimeout: f => f(), URLSearchParams,
  Image: function () { this.complete = true; },
};
const gameCanvas = canvas();
gameCanvas.addEventListener = (k, f) => (listeners['cv_' + k] = f);
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['font', 'sprites', 'sim', 'meta', 'art', 'audio', 'main']) vm.runInContext(fs.readFileSync(`src/${f}.js`, 'utf8'), sandbox, { filename: f + '.js' });
const run = code => vm.runInContext(code, sandbox);
const key = (code, up) => listeners[up ? 'keyup' : 'keydown']({ code, key: code, preventDefault: noop, repeat: false });
const frames = (n) => { for (let i = 0; i < n; i++) run('update(1/60); draw();'); };

frames(30);                          // title
const ptr = (type, x, y) => listeners['cv_pointer' + type]({ pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, preventDefault: noop });
key('Space'); frames(5);             // -> aim
if (run('G8.screen') !== 'aim') throw new Error('not aiming');
// a tiny tug should not throw: it asks to pull further
ptr('down', 300, 120); ptr('move', 297, 121); ptr('up', 297, 121); frames(3);
if (run('G8.screen') !== 'aim' || !(run('G8.aim.warnT') > 0)) throw new Error('tiny pull should warn, not throw');
// a full pull back and down throws flat and hard
ptr('down', 300, 120); ptr('move', 270, 125); frames(2); ptr('move', 246, 134); frames(2);
const ang = run('G8.aim.angle'), pow = run('G8.aim.power');
if (!(pow > 0.95 && ang > 8 && ang < 24)) throw new Error('drag mapping off: power ' + pow + ' angle ' + ang);
ptr('up', 246, 134); frames(2);
if (run('G8.screen') !== 'fly') throw new Error('drag did not throw');
console.log('drag throw: angle', Math.round(ang), 'vx', run('Math.round(G8.run.vx)'));
// boost keys: X bounces, C calls RC, SPACE calls RC only while the rock is up in the air
{
  const b0 = run('G8.run.bounces'); key('KeyX'); frames(1); key('KeyX', true);
  if (run('G8.run.bounces') !== b0 - 1) throw new Error('X did not bounce');
  frames(40);
  run('G8.run.alt = 120; G8.run.vy = 150; G8.run.rcT = 0');
  const r0 = run('G8.run.rc'); key('Space'); frames(1); key('Space', true);
  if (run('G8.run.rc') !== r0 - 1) throw new Error('SPACE in the air did not call RC');
  frames(80);
  run('G8.run.alt = 4; G8.run.vy = -200; G8.run.rcT = 0');
  const r1 = run('G8.run.rc'); key('Space'); frames(1); key('Space', true);
  if (run('G8.run.rc') !== r1) throw new Error('SPACE near the water burned an RC lift');
  run('G8.run.rcT = 0'); key('KeyC'); frames(1); key('KeyC', true);
  if (r1 > 0 && run('G8.run.rc') !== r1 - 1) throw new Error('C did not call RC');
  console.log('boost keys ok: X bounce, SPACE-in-air RC, C RC');
}
if (run('G8.screen') !== 'fly') throw new Error('not flying: ' + run('G8.screen'));
// fly with the bot pressing keys, visiting every era by warping the rock forward
let warps = 0;
for (let i = 0; i < 60 * 300 && run('G8.screen') === 'fly'; i++) {
  const r = run('SIM.botInput(G8.run)');
  if (r.skip) key('Space');
  if (r.bounce) key('KeyX');
  if (r.rc) key('KeyC');
  if (i % 600 === 300 && warps < 12) { run('G8.run.x += 3600; G8.run.vx = Math.max(G8.run.vx, 400); G8.run.vy = 300'); warps++; }
  if (i === 900) run('G8.run.alt = 580; G8.run.vy = 600');   // try a breakout
  frames(1);
}
console.log('screen after flight:', run('G8.screen'), 'day', run('Math.floor(SIM.dayAt(G8.run.x))'), 'eras seen', run('G8.run.seenEra'));
if (run('G8.screen') !== 'results') throw new Error('run did not end');
frames(45);
key('Space'); frames(5);
if (run('G8.screen') !== 'shop') throw new Error('no shop');
run('save.gwei = 99999'); for (let i = 0; i < 7; i++) { key('ArrowDown'); key('Enter'); key('Enter'); } frames(5);
console.log('upgrades', run('JSON.stringify(save.up)'), 'gwei', run('save.gwei'));
// touch flight with buttons drawn
run('G8.touch = true'); key('KeyT'); frames(3);
key('Space'); frames(70); key('Space', true); frames(3);   // keyboard: hold SPACE to fill power
if (run('G8.screen') !== 'fly') throw new Error('keyboard hold did not throw');
console.log('keyboard throw vx', run('Math.round(G8.run.vx)'));
frames(120);
for (const t of [1, 2]) { run('G8.screen = "shop"; G8.shopTab = ' + t); frames(3); key('KeyB'); key('ArrowRight'); frames(3); }
console.log('rocks', run('JSON.stringify(save.rocks)'), 'missions', run('JSON.stringify(save.missions)'));
key('Escape'); frames(5); key('Escape'); frames(60);
// the how-to-play demo: plays itself, never touches the save
run('G8.tut = null; G8.screen = "title"; G8.time = 99'); const gw = run('save.gwei'), runs = run('save.runs');
key('KeyI'); let n = 0;
while (run('!!G8.tut') && n < 60 * 600) { frames(1); n++; }
if (run('!!G8.tut')) throw new Error('tutorial never ended');
if (run('save.gwei') !== gw || run('save.runs') !== runs) throw new Error('tutorial touched the save');
console.log('tutorial ran', (n / 60).toFixed(0) + 's');
console.log('harness ok, screen', run('G8.screen'));
