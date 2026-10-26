// Keyboard + gamepad -> abstract actions, with per-frame edge detection.
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run',
  KeyE: 'act', KeyJ: 'act', Enter: 'confirm',
  Tab: 'swap', KeyQ: 'swap',
  KeyF: 'call', KeyL: 'call', KeyC: 'ability', KeyG: 'ability',
  KeyR: 'restart', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'run', 'act', 'swap', 'call', 'restart', 'pause', 'mute', 'confirm', 'ability'];

const Input = {
  keys: new Set(),
  downs: new Set(), // keys that went down since the last poll, so sub-frame taps still count
  prev: {},
  held: {}, pressed: {},
  usingPad: false,
  usingTouch: false,
  init() {
    addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      if (a) { e.preventDefault(); if (!e.repeat) this.downs.add(a); this.keys.add(a); this.usingPad = false; }
    });
    addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); });
    addEventListener('blur', () => this.keys.clear());
  },
  poll() {
    const now = new Set(this.keys);
    if (typeof TouchPad !== 'undefined') for (const a of TouchPad.held) now.add(a);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const b = i => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const before = now.size;
      if (ax < -0.4 || b(14)) now.add('left');
      if (ax > 0.4 || b(15)) now.add('right');
      if (ay < -0.5 || b(12)) now.add('up');
      if (ay > 0.5 || b(13)) now.add('down');
      if (b(0)) { now.add('jump'); now.add('confirm'); }
      if (b(2)) now.add('act');
      if (b(1)) now.add('call');
      if (b(4) || b(5)) now.add('swap');
      if (b(3)) now.add('ability');
      if (b(6) || b(7)) now.add('run');
      if (b(9)) now.add('pause');
      if (b(8)) now.add('restart');
      if (now.size > before) this.usingPad = true;
    }
    for (const a of ACTIONS) {
      const h = now.has(a), tapped = this.downs.has(a);
      this.pressed[a] = (h && !this.prev[a]) || (tapped && !h);
      this.held[a] = h || tapped;
      this.prev[a] = h;
    }
    this.downs.clear();
    // "jump" doubles as menu confirm
    if (this.pressed.jump) this.pressed.confirm = true;
  },
};
