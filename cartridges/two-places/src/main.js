// Game shell: screens, menus, save data, fixed-step loop.
const ARCADE = !!window.TokenArcade?.embedded;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W; canvas.height = VIEW_H;
ctx.imageSmoothingEnabled = false;

let SAVE_KEY = 'droober-two-places-v1';
function loadSave() {
  let s;
  try { s = Object.assign({ unlocked: 1, best: {}, muted: false }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); }
  catch { s = { unlocked: 1, best: {}, muted: false }; }
  // v1 saves counted juice boxes; they are apples now
  for (const b of Object.values(s.best)) if (b.apples == null) b.apples = b.juice || 0;
  return s;
}
const WORLD_NAMES = { 1: 'PURPLE DUSK', 2: 'SHROOMWOOD' };
const worldOf = i => (LEVELS[i] && LEVELS[i].world) || 1;
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
const save = loadSave();

const game = {
  screen: 'title', menuIndex: 0, levelIndex: 0, world: null, levelCanvas: null, levelTime: 0, deaths: 0,
  frame: 0, padHint: false, showControls: false, fromPause: false,
};
const ARCADE_ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'run', 'act', 'swap', 'call', 'ability', 'restart'];
let arcadeRun = null, arcadeDestroyed = false, arcadeFrame = 0;

function arcadeLevels(config) {
  if (config.mode === 'raid') {
    const value = config.rules?.levelSet;
    if (typeof value !== 'string' || !/^\d{1,2}(,\d{1,2}){2}$/.test(value)) throw new Error('A three-level Raid set is required.');
    const levels = value.split(',').map(Number);
    if (levels.some(i => i < 0 || i >= LEVELS.length) || new Set(levels).size !== 3) throw new Error('Invalid Raid levels.');
    return levels;
  }
  if (config.mode === 'free') {
    // free play: honor an explicit rules.level if the player has unlocked it, else their furthest unlocked level
    const maxUnlocked = Math.min(save.unlocked, LEVELS.length) - 1;
    const want = config.rules?.level;
    return [Number.isSafeInteger(want) && want >= 0 && want <= maxUnlocked ? want : maxUnlocked];
  }
  const level = config.rules?.level ?? 0;
  if (!Number.isSafeInteger(level) || level < 0 || level >= LEVELS.length) throw new Error('Invalid level.');
  return [level];
}
function arcadeBegin(config, levels) {
  if (!window.TokenArcade.beginRun()) return false;
  arcadeRun = { levels, tracks: levels.map(() => []), segment: 0, ticks: 0, apples: 0, deaths: 0 };
  return true;
}
function arcadeCapture() {
  if (!arcadeRun) return;
  const track = arcadeRun.tracks[arcadeRun.segment];
  if (track.length >= 18_000) { arcadeRun = null; window.TokenArcade.error('The run exceeded its input limit.'); return; }
  let held = 0, pressed = 0;
  ARCADE_ACTIONS.forEach((action, bit) => {
    if (Input.held[action]) held |= 1 << bit;
    if (Input.pressed[action]) pressed |= 1 << bit;
  });
  track.push(held | (pressed << ARCADE_ACTIONS.length));
}
function arcadeClear() {
  if (!arcadeRun) return;
  arcadeRun.ticks += game.levelTime;
  arcadeRun.apples += game.world.applesGot();
  arcadeRun.deaths += game.deaths;
  if (++arcadeRun.segment < arcadeRun.levels.length) {
    startLevel(arcadeRun.levels[arcadeRun.segment]);
    return;
  }
  const run = arcadeRun;
  arcadeRun = null;
  const primaryMetric = window.TokenArcade.config.objective === 'stars'
    ? run.apples : Math.round(run.ticks * 1000 / 60);
  window.TokenArcade.complete({ result: 'completed', primaryMetric,
    secondaryMetrics: { ticks: run.ticks, apples: run.apples, deaths: run.deaths, levelsCompleted: run.levels.length },
    proof: { v: 1, tracks: run.tracks } });
}

function startLevel(i, keepTime = false) {
  if (ARCADE && window.TokenArcade?.active && window.TokenArcade.config.mode === 'free' && !arcadeRun) {
    if (!arcadeBegin(window.TokenArcade.config, [i])) return;
  }
  game.levelIndex = i;
  game.world = new World(LEVELS[i]);
  game.levelCanvas = prerenderLevel(game.world);
  Audio8.setTrack(worldOf(i));
  if (!keepTime) { game.levelTime = 0; game.deaths = 0; }
  game.screen = 'play';
}

const TITLE_MENU = ['PLAY', 'LEVELS', 'CONTROLS', 'SOUND'];
const PAUSE_MENU = ['RESUME', 'RESTART', 'CONTROLS', 'LEVELS', 'SOUND'];

function menuNav(n) {
  const I = Input.pressed;
  if (I.up || (I.left && game.screen !== 'select')) { game.menuIndex = (game.menuIndex + n - 1) % n; Audio8.sfx('menu'); }
  if (I.down || (I.right && game.screen !== 'select')) { game.menuIndex = (game.menuIndex + 1) % n; Audio8.sfx('menu'); }
}
function toggleSound() {
  save.muted = !save.muted; Audio8.setMuted(save.muted); writeSave();
}

function update() {
  Input.poll();
  game.padHint = Input.usingPad;
  game.frame++;
  const I = Input.pressed;
  if (I.mute && !ARCADE) toggleSound();
  if (Object.values(I).some(Boolean)) Audio8.init();

  if (game.showControls) {
    if (I.confirm || I.pause || I.act) { game.showControls = false; Audio8.sfx('menu'); }
    return;
  }
  switch (game.screen) {
    case 'title': {
      menuNav(TITLE_MENU.length);
      if (I.confirm || I.act) {
        Audio8.sfx('select');
        const pick = TITLE_MENU[game.menuIndex];
        if (pick === 'PLAY') startLevel(Math.min(save.unlocked, LEVELS.length) - 1);
        else if (pick === 'LEVELS') { game.screen = 'select'; game.menuIndex = Math.min(save.unlocked, LEVELS.length) - 1; }
        else if (pick === 'CONTROLS') game.showControls = true;
        else if (pick === 'SOUND') toggleSound();
      }
      break;
    }
    case 'select': {
      const n = LEVELS.length;
      if (I.left) { game.menuIndex = (game.menuIndex + n - 1) % n; Audio8.sfx('menu'); }
      if (I.right) { game.menuIndex = (game.menuIndex + 1) % n; Audio8.sfx('menu'); }
      if (I.up) { game.menuIndex = (game.menuIndex + n - 5) % n; Audio8.sfx('menu'); }
      if (I.down) { game.menuIndex = (game.menuIndex + 5) % n; Audio8.sfx('menu'); }
      if (I.confirm || I.act) {
        if (game.menuIndex < save.unlocked) { Audio8.sfx('select'); startLevel(game.menuIndex); }
        else Audio8.sfx('nope');
      }
      if (I.pause) { game.screen = 'title'; game.menuIndex = 1; }
      break;
    }
    case 'play': {
      const w = game.world;
      if (I.pause && ARCADE && window.TokenArcade.config?.mode !== 'free') { window.TokenArcade.pause('user'); break; }   // free play uses the in-game pause menu (LEVELS)
      if (I.pause) { game.screen = 'pause'; game.menuIndex = 0; Audio8.sfx('menu'); break; }
      if (ARCADE) arcadeCapture();
      if (I.restart) { startLevel(game.levelIndex, true); game.deaths++; break; }
      w.update(Input);
      for (const e of w.events) Audio8.sfx(e);
      if (w.state === 'play') game.levelTime++;
      if (w.state === 'dead' && w.stateT > 55) { game.deaths++; startLevel(game.levelIndex, true); }
      if (ARCADE && w.state === 'clear' && w.stateT === 0) { recordClear(); arcadeClear(); break; }   // record first: arcadeClear can end the run
      if (!ARCADE && w.state === 'clear' && w.stateT === 1) recordClear();
      if (w.state === 'clear' && w.stateT > 40 && (I.confirm || I.act)) {
        Audio8.sfx('select');
        if (game.levelIndex + 1 < LEVELS.length) startLevel(game.levelIndex + 1);
        else { game.screen = 'end'; game.frame = 0; }
      }
      break;
    }
    case 'pause': {
      menuNav(PAUSE_MENU.length);
      if (I.pause) { game.screen = 'play'; break; }
      if (I.confirm || I.act) {
        Audio8.sfx('select');
        const pick = PAUSE_MENU[game.menuIndex];
        if (pick === 'RESUME') game.screen = 'play';
        else if (pick === 'RESTART') { startLevel(game.levelIndex, true); game.deaths++; }
        else if (pick === 'CONTROLS') game.showControls = true;
        else if (pick === 'LEVELS') { game.screen = 'select'; game.menuIndex = game.levelIndex; }
        else if (pick === 'SOUND') toggleSound();
      }
      break;
    }
    case 'end': {
      if (game.frame > 90 && (I.confirm || I.act)) { game.screen = 'title'; game.menuIndex = 0; }
      break;
    }
  }
}

function recordClear() {
  if (ARCADE && window.TokenArcade?.config?.mode !== 'free') return;
  const w = game.world, i = game.levelIndex;
  const prev = save.best[i];
  const apples = w.applesGot();
  game.newBest = !prev || game.levelTime < prev.time;
  save.best[i] = { time: prev ? Math.min(prev.time, game.levelTime) : game.levelTime, apples: Math.max(prev ? prev.apples : 0, apples), total: w.appleTotal };
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, i + 2));
  writeSave();
}

// ---------- screens ----------
function drawTitle() {
  drawBackground(ctx, game.frame * 0.4, 0, game.frame, save.unlocked > 10 ? 2 : 1);
  // ground strip
  px(ctx, C.ink, 0, 170, VIEW_W, 1); px(ctx, C.lime, 0, 171, VIEW_W, 3); px(ctx, C.stone, 0, 174, VIEW_W, 42);
  for (let x = 0; x < VIEW_W; x += 16) { px(ctx, C.stoneD, x, 181, 1, 8); px(ctx, C.stoneD, x, 189, 16, 1); }
  const bob = Math.round(Math.sin(game.frame * 0.06) * 2);
  drawTextOutlined(ctx, 'DROOBER', VIEW_W / 2, 14 + bob, C.lav, 4);
  drawTextOutlined(ctx, '& RC', VIEW_W / 2, 50 + bob, C.cyan, 3);
  drawTextC(ctx, 'TWO PLACES AT ONCE', VIEW_W / 2, 78, C.cream, 1, C.ink);
  // the pair
  drawFrameAt(ctx, (game.frame >> 6) % 3 === 2 ? 'wave' : 'front', 92, 172, 1, 2);
  const rcHop = Math.abs(Math.round(Math.sin(game.frame * 0.08) * 8));
  drawFrameAt(ctx, 'rcFront', 300, 172 - rcHop, 0, 2);
  // menu
  TITLE_MENU.forEach((m, i) => {
    let label = m === 'SOUND' ? `SOUND: ${save.muted ? 'OFF' : 'ON'}` : m;
    if (m === 'PLAY' && save.unlocked > 1) label = save.unlocked > LEVELS.length ? 'PLAY' : `CONTINUE (${Math.min(save.unlocked, LEVELS.length)})`;
    const sel = i === game.menuIndex, y = 98 + i * 15;
    if (sel) panel(ctx, VIEW_W / 2 - 60, y - 3, 120, 13, C.yellow);
    drawTextC(ctx, label, VIEW_W / 2, y, sel ? C.ink : C.cream, 1, sel ? null : C.ink);
  });
  drawTextC(ctx, Input.usingTouch ? 'TAP JUMP TO PICK.' : 'SPACE / ENTER TO PICK. M MUTES.', VIEW_W / 2, 204, C.cream, 1, C.ink);
}
function drawSelect() {
  const page = Math.floor(game.menuIndex / 10), world = page + 1;
  drawBackground(ctx, game.frame * 0.4, 0, game.frame, world);
  drawTextC(ctx, `WORLD ${world}: ${WORLD_NAMES[world] || ''}`, VIEW_W / 2, 12, C.cream, 2, C.ink);
  LEVELS.forEach((L, i) => {
    if (Math.floor(i / 10) !== page) return;
    const col = i % 5, row = Math.floor((i % 10) / 5);
    const x = 22 + col * 70, y = 40 + row * 58;
    const locked = i >= save.unlocked, sel = i === game.menuIndex, best = save.best[i];
    panel(ctx, x, y, 60, 50, sel ? C.yellow : locked ? '#9c8fc4' : C.paper);
    drawTextC(ctx, String(i + 1), x + 30, y + 5, C.ink, 2);
    if (locked) { drawTextC(ctx, 'LOCKED', x + 30, y + 26, C.ink); }
    else if (best) {
      drawApple(ctx, { x: x + 8, y: y + 23 }, 0);
      drawText(ctx, `${best.apples}/${best.total}`, x + 21, y + 26, C.ink);
      drawText(ctx, fmtTime(best.time), x + 18, y + 37, C.ink);
    } else drawTextC(ctx, 'NEW', x + 30, y + 30, C.purple);
  });
  const L = LEVELS[game.menuIndex];
  panel(ctx, 22, 162, 340, 34);
  drawTextC(ctx, game.menuIndex < save.unlocked ? L.name : '???', VIEW_W / 2, 167, C.ink, 1);
  drawTextC(ctx, game.menuIndex < save.unlocked ? L.blurb : 'BEAT THE LEVEL BEFORE IT.', VIEW_W / 2, 180, C.purpleD, 1);
  drawTextC(ctx, LEVELS.length > 10 ? 'DOWN PAST THE LAST ROW FOR THE NEXT WORLD.  ESC: BACK' : 'ESC: BACK', VIEW_W / 2, 204, C.cream, 1, C.ink);
}
function drawPause() {
  ctx.fillStyle = 'rgba(34,22,58,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextC(ctx, 'PAUSED', VIEW_W / 2, 40, C.cream, 2, C.ink);
  PAUSE_MENU.forEach((m, i) => {
    const label = m === 'SOUND' ? `SOUND: ${save.muted ? 'OFF' : 'ON'}` : m;
    const sel = i === game.menuIndex, y = 74 + i * 15;
    if (sel) panel(ctx, VIEW_W / 2 - 50, y - 3, 100, 13, C.yellow);
    drawTextC(ctx, label, VIEW_W / 2, y, sel ? C.ink : C.cream, 1, sel ? null : C.ink);
  });
}
function drawControls() {
  ctx.fillStyle = 'rgba(34,22,58,0.75)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 20, 10, 344, 196);
  drawTextC(ctx, 'CONTROLS', VIEW_W / 2, 16, C.ink, 2);
  const rows = Input.usingTouch ? [
    ['MOVE / FLY', 'THE PAD (LEFT SIDE)'],
    ['RUN', 'PUSH THE PAD TO THE RIM'],
    ['JUMP / DOUBLE', 'JUMP (TAP TWICE)'],
    ['CROUCH', 'PAD DOWN'],
    ['GRAB / THROW / USE', 'USE   (DOWN+USE SETS DOWN)'],
    ['SWAP DROOBER/RC', 'SWAP'],
    ['CALL RC / DROP RC', 'CALL'],
    ['GLIDE', 'RC ABOARD: DOUBLE JUMP, HOLD'],
    ['SMOKE / PAINT GOO', 'SKILL (WORLD 2)'],
    ['PAUSE / RESTART', 'II BUTTON'],
  ] : [
    ['MOVE', 'A/D OR ARROWS'],
    ['JUMP / DOUBLE', 'SPACE (TWICE)'],
    ['RUN', 'SHIFT'],
    ['CROUCH', 'S OR DOWN'],
    ['GRAB / THROW / USE', 'E   (S+E SETS DOWN)'],
    ['SWAP DROOBER/RC', 'Q OR TAB'],
    ['CALL RC / DROP RC', 'F'],
    ['RC FLIES', 'WASD / ARROWS'],
    ['GLIDE', 'RC ABOARD: DOUBLE JUMP, HOLD'],
    ['SMOKE (DROOBER, W2)', 'C'],
    ['PAINT GOO (RC, W2)', 'HOLD C'],
    ['RESTART / PAUSE', 'R / ESC'],
  ];
  rows.forEach(([a, b], i) => {
    drawText(ctx, a, 30, 36 + i * 12, C.purpleD);
    drawText(ctx, b, 168, 36 + i * 12, C.ink);
  });
  if (!Input.usingTouch) drawTextC(ctx, 'PAD: A JUMP X USE B CALL Y SMOKE/GOO LB/RB SWAP RT RUN', VIEW_W / 2, 176, C.purpleD);
  drawTextC(ctx, Input.usingTouch ? 'TAP JUMP' : 'PRESS SPACE', VIEW_W / 2, 192, C.ink);
}
function drawClear() {
  const w = game.world, t = w.stateT;
  if (t < 30) return;
  const best = save.best[game.levelIndex];
  panel(ctx, VIEW_W / 2 - 90, 40, 180, 96);
  drawTextC(ctx, 'LEVEL CLEAR!', VIEW_W / 2, 48, C.purple, 2);
  drawApple(ctx, { x: VIEW_W / 2 - 50, y: 72 }, 0);
  drawText(ctx, `APPLES ${w.applesGot()}/${w.appleTotal}`, VIEW_W / 2 - 36, 75, C.ink);
  drawText(ctx, `TIME   ${fmtTime(game.levelTime)}${game.newBest ? '  BEST!' : ''}`, VIEW_W / 2 - 50, 89, C.ink);
  drawText(ctx, `OOPS   ${game.deaths}`, VIEW_W / 2 - 50, 101, C.ink);
  if ((game.frame >> 4) % 2) drawTextC(ctx, (Input.usingTouch ? 'JUMP' : 'SPACE') + (game.levelIndex + 1 < LEVELS.length ? ': NEXT LEVEL' : ': FINISH'), VIEW_W / 2, 120, C.purpleD);
}
function drawEnd() {
  drawBackground(ctx, game.frame * 0.6, 0, game.frame, worldOf(LEVELS.length - 1));
  px(ctx, C.ink, 0, 170, VIEW_W, 1); px(ctx, C.lime, 0, 171, VIEW_W, 3); px(ctx, C.stone, 0, 174, VIEW_W, 42);
  const tot = Object.values(save.best).reduce((s, b) => s + (b.apples || 0), 0);
  const all = LEVELS.reduce((s, _, i) => s + (save.best[i] ? save.best[i].total : 0), 0);
  drawTextC(ctx, 'YOU DID IT!', VIEW_W / 2, 24, C.yellow, 3, C.ink);
  drawTextC(ctx, 'DROOBER AND RC MADE IT HOME,', VIEW_W / 2, 60, C.cream, 1, C.ink);
  drawTextC(ctx, 'USUALLY IN TWO PLACES AT ONCE.', VIEW_W / 2, 72, C.cream, 1, C.ink);
  drawTextC(ctx, `APPLES: ${tot}/${all}`, VIEW_W / 2, 92, C.cream, 1, C.ink);
  drawFrameAt(ctx, 'wave', VIEW_W / 2 - 30, 172, 1, 2);
  const hop = Math.abs(Math.round(Math.sin(game.frame * 0.1) * 10));
  drawFrameAt(ctx, 'rcFront', VIEW_W / 2 + 40, 172 - hop, 0, 2);
  for (let i = 0; i < 30; i++) {
    const x = (hash(i, 1) * VIEW_W + game.frame * (0.3 + hash(i, 2))) % VIEW_W, y = (hash(i, 3) * VIEW_H + game.frame * (0.5 + hash(i, 4))) % 170;
    px(ctx, CH_COLORS[i % 6], Math.round(x), Math.round(y), 2, 2);
  }
  if (game.frame > 90 && (game.frame >> 4) % 2) drawTextC(ctx, Input.usingTouch ? 'TAP JUMP' : 'PRESS SPACE', VIEW_W / 2, 200, C.cream, 1, C.ink);
}

function draw() {
  ctx.imageSmoothingEnabled = false;
  switch (game.screen) {
    case 'title': drawTitle(); break;
    case 'select': drawSelect(); break;
    case 'play': case 'pause':
      drawWorld(ctx, game.world, game.levelCanvas);
      drawHUD(ctx, game.world, game);
      if (game.world.state === 'clear') drawClear();
      if (game.world.state === 'dead') {
        const a = Math.min(1, Math.max(0, (game.world.stateT - 25) / 30));
        ctx.fillStyle = `rgba(34,22,58,${a})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        if (game.world.stateT < 40) drawTextC(ctx, game.world.rc.dead ? 'POP!' : 'OOF!', VIEW_W / 2, 90, C.cream, 3, C.ink);
      }
      if (game.screen === 'pause') drawPause();
      break;
    case 'end': drawEnd(); break;
  }
  if (game.showControls) drawControls();
}

// ---------- scaling & loop ----------
function fit() {
  const body = document.body;
  const touch = body.classList.contains('touch-on');
  const portrait = touch && innerHeight > innerWidth;
  body.classList.toggle('portrait', portrait);
  body.classList.toggle('landscape', touch && !portrait);
  let k;
  if (portrait) k = innerWidth * 0.8 / VIEW_W;                       // Game Boy: screen up top, buttons below
  else if (touch) {                                                   // wide handheld: grips on both sides
    const grip = Math.min(innerWidth * 0.24, 230);
    k = Math.min((innerWidth - 2 * grip) / VIEW_W, (innerHeight * 0.78) / VIEW_H);
  } else {
    k = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
    if (k >= 1) k = Math.floor(k);
  }
  canvas.style.width = VIEW_W * k + 'px';
  canvas.style.height = VIEW_H * k + 'px';
  if (portrait) {
    // controls sit just under the logo, wherever the screen ends on this phone
    const brand = document.querySelector('.brand');
    if (brand && brand.getBoundingClientRect) {
      const top = brand.getBoundingClientRect().bottom, u = Math.min(innerWidth / 100, 6), block = 72 * u;
      document.documentElement.style.setProperty('--ctl-top', top + Math.max(0, (innerHeight - top - block) * 0.4) + 'px');
    }
  }
}
addEventListener('resize', fit);
fit();

let acc = 0, last = performance.now();
function loop(now) {
  if (arcadeDestroyed) return;
  if (window.TokenArcade?.paused) { last = now; draw(); arcadeFrame = requestAnimationFrame(loop); return; }
  acc += Math.min(100, now - last); last = now;
  let steps = 0;
  while (acc >= 1000 / 60 && steps < 5) { update(); acc -= 1000 / 60; steps++; }
  draw();
  arcadeFrame = requestAnimationFrame(loop);
}

Input.init();
TouchPad.init();
Audio8.muted = save.muted;
SPRITES = new Image();
SPRITES.onload = () => { if (!arcadeDestroyed) arcadeFrame = requestAnimationFrame(loop); };
SPRITES.src = 'assets/sprites.png';
canvas.addEventListener('pointerdown', () => {
  Audio8.init(); canvas.focus();
  // on menus and result cards, tapping the game itself confirms
  if (game.screen !== 'play' || (game.world && game.world.state === 'clear')) Input.downs.add('confirm');
});
window.__game = game; // handy for poking at state from devtools
window.TokenArcade?.register({
  version: '1.0.0',
  capabilities: { pause: true, mute: true, touch: true, keyboard: true, gamepad: true, orientation: 'any' },
  mount(config) {
    SAVE_KEY = 'ta.' + config.gameId + '.two-places.v1';
    Object.assign(save, loadSave());
    Audio8.setMuted(save.muted);
    game.screen = 'title'; game.world = null;
  },
  start() {
    const config = window.TokenArcade.config;
    const levels = arcadeLevels(config);
    if (config.mode === 'free') {
      // free play: an explicit unlocked rules.level jumps straight in; otherwise open the title / level select
      if (Number.isSafeInteger(config.rules?.level) && config.rules.level === levels[0]) startLevel(levels[0]);
      else { game.screen = 'title'; game.menuIndex = 0; game.world = null; }
    }
    else if (arcadeBegin(config, levels)) startLevel(levels[0]);
  },
  pause() { Input.keys.clear(); Input.downs.clear(); TouchPad.held.clear(); Audio8.ctx?.suspend(); },
  resume() { last = performance.now(); Audio8.ctx?.resume(); },
  restart() { if (window.TokenArcade.config?.mode === 'free') startLevel(game.levelIndex); },
  audio(muted) { Audio8.setMuted(muted); },
  destroy() { arcadeDestroyed = true; arcadeRun = null; cancelAnimationFrame(arcadeFrame); clearInterval(Audio8.timer); Audio8.ctx?.close(); Input.keys.clear(); TouchPad.held.clear(); }
});
