import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('./', import.meta.url);
let html = readFileSync(new URL('index.html', root), 'utf8');
function replace(before, after) {
  if (!html.includes(before)) throw new Error(`Source changed; review adapter anchor: ${before}`);
  html = html.replace(before, after);
}
replace('<script src="sim.js"></script>', '<script src="/sdk/hosts.js"></script><script src="/sdk/bridge.js"></script><script src="sim.js"></script>');
replace('const $=id=>document.getElementById(id);const params=new URLSearchParams(location.search);', `const TA=window.TokenArcade;
const hosted=TA?.embedded;
let arcadePaused=false, arcadeDestroyed=false, frameId=0;
const $=id=>document.getElementById(id);const params=new URLSearchParams(hosted ? '' : location.search);
THREE.DefaultLoadingManager.onError=url=>{ if(hosted) TA.error('Could not load game asset: '+url); };`);
replace('function ac(){', 'function ac(){if(arcadePaused||arcadeDestroyed)return AC;');
replace('loadBuddies();', "const buddiesReady=loadBuddies(); buddiesReady.catch(error=>hosted&&TA.error(error.message));");
replace(".classList.add('sel');loadChar(selected);", ".classList.add('sel');const characterReady=loadChar(selected); characterReady.catch(error=>hosted&&TA.error(error.message));");
replace('function start(m){ac();', "function start(m){if(hosted){if(!TA.active||arcadePaused||arcadeDestroyed||!TA.beginRun())return;m='free';}ac();");
replace("if(mode==='ranked'){const all=lb();", "if(!hosted&&mode==='ranked'){const all=lb();");
replace("$('oBoard').innerHTML=board;$('over').classList.remove('hid');}", `$('oBoard').innerHTML=board;$('over').classList.remove('hid');
 if(hosted) TA.complete({result:'completed',primaryMetric:r.score,durationMs:Math.round(r.endTick*SIM.DT*1000),secondaryMetrics:{distance:r.distance,bestCombo:r.bestCombo,perfects:r.perfects,collectibles:r.gems,kills:r.kills,hits:r.hits,falls:r.falls,rescued:r.rescued,trainBest:r.trainBest,ticks:r.endTick}});
}`);
replace('function frame(t){requestAnimationFrame(frame);', 'function frame(t){if(arcadeDestroyed)return;frameId=requestAnimationFrame(frame);if(arcadePaused){last=t;acc=0;return;}');
replace('requestAnimationFrame(t=>{last=t;frame(t);});', 'frameId=requestAnimationFrame(t=>{last=t;frame(t);});');
replace('window.GAME={CONFIG,start,', 'if(!hosted) window.GAME={CONFIG,start,');
replace('</script></body></html>', `
if(hosted){
  $('bRanked').hidden=true;
  $('bRanked').disabled=true;
  TA.register({version:'1.0.0',capabilities:{touch:true},
    async mount(config){
      if(config.mode!=='free')throw new Error('Skrumpey Slide competitive verification is not installed yet.');
      muted=Boolean(config.muted ?? true);
      await Promise.all([buddiesReady,characterReady]);
    },
    start(){},
    pause(){arcadePaused=true;held=false;jumpQueued=false;laneQ=0;swipeX=null;acc=0;AC?.suspend();},
    resume(){arcadePaused=false;held=false;jumpQueued=false;laneQ=0;acc=0;last=performance.now();if(!muted)AC?.resume();},
    restart(){start('free');},
    audio(value){muted=value;if(value)AC?.suspend();else if(!arcadePaused)AC?.resume();},
    destroy(){arcadeDestroyed=true;held=false;cancelAnimationFrame(frameId);clearInterval(musicTimer);AC?.close();draco.dispose();scene.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(!m)continue;for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});renderer.dispose();renderer.forceContextLoss();}
  });
}
</script></body></html>`);
writeFileSync(new URL('arcade.html', root), html);
console.log('Built Skrumpey Slide Free Play cartridge from unchanged standalone source.');
