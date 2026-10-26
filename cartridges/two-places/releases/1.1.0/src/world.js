// World: one loaded level, its bodies, devices and the fixed-step simulation.
// Pure logic (no canvas), so tests/run.mjs can drive it headless.

const TILE = 16;
const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_GRATE = 3, T_SPIKE = 4;

const PHYS = {
  grav: 0.28, cutGrav: 0.34, maxFall: 6,
  walk: 1.5, run: 2.4, crawl: 0.8, carryRun: 1.9, push: 0.7,
  accelG: 0.32, accelA: 0.2, decelG: 0.45, decelA: 0.06,
  jumpV: 5.0, djumpV: 4.4, coyote: 6, buffer: 7,
  glideFall: 0.55, glideTime: 72, glideSpeed: 2.5,
  dw: 14, standH: 38, crouchH: 26,
  rcW: 12, rcH: 11, rcSpeed: 1.8, rcFast: 2.6, rcAccel: 0.22, rcSink: 0.07, rcMaxSink: 1.5,
  crate: 14,
  gooLife: 600, smokeLife: 240, smokeCD: 360, fanForce: 0.42, climb: 1.1, shimmy: 1.1,
  shadowSee: 24,
};

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rectHit = (x, y, w, h, r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
const center = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

class World {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.W = def.grid[0].length;
    this.H = def.grid.length;
    this.tiles = new Uint8Array(this.W * this.H);
    this.crates = []; this.blocks = []; this.plates = []; this.buttons = []; this.levers = [];
    this.cranks = []; this.doors = []; this.movers = []; this.zaps = []; this.apples = []; this.signs = [];
    this.fans = []; this.shadows = []; this.smokes = []; this.portals = []; this.boxes = []; this.straws = []; this.puddles = [];
    this.goo = new Map(); // tile index -> { until: frame, thick }
    this.powers = def.world >= 2; // smoke + goo unlock in world 2
    this.events = []; this.fx = []; this.toasts = [];
    this.frame = 0; this.active = 'droober'; this.state = 'play'; this.stateT = 0;
    this.signal = new Map();
    const codes = { '#': T_SOLID, '=': T_ONEWAY, '%': T_GRATE, '^': T_SPIKE };
    def.grid.forEach((row, ty) => [...row].forEach((ch, tx) => {
      this.tiles[ty * this.W + tx] = codes[ch] || T_EMPTY;
      if (ch === 'D') this.droober = this.makeDroober(tx, ty);
      else if (ch === 'R') this.rc = this.makeRC(tx * TILE + 2, (ty + 1) * TILE - PHYS.rcH);
      else if (ch === 'E') this.exit = { x: tx * TILE, y: (ty + 1) * TILE - 48, w: 32, h: 48 };
      else if (ch === 'a' || ch === 'j') this.apples.push({ x: tx * TILE + 3, y: ty * TILE + 2, w: 10, h: 12, got: false });
      else if (ch === 'c') this.crates.push(this.makeCrate(tx * TILE + 1, (ty + 1) * TILE - PHYS.crate));
      else if (ch === 'B') this.blocks.push(this.makeBody('block', tx * TILE, (ty + 1) * TILE - 32, 32, 32));
    }));
    if (!this.droober) throw new Error(def.name + ': no Droober spawn');
    if (!this.rc) this.rc = this.makeRC(this.droober.x, this.droober.y - PHYS.rcH);
    if (def.rcRiding) this.rc.mode = 'ride';
    for (const o of def.objs || []) this.addObj(o);
    this.appleTotal = this.apples.length;
    this.camX = 0; this.camY = 0;
    this.snapCamera();
  }

  // ---------- construction ----------
  makeBody(kind, x, y, w, h) { return { kind, x, y, w, h, vx: 0, vy: 0, rx: 0, ry: 0, onGround: false, sx: x, sy: y }; }
  makeDroober(tx, ty) {
    const b = this.makeBody('droober', tx * TILE + 1, (ty + 1) * TILE - PHYS.standH, PHYS.dw, PHYS.standH);
    Object.assign(b, { facing: 1, crouch: false, jumps: 0, coyote: 0, buffer: 0, carry: null, glideT: 0, gliding: false,
      pushing: false, cranking: null, drop: 0, anim: 0, landT: 0, dead: false, wasGround: true,
      straws: 0, smokeCD: 0, cling: 0, hang: false, portalCD: 0 });
    return b;
  }
  makeRC(x, y) {
    const b = this.makeBody('rc', x, y, PHYS.rcW, PHYS.rcH);
    Object.assign(b, { mode: 'free', facing: 1, anim: 0, mountT: 0, followT: 0, dead: false, thick: 0, painting: false, portalCD: 0 });
    return b;
  }
  makeCrate(x, y) { return Object.assign(this.makeBody('crate', x, y, PHYS.crate, PHYS.crate), { held: false }); }

  addObj(o) {
    const x = o.x * TILE, y = o.y * TILE;
    switch (o.t) {
      case 'plate': this.plates.push({ x, y: y + TILE - 4, w: TILE, h: 4, floor: y + TILE, ch: o.ch, heavy: !!o.heavy, on: false, was: false }); break;
      case 'button': this.buttons.push({ x, y, w: TILE, h: TILE, ch: o.ch, time: o.time || 0, timer: 0, latched: false, on: false, flash: 0 }); break;
      case 'lever': this.levers.push({ x, y, w: TILE, h: TILE, ch: o.ch, on: !!o.on, flip: 0 }); break;
      case 'crank': this.cranks.push({ x, y, w: TILE, h: TILE, ch: o.ch, angle: 0, turning: false }); break;
      case 'door': this.doors.push({ x: x + 2, y, w: 12, fullH: (o.h || 3) * TILE, h: (o.h || 3) * TILE, open: 0, ch: o.ch, need: o.need || 1, inv: !!o.inv, solid: true, kind: 'door' }); break;
      case 'mover': {
        const w = (o.w || 3) * TILE;
        this.movers.push({ kind: 'mover', x, y, w, h: 8, ax: x, ay: y, bx: x + (o.dx || 0) * TILE, by: y + (o.dy || 0) * TILE,
          t: o.start || 0, target: o.start || 0, ch: o.ch, crank: o.crank, loop: !!o.loop, speed: o.speed || 0.8, dir: 1, solid: true, rx: 0, ry: 0, moving: false });
        break;
      }
      case 'zap': {
        const len = (o.len || 3) * TILE, v = o.dir === 'v';
        this.zaps.push({ ex: x, ey: y, x: v ? x + 6 : x, y: v ? y : y + 6, w: v ? 4 : len, h: v ? len : 4, v, ch: o.ch, inv: !!o.inv, blink: o.blink || 0, phase: o.phase || 0, on: true });
        break;
      }
      case 'sign': this.signs.push({ x, y, w: TILE, h: TILE, text: o.text }); break;
      case 'fan': {
        const dir = o.dir || 'u', len = (o.len || 4) * TILE, wd = (o.w || 1) * TILE;
        const r = dir === 'u' ? { x, y: y - len, w: wd, h: len } : dir === 'd' ? { x, y: y + TILE, w: wd, h: len }
          : dir === 'l' ? { x: x - len, y, w: len, h: wd } : { x: x + TILE, y, w: len, h: wd };
        this.fans.push({ x, y, w: dir === 'u' || dir === 'd' ? wd : TILE, h: dir === 'u' || dir === 'd' ? TILE : wd, dir, region: r, ch: o.ch, inv: !!o.inv, on: true, spin: 0 });
        break;
      }
      case 'shadow': {
        const sx = x + 1, x0 = o.x0 != null ? o.x0 * TILE + 1 : sx, x1 = o.x1 != null ? o.x1 * TILE + 1 : sx;
        this.shadows.push({ kind: 'shadow', x: sx, y: y + TILE - 26, w: 14, h: 26, fx: sx, x0, x1, speed: o.speed || 0.5, facing: o.facing || 1,
          range: (o.range || 6) * TILE, wait: 0, alert: 0, turn: o.turn || 0, t: 0, sight: null });
        break;
      }
      case 'portal': {
        const face = o.face || 'none';
        const r = face === 'none' ? { x: x + 2, y: y - TILE, w: 12, h: 32 } : face === 'up' ? { x, y: y + TILE - 4, w: 32, h: 4 } : { x, y, w: 32, h: 4 };
        this.portals.push({ ...r, pair: o.pair, face, ch: o.ch, box: o.box, active: false, spin: 0 });
        break;
      }
      case 'juicebox': this.boxes.push({ x, y, w: TILE, h: TILE, id: o.id, powered: false }); break;
      case 'straw': this.straws.push({ x: x + 4, y: y + 2, w: 8, h: 12, got: false }); break;
      case 'puddle': this.puddles.push({ x, y: y + TILE - 4, w: TILE, h: 4, amount: o.amount || 6, used: false }); break;
      default: throw new Error('unknown object ' + o.t);
    }
  }

  // ---------- tiles & collision ----------
  tile(tx, ty) {
    if (tx < 0 || tx >= this.W) return T_SOLID;
    if (ty < 0) return T_SOLID;
    if (ty >= this.H) return T_EMPTY;
    return this.tiles[ty * this.W + tx];
  }
  solids() {
    const out = [];
    for (const d of this.doors) if (d.h > 0) out.push(d);
    for (const m of this.movers) out.push(m);
    for (const b of this.blocks) out.push(b);
    for (const c of this.crates) if (!c.held) out.push(c);
    return out;
  }
  collide(b, x, y, dy) {
    const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + b.w - 1) / TILE);
    const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + b.h - 1) / TILE);
    if (b.kind === 'rc' && y + b.h > this.H * TILE) return true;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const c = this.tile(tx, ty);
      if (c === T_SOLID) return true;
      if (c === T_GRATE && b.kind !== 'rc') return true;
      if (c === T_ONEWAY && dy > 0 && !b.drop) {
        const top = ty * TILE;
        if (b.y + b.h <= top && y + b.h > top) return true;
      }
    }
    for (const s of this.solids()) {
      if (s === b || s.ghost || s === b.carry) continue;
      if (rectHit(x, y, b.w, b.h, s)) return true;
    }
    if (b.carry) {
      const c = b.carry;
      if (this.collide(c, x + ((b.w - c.w) >> 1), y - c.h, dy)) return true;
    }
    return false;
  }
  // one pixel step with collision; returns success
  stepBody(b, sx, sy) {
    if (this.collide(b, b.x + sx, b.y + sy, sy)) return false;
    b.x += sx; b.y += sy;
    if (b.carry) this.syncCarry(b);
    return true;
  }
  moveX(b, amt, onBlock) {
    b.rx += amt;
    let m = Math.round(b.rx);
    if (!m) return false;
    b.rx -= m;
    const s = Math.sign(m);
    while (m) {
      if (!this.stepBody(b, s, 0)) {
        if (onBlock && onBlock(s)) { m -= s; continue; }
        b.rx = 0; return true;
      }
      m -= s;
    }
    return false;
  }
  moveY(b, amt) {
    b.ry += amt;
    let m = Math.round(b.ry);
    if (!m) return false;
    b.ry -= m;
    const s = Math.sign(m);
    while (m) {
      if (!this.stepBody(b, 0, s)) { b.ry = 0; return true; }
      m -= s;
    }
    return false;
  }
  grounded(b) { return this.collide(b, b.x, b.y + 1, 1); }

  bodies() {
    const out = [];
    if (!this.droober.dead) out.push(this.droober);
    if (this.rc.mode !== 'ride' && !this.rc.dead) out.push(this.rc);
    for (const c of this.crates) if (!c.held) out.push(c);
    for (const b of this.blocks) out.push(b);
    return out;
  }
  // move a solid (mover / block / crate) one pixel, carrying riders and shoving whatever it runs into
  stepSolid(s, sx, sy) {
    const riders = this.bodies().filter(b => b !== s && b.y + b.h === s.y && b.x < s.x + s.w && b.x + b.w > s.x);
    s.ghost = true;
    if (sy < 0) for (const r of riders) this.stepBody(r, 0, sy);
    s.x += sx; s.y += sy;
    if (sx) for (const r of riders) this.stepBody(r, sx, 0);
    if (sy > 0) for (const r of riders) this.stepBody(r, 0, sy);
    for (const b of this.bodies()) {
      if (b === s || riders.includes(b) || !overlaps(b, s)) continue;
      if (!this.stepBody(b, sx, sy)) this.crush(b);
    }
    s.ghost = false;
  }
  crush(b) {
    if (b.kind === 'droober') this.kill('squish');
    else if (b.kind === 'rc') this.killRC();
  }

  // ---------- signals ----------
  count(ch) { return this.signal.get(ch) || 0; }
  computeSignals() {
    this.signal.clear();
    const add = ch => ch != null && this.signal.set(ch, (this.signal.get(ch) || 0) + 1);
    for (const p of this.plates) if (p.on) add(p.ch);
    for (const b of this.buttons) if (b.on) add(b.ch);
    for (const l of this.levers) if (l.on) add(l.ch);
  }

  // ---------- update ----------
  update(inp) {
    this.frame++;
    this.events.length = 0;
    if (this.state !== 'play') { this.stateT++; this.updateFx(); this.updateCamera(); return; }

    const d = this.droober, rc = this.rc;
    const di = this.active === 'droober' ? inp : null;
    const ri = this.active === 'rc' ? inp : null;

    if (inp.pressed.swap) this.swap();
    if (inp.pressed.call) this.callRC();

    this.updateDevicesPre();
    this.updateGoo();
    this.updateDroober(di);
    this.updateRC(ri);
    this.updateCrates();
    this.updateBlocks();
    this.updatePlates();
    this.computeSignals();
    this.updateDevicesPost();
    this.updateWorld2();
    this.checkPortals();
    this.updateShadows();
    this.checkHazards();
    this.checkPickups();
    this.checkExit();
    this.updateFx();
    this.updateCamera();
  }

  swap() {
    const rc = this.rc;
    if (this.active === 'droober') {
      if (rc.mode === 'ride') this.dismountRC(true);
      rc.mode = 'free';
      this.active = 'rc';
    } else this.active = 'droober';
    this.emit('swap');
  }
  callRC() {
    const d = this.droober, rc = this.rc;
    if (rc.mode === 'ride') { this.dismountRC(false); return; }
    const dc = center(d), rcc = center(rc);
    const dist = Math.hypot(dc.x - rcc.x, dc.y - rcc.y);
    if (dist < 44) this.mountRC();
    else if (this.active === 'droober') {
      rc.mode = rc.mode === 'follow' ? 'free' : 'follow';
      rc.followT = 0;
      this.toast(rc.mode === 'follow' ? 'RC IS COMING!' : 'RC, STAY.');
      this.emit(rc.mode === 'follow' ? 'call' : 'stay');
    } else this.toast('GET CLOSER TO DROOBER');
  }
  mountRC() {
    const rc = this.rc;
    rc.mode = 'ride'; rc.mountT = 12; rc.vx = rc.vy = 0;
    this.active = 'droober';
    this.emit('mount');
    this.puff(rc.x + 6, rc.y + 6, '#1cd2f0', 6);
  }
  dismountRC(toControl) {
    const rc = this.rc, d = this.droober;
    rc.mode = 'free';
    this.placeRCAbove();
    rc.vy = toControl ? -1 : -1.5; rc.vx = toControl ? 0 : d.facing * 1.2;
    this.emit('dismount');
  }
  placeRCAbove() {
    const rc = this.rc, d = this.droober;
    const top = d.carry ? d.carry.y : d.y;
    rc.x = Math.round(d.x + d.w / 2 - rc.w / 2); rc.y = Math.round(top - rc.h);
    if (this.collide(rc, rc.x, rc.y, 0)) { rc.y = Math.round(d.y + 4); }
    rc.rx = rc.ry = 0;
  }

  // ----- Droober -----
  updateDroober(inp) {
    const d = this.droober;
    if (d.dead) return;
    const left = inp && inp.held.left, right = inp && inp.held.right;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const down = inp && inp.held.down, run = inp && inp.held.run;
    const jumpP = inp && inp.pressed.jump, jumpH = inp && inp.held.jump;
    const actP = inp && inp.pressed.act, actH = inp && inp.held.act;
    d.onGround = this.grounded(d);
    if (d.onGround) { d.coyote = PHYS.coyote; d.jumps = 0; d.glideT = 0; }
    else if (d.coyote > 0) { d.coyote--; if (!d.coyote && d.jumps === 0) d.jumps = 1; }
    if (d.drop > 0) d.drop--;

    // crank
    d.cranking = null;
    if (inp && actH && d.onGround && !d.carry) {
      const k = this.cranks.find(k => overlaps(d, k));
      if (k) { d.cranking = k; if (actP) this.startCrank(k); }
    }

    // crouch
    const wantCrouch = !!down && d.onGround && !d.carry && !d.cranking;
    if (wantCrouch && !d.crouch) { d.crouch = true; d.y += PHYS.standH - PHYS.crouchH; d.h = PHYS.crouchH; }
    else if (!wantCrouch && d.crouch) {
      const ny = d.y - (PHYS.standH - PHYS.crouchH);
      if (!this.collide({ ...d, h: PHYS.standH, carry: null }, d.x, ny, -1)) { d.crouch = false; d.y = ny; d.h = PHYS.standH; }
    }

    // interact / grab / throw
    if (actP && !d.cranking) this.drooberAct(d, down);

    // smoke puff
    if (d.smokeCD > 0) d.smokeCD--;
    if (inp && inp.pressed.ability && this.powers) {
      if (d.smokeCD === 0) {
        const c = center(d);
        this.smokes.push({ x: c.x - 34, y: c.y - 34, w: 68, h: 60, life: PHYS.smokeLife });
        d.smokeCD = PHYS.smokeCD; this.emit('smoke');
      } else this.emit('nope');
    }

    // goo: hang from gooey ceilings, climb gooey walls
    if (d.hang || d.cling) { if (this.updateGooMove(d, inp, dir, down, jumpP)) return; }

    // horizontal
    let max = d.crouch ? PHYS.crawl : run ? (d.carry ? PHYS.carryRun : PHYS.run) : PHYS.walk;
    if (d.pushing) max = Math.min(max, PHYS.push);
    if (d.gliding) max = PHYS.glideSpeed;
    if (d.cranking) max = 0;
    const target = dir * max;
    const accel = d.onGround ? (dir ? PHYS.accelG : PHYS.decelG) : (dir ? PHYS.accelA : PHYS.decelA);
    if (d.vx < target) d.vx = Math.min(target, d.vx + accel);
    else if (d.vx > target) d.vx = Math.max(target, d.vx - accel);
    if (dir) d.facing = dir;

    // jump
    if (jumpP) d.buffer = PHYS.buffer; else if (d.buffer > 0) d.buffer--;
    if (d.buffer && down && d.onGround && this.onOneWay(d)) { d.drop = 10; d.buffer = 0; }
    else if (d.buffer && (d.onGround || d.coyote > 0) && d.jumps === 0) {
      d.vy = -PHYS.jumpV; d.jumps = 1; d.buffer = 0; d.coyote = 0;
      if (d.crouch) this.uncrouchForce(d);
      this.emit('jump'); this.dust(d, 3);
    } else if (jumpP && !d.onGround && d.jumps < 2 && !d.carry && !d.crouch) {
      d.vy = -PHYS.djumpV; d.jumps = 2; d.buffer = 0;
      this.emit('djump'); this.puff(d.x + d.w / 2, d.y + d.h, '#ffffff', 5);
    }

    // glide: RC holds Droober up after the double jump
    const canGlide = this.rc.mode === 'ride' && d.jumps === 2 && !d.carry && !d.onGround && d.vy > 0 && jumpH && d.glideT < PHYS.glideTime;
    if (canGlide) {
      if (!d.gliding) this.emit('glide');
      d.gliding = true; d.glideT++;
      d.vy = Math.min(d.vy + 0.08, PHYS.glideFall);
      if (!dir) d.vx += (d.facing * PHYS.glideSpeed * 0.7 - d.vx) * 0.05;
    } else {
      d.gliding = false;
      const g = (d.vy < 0 && !jumpH) ? PHYS.cutGrav + PHYS.grav : PHYS.grav;
      d.vy = Math.min(PHYS.maxFall, d.vy + g);
    }

    // move
    d.pushing = false;
    this.moveX(d, d.vx, s => this.tryPush(d, s));
    const hitY = this.moveY(d, d.vy);
    if (hitY) {
      if (d.vy > 0) {
        if (d.vy > 3) { this.emit('land'); this.dust(d, 4); d.landT = 6; }
        d.vy = 0;
      } else {
        d.vy = 0;
        if (!d.carry && this.gooAbove(d)) { d.hang = true; d.gliding = false; this.emit('stick'); }
        else this.emit('bonk');
      }
    }
    // pressing into a gooey wall grabs it
    if (!d.hang && !d.carry && dir && (!this.grounded(d) || (inp && inp.held.up)) && this.collide(d, d.x + dir, d.y, 0) && this.gooSide(d, dir)) {
      d.cling = dir; d.vx = 0; d.vy = 0; d.gliding = false; this.emit('stick');
    }
    const g2 = this.grounded(d);
    if (g2 && !d.wasGround && !hitY) d.landT = 4;
    d.wasGround = g2;
    if (d.landT) d.landT--;
    if (d.onGround && Math.abs(d.vx) > 1.8 && this.frame % 9 === 0) this.dust(d, 1);
    d.anim += Math.abs(d.vx) * 0.12 + 0.02;
    if (d.y > this.H * TILE + 40) this.kill('fall');
  }
  onOneWay(d) {
    const ty = Math.floor((d.y + d.h) / TILE);
    for (let tx = Math.floor(d.x / TILE); tx <= Math.floor((d.x + d.w - 1) / TILE); tx++) if (this.tile(tx, ty) === T_ONEWAY) return true;
    return false;
  }
  uncrouchForce(d) {
    const ny = d.y - (PHYS.standH - PHYS.crouchH);
    if (!this.collide({ ...d, h: PHYS.standH, carry: null }, d.x, ny, -1)) { d.crouch = false; d.y = ny; d.h = PHYS.standH; }
  }
  // called when Droober is blocked one pixel sideways; shove crates/blocks along the ground
  tryPush(d, s) {
    if (!d.onGround) return false;
    const probe = { x: d.x + s, y: d.y, w: d.w, h: d.h };
    const obj = [...this.blocks, ...this.crates.filter(c => !c.held)].find(o => rectHit(probe.x, probe.y, probe.w, probe.h, o) && o.y + o.h > d.y + d.h - 10 && o.y >= d.y + d.h - 34);
    if (!obj) return false;
    d.pushing = true;
    if (!this.grounded(obj)) return false;
    if (this.collide(obj, obj.x + s, obj.y, 0)) return false;
    this.stepSolid(obj, s, 0);
    if (this.frame % 14 === 0) { this.emit(obj.kind === 'block' ? 'pushHeavy' : 'push'); this.dust(obj, 1); }
    return this.stepBody(d, s, 0);
  }
  drooberAct(d, down) {
    if (d.carry) { this.throwCrate(d, down); return; }
    const near = o => rectHit(d.x - 2, d.y, d.w + 4, d.h, o);
    const lever = this.levers.find(near);
    if (lever) { this.toggleLever(lever); return; }
    const btn = this.buttons.find(near);
    if (btn) { this.pressButton(btn); return; }
    if (this.cranks.find(near)) return;
    const box = this.boxes.find(b => !b.powered && rectHit(d.x - 8, d.y, d.w + 16, d.h, b));
    if (box) {
      if (d.straws > 0) { d.straws--; box.powered = true; this.emit('sip'); this.puff(box.x + 8, box.y, '#f6c02c', 12); this.toast('JUICE POWER! THE PORTALS WAKE UP.'); }
      else { this.toast('NEEDS A STRAW'); this.emit('nope'); }
      return;
    }
    // pick up a crate in reach (in front at foot/waist level)
    const rx = d.facing > 0 ? d.x + d.w - 2 : d.x - 10;
    const crate = this.crates.find(c => !c.held && rectHit(rx, d.y + 8, 12, d.h - 6, c) && c.y >= d.y - 4);
    if (crate) {
      if (this.bodies().some(b => b !== crate && b.kind !== 'block' && b.y + b.h === crate.y && b.x < crate.x + crate.w && b.x + b.w > crate.x && b !== d)) { this.toast('SOMETHING IS ON IT'); return; }
      const cx = d.x + ((d.w - crate.w) >> 1), cy = d.y - crate.h;
      crate.held = true;
      if (this.collide(crate, cx, cy, 0)) { crate.held = false; this.toast('NO ROOM TO LIFT'); this.emit('nope'); return; }
      d.carry = crate; crate.vx = crate.vy = 0; this.syncCarry(d);
      if (d.crouch) this.uncrouchForce(d);
      this.emit('pickup');
      return;
    }
    if (this.signs.some(near)) return;
    this.emit('nope');
  }
  syncCarry(d) {
    const c = d.carry;
    c.x = d.x + ((d.w - c.w) >> 1); c.y = d.y - c.h;
  }
  throwCrate(d, gentle) {
    const c = d.carry;
    c.held = false;
    if (gentle) {
      // set it down in front, at the feet
      const fx = d.facing > 0 ? d.x + d.w + 1 : d.x - c.w - 1, fy = d.y + d.h - c.h;
      if (!this.collide(c, fx, fy, 0)) { c.x = fx; c.y = fy; c.vx = 0; c.vy = 0; d.carry = null; this.emit('drop'); return; }
      if (!this.collide(c, c.x, c.y, 0)) { c.vx = 0; c.vy = 0; d.carry = null; this.emit('drop'); return; }
    } else if (!this.collide(c, c.x, c.y, 0)) {
      c.vx = d.facing * 2.6 + d.vx * 0.4; c.vy = -2.4; d.carry = null; this.emit('throw'); return;
    }
    c.held = true; this.toast('NO ROOM'); this.emit('nope');
  }

  // ----- RC -----
  updateRC(inp) {
    const rc = this.rc, d = this.droober;
    if (rc.dead) return;
    rc.anim += 0.08;
    if (rc.mountT > 0) rc.mountT--;
    if (rc.mode === 'ride') {
      const top = d.carry ? d.carry.y : d.y + (d.crouch ? 2 : 4);
      rc.x = Math.round(d.x + d.w / 2 - rc.w / 2); rc.y = Math.round(top - rc.h + 3);
      rc.facing = d.facing;
      return;
    }
    let ix = 0, iy = 0, fast = false;
    if (inp) {
      ix = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
      iy = (inp.held.down ? 1 : 0) - ((inp.held.up || inp.held.jump) ? 1 : 0);
      fast = inp.held.run;
      if (inp.pressed.act) this.rcAct(rc);
    } else if (rc.mode === 'follow') {
      const dc = center(d), rcc = center(rc);
      const dx = dc.x - rcc.x, dy = (d.y - 4) - rcc.y, dist = Math.hypot(dx, dy);
      if (dist < 22) { this.mountRC(); return; }
      ix = dx / dist; iy = dy / dist; fast = true;
      if (rc.climbT > 0) { rc.climbT--; iy = -1; ix = Math.sign(dx) * 0.3; }   // bumped into something: go over it
      if (++rc.followT > 900) { rc.mode = 'free'; this.toast('RC GOT STUCK'); }
    }
    const len = Math.hypot(ix, iy) || 1;
    const sp = fast ? PHYS.rcFast : PHYS.rcSpeed;
    const tx = ix / len * sp, ty = iy / len * sp;
    if (ix) { rc.vx += Math.sign(tx - rc.vx) * Math.min(Math.abs(tx - rc.vx), PHYS.rcAccel); rc.facing = Math.sign(ix); }
    else rc.vx *= 0.82;
    if (iy) rc.vy += Math.sign(ty - rc.vy) * Math.min(Math.abs(ty - rc.vy), PHYS.rcAccel);
    else if (inp) rc.vy *= 0.85;                       // hovers while you steer him
    else rc.vy = Math.min(PHYS.rcMaxSink, rc.vy + PHYS.rcSink); // left alone, the goo settles
    this.fanPush(rc);
    rc.painting = !!(inp && inp.held.ability && this.powers);
    if (this.moveX(rc, rc.vx)) { rc.vx = 0; if (rc.mode === 'follow' && !rc.climbT) rc.climbT = 28; }
    if (this.moveY(rc, rc.vy)) { if (rc.vy > 1) this.emit('splat'); rc.vy = 0; }
    if (rc.painting) this.paintGoo(rc);
    rc.onGround = this.grounded(rc);
    if (Math.abs(rc.vx) + Math.abs(rc.vy) > 1.2 && this.frame % 12 === 0) this.fx.push({ kind: 'drip', x: rc.x + 6, y: rc.y + rc.h, vx: 0, vy: 0.5, life: 30, color: '#1cd2f0' });
  }
  rcAct(rc) {
    const near = o => rectHit(rc.x - 3, rc.y - 3, rc.w + 6, rc.h + 6, o);
    const lever = this.levers.find(near);
    if (lever) { this.toggleLever(lever); return; }
    const btn = this.buttons.find(near);
    if (btn) { this.pressButton(btn); return; }
    if (this.cranks.find(near)) { this.toast('TOO HEAVY FOR GOO. DROOBER HAS TO CRANK IT.'); this.emit('nope'); return; }
    if (this.boxes.find(b => !b.powered && near(b))) { this.toast("RC CAN'T HOLD A STRAW. DROOBER CAN."); this.emit('nope'); return; }
    if (this.crates.find(c => !c.held && near(c)) || this.blocks.find(near)) { this.toast("RC CAN'T LIFT THAT"); this.emit('nope'); return; }
    this.emit('blip');
  }

  // ----- crates & blocks -----
  updateCrates() {
    for (const c of this.crates) {
      if (c.held) continue;
      c.vy = Math.min(PHYS.maxFall, c.vy + PHYS.grav);
      this.fanPush(c);
      if (c.vx) {
        const s = Math.sign(c.vx);
        c.rx += c.vx; let m = Math.round(c.rx); c.rx -= m;
        while (m) { if (this.collide(c, c.x + s, c.y, 0)) { c.vx = 0; c.rx = 0; break; } this.stepSolid(c, s, 0); m -= s; }
      }
      const fallV = c.vy;
      if (this.moveY(c, c.vy)) { if (fallV > 2.5) this.emit('thud'); c.vy = 0; }
      c.onGround = this.grounded(c);
      if (c.onGround) { c.vx *= 0.7; if (Math.abs(c.vx) < 0.1) c.vx = 0; }
      if (c.y > this.H * TILE + 30) this.respawn(c);
    }
  }
  updateBlocks() {
    for (const b of this.blocks) {
      b.vy = Math.min(PHYS.maxFall, b.vy + PHYS.grav);
      const fallV = b.vy;
      if (this.moveY(b, b.vy)) { if (fallV > 2) this.emit('thudHeavy'); b.vy = 0; }
      if (b.y > this.H * TILE + 30) this.respawn(b);
    }
  }
  respawn(o) {
    o.x = o.sx; o.y = o.sy; o.vx = o.vy = 0;
    if (this.collide(o, o.x, o.y, 0)) o.y -= TILE;
    this.puff(o.x + o.w / 2, o.y + o.h / 2, '#f4ecd4', 8);
    this.emit('poof');
  }

  // ----- devices -----
  updatePlates() {
    const d = this.droober, rc = this.rc;
    const weights = [];
    if (!d.dead) weights.push({ b: d, heavy: true });
    if (rc.mode !== 'ride' && !rc.dead) weights.push({ b: rc, heavy: false });
    for (const c of this.crates) if (!c.held) weights.push({ b: c, heavy: true });
    for (const k of this.blocks) weights.push({ b: k, heavy: true });
    for (const p of this.plates) {
      p.was = p.on;
      p.on = weights.some(({ b, heavy }) => (heavy || !p.heavy) && b.y + b.h === p.floor && b.x < p.x + 14 && b.x + b.w > p.x + 2);
      if (p.on !== p.was) this.emit(p.on ? 'plateOn' : 'plateOff');
    }
  }
  toggleLever(l) { l.on = !l.on; l.flip = 8; this.emit('lever'); }
  pressButton(b) {
    b.flash = 10;
    if (b.time) { b.timer = b.time; b.on = true; this.emit('button'); }
    else if (!b.latched) { b.latched = true; b.on = true; this.emit('button'); }
    else this.emit('blip');
  }
  startCrank(k) {
    for (const m of this.movers) if (m.crank === k.ch && m.t === m.target) m.target = 1 - m.target;
  }
  updateDevicesPre() {
    for (const b of this.buttons) {
      if (b.flash) b.flash--;
      if (b.time && b.timer > 0) {
        b.timer--;
        if (b.timer % 30 === 0 && b.timer > 0) this.emit(b.timer < 90 ? 'tickFast' : 'tick');
        if (!b.timer) { b.on = false; this.emit('timeout'); }
      }
    }
    for (const l of this.levers) if (l.flip) l.flip--;
  }
  updateDevicesPost() {
    for (const dr of this.doors) {
      const n = this.count(dr.ch);
      let open = n >= dr.need;
      if (dr.inv) open = !open;
      const prev = dr.open;
      dr.open = Math.max(0, Math.min(1, dr.open + (open ? 0.08 : -0.06)));
      let nh = Math.round(dr.fullH * (1 - dr.open));
      if (nh > dr.h) {
        // closing: never close onto someone
        const probe = { x: dr.x, y: dr.y, w: dr.w, h: nh };
        if (this.bodies().some(b => overlaps(b, probe)) || (this.droober.carry && overlaps(this.droober.carry, probe))) { dr.open = prev; nh = dr.h; }
      }
      if ((prev === 0 && dr.open > 0) || (prev === 1 && dr.open < 1)) this.emit('door');
      dr.h = nh;
    }
    const d = this.droober;
    for (const k of this.cranks) {
      k.turning = d.cranking === k;
      if (k.turning) k.angle += 0.15;
    }
    for (const m of this.movers) {
      let goal = m.t;
      const span = Math.hypot(m.bx - m.ax, m.by - m.ay) || 1;
      const dt = m.speed / span;
      if (m.crank != null) {
        if (this.cranks.some(k => k.turning && k.ch === m.crank)) goal = m.target;
      } else if (m.loop) {
        if (m.wait > 0) m.wait--;                      // dwell at each end so riders can step off
        else if (m.ch == null || this.count(m.ch) > 0) {
          goal = m.dir > 0 ? 1 : 0;
          if (m.t === goal) { m.dir = -m.dir; m.wait = 60; goal = m.t; }
        }
      } else goal = this.count(m.ch) > 0 ? 1 : 0;
      const prevT = m.t;
      if (goal > m.t) m.t = Math.min(goal, m.t + dt); else if (goal < m.t) m.t = Math.max(goal, m.t - dt);
      m.moving = m.t !== prevT;
      const nx = Math.round(m.ax + (m.bx - m.ax) * m.t), ny = Math.round(m.ay + (m.by - m.ay) * m.t);
      while (m.x !== nx || m.y !== ny) {
        const sx = Math.sign(nx - m.x), sy = sx ? 0 : Math.sign(ny - m.y);
        this.stepSolid(m, sx, sy);
      }
      if (m.moving && this.frame % 20 === 0) this.emit('hum');
    }
    for (const z of this.zaps) {
      let on = true;
      if (z.ch != null) on = this.count(z.ch) > 0 ? z.inv : !z.inv;
      if (z.blink && on) on = ((this.frame + z.phase) % z.blink) < z.blink * 0.55;
      if (on && !z.on) this.emit('zapOn');
      z.on = on;
    }
  }

  // ---------- hazards / pickups / exit ----------
  checkHazards() {
    const d = this.droober, rc = this.rc;
    if (!d.dead) {
      const tx0 = Math.floor(d.x / TILE), tx1 = Math.floor((d.x + d.w - 1) / TILE);
      const ty0 = Math.floor(d.y / TILE), ty1 = Math.floor((d.y + d.h - 1) / TILE);
      outer: for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++)
        if (this.tile(tx, ty) === T_SPIKE && rectHit(d.x, d.y, d.w, d.h, { x: tx * TILE + 2, y: ty * TILE + 7, w: 12, h: 9 })) { this.kill('spike'); break outer; }
      if (!d.dead && this.zaps.some(z => z.on && overlaps(d, z))) this.kill('zap');
    }
    if (!rc.dead && rc.mode !== 'ride' && this.zaps.some(z => z.on && overlaps(rc, z))) this.killRC();
  }
  kill(why) {
    const d = this.droober;
    if (d.dead || this.state !== 'play') return;
    d.dead = true; d.deathWhy = why;
    if (d.carry) { d.carry.held = false; d.carry = null; }
    d.hang = false; d.cling = 0;
    this.state = 'dead'; this.stateT = 0;
    this.emit('die');
    this.puff(d.x + d.w / 2, d.y + d.h / 2, '#f39cc0', 14);
    this.puff(d.x + d.w / 2, d.y + 6, '#1cd2f0', 10);
  }
  killRC() {
    const rc = this.rc;
    if (rc.dead || this.state !== 'play') return;
    rc.dead = true;
    this.state = 'dead'; this.stateT = 0;
    this.emit('pop');
    this.puff(rc.x + 6, rc.y + 6, '#1cd2f0', 16);
  }
  checkPickups() {
    const d = this.droober, rc = this.rc;
    for (const j of this.apples) {
      if (j.got) continue;
      if ((!d.dead && overlaps(d, j)) || (rc.mode !== 'ride' && overlaps(rc, j))) {
        j.got = true; this.emit('apple');
        this.puff(j.x + 5, j.y + 6, '#f6c02c', 10);
      }
    }
  }
  applesGot() { return this.apples.filter(j => j.got).length; }
  checkExit() {
    const d = this.droober, rc = this.rc, e = this.exit;
    if (!e || d.dead) return;
    const inside = b => { const c = center(b); return c.x > e.x && c.x < e.x + e.w && c.y > e.y && c.y < e.y + e.h + 4; };
    this.exitD = inside(d) && d.onGround;
    this.exitR = rc.mode === 'ride' || inside(rc);
    if (this.exitD && this.exitR && d.carry && this.frame % 120 === 0) this.toast('PUT THE CRATE DOWN FIRST');
    if (this.exitD && this.exitR && !d.carry) {
      this.state = 'clear'; this.stateT = 0;
      this.emit('clear');
      for (let i = 0; i < 40; i++) this.fx.push({ kind: 'confetti', x: e.x + 16, y: e.y + 8, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4 - 1, life: 90, color: ['#f39cc0', '#1cd2f0', '#b6d846', '#f27e22', '#824cc8', '#f6c02c'][i % 6] });
    }
  }

  // ---------- world 2: goo ----------
  gooAt(tx, ty) {
    if (this.tile(tx, ty) !== T_SOLID) return null;
    const g = this.goo.get(ty * this.W + tx);
    return g && g.until > this.frame ? g : null;
  }
  gooAbove(d) {
    const ty = Math.floor((d.y - 1) / TILE);
    for (let tx = Math.floor(d.x / TILE); tx <= Math.floor((d.x + d.w - 1) / TILE); tx++) if (this.gooAt(tx, ty)) return true;
    return false;
  }
  gooSide(d, dir) {
    const tx = dir > 0 ? Math.floor((d.x + d.w) / TILE) : Math.floor((d.x - 1) / TILE);
    for (let ty = Math.floor((d.y + 4) / TILE); ty <= Math.floor((d.y + d.h - 6) / TILE); ty++) if (this.gooAt(tx, ty)) return true;
    return false;
  }
  updateGoo() {
    if (this.frame % 30 === 0) for (const [k, g] of this.goo) if (g.until <= this.frame) this.goo.delete(k);
  }
  paintGoo(rc) {
    // coats walls and ceilings RC is touching; never the floor under him
    const x0 = Math.floor((rc.x - 2) / TILE), x1 = Math.floor((rc.x + rc.w + 1) / TILE);
    const y0 = Math.floor((rc.y - 2) / TILE), y1 = Math.floor((rc.y + rc.h - 1) / TILE);
    let painted = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.tile(tx, ty) !== T_SOLID || ty * TILE >= rc.y + rc.h) continue;
      const k = ty * this.W + tx, g = this.goo.get(k);
      if (g && g.thick) continue;
      if (rc.thick > 0) { this.goo.set(k, { until: Infinity, thick: true }); rc.thick--; painted = true; }
      else { if (!g || g.until - this.frame < PHYS.gooLife - 20) painted = true; this.goo.set(k, { until: this.frame + PHYS.gooLife, thick: false }); }
    }
    if (painted && this.frame % 6 === 0) this.emit('goo');
  }
  // returns true when it fully handled Droober's movement this frame
  updateGooMove(d, inp, dir, down, jumpP) {
    if (d.hang) {
      if (!this.gooAbove(d) || jumpP || down || d.carry) { d.hang = false; d.vy = 0.5; return false; }
      d.vy = 0; d.jumps = 1; d.glideT = 0;
      d.vx = dir * PHYS.shimmy;
      if (dir) d.facing = dir;
      this.moveX(d, d.vx);
      if (!this.gooAbove(d)) { d.hang = false; return false; }
      d.anim += Math.abs(d.vx) * 0.1;
      return true;
    }
    if (d.cling) {
      const side = d.cling;
      if (jumpP) { // wall jump
        d.cling = 0; d.vx = -side * 2.4; d.vy = -4.6; d.jumps = 1; d.facing = -side;
        this.emit('jump'); return false;
      }
      if (dir === -side || !this.gooSide(d, side)) {
        const up = inp && inp.held.up;
        d.cling = 0;
        if (up && !this.collide(d, d.x + side, d.y - 4, 0)) d.vy = -3.2; // mantle over the top
        return false;
      }
      const up = inp && inp.held.up;
      d.vx = 0; d.vy = up ? -PHYS.climb : down ? PHYS.climb : 0; d.jumps = 1; d.glideT = 0;
      d.facing = side;
      if (this.moveY(d, d.vy) && d.vy > 0) { d.cling = 0; return false; }
      if (!up && !down) d.ry = 0;
      d.anim += Math.abs(d.vy) * 0.1;
      return true;
    }
    return false;
  }

  // ---------- world 2: fans, smoke, portals, shadows ----------
  fanPush(b) {
    for (const f of this.fans) {
      if (!f.on || !overlaps(b, f.region)) continue;
      const F = PHYS.fanForce;
      if (f.dir === 'u') b.vy -= F; else if (f.dir === 'd') b.vy += F; else if (f.dir === 'l') b.vx -= F; else b.vx += F;
      b.vx = Math.max(-3.2, Math.min(3.2, b.vx)); b.vy = Math.max(-3.2, Math.min(3.2, b.vy));
    }
  }
  updateWorld2() {
    for (const f of this.fans) {
      f.on = f.ch == null ? true : (this.count(f.ch) > 0) !== f.inv;
      if (f.on) { f.spin += 0.5; if (this.frame % 4 === 0) this.windFx(f); }
    }
    for (const sm of this.smokes) sm.life--;
    this.smokes = this.smokes.filter(sm => sm.life > 0);
    for (const p of this.portals) {
      const pair = this.portals.filter(q => q.pair === p.pair);
      const was = p.active;
      p.active = pair.length === 2 && pair.every(q => (q.box == null || this.boxes.some(b => b.id === q.box && b.powered)) && (q.ch == null || this.count(q.ch) > 0));
      if (p.active) p.spin += 0.15;
      if (p.active && !was) this.emit('portalOn');
    }
    const d = this.droober, rc = this.rc;
    for (const s of this.straws) if (!s.got && !d.dead && overlaps(d, s)) { s.got = true; d.straws++; this.emit('straw'); this.puff(s.x + 4, s.y + 6, '#ffffff', 6); }
    for (const p of this.puddles) if (!p.used && rc.mode !== 'ride' && overlaps(rc, p)) {
      p.used = true; rc.thick += p.amount; this.emit('slurp');
      this.toast('THICK GOO! WHAT RC PAINTS NOW STAYS PUT.');
    }
  }
  checkPortals() {
    const bodies = [this.droober, ...this.crates.filter(c => !c.held)];
    if (this.rc.mode !== 'ride') bodies.push(this.rc);
    for (const b of bodies) {
      if (b.dead) continue;
      if (b.portalCD > 0) { b.portalCD--; continue; }
      const p = this.portals.find(p => p.active && overlaps(b, p) &&
        (p.face === 'none' ? (() => { const c = center(b); return c.x > p.x && c.x < p.x + p.w; })() : p.face === 'up' ? b.vy >= 0 : b.vy <= 0));
      if (!p) continue;
      const q = this.portals.find(o => o !== p && o.pair === p.pair);
      const sp = Math.max(Math.abs(b.vx), Math.abs(b.vy), 2.5);
      let nx, ny, vx = b.vx, vy = b.vy;
      if (q.face === 'none') { nx = q.x + q.w / 2 - b.w / 2; ny = q.y + q.h - b.h; }
      else if (q.face === 'up') { nx = q.x + q.w / 2 - b.w / 2; ny = q.y - b.h - 1; vy = -Math.max(sp, 4.5); }
      else { nx = q.x + q.w / 2 - b.w / 2; ny = q.y + q.h + 1; vy = Math.max(Math.abs(b.vy), 1); vx = 0; }   // ceiling portal: drop straight down
      nx = Math.round(nx); ny = Math.round(ny);
      if (this.collide(b, nx, ny, 0)) continue;
      this.puff(b.x + b.w / 2, b.y + b.h / 2, '#f6c02c', 8);
      b.x = nx; b.y = ny; b.vx = vx; b.vy = vy; b.rx = b.ry = 0;
      if (b.carry) this.syncCarry(b);
      b.portalCD = 30;
      if (b.kind === 'droober') { b.hang = false; b.cling = 0; }
      this.puff(b.x + b.w / 2, b.y + b.h / 2, '#f6c02c', 8);
      this.emit('portal');
    }
  }
  sightRect(s) {
    // horizontal view band in front of the shadow, cut short by walls and closed doors
    const eyeY = s.y + 8, top = s.y - 18, bot = s.y + s.h;
    let len = 0;
    const step = s.facing;
    let x = step > 0 ? s.x + s.w : s.x;
    while (len < s.range) {
      const px = x + step * (len + 1);
      const tx = Math.floor(px / TILE);
      if (this.tile(tx, Math.floor(eyeY / TILE)) === T_SOLID || this.tile(tx, Math.floor((bot - 2) / TILE)) === T_SOLID) break;
      if (this.doors.some(d => d.h > 0 && px >= d.x && px < d.x + d.w && eyeY >= d.y && eyeY < d.y + d.h)) break;
      len++;
    }
    return step > 0 ? { x, y: top, w: len, h: bot - top } : { x: x - len, y: top, w: len, h: bot - top };
  }
  hiddenFrom(s, d) {
    const c = center(d);
    if (this.smokes.some(sm => c.x > sm.x && c.x < sm.x + sm.w && c.y > sm.y && c.y < sm.y + sm.h)) return true;
    const ex = s.x + s.w / 2, lo = Math.min(ex, c.x), hi = Math.max(ex, c.x);
    return this.smokes.some(sm => sm.x < hi && sm.x + sm.w > lo && sm.y < s.y + 10 && sm.y + sm.h > s.y + 6);
  }
  updateShadows() {
    const d = this.droober;
    for (const s of this.shadows) {
      s.t++;
      if (s.alert === 0) {
        if (s.wait > 0) { if (--s.wait === 0) s.facing = -s.facing; }
        else if (s.x0 !== s.x1) {
          s.fx += s.facing * s.speed;
          if (s.facing > 0 && s.fx >= s.x1) { s.fx = s.x1; s.wait = 50; }
          if (s.facing < 0 && s.fx <= s.x0) { s.fx = s.x0; s.wait = 50; }
          s.x = Math.round(s.fx);
        } else if (s.turn && s.t % s.turn === 0) s.facing = -s.facing;
      }
      s.sight = this.sightRect(s);
      if (d.dead) continue;
      const seen = overlaps(d, s.sight) && !this.hiddenFrom(s, d);
      if (overlaps(d, s)) { this.kill('shadow'); return; }
      if (seen) { if (s.alert === 0) this.emit('spotted'); s.alert++; } else s.alert = Math.max(0, s.alert - 2);
      if (s.alert >= PHYS.shadowSee) { this.kill('shadow'); return; }
    }
  }
  windFx(f) {
    const r = f.region;
    const v = { u: [0, -2], d: [0, 2], l: [-2, 0], r: [2, 0] }[f.dir];
    const x = f.dir === 'l' ? r.x + r.w : f.dir === 'r' ? r.x : r.x + Math.random() * r.w;
    const y = f.dir === 'u' ? r.y + r.h : f.dir === 'd' ? r.y : r.y + Math.random() * r.h;
    this.fx.push({ kind: 'wind', x, y, vx: v[0], vy: v[1], life: Math.max(r.w, r.h) / 2, color: 'rgba(255,255,255,0.7)' });
  }

  // ---------- fx / camera ----------
  emit(type) { this.events.push(type); }
  toast(text) { this.toasts = [{ text, t: 140 }]; }
  dust(b, n) {
    for (let i = 0; i < n; i++) this.fx.push({ kind: 'dust', x: b.x + b.w / 2 + (Math.random() - 0.5) * b.w, y: b.y + b.h - 1, vx: (Math.random() - 0.5) * 0.8, vy: -Math.random() * 0.5, life: 20 + Math.random() * 10, color: '#f4ecd4' });
  }
  puff(x, y, color, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.8; this.fx.push({ kind: 'dust', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: 25 + Math.random() * 15, color }); }
  }
  updateFx() {
    for (const p of this.fx) { p.x += p.vx; p.y += p.vy; p.vy += p.kind === 'confetti' ? 0.08 : p.kind === 'drip' ? 0.05 : p.kind === 'wind' ? 0 : 0.02; p.vx *= 0.97; p.life--; }
    this.fx = this.fx.filter(p => p.life > 0);
    for (const t of this.toasts) t.t--;
    this.toasts = this.toasts.filter(t => t.t > 0);
  }
  focus() { return this.active === 'droober' || this.rc.mode === 'ride' ? this.droober : this.rc; }
  camTarget() {
    const f = this.focus(), c = center(f);
    const vw = 384, vh = 216;
    let x = c.x - vw / 2 + (f.facing || 0) * 24, y = c.y - vh / 2 - 10;
    const maxX = this.W * TILE - vw, maxY = this.H * TILE - vh;
    x = maxX < 0 ? maxX / 2 : Math.max(0, Math.min(maxX, x));
    y = maxY < 0 ? maxY / 2 : Math.max(0, Math.min(maxY, y));
    return { x, y };
  }
  snapCamera() { const t = this.camTarget(); this.camX = t.x; this.camY = t.y; }
  updateCamera() {
    const t = this.camTarget();
    this.camX += (t.x - this.camX) * 0.12; this.camY += (t.y - this.camY) * 0.12;
  }
}

