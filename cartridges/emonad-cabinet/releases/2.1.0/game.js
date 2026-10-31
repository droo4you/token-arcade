/* Mood Swings 2.1.0 presentation. Rules, proof encoding and sim version stay in sim.js. */
(() => {
  'use strict';
  const M = window.MoodSwings, P = window.MoodProgress, bridge = window.TokenArcade;
  const DISPLAY_VERSION = '2.1.0';
  const $ = id => document.getElementById(id), canvas = $('sky'), ctx = canvas.getContext('2d');
  const embedded = !!bridge?.embedded, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'token-arcade:mood-swings:progress:v2';
  let progress = P.fresh(), storageOK = true;
  try { progress = P.normalize(JSON.parse(localStorage.getItem(KEY))); } catch { storageOK = false; }
  let sim = M.create('welcome'), track = [], active = false, ready = false, paused = false, destroyed = false;
  let config = null, frame = 0, last = 0, debt = 0, input = 195, dragging = false, credited = false, audio = null, muted = false, lastEvent = -1;
  let sheetUp = false, seenBounces = 0, seenEuphorias = 0, catchAt = 0, holdUntil = 0, frozen = null;
  let shownTier = -1, fadeFrom = null, fadeStart = 0, tierCall = null, visualT = 0, frameDt = 0, part = 0, meterArmed = false;
  const listeners = [];
  function listen(target, event, fn) { target.addEventListener(event, fn); listeners.push(() => target.removeEventListener(event, fn)); }
  const free = () => !embedded || config?.mode === 'free';
  function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); storageOK = true; } catch { storageOK = false; } paintProgress(); }
  function paintProgress() {
    const saved = $('saved');
    if (storageOK && progress.bestMood > 0) {
      saved.hidden = false;
      saved.textContent = `Best: ${progress.bestMood.toLocaleString()} Mood · ${P.balance(progress)} Good Vibes`;
    } else if (!storageOK) {
      saved.hidden = false;
      saved.textContent = 'Browser saving is unavailable. You can still play.';
    } else saved.hidden = true;
    $('save-warning').textContent = storageOK ? (bridge?.accountProgress ? 'Progress syncs to your account.' : 'Saved in this browser. Sign in to sync progress.') : 'Saving is unavailable in this browser session.';
  }
  function panel(id) { for (const name of ['menu', 'over', 'closet', 'paused']) $(name).hidden = name !== id; }
  function closet() {
    panel('closet'); $('balance').textContent = `${P.balance(progress)} Good Vibes to spend`;
    $('items').replaceChildren();
    for (const item of P.ITEMS) {
      const row = document.createElement('div'); row.className = 'item';
      const label = document.createElement('span'); label.textContent = item.name;
      const small = document.createElement('small'); small.textContent = item.type === 'avatar' ? 'Avatar' : 'Weather & trail palette'; label.append(small);
      const button = document.createElement('button'), owned = progress.unlocked.includes(item.id), selected = progress[item.type] === item.id;
      button.textContent = selected ? 'Wearing' : owned ? 'Wear' : `${item.cost} Vibes`;
      button.disabled = selected || (!owned && P.balance(progress) < item.cost);
      button.onclick = () => { if (P.select(progress, item.id)) { save(); closet(); } };
      row.append(label, button); $('items').append(row);
    }
  }
  function tone(kind) {
    if (muted || !audio) return;
    if (kind === 'sad') {
      const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .4), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
      source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 380; gain.gain.value = .14;
      source.connect(filter); filter.connect(gain); gain.connect(audio.destination); source.start(); return;
    }
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(kind === 'Euphoria' ? 880 : 520, t);
    g.gain.setValueAtTime(.035, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + .2);
  }
  function unlockAudio() { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); void audio.resume().catch(() => {}); } catch {} }
  function resetJuice() {
    sheetUp = false; seenBounces = 0; seenEuphorias = 0; catchAt = 0; holdUntil = 0; frozen = null;
    shownTier = -1; fadeFrom = null; tierCall = null; part = 0; meterArmed = false;
  }
  function fillResult() {
    const s = sim.state;
    const startName = M.TIERS[0][0];
    const peakName = M.TIERS[M.tier(s.peakMood)][0];
    $('result-tier').textContent = startName === peakName ? peakName : `${startName} -> ${peakName}`;
    $('peak').textContent = s.peakMood.toLocaleString();
    const vibes = $('result-vibes');
    if (s.vibes > 0) { vibes.hidden = false; vibes.textContent = `${s.vibes} Good ${s.vibes === 1 ? 'Vibe' : 'Vibes'} collected`; }
    else vibes.hidden = true;
    const seconds = Math.floor(s.t);
    const parts = [];
    if (s.bounces > 0) parts.push(`${s.bounces} ${s.bounces === 1 ? 'catch' : 'catches'}`);
    if (seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
    if (s.euphorias > 0) parts.push(`${s.euphorias} ${s.euphorias === 1 ? 'Euphoria moment' : 'Euphoria moments'}`);
    const time = $('result-time');
    time.hidden = parts.length === 0;
    time.textContent = parts.join(' · ');
    $('again').hidden = !free(); $('home').hidden = !free();
    $('result-note').textContent = free() ? (storageOK ? 'Your progress is saved in this browser.' : 'Browser saving is unavailable for this session.') : 'Return to Token Arcade for verification and your next attempt.';
  }
  function showResult() {
    if (sheetUp) return;
    sheetUp = true;
    fillResult();
    $('grip').hidden = true; $('hud').hidden = true; panel('over');
  }
  function finish() {
    if (!sim.state.shown) return;
    active = false;
    showResult();
    if (credited) return;
    const s = sim.state;
    // Cosmetics can be earned in any mode; competitive verification never trusts this save.
    progress.earned = Math.min(1e9, progress.earned + s.vibes); progress.bestMood = Math.max(progress.bestMood, s.peakMood); save();
    bridge?.complete({ ...M.metrics(s), result: 'completed', proof: { v: 1, seed: s.seed, steps: track.length, track: M.encode(track) } });
    credited = true;
  }
  function settle() {
    if (!active || !sim.state.over) return;
    while (!sim.state.shown && track.length < M.MAX_STEPS) { track.push(input); sim.tick(input); }
    finish();
  }
  function start() {
    if (destroyed || (embedded && !free() && credited)) return;
    if (active && !sim.state.over) return;
    if (active && sim.state.over) settle();
    if (active) return;
    const seed = free() ? crypto.randomUUID() : config.seed;
    sim = M.create(seed); track = []; credited = false; ready = false; active = true; paused = false; debt = 0; input = 195; lastEvent = -1;
    resetJuice();
    $('callout').textContent = '';
    $('hud').hidden = false; $('grip').hidden = false; panel(null); canvas.focus({ preventScroll: true });
  }
  function grip(x) {
    if (!active || paused || bridge?.paused || sim.state.over) return;
    if (!ready) { if (embedded && !bridge.beginRun()) return; ready = true; $('grip').hidden = true; }
    input = Math.round(Math.max(0, Math.min(M.WIDTH, x)));
  }
  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    const m = metrics();
    grip((e.clientX - r.left - m.ox) / m.scale);
  }
  listen(canvas, 'pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); unlockAudio(); pointer(e); });
  listen(canvas, 'pointermove', e => { if (dragging) pointer(e); });
  listen(canvas, 'pointerup', () => { dragging = false; }); listen(canvas, 'pointercancel', () => { dragging = false; });
  listen(canvas, 'keydown', e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); unlockAudio(); grip(input + (e.key === 'ArrowLeft' ? -24 : 24)); } });
  function pause() { if (!active || sim.state.over) return; if (embedded) bridge.pause(); else { paused = true; panel('paused'); } }
  $('pause').onclick = pause; $('resume').onclick = () => { paused = false; debt = 0; panel(null); canvas.focus(); };
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(); }); listen(window, 'blur', pause);
  $('play').onclick = () => { unlockAudio(); start(); };
  $('again').onclick = start;
  $('home').onclick = () => { settle(); sheetUp = false; $('hud').hidden = true; $('callout').textContent = ''; panel('menu'); };
  $('wardrobe').onclick = closet; $('close-closet').onclick = () => panel('menu');
  const rows = [
    [['pep', 'A little lift.'], ['main', 'A big surge.']],
    [['hype', 'Double Good Vibes.'], ['vibe', 'Five fill Euphoria.']],
    [['hoodie', 'One miss forgiven.'], ['sad', 'Rain and a pull down.']]
  ];
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true');
    if (kind === 'hype') {
      for (const y of [6, 11]) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '4'); rect.setAttribute('y', String(y));
        rect.setAttribute('width', '12'); rect.setAttribute('height', '2.4');
        rect.setAttribute('fill', 'currentColor');
        svg.append(rect);
      }
      return svg;
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const shapes = {
      pep: 'M4 13 L10 6 L16 13',
      main: 'M4 9 L10 3 L16 9 M4 16 L10 10 L16 16',
      hype: 'M10 2 L12 8 L18 10 L12 12 L10 18 L8 12 L2 10 L8 8 Z',
      hoodie: 'M10 2 L18 10 L10 18 L2 10 Z',
      sad: 'M10 2 C10 2 5 9 5 13 A5 5 0 0 0 15 13 C15 9 10 2 10 2 Z',
      vibe: 'M10 1 L12 8 L19 10 L12 12 L10 19 L8 12 L1 10 L8 8 Z'
    };
    path.setAttribute('d', shapes[kind]);
    path.setAttribute('fill', kind === 'sad' || kind === 'vibe' || kind === 'hype' ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.append(path); return svg;
  }
  for (const row of rows) {
    const line = document.createElement('div'); line.className = 'legend-line';
    for (const [id, blurb] of row) {
      const item = document.createElement('span'); item.className = 'legend-item';
      item.style.color = M.KINDS[id].color;
      const name = document.createElement('strong'); name.textContent = M.KINDS[id].label;
      const small = document.createElement('small'); small.textContent = blurb;
      item.append(icon(id), name, small); line.append(item);
    }
    $('legend').append(line);
  }
  function syncChrome() {
    const narrow = matchMedia('(max-width: 760px)').matches;
    $('game-title').hidden = embedded && !narrow;
    if (narrow && !syncChrome.howtoTouched) $('howto').open = false;
  }
  $('howto').addEventListener('toggle', () => { syncChrome.howtoTouched = true; });
  function metrics() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const fill = vw <= 520;
    let scale, ox, oy;
    if (fill) {
      scale = vw / M.WIDTH;
      const drawnH = M.HEIGHT * scale;
      ox = 0;
      oy = Math.min(0, vh - drawnH);
    } else {
      scale = Math.min(vw / M.WIDTH, vh / M.HEIGHT);
      ox = (vw - M.WIDTH * scale) / 2;
      oy = (vh - M.HEIGHT * scale) / 2;
    }
    return { vw, vh, scale, ox, oy, fill };
  }
  function placeColumn() {
    const m = metrics();
    const column = $('column');
    column.style.width = `${M.WIDTH * m.scale}px`;
    column.style.left = `${m.ox}px`;
  }
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    placeColumn(); syncChrome();
  }
  listen(window, 'resize', resize); resize(); paintProgress(); syncChrome();

  const PALETTES = {
    weather: [
      { top: '#1b3148', bottom: '#5d7384', cloud: '#dfe6e2', shade: '#7f939f', sun: '#ffe0a6', rain: '#d5e4ee', trail: '#d5e0dc', paddle: '#b7e0d8' },
      { top: '#24384f', bottom: '#8d9aa4', cloud: '#e7eee8', shade: '#8ea0aa', sun: '#ffe0a6', rain: '#d5e4ee', trail: '#dce6e0', paddle: '#b7e0d8' },
      { top: '#2c4a68', bottom: '#c9b59a', cloud: '#f0f3ea', shade: '#9aabb4', sun: '#ffe0a6', rain: '#e4eef2', trail: '#e2ece4', paddle: '#b7e0d8' },
      { top: '#3a3f6e', bottom: '#e7b07a', cloud: '#f6f1e6', shade: '#c4a890', sun: '#ffd27a', rain: '#f0e4d4', trail: '#f0e2d4', paddle: '#b7e0d8' },
      { top: '#24386a', bottom: '#f0c49a', cloud: '#f7f4ec', shade: '#b7c0c8', sun: '#ffe7b0', rain: '#f4eadc', trail: '#f6efe2', paddle: '#b7e0d8' }
    ],
    afterglow: [
      { top: '#2a2438', bottom: '#6a5360', cloud: '#e6d5d4', shade: '#8d7380', sun: '#f0c2b0', rain: '#e4d4dc', trail: '#f0d0d4', paddle: '#efc3d6' },
      { top: '#3a3050', bottom: '#a88478', cloud: '#f0ddd4', shade: '#a08078', sun: '#f2c4ae', rain: '#ead6d4', trail: '#f3d4d6', paddle: '#efc3d6' },
      { top: '#4a3a5c', bottom: '#e0a890', cloud: '#f6e4da', shade: '#b48b86', sun: '#ffd0b4', rain: '#f0ddd6', trail: '#ffd6dc', paddle: '#efc3d6' },
      { top: '#5a4068', bottom: '#e8a07a', cloud: '#f8e6dc', shade: '#c49890', sun: '#ffc898', rain: '#f4e0d4', trail: '#ffd0d8', paddle: '#efc3d6' },
      { top: '#3d3058', bottom: '#f0b89a', cloud: '#f8eee6', shade: '#c8a8a4', sun: '#ffe0c4', rain: '#f6e6dc', trail: '#ffe0e4', paddle: '#efc3d6' }
    ],
    moonrise: [
      { top: '#1a3044', bottom: '#4e6874', cloud: '#d5e4e4', shade: '#6e8c96', sun: '#d5ece8', rain: '#d4e6ea', trail: '#d4e4e6', paddle: '#9dcec8' },
      { top: '#1e3a4e', bottom: '#6e9098', cloud: '#e0eeea', shade: '#7e9aa2', sun: '#d8f0ea', rain: '#d8e8ec', trail: '#d8e6e8', paddle: '#9dcec8' },
      { top: '#245068', bottom: '#9ec4c4', cloud: '#e8f3ee', shade: '#8aacab', sun: '#e4f6f0', rain: '#e0eef0', trail: '#dceeea', paddle: '#9dcec8' },
      { top: '#2a5874', bottom: '#b7d0c8', cloud: '#eef6f2', shade: '#96b4b4', sun: '#eef8f4', rain: '#e6f0f0', trail: '#e4f2ee', paddle: '#9dcec8' },
      { top: '#16324c', bottom: '#c8ddd4', cloud: '#f4f8f6', shade: '#a8c0c0', sun: '#f4fffb', rain: '#eaf4f2', trail: '#eaf6f2', paddle: '#9dcec8' }
    ]
  };
  function hex(color) {
    const n = color.replace('#', '');
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    const pa = hex(a), pb = hex(b);
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
  }
  function mixPal(a, b, t) {
    const out = {};
    for (const key of Object.keys(a)) out[key] = mix(a[key], b[key], t);
    return out;
  }
  const clouds = [
    c => { c.beginPath(); c.moveTo(-78, 12); c.quadraticCurveTo(-62, -6, -40, -2); c.quadraticCurveTo(-22, -26, 2, -12); c.quadraticCurveTo(24, -34, 48, -8); c.quadraticCurveTo(70, -4, 76, 12); c.closePath(); },
    c => { c.beginPath(); c.moveTo(-48, 14); c.quadraticCurveTo(-44, -8, -16, -4); c.quadraticCurveTo(-4, -42, 18, -18); c.quadraticCurveTo(42, -14, 46, 10); c.quadraticCurveTo(8, 18, -48, 14); c.closePath(); },
    c => { c.beginPath(); c.moveTo(-86, 14); c.quadraticCurveTo(-74, -2, -54, 2); c.quadraticCurveTo(-40, -24, -16, -6); c.quadraticCurveTo(2, -30, 24, -4); c.quadraticCurveTo(44, -16, 66, 4); c.quadraticCurveTo(80, 10, 72, 16); c.closePath(); },
    c => { c.beginPath(); c.moveTo(-64, 16); c.lineTo(-50, 0); c.quadraticCurveTo(-22, -28, 6, -2); c.lineTo(20, -16); c.quadraticCurveTo(52, -8, 60, 14); c.closePath(); }
  ];
  function paintCloud(shape, x, y, size, light, shade) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = shade;
    shape(ctx); ctx.fill();
    ctx.beginPath(); ctx.rect(-120, -48, 240, 34); ctx.clip();
    ctx.fillStyle = light;
    shape(ctx); ctx.fill();
    ctx.restore();
  }
  function paletteFor(tier) {
    const theme = PALETTES[progress.theme] ? progress.theme : 'weather';
    return PALETTES[theme][tier];
  }
  function paintSky(m, pal, s, tier, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(0, 0, 0, m.vh);
    grad.addColorStop(0, pal.top); grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, m.vw, m.vh);
    const showSun = tier >= 2 || s.euphoria > 0;
    if (showSun) {
      const menu = !$('menu').hidden;
      let sunX, sunY;
      if (menu && !m.fill) { sunX = Math.max(28, m.ox - 70 * m.scale); sunY = 150; }
      else if (menu) { sunX = m.vw - 42; sunY = 40; }
      else { sunX = m.ox + 300 * m.scale; sunY = m.oy + 168 * m.scale; }
      ctx.fillStyle = pal.sun;
      ctx.beginPath(); ctx.arc(sunX, sunY, 22 * Math.max(0.9, m.scale), 0, Math.PI * 2); ctx.fill();
    }
    const speeds = [0.012, 0.028, 0.05];
    const resultUp = !$('over').hidden;
    const hudClear = $('hud').hidden ? 28 : 132;
    for (let layer = 0; layer < 3; layer++) {
      const drift = reduced ? 0 : s.cam.x * speeds[layer] + visualT * (10 + layer * 8);
      const span = m.vw + 320;
      for (let i = 0; i < 4; i++) {
        let x = ((i * (span / 3.2) - drift) % span + span) % span - 120;
        const y = hudClear + layer * Math.max(64, (m.vh - hudClear) * 0.2) + (i % 2) * 16;
        const center = m.vw / 2;
        x += (x + 40 < center ? -1 : 1) * part * (150 + layer * 70);
        ctx.save();
        ctx.globalAlpha = alpha * (resultUp ? 0.28 : 1);
        paintCloud(clouds[(i + layer * 2) % 4], x, y, (0.72 + layer * 0.22) * Math.max(0.85, m.scale), pal.cloud, pal.shade);
        ctx.restore();
      }
    }
    const raining = tier === 0 || s.rain > 0 || (s.over && s.dying < 0.55);
    if (raining && !resultUp) {
      ctx.strokeStyle = pal.rain; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
      const drops = s.over ? 56 : 34;
      for (let i = 0; i < drops; i++) {
        const len = 7 + (i % 6) * 4;
        const speed = 240 + (i % 4) * 70;
        const x = ((i * 67 + visualT * (70 + (i % 3) * 24)) % (m.vw + 30)) - 10;
        const y = ((i * 91 + visualT * speed) % (m.vh + len)) - len;
        ctx.globalAlpha = alpha * (0.18 + (i % 5) * 0.1);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.18, y + len); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function face(tier, miss) {
    ctx.fillStyle = '#243044'; ctx.strokeStyle = '#243044'; ctx.lineWidth = 1.4; ctx.lineCap = 'butt';
    if (miss) {
      ctx.beginPath(); ctx.moveTo(-6.2, -1); ctx.lineTo(-2.2, 1.4); ctx.moveTo(2.2, 1.4); ctx.lineTo(6.2, -1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3.2, 5.2); ctx.quadraticCurveTo(0, 2.6, 3.2, 5.2); ctx.stroke();
      return;
    }
    if (tier <= 0) {
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-2.2, 0); ctx.moveTo(2.2, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2.2, 5); ctx.lineTo(2.6, 5); ctx.stroke();
    } else if (tier === 1) {
      ctx.beginPath(); ctx.arc(-3.8, 0.2, 1.15, 0, Math.PI * 2); ctx.arc(3.8, 0.2, 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, 5); ctx.lineTo(2.4, 5); ctx.stroke();
    } else if (tier === 2) {
      ctx.beginPath(); ctx.arc(-3.8, 0, 1.45, 0, Math.PI * 2); ctx.arc(3.8, 0, 1.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3, 4.2); ctx.quadraticCurveTo(0, 6.8, 3, 4.2); ctx.stroke();
    } else if (tier === 3) {
      ctx.beginPath(); ctx.arc(-3.8, -0.2, 1.7, 0, Math.PI * 2); ctx.arc(3.8, -0.4, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3.6, 3.8); ctx.quadraticCurveTo(0, 7.6, 3.6, 3.8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(-3.8, -0.2, 1.9, 0, Math.PI * 2); ctx.arc(3.8, -0.2, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f7ef';
      ctx.beginPath(); ctx.arc(-3.2, -0.7, 0.65, 0, Math.PI * 2); ctx.arc(4.4, -0.7, 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#243044';
      ctx.beginPath(); ctx.moveTo(-3.8, 3.6); ctx.quadraticCurveTo(0, 8.2, 3.8, 3.6); ctx.stroke();
    }
  }
  function emonad(x, y, tier, miss, sx, sy) {
    const kind = progress.avatar;
    const body = kind === 'skrumpey' ? '#e8a9cb' : kind === 'molandak' ? '#b1a1df' : '#d7e4c8';
    const shade = kind === 'skrumpey' ? '#c484aa' : kind === 'molandak' ? '#8878c0' : '#a9bfb4';
    const look = 1.8;
    ctx.save();
    ctx.translate(x, y + 11);
    ctx.scale(sx * look, sy * look);
    ctx.translate(0, -11);
    if (kind === 'skrumpey') {
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(-8, -10, 4, 6, -0.4, 0, Math.PI * 2); ctx.ellipse(8, -10, 4, 6, 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'molandak') {
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(4, -8); ctx.lineTo(-4, -8); ctx.closePath(); ctx.fill();
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = body; ctx.fillRect(-12, -14, 24, 26);
    ctx.fillStyle = shade; ctx.fillRect(-12, 3, 24, 12);
    ctx.restore();
    if (kind === 'emonad') {
      ctx.fillStyle = '#243044';
      ctx.beginPath(); ctx.moveTo(-10, -1); ctx.quadraticCurveTo(0, -16, 10, -1); ctx.quadraticCurveTo(0, -5, -10, -1); ctx.fill();
    }
    face(tier, miss);
    ctx.restore();
  }
  function chevron(y, w) {
    ctx.beginPath(); ctx.moveTo(-w, y + 4); ctx.lineTo(0, y - 4); ctx.lineTo(w, y + 4); ctx.stroke();
  }
  function star(r, inner) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 ? inner : r, a = -Math.PI / 2 + i * Math.PI / 4;
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
  function pickupMark(kind) {
    const color = M.KINDS[kind].color;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    if (kind === 'pep') chevron(0, 7);
    else if (kind === 'main') { chevron(-3, 7); chevron(4, 7); }
    else if (kind === 'hype') { ctx.fillRect(-6, -4, 12, 2.4); ctx.fillRect(-6, 2, 12, 2.4); }
    else if (kind === 'hoodie') { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.closePath(); ctx.stroke(); }
    else if (kind === 'sad') { ctx.beginPath(); ctx.moveTo(0, -8); ctx.bezierCurveTo(7, -2, 6, 7, 0, 8); ctx.bezierCurveTo(-6, 7, -7, -2, 0, -8); ctx.fill(); }
    else star(10, 4.5);
  }
  function capture(s) {
    return {
      head: { x: s.head.x, y: s.head.y, vy: s.head.vy },
      pad: { x: s.pad.x, w: s.pad.w },
      base: s.base, cam: { x: s.cam.x, y: s.cam.y },
      pickups: s.pickups.map(p => ({ kind: p.kind, x: p.x, y: p.y })),
      trail: s.trail.map(p => ({ x: p.x, y: p.y })),
      mood: s.mood, vibes: s.vibes, meter: s.meter, euphoria: s.euphoria, hype: s.hype, shield: s.shield,
      rain: s.rain, over: s.over, dying: s.dying, t: s.t, bounces: s.bounces, euphorias: s.euphorias
    };
  }
  function draw() {
    const live = sim.state;
    const euphoriaHit = live.euphorias > seenEuphorias;
    if (euphoriaHit) seenEuphorias = live.euphorias;
    const holding = !reduced && performance.now() < holdUntil && frozen;
    const s = holding ? frozen : capture(live);
    if (!holding) frozen = s;
    if (euphoriaHit && !reduced) {
      holdUntil = performance.now() + 36;
      const fill = $('meter-fill');
      fill.style.transition = 'none';
      fill.style.width = '0%';
      requestAnimationFrame(() => { fill.style.transition = ''; fill.style.width = '100%'; });
      meterArmed = true;
    }
    if (live.bounces > seenBounces) { seenBounces = live.bounces; catchAt = performance.now(); }
    const tier = (active || credited) ? M.tier(s.mood) : 2;
    if (shownTier < 0) shownTier = tier;
    else if (tier !== shownTier) {
      fadeFrom = paletteFor(shownTier);
      if (tier > shownTier) tierCall = { name: M.TIERS[tier][0], until: performance.now() + 1600 };
      shownTier = tier; fadeStart = performance.now();
    }
    const fadeT = !fadeFrom || reduced ? 1 : Math.min(1, (performance.now() - fadeStart) / 400);
    const nextPal = paletteFor(shownTier);
    const pal = fadeFrom && fadeT < 1 ? mixPal(fadeFrom, nextPal, fadeT) : nextPal;
    if (fadeT >= 1) fadeFrom = null;
    const targetPart = s.euphoria > 0 ? 1 : 0;
    part = reduced ? targetPart : part + (targetPart - part) * Math.min(1, frameDt * 3.2);
    const m = metrics();
    const dpr = canvas.width / Math.max(1, m.vw);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, m.vw, m.vh);
    const resultUp = !$('over').hidden;
    paintSky(m, pal, s, tier, 1);
    if (resultUp) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#101c2e';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, m.vw, m.vh);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.setTransform(dpr * m.scale, 0, 0, dpr * m.scale, dpr * m.ox, dpr * m.oy);
    if (!active && !sheetUp) { ctx.globalAlpha = 1; return; }
    const sx = x => x - s.cam.x, sy = y => s.cam.y - y;
    const juice = reduced ? 0 : Math.max(0, 1 - (performance.now() - catchAt) / 180);
    const tail = s.trail.slice(-7);
    if (tail.length > 1) {
      ctx.strokeStyle = pal.trail; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.18; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.beginPath();
      tail.forEach((p, i) => { if (!i) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y)); });
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const p of s.pickups) {
      const x = sx(p.x), y = sy(p.y);
      if (x < -40 || x > 430 || y < -40 || y > 900) continue;
      const vibe = p.kind === 'vibe';
      ctx.fillStyle = '#172b46cc';
      ctx.beginPath(); ctx.ellipse(x, y, vibe ? 22 : 16, vibe ? 14 : 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x, y); pickupMark(p.kind); ctx.restore();
    }
    const hx = sx(s.head.x), hy = sy(s.head.y);
    const miss = s.over && s.dying < 0.55;
    if (!s.over || miss) {
      const falling = s.head.vy < 0 && juice === 0 && !miss;
      const squashX = miss ? 1.08 : juice > 0 ? 1 + 0.28 * juice : falling ? 0.86 : 1;
      const squashY = miss ? 0.82 : juice > 0 ? 1 - 0.32 * juice : falling ? 1.18 : 1;
      emonad(hx, hy, tier, miss, squashX, squashY);
    }
    if (s.shield) { ctx.strokeStyle = '#b6e2ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 28, 0, Math.PI * 2); ctx.stroke(); }
    const py = sy(s.base);
    const dip = 3 * juice;
    ctx.save();
    ctx.translate(s.pad.x, py + dip);
    ctx.scale(1 + 0.14 * juice, 1 - 0.28 * juice);
    ctx.fillStyle = pal.top;
    ctx.beginPath(); ctx.roundRect(-s.pad.w / 2, 2, s.pad.w, 12, 4); ctx.fill();
    ctx.fillStyle = pal.paddle;
    ctx.beginPath(); ctx.roundRect(-s.pad.w / 2, -2, s.pad.w, 8, 4); ctx.fill();
    ctx.restore();
    if (juice > 0.05) {
      ctx.globalAlpha = juice * 0.9;
      ctx.fillStyle = pal.shade;
      ctx.beginPath(); ctx.arc(s.pad.x - 8, py - 6 - (1 - juice) * 10, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal.cloud;
      ctx.beginPath(); ctx.arc(s.pad.x + 7, py - 10 - (1 - juice) * 12, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const raining = tier === 0 || s.rain > 0 || miss;
    if (raining && active) {
      ctx.strokeStyle = pal.rain; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const span = Math.max(8, s.pad.w - 8);
        const x = s.pad.x - span / 2 + ((i * 19 + Math.floor(visualT * 7)) % span);
        const life = (visualT * 2.4 + i * 0.27) % 1;
        ctx.globalAlpha = (1 - life) * 0.85;
        ctx.beginPath();
        ctx.moveTo(x - 2, py - life * 5); ctx.lineTo(x - 6, py - 5 - life * 6);
        ctx.moveTo(x + 2, py - life * 5); ctx.lineTo(x + 6, py - 4 - life * 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (!s.over) {
      $('mood').textContent = s.mood.toLocaleString();
      $('tier').textContent = M.TIERS[tier][0];
      $('vibes').textContent = s.vibes;
      $('meter-label').textContent = s.euphoria > 0 ? 'Euphoria' : 'Euphoria';
      $('meter-value').textContent = s.euphoria > 0 ? `${Math.ceil(s.euphoria)}s` : `${s.meter} / 5`;
      $('meter').setAttribute('aria-valuenow', String(s.euphoria > 0 ? 5 : s.meter));
      if (s.euphoria <= 0) {
        meterArmed = false;
        $('meter-fill').style.width = `${(s.meter / 5) * 100}%`;
      }
      $('effects').textContent = [s.hype > 0 ? `Hype · ${Math.ceil(s.hype)}s` : '', s.shield ? 'Hoodie Up' : ''].filter(Boolean).join(' · ');
    }
    const event = live.events.at(-1);
    const tierText = !s.over && tierCall && performance.now() < tierCall.until ? tierCall.name : '';
    $('callout').textContent = s.over ? '' : (tierText || (event && live.steps - event.tick < 180 ? event.text : ''));
    if (event && event.tick !== lastEvent) { lastEvent = event.tick; tone(event.text === 'Sad Song' ? 'sad' : event.text); }
  }
  function loop(now) {
    if (destroyed) return;
    const delta = Math.max(0, Math.min(.25, (now - last) / 1000 || 0)); last = now; frameDt = delta;
    if (!reduced) visualT += delta;
    if (active && ready && !paused && !bridge?.paused) {
      debt += delta; let ticks = 0;
      while (debt >= M.STEP && ticks++ < 16) {
        track.push(input); sim.tick(input); debt -= M.STEP;
        if (sim.state.shown) { finish(); debt = 0; break; }
      }
      if (ticks >= 16) debt = 0;
    } else debt = 0;
    if (active && sim.state.over) { $('hud').hidden = true; $('grip').hidden = true; }
    if (active && sim.state.over && sim.state.dying >= 0.4) showResult();
    if (active && sim.state.shown) finish();
    draw();
    frame = requestAnimationFrame(loop);
  }
  if (embedded) {
    $('play').disabled = true;
    bridge.register({ version: DISPLAY_VERSION, capabilities: { pause: true, touch: true },
      mount(value) {
        config = value;
        try { progress = P.normalize(JSON.parse(localStorage.getItem(KEY))); } catch {}
        paintProgress();
        if (value.mode !== 'free' && (!value.seed || value.rules?.viewportWidth !== 390 || value.rules?.viewportHeight !== 844)) throw new Error('Mood Swings needs an issued playfield and seed.');
        $('play').disabled = false;
      },
      start() { panel('menu'); },
      restart() { if (free()) { active = false; start(); } },
      pause() { paused = true; },
      resume() { paused = false; debt = 0; },
      audio(value) { muted = value; },
      destroy() { destroyed = true; active = false; cancelAnimationFrame(frame); listeners.forEach(fn => fn()); void audio?.close(); }
    });
  }
  frame = requestAnimationFrame(loop);
})();
