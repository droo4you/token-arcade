// Loads the game's classic scripts into a VM context so the simulation runs headless.
import fs from 'node:fs';
import vm from 'node:vm';

export function loadGame(files = ['src/world.js', 'src/levels.js', 'src/levels2.js']) {
  const ctx = vm.createContext({ console, Math });
  const code = files.filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n;\n')
    + '\n;globalThis.__g = { World, PHYS, TILE, LEVELS: typeof LEVELS !== "undefined" ? LEVELS : null };';
  vm.runInContext(code, ctx, { filename: 'game.js' });
  return ctx.__g;
}

// input frame helper: keys held this frame, previous frame for edge detection
export function makeInput() {
  let prev = new Set();
  return keys => {
    const now = new Set(keys);
    const held = {}, pressed = {};
    for (const k of ['left', 'right', 'up', 'down', 'jump', 'run', 'act', 'swap', 'call', 'ability']) {
      held[k] = now.has(k); pressed[k] = now.has(k) && !prev.has(k);
    }
    prev = now;
    return { held, pressed };
  };
}
