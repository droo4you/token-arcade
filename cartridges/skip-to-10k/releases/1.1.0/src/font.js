// 5x7 bitmap font. Each glyph is 7 rows of 5 bits (bit 4 = leftmost pixel).
const GLYPHS = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], ':': [0, 12, 12, 0, 12, 12, 0],
  "'": [4, 4, 8, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
  '/': [1, 1, 2, 4, 8, 16, 16], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '%': [24, 25, 2, 4, 8, 19, 3], '&': [12, 18, 20, 8, 21, 18, 13], '>': [8, 4, 2, 1, 2, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2], '=': [0, 0, 31, 0, 31, 0, 0], '_': [0, 0, 0, 0, 0, 0, 31],
  '*': [0, 4, 21, 14, 21, 4, 0], '#': [10, 10, 31, 10, 31, 10, 10], '"': [10, 10, 0, 0, 0, 0, 0],
  '@': [14, 17, 23, 21, 23, 16, 14], '$': [4, 15, 20, 14, 5, 30, 4],
  '~': [0, 10, 31, 31, 14, 4, 0], // heart
  '^': [4, 14, 31, 4, 4, 4, 0],   // up arrow
};

const FONT_CACHE = new Map();
function glyphCanvas(color) {
  // pre-render every glyph in one color into a strip for fast blits
  if (FONT_CACHE.has(color)) return FONT_CACHE.get(color);
  const keys = Object.keys(GLYPHS);
  const c = document.createElement('canvas');
  c.width = keys.length * 6; c.height = 7;
  const g = c.getContext('2d');
  g.fillStyle = color;
  const index = {};
  keys.forEach((k, i) => {
    index[k] = i * 6;
    GLYPHS[k].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row & (16 >> x)) g.fillRect(i * 6 + x, y, 1, 1); });
  });
  const out = { c, index };
  FONT_CACHE.set(color, out);
  return out;
}
function textWidth(s, scale = 1) { return s.length * 6 * scale - scale; }
function drawText(ctx, s, x, y, color = '#22163a', scale = 1, shadow = null) {
  s = String(s).toUpperCase();
  if (shadow) drawText(ctx, s, x + scale, y + scale, shadow, scale);
  const { c, index } = glyphCanvas(color);
  x = Math.round(x); y = Math.round(y);
  for (let i = 0; i < s.length; i++) {
    const sx = index[s[i]];
    if (sx !== undefined && s[i] !== ' ') ctx.drawImage(c, sx, 0, 5, 7, x + i * 6 * scale, y, 5 * scale, 7 * scale);
  }
}
function drawTextC(ctx, s, cx, y, color, scale = 1, shadow = null) { drawText(ctx, s, cx - textWidth(String(s), scale) / 2, y, color, scale, shadow); }
// greedy word wrap to a pixel width
function wrapText(s, maxW, scale = 1) {
  const words = String(s).split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (textWidth(t, scale) > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// chunky outlined text for titles
function drawTextOutlined(ctx, s, cx, y, color, scale, outline = '#22163a') {
  const x = cx - textWidth(String(s), scale) / 2;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) drawText(ctx, s, x + dx * scale, y + dy * scale, outline, scale);
  drawText(ctx, s, x, y + scale, outline, scale);
  drawText(ctx, s, x, y + scale * 2, outline, scale);
  drawText(ctx, s, x, y, color, scale);
}
