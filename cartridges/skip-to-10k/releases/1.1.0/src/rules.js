// Shared browser/server rules. Open accepts a bounded browser-owned loadout;
// fixed boards have no progression or rock bonuses. No randomness or storage here.
const SKIP_RULES = (() => {
  const FORMAT = 'skip-four-v1';
  const BOARDS = ['open', 'zero', 'mid', 'max'];
  const RAID_BOARDS = ['zero', 'mid', 'max'];
  const KEYS = ['arm', 'rock', 'hands', 'aero', 'bounce', 'rc', 'volume'];
  function loadout(board, saved) {
    if (!BOARDS.includes(board)) throw Error('Unknown Skip board');
    if (board !== 'open') return { up: Object.fromEntries(KEYS.map(k => [k, board === 'max' ? 5 : board === 'mid' ? 3 : 0])), rock: 0, rocks: 1, rank: 0 };
    if (!saved || !saved.up || Object.keys(saved.up).some(k => !KEYS.includes(k))) throw Error('Invalid Open upgrades');
    const up = {};
    for (const k of KEYS) {
      const v = saved.up[k] ?? 0;
      if (!Number.isInteger(v) || v < 0 || v > 5) throw Error('Invalid Open upgrade level');
      up[k] = v;
    }
    for (const [key, min, max] of [['rock', 0, 99], ['rocks', 1, 100], ['rank', 0, 11]]) {
      if (!Number.isInteger(saved[key]) || saved[key] < min || saved[key] > max) throw Error('Invalid Open progression');
    }
    return { up, rock: saved.rock, rocks: saved.rocks, rank: saved.rank };
  }
  const multiplier = peak => peak >= 30000 ? 4 : peak >= 10000 ? 3 : peak >= 5000 ? 2 : 1;
  function metrics(r, gear) {
    return { score: r.days * multiplier(r.peak), distance: r.days, priceMultiplier: multiplier(r.peak),
      gwei: Math.round(r.earned * (1 + .05 * gear.rank + .02 * (gear.rocks - 1))) };
  }
  return { FORMAT, BOARDS, RAID_BOARDS, KEYS, loadout, multiplier, metrics };
})();
if (typeof module !== 'undefined') module.exports = SKIP_RULES;
