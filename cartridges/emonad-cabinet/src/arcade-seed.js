// Stable conversion from Token Arcade's opaque run seed to Buy Bounce's uint32 seed.
// Keep this exact file shared by the browser adapter and server replay verifier.
(function (root) {
  function buyBounceSeed(value) {
    let hash = 0x811c9dc5;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    }
    return hash >>> 0;
  }
  root.buyBounceSeed = buyBounceSeed;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buyBounceSeed };
})(typeof globalThis === 'object' ? globalThis : window);
