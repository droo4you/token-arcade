/* Token Arcade protocol 1. Classic-script client; no identity, credentials or economics. */
(() => {
  const params = new URLSearchParams(location.search);
  const host = params.get('ta_host');
  const channel = params.get('ta_channel');
  const embedded = parent !== window && params.get('ta') === '1' && !!channel && (window.TA_HOST_ORIGINS || []).includes(host);
  let adapter, config, active = false, running = false, completed = false, paused = false, destroyed = false, overlay;
  const send = (type, payload = {}) => { if (embedded && !destroyed) parent.postMessage({ ta: 1, channel, type, payload }, host); };
  const hideOverlay = () => { overlay?.remove(); overlay = null; };
  function pause(reason = 'host') {
    if (!active || paused || destroyed) return;
    paused = true; adapter.pause?.();
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', 'Game paused');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: '#161425f5', color: '#fff', display: 'grid', placeContent: 'center', font: '18px system-ui', textAlign: 'center' });
    const label = document.createElement('p'); label.textContent = 'Game paused';
    const button = document.createElement('button'); button.textContent = 'Resume game';
    Object.assign(button.style, { padding: '14px 24px', font: 'bold 18px system-ui', cursor: 'pointer', borderRadius: '12px', border: '0', background: '#d2ff5a' });
    button.addEventListener('click', resume); overlay.append(label, button); document.body.append(overlay);
    send('ta:paused', { reason });
  }
  function resume() { if (!active || destroyed) return; paused = false; hideOverlay(); adapter.resume?.(); send('ta:resumed'); }
  function beginRun(context) {
    if (!active || destroyed) return false;
    if (config.mode !== 'free' && (running || completed)) return false;
    if ((completed || running) && config.mode === 'free') config = { ...config, runId: crypto.randomUUID() };
    config = { ...config, startedAt: new Date().toISOString() };
    completed = false; running = true;
    send('ta:run_started', { runId: config.runId, startedAt: config.startedAt, ...(config.mode === 'free' && context ? { context } : {}) });
    return true;
  }
  const onMessage = async event => {
    if (!embedded || event.source !== parent || event.origin !== host || event.data?.ta !== 1 || event.data.channel !== channel || destroyed) return;
    const { type, payload } = event.data;
    try {
      if (type === 'ta:mount' && !active) {
        if (!payload || !['free', 'ranked', 'raid'].includes(payload.mode) || typeof payload.runId !== 'string' || typeof payload.gameId !== 'string' || payload.gameVersion !== (adapter.version || '1.0.0')) throw new Error('Invalid cartridge configuration.');
        config = Object.freeze({ ...payload }); active = true;
        await adapter.mount?.(config);
        send('ta:ready', { capabilities: adapter.capabilities || {} });
      } else if (active && type === 'ta:start' && !running && !completed) { adapter.start?.(); }
      else if (active && type === 'ta:pause') pause(payload?.reason);
      else if (active && type === 'ta:resume') resume();
      else if (active && type === 'ta:restart' && config.mode === 'free') { completed = true; running = false; resume(); adapter.restart?.(); }
      else if (active && type === 'ta:audio') adapter.audio?.(!!payload?.muted);
      else if (type === 'ta:destroy') {
        adapter.destroy?.(); hideOverlay(); send('ta:destroyed'); destroyed = true; active = false;
        removeEventListener('message', onMessage); removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility);
      }
    } catch (error) { send('ta:error', { fatal: true, message: error.message || 'Cartridge failed.' }); }
  };
  const onBlur = () => pause('blur');
  const onVisibility = () => { if (document.hidden) pause('hidden'); };
  window.TokenArcade = {
    embedded, get active() { return active; }, get config() { return config; }, get paused() { return paused; },
    register(value) { if (!embedded) return false; adapter = value; addEventListener('message', onMessage); addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility); send('ta:hello', { sdk: '1', gameVersion: adapter.version || '1.0.0' }); return true; },
    beginRun, pause, resume,
    complete(result) {
      if (!active || !running || completed || destroyed) return;
      completed = true; running = false;
      const { runId, gameId, gameVersion, mode, objective, seed, raidId, startedAt } = config;
      send('ta:run_complete', { ...result, runId, gameId, gameVersion, mode, objective, seed, raidId, startedAt, finishedAt: new Date().toISOString() });
    },
    error(message) { send('ta:error', { fatal: true, message }); }
  };
})();
