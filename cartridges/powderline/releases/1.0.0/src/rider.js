/* Procedural snowboarder. Local frame: nose toward +Z, ground at y = 0, meters.
   Poses are visual only. They never feed the sim. */
import * as THREE from '../vendor/three.module.js';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function paint(geo, hex, pred) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(hex);
  const alt = new THREE.Color('#1f4d3a');
  const edge = new THREE.Color('#23272b');
  const base = new THREE.Color('#f7f8f6');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const pick = pred ? pred(pos, i) : (y > 0.004 ? (Math.abs(x) < 0.028 ? alt : c) : y < -0.006 ? base : edge);
    col[i * 3] = pick.r; col[i * 3 + 1] = pick.g; col[i * 3 + 2] = pick.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function deckGeometry() {
  const geo = new THREE.BoxGeometry(0.3, 0.03, 1.56, 4, 1, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getZ(i) / 1.56 + 0.5;
    const sidecut = 0.78 + 0.22 * Math.abs(u - 0.5) * 2;
    p.setX(i, p.getX(i) * sidecut);
    const tip = Math.pow(Math.abs(u - 0.5) * 2, 2.4) * 0.085;
    const camber = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) * 0.018;
    p.setY(i, p.getY(i) + tip + (p.getY(i) > 0 ? camber : 0));
  }
  geo.computeVertexNormals();
  return paint(geo, '#f4f0e6');
}

function bootGeometry() {
  const geo = new THREE.BoxGeometry(0.13, 0.16, 0.28, 1, 1, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) > 0.06) p.setY(i, p.getY(i) + 0.03);
    if (p.getY(i) > 0.04) p.setX(i, p.getX(i) * 0.92);
  }
  geo.computeVertexNormals();
  return geo;
}

function hang(mesh, length) {
  mesh.geometry.translate(0, -length * 0.5, 0);
  mesh.castShadow = true;
  return mesh;
}

export function buildRider(low, shadows) {
  const seg = low ? 5 : 8;
  const jacket = new THREE.MeshStandardMaterial({ color: 0xc24b2e, roughness: 0.62, metalness: 0.02 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.78, metalness: 0 });
  const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.35, metalness: 0.65 });
  const bindMat = new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.45, metalness: 0.2 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 0.58, metalness: 0.04 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.32, metalness: 0.18 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x163044, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd7a882, roughness: 0.7, metalness: 0 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.6, metalness: 0 });

  const root = new THREE.Group();
  const bank = new THREE.Group();
  const spin = new THREE.Group();
  root.add(bank);
  bank.add(spin);

  const deck = new THREE.Mesh(deckGeometry(), deckMat);
  deck.castShadow = shadows;
  deck.receiveShadow = shadows;
  spin.add(deck);
  const steel = new THREE.Mesh(new THREE.BoxGeometry(0.312, 0.008, 1.5), edgeMat);
  steel.position.y = -0.012;
  spin.add(steel);
  for (const z of [-0.16, 0.18]) {
    const binding = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.2), bindMat);
    binding.position.set(0, 0.04, z);
    binding.castShadow = shadows;
    spin.add(binding);
  }

  const body = new THREE.Group();
  spin.add(body);

  function limb(radius, length, mat, cap) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.04, length - radius * 2), cap ? 2 : 3, seg), mat);
    hang(mesh, length);
    mesh.castShadow = shadows;
    return mesh;
  }

  function leg(side, forward) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09, 0.58, forward);
    const thigh = limb(0.07, 0.3, pants);
    const knee = new THREE.Group();
    knee.position.y = -0.3;
    const shin = limb(0.05, 0.28, pants);
    const boot = new THREE.Mesh(bootGeometry(), bootMat);
    boot.position.set(0, -0.3, 0.05);
    boot.castShadow = shadows;
    knee.add(shin, boot);
    hip.add(thigh, knee);
    body.add(hip);
    return { hip, knee };
  }
  const legL = leg(-1, 0.16);
  const legR = leg(1, -0.16);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.16), pants);
  pelvis.position.set(0, 0.6, 0);
  pelvis.castShadow = shadows;
  body.add(pelvis);

  const torso = new THREE.Group();
  torso.position.set(0, 0.64, 0);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.2, 2, 2, 1), jacket);
  const cp = chest.geometry.attributes.position;
  for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0.12) cp.setX(i, cp.getX(i) * 1.12);
  chest.geometry.computeVertexNormals();
  chest.position.y = 0.2;
  chest.castShadow = shadows;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshStandardMaterial({ color: 0x1f4d3a, roughness: 0.7 }));
  pack.position.set(0, 0.16, -0.11);
  torso.add(chest, pack);

  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 0.32, 0.02);
    const upper = limb(0.07, 0.28, jacket);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    const fore = limb(0.055, 0.26, jacket);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, seg, seg), glove);
    hand.position.y = -0.3;
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  }
  const armL = arm(-1);
  const armR = arm(1);

  const head = new THREE.Group();
  head.position.set(0, 0.46, 0.03);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.09, seg, seg), skin);
  face.position.set(0, 0.02, 0.03);
  face.scale.set(0.9, 1, 0.85);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, low ? 8 : 12, low ? 6 : 10), helmetMat);
  helmet.scale.set(1, 0.9, 1.06);
  helmet.position.set(0, 0.05, -0.01);
  helmet.castShadow = shadows;
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.016, 6, 18), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }));
  strap.rotation.x = Math.PI / 2;
  strap.position.set(0, 0.02, 0);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.04), lensMat);
  lens.position.set(0, 0.01, 0.12);
  const lensRim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.02), helmetMat);
  lensRim.position.set(0, 0.04, 0.12);
  head.add(face, helmet, strap, lens, lensRim);
  torso.add(head);
  body.add(torso);

  const materials = [jacket, pants, deckMat, edgeMat, bindMat, bootMat, helmetMat, lensMat, skin, glove, pack.material, strap.material];

  function pose(state, time) {
    const lean = clamp(-state.vx / 13.2, -1, 1);
    const air = state.y > 0.35;
    const trick = state.trick;
    const id = trick ? trick.id : '';
    const prog = trick ? clamp(trick.t / trick.dur, 0, 1) : 0;
    const crouch = air ? 0.28 + (id === 'frontside' || id === 'backside' ? 0.25 : 0) : 0.72;
    const bob = air ? 0 : Math.sin(time * 1.7) * 0.015;

    bank.rotation.z = lean * 0.62 + (id === 'method' ? 0.28 * prog : 0);
    bank.rotation.x = air ? -0.08 : 0.06;
    spin.rotation.y = id === 'frontside' ? prog * TAU : id === 'backside' ? -prog * TAU : lean * -0.05;
    spin.position.y = bob;

    const knee = 0.55 + crouch * 0.55;
    legL.hip.rotation.set(0.7 * knee, 0, 0.42 + lean * 0.2);
    legR.hip.rotation.set(0.85 * knee, 0, -0.42 + lean * 0.2);
    legL.knee.rotation.x = -1.25 * knee;
    legR.knee.rotation.x = -1.35 * knee;

    torso.rotation.x = (air ? -0.2 : 0.4) + bob;
    torso.rotation.z = lean * 0.35 + (id === 'method' ? 0.5 * prog : id === 'mute' ? -0.32 * prog : 0);
    torso.position.z = air ? 0.02 : 0.06;

    const out = air ? 0.45 : 0.72;
    armL.shoulder.rotation.z = out + lean * 0.4;
    armR.shoulder.rotation.z = -out + lean * 0.4;
    armL.shoulder.rotation.x = 0.85;
    armR.shoulder.rotation.x = 0.85;
    armL.elbow.rotation.x = 1.15;
    armR.elbow.rotation.x = 1.15;

    if (id === 'method') {
      armR.shoulder.rotation.x = 1.25 * prog;
      armR.shoulder.rotation.z = -0.25 * prog;
      armR.elbow.rotation.x = 0.9 * prog;
      armL.shoulder.rotation.z = 1.15;
    } else if (id === 'mute') {
      armL.shoulder.rotation.x = 1.15 * prog;
      armL.shoulder.rotation.z = 0.2 * prog;
      armL.elbow.rotation.x = 0.85 * prog;
      armR.shoulder.rotation.z = -1.15;
    } else if (id === 'frontside' || id === 'backside') {
      const tuck = Math.sin(prog * Math.PI);
      armL.shoulder.rotation.x = 0.2 + tuck * 0.4;
      armR.shoulder.rotation.x = 0.2 + tuck * 0.4;
      armL.elbow.rotation.x = 0.8;
      armR.elbow.rotation.x = 0.8;
      torso.rotation.x = -0.05;
    }
  }

  return { group: root, pose, materials, deck };
}
