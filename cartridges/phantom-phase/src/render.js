// Paper-cut haunted vault. Flat ink, bone, slate, and one vermilion accent.
// Depth is carried by hard bands and perspective, never by glow or fog.
(function (root) {
  const INK = '#14110e';
  const SLATE = '#2c3844';
  const SLATE_DEEP = '#1b242c';
  const FLOOR_BONE = '#d3c7b2';
  const FLOOR_SLATE = '#182127';
  const BONE = '#e6dcc8';
  const CHALK = '#f3ecdf';
  const BONE_SHADE = '#cbbfa8';
  const VERMILION = '#d63a2f';
  const VERMILION_SHADE = '#9e241c';

  const FONT = {
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
    '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  };

  const SQUARE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const SLOT_XY = [[0, 0], [0, 0.56], [0.56, 0], [0, -0.56], [-0.56, 0]];
  const ACTOR_Z = 2.45;
  const echo = { slot: 0, ready: false, warps: [] };
  let camX = 0;
  let camY = 0;

  function reset() {
    echo.slot = 0;
    echo.ready = false;
    echo.warps.length = 0;
    camX = 0;
    camY = 0;
  }

  function textWidth(text, scale) {
    const gap = Math.max(1, Math.round(scale * 0.45));
    let width = 0;
    const line = String(text);
    for (let i = 0; i < line.length; i++) width += 5 * scale + (i ? gap : 0);
    return width;
  }

  function drawText(ctx, text, x, y, scale, color, align) {
    const line = String(text);
    const width = textWidth(line, scale);
    const gap = Math.max(1, Math.round(scale * 0.45));
    let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    cursor = Math.round(cursor);
    const top = Math.round(y);
    ctx.fillStyle = color;
    for (let i = 0; i < line.length; i++) {
      const rows = FONT[line[i]] || FONT[' '];
      for (let r = 0; r < 7; r++) {
        const bits = rows[r];
        for (let c = 0; c < 5; c++) {
          if (bits[c] === '1') ctx.fillRect(cursor + c * scale, top + r * scale, scale, scale);
        }
      }
      cursor += 5 * scale + gap;
    }
  }

  function drawPrint(ctx, text, x, y, scale, align, color) {
    const face = color || BONE;
    const offset = Math.max(1, Math.round(scale * 0.35));
    drawText(ctx, text, x + offset, y + offset, scale, INK, align);
    drawText(ctx, text, x, y, scale, face, align);
  }

  function proj(x, y, z, w, h) {
    const portrait = h > w * 1.05;
    const f = portrait ? w * 1.72 : h * 1.28;
    const s = f / (z + 0.48);
    const cx = w * 0.5;
    const cy = portrait ? h * 0.43 : h * 0.5;
    return [cx + x * s + camX, cy - y * s + camY, s];
  }

  function quad(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function bandFill(bone, wall) {
    if (wall === 0) return bone ? FLOOR_BONE : FLOOR_SLATE;
    if (wall === 2) return bone ? CHALK : SLATE;
    return bone ? BONE : SLATE_DEEP;
  }

  function drawTunnel(ctx, w, h, scroll) {
    const depth = 1.05;
    const phase = ((scroll % depth) + depth) % depth;
    const capZ = 14.2;
    const cap = [];
    for (let i = 0; i < 4; i++) cap.push(proj(SQUARE[i][0], SQUARE[i][1], capZ, w, h));
    quad(ctx, cap, INK);
    const bands = 16;
    for (let i = bands; i >= 0; i--) {
      const zFar = 0.7 + i * depth + phase;
      const zNear = zFar - depth;
      if (zNear < 0.42 || zFar > capZ) continue;
      const bandId = Math.floor((scroll + zNear) / depth);
      const bone = (bandId & 1) === 0;
      for (let wall = 0; wall < 4; wall++) {
        const a = SQUARE[wall];
        const b = SQUARE[(wall + 1) % 4];
        const pts = [
          proj(a[0], a[1], zFar, w, h),
          proj(b[0], b[1], zFar, w, h),
          proj(b[0], b[1], zNear, w, h),
          proj(a[0], a[1], zNear, w, h),
        ];
        quad(ctx, pts, bandFill(bone, wall));
        if (bone && wall !== 0 && zNear > 1.4) {
          ctx.beginPath();
          ctx.moveTo((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2);
          ctx.lineTo((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2);
          ctx.strokeStyle = INK;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      if ((bandId % 4) === 0 && zNear > 1.3 && zNear < 9) {
        const a = proj(0.72, 0.18, zFar, w, h);
        const b = proj(0.72, 0.18, zNear, w, h);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = (bandId % 8) === 0 ? VERMILION : VERMILION_SHADE;
        ctx.lineWidth = Math.max(2, Math.min(7, a[2] * 0.012));
        ctx.stroke();
      }
      if (zNear < 1.15) continue;
      const rib = proj(0, 0, zNear, w, h);
      ctx.beginPath();
      for (let c = 0; c < 4; c++) {
        const p = proj(SQUARE[c][0], SQUARE[c][1], zNear, w, h);
        if (c === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, Math.min(8, rib[2] * 0.01));
      ctx.stroke();
      const left = proj(-1, 1, zNear, w, h);
      const peak = proj(0, 1.28, zNear, w, h);
      const right = proj(1, 1, zNear, w, h);
      ctx.beginPath();
      ctx.moveTo(left[0], left[1]);
      ctx.lineTo(peak[0], peak[1]);
      ctx.lineTo(right[0], right[1]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.25, Math.min(6, peak[2] * 0.008));
      ctx.stroke();
      if ((bandId & 1) === 0 && zNear < 8) {
        const a = proj(-0.28, -1, zNear, w, h);
        const b = proj(0, -0.72, zNear, w, h);
        const c = proj(0.28, -1, zNear, w, h);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.2, Math.min(5, b[2] * 0.008));
        ctx.stroke();
      }
    }
  }

  function diamond(ctx, x, y, r, fill, stroke, facet) {
    if (r < 1.4) return;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.82, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.82, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (facet) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.82, y);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = facet;
      ctx.fill();
    }
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function drawGate(ctx, w, h, z, open, dt) {
    for (let slot = 0; slot < 5; slot++) {
      const isOpen = (open & (1 << slot)) !== 0;
      const xy = SLOT_XY[slot];
      const p = proj(xy[0], xy[1], z, w, h);
      if (!isOpen) diamond(ctx, p[0], p[1], p[2] * 0.2, INK, BONE, SLATE);
      else if (dt > 7) diamond(ctx, p[0], p[1], p[2] * 0.12, CHALK, VERMILION, BONE_SHADE);
    }
  }

  function ghostPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -1.08);
    ctx.bezierCurveTo(0.66, -1.04, 0.82, -0.28, 0.56, 0.28);
    ctx.lineTo(0.36, 0.78);
    ctx.lineTo(0.14, 0.5);
    ctx.lineTo(0, 0.96);
    ctx.lineTo(-0.14, 0.5);
    ctx.lineTo(-0.36, 0.78);
    ctx.lineTo(-0.56, 0.28);
    ctx.bezierCurveTo(-0.82, -0.28, -0.66, -1.04, 0, -1.08);
    ctx.closePath();
  }

  function drawGhost(ctx, x, y, scale, style) {
    if (scale < 3) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = style.alpha == null ? 1 : style.alpha;
    ghostPath(ctx);
    ctx.fillStyle = style.echo ? INK : BONE;
    ctx.fill();
    if (!style.echo) {
      ctx.beginPath();
      ctx.moveTo(0, -1.08);
      ctx.bezierCurveTo(-0.66, -1.04, -0.82, -0.28, -0.56, 0.28);
      ctx.lineTo(-0.36, 0.78);
      ctx.lineTo(-0.14, 0.5);
      ctx.lineTo(0, 0.22);
      ctx.closePath();
      ctx.fillStyle = BONE_SHADE;
      ctx.fill();
    }
    ghostPath(ctx);
    ctx.lineWidth = style.echo ? 0.05 : 0.07;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (!style.echo) {
      const look = style.look || 0;
      ctx.fillStyle = VERMILION;
      ctx.fillRect(-0.24 + look * 0.1, -0.24, 0.48, 0.08);
      ctx.fillStyle = INK;
      ctx.fillRect(-0.08 + look * 0.1, -0.02, 0.16, 0.045);
    }
    ctx.restore();
  }

  function drawWarp(ctx, w, h) {
    for (let i = 0; i < echo.warps.length; i++) {
      const warp = echo.warps[i];
      const alpha = (warp.life / 5) * 0.78;
      const from = SLOT_XY[warp.from];
      const to = SLOT_XY[warp.to];
      for (let stamp = 0; stamp < 3; stamp++) {
        const t = stamp / 3;
        const x = from[0] + (to[0] - from[0]) * t;
        const y = from[1] + (to[1] - from[1]) * t;
        const p = proj(x, y, ACTOR_Z + 0.28 + stamp * 0.14, w, h);
        drawGhost(ctx, p[0], p[1], p[2] * 0.17, { echo: true, alpha: alpha * (1 - stamp * 0.18) });
      }
    }
  }

  function drawActor(ctx, w, h, slot) {
    const xy = SLOT_XY[slot];
    for (let i = 2; i >= 1; i--) {
      const p = proj(xy[0] * (1 - 0.14 * i), xy[1] * (1 - 0.14 * i), ACTOR_Z + 0.22 * i, w, h);
      drawGhost(ctx, p[0], p[1], p[2] * 0.16, { echo: true, alpha: 0.55 - i * 0.16 });
    }
    const live = proj(xy[0], xy[1], ACTOR_Z, w, h);
    drawGhost(ctx, live[0], live[1], live[2] * 0.19, { echo: false, look: xy[0] < -0.2 ? -1 : xy[0] > 0.2 ? 1 : 0 });
    return live;
  }

  function drawCross(ctx, slot, cx, cy, spread) {
    const spots = [[0, 0, 0], [0, -1, 1], [1, 0, 2], [0, 1, 3], [-1, 0, 4]];
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const on = spot[2] === slot;
      diamond(
        ctx,
        cx + spot[0] * spread,
        cy + spot[1] * spread,
        on ? spread * 0.3 : spread * 0.18,
        on ? VERMILION : INK,
        on ? INK : BONE,
        null
      );
    }
  }

  function drawPoster(ctx, w, h, best) {
    const scale = w < 460 ? 4 : w < 900 ? 6 : 7;
    const sub = w < 460 ? 2 : 3;
    const blockW = Math.round(Math.max(textWidth('PHANTOM', scale), textWidth('STICK THE EDGE', sub)) + 40);
    const blockH = Math.round(14 + 7 * scale + 8 + 7 * scale + 16 + 7 * sub + 8 + 7 * sub + 26);
    const x = Math.round((w - blockW) / 2);
    const y = Math.round(Math.max(18, h * (h > w ? 0.055 : 0.07)));
    ctx.fillStyle = BONE;
    ctx.fillRect(x, y, blockW, blockH);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, blockW - 3, blockH - 3);
    ctx.fillStyle = VERMILION;
    ctx.fillRect(x + 16, y + blockH - 14, blockW - 32, 5);
    let ty = y + 12;
    drawText(ctx, 'PHANTOM', w / 2, ty, scale, INK, 'center');
    ty += 7 * scale + 8;
    drawText(ctx, 'PHASE', w / 2, ty, scale, INK, 'center');
    ty += 7 * scale + 14;
    drawText(ctx, 'STICK THE EDGE', w / 2, ty, sub, INK, 'center');
    ty += 7 * sub + 7;
    drawText(ctx, 'TAP FOR CENTER', w / 2, ty, sub, VERMILION, 'center');
    if (best > 0) drawPrint(ctx, 'BEST ' + best, w / 2, y + blockH + 18, sub, 'center', BONE);
  }

  function plate(ctx, x, y, w, h) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

  function drawHud(ctx, w, h, model) {
    const padX = w < 460 ? 14 : 20;
    const padY = model.coarse ? 22 : 16;
    const num = w < 460 ? 4 : 5;
    const label = 2;
    const scoreText = String(model.score);
    const scoreW = Math.max(textWidth('SCORE', label), textWidth(scoreText, num)) + 28;
    const scoreH = 18 + 7 * num + 16;
    plate(ctx, padX, padY, scoreW, scoreH);
    drawText(ctx, 'SCORE', padX + 12, padY + 8, label, BONE, 'left');
    drawText(ctx, scoreText, padX + 12, padY + 24, num, CHALK, 'left');
    const mult = 'X' + model.multiplier;
    const multW = Math.max(textWidth(mult, num), textWidth('STREAK ' + model.streak, label)) + 28;
    const multH = 8 + 7 * num + 10 + 7 * label + 14;
    plate(ctx, w - padX - multW, padY, multW, multH);
    const multColor = model.multiplier > 1 ? VERMILION : CHALK;
    drawText(ctx, mult, w - padX - 12, padY + 8, num, multColor, 'right');
    drawText(ctx, 'STREAK ' + model.streak, w - padX - 12, padY + 12 + 7 * num, label, BONE, 'right');
    if (model.mode === 'crash') drawText(ctx, 'AGAIN', padX + 12, padY + scoreH + 10, label, VERMILION, 'left');
    const spread = w < 460 ? 26 : 32;
    drawCross(ctx, model.slot, w / 2, h - (model.coarse ? 86 : 58), spread);
    if (model.muted) drawPrint(ctx, 'MUTE', w - padX, h - (model.coarse ? 36 : 24), label, 'right', BONE);
  }

  function drawCrashMark(ctx, live) {
    const s = Math.max(18, live[2] * 0.16);
    ctx.save();
    ctx.translate(live[0], live[1]);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = VERMILION;
    ctx.fillRect(-s, -s * 0.12, s * 2, s * 0.24);
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(-s, -s * 0.12, s * 2, s * 0.24);
    ctx.restore();
  }

  function noteSlot(slot) {
    if (!echo.ready) {
      echo.ready = true;
      echo.slot = slot;
      return;
    }
    if (slot !== echo.slot) {
      echo.warps.push({ from: echo.slot, to: slot, life: 5 });
      echo.slot = slot;
      if (echo.warps.length > 3) echo.warps.shift();
    }
  }

  function ageWarps() {
    for (let i = echo.warps.length - 1; i >= 0; i--) {
      echo.warps[i].life -= 1;
      if (echo.warps[i].life <= 0) echo.warps.splice(i, 1);
    }
  }

  function frame(ctx, w, h, model) {
    camX = 0;
    camY = 0;
    if (model.crashAge > 0 && model.crashAge < 9) camX = model.crashAge % 2 ? 6 : -6;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    drawTunnel(ctx, w, h, model.scroll || 0);
    if (model.mode === 'title') {
      drawGate(ctx, w, h, 6.4, 11, 40);
      noteSlot(0);
      drawWarp(ctx, w, h);
      const live = drawActor(ctx, w, h, 0);
      drawPoster(ctx, w, h, model.best || 0);
      drawCross(ctx, 0, w / 2, h - (model.coarse ? 86 : 58), w < 460 ? 26 : 32);
      if (model.muted) drawPrint(ctx, 'MUTE', w - 22, h - 24, 2, 'right', BONE);
      ageWarps();
      return live;
    }
    const gates = model.gates || [];
    const visible = [];
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      const dt = gate.hit - model.tick;
      if (dt < 0 || dt > 150) continue;
      const approach = 0.08 + (model.speed || 170) / 9000;
      visible.push({ gate, dt, z: 1.05 + dt * approach });
    }
    visible.sort(function (a, b) { return b.z - a.z; });
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      if (item.z > 14.5) continue;
      drawGate(ctx, w, h, item.z, item.gate.open, item.dt);
    }
    noteSlot(model.slot);
    drawWarp(ctx, w, h);
    const live = drawActor(ctx, w, h, model.slot);
    if (model.mode === 'crash') drawCrashMark(ctx, live);
    drawHud(ctx, w, h, model);
    ageWarps();
    return live;
  }

  root.PHANTOM_DRAW = { frame, reset };
})(typeof globalThis !== 'undefined' ? globalThis : this);
