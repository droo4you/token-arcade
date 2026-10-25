(() => {
  'use strict';
  const M = window.MoodSwings, P = window.MoodProgress, bridge = window.TokenArcade;
  const $ = id => document.getElementById(id), canvas = $('sky'), ctx = canvas.getContext('2d');
  const embedded = !!bridge?.embedded, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'token-arcade:mood-swings:progress:v2';
  let progress = P.fresh(), storageOK = true;
  try { progress = P.normalize(JSON.parse(localStorage.getItem(KEY))); } catch { storageOK = false; }
  let sim = M.create('welcome'), track = [], active = false, ready = false, paused = false, destroyed = false;
  let config = null, frame = 0, last = 0, debt = 0, input = 195, dragging = false, credited = false, audio = null, muted = false, lastEvent = -1;
  const listeners = [];
  function listen(target, event, fn) { target.addEventListener(event, fn); listeners.push(() => target.removeEventListener(event, fn)); }
  const free = () => !embedded || config?.mode === 'free';
  function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); storageOK = true; } catch { storageOK = false; } paintProgress(); }
  function paintProgress() {
    $('saved').textContent = storageOK ? `Best: ${progress.bestMood.toLocaleString()} Mood · ${P.balance(progress)} Good Vibes` : 'Browser saving is unavailable. You can still play.';
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
    o.type = kind === 'sad' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(kind === 'sad' ? 90 : kind === 'Euphoria' ? 880 : 520, t);
    g.gain.setValueAtTime(.035, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + .2);
  }
  function unlockAudio() { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); void audio.resume().catch(() => {}); } catch {} }
  function start() {
    if (destroyed || active || (embedded && !free() && credited)) return;
    const seed = free() ? crypto.randomUUID() : config.seed;
    sim = M.create(seed); track = []; credited = false; ready = false; active = true; paused = false; debt = 0; input = 195; lastEvent = -1;
    $('hud').hidden = false; $('grip').hidden = false; panel(null); canvas.focus({ preventScroll: true });
  }
  function finish() {
    active = false; $('grip').hidden = true; $('hud').hidden = true; panel('over');
    const s = sim.state;
    if (!credited) {
      // Cosmetics can be earned in any mode; competitive verification never trusts this save.
      progress.earned = Math.min(1e9, progress.earned + s.vibes); progress.bestMood = Math.max(progress.bestMood, s.peakMood); save();
      bridge?.complete({ ...M.metrics(s), result: 'completed', proof: { v: 1, seed: s.seed, steps: track.length, track: M.encode(track) } });
      credited = true;
    }
    $('result-tier').textContent = M.TIERS[M.tier(s.peakMood)][0]; $('peak').textContent = s.peakMood.toLocaleString();
    $('result-vibes').textContent = `${s.vibes} Good Vibes collected`;
    $('result-time').textContent = `${s.bounces} ${s.bounces === 1 ? 'catch' : 'catches'} · ${Math.floor(s.t)} seconds · ${s.euphorias} Euphoria moments`;
    $('again').hidden = !free(); $('home').hidden = !free();
    $('result-note').textContent = free() ? (storageOK ? 'Your progress is saved in this browser.' : 'Browser saving is unavailable for this session.') : 'Return to Token Arcade for verification and your next attempt.';
  }
  function grip(x) {
    if (!active || paused || bridge?.paused || sim.state.over) return;
    if (!ready) { if (embedded && !bridge.beginRun()) return; ready = true; $('grip').hidden = true; }
    input = Math.round(Math.max(0, Math.min(M.WIDTH, x)));
  }
  function pointer(e) { const r = canvas.getBoundingClientRect(); grip((e.clientX - r.left) / r.width * M.WIDTH); }
  listen(canvas, 'pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); unlockAudio(); pointer(e); });
  listen(canvas, 'pointermove', e => { if (dragging) pointer(e); });
  listen(canvas, 'pointerup', () => { dragging = false; }); listen(canvas, 'pointercancel', () => { dragging = false; });
  listen(canvas, 'keydown', e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); unlockAudio(); grip(input + (e.key === 'ArrowLeft' ? -24 : 24)); } });
  function pause() { if (!active) return; if (embedded) bridge.pause(); else { paused = true; panel('paused'); } }
  $('pause').onclick = pause; $('resume').onclick = () => { paused = false; debt = 0; panel(null); canvas.focus(); };
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(); }); listen(window, 'blur', pause);
  $('play').onclick = () => { unlockAudio(); start(); }; $('again').onclick = start;
  $('home').onclick = () => { $('hud').hidden = true; panel('menu'); };
  $('wardrobe').onclick = closet; $('close-closet').onclick = () => panel('menu');
  const descriptions = { pep: 'A little lift.', main: 'A big surge.', hype: 'Double Good Vibes for 8 seconds.', hoodie: 'One missed catch forgiven.', sad: 'Rain and a downward pull.', vibe: 'Five fill Euphoria: a 6-second lift.' };
  for (const [id, kind] of Object.entries(M.KINDS)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = kind.label; dd.textContent = descriptions[id]; $('legend').append(dt, dd); }
  function resize() { const dpr = Math.min(2, devicePixelRatio || 1); canvas.width = M.WIDTH * dpr; canvas.height = M.HEIGHT * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  listen(window, 'resize', resize); resize(); paintProgress();
  const skies = [ ['#273d56', '#8999a9'], ['#4b6079', '#9dabb8'], ['#557c9e', '#d3dcd5'], ['#705e89', '#efb986'], ['#192d58', '#7183aa'] ];
  function cloud(x, y, size, alpha, color) {
    ctx.fillStyle = color; ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(x, y, size, size * .22, 0, 0, Math.PI * 2); ctx.ellipse(x - size * .3, y - size * .12, size * .45, size * .21, 0, 0, Math.PI * 2); ctx.ellipse(x + size * .2, y - size * .17, size * .4, size * .26, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  function weather(s) {
    const ti = active || credited ? M.tier(s.mood) : 1, t = reduced ? 0 : s.t;
    let [top, bottom] = skies[ti];
    if (progress.theme === 'afterglow') { top = ['#433d63','#665576','#7e648a','#9b6783','#352d61'][ti]; bottom = '#e5b79e'; }
    if (progress.theme === 'moonrise') { top = ['#243951','#304759','#476e86','#657d94','#12284a'][ti]; bottom = '#9dbec9'; }
    const grad = ctx.createLinearGradient(0, 0, 0, 844); grad.addColorStop(0, top); grad.addColorStop(1, bottom); ctx.fillStyle = grad; ctx.fillRect(0, 0, 390, 844);
    if (ti >= 2 || s.euphoria > 0) {
      const glow = ctx.createRadialGradient(290, 260, 5, 290, 260, 200); glow.addColorStop(0, s.euphoria > 0 ? '#fff4caad' : '#ffdcac80'); glow.addColorStop(1, '#ffe5c000'); ctx.fillStyle = glow; ctx.fillRect(0, 50, 390, 600);
      ctx.fillStyle = '#ffeac6'; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(290, 260, 28, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (ti === 4) {
      ctx.fillStyle = '#edf3ed';
      for (let i = 0; i < 35; i++) { ctx.globalAlpha = .25 + .35 * ((i % 5) / 5); ctx.beginPath(); ctx.arc((i * 73 + 13) % 390, 170 + (i * 37) % 300, i % 3 === 0 ? 1.5 : .8, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = .13; ctx.lineWidth = 35; ctx.strokeStyle = progress.theme === 'afterglow' ? '#efbbd8' : '#9ae7d3';
      ctx.beginPath(); for (let x = -20; x < 420; x += 8) { const y = 330 + Math.sin(x / 95 + t * .08) * 85; if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 4; i++) {
      const drift = reduced ? 0 : s.cam.x * (.025 + layer * .025), size = 100 + layer * 30;
      const x = ((i * 180 - drift) % 650 + 650) % 650 - 130;
      const y = (ti >= 3 ? 570 : 250) + layer * 125 + (i % 2) * 32;
      cloud(x + (s.euphoria > 0 ? (i % 2 ? 90 : -90) : 0), y, size, s.euphoria > 0 ? .10 : .10 + layer * .025, '#eef1e9');
    }
    if (ti === 0 || s.rain > 0) {
      ctx.strokeStyle = '#dce8ed'; ctx.lineWidth = 1; ctx.globalAlpha = s.rain > 0 ? .28 : .10;
      for (let i = 0; i < 32; i++) { const x = (i * 47 + t * 11) % 420, y = (i * 83 + t * 320) % 844; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke(); } ctx.globalAlpha = 1;
      if (s.rain > .85 && !reduced) { ctx.fillStyle = '#ecf1ff'; ctx.globalAlpha = .10; ctx.fillRect(0, 0, 390, 844); ctx.globalAlpha = 1; }
    }
    if (s.euphoria > 0) {
      ctx.fillStyle = '#fff0b9'; ctx.globalAlpha = .08;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(290, 240); ctx.lineTo(i * 130 - 200, 844); ctx.lineTo(i * 130 - 145, 844); ctx.fill(); } ctx.globalAlpha = 1;
    }
  }
  function avatar(x, y) {
    const kind = progress.avatar;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = kind === 'skrumpey' ? '#e8a9cb' : kind === 'molandak' ? '#b1a1df' : '#c1cedc';
    if (kind !== 'emonad') { ctx.beginPath(); ctx.ellipse(-10,-9,6,10,-.5,0,Math.PI*2); ctx.ellipse(10,-9,6,10,.5,0,Math.PI*2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0,0,15,0,Math.PI*2); ctx.fill(); ctx.lineWidth=2;ctx.strokeStyle='#f8f0df';ctx.stroke();
    ctx.fillStyle='#27344d'; if(kind==='emonad'){ctx.beginPath();ctx.moveTo(-14,-5);ctx.quadraticCurveTo(0,-25,14,-5);ctx.lineTo(-4,2);ctx.fill();}
    ctx.beginPath();ctx.arc(-5,1,1.6,0,Math.PI*2);ctx.arc(5,1,1.6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#27344d';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-3,7);ctx.quadraticCurveTo(0,9,4,6);ctx.stroke();ctx.restore();
  }
  function draw() {
    const s = sim.state; weather(s);
    const sx = x => x - s.cam.x, sy = y => s.cam.y - y;
    if (!active) return;
    ctx.strokeStyle = progress.theme === 'afterglow' ? '#ffcedc' : '#e2ece4'; ctx.lineWidth = 2; ctx.globalAlpha = .18; ctx.beginPath();
    s.trail.forEach((p, i) => { if (!i) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y)); }); ctx.stroke(); ctx.globalAlpha = 1;
    for (const p of s.pickups) {
      const x = sx(p.x), y = sy(p.y); if (x < -50 || x > 440 || y < 180 || y > 830) continue;
      const k = M.KINDS[p.kind], vibe = p.kind === 'vibe';
      ctx.fillStyle = '#1a2c4caa'; ctx.beginPath(); ctx.ellipse(x,y,vibe ? 25 : 23,vibe ? 16 : 23,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=k.color;ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle=k.color;ctx.textAlign='center';ctx.font='bold 21px Trebuchet MS';ctx.fillText(k.glyph,x,y+7);
    }
    const x=sx(s.head.x),y=sy(s.head.y);if(!s.over)avatar(x,y);
    if(s.shield){ctx.strokeStyle='#b6e2ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,23,0,Math.PI*2);ctx.stroke();}
    const py=sy(s.base);ctx.fillStyle='#172b46';ctx.beginPath();ctx.roundRect(s.pad.x-s.pad.w/2,py+4,s.pad.w,18,9);ctx.fill();ctx.fillStyle=progress.theme==='afterglow'?'#efc3d6':'#b7e0d8';ctx.beginPath();ctx.roundRect(s.pad.x-s.pad.w/2,py,s.pad.w,12,6);ctx.fill();
    $('mood').textContent=s.mood.toLocaleString();$('tier').textContent=M.TIERS[M.tier(s.mood)][0];$('vibes').textContent=s.vibes;
    $('meter-label').textContent=s.euphoria>0?'Euphoria!':'Euphoria';$('meter-value').textContent=s.euphoria>0?`${Math.ceil(s.euphoria)}s`:`${s.meter} / 5`;$('meter').value=s.euphoria>0?5:s.meter;
    $('effects').textContent=[s.hype>0?`Hype · ${Math.ceil(s.hype)}s`:'',s.shield?'Hoodie Up':''].filter(Boolean).join(' · ');
    const event=s.events.at(-1);$('callout').textContent=event&&s.steps-event.tick<180?event.text:'';
    if(event&&event.tick!==lastEvent){lastEvent=event.tick;tone(event.text==='Sad Song'?'sad':event.text);}
  }
  function loop(now) {
    if(destroyed)return;
    const delta=Math.max(0,Math.min(.25,(now-last)/1000||0));last=now;
    if(active&&ready&&!paused&&!bridge?.paused){
      debt+=delta;let ticks=0;
      while(debt>=M.STEP&&ticks++<16){track.push(input);sim.tick(input);debt-=M.STEP;if(sim.state.shown){finish();debt=0;break;}}
      if(ticks>=16)debt=0;
    }else debt=0;
    draw();frame=requestAnimationFrame(loop);
  }
  if(embedded){
    $('play').disabled=true;
    bridge.register({version:M.VERSION,capabilities:{pause:true,touch:true},
      mount(value){config=value;try{progress=P.normalize(JSON.parse(localStorage.getItem(KEY)));}catch{}paintProgress();if(value.mode!=='free'&&(!value.seed||value.rules?.viewportWidth!==390||value.rules?.viewportHeight!==844))throw new Error('Mood Swings needs an issued playfield and seed.');$('play').disabled=false;},
      start(){panel('menu');}, restart(){if(free()){active=false;start();}}, pause(){paused=true;},resume(){paused=false;debt=0;},audio(value){muted=value;},
      destroy(){destroyed=true;active=false;cancelAnimationFrame(frame);listeners.forEach(fn=>fn());void audio?.close();}
    });
  }
  frame=requestAnimationFrame(loop);
})();
