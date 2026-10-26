/* Casual browser progress only. Never consumed by a competitive verifier. */
(function(root) {
  const ITEMS = [
    { id: 'emonad', name: 'Emonad', type: 'avatar', cost: 0 },
    { id: 'skrumpey', name: 'Skrumpey', type: 'avatar', cost: 15 },
    { id: 'molandak', name: 'Molandak', type: 'avatar', cost: 30 },
    { id: 'weather', name: 'Weather report', type: 'theme', cost: 0 },
    { id: 'afterglow', name: 'Afterglow', type: 'theme', cost: 10 },
    { id: 'moonrise', name: 'Moonrise', type: 'theme', cost: 20 }
  ];
  const fresh = () => ({ bestMood: 0, earned: 0, unlocked: ['emonad', 'weather'], avatar: 'emonad', theme: 'weather' });
  function normalize(value) {
    const v = value && typeof value === 'object' ? value : {};
    const n = x => Number.isSafeInteger(x) && x >= 0 ? Math.min(x, 1e9) : 0;
    const p = { ...fresh(), bestMood: n(v.bestMood), earned: n(v.earned) };
    for (const item of ITEMS) if (Array.isArray(v.unlocked) && v.unlocked.includes(item.id) && balance(p) >= item.cost && !p.unlocked.includes(item.id)) p.unlocked.push(item.id);
    for (const type of ['avatar', 'theme']) if (ITEMS.some(i => i.id === v[type] && i.type === type) && p.unlocked.includes(v[type])) p[type] = v[type];
    return p;
  }
  const balance = p => p.earned - ITEMS.filter(i => p.unlocked.includes(i.id)).reduce((n, i) => n + i.cost, 0);
  function select(p, id) {
    const item = ITEMS.find(i => i.id === id);
    if (!item || (!p.unlocked.includes(id) && balance(p) < item.cost)) return false;
    if (!p.unlocked.includes(id)) p.unlocked.push(id);
    p[item.type] = id; return true;
  }
  const api = { ITEMS, fresh, normalize, balance, select };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoodProgress = api;
})(typeof globalThis === 'object' ? globalThis : this);
