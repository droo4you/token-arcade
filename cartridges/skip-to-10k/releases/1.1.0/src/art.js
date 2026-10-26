// Procedural pixel art: era backdrops, the lake, and every critter on it. Draws to a 480x270 canvas.
const W = 480, H = 270, WATER_Y = 205;
let SPRITES = null; // HTMLImageElement, Droober + RC sheet

function px(ctx, c, x, y, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

function disc(ctx, c, cx, cy, r) {
  for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); px(ctx, c, cx - w, cy + y, w * 2, 1); }
}
// entity labels: outlined so they read on any sky
function lab(ctx, s, x, y, c) { drawTextOutlined(ctx, s, Math.round(x + textWidth(s) / 2), y, c, 1); }
// drifting clouds at every altitude so climbing feels like climbing
function drawClouds(ctx, eraId, camX, camAlt) {
  const night = eraId === 'merge' || eraId === 'forever';
  const col = night ? '#3a2c78' : '#ffffff';
  ctx.globalAlpha = night ? 0.5 : 0.55;
  for (let band = 0; band < 40; band++) {
    const alt = 140 + band * 70;
    const y = WATER_Y - alt + camAlt;
    if (y < -20 || y > WATER_Y + camAlt - 60) continue;
    for (let i = 0; i < 3; i++) {
      const seed = band * 3 + i, span = 900;
      const x = ((hash(seed, 1) * span - camX * 0.5) % span + span) % span - 60;
      if (x > W) continue;
      const w = 24 + hash(seed, 2) * 40;
      px(ctx, col, x, y, w, 6); px(ctx, col, x + w * 0.2, y - 4, w * 0.5, 4);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- bitmap sprites ----------
// Rows of characters, each mapped to a color. '.' is transparent.
const BMP_CACHE = new Map();
function bmp(key, rows, pal) {
  if (BMP_CACHE.has(key)) return BMP_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  BMP_CACHE.set(key, c);
  return c;
}
function blit(ctx, img, x, y, flip = false) {
  if (!flip) return ctx.drawImage(img, Math.round(x), Math.round(y));
  ctx.save(); ctx.translate(Math.round(x) + img.width, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
}

const ROCK_ROWS = [
  '.....oooooo.....',
  '...oobbbbbbooo..',
  '..obbbcccbbbbbo.',
  '.obbbccbbbbbbbbo',
  'obbbcbbbbbbbcbbo',
  'obbbbbbbbbbbbbbo',
  'obbbbbbbbbbbbbdo',
  'oddbbbbbbbbbbddo',
  '.oddddbbbbbdddo.',
  '..ooddddddddoo..',
  '....oooooooo....',
];
// The 100 Ether Rocks were one clip-art rock in different colors. Rock #n gets its own tint.
function rockPalette(n) {
  if (n === 0) return { o: '#2a2236', b: '#9a96a6', c: '#d8d4e2', d: '#6e6a7c' };
  const hue = (n * 47) % 360, sat = 18 + (n * 13) % 40;
  return { o: '#2a2236', b: `hsl(${hue} ${sat}% 62%)`, c: `hsl(${hue} ${sat}% 82%)`, d: `hsl(${hue} ${sat}% 44%)` };
}
function drawRock(ctx, n, cx, cy, spin = 0) {
  const img = bmp('rock' + n, ROCK_ROWS, rockPalette(n));
  const f = Math.floor(spin) % 2 === 1;
  blit(ctx, img, cx - 8, cy - 6, f);
}

const GEM = bmp.bind(null, 'gem', [
  '...o...',
  '..oLo..',
  '.oLLDo.',
  'oLLLDDo',
  '.oDDDo.',
  '..oDo..',
  '...o...',
], { o: '#3a1f6e', L: '#d6c2ff', D: '#8f6ae0' });
const BALL = bmp.bind(null, 'ball', [
  '..oooo..',
  '.obbwwo.',
  'obbbbwbo',
  'owwwwwwo',
  'orrrrrro',
  '.orrrro.',
  '..oooo..',
], { o: '#22163a', b: '#3a8ad8', w: '#ffffff', r: '#e5487f' });
const CRAB = bmp.bind(null, 'crab', [
  'o.......o',
  'oo.....oo',
  '.orrrrro.',
  'orrwrwrro',
  '.rrrrrrr.',
  'r.r...r.r',
], { o: '#b8321e', r: '#f0643c', w: '#fff' });
const SUIT = bmp.bind(null, 'suit', [
  '...hhhh.....',
  '..hhhhhh....',
  '..sssssh....',
  '..kkskks....',
  '..ssssss....',
  '...sssm.....',
  '.bbbwwbbb...',
  'bbbbwtbbbb..',
  'bbbbwtbbbb..',
  'bbbbwtbbbb..',
  'bb.bbbbb.bb.',
  'bb.bbbbb.bb.',
  'ss.bbbbb.ss.',
  '...bbbbb.ccc',
  '...bb.bb.cgc',
  '...bb.bb.ccc',
  '...bb.bb....',
  '..kkk.kkk...',
], { h: '#2a1a12', s: '#f2c49a', k: '#111', m: '#b86a5a', b: '#2d2f45', w: '#fff', t: '#d03a4a', c: '#5a3a1a', g: '#e8c040' });
const KEVIN = bmp.bind(null, 'kevin', [
  '.....oooooo.....',
  '...oogggggggo...',
  '..ogggggggggggo.',
  '.ogwwwggggwwwggo',
  '.ogwkwggggwkwggo',
  'ogggwwggggwwgggo',
  'ogggggggggggggo.',
  'ogggmmmmmmmgggo.',
  '.oggmrrrrrmggo..',
  '.ogggmmrmmgggo..',
  '..oggggggggggo..',
  '...ooggggggoo...',
], { o: '#2c3a1e', g: '#9ccf5a', w: '#fff', k: '#111', m: '#3a1a1a', r: '#ff7a9a' });
const APE = bmp.bind(null, 'ape', [
  '..cccccc..',
  '.cccccccc.',
  '.cccccccccc',
  '.ffffffff.',
  'ffkkffkkff',
  'ffwkffwkff',
  '.fttttttf.',
  '.fttmmttf.',
  '..ffffff..',
  '.ffffffff.',
], { c: '#e0483a', f: '#7a4a2a', k: '#4a2a14', w: '#fff', t: '#d8b088', m: '#3a1a10' });
const SKRUMP = bmp.bind(null, 'skrump', [
  '..o.o.o.o...',
  '.oppppppppo.',
  'oppppppppppo',
  'opwwppppwwpo',
  'opwkppppwkpo',
  'oppppppppppo',
  'opppmmmmpppo',
  'oppppmmppppo',
  '.oppppppppo.',
  '..oo....oo..',
], { o: '#3a1a6a', p: '#a77bff', w: '#fff', k: '#111', m: '#3a1a1a' });
const FROG = bmp.bind(null, 'frog', [
  '.ww..ww.',
  'wkwgwkw.',
  'gwwggww.',
  'gggggggg',
  'gmmmmmmg',
  'gggggggg',
  '.gg..gg.',
], { w: '#fff', k: '#111', g: '#5cbf4a', m: '#2a6a2a' });
const KITTY = bmp.bind(null, 'kitty', [
  '..o....o..',
  '.ooo..ooo.',
  '.oyyyyyyo.',
  '.oykyykyo.',
  'cccccccccccc',
  'cBBBBBBBBBBc',
  'cBBBBBBBBBBc',
  'cBBBBBBBBBBc',
  'cBBBBBBBBBBc',
  'cccccccccccc',
], { o: '#c06a2a', y: '#f0a050', k: '#111', c: '#7a5228', B: '#c89a5a' });
const BEAR = bmp.bind(null, 'bear', [
  '.oo....oo.....',
  'obbo..obbo....',
  'obbbbbbbbo..pp',
  'obkbbbbkbo.ppp',
  'obbbmmbbbobppp',
  '.obbnnbbbbbbo.',
  '..obbbbbbbbo..',
  '..obbbbbbbbo..',
  '..obbbbbbbbo..',
  '..obb.obb.o...',
], { o: '#2a1a0e', b: '#7a4a28', k: '#111', m: '#c89a6a', n: '#111', p: '#7a4a28' });
const BULL = bmp.bind(null, 'bull', [
  'w..........w',
  'ww........ww',
  '.wwoooooooww',
  '..oGGGGGGo..',
  '..oGkGGkGo..',
  '..oGGGGGGo..',
  '...onnnno...',
  '...on.nno...',
  '....oooo....',
], { w: '#f4f0e0', o: '#1e4a20', G: '#3fbf5a', k: '#111', n: '#2a7a3a' });
const BAT = bmp.bind(null, 'bat', [
  'o..............o',
  'oo....o..o....oo',
  'ooo...oooo...ooo',
  'oooooookkoooooo.',
  '.oooooowwooooo..',
  '..ooo.oooo.ooo..',
  '.......oo.......',
], { o: '#2a1a4a', k: '#ff5aa0', w: '#fff' });

// ---------- palettes per era ----------
const ERA_PAL = {
  frontier: { top: '#6fbfee', bot: '#d8f0ff', far: '#9cbde0', near: '#6a96c4', water: '#3f86c6', deep: '#2a5f9c', foam: '#d8f4ff', kind: 'mountains' },
  dao:      { top: '#8f84d4', bot: '#f2d4ea', far: '#a596d8', near: '#6f5fae', water: '#4a6fc0', deep: '#33488e', foam: '#e8e0ff', kind: 'mountains' },
  ico:      { top: '#ff9f5a', bot: '#ffe8a8', far: '#e8a060', near: '#c0703a', water: '#3a86b8', deep: '#285e8a', foam: '#fff0c8', kind: 'rockets' },
  winter:   { top: '#9fb8d8', bot: '#f0f6ff', far: '#d4e0f0', near: '#a8bcd8', water: '#5a86ac', deep: '#3d6488', foam: '#ffffff', kind: 'snow' },
  defi:     { top: '#5cc4ff', bot: '#fff6b8', far: '#8acc78', near: '#56a05a', water: '#2f9ab0', deep: '#1f6f84', foam: '#e0fff4', kind: 'hills' },
  nft:      { top: '#ff9cd0', bot: '#ffe4f2', far: '#cc96e4', near: '#9f70c8', water: '#4a80d0', deep: '#33589c', foam: '#ffe8ff', kind: 'city' },
  merge:    { top: '#120e34', bot: '#3c2c7c', far: '#2c2266', near: '#1c164c', water: '#1c2a6a', deep: '#121c4a', foam: '#8fa8ff', kind: 'night' },
  suits:    { top: '#6a7898', bot: '#e0ccb8', far: '#58607e', near: '#3a3e5a', water: '#2e4a70', deep: '#1e3252', foam: '#c8d8f0', kind: 'skyline' },
  meme:     { top: '#ff6fa8', bot: '#ffd47a', far: '#d064a0', near: '#a03c7c', water: '#3a5ab0', deep: '#283e82', foam: '#ffe0f0', kind: 'clouds' },
  today:    { top: '#33337f', bot: '#ff9a6a', far: '#7a4a8a', near: '#4a2a6a', water: '#2a4a9a', deep: '#1a306a', foam: '#ffd8b8', kind: 'skyline' },
  forever:  { top: '#05051a', bot: '#24104a', far: '#3a1a6a', near: '#22104a', water: '#101a4a', deep: '#080e2e', foam: '#9f8fff', kind: 'computer' },
};

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// Sky + far silhouettes for one era. camX/camAlt drive parallax. time in seconds.
function drawBackdrop(ctx, eraId, camX, camAlt, time) {
  const P = ERA_PAL[eraId];
  const wy = WATER_Y + camAlt;           // screen y of the waterline
  // the higher the price, the closer to space
  const space = Math.min(1, Math.max(0, (camAlt - 500) / 1200));
  for (let y = 0; y < H; y += 3) {
    const t = Math.min(1, Math.max(0, y / Math.max(1, wy)));
    let c = lerpColor(P.top, P.bot, t);
    if (space > 0) c = lerpColor(c, '#05031a', space * (1 - t * 0.5));
    px(ctx, c, 0, y, W, 3);
  }
  const night = eraId === 'merge' || eraId === 'forever' || space > 0.3;
  if (night) for (let i = 0; i < 70; i++) {
    const sx = (hash(i, 7) * W * 3 - camX * 0.02) % W, sy = (hash(i, 9) * 200 + camAlt * 0.05) % 220;
    px(ctx, hash(i, 3) > 0.8 ? '#ffe9a8' : '#cfd6ff', (sx + W) % W, sy, 1, 1);
  }
  if (wy > H + 120) return; // waterline far below the screen: only sky
  const farX = camX * 0.08, nearX = camX * 0.2;
  const base = wy;
  switch (P.kind) {
    case 'mountains': case 'snow': {
      for (let x = 0; x < W; x += 2) {
        const u = (x + farX) / 60;
        const h1 = 40 + Math.sin(u) * 18 + Math.sin(u * 2.3) * 9;
        px(ctx, P.far, x, base - h1, 2, h1);
        if (P.kind === 'snow' || h1 > 58) px(ctx, '#ffffff', x, base - h1, 2, 3);
        const v = (x + nearX) / 34;
        const h2 = 18 + Math.sin(v) * 8 + Math.sin(v * 1.7) * 5;
        px(ctx, P.near, x, base - h2, 2, h2);
      }
      break;
    }
    case 'hills': {
      for (let x = 0; x < W; x += 2) {
        const h1 = 26 + Math.sin((x + farX) / 50) * 10;
        px(ctx, P.far, x, base - h1, 2, h1);
        const h2 = 12 + Math.sin((x + nearX) / 26) * 6;
        px(ctx, P.near, x, base - h2, 2, h2);
        // crop rows on the near hills
        if (((x + nearX) | 0) % 8 < 2) px(ctx, '#e8d050', x, base - h2 + 3, 2, 2);
      }
      disc(ctx, '#fff4a0', 400 - (camX * 0.01) % 40, 36 + camAlt * 0.05, 10);
      break;
    }
    case 'rockets': {
      for (let x = 0; x < W; x += 2) { const h1 = 22 + Math.sin((x + farX) / 40) * 8; px(ctx, P.far, x, base - h1, 2, h1); }
      for (let i = 0; i < 6; i++) {
        const rx = ((i * 97 - camX * 0.12) % (W + 40) + W + 40) % (W + 40) - 20;
        const ry = base - 60 - ((time * 30 + i * 50) % 140);
        px(ctx, '#f4f0ff', rx, ry, 4, 10); px(ctx, '#e0483a', rx, ry - 3, 4, 3); px(ctx, '#ffd84a', rx + 1, ry + 10, 2, 3 + (time * 20 | 0) % 3);
      }
      break;
    }
    case 'city': case 'skyline': {
      for (let i = 0; i < 40; i++) {
        const bw = 14 + hash(i, 1) * 18, bh = 20 + hash(i, 2) * (P.kind === 'skyline' ? 70 : 40);
        const bx = ((i * 26 - farX * 2) % (W + 60) + W + 60) % (W + 60) - 30;
        px(ctx, P.far, bx, base - bh, bw, bh);
        for (let wy2 = base - bh + 4; wy2 < base - 4; wy2 += 6) for (let wx = bx + 3; wx < bx + bw - 3; wx += 5)
          if (hash(wx | 0, wy2 | 0) > 0.55) px(ctx, eraId === 'nft' ? '#ffe0ff' : '#ffe9a8', wx, wy2, 2, 2);
      }
      for (let x = 0; x < W; x += 2) { const h2 = 8 + Math.sin((x + nearX) / 20) * 3; px(ctx, P.near, x, base - h2, 2, h2); }
      break;
    }
    case 'night': {
      // two moons drifting into one: the merge
      const m = Math.min(1, (camX / 6 - 2550) / 300);
      const mx = 330 - camX * 0.01 % 60, my = 50 + camAlt * 0.05;
      ctx.globalAlpha = 0.9;
      disc(ctx, '#e8e4ff', mx - 22 * (1 - Math.max(0, m)), my, 8);
      disc(ctx, '#ffd8a8', mx + 22 * (1 - Math.max(0, m)), my, 8);
      ctx.globalAlpha = 1;
      for (let x = 0; x < W; x += 2) { const h1 = 24 + Math.sin((x + farX) / 44) * 10; px(ctx, P.far, x, base - h1, 2, h1); }
      for (let x = 0; x < W; x += 2) { const h2 = 10 + Math.sin((x + nearX) / 22) * 5; px(ctx, P.near, x, base - h2, 2, h2); }
      break;
    }
    case 'clouds': {
      for (let i = 0; i < 9; i++) {
        const cx = ((i * 73 - camX * 0.05) % (W + 80) + W + 80) % (W + 80) - 40, cy = 30 + hash(i, 4) * 90 + camAlt * 0.1;
        px(ctx, '#ffe6f2', cx, cy, 34, 8); px(ctx, '#ffe6f2', cx + 8, cy - 5, 18, 6);
      }
      for (let x = 0; x < W; x += 2) { const h2 = 14 + Math.sin((x + nearX) / 30) * 6; px(ctx, P.near, x, base - h2, 2, h2); }
      break;
    }
    case 'computer': {
      // aurora and the world computer on the horizon
      for (let b = 0; b < 3; b++) for (let x = 0; x < W; x += 3) {
        const y = 40 + b * 18 + Math.sin(x / 40 + time * 0.6 + b) * 10 + camAlt * 0.05;
        ctx.globalAlpha = 0.18; px(ctx, ['#5affc8', '#a77bff', '#5ac8ff'][b], x, y, 3, 14); ctx.globalAlpha = 1;
      }
      const cx = 300 - (camX * 0.02) % 600;
      const glow = 0.6 + Math.sin(time * 2) * 0.2;
      px(ctx, '#1a0e3a', cx, base - 90, 70, 90);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++) {
        ctx.globalAlpha = hash(i + (time * 2 | 0), j) > 0.5 ? glow : 0.15;
        px(ctx, '#7fe3ff', cx + 6 + i * 10, base - 84 + j * 9, 6, 4);
      }
      ctx.globalAlpha = 1;
      for (let x = 0; x < W; x += 2) { const h2 = 8 + Math.sin((x + nearX) / 24) * 4; px(ctx, P.near, x, base - h2, 2, h2); }
      break;
    }
  }
}

// The lake. Waterline at screen y = WATER_Y + camAlt. Ice patches on top.
function drawWater(ctx, eraId, camX, camAlt, time, iceRanges) {
  const P = ERA_PAL[eraId];
  const wy = Math.round(WATER_Y + camAlt);
  if (wy >= H) return;
  px(ctx, P.water, 0, wy, W, H - wy);
  for (let y = wy + 6; y < H; y += 7) {
    const k = (y - wy) / 60;
    px(ctx, P.deep, 0, y, W, 2 + Math.min(3, k * 2) | 0);
  }
  // sideways chop: little wave caps scrolling past
  for (let i = 0; i < 60; i++) {
    const wx = ((hash(i, 11) * 900 - camX) % W + W) % W;
    const yy = wy + 3 + hash(i, 12) * (H - wy - 6);
    const len = 3 + hash(i, 13) * 6;
    px(ctx, P.foam, wx + Math.sin(time * 2 + i) * 2, yy, len, 1);
  }
  for (let x = 0; x < W; x += 4) px(ctx, P.foam, x, wy + Math.round(Math.sin((x + camX) / 9 + time * 3)), 3, 1);
  for (const [a, b] of iceRanges) {
    const x0 = a - camX, x1 = b - camX;
    if (x1 < 0 || x0 > W) continue;
    px(ctx, '#cfe8f8', x0, wy - 1, x1 - x0, H - wy + 1);
    px(ctx, '#ffffff', x0, wy - 1, x1 - x0, 2);
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1); x += 7) {
      const k = hash((x + camX) | 0, 5);
      if (k > 0.6) px(ctx, '#a8d0ec', x, wy + 3 + (k * 40 | 0) % Math.max(1, H - wy - 4), 6, 1);
    }
  }
}

// ---------- entities ----------
// sx = screen x of the entity's left edge, by = screen y of its bottom (alt).
function drawEnt(ctx, run, e, sx, by, time) {
  switch (e.t) {
    case 'gem': blit(ctx, GEM(), sx, by - 7 + Math.sin(time * 4 + e.x) * 1.5); break;
    case 'ball': blit(ctx, BALL(), sx, by - 8 + Math.abs(Math.sin(time * 4 + e.x)) * -4); break;
    case 'fart': {
      const pulse = Math.sin(time * 5 + e.phase) * 1.5;
      ctx.globalAlpha = 0.85;
      px(ctx, '#9ff07a', sx + 2, by - 10 - pulse, 18, 8); px(ctx, '#b8ff9a', sx + 6, by - 15 - pulse, 10, 6);
      px(ctx, '#7acf5a', sx, by - 6 - pulse, 22, 4);
      ctx.globalAlpha = 1;
      drawText(ctx, 'FART', sx + 1, by - 11 - pulse, '#2a6a2a');
      break;
    }
    case 'pump': {
      px(ctx, '#3a3a4a', sx - 2, by - 3, 18, 4);                 // floating base
      px(ctx, '#e0483a', sx + 4, by - 34, 6, 31);                // barrel
      px(ctx, '#ff7a6a', sx + 5, by - 34, 1, 31);
      px(ctx, '#bfc4d0', sx + 6, by - 42, 2, 8);                 // rod
      px(ctx, '#2a2a3a', sx, by - 46, 14, 4);                    // handle
      px(ctx, '#2a2a3a', sx + 9, by - 30, 6, 2); px(ctx, '#2a2a3a', sx + 14, by - 30, 2, 26); // hose
      drawText(ctx, '^', sx + 4, by - 56 + Math.sin(time * 6) * 2, '#7be08a');
      break;
    }
    case 'whaleG': case 'whaleR': {
      const good = e.t === 'whaleG';
      const body = good ? '#3fa86a' : '#c0404a', belly = good ? '#a8f0c0' : '#ffb0b0', dark = good ? '#1e5a3a' : '#6a1a22';
      const bob = Math.round(Math.sin(time * 2 + e.phase) * 1.5);
      const y0 = by - 12 + bob;
      px(ctx, body, sx + 4, y0, 44, 10); px(ctx, body, sx + 8, y0 - 3, 34, 3); px(ctx, belly, sx + 8, y0 + 7, 34, 3);
      px(ctx, '#111', sx + 10, y0 + 2, 2, 2); px(ctx, dark, sx + 4, y0 + 6, 6, 1);
      const up = !good && SIM.whaleTailUp(run, e);
      if (up) { px(ctx, body, sx + 46, y0 - 22, 6, 24); px(ctx, body, sx + 42, y0 - 28, 14, 6); drawText(ctx, '!', sx + 47, y0 - 40, '#ff6b6b'); }
      else { px(ctx, body, sx + 46, y0 + 1, 10, 4); px(ctx, body, sx + 54, y0 - 3, 4, 6); }
      if (good) {
        const h = 160 + Math.sin(time * 6 + e.phase) * 12;
        for (let i = 0; i < h; i += 4) {
          const wob = Math.sin(i / 8 + time * 8) * 2;
          px(ctx, i % 8 ? '#bfe8ff' : '#ffffff', sx + 12 + wob, y0 - 4 - i, 10 - Math.min(6, i / 30), 4);
        }
        lab(ctx, 'BUY', sx + 10, y0 - h - 12, '#7be08a');
      } else if (!up) lab(ctx, 'SELL', sx + 18, y0 - 12, '#ff6b6b');
      break;
    }
    case 'crab': {
      for (let i = 0; i < 5; i++) {
        const cx = sx + i * 30 + Math.sin(time * 3 + i) * 6;     // walking sideways, obviously
        blit(ctx, CRAB(), cx, by - 6);
      }
      if (Math.sin(time * 2 + e.phase) > 0) lab(ctx, 'CRAB MARKET', sx + 42, by - 18, '#ff9f6b');
      break;
    }
    case 'suit': {
      px(ctx, '#5a3a1a', sx - 4, by - 3, 22, 4);
      blit(ctx, SUIT(), sx + 1, by - 21);
      lab(ctx, 'ETF', sx + 1, by - 30, '#fff');
      break;
    }
    case 'kevin': {
      px(ctx, '#ff7ab0', sx, by - 6, 24, 5); px(ctx, '#ffb3d6', sx + 2, by - 6, 20, 1);
      blit(ctx, KEVIN(), sx + 4, by - 16 + Math.round(Math.sin(time * 3) * 1));
      lab(ctx, 'KEVIN', sx + 1, by - 26, '#ffb3e6');
      break;
    }
    case 'yacht': {
      px(ctx, '#f4f4f8', sx, by - 10, 72, 10); px(ctx, '#d0d4e0', sx + 4, by - 2, 64, 2);
      px(ctx, '#2a4a8a', sx, by - 6, 72, 2);
      px(ctx, '#f4f4f8', sx + 22, by - 18, 30, 8); px(ctx, '#7fc8ff', sx + 26, by - 16, 22, 3);
      blit(ctx, APE(), sx + 6, by - 20);
      lab(ctx, 'BORED', sx + 24, by - 28, '#ffe066');
      break;
    }
    case 'skrump': {
      const hop = Math.abs(Math.sin(run.t * 3 + e.phase)) * 54;
      if (hop < 6) px(ctx, '#bfe8ff', sx - 2, by - 2, 16, 2);
      blit(ctx, SKRUMP(), sx, by - 10 - hop);
      for (let i = 0; i < 3; i++) px(ctx, '#e8d8ff', sx + 6 + Math.cos(time * 3 + i * 2) * 10, by - 6 - hop + Math.sin(time * 3 + i * 2) * 8, 1, 1);
      break;
    }
    case 'frog': {
      px(ctx, '#3a9a4a', sx, by - 2, 28, 4); px(ctx, '#5cc85a', sx + 2, by - 2, 24, 1); px(ctx, '#2a7a3a', sx + 12, by - 2, 4, 2);
      blit(ctx, FROG(), sx + 10, by - 9);
      break;
    }
    case 'kitty': blit(ctx, KITTY(), sx + 2, by - 10); px(ctx, '#7a5228', sx, by - 1, 16, 2); break;
    case 'bear': {
      px(ctx, '#ffffff', sx, by - 4, 44, 5); px(ctx, '#cfe6f6', sx + 2, by, 40, 2);
      blit(ctx, BEAR(), sx + 14, by - 14);
      if (Math.sin(time * 4 + e.phase) > 0.4) lab(ctx, 'GRR', sx + 12, by - 24, '#ff6b6b');
      break;
    }
    case 'bull': {
      px(ctx, '#8a5a2a', sx - 2, by - 3, 30, 4);
      blit(ctx, BULL(), sx + 7, by - 12);
      break;
    }
    case 'fork': {
      const c = '#c8ccd8', d = '#8a90a2';
      px(ctx, c, sx + 9, by - 60, 4, 60); px(ctx, d, sx + 12, by - 60, 1, 60);
      px(ctx, c, sx + 2, by - 66, 18, 6);
      for (let i = 0; i < 3; i++) px(ctx, c, sx + 2 + i * 7, by - 92, 4, 28);
      lab(ctx, 'ETH', sx - 18, by - 100, '#c89bff'); lab(ctx, 'ETC', sx + 22, by - 100, '#7be08a');
      break;
    }
    case 'bat': {
      const yy = by - 10 + Math.sin(run.t * 4 + e.phase) * 10;
      blit(ctx, BAT(), sx, yy);
      ctx.globalAlpha = 0.6;
      for (let i = 1; i <= 2; i++) { const r = ((time * 30 + i * 8) % 18); px(ctx, '#ff9ad0', sx + 16 + r, yy + 2, 1, 6); }
      ctx.globalAlpha = 1;
      break;
    }
    case 'airdrop': {
      const a = SIM.airAlt(run, e); // by is the spawn alt's screen y; shift it by the fall
      const top = by + (e.alt - a) - 12, sway = Math.round(Math.sin(time * 2 + e.phase) * 2);
      if (a > 3) {
        px(ctx, '#ff7ab0', sx - 4 + sway, top - 16, 20, 4); px(ctx, '#fff', sx + sway, top - 16, 4, 4); px(ctx, '#fff', sx + 8 + sway, top - 16, 4, 4);
        px(ctx, '#ff7ab0', sx - 2 + sway, top - 18, 16, 2);
        px(ctx, '#e8e0f0', sx - 3 + sway, top - 12, 1, 12); px(ctx, '#e8e0f0', sx + 14 + sway, top - 12, 1, 12);
      }
      px(ctx, '#8a5a30', sx, top, 12, 12); px(ctx, '#c08a50', sx + 1, top + 1, 10, 10); px(ctx, '#8a5a30', sx + 1, top + 5, 10, 2);
      lab(ctx, '?', sx + 3, top - 28 + (a > 3 ? 0 : 18), '#ffe066');
      break;
    }
    case 'farm': {
      px(ctx, '#6a4422', sx, by - 2, 64, 4); px(ctx, '#8a5a30', sx, by - 2, 64, 1);
      for (let i = 0; i < 7; i++) { px(ctx, '#4fbf4a', sx + 4 + i * 9, by - 8, 2, 6); px(ctx, '#ff8a2a', sx + 3 + i * 9, by - 3, 4, 2); }
      lab(ctx, 'YIELD', sx + 18, by - 18, '#9ff07a');
      break;
    }
  }
}

// Era marker buoys float at each era's first day.
function drawEraBuoy(ctx, era, sx, by, time) {
  const bob = Math.round(Math.sin(time * 2) * 1.5);
  const label = era.sub.split('.')[0];
  const w = Math.max(textWidth(era.name), textWidth(label)) + 10;
  px(ctx, '#5a3a1a', sx + w / 2 - 1, by - 34 + bob, 3, 34);
  px(ctx, '#e0483a', sx + w / 2 - 6, by - 4 + bob, 14, 5); px(ctx, '#fff', sx + w / 2 - 6, by - 2 + bob, 14, 1);
  px(ctx, '#22163a', sx, by - 58 + bob, w, 24); px(ctx, '#fdf6e0', sx + 1, by - 57 + bob, w - 2, 22);
  drawTextC(ctx, label, sx + w / 2, by - 54 + bob, '#7a4a8a');
  drawTextC(ctx, era.name, sx + w / 2, by - 45 + bob, '#22163a');
}

// ---------- Droober + RC sheet ----------
function drawFrame(ctx, name, x, y, flip = false) {
  const r = SPRITE_RECTS[name];
  if (!r || !SPRITES || !SPRITES.complete) return;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x) + r[2], Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    ctx.restore();
  } else ctx.drawImage(SPRITES, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
}
// bottom-center at (cx, by), facing 1 = right, -1 = left, 0 = as drawn
function drawFrameAt(ctx, name, cx, by, facing) {
  const r = SPRITE_RECTS[name], nat = SPRITE_FACING[name];
  drawFrame(ctx, name, cx - r[2] / 2, by - r[3], nat !== 0 && facing !== 0 && nat !== facing);
}
