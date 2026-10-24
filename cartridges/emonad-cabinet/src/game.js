(function(){
"use strict";
const ARCADE=!!window.TokenArcade?.embedded;
let arcadeTheme=null;
const arcadeLabel=(key,fallback)=>ARCADE?(arcadeTheme?.strings?.[key]||fallback):fallback;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
const css=getComputedStyle(document.documentElement);
const C=k=>css.getPropertyValue(k).trim();
let W=0,H=0,DPR=1;

function resize(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=window.innerWidth; H=window.innerHeight;
  cv.width=Math.floor(W*DPR); cv.height=Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize',resize); resize();

/* ---------- tuning ---------- */
const T={ g:2650, bounce:980, vx:210, padW:96, ramp:1, late:0.65, padMin:24, sound:1, noise:3.5, music:1, musicVol:60, head:0 };
/* Snapshot before anything can touch T, so "reset to default" restores the shipped
   values rather than whatever the panel happened to start on. */
const T_DEFAULT=Object.assign({},T);

/* The tuning keys that change the simulation, so a run made with them is not
   comparable to anyone else's. Everything else in the panel is cosmetic: `noise` is
   read only inside draw(), and sound, palette and brand assets never touch update().

   This list decides whether a run is offered to the leaderboard. It is a courtesy,
   not the defence. The server re-simulates every run at default tuning, so a modified
   run fails verification whatever the client claims: a maxed button width scored
   $573.7M and recomputed to $1.2M. Without this list that rejection reads as an
   accusation of cheating at somebody who just moved a slider. */
const SIM_KEYS=['g','bounce','vx','padW','ramp','late','padMin'];
const isTuned=()=>SIM_KEYS.some(k=>T[k]!==T_DEFAULT[k]);

/* ---------- deterministic RNG ---------- */
/* Two independent streams, both seeded per run from S.seed.

   rng()  simulation stream. Every draw that can change the outcome of a run goes
          through this: pickup kind and placement, bounce volatility, trail shape,
          particle bursts. Called only from update() and the functions update()
          calls.
   vrng() visual stream. Render-path only, currently camera shake. It is separate
          so that a fixed-timestep loop, which runs update() a variable number of
          times per drawn frame, cannot shift the simulation stream.

   Do not call rng() from draw() or hud(), and do not call vrng() from update().
   The one deliberate holdout is the WebAudio noise buffer in clickSound, which
   stays on Math.random: it is built lazily on first sound and would pull 2048
   values into the stream at a moment that depends on whether audio initialized.

   mulberry32 is all-integer, so it produces the identical sequence in every JS
   engine. That is the property server-side replay verification depends on. */
function mulberry32(a){
  a=a>>>0;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/* ECMA-262 does not specify the precision of Math.sin, Math.cos, Math.pow,
   Math.exp or Math.log, so two JS engines may legally return different values
   for the same argument. Anything reachable from update() therefore has to
   avoid them, or a run recorded in one browser replays to a different score in
   another, and a player checking our work in a browser we did not choose gets
   a mismatch that looks exactly like us cheating.

   dsin is built from specified arithmetic only: divide, floor, multiply, add.
   Range-reduce to turns, fold into [-HALF_PI, HALF_PI], then an odd Taylor
   series to x^11, accurate to about 1e-11 across that interval. Every step is
   exactly reproducible in every engine. */
const TAU=6.283185307179586, HALF_PI=1.5707963267948966;
function dsin(x){
  let t=x/TAU;
  t=t-Math.floor(t);               // [0,1) turns
  let a=t*TAU;                     // [0,TAU)
  if(a>Math.PI) a-=TAU;            // (-PI,PI]
  if(a>HALF_PI) a=Math.PI-a;       // fold: sin(PI-a) === sin(a)
  else if(a<-HALF_PI) a=-Math.PI-a;
  const s=a*a;
  return a*(1+s*(-1/6+s*(1/120+s*(-1/5040+s*(1/362880+s*(-1/39916800))))));
}
function newSeed(){ return (Math.random()*4294967296)>>>0; }
let rng=mulberry32(0), vrng=mulberry32(0);

/* ---------- brand assets ---------- */
/* Swap these to self-hosted copies before production. */
const ASSETS={
  tap:      './public/sounds/button-tap.wav',
  woo:      './public/sounds/button-woo.wav',
  milestone:'./public/sounds/button-milestone.wav'
};
let USE_BRAND=true;

/* Button split into three layers so the green cap travels into the housing.
   Draw order: housing well, cap (offset down on press), front lip. */
const ART={
  hous:'./public/assets/buy-housing.png',
  cap: './public/assets/buy-cap.png',
  lip: './public/assets/buy-lip.png'
};
const IMG={}; let artOK=false, artLoaded=0;
['hous','cap','lip'].forEach(k=>{
  if(ARCADE) return;
  const i=new Image();
  i.onload=()=>{ if(++artLoaded===3) artOK=true; };
  i.onerror=()=>{ artOK=false; };
  i.src=ART[k]; IMG[k]=i;
});

/* ---------- head skins ---------- */
/* The chart cursor. 0 is the square, the rest are mascot heads in
   public/assets/heads, PNG with real transparency, facing right, any size. Draw-side
   only: a file that fails to load falls back to the square, and nothing in update()
   reads T.head, so a skin never changes a run. */
const HEADS=[
  { name:'Cursor' },
  { name:'Artificial Inu', src:'./public/assets/heads/artificial-inu.png' },
  { name:'Cashcat',        src:'./public/assets/heads/cashcat.png' },
  { name:'Ponshouse',      src:'./public/assets/heads/ponshouse.png' },
  { name:'Tendies',        src:'./public/assets/heads/tendies.png' },
  { name:'Robbie',         src:'./public/assets/heads/robbie.png' }
];
if(ARCADE) HEADS.length=1;
HEADS.forEach(h=>{
  if(!h.src) return;
  const i=new Image();
  i.onload=()=>{ h.ok=true; }; i.onerror=()=>{ h.ok=false; };
  i.src=h.src; h.img=i;
});

/* A pool of identical audio elements so a sound can overlap itself.

   Three rules here were learned from bugs, so keep them.

   Readiness is per element. A single `ok` flag used to flip true as soon as ANY one
   element fired canplaythrough, after which play() round-robined onto elements that
   had not loaded and fell silent.

   The pool owns the fallback, and callers pass it in. Sample playback fails
   asynchronously, so no synchronous return value can describe it. See play().

   unlock() runs once per pool, ever. It was called on every start(), so each run
   re-triggered play-then-pause across all nine elements on top of the start click,
   which is what the overlapping noise at the start of a run was. */
function pool(url,n){
  if(ARCADE) return { get ok(){ return false; }, unlock(){}, play(v,fb){ if(T.sound&&fb) fb(); return false; } };
  const arr=[]; let i=0, unlocked=false;
  for(let k=0;k<n;k++){
    const a=new Audio();
    a.preload='auto';
    a._at=0;                 // when this voice last started, for oldest-first reuse
    a.src=url;
    arr.push(a);
  }
  const ready=a=>a.readyState>=2;   // HAVE_CURRENT_DATA
  return {
    get ok(){ return arr.some(ready); },
    unlock(){
      if(unlocked) return;
      unlocked=true;
      arr.forEach(a=>{
        const v=a.volume;
        a.volume=0;
        const p=a.play();
        if(p&&p.then) p.then(()=>{ a.pause(); a.currentTime=0; a.volume=v; }).catch(()=>{ a.volume=v; });
      });
    },
    /* play(volume, fallback)
       The pool owns the fallback because a sample can fail asynchronously and the
       caller cannot see that. play() hands back a promise that rejects on a seek
       during playback (AbortError), a decode failure, or an autoplay block, all long
       after a synchronous return value has been consumed. The old shape,
       `if(!SFX.tap.play(v)) synth()`, therefore covered the not-loaded-yet case and
       silently dropped every other failure, which is why bounces still fell silent
       after readiness was fixed. Anything that stops the sample now runs fb(). */
    play(v,fb){
      const bail=()=>{ if(fb) fb(); return false; };
      if(!T.sound) return false;          // sound off means silence, not a synth click
      if(!USE_BRAND) return bail();
      // Prefer a voice that is loaded and idle. Restarting one mid-play clips the
      // earlier hit and is what raises AbortError on the seek.
      let a=null;
      for(let k=0;k<arr.length;k++){
        const c=arr[(i+k)%arr.length];
        if(ready(c) && (c.paused||c.ended)){ a=c; i=(i+k+1)%arr.length; break; }
      }
      // Everything is busy: take the voice that started longest ago.
      if(!a){
        const loaded=arr.filter(ready);
        if(loaded.length) a=loaded.reduce((o,c)=>c._at<o._at?c:o);
      }
      if(!a) return bail();               // nothing loaded yet
      try{
        a.currentTime=0;
        a.volume=v==null?0.6:v;
        a._at=performance.now();
        const p=a.play();
        if(p&&p.catch) p.catch(()=>{ if(fb) fb(); });
      }catch(e){ return bail(); }
      return true;
    }
  };
}
const SFX={ tap:pool(ASSETS.tap,5), woo:pool(ASSETS.woo,2), milestone:pool(ASSETS.milestone,2) };

/* ---------- audio ---------- */
let AC=null;
let noiseBuf=null;
/* iOS mutes WebAudio under the ringer switch unless the page's audio session is
   'playback'. Safari 17 exposes navigator.audioSession for that. Chrome on iPhone is
   a WKWebView without it: the context ran, the sequencer scheduled, and nothing came
   out, while the tap SFX (<audio> elements, which are media) played. A silent media
   loop did not flip the session there either. So on that platform the music leaves
   WebAudio through a MediaStreamDestination and an <audio> element plays the stream,
   the same path the WAVs take. The element must first play inside a gesture. */
const IOS_WEBVIEW=/iP(hone|ad|od)/.test(navigator.userAgent||'') && !navigator.audioSession;
let sink=null, keep=null;
function musicOut(a){
  if(!IOS_WEBVIEW) return a.destination;
  try{
    if(!sink){ sink=a.createMediaStreamDestination(); keep=new Audio(); keep.srcObject=sink.stream; keep.autoplay=true; }
    return sink;
  }catch(e){ return a.destination; }
}
function keepSession(on){
  if(!keep) return;
  try{ if(on){ const p=keep.play(); if(p&&p.catch) p.catch(()=>{}); } else keep.pause(); }catch(e){}
}
let acWarm=false;
function ac(){
  AC=AC||new (window.AudioContext||window.webkitAudioContext)();
  // 'suspended' is the autoplay gate. 'interrupted' is WebKit's state after another
  // app or a call took the audio session, and Chrome on iPhone can hand the page a
  // context already in it; resume() is the way out of both.
  if(AC.state!=='running') AC.resume();
  if(!acWarm){
    acWarm=true;
    // iOS. Two things, both once, both inside the first tap that reaches here:
    // a source actually started in the gesture is what unlocks the context on older
    // WebKit, resume() alone is not always enough. And the playback session type keeps
    // WebAudio audible with the ringer switch on silent; by default iOS treats it as
    // ambient and mutes it while the <audio> SFX pools keep playing, which reads as
    // taps without music.
    try{ if(navigator.audioSession) navigator.audioSession.type='playback'; }catch(e){}
    try{ const b=AC.createBuffer(1,1,22050), src=AC.createBufferSource(); src.buffer=b; src.connect(AC.destination); src.start(0); }catch(e){}
    musicOut(AC); keepSession(true);   // first play must be in a gesture; later play() calls are then allowed
  }
  return AC;
}
// mechanical click: a filtered noise transient plus a short pitched thunk
function clickSound(vol,pitch){
  if(!T.sound) return;
  try{
    const A=ac(), t=A.currentTime;
    if(!noiseBuf){
      noiseBuf=A.createBuffer(1,2048,A.sampleRate);
      const d=noiseBuf.getChannelData(0);
      // deliberately Math.random: built lazily on first sound, so pulling from the
      // seeded stream here would desync it based on when audio initialized
      for(let i=0;i<2048;i++) d[i]=(Math.random()*2-1)*(1-i/2048);
    }
    const src=A.createBufferSource(); src.buffer=noiseBuf;
    const bp=A.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2500*pitch; bp.Q.value=1.1;
    const g1=A.createGain();
    g1.gain.setValueAtTime(vol,t);
    g1.gain.exponentialRampToValueAtTime(0.0001,t+0.032);
    src.connect(bp); bp.connect(g1); g1.connect(A.destination);
    src.start(t); src.stop(t+0.04);

    const o=A.createOscillator(); o.type='triangle';
    o.frequency.setValueAtTime(340*pitch,t);
    o.frequency.exponentialRampToValueAtTime(115*pitch,t+0.055);
    const g2=A.createGain();
    g2.gain.setValueAtTime(vol*0.55,t);
    g2.gain.exponentialRampToValueAtTime(0.0001,t+0.075);
    o.connect(g2); g2.connect(A.destination);
    o.start(t); o.stop(t+0.08);
  }catch(e){}
}

// whale buy: a rising sweep with a shimmer layer on top
function swoop(vol){
  if(!T.sound) return;
  try{
    const A=ac(), t=A.currentTime;
    [[0,'sawtooth',0.55],[0.05,'sine',0.32]].forEach(([d,type,amp])=>{
      const o=A.createOscillator(); o.type=type;
      o.frequency.setValueAtTime(200,t+d);
      o.frequency.exponentialRampToValueAtTime(1250,t+d+0.30);
      const f=A.createBiquadFilter(); f.type='lowpass'; f.frequency.value=4200;
      const g=A.createGain();
      g.gain.setValueAtTime(0.0001,t+d);
      g.gain.exponentialRampToValueAtTime(vol*amp,t+d+0.05);
      g.gain.exponentialRampToValueAtTime(0.0001,t+d+0.42);
      o.connect(f); f.connect(g); g.connect(A.destination);
      o.start(t+d); o.stop(t+d+0.46);
    });
  }catch(e){}
}
// milestone: a quick major arpeggio
function fanfare(vol){
  if(!T.sound) return;
  try{
    const A=ac(), t=A.currentTime;
    [523.25,659.25,783.99,1046.5].forEach((fq,i)=>{
      const st=t+i*0.062;
      const o=A.createOscillator(); o.type='triangle'; o.frequency.value=fq;
      const g=A.createGain();
      g.gain.setValueAtTime(0.0001,st);
      g.gain.exponentialRampToValueAtTime(vol,st+0.012);
      g.gain.exponentialRampToValueAtTime(0.0001,st+0.30);
      o.connect(g); g.connect(A.destination);
      o.start(st); o.stop(st+0.32);
    });
  }catch(e){}
}

function blip(freq,dur,type,vol){
  if(!T.sound) return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(), g=AC.createGain();
    o.type=type||'square'; o.frequency.value=freq;
    g.gain.setValueAtTime(vol||0.05,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+dur);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime+dur);
  }catch(e){}
}

/* ---------- music ---------- */
/* A step sequencer on WebAudio, no files. Three tracks in the Geometry Dash pocket:
   four-on-the-floor kick, sidechained saw bass, a detuned-saw lead and a chord arp.
   Everything here is render-side. tick() reads S.ready, S.t and S.over to open the
   filter and to fade out, and nothing here writes anything the simulation reads, so
   a run with music replays identically to one without. Never call rng() from here.

   A pattern is 16 steps to the bar. Drum and bass rows are one bar and repeat; lead
   is four bars (64 entries) so it can follow the chord progression. null is a rest,
   a number is a scale degree (7 is the octave), [degree, steps] holds a note. Bass
   entries are semitone offsets from the bar's chord root. Arp entries index the
   chord's tones, 3 and 4 being tone 0 and 1 an octave up. */
const MUSIC=(()=>{
  const _=null;
  const MINOR=[0,2,3,5,7,8,10], MAJOR=[0,2,4,5,7,9,11];
  const TRACKS=[
    null,
    { name:'Breakout', bpm:140, root:110, scale:MINOR, bassOct:0.5, leadOct:2,
      chords:[[0,3,7],[8,12,15],[3,7,10],[10,14,17]],          // Am F C G
      kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      clap:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,2],
      bass:[0,0,12,0,0,0,12,0,0,0,12,0,0,12,0,12],
      arp: [0,1,2,3,0,1,2,3,0,1,2,3,2,3,4,3],
      lead:[
        7,_,7,_,9,_,7,_,11,_,9,_,7,_,4,_,
        5,_,5,_,7,_,9,_,7,_,5,_,[9,4],_,_,_,
        9,_,9,_,11,_,9,_,13,_,11,_,9,_,6,_,
        6,_,8,_,10,_,8,_,6,_,4,_,[6,4],_,_,_ ] },
    { name:'Melt-Up', bpm:165, root:82.41, scale:MINOR, bassOct:1, leadOct:2,
      chords:[[0,3,7],[10,14,17],[8,12,15],[10,14,17]],        // Em D C D
      kick:[1,0,0,0,1,0,0,0,1,0,1,0,1,0,0,0],
      clap:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,2],
      bass:[0,0,0,12,0,0,0,12,0,0,0,12,0,12,0,12],
      arp: [_,_,0,_,_,_,1,_,_,_,2,_,_,_,3,_],
      lead:[
        7,9,11,9,7,9,11,14,7,9,11,9,7,4,2,4,
        6,8,10,8,6,8,10,13,6,8,10,8,6,3,1,3,
        5,7,9,7,5,7,9,12,5,7,9,7,5,2,0,2,
        6,8,10,8,6,8,10,13,10,13,15,13,10,8,6,8 ] },
    { name:'Accumulate', bpm:128, root:130.81, scale:MAJOR, bassOct:0.5, leadOct:2,
      chords:[[5,9,12],[7,11,14],[4,7,11],[9,12,16]],          // F G Em Am
      kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      clap:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      bass:[0,_,_,0,_,_,0,_,0,_,_,0,_,_,12,_],
      arp: [0,_,1,_,2,_,3,_,0,_,1,_,2,_,4,_],
      lead:[
        7,_,_,5,_,_,7,_,9,_,_,7,_,_,5,_,
        4,_,_,6,_,_,8,_,6,_,_,4,_,_,_,_,
        9,_,_,6,_,_,4,_,2,_,_,4,_,_,6,_,
        5,_,_,7,_,_,9,_,7,_,_,5,_,_,[2,4],_ ] }
  ];
  const names=TRACKS.map(t=>t?t.name:'off');

  let n=null, cur=null, step=0, nextT=0, timer=null, playing=false, fadeT=null, nz=null;
  const semi=s=>Math.pow(2,s/12);
  const deg=(scale,d)=>scale[((d%7)+7)%7]+12*Math.floor(d/7);
  const level=()=>T.sound?Math.max(0,Math.min(100,T.musicVol))/100*0.55:0;

  // one bus per role, so the sidechain and the intensity filter each touch one node
  function ensure(){
    const a=ac();
    if(n&&n.a===a) return n;
    const comp=a.createDynamicsCompressor();
    comp.threshold.value=-18; comp.ratio.value=4; comp.attack.value=0.003; comp.release.value=0.15;
    comp.connect(musicOut(a));
    const master=a.createGain(); master.gain.value=0; master.connect(comp);
    const drums=a.createGain(); drums.gain.value=1; drums.connect(master);
    const duck=a.createGain(); duck.gain.value=1; duck.connect(master);
    const lp=a.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=600; lp.Q.value=0.9; lp.connect(duck);
    const leadG=a.createGain(); leadG.gain.value=0.6; leadG.connect(lp);
    nz=a.createBuffer(1,Math.floor(a.sampleRate*0.4),a.sampleRate);
    const d=nz.getChannelData(0);
    // Math.random on purpose, same reason as noiseBuf: this is built on first play
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    n={a,comp,master,drums,duck,lp,leadG};
    return n;
  }
  function noise(){ const s=n.a.createBufferSource(); s.buffer=nz; return s; }

  function kick(t){
    const a=n.a;
    const o=a.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(170,t); o.frequency.exponentialRampToValueAtTime(42,t+0.11);
    const g=a.createGain(); g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.38);
    o.connect(g); g.connect(n.drums); o.start(t); o.stop(t+0.4);
    const s=noise(); const hp=a.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1500;
    const g2=a.createGain(); g2.gain.setValueAtTime(0.35,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.02);
    s.connect(hp); hp.connect(g2); g2.connect(n.drums); s.start(t); s.stop(t+0.03);
    // sidechain: every synth dips under the kick and swells back, the pump in the pocket
    const dg=n.duck.gain;
    dg.setValueAtTime(1,t); dg.linearRampToValueAtTime(0.3,t+0.015); dg.linearRampToValueAtTime(1,t+0.2);
  }
  function clap(t){
    const a=n.a, s=noise();
    const bp=a.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1500; bp.Q.value=1;
    const g=a.createGain();
    g.gain.setValueAtTime(0.5,t);        g.gain.exponentialRampToValueAtTime(0.08,t+0.012);
    g.gain.setValueAtTime(0.5,t+0.014);  g.gain.exponentialRampToValueAtTime(0.08,t+0.026);
    g.gain.setValueAtTime(0.5,t+0.028);  g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    s.connect(bp); bp.connect(g); g.connect(n.drums); s.start(t); s.stop(t+0.22);
  }
  function hat(t,open){
    const a=n.a, s=noise();
    const hp=a.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=7500;
    const g=a.createGain(); g.gain.setValueAtTime(0.16,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+(open?0.22:0.045));
    s.connect(hp); hp.connect(g); g.connect(n.drums); s.start(t); s.stop(t+(open?0.24:0.06));
  }
  function bass(t,f,len){
    const a=n.a;
    const o=a.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
    const sub=a.createOscillator(); sub.type='sine'; sub.frequency.value=f;
    const lp=a.createBiquadFilter(); lp.type='lowpass'; lp.Q.value=2;
    lp.frequency.setValueAtTime(1600,t); lp.frequency.exponentialRampToValueAtTime(260,t+len);
    const g=a.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.32,t+0.006);
    g.gain.setValueAtTime(0.32,t+len*0.6); g.gain.exponentialRampToValueAtTime(0.0001,t+len);
    const gs=a.createGain(); gs.gain.setValueAtTime(0.18,t); gs.gain.exponentialRampToValueAtTime(0.0001,t+len);
    o.connect(lp); lp.connect(g); g.connect(n.duck);
    sub.connect(gs); gs.connect(n.duck);
    o.start(t); o.stop(t+len+0.02); sub.start(t); sub.stop(t+len+0.02);
  }
  function lead(t,f,len){
    const a=n.a, rel=t+len;
    const g=a.createGain();
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.11,t+0.008);
    g.gain.setValueAtTime(0.11,Math.max(t+0.008,rel-0.02)); g.gain.exponentialRampToValueAtTime(0.0001,rel+0.06);
    g.connect(n.leadG);
    [-11,0,11].forEach(c=>{
      const o=a.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.detune.value=c;
      o.connect(g); o.start(t); o.stop(rel+0.08);
    });
  }
  function arp(t,f,len){
    const a=n.a;
    const o=a.createOscillator(); o.type='square'; o.frequency.value=f;
    const lp=a.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2600;
    const g=a.createGain(); g.gain.setValueAtTime(0.08,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+Math.min(len,0.14));
    o.connect(lp); lp.connect(g); g.connect(n.lp); o.start(t); o.stop(t+0.16);
  }

  function scheduleStep(t,i){
    const tr=cur, s=i%16, chord=tr.chords[Math.floor(i/16)%4], dur=60/tr.bpm/4;
    if(tr.kick[s]) kick(t);
    if(tr.clap[s]) clap(t);
    if(tr.hat[s])  hat(t,tr.hat[s]===2);
    const b=tr.bass[s];
    if(b!=null) bass(t,tr.root*tr.bassOct*semi(chord[0]+b),dur*0.9);
    const L=tr.lead[i%64];
    if(L!=null){ const [d,len]=Array.isArray(L)?L:[L,1]; lead(t,tr.root*tr.leadOct*semi(deg(tr.scale,d)),dur*len); }
    const p=tr.arp[s];
    if(p!=null) arp(t,tr.root*tr.leadOct*semi(chord[p%3]+12*Math.floor(p/3)),dur*0.8);
  }
  // lookahead scheduler: keep 160ms of notes queued so a slow frame never gaps
  function pump(){
    const a=n.a;
    while(nextT<a.currentTime+0.16){ scheduleStep(nextT,step); step++; nextT+=60/cur.bpm/4; }
  }

  function play(idx){
    stop();
    const tr=TRACKS[idx|0];
    if(!tr||!T.sound) return;
    try{
      ensure();
      cur=tr; step=0; nextT=n.a.currentTime+0.05; playing=true;
      n.master.gain.cancelScheduledValues(0);
      n.master.gain.setValueAtTime(0,n.a.currentTime);
      n.master.gain.linearRampToValueAtTime(level(),n.a.currentTime+0.4);
      pump(); timer=setInterval(pump,40);
      keepSession(true);
    }catch(e){ playing=false; }
  }
  function stop(){
    if(timer) clearInterval(timer);
    if(fadeT) clearTimeout(fadeT);
    timer=null; fadeT=null; playing=false; cur=null;
    keepSession(false);
    if(n){ try{ n.master.gain.cancelScheduledValues(0); n.master.gain.setTargetAtTime(0,n.a.currentTime,0.02); }catch(e){} }
  }
  // death: let the bar it is in play out under a fade, then release the scheduler
  function fade(sec){
    if(!playing) return;
    try{ n.master.gain.cancelScheduledValues(0); n.master.gain.setTargetAtTime(0,n.a.currentTime,sec/3); }catch(e){}
    fadeT=setTimeout(stop,sec*1000);
  }
  // panel changes land live: a new track restarts, sound off kills it, volume follows
  function sync(){
    if(!playing) return;
    const want=TRACKS[T.music|0];
    if(!want||!T.sound){ stop(); return; }
    if(want!==cur){ play(T.music); return; }
    try{ n.master.gain.setTargetAtTime(level(),n.a.currentTime,0.05); }catch(e){}
  }
  // called once per drawn frame. Filter closed on the start gate, opens with the ramp
  function tick(){
    if(!playing||!S||fadeT) return;
    const x=!S.ready?0:Math.min(1,0.25+0.75*S.t/80);
    try{
      const t=n.a.currentTime;
      n.lp.frequency.setTargetAtTime(500*Math.pow(14,x),t,0.15);
      n.leadG.gain.setTargetAtTime(0.55+0.45*x,t,0.15);
      n.drums.gain.setTargetAtTime(0.6+0.4*x,t,0.15);
    }catch(e){}
  }
  return { names, play, stop, fade, sync, tick, get playing(){ return playing; } };
})();

// A hidden tab stops the RAF loop and freezes the run; the scheduler would keep
// going on the audio clock and play a minute of music over a frozen chart
try{
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) MUSIC.stop();
    else if(running&&S&&!S.over&&!window.TokenArcade?.paused) MUSIC.play(T.music);
  });
}catch(e){}

/* ---------- state ---------- */
const PAD_Y=()=>H-Math.max(110,H*0.19);

/* Paddle x is clamped to the play area and rounded to a whole pixel. The rounding is
   what makes a run recordable: the simulation only ever sees integers, so a recorded
   track is an exact record of the input rather than a lossy approximation of it, and
   a verifier re-simulating from that track lands on the identical score. Sub-pixel
   paddle precision is not perceptible and is not worth giving that up. */
function clampPad(x){ return Math.round(Math.max(S.pad.w/2,Math.min(W-S.pad.w/2,x))); }
let S=null;

/* Track codec. The paddle moves a few pixels per tick, so consecutive samples are
   tightly correlated: delta encode, zigzag so small negatives stay small, then
   varint. A 165s run at 120Hz is 19800 ticks and packs to a few KB rather than the
   ~40KB a raw Int16 dump would take. Lossless, because clampPad keeps every sample
   a whole number. tools/verify.js holds the matching decoder. */
function encodeTrack(a){
  const bytes=[];
  let prev=0;
  for(let i=0;i<a.length;i++){
    const d=a[i]-prev; prev=a[i];
    let z=d<0?(-d*2-1):(d*2);
    while(z>127){ bytes.push((z&127)|128); z>>>=7; }
    bytes.push(z);
  }
  let s='';
  for(let i=0;i<bytes.length;i+=4096) s+=String.fromCharCode.apply(null,bytes.slice(i,i+4096));
  return btoa(s);
}

function newGame(seed){
  // one seed per run drives both streams, so a run is reproducible from this number alone
  const sd = (seed==null ? newSeed() : (seed>>>0));
  rng  = mulberry32(sd);
  vrng = mulberry32((sd^0x9E3779B9)>>>0);
  S={
    seed:sd,
    t:0, steps:0, over:false, dying:0, ready:false, idleT:0, track:[],
    head:{x:0,y:240,vx:T.vx,vy:0,r:7},
    spd:1, eng:1, armed:true, chain:0, lastBid:-9, mile:0,
    base:0, baseT:0,
    cam:{x:-W*0.45, y:0, sx:T.vx, shake:0},
    pad:{x:W/2, w:T.padW, flash:0, hit:0},
    trail:[], support:[], marks:[], pops:[], parts:[],
    mcap:812400, ath:812400, cap:812400, climb:0, mult:1, multT:0, shield:false,
    buys:0, streak:0, best:0, topMult:1,
    pickups:[], nextDrop:2, lastPickX:0,
    tickets:0, ticketsOut:0, lastTicketT:-9,
    warn:0, dumpFlash:0, flashGood:0
  };
  S.cam.y=S.base+PAD_Y();
}

/* ---------- helpers ---------- */
const sx=x=>x-S.cam.x, sy=y=>S.cam.y-y;
function money(v){
  if(v>=1e12) return '$'+(v/1e12).toFixed(2)+'T';
  if(v>=1e9) return '$'+(v/1e9).toFixed(2)+'B';
  if(v>=1e6) return '$'+(v/1e6).toFixed(2)+'M';
  if(v>=1e3) return '$'+(v/1e3).toFixed(0)+'K';
  return '$'+Math.max(0,Math.round(v));
}
function pop(x,y,text,col){ S.pops.push({x,y,text,col,life:1}); }
/* Second deliberate holdout on engine-dependent math, alongside clickSound.
   Particles are visual only: update() integrates them, draw() renders them, and
   nothing reads them back into scoring. The determinism fingerprint takes
   S.parts.length, which is set by the rng() draws above rather than by these
   values, so Math.cos and Math.sin cannot move a claim from here. The rng()
   calls themselves stay on the simulation stream and must not be moved. */
function burst(x,y,col,n){
  for(let i=0;i<(n||14);i++){
    const a=rng()*Math.PI*2, s=60+rng()*260;
    S.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,col});
  }
}

/* ---------- pickups ---------- */
const KINDS=[
  {id:'rbid',label:'BID',   col:()=>'#6fe37a', w:30},
  {id:'lev', label:'2X',    col:()=>C('--accent'), w:34},
  {id:'bid', label:'WHALE', col:()=>C('--good'),   w:52},
  {id:'dump',label:'DUMP',  col:()=>C('--danger'), w:44},
  {id:'hold',label:'HOLD',  col:()=>'#7fe6ff',     w:44},
  // Tickets draw bigger than the other pickups because their catch box is
  // bigger. A target that grabs from further than it looks reads as the game
  // being loose with its own rules, so the box and the art move together.
  {id:'tick',label:'TICKET',col:()=>'#ffc93c',     w:98, h:34}
];

/* Tickets are the second objective and they do not come out of the random
   pickup weighting. Exactly TICKET_AT.length exist in a run, one released as the
   clock passes each mark, so the maximum is fixed by design rather than by how
   long a player is willing to sit there. The back half lands inside the late
   ramp on purpose: the last three are meant to be taken under a button that is
   still narrowing.

   The marks have to fit inside a run that actually happens. The first schedule
   put the tenth mark at 168s, past where any run ends, so nobody ever reached
   tickets eight through ten and the ceiling of 10 was decorative. Playtest
   confirmed it: 5 seen in 80 seconds.

   All ten are now out by 94s, which splits a run into two phases on purpose.
   Up to 94s both objectives are live and compete for the same input. After it
   the tickets are settled and the only thing left is score, under a button that
   is still closing. Draw weight stays reachable for a mid-length run while the
   leaderboard keeps rewarding the endurance nobody else is doing. */
const TICKET_AT=[4,10,17,25,34,44,55,67,80,94];
const TICKET_MAX=TICKET_AT.length;
function spawnPickup(){
  const diff=Math.min(1,S.t/95);
  const r=rng();
  let id;
  if(r<0.44) id='rbid';
  else if(r<0.62) id='lev';
  else if(r<0.74) id='bid';
  else if(r<0.74+0.18*diff) id='dump';
  else if(!S.shield && r>0.93) id='hold';
  else id='rbid';
  if(id==='dump' && S.t<14) id='rbid';

  const k=KINDS.find(z=>z.id===id);
  const ahead=300+rng()*420;
  // Money pickups take the top of the ball's arc and a stretch above it, so
  // climbing to them means launching off the button edge rather than coasting.
  // Tickets own the low third. Raised from base+90..300, which overlapped the
  // ticket band and left the upper half of the screen empty.
  const hi=S.base+150+rng()*230;

  if(id==='rbid'){
    // retail bids arrive in clusters so you can chain the bounces
    const n=1+Math.floor(rng()*3);
    const stepX=54+rng()*40;
    const stepY=(rng()*2-1)*38;
    for(let i=0;i<n;i++){
      S.pickups.push({k,x:S.head.x+ahead+i*stepX,y:hi+i*stepY,got:false,born:S.t});
    }
  } else {
    S.pickups.push({k,x:S.head.x+ahead,y:hi,got:false,born:S.t});
  }
}

/* ---------- bounce ---------- */
function doBounce(off){
  const a=Math.abs(off);
  S.buys++; S.streak++; S.best=Math.max(S.best,S.streak);
  const diff=Math.min(1,S.t/95)*T.ramp;
  const gain=T.bounce*(1+0.30*a)*(1+0.06*diff);
  S.eng=Math.max(0.62,Math.min(1.46, 1+0.40*off));

  // volatility: every bounce carries a move the player has to read and answer
  const big=rng()<0.16;
  const vol=1+(rng()*2-1)*(big?0.52:0.26);
  S.head.vy=gain*(1+(rng()*2-1)*0.12);
  S.head.vx=Math.max(70,T.vx*S.spd*S.eng*vol);
  if(big){
    pop(sx(S.head.x), sy(S.base)-46, vol>1?'BREAKOUT':'CHOP', vol>1?C('--good'):'#ffb020');
    S.cam.shake=Math.max(S.cam.shake,6);
  }
  S.baseT+=26+34*a+16*diff;
  const b=1+a*1.4;
  pop(sx(S.head.x), sy(S.base)-26, a>0.62?('EDGE '+b.toFixed(1)+'x'):arcadeLabel('event.bounce','BUY'), a>0.62?C('--accent'):'#cfd4c4');
  // every catch adds altitude. edge hits add more, leverage doubles the step.
  S.climb+=(1+0.8*a)*S.mult;
  S.pad.flash=1; S.pad.hit=1; S.cam.shake=Math.min(9,3+a*7);
  S.flashGood=0.35;
  burst(sx(S.head.x),sy(S.base),C('--accent'),6+Math.round(a*10));
  SFX.tap.play(0.45+a*0.3, ()=>clickSound(0.13+a*0.07, 0.92+a*0.26));
  if(S.buys%2===0 || S.pickups.length<4) spawnPickup();
}

function die(){
  if(S.shield){
    S.shield=false; S.streak=0;
    S.head.y=S.base+2; S.head.vy=T.bounce*0.95; S.baseT+=10; S.armed=false;
    pop(sx(S.head.x),sy(S.base)-30,'DIAMOND HANDS','#7fe6ff');
    burst(sx(S.head.x),sy(S.base),'#7fe6ff',24);
    blip(880,0.22,'sine',0.07);
    S.cam.shake=8;
    return;
  }
  S.over=true; S.dying=0; S.cam.shake=22;
  MUSIC.fade(1.1);
  blip(120,0.5,'sawtooth',0.08);
  setTimeout(()=>blip(70,0.7,'sawtooth',0.07),120);
}

/* ---------- update ---------- */
function update(dt){
  const h=S.head;

  // The run is frozen until the player takes hold of the button. Starting the drop
  // the instant the menu closes gave roughly 0.4s of reaction time, which is no time
  // at all on a rematch. Nothing advances here: no clock, no gravity, no camera, so
  // the player sets up at their own pace. Taking the button is the existing drag
  // input, so this adds no second control.
  if(!S.ready){
    S.idleT+=dt;
    S.pad.x=clampPad(S.pad.x);
    return;
  }

  // Record the paddle before physics reads it, so track[i] is exactly the input tick
  // i saw. Paddle x is the entire control scheme, so this plus the seed is a complete
  // description of the run.
  S.track.push(S.pad.x);

  S.steps++;
  S.t+=dt;

  if(S.over){
    S.dying+=dt;
    h.vy-=T.g*2.6*dt; h.y+=h.vy*dt; h.x+=h.vx*0.55*dt;
    S.cam.x+=S.cam.sx*0.5*dt;
    const lt2=S.trail[S.trail.length-1];
    if(!lt2 || Math.abs(h.y-lt2.y)>14) S.trail.push({x:h.x,y:h.y,n:(rng()*2-1)*1.6,w:false});
    if(S.dying>0.9 && !S.shown){ S.shown=true; showOver(); }
    S.cam.shake*=0.9;
    return;
  }

  // slow global speed ramp, roughly doubles over four minutes
  S.spd=1+Math.min(1.15,(S.t/240)*T.ramp);

  // support line climbs toward target
  S.base+=(S.baseT-S.base)*Math.min(1,dt*7);

  // leverage timer
  if(S.multT>0){ S.multT-=dt; if(S.multT<=0){ S.mult=1; pop(sx(h.x),sy(h.y)-24,'LEVERAGE OFF','#8a8f80'); } }

  const gNow=T.g*(S.mult>1?1.34:1);
  const prevY=h.y;
  h.vy-=gNow*dt;
  h.y+=h.vy*dt;
  h.x+=h.vx*dt;

  // score is one quantity, climb, put through one transform. nothing compounds.
  // Math.pow is engine-dependent and this feeds the claim, so square-and-multiply
  // the literal exponent 5 out of specified arithmetic instead. See dsin.
  const cb=1+Math.max(0,S.climb)/73, cb2=cb*cb;
  S.cap=812400*cb2*cb2*cb;
  const lift=Math.max(-0.9,Math.min(1.7,(h.y-S.base)/340));
  S.mcap=Math.max(40000,S.cap*(1+0.18*lift));
  if(S.mcap>S.ath) S.ath=S.mcap;

  // market cap milestones
  const MILES=[1e7,5e7,1e8,5e8,1e9,1e10,1e11,1e12];
  while(S.mile<MILES.length && S.ath>=MILES[S.mile]){
    const m=MILES[S.mile]; S.mile++;
    pop(W/2, H*0.34, money(m), C('--accent'));
    S.flashGood=0.6;
    SFX.milestone.play(0.7, ()=>fanfare(0.075));
  }

  // camera: advance at smoothed speed, correct so the head stays readable
  const wander=1+0.11*dsin(S.t*0.62)+0.06*dsin(S.t*1.47+1.3);
  S.cam.sx+=((T.vx*S.spd*wander)-S.cam.sx)*Math.min(1,dt*1.6);
  const scr=sx(h.x);
  let corr=0;
  if(scr>W*0.80) corr=(scr-W*0.80)*3.2;
  if(scr<W*0.18) corr=(scr-W*0.18)*3.2;
  S.cam.x+=(S.cam.sx+corr)*dt;
  S.cam.y+= ((S.base+PAD_Y())-S.cam.y)*Math.min(1,dt*9);

  // trail sampled at fixed intervals so it reads as ticks, not a smooth curve
  const lt=S.trail[S.trail.length-1];
  if(!lt || Math.abs(h.x-lt.x)>=3.5 || Math.abs(h.y-lt.y)>=14){
    const spike=rng()<0.11;
    S.trail.push({x:h.x,y:h.y,n:(rng()*2-1)*(spike?2.6:1),w:spike});
    if(S.trail.length>1600) S.trail.shift();
  }
  const lastS=S.support[S.support.length-1];
  if(!lastS || h.x-lastS.x>6){ S.support.push({x:h.x,y:S.base}); if(S.support.length>500) S.support.shift(); }

  // arm the buy line once the chart is clearly above it
  if(h.y>S.base+12) S.armed=true;

  // failsafe: nothing may ever end up below the line without resolving
  if(h.y<S.base-70 && !S.over){ S.streak=0; S.armed=false; S.shield=false; die(); }

  if(S.armed && h.y<=S.base && h.vy<0){
    S.armed=false;
    const half=S.pad.w/2+h.r;
    const d=sx(h.x)-S.pad.x;
    if(Math.abs(d)<=half){
      h.y=S.base+2;
      doBounce(Math.max(-1,Math.min(1,d/(S.pad.w/2))));
      S.marks.push({x:h.x,y:S.base});
      if(S.marks.length>200) S.marks.shift();
    } else {
      S.streak=0;
      die();
    }
  }

  // pickups
  for(const p of S.pickups){
    if(p.got) continue;
    // Tickets get a wide, shallow catch box. The button has to stay under the
    // ball, so you steer by bounce angle over several bounces and cannot simply
    // chase a point 500px ahead. A wide box turns the ask into "be low when you
    // pass this", which is a choice the player can actually execute, and staying
    // low is what costs climb.
    // Tightened from 92x44 once tickets moved onto the ball's real path. The wide
    // box was compensating for tickets sitting somewhere the ball could not go.
    const rx=p.k.id==='tick'?58:26, ry=p.k.id==='tick'?36:26;
    if(Math.abs(h.x-p.x)<rx && Math.abs(h.y-p.y)<ry){
      p.got=true;
      if(p.k.id==='rbid'){
        S.chain=(S.t-S.lastBid<1.1)?S.chain+1:1; S.lastBid=S.t;
        h.vy=Math.max(h.vy,0)+T.bounce*0.52;
        S.climb+=0.5*Math.min(5,S.chain)*S.mult;
        pop(sx(p.x),sy(p.y),arcadeLabel('event.rbid','BID')+(S.chain>1?' x'+S.chain:''),'#6fe37a');
        burst(sx(p.x),sy(p.y),'#6fe37a',9);
        blip(560+S.chain*90,0.07,'square',0.045);
      }
      if(p.k.id==='lev'){ S.mult=2; S.multT=8; S.topMult=Math.max(S.topMult,2); pop(sx(p.x),sy(p.y),arcadeLabel('event.lev','LEVERAGE 2X'),C('--accent')); burst(sx(p.x),sy(p.y),C('--accent'),20); blip(660,0.14,'square',0.06); }
      if(p.k.id==='bid'){ h.vy=Math.max(h.vy,0)+T.bounce*1.78; S.climb+=8; pop(sx(p.x),sy(p.y),arcadeLabel('event.bid','WHALE BUY'),C('--good')); burst(sx(p.x),sy(p.y),C('--good'),34); SFX.woo.play(0.7, ()=>swoop(0.11)); S.flashGood=0.7; S.cam.shake=Math.max(S.cam.shake,10); }
      if(p.k.id==='dump'){ const room=Math.max(0,h.y-S.base); h.vy=-T.bounce*(room>230?1.15:0.7); S.climb=Math.max(0,S.climb-4); S.dumpFlash=0.55; pop(sx(p.x),sy(p.y),arcadeLabel('event.dump','WHALE SELL'),C('--danger')); burst(sx(p.x),sy(p.y),C('--danger'),26); blip(150,0.25,'sawtooth',0.07); S.cam.shake=12; }
      if(p.k.id==='hold'){ S.shield=true; pop(sx(p.x),sy(p.y),'DIAMOND HANDS','#7fe6ff'); burst(sx(p.x),sy(p.y),'#7fe6ff',20); blip(760,0.16,'triangle',0.06); }
      // A ticket pays no climb. The only assist is enough lift to get back out of
      // the dive, which is deliberately less than a BID: you keep the ticket and
      // you eat the height you spent reaching it.
      if(p.k.id==='tick'){ S.tickets++; h.vy=Math.max(h.vy,0)+T.bounce*0.45; pop(sx(p.x),sy(p.y),arcadeLabel('event.tick','TICKET')+' '+S.tickets+'/'+TICKET_MAX,'#ffc93c'); burst(sx(p.x),sy(p.y),'#ffc93c',24); blip(880,0.13,'triangle',0.06); S.flashGood=0.5; }
    }
  }
  S.pickups=S.pickups.filter(p=>!p.got && p.x>S.cam.x-80);
  // Density was capped at 2 on screen, which is where the empty field came from.
  if(S.pickups.length<4 && rng()<dt*1.6) spawnPickup();

  // Release the next ticket as its mark passes.
  //
  // Tickets sit at the BOTTOM of the ball's arc, not below it. The first version
  // put them at base+28..82, which renders at or under the button line: the ball
  // bounces off the button and never goes below it, so those tickets were not
  // hard, they were unreachable. Measured, the ball's own band is base+84 to
  // base+193. Tickets take the low third of that; the money pickups take the top
  // and above. That is the trade, and both halves are now actually in play.
  //
  // A mark coming due is permission to release, not an obligation. A WHALE BUY
  // launches the ball 700px above its normal band, and a ticket dealt during
  // that flight scrolls past underneath while the player can do nothing about
  // it. That is not a missed ticket, it is an impossible one, and on a paid
  // draw the difference matters.
  //
  // So the release waits for the ball to be somewhere it could actually take
  // the thing. Deferral is short, because gravity, and it never skips a ticket:
  // the mark stays due until it is dealt. Missing a ticket you were in position
  // for still costs you, which is the part worth keeping.
  if(S.ticketsOut<TICKET_MAX && S.t>=TICKET_AT[S.ticketsOut]
     && h.y-S.base<300 && S.t-S.lastTicketT>=3){
    const k=KINDS.find(z=>z.id==='tick');
    S.pickups.push({k,x:h.x+280+rng()*190,y:S.base+95+rng()*55,got:false,born:S.t});
    S.ticketsOut++; S.lastTicketT=S.t;
  }

  // telegraph incoming dump
  S.warn=0;
  for(const p of S.pickups){ if(p.k.id==='dump' && p.x-h.x<420) S.warn=1; }

  // decay
  S.pad.flash=Math.max(0,S.pad.flash-dt*4);
  S.pad.hit=Math.max(0,S.pad.hit-dt*4.5);
  S.cam.shake*=0.86;
  S.dumpFlash=Math.max(0,S.dumpFlash-dt*1.6);
  S.flashGood=Math.max(0,S.flashGood-dt*2);
  for(const p of S.pops){ p.life-=dt*1.1; p.y-=dt*38; }
  S.pops=S.pops.filter(p=>p.life>0);
  for(const p of S.parts){ p.life-=dt*1.7; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=520*dt; }
  S.parts=S.parts.filter(p=>p.life>0);

  // Difficulty: the button narrows, in two phases.
  //
  // Phase one, 0 to 110s, is the original curve and is unchanged: 108px down to
  // 71.3px. Phase two used to not exist. The curve saturated there and the game
  // stopped getting harder forever, so a steady hand ran until it got bored
  // rather than until it died. Measured: 24 of 30 headless runs survived 320s.
  //
  // Phase two keeps taking width off at T.late px per second with no plateau,
  // down to a hard floor. Every run now ends. Width is the right knob because it
  // is the one the player can see: the button visibly closes, so the squeeze
  // telegraphs itself instead of reading as the game turning on them.
  // Phase one saturated at 110s, but measured runs end around 112s, so the late
  // ramp was vestigial and nobody ever felt the squeeze. Pulled in to 80s so the
  // narrowing lands inside a run that actually happens.
  const diff=Math.min(1,S.t/80)*T.ramp;
  const late=Math.max(0,S.t-80)*T.late*T.ramp;
  S.pad.w=Math.max(T.padMin,T.padW*(1-0.34*diff)-late);
  S.pad.x=clampPad(S.pad.x);
}

/* ---------- render ---------- */
function draw(){
  const acc=C('--accent'), bg=C('--bg');
  const shX=(vrng()-0.5)*S.cam.shake, shY=(vrng()-0.5)*S.cam.shake;
  ctx.save(); ctx.translate(shX,shY);

  ctx.fillStyle=bg; ctx.fillRect(-40,-40,W+80,H+80);

  // grid, scrolls with camera
  const gs=54;
  ctx.strokeStyle=C('--grid'); ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=-((S.cam.x%gs)+gs)%gs;x<W+gs;x+=gs){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y=((S.cam.y%gs)+gs)%gs;y<H+gs;y+=gs){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();

  const py=sy(S.base);

  // rising support trendline
  if(S.support.length>1){
    ctx.strokeStyle='rgba(204,255,0,0.22)'; ctx.lineWidth=1.5; ctx.setLineDash([5,7]);
    ctx.beginPath();
    let started=false;
    for(const p of S.support){ const X=sx(p.x); if(X<-60) continue; const Y=sy(p.y); if(!started){ctx.moveTo(X,Y);started=true;} else ctx.lineTo(X,Y); }
    ctx.lineTo(W+40,py);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // buy line across the screen
  ctx.strokeStyle='rgba(204,255,0,0.13)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W,py); ctx.stroke();

  // pickups
  for(const p of S.pickups){
    const X=sx(p.x), Y=sy(p.y);
    if(X<-60||X>W+80) continue;
    const col=p.k.col();
    const pulse=0.6+0.4*Math.sin(S.t*7+p.x*0.01);
    ctx.globalAlpha=p.k.id==='dump'?pulse:1;
    ctx.fillStyle=col;
    const w=p.k.w,hh=p.k.h||19;
    ctx.beginPath(); ctx.roundRect(X-w/2,Y-hh/2,w,hh,5); ctx.fill();
    ctx.globalAlpha=1;
    ctx.fillStyle='#000'; ctx.font='800 10px '+C('--mono'); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(arcadeLabel('pickup.'+p.k.id,p.k.label),X,Y+0.5);
  }

  // price line: angular joins, baked noise, wicks on spike ticks
  if(S.trail.length>1){
    const lineCol=S.over?C('--danger'):acc;
    const amp=T.noise;
    ctx.lineJoin='miter'; ctx.miterLimit=2; ctx.lineCap='butt';

    // soft underlay reads as chart glow without rounding the shape
    ctx.globalAlpha=0.13; ctx.strokeStyle=lineCol; ctx.lineWidth=7;
    ctx.beginPath();
    let st=false;
    for(const p of S.trail){ const X=sx(p.x); if(X<-50) continue; const Y=sy(p.y)+p.n*amp; if(!st){ctx.moveTo(X,Y);st=true;} else ctx.lineTo(X,Y); }
    ctx.stroke(); ctx.globalAlpha=1;

    // wicks
    ctx.strokeStyle=lineCol; ctx.globalAlpha=0.42; ctx.lineWidth=1;
    ctx.beginPath();
    for(const p of S.trail){
      if(!p.w) continue;
      const X=sx(p.x); if(X<-50||X>W+40) continue;
      const Y=sy(p.y)+p.n*amp, k=4+Math.abs(p.n)*amp*1.4;
      ctx.moveTo(X,Y-k); ctx.lineTo(X,Y+k);
    }
    ctx.stroke(); ctx.globalAlpha=1;

    // the line itself
    ctx.strokeStyle=lineCol; ctx.lineWidth=2;
    ctx.beginPath();
    st=false;
    for(const p of S.trail){ const X=sx(p.x); if(X<-50) continue; const Y=sy(p.y)+p.n*amp; if(!st){ctx.moveTo(X,Y);st=true;} else ctx.lineTo(X,Y); }
    ctx.stroke();
  }

  // higher-low markers
  ctx.fillStyle='rgba(204,255,0,0.85)';
  for(const m of S.marks){ const X=sx(m.x); if(X<-20||X>W+20) continue; ctx.fillRect(X-1.5,sy(m.y)-1.5,3,3); }

  // head: chart cursor plus a live price line running to the right edge
  const hX=sx(S.head.x), hY=sy(S.head.y), hc=S.over?C('--danger'):acc;
  ctx.strokeStyle=hc; ctx.globalAlpha=0.30; ctx.lineWidth=1; ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(hX,hY); ctx.lineTo(W,hY); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha=1;
  ctx.shadowBlur=16; ctx.shadowColor=hc;
  const hd=HEADS[T.head|0];
  if(hd&&hd.ok){
    // mascot: noses up on the way up and down on the fall, capped so it never rolls.
    // vy is positive upward and canvas rotation is clockwise, hence the sign.
    const sz=30, tilt=Math.max(-0.45,Math.min(0.45,-S.head.vy/1400));
    ctx.save(); ctx.translate(hX,hY); ctx.rotate(tilt);
    ctx.drawImage(hd.img,-sz/2,-sz/2,sz,sz);
    ctx.restore();
  } else {
    ctx.fillStyle=hc; ctx.fillRect(hX-4,hY-4,8,8);
  }
  ctx.shadowBlur=0;

  // off-screen tracker: keeps the whale flight fair while it is above the viewport
  if(hY<86 && !S.over){
    const alt=Math.round(S.head.y-S.base);
    ctx.fillStyle=hc; ctx.globalAlpha=0.9;
    ctx.beginPath(); ctx.moveTo(hX,88); ctx.lineTo(hX-7,100); ctx.lineTo(hX+7,100); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=0.55; ctx.font='700 9px '+C('--mono'); ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('+'+alt,hX,104);
    ctx.globalAlpha=1;
  }

  // particles
  for(const p of S.parts){ ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.col; ctx.fillRect(p.x-1.5,p.y-1.5,3,3); }
  ctx.globalAlpha=1;

  // BUY button
  if(!S.over){
    const w=S.pad.w, hh=44, X=S.pad.x-w/2, Y=py+10-S.pad.hit*4;
    if(USE_BRAND && artOK){
      const iw=w*1.30, ih=iw*(IMG.hous.naturalHeight/IMG.hous.naturalWidth);
      const X0=S.pad.x-iw/2, Y0=Y+hh/2-ih/2;
      const travel=ih*0.055*S.pad.hit;
      ctx.drawImage(IMG.hous,X0,Y0,iw,ih);
      if(S.pad.flash>0){ ctx.shadowBlur=24*S.pad.flash; ctx.shadowColor=acc; }
      ctx.drawImage(IMG.cap,X0,Y0+travel,iw,ih);
      ctx.shadowBlur=0;
      ctx.drawImage(IMG.lip,X0,Y0,iw,ih);
    } else {
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.roundRect(X,Y+6,w,hh,12); ctx.fill();
      ctx.fillStyle=C('--accent2');
      ctx.beginPath(); ctx.roundRect(X,Y+5,w,hh,12); ctx.fill();
      ctx.fillStyle=acc;
      ctx.shadowBlur=S.pad.flash*26; ctx.shadowColor=acc;
      ctx.beginPath(); ctx.roundRect(X,Y-S.pad.flash*2,w,hh,12); ctx.fill();
      ctx.shadowBlur=0;
      ctx.fillStyle='#000'; ctx.font='800 18px '+C('--sans'); ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.letterSpacing='2px';
      ctx.fillText(arcadeLabel('button','BUY'),S.pad.x,Y+hh/2-S.pad.flash*2);
      ctx.letterSpacing='0px';
    }
  }

  // floating labels
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const p of S.pops){
    ctx.globalAlpha=Math.max(0,Math.min(1,p.life));
    ctx.fillStyle=p.col; ctx.font='800 12px '+C('--mono');
    ctx.fillText(p.text,p.x,p.y);
  }
  ctx.globalAlpha=1;

  ctx.restore();

  // full screen tints
  if(S.dumpFlash>0){ ctx.fillStyle='rgba(255,59,48,'+(S.dumpFlash*0.3)+')'; ctx.fillRect(0,0,W,H); }
  if(S.flashGood>0){ ctx.fillStyle='rgba(204,255,0,'+(S.flashGood*0.07)+')'; ctx.fillRect(0,0,W,H); }
  if(S.over){ ctx.fillStyle='rgba(255,59,48,0.10)'; ctx.fillRect(0,0,W,H); }

  // dump warning band
  if(S.warn && !S.over){
    const a=0.35+0.35*Math.sin(S.t*11);
    ctx.fillStyle='rgba(255,59,48,'+a+')'; ctx.fillRect(0,0,W,3);
  }

  // waiting for the player to take the button. idleT drives the pulse because the
  // run clock S.t is deliberately frozen until then.
  if(!S.ready && !S.over){
    const pulse=0.62+0.38*Math.sin(S.idleT*3.4);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.globalAlpha=pulse;
    ctx.fillStyle=C('--accent');
    ctx.font='900 15px '+C('--mono');
    ctx.letterSpacing='3px';
    ctx.fillText('GRAB THE BUTTON TO START', W/2, PAD_Y()-52);
    ctx.letterSpacing='0px';
    ctx.globalAlpha=1;
  }
}

/* ---------- hud ---------- */
const elM=document.getElementById('mcap'), elA=document.getElementById('ath'), elP=document.getElementById('pills');
function hud(){
  elM.textContent=money(S.mcap);
  elA.textContent=money(S.ath);
  let h='';
  // Tickets sit first and are always shown, including at 0/10. The second
  // objective only works as an objective if the player can see it going up.
  h+='<span class="pill ticket'+(S.tickets>0?' on':'')+'">'+(ARCADE?'ORBS ':'TICKETS ')+S.tickets+'/'+TICKET_MAX+'</span>';
  h+='<span class="pill'+(S.streak>2?' on':'')+'">STREAK '+S.streak+'</span>';
  if(S.mult>1) h+='<span class="pill on">2X &middot; '+S.multT.toFixed(1)+'s</span>';
  if(S.shield) h+='<span class="pill shield">DIAMOND HANDS</span>';
  if(S.warn) h+='<span class="pill warn">SELL INCOMING</span>';
  elP.innerHTML=h;
}

/* ---------- loop ---------- */
let last=0, running=false, arcadeFrame=0, arcadeDestroyed=false;

/* Fixed timestep. update() only ever receives STEP, so the simulation advances in
   identical increments on a 60Hz laptop and a 240Hz monitor. Before this, dt came
   straight off the frame clock, which meant physics, catch precision and the pickup
   spawn roll all varied with refresh rate and with any stutter.

   STEP is 1/120: two sub-steps per frame at 60Hz. Finer than the old ~1/60 dt, so the
   chart travels less distance between collision samples and the S.armed catch window
   resolves more precisely.

   MAX_FRAME clamps a single frame delta. Without it, returning to a backgrounded tab
   hands the loop a delta of many seconds and the game fast-forwards through it.
   MAX_STEPS then caps sub-steps per frame so a machine too slow to keep up drops
   simulation time instead of spiralling: each frame would otherwise queue more work
   than it can finish, making the next delta larger still. */
const STEP=1/120, MAX_FRAME=0.25, MAX_STEPS=16;
let acc=0;

function loop(ts){
  if(!running||arcadeDestroyed) return;
  if(window.TokenArcade?.paused){ last=ts; draw(); hud(); arcadeFrame=requestAnimationFrame(loop); return; }
  let frame=(ts-last)/1000||0; last=ts;
  if(frame<0) frame=0;
  if(frame>MAX_FRAME) frame=MAX_FRAME;
  acc+=frame;

  let n=0;
  while(acc>=STEP && n<MAX_STEPS){
    update(STEP); acc-=STEP; n++;
    // showOver() clears running from inside update(). Without this break the rest of
    // the batch keeps stepping a finished run, so the final tick count depends on
    // frame cadence: 3 extra ticks at 30Hz, none at 60Hz. A replay verifier stepping
    // a recorded track would then disagree with the client about where the run ended.
    if(!running) break;
  }
  if(n>=MAX_STEPS) acc=0;   // too far behind to catch up, drop the backlog

  draw(); hud(); MUSIC.tick();
  arcadeFrame=requestAnimationFrame(loop);
}

/* ---------- input ---------- */
let dragging=false;
function setPad(x){
  if(!S) return;
  // The source game freezes simulation until the first grip. Issue the bridge's
  // run-start event at that same point so its timer covers actual play only.
  if(ARCADE&&!S.ready&&!window.TokenArcade.beginRun()) return;
  S.pad.x=clampPad(x);
  // first contact with the button releases the chart
  S.ready=true;
}
// every touch is another chance to unlock audio on a phone that refused the first
function wakeAudio(){ try{ if(AC&&AC.state!=='running') AC.resume(); }catch(e){} }
cv.addEventListener('pointerdown',e=>{dragging=true;setPad(e.clientX);wakeAudio();});
cv.addEventListener('pointermove',e=>{if(dragging)setPad(e.clientX);});
window.addEventListener('pointerup',()=>{dragging=false;wakeAudio();});
window.addEventListener('pointercancel',()=>dragging=false);
window.addEventListener('keydown',e=>{
  if(!S) return;
  if(e.key==='ArrowLeft') setPad(S.pad.x-34);
  if(e.key==='ArrowRight') setPad(S.pad.x+34);
});

/* ---------- modes and the server seam ---------- */
/* Every call that will hit the backend lives here and nowhere else, so wiring the
   real endpoints is a change to this block alone. Contract is in CLAUDE.md.

   DAILY plays a server-issued seed, three attempts a day, best score counts.
   FREE  rolls a seed locally, unlimited, all-time board only.

   The daily seed is deliberately never in the page before an attempt is spent. Once
   the client holds it, a player can rehearse the exact whale and dump placements and
   submit only their best. That is why there is no "fetch today's seed on load" path
   here: asking for the seed IS spending the attempt. Do not add caching in front of
   startDaily() for the same reason.

   Until the backend exists, OFFLINE fills in: it derives a per-day seed on the client
   so the daily is playable in dev, and reports its attempts as unenforced. Nothing
   here is a security boundary. The server counts attempts and re-simulates every
   submission with tools/verify.js, because both counters and scores are editable in
   the page. */
const API='/api';
const MODE={ DAILY:'daily', FREE:'free', WINDOW:'window' };
/* dailyLeft belongs to the day, not to the current run, so free play must never
   touch it. Clearing it on a mode switch made the menu re-offer a daily attempt the
   player had already spent, which the server would then reject. */
let mode=MODE.DAILY, attemptId=null, dailyLeft=null, dayKey=null, offline=false;

function utcDay(d){
  d=d||new Date();
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
}
// dev-only stand-in for the server: stable per UTC day, same for everyone
function offlineDailySeed(day){
  let h=2166136261>>>0;
  for(let i=0;i<day.length;i++){ h^=day.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}

async function startDaily(){
  try{
    const r=await fetch(API+'/daily/start',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    if(!r.ok) throw new Error('http '+r.status);
    const j=await r.json();
    offline=false; attemptId=j.attemptId; dailyLeft=j.attemptsLeft; dayKey=j.day;
    return j.seed>>>0;
  }catch(e){
    // no backend yet, or it is down: play the day locally and rank nothing
    offline=true; attemptId=null; dailyLeft=null; dayKey=utcDay();
    return offlineDailySeed(dayKey);
  }
}

/* ---------- the window ----------
   A bounded event with wallet-gated entry. The server says whether one is open;
   the client only ever paints what it is told. win is the current window (open or
   just closed), winMine is this wallet's standing in it, winLeft mirrors dailyLeft. */
let win=null, winMine=null, winLeft=null, clockSkew=0;

async function loadWindow(){
  try{
    const r=await fetch(API+'/window/state',{cache:'no-store'});
    if(!r.ok) throw new Error('http '+r.status);
    const j=await r.json();
    win=j.window||null; winMine=j.mine||null;
    winLeft = winMine ? winMine.attemptsLeft : null;
    if(j.now) clockSkew=Date.parse(j.now)-Date.now();
  }catch(e){ win=null; winMine=null; winLeft=null; }
  paintWallet(); paintMode();
}

// Entry needs a wallet. Without one the button doubles as connect, so the path is
// tap, sign, tap again, rather than a dead button with a note under it.
async function startWindow(){
  const r=await fetch(API+'/window/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({windowId:win&&win.id})});
  const j=await r.json().catch(()=>null);
  if(r.status===401){ throw Object.assign(new Error('wallet'),{code:'wallet'}); }
  if(!r.ok||!j||j.seed==null){
    winLeft = j&&j.state==='exhausted' ? 0 : winLeft;
    if(j&&j.state==='closed'){ win=win?Object.assign({},win,{open:false}):null; }
    throw Object.assign(new Error((j&&j.error)||('http '+r.status)),{code:(j&&j.state)||'error'});
  }
  offline=false; attemptId=j.attemptId; winLeft=j.attemptsLeft;
  return j.seed>>>0;
}

function closesIn(){
  if(!win) return '';
  const ms=Date.parse(win.closes)-(Date.now()+clockSkew);
  if(ms<=0) return 'closed';
  const h=Math.floor(ms/3600e3), m=Math.floor(ms%3600e3/60e3);
  return 'closes in '+(h>=48?Math.floor(h/24)+'d':h>0?h+'h '+m+'m':m+'m');
}

/* The submittable record of a run. Seed plus paddle track fully determines the
   outcome, so everything below `track` is a claim the verifier recomputes rather than
   trusts. w and h are part of the input: the play area bounds the paddle and the
   camera correction reads screen width, so a replay at a different window size is a
   different run. */
function runRecord(){
  if(!S) return null;
  return {
    // v2: cap and camera wander moved off Math.pow/Math.sin, so v1 records
    // score fractionally differently and cannot be replayed against this build.
    v:2, seed:S.seed, w:W, h:H, step:STEP, steps:S.steps,
    // tickets ride in the claim so the verifier recomputes them from the track
    // like every other scored quantity. A forged ticket count fails replay.
    tuned:isTuned(),
    track:encodeTrack(S.track),
    claim:{ ath:S.ath, cap:S.cap, climb:S.climb, buys:S.buys, best:S.best, t:S.t, tickets:S.tickets }
  };
}

async function submitRun(){
  if(ARCADE) return;
  const rec=runRecord();
  if(!rec) return;
  rec.mode=mode;
  if(attemptId) rec.attemptId=attemptId;

  // A tuned run is not comparable, so it is never offered to the board. Sending it
  // anyway would only earn a verification rejection that reads like an accusation.
  if(rec.tuned){ setRank('Custom tuning · not ranked'); return; }
  if(offline){ setRank('Offline · this run is not ranked'); return; }
  if((mode===MODE.DAILY||mode===MODE.WINDOW) && !attemptId){ setRank(''); return; }

  setRank('Submitting…');
  try{
    const r=await fetch(API+'/run/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)});
    const j=await r.json().catch(()=>null);
    if(!j){ setRank('Could not reach the leaderboard'); return; }
    if(!j.accepted){ setRank(j.reason||'Run was not accepted'); return; }
    showStanding(j);
  }catch(e){
    setRank('Could not reach the leaderboard');
  }
}

const elRank=document.getElementById('rankline');
function setRank(html,pb){
  elRank.innerHTML=html||'&nbsp;';
  elRank.classList.toggle('pb',!!pb);
}
function showStanding(j){
  if(j.mode===MODE.WINDOW){
    const m=j.window;
    if(m){ winMine=m; winLeft=m.attemptsLeft; }
    setRank(m ? '<b>'+m.tickets+'</b> ticket'+(m.tickets===1?'':'s')+' banked this window' : 'Run saved', !!(m&&j.tickets>0));
    paintMode();
    return;
  }
  if(!j.rank){ setRank('Run saved'); return; }
  // Rank is the player's standing, so it reads the same whether this run improved it.
  let s='<b>#'+j.rank+'</b> '+(j.mode===MODE.DAILY?'today':'all time');
  if(j.outOf) s+=' of '+j.outOf;
  // Best of three is the daily rule, so say plainly when this run is not the one counting.
  if(!j.isBest && j.bestToday!=null) s+=' · best today '+money(j.bestToday);
  setRank(s, j.isBest);
}

function windowText(){
  if(!win) return '';
  if(!win.open) return win.name+' &middot; closed';
  if(!wallet) return win.name+' &middot; '+closesIn()+' &middot; wallet required';
  const t = winMine ? winMine.tickets : 0;
  const left = winLeft==null ? win.attempts : winLeft;
  return win.name+' &middot; '+(left===0?'no runs left':left+' run'+(left===1?'':'s')+' left')+
         ' &middot; '+t+' ticket'+(t===1?'':'s')+' banked &middot; '+closesIn();
}
function modeText(){
  // Say it before an attempt is spent, not after the run.
  if(isTuned()) return 'Custom tuning &middot; reset in ⚙ to play the daily';
  if(mode===MODE.WINDOW) return windowText();
  if(mode===MODE.FREE) return 'Free play &middot; all-time board';
  if(offline) return 'Today’s chart &middot; offline, unranked';
  if(dailyLeft===0) return 'No runs left today';
  if(dailyLeft!=null) return dailyLeft+' run'+(dailyLeft===1?'':'s')+' left today';
  return '3 runs today &middot; best one counts';
}

async function loadBoard(){
  if(ARCADE) return null;
  try{
    // cache buster as well as no-store on the response: the board is usually opened
    // seconds after a run, and a stale copy reads as the submission having failed
    const r=await fetch(API+'/board?t='+Date.now(),{cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok) throw new Error('http '+r.status);
    return await r.json();
  }catch(e){ return null; }
}

/* ---------- wallet ---------- */
/* Wallets are the door to the window mode only. Daily and free play never ask for
   one, so the buttons stay hidden until a window is open. The proof is one personal_sign
   over a server-issued nonce: free, no transaction, no chain switch. The server
   recovers the signer with lib/eth.js and sets an HttpOnly session cookie, so
   nothing here holds a token and every later request is identified by the cookie.

   Attempts are counted per identity, so a sign-in or sign-out resets what the
   client thinks it knows about today's count and lets the next start() ask again. */
let wallet=null;   // lowercase address, or null
const walletBtns=[...document.querySelectorAll('[data-wallet]')];

async function authCall(body){
  const r=await fetch(API+'/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);
  if(!r.ok) throw new Error((j&&j.error)||('http '+r.status));
  return j;
}
function setWallet(addr){
  const changed=(addr||null)!==wallet;
  wallet=addr||null;
  if(changed){ dailyLeft=null; attemptId=null; winMine=null; winLeft=null; }
  paintWallet();
  paintMode();
  if(changed) loadWindow();
}
function paintWallet(note){
  for(const b of walletBtns){
    b.hidden=!(win&&win.open);
    b.disabled=false;
    b.classList.toggle('on',!!wallet);
    b.textContent = note ? note : wallet ? shortId(wallet)+' · sign out' : 'Connect wallet to rank';
  }
}
async function walletMe(){
  try{ const j=await authCall({op:'me'}); setWallet(j.address); }
  catch(e){ /* no backend: stay anonymous, offline handles the rest */ }
}
async function connectWallet(){
  if(ARCADE) return;
  const eth=window.ethereum;
  if(!eth){ paintWallet('No wallet found'); setTimeout(paintWallet,2500); return; }
  for(const b of walletBtns) b.disabled=true;
  try{
    const [addr]=await eth.request({method:'eth_requestAccounts'});
    if(!addr) throw new Error('no account');
    const ch=await authCall({op:'nonce',address:addr});
    // hex-encode the message: every wallet accepts that form, and a raw string is
    // read as hex by some of them if it happens to start with 0x
    const hex='0x'+[...new TextEncoder().encode(ch.message)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const sig=await eth.request({method:'personal_sign',params:[hex,addr]});
    const j=await authCall({op:'verify',address:addr,nonce:ch.nonce,signature:sig});
    setWallet(j.address);
  }catch(e){
    // a rejected prompt is the common case and needs no explanation
    const msg=/reject|denied|cancel/i.test(String(e&&e.message)) ? 'Cancelled' : 'Sign-in failed';
    paintWallet(msg); setTimeout(paintWallet,2500);
  }
}
async function signOut(){
  try{ await authCall({op:'logout'}); }catch(e){}
  setWallet(null);
}
walletBtns.forEach(b=>{ b.onclick=()=>wallet?signOut():connectWallet(); });

/* ---------- flow ---------- */
const menu=document.getElementById('menu'), over=document.getElementById('over'),
      board=document.getElementById('board');
function start(seed){
  try{ ac(); }catch(e){}
  SFX.tap.unlock(); SFX.woo.unlock(); SFX.milestone.unlock();
  MUSIC.play(T.music);
  // start is wired straight to onclick, so the first arg is a MouseEvent unless
  // someone passed a seed on purpose
  newGame(typeof seed==='number'?seed:undefined); S.shown=false;
  menu.classList.add('hide'); over.classList.add('hide');
  running=true; last=performance.now(); acc=0;
  arcadeFrame=requestAnimationFrame(loop);
  clickSound(0.16,1);
}

// Guards the window between the click and the seed arriving. Without it a second
// click spends a second attempt on a run the player never sees.
let starting=false;
async function startMode(m){
  if(ARCADE){
    if(starting||running||arcadeDestroyed) return;
    mode=window.TokenArcade.config.mode==='free'?MODE.FREE:MODE.DAILY;
    USE_BRAND=false; T.head=0;
    const seed=mode===MODE.FREE?newSeed():window.moodSwingsSeed(window.TokenArcade.config.seed);
    start(seed); paintMode(); return;
  }
  if(starting||running) return;
  starting=true;
  setButtons(false);
  // Daily and window fetch a seed before start(), so start() runs outside the click.
  // iOS only unlocks audio inside a gesture, so create and resume the context here,
  // while this is still the click, and unlock the pools with it.
  try{ ac(); }catch(e){}
  SFX.tap.unlock(); SFX.woo.unlock(); SFX.milestone.unlock();
  try{
    mode=m;
    let seed;
    if(m===MODE.WINDOW){
      if(!wallet){ starting=false; setButtons(true); await connectWallet(); if(!wallet) return; starting=true; setButtons(false); }
      try{ seed=await startWindow(); }
      catch(e){
        if(e.code==='wallet'){ setWallet(null); }
        paintMode();
        return;
      }
    } else {
      seed = m===MODE.DAILY ? await startDaily() : newSeed();
    }
    if(m===MODE.FREE){ attemptId=null; }   // dailyLeft is the day's business, leave it alone
    start(seed);
  } finally {
    starting=false;
    setButtons(true);
    paintMode();
  }
}

const btnStart=document.getElementById('start'), btnFree=document.getElementById('startFree');
const btnWindow=document.getElementById('startWindow'), elWindowState=document.getElementById('windowState');
const btnAgain=document.getElementById('again'), btnAgainFree=document.getElementById('againFree');
const elDailyState=document.getElementById('dailyState'), elOverState=document.getElementById('overState');

/* ---------- screens ---------- */
/* Exactly one veil is visible at a time, and every screen can reach every other one.
   Before this, the end screen offered only "run it back" and "free play", so a player
   who started in free play had no route back to the daily or to the board. */
function show(which){
  MUSIC.stop();
  for(const [el,name] of [[menu,'menu'],[over,'over'],[board,'board']]){
    el.classList.toggle('hide', name!==which);
  }
  if(which==='menu') paintMode();
}

const elBlist=document.getElementById('blist'), elBoardFoot=document.getElementById('boardFoot');
const tabs=[document.getElementById('tabDaily'), document.getElementById('tabAll'), document.getElementById('tabWindow')];
let boardData=null, boardTab='daily';

function shortId(p){
  if(!p) return 'anon';
  if(/^0x[0-9a-f]{6,}$/i.test(p)) return p.slice(0,6)+'…'+p.slice(-4);  // wallet, once those exist
  return p.replace(/^anon-/,'').slice(0,6);
}
function renderBoard(){
  tabs.forEach(t=>t.classList.toggle('on', t.dataset.tab===boardTab));
  if(!boardData){
    elBlist.innerHTML='<li class="bempty">Leaderboard is unreachable right now.</li>';
    elBoardFoot.textContent='';
    return;
  }
  const w=boardData.window;
  tabs[2].hidden=!w;
  if(boardTab==='window'&&!w) boardTab='daily';
  if(boardTab==='window'){
    const rows=w.rows||[];
    elBlist.innerHTML = rows.length ? rows.map((r,i)=>
      '<li'+(wallet&&r.player===wallet?' class="me"':'')+'><span class="brank">'+(i+1)+'</span>'+
      '<span class="btk">'+r.tickets+' tkt</span>'+
      '<span class="bmeta">'+shortId(r.player)+' &middot; '+money(r.ath)+' &middot; '+r.runs+' run'+(r.runs===1?'':'s')+'</span></li>').join('')
      : '<li class="bempty">No tickets banked yet.</li>';
    elBoardFoot.textContent = w.name+' · '+(w.open ? closesIn() : 'closed')+' · ranked by tickets';
    return;
  }
  const rows=boardData[boardTab]||[];
  if(!rows.length){
    elBlist.innerHTML='<li class="bempty">'+(boardTab==='daily'
      ? 'Nobody has posted a run on today’s chart yet.'
      : 'No runs on the board yet.')+'</li>';
  } else {
    elBlist.innerHTML=rows.map((r,i)=>
      '<li><span class="brank">'+(i+1)+'</span>'+
      '<span class="bath">'+money(r.ath)+'</span>'+
      '<span class="bmeta">'+shortId(r.player)+' &middot; '+r.buys+' buys &middot; '+
      Math.round(r.secs)+'s</span></li>').join('');
  }
  elBoardFoot.textContent = boardTab==='daily' ? 'Today’s chart · '+boardData.day : 'Best runs, any mode';
}
async function openBoard(){
  if(mode===MODE.WINDOW && win) boardTab='window';
  show('board');
  elBlist.innerHTML='<li class="bempty">Loading…</li>';
  boardData=await loadBoard();
  renderBoard();
}

/* Only buttons that would actually start a daily run are gated by the day's count.
   Free play is unlimited, so "run it back" during free play must stay live even once
   the daily is spent. */
function setButtons(on){
  // A tuned run can never rank, so spending a daily attempt on one is pure waste.
  // Free play stays open at any tuning, which is the whole point of the panel.
  const noDaily = dailyLeft===0 || isTuned();
  const noWindow = !(win&&win.open) || winLeft===0 || isTuned();
  btnStart.disabled     = !on || noDaily;                       // menu: daily
  btnFree.disabled      = !on;                                  // menu: free
  btnWindow.disabled    = !on || noWindow;                      // menu: window
  btnAgain.disabled     = !on || (mode===MODE.DAILY && noDaily) || (mode===MODE.WINDOW && noWindow);  // rematch: same mode
  btnAgainFree.disabled = !on || (mode===MODE.FREE && noDaily);  // end: the other mode
}
function paintMode(){
  if(ARCADE){
    const scored=window.TokenArcade?.config?.mode!=='free';
    elDailyState.textContent=scored?'Scored run · fixed playfield':'Free play · unlimited retries';
    elOverState.textContent=scored?'Return to Token Arcade for another attempt':'Free play · unlimited retries';
    btnStart.textContent='Play'; btnAgain.textContent=scored?'Next attempt in Token Arcade':'Play again';
    btnAgain.disabled=scored; btnFree.hidden=true; btnAgainFree.hidden=true;
    btnWindow.hidden=true; elWindowState.hidden=true;
    return;
  }
  // the menu describes the daily under its own button; the window has its own line
  elDailyState.innerHTML = mode===MODE.WINDOW ? (isTuned()?modeText():dailyText()) : modeText();
  elOverState.innerHTML=modeText();
  const open=!!(win&&win.open);
  btnWindow.hidden=!open; elWindowState.hidden=!open;
  if(open){
    elWindowState.innerHTML=windowText();
    btnWindow.textContent = !wallet ? 'Connect wallet to enter' : winLeft===0 ? 'No runs left' : 'Enter the window';
  }
  // after the runs are spent, free play becomes the only way forward
  const spent = mode===MODE.DAILY ? dailyLeft===0 : mode===MODE.WINDOW ? (winLeft===0||!open) : false;
  btnAgain.textContent = spent ? 'No runs left' : 'Run it back';
  btnAgainFree.textContent = mode===MODE.FREE ? 'Play today’s chart' : 'Free play';
  setButtons(!starting);
}
function dailyText(){
  if(offline) return 'Today’s chart &middot; offline, unranked';
  if(dailyLeft===0) return 'No runs left today';
  if(dailyLeft!=null) return dailyLeft+' run'+(dailyLeft===1?'':'s')+' left today';
  return '3 runs today &middot; best one counts';
}
function showOver(){
  document.getElementById('finalAth').textContent=money(S.ath);
  document.getElementById('fBuys').textContent=S.buys;
  document.getElementById('fStreak').textContent=S.best;
  document.getElementById('fMult').textContent=Math.round(S.climb);
  document.getElementById('fTime').textContent=S.t.toFixed(1)+'s';
  const tk=document.getElementById('fTickets');
  tk.textContent=(ARCADE?'ORBS ':'TICKETS ')+S.tickets+'/'+TICKET_MAX+(S.ticketsOut<TICKET_MAX?'  ('+(TICKET_MAX-S.ticketsOut)+' never released)':'');
  tk.className='ticketline'+(S.tickets>=TICKET_MAX?' max':S.tickets>0?' on':'');
  const v=document.getElementById('verdict');
  v.textContent = S.ath>3e9?'Legendary run' : S.ath>5e8?'Solid bags' : S.ath>5e7?'Respectable' : 'Paper hands';
  over.classList.remove('hide');
  running=false;
  // an attempt is consumed by the run that just finished, not by the next click
  if(mode===MODE.DAILY && typeof dailyLeft==='number' && dailyLeft>0) dailyLeft--;
  if(mode===MODE.WINDOW && typeof winLeft==='number' && winLeft>0) winLeft--;
  if(ARCADE){
    window.TokenArcade.complete({ result:'completed', primaryMetric:Math.round(S.ath),
      secondaryMetrics:{ buys:S.buys, bestStreak:S.best, collectibles:S.tickets, ticks:S.steps },
      proof:runRecord() });
  } else submitRun();
  paintMode();
  draw();
}
btnStart.onclick=()=>startMode(MODE.DAILY);
btnFree.onclick =()=>startMode(MODE.FREE);
btnWindow.onclick=()=>startMode(MODE.WINDOW);
btnAgain.onclick=()=>startMode(mode);   // rematch stays in whichever mode you were in
// the end screen's secondary action is always the mode you are NOT in, so free play
// is never a dead end you cannot get out of
btnAgainFree.onclick=()=>startMode(mode===MODE.FREE?MODE.DAILY:MODE.FREE);

document.getElementById('menuBoard').onclick =openBoard;
document.getElementById('overBoard').onclick =openBoard;
document.getElementById('overHome').onclick  =()=>show('menu');
document.getElementById('boardHome').onclick =()=>show('menu');
tabs.forEach(t=>{ t.onclick=()=>{ boardTab=t.dataset.tab; renderBoard(); }; });

paintMode();
if(!ARCADE) walletMe().then(loadWindow);

/* Console handle for reproducible tuning and, later, replay verification.
   BB.seed reads the seed of the run just played; BB.replay(seed) runs it again. */
window.BB={
  get seed(){ return S ? S.seed : null; },
  get state(){ return S; },
  // T is exposed for tuning the late ramp and the ticket schedule by hand while
  // this is still being felt out. late and padMin are in SIM_KEYS, so touching
  // them marks the run tuned and keeps it off the board.
  get tune(){ return T; },
  get ticketMarks(){ return TICKET_AT; },
  replay(seed){ start(seed>>>0); return seed>>>0; },

  record:runRecord,

  /* Headless stepping for the verifier. begin() skips start(), which touches audio
     and the menu DOM, and opens the start gate directly since a recorded track has
     no pointer events to open it with. */
  begin(seed){ newGame(seed>>>0); S.ready=true; return S; },
  tick(padX){ if(padX!=null) S.pad.x=padX; update(STEP); return S; }
};

/* ---------- config ---------- */
const cfg=document.getElementById('cfg');
document.getElementById('gear').onclick=e=>{ e.stopPropagation(); cfg.classList.toggle('open'); };
document.getElementById('cfgClose').onclick=()=>cfg.classList.remove('open');
cfg.addEventListener('pointerdown',e=>e.stopPropagation());
cv.addEventListener('pointerdown',()=>cfg.classList.remove('open'));
const PAL=[
  {n:'BUY',    a:'#CCFF00', b:'#070707', g:'#1a1d16'},
  {n:'HOOD',   a:'#00C805', b:'#050805', g:'#0f1a0f'},
  {n:'TERM',   a:'#33ff88', b:'#00110a', g:'#0b2418'},
  {n:'EMBER',  a:'#ff5c33', b:'#0b0605', g:'#231410'},
  {n:'ICE',    a:'#7fe6ff', b:'#04080c', g:'#101f28'},
  {n:'GRAPE',  a:'#c77dff', b:'#08040d', g:'#1c1226'}
];
const swEl=document.getElementById('sw');
PAL.forEach(p=>{
  const b=document.createElement('button');
  b.style.background=p.a; b.title=p.n;
  b.onclick=()=>{
    document.documentElement.style.setProperty('--accent',p.a);
    document.documentElement.style.setProperty('--accent2',shade(p.a,-0.35));
    document.documentElement.style.setProperty('--bg',p.b);
    document.documentElement.style.setProperty('--grid',p.g);
    document.getElementById('pAcc').value=p.a;
    document.getElementById('pBg').value=p.b;
  };
  swEl.appendChild(b);
});
function shade(hex,amt){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  r=Math.max(0,Math.min(255,Math.round(r*(1+amt))));
  g=Math.max(0,Math.min(255,Math.round(g*(1+amt))));
  b=Math.max(0,Math.min(255,Math.round(b*(1+amt))));
  return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}
document.getElementById('pAcc').oninput=e=>{
  document.documentElement.style.setProperty('--accent',e.target.value);
  document.documentElement.style.setProperty('--accent2',shade(e.target.value,-0.35));
};
document.getElementById('pBg').oninput=e=>document.documentElement.style.setProperty('--bg',e.target.value);

function bind(id,lab,key,fmt){
  const el=document.getElementById(id), l=document.getElementById(lab);
  el.oninput=()=>{
    T[key]=parseFloat(el.value);
    l.textContent=fmt?fmt(el.value):el.value;
    if(key==='padW'&&S) S.pad.w=T.padW;
    if(key==='music'||key==='musicVol'||key==='sound') MUSIC.sync();
    paintMode();   // the daily gate depends on tuning, so refresh it as sliders move
  };
}
bind('sg','lg','g');
bind('sb','lb','bounce');
bind('ss','ls','vx');
bind('sw2','lw','padW');
bind('sr','lr','ramp',v=>parseFloat(v).toFixed(1));
bind('sn','ln','noise',v=>parseFloat(v).toFixed(1));
bind('ssnd','lsnd','sound',v=>v==='1'?'on':'off');
/* Music picker: one button per track, same shape as the head picker below. The
   hidden range smus stays the value carrier so Copy setup and applySetup are untouched. */
const mwEl=document.getElementById('mw'), smusEl=document.getElementById('smus'), mwBtns=[];
smusEl.max=MUSIC.names.length-1;
MUSIC.names.forEach((n,i)=>{
  const b=document.createElement('button'); b.type='button'; b.textContent=n;
  b.onclick=()=>{ smusEl.value=i; smusEl.oninput(); };
  mwEl.appendChild(b); mwBtns.push(b);
});
bind('smus','lmus','music',v=>{
  mwBtns.forEach((b,i)=>b.classList.toggle('on',i===(v|0)));
  return MUSIC.names[v|0];
});
smusEl.value=T.music; smusEl.oninput();
bind('smv','lmv','musicVol');
// Audio readout for phone reports: context state, whether the sequencer is running,
// and the iOS session type. Reads only, once a second, nothing here touches a run.
try{
  const dg=document.getElementById('audioDiag');
  setInterval(()=>{
    const ses=(navigator.audioSession&&navigator.audioSession.type)||'no session api';
    dg.textContent='audio: '+(AC?AC.state:'no context yet')+' · music '+(MUSIC.playing?'playing':'idle')+' · '+ses+' · '+(IOS_WEBVIEW?'via media element'+(keep?(keep.paused?' (paused)':' (on)'):' (no element)'):'direct');
  },1000);
}catch(e){}
/* Head picker: one button per head with the art itself as the swatch, so the choice
   is visible before it is made. The hidden range under it stays the value carrier:
   a click writes the range and fires its oninput, so Copy setup, applySetup and the
   label all keep going through the one input path. Selection paint rides in the
   label formatter because that is the one call every route lands in. */
const hwEl=document.getElementById('hw'), shdEl=document.getElementById('shd'), hwBtns=[];
shdEl.max=HEADS.length-1;
HEADS.forEach((h,i)=>{
  const b=document.createElement('button'); b.type='button'; b.title=h.name;
  if(h.src) b.style.backgroundImage="url('"+h.src+"')"; else b.innerHTML='<span class="dot"></span>';
  b.onclick=()=>{ shdEl.value=i; shdEl.oninput(); };
  hwEl.appendChild(b); hwBtns.push(b);
});
bind('shd','lhd','head',v=>{
  hwBtns.forEach((b,i)=>b.classList.toggle('on',i===(v|0)));
  return (HEADS[v|0]||HEADS[0]).name;
});
shdEl.value=T.head; shdEl.oninput();
(function(){
  const el=document.getElementById('sbr'), l=document.getElementById('lbr');
  el.oninput=()=>{ USE_BRAND=el.value==='1'; l.textContent=USE_BRAND?'on':'off'; };
})();

/* ---------- sharing a setup ---------- */
/* Beta testers are expected to move these sliders and report what feels better, so a
   setup has to travel as one thing. The values ride in the URL hash, which needs no
   storage and survives being pasted into a chat: opening the link puts the reader on
   the sender's exact feel.

   Sliders own the truth here. Writing T directly and leaving the inputs behind meant
   a later drag of any slider snapped the others back, so applying a setup always goes
   through the input and its oninput handler. */
const SHARE=[
  ['sg','g'], ['sb','bounce'], ['ss','vx'], ['sw2','padW'],
  ['sr','ramp'], ['sn','noise'], ['ssnd','sound'], ['smus','music'], ['smv','musicVol'], ['shd','head']
];
const elNote=document.getElementById('cfgNote');
let noteTimer=null;
function note(msg,ok){
  elNote.textContent=msg;
  elNote.classList.toggle('ok',!!ok);
  clearTimeout(noteTimer);
  noteTimer=setTimeout(()=>{
    elNote.textContent='Send the copied link to droober. It opens the game with your exact values.';
    elNote.classList.remove('ok');
  },4000);
}

function applySetup(vals){
  for(const [id,key] of SHARE){
    if(vals[key]==null) continue;
    const el=document.getElementById(id);
    el.value=vals[key];
    el.oninput();          // drives T and the label through the one code path
  }
  if(vals.accent){
    const p=document.getElementById('pAcc');
    p.value=vals.accent; p.oninput({target:p});
  }
  if(vals.bg){
    const p=document.getElementById('pBg');
    p.value=vals.bg; p.oninput({target:p});
  }
}

function readSetup(){
  const out={};
  for(const [,key] of SHARE) out[key]=T[key];
  out.accent=document.getElementById('pAcc').value;
  out.bg=document.getElementById('pBg').value;
  return out;
}

/* The hash is the parameter string itself. Nesting it as #tune=<querystring> looked
   tidier and broke: the payload contains & separators, so parsing stopped at the first
   one and a shared link applied gravity alone while silently dropping every other
   value. */
function setupToHash(v){
  const p=new URLSearchParams();
  for(const [,key] of SHARE) p.set(key,String(v[key]));
  p.set('accent',v.accent.replace('#','')); p.set('bg',v.bg.replace('#',''));
  return '#'+p.toString();
}
function setupFromHash(h){
  if(!h) return null;
  const p=new URLSearchParams(String(h).replace(/^#/,''));
  const out={};
  for(const [,key] of SHARE){
    const raw=p.get(key);
    if(raw==null) continue;
    const n=parseFloat(raw);
    if(Number.isFinite(n)) out[key]=n;
  }
  const hex=s=>/^[0-9a-f]{6}$/i.test(s||'')?'#'+s:null;
  const a=hex(p.get('accent')), b=hex(p.get('bg'));
  if(a) out.accent=a;
  if(b) out.bg=b;
  return Object.keys(out).length?out:null;
}

document.getElementById('cfgReset').onclick=()=>{
  applySetup(T_DEFAULT);
  const pa=document.getElementById('pAcc'), pb=document.getElementById('pBg');
  pa.value='#CCFF00'; pa.oninput({target:pa});
  pb.value='#070707'; pb.oninput({target:pb});
  const el=document.getElementById('sbr');
  el.value='1'; el.oninput();
  if(location.hash) history.replaceState(null,'',location.pathname+location.search);
  note('Back to shipped defaults.',true);
};

document.getElementById('cfgShare').onclick=async()=>{
  const v=readSetup();
  const link=location.origin+location.pathname+setupToHash(v);
  const text=link+'\n\ngravity '+v.g+' · bounce '+v.bounce+' · speed '+v.vx+
    ' · button '+v.padW+' · ramp '+Number(v.ramp).toFixed(1)+' · noise '+Number(v.noise).toFixed(1)+
    ' · music '+MUSIC.names[v.music|0]+' '+v.musicVol;
  try{
    await navigator.clipboard.writeText(text);
    note('Copied. Paste it anywhere.',true);
  }catch(e){
    // clipboard needs a secure context and permission, so fall back to selectable text
    note(link);
  }
};

// a shared setup applies before the first frame, so the sender's feel is what loads
const incoming=setupFromHash(location.hash);
if(incoming&&!ARCADE){ applySetup(incoming); }

window.TokenArcade?.register({
  version:'1.0.0',
  capabilities:{ pause:true, mute:true, touch:true, keyboard:true, gamepad:false, orientation:'portrait' },
  async mount(config){
    if(config.mode!=='free' && (!config.seed || config.rules?.viewportWidth!==390 || config.rules?.viewportHeight!==844))
      throw new Error('This scored run requires a 390×844 playfield.');
    const response=await fetch('./skin.json');
    if(!response.ok) throw new Error('eMONAD display theme is unavailable.');
    const skin=await response.json();
    if(skin.skinId!=='emonad-cabinet.abstract-v1'||skin.version!=='1.0.0') throw new Error('Wrong eMONAD display theme.');
    arcadeTheme=skin;
    for(const [key,value] of Object.entries(skin.palette||{})){
      if(/^[a-z0-9]+$/.test(key)&&/^#[0-9a-fA-F]{6}$/.test(value)) document.documentElement.style.setProperty('--'+key,value);
    }
    document.body.classList.toggle('ta-scored',config.mode!=='free');
    Object.assign(T,T_DEFAULT); USE_BRAND=false; T.head=0;
    paintMode(); draw();
  },
  start(){ startMode(MODE.FREE); },
  pause(){ MUSIC.stop(); try{ AC?.suspend(); }catch(e){} },
  resume(){ last=performance.now(); try{ AC?.resume(); }catch(e){} if(running) MUSIC.play(T.music); },
  restart(){ if(!running) startMode(MODE.FREE); },
  audio(muted){ T.sound=muted?0:1; if(muted) MUSIC.stop(); else if(running) MUSIC.play(T.music); },
  destroy(){ arcadeDestroyed=true; running=false; cancelAnimationFrame(arcadeFrame); MUSIC.stop(); try{ AC?.close(); }catch(e){} }
});

newGame(); draw();
if(incoming) note('Loaded a shared setup.',true);
})();
