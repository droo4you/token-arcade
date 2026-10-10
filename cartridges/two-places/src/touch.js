// On-screen controls for phones/tablets. Feeds the same abstract actions as the keyboard:
// a d-pad (push it to the rim to run) plus JUMP / USE / SKILL / SWAP / CALL and pause.
// (Named TouchPad because `Touch` is a built-in browser global.)
// pointer capture keeps a held button pressed when the finger slides off it; never let it eat a press
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch {} };

const TouchPad = {
  on: false,
  held: new Set(),     // actions currently held by fingers
  padActs: new Set(),  // the subset owned by the d-pad
  init() {
    const root = document.createElement('div');
    root.id = 'touch';
    // handheld layout: cross d-pad, A/B (jump/use) + X/Y (skill/call), select/start pills (swap/pause)
    root.innerHTML = `
      <div class="tp-pad" data-pad><div class="tp-knob"></div></div>
      <div class="tp-btns">
        <button data-act="ability" class="tp-round tp-x">SKILL</button>
        <button data-act="call" class="tp-round tp-y">CALL</button>
        <button data-act="jump" class="tp-round tp-a">JUMP</button>
        <button data-act="act" class="tp-round tp-b">USE</button>
      </div>
      <div class="tp-pill p1"><button data-act="swap" aria-label="swap"></button><label>SWAP</label></div>
      <div class="tp-pill p2"><button data-act="pause" aria-label="pause"></button><label>PAUSE</label></div>
      <div class="tp-speaker"></div>`;
    document.body.appendChild(root);

    for (const b of root.querySelectorAll('[data-act]')) {
      const a = b.dataset.act;
      b.addEventListener('pointerdown', e => { e.preventDefault(); capture(b, e); b.classList.add('down'); this.press(a); });
      const up = () => { b.classList.remove('down'); this.release(a); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }

    const pad = root.querySelector('[data-pad]');
    let padId = null;
    const steer = e => {
      const r = pad.getBoundingClientRect(), rad = r.width / 2;
      let dx = (e.clientX - r.left - rad) / rad, dy = (e.clientY - r.top - rad) / rad;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      pad.style.setProperty('--tx', dx.toFixed(2)); pad.style.setProperty('--ty', dy.toFixed(2));
      const want = new Set();
      if (m > 0.25) {
        if (dx < -0.38) want.add('left'); if (dx > 0.38) want.add('right');
        if (dy < -0.45) want.add('up'); if (dy > 0.45) want.add('down');
        if (m > 0.86 && Math.abs(dx) > 0.6) want.add('run');   // shoved to the rim: run
      }
      for (const a of this.padActs) if (!want.has(a)) { this.padActs.delete(a); this.release(a); }
      for (const a of want) if (!this.padActs.has(a)) { this.padActs.add(a); this.press(a); }
    };
    const endPad = () => { padId = null; pad.style.setProperty('--tx', 0); pad.style.setProperty('--ty', 0); for (const a of this.padActs) this.release(a); this.padActs.clear(); };
    pad.addEventListener('pointerdown', e => { e.preventDefault(); padId = e.pointerId; capture(pad, e); steer(e); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === padId) steer(e); });
    pad.addEventListener('pointerup', endPad); pad.addEventListener('pointercancel', endPad);

    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse) this.enable();
    addEventListener('touchstart', () => this.enable(), { passive: true });
    addEventListener('keydown', () => this.disable());
  },
  enable() {
    Input.usingTouch = true;
    if (this.on) return;
    this.on = true;
    document.body.classList.add('touch-on');
    if (typeof fit === 'function') fit();
  },
  disable() {
    Input.usingTouch = false;
    if (!this.on) return;
    this.on = false;
    document.body.classList.remove('touch-on');
    this.held.clear(); this.padActs.clear();
    if (typeof fit === 'function') fit();
  },
  press(a) {
    if (typeof Audio8 !== 'undefined') Audio8.init();
    if (!this.held.has(a)) Input.downs.add(a);   // counts even if released before the next frame
    this.held.add(a);
  },
  release(a) { this.held.delete(a); },
};

// Sign and menu text mention keyboard keys; on touch, name the on-screen buttons instead.
function touchify(s) {
  return s
    .replace('HOLD SHIFT TO RUN', 'PUSH THE PAD ALL THE WAY TO RUN')
    .replace('A/D OR ARROWS', 'THE PAD').replace('WITH WASD', 'WITH THE PAD').replace('A/D TO', 'LEFT/RIGHT TO')
    .replace('Q OR TAB', 'SWAP').replace('HOLD S + E', 'HOLD DOWN + USE').replace('S OR DOWN', 'DOWN')
    .replace(/\bSPACE\b/g, 'JUMP').replace(/\bPRESS E\b/g, 'TAP USE').replace(/\bHOLD E\b/g, 'HOLD USE')
    .replace(/\bE\b/g, 'USE').replace(/\bPRESS F\b/g, 'TAP CALL').replace(/\bF\b/g, 'CALL')
    .replace(/\bPRESS C\b/g, 'TAP SKILL').replace(/\bHOLD C\b/g, 'HOLD SKILL').replace(/\bC\b/g, 'SKILL')
    .replace(/\bHOLD S\b/g, 'HOLD DOWN').replace(/\bS TO\b/g, 'DOWN TO').replace(/\bHOLD W\b/g, 'HOLD UP');
}
