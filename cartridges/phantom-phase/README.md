# Phantom Phase

Five-slot tunnel run. Swipe or press an edge and the ghost stays there. Tap, Space, C, or Shift returns to center. Phase changes snap. The vault throws beat-synced gates that always leave a way through.

## Play

Static site, no build. Publish directory: `cartridges/phantom-phase`. Entry: `index.html`.

```bash
node cartridges/phantom-phase/tools/serve.mjs
```

Hosted cartridge path on the arcade origin: `/phantom-phase/v/1.0.0/` (`arcade.html` loads `/sdk/hosts.js` and `/sdk/bridge.js`).

## Checks

```bash
node --test cartridges/phantom-phase/tests/sim.test.mjs
node cartridges/phantom-phase/tools/verify.js --self-test
node cartridges/phantom-phase/tests/browser.mjs
```

The browser script needs `playwright-core` and Chrome. It writes title and gameplay screenshots for 1440×900 and 390×844.
