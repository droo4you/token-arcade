// Stable conversion from Token Arcade's opaque run seed to the Mood Swings uint32 seed.
// Keep this exact file shared by the browser adapter and server replay verifier.
(function (root) {
  function moodSwingsSeed(value) {
    let hash = 0x811c9dc5;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    }
    return hash >>> 0;
  }
  root.moodSwingsSeed = moodSwingsSeed;
  if (typeof module !== 'undefined' && module.exports) module.exports = { moodSwingsSeed };
})(typeof globalThis === 'object' ? globalThis : window);
