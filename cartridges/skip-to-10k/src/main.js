// Skip to 10K: screens, input, camera, HUD, shop, save. Physics lives in sim.js, missions/news/rocks in meta.js.
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;

// ---------- save ----------
let SAVE_KEY = window.TokenArcade?.embedded ? 'ta.skip10k.v1' : 'skip10k.v1';
function loadSave() {
  const fresh = { gwei: 0, up: {}, runs: 0, best: { days: 0, peak: 0 }, flags: {}, muted: false, music: true,
    missions: [], rocks: [], rock: 0 };
  let s = fresh;
  try { s = Object.assign(fresh, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch {}
  if (!s.rocks.length) { const k = 1 + Math.floor(Math.random() * 99); s.rocks = [k]; s.rock = k; }
  if (!s.rocks.includes(s.rock)) s.rock = s.rocks[0];
  if (s.up.farts) { s.up.bounce = s.up.farts; delete s.up.farts; } // v0.5: farts became bounces
  return s;
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
Audio8.muted = save.muted; Audio8.musicOn = save.music;

// ---------- state ----------
const DOCK_START = -150, DOCK_END = 40;
// The user asked for a slower game to enjoy the scenery and timeline easter eggs. Sim runs at 0.8x real time.
const GAME_SPEED = 0.8;
const G8 = {
  screen: 'title', time: 0, run: null,
  camX: 0, camAlt: 0, shake: 0, slow: 0,
  aim: null, tut: null, thrownT: 0,
  texts: [], parts: [], banner: null, res: null, paused: false,
  shopTab: 0, shopSel: 0, rockSel: 0,
  rc: { x: 40, alt: 70 }, touch: false, hintT: 0,
  news: null, newsI: 0, bubble: null, bubbleCd: 4,
};
window.__game = G8;

// ---------- input ----------
const keys = new Set();
const edge = { skip: false, bounce: false, rc: false };
const ACTION_KEYS = ['Space', 'Enter', 'KeyZ'];
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key) || e.code === 'Space') e.preventDefault();
  Audio8.init();
  if (e.repeat) return;
  keys.add(e.code);
  onKey(e.code);
});
addEventListener('keyup', e => { keys.delete(e.code); if (ACTION_KEYS.includes(e.code) && G8.screen === 'aim' && !G8.tut) aimRelease(); });
addEventListener('blur', () => { keys.clear(); if (G8.aim) { G8.aim.charging = false; G8.aim.drag = null; } });

function onKey(code) {
  if (code === 'KeyM') { save.muted = !save.muted; Audio8.setMuted(save.muted); persist(); return; }
  if (code === 'KeyN') { save.music = !save.music; Audio8.setMusic(save.music); persist(); return; }
  const s = G8.screen;
  if (G8.tut) { if (G8.tut.t > 0.4) endTut(); return; }
  if (s === 'title') { if (code === 'KeyI' || code === 'KeyH') startTut(); else if (ACTION_KEYS.includes(code)) toAim(); return; }
  if (s === 'aim') {
    if (ACTION_KEYS.includes(code) && !G8.aim.drag) { G8.aim.charging = true; G8.aim.chargeT = 0; G8.aim.power = 0; }
    if (code === 'Escape' || code === 'Tab') toShop();
    return;
  }
  if (s === 'fly') {
    if (code === 'Escape' || code === 'KeyP') { G8.paused = !G8.paused; return; }
    if (G8.paused) return;
    if (ACTION_KEYS.includes(code)) edge.skip = true;
    if (code === 'Space' && spaceCallsRc(G8.run)) edge.rc = true;
    if (code === 'KeyX' || code === 'ShiftLeft' || code === 'ShiftRight') edge.bounce = true;
    if (code === 'KeyC' || code === 'KeyR') edge.rc = true;
    return;
  }
  if (s === 'results') {
    if (G8.res && G8.time - G8.res.at < 0.6) return; // don't skip the results by mashing
    if (code === 'KeyR') toAim();
    else if (ACTION_KEYS.includes(code) || code === 'Escape') toShop();
    return;
  }
  if (s === 'shop') shopKey(code);
}

function canvasPt(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
const pointers = new Map(); // id -> {x, y, btn}
const TOUCH_BTNS = {
  up: [8, 150, 52, 48], down: [8, 204, 52, 48],
  bounce: [334, 214, 58, 38], rc: [334, 170, 58, 38], skip: [398, 170, 74, 82],
};
function btnAt(p) {
  for (const k in TOUCH_BTNS) { const [x, y, w, h] = TOUCH_BTNS[k]; if (p.x >= x && p.x < x + w && p.y >= y && p.y < y + h) return k; }
  return null;
}
const hitRect = (p, [x, y, w, h]) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
const SHOP_BTN = [W - 56, 4, 50, 13];
const BOOST_BTNS = { bounce: [6, H - 30, 76, 24], rc: [88, H - 30, 76, 24] };
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); Audio8.init();
  if (e.pointerType === 'touch') { G8.touch = true; goLandscape(); }
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = canvasPt(e);
  const s = G8.screen;
  if (G8.tut) { if (G8.tut.t > 0.4) endTut(); return; }
  if (s === 'title') return hitRect(p, INFO_BTN) ? startTut() : toAim();
  if (s === 'results') {
    if (G8.time - G8.res.at < 0.6) return;
    if (hitRect(p, RES_AGAIN)) return toAim();
    return toShop();
  }
  if (s === 'shop') return shopClick(p);
  if (s === 'aim') {
    if (hitRect(p, SHOP_BTN)) return toShop();
    pointers.set(e.pointerId, { ...p, btn: 'aim' });
    return aimPress(p);
  }
  if (s === 'fly') {
    if (G8.paused) { G8.paused = false; return; }
    if (hitRect(p, [W - 22, 4, 18, 14])) { G8.paused = true; return; }
    let b = G8.touch ? btnAt(p) : null;
    if (!G8.touch) for (const k in BOOST_BTNS) if (hitRect(p, BOOST_BTNS[k])) b = k;
    pointers.set(e.pointerId, { ...p, btn: b });
    if (!b || b === 'skip') edge.skip = true;
    if (b === 'bounce') edge.bounce = true;
    if (b === 'rc') edge.rc = true;
  }
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const p = canvasPt(e), q = pointers.get(e.pointerId);
  q.x = p.x; q.y = p.y;
  if (q.btn === 'aim') aimMove(p);
  if (q.btn === 'up' || q.btn === 'down') q.btn = btnAt(p) || q.btn;
});
function endPointer(e) {
  const q = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (q && q.btn === 'aim' && G8.screen === 'aim') aimRelease();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', e => e.preventDefault());

function tiltInput() {
  let t = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) t += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) t -= 1;
  for (const q of pointers.values()) { if (q.btn === 'up') t += 1; if (q.btn === 'down') t -= 1; }
  return Math.max(-1, Math.min(1, t));
}

// ---------- the throw: pull back and let go ----------
// Drag back from anywhere on the screen: pull left = power, pull down = higher angle. Let go to throw.
// Keyboard: UP/DOWN aim, hold SPACE to fill power, let go to throw.
const PULL_FULL = 55;                       // canvas px of drag for full power
const HAND_X = DOCK_END - 8, HAND_ALT = 38;  // where the rock leaves Droober's hand
const SKIP_ZONE = [8, 24];                  // angles that skip best
function newAim() { return { angle: 15, power: 0, drag: null, charging: false, chargeT: 0, warnT: 0, preview: null, previewKey: '' }; }
function aimFromDrag(a) {
  const d = a.drag, dx = d.x0 - d.x, dy = d.y - d.y0;
  const len = Math.hypot(dx, dy);
  a.power = Math.min(1, len / PULL_FULL);
  if (len < 3) return;
  let ang = Math.atan2(dy, dx) * 180 / Math.PI;
  if (dx < 0) ang = dy > 0 ? 60 : -5;
  a.angle = Math.max(-5, Math.min(60, ang));
}
function aimPress(p) { const a = G8.aim; a.drag = { x0: p.x, y0: p.y, x: p.x, y: p.y }; a.power = 0; }
function aimMove(p) { const a = G8.aim; if (!a.drag) return; a.drag.x = p.x; a.drag.y = p.y; aimFromDrag(a); }
function aimRelease() {
  const a = G8.aim;
  if (!a.drag && !a.charging) return;
  a.drag = null; a.charging = false;
  if (a.power < 0.1) { a.power = 0; a.warnT = 1.6; return; }
  doThrow();
}
const throwPower = p => 0.45 + 0.55 * p;
function doThrow() {
  const a = G8.aim, run = G8.run;
  SIM.throwRock(run, a.angle, throwPower(a.power), HAND_X);
  run.alt = HAND_ALT;
  if (G8.rec && !G8.tut) { G8.rec.angle = a.angle; G8.rec.power = throwPower(a.power); }
  const inZone = a.angle >= SKIP_ZONE[0] && a.angle <= SKIP_ZONE[1];
  if (a.power > 0.95 && inZone) { run.counts.line = 1; addText('PERFECT THROW', HAND_X, 70, '#ffe066'); Audio8.sfx('line'); }
  G8.screen = 'fly'; G8.hintT = 0; G8.thrownT = G8.time;
  G8.rc = { x: HAND_X - 16, alt: 80 };
  showBanner(SIM.ERAS[0].name, SIM.ERAS[0].sub);
}
function updateAim(dt) {
  const a = G8.aim;
  a.warnT = Math.max(0, a.warnT - dt);
  if (!a.drag) {
    if (keys.has('ArrowUp') || keys.has('KeyW')) a.angle = Math.min(60, a.angle + 45 * dt);
    if (keys.has('ArrowDown') || keys.has('KeyS')) a.angle = Math.max(-5, a.angle - 45 * dt);
  }
  if (a.charging) {
    a.chargeT += dt;
    const prev = a.power;
    a.power = 1 - Math.pow(1 - Math.min(1, a.chargeT / 1.1), 2); // fills in 1.1s, eases in, then holds at max
    if ((prev * 10 | 0) !== (a.power * 10 | 0)) Audio8.sfx('windup', a.power * 60);
  }
  // trajectory preview through the real sim: the first arc and a couple of perfect skips
  const key = Math.round(a.angle * 2) + ':' + Math.round(a.power * 40);
  if (key !== a.previewKey) {
    a.previewKey = key;
    const t = SIM.newRun(G8.tut ? TUT_UP : save.up, 1, !!G8.run?.balanceV2 || G8.tut);
    t.ents = []; t.chunks = 1e9;
    SIM.throwRock(t, a.angle, throwPower(Math.max(a.power, 0.1)), HAND_X); t.alt = HAND_ALT;
    const pts = [];
    for (let i = 0; i < 1400 && t.phase === 'fly' && t.skips < 3; i++) {
      SIM.step(t, { skip: t.alt < 5 && t.vy < 0 });
      if (i % 5 === 0) pts.push([t.x, t.alt, t.skips]);
    }
    t.events.length = 0;
    a.preview = pts;
  }
}

// ---------- how to play: a narrated demo run ----------
// The bot plays a well-upgraded run while captions explain what is happening. Nothing is saved.
const TUT_UP = { arm: 2, rock: 2, hands: 2, aero: 2, bounce: 1, rc: 2, volume: 2 };
// Seed 55 was picked offline (with TUT_UP, about two upgrades each): in ~90s it gets rejected at the ATH, breaks it,
// farts, calls RC, bounces off Kevin and reaches today.
const TUT_SEED = 55;
function startTut() {
  toAim();
  G8.tut = { t: 0, caps: [], cap: null, seen: new Set(), end: 0 };
  G8.run = SIM.newRun(TUT_UP, TUT_SEED, true);
  tutCaption('PULL BACK ANYWHERE TO AIM. FURTHER BACK = MORE POWER');
  tutCaption('AIM LOW. THE GREEN SKIP ZONE SKIPS BEST');
}
function endTut() { G8.tut = null; G8.screen = 'title'; G8.run = null; G8.texts = []; G8.parts = []; G8.news = null; G8.banner = null; }
function tutCaption(text, key) {
  const T = G8.tut;
  if (!T || (key && T.seen.has(key))) return;
  if (key) T.seen.add(key);
  T.caps.push(text);
}
const TUT_CAPS = {
  perfect: ['perfect', 'PERFECT SKIP. TAP WHEN THE RING TURNS YELLOW. KEEPS YOUR SPEED'],
  gem: ['gem', 'GEMS AND DISTANCE PAY GWEI. SPEND IT ON UPGRADES'],
  pump: ['up', 'PUMPS, BULLS, GREEN WHALES AND KEVIN LAUNCH YOU UP'],
  whale: ['up', 'PUMPS, BULLS, GREEN WHALES AND KEVIN LAUNCH YOU UP'],
  kevin: ['up', 'PUMPS, BULLS, GREEN WHALES AND KEVIN LAUNCH YOU UP'],
  dump: ['dump', 'RED WHALES AND BEARS DUMP YOU. DODGE THEM'],
  bounce: ['bounce', 'X OR THE BOUNCE BUTTON: BOUNCE OFF THIN AIR'],
  rc: ['rc', 'C, SPACE IN THE AIR, OR THE RC BUTTON: RC LIFTS THE ROCK'],
  rejected: ['rej', 'THE ATH LINE REJECTS SLOW ROCKS. UPGRADE VOLUME'],
  breakout: ['brk', 'BROKE THE ATH. NOW IT IS SUPPORT'],
  era: ['era', 'NEW ERA. LEFT TO RIGHT IS TIME. HEIGHT IS PRICE'],
  airdrop: ['air', 'AIRDROPS GIVE FREE STUFF. USUALLY'],
  scam: ['air', 'AIRDROPS GIVE FREE STUFF. USUALLY'],
  splash: ['steep', 'TOO STEEP = SPLASH. COME IN FLAT'],
  ice: ['ice', 'CRYPTO WINTER: THE LAKE FROZE. TAP TO HOP'],
  suit: ['suit', 'THE SUITS BRING INFLOWS. FREE SPEED'],
};
function updateTut(dt) {
  const T = G8.tut;
  if (!T) return;
  T.t += dt;
  if (T.cap) { T.cap.t += dt; if (T.cap.t > 3.2 || (T.cap.t > 1.6 && T.caps.length)) T.cap = null; }
  if (!T.cap && T.caps.length) T.cap = { text: T.caps.shift(), t: 0 };
  if (G8.screen === 'aim') {
    // the ghost hand pulls back for 2.4s, then lets go
    const a = G8.aim, k = Math.min(1, Math.max(0, (T.t - 0.8) / 1.6));
    a.drag = { x0: 300, y0: 120, x: 300 - 52 * k, y: 120 + 15 * k };
    aimFromDrag(a);
    if (T.t > 3.6) { a.drag = null; a.angle = 16; a.power = 1; doThrow(); tutCaption('TAP SPACE OR THE SCREEN AS THE ROCK HITS THE WATER'); tutCaption('TILT USES GAS. RELEASE TO SAVE IT'); }
    return;
  }
  // the demo makes its point in about a minute; cut it there
  if (!T.end && T.t > 88 && G8.run.phase === 'fly') { T.res = SIM.results(G8.run); T.end = 0.001; T.cut = true; }
  if (T.end) { T.end += dt; if (T.end > 4.5) endTut(); }
}
function tutEvents(run) {
  for (const ev of run.events) {
    const c = TUT_CAPS[ev.type];
    if (c) tutCaption(c[1], c[0]);
    if (ev.text === 'CHOP') tutCaption('CRABS. SIDEWAYS CHOP FLATTENS YOUR SKIPS', 'crab');
    if (ev.type === 'text' && /STREAK/.test(ev.text || '')) tutCaption('STREAKS OF PERFECT SKIPS ADD SPEED', 'streak');
  }
}
function drawTut() {
  const T = G8.tut;
  if (!T) return;
  drawTextOutlined(ctx, 'HOW TO PLAY. TAP OR ESC TO EXIT', W / 2, G8.screen === 'aim' ? 24 : H - 14, '#b8a8e8', 1);
  if (G8.screen === 'aim') drawGhostHand(300, 120, 248, 135, (T.t - 0.8) / 1.6);
  if (T.cap) {
    const w = textWidth(T.cap.text) + 16, x = (W - w) / 2, y = H - 64;
    px(ctx, '#22163a', x - 2, y - 2, w + 4, 19); px(ctx, '#ffe066', x, y, w, 15);
    drawText(ctx, T.cap.text, x + 8, y + 4, '#22163a');
  }
  if (T.end) {
    const r = T.res;
    panel(110, 70, 260, 70);
    drawTextC(ctx, (T.cut ? 'AND IT KEEPS GOING. ' : 'THAT RUN REACHED ') + r.date, W / 2, 82, '#22163a');
    drawTextC(ctx, 'DAY ' + r.days + '. PEAK ' + fmtPrice(r.peak), W / 2, 96, '#7a4a8a');
    drawTextC(ctx, 'UPGRADE UP AND IT IS YOURS. NOW YOU TRY', W / 2, 116, '#e5487f');
  }
}

// ---------- screen changes ----------
function toAim() {
  if (window.TokenArcade?.active && !window.TokenArcade.beginRun()) return;
  G8.screen = 'aim';
  // Passport Play (ranked/raid): issued seed + locked standard loadout; record the throw and every sim tick for server replay.
  const graded = window.TokenArcade?.embedded && window.TokenArcade.config && window.TokenArcade.config.mode !== 'free';
  G8.run = graded ? SIM.newRun(SIM.STANDARD_LOADOUT, SIM.issuedSeed(window.TokenArcade.config.seed)) : SIM.newRun(save.up, (Math.random() * 2 ** 31) >>> 0, true);
  G8.rec = graded ? { angle: null, power: null, input: '' } : null;
  G8.aim = newAim();
  G8.camX = HAND_X - 150; G8.camAlt = 0; G8.texts = []; G8.parts = []; G8.banner = null; G8.paused = false;
  G8.news = null; G8.newsI = 0; G8.bubble = null; G8.bubbleCd = 5; G8.slow = 0;
  G8.rc = { x: HAND_X - 30, alt: 86 };
  edge.skip = edge.bounce = edge.rc = false;
  pointers.clear();
  Audio8.sfx('menu');
}
function toShop() { G8.screen = 'shop'; G8.shopSel = SIM.UPGRADES.length; G8.rockSel = Math.max(0, save.rocks.indexOf(save.rock)); Audio8.sfx('menu'); }
function finishRun() {
  const run = G8.run;
  if (G8.tut) { G8.tut.res = SIM.results(run); G8.tut.end = 0.001; return; }
  const r = SIM.results(run);
  const mult = META.multiplier(save);
  r.earned = Math.round(r.earned * mult); r.mult = mult;
  const rankBefore = META.rankOf(save.missions.length);
  r.done = META.complete(save, r, run.counts);
  r.missionGwei = r.done.reduce((a, m) => a + m.reward, 0);
  r.rankUp = META.rankOf(save.missions.length) > rankBefore ? META.RANKS[META.rankOf(save.missions.length)] : null;
  save.runs++;
  save.gwei += r.earned + r.missionGwei;
  r.newBest = r.days > save.best.days;
  save.best.days = Math.max(save.best.days, r.days);
  save.best.peak = Math.max(save.best.peak, r.peak);
  if (r.broke5k) save.flags.broke5k = true;
  if (r.broke10k) save.flags.broke10k = true;
  if (r.days >= SIM.TODAY_DAY) save.flags.today = true;
  if (r.days >= SIM.ERAS[SIM.ERAS.length - 1].day) save.flags.forever = true;
  persist();
  r.quip = quipFor(r);
  r.candles = run.candles.slice();
  r.leftBounces = run.bounces; r.leftRc = run.rc;
  r.at = G8.time;
  G8.res = r; G8.screen = 'results';
  window.TokenArcade?.complete({ result: 'completed', primaryMetric: r.days,
    secondaryMetrics: { peak: r.peak, skips: r.skips, perfects: r.perfects, bestStreak: r.bestStreak, gems: r.gems, elapsedMs: Math.round(run.t * 1000) },
    ...(G8.rec && G8.rec.angle !== null ? { proof: { v: 1, seed: run.seed, loadout: 'standard-v1', angle: G8.rec.angle, power: G8.rec.power, input: G8.rec.input } } : {}) });
  if (r.done.length) setTimeout(() => Audio8.sfx('mission'), 500);
}
function quipFor(r) {
  const pickQ = a => a[(r.days + r.skips) % a.length];
  if (r.days >= SIM.ERAS[SIM.ERAS.length - 1].day) return pickQ(['FOREVER. SEE YOU NEXT BLOCK.', 'THE WORLD COMPUTER NEVER SLEEPS.']);
  if (r.broke10k) return pickQ(['10K. SCREENSHOT IT. NOBODY WILL BELIEVE YOU.', 'TOLD YOU. 10K.']);
  if (r.broke5k) return pickQ(['NEW ATH. FOR A MINUTE.', 'PRICE DISCOVERY. THEN GRAVITY.']);
  if (r.reason === 'FROZE') return pickQ(['FROZEN SOLID. HODLING.', 'WINTER GOT ANOTHER ONE.']);
  if (r.peak >= 4700) return pickQ(['SO CLOSE TO THE ATH. AGAIN.', 'REJECTED AT 4.9K. CLASSIC.']);
  return pickQ(['SIDEWAYS AGAIN.', 'CHOP CHOP.', 'RANGE BOUND. AS USUAL.', 'NEXT CYCLE FOR SURE.',
    'ULTRA SOUND. ULTRA SIDEWAYS.', 'THE ROCK DOES NOTHING. AS PROMISED.', 'FEW UNDERSTAND.']);
}

// ---------- fx ----------
function showBanner(title, sub) { G8.banner = { title, sub, t: 0 }; }
function addText(text, x, alt, color) { G8.texts.push({ text, x, alt, color: color || '#fff', t: 0 }); }
function burst(x, alt, n, color, spd = 80, kind = 'dot') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.8);
    G8.parts.push({ x, alt, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v + 20, t: 0, life: 0.5 + Math.random() * 0.5, color, kind });
  }
}
function splash(x, n, big) {
  for (let i = 0; i < n; i++) G8.parts.push({ x: x + (Math.random() - 0.5) * 6, alt: 0, vx: (Math.random() - 0.3) * 60, vy: 60 + Math.random() * (big ? 160 : 90), t: 0, life: 0.6, color: '#d8f4ff', kind: 'drop' });
}
// speech bubbles: RC talks like the timeline
function say(who, kind, chance = 1) {
  if (Math.random() > chance) return;
  const lines = META.BANTER[kind];
  G8.bubble = { who, text: lines[Math.floor(Math.random() * lines.length)], t: 0 };
  G8.bubbleCd = 6 + Math.random() * 6;
}
function handleEvents(run) {
  for (const ev of run.events) {
    const c = ev.color;
    switch (ev.type) {
      case 'throw': Audio8.sfx('throw'); break;
      case 'skip': Audio8.sfx(ev.text === 'PERFECT' ? 'perfect' : 'skip', run.streak); splash(ev.x, ev.text === 'PERFECT' ? 9 : 5, false); if (ev.text === 'PERFECT') { G8.shake = Math.max(G8.shake, 1.5); burst(ev.x, 4, 5, '#ffe066', 45); } if (ev.text === 'PERFECT') say('rc', 'perfect', 0.12); break;
      case 'perfect': Audio8.sfx('perfect', run.streak); burst(ev.x, ev.alt + 4, 6, '#ffe066', 50); G8.shake = Math.max(G8.shake, 1.5); break;
      case 'splash': Audio8.sfx('splash'); splash(ev.x, 14, true); G8.shake = 4; break;
      case 'sink': Audio8.sfx('sink'); splash(ev.x, 16, true); break;
      case 'froze': Audio8.sfx('ice'); break;
      case 'gem': Audio8.sfx('gem'); burst(ev.x, ev.alt, 4, '#d6c2ff', 40); break;
      case 'ball': Audio8.sfx('ball'); break;
      case 'fart': Audio8.sfx('fart'); burst(ev.x - 6, ev.alt, 10, '#9ff07a', 50, 'puff'); break;
      case 'bounce': Audio8.sfx('bounce'); bounceRing(ev.x, ev.alt); say('rc', 'bounce', 0.35); break;
      case 'pump': Audio8.sfx('pump'); G8.shake = 3; break;
      case 'whale': Audio8.sfx('whale'); splash(ev.x, 18, true); break;
      case 'dump': Audio8.sfx('dump'); G8.shake = 5; say('rc', 'dump', 0.7); break;
      case 'suit': Audio8.sfx('suit'); burst(ev.x, ev.alt, 8, '#7be08a', 70); break;
      case 'kevin': Audio8.sfx('kevin'); burst(ev.x, ev.alt, 12, '#ffb3e6', 90); say('rc', 'kevin'); break;
      case 'yacht': Audio8.sfx('yacht'); break;
      case 'skrump': Audio8.sfx('skrump'); burst(ev.x, ev.alt, 8, '#c89bff', 60); break;
      case 'bonk': Audio8.sfx('bonk'); G8.shake = 3; break;
      case 'fork': Audio8.sfx('fork'); G8.parts.push({ x: ev.x, alt: ev.alt, vx: 160, vy: -40, t: 0, life: 1.6, color: '#7be08a', kind: 'ghost' }); break;
      case 'bat': Audio8.sfx('bat'); break;
      case 'ice': Audio8.sfx('ice'); break;
      case 'rc': Audio8.sfx('rc'); break;
      case 'airdrop': Audio8.sfx('airdrop'); burst(ev.x, ev.alt, 10, '#ffe066', 70); say('rc', 'airdrop', 0.6); break;
      case 'scam': Audio8.sfx('scam'); say('rc', 'scam'); break;
      case 'rejected': Audio8.sfx('rejected'); G8.shake = 6; say('rc', 'rejected', 0.8); break;
      case 'breakout': Audio8.sfx('breakout'); burst(ev.x, ev.alt, 40, '#7be08a', 160, 'confetti'); G8.shake = 6; G8.slow = 0.7; say('rc', 'breakout'); break;
      case 'era': { Audio8.sfx('era'); const e = SIM.ERAS.find(x => x.name === ev.text); showBanner(e.name, e.sub); continue; }
      case 'today': Audio8.sfx('today'); burst(ev.x, ev.alt, 40, '#ffe066', 160, 'confetti'); G8.slow = 0.7; showBanner('YOU ARE HERE', 'DAY ' + SIM.TODAY_DAY + '. STILL NOT 10K'); continue;
    }
    if (ev.text) addText(ev.text, ev.x, ev.alt + 14, c);
  }
  run.events.length = 0;
}

// ---------- update ----------
let acc = 0;
function update(dt) {
  G8.time += dt;
  const run = G8.run;
  if (G8.banner) { G8.banner.t += dt; if (G8.banner.t > 3.8) G8.banner = null; }
  if (G8.news) { G8.news.t += dt; if (G8.news.t > 5.5) G8.news = null; }
  if (G8.bubble) { G8.bubble.t += dt; if (G8.bubble.t > 2.2) G8.bubble = null; }
  shopFlash = Math.max(0, shopFlash - dt);
  G8.shake = Math.max(0, G8.shake - dt * 20);

  updateTut(dt);
  if (G8.screen === 'aim') {
    updateAim(dt);
    G8.camX += (HAND_X - 150 - G8.camX) * Math.min(1, dt * 6);
    G8.rc.alt += (86 + Math.sin(G8.time * 3) * 3 - G8.rc.alt) * Math.min(1, dt * 6);
  }
  if (G8.screen === 'fly' && !G8.paused) {
    let sdt = dt * GAME_SPEED;
    if (G8.slow > 0) { G8.slow -= dt; sdt = dt * 0.35; }
    if (G8.tut) sdt *= 1.3;
    acc += Math.min(sdt, 0.1);
    G8.hintT += dt;
    if (DEMO || G8.tut) demoInput();
    const input = { tilt: G8.tut ? SIM.botInput(run).tilt : tiltInput(), skip: edge.skip, bounce: edge.bounce, rc: edge.rc };
    edge.skip = edge.bounce = edge.rc = false;
    while (acc >= SIM.DT) {
      if (G8.rec && !G8.tut) G8.rec.input += String.fromCharCode(48 + ((input.tilt | 0) + 1 | (input.skip ? 4 : 0) | (input.bounce ? 8 : 0) | (input.rc ? 16 : 0)));
      SIM.step(run, G8.tut ? SIM.botInput(run) : input);
      input.skip = input.bounce = input.rc = false;
      acc -= SIM.DT;
    }
    if (G8.tut) tutEvents(run);
    handleEvents(run);
    // breaking news as the rock passes each date
    const day = SIM.dayAt(run.x);
    while (G8.newsI < META.NEWS.length && META.NEWS[G8.newsI].day <= day) {
      const n = META.NEWS[G8.newsI++];
      if (day - n.day < 60) { G8.news = { ...n, t: 0 }; Audio8.sfx('news'); }
    }
    G8.bubbleCd -= dt;
    if (G8.bubbleCd <= 0 && run.phase === 'fly') say('rc', run.vx < 140 ? 'slow' : 'idle');
    if (run.phase === 'done' && !(G8.tut && G8.tut.end)) finishRun();
  }
  // camera
  if (run && (G8.screen === 'fly' || G8.screen === 'results')) {
    const tx = run.x - 150 + Math.min(70, run.vx * 0.08), ta = Math.max(0, run.alt - 105);
    G8.camX += (tx - G8.camX) * Math.min(1, dt * 8);
    G8.camAlt += (ta - G8.camAlt) * Math.min(1, dt * 5);
    const grab = run.rcT > 0;
    const rx = grab ? run.x - 2 : run.x - 20, ra = grab ? run.alt + 8 : run.alt + 16 + Math.sin(G8.time * 5) * 3;
    G8.rc.x += (rx - G8.rc.x) * Math.min(1, dt * (grab ? 20 : 10));
    G8.rc.alt += (ra - G8.rc.alt) * Math.min(1, dt * (grab ? 20 : 10));
  } else if (G8.screen === 'title') G8.camX = DOCK_END - 420 + Math.sin(G8.time * 0.3) * 12;
  for (const t of G8.texts) t.t += dt;
  G8.texts = G8.texts.filter(t => t.t < 1.3);
  for (const p of G8.parts) {
    p.t += dt; p.x += p.vx * dt; p.alt += p.vy * dt;
    if (p.kind !== 'ghost' && p.kind !== 'puff') p.vy -= 300 * dt;
    if (p.kind === 'puff') { p.vx *= 0.95; p.vy *= 0.95; }
  }
  G8.parts = G8.parts.filter(p => p.t < p.life && (p.kind !== 'drop' || p.alt > -2));
}

// ---------- draw: world ----------
const sx = x => Math.round(x - G8.camX);
const sy = alt => Math.round(WATER_Y - alt + G8.camAlt);

function eraBlend(x) {
  const i = SIM.eraIndexAt(x), d = SIM.dayAt(x) - SIM.ERAS[i].day;
  if (i > 0 && d < 60) return [SIM.ERAS[i - 1].id, SIM.ERAS[i].id, d / 60];
  return [SIM.ERAS[i].id, null, 0];
}

const ALWAYS_DRAWN = new Set(['pump', 'whaleG', 'whaleR', 'suit', 'kevin', 'fork', 'bull', 'bear', 'kitty']);
function drawWorld() {
  const camX = G8.camX, camAlt = G8.camAlt, time = G8.time;
  const [ea, eb, t] = eraBlend(Math.max(0, camX + W / 2));
  drawBackdrop(ctx, ea, camX, camAlt, time);
  if (eb) { ctx.globalAlpha = t; drawBackdrop(ctx, eb, camX, camAlt, time); ctx.globalAlpha = 1; }
  drawClouds(ctx, eb && t > 0.5 ? eb : ea, camX, camAlt);
  drawPriceGrid();
  drawWater(ctx, ea, camX, camAlt, time, SIM.ICE);
  if (eb) { ctx.globalAlpha = t; drawWater(ctx, eb, camX, camAlt, time, SIM.ICE); ctx.globalAlpha = 1; }
  if (camX < 260) drawDock();
  for (const era of SIM.ERAS) {
    const x = era.day * SIM.PX_PER_DAY + 30;
    if (x - camX > -120 && x - camX < W + 20 && era.day > 0) drawEraBuoy(ctx, era, sx(x), sy(0), time);
  }
  const run = G8.run;
  if (run && G8.screen !== 'title') {
    for (const e of run.ents) {
      if (e.used && !ALWAYS_DRAWN.has(e.t)) continue;
      const ex = sx(e.x);
      if (ex < -80 || ex > W + 20) continue;
      drawEnt(ctx, run, e, ex, sy(e.alt), time);
    }
    drawResistance(SIM.ALT_5K, '$4,953 ATH', run.broke5k);
    drawResistance(SIM.ALT_10K, '$10,000', run.broke10k);
  }
  drawSpeedLines(run);
  for (const p of G8.parts) {
    const a = 1 - p.t / p.life, x = sx(p.x), y = sy(p.alt);
    if (p.kind === 'puff') { ctx.globalAlpha = a * 0.8; px(ctx, p.color, x - 2, y - 2, 5, 4); ctx.globalAlpha = 1; }
    else if (p.kind === 'confetti') px(ctx, ['#7be08a', '#ffe066', '#ff7ab0', '#7fe3ff'][(p.x | 0) % 4], x, y, 2, 2);
    else if (p.kind === 'ghost') { ctx.globalAlpha = a * 0.6; drawRock(ctx, 0, x, y, 0); drawText(ctx, 'ETC', x - 8, y - 14, '#7be08a'); ctx.globalAlpha = 1; }
    else px(ctx, p.color, x, y, 2, 2);
  }
  if (run && (G8.screen === 'fly' || G8.screen === 'results')) drawRockAndRC(run);
  for (const tx of G8.texts) {
    const y = sy(tx.alt) - tx.t * 24;
    ctx.globalAlpha = Math.min(1, 2.2 - tx.t * 1.6);
    drawTextOutlined(ctx, tx.text, sx(tx.x), y, tx.color, 1);
    ctx.globalAlpha = 1;
  }
  drawBubble();
}
function drawSpeedLines(run) {
  if (!run || G8.screen !== 'fly' || run.vx < 460) return;
  const k = Math.min(1, (run.vx - 460) / 400);
  ctx.globalAlpha = 0.25 + k * 0.35;
  for (let i = 0; i < 6 + k * 10; i++) {
    const y = (hash(i, 77) * H) | 0, len = 20 + hash(i, 78) * 50;
    const x = ((hash(i, 79) * W * 2 - G8.time * (600 + i * 40)) % (W + len) + W + len) % (W + len) - len;
    px(ctx, '#ffffff', x, y, len, 1);
  }
  ctx.globalAlpha = 1;
}
function drawPriceGrid() {
  for (let p = 2000; p <= 12000; p += 1000) {
    const alt = (p - 1000) / 6.45, y = sy(alt);
    if (y < 10 || y > sy(0) - 6) continue;
    ctx.globalAlpha = 0.18; px(ctx, '#ffffff', 0, y, W, 1); ctx.globalAlpha = 0.5;
    drawText(ctx, '$' + (p / 1000) + 'K', 3, y - 8, '#ffffff');
    ctx.globalAlpha = 1;
  }
}
function drawResistance(alt, label, broken) {
  const y = sy(alt);
  if (y < -10 || y > H + 10) return;
  const c = broken ? '#7be08a' : '#ff5a6a';
  for (let x = -((G8.camX | 0) % 12 + 12) % 12; x < W; x += 12) px(ctx, c, x, y, 7, 2);
  drawTextOutlined(ctx, label + (broken ? ' SUPPORT' : ' RESISTANCE'), W - 110, y - 10, c, 1);
}

function drawDock() {
  const x0 = sx(DOCK_START - 14), x1 = sx(DOCK_END + 8), y = sy(22);
  px(ctx, '#6a4422', x0, y, x1 - x0, 5); px(ctx, '#8a5a30', x0, y, x1 - x0, 1);
  for (let x = DOCK_START - 6; x < DOCK_END; x += 18) px(ctx, '#5a3a1a', sx(x), y + 1, 1, 3);
  for (let x = DOCK_START; x <= DOCK_END; x += 46) px(ctx, '#4a2e16', sx(x), y + 5, 4, sy(0) - y + 8);
  px(ctx, '#5a3a1a', sx(DOCK_START + 10), y - 22, 2, 22);
  px(ctx, '#fdf6e0', sx(DOCK_START - 10), y - 34, 44, 13); px(ctx, '#22163a', sx(DOCK_START - 10), y - 21, 44, 1);
  drawText(ctx, 'NO SWIM', sx(DOCK_START - 8), y - 31, '#e5487f');
  if (G8.screen === 'title') { drawFrameAt(ctx, 'wave', sx(DOCK_END - 20), y, 1); drawRC(sx(DOCK_END - 34), sy(88 + Math.sin(G8.time * 3) * 3), 'rcFront'); return; }
  drawDroober(y);
  if (G8.screen === 'aim') drawRC(sx(G8.rc.x), sy(G8.rc.alt), 'rcFront');
}
function drawDroober(dockY) {
  const a = G8.aim, x = sx(HAND_X - 10);
  if (G8.screen !== 'aim') { drawFrameAt(ctx, 'wave', x, dockY, 1); return; }
  const pulling = a.drag || a.charging;
  drawFrameAt(ctx, pulling && a.power > 0.05 ? 'crouch' : 'front', x, dockY + (pulling ? 0 : Math.round(Math.sin(G8.time * 3))), pulling ? 1 : 0);
}
function drawAimUI() {
  const a = G8.aim, hx = sx(HAND_X), hy = sy(HAND_ALT);
  const rad = a.angle * Math.PI / 180, R0 = 44;
  const wedge = (d0, d1, fill) => {
    ctx.beginPath(); ctx.moveTo(hx, hy);
    ctx.arc(hx, hy, R0, -d1 * Math.PI / 180, -d0 * Math.PI / 180); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  };
  wedge(-5, 60, 'rgba(255,255,255,0.12)');
  wedge(SKIP_ZONE[0], SKIP_ZONE[1], 'rgba(123,224,138,0.45)');
  const zr = (SKIP_ZONE[0] + SKIP_ZONE[1]) / 2 * Math.PI / 180;
  drawTextOutlined(ctx, 'SKIP ZONE', hx + Math.cos(zr) * (R0 + 8) + 26, hy - Math.sin(zr) * (R0 + 8) - 4, '#7be08a', 1);
  // trajectory preview: the throw, then the first skips if you time them
  if (a.preview) for (let i = 0; i < a.preview.length; i += 2) {
    const [x, alt, k] = a.preview[i];
    if (k > 0) ctx.globalAlpha = k === 1 ? 0.7 : 0.45;
    px(ctx, '#22163a', sx(x) - 1, sy(alt) - 1, 4, 4);
    px(ctx, k === 0 ? '#ffffff' : '#ffe066', sx(x), sy(alt), 2, 2);
    ctx.globalAlpha = 1;
  }
  // aim needle
  for (let i = 6; i < R0 + 4; i += 2) px(ctx, '#ffe066', hx + Math.cos(rad) * i - 1, hy - Math.sin(rad) * i - 1, 3, 3);
  // the rock pulled back on a band
  const pull = 20 * a.power;
  const rx = hx - Math.cos(rad) * pull, ry = hy + Math.sin(rad) * pull;
  for (let i = 0; i <= 6; i++) px(ctx, '#3a2c63', hx + (rx - hx) * i / 6, hy + (ry - hy) * i / 6, 1, 1);
  drawRock(ctx, save.rock, rx, ry, 0);
  // power + angle readout
  const bx = W / 2 - 80, by = 40;
  px(ctx, '#22163a', bx - 2, by - 2, 164, 14);
  for (let i = 0; i < 10; i++) {
    const on = a.power * 10 > i + 0.01;
    px(ctx, on ? ['#7fe3ff', '#7fe3ff', '#7be08a', '#7be08a', '#7be08a', '#b8f070', '#ffe066', '#ffe066', '#ff9f3a', '#ff6b6b'][i] : '#3a2c63', bx + i * 16, by, 14, 10);
  }
  drawTextOutlined(ctx, 'POWER ' + Math.round(a.power * 100) + '%', bx + 30, by + 14, '#fff', 1);
  const inZone = a.angle >= SKIP_ZONE[0] && a.angle <= SKIP_ZONE[1];
  const angTxt = Math.round(a.angle) + ' DEG ' + (inZone ? 'SKIP ZONE' : a.angle > SKIP_ZONE[1] ? 'HIGH' : 'LOW');
  drawTextOutlined(ctx, angTxt, bx + 160 - textWidth(angTxt) / 2, by + 14, inZone ? '#7be08a' : '#ff9f6b', 1);
}
// a little pointing hand that shows the pull-back gesture
function drawGhostHand(px0, py0, px1, py1, t) {
  const k = Math.min(1, t), x = px0 + (px1 - px0) * k, y = py0 + (py1 - py0) * k;
  const HAND = ['..o.....', '.oyo....', '.oyo....', '.oyooo..', 'ooyyyyo.', 'oyyyyyyo', 'oyyyyyyo', '.oyyyyo.', '..oooo..'];
  blit(ctx, bmp('hand', HAND, { o: '#22163a', y: '#fff4e0' }), x - 2, y - 1);
  if (t > 0.05) { ctx.globalAlpha = 0.5; for (let i = 0; i < 8; i++) px(ctx, '#ffffff', px0 + (x - px0) * i / 8, py0 + (y - py0) * i / 8, 1, 1); ctx.globalAlpha = 1; }
}
function drawRC(x, y, frame = 'rcSide') {
  const r = SPRITE_RECTS[frame];
  if (SPRITES && SPRITES.complete && r) ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3] / 2), r[2], r[3]);
}
function drawRockAndRC(run) {
  const x = sx(run.x), y = sy(run.alt) - 4;
  if (run.phase === 'fly') {
    const hot = run.streak >= 5;
    ctx.globalAlpha = hot ? 0.8 : 0.35;
    const n = hot ? 8 : 4;
    for (let i = 1; i <= n; i++) px(ctx, hot ? (i % 2 ? '#ffe066' : '#ff9f3a') : '#ffffff', x - i * 5, y + Math.round(run.vy / 120 * i * 1.5), hot ? 3 : 2, hot ? 3 : 2);
    ctx.globalAlpha = 1;
    if (run.vy < 0 && run.alt < 90 && !SIM.onIce(run.x)) {
      const tt = run.alt / Math.max(1, -run.vy);
      const cx = sx(run.x + run.vx * tt), cy = sy(0);
      const r = Math.round(3 + tt * 60);
      const steep = Math.atan2(-run.vy, run.vx) * 180 / Math.PI > 48;
      const col = steep ? '#ff5a6a' : tt <= run.s.window ? '#ffe066' : '#ffffff';
      ctx.globalAlpha = 0.8;
      px(ctx, col, cx - r, cy, r * 2, 1); px(ctx, col, cx - 1, cy - 1, 3, 3);
      ctx.globalAlpha = 1;
      if (steep) drawText(ctx, 'STEEP', cx - 14, cy + 6, '#ff5a6a');
    }
  }
  if (run.phase !== 'done') {
    if (run.phase === 'sink') ctx.globalAlpha = Math.max(0, 1 - run.sinkT);
    drawRock(ctx, save.rock, x, y, run.spin);
    ctx.globalAlpha = 1;
  }
  drawRC(sx(G8.rc.x), sy(G8.rc.alt), run.rcT > 0 ? 'rcFront' : 'rcSide');
  if (y < -4) drawText(ctx, '^', x - 2, 22, '#ffe066');
}
function drawBubble() {
  const b = G8.bubble;
  if (!b || G8.screen === 'title' || G8.screen === 'shop') return;
  const w = textWidth(b.text) + 8;
  let x = sx(G8.rc.x), y = sy(G8.rc.alt) - 14;
  x = Math.max(4, Math.min(W - w - 4, x - w / 2)); y = Math.max(34, y - 12);
  px(ctx, '#22163a', x - 1, y - 1, w + 2, 13); px(ctx, '#ffffff', x, y, w, 11);
  drawText(ctx, b.text, x + 4, y + 2, '#22163a');
}

function fmtPrice(p) { return '$' + Math.round(p).toLocaleString('en-US'); }

// ---------- draw: HUD ----------
function drawHUD() {
  const run = G8.run;
  if (!run) return;
  const day = Math.floor(SIM.dayAt(run.x));
  px(ctx, 'rgba(20,12,40,0.55)', 0, 0, W, 20);
  drawText(ctx, SIM.dateAt(run.x), 6, 3, '#fff');
  drawText(ctx, 'DAY ' + day, 6, 11, '#b8a8e8');
  const price = SIM.priceAt(run.alt), up = run.vy >= 0;
  const ptxt = 'ETH ' + fmtPrice(price), pw = textWidth(ptxt, 2);
  drawText(ctx, ptxt, W / 2 - 30 - pw / 2, 4, up ? '#7be08a' : '#ff6b6b', 2);
  drawText(ctx, up ? '^' : 'V', W / 2 - 24 + pw / 2, 7, up ? '#7be08a' : '#ff6b6b');
  blit(ctx, GEM(), W / 2 + 40, 6);
  drawText(ctx, String(run.gems), W / 2 + 50, 7, '#d6c2ff');
  drawMiniChart(run.candles, W - 110, 3, 84, 14);
  if (run.balanceV2) {
    drawText(ctx, 'GAS ' + Math.ceil(run.gas) + '/' + run.s.gas, 6, 24, run.gas > 0 ? '#7be08a' : '#ff6b6b');
    px(ctx, '#322443', 6, 34, 64, 4);
    px(ctx, '#7be08a', 6, 34, 64 * run.gas / run.s.gas, 4);
    drawText(ctx, '5K ' + (3 - run.supportHits.broke5k) + '/3  10K ' + (3 - run.supportHits.broke10k) + '/3', 6, 41, '#ffcf70');
  }
  if (G8.screen === 'fly') {
    drawText(ctx, 'II', W - 16, 7, '#fff');
    const by = H - 12;
    if (!G8.touch && !G8.tut) {
      const want = boostWanted(run);
      drawBoostBtn(BOOST_BTNS.bounce, 'X', 'BOUNCE', run.bounces, '#7b55c6', want);
      drawBoostBtn(BOOST_BTNS.rc, 'C', 'RC LIFT', run.rc, '#1cb6d8', want);
    }
    if (boostWanted(run) && (run.bounces || run.rc) && !G8.tut && (G8.time * 3 | 0) % 2 === 0) {
      const t = G8.touch ? (run.rc ? 'TAP RC!' : 'TAP BOUNCE!') : (run.rc ? 'SPACE OR C: RC LIFT!' : 'PRESS X: BOUNCE!');
      drawTextOutlined(ctx, t, sx(run.x), Math.max(40, sy(run.alt) - 34), '#7fe3ff', 1);
    }
    if (run.streak >= 2) drawTextOutlined(ctx, run.streak + 'X STREAK', W / 2, 44, run.streak >= 5 ? '#ff9f3a' : '#ffe066', 1);
    if (save.runs < 3 && G8.hintT < 12 && !G8.tut) {
      const tip = G8.hintT < 4 ? (G8.touch ? 'TAP AS THE ROCK HITS THE WATER' : 'TAP SPACE AS THE ROCK HITS THE WATER')
        : G8.hintT < 8 ? (G8.touch ? 'HOLD UP OR DOWN TO TILT' : 'UP AND DOWN TILT THE ROCK')
        : (G8.touch ? 'BOUNCE AND RC BUTTONS FOR BOOSTS' : 'X BOUNCES. C OR SPACE IN THE AIR CALLS RC');
      drawTextOutlined(ctx, tip, W / 2, 104, '#fff', 1);
    }
  }
  drawNews();
  if (G8.banner) {
    // slides down, holds, slides back up (no alpha: stacked outlines smear when faded)
    const b = G8.banner, k = Math.min(1, b.t * 4, (3.8 - b.t) * 4);
    const y = Math.round(-40 + 102 * (1 - Math.pow(1 - Math.max(0, k), 3)));
    drawTextOutlined(ctx, b.title, W / 2, y, '#ffe066', 3);
    drawTextOutlined(ctx, b.sub, W / 2, y + 26, '#ffffff', 1);
  }
}
// boosts are worth it when the rock is slowing down near the water
// SPACE doubles as the RC button while the rock is up in the air. Near the water it stays a skip tap only,
// so timing a skip never burns an RC lift.
function spaceCallsRc(run) {
  if (!run || run.phase !== 'fly' || run.rc <= 0 || run.rcT > 0 || run.iceSlide) return false;
  return run.vy > 0 ? run.alt > 25 : run.alt / Math.max(1, -run.vy) > 0.35;
}
function boostWanted(run) { return run.phase === 'fly' && run.vx < 240 && run.alt < 70 && (run.bounces > 0 || run.rc > 0) && run.rcT <= 0; }
// a ring of sparks where the rock bounced off thin air
function bounceRing(x, alt) {
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; G8.parts.push({ x, alt, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, t: 0, life: 0.35, color: '#7fe3ff', kind: 'puff' }); }
}
function drawBoostBtn([x, y, w, h], keyLbl, name, n, col, glow) {
  const lit = n > 0 && glow && (G8.time * 4 | 0) % 2 === 0;
  px(ctx, '#22163a', x - 1, y - 1, w + 2, h + 2);
  px(ctx, n ? (lit ? '#ffe066' : col) : '#4a4060', x, y, w, h);
  px(ctx, '#22163a', x + 3, y + 3, 14, 14); drawText(ctx, keyLbl, x + 7, y + 6, '#fff');
  drawText(ctx, name, x + 21, y + 4, lit ? '#22163a' : '#fff');
  for (let i = 0; i < n; i++) px(ctx, lit ? '#22163a' : '#ffffff', x + 21 + i * 7, y + 14, 5, 5);
}
function drawNews() {
  const n = G8.news;
  if (!n) return;
  const k = Math.min(1, n.t * 5, (5.5 - n.t) * 5);
  const y = 20 + Math.round(-12 * (1 - Math.max(0, k)));
  px(ctx, '#22163a', 0, y, W, 11);
  px(ctx, '#e5487f', 0, y, 58, 11);
  drawText(ctx, 'BREAKING', 5, y + 2, '#fff');
  const [yy, mm] = n.date.split('-');
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+mm - 1];
  drawText(ctx, mon + ' ' + yy, 64, y + 2, '#ffe066');
  drawText(ctx, n.text, 120, y + 2, '#ffffff');
}
function drawMiniChart(cs0, x, y, w, h) {
  const cs = cs0.slice(-Math.floor(w / 3));
  if (!cs.length) return;
  let lo = 1000, hi = 5200;
  for (const c of cs) hi = Math.max(hi, c.h);
  const Y = p => y + h - Math.round((p - lo) / (hi - lo) * h);
  px(ctx, '#ff5a6a', x, Y(4953), w, 1);
  cs.forEach((c, i) => {
    const col = c.c >= c.o ? '#7be08a' : '#ff6b6b';
    const cx = x + i * 3;
    px(ctx, col, cx + 1, Y(c.h), 1, Math.max(1, Y(c.l) - Y(c.h)));
    const t = Math.min(Y(c.o), Y(c.c)), b = Math.max(Y(c.o), Y(c.c));
    px(ctx, col, cx, t, 2, Math.max(1, b - t));
  });
}
// the whole run as one chart, squeezed to fit
function drawRunChart(cs, x, y, w, h) {
  px(ctx, '#22163a', x - 1, y - 1, w + 2, h + 2); px(ctx, '#1a1236', x, y, w, h);
  if (!cs.length) return;
  const per = Math.max(1, Math.ceil(cs.length / Math.floor(w / 3)));
  const merged = [];
  for (let i = 0; i < cs.length; i += per) {
    const g = cs.slice(i, i + per);
    merged.push({ o: g[0].o, c: g[g.length - 1].c, h: Math.max(...g.map(c => c.h)), l: Math.min(...g.map(c => c.l)) });
  }
  let lo = 1000, hi = 5400;
  for (const c of merged) hi = Math.max(hi, c.h * 1.05);
  const Y = p => y + h - 2 - Math.round((p - lo) / (hi - lo) * (h - 4));
  for (let p = 2000; p < hi; p += 1000) { ctx.globalAlpha = 0.15; px(ctx, '#fff', x, Y(p), w, 1); ctx.globalAlpha = 1; }
  for (let i = 0; i < w; i += 4) px(ctx, '#ff5a6a', x + i, Y(4953), 2, 1);
  if (hi > 10000) for (let i = 0; i < w; i += 4) px(ctx, '#7be08a', x + i, Y(10000), 2, 1);
  const step = Math.max(1, Math.min(6, Math.floor((w - 4) / merged.length)));
  merged.forEach((c, i) => {
    const col = c.c >= c.o ? '#7be08a' : '#ff6b6b', cx = x + 2 + i * step;
    px(ctx, col, cx + Math.floor(step / 2) - 1, Y(c.h), 1, Math.max(1, Y(c.l) - Y(c.h)));
    const t = Math.min(Y(c.o), Y(c.c)), b = Math.max(Y(c.o), Y(c.c));
    px(ctx, col, cx, t, Math.max(1, step - 1), Math.max(1, b - t));
  });
  drawText(ctx, 'ATH', x + w - 20, Y(4953) - 9, '#ff5a6a');
}

function drawTouchButtons() {
  if (!G8.touch || G8.screen !== 'fly') return;
  const run = G8.run;
  const held = new Set([...pointers.values()].map(q => q.btn));
  const lab = { up: '^', down: 'V', bounce: 'BOUNCE ' + run.bounces, rc: 'RC ' + run.rc, skip: 'SKIP' };
  const col = { up: '#7b55c6', down: '#7b55c6', bounce: '#7b55c6', rc: '#1cb6d8', skip: '#e5487f' };
  for (const k in TOUCH_BTNS) {
    const [x, y, w, h] = TOUCH_BTNS[k];
    ctx.globalAlpha = held.has(k) ? 0.7 : 0.3;
    px(ctx, '#22163a', x, y + 2, w, h); px(ctx, col[k], x, y, w, h - 2);
    ctx.globalAlpha = 1;
    const big = k === 'skip' || k === 'up' || k === 'down';
    drawTextC(ctx, lab[k], x + w / 2, y + h / 2 - (big ? 7 : 4), '#fff', big ? 2 : 1);
  }
}

function panel(x, y, w, h) {
  px(ctx, '#22163a', x - 2, y - 2, w + 4, h + 4);
  px(ctx, '#fdf6e0', x, y, w, h);
  px(ctx, '#e8dcc0', x, y + h - 3, w, 3);
}

// ---------- screens ----------
function drawTitle() {
  drawWorld();
  ctx.globalAlpha = 0.35; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const bob = Math.round(Math.sin(G8.time * 2) * 2);
  drawTextOutlined(ctx, 'SKIP TO 10K', W / 2, 30 + bob, '#ffe066', 5);
  drawTextOutlined(ctx, 'A DROOBER AND RC ROCK SKIPPING SAGA', W / 2, 76, '#fff', 1);
  const lore = ['IN 2017 SOMEBODY MADE 100 ROCKS.', 'THEY DO NOTHING. THAT IS THE POINT.', 'DROOBER FOUND ONE BY THE LAKE.', 'HOW FAR CAN A ROCK GO?'];
  lore.forEach((l, i) => { if (G8.time * 1.2 > i * 0.8) drawTextOutlined(ctx, l, W / 2, 100 + i * 12, '#d6c2ff', 1); });
  if ((G8.time * 2 | 0) % 2 === 0) drawTextOutlined(ctx, G8.touch ? 'TAP TO START' : 'PRESS SPACE OR CLICK', W / 2, 160, '#fff', 1);
  if (save.best.days) drawTextOutlined(ctx, 'BEST DAY ' + save.best.days + '   PEAK ' + fmtPrice(save.best.peak) + '   RANK ' + META.RANKS[META.rankOf(save.missions.length)], W / 2, 174, '#ffe066', 1);
  drawText(ctx, 'M MUTE  N MUSIC', 6, H - 10, '#b8a8e8');
  drawText(ctx, 'BY DROOBER', W - 66, H - 10, '#b8a8e8');
  // how to play
  const [ix, iy, iw, ih] = INFO_BTN, pulse = (G8.time * 2 | 0) % 2 === 0;
  px(ctx, '#22163a', ix - 1, iy - 1, iw + 2, ih + 2); px(ctx, pulse ? '#e5487f' : '#c03a6a', ix, iy, iw, ih);
  drawText(ctx, 'I', ix + 6, iy + 4, '#fff', 2); drawText(ctx, 'HOW TO PLAY', ix + 20, iy + 8, '#fff');
}
const INFO_BTN = [W - 96, 6, 90, 22];

function drawAim() {
  drawWorld();
  drawAimUI();
  if (G8.tut) return;
  const a = G8.aim;
  px(ctx, 'rgba(20,12,40,0.55)', 0, 0, W, 30);
  drawText(ctx, 'ROCK #' + save.rock, 6, 3, '#fff');
  drawText(ctx, 'GWEI ' + save.gwei, 6, 11, '#d6c2ff');
  px(ctx, '#3a2c63', ...SHOP_BTN); drawTextC(ctx, 'SHOP', SHOP_BTN[0] + 25, 7, '#fff');
  drawText(ctx, 'MISSIONS', 92, 3, '#ffe066');
  META.active(save).forEach((m, i) => drawText(ctx, m.text, 148, 3 + i * 8, '#fff'));
  if (a.warnT > 0) drawTextOutlined(ctx, 'PULL BACK FURTHER', W / 2, 68, '#ff9f6b', 2);
  else if (!a.drag && !a.charging) {
    drawTextOutlined(ctx, G8.touch ? 'DRAG BACK ANYWHERE. LET GO TO THROW' : 'DRAG BACK WITH THE MOUSE, OR UP DOWN + HOLD SPACE', W / 2, 68, '#fff', 1);
    if (save.runs < 3) drawGhostHand(320, 120, 268, 135, (G8.time % 2.2) / 1.4);
  }
}
const RES_PANEL = [24, 24, 432, 222];
const RES_AGAIN = [RES_PANEL[0] + 16, RES_PANEL[1] + RES_PANEL[3] - 26, 130, 18];
function drawResults() {
  drawWorld(); drawHUD();
  const r = G8.res;
  ctx.globalAlpha = 0.45; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const [x, y, w, h] = RES_PANEL;
  panel(x, y, w, h);
  drawText(ctx, 'ROCK #' + save.rock + (r.reason === 'FROZE' ? ' FROZE' : ' SANK'), x + 12, y + 8, '#22163a', 2);
  drawText(ctx, r.date + '  .  ' + r.era, x + 12, y + 26, '#7a4a8a');
  const rows = [
    ['DAYS', String(r.days) + (r.newBest ? '  NEW BEST' : '')],
    ['PEAK', fmtPrice(r.peak)], ['AVG PRICE', fmtPrice(r.vwap)],
    ['SKIPS', r.skips + '  (' + r.perfects + ' PERFECT)'], ['BEST STREAK', r.bestStreak + 'X'],
    ['GEMS', String(r.gems)], ['GWEI', '+' + r.earned + (r.mult > 1 ? '  (X' + r.mult.toFixed(2) + ')' : '')],
  ];
  rows.forEach(([a, b], i) => { drawText(ctx, a, x + 12, y + 42 + i * 11, '#5a4a7a'); drawText(ctx, b, x + 86, y + 42 + i * 11, i === 6 ? '#3fa86a' : '#22163a'); });
  drawText(ctx, 'YOUR CHART', x + 232, y + 30, '#7a4a8a');
  drawRunChart(r.candles, x + 232, y + 40, 186, 74);
  let my = y + 126;
  if (r.done.length) {
    r.done.forEach(m => { drawText(ctx, '* ' + m.text, x + 12, my, '#e0a020'); drawText(ctx, '+' + m.reward, x + w - 50, my, '#3fa86a'); my += 10; });
    if (r.rankUp) { drawText(ctx, 'RANK UP: ' + r.rankUp, x + 12, my, '#e5487f'); my += 10; }
  } else {
    drawText(ctx, 'MISSIONS', x + 12, my, '#7a4a8a'); my += 10;
    META.active(save).forEach(m => { drawText(ctx, '- ' + m.text, x + 12, my, '#8a7aa8'); my += 9; });
  }
  if (r.leftBounces + r.leftRc > 0) drawText(ctx, 'UNUSED: ' + r.leftBounces + ' BOUNCES, ' + r.leftRc + ' RC LIFTS. USE THEM WHEN YOU SLOW DOWN', x + 12, y + h - 60, '#e0a020');
  drawTextC(ctx, '"' + r.quip + '"', x + w / 2 - 20, y + h - 46, '#e5487f');
  drawFrameAt(ctx, 'wave', x + w - 30, y + h - 4, 0);
  drawRC(x + w - 58, y + h - 30 + Math.sin(G8.time * 4) * 2, 'rcFront');
  px(ctx, '#e5487f', ...RES_AGAIN); drawTextC(ctx, G8.touch ? 'AGAIN' : 'R  AGAIN', RES_AGAIN[0] + 65, RES_AGAIN[1] + 6, '#fff');
  px(ctx, '#3a2c63', RES_AGAIN[0] + 140, RES_AGAIN[1], 130, 18); drawTextC(ctx, G8.touch ? 'SHOP' : 'SPACE  SHOP', RES_AGAIN[0] + 205, RES_AGAIN[1] + 6, '#fff');
}

// ---------- shop ----------
const TABS = ['UPGRADES', 'ROCKS', 'MISSIONS'];
const SHOP = { x: 50, y: 18, w: 380, h: 228, rowH: 21 };
let shopFlash = 0;
function buy(i) {
  const u = SIM.UPGRADES[i], lvl = save.up[u.id] || 0;
  if (lvl >= SIM.MAX_LVL) { Audio8.sfx('nope'); return; }
  const c = SIM.upgradeCost(u, lvl);
  if (save.gwei < c) { Audio8.sfx('nope'); shopFlash = 0.4; return; }
  save.gwei -= c; save.up[u.id] = lvl + 1; persist();
  Audio8.sfx('buy');
}
function buyRockNow() {
  const k = META.buyRock(save);
  if (k === null) { Audio8.sfx('nope'); shopFlash = 0.4; return; }
  save.rock = k; G8.rockSel = save.rocks.length - 1; persist();
  Audio8.sfx('buy');
}
function pickRock(i) { G8.rockSel = i; save.rock = save.rocks[i]; persist(); Audio8.sfx('menu'); }
function shopKey(code) {
  const n = SIM.UPGRADES.length;
  if (code === 'KeyQ' || code === 'Tab' || (code === 'ArrowLeft' && G8.shopTab !== 1)) { G8.shopTab = (G8.shopTab + 2) % 3; Audio8.sfx('menu'); return; }
  if (code === 'KeyE' || (code === 'ArrowRight' && G8.shopTab !== 1)) { G8.shopTab = (G8.shopTab + 1) % 3; Audio8.sfx('menu'); return; }
  if (code === 'KeyT') return toAim();
  if (G8.shopTab === 0) {
    if (code === 'ArrowUp' || code === 'KeyW') { G8.shopSel = (G8.shopSel + n) % (n + 1); Audio8.sfx('menu'); }
    if (code === 'ArrowDown' || code === 'KeyS') { G8.shopSel = (G8.shopSel + 1) % (n + 1); Audio8.sfx('menu'); }
    if (code === 'Enter' || code === 'KeyB' || code === 'Space') { if (G8.shopSel === n) toAim(); else buy(G8.shopSel); }
  } else if (G8.shopTab === 1) {
    const L = save.rocks.length;
    if (code === 'ArrowLeft') pickRock((G8.rockSel + L - 1) % L);
    if (code === 'ArrowRight') pickRock((G8.rockSel + 1) % L);
    if (code === 'KeyB' || code === 'Enter') buyRockNow();
    if (code === 'Space') toAim();
  } else if (ACTION_KEYS.includes(code)) toAim();
}
const THROW_BTN = [SHOP.x + 8, SHOP.y + SHOP.h - 26, SHOP.w - 16, 18];
const rockCell = i => [SHOP.x + 150 + (i % 11) * 20, SHOP.y + 54 + Math.floor(i / 11) * 15];
const ROCK_BUY_BTN = [SHOP.x + 12, SHOP.y + 150, 124, 18];
function shopClick(p) {
  const { x, y, w, rowH } = SHOP;
  for (let i = 0; i < 3; i++) if (hitRect(p, [x + 8 + i * 90, y + 6, 86, 14])) { G8.shopTab = i; Audio8.sfx('menu'); return; }
  if (hitRect(p, THROW_BTN)) return toAim();
  if (G8.shopTab === 0) {
    SIM.UPGRADES.forEach((u, i) => { if (hitRect(p, [x + 4, y + 30 + i * rowH - 3, w - 8, rowH - 2])) { G8.shopSel = i; buy(i); } });
  } else if (G8.shopTab === 1) {
    if (hitRect(p, ROCK_BUY_BTN)) return buyRockNow();
    save.rocks.forEach((k, i) => { const [cx, cy] = rockCell(i); if (hitRect(p, [cx, cy, 18, 14])) pickRock(i); });
  }
}
function drawShop() {
  G8.camX = DOCK_START - 30; G8.camAlt = 0;
  drawWorld();
  ctx.globalAlpha = 0.45; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  const { x, y, w, h, rowH } = SHOP;
  panel(x, y, w, h);
  TABS.forEach((t, i) => {
    const on = G8.shopTab === i;
    px(ctx, on ? '#7b55c6' : '#e8dcc0', x + 8 + i * 90, y + 6, 86, 14);
    drawTextC(ctx, t, x + 8 + i * 90 + 43, y + 10, on ? '#fff' : '#7a4a8a');
  });
  blit(ctx, GEM(), x + w - 92, y + 9);
  drawText(ctx, 'GWEI ' + save.gwei, x + w - 82, y + 10, shopFlash > 0 ? '#e5487f' : '#7a4a8a');
  if (G8.shopTab === 0) {
    SIM.UPGRADES.forEach((u, i) => {
      const ry = y + 30 + i * rowH, lvl = save.up[u.id] || 0, sel = G8.shopSel === i;
      if (sel) px(ctx, '#f0e4ff', x + 4, ry - 3, w - 8, rowH - 2);
      drawText(ctx, u.name, x + 10, ry, '#22163a');
      for (let k = 0; k < SIM.MAX_LVL; k++) px(ctx, k < lvl ? '#7b55c6' : '#d8cce8', x + 110 + k * 9, ry, 7, 7);
      const cost = SIM.upgradeCost(u, lvl);
      drawText(ctx, lvl >= SIM.MAX_LVL ? 'MAX' : cost + ' GWEI', x + 165, ry, lvl >= SIM.MAX_LVL ? '#3fa86a' : save.gwei >= cost ? '#22163a' : '#b0a0c0');
      drawText(ctx, u.desc, x + 165, ry + 8, '#8a7aa8');
    });
  } else if (G8.shopTab === 1) {
    drawText(ctx, 'THE ROCK GARDEN', x + 12, y + 30, '#22163a');
    drawText(ctx, save.rocks.length + ' OF 100 ROCKS', x + 150, y + 30, '#7a4a8a');
    drawText(ctx, '+2% GWEI PER EXTRA ROCK', x + 150, y + 40, '#8a7aa8');
    ctx.save(); ctx.translate(x + 72, y + 86); ctx.scale(3, 3); drawRock(ctx, save.rock, 0, 0, 0); ctx.restore();
    drawTextC(ctx, 'ROCK #' + save.rock, x + 72, y + 112, '#22163a');
    drawTextC(ctx, 'IT DOES NOTHING', x + 72, y + 122, '#8a7aa8');
    save.rocks.forEach((k, i) => {
      const [cx, cy] = rockCell(i);
      if (k === save.rock) px(ctx, '#7b55c6', cx - 1, cy - 1, 20, 16);
      drawRock(ctx, k, cx + 9, cy + 7, 0);
    });
    const price = META.rockPrice(save.rocks.length);
    const can = save.gwei >= price && save.rocks.length < 100;
    px(ctx, can ? '#e5487f' : '#c0b4d0', ...ROCK_BUY_BTN);
    drawTextC(ctx, 'BUY A ROCK ' + price, ROCK_BUY_BTN[0] + 62, ROCK_BUY_BTN[1] + 6, '#fff');
    drawText(ctx, 'EACH ROCK COSTS MORE', x + 12, y + 174, '#8a7aa8');
    drawText(ctx, 'THAN THE LAST ONE.', x + 12, y + 183, '#8a7aa8');
  } else {
    const done = save.missions.length, rank = META.rankOf(done);
    drawText(ctx, 'RANK: ' + META.RANKS[rank], x + 12, y + 30, '#22163a', 2);
    drawText(ctx, done + ' OF ' + META.MISSIONS.length + ' MISSIONS.  +' + Math.round((META.multiplier(save) - 1) * 100) + '% GWEI', x + 12, y + 48, '#7a4a8a');
    if (rank < META.RANKS.length - 1) drawText(ctx, 'NEXT RANK: ' + META.RANKS[rank + 1] + ' IN ' + (3 - done % 3) + ' MISSIONS', x + 12, y + 58, '#8a7aa8');
    META.active(save).forEach((m, i) => {
      const ry = y + 76 + i * 22;
      px(ctx, '#f0e4ff', x + 8, ry - 4, w - 16, 18);
      drawText(ctx, m.text, x + 14, ry + 2, '#22163a');
      drawText(ctx, '+' + m.reward + ' GWEI', x + w - 76, ry + 2, '#3fa86a');
    });
    const tro = [['BROKE 5K', save.flags.broke5k], ['BROKE 10K', save.flags.broke10k], ['REACHED TODAY', save.flags.today], ['FOREVER', save.flags.forever]];
    drawText(ctx, 'TROPHIES', x + 12, y + 148, '#7a4a8a');
    tro.forEach(([name, got], i) => drawText(ctx, (got ? '* ' : '- ') + name, x + 12 + (i % 2) * 150, y + 160 + Math.floor(i / 2) * 10, got ? '#e0a020' : '#c0b4d0'));
    drawText(ctx, 'BEST DAY ' + save.best.days + '   BEST PEAK ' + fmtPrice(save.best.peak) + '   RUNS ' + save.runs, x + 12, y + 186, '#8a7aa8');
  }
  px(ctx, '#e5487f', ...THROW_BTN);
  drawTextC(ctx, 'THROW A ROCK', THROW_BTN[0] + THROW_BTN[2] / 2, THROW_BTN[1] + 6, '#fff');
  const help = G8.touch ? 'TAP A TAB. TAP TO BUY' : G8.shopTab === 1 ? 'LEFT RIGHT PICK ROCK. B BUYS. Q E TABS. T THROWS'
    : 'UP DOWN PICK. ENTER BUYS. Q E TABS. T THROWS';
  drawTextC(ctx, help, W / 2, H - 12, '#fff');
}

function drawPause() {
  ctx.globalAlpha = 0.5; px(ctx, '#22163a', 0, 0, W, H); ctx.globalAlpha = 1;
  drawTextOutlined(ctx, 'PAUSED', W / 2, 100, '#ffe066', 3);
  drawTextOutlined(ctx, 'ESC OR TAP TO RESUME', W / 2, 130, '#fff', 1);
}

function draw() {
  ctx.save();
  if (G8.shake > 0) ctx.translate((Math.random() - 0.5) * G8.shake, (Math.random() - 0.5) * G8.shake);
  switch (G8.screen) {
    case 'title': drawTitle(); break;
    case 'aim': drawAim(); drawTut(); break;
    case 'fly': drawWorld(); drawHUD(); if (!G8.tut) drawTouchButtons(); drawTut(); if (G8.paused) drawPause(); break;
    case 'results': drawResults(); break;
    case 'shop': drawShop(); break;
  }
  ctx.restore();
}

// ---------- demo ----------
// ?demo=<day>[&alt=<alt>]: a bot throws and plays from that day. &screen=shop|rocks|missions|aim|tut|results, &touch
const DEMO = (() => { try { const q = new URLSearchParams(location.search); return q.has('demo') ? { day: +q.get('demo') || 0, alt: +q.get('alt') || 0, screen: q.get('screen'), touch: q.has('touch'), ff: +q.get('ff') || 0 } : null; } catch { return null; } })();
function demoStart() {
  if (DEMO.touch) G8.touch = true;
  if (['shop', 'rocks', 'missions'].includes(DEMO.screen)) {
    save.gwei = 1234; save.up = { arm: 3, rock: 2, hands: 1, bounce: 4 }; save.rocks = [7, 42, 3, 88, 15, 61]; save.rock = 42; save.missions = [0, 1, 2, 3, 5];
    toShop(); G8.shopTab = ['shop', 'rocks', 'missions'].indexOf(DEMO.screen); return;
  }
  if (DEMO.screen === 'tut') { startTut(); return; }
  toAim();
  if (DEMO.screen === 'aim') { const a = G8.aim; a.drag = { x0: 300, y0: 120, x: 252, y: 134 }; aimFromDrag(a); updateAim(0); return; }
  G8.aim.angle = 14; G8.aim.power = 1; doThrow();
  const run = G8.run;
  run.x = DEMO.day * SIM.PX_PER_DAY; run.vx = 520; run.alt = DEMO.alt || 60; run.vy = 120;
  G8.camX = run.x - 150; G8.camAlt = Math.max(0, run.alt - 105); G8.rc = { x: run.x - 20, alt: run.alt + 16 };
  G8.newsI = META.NEWS.findIndex(n => n.day > DEMO.day - 30); if (G8.newsI < 0) G8.newsI = META.NEWS.length;
  if (DEMO.screen === 'results') {
    run.phase = 'done';
    run.candles = Array.from({ length: 60 }, (_, i) => { const o = 1500 + Math.sin(i / 3) * 600 + i * 40; return { i, o, c: o + Math.sin(i) * 300, h: o + 500, l: o - 300 }; });
    finishRun(); G8.res.at = -9;
  }
}
function demoInput() { const b = SIM.botInput(G8.run); if (b.skip) edge.skip = true; if (b.bounce) edge.bounce = true; }

// ---------- mobile ----------
// Android: go fullscreen and lock landscape on the first touch. iOS can't, so index.html shows a rotate screen.
let triedLandscape = false;
function goLandscape() {
  if (triedLandscape) return;
  triedLandscape = true;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
  } catch {}
}
function checkPortrait() {
  const upright = G8.touch && innerHeight > innerWidth;
  document.body.classList.toggle('portrait', upright);
  if (upright && G8.screen === 'fly' && !G8.tut) G8.paused = true;
}

// ---------- boot ----------
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const k = s >= 2 ? Math.floor(s) : s;
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
}
addEventListener('resize', () => { fit(); checkPortrait(); }); fit();
if (matchMedia('(pointer: coarse)').matches) G8.touch = true;
checkPortrait();
SPRITES = new Image();
SPRITES.src = 'assets/sprites.png';
let last = performance.now();
let arcadeFrame, arcadeDestroyed = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!window.TokenArcade?.paused) update(dt);
  draw();
  if (!arcadeDestroyed) arcadeFrame = requestAnimationFrame(frame);
}
if (DEMO && !window.TokenArcade?.embedded) { demoStart(); for (let i = 0; i < DEMO.ff * 60; i++) update(1 / 60); } // standalone preview only
arcadeFrame = requestAnimationFrame(frame);
window.TokenArcade?.register({
  capabilities: { pause: true, touch: true, keyboard: true, orientation: 'landscape' },
  mount(config) {
    if (config.mode !== 'free' && !config.seed) throw new Error('Passport Play needs a server-issued seed.');
    SAVE_KEY = 'ta.' + config.gameId + '.skip10k.v1';
    Object.assign(save, loadSave()); Audio8.setMuted(save.muted);
  },
  start() { toAim(); },
  pause() { G8.paused = true; keys.clear(); pointers.clear(); edge.skip = edge.bounce = edge.rc = false; Audio8.ctx?.suspend(); },
  resume() { G8.paused = false; last = performance.now(); Audio8.ctx?.resume(); },
  restart() { toAim(); },
  audio(muted) { Audio8.setMuted(muted); },
  destroy() { arcadeDestroyed = true; cancelAnimationFrame(arcadeFrame); clearInterval(Audio8.timer); Audio8.ctx?.close(); keys.clear(); pointers.clear(); }
});
