const S=require('./sim.js');
function run(seed,policy){const s=S.create(seed);const pw={};while(!s.over){S.step(s,policy(s));for(const e of s.ev)if(e.t==='power')pw[e.p]=(pw[e.p]||0)+1;}const r=S.result(s,'free');r.pw=pw;return r;}
for(const seed of [1,2,3,S.dailySeed('2026-10-11')]){const b=run(seed,S.botInput),n=run(seed,()=>false),a=run(seed,()=>true);const rp=S.replay(seed,b.replay);
 console.log('seed',seed,'bot',b.score,'dist',b.distance,'combo',b.bestCombo,'perf',b.perfects,'bad',b.bads,'gems',b.gems,'kills',b.kills,'hits',b.hits,'falls',b.falls,'power',JSON.stringify(b.pw),'| idle',n.score,n.distance,'| hold',a.score,'| replay',rp.score===b.score&&rp.endTick===b.endTick);}
