import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { GameRunConfig, GameRunResult, Raid } from "../../../packages/sdk/src/index.ts";
import { createMoodVerifier } from "../src/moodVerification.ts";
import { ArcadeStore } from "../src/store.ts";
import { createArcadeServer } from "../src/server.ts";
const require = createRequire(import.meta.url);
const M = require("../../../cartridges/emonad-cabinet/releases/2.0.0/sim.js");
const P = require("../../../cartridges/emonad-cabinet/releases/2.0.0/progress.js");

function complete(seed = "issued-mood", follow = false) {
  const run = M.create(seed), inputs: number[] = [];
  while (!run.state.shown && inputs.length < M.MAX_STEPS) {
    const x = follow ? Math.max(0, Math.min(390, Math.round(run.state.head.x - run.state.cam.x))) : 195;
    inputs.push(x); run.tick(x);
  }
  assert.equal(run.state.shown, true);
  return { run, inputs };
}
test("Mood Swings replay is deterministic, bounded and independent of cosmetic choices", () => {
  for (const follow of [false, true]) {
    const a = complete("same", follow), b = complete("same", follow);
    assert.deepEqual(a.run.state, b.run.state);
    const p = P.fresh(); p.earned = 100; P.select(p, "skrumpey"); P.select(p, "afterglow");
    const c = complete("same", follow); assert.deepEqual(M.metrics(c.run.state), M.metrics(a.run.state));
    assert.ok(a.inputs.length <= 36000);
  }
  assert.notDeepEqual(complete("different", true).run.state, complete("same", true).run.state);
});
test("Hype doubles Good Vibes, Euphoria boosts catches for six seconds, Hoodie Up protects once", () => {
  const run = M.create("mechanics"), s = run.state;
  const give = (kind: string) => { s.pickups.push({ kind, x: s.head.x + s.head.vx * M.STEP, y: s.head.y }); run.tick(195); };
  give("hype"); assert.ok(s.hype > 7.9); give("vibe"); assert.equal(s.vibes, 2); assert.equal(s.meter, 2);
  give("vibe"); give("vibe"); assert.equal(s.vibes, 6); assert.equal(s.euphorias, 1); assert.equal(s.meter, 1); assert.equal(s.euphoria, 6);
  const normal = M.create("boost"), frenzy = M.create("boost");
  for (const r of [normal, frenzy]) { r.state.head.y = .1; r.state.head.vy = -10; r.state.head.x = 0; }
  frenzy.state.euphoria = 6;
  normal.tick(175); frenzy.tick(175);
  assert.ok(frenzy.state.head.vy > normal.state.head.vy * 1.19);
  give("hoodie"); assert.equal(s.shield, true);
  s.head.y = .1; s.head.vy = -100; s.base = 0; s.baseT = 0; s.head.x = s.cam.x + 195; s.armed = true;
  run.tick(0); assert.equal(s.over, false); assert.equal(s.shield, false);
  give("sad"); assert.ok(s.head.vy < 0); assert.equal(s.rain, 1);
  const expire = M.create("expiry"); expire.state.euphoria = 6; expire.state.shield = true;
  for (let i=0;i<721;i++) expire.tick(Math.max(0,Math.min(390,Math.round(expire.state.head.x-expire.state.cam.x))));
  assert.equal(expire.state.euphoria, 0);
});
test("packed replays fit the API limit and reject malformed samples", () => {
  const inputs = Array.from({length: 36000}, (_,i) => i % 391), encoded = M.encode(inputs);
  assert.deepEqual(M.decode(encoded,inputs.length),inputs);
  assert.ok(JSON.stringify({v:1,seed:"sample",steps:inputs.length,track:encoded}).length < 60000);
  assert.throws(()=>M.decode(encoded,35999)); assert.throws(()=>M.decode("!!!!",3));
  assert.throws(()=>M.decode(M.encode([511]),1)); assert.throws(()=>M.decode(encoded,36001));
});
test("cosmetic balances cannot be spent twice and corrupt browser saves normalize", () => {
  const p = P.fresh(); assert.equal(P.select(p, "skrumpey"), false);
  p.earned = 30; assert.equal(P.select(p, "skrumpey"), true); assert.equal(P.balance(p), 15);
  assert.equal(P.select(p, "skrumpey"), true); assert.equal(P.balance(p), 15);
  assert.equal(P.select(p, "moonrise"), false); assert.equal(P.select(p, "unknown"), false);
  assert.deepEqual(P.normalize({ earned: -10, avatar: "unknown", unlocked: ["molandak"] }), P.fresh());
  assert.deepEqual(P.normalize(JSON.parse(JSON.stringify(p))), p);
});
test("Mood verifier rejects forged metrics, wrong seed/version, partial and extended proofs", async () => {
  const { run, inputs } = complete();
  const config: GameRunConfig = { runId: "mood", gameId: "emonad-cabinet", gameVersion: "2.0.0", mode: "ranked", objective: "score", seed: "issued-mood", rules: { viewportWidth: 390, viewportHeight: 844 }, startedAt: new Date(Date.now()-310000).toISOString() };
  const proof = (input: number[], seed = config.seed) => ({ v: 1, seed, steps: input.length, track: M.encode(input) });
  const result: GameRunResult = { ...config, ...M.metrics(run.state), result: "completed", finishedAt: new Date().toISOString(), proof: proof(inputs) };
  const verifier = createMoodVerifier(); assert.equal((await verifier.verify(config, result)).valid, true);
  for (const changed of [ { primaryMetric: result.primaryMetric + 1 }, { secondaryMetrics: { ...result.secondaryMetrics, goodVibes: 999 } }, { proof: proof(inputs, "wrong") }, { proof: proof(inputs.slice(0,-1)) }, { proof: proof([...inputs,195]) }, { proof: {v:1,seed:config.seed,steps:NaN,track:"AAAA"} } ]) assert.equal((await verifier.verify(config, {...result,...changed})).valid,false);
  assert.equal((await verifier.verify({...config,gameVersion:"1.0.0"},result)).valid,false);
  assert.equal((await verifier.verify({...config,startedAt:new Date().toISOString()},result)).valid,false);
});
test("Mood raid uses three attempts and one seed; best Mood then Good Vibes ranks separately from its goal", async () => {
  const store = new ArcadeStore(":memory:", true), server = createArcadeServer({store,authSettings:{localDemoMode:true},staticRoot:"nonexistent"});
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const api=async(path:string,body?:unknown,player="alice")=>{const r=await fetch(origin+path,{method:body?"POST":"GET",headers:{authorization:`Bearer local-demo:${player}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json() as any};};
  const raid: Raid={id:"mood-raid",gameId:"emonad-cabinet",name:"Mood raid",communityId:"emonad",objective:"score",seed:"shared",maxAttempts:3,startsAt:new Date(Date.now()-10000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString(),reward:{type:"none"},feeSplitBps:{prize:0,community:0,treasury:10000},status:"open",rules:{viewportWidth:390,viewportHeight:844}};
  raid.gameVersion = "2.0.0";
  store.saveRaid(raid);
  try {
    for(let i=0;i<3;i++){
      const issued=await api('/api/runs',{gameId:raid.gameId,mode:'raid',raidId:raid.id});assert.equal(issued.status,201);assert.equal(issued.body.run.seed,'shared');
      const config=issued.body.run as GameRunConfig;const session=store.getSession(config.runId)!;
      const result:GameRunResult={...config,result:'completed',primaryMetric:i===2?900:1000,secondaryMetrics:{goodVibes:[2,5,20][i]},finishedAt:new Date().toISOString()};
      store.acceptResult(session,result,p=>p);
    }
    assert.equal((await api('/api/runs',{gameId:raid.gameId,mode:'raid',raidId:raid.id})).status,409);
    const bob=await api('/api/runs',{gameId:raid.gameId,mode:'raid',raidId:raid.id},'bob');assert.equal(bob.body.run.seed,'shared');
    store.acceptResult(store.getSession(bob.body.run.runId)!,{...bob.body.run,result:'completed',primaryMetric:1000,secondaryMetrics:{goodVibes:6},finishedAt:new Date().toISOString()},p=>p);
    const view=(await api('/api/raids/mood-raid')).body;
    assert.equal(view.leaderboard.length,2);assert.equal(view.leaderboard[0].secondaryMetrics.goodVibes,6);assert.equal(view.leaderboard[1].secondaryMetrics.goodVibes,5);
    assert.equal(view.moodGoal.goodVibes,33);assert.equal(view.moodGoal.runs,4);
    store.saveRaid({...raid,id:'archived-v1',gameVersion:undefined,status:'closed'});
    assert.equal((await api('/api/raids/archived-v1')).body.moodGoal,undefined,'old raids keep their original goal semantics');
    const oldConfig:GameRunConfig={runId:'old-score',gameId:raid.gameId,gameVersion:'1.0.0',mode:'ranked',objective:'score',rules:raid.rules,startedAt:new Date().toISOString()};
    const oldPlayer=store.getOrCreatePassport('old-player');const oldSession={config:oldConfig,playerId:oldPlayer.playerId};
    store.createSession(oldSession);store.acceptResult(oldSession,{...oldConfig,result:'completed',primaryMetric:999999999,finishedAt:new Date().toISOString()},p=>p);
    assert.equal((await api('/api/leaderboards/emonad-cabinet')).body.entries.length,0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
test("Mood migration preserves old history and waits for live v1 sessions and raids", () => {
  const dir=mkdtempSync(join(tmpdir(),'mood-migration-')),file=join(dir,'arcade.sqlite');let store=new ArcadeStore(file,false);
  try{
    const old=store.getGame('emonad-cabinet')!;
    old.manifest={...old.manifest,version:'1.0.0',adapterId:'buy-bounce',entry:{kind:'iframe',origin:'https://cart.example',url:'https://cart.example/emonad-cabinet/v/1.0.0/'}};old.legacyImportRevision=4;old.status='paused';store.saveGame(old);
    const passport=store.getOrCreatePassport('migration');
    const config:GameRunConfig={gameId:old.manifest.id,gameVersion:'1.0.0',runId:'pending',mode:'ranked',objective:'score',startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+100000).toISOString()};
    store.createSession({config,playerId:passport.playerId});store.close();store=new ArcadeStore(file,false);assert.equal(store.getGame(old.manifest.id)?.manifest.version,'1.0.0');
    store.acceptResult(store.getSession('pending')!,{...config,result:'completed',primaryMetric:999999,finishedAt:new Date().toISOString()},p=>p);
    const raid: Raid={id:'old-raid',gameId:old.manifest.id,name:'Old raid',communityId:'emonad',objective:'score',seed:'old',maxAttempts:3,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+100000).toISOString(),reward:{type:'none'},feeSplitBps:{prize:0,community:0,treasury:10000},status:'open'};
    store.saveRaid(raid);store.close();store=new ArcadeStore(file,false);assert.equal(store.getGame(old.manifest.id)?.manifest.version,'1.0.0');
    store.saveRaid({...raid,status:'cancelled'});store.close();store=new ArcadeStore(file,false);
    const migrated=store.getGame(old.manifest.id)!;assert.equal(migrated.manifest.version,'2.0.0');assert.equal(migrated.manifest.entry?.url,'https://cart.example/emonad-cabinet/v/2.0.0/');assert.equal(migrated.status,'paused');assert.equal(store.listAcceptedResults(old.manifest.id,'ranked')[0].result.primaryMetric,999999);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
