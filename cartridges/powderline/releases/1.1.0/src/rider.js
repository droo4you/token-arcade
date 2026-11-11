/* Lofted capsule snowboarder. Joints are real pivots. Visual only. */
import * as THREE from '../vendor/three.module.js';

const TAU = Math.PI * 2;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function deckGeometry() {
  const geo = new THREE.BoxGeometry(0.3, 0.04, 1.52, 8, 2, 22);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const top = new THREE.Color('#f3efe6');
  const spruce = new THREE.Color('#1f4d3a');
  const edge = new THREE.Color('#14181c');
  const base = new THREE.Color('#f7f8f6');
  for (let i = 0; i < p.count; i++) {
    const u = clamp(p.getZ(i) / 1.52 + 0.5, 0, 1);
    const sidecut = 0.7 + 0.36 * Math.abs(u - 0.5) * 2;
    p.setX(i, p.getX(i) * sidecut);
    const kick = Math.pow(Math.abs(u - 0.5) * 2, 2.05) * 0.12;
    p.setY(i, p.getY(i) + kick + (p.getY(i) > 0 ? Math.sin(u * Math.PI) * 0.018 : kick * 0.2));
  }
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i);
    let c = base;
    if (ny > 0.4) c = Math.abs(p.getX(i)) < 0.028 ? spruce : top;
    else if (Math.abs(ny) < 0.5) c = edge;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function torsoGeometry(low) {
  const pts = [
    new THREE.Vector2(0.09, 0),
    new THREE.Vector2(0.13, 0.04),
    new THREE.Vector2(0.16, 0.12),
    new THREE.Vector2(0.2, 0.24),
    new THREE.Vector2(0.22, 0.36),
    new THREE.Vector2(0.16, 0.46),
    new THREE.Vector2(0.1, 0.52),
  ];
  const geo = new THREE.LatheGeometry(pts, low ? 12 : 18);
  geo.scale(1.05, 1, 0.86);
  geo.computeVertexNormals();
  return geo;
}

function limb(radius, length, mat, seg, shadows) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, seg);
  geo.translate(0, -length * 0.5, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadows;
  return mesh;
}

function shell(mesh, mat, scale) {
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.setScalar(scale);
  outline.position.copy(mesh.position);
  outline.raycast = () => {};
  return outline;
}

export function buildRider(low, shadows) {
  const seg = low ? 7 : 10;
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd24f2c, roughness: 0.62, metalness: 0 });
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14202b, side: THREE.BackSide });
  const pants = new THREE.MeshStandardMaterial({ color: 0x243038, roughness: 0.74, metalness: 0 });
  const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.3, metalness: 0.55 });
  const bindMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.45, metalness: 0.2 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.55, metalness: 0.04 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x12151a, roughness: 0.28, metalness: 0.18 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.55 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x1a3344, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd7a882, roughness: 0.68, metalness: 0 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x14202b, roughness: 0.55, metalness: 0 });

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
  const steel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 1.4), edgeMat);
  steel.position.y = -0.02;
  board.add(steel);
  for (const z of [-0.16, 0.22]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.2), bindMat);
    base.position.set(0, 0.04, z);
    board.add(base);
  }

  const body = new THREE.Group();
  spin.add(body);

  function leg(side, forward) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09, 0.46, forward);
    const thigh = limb(0.078, 0.3, pants, seg, shadows);
    const knee = new THREE.Group();
    knee.position.y = -0.3;
    const shin = limb(0.055, 0.28, pants, seg, shadows);
    knee.add(shin);
    hip.add(thigh, knee);
    body.add(hip);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.26), bootMat);
    boot.position.set(side * 0.07, 0.06, forward + 0.02);
    boot.castShadow = shadows;
    board.add(boot);
    return { hip, knee };
  }
  const legL = leg(-1, 0.2);
  const legR = leg(1, -0.16);

  const torso = new THREE.Group();
  torso.position.set(0, 0.46, 0.02);
  const chest = new THREE.Mesh(torsoGeometry(low), jacket);
  chest.castShadow = shadows;
  const chestShell = shell(chest, outlineMat, 1.045);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, seg, seg), jacket);
  hood.scale.set(1.15, 0.82, 0.9);
  hood.position.set(0, 0.4, -0.05);
  const hoodShell = shell(hood, outlineMat, 1.06);
  torso.add(chest, chestShell, hood, hoodShell);

  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 0.36, 0.02);
    const upper = limb(0.055, 0.26, jacket, seg, shadows);
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    const fore = limb(0.042, 0.24, jacket, seg, shadows);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, seg, seg), glove);
    hand.scale.set(1.05, 0.8, 1.15);
    hand.position.y = -0.24;
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  }
  const armL = arm(-1);
  const armR = arm(1);

  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.02);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.072, seg, seg), skin);
  face.position.set(0, 0.02, 0.02);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.112, low ? 10 : 16, low ? 8 : 12), helmetMat);
  helmet.scale.set(1.02, 0.9, 1.08);
  helmet.position.set(0, 0.04, -0.01);
  helmet.castShadow = shadows;
  const helmetShell = shell(helmet, outlineMat, 1.07);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 16), strapMat);
  strap.rotation.x = Math.PI / 2.35;
  strap.position.set(0, 0.02, 0.01);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.03), lensMat);
  lens.position.set(0, 0.015, 0.09);
  head.add(face, helmet, helmetShell, strap, lens);
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
    const arc = Math.sin(clamp(prog, 0, 1) * Math.PI);
    if (state.landId !== seenLand) {
      seenLand = state.landId;
      if (state.landKind) landedAt = time;
    }
    const squash = clamp(1 - (time - landedAt) / 0.22, 0, 1);
    const k = squash * squash;
    body.scale.set(1 + 0.18 * k, 1 - 0.42 * k, 1 + 0.12 * k);
    body.position.y = -0.12 * k;

    bank.rotation.z = lean * 1.15;
    bank.rotation.x = air ? -0.08 : 0.12;
    let spinY = lean * -0.06;
    let spinX = air ? -0.08 : 0.06;
    if (id === 'frontside') spinY = prog * TAU;
    if (id === 'backside') {
      spinY = -prog * TAU;
      spinX = prog * TAU;
    }
    spin.rotation.set(spinX, spinY, 0);
    spin.position.y = air ? 0.06 : 0;
    board.rotation.set(0, 0, 0);

    const bend = air ? 0.7 : 1.15;
    legL.hip.rotation.set(0.5 * bend, 0, 0.42 + lean * 0.2);
    legR.hip.rotation.set(0.62 * bend, 0, -0.42 + lean * 0.2);
    legL.knee.rotation.x = -1.05 * bend;
    legR.knee.rotation.x = -1.15 * bend;

    torso.rotation.set(air ? -0.15 : 0.28, lean * -0.12, lean * 0.16);
    torso.position.z = air ? -0.02 : 0.03;
    head.rotation.set(air ? 0.2 : 0.15, 0, -lean * 0.2);

    armL.shoulder.rotation.set(0.25, 0, 1.15 + lean * 0.25);
    armR.shoulder.rotation.set(0.35, 0, -1.15 + lean * 0.2);
    armL.elbow.rotation.set(0.55, 0, 0);
    armR.elbow.rotation.set(0.7, 0, 0);

    if (trick && trick.kind === 'spin') {
      const turns = [1, 1.5, 2, 3][Math.min(3, (trick.spins || 1) - 1)];
      spin.rotation.y = (trick.dir || 1) * prog * turns * TAU;
      armL.shoulder.rotation.set(0.9, 0, 1.35);
      armR.shoulder.rotation.set(0.9, 0, -1.35);
      armL.elbow.rotation.x = 1.2;
      armR.elbow.rotation.x = 1.2;
      torso.rotation.x = -0.45;
      legL.knee.rotation.x = -1.45;
      legR.knee.rotation.x = -1.45;
    } else if (id === 'backflip' || id === 'rodeo') {
      spin.rotation.x = prog * TAU;
      if (id === 'rodeo') spin.rotation.y = (trick.dir || 1) * prog * TAU;
      armL.shoulder.rotation.set(0.35, 0, 1.45);
      armR.shoulder.rotation.set(0.35, 0, -1.45);
      armL.elbow.rotation.x = 1.15;
      armR.elbow.rotation.x = 1.15;
      legL.knee.rotation.x = -1.65;
      legR.knee.rotation.x = -1.65;
      torso.rotation.x = -0.15;
    } else if (id === 'indy' || id === 'double') {
      board.rotation.set(0.25 * arc, 0, -0.55 * arc);
      armR.shoulder.rotation.set(2.35 * arc, 0.15, 0.35);
      armR.elbow.rotation.x = 0.2;
      if (id === 'double') {
        armL.shoulder.rotation.set(2.15 * arc, -0.2, -0.25);
        armL.elbow.rotation.x = 0.15;
      }
      legR.knee.rotation.x = -1.75;
      torso.rotation.x = -0.4 * arc;
    } else if (id === 'method') {
      board.rotation.set(0.85 * arc, 0.15 * arc, 1.45 * arc);
      legL.hip.rotation.x = 1.15;
      legR.hip.rotation.x = 1.35;
      legL.knee.rotation.x = -1.85;
      legR.knee.rotation.x = -1.95;
      armL.shoulder.rotation.set(-2.5 * arc, 0, -0.25);
      armL.elbow.rotation.x = 0.08;
      armR.shoulder.rotation.set(2.2 * arc, 0.55 * arc, 1.25 * arc);
      armR.elbow.rotation.x = 0.35 * arc;
      torso.rotation.set(-0.85 * arc, 0, -0.25 * arc);
      head.rotation.set(0.4 * arc, -0.7 * arc, 0);
    } else if (id === 'mute') {
      board.rotation.set(0.35 * arc, 0, -1.2 * arc);
      armL.shoulder.rotation.set(2.1 * arc, -0.2 * arc, 1.2 * arc);
      armL.elbow.rotation.x = 0.4 * arc;
      armR.shoulder.rotation.set(-1.4 * arc, 0, -0.4);
      torso.rotation.z = 0.35 * arc;
      torso.rotation.x = -0.4 * arc;
      legL.knee.rotation.x = -1.7;
      legR.knee.rotation.x = -1.6;
    } else if (id === 'frontside' || id === 'backside') {
      const spin = arc;
      armL.shoulder.rotation.set(0.8, 0, 1.3);
      armR.shoulder.rotation.set(0.8, 0, -1.3);
      armL.elbow.rotation.x = 1.35;
      armR.elbow.rotation.x = 1.35;
      legL.knee.rotation.x = -1.55;
      legR.knee.rotation.x = -1.55;
      torso.rotation.x = -0.35 * spin;
      board.rotation.z = (id === 'backside' ? -0.4 : 0.4) * spin;
    }
    if (state.tuck && !air) {
      torso.rotation.x = 0.82;
      torso.position.z = 0.1;
      legL.knee.rotation.x = -1.7;
      legR.knee.rotation.x = -1.75;
      armL.shoulder.rotation.set(0.9, 0, 0.7);
      armR.shoulder.rotation.set(0.9, 0, -0.7);
      head.rotation.x = 0.45;
    }
  }

  return { group: root, pose, materials, deck };
}
