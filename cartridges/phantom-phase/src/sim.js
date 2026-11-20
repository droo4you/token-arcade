// Phantom Phase scored simulation. Pure, fixed-step, portable.
// DOM-free. Unseeded randomness and the wall clock stay out of this file.
// Classic script in the browser (global PHANTOM) and require() from Node.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PHANTOM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TICK_HZ = 60;
  const SIM_VERSION = 'pp-sim-1';
  const RULES_VERSION = 'phantom-phase-1';
  const PROOF_FORMAT = 'ta-inputlog/1';
  const MAX_TICKS = 60 * 1200;
  const MAX_EVENTS = 20000;
  const MAX_EVENTS_PER_SEC = 16;

  // Slot index is also the sticky phase. Bits in a gate mask use 1 << slot.
  const SLOT = { CENTER: 0, TOP: 1, RIGHT: 2, BOTTOM: 3, LEFT: 4 };
  // Quantized commands. NONE holds the current slot. CENTER is 5 so it cannot
  // be confused with NONE. Edge commands match slot indexes.
  const CMD = { NONE: 0, TOP: 1, RIGHT: 2, BOTTOM: 3, LEFT: 4, CENTER: 5 };
  const RING = [1 << SLOT.TOP, 1 << SLOT.RIGHT, 1 << SLOT.BOTTOM, 1 << SLOT.LEFT];
  const ALL_OPEN = 31;

  function beatAt(tick) {
    if (tick < 1800) return 36;
    if (tick < 3600) return 36 - Math.floor((tick - 1800) * 12 / 1800);
    if (tick < 7200) return 24 - Math.floor((tick - 3600) * 12 / 3600);
    if (tick < 10800) return 12 - Math.floor((tick - 7200) * 2 / 3600);
    return 10;
  }

  function speedAt(tick) {
    if (tick < 600) return 170;
    if (tick >= 7200) return 460;
    return 170 + Math.floor((tick - 600) * 290 / 6600);
  }

  // Minimum ticks between gates. The opening is a full second-scale window.
  // Expert streams never close inside 10 ticks (167ms) of the previous note.
  function minGapAt(tick) {
    if (tick < 1800) return 56;
    if (tick < 3600) return 20;
    if (tick < 5400) return 14;
    return 10;
  }

  function phaseAt(tick) {
    if (tick < 1800) return 0;
    if (tick < 3600) return 1;
    if (tick < 5400) return 2;
    return 3;
  }

  function issuedSeed(value) {
    const text = String(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h >>>= 0;
    return h || 1;
  }

  function rngNext(state) {
    const a = (state.rng + 0x6D2B79F5) >>> 0;
    state.rng = a;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  function create(seed) {
    const s = (seed >>> 0) || 1;
    return {
      seed: s,
      rng: s,
      tick: 0,
      slot: SLOT.CENTER,
      distance: 0,
      score: 0,
      streak: 0,
      multiplier: 1,
      clears: 0,
      alive: true,
      finished: false,
      chartTick: 48,
      gates: [],
    };
  }

  function advance(state, beats) {
    const from = state.chartTick;
    let dt = beatAt(from) * beats;
    if (dt < 1) dt = 1;
    let hit = from + dt;
    const need = minGapAt(hit);
    if (hit - from < need) hit = from + need;
    state.chartTick = hit;
    return hit;
  }

  function wideStep(state) {
    const block = rngNext(state) % 5;
    return { open: ALL_OPEN ^ (1 << block), beats: 2, motif: 'wide' };
  }

  function sweepSteps(state) {
    const start = rngNext(state) % 4;
    const steps = [];
    for (let i = 0; i < 4; i++) {
      steps.push({ open: RING[(start + i) % 4], beats: 1, motif: 'sweep' });
    }
    return steps;
  }

  function centerSteps(state) {
    const a = RING[rngNext(state) % 4];
    const b = RING[rngNext(state) % 4];
    return [
      { open: 1 << SLOT.CENTER, beats: 1, motif: 'center' },
      { open: a, beats: 1, motif: 'center' },
      { open: 1 << SLOT.CENTER, beats: 1, motif: 'center' },
      { open: b, beats: 1, motif: 'center' },
    ];
  }

  function narrowStep(state) {
    const slot = rngNext(state) % 5;
    return { open: 1 << slot, beats: 2, motif: 'narrow' };
  }

  function holdSteps(state, count) {
    const open = RING[rngNext(state) % 4];
    const n = count || (6 + (rngNext(state) % 5));
    const steps = [];
    for (let i = 0; i < n; i++) steps.push({ open, beats: 1, motif: 'hold' });
    return steps;
  }

  function makePhrase(startTick, state) {
    const phase = phaseAt(startTick);
    const roll = rngNext(state) % 100;
    let steps;
    if (phase === 0) {
      steps = roll < 18
        ? [{ open: ALL_OPEN, beats: 2, motif: 'breath' }]
        : [wideStep(state)];
    } else if (phase === 1) {
      if (roll < 36) steps = [wideStep(state)];
      else if (roll < 70) steps = sweepSteps(state);
      else steps = centerSteps(state);
    } else if (phase === 2) {
      if (roll < 18) steps = [wideStep(state)];
      else if (roll < 40) steps = sweepSteps(state);
      else if (roll < 62) steps = centerSteps(state);
      else if (roll < 80) steps = [narrowStep(state)];
      else steps = holdSteps(state, 4 + (rngNext(state) % 3));
    } else if (roll < 28) steps = sweepSteps(state);
    else if (roll < 52) steps = centerSteps(state);
    else if (roll < 72) steps = [narrowStep(state)];
    else if (roll < 94) steps = holdSteps(state);
    else steps = [{ open: ALL_OPEN, beats: 2, motif: 'breath' }];
    if (phase > 0 && steps.length) steps[0].beats += 1;
    return steps;
  }

  function ensureChart(state) {
    const horizon = state.tick + beatAt(state.tick) * 8 + 24;
    let guard = 0;
    while (state.chartTick < horizon && guard++ < 24) {
      const steps = makePhrase(state.chartTick, state);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const hit = advance(state, step.beats);
        state.gates.push({ hit, open: step.open, motif: step.motif });
      }
    }
  }

  function applyCommand(state, command) {
    const cmd = command | 0;
    if (cmd === CMD.CENTER) state.slot = SLOT.CENTER;
    else if (cmd >= CMD.TOP && cmd <= CMD.LEFT) state.slot = cmd;
  }

  function step(state, command) {
    if (!state.alive) return state;
    if (state.tick >= MAX_TICKS) {
      state.alive = false;
      state.finished = true;
      return state;
    }
    applyCommand(state, command);
    ensureChart(state);
    const sp = speedAt(state.tick);
    state.distance += sp;
    state.score += 1 + Math.floor((sp - 170) / 80);
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      if (gate.hit !== state.tick) continue;
      if ((gate.open & (1 << state.slot)) === 0) {
        state.alive = false;
        state.tick += 1;
        return state;
      }
      state.clears += 1;
      state.streak += 1;
      state.multiplier = 1 + Math.min(7, Math.floor(state.streak / 4));
      state.score += 20 * state.multiplier;
    }
    state.tick += 1;
    if (state.gates.length > 80) {
      const next = [];
      for (let i = 0; i < state.gates.length; i++) {
        if (state.gates[i].hit >= state.tick) next.push(state.gates[i]);
      }
      state.gates = next;
    }
    return state;
  }

  function hashState(state) {
    let h = 2166136261 >>> 0;
    const mix = (n) => { h = Math.imul(h ^ (n >>> 0), 16777619) >>> 0; };
    mix(state.seed);
    mix(state.tick);
    mix(state.slot);
    mix(state.score);
    mix(state.streak);
    mix(state.multiplier);
    mix(state.clears);
    mix(state.distance);
    mix(state.alive ? 1 : 0);
    mix(state.chartTick);
    mix(state.rng);
    let shown = 0;
    for (let i = 0; i < state.gates.length && shown < 8; i++) {
      const gate = state.gates[i];
      if (gate.hit < state.tick) continue;
      mix(gate.hit);
      mix(gate.open);
      shown += 1;
    }
    mix(shown);
    return h >>> 0;
  }

  function replay(seed, events, endTick) {
    const state = create(seed);
    let index = 0;
    const list = events || [];
    while (state.alive && state.tick < endTick) {
      let command = CMD.NONE;
      while (index < list.length && list[index][0] === state.tick) {
        command = list[index][1];
        index += 1;
      }
      step(state, command);
    }
    return state;
  }

  function verifyProof(proof) {
    if (!proof || proof.format !== PROOF_FORMAT) return { ok: false, reason: 'format' };
    if (proof.tickHz !== TICK_HZ || proof.simVersion !== SIM_VERSION) return { ok: false, reason: 'version' };
    if (!Number.isSafeInteger(proof.seed) || proof.seed < 1) return { ok: false, reason: 'seed' };
    if (!Number.isSafeInteger(proof.endTick) || proof.endTick < 1 || proof.endTick > MAX_TICKS + 1) {
      return { ok: false, reason: 'end' };
    }
    if (!Number.isSafeInteger(proof.score) || proof.score < 0) return { ok: false, reason: 'score-type' };
    if (!Array.isArray(proof.events) || proof.events.length > MAX_EVENTS) return { ok: false, reason: 'events' };
    let last = -1;
    let left = 0;
    for (let i = 0; i < proof.events.length; i++) {
      const ev = proof.events[i];
      if (!Array.isArray(ev) || ev.length !== 2) return { ok: false, reason: 'event' };
      const t = ev[0];
      const c = ev[1];
      if (!Number.isSafeInteger(t) || t < 0 || t >= proof.endTick) return { ok: false, reason: 'event-tick' };
      if (t < last) return { ok: false, reason: 'order' };
      last = t;
      if (!Number.isSafeInteger(c) || c < CMD.TOP || c > CMD.CENTER) return { ok: false, reason: 'command' };
      while (proof.events[left][0] + TICK_HZ <= t) left += 1;
      if (i - left + 1 > MAX_EVENTS_PER_SEC) return { ok: false, reason: 'input-rate' };
    }
    const state = replay(proof.seed, proof.events, proof.endTick);
    const hash = hashState(state);
    if (state.score !== proof.score) return { ok: false, reason: 'score', score: state.score, hash };
    if ((hash >>> 0) !== (proof.hash >>> 0)) return { ok: false, reason: 'hash', score: state.score, hash };
    return {
      ok: true,
      score: state.score,
      hash,
      alive: state.alive,
      clears: state.clears,
      streak: state.streak,
      distance: state.distance,
      ticks: state.tick,
    };
  }

  return {
    TICK_HZ, SIM_VERSION, RULES_VERSION, PROOF_FORMAT, MAX_TICKS,
    SLOT, CMD, RING, ALL_OPEN,
    beatAt, speedAt, minGapAt, phaseAt, issuedSeed,
    create, step, hashState, replay, verifyProof,
  };
});
