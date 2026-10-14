// Skrumpey Slide v2 deterministic sim. Pure: no DOM, no wall clock. Fixed 60 Hz, seeded RNG, input replay.
// Terrain = authored chunk templates (control points joined by cosine curves -> zero slope at joints)
// stitched procedurally per seed, grouped into biomes. Entities (collectibles, power-ups, enemies) are spawned with the chunk.
(function(root){
const DT=1/60, PIT=-400;
const P={g:24,gPress:140,startV:22,minV:13,maxV:80,friction:0.004,perfectAng:0.5,badAng:0.85,perfectBoost:1.14,badKeep:0.8,diveAccel:14,trainMultStep:0.2,trainMultCap:1.5,trainSpacing:3.6,laneW:3.5,laneLen:230,laneSpeed:32,laneJumpV:15,frenzyNeed:45,frenzyTicks:300,frenzyEvery:10,frenzyMagnet:9,buddyR:4.2,trainGap:9,trainHitKeep:0.9,starSynergy:1.5,rearRange:22,launchPeriod:90,launchMinPull:8,launchAuto:600,launchAngle:0.55,perfectLaunchQ:0.9,jumpV:17,jumpStart:3,jumpMax:5,jumpComboEvery:5,perfectMaxSlope:0.1,terrainStretch:1.15,launchKick:2,launchSlope:0.18,
  dayTicks:60*60,perfectDaylight:30,airPtsPerSec:20,heightPts:4,distPts:1,
  pr:1.4, starTicks:6*60, beamTicks:9*60, beamEvery:24, beamRange:34, hitKeep:0.6, invulnTicks:70, stompBounce:15,bashSpeed:24,
  pts:{gem:10,stomp:50,beamKill:30,starKill:40,power:100}};
const BUDDY_TRAITS=[ 'star','star','star','star','beam','beam','beam',null,null,null,null ]; // order = CONFIG.buddies ids [3,20,38,164,690,2067,2912,1764,1924,210,314]
const BIOMES=['meadow','dunes','crystal','clouds'], BIOME_LEN=640;
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function biomeAt(x){return x<0?0:Math.floor(x/BIOME_LEN)%BIOMES.length;}

function makeWorld(seed){
  const r=rng(seed^0x9e3779b9);const pts=[{x:-80,y:6,gap:false},{x:0,y:6,gap:false}];const ents=[];const chunks=[];
  let lastBiome=-1,chunkN=0,powerN=0,buddyN=0,laneBiome=-1,pendingLane=false;const lanes=[];const buddy=(x,o)=>ent('buddy',x,0,Object.assign({bi:(buddyN++)%BUDDY_TRAITS.length},o||{}));
  const L=()=>pts[pts.length-1];
  const add=(dx,y,gap)=>{dx*=gap?1:P.terrainStretch;const p=L();pts.push({x:p.x+dx,y,gap:false});if(gap)p.gap=true;};
  const ent=(type,x,y,extra)=>ents.push(Object.assign({type,x,y,x0:x,y0:y,dead:false,ph:r()*6.28},extra||{}));
  let arcN=0;const gemArc=(x0,x1,lift)=>{arcN++;for(let i=0;i<5;i++){const x=x0+(x1-x0)*i/4;ent('gem',x,hAt(x)+lift+Math.sin(Math.PI*i/4)*4,{rare:arcN%4===0&&i===2});}};
  function hAt(x){return evalH(x);}
  function chunk(){const p=L();const x0=p.x;const K=P.terrainStretch;const b=biomeAt(x0);const diff=Math.min(1,x0/1600);const A=6+diff*10;
    let kind;
    if(chunkN===0)kind='start';
    else if(b!==lastBiome){kind='rest';pendingLane=true;}
    else if(pendingLane){kind='lane';pendingLane=false;}
    else{const pool={meadow:['rollers','bigRamp','rollers','plateau','gap'],dunes:['bigRamp','bigRamp','rollers','plateau','gap'],
      crystal:['rollers','gap','bigRamp','plateau','rollers'],clouds:['gap','gap','bigRamp','rollers','plateau']}[BIOMES[b]];
      kind=pool[Math.floor(r()*pool.length)];}
    const by=0;
    if(kind==='lane'){ // 3-lane sprint: flat strip; barriers / lane nuts / one stranded Skrumpey; theme = biome
      const y0=L().y;add(30,by);const xa=L().x;add(P.laneLen/K,by);const xb=L().x;add(40,by-A*0.6);lanes.push({x0:xa+6,x1:xb-6,biome:b});
      let lastFree=0;for(let x=xa+30,row=0;x<xb-20;x+=20,row++){const free=Math.max(-1,Math.min(1,lastFree+(r()<0.5?-1:1)*(r()<0.6?1:0)));
        for(let l=-1;l<=1;l++){if(l===free)continue;if(r()<0.75)ent('barrier',x,0,{lane:l});}
        for(let i=0;i<3;i++)ent('gem',x+5+i*4,0,{lane:free,laneGem:true});
        if(row===2||row===6)ent('buddy',x+10,0,{lane:free,bi:(buddyN++)%BUDDY_TRAITS.length});lastFree=free;}}
    else if(kind==='start'){add(40,by+2);add(50,by-8);add(45,by+2);add(45,by-10);gemArc(x0+K*50,x0+K*90,3);}
    else if(kind==='rest'){add(60,by);add(60,by+2);add(60,by);ent('landmark',x0+K*60,0,{biome:b});gemArc(x0+K*30,x0+K*90,2);
      // power-up as a reward on the rest zone, alternating star / beam
      ent((powerN++)%2?'beam':'star',x0+K*130,0,{air:2.4});}
    else if(kind==='rollers'){const n=3+Math.floor(r()*3),wl=34+r()*22;for(let i=0;i<n;i++){add(wl/2,by-A*0.6);add(wl/2,by+A*0.5*(0.6+r()*0.6));}
      for(let i=1;i<n;i+=2)buddy(x0+K*wl*(i+0.42));ent('walker',x0+K*wl*1.0,0);if(r()<0.6)ent('flyer',x0+K*wl*2.5,0,{air:11});gemArc(x0+K*wl*1.5,x0+K*wl*2.2,6);}
    else if(kind==='bigRamp'){add(55,by-A*1.4);add(50,by+A*1.3);add(30,by+A*1.3+1);add(60,by-A*0.8);
      ent('walker',x0+K*55,0);ent('flyer',x0+K*150,0,{air:16});buddy(x0+K*98);gemArc(x0+K*108,x0+K*140,12);{const cx=x0+K*105;if(r()<0.5)ent((powerN++)%2?'beam':'star',cx+38,0,{arc:hAt(cx)+9});}}
    else if(kind==='plateau'){const py=by+A*0.9;add(45,py);add(70,py);ent('spike',x0+K*70,0);ent('spike',x0+K*95,0);ent('gem',x0+K*82,py+5);add(50,by-A);
      ent('walker',x0+K*150,0);ent('landmark',x0+K*80,0,{biome:b,small:true});}
    else if(kind==='gap'){const top=by+A*1.1, w=14+r()*10+diff*8;add(40,by-A);add(42,top);add(w,top-9,true);add(45,by-A*0.7);
      ent('flyer',x0+K*82+w*0.5,0,{air:14});buddy(x0+K*74);gemArc(x0+K*84,x0+K*82+w,8);}
    if(kind==='rest'){buddy(x0+K*70);buddy(x0+K*150);}else if(kind==='plateau')buddy(x0+K*40);
    chunks.push({x0,x1:L().x,kind,biome:b});lastBiome=b;chunkN++;
    // resolve entity heights (y relative to ground where not set)
    for(const e of ents)if(e._res!==true&&e.x<=L().x){const g=evalH(e.x);if(e.laneGem)e.y=g+1.2;else if(e.type!=='gem')e.y=e.arc!==undefined?e.arc:(g<=PIT+1?evalH(e.x+30):g)+(e.air||0);e.y0=e.y;e._res=true;}
    // Templates emit by type, but collision, bot and rendering scans stop at
    // the first distant entity. Keep spatial order after every generated chunk.
    // x0 is stable even when walkers move around their spawn point.
    ents.sort((a,b)=>a.x0-b.x0);
  }
  function seg(x){let lo=0,hi=pts.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(pts[m].x<=x)lo=m;else hi=m-1;}return lo;}
  function evalH(x){if(x<pts[0].x)return pts[0].y;if(x>=L().x)return L().y;const i=seg(x),a=pts[i],b=pts[i+1];if(a.gap)return PIT;
    const t=(x-a.x)/(b.x-a.x);return a.y+(b.y-a.y)*(1-Math.cos(Math.PI*t))/2;}
  function evalD(x){if(x<pts[0].x||x>=L().x)return 0;const i=seg(x),a=pts[i],b=pts[i+1];if(a.gap)return 0;const l=b.x-a.x,t=(x-a.x)/l;
    return (b.y-a.y)*Math.PI/(2*l)*Math.sin(Math.PI*t);}
  const W={pts,ents,chunks,ensure(x){while(L().x<x)chunk();},
    h(x){W.ensure(x+5);return evalH(x);},dh(x){W.ensure(x+5);return evalD(x);},
    lanes,laneAt(x){for(const l of lanes)if(x>=l.x0&&x<l.x1)return l;return null;},
    inGap(x){W.ensure(x+5);if(x<pts[0].x||x>=L().x)return null;const i=seg(x);return pts[i].gap?{x0:pts[i].x,x1:pts[i+1].x}:null;},biomeAt};
  W.ensure(400);return W;}

function create(seed){const W=makeWorld(seed);const s={seed,T:W,W,tick:0,x:0,y:W.h(0),vx:P.startV,vy:0,ground:true,air:0,airMax:0,
  combo:1,bestCombo:1,perfects:0,bads:0,score:0,bonus:0,daylight:P.dayTicks,over:false,lastLanding:null,inputs:[],maxAlt:0,
  inLane:null,lane:0,laneZ:0,lanePrevPress:false,lanesRun:0,nutMeter:0,frenzyT:0,frenzies:0,phase:'launch',pull:0,launchQ:0,train:[],trainBest:0,rescued:0,trainLost:0,hist:[],power:null,powerT:0,jumps:P.jumpStart,jumpsUsed:0,biomeSeen:0,invuln:0,gems:0,kills:0,hits:0,falls:0,ev:[],entLo:0};return s;}

function TM(s){return 1+Math.min(P.trainMultCap,P.trainMultStep*s.train.length);}
// scoring helpers (used by step() and by the How-to-Play calculator)
function flightPts(airTicks,airMax,combo,tm){return airTicks>20?Math.round(tm*(Math.round((airTicks/60*P.airPtsPerSec+airMax*P.heightPts)*combo))):0;}
function nutPts(rare,combo,tm){return Math.round(tm*(P.pts.gem*(rare?5:1)*combo));}
function killPts(how,combo,tm){return Math.round(tm*(how==='stomp'?P.pts.stomp*combo:how==='star'||how==='bash'?P.pts.starKill:P.pts.beamKill));}
function powerPts(tm){return Math.round(tm*P.pts.power);}
function rainPts(tm){return Math.round(tm*P.pts.gem);}
function hasTrait(s,t){for(const i of s.train)if(BUDDY_TRAITS[i]===t)return true;return false;}
function launchMeter(p){const f=(p/(P.launchPeriod/2))%2;return 1-Math.abs(f-1);}
function hitPlayer(s){if(s.invuln>0||s.power==='star')return;
  if(s.train.length){const bi=s.train.pop();s.trainLost++;s.vx*=P.trainHitKeep;s.invuln=P.invulnTicks;s.hits++;s.ev.push({t:'trainLost',bi,x:s.x,y:s.y});return;}s.vx*=P.hitKeep;s.vy=Math.max(s.vy,6);s.power=null;s.powerT=0;s.combo=1;s.invuln=P.invulnTicks;s.hits++;s.ev.push({t:'hit',x:s.x,y:s.y});}
function kill(s,e,how){e.dead=true;s.kills++;const pts=how==='stomp'?P.pts.stomp*s.combo:how==='star'||how==='bash'?P.pts.starKill:P.pts.beamKill;s.bonus+=killPts(how,s.combo,TM(s));s.ev.push({t:'kill',how,x:e.x,y:e.y,type:e.type,pts});}
function entPos(s,e){if(e.type==='walker'){e.x=e.x0+Math.sin(s.tick*0.025+e.ph)*5;e.y=s.W.h(e.x);}else if(e.type==='flyer'){e.y=e.y0+Math.sin(s.tick*0.06+e.ph)*2.2;}}

function step(s,input){if(s.over)return;const bits=input===true?1:input===false?0:(input|0)&15;const press=(bits&1)===1,jump=(bits&2)===2;
  s.inputs.push(bits);s.tick++;s.ev=[];const W=s.W;
  if(s.phase==='launch'){ // slingshot: hold to pull (meter oscillates), release to fire; timing = launch power
    if(press&&s.tick<P.launchAuto){s.pull++;return;}
    if(s.pull<P.launchMinPull&&s.tick<P.launchAuto)return;
    const q=s.tick>=P.launchAuto&&s.pull<P.launchMinPull?0.3:launchMeter(s.pull);const perfect=q>=P.perfectLaunchQ;
    const sp=P.startV*(0.6+0.6*q)+(perfect?8:0);s.vx=sp*Math.cos(P.launchAngle);s.vy=sp*Math.sin(P.launchAngle)+4+q*6;s.y+=1;s.ground=false;
    s.phase='run';s.launchQ=q;s.ev.push({t:'sling',q,perfect,x:s.x,y:s.y});return;}
  // lane sprint segment
  const ln=W.laneAt(s.x);if(ln&&!s.inLane){s.inLane=ln;s.lane=0;s.lanesRun++;s.ev.push({t:'laneIn',biome:ln.biome});}else if(!ln&&s.inLane){s.inLane=null;s.lane=0;s.ev.push({t:'laneOut'});}
  if(s.inLane){if(bits&4)s.lane=Math.max(-1,s.lane-1);if(bits&8)s.lane=Math.min(1,s.lane+1);
    const tap=press&&!s.lanePrevPress;if((jump||tap)&&s.ground){s.vy=P.laneJumpV;s.y+=0.05;s.ground=false;s.ev.push({t:'jump',x:s.x,y:s.y,lane:true});}
    const sp=Math.hypot(s.vx,s.vy);if(sp<P.laneSpeed){const k=P.laneSpeed/(sp||1);s.vx*=k;s.vy*=k;}}
  s.lanePrevPress=press;s.laneZ+=((s.inLane?s.lane*P.laneW:0)-s.laneZ)*0.22;
  s.hist.push(s.x,s.y,s.laneZ);if(s.hist.length>1800)s.hist.splice(0,600);
  // limited jump: only from the ground, uses a charge, kicks along the surface normal
  if(jump&&s.ground&&s.jumps>0&&!W.laneAt(s.x)){const m=W.dh(s.x),nl=Math.hypot(1,m);s.vx+=-m/nl*P.jumpV*0.3;s.vy=Math.max(s.vy,0)+P.jumpV/nl;s.y+=0.05;s.ground=false;s.jumps--;s.jumpsUsed++;s.ev.push({t:'jump',x:s.x,y:s.y});}
  const g=(press&&!s.inLane)?P.gPress:P.g;s.lastLanding=null;const px=s.x;
  s.vy-=g*DT;s.x+=s.vx*DT;s.y+=s.vy*DT;let gh=W.h(s.x);
  // fell into a gap, or slammed into the far wall of one
  const gp=W.inGap(px);
  if((gp&&!W.inGap(s.x)&&s.y<gh-2.5)||s.y<-60){const gx=gp?gp.x1:s.x;s.x=gx+3;s.y=W.h(s.x);s.vx=P.startV*0.9;s.vy=0;s.ground=true;s.air=0;s.airMax=0;
    s.power=null;s.powerT=0;s.combo=1;s.falls++;s.invuln=P.invulnTicks;s.ev.push({t:'fall',x:s.x,y:s.y});gh=s.y;}
  if(s.y<=gh){const m=W.dh(s.x);const tl=Math.hypot(1,m);const tx=1/tl,ty=m/tl;const along=s.vx*tx+s.vy*ty;
    if(!s.ground){const sp=Math.hypot(s.vx,s.vy);const ang=Math.acos(Math.max(-1,Math.min(1,along/(sp||1))));let sp2=Math.max(along,0);
      if(ang<P.perfectAng&&m<P.perfectMaxSlope&&s.air>20){sp2*=P.perfectBoost;s.combo++;s.perfects++;s.daylight+=P.perfectDaylight;s.lastLanding='perfect';}
      else if(ang>P.badAng&&s.power!=='star'){sp2*=P.badKeep;s.combo=1;s.bads++;s.lastLanding='bad';}else s.lastLanding='ok';
      s.lastAng=ang;s.bestCombo=Math.max(s.bestCombo,s.combo);
      s.bonus+=flightPts(s.air,s.airMax,s.combo,TM(s));
      s.ev.push({t:'land',q:s.lastLanding,x:s.x,y:gh,sp:Math.hypot(s.vx,s.vy)});
      s.vx=sp2*tx;s.vy=sp2*ty;s.ground=true;s.air=0;s.airMax=0;}
    else{s.vx=along*tx;s.vy=along*ty;}
    s.y=gh;let sp=Math.hypot(s.vx,s.vy);if(sp<1e-6){s.vx=tx;s.vy=ty;sp=1;}
    if(press&&m<0){const k=(sp+P.diveAccel*(-m/tl)*DT)/sp;s.vx*=k;s.vy*=k;sp*=k;}
    const minV=s.power==='star'?18:P.minV;const nsp=Math.min(P.maxV,Math.max(minV,sp*(1-P.friction*DT)));s.vx*=nsp/sp;s.vy*=nsp/sp;}
  else{if(s.ground&&!press&&s.vy>0&&W.dh(px)>P.launchSlope){s.vy+=P.launchKick;s.ev.push({t:'launch',x:s.x,y:s.y});}
    s.ground=false;s.air++;const alt=s.y-Math.max(gh,-60);if(alt>s.airMax)s.airMax=alt;if(alt>s.maxAlt)s.maxAlt=alt;}
  // entities
  if(s.invuln>0)s.invuln--;
  if(s.power){s.powerT--;if(s.powerT<=0){s.ev.push({t:'powerEnd',p:s.power});s.power=null;}}
  const ents=W.ents;while(s.entLo<ents.length&&ents[s.entLo].x<s.x-40)s.entLo++;
  let beamTarget=null;const beamFire=s.power==='beam'&&s.powerT%P.beamEvery===0;
  for(let i=s.entLo;i<ents.length;i++){const e=ents[i];if(e.x>s.x+P.beamRange+10)break;if(e.dead||e.type==='landmark')continue;
    entPos(s,e);const dx=e.x-s.x,dy=(e.y+(e.type==='gem'||e.type==='star'||e.type==='beam'?0:1.2))-(s.y+1.2),d2=dx*dx+dy*dy;
    const enemy=e.type==='walker'||e.type==='flyer'||e.type==='spike';
    if(beamFire&&enemy&&!beamTarget&&dx>2&&Math.abs(dy)<12)beamTarget=e;
    if(e.lane!==undefined&&Math.abs(e.lane*P.laneW-s.laneZ)>1.8)continue;
    if(e.type==='barrier'){if(dx*dx<2.2&&s.y-W.h(s.x)<1.4){e.dead=true;s.ev.push({t:'barrierHit',x:e.x,y:e.y});hitPlayer(s);}continue;}
    const rr=e.type==='buddy'?P.buddyR:e.type==='gem'?(s.frenzyT>0?P.frenzyMagnet:2.4):e.type==='star'||e.type==='beam'?3.6:enemy?2.3:0;
    if(d2<rr*rr){
      if(e.type==='buddy'){e.dead=true;s.train.push(e.bi);s.rescued++;s.trainBest=Math.max(s.trainBest,s.train.length);s.ev.push({t:'rescue',bi:e.bi,x:e.x,y:e.y,n:s.train.length});}
      else if(e.type==='gem'){e.dead=true;s.gems++;s.nutMeter+=e.rare?3:1;if(e.rare)s.rareGems=(s.rareGems||0)+1;s.bonus+=nutPts(e.rare,s.combo,TM(s));s.ev.push({t:'gem',x:e.x,y:e.y,rare:!!e.rare});}
      else if(e.type==='star'||e.type==='beam'){e.dead=true;s.power=e.type;s.powerT=e.type==='star'?Math.round(P.starTicks*(hasTrait(s,'star')?P.starSynergy:1)):P.beamTicks;s.bonus+=powerPts(TM(s));
        if(e.type==='star'){const sp=Math.hypot(s.vx,s.vy);const k=Math.min(P.maxV,sp*1.25)/(sp||1);s.vx*=k;s.vy*=k;}s.ev.push({t:'power',p:e.type,x:e.x,y:e.y});}
      else if(s.power==='star')kill(s,e,'star');
      else if(e.type!=='spike'&&!s.ground&&s.vy<0&&dy<0.4){kill(s,e,'stomp');s.vy=P.stompBounce;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);}
      else if(e.type==='walker'&&s.ground&&Math.hypot(s.vx,s.vy)>P.bashSpeed){kill(s,e,'bash');}
      else hitPlayer(s);}
  }
  // DN nut frenzy: fill the meter -> nuts rain (auto nuts + magnet) for a few seconds
  if(s.frenzyT>0){s.frenzyT--;if(s.frenzyT%P.frenzyEvery===0){s.gems++;s.bonus+=rainPts(TM(s));s.ev.push({t:'rainNut'});}if(s.frenzyT===0)s.ev.push({t:'frenzyEnd'});}
  else if(s.nutMeter>=P.frenzyNeed){s.nutMeter=0;s.frenzyT=P.frenzyTicks;s.frenzies++;s.ev.push({t:'frenzy'});}
  if(beamFire&&hasTrait(s,'beam')){for(let i=s.entLo;i<ents.length;i++){const e=ents[i];if(e.x>s.x)break;const dx=e.x-s.x;
    if(!e.dead&&dx<-2&&dx>-P.rearRange&&(e.type==='walker'||e.type==='flyer'||e.type==='spike')){s.ev.push({t:'beam',rear:true,x:s.x,y:s.y+1.6,tx:e.x,ty:e.y+1});kill(s,e,'beam');break;}}}
  if(beamTarget){s.ev.push({t:'beam',x:s.x,y:s.y+1.6,tx:beamTarget.x,ty:beamTarget.y+1});kill(s,beamTarget,'beam');}
  const bi=Math.floor(Math.max(0,s.x)/BIOME_LEN);if(bi>s.biomeSeen){s.biomeSeen=bi;if(s.jumps<P.jumpMax){s.jumps++;s.ev.push({t:'jumpRefill',why:'biome'});}}
  if(s.lastLanding==='perfect'&&s.combo%P.jumpComboEvery===0&&s.jumps<P.jumpMax){s.jumps++;s.ev.push({t:'jumpRefill',why:'combo'});}
  s.daylight--;s.score=Math.floor(s.x*P.distPts)+s.bonus;if(s.daylight<=0)s.over=true;}

function result(s,mode){return {mode,seed:s.seed,score:s.score,distance:Math.floor(s.x),bestCombo:s.bestCombo,perfects:s.perfects,bads:s.bads,gems:s.gems,kills:s.kills,hits:s.hits,falls:s.falls,maxAlt:+s.maxAlt.toFixed(1),endTick:s.tick,jumpsUsed:s.jumpsUsed,train:s.train.slice(),trainBest:s.trainBest,rescued:s.rescued,lanesRun:s.lanesRun,frenzies:s.frenzies,launchQ:+s.launchQ.toFixed(2),replay:s.inputs.join('')};}
function replay(seed,str){const s=create(seed);for(const c of str)step(s,c.charCodeAt(0)-48);return result(s,'replay');}
function dailySeed(d){let h=2166136261;for(const c of d){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function landAng(s,press){let x=s.x,y=s.y,vx=s.vx,vy=s.vy;const g=press?P.gPress:P.g;
  for(let i=0;i<600;i++){vy-=g*DT;x+=vx*DT;y+=vy*DT;const h=s.W.h(x);if(h<=PIT+1)continue;if(y<=h){const m=s.W.dh(x);return Math.atan2(vy,vx)-Math.atan(m)+(m<0?0:10);}}return 99;}
// reference bot: press on downslopes; in the air pick whichever input gives the cleaner landing; never press over a gap
function botDive(s){const m=s.W.dh(s.x);if(s.ground)return m<0&&!s.W.inGap(s.x+s.vx*0.6);if(s.vy>0)return false;
  return Math.abs(landAng(s,true))<Math.abs(landAng(s,false));}
function botLane(s){const ents=s.W.ents;const look=s.vx*0.9;let blocked=[false,false,false],nut=[0,0,0],near=99;
  for(let i=s.entLo;i<ents.length;i++){const e=ents[i];const dx=e.x-s.x;if(dx>look)break;if(e.dead||e.lane===undefined||dx<0)continue;
    if(e.type==='barrier'){blocked[e.lane+1]=true;if(e.lane===s.lane)near=Math.min(near,dx);}else nut[e.lane+1]++;}
  const settled=Math.abs(s.laneZ-s.lane*P.laneW)<0.6;let target=s.lane;
  if(blocked[s.lane+1]||nut[s.lane+1]===0){let best=-9;for(let l=-1;l<=1;l++){if(Math.abs(l-s.lane)>1)continue;const v=(blocked[l+1]?-5:0)+nut[l+1]+(l===s.lane?0.5:0);if(v>best){best=v;target=l;}}}
  let b=0;if(settled&&target<s.lane)b|=4;else if(settled&&target>s.lane)b|=8;
  if(near<s.vx*0.22&&s.ground&&(target===s.lane||!settled))b|=2;return b;}
function botInput(s){if(s.inLane)return botLane(s);if(s.phase==='launch')return (s.pull<P.launchMinPull||launchMeter(s.pull)<0.94)?1:0;let b=botDive(s)?1:0;
  // stay glued to the ground (hold) when a stranded Skrumpey is just ahead, so the bot rescues it
  if(s.ground||s.y-s.W.h(s.x)<3){for(let i=s.entLo;i<s.W.ents.length;i++){const e=s.W.ents[i];const dx=e.x-s.x;if(dx>s.vx*0.6)break;if(e.type==='buddy'&&!e.dead&&dx>0&&!e.air&&e.lane===undefined){b|=1;break;}}}if(s.ground&&s.jumps>0){
  if(s.jumpsUsed===0&&s.x>20&&s.x<200)b|=2; // jumpstart on first ground contact after launch
  else if(s.power!=='star'){const sp=Math.hypot(s.vx,s.vy);for(let i=s.entLo;i<s.W.ents.length;i++){const e=s.W.ents[i];const dx=e.x-s.x;if(dx>sp*0.45)break;
    if(!e.dead&&dx>sp*0.25&&(e.type==='spike'||(e.type==='walker'&&sp<P.bashSpeed))){b=2;break;}}}}
  return b;}
const API={flightPts,nutPts,killPts,powerPts,rainPts,BUDDY_TRAITS,launchMeter,TM,DT,P,PIT,BIOMES,BIOME_LEN,rng,makeWorld,create,step,result,replay,dailySeed,botInput};
if(typeof module!=='undefined')module.exports=API;else root.SIM=API;
})(this);
