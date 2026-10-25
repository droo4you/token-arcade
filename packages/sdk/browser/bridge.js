/* Token Arcade protocol 1. Classic-script client; no credentials or economics. */
(() => {
  const params = new URLSearchParams(location.search);
  const host = params.get('ta_host');
  const channel = params.get('ta_channel');
  const embedded = parent !== window && params.get('ta') === '1' && !!channel && (window.TA_HOST_ORIGINS || []).includes(host);
  let adapter, config, active = false, running = false, completed = false, paused = false, destroyed = false, overlay;
  const send = (type, payload = {}) => { if (embedded && !destroyed) parent.postMessage({ ta: 1, channel, type, payload }, host); };
  const hideOverlay = () => { overlay?.remove(); overlay = null; };
  // Account storage is a separate namespace. Guest keys are never overwritten.
  let progress = null, progressTimer = null, progressRetry = null, releaseProgress = null;
  const uuid = () => crypto.randomUUID();
  async function progressRead(payload) {
    if (!payload || !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.scope) || !Array.isArray(payload.keys) || payload.keys.length > 8 || payload.keys.some(k => typeof k !== 'string' || k.length > 160)) throw Error('Invalid save scope');
    // One writer per account/game in this browser prevents two tabs from sharing an outbox.
    if (!navigator.locks) throw Error('Account saving needs browser storage locks');
    const acquired = await new Promise(resolve => {
      navigator.locks.request('ta.progress.' + payload.scope + '.' + payload.gameId, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        return new Promise(release => { releaseProgress = release; resolve(true); });
      }).catch(() => resolve(false));
    });
    if (!acquired || destroyed || active) { releaseProgress?.(); releaseProgress = null; throw Error('Account save is already open in another tab'); }
    const storage = localStorage;
    const get = storage.getItem.bind(storage), set = storage.setItem.bind(storage), remove = storage.removeItem.bind(storage);
    const prefix = 'ta.account.' + payload.scope + ':', metaKey = prefix + payload.gameId + ':sync';
    const parse = key => { try { return JSON.parse(get(key)); } catch { return null; } };
    const snapshot = scoped => Object.fromEntries(payload.keys.map(key => [key, parse((scoped ? prefix : '') + key)]).filter(([, value]) => value !== null));
    let deviceId = get('ta.progress.device');
    if (!deviceId) { deviceId = uuid(); set('ta.progress.device', deviceId); }
    const meta = parse(metaKey) || { base: {}, pending: null, cacheId: null };
    const state = snapshot(true), base = meta.pending?.state || meta.base || {};
    if (JSON.stringify(state) !== JSON.stringify(base) && !meta.cacheId) { meta.cacheId = uuid(); set(metaKey, JSON.stringify(meta)); }
    progress = { storage, get, set, remove, prefix, metaKey, keys: payload.keys, snapshot, meta, enabled: false };
    send('ta:progress_snapshot', { deviceId, guest: snapshot(false), ...(meta.pending ? { pending: meta.pending } : {}),
      ...(meta.cacheId ? { local: { id: meta.cacheId, base, state } } : {}) });
  }
  function progressFlush() {
    if (!progress?.enabled || destroyed) return;
    try {
    const p = progress;
    if (!p.meta.pending) {
      const state = p.snapshot(true);
      if (JSON.stringify(state) === JSON.stringify(p.meta.base)) return;
      p.meta.pending = { id: p.meta.cacheId || uuid(), base: p.meta.base, state };
      p.set(p.metaKey, JSON.stringify(p.meta));
    }
    send('ta:progress_save', p.meta.pending);
    clearTimeout(progressRetry);
    progressRetry = setTimeout(progressFlush, 15000);
    } catch { send('ta:progress_unavailable'); }
  }
  function progressApply(state) {
    const p = progress;
    if (!p || !state || typeof state !== 'object' || JSON.stringify(state).length > 24000) throw Error('Invalid account save');
    for (const key of p.keys) {
      if (state[key] === undefined) p.remove(p.prefix + key);
      else p.set(p.prefix + key, JSON.stringify(state[key]));
    }
    p.meta = { base: state, pending: null, cacheId: null };
    p.set(p.metaKey, JSON.stringify(p.meta)); p.enabled = true;
    const proto = Object.getPrototypeOf(p.storage), get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
    const mapped = (storage, key) => storage === p.storage && p.keys.includes(String(key));
    const changed = () => {
      try { p.meta.cacheId = uuid(); p.set(p.metaKey, JSON.stringify(p.meta)); clearTimeout(progressTimer); progressTimer = setTimeout(progressFlush, 150); }
      catch { send('ta:progress_unavailable'); }
    };
    proto.getItem = function(key) { return get.call(this, mapped(this, key) ? p.prefix + key : key); };
    proto.setItem = function(key, value) {
      if (!mapped(this, key)) return set.call(this, key, value);
      const prior = p.get(p.prefix + key); set.call(this, p.prefix + key, value); if (prior !== String(value)) changed();
    };
    proto.removeItem = function(key) { if (!mapped(this, key)) return remove.call(this, key); remove.call(this, p.prefix + key); changed(); };
    p.restore = () => { proto.getItem = get; proto.setItem = set; proto.removeItem = remove; };
    send('ta:progress_ready');
  }
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
    if (typeof type === 'string' && type.startsWith('ta:progress_')) {
      try {
        if (type === 'ta:progress_read' && !active && !progress) await progressRead(payload);
        else if (type === 'ta:progress_apply' && !active && !progress?.enabled) progressApply(payload);
        else if (type === 'ta:progress_ack' && progress?.meta.pending?.id === payload?.id) {
          clearTimeout(progressRetry);
          progress.meta.base = progress.meta.pending.state; progress.meta.pending = null;
          progress.set(progress.metaKey, JSON.stringify(progress.meta)); progressFlush();
        }
      } catch { if (!progress?.enabled) { releaseProgress?.(); releaseProgress = null; } send('ta:progress_unavailable'); }
      return;
    }
    try {
      if (type === 'ta:mount' && !active) {
        if (!payload || !['free', 'ranked', 'raid'].includes(payload.mode) || typeof payload.runId !== 'string' || typeof payload.gameId !== 'string' || payload.gameVersion !== (adapter.version || '1.0.0')) throw new Error('Invalid cartridge configuration.');
        config = Object.freeze({ ...payload }); active = true;
        if (!progress?.enabled) { releaseProgress?.(); releaseProgress = null; }
        await adapter.mount?.(config);
        send('ta:ready', { capabilities: adapter.capabilities || {} });
      } else if (active && type === 'ta:start' && !running && !completed) { adapter.start?.(); }
      else if (active && type === 'ta:pause') pause(payload?.reason);
      else if (active && type === 'ta:resume') resume();
      else if (active && type === 'ta:restart' && config.mode === 'free') { completed = true; running = false; resume(); adapter.restart?.(); }
      else if (active && type === 'ta:audio') adapter.audio?.(!!payload?.muted);
      else if (type === 'ta:destroy') {
        if (progressTimer) clearTimeout(progressTimer); if (progressRetry) clearTimeout(progressRetry); progress?.restore?.();
        releaseProgress?.(); releaseProgress = null;
        adapter.destroy?.(); hideOverlay(); send('ta:destroyed'); destroyed = true; active = false;
        removeEventListener('message', onMessage); removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility);
      }
    } catch (error) { send('ta:error', { fatal: true, message: error.message || 'Cartridge failed.' }); }
  };
  const onBlur = () => pause('blur');
  const onVisibility = () => { if (document.hidden) pause('hidden'); };
  window.TokenArcade = {
    embedded, get active() { return active; }, get config() { return config; }, get paused() { return paused; }, get accountProgress() { return !!progress?.enabled; },
    register(value) { if (!embedded) return false; adapter = value; addEventListener('message', onMessage); addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility); send('ta:hello', { sdk: '1', gameVersion: adapter.version || '1.0.0', progress: true }); return true; },
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
