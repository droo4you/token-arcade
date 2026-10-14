import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('sound button unmutes a muted game and resumes interrupted audio', async () => {
  const html = readFileSync(new URL('../../../cartridges/skrumpey-slide/index.html', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('let AC=null,muted='), html.indexOf('const SFX='));
  const node = () => ({ gain: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 }, threshold: { value: 0 }, connect() { return this; } });
  class AudioContext {
    state = 'suspended'; destination = {};
    addEventListener() {}
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain = node; createBiquadFilter = node; createDynamicsCompressor = node;
  }
  const button = { textContent: '', title: '', classList: { toggle() {} }, setAttribute() {} };
  const context: any = { window: { AudioContext }, navigator: { audioSession: { type: 'auto' } }, CONFIG: { music: true }, params: new URLSearchParams('mute=1'),
    $: () => button, setTimeout() {}, setInterval() { return 1; } };
  runInNewContext(source + ';globalThis.control={toggleMusic, get:()=>({muted,musicOn,state:AC?.state}), interrupt:()=>{AC.state="interrupted";}};', context);
  context.control.toggleMusic(); await Promise.resolve();
  assert.equal(context.control.get().muted, false);
  assert.equal(context.control.get().state, 'running');
  assert.equal(context.navigator.audioSession.type, 'playback');
  assert.equal(button.textContent, 'SOUND ON');
  context.control.toggleMusic();
  assert.equal(context.control.get().muted, true);
  assert.equal(button.textContent, 'SOUND OFF');
  context.control.toggleMusic(); context.control.interrupt(); context.control.toggleMusic(); await Promise.resolve();
  assert.equal(context.control.get().state, 'running');
  assert.equal(context.control.get().musicOn, true);
});
