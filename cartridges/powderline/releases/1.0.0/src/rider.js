/* Smooth-shaded snowboarder. Joints are real pivots, boots stay on the board.
   Poses are visual only and never touch the sim. */
import * as THREE from '../vendor/three.module.js';

const TAU = Math.PI * 2;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function deckGeometry() {
  const geo = new THREE.BoxGeometry(0.32, 0.048, 1.62, 6, 2, 18);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const top = new THREE.Color('#f6f1e6');
  const spruce = new THREE.Color('#1f4d3a');
  const edge = new THREE.Color('#1c2126');
  const base = new THREE.Color('#f7f8f6');
  for (let i = 0; i < p.count; i++) {
    const u = clamp(p.getZ(i) / 1.62 + 0.5, 0, 1);
    const sidecut = 0.72 + 0.34 * Math.abs(u - 0.5) * 2;
    p.setX(i, p.getX(i) * sidecut);
    const kick = Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 0.11;
    const camber = Math.sin(u * Math.PI) * 0.02;
    p.setY(i, p.getY(i) + kick + (p.getY(i) > 0 ? camber : kick * 0.25));
  }
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const ny = n.getY(i);
    let c = base;
    if (ny > 0.35) c = Math.abs(p.getX(i)) < 0.03 ? spruce : top;
    else if (Math.abs(ny) < 0.45) c = edge;
    else if (y > 0.02) c = top;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function torsoGeometry(low) {
  const pts = [
    new THREE.Vector2(0.105, 0),
    new THREE.Vector2(0.145, 0.06),
    new THREE.Vector2(0.168, 0.16),
    new THREE.Vector2(0.188, 0.28),
    new THREE.Vector2(0.2, 0.34),
    new THREE.Vector2(0.12, 0.4),
    new THREE.Vector2(0.072, 0.46),
  ];
  const geo = new THREE.LatheGeometry(pts, low ? 10 : 16);
  geo.scale(1.08, 1, 0.78);
  geo.computeVertexNormals();
  return geo;
}

function limb(radius, length, mat, seg, shadows) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 3, seg);
  geo.translate(0, -length * 0.5, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadows;
  return mesh;
}

export function buildRider(low, shadows) {
  const seg = low ? 6 : 8;
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd24f2c, roughness: 0.62, metalness: 0 });
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14202b, side: THREE.BackSide });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1a2330, roughness: 0.74, metalness: 0 });
  const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.06 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.28, metalness: 0.72 });
  const bindMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.42, metalness: 0.25 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 0.55, metalness: 0.05 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x12151a, roughness: 0.28, metalness: 0.22 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.55 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x10283a, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd7a882, roughness: 0.68, metalness: 0 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.55, metalness: 0 });

  const root = new THREE.Group();
  const bank = new THREE.Group();
  const spin = new THREE.Group();
  root.add(bank);
  bank.add(spin);

  const board = new THREE.Group();
  spin.add(board);
  const deck = new THREE.Mesh(deckGeometry(), deckMat);
  deck.castShadow = shadows;
  deck.receiveShadow = shadows;
  board.add(deck);
  const steel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 1.5), edgeMat);
  steel.position.y = -0.02;
  board.add(steel);
  for (const z of [-0.18, 0.2]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.18), bindMat);
    base.position.set(0, 0.045, z);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 10), bindMat);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(0, 0.09, z);
    board.add(base, strap);
  }

  const body = new THREE.Group();
  spin.add(body);

  function leg(side, forward) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.08, 0.5, forward);
    const thigh = limb(0.072, 0.28, pants, seg, shadows);
    const knee = new THREE.Group();
    knee.position.y = -0.28;
    const shin = limb(0.052, 0.26, pants, seg, shadows);
    knee.add(shin);
    hip.add(thigh, knee);
    body.add(hip);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.26), bootMat);
    boot.position.set(side * 0.07, 0.07, forward + 0.02);
    boot.castShadow = shadows;
    board.add(boot);
    return { hip, knee };
  }
  const legL = leg(-1, 0.2);
  const legR = leg(1, -0.18);

  const torso = new THREE.Group();
  torso.position.set(0, 0.48, 0.02);
  const chest = new THREE.Mesh(torsoGeometry(low), jacket);
  chest.castShadow = shadows;
  const chestShell = new THREE.Mesh(chest.geometry, outlineMat);
  chestShell.scale.setScalar(1.06);
  chestShell.raycast = () => {};
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, seg, seg), jacket);
  hood.scale.set(1.1, 0.9, 0.85);
  hood.position.set(0, 0.36, -0.06);
  torso.add(chest, chestShell, hood);

  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.18, 0.32, 0.02);
    const upper = limb(0.055, 0.24, jacket, seg, shadows);
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    const fore = limb(0.042, 0.22, jacket, seg, shadows);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, seg, seg), glove);
    hand.position.y = -0.22;
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  }
  const armL = arm(-1);
  const armR = arm(1);

  const head = new THREE.Group();
  head.position.set(0, 0.48, 0.02);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.078, seg, seg), skin);
  face.position.set(0, 0.02, 0.02);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.118, low ? 8 : 14, low ? 6 : 10), helmetMat);
  helmet.scale.set(1.02, 0.92, 1.08);
  helmet.position.set(0, 0.045, -0.01);
  helmet.castShadow = shadows;
  const helmetShell = new THREE.Mesh(helmet.geometry, outlineMat);
  helmetShell.scale.copy(helmet.scale).multiplyScalar(1.08);
  helmetShell.position.copy(helmet.position);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 16), strapMat);
  strap.rotation.x = Math.PI / 2.4;
  strap.position.set(0, 0.03, 0.01);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.035), lensMat);
  lens.position.set(0, 0.02, 0.1);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 5, 12), helmetMat);
  rim.position.set(0, 0.02, 0.1);
  head.add(face, helmet, helmetShell, strap, lens, rim);
  torso.add(head);
  body.add(torso);

  const materials = [jacket, pants, deckMat, edgeMat, bindMat, bootMat, helmetMat, strapMat, lensMat, skin, glove, outlineMat];
  let seenLand = -1;
  let landedAt = -10;

  function pose(state, time) {
    const lean = clamp(-state.vx / 13.2, -1, 1);
    const air = state.y > 0.35;
    const trick = state.trick;
    const id = trick ? trick.id : '';
    const prog = trick ? clamp(trick.t / trick.dur, 0, 1) : 0;
    if (state.landId !== seenLand) {
      seenLand = state.landId;
      if (state.landKind) landedAt = time;
    }
    const squash = clamp(1 - (time - landedAt) / 0.26, 0, 1);
    const k = squash * squash;
    body.scale.set(1 + 0.14 * k, 1 - 0.32 * k, 1 + 0.1 * k);
    body.position.y = -0.08 * k;

    const crouch = air ? 0.35 : 0.85;
    bank.rotation.z = lean * 0.7;
    bank.rotation.x = air ? -0.12 : 0.08;
    const spinY = id === 'frontside' ? prog * TAU : id === 'backside' ? -prog * TAU : lean * -0.08;
    spin.rotation.set(air ? -0.12 : 0.04, spinY, 0);
    spin.position.y = air ? 0.04 : Math.sin(time * 1.8) * 0.012;
    board.rotation.set(0, 0, 0);

    const bend = 0.45 + crouch * 0.7;
    legL.hip.rotation.set(0.55 * bend, 0, 0.38 + lean * 0.25);
    legR.hip.rotation.set(0.7 * bend, 0, -0.38 + lean * 0.25);
    legL.knee.rotation.x = -1.15 * bend;
    legR.knee.rotation.x = -1.25 * bend;

    torso.rotation.set(air ? -0.25 : 0.42, lean * -0.15, lean * 0.2);
    torso.position.z = air ? 0 : 0.04;
    head.rotation.set(0, 0, 0);

    armL.shoulder.rotation.set(0.35, 0, 1.05 + lean * 0.35);
    armR.shoulder.rotation.set(0.45, 0, -1.05 + lean * 0.25);
    armL.elbow.rotation.set(0.7, 0, 0);
    armR.elbow.rotation.set(0.85, 0, 0);

    if (id === 'method') {
      board.rotation.set(0.2 * prog, 0.2 * prog, 1.15 * prog);
      legL.hip.rotation.x = 1.05;
      legR.hip.rotation.x = 1.2;
      legL.knee.rotation.x = -1.7;
      legR.knee.rotation.x = -1.75;
      armL.shoulder.rotation.set(-1.35 * prog, 0, -0.15);
      armL.elbow.rotation.x = 0.15;
      armR.shoulder.rotation.set(1.7 * prog, 0.4 * prog, 0.85 * prog);
      armR.elbow.rotation.x = 0.45 * prog;
      torso.rotation.x = -0.62 * prog;
      torso.rotation.z = -0.4 * prog;
      head.rotation.y = -0.45 * prog;
    } else if (id === 'mute') {
      armL.shoulder.rotation.set(1.55 * prog, -0.15 * prog, 1.05 * prog);
      armL.elbow.rotation.x = 0.3 * prog;
      armR.shoulder.rotation.set(0.2, 0, -1.2);
      torso.rotation.z = -0.55 * prog;
    } else if (id === 'frontside' || id === 'backside') {
      const tuck = Math.sin(prog * Math.PI);
      armL.shoulder.rotation.set(0.9, 0, 0.9);
      armR.shoulder.rotation.set(0.9, 0, -0.9);
      armL.elbow.rotation.x = 1.3;
      armR.elbow.rotation.x = 1.3;
      legL.knee.rotation.x = -1.4;
      legR.knee.rotation.x = -1.4;
      torso.rotation.x = -0.1 - tuck * 0.15;
    }
  }

  return { group: root, pose, materials, deck };
}
