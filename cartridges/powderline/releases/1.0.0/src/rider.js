/* Snowboarder, built in slope-local space: +Y up, +Z downhill, board on Y = 0.
   Feet stay locked to the board. The torso is placed on the hip midpoint each pose.
   Vertex colors carry the paint; the shared toon material supplies the light. */
import * as THREE from '../vendor/three.module.js';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function paint(geo, hex, shade = 0, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  const sh = new Float32Array(n);
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (jitter ? (rnd() - 0.5) * jitter : 0);
    for (let v = 0; v < 3 && i + v < n; v++) {
      const j = i + v;
      arr[j * 3] = c.r * k;
      arr[j * 3 + 1] = c.g * k;
      arr[j * 3 + 2] = c.b * k;
      sh[j] = shade;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('shade', new THREE.BufferAttribute(sh, 1));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

function boardGeo() {
  const g = new THREE.BoxGeometry(0.32, 0.04, 1.58, 1, 1, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const az = Math.abs(z);
    const kick = Math.max(0, az - 0.46);
    const taper = 1 - Math.max(0, az - 0.5) * 0.42;
    p.setY(i, p.getY(i) + kick * kick * 0.85);
    p.setX(i, p.getX(i) * taper);
  }
  const painted = paint(g, '#3a2e28', 0.04, 0.03, 2);
  const c = painted.attributes.color;
  const top = new THREE.Color('#f4efe2');
  const teal = new THREE.Color('#1f4d3a');
  const coral = new THREE.Color('#d24f2c');
  const pos = painted.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) <= 0) continue;
    const z = pos.getZ(i);
    const x = Math.abs(pos.getX(i));
    const stripe = Math.abs(z) < 0.09 ? coral : Math.abs(z + 0.34) < 0.16 && x < 0.1 ? teal : top;
    c.setXYZ(i, stripe.r, stripe.g, stripe.b);
  }
  return painted;
}

function limb(r, len, hex) {
  const g = paint(new THREE.CapsuleGeometry(r, Math.max(0.05, len - r * 2), 2, 5), hex, 0.06, 0.05, 4);
  return g;
}

function makeLeg(mat, foot) {
  const root = new THREE.Group();
  root.position.set(foot.x, 0, foot.z);
  root.rotation.y = foot.yaw;
  const boot = new THREE.Mesh(paint(new THREE.BoxGeometry(0.13, 0.1, 0.28), '#2a211c', 0.12, 0.04, 5), mat);
  boot.position.set(0, 0.05, 0.03);
  const buckle = new THREE.Mesh(paint(new THREE.BoxGeometry(0.1, 0.028, 0.06), '#e24b32', 0, 0, 1), mat);
  buckle.position.set(0, 0.09, 0.08);
  const ankle = new THREE.Group();
  ankle.position.y = 0.1;
  const shin = new THREE.Mesh(limb(0.085, 0.4, '#243038'), mat);
  shin.position.y = 0.2;
  const knee = new THREE.Group();
  knee.position.y = 0.4;
  const thigh = new THREE.Mesh(limb(0.105, 0.4, '#243038'), mat);
  thigh.position.y = 0.2;
  knee.add(thigh);
  ankle.add(shin, knee);
  root.add(boot, buckle, ankle);
  return { root, ankle, knee };
}

function makeArm(mat, side) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.24, 0.4, 0);
  const upper = new THREE.Mesh(limb(0.055, 0.3, '#24306e'), mat);
  upper.position.y = -0.16;
  const elbow = new THREE.Group();
  elbow.position.y = -0.3;
  const fore = new THREE.Mesh(limb(0.046, 0.28, '#24306e'), mat);
  fore.position.y = -0.14;
  const glove = new THREE.Mesh(paint(new THREE.SphereGeometry(0.055, 6, 5), '#1c1e24', 0.1, 0, 3), mat);
  glove.position.y = -0.28;
  elbow.add(fore, glove);
  shoulder.add(upper, elbow);
  return { shoulder, elbow };
}

export function buildRider(mat) {
  const group = new THREE.Group();
  const lean = new THREE.Group();
  const spin = new THREE.Group();
  group.add(lean);
  lean.add(spin);

  const board = new THREE.Group();
  spin.add(board);
  const deck = new THREE.Mesh(boardGeo(), mat);
  const edgeL = new THREE.Mesh(paint(new THREE.BoxGeometry(0.02, 0.012, 1.35), '#0e7c86', 0, 0, 1), mat);
  edgeL.position.set(-0.15, 0.02, 0);
  const edgeR = edgeL.clone();
  edgeR.position.x = 0.15;
  board.add(deck, edgeL, edgeR);

  const front = makeLeg(mat, { x: 0.045, z: 0.2, yaw: -0.16 });
  const back = makeLeg(mat, { x: -0.04, z: -0.22, yaw: 0.2 });
  board.add(front.root, back.root);

  const torso = new THREE.Group();
  spin.add(torso);
  const profile = [
    [0.15, 0], [0.17, 0.08], [0.2, 0.18], [0.23, 0.3], [0.26, 0.4], [0.15, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const chest = new THREE.Mesh(paint(new THREE.LatheGeometry(profile, 7), '#d24f2c', 0.0, 0.05, 8), mat);
  const jacketBack = new THREE.Mesh(paint(new THREE.BoxGeometry(0.36, 0.34, 0.08), '#d24f2c', 0.0, 0.04, 7), mat);
  jacketBack.position.set(0, 0.26, -0.14);
  const yoke = new THREE.Mesh(paint(new THREE.BoxGeometry(0.5, 0.08, 0.22), '#1f4d3a', 0.0, 0.03, 9), mat);
  yoke.position.set(0, 0.42, -0.02);
  const belt = new THREE.Mesh(paint(new THREE.BoxGeometry(0.34, 0.06, 0.22), '#f4efe2', 0, 0, 1), mat);
  belt.position.set(0, 0.16, 0);
  torso.add(chest, jacketBack, yoke, belt);

  const headP = new THREE.Group();
  headP.position.set(0, 0.56, 0);
  const head = new THREE.Mesh(paint(new THREE.SphereGeometry(0.115, 8, 6), '#e0b090', 0.05, 0.03, 2), mat);
  head.position.y = 0.02;
  const helmet = new THREE.Mesh(paint(new THREE.SphereGeometry(0.15, 8, 6), '#f6f1ea', 0.0, 0.02, 6), mat);
  helmet.position.y = 0.045;
  helmet.scale.y = 0.9;
  const stripe = new THREE.Mesh(paint(new THREE.BoxGeometry(0.05, 0.08, 0.26), '#24306e', 0, 0, 1), mat);
  stripe.position.set(0, 0.12, -0.02);
  const strap = new THREE.Mesh(paint(new THREE.TorusGeometry(0.132, 0.016, 4, 12), '#1a2744', 0.05, 0, 1), mat);
  strap.position.set(0, 0.03, 0);
  strap.rotation.y = Math.PI / 2;
  const lens = new THREE.Mesh(paint(new THREE.BoxGeometry(0.2, 0.062, 0.05), '#e39b3a', 0, 0.02, 4), mat);
  lens.position.set(0, 0.015, 0.125);
  const frame = new THREE.Mesh(paint(new THREE.BoxGeometry(0.23, 0.09, 0.03), '#1a2744', 0.08, 0, 1), mat);
  frame.position.set(0, 0.015, 0.1);
  const gaiter = new THREE.Mesh(paint(new THREE.BoxGeometry(0.16, 0.08, 0.12), '#24306e', 0.1, 0, 1), mat);
  gaiter.position.set(0, -0.06, 0);
  headP.add(head, helmet, stripe, strap, lens, frame, gaiter);
  torso.add(headP);

  const armL = makeArm(mat, -1);
  const armR = makeArm(mat, 1);
  torso.add(armL.shoulder, armR.shoulder);

  const blobGeo = new THREE.CircleGeometry(0.55, 10);
  blobGeo.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(
    blobGeo,
    new THREE.MeshBasicMaterial({ color: 0x1a3a72, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  blob.position.y = 0.04;
  blob.rotation.y = 0.66;
  blob.scale.set(0.78, 1, 2.7);
  blob.renderOrder = 1;
  group.add(blob);

  return { group, lean, spin, board, torso, front, back, armL, armR, blob };
}

function hipOf(foot, shin, thigh) {
  const kneeY = 0.1 + 0.4 * Math.cos(shin);
  const kneeZ = 0.4 * Math.sin(shin);
  return {
    x: foot.x,
    y: foot.y + kneeY + 0.4 * Math.cos(thigh),
    z: foot.z + kneeZ + 0.4 * Math.sin(thigh),
  };
}

export function poseRider(rider, state, time, reduced) {
  const lean = clamp(-state.vx / 13.2, -1, 1);
  const air = state.y > 0.32;
  const id = state.trick ? state.trick.id : '';
  const p = state.trick ? clamp(state.trick.t / state.trick.dur, 0, 1) : 0;
  const hold = clamp(p / 0.2, 0, 1);
  const trick = hold > 0 && !!id;

  let shin = air ? 0.95 : 0.58;
  let thigh = air ? -1.15 : -0.62;
  let tuck = air ? 1 : 0;
  let arch = air ? -0.12 : 0.22;
  let tweakX = 0;
  let tweakZ = lean * 0.28;
  let arm = 'ride';

  if (id === 'method') {
    shin = 0.35; thigh = -0.35; tuck = 0.2; arch = -0.55 * hold;
    tweakX = -0.62 * hold; tweakZ = 0.48 * hold; arm = 'method';
  } else if (id === 'mute') {
    shin = 1.15; thigh = -1.85; tuck = 1; arch = 0.42 * hold;
    tweakX = 0.28 * hold; tweakZ = -0.18 * hold; arm = 'mute';
  } else if (id === 'frontside') {
    shin = 0.85; thigh = -1.25; arch = 0.05; arm = 'front';
  } else if (id === 'backside') {
    shin = 0.85; thigh = -1.25; arch = 0.05; arm = 'back';
  }

  rider.lean.rotation.z = lean * (air ? 0.18 : 0.48);
  rider.lean.rotation.x = air ? -0.08 : 0.06;
  rider.lean.position.y = reduced || !state.boosting ? 0 : Math.sin(time * 26) * 0.015;

  if (id === 'frontside') rider.spin.rotation.y = p * TAU;
  else if (id === 'backside') rider.spin.rotation.y = -p * TAU;
  else rider.spin.rotation.y = lean * -0.06;

  rider.board.rotation.x = tweakX;
  rider.board.rotation.z = tweakZ;
  rider.board.rotation.y = 0;
  rider.board.position.y = 0;

  rider.front.ankle.rotation.x = shin;
  rider.back.ankle.rotation.x = shin + 0.06;
  rider.front.knee.rotation.x = thigh - shin;
  rider.back.knee.rotation.x = thigh - shin - 0.08;

  const hf = hipOf({ x: 0.045, y: 0, z: 0.2 }, shin, thigh);
  const hb = hipOf({ x: -0.04, y: 0, z: -0.22 }, shin + 0.06, thigh - 0.08);
  const hip = new THREE.Vector3((hf.x + hb.x) / 2, (hf.y + hb.y) / 2, (hf.z + hb.z) / 2);
  hip.applyEuler(rider.board.rotation);
  rider.torso.position.copy(hip);
  rider.torso.rotation.x = arch;
  rider.torso.rotation.z = (id === 'method' ? 0.35 : id === 'mute' ? -0.22 : 0.08) * (trick ? hold : 1) * (id ? 1 : lean);
  rider.torso.rotation.y = id === 'method' ? -0.25 * hold : id === 'mute' ? 0.2 * hold : lean * -0.05;

  const poseArm = (armP, side) => {
    let sx = 0.45;
    let sz = side * 0.28;
    let ex = 0.75;
    if (arm === 'method') {
      if (side > 0) { sx = 1.35 * hold + 0.2; sz = -0.15; ex = 0.35; }
      else { sx = -0.85 * hold; sz = -0.55; ex = 0.4; }
    } else if (arm === 'mute') {
      if (side < 0) { sx = 1.15 * hold; sz = 0.15; ex = 1.15 * hold; }
      else { sx = -0.55 * hold; sz = 0.45; ex = 0.5; }
    } else if (arm === 'front') {
      sx = side > 0 ? -0.4 : 0.7;
      sz = side * 0.9 * hold;
      ex = 0.45;
    } else if (arm === 'back') {
      sx = side > 0 ? 0.7 : -0.4;
      sz = side * -0.9 * hold;
      ex = 0.45;
    } else if (!air) {
      sx = 0.55 + Math.max(0, -side * lean) * 0.35;
      sz = side * (0.22 + Math.abs(lean) * 0.18);
      ex = 0.7 + Math.abs(lean) * 0.25;
    } else {
      sx = 0.15;
      sz = side * 0.18;
      ex = 1.05;
    }
    armP.shoulder.rotation.x = sx;
    armP.shoulder.rotation.z = sz;
    armP.elbow.rotation.x = ex;
  };
  poseArm(rider.armL, -1);
  poseArm(rider.armR, 1);

  const lift = clamp(state.y / 7, 0, 1);
  rider.blob.material.opacity = 0.4 * (1 - lift);
  rider.blob.visible = lift < 0.98;
  rider.blob.scale.set(0.78 + lift * 0.55, 1, 2.7 + lift * 1.6);
  rider.tuck = tuck;
}
