// Headless replay verifier for Phantom Phase. Same sim the cartridge plays.
// node tools/verify.js --self-test
// node tools/verify.js proof.json
const PHANTOM = require('../src/sim.js');

function selfTest() {
  const events = [[30, 1], [90, 5], [150, 2], [220, 4], [300, 3], [380, 5], [460, 1]];
  const endTick = 700;
  const state = PHANTOM.replay(42, events, endTick);
  const proof = {
    format: PHANTOM.PROOF_FORMAT,
    tickHz: PHANTOM.TICK_HZ,
    simVersion: PHANTOM.SIM_VERSION,
    rulesVersion: PHANTOM.RULES_VERSION,
    seed: 42,
    events,
    endTick,
    score: state.score,
    hash: PHANTOM.hashState(state),
  };
  const ok = PHANTOM.verifyProof(proof);
  if (!ok.ok) {
    console.error(ok);
    process.exit(1);
  }
  const forged = Object.assign({}, proof, { score: proof.score + 1 });
  const bad = PHANTOM.verifyProof(forged);
  if (bad.ok) {
    console.error('forged score accepted');
    process.exit(1);
  }
  const other = PHANTOM.replay(42, events, endTick);
  if (other.score !== state.score || PHANTOM.hashState(other) !== proof.hash) {
    console.error('replay diverged');
    process.exit(1);
  }
  console.log('phantom-phase verify self-test ok', proof.score, proof.hash);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/verify.js --self-test | node tools/verify.js proof.json');
    process.exit(1);
  }
  const proof = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
  const result = PHANTOM.verifyProof(proof);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exit(1);
}
