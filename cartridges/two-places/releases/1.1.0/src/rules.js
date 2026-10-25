// Pure rules shared by the cartridge and verifier. Level numbers are zero-based.
const TWO_RULES = (() => {
  const FORMAT = 'two-levels-v1', LEVEL_COUNT = 20, MAX_FRAMES = 30000;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function order(seed) {
    let state = 2166136261;
    for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
    const levels = Array.from({ length: LEVEL_COUNT }, (_, i) => i);
    for (let i = levels.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = Math.floor(state / 4294967296 * (i + 1));
      [levels[i], levels[j]] = [levels[j], levels[i]];
    }
    return levels;
  }
  function encode(track) {
    return track.map(v => alphabet[v & 63] + alphabet[(v >>> 6) & 63] + alphabet[(v >>> 12) & 63] + alphabet[(v >>> 18) & 63]).join('');
  }
  function decode(track) {
    if (typeof track !== 'string' || track.length % 4 || track.length > MAX_FRAMES * 4 || !/^[A-Za-z0-9+/]*$/.test(track)) throw Error('Invalid input track');
    const values = [];
    for (let i = 0; i < track.length; i += 4) {
      const value = alphabet.indexOf(track[i]) | alphabet.indexOf(track[i + 1]) << 6 | alphabet.indexOf(track[i + 2]) << 12 | alphabet.indexOf(track[i + 3]) << 18;
      if (value >= (1 << 22)) throw Error('Invalid input frame');
      values.push(value);
    }
    return values;
  }
  return { FORMAT, LEVEL_COUNT, MAX_FRAMES, order, encode, decode };
})();
if (typeof module !== 'undefined') module.exports = TWO_RULES;
