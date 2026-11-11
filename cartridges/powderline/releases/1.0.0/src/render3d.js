/* Powderline view. three.js r170, no postprocessing.
   The sim is the only authority. This file reads state and draws it.
   Quality: phones and narrow windows take the low path (pixel-ratio cap, no shadows,
   shorter draw, fewer flakes). Desktop keeps a single shadow map. No bloom, no emissive lights. */
import * as THREE from '../vendor/three.module.js';

const SLOPE = 0.3;
const SIN = Math.sin(SLOPE);
const COS = Math.cos(SLOPE);
const CHUNK = 48;
const LAUNCH_Y = 1.22;

const slopeBasis = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, COS, SIN),
  new THREE.Vector3(0, -SIN, COS),
);
const slopeQuat = new THREE.Quaternion().setFromRotationMatrix(slopeBasis);

function slopeToWorld(x, y, z, out) {
  return out.set(x, y * COS - z * SIN, z * COS + y * SIN);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function flakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(16, 16, 6.5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function wedgeGeometry(len, width, height) {
  const hw = width / 2;
  const positions = new Float32Array([
    -hw, 0, -len, hw, 0, -len, hw, height, 0,
    -hw, 0, -len, hw, height, 0, -hw, height, 0,
    -hw, 0, -len, -hw, height, 0, -hw, 0, 0,
    hw, 0, -len, hw, 0, 0, hw, height, 0,
    -hw, height, 0, hw, height, 0, hw, 0, 0,
    -hw, height, 0, hw, 0, 0, -hw, 0, 0,
    -hw, 0, -len, -hw, 0, 0, hw, 0, 0,
    -hw, 0, -len, hw, 0, 0, hw, 0, -len,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createView(canvas, options) {
  const low = !!options.low;
  const reduced = !!options.reduced;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !low,
    alpha: false,
    powerPreference: low ? 'low-power' : 'high-performance',
  });
  renderer.setClearColor(0xd5dde6, 1);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
  }
  if (!low) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd5dee6, low ? 18 : 26, low ? 92 : 148);
  scene.background = new THREE.Color(0xd5dee6);
  const camera = new THREE.PerspectiveCamera(64, 1, 0.12, 520);

  const hemi = new THREE.HemisphereLight(0xc9d7e6, 0x8a7764, 0.78);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.42);
  sun.position.set(-16, 28, 10);
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 70;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun, sun.target);

  const sky = buildSky(low);
  scene.add(sky);
  for (const ridge of buildRidges()) scene.add(ridge);

  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true });
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1c3d31, roughness: 0.86, metalness: 0 });
  const treeMat2 = new THREE.MeshStandardMaterial({ color: 0x275445, roughness: 0.84, metalness: 0 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a382c, roughness: 0.9, metalness: 0 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e675f, roughness: 0.92, metalness: 0, flatShading: true });
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.72, metalness: 0 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x1f4d3a, roughness: 0.6, metalness: 0 });

  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.9, low ? 5 : 6);
  const coneGeo = new THREE.ConeGeometry(1.15, 2.5, low ? 5 : 7);
  const coneGeo2 = new THREE.ConeGeometry(0.72, 1.7, low ? 5 : 6);
  const rockGeo = new THREE.DodecahedronGeometry(0.72, 0);
  const shared = [trunkGeo, coneGeo, coneGeo2, rockGeo];

  const chunks = new Map();
  let worldSeed = null;
  const tmp = new THREE.Vector3();
  const rider = buildRider(low);
  scene.add(rider.group);

  const puffGeo = new THREE.SphereGeometry(1, low ? 6 : 8, low ? 5 : 6);
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xe7eef3, roughness: 1, metalness: 0 });
  const puffBright = new THREE.MeshStandardMaterial({ color: 0xfbfcfd, roughness: 0.92, metalness: 0 });
  shared.push(puffGeo);
  const cloud = new THREE.Group();
  cloud.quaternion.copy(slopeQuat);
  const puffs = [];
  const puffCount = low ? 16 : 32;
  for (let i = 0; i < puffCount; i++) {
    const mesh = new THREE.Mesh(puffGeo, i % 4 === 0 ? puffBright : puffMat);
    const col = (i % 8) - 3.5;
    const row = Math.floor(i / 8);
    const scale = 1.35 + (i % 5) * 0.55;
    mesh.position.set(col * 3.15, 1.5 + row * 3.15, row * 0.8);
    mesh.scale.set(scale * 1.35, scale * 0.82, scale * 0.66);
    mesh.userData.base = mesh.position.clone();
    cloud.add(mesh);
    puffs.push(mesh);
  }
  scene.add(cloud);

  const flakes = buildFlakes(low ? 70 : 180);
  scene.add(flakes.points);

  const camS = { x: 0, y: 3.1, z: -6 };
  const lookS = { x: 0, y: 1.2, z: 12 };
  const camW = new THREE.Vector3();
  const lookW = new THREE.Vector3();
  let lastLand = -1;
  let fov = 64;

  function resize() {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    let ratio = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.5);
    const maxPx = low ? 1.05e6 : 2.0e6;
    if (w * h * ratio * ratio > maxPx) ratio *= Math.sqrt(maxPx / (w * h));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function ensureChunk(index, seed) {
    if (chunks.has(index)) return;
    const part = globalThis.PLSim.chunk(seed, index);
    const group = new THREE.Group();
    const z0 = index * CHUNK;
    const snow = new THREE.Mesh(snowGeometry(z0, index, low), snowMat);
    snow.receiveShadow = !low;
    group.add(snow);
    for (let i = 0; i < part.obstacles.length; i++) {
      const o = part.obstacles[i];
      const g = new THREE.Group();
      slopeToWorld(o.x, 0, o.z, tmp);
      g.position.copy(tmp);
      g.quaternion.copy(slopeQuat);
      if (o.kind === 'tree') {
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.45;
        trunk.castShadow = !low;
        const a = new THREE.Mesh(coneGeo, i % 2 ? treeMat2 : treeMat);
        a.position.y = 1.9;
        a.castShadow = !low;
        const b = new THREE.Mesh(coneGeo2, treeMat2);
        b.position.y = 3.05;
        b.castShadow = !low;
        g.add(trunk, a, b);
      } else {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        const sc = 0.85 + ((Math.abs(Math.sin(o.z * 0.17)) * 0.5));
        rock.scale.setScalar(sc);
        rock.position.y = 0.35 * sc;
        rock.castShadow = !low;
        rock.rotation.y = o.z * 0.2;
        g.add(rock);
      }
      group.add(g);
    }
    for (let i = 0; i < part.ramps.length; i++) {
      const ramp = part.ramps[i];
      const g = new THREE.Group();
      slopeToWorld(ramp.x, 0, ramp.z, tmp);
      g.position.copy(tmp);
      g.quaternion.copy(slopeQuat);
      const body = new THREE.Mesh(wedgeGeometry(5.4, Math.max(2.2, ramp.w), LAUNCH_Y), rampMat);
      body.castShadow = !low;
      body.receiveShadow = !low;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2.2, ramp.w), 0.08, 0.18), lipMat);
      lip.position.set(0, LAUNCH_Y + 0.02, -0.02);
      g.add(body, lip);
      group.add(g);
    }
    scene.add(group);
    chunks.set(index, group);
  }

  function dropChunk(group) {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry && !shared.includes(obj.geometry)) obj.geometry.dispose();
    });
  }
  function syncWorld(state) {
    if (worldSeed !== state.seed) {
      for (const group of chunks.values()) dropChunk(group);
      chunks.clear();
      worldSeed = state.seed;
    }
    const ahead = low ? 2 : 4;
    const behind = 1;
    const center = Math.floor(state.z / CHUNK);
    const keep = new Set();
    for (let i = Math.max(0, center - behind); i <= center + ahead; i++) {
      keep.add(i);
      ensureChunk(i, state.seed);
    }
    for (const [index, group] of chunks) {
      if (!keep.has(index)) {
        dropChunk(group);
        chunks.delete(index);
      }
    }
  }

  function poseRider(state, time) {
    slopeToWorld(state.x, Math.max(0, state.y), state.z, tmp);
    rider.group.position.copy(tmp);
    rider.group.quaternion.copy(slopeQuat);
    const lean = clamp(-state.vx / 13.2, -1, 1);
    rider.lean.rotation.z = lean * 0.48;
    rider.lean.rotation.x = state.y > 0.3 ? -0.18 : 0.12;
    const progress = state.trick ? clamp(state.trick.t / state.trick.dur, 0, 1) : 0;
    const id = state.trick ? state.trick.id : '';
    rider.spin.rotation.y = id === 'frontside' ? progress * Math.PI * 2 : id === 'backside' ? -progress * Math.PI * 2 : lean * -0.08;
    const grab = id === 'method' ? progress : 0;
    const mute = id === 'mute' ? progress : 0;
    rider.armR.rotation.x = 0.35 + grab * 0.85;
    rider.armR.rotation.z = -0.3 - grab * 1.05;
    rider.armL.rotation.x = 0.4 + mute * 0.9;
    rider.armL.rotation.z = 0.3 + mute * 0.85;
    rider.torso.rotation.z = grab * 0.7 - mute * 0.45 + lean * 0.12;
    rider.spin.rotation.z = grab * 0.42 - mute * 0.2;
    const tuck = state.y > 0.3 ? 0.55 : 0.25;
    rider.legL.rotation.x = tuck;
    rider.legR.rotation.x = tuck;
    if (!reduced && state.boosting) rider.lean.position.y = Math.sin(time * 28) * 0.02;
    else rider.lean.position.y = 0;
  }

  function placeCloud(state, time, near) {
    const behind = Math.max(state.gap, 6.35);
    slopeToWorld(0, 0, state.z - behind, tmp);
    cloud.position.copy(tmp);
    cloud.visible = state.gap < 24;
    for (const mesh of puffs) {
      const base = mesh.userData.base;
      const lean = near * near * (base.y / 11) * 7.2;
      mesh.position.set(base.x + Math.sin(time * 0.7 + base.y) * 0.12, base.y, base.z + lean);
    }
  }

  let primedSeed = null;
  function sync(state, dt, time) {
    syncWorld(state);
    poseRider(state, time);
    const near = clamp((14 - state.gap) / 10, 0, 1);
    placeCloud(state, time, near);
    const targetFov = 60 + (state.boosting ? 3.2 : 0) + near * 4;
    const want = {
      x: state.x * 0.22 + 0.7,
      y: state.y + 2.35 + near * 0.45,
      z: state.z - 5.15,
      lx: state.x * 0.08,
      ly: state.y + 1.35,
      lz: state.z + 8.5,
    };
    if (primedSeed !== state.seed) {
      camS.x = want.x; camS.y = want.y; camS.z = want.z;
      lookS.x = want.lx; lookS.y = want.ly; lookS.z = want.lz;
      fov = targetFov;
      primedSeed = state.seed;
    }
    fov += (targetFov - fov) * (1 - Math.exp(-Math.max(dt, 0.016) * 6));
    camera.fov = fov;
    camera.updateProjectionMatrix();

    const k = 1 - Math.exp(-Math.max(0.016, dt) * (state.y > 0.4 ? 5.5 : 8));
    camS.x += (want.x - camS.x) * k;
    camS.y += (want.y - camS.y) * k;
    camS.z += (want.z - camS.z) * k;
    lookS.x += (want.lx - lookS.x) * k;
    lookS.y += (want.ly - lookS.y) * k;
    lookS.z += (want.lz - lookS.z) * k;
    slopeToWorld(camS.x, camS.y, camS.z, camW);
    slopeToWorld(lookS.x, lookS.y, lookS.z, lookW);
    const shake = reduced ? 0 : near * near * 0.2;
    camW.x += Math.sin(time * 43) * shake;
    camW.y += Math.sin(time * 61) * shake * 0.62;
    camera.position.copy(camW);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookW);
    camera.rotateZ(clamp(-state.vx / 13.2, -1, 1) * 0.045);
    sky.position.copy(camW);

    slopeToWorld(state.x - 12, 18, state.z + 8, sun.position);
    slopeToWorld(state.x, 0, state.z + 6, sun.target.position);
    const fogNear = (low ? 20 : 28) - near * 14;
    scene.fog.near = Math.max(6, fogNear);
    scene.fog.color.set('#d5dee6').lerp(new THREE.Color('#e7eef3'), near * 0.65);

    if (state.landId !== lastLand) {
      lastLand = state.landId;
      if (state.landKind === 'clean' || state.landKind === 'plain' || state.landKind === 'bail' || state.landKind === 'crash') {
        flakes.burst(state, state.landKind === 'crash' ? 16 : 10);
      }
    }
    if (Math.abs(state.vx) > 3.5 && state.y < 0.25) flakes.carve(state);
    if (near > 0.25) flakes.slide(state, near);
    flakes.update(dt);
    renderer.render(scene, camera);
    return near;
  }

  function dispose() {
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj.geometry && !shared.includes(obj.geometry)) obj.geometry.dispose();
    });
    snowMat.dispose();
    treeMat.dispose();
    treeMat2.dispose();
    trunkMat.dispose();
    rockMat.dispose();
    rampMat.dispose();
    lipMat.dispose();
    puffMat.dispose();
    puffBright.dispose();
    for (const geo of shared) geo.dispose();
  }

  resize();
  return { sync, resize, dispose, canvas };
}

function snowGeometry(z0, index, low) {
  const geo = new THREE.PlaneGeometry(20, CHUNK, low ? 3 : 10, low ? 2 : 6);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const snow = new THREE.Color('#e7eef4');
  const shade = new THREE.Color('#c3d0da');
  const ice = new THREE.Color('#d7e0d8');
  const tmp = new THREE.Color();
  const out = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i) + z0 + CHUNK / 2;
    y += Math.sin(x * 0.45 + index) * Math.cos(z * 0.12) * 0.16;
    const edge = Math.max(0, Math.abs(x) - 6.4);
    y += edge * edge * 0.12;
    slopeToWorld(x, y, z, out);
    pos.setXYZ(i, out.x, out.y, out.z);
    const mix = Math.sin(x * 1.3 + z * 0.33) * 0.5 + 0.5;
    tmp.copy(snow).lerp(mix > 0.78 ? ice : shade, mix * 0.5);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildSky(low) {
  const geo = new THREE.SphereGeometry(420, low ? 12 : 20, low ? 8 : 14);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color('#8eabc4');
  const mid = new THREE.Color('#d5e3ee');
  const horizon = new THREE.Color('#f1e4d2');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 420;
    const t = clamp(y * 0.5 + 0.5, 0, 1);
    if (t < 0.45) tmp.copy(horizon).lerp(mid, t / 0.45);
    else tmp.copy(mid).lerp(zenith, (t - 0.45) / 0.55);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

function buildRidges() {
  const matA = new THREE.MeshStandardMaterial({ color: 0x8ea0ae, roughness: 1, metalness: 0 });
  const matB = new THREE.MeshStandardMaterial({ color: 0x6d808e, roughness: 1, metalness: 0 });
  const specs = [[-78, 220, 52, 24], [86, 340, 64, 28], [-96, 520, 70, 30], [74, 680, 46, 20], [-64, 860, 58, 24]];
  return specs.map(([x, z, h, r], i) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), i % 2 ? matB : matA);
    slopeToWorld(x, h * 0.35, z, mesh.position);
    return mesh;
  });
}

function buildRider(low) {
  const seg = low ? 6 : 10;
  const jacket = new THREE.MeshStandardMaterial({ color: 0xc4492a, roughness: 0.64, metalness: 0 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x243038, roughness: 0.8, metalness: 0 });
  const board = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.48, metalness: 0.02 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0x1f4d3a, roughness: 0.5, metalness: 0 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x1c2428, roughness: 0.42, metalness: 0.06 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.72, metalness: 0 });
  const goggle = new THREE.MeshStandardMaterial({ color: 0x243844, roughness: 0.28, metalness: 0.1 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.66, metalness: 0 });
  const group = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 1.38), board);
  deck.castShadow = !low;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.16), stripe);
  band.position.y = 0.03;
  group.add(deck, band);
  const lean = new THREE.Group();
  const spin = new THREE.Group();
  group.add(lean);
  lean.add(spin);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), pants);
  hips.position.set(0, 0.72, -0.02);
  const torso = new THREE.Group();
  torso.position.set(0, 0.8, 0);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.48, 0.22), jacket);
  chest.position.y = 0.22;
  chest.castShadow = !low;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.1), stripe);
  pack.position.set(0, 0.24, -0.14);
  torso.add(chest, pack);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, seg, seg), skin);
  head.position.set(0, 0.62, 0.02);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, seg, seg), helmetMat);
  helmet.position.set(0, 0.66, -0.01);
  helmet.scale.y = 0.92;
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), goggle);
  lens.position.set(0, 0.6, 0.12);
  torso.add(head, helmet, lens);
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.24, 0.4, 0);
    const limb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.4, 0.09), jacket);
    limb.position.y = -0.18;
    pivot.add(limb);
    return pivot;
  }
  const armL = arm(-1);
  const armR = arm(1);
  torso.add(armL, armR);
  function leg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.1, 0.7, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.11), pants);
    thigh.position.y = -0.16;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), bootMat);
    boot.position.set(0, -0.36, 0.04);
    pivot.add(thigh, boot);
    return pivot;
  }
  const legL = leg(-1);
  const legR = leg(1);
  spin.add(hips, torso, legL, legR);
  return { group, lean, spin, torso, armL, armR, legL, legR };
}

function buildFlakes(count) {
  const positions = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf7f9fb, size: 0.16, map: flakeTexture(), transparent: true, opacity: 0.92,
    depthWrite: false, alphaTest: 0.45, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const tmp = new THREE.Vector3();
  function spawn(i, state, spread, up) {
    const ox = state.x + (Math.sin(i * 12.3 + state.tick) * spread);
    const oz = state.z + (Math.cos(i * 9.1) * spread * 0.4);
    slopeToWorld(ox, state.y + 0.15, oz, tmp);
    positions[i * 3] = tmp.x;
    positions[i * 3 + 1] = tmp.y;
    positions[i * 3 + 2] = tmp.z;
    vel[i * 3] = (i % 7 - 3) * 0.4;
    vel[i * 3 + 1] = up;
    vel[i * 3 + 2] = 0.2;
    life[i] = 0.35 + (i % 5) * 0.05;
  }
  let cursor = 0;
  function emit(state, n, spread, up) {
    for (let k = 0; k < n; k++) {
      spawn(cursor, state, spread, up);
      cursor = (cursor + 1) % count;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return {
    points,
    burst(state, n) { emit(state, n, 0.8, 2.4); },
    carve(state) { emit(state, 1, 0.35, 0.8); },
    slide(state, near) { emit(state, near > 0.6 ? 3 : 1, 2.4, 1.2 + near); },
    update(dt) {
      let alive = false;
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -999;
          continue;
        }
        alive = true;
        life[i] -= dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= 3.2 * dt;
      }
      if (alive) geo.attributes.position.needsUpdate = true;
    },
  };
}
